import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { asos, atestados, trainings, warnings, employees, timeRecords, payroll, epiDeliveries, epis, vrBenefits, advances, obraHorasRateio, obras, documentTemplates, extraPayments, employeeHistory, accidents, processosTrabalhistas, processosAndamentos, jobFunctions, terminationNotices, vacationPeriods, cipaMeetings, cipaMembers, cipaElections, pjContracts, pjPayments, epiDiscountAlerts } from "../../drizzle/schema";
import { eq, and, desc, sql, ne, isNull } from "drizzle-orm";
import { storagePut } from "../storage";

// Modelos de advertência padrão CLT
const MODELOS_ADVERTENCIA = {
  Verbal: {
    titulo: "Advertência Verbal",
    texto: `ADVERTÊNCIA VERBAL\n\nPelo presente instrumento, a empresa [EMPRESA], inscrita no CNPJ sob o nº [CNPJ], vem por meio deste ADVERTIR VERBALMENTE o(a) colaborador(a) [FUNCIONARIO], portador(a) do CPF nº [CPF], ocupante do cargo de [CARGO], lotado(a) no setor [SETOR], pelo seguinte motivo:\n\n[MOTIVO]\n\nOcorrido em [DATA_OCORRENCIA].\n\nEsclarecemos que a presente advertência tem caráter educativo e visa orientar o(a) colaborador(a) sobre a conduta esperada, conforme previsto no Art. 482 da CLT e no regulamento interno da empresa.\n\nA reincidência poderá acarretar a aplicação de penalidades mais severas, incluindo advertência por escrito, suspensão disciplinar e, em último caso, rescisão do contrato de trabalho por justa causa.\n\n[CIDADE], [DATA]\n\n\n_______________________________\nEmpregador/Representante Legal\n\n\n_______________________________\nColaborador(a)\n\n\n_______________________________\nTestemunha 1\n\n\n_______________________________\nTestemunha 2`
  },
  Escrita: {
    titulo: "Advertência por Escrito",
    texto: `ADVERTÊNCIA POR ESCRITO\n\nPelo presente instrumento, a empresa [EMPRESA], inscrita no CNPJ sob o nº [CNPJ], vem por meio deste ADVERTIR POR ESCRITO o(a) colaborador(a) [FUNCIONARIO], portador(a) do CPF nº [CPF], ocupante do cargo de [CARGO], lotado(a) no setor [SETOR], pelo seguinte motivo:\n\n[MOTIVO]\n\nOcorrido em [DATA_OCORRENCIA].\n\nRegistramos que o(a) colaborador(a) já foi advertido(a) verbalmente em [DATA_ADV_ANTERIOR] pelo mesmo tipo de infração, conforme Art. 482 da CLT.\n\nA presente advertência por escrito constitui a segunda medida disciplinar aplicada. A reincidência poderá acarretar suspensão disciplinar de até 3 (três) dias, conforme previsto na legislação trabalhista vigente, e em caso de persistência, rescisão do contrato de trabalho por justa causa.\n\nO(A) colaborador(a) declara estar ciente desta advertência e compromete-se a adequar sua conduta.\n\n[CIDADE], [DATA]\n\n\n_______________________________\nEmpregador/Representante Legal\n\n\n_______________________________\nColaborador(a)\n\n\n_______________________________\nTestemunha 1\n\n\n_______________________________\nTestemunha 2`
  },
  Suspensao: {
    titulo: "Suspensão Disciplinar",
    texto: `SUSPENSÃO DISCIPLINAR\n\nPelo presente instrumento, a empresa [EMPRESA], inscrita no CNPJ sob o nº [CNPJ], vem por meio deste SUSPENDER o(a) colaborador(a) [FUNCIONARIO], portador(a) do CPF nº [CPF], ocupante do cargo de [CARGO], lotado(a) no setor [SETOR], pelo período de [DIAS_SUSPENSAO] dia(s), a contar de [DATA_INICIO] até [DATA_FIM], pelo seguinte motivo:\n\n[MOTIVO]\n\nOcorrido em [DATA_OCORRENCIA].\n\nRegistramos que o(a) colaborador(a) já recebeu as seguintes medidas disciplinares anteriores:\n- Advertência Verbal em [DATA_ADV_VERBAL]\n- Advertência por Escrito em [DATA_ADV_ESCRITA]\n\nA presente suspensão é aplicada com fundamento no Art. 474 da CLT, que limita a suspensão disciplinar a no máximo 30 (trinta) dias consecutivos. Durante o período de suspensão, o(a) colaborador(a) não deverá comparecer ao local de trabalho e terá os dias descontados de sua remuneração.\n\nAdvertimos que a reincidência em qualquer falta disciplinar poderá ensejar a rescisão do contrato de trabalho por justa causa, nos termos do Art. 482 da CLT.\n\n[CIDADE], [DATA]\n\n\n_______________________________\nEmpregador/Representante Legal\n\n\n_______________________________\nColaborador(a)\n\n\n_______________________________\nTestemunha 1\n\n\n_______________________________\nTestemunha 2`
  },
  JustaCausa: {
    titulo: "Rescisão por Justa Causa",
    texto: `RESCISÃO DO CONTRATO DE TRABALHO POR JUSTA CAUSA\n\nPelo presente instrumento, a empresa [EMPRESA], inscrita no CNPJ sob o nº [CNPJ], vem por meio deste COMUNICAR a rescisão do contrato de trabalho por JUSTA CAUSA do(a) colaborador(a) [FUNCIONARIO], portador(a) do CPF nº [CPF], ocupante do cargo de [CARGO], lotado(a) no setor [SETOR], com fundamento no Art. 482, alínea(s) [ALINEA] da Consolidação das Leis do Trabalho (CLT), pelo seguinte motivo:\n\n[MOTIVO]\n\nOcorrido em [DATA_OCORRENCIA].\n\nHistórico disciplinar do(a) colaborador(a):\n- Advertência Verbal em [DATA_ADV_VERBAL]\n- Advertência por Escrito em [DATA_ADV_ESCRITA]\n- Suspensão Disciplinar em [DATA_SUSPENSAO]\n\nApós esgotadas todas as medidas socioeducativas e disciplinares previstas, e diante da reincidência e/ou gravidade da falta cometida, a empresa não encontra outra alternativa senão a aplicação da penalidade máxima.\n\nO(A) colaborador(a) deverá comparecer ao Departamento Pessoal para as providências de rescisão contratual.\n\n[CIDADE], [DATA]\n\n\n_______________________________\nEmpregador/Representante Legal\n\n\n_______________________________\nColaborador(a)\n\n\n_______________________________\nTestemunha 1\n\n\n_______________________________\nTestemunha 2`
  }
};

// Modelo padrão do Contrato PJ (baseado no modelo fornecido pelo cliente)
// Placeholders: [CONTRATANTE_NOME], [CONTRATANTE_CNPJ], [CONTRATANTE_ENDERECO], [CONTRATANTE_CIDADE], [CONTRATANTE_ESTADO], [CONTRATANTE_REPRESENTANTE]
// [CONTRATADA_RAZAO_SOCIAL], [CONTRATADA_CNPJ], [CONTRATADA_ENDERECO], [CONTRATADA_CIDADE], [CONTRATADA_ESTADO]
// [OBJETO_CONTRATO], [VALOR_MENSAL], [VALOR_EXTENSO], [DATA_INICIO], [DATA_FIM], [FORO_COMARCA]
const MODELO_CONTRATO_PJ_DEFAULT = `CONTRATO PARTICULAR DE PRESTAÇÃO DE SERVIÇOS E COMPROMISSO DE CONFIDENCIALIDADE E NÃO CONCORRÊNCIA ENTRE SI

CONTRATANTE: [CONTRATANTE_NOME], inscrita no CNPJ/MF sob n.º [CONTRATANTE_CNPJ], com sede em [CONTRATANTE_CIDADE], Estado de [CONTRATANTE_ESTADO], na [CONTRATANTE_ENDERECO], neste ato representado por seu diretor, [CONTRATANTE_REPRESENTANTE], doravante denominada simplesmente \"CONTRATANTE\".

CONTRATADA: [CONTRATADA_RAZAO_SOCIAL] com sede em [CONTRATADA_CIDADE] no Estado de [CONTRATADA_ESTADO], na [CONTRATADA_ENDERECO], inscrita sob o CNPJ n.º [CONTRATADA_CNPJ], neste ato representado na forma de seu CNPJ, doravante denominada simplesmente \"CONTRATADA\".

CONSIDERANDO QUE:

(I) A CONTRATADA apresenta a necessária qualificação e o \"know-how\" adequado para prestar serviços almejados pela CONTRATANTE;

(II) a CONTRATANTE tem interesse em contratar a CONTRATADA para a prestação do serviço relacionado a [OBJETO_CONTRATO], exclusivamente;

RESOLVEM as partes celebrar o presente Contrato de Prestação de Serviços, de acordo com as cláusulas e condições seguintes:

CLÁUSULA PRIMEIRA: DO OBJETO

1.1 Pelo presente instrumento, a CONTRATADA obriga-se ao fornecimento dos serviços: Mão de obra especializada na elaboração de serviço relacionado ao setor de [OBJETO_CONTRATO], não ocorrendo autoria em projetos.

CLÁUSULA SEGUNDA: CONDIÇÕES GERAIS DO CONTRATO

2.1 Os serviços contratados serão executados mediante solicitação da CONTRATANTE à CONTRATADA, que a partir desta solicitação deverá executar os serviços em conformidade com as normas e condições estabelecidas no presente contrato.

2.2 Os serviços contratados serão prestados com orientação e responsabilidade técnica da CONTRATADA, preferencialmente no estabelecimento da CONTRATANTE, de conformidade com os cronogramas de execução dos serviços, estabelecido de comum acordo entre as partes contratantes, devendo sempre ser respeitado e priorizado as necessidades da CONTRATANTE.

2.3 A CONTRATANTE, durante a vigência do presente contrato e quando o serviço for executado no seu estabelecimento, permitirá que a CONTRATADA se utilize de suas instalações e de todos os seus equipamentos e maquinários necessários à execução dos serviços ora contratados.

Parágrafo Único \u2013 Ocorrendo esta hipótese, a CONTRATADA ficará responsável pelo bom uso dos equipamentos cedidos para a execução dos serviços, bem como pelos eventuais danos causados aos equipamentos da CONTRATANTE.

CLÁUSULA TERCEIRA: DO COMPROMISSO DE CONFIDENCIALIDADE E NÃO CONCORRÊNCIA ENTRE SI

3.1 A CONTRATADA, durante a vigência do presente contrato e nos 03 (três) anos subsequentes ao seu término ou rescisão, obriga-se a manter confidencialidade das informações e Segredos Comerciais que significam, sem qualquer limitação, as invenções, segredos de profissão e dados comerciais, cadastro de clientes, lista de vendas, malas direta, informações técnicas, \"Know-how\", projetos, especificações, patentes, plantas de qualquer espécie, \"blue-prints\", utensílios e equipamentos, suas partes, peças e componentes, desenhos, amostras, métodos, técnicas, informações de pesquisa e desenvolvimento, manuais de qualquer espécie, \"software\", procedimentos operacionais, códigos-fonte, rotinas, programas de computação e processamento de dados, métodos, processos e procedimentos de fabricação e manutenção, conhecimentos tecnológicos específicos, desenvolvimentos anteriores, bem como toda e qualquer informação oral ou escrita, de qualquer espécie, de propriedade da CONTRATANTE, que cheguem, legítima ou ilegitimamente, ao conhecimento da outra parte, a seus prepostos ou funcionários.

3.2 A CONTRATANTE e a CONTRATADA ajustam entre si que todos os Segredos Comerciais e Industriais de cada parte são de propriedade da mesma e só poderão ser utilizados pela outra parte exclusivamente para os fins previstos neste contrato. Cada parte obriga-se a não divulgar, propagar, reproduzir, explorar, publicar, duplicar, transferir ou revelar, direta ou indiretamente, por si ou através de terceiros, quaisquer Segredos Comerciais e Industriais sem a prévia e expressa autorização, por escrito da parte interessada, conforme o previsto no art. 195, incisos III, XI e XII da Lei 9.279/96 e também da incidência de outros dispositivos legais que protegem a propriedade industrial e vedam a concorrência desleal.

3.3 Nesse sentido, sendo a CONTRATANTE criadora do projeto ou titular dos direitos patrimoniais do mesmo, conforme proteção de seus Direitos Autorais por tal criação salvaguardados na Lei 9610/98, bem como na Lei 9279/96 que regula a Propriedade Industrial, esta cuidará exclusivamente de todo o processo de registro do projeto, nos órgãos especializados, sendo a CONTRATADA mera executora do projeto.

3.4 As partes CONTRATADA e CONTRATANTE convencionam que toda inteligência desenvolvida durante a vigência do presente contrato pertence a parte CONTRATANTE, sendo certo que ao término do presente contrato, não poderá a parte CONTRATADA utilizar as informações, projetos, ferramentas de trabalho e ou qualquer outro produto desenvolvido ao longo do presente instrumento.

3.5 Durante a vigência do presente Contrato e após o encerramento e, pelo período de 03 (três) anos subsequentes, a CONTRATADA se compromete a não fazer concorrência com os clientes da CONTRATANTE.

3.6 Será compreendido como concorrência, apta a ensejar a rescisão do presente contrato com e ou as penalidades cabíveis:
a) Angariar clientes da CONTRATANTE através da prestação de serviços do presente contrato;
b) Disputar clientes no mesmo mercado da CONTRATANTE (construção civil, projetos, arquitetura etc.), sobretudo através de marketing de qualquer natureza.

3.7 A CONTRATADA não poderá ser admitida pelos clientes e seus concorrentes, até 06 (seis) meses após a rescisão com a CONTRATANTE.

3.8 Fica mutuamente pactuado entre as partes contratantes, que não poderá a CONTRATADA divulgar ou apresentar qualquer projeto ou trabalho desenvolvido por força do presente contrato como se fosse seu, seja pessoalmente, seja através de marketing de qualquer natureza, sobretudo com publicações e \"posts\" através de redes sociais ou qualquer outro veículo de comunicação.

Parágrafo Único \u2013 A inobservância do disposto na presente cláusula, sujeitará a CONTRATADA as penalidades decorrentes da violação do compromisso de confidencialidade, quebra de sigilo e não concorrência entre si, apurados na multa de R$ 100.000,00 (Cem mil reais), bem como, arcará com o pagamento de eventuais perdas e danos, mais prejuízos de demais indenizações decorrentes do seu ato, apurado em processo judicial competente para esta finalidade.

CLÁUSULA QUARTA: PRAZO E FORMA DE EXECUÇÃO

4.1 O contrato tem validade de 1 (um) ano e terá início a partir do dia [DATA_INICIO], nas seguintes condições:
a) O presente contrato poderá ser rescindido pela CONTRATANTE, a qualquer momento, desde que haja comprovação de quebra de quaisquer cláusulas deste contrato por parte da CONTRATADA;
b) A rescisão contratual a que se refere o item \"a\" da cláusula 4.1 não ensejará a parte CONTRATANTE o pagamento de qualquer multa, com o que concorda expressamente a parte CONTRATADA;
c) O presente contrato poderá ser rescindido por qualquer uma das partes, a qualquer momento, sem multas contratuais.

4.2 Toda e qualquer alteração do objeto do presente Contrato necessitará da concordância prévia e expressa da CONTRATADA e da CONTRATANTE e será feito mediante Aditivo Contratual.

CLÁUSULA QUINTA: OBRIGAÇÕES DAS PARTES

5.1 OBRIGAÇÕES DA CONTRATADA - Além das demais obrigações que lhe são impostas nos termos do presente instrumento caberão, ainda, à CONTRATADA:
a) Realizar suas atividades com profissionalismo, cabendo-lhe total e exclusiva responsabilidade pelo integral atendimento de toda a legislação;
b) Respeitar e seguir integralmente as normas e procedimentos internos da empresa, bem como facilitar a ação fiscalizadora da CONTRATANTE quanto à execução dos serviços;
c) Responder pela guarda e conservação de quaisquer equipamentos, materiais ou documentos e informações sigilosas de propriedade da CONTRATANTE, que lhes forem entregues durante a execução dos serviços contratados;
d) Realizar suas atividades utilizando os equipamentos de proteção individual (EPIs) necessários à sua segurança, de acordo com o exigido nas Normas relativas à Segurança, Higiene e Medicina do Trabalho, previsto na legislação em vigor;
e) Cumprir a prestação de serviço no horário de funcionamento da empresa CONTRATANTE;
f) Apresentar mensalmente os comprovantes de Recolhimento de DAS (MEI);
g) Assinar mensalmente recibos que comprovem o pagamento da prestação de serviço;
h) Apresentar apólice de seguro de vida individual com coberturas compatíveis a atividade desenvolvida;
i) Emitir Nota Fiscal de Prestação de Serviços no valor encaminhado pela CONTRATANTE.

5.2 OBRIGAÇÕES DA CONTRATANTE - Caberá à CONTRATANTE:
a) Disponibilizar todo o recurso financeiro conforme cláusula 6.1 para a execução dos serviços necessários;
b) Fornecer de todos os materiais, equipamentos e informações necessários para a execução dos serviços;
c) Fornecer todos os equipamentos de proteção individual (EPI'S) necessários à segurança do trabalho, de acordo com o exigido nas normas relativas à Segurança, Higiene e Medicina do Trabalho previsto na legislação em vigor e uniforme no padrão da CONTRATANTE, devidamente identificado;
d) Gerenciar e coordenar a interdependência de todos os trabalhos que serão desenvolvidos nas áreas em que atuará a CONTRATADA.

CLÁUSULA SEXTA: PREÇOS E FORMA DE PAGAMENTO

6.1 PREÇOS \u2013 Pela prestação dos serviços definidos neste Contrato, a CONTRATANTE pagará à CONTRATADA o preço certo e ajustado de R$ [VALOR_MENSAL] ([VALOR_EXTENSO]), pagos mensalmente, mediante emissão de nota fiscal.

Parágrafo Único \u2013 Sobre quaisquer hipóteses não poderá a contratada divulgar seus dividendos a terceiros.

6.2 FATURAMENTO E PAGAMENTO:
a) Pagamento realizado na proporção de 40% no dia 20 e 60% do pagamento no 5º dia útil do mês subsequente.

CLÁUSULA SÉTIMA: LIMITE DE RESPONSABILIDADE

7.1 Fica o CONTRATANTE responsável pela entrega das informações para a execução dos serviços à CONTRATADA e o CONTRATANTE assume solidariamente com a CONTRATADA a responsabilidade por eventuais prejuízos causados nas funcionalidades dos projetos desde que a CONTRATADA tenha atuado de forma direta e tenha incorrido em culpa, sendo responsável pelo pagamento de até 50% (cinquenta por cento) dos prejuízos causados na execução da obra.

7.2 Na ocorrência de qualquer fato comprovado que impeça definitivamente a prestação dos serviços, mas sem culpa das partes, fica o presente contrato rescindido de pleno direito, devendo cada qual suportar o ônus que isso representar, não incidindo nas penalidades previstas.

7.3 Havendo qualquer fato justificável que atrase a prestação de serviços não poderá ser invocado, por qualquer das partes, para rescisão do presente contrato nem incidência da multa ou penalidades previstas.

7.4 Se for constatada situação de falência ou concordata, de qualquer das partes, ter-se-á a rescisão do presente contrato, independente de notificação judicial ou extrajudicial.

Parágrafo Único \u2013 Fica a critério da CONTRATANTE descontar ou não o valor integral (até 50%) ou parcial dos prejuízos causados, conforme previsto na cláusula 7.1.

CLÁUSULA OITAVA: VÍNCULO EMPREGATÍCIO

8.1 Fica estabelecido que, por força deste contrato, não se estabelece nenhum vínculo empregatício entre as partes na forma do artigo 3º da Consolidação das Leis do Trabalho, não estando a CONTRATANTE e os funcionários da CONTRATADA, se houver, sujeitos aos requisitos empregatícios de continuidade, subordinação, onerosidade e pessoalidade com a CONTRATANTE, bem como é de responsabilidade exclusiva da CONTRATADA os direitos trabalhistas e previdenciários que esta empregar direta ou indiretamente para a execução dos serviços.

CLÁUSULA NONA: DEMAIS DISPOSIÇÕES

9.1 O presente instrumento não implica em qualquer vínculo de solidariedade entre as partes, ficando cada qual responsável pelas obrigações derivadas de suas respectivas atividades, sejam elas de caráter fiscal, trabalhista, previdenciário ou acidentário, sem exclusão de qualquer outra, declarando as mesmas não existir qualquer tipo de vínculo societário, trabalhista, fiscal ou previdenciário entre si, assim como relação de emprego com sócios ou prepostos da CONTRATADA.

9.2 Não haverá responsabilidade solidária ou subsidiária da CONTRATANTE com nenhuma questão relativa ao presente contrato especialmente relacionada com a mão-de-obra utilizada pela CONTRATADA na execução dos serviços, objeto do presente contrato.

9.3 Qualquer tolerância de uma das partes em relação ao não cumprimento das obrigações e deveres neste instrumento assumidos, não importará em novação quanto aos seus termos, condições ou prazos, não devendo, portanto, sob quaisquer hipóteses, ser interpretada como renúncia ou desistência do cumprimento dos dispositivos do presente em seus estritos termos.

9.4 Sob quaisquer hipóteses não poderá a CONTRATADA transferir este contrato ou as obrigações por ela assumidas a outrem nem mesmo fazer substituir-se sem prévio consentimento da CONTRATANTE que poderá dá-lo ou não a seu exclusivo critério, sob pena de rescisão contratual e medidas cabíveis para cobrança de danos e prejuízos apurados.

9.5 A CONTRATADA somente poderá executar serviços adicionais mediante prévia autorização por escrito da CONTRATANTE e por meio do respectivo termo de aditamento contratual.

9.6 A contratação da presente prestação de serviços pela CONTRATADA a CONTRATANTE se dá sob a égide do disposto no artigo 593 e seguintes do Código Civil Brasileiro, não configurando, em nenhuma hipótese, relação empregatícia como disposto na cláusula 8.1.

9.7 O presente contrato encerra todas as tratativas entre CONTRATANTE e CONTRATADA, não sendo admitido, pois, qualquer tipo de reivindicação quanto ao que aqui não esteja expressamente previsto e contratado.

9.8 Fica a parte CONTRATADA e seus SÓCIOS responsáveis pelo cumprimento do presente instrumento, sendo certo que caso haja o descumprimento de quaisquer das cláusulas dispostas, inclusive pelos prepostos da CONTRATADA, ficará a CONTRATADA e seus SÓCIOS responsáveis de forma SOLIDÁRIA pelas obrigações do presente contrato, podendo os sócios serem incluídos no polo passivo de eventual demanda, independente de instauração de incidente de desconsideração da personalidade jurídica.

CLÁUSULA DÉCIMA: DO FORO

As partes elegem o foro da Comarca de [FORO_COMARCA], como único competente para dirimir as questões que porventura surgirem na execução do presente contrato, com renúncia a qualquer outro, por mais privilegiado que seja.

E, por estarem justas e contratadas, assinam as partes, depois de lido e achado conforme, o presente Contrato, em 02 (duas) vias de igual teor, para sua validade e eficácia jurídicas.

[CONTRATANTE_CIDADE], [DATA_INICIO]

CONTRATANTE:
_____________________________
[CONTRATANTE_NOME]

CONTRATADA:
_____________________________
[CONTRATADA_RAZAO_SOCIAL]

TESTEMUNHAS:
___________________________ ___________________________
Nome:                       Nome:
RG:                         RG:`;

// Helper: calcular status do ASO baseado na data de validade
function calcularStatusASO(dataValidade: string): { status: string; diasRestantes: number } {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const validade = new Date(dataValidade + "T00:00:00");
  const diffMs = validade.getTime() - hoje.getTime();
  const diasRestantes = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diasRestantes < 0) return { status: "VENCIDO", diasRestantes };
  if (diasRestantes <= 7) return { status: `${diasRestantes} DIAS PARA VENCER`, diasRestantes };
  if (diasRestantes <= 30) return { status: `${diasRestantes} DIAS PARA VENCER`, diasRestantes };
  return { status: "VÁLIDO", diasRestantes };
}

export const controleDocumentosRouter = router({
  // ===================== ASO =====================
  asos: router({
    list: protectedProcedure
      .input(z.object({ companyId: z.number() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const rows = await db
          .select({
            id: asos.id,
            companyId: asos.companyId,
            employeeId: asos.employeeId,
            nomeCompleto: employees.nomeCompleto,
            cpf: employees.cpf,
            funcao: employees.funcao,
            tipo: asos.tipo,
            dataExame: asos.dataExame,
            dataValidade: asos.dataValidade,
            validadeDias: asos.validadeDias,
            resultado: asos.resultado,
            medico: asos.medico,
            crm: asos.crm,
            examesRealizados: asos.examesRealizados,
            jaAtualizou: asos.jaAtualizou,
            clinica: asos.clinica,
            observacoes: asos.observacoes,
            documentoUrl: asos.documentoUrl,
            createdAt: asos.createdAt,
          })
          .from(asos)
          .innerJoin(employees, eq(asos.employeeId, employees.id))
          .where(and(eq(asos.companyId, input.companyId), isNull(employees.deletedAt), isNull(asos.deletedAt)))
          .orderBy(employees.nomeCompleto);

        return rows.map((r: any) => ({
          ...r,
          ...calcularStatusASO(r.dataValidade),
        }));
      }),

    create: protectedProcedure
      .input(
        z.object({
          companyId: z.number(),
          employeeId: z.number(),
          tipo: z.enum(["Admissional", "Periodico", "Retorno", "Mudanca_Funcao", "Demissional"]),
          dataExame: z.string(),
          validadeDias: z.number().default(365),
          resultado: z.enum(["Apto", "Inapto", "Apto_Restricao"]).default("Apto"),
          medico: z.string().optional(),
          crm: z.string().optional(),
          examesRealizados: z.string().optional(),
          clinica: z.string().optional(),
          observacoes: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        const dataExame = new Date(input.dataExame);
        const dataValidade = new Date(dataExame);
        dataValidade.setDate(dataValidade.getDate() + input.validadeDias);
        const dataValidadeStr = dataValidade.toISOString().split("T")[0];

        await db.insert(asos).values({
          companyId: input.companyId,
          employeeId: input.employeeId,
          tipo: input.tipo,
          dataExame: input.dataExame,
          dataValidade: dataValidadeStr,
          validadeDias: input.validadeDias,
          resultado: input.resultado,
          medico: input.medico || null,
          crm: input.crm || null,
          examesRealizados: input.examesRealizados || null,
          clinica: input.clinica || null,
          observacoes: input.observacoes || null,
        });
        return { success: true };
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          tipo: z.enum(["Admissional", "Periodico", "Retorno", "Mudanca_Funcao", "Demissional"]).optional(),
          dataExame: z.string().optional(),
          validadeDias: z.number().optional(),
          resultado: z.enum(["Apto", "Inapto", "Apto_Restricao"]).optional(),
          medico: z.string().optional(),
          crm: z.string().optional(),
          examesRealizados: z.string().optional(),
          clinica: z.string().optional(),
          observacoes: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        const { id, dataExame, validadeDias, ...rest } = input;
        const updateData: any = { ...rest };

        if (dataExame) updateData.dataExame = dataExame;
        if (dataExame && validadeDias) {
          const d = new Date(dataExame);
          d.setDate(d.getDate() + validadeDias);
          updateData.dataValidade = d.toISOString().split("T")[0];
          updateData.validadeDias = validadeDias;
        } else if (validadeDias) {
          updateData.validadeDias = validadeDias;
        }

        await db.update(asos).set(updateData).where(eq(asos.id, id));
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        await db.update(asos).set({ deletedAt: sql`NOW()`, deletedBy: ctx.user.name ?? 'Sistema', deletedByUserId: ctx.user.id } as any).where(eq(asos.id, input.id));
        return { success: true };
      }),
    uploadDoc: protectedProcedure
      .input(z.object({ id: z.number(), fileBase64: z.string(), fileName: z.string() }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        const buffer = Buffer.from(input.fileBase64, "base64");
        const ext = input.fileName.split(".").pop() || "pdf";
        const key = `documentos/asos/${input.id}-${Date.now()}.${ext}`;
        const { url } = await storagePut(key, buffer, ext === "pdf" ? "application/pdf" : "application/octet-stream");
        await db.update(asos).set({ documentoUrl: url }).where(eq(asos.id, input.id));
        return { url };
      }),

    importBatch: protectedProcedure
      .input(
        z.object({
          companyId: z.number(),
          records: z.array(
            z.object({
              employeeName: z.string(),
              tipo: z.string(),
              dataExame: z.string(),
              validadeDias: z.number().default(365),
              resultado: z.string().default("Apto"),
              medico: z.string().optional(),
              crm: z.string().optional(),
              examesRealizados: z.string().optional(),
              jaAtualizou: z.boolean().optional(),
            })
          ),
        })
      )
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        // Buscar todos os funcionários da empresa
        const emps = await db
          .select({ id: employees.id, nomeCompleto: employees.nomeCompleto })
          .from(employees)
          .where(and(eq(employees.companyId, input.companyId), sql`${employees.deletedAt} IS NULL`));

        const nameMap = new Map<string, number>();
        emps.forEach((e: any) => {
          if (e.nomeCompleto) nameMap.set(e.nomeCompleto.toUpperCase().trim(), e.id);
        });

        let imported = 0;
        let notFound = 0;
        const errors: string[] = [];

        for (const rec of input.records) {
          const empName = rec.employeeName.toUpperCase().trim();
          let empId = nameMap.get(empName);

          // Fuzzy match se não encontrou exato
          if (!empId) {
            const entries = Array.from(nameMap.entries());
            for (const [name, id] of entries) {
              if (name.includes(empName) || empName.includes(name)) {
                empId = id;
                break;
              }
              // Match por primeiro e último nome
              const parts = empName.split(" ");
              if (parts.length >= 2) {
                const first = parts[0];
                const last = parts[parts.length - 1];
                if (name.startsWith(first) && name.endsWith(last)) {
                  empId = id;
                  break;
                }
              }
            }
          }

          if (!empId) {
            notFound++;
            errors.push(`Funcionário não encontrado: ${rec.employeeName}`);
            continue;
          }

          // Mapear tipo
          let tipo: "Admissional" | "Periodico" | "Retorno" | "Mudanca_Funcao" | "Demissional" = "Admissional";
          const tipoUpper = rec.tipo.toUpperCase().trim();
          if (tipoUpper.includes("PERIÓD") || tipoUpper.includes("PERIODIC")) tipo = "Periodico";
          else if (tipoUpper.includes("RETORNO")) tipo = "Retorno";
          else if (tipoUpper.includes("MUDANÇA") || tipoUpper.includes("MUDANCA") || tipoUpper.includes("FUNÇÃO")) tipo = "Mudanca_Funcao";
          else if (tipoUpper.includes("DEMISSION") || tipoUpper.includes("DEMISSIONAL")) tipo = "Demissional";

          // Mapear resultado
          let resultado: "Apto" | "Inapto" | "Apto_Restricao" = "Apto";
          if (rec.resultado.toUpperCase().includes("INAPTO")) resultado = "Inapto";
          else if (rec.resultado.toUpperCase().includes("RESTR")) resultado = "Apto_Restricao";

          // Calcular data de validade
          const dataExame = rec.dataExame;
          const d = new Date(dataExame);
          d.setDate(d.getDate() + rec.validadeDias);
          const dataValidade = d.toISOString().split("T")[0];

          try {
            await db.insert(asos).values({
              companyId: input.companyId,
              employeeId: empId,
              tipo,
              dataExame,
              dataValidade,
              validadeDias: rec.validadeDias,
              resultado,
              medico: rec.medico || null,
              crm: rec.crm || null,
              examesRealizados: rec.examesRealizados || null,
              jaAtualizou: rec.jaAtualizou ? 1 : 0,
            });
            imported++;
          } catch (e: any) {
            errors.push(`Erro ao importar ${rec.employeeName}: ${e.message}`);
          }
        }

        return { imported, notFound, errors };
      }),
  }),

  // ===================== ATESTADOS =====================
  atestados: router({
    list: protectedProcedure
      .input(z.object({ companyId: z.number() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        return db
          .select({
            id: atestados.id,
            companyId: atestados.companyId,
            employeeId: atestados.employeeId,
            nomeCompleto: employees.nomeCompleto,
            cpf: employees.cpf,
            funcao: employees.funcao,
            tipo: atestados.tipo,
            dataEmissao: atestados.dataEmissao,
            diasAfastamento: atestados.diasAfastamento,
            dataRetorno: atestados.dataRetorno,
            cid: atestados.cid,
            medico: atestados.medico,
            crm: atestados.crm,
            descricao: atestados.descricao,
            documentoUrl: atestados.documentoUrl,
            motivo: atestados.motivo,
            motivoOutro: atestados.motivoOutro,
          })
          .from(atestados)
          .innerJoin(employees, eq(atestados.employeeId, employees.id))
          .where(and(eq(atestados.companyId, input.companyId), isNull(employees.deletedAt), isNull(atestados.deletedAt)))
          .orderBy(desc(atestados.dataEmissao));
      }),

    create: protectedProcedure
      .input(
        z.object({
          companyId: z.number(),
          employeeId: z.number(),
          tipo: z.string(),
          dataEmissao: z.string(),
          diasAfastamento: z.number().default(0),
          dataRetorno: z.string().optional(),
          cid: z.string().optional(),
          medico: z.string().optional(),
          crm: z.string().optional(),
          descricao: z.string().optional(),
          motivo: z.string().optional(),
          motivoOutro: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        await db.insert(atestados).values({
          companyId: input.companyId,
          employeeId: input.employeeId,
          tipo: input.tipo,
          dataEmissao: input.dataEmissao,
          diasAfastamento: input.diasAfastamento,
          dataRetorno: input.dataRetorno || null,
          cid: input.cid || null,
          medico: input.medico || null,
          crm: input.crm || null,
          descricao: input.descricao || null,
          motivo: input.motivo || null,
          motivoOutro: input.motivoOutro || null,
        });
        return { success: true };
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          employeeId: z.number().optional(),
          tipo: z.string().optional(),
          dataEmissao: z.string().optional(),
          diasAfastamento: z.number().optional(),
          dataRetorno: z.string().optional(),
          cid: z.string().optional(),
          medico: z.string().optional(),
          crm: z.string().optional(),
          descricao: z.string().optional(),
          motivo: z.string().optional(),
          motivoOutro: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        const { id, ...rest } = input;
        const updateData: any = {};
        Object.entries(rest).forEach(([k, v]) => { if (v !== undefined) updateData[k] = v; });
        await db.update(atestados).set(updateData).where(eq(atestados.id, id));
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        await db.update(atestados).set({ deletedAt: sql`NOW()`, deletedBy: ctx.user.name ?? 'Sistema', deletedByUserId: ctx.user.id } as any).where(eq(atestados.id, input.id));
        return { success: true };
      }),
    uploadDoc: protectedProcedure
      .input(z.object({ id: z.number(), fileBase64: z.string(), fileName: z.string() }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        const buffer = Buffer.from(input.fileBase64, "base64");
        const ext = input.fileName.split(".").pop() || "pdf";
        const key = `documentos/atestados/${input.id}-${Date.now()}.${ext}`;
        const { url } = await storagePut(key, buffer, ext === "pdf" ? "application/pdf" : "application/octet-stream");
        await db.update(atestados).set({ documentoUrl: url }).where(eq(atestados.id, input.id));
        return { url };
      }),
  }),

  // ===================== TREINAMENTOS =====================
  treinamentos: router({
    list: protectedProcedure
      .input(z.object({ companyId: z.number() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const rows = await db
          .select({
            id: trainings.id,
            companyId: trainings.companyId,
            employeeId: trainings.employeeId,
            nomeCompleto: employees.nomeCompleto,
            cpf: employees.cpf,
            funcao: employees.funcao,
            nome: trainings.nome,
            norma: trainings.norma,
            cargaHoraria: trainings.cargaHoraria,
            dataRealizacao: trainings.dataRealizacao,
            dataValidade: trainings.dataValidade,
            instrutor: trainings.instrutor,
            entidade: trainings.entidade,
            certificadoUrl: trainings.certificadoUrl,
            statusTreinamento: trainings.statusTreinamento,
            observacoes: trainings.observacoes,
          })
          .from(trainings)
          .innerJoin(employees, eq(trainings.employeeId, employees.id))
          .where(and(eq(trainings.companyId, input.companyId), isNull(employees.deletedAt), isNull(trainings.deletedAt)))
          .orderBy(desc(trainings.dataRealizacao));

        return rows.map((r: any) => {
          if (r.dataValidade) {
            const { status, diasRestantes } = calcularStatusASO(r.dataValidade);
            return { ...r, statusCalculado: status, diasRestantes };
          }
          return { ...r, statusCalculado: "SEM VALIDADE", diasRestantes: 0 };
        });
      }),

    create: protectedProcedure
      .input(
        z.object({
          companyId: z.number(),
          employeeId: z.number(),
          nome: z.string(),
          norma: z.string().optional(),
          cargaHoraria: z.string().optional(),
          dataRealizacao: z.string(),
          dataValidade: z.string().optional(),
          instrutor: z.string().optional(),
          entidade: z.string().optional(),
          observacoes: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        let statusTreinamento: "Valido" | "Vencido" | "A_Vencer" = "Valido";
        if (input.dataValidade) {
          const { diasRestantes } = calcularStatusASO(input.dataValidade);
          if (diasRestantes < 0) statusTreinamento = "Vencido";
          else if (diasRestantes <= 30) statusTreinamento = "A_Vencer";
        }

        await db.insert(trainings).values({
          companyId: input.companyId,
          employeeId: input.employeeId,
          nome: input.nome,
          norma: input.norma || null,
          cargaHoraria: input.cargaHoraria || null,
          dataRealizacao: input.dataRealizacao,
          dataValidade: input.dataValidade || null,
          instrutor: input.instrutor || null,
          entidade: input.entidade || null,
          statusTreinamento,
          observacoes: input.observacoes || null,
        });
        return { success: true };
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          employeeId: z.number().optional(),
          nome: z.string().optional(),
          norma: z.string().optional(),
          cargaHoraria: z.string().optional(),
          dataRealizacao: z.string().optional(),
          dataValidade: z.string().optional(),
          instrutor: z.string().optional(),
          entidade: z.string().optional(),
          observacoes: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        const { id, ...rest } = input;
        const updateData: any = {};
        Object.entries(rest).forEach(([k, v]) => { if (v !== undefined) updateData[k] = v; });
        if (updateData.dataValidade) {
          const { diasRestantes } = calcularStatusASO(updateData.dataValidade);
          updateData.statusTreinamento = diasRestantes < 0 ? "Vencido" : diasRestantes <= 30 ? "A_Vencer" : "Valido";
        }
        await db.update(trainings).set(updateData).where(eq(trainings.id, id));
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        await db.update(trainings).set({ deletedAt: sql`NOW()`, deletedBy: ctx.user.name ?? 'Sistema', deletedByUserId: ctx.user.id } as any).where(eq(trainings.id, input.id));
        return { success: true };
      }),

    uploadDoc: protectedProcedure
      .input(z.object({ id: z.number(), fileBase64: z.string(), fileName: z.string() }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        const buffer = Buffer.from(input.fileBase64, "base64");
        const ext = input.fileName.split(".").pop() || "pdf";
        const key = `documentos/treinamentos/${input.id}-${Date.now()}.${ext}`;
        const { url } = await storagePut(key, buffer, ext === "pdf" ? "application/pdf" : "application/octet-stream");
        await db.update(trainings).set({ certificadoUrl: url }).where(eq(trainings.id, input.id));
        return { url };
      }),
  }),

  // ===================== ADVERTÊNCIAS =====================
  advertencias: router({
    list: protectedProcedure
      .input(z.object({ companyId: z.number() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        return db
          .select({
            id: warnings.id,
            companyId: warnings.companyId,
            employeeId: warnings.employeeId,
            nomeCompleto: employees.nomeCompleto,
            cpf: employees.cpf,
            funcao: employees.funcao,
            setor: employees.setor,
            tipoAdvertencia: warnings.tipoAdvertencia,
            dataOcorrencia: warnings.dataOcorrencia,
            motivo: warnings.motivo,
            descricao: warnings.descricao,
            testemunhas: warnings.testemunhas,
            documentoUrl: warnings.documentoUrl,
            sequencia: warnings.sequencia,
            aplicadoPor: warnings.aplicadoPor,
            diasSuspensao: warnings.diasSuspensao,
            origemModulo: warnings.origemModulo,
          })
          .from(warnings)
          .innerJoin(employees, eq(warnings.employeeId, employees.id))
          .where(and(eq(warnings.companyId, input.companyId), isNull(employees.deletedAt), isNull(warnings.deletedAt)))
          .orderBy(desc(warnings.dataOcorrencia));
      }),

    create: protectedProcedure
      .input(
        z.object({
          companyId: z.number(),
          employeeId: z.number(),
          tipoAdvertencia: z.enum(["Verbal", "Escrita", "Suspensao", "JustaCausa", "OSS"]),
          dataOcorrencia: z.string(),
          motivo: z.string(),
          descricao: z.string().optional(),
          testemunhas: z.string().optional(),
          aplicadoPor: z.string().optional(),
          diasSuspensao: z.number().optional(),
          origemModulo: z.string().optional(),
          origemId: z.number().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        // Calcular sequência automática
        const existentes = await db.select({ id: warnings.id }).from(warnings)
          .where(and(eq(warnings.employeeId, input.employeeId), eq(warnings.companyId, input.companyId), isNull(warnings.deletedAt)));
        const sequencia = existentes.length + 1;
        
        await db.insert(warnings).values({
          companyId: input.companyId,
          employeeId: input.employeeId,
          tipoAdvertencia: input.tipoAdvertencia,
          sequencia,
          dataOcorrencia: input.dataOcorrencia,
          motivo: input.motivo,
          descricao: input.descricao || null,
          testemunhas: input.testemunhas || null,
          aplicadoPor: input.aplicadoPor || null,
          diasSuspensao: input.diasSuspensao || null,
          origemModulo: input.origemModulo || null,
          origemId: input.origemId || null,
        });
        
        // Retornar contagem e alerta
        const totalAdv = sequencia;
        let alerta = null;
        if (totalAdv === 3) alerta = "ATENÇÃO: Esta é a 3ª advertência. O colaborador está apto a receber SUSPENSÃO conforme Art. 474 da CLT.";
        else if (totalAdv > 3) alerta = `ATENÇÃO: Colaborador já possui ${totalAdv} advertências. Avaliar suspensão ou justa causa.`;
        
        return { success: true, sequencia, totalAdvertencias: totalAdv, alerta };
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          employeeId: z.number().optional(),
          tipoAdvertencia: z.enum(["Verbal", "Escrita", "Suspensao", "JustaCausa", "OSS"]).optional(),
          dataOcorrencia: z.string().optional(),
          motivo: z.string().optional(),
          descricao: z.string().optional(),
          testemunhas: z.string().optional(),
          aplicadoPor: z.string().optional(),
          diasSuspensao: z.number().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        const { id, ...rest } = input;
        const updateData: any = {};
        Object.entries(rest).forEach(([k, v]) => { if (v !== undefined) updateData[k] = v; });
        await db.update(warnings).set(updateData).where(eq(warnings.id, id));
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        await db.update(warnings).set({ deletedAt: sql`NOW()`, deletedBy: ctx.user.name ?? 'Sistema', deletedByUserId: ctx.user.id } as any).where(eq(warnings.id, input.id));
        return { success: true };
      }),

    uploadDoc: protectedProcedure
      .input(z.object({ id: z.number(), fileBase64: z.string(), fileName: z.string() }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        const buffer = Buffer.from(input.fileBase64, "base64");
        const ext = input.fileName.split(".").pop() || "pdf";
        const key = `documentos/advertencias/${input.id}-${Date.now()}.${ext}`;
        const { url } = await storagePut(key, buffer, ext === "pdf" ? "application/pdf" : "application/octet-stream");
        await db.update(warnings).set({ documentoUrl: url }).where(eq(warnings.id, input.id));
        return { url };
      }),
  }),

  // ===================== RESUMO GERAL =====================
  resumo: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
        const db = (await getDb())!;
      // Filtrar apenas documentos de funcionários não excluídos (deletedAt IS NULL)
      const [asoCount] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(asos)
        .innerJoin(employees, eq(asos.employeeId, employees.id))
        .where(and(eq(asos.companyId, input.companyId), isNull(employees.deletedAt), isNull(asos.deletedAt)));

      const [treinamentoCount] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(trainings)
        .innerJoin(employees, eq(trainings.employeeId, employees.id))
        .where(and(eq(trainings.companyId, input.companyId), isNull(employees.deletedAt), isNull(trainings.deletedAt)));

      const [atestadoCount] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(atestados)
        .innerJoin(employees, eq(atestados.employeeId, employees.id))
        .where(and(eq(atestados.companyId, input.companyId), isNull(employees.deletedAt), isNull(atestados.deletedAt)));

      const [advertenciaCount] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(warnings)
        .innerJoin(employees, eq(warnings.employeeId, employees.id))
        .where(and(eq(warnings.companyId, input.companyId), isNull(employees.deletedAt), isNull(warnings.deletedAt)));

      // ASOs vencidos
      const hoje = new Date().toISOString().split("T")[0];
      const [asosVencidos] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(asos)
        .innerJoin(employees, eq(asos.employeeId, employees.id))
        .where(and(eq(asos.companyId, input.companyId), isNull(employees.deletedAt), isNull(asos.deletedAt), sql`${asos.dataValidade} < ${hoje}`));

      // ASOs a vencer em 30 dias
      const em30dias = new Date();
      em30dias.setDate(em30dias.getDate() + 30);
      const em30diasStr = em30dias.toISOString().split("T")[0];
      const [asosAVencer] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(asos)
        .innerJoin(employees, eq(asos.employeeId, employees.id))
        .where(
          and(
            eq(asos.companyId, input.companyId),
            isNull(employees.deletedAt),
            isNull(asos.deletedAt),
            sql`${asos.dataValidade} >= ${hoje}`,
            sql`${asos.dataValidade} <= ${em30diasStr}`
          )
        );

      return {
        totalASOs: Number(asoCount.count),
        totalTreinamentos: Number(treinamentoCount.count),
        totalAtestados: Number(atestadoCount.count),
        totalAdvertencias: Number(advertenciaCount.count),
        asosVencidos: Number(asosVencidos.count),
        asosAVencer: Number(asosAVencer.count),
      };
    }),

  // ===================== RAIO-X DO FUNCIONÁRIO =====================
  raioX: protectedProcedure
    .input(z.object({ employeeId: z.number() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      // Dados do funcionário
      const [emp] = await db.select().from(employees).where(eq(employees.id, input.employeeId));
      if (!emp) return null;

      // Descrição da Função (CBO + Descrição + Ordem de Serviço NR-1)
      let funcaoDetalhes: any = null;
      if (emp.funcao) {
        const [jf] = await db.select().from(jobFunctions)
          .where(and(eq(jobFunctions.companyId, emp.companyId), eq(jobFunctions.nome, emp.funcao)))
          .limit(1);
        if (jf) funcaoDetalhes = { nome: jf.nome, cbo: jf.cbo, descricao: jf.descricao, ordemServico: jf.ordemServico };
      }

      // ASOs
      const empAsos = await db.select().from(asos).where(and(eq(asos.employeeId, input.employeeId), isNull(asos.deletedAt))).orderBy(desc(asos.dataExame));
      const asosComStatus = empAsos.map(a => ({ ...a, ...calcularStatusASO(a.dataValidade || "") }));
      // Treinamentos
      const empTreinamentos = await db.select().from(trainings).where(and(eq(trainings.employeeId, input.employeeId), isNull(trainings.deletedAt))).orderBy(desc(trainings.dataRealizacao));
      // Atestados
      const empAtestados = await db.select().from(atestados).where(and(eq(atestados.employeeId, input.employeeId), isNull(atestados.deletedAt))).orderBy(desc(atestados.dataEmissao));
      // Advertências
      const empAdvertencias = await db.select().from(warnings).where(and(eq(warnings.employeeId, input.employeeId), isNull(warnings.deletedAt))).orderBy(desc(warnings.dataOcorrencia));
      // Ponto - TODOS os registros (sem limite)
      const empPonto = await db.select().from(timeRecords).where(eq(timeRecords.employeeId, input.employeeId)).orderBy(desc(timeRecords.data));
      // Folha de pagamento - TODOS os registros
      const empPayroll = await db.select().from(payroll).where(eq(payroll.employeeId, input.employeeId)).orderBy(desc(payroll.mesReferencia));
      // EPIs entregues - TODOS
      const empEpis = await db.select({
        id: epiDeliveries.id, epiId: epiDeliveries.epiId, quantidade: epiDeliveries.quantidade,
        dataEntrega: epiDeliveries.dataEntrega, dataDevolucao: epiDeliveries.dataDevolucao,
        motivo: epiDeliveries.motivo, nomeEpi: epis.nome, ca: epis.ca,
        fichaUrl: epiDeliveries.fichaUrl, tamanho: epis.tamanho,
        valorCobranca: epiDeliveries.valorCobrado,
      }).from(epiDeliveries)
        .leftJoin(epis, eq(epiDeliveries.epiId, epis.id))
        .where(and(eq(epiDeliveries.employeeId, input.employeeId), isNull(epiDeliveries.deletedAt)))
        .orderBy(desc(epiDeliveries.dataEntrega));
      // VR - TODOS
      const empVR = await db.select().from(vrBenefits).where(eq(vrBenefits.employeeId, input.employeeId)).orderBy(desc(vrBenefits.mesReferencia));
      // Adiantamentos - TODOS
      const empAdiantamentos = await db.select().from(advances).where(eq(advances.employeeId, input.employeeId)).orderBy(desc(advances.mesReferencia));
      // Rateio por obra
      const empRateio = await db.select({
        id: obraHorasRateio.id, obraId: obraHorasRateio.obraId, nomeObra: obras.nome,
        mesAno: obraHorasRateio.mesAno, horasNormais: obraHorasRateio.horasNormais,
        horasExtras: obraHorasRateio.horasExtras, totalHoras: obraHorasRateio.totalHoras,
        diasTrabalhados: obraHorasRateio.diasTrabalhados,
      }).from(obraHorasRateio)
        .leftJoin(obras, eq(obraHorasRateio.obraId, obras.id))
        .where(eq(obraHorasRateio.employeeId, input.employeeId))
        .orderBy(desc(obraHorasRateio.mesAno));

      // HORAS EXTRAS - TODOS os registros de pagamentos extras tipo HE
      const empHorasExtras = await db.select().from(extraPayments)
        .where(and(
          eq(extraPayments.employeeId, input.employeeId),
          eq(extraPayments.tipoExtra, "Horas_Extras"),
        )).orderBy(desc(extraPayments.mesReferencia));

      // HISTÓRICO FUNCIONAL - TODOS os eventos
      const empHistorico = await db.select().from(employeeHistory)
        .where(eq(employeeHistory.employeeId, input.employeeId))
        .orderBy(desc(employeeHistory.dataEvento));

      // ACIDENTES DE TRABALHO
      const empAcidentes = await db.select().from(accidents)
        .where(eq(accidents.employeeId, input.employeeId))
        .orderBy(desc(accidents.dataAcidente));

      // PROCESSOS TRABALHISTAS
      const empProcessos = await db.select().from(processosTrabalhistas)
        .where(and(eq(processosTrabalhistas.employeeId, input.employeeId), isNull(processosTrabalhistas.deletedAt)))
        .orderBy(desc(processosTrabalhistas.dataDistribuicao));

      // Andamentos dos processos
      let processosComAndamentos: any[] = [];
      if (empProcessos.length > 0) {
        processosComAndamentos = await Promise.all(empProcessos.map(async (proc) => {
          const andamentos = await db.select().from(processosAndamentos)
            .where(eq(processosAndamentos.processoId, proc.id))
            .orderBy(desc(processosAndamentos.data));
          return { ...proc, andamentos };
        }));
      }

      // TIMELINE CRONOLÓGICA - Montar eventos de TODAS as fontes
      const timeline: Array<{ data: string; tipo: string; descricao: string; cor: string; icone: string }> = [];

      // Admissão
      if (emp.dataAdmissao) timeline.push({ data: emp.dataAdmissao, tipo: "Admissão", descricao: `Admitido como ${emp.funcao || emp.cargo || "-"} no setor ${emp.setor || "-"}`, cor: "green", icone: "user-plus" });
      // Demissão
      if (emp.dataDemissao) timeline.push({ data: emp.dataDemissao, tipo: "Desligamento", descricao: `Desligado da empresa`, cor: "red", icone: "user-minus" });
      // Histórico funcional
      empHistorico.forEach(h => {
        const tipoLabel: Record<string, string> = { Admissao: "Admissão", Promocao: "Promoção", Transferencia: "Transferência", Mudanca_Funcao: "Mudança de Função", Mudanca_Setor: "Mudança de Setor", Mudanca_Salario: "Alteração Salarial", Afastamento: "Afastamento", Retorno: "Retorno", Ferias: "Férias", Desligamento: "Desligamento", Outros: "Outros" };
        let desc = tipoLabel[h.tipo] || h.tipo;
        if (h.valorAnterior && h.valorNovo) desc += `: ${h.valorAnterior} → ${h.valorNovo}`;
        if (h.descricao) desc += ` — ${h.descricao}`;
        const corMap: Record<string, string> = { Promocao: "green", Mudanca_Salario: "blue", Mudanca_Funcao: "purple", Transferencia: "indigo", Afastamento: "amber", Retorno: "teal", Ferias: "cyan", Desligamento: "red" };
        timeline.push({ data: h.dataEvento, tipo: tipoLabel[h.tipo] || h.tipo, descricao: desc, cor: corMap[h.tipo] || "gray", icone: "history" });
      });
      // ASOs
      empAsos.forEach(a => timeline.push({ data: a.dataExame, tipo: "ASO", descricao: `${a.tipo || "Exame"} — ${a.resultado || "Pendente"}`, cor: "blue", icone: "stethoscope" }));
      // Treinamentos
      empTreinamentos.forEach(t => timeline.push({ data: t.dataRealizacao, tipo: "Treinamento", descricao: `${t.nome}${t.norma ? ` (${t.norma})` : ""}`, cor: "emerald", icone: "graduation-cap" }));
      // Advertências
      empAdvertencias.forEach(a => {
        const tipoAdv = a.tipoAdvertencia === "Suspensao" ? "Suspensão" : a.tipoAdvertencia === "JustaCausa" ? "Justa Causa" : a.tipoAdvertencia;
        timeline.push({ data: a.dataOcorrencia, tipo: `Advertência (${tipoAdv})`, descricao: a.motivo || "-", cor: a.tipoAdvertencia === "Suspensao" || a.tipoAdvertencia === "JustaCausa" ? "red" : "orange", icone: "alert-triangle" });
      });
      // Atestados
      empAtestados.forEach(a => timeline.push({ data: a.dataEmissao, tipo: "Atestado", descricao: `${a.tipo || "Médico"} — ${a.diasAfastamento || 0} dia(s)${a.cid ? ` (CID: ${a.cid})` : ""}`, cor: "purple", icone: "clipboard" }));
      // Acidentes
      empAcidentes.forEach(a => timeline.push({ data: a.dataAcidente, tipo: "Acidente", descricao: `${a.tipoAcidente} (${a.gravidade})${a.diasAfastamento ? ` — ${a.diasAfastamento} dias afastado` : ""}`, cor: "red", icone: "alert-circle" }));
      // EPIs
      empEpis.forEach(e => { if (e.dataEntrega) timeline.push({ data: e.dataEntrega, tipo: "EPI", descricao: `Entrega: ${e.nomeEpi || "EPI"}${e.ca ? ` (CA: ${e.ca})` : ""} — Qtd: ${e.quantidade || 1}`, cor: "teal", icone: "hard-hat" }); });

      // Ordenar timeline por data (mais recente primeiro)
      timeline.sort((a, b) => (b.data || "").localeCompare(a.data || ""));

      // Contagem de advertências para progressão
      const advVerbais = empAdvertencias.filter(a => a.tipoAdvertencia === "Verbal").length;
      const advEscritas = empAdvertencias.filter(a => a.tipoAdvertencia === "Escrita").length;
      const advSuspensoes = empAdvertencias.filter(a => a.tipoAdvertencia === "Suspensao").length;
      let proximaAcao = "Nenhuma pendência";
      if (advVerbais >= 3 && advEscritas === 0) proximaAcao = "Sugestão: Aplicar Advertência por Escrito";
      else if (advEscritas >= 1 && advSuspensoes === 0) proximaAcao = "Sugestão: Aplicar Suspensão Disciplinar";
      else if (advSuspensoes >= 1) proximaAcao = "⚠️ Sugestão: Avaliar Rescisão por Justa Causa";

      // Resumo de ponto agrupado por mês
      const pontoResumoMap: Record<string, { diasTrabalhados: number; horasTrabalhadas: string; horasExtras: string; atrasos: string; faltas: number; ajustesManuais: number }> = {};
      empPonto.forEach((p: any) => {
        const mesRef = p.mesReferencia || (p.data ? p.data.substring(0, 7) : null);
        if (!mesRef) return;
        if (!pontoResumoMap[mesRef]) pontoResumoMap[mesRef] = { diasTrabalhados: 0, horasTrabalhadas: "0:00", horasExtras: "0:00", atrasos: "0:00", faltas: 0, ajustesManuais: 0 };
        pontoResumoMap[mesRef].diasTrabalhados++;
        if (p.ajusteManual) pontoResumoMap[mesRef].ajustesManuais++;
      });
      const pontoResumo = Object.entries(pontoResumoMap)
        .map(([mesRef, dados]) => ({ mesReferencia: mesRef, ...dados }))
        .sort((a, b) => b.mesReferencia.localeCompare(a.mesReferencia));

      // Atrasos detalhados (registros de ponto com atraso)
      const atrasosDetalhados = empPonto
        .filter((p: any) => p.atrasos && p.atrasos !== "0:00" && p.atrasos !== "00:00")
        .map((p: any) => ({ data: p.data, entrada1: p.entrada1, atraso: p.atrasos, mesReferencia: p.mesReferencia || (p.data ? p.data.substring(0, 7) : "") }));

      // Faltas detalhadas
      const faltasDetalhadas = empPonto
        .filter((p: any) => p.faltas && Number(p.faltas) > 0)
        .map((p: any) => ({ data: p.data, faltas: p.faltas, mesReferencia: p.mesReferencia || (p.data ? p.data.substring(0, 7) : "") }));

      // AVISO PRÉVIO
      const empAvisosPrevios = await db.select().from(terminationNotices)
        .where(and(eq(terminationNotices.employeeId, input.employeeId), isNull(terminationNotices.deletedAt)))
        .orderBy(desc(terminationNotices.dataInicio));

      // FÉRIAS
      const empFerias = await db.select().from(vacationPeriods)
        .where(and(eq(vacationPeriods.employeeId, input.employeeId), isNull(vacationPeriods.deletedAt)))
        .orderBy(desc(vacationPeriods.dataInicio));

      // CIPA
      const empCipa = await db.select({
        id: cipaMembers.id,
        cargoCipa: cipaMembers.cargoCipa,
        representacao: cipaMembers.representacao,
        statusMembro: cipaMembers.statusMembro,
        inicioEstabilidade: cipaMembers.inicioEstabilidade,
        fimEstabilidade: cipaMembers.fimEstabilidade,
        mandatoInicio: cipaElections.mandatoInicio,
        mandatoFim: cipaElections.mandatoFim,
      }).from(cipaMembers)
        .leftJoin(cipaElections, eq(cipaMembers.electionId, cipaElections.id))
        .where(eq(cipaMembers.employeeId, input.employeeId));

      // PJ CONTRATOS
      const empPjContratos = await db.select().from(pjContracts)
        .where(and(eq(pjContracts.employeeId, input.employeeId), isNull(pjContracts.deletedAt)))
        .orderBy(desc(pjContracts.dataInicio));

      // PJ PAGAMENTOS
      const empPjPagamentos = await db.select().from(pjPayments)
        .where(eq(pjPayments.employeeId, input.employeeId))
        .orderBy(desc(pjPayments.mesReferencia));

      // ALERTAS DE DESCONTO EPI
      const empEpiDiscountAlerts = await db.select({
        id: epiDiscountAlerts.id,
        epiNome: epiDiscountAlerts.epiNome,
        ca: epiDiscountAlerts.ca,
        quantidade: epiDiscountAlerts.quantidade,
        valorUnitario: epiDiscountAlerts.valorUnitario,
        valorTotal: epiDiscountAlerts.valorTotal,
        motivoCobranca: epiDiscountAlerts.motivoCobranca,
        mesReferencia: epiDiscountAlerts.mesReferencia,
        status: epiDiscountAlerts.status,
        validadoPor: epiDiscountAlerts.validadoPor,
        dataValidacao: epiDiscountAlerts.dataValidacao,
        justificativa: epiDiscountAlerts.justificativa,
        createdAt: epiDiscountAlerts.createdAt,
      }).from(epiDiscountAlerts)
        .where(eq(epiDiscountAlerts.employeeId, input.employeeId))
        .orderBy(desc(epiDiscountAlerts.createdAt));

      // Add new events to timeline
      empAvisosPrevios.forEach(a => timeline.push({ data: a.dataInicio, tipo: "Aviso Prévio", descricao: `${a.tipo.startsWith('empregador') ? 'Pelo Empregador' : 'Pelo Empregado'} — ${a.diasAviso || 30} dias`, cor: "orange", icone: "alert-triangle" }));
      empFerias.forEach(f => { if (f.dataInicio) timeline.push({ data: f.dataInicio, tipo: "Férias", descricao: `${f.diasGozo || 30} dias${f.abonoPecuniario ? ' + abono pecuniário' : ''}`, cor: "cyan", icone: "palmtree" }); });

      // Re-sort timeline
      timeline.sort((a, b) => (b.data || "").localeCompare(a.data || ""));

      return {
        funcionario: emp,
        funcaoDetalhes,
        asos: asosComStatus,
        treinamentos: empTreinamentos,
        atestados: empAtestados,
        advertencias: empAdvertencias,
        ponto: pontoResumo,
        pontoDetalhado: empPonto,
        atrasosDetalhados,
        faltasDetalhadas,
        folhaPagamento: empPayroll,
        epis: empEpis,
        horasExtras: empHorasExtras,
        historicoFuncional: empHistorico,
        acidentes: empAcidentes,
        processos: processosComAndamentos,
        timeline,
        valeAlimentacao: empVR,
        adiantamentos: empAdiantamentos,
        rateioObras: empRateio,
        progressaoAdvertencias: { verbais: advVerbais, escritas: advEscritas, suspensoes: advSuspensoes, proximaAcao },
        avisosPrevios: empAvisosPrevios,
        ferias: empFerias,
        cipa: empCipa,
        pjContratos: empPjContratos,
        pjPagamentos: empPjPagamentos,
        epiDiscountAlerts: empEpiDiscountAlerts,
      };
    }),

  // ===================== MODELOS DE ADVERTÊNCIA CLT =====================
  modelosAdvertencia: protectedProcedure
    .query(async () => {
      return MODELOS_ADVERTENCIA;
    }),

  // ===================== CONTAGEM ADVERTÊNCIAS POR FUNCIONÁRIO =====================
  contagemAdvertencias: protectedProcedure
    .input(z.object({ employeeId: z.number() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const advs = await db.select().from(warnings).where(and(eq(warnings.employeeId, input.employeeId), isNull(warnings.deletedAt))).orderBy(desc(warnings.dataOcorrencia));
      const verbais = advs.filter(a => a.tipoAdvertencia === "Verbal").length;
      const escritas = advs.filter(a => a.tipoAdvertencia === "Escrita").length;
      const suspensoes = advs.filter(a => a.tipoAdvertencia === "Suspensao").length;
      const justaCausa = advs.filter(a => a.tipoAdvertencia === "JustaCausa").length;
      let proximaAcao = "Nenhuma pendência";
      let sugestaoTipo = "Verbal";
      const totalAdv = verbais + escritas;
      if (totalAdv >= 3 && suspensoes === 0) { proximaAcao = "ALERTA: 3+ advertências — Apto a receber SUSPENSÃO (Art. 474 CLT)"; sugestaoTipo = "Suspensao"; }
      else if (suspensoes >= 1 && justaCausa === 0) { proximaAcao = "Avaliar Rescisão por Justa Causa (Art. 482 CLT)"; sugestaoTipo = "JustaCausa"; }
      else if (totalAdv >= 1 && totalAdv < 3) { proximaAcao = `${totalAdv}/3 advertências antes da suspensão`; sugestaoTipo = totalAdv >= 2 ? "Escrita" : "Verbal"; }
      return { verbais, escritas, suspensoes, justaCausa, total: advs.length, proximaAcao, sugestaoTipo, historico: advs };
    }),

  // ===================== MODELOS DE DOCUMENTOS (TEMPLATES) =====================
  templates: router({
    list: protectedProcedure
      .input(z.object({ companyId: z.number() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        return db.select().from(documentTemplates)
          .where(eq(documentTemplates.companyId, input.companyId))
          .orderBy(documentTemplates.tipo);
      }),

    getByTipo: protectedProcedure
      .input(z.object({ companyId: z.number(), tipo: z.string() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const rows = await db.select().from(documentTemplates)
          .where(and(
            eq(documentTemplates.companyId, input.companyId),
            eq(documentTemplates.tipo, input.tipo as any),
            eq(documentTemplates.ativo, 1),
          ));
        if (rows.length > 0) return rows[0];
        // Retornar modelo padrão CLT se não houver customizado
        // Contrato PJ tem seu próprio modelo padrão
        if (input.tipo === 'contrato_pj') {
          return { id: 0, companyId: input.companyId, tipo: 'contrato_pj', titulo: 'Contrato Particular de Prestação de Serviços', conteudo: MODELO_CONTRATO_PJ_DEFAULT, ativo: 1, isDefault: true };
        }
        const tipoMap: Record<string, string> = {
          advertencia_verbal: "Verbal",
          advertencia_escrita: "Escrita",
          suspensao: "Suspensao",
          justa_causa: "JustaCausa",
        };
        const modeloKey = tipoMap[input.tipo] || "Verbal";
        const modelo = (MODELOS_ADVERTENCIA as any)[modeloKey];
        if (modelo) return { id: 0, companyId: input.companyId, tipo: input.tipo, titulo: modelo.titulo, conteudo: modelo.texto, ativo: 1, isDefault: true };
        return null;
      }),

    upsert: protectedProcedure
      .input(z.object({
        companyId: z.number(),
        tipo: z.enum(['advertencia_verbal','advertencia_escrita','suspensao','justa_causa','contrato_pj','outros']),
        titulo: z.string(),
        conteudo: z.string(),
        userName: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        // Verificar se já existe
        const existing = await db.select().from(documentTemplates)
          .where(and(
            eq(documentTemplates.companyId, input.companyId),
            eq(documentTemplates.tipo, input.tipo),
          ));
        if (existing.length > 0) {
          await db.update(documentTemplates).set({
            titulo: input.titulo,
            conteudo: input.conteudo,
            atualizadoPor: input.userName || null,
          }).where(eq(documentTemplates.id, existing[0].id));
          return { success: true, id: existing[0].id };
        }
        const result = await db.insert(documentTemplates).values({
          companyId: input.companyId,
          tipo: input.tipo,
          titulo: input.titulo,
          conteudo: input.conteudo,
          criadoPor: input.userName || null,
        });
        return { success: true, id: Number(result[0].insertId) };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        await db.update(documentTemplates).set({ deletedAt: sql`NOW()`, deletedBy: ctx.user.name ?? 'Sistema', deletedByUserId: ctx.user.id } as any).where(eq(documentTemplates.id, input.id));
        return { success: true };
      }),
  }),

  // ===================== DELETE EM LOTE (ATESTADOS) =====================
  atestadosDeleteBatch: protectedProcedure
    .input(z.object({ ids: z.array(z.number()) }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      for (const id of input.ids) {
        await db.update(atestados).set({ deletedAt: sql`NOW()`, deletedBy: ctx.user.name ?? 'Sistema', deletedByUserId: ctx.user.id } as any).where(eq(atestados.id, id));
      }
      return { success: true, deletados: input.ids.length };
    }),
});
