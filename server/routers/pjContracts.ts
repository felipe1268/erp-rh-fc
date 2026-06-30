import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { pjContracts, pjPayments, pjDocumentos, pjContractRevisoes, pjContractAditivos, employees, companies, comprasOrdens, fornecedores } from "../../drizzle/schema";
import { eq, and, sql, isNull, desc, asc, lte, gte, inArray } from "drizzle-orm";
import { resolveCompanyIds, companyFilter } from "../companyHelper";
import { TRPCError } from "@trpc/server";
import { storagePut } from "../storage";
import { calcularPrazoVigencia } from "../../shared/contratoPrazo";

// ---------------------------------------------------------------------------
// Helpers de geração de medições previstas (Folha PJ)
// ---------------------------------------------------------------------------

/** Retorna a quantidade de dias em um mês YYYY-MM. */
function diasDoMes(ano: number, mes1a12: number): number {
  return new Date(ano, mes1a12, 0).getDate();
}

/**
 * Monta uma data ISO (YYYY-MM-DD) garantindo que o dia exista no mês
 * (ex.: dia 31 em fevereiro vira 28/29).
 */
function dataIsoSegura(ano: number, mes1a12: number, dia: number): string {
  const max = diasDoMes(ano, mes1a12);
  const d = Math.min(Math.max(1, dia | 0), max);
  return `${ano}-${String(mes1a12).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Soma N meses a um par (ano, mes1a12) e devolve novo par. */
function addMeses(ano: number, mes1a12: number, n: number): { ano: number; mes: number } {
  const total = (ano * 12 + (mes1a12 - 1)) + n;
  return { ano: Math.floor(total / 12), mes: (total % 12) + 1 };
}

/**
 * Gera (idempotente) todas as medições previstas de um contrato PJ ao longo
 * da sua vigência. Para cada mês de referência cria DOIS lançamentos:
 *   - adiantamento (no mesmo mês, dia = diaAdiantamento do contrato)
 *   - fechamento  (no mês seguinte, dia = diaFechamento do contrato)
 * Pula combinações (contractId, mesReferencia, tipo) que já existirem,
 * portanto pode ser chamado múltiplas vezes sem duplicar.
 *
 * Retorna a quantidade de novas medições criadas.
 */
// Rev. 3699 — Sincroniza pj_payments PENDENTES + financial_entries vinculados ao valorMensal
// atual do contrato. Chamada após update de contrato e disponível como procedure manual.
async function sincronizarPagamentosPendentesInterno(db: any, employeeId: number): Promise<{ pagamentos: number; entries: number }> {
  // Atualiza pj_payments pendentes: recalcula valor a partir do contrato vigente (ativo ou pendente)
  const pRes = await db.$client.query(`
    UPDATE pj_payments pp
    SET valor = CASE
          WHEN pp.tipo = 'adiantamento'
            THEN ROUND(pjc."valorMensal"::numeric * pjc."percentualAdiantamento"::numeric / 100, 2)::text
          WHEN pp.tipo = 'fechamento'
            THEN ROUND(pjc."valorMensal"::numeric * pjc."percentualFechamento"::numeric / 100, 2)::text
          ELSE pp.valor
        END,
        descricao = CASE
          WHEN pp.tipo = 'adiantamento'
            THEN 'Adiantamento ' || pjc."percentualAdiantamento"::text || '% — Serviços de engenharia'
          WHEN pp.tipo = 'fechamento'
            THEN 'Fechamento ' || pjc."percentualFechamento"::text || '% — Serviços de engenharia'
          ELSE pp.descricao
        END,
        "updatedAt" = NOW()
    FROM pj_contracts pjc
    WHERE pp."employeeId" = $1
      AND pp."contractId" = pjc.id
      AND pp.status = 'pendente'
      AND pjc.status NOT IN ('encerrado','cancelado')
  `, [employeeId]);
  const pagamentos = pRes.rowCount ?? 0;

  // Propaga o novo valor_previsto para financial_entries vinculados ainda não pagos
  const eRes = await db.$client.query(`
    UPDATE financial_entries fe
    SET valor_previsto = pjp.valor::numeric,
        updated_at = NOW()
    FROM pj_payments pjp
    WHERE fe.origem_modulo = 'pagamento_pj'
      AND fe.origem_id = pjp.id
      AND pjp."employeeId" = $1
      AND pjp.status = 'pendente'
      AND COALESCE(fe.status,'') <> 'pago'
      AND ABS(COALESCE(fe.valor_previsto,0) - pjp.valor::numeric) > 0.009
  `, [employeeId]);
  const entries = eRes.rowCount ?? 0;

  return { pagamentos, entries };
}

async function gerarPrevisoesDoContrato(
  db: any,
  contrato: any,
  criadoPor: string,
): Promise<number> {
  if (!contrato?.dataInicio || !contrato?.dataFim) return 0;

  const valorMensal = parseFloat(contrato.valorMensal || "0") || 0;
  const percAdiant = contrato.percentualAdiantamento ?? 40;
  const percFech = contrato.percentualFechamento ?? 60;
  const diaAdiant = contrato.diaAdiantamento ?? 15;
  const diaFech = contrato.diaFechamento ?? 5;

  const valorAdiant = (valorMensal * percAdiant / 100).toFixed(2);
  const valorFech = (valorMensal * percFech / 100).toFixed(2);

  // Range de meses de referência: do mês de dataInicio até o mês de dataFim, inclusive.
  const ini = String(contrato.dataInicio).slice(0, 10).split("-").map(Number);
  const fim = String(contrato.dataFim).slice(0, 10).split("-").map(Number);
  if (ini.length < 2 || fim.length < 2) return 0;
  const [aIni, mIni] = ini;
  const [aFim, mFim] = fim;
  const totalMeses = (aFim * 12 + (mFim - 1)) - (aIni * 12 + (mIni - 1)) + 1;
  if (totalMeses <= 0) return 0;

  // Rev. 3444 — Pré-carrega os pares (mes, tipo) já existentes para este FUNCIONÁRIO
  // (não só para o contractId), evitando duplicatas quando o contrato é revisado e gera
  // um novo contractId — o antigo já criou entradas para os mesmos meses.
  const existentes = await db.select({
    mes: pjPayments.mesReferencia,
    tipo: pjPayments.tipo,
    valor: pjPayments.valor,
  }).from(pjPayments).where(eq(pjPayments.employeeId, contrato.employeeId));
  const jaTem = new Set<string>(
    (existentes as any[]).map((r) => `${r.mes}::${r.tipo}`),
  );
  // Cap: soma de valores já gerados por mês para este funcionário (não pode exceder valorMensal).
  const somaExistentePorMes = new Map<string, number>();
  for (const r of existentes as any[]) {
    somaExistentePorMes.set(r.mes, (somaExistentePorMes.get(r.mes) ?? 0) + parseFloat(r.valor || "0"));
  }

  const linhas: any[] = [];
  for (let i = 0; i < totalMeses; i++) {
    const { ano, mes } = addMeses(aIni, mIni, i);
    const mesRef = `${ano}-${String(mes).padStart(2, "0")}`;

    // Rev. 3444 — Cap: soma acumulada no mês p/ este funcionário (inclui entradas pendentes +
    // as que serão criadas agora no loop) não pode exceder valorMensal do contrato.
    const somaAcum = somaExistentePorMes.get(mesRef) ?? 0;

    // Adiantamento: mesmo mês de referência
    if (!jaTem.has(`${mesRef}::adiantamento`)) {
      const vAdiant = parseFloat(valorAdiant);
      if (somaAcum + vAdiant <= valorMensal * 1.001) {
        linhas.push({
          contractId: contrato.id,
          companyId: contrato.companyId,
          employeeId: contrato.employeeId,
          mesReferencia: mesRef,
          tipo: "adiantamento",
          valor: valorAdiant,
          descricao: `Adiantamento ${percAdiant}% — ${mesRef}`,
          dataPrevista: dataIsoSegura(ano, mes, diaAdiant),
          status: "pendente",
          criadoPor,
        });
        somaExistentePorMes.set(mesRef, somaAcum + vAdiant);
      }
    }

    // Fechamento: mês seguinte ao de referência
    if (!jaTem.has(`${mesRef}::fechamento`)) {
      const vFech = parseFloat(valorFech);
      const somaAcumFech = somaExistentePorMes.get(mesRef) ?? 0;
      if (somaAcumFech + vFech <= valorMensal * 1.001) {
        const prox = addMeses(ano, mes, 1);
        linhas.push({
          contractId: contrato.id,
          companyId: contrato.companyId,
          employeeId: contrato.employeeId,
          mesReferencia: mesRef,
          tipo: "fechamento",
          valor: valorFech,
          descricao: `Fechamento ${percFech}% — ${mesRef}`,
          dataPrevista: dataIsoSegura(prox.ano, prox.mes, diaFech),
          status: "pendente",
          criadoPor,
        });
        somaExistentePorMes.set(mesRef, somaAcumFech + vFech);
      }
    }
  }

  if (linhas.length === 0) return 0;
  await db.insert(pjPayments).values(linhas);
  return linhas.length;
}

// Modelo de contrato PJ padrão (FC Engenharia)
const MODELO_CONTRATO_PJ = `CONTRATO PARTICULAR DE PRESTAÇÃO DE SERVIÇOS E COMPROMISSO DE CONFIDENCIALIDADE E NÃO CONCORRÊNCIA ENTRE SI

CONTRATANTE: [CONTRATANTE_NOME], inscrita no CNPJ/MF sob n.º [CONTRATANTE_CNPJ], com sede em [CONTRATANTE_ENDERECO], [CONTRATANTE_CIDADE], Estado de [CONTRATANTE_ESTADO], neste ato representado por seu representante legal, [CONTRATANTE_REPRESENTANTE], doravante denominada simplesmente "CONTRATANTE".

CONTRATADA: [CONTRATADA_RAZAO_SOCIAL], com sede em [CONTRATADA_CIDADE], no Estado de [CONTRATADA_ESTADO], [CONTRATADA_ENDERECO], inscrita sob o CNPJ n.º [CONTRATADA_CNPJ], neste ato representado na forma de seu CNPJ, doravante denominada simplesmente "CONTRATADA".

CONSIDERANDO QUE:

(I) A CONTRATADA apresenta a necessária qualificação e o "know-how" adequado para prestar os serviços almejados pela CONTRATANTE;

(II) a CONTRATANTE tem interesse em contratar a CONTRATADA para a prestação do serviço relacionado a [OBJETO_CONTRATO], exclusivamente;

RESOLVEM as partes celebrar o presente Contrato de Prestação de Serviços, de acordo com as cláusulas e condições seguintes:

CLÁUSULA PRIMEIRA: DO OBJETO

Pelo presente instrumento, a CONTRATADA obriga-se ao fornecimento dos serviços de mão de obra especializada na execução de serviço relacionado ao setor de [OBJETO_CONTRATO], não ocorrendo autoria em projetos.

CLÁUSULA SEGUNDA: CONDIÇÕES GERAIS DO CONTRATO

2.1 Os serviços contratados serão executados mediante solicitação da CONTRATANTE à CONTRATADA, que a partir desta solicitação deverá executar os serviços em conformidade com as normas e condições estabelecidas no presente contrato.

2.2 Os serviços contratados serão prestados com orientação e responsabilidade técnica da CONTRATADA, preferencialmente no estabelecimento da CONTRATANTE, de conformidade com os cronogramas de execução dos serviços, estabelecido de comum acordo entre as partes contratantes, devendo sempre ser respeitado e priorizado as necessidades da CONTRATANTE.

2.3 A CONTRATANTE, durante a vigência do presente contrato e quando o serviço for executado no seu estabelecimento, permitirá que a CONTRATADA se utilize de suas instalações e de todos os seus equipamentos e maquinários necessários à execução dos serviços ora contratados.

Parágrafo Único – Ocorrendo esta hipótese, a CONTRATADA ficará responsável pelo bom uso dos equipamentos cedidos para a execução dos serviços, bem como pelos eventuais danos causados aos equipamentos da CONTRATANTE.

CLÁUSULA TERCEIRA: DO COMPROMISSO DE CONFIDENCIALIDADE E NÃO CONCORRÊNCIA ENTRE SI

3.1 A CONTRATADA, durante a vigência do presente contrato e nos 03 (três) anos subsequentes ao seu término ou rescisão, obriga-se a manter confidencialidade das informações e Segredos Comerciais que significam, sem qualquer limitação, as invenções, segredos de profissão e dados comerciais, cadastro de clientes, lista de vendas, informações técnicas, "Know-how", projetos, especificações, patentes, plantas de qualquer espécie, utilizados ou desenvolvidos durante o prazo do presente contrato ou de qualquer acordo anterior, que constitua propriedade ou do qual seja licenciada a CONTRATANTE ou suas filiais, controladas, coligadas ou combinadas ("Segredos Comerciais"), ressalvadas informações que: (a) sejam ou se tornem de domínio público por outros meios; (b) sejam independentemente descobertas ou criadas pela CONTRATADA; e (c) quando expressamente comunicada a terceiros pela CONTRATANTE.

3.2 A CONTRATANTE e a CONTRATADA ajustam entre si que todos os Segredos Comerciais e Industriais de cada parte são de propriedade da mesma e só poderão ser utilizados pela outra parte exclusivamente para os fins previstos neste contrato. Cada parte obriga-se a não divulgar, propagar, reproduzir, explorar, publicar, duplicar, transferir ou revelar, direta ou indiretamente, por si ou através de terceiros, quaisquer Segredos Comerciais e Industriais sem a prévia e expressa autorização da parte titular dos mesmos.

3.3 Em caso de cessação dos efeitos do presente contrato, as partes deverão devolver imediatamente à outra parte todos os documentos, materiais, registros, planos, especificações, programas e todos os outros meios de informação que constituam Segredos Comerciais da outra parte.

3.4 As partes convencionam que toda inteligência desenvolvida durante a vigência do presente contrato pertence à parte CONTRATANTE, sendo certo que ao término do presente contrato, não poderá a parte CONTRATADA utilizar as informações, projetos, ferramentas de trabalho e ou qualquer outro produto desenvolvido ao longo do presente instrumento.

3.5 Durante a vigência do presente Contrato e após o encerramento e, pelo período de 03 (três) anos subsequentes, a CONTRATADA se compromete a não fazer concorrência com os clientes da CONTRATANTE.

3.6 Será compreendido como concorrência, apta a ensejar a rescisão do presente contrato com e ou as penalidades cabíveis:

a) Angariar clientes da CONTRATANTE através da prestação de serviços do presente contrato;

b) Disputar clientes no mesmo mercado da CONTRATANTE (construção civil, projetos, arquitetura etc.), sobretudo através de marketing de qualquer natureza.

3.7 A CONTRATADA não poderá ser admitida pelos clientes e seus concorrentes, até 06 (seis) meses após a rescisão com a CONTRATANTE.

3.8 Fica mutuamente pactuado entre as partes contratantes, que não poderá a CONTRATADA divulgar ou apresentar qualquer projeto ou trabalho desenvolvido por força do presente contrato como se fosse seu, seja pessoalmente, seja através de marketing de qualquer natureza, sobretudo com publicações e "posts" através de redes sociais ou qualquer outro veículo de comunicação.

Parágrafo Único – A inobservância do disposto na presente cláusula, sujeitará a CONTRATADA às penalidades decorrentes da violação do compromisso de confidencialidade, quebra de sigilo e não concorrência entre si, apurados na multa de R$ 100.000,00 (Cem mil reais), bem como arcará com o pagamento de eventuais perdas e danos, mais prejuízos de demais indenizações decorrentes do seu ato, apurado em processo judicial competente para esta finalidade.

CLÁUSULA QUARTA: PRAZO E FORMA DE EXECUÇÃO

4.1 O contrato tem validade de [PRAZO_VIGENCIA] e terá início a partir do dia [DATA_INICIO], nas seguintes condições:

a) O presente contrato poderá ser rescindido pela CONTRATANTE, a qualquer momento, desde que haja comprovação de quebra de quaisquer cláusulas deste contrato por parte da CONTRATADA;

b) A rescisão contratual a que se refere o item "a" da cláusula 4.1 não ensejará à parte CONTRATANTE o pagamento de qualquer multa, com o que concorda expressamente a parte CONTRATADA;

c) O presente contrato poderá ser rescindido por qualquer uma das partes, a qualquer momento, sem multas contratuais.

4.2 Toda e qualquer alteração do objeto do presente Contrato necessitará da concordância prévia e expressa da CONTRATADA e da CONTRATANTE e será feita mediante Aditivo Contratual.

CLÁUSULA QUINTA: OBRIGAÇÕES DAS PARTES

5.1 OBRIGAÇÕES DA CONTRATADA - Além das demais obrigações que lhe são impostas nos termos do presente instrumento caberão, ainda, à CONTRATADA:

a) Realizar suas atividades com profissionalismo, cabendo-lhe total e exclusiva responsabilidade pelo integral atendimento de toda a legislação;

b) Respeitar e seguir integralmente as normas e procedimentos internos da empresa, bem como facilitar a ação fiscalizadora da CONTRATANTE quanto à execução dos serviços;

c) Responder pela guarda e conservação de quaisquer equipamentos, materiais ou documentos e informações sigilosas de propriedade da CONTRATANTE, que lhes forem entregues durante a execução dos serviços contratados;

d) Realizar suas atividades utilizando os equipamentos de proteção individual (EPIs) necessários à sua segurança, de acordo com o exigido nas Normas relativas à Segurança, Higiene e Medicina do Trabalho, previsto na legislação em vigor;

e) Cumprir a prestação de serviço no horário de funcionamento da empresa CONTRATANTE;

f) Apresentar mensalmente os comprovantes de Recolhimento de DAS (MEI);

g) Assinar mensalmente recibos que comprovem o pagamento da prestação de serviço;

h) Apresentar apólice de seguro de vida individual com coberturas compatíveis à atividade desenvolvida;

i) Emitir Nota Fiscal de Prestação de Serviços no valor encaminhado pela CONTRATANTE.

5.2 OBRIGAÇÕES DA CONTRATANTE - Caberá à CONTRATANTE:

a) Disponibilizar todo o recurso financeiro conforme cláusula 6.1 para a execução dos serviços necessários;

b) Fornecer todos os materiais, equipamentos e informações necessários para a execução dos serviços;

c) Fornecer todos os equipamentos de proteção individual (EPIs) necessários à segurança do trabalho, de acordo com o exigido nas normas relativas à Segurança, Higiene e Medicina do Trabalho previsto na legislação em vigor e uniforme no padrão da CONTRATANTE, devidamente identificado;

d) Gerenciar e coordenar a interdependência de todos os trabalhos que serão desenvolvidos nas áreas em que atuará a CONTRATADA.

CLÁUSULA SEXTA: PREÇOS E FORMA DE PAGAMENTO

6.1 PREÇOS – Pela prestação dos serviços definidos neste Contrato, a CONTRATANTE pagará à CONTRATADA o preço certo e ajustado de R$ [VALOR_MENSAL] ([VALOR_EXTENSO]), pagos mensalmente, mediante emissão de nota fiscal.

Parágrafo Único – Sob quaisquer hipóteses não poderá a contratada divulgar seus dividendos a terceiros.

6.2 FATURAMENTO E PAGAMENTO:

Pagamento realizado na proporção de [PERCENTUAL_ADIANTAMENTO]% no dia [DIA_ADIANTAMENTO] e [PERCENTUAL_FECHAMENTO]% do pagamento no [DIA_FECHAMENTO]º dia útil do mês subsequente.

CLÁUSULA SÉTIMA: LIMITE DE RESPONSABILIDADE

7.1 Fica o CONTRATANTE responsável pela entrega das informações para a execução dos serviços à CONTRATADA e o CONTRATANTE assume solidariamente com a CONTRATADA a responsabilidade por eventuais prejuízos causados nas funcionalidades dos projetos desde que a CONTRATADA tenha atuado de forma direta e tenha incorrido em culpa, sendo responsável pelo pagamento de até 50% (cinquenta por cento) dos prejuízos causados na execução da obra.

7.2 Na ocorrência de qualquer fato comprovado que impeça definitivamente a prestação dos serviços, mas sem culpa das partes, fica o presente contrato rescindido de pleno direito, devendo cada qual suportar o ônus que isso representar, não incidindo nas penalidades previstas.

7.3 Havendo qualquer fato justificável que atrase a prestação de serviços não poderá ser invocado, por qualquer das partes, para rescisão do presente contrato nem incidência da multa ou penalidades previstas.

7.4 Se for constatada situação de falência ou concordata, de qualquer das partes, ter-se-á a rescisão do presente contrato, independente de notificação judicial ou extrajudicial.

Parágrafo Único – Fica a critério da CONTRATANTE descontar ou não o valor integral (até 50%) ou parcial dos prejuízos causados, conforme previsto na cláusula 7.1.

CLÁUSULA OITAVA: VÍNCULO EMPREGATÍCIO

8.1 Fica estabelecido que, por força deste contrato, não se estabelece nenhum vínculo empregatício entre as partes na forma do artigo 3º da Consolidação das Leis do Trabalho, não estando a CONTRATANTE e os funcionários da CONTRATADA, se houver, sujeitos aos requisitos empregatícios de continuidade, subordinação, onerosidade e pessoalidade com a CONTRATANTE, bem como é de responsabilidade exclusiva da CONTRATADA os direitos trabalhistas e previdenciários que esta empresa possuir com sua eventual equipe de empregados.

CLÁUSULA NONA: DEMAIS DISPOSIÇÕES

9.1 O presente instrumento não implica em qualquer vínculo de solidariedade entre as partes, ficando cada qual responsável pelas obrigações derivadas de suas respectivas atividades, sejam elas de caráter fiscal, trabalhista, previdenciário ou acidentário, sem exclusão de qualquer outra, declarando as mesmas não existir qualquer tipo de vínculo societário, trabalhista, fiscal ou previdenciário entre si, assim como relação de emprego com sócios ou prepostos da CONTRATADA.

9.2 Não haverá responsabilidade solidária ou subsidiária da CONTRATANTE com nenhuma questão relativa ao presente contrato especialmente relacionada com a mão-de-obra utilizada pela CONTRATADA na execução dos serviços, objeto do presente contrato.

9.3 Qualquer tolerância de uma das partes em relação ao não cumprimento das obrigações e deveres neste instrumento assumidos, não importará em novação quanto aos seus termos, condições ou prazos, não devendo, portanto, sob quaisquer hipóteses, ser interpretada como renúncia ou desistência do cumprimento dos dispositivos do presente em seus estritos termos.

CLÁUSULA DÉCIMA: DO FORO

Fica eleito o foro da Comarca de [FORO_COMARCA] para dirimir quaisquer controvérsias resultantes deste contrato, com renúncia a qualquer outro, por mais privilegiado que seja.

E, por estarem assim justas e contratadas, as partes firmam o presente instrumento em 02 (duas) vias de igual teor e forma, na presença de 2 (duas) testemunhas.

[CONTRATANTE_CIDADE], [DATA_ASSINATURA].


_______________________________
CONTRATANTE: [CONTRATANTE_NOME]
CNPJ: [CONTRATANTE_CNPJ]


_______________________________
CONTRATADA: [CONTRATADA_RAZAO_SOCIAL]
CNPJ: [CONTRATADA_CNPJ]


_______________________________
Testemunha 1
Nome:
CPF:


_______________________________
Testemunha 2
Nome:
CPF:`;

// ---------------------------------------------------------------------------
// Cruzamento prestador PJ × catálogo de Fornecedores (Rev. 3262)
// READ-ONLY: apenas casa o CNPJ/nome do prestador contra `fornecedores` para
// sinalizar se o prestador já está cadastrado (verde), se há sugestão por nome
// a confirmar (ambar) ou se não há cadastro (cinza). Não escreve nada.
// ---------------------------------------------------------------------------

/** Mantém só os dígitos de um CNPJ. */
function normCnpj(v?: string | null): string {
  return (v || "").replace(/\D/g, "");
}

/**
 * Normaliza o nome de uma empresa para comparação tolerante:
 * remove acentos, caixa alta, pontuação e sufixos societários comuns.
 */
function normNomeEmpresa(v?: string | null): string {
  let s = (v || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  s = s.replace(/\b(LTDA|EIRELI|EPP|MEI|ME|SA)\b/g, " ").replace(/\s+/g, " ").trim();
  return s;
}

type FornecedorMatchIndex = {
  porCnpj: Map<string, { id: number; nome: string }>;
  porNome: Map<string, { id: number; nome: string }>;
};

export type FornecedorMatch = {
  fornecedorStatus: "verde" | "ambar" | "cinza";
  fornecedorId: number | null;
  fornecedorNome: string | null;
};

/** Carrega os fornecedores da empresa e indexa por CNPJ e por nome. */
async function carregarFornecedorIndex(db: any, input: { companyId: number; companyIds?: number[] }): Promise<FornecedorMatchIndex> {
  const forns = await db.select({
    id: fornecedores.id,
    cnpj: fornecedores.cnpj,
    razaoSocial: fornecedores.razaoSocial,
    nomeFantasia: fornecedores.nomeFantasia,
  })
    .from(fornecedores)
    .where(companyFilter(fornecedores.companyId, input));

  const porCnpj = new Map<string, { id: number; nome: string }>();
  const porNome = new Map<string, { id: number; nome: string }>();
  for (const f of forns as any[]) {
    const nome = f.razaoSocial || f.nomeFantasia || "";
    const c = normCnpj(f.cnpj);
    if (c.length === 14 && !porCnpj.has(c)) porCnpj.set(c, { id: f.id, nome });
    const rz = normNomeEmpresa(f.razaoSocial);
    if (rz && !porNome.has(rz)) porNome.set(rz, { id: f.id, nome });
    const nf = normNomeEmpresa(f.nomeFantasia);
    if (nf && !porNome.has(nf)) porNome.set(nf, { id: f.id, nome });
  }
  return { porCnpj, porNome };
}

/** Casa um prestador (cnpj + nome) contra o índice de fornecedores. */
function matchFornecedor(cnpjPrestador: string | null | undefined, nomePrestador: string | null | undefined, idx: FornecedorMatchIndex): FornecedorMatch {
  const c = normCnpj(cnpjPrestador);
  if (c.length === 14) {
    const hit = idx.porCnpj.get(c);
    if (hit) return { fornecedorStatus: "verde", fornecedorId: hit.id, fornecedorNome: hit.nome };
  }
  const n = normNomeEmpresa(nomePrestador);
  if (n && n.length >= 4) {
    const exato = idx.porNome.get(n);
    if (exato) return { fornecedorStatus: "ambar", fornecedorId: exato.id, fornecedorNome: exato.nome };
    for (const [nomeForn, hit] of idx.porNome) {
      if (nomeForn.length >= 6 && (nomeForn.includes(n) || n.includes(nomeForn))) {
        return { fornecedorStatus: "ambar", fornecedorId: hit.id, fornecedorNome: hit.nome };
      }
    }
  }
  return { fornecedorStatus: "cinza", fornecedorId: null, fornecedorNome: null };
}

/**
 * Monta um mapa employeeId → { cnpj, razaoSocial } a partir dos contratos PJ
 * da empresa, para que pagamentos sem contrato vinculado (lançamento manual)
 * ainda consigam herdar o CNPJ do prestador.
 */
async function carregarCnpjPorEmployee(db: any, input: { companyId: number; companyIds?: number[] }): Promise<Map<number, { cnpj: string | null; razaoSocial: string | null }>> {
  const contratos = await db.select({
    employeeId: pjContracts.employeeId,
    cnpjPrestador: pjContracts.cnpjPrestador,
    razaoSocialPrestador: pjContracts.razaoSocialPrestador,
    status: pjContracts.status,
  })
    .from(pjContracts)
    .where(and(companyFilter(pjContracts.companyId, input), isNull(pjContracts.deletedAt)))
    .orderBy(asc(pjContracts.status));

  const map = new Map<number, { cnpj: string | null; razaoSocial: string | null }>();
  for (const c of contratos as any[]) {
    const atual = map.get(c.employeeId);
    // Prioriza qualquer contrato com CNPJ preenchido.
    if (!atual || (!normCnpj(atual.cnpj) && normCnpj(c.cnpjPrestador))) {
      map.set(c.employeeId, { cnpj: c.cnpjPrestador ?? null, razaoSocial: c.razaoSocialPrestador ?? null });
    }
  }
  return map;
}

export const pjContractsRouter = router({
  // ============================================================
  // CONTRATOS
  // ============================================================
  contratos: router({
    list: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), status: z.string().optional(), employeeId: z.number().optional() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const conditions = [
          companyFilter(pjContracts.companyId, input),
          isNull(pjContracts.deletedAt),
        ];
        if (input.status) conditions.push(eq(pjContracts.status, input.status as any));
        if (input.employeeId) conditions.push(eq(pjContracts.employeeId, input.employeeId));
        
        const rows = await db.select({
          id: pjContracts.id,
          companyId: pjContracts.companyId,
          employeeId: pjContracts.employeeId,
          numeroContrato: pjContracts.numeroContrato,
          cnpjPrestador: pjContracts.cnpjPrestador,
          razaoSocialPrestador: pjContracts.razaoSocialPrestador,
          objetoContrato: pjContracts.objetoContrato,
          dataInicio: pjContracts.dataInicio,
          dataFim: pjContracts.dataFim,
          renovacaoAutomatica: pjContracts.renovacaoAutomatica,
          valorMensal: pjContracts.valorMensal,
          percentualAdiantamento: pjContracts.percentualAdiantamento,
          percentualFechamento: pjContracts.percentualFechamento,
          diaAdiantamento: pjContracts.diaAdiantamento,
          diaFechamento: pjContracts.diaFechamento,
          contratoAssinadoUrl: pjContracts.contratoAssinadoUrl,
          tipoAssinatura: pjContracts.tipoAssinatura,
          status: pjContracts.status,
          alertaVencimentoEnviado: pjContracts.alertaVencimentoEnviado,
          observacoes: pjContracts.observacoes,
          revisao: pjContracts.revisao,
          createdAt: pjContracts.createdAt,
          employeeName: employees.nomeCompleto,
          employeeCpf: employees.cpf,
          employeeCargo: employees.cargo,
        })
        .from(pjContracts)
        .innerJoin(employees, eq(pjContracts.employeeId, employees.id))
        .where(and(...conditions))
        .orderBy(desc(pjContracts.createdAt));
        
        return rows;
      }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const [row] = await db.select({
          id: pjContracts.id,
          companyId: pjContracts.companyId,
          employeeId: pjContracts.employeeId,
          numeroContrato: pjContracts.numeroContrato,
          cnpjPrestador: pjContracts.cnpjPrestador,
          razaoSocialPrestador: pjContracts.razaoSocialPrestador,
          objetoContrato: pjContracts.objetoContrato,
          dataInicio: pjContracts.dataInicio,
          dataFim: pjContracts.dataFim,
          renovacaoAutomatica: pjContracts.renovacaoAutomatica,
          valorMensal: pjContracts.valorMensal,
          percentualAdiantamento: pjContracts.percentualAdiantamento,
          percentualFechamento: pjContracts.percentualFechamento,
          diaAdiantamento: pjContracts.diaAdiantamento,
          diaFechamento: pjContracts.diaFechamento,
          modeloContratoUrl: pjContracts.modeloContratoUrl,
          contratoAssinadoUrl: pjContracts.contratoAssinadoUrl,
          tipoAssinatura: pjContracts.tipoAssinatura,
          status: pjContracts.status,
          contratoAnteriorId: pjContracts.contratoAnteriorId,
          observacoes: pjContracts.observacoes,
          revisao: pjContracts.revisao,
          revisaoMotivo: pjContracts.revisaoMotivo,
          clausulasCustomizadas: pjContracts.clausulasCustomizadas,
          createdAt: pjContracts.createdAt,
          employeeName: employees.nomeCompleto,
          employeeCpf: employees.cpf,
          employeeCargo: employees.cargo,
          employeeEmail: employees.email,
          // Dados da empresa contratante
          companyRazaoSocial: companies.razaoSocial,
          companyCnpj: companies.cnpj,
          companyEndereco: companies.endereco,
          companyCidade: companies.cidade,
          companyEstado: companies.estado,
          companyLogoUrl: companies.logoUrl,
          companyNomeFantasia: companies.nomeFantasia,
          companyTelefone: companies.telefone,
          companyEmail: companies.email,
          companySite: companies.site,
        })
        .from(pjContracts)
        .innerJoin(employees, eq(pjContracts.employeeId, employees.id))
        .innerJoin(companies, eq(pjContracts.companyId, companies.id))
        .where(eq(pjContracts.id, input.id));
        return row || null;
      }),

    /** Alertas de contratos vencendo nos próximos 30 dias */
    alertas: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const hoje = new Date().toISOString().split("T")[0];
        const em30dias = new Date();
        em30dias.setDate(em30dias.getDate() + 30);
        const em30diasStr = em30dias.toISOString().split("T")[0];
        
        // Contratos vencendo nos próximos 30 dias
        const vencendo = await db.select({
          id: pjContracts.id,
          employeeId: pjContracts.employeeId,
          dataFim: pjContracts.dataFim,
          status: pjContracts.status,
          valorMensal: pjContracts.valorMensal,
          employeeName: employees.nomeCompleto,
        })
        .from(pjContracts)
        .innerJoin(employees, eq(pjContracts.employeeId, employees.id))
        .where(and(
          companyFilter(pjContracts.companyId, input),
          isNull(pjContracts.deletedAt),
          eq(pjContracts.status, 'ativo'),
          sql`${pjContracts.dataFim} BETWEEN ${hoje} AND ${em30diasStr}`,
        ));
        
        // Contratos já vencidos
        const vencidos = await db.select({
          id: pjContracts.id,
          employeeId: pjContracts.employeeId,
          dataFim: pjContracts.dataFim,
          status: pjContracts.status,
          employeeName: employees.nomeCompleto,
        })
        .from(pjContracts)
        .innerJoin(employees, eq(pjContracts.employeeId, employees.id))
        .where(and(
          companyFilter(pjContracts.companyId, input),
          isNull(pjContracts.deletedAt),
          eq(pjContracts.status, 'ativo'),
          sql`${pjContracts.dataFim} < ${hoje}`,
        ));
        
        // Sem contrato ativo (PJs sem contrato)
        const pjsSemContrato = await db.select({
          id: employees.id,
          nome: employees.nomeCompleto,
          cargo: employees.cargo,
        })
        .from(employees)
        .where(and(
          companyFilter(employees.companyId, input),
          eq(employees.tipoContrato, 'PJ'),
          eq(employees.status, 'Ativo'),
          isNull(employees.deletedAt),
          sql`${employees.id} NOT IN (SELECT employee_id FROM pj_contracts WHERE company_id = ${input.companyId} AND status = 'ativo' AND deleted_at IS NULL)`,
        ));
        
        return { vencendo, vencidos, pjsSemContrato };
      }),

    /** Gerar texto do contrato preenchido */
    gerarTexto: protectedProcedure
      .input(z.object({ contractId: z.number() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const [contrato] = await db.select()
          .from(pjContracts)
          .where(eq(pjContracts.id, input.contractId));
        if (!contrato) throw new TRPCError({ code: "NOT_FOUND" });
        
        const [emp] = await db.select().from(employees).where(eq(employees.id, contrato.employeeId));
        const [empresa] = await db.select().from(companies).where(eq(companies.id, contrato.companyId));
        
        if (!emp || !empresa) throw new TRPCError({ code: "NOT_FOUND" });
        
        const valorMensal = parseFloat(contrato.valorMensal || "0");
        const percAdiant = contrato.percentualAdiantamento || 40;
        const percFech = contrato.percentualFechamento || 60;
        
        let texto = MODELO_CONTRATO_PJ;
        texto = texto.replace(/\[EMPRESA_RAZAO_SOCIAL\]/g, empresa.razaoSocial || '');
        texto = texto.replace(/\[EMPRESA_CNPJ\]/g, empresa.cnpj || '');
        texto = texto.replace(/\[EMPRESA_ENDERECO\]/g, empresa.endereco || '');
        texto = texto.replace(/\[EMPRESA_CIDADE\]/g, empresa.cidade || '');
        texto = texto.replace(/\[EMPRESA_ESTADO\]/g, empresa.estado || '');
        texto = texto.replace(/\[EMPRESA_CEP\]/g, empresa.cep || '');
        texto = texto.replace(/\[PRESTADOR_NOME\]/g, emp.nomeCompleto || '');
        texto = texto.replace(/\[PRESTADOR_CPF\]/g, emp.cpf || '');
        texto = texto.replace(/\[PRESTADOR_RG\]/g, emp.rg || '');
        texto = texto.replace(/\[PRESTADOR_RAZAO_SOCIAL\]/g, contrato.razaoSocialPrestador || emp.nomeCompleto || '');
        texto = texto.replace(/\[PRESTADOR_CNPJ\]/g, contrato.cnpjPrestador || '');
        texto = texto.replace(/\[PRESTADOR_ENDERECO\]/g, emp.logradouro || '');
        texto = texto.replace(/\[OBJETO_CONTRATO\]/g, contrato.objetoContrato || '');
        texto = texto.replace(/\[PRAZO_VIGENCIA\]/g, calcularPrazoVigencia(contrato.dataInicio, contrato.dataFim));
        texto = texto.replace(/\[DATA_INICIO\]/g, contrato.dataInicio || '');
        texto = texto.replace(/\[DATA_FIM\]/g, contrato.dataFim || '');
        texto = texto.replace(/\[VALOR_MENSAL\]/g, valorMensal.toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
        texto = texto.replace(/\[VALOR_EXTENSO\]/g, ''); // TODO: extenso
        texto = texto.replace(/\[PERCENTUAL_ADIANTAMENTO\]/g, String(percAdiant));
        texto = texto.replace(/\[VALOR_ADIANTAMENTO\]/g, (valorMensal * percAdiant / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
        texto = texto.replace(/\[PERCENTUAL_FECHAMENTO\]/g, String(percFech));
        texto = texto.replace(/\[VALOR_FECHAMENTO\]/g, (valorMensal * percFech / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
        texto = texto.replace(/\[DIA_ADIANTAMENTO\]/g, String(contrato.diaAdiantamento || 15));
        texto = texto.replace(/\[DIA_FECHAMENTO\]/g, String(contrato.diaFechamento || 5));
        texto = texto.replace(/\[DATA_ASSINATURA\]/g, new Date().toLocaleDateString('pt-BR'));
        
        return { texto };
      }),

    create: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), employeeId: z.number(),
        cnpjPrestador: z.string().optional(),
        razaoSocialPrestador: z.string().optional(),
        objetoContrato: z.string().optional(),
        dataInicio: z.string(),
        dataFim: z.string(),
        renovacaoAutomatica: z.number().default(0),
        valorMensal: z.string(),
        percentualAdiantamento: z.number().default(40),
        percentualFechamento: z.number().default(60),
        diaAdiantamento: z.number().default(15),
        diaFechamento: z.number().default(5),
        observacoes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        
        // Gerar número do contrato
        const ano = new Date().getFullYear();
        const [countResult] = await db.select({ total: sql<number>`COUNT(*)` })
          .from(pjContracts)
          .where(companyFilter(pjContracts.companyId, input));
        const numero = `PJ-${ano}-${String((countResult?.total || 0) + 1).padStart(4, '0')}`;
        
        const [inserted] = await db.insert(pjContracts).values({
          companyId: input.companyId,
          employeeId: input.employeeId,
          numeroContrato: numero,
          cnpjPrestador: input.cnpjPrestador || null,
          razaoSocialPrestador: input.razaoSocialPrestador || null,
          objetoContrato: input.objetoContrato || null,
          dataInicio: input.dataInicio,
          dataFim: input.dataFim,
          // Modelo atual: contratos PJ NÃO renovam automaticamente.
          renovacaoAutomatica: 0,
          valorMensal: input.valorMensal,
          percentualAdiantamento: input.percentualAdiantamento,
          percentualFechamento: input.percentualFechamento,
          diaAdiantamento: input.diaAdiantamento,
          diaFechamento: input.diaFechamento,
          status: 'pendente_assinatura',
          revisao: '01',
          criadoPor: ctx.user.name ?? 'Sistema',
          criadoPorUserId: ctx.user.id,
          observacoes: input.observacoes || null,
        }).returning({ id: pjContracts.id, employeeId: pjContracts.employeeId, companyId: pjContracts.companyId });

        // Criar registro inicial de revisão ISO
        await db.insert(pjContractRevisoes).values({
          contractId: inserted.id,
          companyId: inserted.companyId,
          employeeId: inserted.employeeId,
          revisaoNum: '01',
          motivo: 'Criação do contrato',
          criadoPor: ctx.user.name ?? 'Sistema',
          criadoPorUserId: ctx.user.id,
        });

        // Gerar previsão de medições (adiantamento + fechamento por mês) já na
        // criação, cobrindo toda a vigência do contrato.
        let previsoesGeradas = 0;
        try {
          const contratoCompleto = {
            id: inserted.id,
            companyId: inserted.companyId,
            employeeId: inserted.employeeId,
            dataInicio: input.dataInicio,
            dataFim: input.dataFim,
            valorMensal: input.valorMensal,
            percentualAdiantamento: input.percentualAdiantamento,
            percentualFechamento: input.percentualFechamento,
            diaAdiantamento: input.diaAdiantamento,
            diaFechamento: input.diaFechamento,
          };
          previsoesGeradas = await gerarPrevisoesDoContrato(
            db, contratoCompleto, ctx.user.name ?? 'Sistema',
          );
        } catch (e: any) {
          console.error('[pj.contratos.create] Falha ao gerar previsões:', e?.message || e);
        }

        return { success: true, id: inserted.id, numeroContrato: numero, previsoesGeradas };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        cnpjPrestador: z.string().optional(),
        razaoSocialPrestador: z.string().optional(),
        objetoContrato: z.string().optional(),
        dataInicio: z.string().optional(),
        dataFim: z.string().optional(),
        renovacaoAutomatica: z.number().optional(),
        valorMensal: z.string().optional(),
        percentualAdiantamento: z.number().optional(),
        percentualFechamento: z.number().optional(),
        diaAdiantamento: z.number().optional(),
        diaFechamento: z.number().optional(),
        tipoAssinatura: z.string().optional(),
        status: z.string().optional(),
        observacoes: z.string().optional(),
        motivoAlteracao: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        const { id, motivoAlteracao, ...rest } = input;

        // Buscar contrato atual para snapshot e revisão
        const [atual] = await db.select().from(pjContracts).where(eq(pjContracts.id, id));
        if (!atual) throw new TRPCError({ code: "NOT_FOUND" });

        const updateData: any = {};
        Object.entries(rest).forEach(([k, v]) => { if (v !== undefined) updateData[k] = v; });

        // Incrementar revisão ISO somente se houve alteração de campos relevantes (exceto status simples)
        const camposRelevantes = ['cnpjPrestador','razaoSocialPrestador','objetoContrato','dataInicio','dataFim','valorMensal','percentualAdiantamento','percentualFechamento','diaAdiantamento','diaFechamento','observacoes'];
        const houveMudancaRelevante = camposRelevantes.some(c => updateData[c] !== undefined && updateData[c] !== (atual as any)[c]);

        let novaRevisao = atual.revisao || '01';
        if (houveMudancaRelevante || motivoAlteracao) {
          const numAtual = parseInt(novaRevisao || '01', 10);
          novaRevisao = String(numAtual + 1).padStart(2, '0');
          updateData.revisao = novaRevisao;
          if (motivoAlteracao) updateData.revisaoMotivo = motivoAlteracao;

          // Criar registro de revisão ISO
          await db.insert(pjContractRevisoes).values({
            contractId: id,
            companyId: atual.companyId,
            employeeId: atual.employeeId,
            revisaoNum: novaRevisao,
            motivo: motivoAlteracao || 'Atualização de contrato',
            snapshot: JSON.stringify(atual),
            criadoPor: ctx.user.name ?? 'Sistema',
            criadoPorUserId: ctx.user.id,
          });
        }

        updateData.updatedAt = sql`NOW()`;
        await db.update(pjContracts).set(updateData).where(eq(pjContracts.id, id));

        // Rev. 3699 — propagar mudança de valorMensal/percentuais aos pj_payments PENDENTES
        const valorCampos = ['valorMensal', 'percentualAdiantamento', 'percentualFechamento'];
        const mudouValor = valorCampos.some(c => updateData[c] !== undefined && String(updateData[c]) !== String((atual as any)[c]));
        if (mudouValor) {
          try {
            const r = await sincronizarPagamentosPendentesInterno(db, atual.employeeId);
            console.log(`[PJ Update] Sincronizados ${r.pagamentos} pj_payments e ${r.entries} financial_entries p/ employee ${atual.employeeId}`);
          } catch (e: any) { console.warn("[PJ Update] sincronizar falhou (não-fatal):", e?.message ?? e); }
        }

        return { success: true, revisao: novaRevisao };
      }),

    /** Sincroniza pj_payments PENDENTES + financial_entries ao valorMensal atual do contrato */
    sincronizarPagamentosPendentes: protectedProcedure
      .input(z.object({ companyId: z.number(), employeeId: z.number() }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        const r = await sincronizarPagamentosPendentesInterno(db, input.employeeId);
        return { success: true, ...r };
      }),

    /** Upload contrato assinado */
    uploadContrato: protectedProcedure
      .input(z.object({ id: z.number(), fileBase64: z.string(), fileName: z.string() }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        const buffer = Buffer.from(input.fileBase64, 'base64');
        const ext = input.fileName.split('.').pop() || 'pdf';
        const key = `contratos-pj/${input.id}-${Date.now()}.${ext}`;
        const { url } = await storagePut(key, buffer, ext === 'pdf' ? 'application/pdf' : 'application/octet-stream');
        
        await db.update(pjContracts).set({
          contratoAssinadoUrl: url,
          tipoAssinatura: 'manual' as any,
          status: 'ativo' as any,
        }).where(eq(pjContracts.id, input.id));
        
        return { success: true, url };
      }),

    /** Renovar contrato */
    renovar: protectedProcedure
      .input(z.object({
        id: z.number(),
        novaDataInicio: z.string(),
        novaDataFim: z.string(),
        novoValorMensal: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        const [contratoAnterior] = await db.select().from(pjContracts).where(eq(pjContracts.id, input.id));
        if (!contratoAnterior) throw new TRPCError({ code: "NOT_FOUND" });
        
        // Marcar contrato anterior como renovado
        await db.update(pjContracts).set({ status: 'renovado' as any }).where(eq(pjContracts.id, input.id));
        
        // Criar novo contrato
        const ano = new Date().getFullYear();
        const [countResult] = await db.select({ total: sql<number>`COUNT(*)` })
          .from(pjContracts)
          .where(eq(pjContracts.companyId, contratoAnterior.companyId));
        const numero = `PJ-${ano}-${String((countResult?.total || 0) + 1).padStart(4, '0')}`;
        
        const [result] = await db.insert(pjContracts).values({
          companyId: contratoAnterior.companyId,
          employeeId: contratoAnterior.employeeId,
          numeroContrato: numero,
          cnpjPrestador: contratoAnterior.cnpjPrestador,
          razaoSocialPrestador: contratoAnterior.razaoSocialPrestador,
          objetoContrato: contratoAnterior.objetoContrato,
          dataInicio: input.novaDataInicio,
          dataFim: input.novaDataFim,
          renovacaoAutomatica: contratoAnterior.renovacaoAutomatica,
          valorMensal: input.novoValorMensal || contratoAnterior.valorMensal,
          percentualAdiantamento: contratoAnterior.percentualAdiantamento,
          percentualFechamento: contratoAnterior.percentualFechamento,
          diaAdiantamento: contratoAnterior.diaAdiantamento,
          diaFechamento: contratoAnterior.diaFechamento,
          status: 'pendente_assinatura',
          contratoAnteriorId: input.id,
          criadoPor: ctx.user.name ?? 'Sistema',
          criadoPorUserId: ctx.user.id,
        });
        
        return { success: true, novoContratoId: result[0].id, numero };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        await db.update(pjContracts).set({
          deletedAt: sql`NOW()`,
          deletedBy: ctx.user.name ?? 'Sistema',
          deletedByUserId: ctx.user.id,
        } as any).where(eq(pjContracts.id, input.id));
        return { success: true };
      }),

    /** Buscar último contrato do prestador (para auto-preenchimento de CNPJ/Razão Social) */
    getLastByEmployee: protectedProcedure
      .input(z.object({ employeeId: z.number(), companyId: z.number() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const [row] = await db.select({
          cnpjPrestador: pjContracts.cnpjPrestador,
          razaoSocialPrestador: pjContracts.razaoSocialPrestador,
          objetoContrato: pjContracts.objetoContrato,
          valorMensal: pjContracts.valorMensal,
          percentualAdiantamento: pjContracts.percentualAdiantamento,
          percentualFechamento: pjContracts.percentualFechamento,
          diaAdiantamento: pjContracts.diaAdiantamento,
          diaFechamento: pjContracts.diaFechamento,
        })
        .from(pjContracts)
        .where(and(
          eq(pjContracts.employeeId, input.employeeId),
          eq(pjContracts.companyId, input.companyId),
          isNull(pjContracts.deletedAt),
        ))
        .orderBy(desc(pjContracts.createdAt))
        .limit(1);
        return row || null;
      }),

    /** Listar revisões ISO de um contrato */
    revisoes: protectedProcedure
      .input(z.object({ contractId: z.number() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const rows = await db.select()
          .from(pjContractRevisoes)
          .where(eq(pjContractRevisoes.contractId, input.contractId))
          .orderBy(desc(pjContractRevisoes.criadoEm));
        return rows;
      }),
  }),

  // ============================================================
  // PAGAMENTOS PJ
  // ============================================================
  pagamentos: router({
    list: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string().optional(), contractId: z.number().optional() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const conditions = [companyFilter(pjPayments.companyId, input)];
        if (input.mesReferencia) conditions.push(eq(pjPayments.mesReferencia, input.mesReferencia));
        if (input.contractId) conditions.push(eq(pjPayments.contractId, input.contractId));
        
        const rows = await db.select({
          id: pjPayments.id,
          contractId: pjPayments.contractId,
          companyId: pjPayments.companyId,
          employeeId: pjPayments.employeeId,
          mesReferencia: pjPayments.mesReferencia,
          tipo: pjPayments.tipo,
          valor: pjPayments.valor,
          descricao: pjPayments.descricao,
          dataPrevista: pjPayments.dataPrevista,
          dataPagamento: pjPayments.dataPagamento,
          status: pjPayments.status,
          comprovanteUrl: pjPayments.comprovanteUrl,
          observacoes: pjPayments.observacoes,
          createdAt: pjPayments.createdAt,
          employeeName: employees.nomeCompleto,
          cnpjPrestador: pjContracts.cnpjPrestador,
          razaoSocialPrestador: pjContracts.razaoSocialPrestador,
        })
        .from(pjPayments)
        .innerJoin(employees, eq(pjPayments.employeeId, employees.id))
        .leftJoin(pjContracts, and(eq(pjPayments.contractId, pjContracts.id), eq(pjContracts.companyId, pjPayments.companyId)))
        .where(and(...conditions))
        .orderBy(asc(employees.nomeCompleto), asc(pjPayments.mesReferencia), asc(pjPayments.tipo));

        // Rev. 3262 — enriquece cada pagamento com o cruzamento contra o
        // catálogo de Fornecedores (cadastrado/sugestão/não cadastrado).
        const [idx, cnpjPorEmp] = await Promise.all([
          carregarFornecedorIndex(db, input),
          carregarCnpjPorEmployee(db, input),
        ]);
        return (rows as any[]).map((r) => {
          const fallback = cnpjPorEmp.get(r.employeeId);
          const cnpj = normCnpj(r.cnpjPrestador) ? r.cnpjPrestador : (fallback?.cnpj ?? null);
          const nome = r.razaoSocialPrestador || fallback?.razaoSocial || r.employeeName;
          const m = matchFornecedor(cnpj, nome, idx);
          return { ...r, cnpjPrestador: cnpj, ...m };
        });
      }),

    /**
     * Sincroniza previsões de medições para TODOS os contratos PJ ativos da
     * empresa, cobrindo a vigência completa de cada contrato. Idempotente:
     * só insere o que ainda não existe (não duplica).
     *
     * Mantido com o nome `gerarMensal` para compatibilidade com o frontend
     * existente — `mesReferencia` é aceito mas ignorado (servia ao modelo
     * antigo que gerava apenas o mês corrente).
     */
    gerarMensal: protectedProcedure
      .input(z.object({
        companyId: z.number(),
        companyIds: z.array(z.number()).optional(),
        mesReferencia: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          const db = (await getDb())!;

          const contratosAtivos = await db.select()
            .from(pjContracts)
            .where(and(
              companyFilter(pjContracts.companyId, input),
              eq(pjContracts.status, 'ativo'),
              isNull(pjContracts.deletedAt),
            ));

          let totalCriados = 0;
          let contratosComMedicoesNovas = 0;
          for (const contrato of contratosAtivos) {
            const novos = await gerarPrevisoesDoContrato(
              db, contrato, ctx.user.name ?? 'Sistema',
            );
            if (novos > 0) {
              totalCriados += novos;
              contratosComMedicoesNovas++;
            }
          }

          return {
            success: true,
            contratosProcessados: contratosComMedicoesNovas,
            medicoesCriadas: totalCriados,
            totalContratos: contratosAtivos.length,
          };
        } catch (e: any) {
          console.error('[pj.pagamentos.gerarMensal] Erro:', e);
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Falha ao gerar previsões PJ: ${e?.message || 'erro desconhecido'}`,
          });
        }
      }),

    create: protectedProcedure
      .input(z.object({
        contractId: z.number(),
        companyId: z.number(),
        employeeId: z.number(),
        mesReferencia: z.string(),
        tipo: z.enum(['adiantamento','fechamento','bonificacao']),
        valor: z.string(),
        descricao: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        // Rev. 3444 — Dedup: impede inserção de (employeeId, mesReferencia, tipo) duplicado
        // independente do contractId (protege contra revisão de contrato + double-click).
        const existente = await db.select({ id: pjPayments.id })
          .from(pjPayments)
          .where(and(
            eq(pjPayments.employeeId, input.employeeId),
            eq(pjPayments.mesReferencia, input.mesReferencia),
            eq(pjPayments.tipo, input.tipo),
          ))
          .limit(1);
        if (existente.length > 0) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `Já existe lançamento PJ de "${input.tipo}" para este prestador em ${input.mesReferencia}.`,
          });
        }
        // Cap: soma existente + novo não pode exceder valorMensal do contrato
        const [contrato, somaRes] = await Promise.all([
          db.select({ valorMensal: pjContracts.valorMensal })
            .from(pjContracts)
            .where(eq(pjContracts.id, input.contractId))
            .limit(1),
          db.select({ soma: pjPayments.valor })
            .from(pjPayments)
            .where(and(
              eq(pjPayments.employeeId, input.employeeId),
              eq(pjPayments.mesReferencia, input.mesReferencia),
            )),
        ]);
        if (contrato.length > 0) {
          const valorMensal = parseFloat((contrato[0] as any).valorMensal || "0") || 0;
          const somaAtual = (somaRes as any[]).reduce((acc: number, r: any) => acc + parseFloat(r.soma || "0"), 0);
          const novoValor = parseFloat(input.valor || "0");
          if (valorMensal > 0 && somaAtual + novoValor > valorMensal * 1.001) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `Total ultrapassaria o valor mensal do contrato (R$ ${valorMensal.toFixed(2)}). Soma atual: R$ ${somaAtual.toFixed(2)}, novo lançamento: R$ ${novoValor.toFixed(2)}.`,
            });
          }
        }
        await db.insert(pjPayments).values({
          ...input,
          descricao: input.descricao || null,
          status: 'pendente',
          criadoPor: ctx.user.name ?? 'Sistema',
        });
        return { success: true };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        valor: z.string().optional(),
        descricao: z.string().optional(),
        dataPagamento: z.string().optional(),
        status: z.string().optional(),
        observacoes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        const { id, ...rest } = input;
        const updateData: any = {};
        Object.entries(rest).forEach(([k, v]) => { if (v !== undefined) updateData[k] = v; });
        await db.update(pjPayments).set(updateData).where(eq(pjPayments.id, id));
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        await db.delete(pjPayments).where(eq(pjPayments.id, input.id));
        return { success: true };
      }),

    /**
     * Rev. 3262 — Ranking por fornecedor (READ-ONLY).
     * Soma histórica em BRL por prestador (employee), destacando quanto já foi
     * recebido (pagamentos com `dataPagamento`/status `pago`) e o total do mês
     * de referência. Cada linha vem com o cruzamento contra o catálogo de
     * Fornecedores (cadastrado/sugestão/não cadastrado).
     */
    rankingFornecedores: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string().optional() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        // Safe-cast: `valor` é varchar e pode conter valor legado/mascarado;
        // só converte quando casa com o formato numérico canônico, senão 0
        // (evita derrubar a query inteira com erro de cast).
        const valNum = sql<string>`CASE WHEN ${pjPayments.valor} ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN ${pjPayments.valor}::numeric ELSE 0 END`;
        const pago = sql`(${pjPayments.status} = 'pago' OR ${pjPayments.dataPagamento} IS NOT NULL)`;
        const mes = input.mesReferencia ?? null;

        const rows = await db.select({
          employeeId: pjPayments.employeeId,
          employeeName: employees.nomeCompleto,
          totalHistorico: sql<string>`COALESCE(SUM(${valNum}), 0)`,
          totalRecebido: sql<string>`COALESCE(SUM(CASE WHEN ${pago} THEN ${valNum} ELSE 0 END), 0)`,
          totalMes: sql<string>`COALESCE(SUM(CASE WHEN ${mes} IS NOT NULL AND ${pjPayments.mesReferencia} = ${mes} THEN ${valNum} ELSE 0 END), 0)`,
          qtd: sql<number>`COUNT(*)`,
        })
          .from(pjPayments)
          .innerJoin(employees, eq(pjPayments.employeeId, employees.id))
          .where(companyFilter(pjPayments.companyId, input))
          .groupBy(pjPayments.employeeId, employees.nomeCompleto);

        const [idx, cnpjPorEmp] = await Promise.all([
          carregarFornecedorIndex(db, input),
          carregarCnpjPorEmployee(db, input),
        ]);

        const enriched = (rows as any[]).map((r) => {
          const fallback = cnpjPorEmp.get(r.employeeId);
          const cnpj = fallback?.cnpj ?? null;
          const nome = fallback?.razaoSocial || r.employeeName;
          const m = matchFornecedor(cnpj, nome, idx);
          return {
            employeeId: r.employeeId,
            employeeName: r.employeeName,
            cnpjPrestador: cnpj,
            totalHistorico: parseFloat(r.totalHistorico || "0"),
            totalRecebido: parseFloat(r.totalRecebido || "0"),
            totalMes: parseFloat(r.totalMes || "0"),
            qtd: Number(r.qtd || 0),
            ...m,
          };
        });
        enriched.sort((a, b) => b.totalRecebido - a.totalRecebido || b.totalHistorico - a.totalHistorico);
        return enriched;
      }),
  }),

  /** Relatório consolidado PJ para exportação PDF (retorna HTML formatado) */
  relatorioPJ: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      
      // Buscar todos os pagamentos do mês
      const pagamentos = await db.select({
        id: pjPayments.id,
        contractId: pjPayments.contractId,
        employeeId: pjPayments.employeeId,
        mesReferencia: pjPayments.mesReferencia,
        tipo: pjPayments.tipo,
        valor: pjPayments.valor,
        descricao: pjPayments.descricao,
        dataPagamento: pjPayments.dataPagamento,
        status: pjPayments.status,
        employeeName: employees.nomeCompleto,
        employeeCpf: employees.cpf,
      })
      .from(pjPayments)
      .innerJoin(employees, eq(pjPayments.employeeId, employees.id))
      .where(and(
        companyFilter(pjPayments.companyId, input),
        eq(pjPayments.mesReferencia, input.mesReferencia),
      ))
      .orderBy(sql`${employees.nomeCompleto} ASC, ${pjPayments.tipo} ASC`);

      // Buscar contratos ativos
      const contratos = await db.select({
        id: pjContracts.id,
        employeeId: pjContracts.employeeId,
        cnpj: pjContracts.cnpjPrestador,
        razaoSocial: pjContracts.razaoSocialPrestador,
        valorMensal: pjContracts.valorMensal,
        percentualAdiantamento: pjContracts.percentualAdiantamento,
        percentualFechamento: pjContracts.percentualFechamento,
        employeeName: employees.nomeCompleto,
      })
      .from(pjContracts)
      .innerJoin(employees, eq(pjContracts.employeeId, employees.id))
      .where(and(
        companyFilter(pjContracts.companyId, input),
        isNull(pjContracts.deletedAt),
      ));

      // Agrupar por prestador
      const porPrestador: Record<number, {
        nome: string;
        cpf: string;
        cnpj: string;
        razaoSocial: string;
        valorMensal: string;
        pagamentos: typeof pagamentos;
        totalAdiantamento: number;
        totalFechamento: number;
        totalBonificacao: number;
        totalGeral: number;
      }> = {};

      for (const p of pagamentos) {
        if (!porPrestador[p.employeeId]) {
          const contrato = contratos.find(c => c.employeeId === p.employeeId);
          porPrestador[p.employeeId] = {
            nome: p.employeeName || 'Prestador',
            cpf: p.employeeCpf || '',
            cnpj: contrato?.cnpj || '-',
            razaoSocial: contrato?.razaoSocial || '-',
            valorMensal: contrato?.valorMensal || '0',
            pagamentos: [],
            totalAdiantamento: 0,
            totalFechamento: 0,
            totalBonificacao: 0,
            totalGeral: 0,
          };
        }
        const prest = porPrestador[p.employeeId];
        prest.pagamentos.push(p);
        const val = parseFloat(p.valor || '0');
        if (p.tipo === 'adiantamento') prest.totalAdiantamento += val;
        else if (p.tipo === 'fechamento') prest.totalFechamento += val;
        else prest.totalBonificacao += val;
        prest.totalGeral += val;
      }

      // Totais gerais
      const totalGeral = Object.values(porPrestador).reduce((s, p) => s + p.totalGeral, 0);
      const totalAdiantamento = Object.values(porPrestador).reduce((s, p) => s + p.totalAdiantamento, 0);
      const totalFechamento = Object.values(porPrestador).reduce((s, p) => s + p.totalFechamento, 0);
      const totalBonificacao = Object.values(porPrestador).reduce((s, p) => s + p.totalBonificacao, 0);

      return {
        mesReferencia: input.mesReferencia,
        prestadores: Object.values(porPrestador),
        totais: {
          geral: totalGeral,
          adiantamento: totalAdiantamento,
          fechamento: totalFechamento,
          bonificacao: totalBonificacao,
          qtdPrestadores: Object.keys(porPrestador).length,
          qtdLancamentos: pagamentos.length,
        },
      };
    }),

  /** Modelo de contrato */
  modeloContrato: protectedProcedure.query(() => {
    return { modelo: MODELO_CONTRATO_PJ };
  }),

  salvarClausulas: protectedProcedure
    .input(z.object({
      contractId: z.number(),
      companyId: z.number(),
      clausulasTexto: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const [contrato] = await db.select({ id: pjContracts.id, companyId: pjContracts.companyId })
        .from(pjContracts)
        .where(eq(pjContracts.id, input.contractId));
      if (!contrato || contrato.companyId !== input.companyId)
        throw new TRPCError({ code: "NOT_FOUND" });
      await db.execute(sql`
        UPDATE pj_contracts
           SET clausulas_customizadas = ${input.clausulasTexto},
               "updatedAt" = NOW()
         WHERE id = ${input.contractId} AND "companyId" = ${input.companyId}
      `);
      console.log(`[PJ] Cláusulas customizadas salvas no contrato ${input.contractId} por ${ctx.user.name}`);
      return { ok: true };
    }),

  // ============================================================
  // DOCUMENTOS DO PRESTADOR PJ
  // ============================================================
  documentos: router({
    list: protectedProcedure
      .input(z.object({ employeeId: z.number(), companyId: z.number() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const rows = await db.execute(sql`
          SELECT id, company_id as "companyId", employee_id as "employeeId",
                 contract_id as "contractId", nome, tipo, url, storage_key as "storageKey",
                 criado_por as "criadoPor", created_at as "createdAt"
          FROM pj_documentos
          WHERE employee_id = ${input.employeeId}
            AND company_id = ${input.companyId}
            AND deleted_at IS NULL
          ORDER BY created_at DESC
        `);
        return rows.rows as any[];
      }),

    upload: protectedProcedure
      .input(z.object({
        companyId: z.number(),
        employeeId: z.number(),
        contractId: z.number().optional(),
        nome: z.string(),
        tipo: z.string().optional().default('outro'),
        fileBase64: z.string(),
        fileName: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        const buffer = Buffer.from(input.fileBase64, 'base64');
        const ext = input.fileName.split('.').pop() || 'pdf';
        const mimeTypes: Record<string, string> = {
          pdf: 'application/pdf',
          jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
          doc: 'application/msword',
          docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        };
        const mime = mimeTypes[ext.toLowerCase()] || 'application/octet-stream';
        const key = `pj-documentos/${input.companyId}/${input.employeeId}-${Date.now()}.${ext}`;
        const { url } = await storagePut(key, buffer, mime);
        const criadoPor = (ctx.user as any)?.name || (ctx.user as any)?.username || 'sistema';
        await db.execute(sql`
          INSERT INTO pj_documentos (company_id, employee_id, contract_id, nome, tipo, url, storage_key, criado_por, criado_por_user_id)
          VALUES (${input.companyId}, ${input.employeeId}, ${input.contractId ?? null}, ${input.nome}, ${input.tipo}, ${url}, ${key}, ${criadoPor}, ${(ctx.user as any)?.id ?? null})
        `);
        return { url };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        await db.execute(sql`
          UPDATE pj_documentos SET deleted_at = NOW() WHERE id = ${input.id}
        `);
        return { ok: true };
      }),
  }),

  definirLimiteFd: protectedProcedure
    .input(z.object({ contractId: z.number(), companyId: z.number(), limiteFd: z.number() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await db.update(pjContracts).set({
        limiteFd: String(input.limiteFd.toFixed(2)),
        updatedAt: new Date().toISOString(),
      } as any).where(and(eq(pjContracts.id, input.contractId), eq(pjContracts.companyId, input.companyId)));
      return { success: true };
    }),

  getSaldoFdTerceiro: protectedProcedure
    .input(z.object({ contractId: z.number(), companyId: z.number() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const [contrato] = await db.select().from(pjContracts)
        .where(and(eq(pjContracts.id, input.contractId), eq(pjContracts.companyId, input.companyId)));
      if (!contrato) return { limiteFd: 0, fdConsumido: 0, saldoFd: 0 };
      const limiteFd = parseFloat(String((contrato as any).limiteFd ?? "0")) || 0;
      const fdConsumido = parseFloat(String((contrato as any).fdConsumido ?? "0")) || 0;
      return { limiteFd, fdConsumido, saldoFd: limiteFd - fdConsumido };
    }),

  marcarOcFdTerceiro: protectedProcedure
    .input(z.object({ ocId: z.number(), companyId: z.number(), contractId: z.number(), valor: z.number() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const [contrato] = await db.select().from(pjContracts)
        .where(and(eq(pjContracts.id, input.contractId), eq(pjContracts.companyId, input.companyId)));
      if (!contrato) throw new TRPCError({ code: "NOT_FOUND", message: "Contrato não encontrado" });

      const limiteFd = parseFloat(String((contrato as any).limiteFd ?? "0")) || 0;
      const fdConsumido = parseFloat(String((contrato as any).fdConsumido ?? "0")) || 0;

      if (limiteFd <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Este contrato não possui limite de FD definido." });

      const ocsJaMarcadas = await db.select({ fdValor: comprasOrdens.fdValor })
        .from(comprasOrdens)
        .where(and(
          eq(comprasOrdens.companyId, input.companyId),
          sql`${comprasOrdens.modalidadeFd} = 'fd_terceiro'`,
          sql`${comprasOrdens.status} != 'cancelada'`,
          sql`${comprasOrdens.contratoId} = ${input.contractId}`,
          sql`${comprasOrdens.id} != ${input.ocId}`,
        ));
      const totalComprometido = ocsJaMarcadas.reduce((s, o) => s + (parseFloat(String(o.fdValor ?? "0")) || 0), 0);
      const saldoFd = limiteFd - totalComprometido;

      if (input.valor > saldoFd) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Saldo de FD Terceiro insuficiente. Disponível: R$ ${saldoFd.toFixed(2)}. Valor: R$ ${input.valor.toFixed(2)}. Não é possível ultrapassar o teto de FD.`,
        });
      }

      const [oc] = await db.select().from(comprasOrdens)
        .where(and(eq(comprasOrdens.id, input.ocId), eq(comprasOrdens.companyId, input.companyId)));
      if (!oc) throw new TRPCError({ code: "NOT_FOUND", message: "OC não encontrada" });

      const ocTipo = (oc as any).tipo;
      if (ocTipo === "servico" || ocTipo === "pacote") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Faturamento Direto não é permitido para MDO." });
      }

      await db.update(comprasOrdens).set({
        modalidadeFd: "fd_terceiro",
        fdValor: String(input.valor.toFixed(2)),
        fdStatus: "pendente_aprovacao",
        atualizadoEm: new Date().toISOString(),
      } as any).where(eq(comprasOrdens.id, input.ocId));

      return { success: true };
    }),

  extrairClausulas: protectedProcedure
    .input(z.object({ contractId: z.number(), companyId: z.number() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const [contrato] = await db.select().from(pjContracts).where(and(eq(pjContracts.id, input.contractId), eq(pjContracts.companyId, input.companyId)));
      if (!contrato) throw new TRPCError({ code: "NOT_FOUND", message: "Contrato não encontrado" });

      const template = MODELO_CONTRATO_PJ;
      const clausulas: Array<{ numero: string; titulo: string; textoCompleto: string }> = [];
      const lines = template.split('\n');
      let current: { numero: string; titulo: string; textoCompleto: string } | null = null;

      for (const line of lines) {
        const match = line.match(/^CL[ÁA]USULA\s+(PRIMEIRA|SEGUNDA|TERCEIRA|QUARTA|QUINTA|SEXTA|S[ÉE]TIMA|OITAVA|NONA|D[ÉE]CIMA):\s*(.*)/i);
        if (match) {
          if (current) clausulas.push(current);
          const ordinalMap: Record<string, string> = {
            'PRIMEIRA': '01', 'SEGUNDA': '02', 'TERCEIRA': '03', 'QUARTA': '04',
            'QUINTA': '05', 'SEXTA': '06', 'SÉTIMA': '07', 'SETIMA': '07',
            'OITAVA': '08', 'NONA': '09', 'DÉCIMA': '10', 'DECIMA': '10',
          };
          current = {
            numero: ordinalMap[match[1].toUpperCase()] || match[1],
            titulo: match[2].trim(),
            textoCompleto: line,
          };
        } else if (current) {
          current.textoCompleto += '\n' + line;
        }
      }
      if (current) clausulas.push(current);

      return clausulas;
    }),

  aditivos: router({
    list: protectedProcedure
      .input(z.object({ contractId: z.number(), companyId: z.number() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const rows = await db.execute(sql`
          SELECT id, "companyId", "contractId",
                 "employeeId", "numeroAditivo",
                 "clausulasAlteradas",
                 "dataAditivo", observacoes,
                 "criadoPor", "criadoEm"
          FROM pj_contract_aditivos
          WHERE "contractId" = ${input.contractId}
            AND "companyId" = ${input.companyId}
          ORDER BY "numeroAditivo" ASC
        `);
        return rows.rows as any[];
      }),

    getById: protectedProcedure
      .input(z.object({ id: z.number(), companyId: z.number().optional() }))
      .query(async ({ input, ctx }) => {
        const db = (await getDb())!;
        const rows = await db.execute(sql`
          SELECT a.id, a."companyId", a."contractId",
                 a."employeeId", a."numeroAditivo",
                 a."clausulasAlteradas",
                 a."dataAditivo", a.observacoes,
                 a."criadoPor", a."criadoEm",
                 c."numeroContrato",
                 c."objetoContrato",
                 c."dataInicio",
                 c."valorMensal",
                 c."percentualAdiantamento",
                 c."percentualFechamento",
                 c."diaAdiantamento",
                 c."diaFechamento",
                 e."nomeCompleto" as "employeeName",
                 e.cpf as "employeeCpf",
                 e.cargo as "employeeCargo",
                 c."cnpjPrestador",
                 c."razaoSocialPrestador",
                 c.revisao,
                 comp."razaoSocial" as "companyRazaoSocial",
                 comp.cnpj as "companyCnpj",
                 comp.endereco as "companyEndereco",
                 comp.cidade as "companyCidade",
                 comp.estado as "companyEstado",
                 comp."logoUrl" as "companyLogoUrl",
                 NULL as "responsavelLegal"
          FROM pj_contract_aditivos a
          JOIN pj_contracts c ON c.id = a."contractId"
          JOIN employees e ON e.id = a."employeeId"
          LEFT JOIN companies comp ON comp.id = a."companyId"
          WHERE a.id = ${input.id}
            ${input.companyId ? sql`AND a."companyId" = ${input.companyId}` : sql``}
        `);
        if (rows.rows.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Aditivo não encontrado" });
        return rows.rows[0] as any;
      }),

    create: protectedProcedure
      .input(z.object({
        companyId: z.number(),
        contractId: z.number(),
        clausulasAlteradas: z.string(),
        dataAditivo: z.string(),
        observacoes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        const [contrato] = await db.select().from(pjContracts)
          .where(and(eq(pjContracts.id, input.contractId), eq(pjContracts.companyId, input.companyId)));
        if (!contrato) throw new TRPCError({ code: "NOT_FOUND", message: "Contrato não encontrado" });

        const existing = await db.execute(sql`
          SELECT COALESCE(MAX("numeroAditivo"), 0) as max_num
          FROM pj_contract_aditivos
          WHERE "contractId" = ${input.contractId} AND "companyId" = ${input.companyId}
        `);
        const nextNum = (parseInt(String((existing.rows[0] as any).max_num)) || 0) + 1;
        const criadoPor = (ctx.user as any)?.name || (ctx.user as any)?.username || 'sistema';

        const result = await db.execute(sql`
          INSERT INTO pj_contract_aditivos ("companyId", "contractId", "employeeId", "numeroAditivo", "clausulasAlteradas", "dataAditivo", observacoes, "criadoPor", "criadoPorUserId")
          VALUES (${input.companyId}, ${input.contractId}, ${contrato.employeeId}, ${nextNum}, ${input.clausulasAlteradas}, ${input.dataAditivo}, ${input.observacoes ?? null}, ${criadoPor}, ${(ctx.user as any)?.id ?? null})
          RETURNING id
        `);
        return { id: (result.rows[0] as any).id, numeroAditivo: nextNum };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        companyId: z.number(),
        clausulasAlteradas: z.string(),
        dataAditivo: z.string(),
        observacoes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        await db.execute(sql`
          UPDATE pj_contract_aditivos
             SET "clausulasAlteradas" = ${input.clausulasAlteradas},
                 "dataAditivo"        = ${input.dataAditivo},
                 observacoes          = ${input.observacoes ?? null}
           WHERE id = ${input.id} AND "companyId" = ${input.companyId}
        `);
        return { ok: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number(), companyId: z.number() }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        await db.execute(sql`
          DELETE FROM pj_contract_aditivos WHERE id = ${input.id} AND "companyId" = ${input.companyId}
        `);
        return { ok: true };
      }),
  }),
});
