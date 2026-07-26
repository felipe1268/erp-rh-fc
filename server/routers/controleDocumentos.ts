import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb, userCanSeeAvisoStatus, userCanAccessEmployeeDossier, getCompaniesForUser } from "../db";
import { TRPCError } from "@trpc/server";
import { asos, atestados, trainings, warnings, employees, timeRecords, payroll, epiDeliveries, epis, vrBenefits, advances, obraHorasRateio, obras, documentTemplates, extraPayments, employeeHistory, accidents, processosTrabalhistas, processosAndamentos, jobFunctions, terminationNotices, vacationPeriods, cipaMeetings, cipaMembers, cipaElections, pjContracts, pjPayments, epiDiscountAlerts, customExams, obraFuncionarios, employeeSiteHistory, warehouseLoans, almoxarifadoDescontoFolha, almoxarifadoSaidasInsumo, heSolicitacaoConfirmacoes, heSolicitacoes, heSolicitacaoFuncionarios, pontoDescontos, notificationLogs, notificationRecipients, lancamentosParceiros, parceirosConveniados, ddsSessoes, ddsSessaoFuncionarios, signatureSessions, signatureSigners, equipamentoLocadoEventos, equipamentosLocados, users, clienteAvaliacoes, clienteAvaliacaoDetalhes } from "../../drizzle/schema";
import { eq, and, desc, sql, ne, isNull, inArray, gte, lte, or, ilike } from "drizzle-orm";
import { resolveCompanyIds, companyFilter } from "../companyHelper";
import { storagePut, dbRetrieve } from "../storage";
import { assertAiModuleEnabled } from "../_core/aiConfig";
import { invokeGeminiVision } from "../_core/llm";
import { asoExtracaoIa } from "../../drizzle/schema";
import { verificarAssinaturaMemorial } from "../services/assinaturaMemorial";
import { logStatusChange } from "../lib/employeeStatusHelper";
import { sendEmail } from "../services/smtpService";

const LIMITE_DIAS_INSS = 15;

// Guard multi-tenant: interseciona os companyIds pedidos com as empresas que o
// usuário pode ver (admin/admin_master = todas). Bloqueia IDOR onde o cliente
// envia companyId/companyIds de empresas a que não tem acesso. Lança se sobrar 0.
async function resolveCompanyIdsGuard(
  ctx: { user: { id: number; role?: string | null } },
  input: { companyId: number; companyIds?: number[] }
): Promise<number[]> {
  const pedidos = resolveCompanyIds(input);
  const permitidas = await getCompaniesForUser(ctx.user.id, (ctx.user.role || "") as string);
  const permitidasSet = new Set(permitidas.map((c: any) => c.id));
  const ok = pedidos.filter((id) => permitidasSet.has(id));
  if (ok.length === 0) throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
  return ok;
}

// Rev. 2678 — Funcionários DESLIGADOS não entram no Controle de Documentos.
// Mesma régua de "vínculo encerrado" usada em server/db.ts: status Desligado,
// Lista_Negra ou Inativo são excluídos de TODAS as listas, cards/contagens e do
// Painel de Validade. Factory gera um SQL novo a cada uso (drizzle .where/and()).
// Em SQL cru, escreva o literal `e.status NOT IN ('Desligado','Lista_Negra','Inativo')`.
const empNaoDesligado = () =>
  sql`${employees.status} NOT IN ('Desligado', 'Lista_Negra', 'Inativo')`;

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
const MODELO_CONTRATO_PJ_DEFAULT = `CONTRATO DE PRESTAÇÃO DE SERVIÇOS TÉCNICOS ESPECIALIZADOS

IDENTIFICAÇÃO DAS PARTES CONTRATANTES

CONTRATANTE: [CONTRATANTE_NOME], pessoa jurídica de direito privado, inscrita no CNPJ/MF sob n.º [CONTRATANTE_CNPJ], com sede em [CONTRATANTE_ENDERECO], [CONTRATANTE_CIDADE], Estado de [CONTRATANTE_ESTADO], neste ato representada por seu representante legal, [CONTRATANTE_REPRESENTANTE], doravante denominada simplesmente "CONTRATANTE".

CONTRATADA: [CONTRATADA_RAZAO_SOCIAL], pessoa jurídica de direito privado, inscrita no CNPJ/MF sob n.º [CONTRATADA_CNPJ], com sede em [CONTRATADA_ENDERECO], [CONTRATADA_CIDADE], Estado de [CONTRATADA_ESTADO], neste ato representada na forma de seus atos constitutivos, doravante denominada simplesmente "CONTRATADA".

As partes acima identificadas têm, entre si, justo e acertado o presente Contrato de Prestação de Serviços Técnicos Especializados, de natureza civil, que se regerá pelas cláusulas seguintes e pelas condições descritas no presente.

DO OBJETO DO CONTRATO

Cláusula 1ª. O presente contrato tem como OBJETO a prestação, pela CONTRATADA à CONTRATANTE, de serviços técnicos especializados, por resultado, consistentes em:

[OBJETO_CONTRATO]

Parágrafo único. Os serviços descritos nesta cláusula serão prestados pela CONTRATADA de forma autônoma e independente, mediante aplicação de seus conhecimentos, métodos, cronograma e estrutura próprios, visando ao resultado técnico acordado entre as partes, sem que haja prestação de trabalho pessoal em caráter subordinado, com pessoalidade obrigatória ou qualquer outro vínculo de subordinação, exclusividade ou emprego com a CONTRATANTE.

DAS OBRIGAÇÕES DA CONTRATADA

Cláusula 2ª. É obrigação da CONTRATADA:
a) Executar os serviços objeto deste contrato com profissionalismo, qualidade técnica e observância das normas técnicas e da legislação aplicáveis à sua atividade;
b) Responder tecnicamente pelos serviços que executar, aplicando seus próprios métodos e conhecimentos, respondendo por seus resultados;
c) Responder pela guarda e conservação de quaisquer equipamentos, materiais, documentos e informações de propriedade da CONTRATANTE que lhe forem confiados durante a execução dos serviços;
d) Fornecer, às suas próprias expensas, e utilizar os equipamentos de proteção individual (EPIs) necessários à sua segurança, de acordo com as Normas Regulamentadoras relativas à Segurança e Medicina do Trabalho previstas na legislação em vigor;
e) Arcar integralmente com todos os tributos, contribuições e encargos de qualquer natureza incidentes sobre sua atividade empresarial, inclusive os relativos a seus sócios, prepostos e empregados, se houver;
f) Emitir Nota Fiscal de Prestação de Serviços correspondente a cada medição aprovada, nos prazos previstos neste contrato;
g) Manter regularidade fiscal e cadastral de sua empresa durante toda a vigência contratual, apresentando, quando solicitado, os comprovantes de recolhimento dos tributos incidentes sobre sua atividade;
h) Comunicar formalmente à CONTRATANTE qualquer fato que possa afetar a execução dos serviços contratados.

Cláusula 3ª. A CONTRATADA executará os serviços com autonomia técnica e organizacional, podendo estabelecer seus próprios horários e métodos de trabalho, respeitados os cronogramas e as normas internas de segurança e de acesso das instalações onde os serviços forem prestados.

Parágrafo único. A CONTRATADA não estará sujeita a qualquer forma de controle de jornada ou de frequência pela CONTRATANTE, tais como registro de ponto, obrigação de comparecimento diário ou necessidade de autorização para ausências, sendo o acompanhamento dos serviços realizado exclusivamente pelo resultado das medições e pelo cumprimento dos cronogramas acordados.

Cláusula 4ª. A CONTRATADA não possui responsabilidade regressiva pelo adimplemento de eventuais verbas salariais decorrentes de condenação da CONTRATANTE em processos judiciais, procedimentos de mediação ou arbitragem propostos pelos empregados desta, assim como a CONTRATANTE não responde por obrigações trabalhistas, previdenciárias ou fiscais da CONTRATADA, não havendo vínculo de subordinação ou empregatício entre as partes.

DA NÃO EXCLUSIVIDADE E DA ASSUNÇÃO DOS RISCOS DA ATIVIDADE

Cláusula 5ª. A presente contratação NÃO é exclusiva, sendo assegurado à CONTRATADA o direito de prestar serviços a quaisquer outros clientes e tomadores, inclusive do mesmo ramo de atividade da CONTRATANTE, desde que observadas as obrigações de sigilo e confidencialidade previstas neste instrumento, assim como é assegurado à CONTRATANTE o direito de contratar outros prestadores para serviços da mesma natureza.

Cláusula 6ª. A CONTRATADA, na qualidade de empresa autônoma, assume integralmente os riscos econômicos de sua atividade empresarial, executando os serviços com instrumentos, recursos e organização próprios, e obrigando-se, como obrigação de resultado, a refazer, às suas exclusivas expensas, os serviços executados em desacordo com as especificações técnicas acordadas.

DAS OBRIGAÇÕES DA CONTRATANTE

Cláusula 7ª. A CONTRATANTE está obrigada a:
a) Fornecer as condições, informações e documentos necessários para que a CONTRATADA possa executar adequadamente os serviços contratados;
b) Permitir o acesso da CONTRATADA às instalações e frentes de serviço, quando a execução assim o exigir;
c) Efetuar os pagamentos na forma e nos prazos ajustados neste contrato, mediante apresentação da respectiva Nota Fiscal de Serviços;
d) Gerenciar e coordenar a interdependência dos trabalhos desenvolvidos nas áreas em que atuará a CONTRATADA.

DA INEXISTÊNCIA DE VÍNCULO EMPREGATÍCIO

Cláusula 8ª. As partes reconhecem expressamente que não existirá entre as mesmas, tampouco entre os prepostos e/ou funcionários da CONTRATADA e da CONTRATANTE, qualquer vínculo de natureza trabalhista, sendo o presente contrato regulado pelas cláusulas aqui expressas com base no Código Civil (art. 593 e seguintes) e Leis vigentes adequadas à espécie, razão pela qual a CONTRATADA assume integralmente a responsabilidade pelo pagamento de todos os salários, encargos trabalhistas e previdenciários de todo o pessoal por ela alocado na execução dos serviços ora contratados.

PARÁGRAFO 1º: Em caso de processos trabalhistas movidos pelos funcionários da CONTRATADA contra a mesma, eximir-se-á a CONTRATANTE de qualquer prejuízo de responsabilidade da CONTRATADA.

PARÁGRAFO 2º: Da mesma forma, em caso de processos trabalhistas movidos pelos funcionários da CONTRATANTE contra a mesma, eximir-se-á a CONTRATADA de qualquer prejuízo de responsabilidade da CONTRATANTE.

DO SIGILO E DA CONFIDENCIALIDADE

Cláusula 9ª. As PARTES CONTRATANTES obrigam-se por si, por seus funcionários, contratados e/ou prepostos pela guarda de todas as informações trocadas reciprocamente entre seus funcionários e terceiros, de que venham a ter ciência em razão da presente prestação de serviços, obrigando-se a não divulgarem, comunicarem e nem fazerem uso de quaisquer destas informações, além dos limites estipulados neste Contrato para realização das atividades contratadas.

Cláusula 10ª. É obrigação das PARTES CONTRATANTES manter por prazo indeterminado, em absoluto sigilo e confidencialidade e não usar, reproduzir, copiar ou revelar, em proveito próprio ou de terceiros, as informações confidenciais as quais tiveram acesso em razão do presente CONTRATO e da utilização de sistemas, softwares ou de dados transmitidos por alguma delas ou por empresas terceirizadas a seu serviço, sob pena de responsabilização civil e criminalmente.

Cláusula 11ª. No caso de rescisão do presente Contrato, a CONTRATADA devolverá à CONTRATANTE todos os documentos e informações existentes em seus bancos de dados e que estiverem sob sua guarda, mediante assinatura de termo de entrega pela CONTRATANTE. Efetuada a entrega e assinatura do respectivo termo, a CONTRATADA deverá proceder a inutilização de quaisquer cópias de dados, informações e documentos encontrados em seus arquivos físicos ou de computação, visando assegurar o devido sigilo e confidencialidade, nos termos da Lei Geral de Proteção de Dados (Lei nº 13.709/2018).

DO PREÇO, DAS MEDIÇÕES E DO PAGAMENTO

Cláusula 12ª. Pela integralidade dos serviços objeto deste contrato, durante o prazo de vigência ajustado, a CONTRATANTE pagará à CONTRATADA o VALOR TOTAL de R$ [VALOR_TOTAL_CONTRATO] ([VALOR_TOTAL_EXTENSO]), correspondente à base mensal de referência de R$ [VALOR_MENSAL] ([VALOR_EXTENSO]) pelo prazo de [PRAZO_VIGENCIA].

Cláusula 13ª. O desembolso do valor total contratado será realizado de forma parcelada, de acordo com MEDIÇÕES MENSAIS dos serviços efetivamente executados, apuradas e aprovadas pela CONTRATANTE, na seguinte proporção: [PERCENTUAL_ADIANTAMENTO]% no dia [DIA_ADIANTAMENTO] do mês corrente e [PERCENTUAL_FECHAMENTO]% [TEXTO_DIA_FECHAMENTO], sempre mediante apresentação da respectiva Nota Fiscal de Serviços.

PARÁGRAFO 1º: Para recebimento dos pagamentos, a CONTRATADA deverá emitir e encaminhar a Nota Fiscal de Serviços com antecedência mínima de 5 (cinco) dias da data de pagamento, observando os seguintes prazos: (i) Nota Fiscal referente à primeira medição do mês: até o dia [PRAZO_NOTA_ADIANTAMENTO] do mês corrente; (ii) Nota Fiscal referente à segunda medição: até [PRAZO_NOTA_FECHAMENTO] do mês do pagamento. O não envio da Nota Fiscal dentro do prazo estipulado implicará no adiamento do pagamento para o mês subsequente, sem ônus para a CONTRATANTE.

PARÁGRAFO 2º: As medições refletem os serviços efetivamente executados no período, podendo o valor de cada parcela variar em razão do avanço, de paralisações, de aditivos ou de glosas fundamentadas, não caracterizando os pagamentos periodicidade remuneratória de natureza salarial.

PARÁGRAFO 3º: Dados bancários da CONTRATADA para pagamento: [DADOS_BANCARIOS_CONTRATADA]

Cláusula 14ª. O não pagamento, no prazo, de parcela incontroversa devidamente medida e faturada acarretará multa de 10% (dez por cento) sobre o valor da parcela em atraso, incidindo ainda juros de mora e correção monetária, nos termos da legislação vigente.

DA RESCISÃO

Cláusula 15ª. O presente contrato poderá ser rescindido imotivadamente por qualquer das partes, mediante comunicação por escrito com antecedência mínima de 30 (trinta) dias, sem a incidência de qualquer multa ou ônus, sendo devidos à CONTRATADA apenas os valores das medições dos serviços efetivamente executados até a data da rescisão. Fica ressalvada a possibilidade de rescisão imediata pela parte inocente em caso de descumprimento de qualquer cláusula ou obrigação prevista neste instrumento pela outra parte.

DO PRAZO E DO REAJUSTE DO VALOR

Cláusula 16ª. O presente contrato terá vigência de [PRAZO_VIGENCIA], com início em [DATA_INICIO] e término em [DATA_FIM], podendo ser prorrogado exclusivamente de forma expressa, mediante Termo Aditivo assinado pelas partes, com reavaliação do escopo, do prazo e do valor dos serviços a cada prorrogação.

Cláusula 17ª. Em caso de prorrogação por período igual ou superior a 12 (doze) meses, o valor do contrato poderá ser reajustado anualmente, na data de aniversário de sua assinatura, pela variação do IGP-M/FGV ou, na sua falta, por índice oficial que o substitua.

DAS CONDIÇÕES GERAIS

Cláusula 18ª. A CONTRATADA poderá executar os serviços por meio de seus sócios, prepostos, empregados ou equipe própria devidamente qualificada, podendo substituí-los livremente, mediante simples comunicação à CONTRATANTE, desde que mantida a qualificação técnica necessária à execução do objeto. É vedada apenas a cessão ou transferência deste contrato a outra pessoa jurídica sem o prévio consentimento por escrito da CONTRATANTE.

Cláusula 19ª. Qualquer tolerância de uma das partes em relação ao não cumprimento das obrigações e deveres neste instrumento assumidos não importará em novação quanto aos seus termos, condições ou prazos, não devendo, sob quaisquer hipóteses, ser interpretada como renúncia ou desistência do cumprimento dos dispositivos do presente em seus estritos termos.

Cláusula 20ª. Toda e qualquer alteração do objeto ou das condições do presente Contrato necessitará da concordância prévia e expressa de ambas as partes e será formalizada mediante Termo Aditivo.

Cláusula 21ª. A contratação da presente prestação de serviços se dá sob a égide do disposto no artigo 593 e seguintes do Código Civil Brasileiro, não configurando, em nenhuma hipótese, relação empregatícia entre as partes, seus sócios, prepostos ou empregados.

DO FORO

Cláusula 22ª. Para dirimir quaisquer controvérsias oriundas do presente CONTRATO, as partes elegem o foro da comarca de [FORO_COMARCA], com renúncia a qualquer outro, por mais privilegiado que seja.

Por estarem assim justas e contratadas, firmam o presente instrumento, em duas vias de igual teor, juntamente com 2 (duas) testemunhas.

[CONTRATANTE_CIDADE], [DATA_ASSINATURA].

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

// Rev. 3117 — Mapa/Cobertura de exames do ASO. Dicionário CANÔNICO usado para
// detectar, a partir do texto livre `asos.examesRealizados`, quais exames cada
// colaborador efetivamente fez. O foco do cliente é a "Avaliação Psicossocial",
// mas a mesma régua serve para qualquer exame. Detecção por SUBSTRING normalizada
// (sem acento, minúsculo) — robusta a vírgula/ponto-e-vírgula/quebra de linha.
function normalizarExame(s: string): string {
  return (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

const EXAMES_CANONICOS: { key: string; label: string; match: string[] }[] = [
  { key: "psicossocial", label: "Avaliação Psicossocial", match: ["psicossocial"] },
  { key: "audiometria", label: "Audiometria", match: ["audiometria"] },
  { key: "acuidade_visual", label: "Acuidade Visual", match: ["acuidade visual"] },
  { key: "avaliacao_clinica", label: "Avaliação Clínica", match: ["avaliacao clinica", "exame clinico", "avaliacao clinico"] },
  { key: "ecg", label: "ECG (Eletrocardiograma)", match: ["ecg", "eletrocardiograma"] },
  { key: "eeg", label: "EEG (Eletroencefalograma)", match: ["eletroencefalograma", "eeg"] },
  { key: "espirometria", label: "Espirometria", match: ["espirometria"] },
  { key: "hemograma", label: "Hemograma Completo", match: ["hemograma"] },
  { key: "glicemia", label: "Glicemia de Jejum", match: ["glicemia"] },
  { key: "raio_x_torax", label: "Raio-X de Tórax", match: ["raio-x de torax", "raio x de torax", "rx torax", "raio-x torax", "tórax", "torax"] },
  { key: "raio_x_coluna", label: "Raio-X de Coluna", match: ["coluna"] },
  { key: "eas_urina", label: "EAS (Urina)", match: ["eas", "urina"] },
  { key: "toxicologico", label: "Toxicológico", match: ["toxicolog"] },
  { key: "colinesterase", label: "Colinesterase", match: ["colinesterase"] },
  { key: "hemoglobina_glicosilada", label: "Hemoglobina Glicosilada", match: ["hemoglobina glicosilada", "glicosilada"] },
  { key: "colesterol", label: "Colesterol Total e Frações", match: ["colesterol"] },
  { key: "triglicerides", label: "Triglicérides", match: ["triglicerid"] },
  { key: "hepatico", label: "TGO/TGP (Hepático)", match: ["tgo", "tgp", "hepatic"] },
  { key: "creatinina", label: "Creatinina", match: ["creatinina"] },
  { key: "psa", label: "PSA", match: ["psa"] },
  { key: "plumbemia", label: "Plumbemia (Chumbo)", match: ["plumbemia", "chumbo"] },
];

// Detecta quais exames canônicos aparecem no texto livre de exames realizados.
function detectarExamesCanonicos(examesRealizados: string | null | undefined): string[] {
  const txt = normalizarExame(examesRealizados || "");
  if (!txt) return [];
  const achados: string[] = [];
  for (const ex of EXAMES_CANONICOS) {
    if (ex.match.some((m) => txt.includes(m))) achados.push(ex.key);
  }
  return achados;
}

// ====================== IA — LEITURA DE LAUDO DE ASO (Rev. 3117, Fase 2) ======================
// A IA lê o PDF do ASO e devolve campos ESTRUTURADOS (apto altura / espaço
// confinado / restrições / fatores de risco / exames). NUNCA grava direto no
// laudo: tudo entra na fila `aso_extracao_ia` com status "aguardando_revisao"
// até um humano aprovar. Gateado por assertAiModuleEnabled(companyId,"rh").

const ASO_IA_SCHEMA = {
  type: "object",
  properties: {
    resultado: { type: "string" },            // Apto | Inapto | Apto com restrição | Não identificado
    aptoAltura: { type: "string" },            // Apto | Inapto | Não avaliado
    aptoEspacoConfinado: { type: "string" },   // Apto | Inapto | Não avaliado
    restricoes: { type: "string" },            // restrições/observações médicas (texto)
    fatoresRisco: { type: "string" },          // riscos ocupacionais citados (texto)
    examesDetectados: { type: "array", items: { type: "string" } },
    confianca: { type: "integer" },            // 0-100
  },
} as const;

const ASO_IA_PROMPT = `Você é um analista de SST. Leia este ATESTADO DE SAÚDE OCUPACIONAL (ASO) e extraia, em português do Brasil, EXCLUSIVAMENTE as informações presentes no documento. Não invente. Se um campo não constar, use "Não avaliado" (para aptidões) ou string vazia.

Devolva um JSON com:
- "resultado": conclusão do ASO ("Apto", "Inapto", "Apto com restrição" ou "Não identificado").
- "aptoAltura": aptidão para TRABALHO EM ALTURA (NR-35). Use "Apto", "Inapto" ou "Não avaliado".
- "aptoEspacoConfinado": aptidão para ESPAÇO CONFINADO (NR-33). Use "Apto", "Inapto" ou "Não avaliado".
- "restricoes": restrições/observações médicas registradas (texto curto). Vazio se não houver.
- "fatoresRisco": riscos ocupacionais citados (ruído, poeira, químicos etc.). Vazio se não houver.
- "examesDetectados": lista dos exames complementares realizados citados no laudo (ex.: "Audiometria", "Avaliação Psicossocial", "Hemograma").
- "confianca": número 0-100 indicando sua confiança geral na extração.`;

function parseAsoIaLoose(raw: string): any {
  let txt = (raw || "").trim();
  txt = txt.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const first = txt.indexOf("{");
  const last = txt.lastIndexOf("}");
  if (first >= 0 && last > first) txt = txt.slice(first, last + 1);
  try {
    return JSON.parse(txt);
  } catch {
    // Rev. 3128 — SALVAGE de JSON truncado ("Unterminated string in JSON"):
    // quando a resposta vem cortada (estouro de maxTokens), corta no último
    // campo COMPLETO (última vírgula no topo do objeto) e fecha as chaves, em
    // vez de perder a leitura inteira. Melhor uma extração parcial revisável
    // que um "Falha".
    let s = (raw || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const fi = s.indexOf("{");
    if (fi >= 0) s = s.slice(fi);
    const lastComma = s.lastIndexOf(",");
    if (lastComma > 0) {
      try { return JSON.parse(s.slice(0, lastComma) + "}"); } catch { /* segue */ }
    }
    throw new Error("A IA devolveu uma resposta incompleta/inválida (JSON truncado). Reprocesse este ASO.");
  }
}

// Lê o PDF/imagem de um ASO (a partir de documentoUrl) e devolve base64 + mime.
// Fonte primária = uploaded_files (dbRetrieve), que é onde os 201 PDFs vivem;
// fallback HTTP para URLs absolutas externas.
async function lerArquivoAsoBase64(documentoUrl: string): Promise<{ base64: string; mimeType: string }> {
  const url = (documentoUrl || "").trim();
  if (!url) throw new Error("ASO sem documento anexado.");
  const ext = (url.split("?")[0].split(".").pop() || "pdf").toLowerCase();
  const mimeType = ext === "pdf" ? "application/pdf"
    : ext === "png" ? "image/png"
    : ext === "webp" ? "image/webp"
    : (ext === "jpg" || ext === "jpeg") ? "image/jpeg"
    : "application/pdf";

  // 1) Tenta resolver a partir do banco (uploaded_files) por chave derivada da URL.
  if (!/^https?:\/\//i.test(url)) {
    const candidatos = [
      url.replace(/^\/?uploads\//, "").replace(/^\//, ""),
      url.replace(/^\//, ""),
    ];
    for (const key of candidatos) {
      const got = await dbRetrieve(key);
      if (got) return { base64: got.buffer.toString("base64"), mimeType: got.contentType || mimeType };
    }
  }

  // 2) URL absoluta → fetch direto.
  if (/^https?:\/\//i.test(url)) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Falha ao baixar o documento (${res.status}).`);
    const buf = Buffer.from(await res.arrayBuffer());
    return { base64: buf.toString("base64"), mimeType };
  }

  throw new Error("Documento do ASO não encontrado no armazenamento.");
}

// Núcleo compartilhado por lerComIA e lerLoteIA. Lê o ASO, chama o Gemini,
// faz parse loose e UPSERT na fila aso_extracao_ia. Tenant-safe: só processa
// se o ASO pertence a uma das empresas resolvidas. Falhas viram status "erro".
async function processarAsoComIA(
  db: any,
  asoId: number,
  ids: number[],
  ctx: any,
): Promise<{ ok: boolean; erro?: string; extracaoId?: number; extracao?: any }> {
  const [aso] = await db
    .select({ id: asos.id, companyId: asos.companyId, employeeId: asos.employeeId, documentoUrl: asos.documentoUrl })
    .from(asos)
    .where(and(eq(asos.id, asoId), isNull(asos.deletedAt)))
    .limit(1);
  if (!aso || !ids.includes(aso.companyId)) return { ok: false, erro: "ASO não encontrado." };
  if (!aso.documentoUrl || !aso.documentoUrl.trim()) return { ok: false, erro: "ASO sem documento anexado." };

  // UPSERT manual (sem DELETE): reaproveita a linha existente da fila se houver.
  const [jaTem] = await db.select({ id: asoExtracaoIa.id }).from(asoExtracaoIa).where(eq(asoExtracaoIa.asoId, asoId)).limit(1);

  try {
    const { base64, mimeType } = await lerArquivoAsoBase64(aso.documentoUrl);
    const raw = await invokeGeminiVision({
      prompt: ASO_IA_PROMPT,
      base64,
      mimeType,
      responseSchema: ASO_IA_SCHEMA as any,
      maxTokens: 4096,
    });
    const ex = parseAsoIaLoose(raw);
    const examesArr = Array.isArray(ex?.examesDetectados) ? ex.examesDetectados.map((s: any) => String(s)) : [];
    const confianca = Number.isFinite(Number(ex?.confianca)) ? Math.max(0, Math.min(100, Math.round(Number(ex.confianca)))) : null;
    const valores = {
      asoId,
      companyId: aso.companyId,
      employeeId: aso.employeeId,
      status: "aguardando_revisao",
      extracaoBrutaJson: JSON.stringify(ex),
      resultado: ex?.resultado ? String(ex.resultado).slice(0, 50) : null,
      aptoAltura: ex?.aptoAltura ? String(ex.aptoAltura).slice(0, 60) : null,
      aptoEspacoConfinado: ex?.aptoEspacoConfinado ? String(ex.aptoEspacoConfinado).slice(0, 60) : null,
      restricoes: ex?.restricoes ? String(ex.restricoes) : null,
      fatoresRisco: ex?.fatoresRisco ? String(ex.fatoresRisco) : null,
      examesDetectadosJson: JSON.stringify(examesArr),
      confianca,
      erroMsg: null,
      modelo: "gemini-2.5-flash",
    };
    let extracaoId: number;
    if (jaTem) {
      await db.update(asoExtracaoIa).set({ ...valores, revisadoPor: null, revisadoPorUserId: null, revisadoEm: null } as any).where(eq(asoExtracaoIa.id, jaTem.id));
      extracaoId = jaTem.id;
    } else {
      const [ins] = await db.insert(asoExtracaoIa).values(valores as any).returning({ id: asoExtracaoIa.id });
      extracaoId = ins.id;
    }
    return { ok: true, extracaoId, extracao: { ...valores, examesDetectados: examesArr } };
  } catch (e: any) {
    const msg = (e?.message || String(e)).slice(0, 500);
    try {
      if (jaTem) {
        await db.update(asoExtracaoIa).set({ status: "erro", erroMsg: msg } as any).where(eq(asoExtracaoIa.id, jaTem.id));
      } else {
        await db.insert(asoExtracaoIa).values({ asoId, companyId: aso.companyId, employeeId: aso.employeeId, status: "erro", erroMsg: msg, modelo: "gemini-2.5-flash" } as any);
      }
    } catch { /* fila não materializada ainda — ignora */ }
    return { ok: false, erro: msg };
  }
}

async function abonarPontoPorAtestado(
  db: any,
  employeeId: number,
  companyId: number,
  dataEmissao: string,
  diasAfastamento: number,
  afastamentoTipo: string,
  horasAfastamento: number,
  atestadoId?: number,
) {
  try {
    const datasCobertas: string[] = [];
    if (afastamentoTipo === "horas") {
      datasCobertas.push(dataEmissao);
    } else {
      const dias = diasAfastamento || 1;
      const startDate = new Date(dataEmissao + "T12:00:00Z");
      for (let d = 0; d < dias; d++) {
        const dt = new Date(startDate);
        dt.setUTCDate(startDate.getUTCDate() + d);
        datasCobertas.push(dt.toISOString().substring(0, 10));
      }
    }

    if (datasCobertas.length === 0) return;

    // 1. Abonar descontos existentes
    const descontos = await db.select({ id: pontoDescontos.id, data: pontoDescontos.data, tipo: pontoDescontos.tipo, status: pontoDescontos.status })
      .from(pontoDescontos)
      .where(and(
        eq(pontoDescontos.employeeId, employeeId),
        eq(pontoDescontos.companyId, companyId),
        inArray(pontoDescontos.data, datasCobertas),
        ne(pontoDescontos.status, "abonado"),
      ));

    const fmtHoras = (h: number) => {
      const hh = Math.floor(h);
      const mm = Math.round((h - hh) * 60);
      return mm > 0 ? `${hh}h${String(mm).padStart(2,"0")}` : `${hh}h`;
    };
    const motivoBase = afastamentoTipo === "horas"
      ? `Abono automático — Atestado médico (${fmtHoras(Number(horasAfastamento) || 0)})`
      : `Abono automático — Atestado médico (${diasAfastamento} dia${diasAfastamento > 1 ? "s" : ""})`;

    let abonados = 0;
    for (const desc of descontos) {
      if (afastamentoTipo === "horas" && desc.tipo !== "falta_injustificada") {
        continue;
      }

      await db.update(pontoDescontos).set({
        status: "abonado",
        abonadoPor: "Sistema (Atestado)",
        abonadoEm: new Date().toISOString().replace("T", " ").substring(0, 19),
        motivoAbono: motivoBase,
        valorTotal: "0",
      }).where(eq(pontoDescontos.id, desc.id));
      abonados++;
    }

    if (abonados > 0) {
      console.log(`[AbonoAtestado] Funcionário ${employeeId}: ${abonados} desconto(s) abonado(s) automaticamente`);
    }

    // 2. Vincular atestado ao timecard_daily (marcar dias cobertos)
    if (atestadoId) {
      const placeholders = datasCobertas.map(d => `'${d}'`).join(',');
      await db.execute(sql.raw(`
        UPDATE timecard_daily 
        SET "atestadoId" = ${atestadoId}, 
            "statusDia" = 'atestado',
            "isFalta" = 0
        WHERE "employeeId" = ${employeeId} 
          AND "companyId" = ${companyId}
          AND data IN (${placeholders})
          AND ("atestadoId" IS NULL OR "atestadoId" = 0)
      `));
      console.log(`[AbonoAtestado] Funcionário ${employeeId}: timecard_daily atualizado com atestadoId=${atestadoId} para ${datasCobertas.length} dia(s)`);
    }
  } catch (err: any) {
    console.error(`[AbonoAtestado] Erro ao abonar ponto:`, err?.message);
  }
}

async function handleAfastamentoStatus(
  db: any,
  employeeId: number,
  companyId: number,
  diasAfastamento: number,
  afastamentoTipo: string,
  dataRetorno: string | null | undefined,
  atestadoId: number,
) {
  try {
    if (afastamentoTipo === "horas" || diasAfastamento <= 0 || !dataRetorno) return;

    const today = new Date().toISOString().slice(0, 10);
    if (dataRetorno <= today) {
      await db.update(atestados).set({
        afastamentoINSS: diasAfastamento > LIMITE_DIAS_INSS ? 1 : 0,
        statusAlterado: 0,
        statusAnterior: null,
      }).where(eq(atestados.id, atestadoId));
      console.log(`[AtestadoStatus] Atestado #${atestadoId}: dataRetorno ${dataRetorno} já expirou — sem mudança de status`);
      return;
    }

    const [emp] = await db.select({
      id: employees.id,
      nomeCompleto: employees.nomeCompleto,
      status: employees.status,
    }).from(employees).where(eq(employees.id, employeeId));

    if (!emp || emp.status === "Desligado" || emp.status === "Lista_Negra") return;

    const isINSS = diasAfastamento > LIMITE_DIAS_INSS ? 1 : 0;
    const tipoAfastamento = isINSS
      ? `Afastamento INSS (${diasAfastamento} dias — Lei 8.213/91, Art. 59)`
      : `Atestado médico (${diasAfastamento} dia${diasAfastamento > 1 ? "s" : ""})`;

    await db.update(atestados).set({
      afastamentoINSS: isINSS,
      statusAlterado: 1,
      statusAnterior: emp.status,
    }).where(eq(atestados.id, atestadoId));

    if (emp.status !== "Afastado") {
      await db.update(employees)
        .set({ status: "Afastado" as any })
        .where(eq(employees.id, employeeId));

      await logStatusChange({
        db, companyId, employeeId, nomeCompleto: emp.nomeCompleto,
        statusAnterior: emp.status || "Ativo", statusNovo: "Afastado",
        alteradoPor: "Sistema (Atestado)", motivo: tipoAfastamento,
        origemModulo: "controleDocumentos",
      });

      console.log(`[AtestadoStatus] ${emp.nomeCompleto}: ${emp.status} → Afastado (${tipoAfastamento})`);
    }

    const recipients = await db.select({
      id: notificationRecipients.id,
      nome: notificationRecipients.nome,
      email: notificationRecipients.email,
    }).from(notificationRecipients).where(and(
      eq(notificationRecipients.companyId, companyId),
      eq(notificationRecipients.ativo, 1),
      eq(notificationRecipients.notificarAfastamento, 1),
    ));

    if (recipients.length > 0) {
      const titulo = isINSS
        ? `INSS — ${emp.nomeCompleto} afastado(a) por ${diasAfastamento} dias (retorno: ${dataRetorno})`
        : `Atestado — ${emp.nomeCompleto} afastado(a) por ${diasAfastamento} dia(s) (retorno: ${dataRetorno})`;

      const corpo = [
        `Funcionário: ${emp.nomeCompleto}`,
        `Tipo: ${tipoAfastamento}`,
        `Dias de afastamento: ${diasAfastamento}`,
        `Data de retorno prevista: ${dataRetorno}`,
        isINSS ? `\nATENÇÃO: Afastamento superior a 15 dias — a partir do 16º dia, o pagamento é responsabilidade do INSS (Lei 8.213/91, Art. 59 e Art. 60).` : "",
        isINSS ? `O RH deve providenciar o encaminhamento ao INSS para perícia médica.` : "",
      ].filter(Boolean).join("\n");

      const corpoHtml = `<p>${corpo.replace(/\n/g, "<br>")}</p>`;
      for (const r of recipients) {
        let statusEnvio: "enviado" | "erro" = "erro";
        let erroMsg: string | null = "Falha desconhecida";
        try {
          const res = await sendEmail({ to: r.email, subject: titulo, html: corpoHtml, text: corpo });
          if (res.success) { statusEnvio = "enviado"; erroMsg = null; }
          else { erroMsg = res.error || "Falha SMTP"; }
        } catch (e: any) {
          erroMsg = e?.message || "Erro desconhecido no envio";
          console.error("[AtestadoStatus] Erro ao enviar e-mail:", e);
        }
        try {
          await db.insert(notificationLogs).values({
            companyId,
            employeeId,
            employeeName: emp.nomeCompleto,
            tipoMovimentacao: isINSS ? "afastamento_inss" : "afastamento_atestado",
            statusAnterior: emp.status,
            statusNovo: "Afastado",
            recipientId: r.id,
            recipientName: r.nome,
            recipientEmail: r.email,
            titulo,
            corpo,
            statusEnvio,
            erroMensagem: erroMsg,
            disparadoPor: "Sistema (Atestado)",
          });
        } catch (e) {
          console.error("[AtestadoStatus] Erro ao registrar notification_log:", e);
        }
        if (recipients.length > 1) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }

      console.log(`[AtestadoStatus] ${recipients.length} alerta(s) RH disparado(s) para afastamento de ${emp.nomeCompleto}`);
    }
  } catch (err: any) {
    console.error(`[AtestadoStatus] Erro ao atualizar status:`, err?.message);
  }
}

export const controleDocumentosRouter = router({
  // ===================== ASO =====================
  asos: router({
    list: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
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
            fotoUrl: employees.fotoUrl,
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
          .where(and(companyFilter(asos.companyId, input), isNull(employees.deletedAt), empNaoDesligado(), isNull(asos.deletedAt)))
          .orderBy(employees.nomeCompleto);

        const byEmployeeTipo = new Map<string, any[]>();
        const byEmployee = new Map<number, any[]>();
        for (const r of rows) {
          const key = `${r.employeeId}_${r.tipo}`;
          if (!byEmployeeTipo.has(key)) byEmployeeTipo.set(key, []);
          byEmployeeTipo.get(key)!.push(r);
          if (!byEmployee.has(r.employeeId)) byEmployee.set(r.employeeId, []);
          byEmployee.get(r.employeeId)!.push(r);
        }

        const latestByEmployeeTipo = new Map<string, string>();
        for (const [key, group] of byEmployeeTipo) {
          group.sort((a: any, b: any) => (b.dataExame || "").localeCompare(a.dataExame || "") || b.id - a.id);
          latestByEmployeeTipo.set(key, group[0].id.toString());
        }

        // Tipos que substituem qualquer ASO anterior do mesmo funcionário (ciclo ocupacional reinicia).
        // Demissional é terminal mas não invalida histórico do colaborador ativo (mantemos visível).
        const TIPOS_SUBSTITUTIVOS = new Set(["Admissional", "Periodico", "Retorno", "Mudanca_Funcao"]);

        // Rev. 2478 — status CIPA (ativo ou estabilidade pós-mandato).
        const { getCipaStatusByEmployeeIds, projectCipaFields } = await import("../_core/cipaStatus");
        const cipaMap = await getCipaStatusByEmployeeIds(
          db,
          input,
          rows.map((r: any) => r.employeeId)
        );

        return rows.map((r: any) => {
          const key = `${r.employeeId}_${r.tipo}`;
          const isLatestOfType = latestByEmployeeTipo.get(key) === r.id.toString();
          const statusCalc = calcularStatusASO(r.dataValidade);

          // Regra de SUBSTITUIÇÃO cross-tipo: se existe um ASO mais novo de tipo substitutivo
          // (Admissional/Periódico/Retorno/Mudança Função) que ainda não venceu, este ASO
          // antigo é considerado SUBSTITUÍDO — independente do status atual dele (vencido,
          // a vencer ou válido). Isso resolve o caso "Periódico recém-emitido não esconde
          // o Admissional antigo que ainda mostra 'X dias para vencer'".
          const empGroup = byEmployee.get(r.employeeId) || [];
          const hasNewerSupersedingAso = empGroup.some((a: any) =>
            a.id !== r.id &&
            TIPOS_SUBSTITUTIVOS.has(a.tipo) &&
            (a.dataExame || "").localeCompare(r.dataExame || "") > 0 &&
            calcularStatusASO(a.dataValidade).status !== "VENCIDO"
          );

          const cipaFlat = projectCipaFields(cipaMap, r.employeeId);

          if (hasNewerSupersedingAso) {
            return { ...r, ...cipaFlat, status: "SUBSTITUÍDO", diasRestantes: statusCalc.diasRestantes, isHistorico: true };
          }

          // Caso legado: VENCIDO sem substituto válido mas que não é o mais recente DO MESMO TIPO
          if (statusCalc.status === "VENCIDO" && !isLatestOfType) {
            return { ...r, ...cipaFlat, status: "SUBSTITUÍDO", diasRestantes: statusCalc.diasRestantes, isHistorico: true };
          }

          return { ...r, ...cipaFlat, ...statusCalc, isHistorico: !isLatestOfType };
        });
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

        const [result] = await db.insert(asos).values({
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
        }).returning();
        return { success: true, id: Number((result as any).id) };
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
      .input(z.object({ id: z.number(), fileBase64: z.string(), fileName: z.string(), dataExame: z.string().optional(), validadeDias: z.number().min(1).max(3650).optional() }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        const buffer = Buffer.from(input.fileBase64, "base64");
        const ext = input.fileName.split(".").pop() || "pdf";
        const key = `documentos/asos/${input.id}-${Date.now()}.${ext}`;
        const { url } = await storagePut(key, buffer, ext === "pdf" ? "application/pdf" : "application/octet-stream");
        const updateData: any = { documentoUrl: url };
        if (input.dataExame) {
          const d = new Date(input.dataExame);
          if (!isNaN(d.getTime())) {
            updateData.dataExame = input.dataExame;
            const dias = input.validadeDias || 365;
            d.setDate(d.getDate() + dias);
            updateData.dataValidade = d.toISOString().split("T")[0];
            updateData.validadeDias = dias;
          }
        }
        await db.update(asos).set(updateData).where(eq(asos.id, input.id));
        return { url };
      }),

    // Rev. 3117 — MAPA / COBERTURA DE EXAMES (Fase 1, SEM IA).
    // Para cada colaborador NÃO desligado, resolve o ASO VIGENTE (mais recente
    // por data de exame) e detecta, via texto livre `examesRealizados`, quais
    // exames canônicos foram feitos. Foco do cliente: "Avaliação Psicossocial"
    // (quem fez / quem não fez). Retorna também a UNIÃO de exames presentes
    // (para alimentar o filtro) e os colaboradores SEM nenhum ASO.
    mapaCobertura: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
      .query(async ({ ctx, input }) => {
        const db = (await getDb())!;
        const ids = await resolveCompanyIdsGuard(ctx, input);

        // 1) Colaboradores NÃO desligados (mesma régua do Controle de Documentos)
        //    com obra ativa (quando houver) — inclui Ativo/Aviso/Férias etc.
        const emps = ((await db.execute(sql`
          SELECT e.id, e."nomeCompleto", e.cpf, e.funcao, e."fotoUrl", e."dataAdmissao", e.status,
            ob.nome as "obraNome"
          FROM employees e
          LEFT JOIN obra_funcionarios of2 ON of2."employeeId" = e.id AND of2."isActive" = 1
          LEFT JOIN obras ob ON of2."obraId" = ob.id
          WHERE e."companyId" IN (${sql.join(ids.map((id) => sql`${id}`), sql`,`)})
            AND e."deletedAt" IS NULL
            AND e.status NOT IN ('Desligado', 'Lista_Negra', 'Inativo')
          ORDER BY e."nomeCompleto" ASC
        `)) as any).rows as Array<{ id: number; nomeCompleto: string; cpf: string | null; funcao: string | null; fotoUrl: string | null; dataAdmissao: string | null; status: string; obraNome: string | null }>;

        // 2) Todos os ASOs ativos da(s) empresa(s).
        const asoRows = await db
          .select({
            id: asos.id,
            employeeId: asos.employeeId,
            tipo: asos.tipo,
            dataExame: asos.dataExame,
            dataValidade: asos.dataValidade,
            resultado: asos.resultado,
            examesRealizados: asos.examesRealizados,
            documentoUrl: asos.documentoUrl,
            observacoes: asos.observacoes,
          })
          .from(asos)
          .where(and(inArray(asos.companyId, ids), isNull(asos.deletedAt)));

        // ASO VIGENTE por colaborador = mais recente por dataExame (desempate por id).
        const vigentePorEmp = new Map<number, typeof asoRows[number]>();
        for (const a of asoRows) {
          const atual = vigentePorEmp.get(a.employeeId);
          if (!atual || (a.dataExame || "").localeCompare(atual.dataExame || "") > 0 || ((a.dataExame || "") === (atual.dataExame || "") && a.id > atual.id)) {
            vigentePorEmp.set(a.employeeId, a);
          }
        }

        const examesPresentes = new Set<string>();
        const colaboradores = emps.map((e) => {
          const aso = vigentePorEmp.get(e.id);
          if (!aso) {
            return {
              employeeId: e.id, nomeCompleto: e.nomeCompleto, cpf: e.cpf, funcao: e.funcao,
              fotoUrl: e.fotoUrl, obraNome: e.obraNome, statusFuncionario: e.status,
              temAso: false, asoId: null as number | null, tipo: null as string | null,
              dataExame: null as string | null, dataValidade: null as string | null,
              resultado: null as string | null, status: "SEM ASO", diasRestantes: null as number | null,
              examesCanonicos: [] as string[], examesTexto: null as string | null,
              temPdf: false,
            };
          }
          const examesCanonicos = detectarExamesCanonicos(aso.examesRealizados);
          examesCanonicos.forEach((k) => examesPresentes.add(k));
          const statusCalc = calcularStatusASO(aso.dataValidade);
          return {
            employeeId: e.id, nomeCompleto: e.nomeCompleto, cpf: e.cpf, funcao: e.funcao,
            fotoUrl: e.fotoUrl, obraNome: e.obraNome, statusFuncionario: e.status,
            temAso: true, asoId: aso.id, tipo: aso.tipo,
            dataExame: aso.dataExame, dataValidade: aso.dataValidade,
            resultado: aso.resultado, status: statusCalc.status, diasRestantes: statusCalc.diasRestantes,
            examesCanonicos, examesTexto: aso.examesRealizados || null,
            temPdf: !!(aso.documentoUrl && aso.documentoUrl.trim()),
          };
        });

        // Opções de exame para o filtro: só os canônicos efetivamente presentes,
        // na ordem do dicionário; "Avaliação Psicossocial" sempre vem primeiro.
        const exames = EXAMES_CANONICOS
          .filter((ex) => examesPresentes.has(ex.key))
          .map((ex) => ({
            key: ex.key,
            label: ex.label,
            total: colaboradores.filter((c) => c.examesCanonicos.includes(ex.key)).length,
          }));

        return { geradoEm: new Date().toISOString(), exames, colaboradores };
      }),

    // ============ IA (Fase 2) — LEITURA DE LAUDO COM REVISÃO HUMANA ============
    // Lê 1 ASO com IA e grava o resultado na fila `aso_extracao_ia`
    // (status "aguardando_revisao"). NUNCA aplica no laudo automaticamente.
    lerComIA: protectedProcedure
      .input(z.object({ asoId: z.number(), companyId: z.number(), companyIds: z.array(z.number()).optional() }))
      .mutation(async ({ ctx, input }) => {
        await assertAiModuleEnabled(input.companyId, "rh");
        const db = (await getDb())!;
        const ids = await resolveCompanyIdsGuard(ctx, input);
        const resultado = await processarAsoComIA(db, input.asoId, ids, ctx);
        if (!resultado.ok) throw new TRPCError({ code: "BAD_REQUEST", message: resultado.erro });
        return resultado;
      }),

    // Processa em LOTE os ASOs com PDF que ainda não têm extração (ou que falharam).
    lerLoteIA: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), limite: z.number().min(1).max(50).optional() }))
      .mutation(async ({ ctx, input }) => {
        await assertAiModuleEnabled(input.companyId, "rh");
        const db = (await getDb())!;
        const ids = await resolveCompanyIdsGuard(ctx, input);
        const limite = input.limite ?? 10;
        // ASOs ativos COM pdf que ainda NÃO foram lidos por IA. Rev. 3130: "lido por IA"
        // = qualquer extração aguardando_revisao | aprovado | rejeitado (descartado) — nesses
        // 3 casos o arquivo JÁ foi lido, então NÃO reaparece no lote (evita reler o mesmo PDF).
        // Apenas status 'erro' (leitura falhou, nunca concluiu) volta à fila p/ re-tentar.
        const pend = ((await db.execute(sql`
          SELECT a.id
          FROM asos a
          LEFT JOIN aso_extracao_ia x ON x.aso_id = a.id AND x.status IN ('aguardando_revisao', 'aprovado', 'rejeitado')
          WHERE a."companyId" IN (${sql.join(ids.map((id) => sql`${id}`), sql`,`)})
            AND a."deletedAt" IS NULL
            AND a."documentoUrl" IS NOT NULL AND TRIM(a."documentoUrl") <> ''
            AND x.id IS NULL
          ORDER BY a.id DESC
          LIMIT ${limite}
        `)) as any).rows as Array<{ id: number }>;

        let sucesso = 0, falha = 0;
        const erros: string[] = [];
        for (const r of pend) {
          const res = await processarAsoComIA(db, r.id, ids, ctx);
          if (res.ok) sucesso++;
          else { falha++; if (erros.length < 10) erros.push(`ASO #${r.id}: ${res.erro}`); }
        }
        return { processados: pend.length, sucesso, falha, erros };
      }),

    // Processa em LOTE apenas os ASOs SELECIONADOS na tela (multi-seleção). Tenant-safe:
    // processarAsoComIA valida companyId de cada ASO contra os ids permitidos.
    lerSelecionadosIA: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), asoIds: z.array(z.number()).min(1).max(100) }))
      .mutation(async ({ ctx, input }) => {
        await assertAiModuleEnabled(input.companyId, "rh");
        const db = (await getDb())!;
        const ids = await resolveCompanyIdsGuard(ctx, input);
        const alvo = Array.from(new Set(input.asoIds));
        let sucesso = 0, falha = 0;
        const erros: string[] = [];
        for (const asoId of alvo) {
          const res = await processarAsoComIA(db, asoId, ids, ctx);
          if (res.ok) sucesso++;
          else { falha++; if (erros.length < 10) erros.push(`ASO #${asoId}: ${res.erro}`); }
        }
        return { processados: alvo.length, sucesso, falha, erros };
      }),

    // Lista (read-only, tenant-safe) os ASOs ELEGÍVEIS p/ leitura por IA: ativos, COM
    // PDF anexado e SEM extração concluída/pendente (status "erro" volta à fila). Usado
    // pela tela p/ DIRIGIR o lote no cliente (1 ASO por vez via lerComIA), exibindo
    // progresso 0–100% detalhado. Espelha exatamente o filtro de pendência do lerLoteIA.
    listPendentesIA: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), limite: z.number().min(1).max(200).optional() }))
      .query(async ({ ctx, input }) => {
        await assertAiModuleEnabled(input.companyId, "rh");
        const db = (await getDb())!;
        const ids = await resolveCompanyIdsGuard(ctx, input);
        const limite = input.limite ?? 100;
        const pend = ((await db.execute(sql`
          SELECT a.id AS "asoId", a."employeeId" AS "employeeId",
            e."nomeCompleto", e.funcao, e."fotoUrl", a."dataExame" AS "dataExame"
          FROM asos a
          JOIN employees e ON e.id = a."employeeId"
          -- Rev. 3130: já lido por IA (aguardando_revisao | aprovado | rejeitado) NÃO reaparece; só 'erro' re-tenta.
          LEFT JOIN aso_extracao_ia x ON x.aso_id = a.id AND x.status IN ('aguardando_revisao', 'aprovado', 'rejeitado')
          WHERE a."companyId" IN (${sql.join(ids.map((id) => sql`${id}`), sql`,`)})
            AND a."deletedAt" IS NULL
            AND a."documentoUrl" IS NOT NULL AND TRIM(a."documentoUrl") <> ''
            AND x.id IS NULL
          ORDER BY a.id DESC
          LIMIT ${limite}
        `)) as any).rows as Array<{ asoId: number; employeeId: number; nomeCompleto: string; funcao: string | null; fotoUrl: string | null; dataExame: string | null }>;
        return pend;
      }),

    // Fila de revisão: extrações pendentes (ou por status) com dados do colaborador.
    listExtracoesIA: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), status: z.string().optional() }))
      .query(async ({ ctx, input }) => {
        await assertAiModuleEnabled(input.companyId, "rh");
        const db = (await getDb())!;
        const ids = await resolveCompanyIdsGuard(ctx, input);
        const status = input.status || "aguardando_revisao";
        const rows = ((await db.execute(sql`
          SELECT x.id, x.aso_id AS "asoId", x.employee_id AS "employeeId", x.status,
            x.resultado, x.apto_altura AS "aptoAltura", x.apto_espaco_confinado AS "aptoEspacoConfinado",
            x.restricoes, x.fatores_risco AS "fatoresRisco", x.exames_detectados_json AS "examesDetectadosJson",
            x.confianca, x.erro_msg AS "erroMsg", x.created_at AS "createdAt",
            e."nomeCompleto", e.cpf, e.funcao, e."fotoUrl",
            a.tipo, a."dataExame", a."dataValidade", a.resultado AS "resultadoAtual",
            a."aptoAltura" AS "aptoAlturaAtual", a."aptoEspacoConfinado" AS "aptoEspacoConfinadoAtual",
            a."restricoes" AS "restricoesAtual", a."documentoUrl"
          FROM aso_extracao_ia x
          JOIN asos a ON a.id = x.aso_id
          JOIN employees e ON e.id = x.employee_id
          WHERE x.company_id IN (${sql.join(ids.map((id) => sql`${id}`), sql`,`)})
            AND x.status = ${status}
          ORDER BY x.created_at DESC
        `)) as any).rows;
        return rows;
      }),

    // Aprova a extração: aplica os campos estruturados no ASO (com overrides do
    // revisor) e marca a fila como aprovada. UPDATE (R-001/R-007/R-010 OK).
    aprovarExtracaoIA: protectedProcedure
      .input(z.object({
        extracaoId: z.number(), companyId: z.number(), companyIds: z.array(z.number()).optional(),
        overrides: z.object({
          resultado: z.string().optional(),
          aptoAltura: z.string().optional(),
          aptoEspacoConfinado: z.string().optional(),
          restricoes: z.string().optional(),
        }).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await assertAiModuleEnabled(input.companyId, "rh");
        const db = (await getDb())!;
        const ids = await resolveCompanyIdsGuard(ctx, input);
        const [ext] = await db.select().from(asoExtracaoIa).where(eq(asoExtracaoIa.id, input.extracaoId)).limit(1);
        if (!ext || !ids.includes(ext.companyId)) throw new TRPCError({ code: "NOT_FOUND", message: "Extração não encontrada." });
        if (ext.status !== "aguardando_revisao") throw new TRPCError({ code: "BAD_REQUEST", message: "Esta extração já foi revisada." });

        const o = input.overrides || {};
        const aptoAltura = o.aptoAltura ?? ext.aptoAltura ?? null;
        const aptoEspacoConfinado = o.aptoEspacoConfinado ?? ext.aptoEspacoConfinado ?? null;
        const restricoes = o.restricoes ?? ext.restricoes ?? null;

        // Atômico: marca a fila como aprovada SÓ se ainda estiver pendente (guarda
        // contra corrida/duplo-clique) e, no mesmo passo, aplica no ASO. Se outra
        // chamada já aprovou, o UPDATE condicional não afeta linhas → aborta.
        await db.transaction(async (tx) => {
          const upd = (await tx.execute(sql`
            UPDATE aso_extracao_ia
            SET status = 'aprovado',
                apto_altura = ${aptoAltura}, apto_espaco_confinado = ${aptoEspacoConfinado}, restricoes = ${restricoes},
                revisado_por = ${ctx.user.name ?? "Sistema"}, revisado_por_user_id = ${ctx.user.id}, revisado_em = NOW()
            WHERE id = ${input.extracaoId} AND status = 'aguardando_revisao'
            RETURNING id
          `)) as any;
          if (!upd.rows || upd.rows.length === 0) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Esta extração já foi revisada." });
          }
          // Aplica no ASO (apenas colunas estruturadas aditivas; não toca no laudo bruto).
          await tx.update(asos).set({ aptoAltura, aptoEspacoConfinado, restricoes, updatedAt: sql`NOW()` } as any).where(eq(asos.id, ext.asoId));
        });

        return { success: true };
      }),

    // Rejeita a extração (não aplica nada no ASO).
    rejeitarExtracaoIA: protectedProcedure
      .input(z.object({ extracaoId: z.number(), companyId: z.number(), companyIds: z.array(z.number()).optional() }))
      .mutation(async ({ ctx, input }) => {
        await assertAiModuleEnabled(input.companyId, "rh");
        const db = (await getDb())!;
        const ids = await resolveCompanyIdsGuard(ctx, input);
        const [ext] = await db.select().from(asoExtracaoIa).where(eq(asoExtracaoIa.id, input.extracaoId)).limit(1);
        if (!ext || !ids.includes(ext.companyId)) throw new TRPCError({ code: "NOT_FOUND", message: "Extração não encontrada." });
        await db.update(asoExtracaoIa).set({
          status: "rejeitado",
          revisadoPor: ctx.user.name ?? "Sistema",
          revisadoPorUserId: ctx.user.id,
          revisadoEm: sql`NOW()` as any,
        }).where(eq(asoExtracaoIa.id, input.extracaoId));
        return { success: true };
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
          .where(and(companyFilter(employees.companyId, input), sql`${employees.deletedAt} IS NULL`));

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
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const rows = await db
          .select({
            id: atestados.id,
            companyId: atestados.companyId,
            employeeId: atestados.employeeId,
            nomeCompleto: employees.nomeCompleto,
            cpf: employees.cpf,
            funcao: employees.funcao,
            fotoUrl: employees.fotoUrl,
            tipo: atestados.tipo,
            dataEmissao: atestados.dataEmissao,
            diasAfastamento: atestados.diasAfastamento,
            horasAfastamento: atestados.horasAfastamento,
            afastamentoTipo: atestados.afastamentoTipo,
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
          .where(and(companyFilter(atestados.companyId, input), isNull(employees.deletedAt), empNaoDesligado(), isNull(atestados.deletedAt)))
          .orderBy(desc(atestados.dataEmissao));
        // Rev. 2478 — anexa flags CIPA (ativo + estabilidade pós-mandato).
        const { getCipaStatusByEmployeeIds, projectCipaFields } = await import("../_core/cipaStatus");
        const cipaMap = await getCipaStatusByEmployeeIds(db, input, rows.map((r: any) => r.employeeId));
        return rows.map((r: any) => ({ ...r, ...projectCipaFields(cipaMap, r.employeeId) }));
      }),

    create: protectedProcedure
      .input(
        z.object({
          companyId: z.number(),
          employeeId: z.number(),
          tipo: z.string(),
          dataEmissao: z.string(),
          diasAfastamento: z.number().default(0),
          horasAfastamento: z.coerce.number().default(0),
          afastamentoTipo: z.enum(["dia", "horas"]).default("dia"),
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
        const [result] = await db.insert(atestados).values({
          companyId: input.companyId,
          employeeId: input.employeeId,
          tipo: input.tipo,
          dataEmissao: input.dataEmissao,
          diasAfastamento: input.diasAfastamento,
          horasAfastamento: String(input.horasAfastamento || 0) as any,
          afastamentoTipo: input.afastamentoTipo || "dia",
          dataRetorno: input.dataRetorno || null,
          cid: input.cid || null,
          medico: input.medico || null,
          crm: input.crm || null,
          descricao: input.descricao || null,
          motivo: input.motivo || null,
          motivoOutro: input.motivoOutro || null,
        }).returning({ id: atestados.id });

        await abonarPontoPorAtestado(db, input.employeeId, input.companyId, input.dataEmissao, input.diasAfastamento, input.afastamentoTipo, input.horasAfastamento, result?.id);

        if (input.afastamentoTipo === "dia" && input.diasAfastamento > 0 && input.dataRetorno) {
          await handleAfastamentoStatus(db, input.employeeId, input.companyId, input.diasAfastamento, input.afastamentoTipo, input.dataRetorno, result?.id);
        }

        return { success: true, id: result?.id, afastamentoINSS: input.diasAfastamento > LIMITE_DIAS_INSS };
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          employeeId: z.number().optional(),
          tipo: z.string().optional(),
          dataEmissao: z.string().optional(),
          diasAfastamento: z.number().optional(),
          horasAfastamento: z.coerce.number().optional(),
          afastamentoTipo: z.enum(["dia", "horas"]).optional(),
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
        // numeric column: Drizzle requer string em INSERT/UPDATE
        if (updateData.horasAfastamento !== undefined) {
          updateData.horasAfastamento = String(updateData.horasAfastamento);
        }
        await db.update(atestados).set(updateData).where(eq(atestados.id, id));

        const [at] = await db.select().from(atestados).where(eq(atestados.id, id)).limit(1);
        if (at) {
          await abonarPontoPorAtestado(db, at.employeeId, at.companyId, at.dataEmissao, at.diasAfastamento || 0, (at as any).afastamentoTipo || "dia", (at as any).horasAfastamento || 0, at.id);

          const afTipo = (at as any).afastamentoTipo || "dia";
          const dias = at.diasAfastamento || 0;
          const retorno = at.dataRetorno;
          if (afTipo === "dia" && dias > 0 && retorno) {
            await handleAfastamentoStatus(db, at.employeeId, at.companyId, dias, afTipo, retorno, at.id);
          } else if ((at as any).statusAlterado === 1) {
            await db.update(atestados).set({
              statusAlterado: 0,
              statusAnterior: null,
              afastamentoINSS: 0,
            }).where(eq(atestados.id, at.id));
          }
        }

        return { success: true, afastamentoINSS: (at?.diasAfastamento || 0) > LIMITE_DIAS_INSS };
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
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
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
            fotoUrl: employees.fotoUrl,
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
          .where(and(companyFilter(trainings.companyId, input), isNull(employees.deletedAt), empNaoDesligado(), isNull(trainings.deletedAt)))
          .orderBy(desc(trainings.dataRealizacao));

        // Rev. 2478 — flags CIPA por colaborador.
        const { getCipaStatusByEmployeeIds, projectCipaFields } = await import("../_core/cipaStatus");
        const cipaMap = await getCipaStatusByEmployeeIds(db, input, rows.map((r: any) => r.employeeId));

        return rows.map((r: any) => {
          const cipaFlat = projectCipaFields(cipaMap, r.employeeId);
          if (r.dataValidade) {
            const { status, diasRestantes } = calcularStatusASO(r.dataValidade);
            return { ...r, ...cipaFlat, statusCalculado: status, diasRestantes };
          }
          return { ...r, ...cipaFlat, statusCalculado: "SEM VALIDADE", diasRestantes: 0 };
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

        const [insertResult] = await db.insert(trainings).values({
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
        }).returning();
        return { success: true, id: insertResult.id };
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
        // Convert empty strings to null for nullable fields, skip undefined
        const nullableFields = ['norma', 'cargaHoraria', 'dataValidade', 'instrutor', 'entidade', 'observacoes'];
        Object.entries(rest).forEach(([k, v]) => {
          if (v === undefined) return;
          if (v === '' && nullableFields.includes(k)) {
            updateData[k] = null;
          } else {
            updateData[k] = v;
          }
        });
        if (updateData.dataValidade && updateData.dataValidade !== null) {
          const { diasRestantes } = calcularStatusASO(updateData.dataValidade);
          updateData.statusTreinamento = diasRestantes < 0 ? "Vencido" : diasRestantes <= 30 ? "A_Vencer" : "Valido";
        } else if (updateData.dataValidade === null) {
          updateData.statusTreinamento = "Valido";
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
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const rows = await db
          .select({
            id: warnings.id,
            companyId: warnings.companyId,
            employeeId: warnings.employeeId,
            nomeCompleto: employees.nomeCompleto,
            cpf: employees.cpf,
            funcao: employees.funcao,
            setor: employees.setor,
            fotoUrl: employees.fotoUrl,
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
            assinaturaFuncionarioUrl: (warnings as any).assinaturaFuncionarioUrl,
            assinaturaAplicadorUrl:   (warnings as any).assinaturaAplicadorUrl,
          })
          .from(warnings)
          .innerJoin(employees, eq(warnings.employeeId, employees.id))
          .where(and(companyFilter(warnings.companyId, input), isNull(employees.deletedAt), empNaoDesligado(), isNull(warnings.deletedAt)))
          .orderBy(desc(warnings.dataOcorrencia));
        // Rev. 2478 — flags CIPA por colaborador.
        const { getCipaStatusByEmployeeIds, projectCipaFields } = await import("../_core/cipaStatus");
        const cipaMap = await getCipaStatusByEmployeeIds(db, input, rows.map((r: any) => r.employeeId));
        return rows.map((r: any) => ({ ...r, ...projectCipaFields(cipaMap, r.employeeId) }));
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
          .where(and(eq(warnings.employeeId, input.employeeId), companyFilter(warnings.companyId, input), isNull(warnings.deletedAt)));
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
        // Rev. 2734 — LGPD / Auditoria: após a assinatura do colaborador o documento é
        // IMUTÁVEL (a versão assinada precisa coincidir exatamente com a ciência dada).
        // Edição é bloqueada no servidor (autoritativo) — para corrigir, cancele e emita
        // uma nova advertência.
        const assinRows = ((await db.execute(
          sql`SELECT assinatura_funcionario_url FROM warnings WHERE id = ${id}`
        )) as any).rows || [];
        if (assinRows[0]?.assinatura_funcionario_url) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Documento já assinado pelo colaborador — não pode ser editado (LGPD/auditoria). Para corrigir, cancele e emita uma nova advertência.",
          });
        }
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

    salvarAssinatura: protectedProcedure
      .input(z.object({
        advertenciaId: z.number(),
        tipoAssinante: z.enum(["funcionario", "aplicador", "testemunha1", "testemunha2", "testemunha3"]),
        base64Png: z.string(),
        nomeAssinante: z.string().optional(),
        docAssinante: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        // Rev. 2734 — LGPD / Auditoria: a assinatura do colaborador é "once-only".
        // Depois de gravada, o documento fica imutável; não pode ser re-assinada
        // (re-assinar substituiria o artefato já assinado). Aplicador/testemunhas
        // continuam livres (podem assinar após o colaborador). Checa ANTES do upload
        // para não gerar arquivo órfão no storage.
        if (input.tipoAssinante === "funcionario") {
          const jaAssinRows = ((await db.execute(
            sql`SELECT assinatura_funcionario_url FROM warnings WHERE id = ${input.advertenciaId}`
          )) as any).rows || [];
          if (jaAssinRows[0]?.assinatura_funcionario_url) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Documento já assinado pelo colaborador — a assinatura não pode ser substituída (LGPD/auditoria). Para corrigir, cancele e emita uma nova advertência.",
            });
          }
        }
        const base64Data = input.base64Png.replace(/^data:image\/png;base64,/, "");
        const buffer = Buffer.from(base64Data, "base64");
        const key = `documentos/advertencias/assinaturas/${input.advertenciaId}-${input.tipoAssinante}-${Date.now()}.png`;
        const { url } = await storagePut(key, buffer, "image/png");

        let verif = { primeiraAssinatura: false, assinaturaDivergente: false, similaridade: null as number | null };

        if (input.tipoAssinante === "funcionario") {
          await db.execute(sql`UPDATE warnings SET assinatura_funcionario_url = ${url} WHERE id = ${input.advertenciaId}`);
          const [adv] = await db.select({ employeeId: warnings.employeeId }).from(warnings).where(eq(warnings.id, input.advertenciaId));
          if (adv?.employeeId) {
            verif = await verificarAssinaturaMemorial(db, adv.employeeId, input.base64Png);
          }
        } else if (input.tipoAssinante === "aplicador") {
          await db.execute(sql`UPDATE warnings SET assinatura_aplicador_url = ${url} WHERE id = ${input.advertenciaId}`);
        } else {
          const idx = parseInt(input.tipoAssinante.replace("testemunha", "")) - 1;
          const [adv] = await db.select({ testemunhas: warnings.testemunhas }).from(warnings).where(eq(warnings.id, input.advertenciaId));
          let arr: any[] = [];
          try { arr = JSON.parse(adv?.testemunhas || "[]"); } catch { arr = []; }
          while (arr.length <= idx) arr.push({ nome: "", doc: "" });
          arr[idx] = {
            ...arr[idx],
            assinaturaUrl: url,
            nome: input.nomeAssinante || arr[idx]?.nome || "",
            doc: input.docAssinante || arr[idx]?.doc || "",
          };
          await db.update(warnings).set({ testemunhas: JSON.stringify(arr) } as any).where(eq(warnings.id, input.advertenciaId));
        }
        return { url, ...verif };
      }),
  }),

  // ===================== RESUMO GERAL =====================
  resumo: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input }) => {
        const db = (await getDb())!;
      // Filtrar apenas documentos de funcionários não excluídos (deletedAt IS NULL)
      const [asoCount] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(asos)
        .innerJoin(employees, eq(asos.employeeId, employees.id))
        .where(and(companyFilter(asos.companyId, input), isNull(employees.deletedAt), empNaoDesligado(), isNull(asos.deletedAt)));

      const [treinamentoCount] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(trainings)
        .innerJoin(employees, eq(trainings.employeeId, employees.id))
        .where(and(companyFilter(trainings.companyId, input), isNull(employees.deletedAt), empNaoDesligado(), isNull(trainings.deletedAt)));

      const [atestadoCount] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(atestados)
        .innerJoin(employees, eq(atestados.employeeId, employees.id))
        .where(and(companyFilter(atestados.companyId, input), isNull(employees.deletedAt), empNaoDesligado(), isNull(atestados.deletedAt)));

      const [advertenciaCount] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(warnings)
        .innerJoin(employees, eq(warnings.employeeId, employees.id))
        .where(and(companyFilter(warnings.companyId, input), isNull(employees.deletedAt), empNaoDesligado(), isNull(warnings.deletedAt)));

      const hoje = new Date().toISOString().split("T")[0];
      const companyIds = resolveCompanyIds(input);
      const companyIdsSql = sql.join(companyIds.map(id => sql`${id}`), sql`,`);
      const asosVencidosRows = ((await db.execute(sql`
        SELECT COUNT(*) as count FROM asos a
        INNER JOIN employees e ON a."employeeId" = e.id
        WHERE a."companyId" IN (${companyIdsSql})
          AND e."deletedAt" IS NULL
          AND e.status NOT IN ('Desligado', 'Lista_Negra', 'Inativo')
          AND a."deletedAt" IS NULL
          AND a."dataValidade" < ${hoje}
          AND NOT EXISTS (
            SELECT 1 FROM asos a2
            WHERE a2."employeeId" = a."employeeId"
              AND a2."deletedAt" IS NULL
              AND a2."dataExame" > a."dataExame"
              AND a2."dataValidade" >= ${hoje}
          )
      `)) as any).rows || [];
      const asosVencidos = { count: Number(asosVencidosRows[0]?.count || 0) };

      // ASOs a vencer em 30 dias — exclui ASOs já SUBSTITUÍDOS por outro mais novo válido
      // (mesmo padrão NOT EXISTS usado em asosVencidos acima — Rev. 1828).
      const em30dias = new Date();
      em30dias.setDate(em30dias.getDate() + 30);
      const em30diasStr = em30dias.toISOString().split("T")[0];
      const asosAVencerRows = ((await db.execute(sql`
        SELECT COUNT(*) as count FROM asos a
        INNER JOIN employees e ON a."employeeId" = e.id
        WHERE a."companyId" IN (${companyIdsSql})
          AND e."deletedAt" IS NULL
          AND e.status NOT IN ('Desligado', 'Lista_Negra', 'Inativo')
          AND a."deletedAt" IS NULL
          AND a."dataValidade" >= ${hoje}
          AND a."dataValidade" <= ${em30diasStr}
          AND NOT EXISTS (
            SELECT 1 FROM asos a2
            WHERE a2."employeeId" = a."employeeId"
              AND a2."deletedAt" IS NULL
              AND a2."dataExame" > a."dataExame"
              AND a2."dataValidade" >= ${hoje}
          )
      `)) as any).rows || [];
      const asosAVencer = { count: Number(asosAVencerRows[0]?.count || 0) };

      // Treinamentos vencidos
      const [treinVencidos] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(trainings)
        .innerJoin(employees, eq(trainings.employeeId, employees.id))
        .where(and(companyFilter(trainings.companyId, input), isNull(employees.deletedAt), empNaoDesligado(), isNull(trainings.deletedAt), sql`${trainings.dataValidade} IS NOT NULL AND ${trainings.dataValidade} < ${hoje}`));

      // Treinamentos a vencer em 30 dias
      const [treinAVencer] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(trainings)
        .innerJoin(employees, eq(trainings.employeeId, employees.id))
        .where(and(
          companyFilter(trainings.companyId, input),
          isNull(employees.deletedAt),
          empNaoDesligado(),
          isNull(trainings.deletedAt),
          sql`${trainings.dataValidade} IS NOT NULL AND ${trainings.dataValidade} >= ${hoje} AND ${trainings.dataValidade} <= ${em30diasStr}`
        ));

      // Funcionários ativos SEM nenhum ASO
      const semAsoRows = ((await db.execute(sql`
        SELECT COUNT(*) as cnt FROM employees e
        WHERE e."companyId" IN (${sql.join(resolveCompanyIds(input).map(id => sql`${id}`), sql`,`)})
          AND e."deletedAt" IS NULL
          AND e.status = 'Ativo'
          AND NOT EXISTS (
            SELECT 1 FROM asos a WHERE a."employeeId" = e.id AND a."deletedAt" IS NULL
          )
      `)) as any).rows || [];

      return {
        totalASOs: Number(asoCount.count),
        totalTreinamentos: Number(treinamentoCount.count),
        totalAtestados: Number(atestadoCount.count),
        totalAdvertencias: Number(advertenciaCount.count),
        asosVencidos: Number(asosVencidos.count),
        asosAVencer: Number(asosAVencer.count),
        treinVencidos: Number(treinVencidos.count),
        treinAVencer: Number(treinAVencer.count),
        semASO: Number(semAsoRows[0]?.cnt || 0),
      };
    }),

  // ===================== FUNCIONÁRIOS SEM ASO =====================
  listSemASO: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const rows = ((await db.execute(sql`
        SELECT e.id, e."nomeCompleto", e.cpf, e.funcao, e."dataAdmissao", e.status,
          ob.nome as "obraNome"
        FROM employees e
        LEFT JOIN obra_funcionarios of2 ON of2."employeeId" = e.id AND of2."isActive" = 1
        LEFT JOIN obras ob ON of2."obraId" = ob.id
        WHERE e."companyId" IN (${sql.join(resolveCompanyIds(input).map(id => sql`${id}`), sql`,`)})
          AND e."deletedAt" IS NULL
          AND e.status = 'Ativo'
          AND NOT EXISTS (
            SELECT 1 FROM asos a WHERE a."employeeId" = e.id AND a."deletedAt" IS NULL
          )
        ORDER BY e."nomeCompleto" ASC
      `)) as any).rows || [];
      return rows as { id: number; nomeCompleto: string; cpf: string | null; funcao: string | null; dataAdmissao: string | null; status: string; obraNome: string | null }[];
    }),

  // ===================== RAIO-X DO FUNCIONÁRIO =====================
  raioX: protectedProcedure
    .input(z.object({ employeeId: z.number() }))
    .query(async ({ input, ctx }) => {
      // Rev. 2539 — LGPD: engenheiro de campo (e demais não-RH/Admin) só acessa o
      // dossiê de colaboradores alocados nas obras a que tem acesso. Fecha o vetor
      // de acesso por ID (rota /raio-x/:id) que burlava o filtro client-side da
      // lista do Raio-X. RH (admin de rh-dp) e Admin/Master seguem com acesso total.
      if (!(await userCanAccessEmployeeDossier(ctx.user.id, ctx.user.role, input.employeeId))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado: este colaborador não está alocado em uma obra sob sua gestão." });
      }
      // Rev. 2208 — sigilo Aviso Prévio no Raio-X: para usuários sem o flag
      // verStatusAviso (e não Master), o array `avisosPrevios` é zerado e
      // mascaramos `emp.status = 'Ativo'` se for 'Aviso'. Cobre banner vermelho
      // "EM AVISO PRÉVIO" e a seção "Avisos Prévios" no detalhe do Raio-X.
      const canSeeAviso = await userCanSeeAvisoStatus(ctx.user.id, ctx.user.role);
      const db = (await getDb())!;
      // Dados do funcionário
      const [emp] = await db.select().from(employees).where(eq(employees.id, input.employeeId));
      if (!emp) return null;
      // Rev. 2208 — mascara status real "Aviso" → "Ativo" no Raio-X.
      if (!canSeeAviso && (emp as any).status === 'Aviso') (emp as any).status = 'Ativo';
      // Buscar nome da obra principal
      let obraAtualNome: string | null = null;
      // Buscar obra via alocação ativa
      const [empObraAloc] = await db.select({ obraId: obraFuncionarios.obraId }).from(obraFuncionarios).where(and(eq(obraFuncionarios.employeeId, input.employeeId), eq(obraFuncionarios.isActive, 1)));
      if (empObraAloc) {
        const [obraAtual] = await db.select({ nome: obras.nome }).from(obras).where(eq(obras.id, empObraAloc.obraId));
        if (obraAtual) obraAtualNome = obraAtual.nome;
      }

      // Descrição da Função (CBO + Descrição + Ordem de Serviço NR-1)
      let funcaoDetalhes: any = null;
      if (emp.funcao) {
        const [jf] = await db.select().from(jobFunctions)
          .where(and(eq(jobFunctions.companyId, emp.companyId), eq(jobFunctions.nome, emp.funcao)))
          .limit(1);
        if (jf) funcaoDetalhes = { nome: jf.nome, cbo: jf.cbo, descricao: jf.descricao, ordemServico: jf.ordemServico };
      }

      const empAsos = await db.select().from(asos).where(and(eq(asos.employeeId, input.employeeId), isNull(asos.deletedAt))).orderBy(desc(asos.dataExame));

      const asoByTipo = new Map<string, any>();
      for (const a of empAsos) {
        if (!asoByTipo.has(a.tipo || "")) asoByTipo.set(a.tipo || "", a);
      }

      // Mesma regra cross-tipo do `asos.list` (Rev. 1828) — mantém Raio-X consistente com a tela principal.
      const TIPOS_SUBSTITUTIVOS_RX = new Set(["Admissional", "Periodico", "Retorno", "Mudanca_Funcao"]);
      const asosComStatus = empAsos.map(a => {
        const statusCalc = calcularStatusASO(a.dataValidade || "");
        const isLatestOfType = asoByTipo.get(a.tipo || "")?.id === a.id;

        const hasNewerSupersedingAso = empAsos.some(other =>
          other.id !== a.id &&
          TIPOS_SUBSTITUTIVOS_RX.has(other.tipo || "") &&
          (other.dataExame || "").localeCompare(a.dataExame || "") > 0 &&
          calcularStatusASO(other.dataValidade || "").status !== "VENCIDO"
        );
        if (hasNewerSupersedingAso) {
          return { ...a, status: "SUBSTITUÍDO", diasRestantes: statusCalc.diasRestantes, isHistorico: true };
        }
        if (statusCalc.status === "VENCIDO" && !isLatestOfType) {
          return { ...a, status: "SUBSTITUÍDO", diasRestantes: statusCalc.diasRestantes, isHistorico: true };
        }
        return { ...a, ...statusCalc, isHistorico: !isLatestOfType };
      });

      // Rev. 3119 — Mescla a leitura estruturada da IA (já APROVADA) em cada ASO p/ a
      // ficha do Raio-X. `aptoAltura/aptoEspacoConfinado/restricoes` já vivem em `asos`
      // (gravados na aprovação); `fatoresRisco`/`confianca` só existem na fila
      // `aso_extracao_ia`, então puxamos de lá (status "aprovado") sem tocar o laudo.
      const extracoesAprovadas = empAsos.length
        ? await db.select({
            asoId: asoExtracaoIa.asoId,
            aptoAltura: asoExtracaoIa.aptoAltura,
            aptoEspacoConfinado: asoExtracaoIa.aptoEspacoConfinado,
            restricoes: asoExtracaoIa.restricoes,
            fatoresRisco: asoExtracaoIa.fatoresRisco,
            confianca: asoExtracaoIa.confianca,
          }).from(asoExtracaoIa).where(and(
            eq(asoExtracaoIa.employeeId, input.employeeId),
            eq(asoExtracaoIa.companyId, emp.companyId),
            eq(asoExtracaoIa.status, "aprovado"),
          ))
        : [];
      const extracaoPorAso = new Map<number, any>();
      for (const e of extracoesAprovadas) extracaoPorAso.set(e.asoId, e);
      const asosComIa = asosComStatus.map((a: any) => {
        const ex = extracaoPorAso.get(a.id);
        const aptoAltura = a.aptoAltura ?? ex?.aptoAltura ?? null;
        const aptoEspacoConfinado = a.aptoEspacoConfinado ?? ex?.aptoEspacoConfinado ?? null;
        const restricoes = a.restricoes ?? ex?.restricoes ?? null;
        const fatoresRisco = ex?.fatoresRisco ?? null;
        const temIa = !!(aptoAltura || aptoEspacoConfinado || restricoes || fatoresRisco);
        return { ...a, aptoAltura, aptoEspacoConfinado, restricoes, fatoresRisco, iaConfianca: ex?.confianca ?? null, temIa };
      });

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
      // Empréstimos de ferramentas/equipamentos (Almoxarifado) — com nome da obra
      const empEmprestimosRaw = await db
        .select({
          id:               warehouseLoans.id,
          companyId:        warehouseLoans.companyId,
          obraId:           warehouseLoans.obraId,
          obraNome:         obras.nome,
          itemId:           warehouseLoans.itemId,
          itemNome:         warehouseLoans.itemNome,
          quantidade:       warehouseLoans.quantidade,
          funcionarioId:    warehouseLoans.funcionarioId,
          funcionarioCodigo:warehouseLoans.funcionarioCodigo,
          funcionarioNome:  warehouseLoans.funcionarioNome,
          dataEmprestimo:   warehouseLoans.dataEmprestimo,
          horaEmprestimo:   warehouseLoans.horaEmprestimo,
          dataDevolucao:    warehouseLoans.dataDevolucao,
          horaDevolucao:    warehouseLoans.horaDevolucao,
          status:           warehouseLoans.status,
          observacoes:      warehouseLoans.observacoes,
          almoxarifeId:     warehouseLoans.almoxarifeId,
          almoxarifeNome:   warehouseLoans.almoxarifeNome,
          createdAt:        warehouseLoans.createdAt,
        })
        .from(warehouseLoans)
        .leftJoin(obras, eq(warehouseLoans.obraId, obras.id))
        .where(eq(warehouseLoans.funcionarioId, input.employeeId))
        .orderBy(desc(warehouseLoans.dataEmprestimo));
      const empEmprestimos = empEmprestimosRaw;
      // Insumos/Consumíveis entregues ao funcionário
      const empInsumos = await db.select().from(almoxarifadoSaidasInsumo)
        .where(eq(almoxarifadoSaidasInsumo.funcionarioId, input.employeeId))
        .orderBy(desc(almoxarifadoSaidasInsumo.createdAt));
      // Rev. 2456 — Devoluções de equipamento LOCADO (fornecedor externo) em
      // que ESTE funcionário operou como entregador FC. Match user→employee
      // via e-mail (FC não tem coluna `employeeId` em users hoje). Mostra na
      // ficha tudo que o cara assinou pra devolver pra locadora, com obra,
      // descrição do equipamento e link pro comprovante PDF público.
      let empDevolucoesLocacao: any[] = [];
      // Rev. 2456 — só consulta se employee tem email válido (email NULL não
      // pode virar chave de match, senão `users.email = NULL` é sempre false
      // mas qualquer string vazia abriria cross-match acidental).
      // Rev. 2456 (fix code review) — TENANT ISOLATION: filtra explicitamente
      // por `equipamentoLocadoEventos.companyId = emp.companyId`. Sem isso,
      // 2 empresas diferentes com o mesmo email de user vazariam comprovantes
      // (que têm pdfComprovanteToken acessível via rota pública) entre tenants.
      if (emp.email && emp.email.trim() !== "") {
        empDevolucoesLocacao = await db
          .select({
            id:                       equipamentoLocadoEventos.id,
            companyId:                equipamentoLocadoEventos.companyId,
            dataEvento:               equipamentoLocadoEventos.dataEvento,
            obraId:                   equipamentoLocadoEventos.obraId,
            obraNome:                 obras.nome,
            equipamentoLocadoId:      equipamentoLocadoEventos.equipamentoLocadoId,
            equipamentoDescricao:     equipamentosLocados.descricao,
            fornecedorNome:           equipamentosLocados.fornecedorNome,
            codigoPatrimonio:         equipamentosLocados.codigoPatrimonioFornecedor,
            observacao:               equipamentoLocadoEventos.observacao,
            assinaturaRecebedorNome:  equipamentoLocadoEventos.assinaturaRecebedorNome,
            pdfComprovanteToken:      equipamentoLocadoEventos.pdfComprovanteToken,
          })
          .from(equipamentoLocadoEventos)
          .innerJoin(users, eq(users.id, equipamentoLocadoEventos.usuarioId))
          .leftJoin(equipamentosLocados, and(
            eq(equipamentosLocados.id, equipamentoLocadoEventos.equipamentoLocadoId),
            eq(equipamentosLocados.companyId, emp.companyId),
          ))
          .leftJoin(obras, eq(obras.id, equipamentoLocadoEventos.obraId))
          .where(and(
            eq(equipamentoLocadoEventos.companyId, emp.companyId),
            eq(equipamentoLocadoEventos.tipo, "DEVOLUCAO_FORNECEDOR"),
            eq(users.email, emp.email),
          ))
          .orderBy(desc(equipamentoLocadoEventos.dataEvento));
      }
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

      const empHeConfirmacoes = await db.select({
        id: heSolicitacaoConfirmacoes.id,
        solicitacaoId: heSolicitacaoConfirmacoes.solicitacaoId,
        confirmedAt: heSolicitacaoConfirmacoes.confirmedAt,
        compareceu: heSolicitacaoConfirmacoes.compareceu,
        registradoPor: heSolicitacaoConfirmacoes.registradoPor,
        registradoEm: heSolicitacaoConfirmacoes.registradoEm,
        observacao: heSolicitacaoConfirmacoes.observacao,
        assinaturaDivergente: heSolicitacaoConfirmacoes.assinaturaDivergente,
        similaridade: heSolicitacaoConfirmacoes.similaridade,
        dataSolicitacao: heSolicitacoes.dataSolicitacao,
        horaInicio: heSolicitacoes.horaInicio,
        horaFim: heSolicitacoes.horaFim,
        motivo: heSolicitacoes.motivo,
        statusSol: heSolicitacoes.status,
      }).from(heSolicitacaoConfirmacoes)
        .innerJoin(heSolicitacoes, eq(heSolicitacoes.id, heSolicitacaoConfirmacoes.solicitacaoId))
        // Rev. 2543 — BUG FIX: só conta se o funcionário AINDA é participante da solicitação.
        // `heSolicitacoes.editar` apaga/reinsere he_solicitacao_funcionarios, mas NUNCA remove
        // a confirmação correspondente → ela ficava órfã e gerava evento fantasma na timeline
        // ("HE — Ausência Confirmada" de uma HE que o funcionário não faz mais parte).
        .innerJoin(heSolicitacaoFuncionarios, and(
          eq(heSolicitacaoFuncionarios.solicitacaoId, heSolicitacaoConfirmacoes.solicitacaoId),
          eq(heSolicitacaoFuncionarios.employeeId, heSolicitacaoConfirmacoes.employeeId),
        ))
        .where(and(
          eq(heSolicitacaoConfirmacoes.employeeId, input.employeeId),
          // Rev. 2543 — solicitações canceladas/rejeitadas NÃO geram evento (registro "não existe").
          ne(heSolicitacoes.status, 'cancelada'),
          ne(heSolicitacoes.status, 'rejeitada'),
        ))
        .orderBy(desc(heSolicitacaoConfirmacoes.confirmedAt));

      // Rev. 2543 — dedup defensivo por id da confirmação: a tabela he_solicitacao_funcionarios
      // não tem UNIQUE(solicitacaoId, employeeId), então um vínculo duplicado faria o innerJoin
      // multiplicar a MESMA confirmação. Garante 1 evento por confirmação na timeline.
      const empHeConfirmacoesUnicas = Array.from(
        new Map(empHeConfirmacoes.map(c => [c.id, c])).values()
      );

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

      // HISTÓRICO DE OBRAS (alocação / transferência / saída) — fonte canônica
      // `employee_site_history`, gravada por `allocateEmployeeToObra`/`removeEmployeeFromObra`.
      // A timeline lia só `employee_history`, então a MUDANÇA DE OBRA nunca aparecia.
      const empSiteHistorico = await db.select().from(employeeSiteHistory)
        .where(eq(employeeSiteHistory.employeeId, input.employeeId))
        .orderBy(desc(employeeSiteHistory.dataInicio), desc(employeeSiteHistory.id));
      // Mapa id→nome das obras envolvidas (destino + origem), para rótulos legíveis.
      const obraIdsHist = Array.from(new Set(
        empSiteHistorico.flatMap(h => [h.obraId, h.obraOrigemId]).filter((x): x is number => typeof x === "number")
      ));
      const obraNomeMap = new Map<number, string>();
      if (obraIdsHist.length > 0) {
        const obrasHist = await db.select({ id: obras.id, nome: obras.nome }).from(obras).where(inArray(obras.id, obraIdsHist));
        obrasHist.forEach(o => obraNomeMap.set(o.id, o.nome));
      }

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
      // Rev. 2543 — refTipo/refId/meta dão RASTREABILIDADE: ao clicar no item da timeline,
      // o client abre um modal com TODAS as informações da fonte (meta) e o identificador (refTipo/refId).
      const timeline: Array<{ data: string; tipo: string; descricao: string; cor: string; icone: string; refTipo?: string; refId?: number | string | null; meta?: Record<string, any> }> = [];

      // Admissão
      if (emp.dataAdmissao) timeline.push({ data: emp.dataAdmissao, tipo: "Admissão", descricao: `Admitido como ${emp.funcao || emp.cargo || "-"} no setor ${emp.setor || "-"}`, cor: "green", icone: "user-plus", refTipo: "admissao", refId: emp.id, meta: { dataAdmissao: emp.dataAdmissao, funcao: emp.funcao, cargo: emp.cargo, setor: emp.setor, matricula: (emp as any).matricula, tipoContrato: emp.tipoContrato } });
      // Demissão
      if (emp.dataDemissao) timeline.push({ data: emp.dataDemissao, tipo: "Desligamento", descricao: `Desligado da empresa`, cor: "red", icone: "user-minus", refTipo: "desligamento", refId: emp.id, meta: { dataDemissao: emp.dataDemissao, motivoDemissao: (emp as any).motivoDemissao ?? null, status: emp.status } });
      // Histórico funcional
      empHistorico.forEach(h => {
        const tipoLabel: Record<string, string> = { Admissao: "Admissão", Promocao: "Promoção", Transferencia: "Transferência", Mudanca_Funcao: "Mudança de Função", Mudanca_Setor: "Mudança de Setor", Mudanca_Salario: "Alteração Salarial", Afastamento: "Afastamento", Retorno: "Retorno", Ferias: "Férias", Desligamento: "Desligamento", Outros: "Outros" };
        let desc = tipoLabel[h.tipo] || h.tipo;
        if (h.valorAnterior && h.valorNovo) desc += `: ${h.valorAnterior} → ${h.valorNovo}`;
        if (h.descricao) desc += ` — ${h.descricao}`;
        const corMap: Record<string, string> = { Promocao: "green", Mudanca_Salario: "blue", Mudanca_Funcao: "purple", Transferencia: "indigo", Afastamento: "amber", Retorno: "teal", Ferias: "cyan", Desligamento: "red" };
        timeline.push({ data: h.dataEvento, tipo: tipoLabel[h.tipo] || h.tipo, descricao: desc, cor: corMap[h.tipo] || "gray", icone: "history", refTipo: "historico", refId: h.id, meta: h });
      });
      // Histórico de obras (alocação / transferência / saída) — MUDANÇA DE OBRA na timeline.
      // Dedup: a transferência grava DUAS linhas no mesmo dia (uma 'saida' da obra de origem
      // + uma 'transferencia' p/ a obra destino). Mostramos só o lado de chegada; a 'saida'
      // de mesma data é suprimida. 'saida' avulsa (remoção sem nova obra) é exibida.
      // SÓ 'transferencia' entra no critério: a 'saida'-par só acompanha transferência
      // (a 1ª alocação não gera saída), então incluir 'alocacao' poderia ocultar por engano
      // uma saída avulsa que caia no mesmo dia de uma nova alocação por fluxo separado.
      const datasTransferencia = new Set(
        empSiteHistorico.filter(h => h.tipo === "transferencia").map(h => h.dataInicio)
      );
      empSiteHistorico.forEach(h => {
        const obraDest = obraNomeMap.get(h.obraId) || `Obra #${h.obraId}`;
        const obraOrig = h.obraOrigemId ? (obraNomeMap.get(h.obraOrigemId) || `Obra #${h.obraOrigemId}`) : null;
        const motivo = h.motivoTransferencia ? ` — ${h.motivoTransferencia}` : "";
        if (h.tipo === "transferencia") {
          timeline.push({ data: h.dataInicio, tipo: "Mudança de Obra", descricao: `Transferido${obraOrig ? ` de ${obraOrig}` : ""} para ${obraDest}${motivo}`, cor: "indigo", icone: "map-pin", refTipo: "obra_historico", refId: h.id, meta: h });
        } else if (h.tipo === "alocacao") {
          timeline.push({ data: h.dataInicio, tipo: "Alocação em Obra", descricao: `Alocado na obra ${obraDest}${motivo}`, cor: "green", icone: "map-pin", refTipo: "obra_historico", refId: h.id, meta: h });
        } else if (h.tipo === "saida") {
          // Suprime a 'saida' que é o par de uma transferência do mesmo dia
          const dataSaida = h.dataFim || h.dataInicio;
          if (datasTransferencia.has(dataSaida)) return;
          timeline.push({ data: dataSaida, tipo: "Saída de Obra", descricao: `Saiu da obra ${obraDest}${motivo}`, cor: "gray", icone: "map-pin", refTipo: "obra_historico", refId: h.id, meta: h });
        }
      });
      // ASOs
      empAsos.forEach(a => timeline.push({ data: a.dataExame, tipo: "ASO", descricao: `${a.tipo || "Exame"} — ${a.resultado || "Pendente"}`, cor: "blue", icone: "stethoscope", refTipo: "aso", refId: a.id, meta: a }));
      // Treinamentos
      empTreinamentos.forEach(t => timeline.push({ data: t.dataRealizacao, tipo: "Treinamento", descricao: `${t.nome}${t.norma ? ` (${t.norma})` : ""}`, cor: "emerald", icone: "graduation-cap", refTipo: "treinamento", refId: t.id, meta: t }));
      // Advertências
      empAdvertencias.forEach(a => {
        const tipoAdv = a.tipoAdvertencia === "Suspensao" ? "Suspensão" : a.tipoAdvertencia === "JustaCausa" ? "Justa Causa" : a.tipoAdvertencia;
        timeline.push({ data: a.dataOcorrencia, tipo: `Advertência (${tipoAdv})`, descricao: a.motivo || "-", cor: a.tipoAdvertencia === "Suspensao" || a.tipoAdvertencia === "JustaCausa" ? "red" : "orange", icone: "alert-triangle", refTipo: "advertencia", refId: a.id, meta: a });
      });
      // Atestados
      empAtestados.forEach(a => timeline.push({ data: a.dataEmissao, tipo: "Atestado", descricao: `${a.tipo || "Médico"} — ${a.diasAfastamento || 0} dia(s)${a.cid ? ` (CID: ${a.cid})` : ""}`, cor: "purple", icone: "clipboard", refTipo: "atestado", refId: a.id, meta: a }));
      // Acidentes
      empAcidentes.forEach(a => timeline.push({ data: a.dataAcidente, tipo: "Acidente", descricao: `${a.tipoAcidente} (${a.gravidade})${a.diasAfastamento ? ` — ${a.diasAfastamento} dias afastado` : ""}`, cor: "red", icone: "alert-circle", refTipo: "acidente", refId: a.id, meta: a }));
      // EPIs
      empEpis.forEach(e => { if (e.dataEntrega) timeline.push({ data: e.dataEntrega, tipo: "EPI", descricao: `Entrega: ${e.nomeEpi || "EPI"}${e.ca ? ` (CA: ${e.ca})` : ""} — Qtd: ${e.quantidade || 1}`, cor: "teal", icone: "hard-hat", refTipo: "epi", refId: e.id, meta: e }); });
      // Empréstimos de ferramentas/equipamentos
      empEmprestimos.forEach(l => {
        const obraInfo = (l as any).obraNome ? ` — Obra: ${(l as any).obraNome}` : "";
        timeline.push({ data: l.dataEmprestimo, tipo: "Empréstimo", descricao: `Retirou: ${l.itemNome} — Qtd: ${parseFloat(l.quantidade as any) || 1} un${obraInfo}${l.almoxarifeNome ? ` (Almoxarife: ${l.almoxarifeNome})` : ""}`, cor: "blue", icone: "wrench", refTipo: "emprestimo", refId: l.id, meta: l });
        if (l.dataDevolucao) timeline.push({ data: l.dataDevolucao, tipo: "Devolução", descricao: `Devolveu: ${l.itemNome}${obraInfo}`, cor: "gray", icone: "check-circle", refTipo: "emprestimo", refId: l.id, meta: l });
      });
      // Rev. 2456 — Devoluções de equipamento LOCADO (fornecedor externo)
      // que este funcionário assinou como entregador FC.
      empDevolucoesLocacao.forEach((d: any) => {
        const dataDev = (d.dataEvento || "").toString().slice(0, 10);
        if (!dataDev) return;
        const equip = d.equipamentoDescricao || `Equip. #${d.equipamentoLocadoId}`;
        const obraInfo = d.obraNome ? ` — Obra: ${d.obraNome}` : "";
        const forn = d.fornecedorNome ? ` para ${d.fornecedorNome}` : "";
        const rec = d.assinaturaRecebedorNome ? ` (recebido por: ${d.assinaturaRecebedorNome})` : "";
        timeline.push({
          data: dataDev,
          tipo: "Devolução Locação",
          descricao: `Devolveu equipamento locado: ${equip}${forn}${obraInfo}${rec}`,
          cor: "orange",
          icone: "truck",
          refTipo: "devolucaoLocacao", refId: d.id ?? d.equipamentoLocadoId, meta: d,
        });
      });

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

      // Resumo de ponto agrupado por mês (com faltas e assiduidade %)
      const pontoResumoMap: Record<string, { diasTrabalhados: number; horasTrabalhadas: string; horasExtras: string; atrasos: string; faltas: number; ajustesManuais: number; assiduidadePerc: number }> = {};
      empPonto.forEach((p: any) => {
        const mesRef = p.mesReferencia || (p.data ? p.data.substring(0, 7) : null);
        if (!mesRef) return;
        if (!pontoResumoMap[mesRef]) pontoResumoMap[mesRef] = { diasTrabalhados: 0, horasTrabalhadas: "0:00", horasExtras: "0:00", atrasos: "0:00", faltas: 0, ajustesManuais: 0, assiduidadePerc: 100 };
        const faltouNoDia = Number(p.faltas || 0) > 0;
        if (faltouNoDia) {
          pontoResumoMap[mesRef].faltas++;
        } else {
          pontoResumoMap[mesRef].diasTrabalhados++;
        }
        if (p.ajusteManual) pontoResumoMap[mesRef].ajustesManuais++;
      });
      // Calcula assiduidade % por mês: diasTrabalhados / (diasTrabalhados + faltas) * 100
      Object.values(pontoResumoMap).forEach((m: any) => {
        const totalDias = m.diasTrabalhados + m.faltas;
        m.assiduidadePerc = totalDias > 0 ? Math.round((m.diasTrabalhados / totalDias) * 1000) / 10 : 100;
      });
      const pontoResumo = Object.entries(pontoResumoMap)
        .map(([mesRef, dados]) => ({ mesReferencia: mesRef, ...dados }))
        .sort((a, b) => b.mesReferencia.localeCompare(a.mesReferencia));

      // Assiduidade GERAL (média ponderada): soma(diasTrab) / soma(diasTrab + faltas)
      let assiduidadeMedia = 100;
      let totalDiasTrab = 0;
      let totalFaltas = 0;
      let mesesComRegistro = pontoResumo.length;
      pontoResumo.forEach((m: any) => { totalDiasTrab += m.diasTrabalhados; totalFaltas += m.faltas; });
      const totalGeralDias = totalDiasTrab + totalFaltas;
      if (totalGeralDias > 0) {
        assiduidadeMedia = Math.round((totalDiasTrab / totalGeralDias) * 1000) / 10;
      }
      const assiduidade = {
        media: assiduidadeMedia,
        totalDiasTrabalhados: totalDiasTrab,
        totalFaltas,
        mesesAvaliados: mesesComRegistro,
      };

      // Atrasos detalhados (registros de ponto com atraso)
      const atrasosDetalhados = empPonto
        .filter((p: any) => p.atrasos && p.atrasos !== "0:00" && p.atrasos !== "00:00")
        .map((p: any) => ({ data: p.data, entrada1: p.entrada1, atraso: p.atrasos, mesReferencia: p.mesReferencia || (p.data ? p.data.substring(0, 7) : "") }));

      // Faltas detalhadas
      const faltasDetalhadas = empPonto
        .filter((p: any) => p.faltas && Number(p.faltas) > 0)
        .map((p: any) => ({ data: p.data, faltas: p.faltas, mesReferencia: p.mesReferencia || (p.data ? p.data.substring(0, 7) : "") }));

      // FALTAS na timeline — 1 evento por falta
      faltasDetalhadas.forEach((f: any) => {
        if (!f.data) return;
        const qtd = Number(f.faltas || 1);
        const desc = qtd > 1
          ? `${qtd} falta(s) no dia — sem registro de presença no ponto`
          : `Falta registrada no cartão de ponto`;
        timeline.push({ data: f.data, tipo: "Falta", descricao: desc, cor: "red", icone: "user-x", refTipo: "falta", refId: f.data, meta: f });
      });

      // AVISO PRÉVIO — Rev. 2208: respeita sigilo (zera lista se sem clearance)
      const empAvisosPrevios = canSeeAviso ? await db.select().from(terminationNotices)
        .where(and(eq(terminationNotices.employeeId, input.employeeId), isNull(terminationNotices.deletedAt)))
        .orderBy(desc(terminationNotices.dataInicio)) : [];

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

      // ===== DDS — Diálogos Diários de Segurança que o funcionário participou (Rev. 1768) =====
      const empDdsRows = await db.select({
        sfId: ddsSessaoFuncionarios.id,
        sessaoId: ddsSessoes.id,
        data: ddsSessoes.data,
        hora: ddsSessoes.hora,
        tituloTema: ddsSessoes.tituloTema,
        instrutor: ddsSessoes.instrutor,
        local: ddsSessoes.local,
        obraId: ddsSessoes.obraId,
        obraNome: ddsSessoes.obraNome,
        status: ddsSessoes.status,
        presente: ddsSessaoFuncionarios.presente,
        assinaturaTipo: ddsSessaoFuncionarios.assinaturaTipo,
        assinadoEm: ddsSessaoFuncionarios.assinadoEm,
        temAssinatura: sql<boolean>`(${ddsSessaoFuncionarios.assinaturaImg} IS NOT NULL AND length(${ddsSessaoFuncionarios.assinaturaImg}) > 0)`,
      })
        .from(ddsSessaoFuncionarios)
        .innerJoin(ddsSessoes, eq(ddsSessoes.id, ddsSessaoFuncionarios.sessaoId))
        .where(and(
          eq(ddsSessaoFuncionarios.employeeId, input.employeeId),
          eq(ddsSessoes.companyId, emp.companyId),
          isNull(ddsSessoes.deletedAt),
        ))
        .orderBy(desc(ddsSessoes.data));

      // PJ CONTRATOS
      const empPjContratos = await db.select().from(pjContracts)
        .where(and(eq(pjContracts.employeeId, input.employeeId), isNull(pjContracts.deletedAt)))
        .orderBy(desc(pjContracts.dataInicio));

      // PJ PAGAMENTOS
      const empPjPagamentos = await db.select().from(pjPayments)
        .where(eq(pjPayments.employeeId, input.employeeId))
        .orderBy(desc(pjPayments.mesReferencia));

      // PJ CONFORMIDADE — apenas para funcionários PJ (5 itens: das, nf, cnd, seguro_vida, status_cnpj)
      let empPjConformidade: any = null;
      if (emp.tipoContrato === 'PJ') {
        try {
          const d = new Date();
          const mesRef = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
          const today = d.toISOString().slice(0, 10);
          // Defesa em profundidade: filtra também por companyId do funcionário já carregado
          const r: any = await db.execute(sql`
            SELECT * FROM pj_conformidade
            WHERE "deletedAt" IS NULL
              AND "companyId" = ${emp.companyId}
              AND "employeeId" = ${input.employeeId}
              AND (
                ("tipo" IN ('das','nf') AND "competencia" = ${mesRef})
                OR "tipo" IN ('cnd','seguro_vida','status_cnpj')
              )
            ORDER BY "createdAt" DESC
          `);
          const itens: any[] = r?.rows ?? [];
          const TIPOS = ["das","nf","cnd","seguro_vida","status_cnpj"];
          const MENSAIS = new Set(["das","nf"]);
          const byTipo: Record<string, any> = {};
          for (const tipo of TIPOS) {
            if (MENSAIS.has(tipo)) {
              byTipo[tipo] = itens.find((i: any) => i.tipo === tipo && i.competencia === mesRef) || { tipo, competencia: mesRef, status: "pendente" };
            } else {
              const it = itens.filter((i: any) => i.tipo === tipo)[0];
              if (it && it.dataVencimento && it.dataVencimento < today && it.status !== "na") {
                it.statusComputed = "vencido";
              } else if (it) {
                it.statusComputed = it.status;
              }
              byTipo[tipo] = it || { tipo, competencia: null, status: "pendente" };
            }
          }
          const pendencias = TIPOS.filter(t => {
            const s = byTipo[t]?.statusComputed || byTipo[t]?.status;
            return s === "pendente" || s === "vencido";
          }).length;
          empPjConformidade = { mesReferencia: mesRef, itens: byTipo, pendencias };
        } catch (e: any) {
          // Tabela pode ainda não existir — devolve null silenciosamente
          empPjConformidade = null;
        }
      }

      // DESCONTOS ALMOXARIFADO (itens perdidos)
      const empDescontosAlmox = await db.select()
        .from(almoxarifadoDescontoFolha)
        .where(eq(almoxarifadoDescontoFolha.employeeId, input.employeeId))
        .orderBy(desc(almoxarifadoDescontoFolha.criadoEm));

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
      // AVISO PRÉVIO - com status detalhado
      empAvisosPrevios.forEach(a => {
        const quem = a.tipo.startsWith('empregador') ? 'Pelo Empregador' : 'Pelo Empregado';
        const statusMap: Record<string, { label: string; cor: string }> = {
          em_andamento: { label: 'Em Andamento', cor: 'orange' },
          concluido: { label: 'Concluído', cor: 'green' },
          cancelado: { label: 'Cancelado', cor: 'red' },
        };
        const st = statusMap[a.status] || { label: a.status, cor: 'orange' };
        timeline.push({ data: a.dataInicio, tipo: 'Aviso Prévio', descricao: `${quem} — ${a.diasAviso || 30} dias — Status: ${st.label}`, cor: st.cor, icone: 'alert-triangle', refTipo: 'avisoPrevio', refId: a.id, meta: a });
        // Se concluído, adicionar evento de conclusão
        if (a.status === 'concluido' && a.dataFim) {
          timeline.push({ data: a.dataFim, tipo: 'Aviso Prévio Concluído', descricao: `Aviso prévio encerrado (${quem})`, cor: 'green', icone: 'check-circle', refTipo: 'avisoPrevio', refId: a.id, meta: a });
        }
        // Se cancelado, adicionar evento de cancelamento
        if (a.status === 'cancelado') {
          timeline.push({ data: a.updatedAt ? new Date(a.updatedAt).toISOString().split('T')[0] : a.dataInicio, tipo: 'Aviso Prévio Cancelado', descricao: `Aviso prévio cancelado (${quem})`, cor: 'red', icone: 'x-circle', refTipo: 'avisoPrevio', refId: a.id, meta: a });
        }
      });
      // FÉRIAS - Rev. 2066: emite até 3 eventos (período aquisitivo, gozo, retorno)
      empFerias.forEach(f => {
        // 1) Abertura do período aquisitivo (sempre preenchido) — mostra mesmo quando ainda não houve gozo
        if (f.periodoAquisitivoInicio) {
          timeline.push({
            data: f.periodoAquisitivoInicio,
            tipo: 'Férias — Período Aquisitivo',
            descricao: `Iniciou período aquisitivo (concessivo até ${f.periodoConcessivoFim || '-'})`,
            cor: 'sky',
            icone: 'calendar',
            refTipo: 'ferias', refId: f.id, meta: f,
          });
        }
        // 2) Início do gozo (se já agendado)
        if (f.dataInicio) {
          const desc = `${f.diasGozo || 30} dias${f.abonoPecuniario ? ' + abono pecuniário' : ''}${f.dataFim ? ` (até ${f.dataFim})` : ''} — Status: ${f.status || 'pendente'}`;
          timeline.push({ data: f.dataInicio, tipo: 'Férias — Início Gozo', descricao: desc, cor: 'cyan', icone: 'palmtree', refTipo: 'ferias', refId: f.id, meta: f });
        }
        // 3) Retorno (fim do gozo)
        if (f.dataFim) {
          timeline.push({ data: f.dataFim, tipo: 'Férias — Retorno', descricao: `Retornou das férias`, cor: 'teal', icone: 'check-circle', refTipo: 'ferias', refId: f.id, meta: f });
        }
      });

      // Rev. 2066 — FOLHA DE PAGAMENTO (mensal)
      empPayroll.forEach((p: any) => {
        const data = p.dataPagamento || (p.mesReferencia ? `${p.mesReferencia}-05` : null);
        if (!data) return;
        const liq = p.salarioLiquido ? `R$ ${p.salarioLiquido}` : (p.salarioBruto ? `R$ ${p.salarioBruto} (bruto)` : '-');
        timeline.push({
          data,
          tipo: 'Folha de Pagamento',
          descricao: `Competência ${p.mesReferencia || '-'} — Líquido: ${liq}`,
          cor: 'green',
          icone: 'dollar-sign',
          refTipo: 'folha', refId: p.id, meta: p,
        });
      });

      // Rev. 2066 — VALE ALIMENTAÇÃO / VR (mensal)
      empVR.forEach((v: any) => {
        const data = v.mesReferencia ? `${v.mesReferencia}-01` : (v.createdAt ? new Date(v.createdAt).toISOString().split('T')[0] : null);
        if (!data) return;
        const operadora = v.operadora ? ` · ${v.operadora}` : '';
        timeline.push({
          data,
          tipo: 'VR / Vale Alimentação',
          descricao: `Competência ${v.mesReferencia || '-'} — Total: R$ ${v.valorTotal || '0'} (${v.diasUteis || 0} dias úteis${operadora}) — ${v.status || 'pendente'}`,
          cor: 'lime',
          icone: 'shopping-cart',
          refTipo: 'vr', refId: v.id, meta: v,
        });
      });

      // Rev. 2066 — ADIANTAMENTOS
      empAdiantamentos.forEach((a: any) => {
        const data = a.dataPagamento || (a.mesReferencia ? `${a.mesReferencia}-15` : null);
        if (!data) return;
        const valor = a.valorLiquido || a.valorAdiantamento || '0';
        timeline.push({
          data,
          tipo: 'Adiantamento',
          descricao: `Competência ${a.mesReferencia || '-'} — Valor: R$ ${valor}${a.aprovado ? ` (${a.aprovado})` : ''}`,
          cor: 'yellow',
          icone: 'wallet',
          refTipo: 'adiantamento', refId: a.id, meta: a,
        });
      });

      // Rev. 2066 — RATEIO HORAS POR OBRA (mensal)
      empRateio.forEach((r: any) => {
        const data = r.mesAno ? `${r.mesAno}-01` : null;
        if (!data) return;
        timeline.push({
          data,
          tipo: 'Rateio Horas/Obra',
          descricao: `${r.nomeObra || `Obra #${r.obraId}`} — ${r.diasTrabalhados || 0} dias · ${r.horasNormais || '0'}h normais + ${r.horasExtras || '0'}h extras (total ${r.totalHoras || '0'}h)`,
          cor: 'blue',
          icone: 'building',
          refTipo: 'rateio', refId: r.id, meta: r,
        });
      });

      // Rev. 2066 — INSUMOS / CONSUMÍVEIS entregues
      empInsumos.forEach((i: any) => {
        const data = i.createdAt ? new Date(i.createdAt).toISOString().split('T')[0] : null;
        if (!data) return;
        timeline.push({
          data,
          tipo: 'Insumo',
          descricao: `Recebeu: ${i.itemNome || 'Insumo'} — Qtd: ${parseFloat(i.quantidade as any) || 1}${i.unidade ? ` ${i.unidade}` : ''}${i.obraNome ? ` — Obra: ${i.obraNome}` : ''}${i.motivo ? ` (${i.motivo})` : ''}`,
          cor: 'orange',
          icone: 'package',
          refTipo: 'insumo', refId: i.id, meta: i,
        });
      });

      // Rev. 2066 — DESCONTOS ALMOXARIFADO (itens perdidos)
      empDescontosAlmox.forEach((d: any) => {
        const data = d.criadoEm ? new Date(d.criadoEm).toISOString().split('T')[0] : null;
        if (!data) return;
        timeline.push({
          data,
          tipo: 'Desconto Almoxarifado',
          descricao: `${d.itemNome || 'Item'} — R$ ${d.valorDesconto || '0'} — ${d.status || 'Pendente'}${d.descricao ? ` (${d.descricao})` : ''}`,
          cor: 'red',
          icone: 'minus-circle',
          refTipo: 'descontoAlmox', refId: d.id, meta: d,
        });
      });

      // Rev. 2066 — ATRASOS DETALHADOS (1 evento por dia com atraso)
      atrasosDetalhados.forEach((a: any) => {
        if (!a.data) return;
        timeline.push({
          data: a.data,
          tipo: 'Atraso',
          descricao: `Atraso de ${a.atraso}${a.entrada1 ? ` (entrada ${a.entrada1})` : ''}`,
          cor: 'amber',
          icone: 'clock',
          refTipo: 'atraso', refId: a.data, meta: a,
        });
      });

      // Rev. 2066 — PJ PAGAMENTOS
      empPjPagamentos.forEach((p: any) => {
        const data = p.dataPagamento || p.dataPrevista || (p.mesReferencia ? `${p.mesReferencia}-05` : null);
        if (!data) return;
        timeline.push({
          data,
          tipo: 'Pagamento PJ',
          descricao: `${p.tipo || 'Pagamento'} · ${p.mesReferencia || '-'} — R$ ${p.valor || '0'} (${p.status || 'pendente'})${p.descricao ? ` — ${p.descricao}` : ''}`,
          cor: 'indigo',
          icone: 'file-text',
          refTipo: 'pjPagamento', refId: p.id, meta: p,
        });
      });
      // DDS na timeline (Rev. 1768) — 1 evento por sessão
      empDdsRows.forEach((d: any) => {
        if (!d.data) return;
        const obra = d.obraNome ? ` · ${d.obraNome}` : '';
        const horaTxt = d.hora ? ` ${d.hora}` : '';
        const presenteOk = Number(d.presente || 0) === 1;
        const assinou = !!d.temAssinatura || d.assinaturaTipo === 'fcsign';
        const statusBits: string[] = [];
        statusBits.push(presenteOk ? 'Presente' : 'Ausente');
        if (assinou) {
          statusBits.push(d.assinaturaTipo === 'desenhada' ? 'Assinou (digital)'
                        : d.assinaturaTipo === 'fcsign' ? 'Assinou (FCsign)'
                        : 'Assinou');
        } else if (presenteOk) {
          statusBits.push('Sem assinatura');
        }
        if (d.status === 'cancelada') statusBits.push('Sessão cancelada');
        const cor = d.status === 'cancelada' ? 'gray'
                  : (presenteOk && assinou) ? 'emerald'
                  : presenteOk ? 'amber'
                  : 'red';
        timeline.push({
          data: d.data,
          tipo: 'DDS',
          descricao: `${d.tituloTema}${horaTxt}${obra}${d.instrutor ? ` — Instrutor: ${d.instrutor}` : ''} (${statusBits.join(' · ')})`,
          cor,
          icone: 'message-square',
          refTipo: 'dds', refId: d.sessaoId, meta: d,
        });
      });

      // CIPA - participação
      empCipa.forEach(c => {
        if (c.mandatoInicio) {
          timeline.push({ data: c.mandatoInicio, tipo: 'CIPA', descricao: `Membro CIPA — ${c.cargoCipa || 'Membro'} (${c.representacao || '-'}) — Status: ${c.statusMembro || '-'}`, cor: 'emerald', icone: 'shield', refTipo: 'cipa', refId: c.id, meta: c });
        }
      });
      // PJ CONTRATOS
      empPjContratos.forEach(c => {
        if (c.dataInicio) {
          timeline.push({ data: c.dataInicio, tipo: 'Contrato PJ', descricao: `Contrato PJ — ${c.status || 'Ativo'}${c.dataFim ? ` (até ${c.dataFim})` : ''}`, cor: 'indigo', icone: 'file-signature', refTipo: 'pjContrato', refId: c.id, meta: c });
        }
      });
      // HORAS EXTRAS
      empHorasExtras.forEach(h => {
        const heData = h.dataPagamento || (h.mesReferencia ? `${h.mesReferencia}-01` : null);
        if (heData) {
          timeline.push({ data: heData, tipo: 'Hora Extra', descricao: `${parseFloat(h.quantidadeHoras || '0').toFixed(1)}h — ${h.descricao || 'Sem descrição'}`, cor: 'amber', icone: 'clock', refTipo: 'horaExtra', refId: h.id, meta: h });
        }
      });
      // DESCONTO EPI
      empEpiDiscountAlerts.forEach(d => {
        if (d.createdAt) {
          const dataStr = new Date(d.createdAt).toISOString().split('T')[0];
          timeline.push({ data: dataStr, tipo: 'Desconto EPI', descricao: `${d.epiNome || 'EPI'} — R$ ${d.valorTotal || '0'} — ${d.status || 'Pendente'}`, cor: d.status === 'confirmado' ? 'red' : 'amber', icone: 'hard-hat', refTipo: 'descontoEpi', refId: d.id, meta: d });
        }
      });
      // PROCESSOS TRABALHISTAS
      processosComAndamentos.forEach((p: any) => {
        if (p.dataAbertura) {
          timeline.push({ data: p.dataAbertura, tipo: 'Processo Trabalhista', descricao: `Processo nº ${p.numeroProcesso || '-'} — ${p.status || '-'}`, cor: 'red', icone: 'gavel', refTipo: 'processo', refId: p.id, meta: p });
        }
      });

      empHeConfirmacoesUnicas.forEach(c => {
        const dataEvt = c.dataSolicitacao || (c.confirmedAt ? new Date(c.confirmedAt).toISOString().split("T")[0] : null);
        if (!dataEvt) return;
        const horario = c.horaInicio && c.horaFim ? ` (${c.horaInicio}–${c.horaFim})` : "";
        const alertaAss = c.assinaturaDivergente ? ` ⚠️ ASSINATURA DIVERGENTE (${c.similaridade || 0}% similaridade)` : "";
        if (c.compareceu === false) {
          timeline.push({ data: dataEvt, tipo: "HE — Ausência Confirmada", descricao: `Confirmou presença na HE${horario} mas NÃO compareceu. Motivo HE: ${c.motivo || "-"}${c.observacao ? `. Obs: ${c.observacao}` : ""}${alertaAss}`, cor: "red", icone: "user-x", refTipo: "heConfirmacao", refId: c.id, meta: c });
        } else if (c.compareceu === true) {
          timeline.push({ data: dataEvt, tipo: "HE — Presença Confirmada", descricao: `Confirmou e compareceu à HE${horario}. Motivo: ${c.motivo || "-"}${alertaAss}`, cor: "green", icone: "user-check", refTipo: "heConfirmacao", refId: c.id, meta: c });
        } else {
          timeline.push({ data: dataEvt, tipo: "HE — Assinatura Confirmação", descricao: `Assinou confirmação de presença para HE${horario}. Aguardando registro de comparecimento.${alertaAss}`, cor: c.assinaturaDivergente ? "red" : "amber", icone: c.assinaturaDivergente ? "alert-triangle" : "pen-tool", refTipo: "heConfirmacao", refId: c.id, meta: c });
        }
      });

      // ===== Lançamentos em parceiros conveniados (mercado/farmácia/etc) =====
      const empParceirosLancRows = await db.select({
        id: lancamentosParceiros.id,
        parceiroId: lancamentosParceiros.parceiroId,
        dataCompra: lancamentosParceiros.dataCompra,
        descricaoItens: lancamentosParceiros.descricaoItens,
        valor: lancamentosParceiros.valor,
        status: lancamentosParceiros.status,
        motivoRejeicao: lancamentosParceiros.motivoRejeicao,
        comprovanteUrl: lancamentosParceiros.comprovanteUrl,
        competenciaDesconto: lancamentosParceiros.competenciaDesconto,
        aprovadoEm: lancamentosParceiros.aprovadoEm,
        aprovadoPor: lancamentosParceiros.aprovadoPor,
        createdAt: lancamentosParceiros.createdAt,
        parceiroNome: parceirosConveniados.nomeFantasia,
        parceiroRazao: parceirosConveniados.razaoSocial,
        tipoConvenio: parceirosConveniados.tipoConvenio,
      })
        .from(lancamentosParceiros)
        .leftJoin(parceirosConveniados, eq(parceirosConveniados.id, lancamentosParceiros.parceiroId))
        .where(and(
          eq(lancamentosParceiros.employeeId, input.employeeId),
          eq(lancamentosParceiros.companyId, emp.companyId),
        ))
        .orderBy(desc(lancamentosParceiros.dataCompra));

      const empParceirosLanc = empParceirosLancRows.map(r => ({
        ...r,
        parceiroNomeExibicao: r.parceiroNome || r.parceiroRazao || `Parceiro #${r.parceiroId}`,
      }));

      // Eventos na timeline (compra em parceiro)
      const tipoLabelConv: Record<string, string> = {
        mercado: "Mercado", farmacia: "Farmácia", restaurante: "Restaurante",
        posto: "Posto/Combustível", oficina: "Oficina", outro: "Convênio",
      };
      empParceirosLanc.forEach(l => {
        const dataEvt = String(l.dataCompra ?? '').slice(0, 10);
        if (!dataEvt) return;
        const valNum = Number(l.valor || 0);
        const tipoLbl = tipoLabelConv[l.tipoConvenio || ''] || l.tipoConvenio || 'Convênio';
        const stLbl = l.status === 'aprovado' ? '✓ Aprovado'
                    : l.status === 'rejeitado' ? `✗ Rejeitado${l.motivoRejeicao ? ` — ${l.motivoRejeicao}` : ''}`
                    : 'Pendente aprovação';
        const compInfo = l.competenciaDesconto ? ` — desconto ${l.competenciaDesconto.split('-').reverse().join('/')}` : '';
        const itensInfo = l.descricaoItens ? ` — ${l.descricaoItens}` : '';
        const cor = l.status === 'aprovado' ? 'purple' : l.status === 'rejeitado' ? 'red' : 'amber';
        timeline.push({
          data: dataEvt,
          tipo: `Parceiro ${tipoLbl}`,
          descricao: `Compra em ${l.parceiroNomeExibicao} — ${valNum.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}${itensInfo} (${stLbl})${compInfo}`,
          cor,
          icone: 'handshake',
          refTipo: 'parceiro', refId: l.id, meta: l,
        });
      });

      // Rev. 2122 — FCSign sessões na timeline (criação + assinaturas individuais + finalização/cancelamento)
      const fcsignRows = await db.select({
        id: signatureSessions.id,
        tipo: signatureSessions.tipo,
        documentTitle: signatureSessions.documentTitle,
        status: signatureSessions.status,
        createdAt: signatureSessions.createdAt,
        createdByName: signatureSessions.createdByName,
        completedAt: signatureSessions.completedAt,
        cancelledAt: signatureSessions.cancelledAt,
        finalDocumentUrl: signatureSessions.finalDocumentUrl,
      })
        .from(signatureSessions)
        .where(and(
          eq(signatureSessions.employeeId, input.employeeId),
          eq(signatureSessions.companyId, emp.companyId),
        ))
        .orderBy(desc(signatureSessions.createdAt));

      const fcsignSignersRows = fcsignRows.length === 0 ? [] : await db.select({
        sessionId: signatureSigners.sessionId,
        role: signatureSigners.role,
        ordem: signatureSigners.ordem,
        nome: signatureSigners.nome,
        signedAt: signatureSigners.signedAt,
      })
        .from(signatureSigners)
        .where(inArray(signatureSigners.sessionId, fcsignRows.map(r => r.id)))
        .orderBy(signatureSigners.signedAt);

      const fcsignSignersBySession = new Map<number, typeof fcsignSignersRows>();
      for (const sg of fcsignSignersRows) {
        if (!fcsignSignersBySession.has(sg.sessionId)) fcsignSignersBySession.set(sg.sessionId, [] as any);
        fcsignSignersBySession.get(sg.sessionId)!.push(sg);
      }

      const fcsignSessions = fcsignRows.map(s => ({
        ...s,
        signers: fcsignSignersBySession.get(s.id) || [],
      }));

      fcsignRows.forEach(s => {
        // Rev. 2152 — sessões canceladas NÃO geram eventos de timeline
        // (eram poluição visual: enviado + cada assinatura parcial + cancelado).
        // Mantemos no array fcsignSessions p/ histórico/auditoria se preciso,
        // mas a timeline cronológica só mostra sessões vivas/concluídas.
        if (s.status === 'cancelado') return;
        const dCriou = String(s.createdAt || '').slice(0, 10);
        if (dCriou) {
          timeline.push({
            data: dCriou,
            tipo: 'FCSign · Documento enviado',
            descricao: `${s.documentTitle} — enviado p/ assinatura por ${s.createdByName}`,
            cor: 'blue',
            icone: 'file-text',
            refTipo: 'fcsign', refId: s.id, meta: { ...s, signers: fcsignSignersBySession.get(s.id) || [] },
          });
        }
        for (const sg of (fcsignSignersBySession.get(s.id) || [])) {
          if (!sg.signedAt) continue;
          const dSig = String(sg.signedAt).slice(0, 10);
          if (!dSig) continue;
          timeline.push({
            data: dSig,
            tipo: 'FCSign · Assinatura',
            descricao: `${sg.nome} (${sg.role}) assinou: ${s.documentTitle}`,
            cor: 'emerald',
            icone: 'check',
            refTipo: 'fcsign', refId: s.id, meta: { ...s, signer: sg, signers: fcsignSignersBySession.get(s.id) || [] },
          });
        }
        if (s.status === 'completo' && s.completedAt) {
          const dComp = String(s.completedAt).slice(0, 10);
          if (dComp) {
            timeline.push({
              data: dComp,
              tipo: 'FCSign · Concluído',
              descricao: `${s.documentTitle} — todas as partes assinaram`,
              cor: 'emerald',
              icone: 'check-circle',
              refTipo: 'fcsign', refId: s.id, meta: { ...s, signers: fcsignSignersBySession.get(s.id) || [] },
            });
          }
        }
      });

      // Re-sort timeline
      timeline.sort((a, b) => (b.data || "").localeCompare(a.data || ""));

      // Rev. 2545 — timeline mostra SOMENTE eventos que já passaram (até hoje).
      // Eventos futuros (ex.: férias agendadas, retorno previsto) NÃO aparecem.
      // Compara a parte data (YYYY-MM-DD) — cobre data-only e timestamp — com a
      // data de hoje no fuso de Brasília.
      const hojeStr = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
      const timelinePassados = timeline.filter((ev) => {
        const raw = String(ev.data || "");
        // Só corta datas em formato ISO (YYYY-MM-DD[...]); cobre data-only e
        // timestamp. Datas vazias ou em outro formato (legado DD/MM/AAAA) são
        // MANTIDAS — evita falso-negativo escondendo evento passado por engano.
        if (!/^\d{4}-\d{2}-\d{2}/.test(raw)) return true;
        return raw.slice(0, 10) <= hojeStr;
      });

      // Vínculo de recontratação: se este colaborador nasceu de uma recontratação,
      // resolve o código do registro anterior para exibir o banner no Raio-X.
      let recontratadoDeCodigo: string | null = null;
      if ((emp as any).recontratadoDeEmployeeId) {
        const [ant] = await db.select({ codigoInterno: employees.codigoInterno })
          .from(employees).where(eq(employees.id, (emp as any).recontratadoDeEmployeeId));
        if (ant) recontratadoDeCodigo = ant.codigoInterno || null;
      }

      // ===================== DESEMPENHO DO COLABORADOR (Rev. 2853) =====================
      // Indicadores de performance que faltavam no Raio-X: atrasos (resumo), obras
      // GERIDAS quando o colaborador é gestor (responsavelId), e a AVALIAÇÃO DO CLIENTE
      // (Portal do Cliente, anônima) cruzada por obra gerida OU pelo nome do gestor.
      // OBS.: a avaliação INTERNA de desempenho já existe (aba "Avaliações" via
      // trpc.avaliacao.avaliacoes.getByEmployee) — não é reprocessada aqui.

      // 1) ATRASOS — total de ocorrências + minutos acumulados (parse "H:MM").
      const atrasosTotalMinutos = atrasosDetalhados.reduce((acc: number, a: any) => {
        const partes = String(a.atraso || "0:00").split(":");
        const h = parseInt(partes[0], 10) || 0;
        const m = parseInt(partes[1], 10) || 0;
        return acc + (h * 60 + m);
      }, 0);

      // 2) OBRAS GERIDAS — obras em que este colaborador é o responsável (gestor).
      // Cruza por responsavelId OU pelo NOME (coluna texto `responsavel`): muitas obras
      // foram salvas com o nome digitado direto (sem clicar no item do dropdown), então
      // `responsavel_id` ficou NULL embora `responsavel` traga o nome do engenheiro.
      // Mesmo fallback por nome já usado logo abaixo na avaliação do cliente (gestorNome).
      const filtrosGeridas: any[] = [eq(obras.responsavelId, input.employeeId)];
      if (emp.nomeCompleto && emp.nomeCompleto.trim() !== "") {
        filtrosGeridas.push(ilike(obras.responsavel, emp.nomeCompleto.trim()));
      }
      const obrasGeridas = await db.select({
        id: obras.id, nome: obras.nome, codigo: obras.codigo,
        cidade: obras.cidade, status: obras.status, cliente: obras.cliente,
      }).from(obras)
        .where(and(or(...filtrosGeridas), eq(obras.companyId, emp.companyId), isNull(obras.deletedAt)))
        .orderBy(desc(obras.id));
      const obrasGeridasIds = obrasGeridas.map(o => o.id);

      // 3) AVALIAÇÃO DO CLIENTE — Portal do Cliente (anônima). Cruza por obra gerida
      // OU pelo nome do gestor (snapshot gestor_nome no momento da avaliação). Ignora
      // canceladas. Sem vínculo nenhum → lista vazia (nada a mostrar).
      const filtrosCliente: any[] = [];
      if (obrasGeridasIds.length > 0) filtrosCliente.push(inArray(clienteAvaliacoes.obraId, obrasGeridasIds));
      if (emp.nomeCompleto && emp.nomeCompleto.trim() !== "") {
        filtrosCliente.push(ilike(clienteAvaliacoes.gestorNome, emp.nomeCompleto.trim()));
      }
      let avalClienteRows: any[] = [];
      if (filtrosCliente.length > 0) {
        avalClienteRows = await db.select({
          id: clienteAvaliacoes.id, obraId: clienteAvaliacoes.obraId, obraNome: clienteAvaliacoes.obraNome,
          notaGeral: clienteAvaliacoes.notaGeral, notaGestor: clienteAvaliacoes.notaGestor,
          notaEquipe: clienteAvaliacoes.notaEquipe, notaPrazo: clienteAvaliacoes.notaPrazo,
          notaQualidade: clienteAvaliacoes.notaQualidade, notaObra: clienteAvaliacoes.notaObra,
          comentarioPositivo: clienteAvaliacoes.comentarioPositivo, comentarioMelhoria: clienteAvaliacoes.comentarioMelhoria,
          comentarioGestor: clienteAvaliacoes.comentarioGestor, anoPeriodo: clienteAvaliacoes.anoPeriodo,
          criadoEm: clienteAvaliacoes.criadoEm, gestorNome: clienteAvaliacoes.gestorNome,
        }).from(clienteAvaliacoes)
          .where(and(
            eq(clienteAvaliacoes.companyId, emp.companyId),
            isNull(clienteAvaliacoes.canceladaEm),
            or(...filtrosCliente),
          ))
          .orderBy(desc(clienteAvaliacoes.criadoEm))
          .limit(200);
      }
      // 3b) CRITÉRIOS GRANULARES (Rev. 3114) — cada avaliação do Portal grava em
      // cliente_avaliacao_detalhes.dados (jsonb) os PONTOS individuais por bloco
      // (gestor/encarregado/equipe/escritorio). O Raio-X só mostrava as 5 médias;
      // agora anexa `detalhes` a cada item do histórico p/ exibir tudo (fortes/fracos).
      const avalIds = avalClienteRows.map(r => r.id);
      const detalhesMap = new Map<number, any>();
      if (avalIds.length > 0) {
        const detRows = await db.select({
          avaliacaoId: clienteAvaliacaoDetalhes.avaliacaoId,
          dados: clienteAvaliacaoDetalhes.dados,
        }).from(clienteAvaliacaoDetalhes)
          .where(and(
            eq(clienteAvaliacaoDetalhes.companyId, emp.companyId),
            inArray(clienteAvaliacaoDetalhes.avaliacaoId, avalIds),
          ));
        for (const d of detRows) {
          if (d.avaliacaoId != null) detalhesMap.set(d.avaliacaoId, d.dados ?? null);
        }
      }
      for (const r of avalClienteRows) r.detalhes = detalhesMap.get(r.id) ?? null;
      const _avg = (vals: Array<number | null>) => {
        const nums = vals.filter((n): n is number => n != null);
        return nums.length > 0 ? Math.round((nums.reduce((s, v) => s + v, 0) / nums.length) * 10) / 10 : null;
      };
      const avaliacaoCliente = {
        total: avalClienteRows.length,
        mediaGeral: _avg(avalClienteRows.map(r => r.notaGeral)),
        mediaGestor: _avg(avalClienteRows.map(r => r.notaGestor)),
        mediaEquipe: _avg(avalClienteRows.map(r => r.notaEquipe)),
        mediaPrazo: _avg(avalClienteRows.map(r => r.notaPrazo)),
        mediaQualidade: _avg(avalClienteRows.map(r => r.notaQualidade)),
        historico: avalClienteRows.slice(0, 30),
      };

      const desempenho = {
        isGestor: obrasGeridas.length > 0,
        atrasos: { total: atrasosDetalhados.length, totalMinutos: atrasosTotalMinutos },
        obrasGeridas,
        avaliacaoCliente,
      };

      return {
        funcionario: { ...emp, obraAtualNome, recontratadoDeCodigo },
        desempenho,
        funcaoDetalhes,
        asos: asosComIa,
        treinamentos: empTreinamentos,
        atestados: empAtestados,
        advertencias: empAdvertencias,
        ponto: pontoResumo,
        pontoDetalhado: empPonto,
        atrasosDetalhados,
        faltasDetalhadas,
        assiduidade,
        folhaPagamento: empPayroll,
        epis: empEpis,
        horasExtras: empHorasExtras,
        historicoFuncional: empHistorico,
        acidentes: empAcidentes,
        processos: processosComAndamentos,
        timeline: timelinePassados,
        valeAlimentacao: empVR,
        adiantamentos: empAdiantamentos,
        rateioObras: empRateio,
        progressaoAdvertencias: { verbais: advVerbais, escritas: advEscritas, suspensoes: advSuspensoes, proximaAcao },
        avisosPrevios: empAvisosPrevios,
        ferias: empFerias,
        cipa: empCipa,
        dds: empDdsRows,
        fcsignSessions,
        pjContratos: empPjContratos,
        pjPagamentos: empPjPagamentos,
        pjConformidade: empPjConformidade,
        epiDiscountAlerts: empEpiDiscountAlerts,
        emprestimosAlmox: empEmprestimos,
        descontosAlmox: empDescontosAlmox,
        insumosAlmox: empInsumos,
        parceirosLancamentos: empParceirosLanc,
        // Rev. 2456 — devoluções de locação assinadas por este funcionário
        devolucoesLocacao: empDevolucoesLocacao,
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
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        return db.select().from(documentTemplates)
          .where(companyFilter(documentTemplates.companyId, input))
          .orderBy(documentTemplates.tipo);
      }),

    getByTipo: protectedProcedure
      .input(z.object({ companyId: z.number(), tipo: z.string() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const rows = await db.select().from(documentTemplates)
          .where(and(
            companyFilter(documentTemplates.companyId, input),
            eq(documentTemplates.tipo, input.tipo as any),
            eq(documentTemplates.ativo, 1),
          ));
        if (rows.length > 0) return rows[0];
        // Retornar modelo padrão CLT se não houver customizado
        // Contrato PJ tem seu próprio modelo padrão
        if (input.tipo === 'contrato_pj') {
          return { id: 0, companyId: input.companyId, tipo: 'contrato_pj', titulo: 'Contrato de Prestação de Serviços', conteudo: MODELO_CONTRATO_PJ_DEFAULT, ativo: 1, isDefault: true };
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
            companyFilter(documentTemplates.companyId, input),
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
        }).returning();
        return { success: true, id: Number(result[0].id) };
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

  // ===================== PAINEL DE VALIDADE =====================
  painelValidade: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const hoje = new Date().toISOString().split("T")[0];

      // ASOs com validade
      const asoRows = await db
        .select({
          id: asos.id,
          employeeId: asos.employeeId,
          nomeCompleto: employees.nomeCompleto,
          cpf: employees.cpf,
          funcao: employees.funcao,
          tipo: asos.tipo,
          dataExame: asos.dataExame,
          dataValidade: asos.dataValidade,
          resultado: asos.resultado,
          documentoUrl: asos.documentoUrl,
        })
        .from(asos)
        .innerJoin(employees, eq(asos.employeeId, employees.id))
        .where(and(companyFilter(asos.companyId, input), isNull(employees.deletedAt), empNaoDesligado(), isNull(asos.deletedAt)))
        .orderBy(asos.dataValidade);

      // Treinamentos com validade
      const treinRows = await db
        .select({
          id: trainings.id,
          employeeId: trainings.employeeId,
          nomeCompleto: employees.nomeCompleto,
          cpf: employees.cpf,
          funcao: employees.funcao,
          nome: trainings.nome,
          norma: trainings.norma,
          dataRealizacao: trainings.dataRealizacao,
          dataValidade: trainings.dataValidade,
          certificadoUrl: trainings.certificadoUrl,
        })
        .from(trainings)
        .innerJoin(employees, eq(trainings.employeeId, employees.id))
        .where(and(
          companyFilter(trainings.companyId, input),
          isNull(employees.deletedAt),
          empNaoDesligado(),
          isNull(trainings.deletedAt),
          sql`${trainings.dataValidade} IS NOT NULL`
        ))
        .orderBy(trainings.dataValidade);

      const asoByEmpTipo = new Map<string, any[]>();
      const asoByEmp = new Map<number, any[]>();
      for (const r of asoRows) {
        const key = `${r.employeeId}_${r.tipo}`;
        if (!asoByEmpTipo.has(key)) asoByEmpTipo.set(key, []);
        asoByEmpTipo.get(key)!.push(r);
        if (!asoByEmp.has(r.employeeId)) asoByEmp.set(r.employeeId, []);
        asoByEmp.get(r.employeeId)!.push(r);
      }
      const latestAsoIds = new Set<number>();
      for (const [, group] of asoByEmpTipo) {
        group.sort((a: any, b: any) => (b.dataExame || "").localeCompare(a.dataExame || "") || b.id - a.id);
        latestAsoIds.add(group[0].id);
      }

      const asosComStatus = asoRows
        .filter((r: any) => latestAsoIds.has(r.id))
        .map((r: any) => {
          const { status, diasRestantes } = calcularStatusASO(r.dataValidade);
          if (status === "VENCIDO") {
            const empGroup = asoByEmp.get(r.employeeId) || [];
            const hasNewerValidAso = empGroup.some((a: any) =>
              a.id !== r.id &&
              (a.dataExame || "").localeCompare(r.dataExame || "") > 0 &&
              calcularStatusASO(a.dataValidade).status !== "VENCIDO"
            );
            if (hasNewerValidAso) return null;
          }
          return { ...r, tipoDoc: "ASO" as const, descricao: r.tipo, status, diasRestantes };
        })
        .filter(Boolean) as any[];

      // Treinamentos — DEDUP por (funcionário + norma/nome): só o registro de
      // MAIOR validade aparece. Antes, TODO treinamento com validade era listado,
      // então uma renovação (novo registro) NÃO escondia o antigo vencido — o ERP
      // mostrava NR-18/NR-01 antigos como "Vencido" mesmo já renovados.
      // A "norma" (ex.: NR-18) identifica o requisito; quando ausente, cai no nome.
      // Trim ANTES do fallback: uma `norma` só com espaços ("   ") é truthy mas vazia
      // após trim — sem isso ela mascararia o `nome` e colapsaria treinamentos
      // distintos no mesmo grupo "—", escondendo registros legítimos.
      const normaKeyDe = (r: any) => {
        const normaTrim = (r.norma || "").trim();
        const nomeTrim = (r.nome || "").trim();
        return (normaTrim || nomeTrim || "—").toLowerCase();
      };
      const treinByEmpNorma = new Map<string, any[]>();
      for (const r of treinRows) {
        const key = `${r.employeeId}__${normaKeyDe(r)}`;
        if (!treinByEmpNorma.has(key)) treinByEmpNorma.set(key, []);
        treinByEmpNorma.get(key)!.push(r);
      }
      const latestTreinIds = new Set<number>();
      for (const [, group] of treinByEmpNorma) {
        // "Melhor" registro = MAIOR dataValidade (cobertura mais distante);
        // empate → realização mais recente → id maior. Assim, se há renovação
        // válida, ela é a escolhida e o antigo vencido some.
        group.sort((a: any, b: any) =>
          (b.dataValidade || "").localeCompare(a.dataValidade || "") ||
          (b.dataRealizacao || "").localeCompare(a.dataRealizacao || "") ||
          b.id - a.id
        );
        latestTreinIds.add(group[0].id);
      }

      const treinsComStatus = treinRows
        .filter((r: any) => latestTreinIds.has(r.id))
        .map((r: any) => {
          const { status, diasRestantes } = calcularStatusASO(r.dataValidade!);
          return { ...r, tipoDoc: "Treinamento" as const, descricao: r.nome + (r.norma ? ` (${r.norma})` : ""), status, diasRestantes };
        });

      // Unificar e ordenar por urgência (vencidos primeiro, depois por dias restantes)
      const todos = [...asosComStatus, ...treinsComStatus].sort((a, b) => a.diasRestantes - b.diasRestantes);

      // Estatísticas
      const vencidos = todos.filter(d => d.status === "VENCIDO").length;
      const aVencer30 = todos.filter(d => d.diasRestantes >= 0 && d.diasRestantes <= 30).length;
      const aVencer60 = todos.filter(d => d.diasRestantes > 30 && d.diasRestantes <= 60).length;
      const validos = todos.filter(d => d.diasRestantes > 60).length;

      return {
        documentos: todos,
        stats: { vencidos, aVencer30, aVencer60, validos, total: todos.length },
      };
    }),

  // ===================== EXAMES CUSTOMIZADOS =====================
  painelDossie: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;

      // Funcionários ativos
      const empRows = await db
        .select({
          id: employees.id,
          nomeCompleto: employees.nomeCompleto,
          cpf: employees.cpf,
          funcao: employees.funcao,
          status: employees.status,
        })
        .from(employees)
        .where(and(companyFilter(employees.companyId, input), isNull(employees.deletedAt), empNaoDesligado()))
        .orderBy(employees.nomeCompleto);

      if (empRows.length === 0) return { funcionarios: [] };

      const empIds = empRows.map(e => e.id);

      // Todos os documentos em paralelo
      const [asoRows, treinRows, atesRows, advRows] = await Promise.all([
        db.select({
          id: asos.id, employeeId: asos.employeeId,
          tipo: asos.tipo, dataExame: asos.dataExame,
          dataValidade: asos.dataValidade, resultado: asos.resultado,
          documentoUrl: asos.documentoUrl,
        }).from(asos).where(and(inArray(asos.employeeId, empIds), isNull(asos.deletedAt))).orderBy(desc(asos.dataExame)),

        db.select({
          id: trainings.id, employeeId: trainings.employeeId,
          nome: trainings.nome, norma: trainings.norma,
          dataRealizacao: trainings.dataRealizacao, dataValidade: trainings.dataValidade,
          certificadoUrl: trainings.certificadoUrl,
        }).from(trainings).where(and(inArray(trainings.employeeId, empIds), isNull(trainings.deletedAt))).orderBy(desc(trainings.dataRealizacao)),

        db.select({
          id: atestados.id, employeeId: atestados.employeeId,
          tipo: atestados.tipo, dataEmissao: atestados.dataEmissao,
          diasAfastamento: atestados.diasAfastamento, documentoUrl: atestados.documentoUrl,
        }).from(atestados).where(and(inArray(atestados.employeeId, empIds), isNull(atestados.deletedAt))).orderBy(desc(atestados.dataEmissao)),

        db.select({
          id: warnings.id, employeeId: warnings.employeeId,
          tipoAdvertencia: warnings.tipoAdvertencia, dataOcorrencia: warnings.dataOcorrencia,
          documentoUrl: warnings.documentoUrl,
          assinaturaFuncionarioUrl: warnings.assinaturaFuncionarioUrl,
          assinaturaAplicadorUrl: warnings.assinaturaAplicadorUrl,
        }).from(warnings).where(and(inArray(warnings.employeeId, empIds), isNull(warnings.deletedAt))).orderBy(desc(warnings.dataOcorrencia)),
      ]);

      // Agrupamento por funcionário
      const asoByEmp = new Map<number, typeof asoRows>();
      const treinByEmp = new Map<number, typeof treinRows>();
      const atesByEmp = new Map<number, typeof atesRows>();
      const advByEmp = new Map<number, typeof advRows>();
      for (const r of asoRows) { if (!asoByEmp.has(r.employeeId)) asoByEmp.set(r.employeeId, []); asoByEmp.get(r.employeeId)!.push(r); }
      for (const r of treinRows) { if (!treinByEmp.has(r.employeeId)) treinByEmp.set(r.employeeId, []); treinByEmp.get(r.employeeId)!.push(r); }
      for (const r of atesRows) { if (!atesByEmp.has(r.employeeId)) atesByEmp.set(r.employeeId, []); atesByEmp.get(r.employeeId)!.push(r); }
      for (const r of advRows) { if (!advByEmp.has(r.employeeId)) advByEmp.set(r.employeeId, []); advByEmp.get(r.employeeId)!.push(r); }

      return {
        funcionarios: empRows.map(emp => {
          const empAsos = asoByEmp.get(emp.id) || [];
          // ASO mais recente por tipo (dedup por tipo, pega o 1º = mais recente)
          const asosPorTipo = new Map<string, typeof empAsos[0]>();
          for (const a of empAsos) {
            if (!asosPorTipo.has(a.tipo)) asosPorTipo.set(a.tipo, a);
          }
          const latestAso = empAsos[0] || null;
          const asoCalc = latestAso ? calcularStatusASO(latestAso.dataValidade || "") : null;

          const empTreins = (treinByEmp.get(emp.id) || []).map(t => ({
            ...t,
            ...calcularStatusASO(t.dataValidade || ""),
          }));

          // Pior status de treinamentos
          const piorTrein = empTreins.reduce((pior, t) => {
            if (t.status === "VENCIDO") return "VENCIDO";
            if (pior === "VENCIDO") return pior;
            if (t.diasRestantes >= 0 && t.diasRestantes <= 30) return "VENCER30";
            if (pior === "VENCER30") return pior;
            if (t.diasRestantes >= 0 && t.diasRestantes <= 60) return "VENCER60";
            if (pior === "VENCER60") return pior;
            return "VALIDO";
          }, empTreins.length === 0 ? "SEM" : "VALIDO");

          const empAtes = atesByEmp.get(emp.id) || [];
          const empAdvs = advByEmp.get(emp.id) || [];

          return {
            id: emp.id,
            nomeCompleto: emp.nomeCompleto,
            cpf: emp.cpf,
            funcao: emp.funcao,
            status: emp.status,
            aso: latestAso ? { ...latestAso, ...(asoCalc || {}) } : null,
            treinamentos: empTreins,
            piorStatusTrein: piorTrein,
            atestados: empAtes,
            advertencias: empAdvs,
            totais: {
              asos: empAsos.length,
              treinamentos: empTreins.length,
              atestados: empAtes.length,
              advertencias: empAdvs.length,
            },
          };
        }),
      };
    }),

  customExams: router({
    list: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const rows = await db.select().from(customExams)
          .where(companyFilter(customExams.companyId, input))
          .orderBy(customExams.nome);
        return rows;
      }),

    add: protectedProcedure
      .input(z.object({ companyId: z.number(), nome: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        // Check if already exists (ignore case)
        const existing = await db.select().from(customExams)
          .where(and(
            companyFilter(customExams.companyId, input),
            eq(customExams.nome, input.nome.trim()),
          ));
        if (existing.length > 0) return { id: existing[0].id, already: true };
        const [result] = await db.insert(customExams).values({
          companyId: input.companyId,
          nome: input.nome.trim(),
          criadoPor: ctx.user.name ?? 'Sistema',
        }).returning();
        return { id: result[0].id, already: false };
      }),

    remove: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        await db.delete(customExams).where(eq(customExams.id, input.id));
        return { success: true };
      }),
  }),
});
