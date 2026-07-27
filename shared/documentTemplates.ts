/**
 * Rev. 2141 — Templates institucionais FC (metadados compartilhados).
 * Rev. 3862 — Adicionado campo `categoria` na meta + 6 novos tipos (Financeiro,
 *              Planejamento, Contratos). `getCategoriaFromDoc` deriva categoria
 *              de tipos custom pelo prefixo do código ISO.
 *
 * Define os tipos de documento gerenciáveis na aba
 * "Templates de Documentos" em Configurações, junto com a lista de
 * placeholders disponíveis para cada tipo. Usado tanto pelo backend
 * (validação + render) quanto pelo frontend (editor WYSIWYG + sidebar
 * de placeholders clicáveis).
 */

export type DocumentTemplateTipo =
  // RH
  | "contrato_experiencia"
  | "termo_responsabilidade"
  | "comunicado_interno"
  | "advertencia"
  | "aviso_previo"
  | "termo_rescisao"
  | "carta_mdo"
  // RH — Documentos do Colaborador (Rev. 4669)
  | "ficha_registro"
  | "termo_equipamentos"
  | "termo_confidencialidade"
  | "regulamento_interno"
  | "codigo_etica"
  | "termo_lgpd"
  | "acordo_banco_horas"
  | "acordo_compensacao"
  // RH — Fases 2/3 (Rev. 4672): contrato CLT, férias, folha, benefícios, aditivo
  | "contrato_trabalho_clt"
  | "solicitacao_ferias"
  | "recibo_ferias"
  | "recibo_folha"
  | "termo_aditivo"
  | "adesao_plano_saude"
  | "adesao_vt"
  | "recusa_vt"
  | "adesao_va"
  | "adesao_seguro_vida"
  // Financeiro
  | "recibo_pagamento"
  | "comprovante_pagamento"
  | "recibo_adiantamento"
  // Planejamento
  | "ata_reuniao"
  // Contratos
  | "ordem_servico"
  | "proposta_comercial"
  | "contrato_pj"
  | "contrato_terceiros"
  | "aviso_encerramento_pj";

// ── Categorias canônicas ─────────────────────────────────────────────────────
export const CATEGORIAS_DOCS = [
  { id: "rh",            label: "RH" },
  { id: "financeiro",    label: "Financeiro" },
  { id: "planejamento",  label: "Planejamento" },
  { id: "contratos",     label: "Contratos" },
  { id: "medicoes",      label: "Medições" },
  { id: "contabilidade", label: "Contabilidade" },
] as const;

export type CategoriaDoc = (typeof CATEGORIAS_DOCS)[number]["id"];

/**
 * Retorna a categoria de um documento.
 * - Para tipos fixos: usa o campo `categoria` da meta.
 * - Para tipos custom: deriva do prefixo do código ISO (FC-FIN → financeiro, etc.).
 */
export function getCategoriaFromDoc(tipo: string, codigo?: string | null): string {
  const meta = DOCUMENT_TEMPLATES_META.find(m => m.tipo === tipo);
  if (meta?.categoria) return meta.categoria;
  if (codigo) {
    const u = codigo.toUpperCase();
    if (u.startsWith("FC-FIN"))  return "financeiro";
    if (u.startsWith("FC-PL"))   return "planejamento";
    if (u.startsWith("FC-MED"))  return "medicoes";
    if (u.startsWith("FC-CON"))  return "contratos";
    if (u.startsWith("FC-CONT")) return "contabilidade";
  }
  return "rh";
}

export type PlaceholderDef = {
  chave: string;        // ex: "empNome" → render como {{empNome}}
  rotulo: string;       // label amigável pra UI
  exemplo: string;      // valor de exemplo pro preview
  grupo: string;        // agrupador na sidebar (Colaborador, Empresa, Documento, Específicos)
};

export type DocumentTemplateMeta = {
  tipo: DocumentTemplateTipo;
  titulo: string;
  descricao: string;
  icone: string;        // nome do ícone lucide-react
  categoria: string;    // "rh" | "financeiro" | "planejamento" | "contratos" | "medicoes" | "contabilidade"
  placeholders: PlaceholderDef[];
};

// ── Placeholders comuns a todos os documentos institucionais ────────────────
const PH_COLABORADOR: PlaceholderDef[] = [
  { chave: "empNome",       rotulo: "Nome do Colaborador",  exemplo: "FELIPE COSTA ALVES",        grupo: "Colaborador" },
  { chave: "empCpf",        rotulo: "CPF",                  exemplo: "362.506.888-54",            grupo: "Colaborador" },
  { chave: "empRg",         rotulo: "RG",                   exemplo: "12.345.678-9 SSP/SP",       grupo: "Colaborador" },
  { chave: "empFuncao",     rotulo: "Função",               exemplo: "ENGENHEIRO CIVIL",          grupo: "Colaborador" },
  { chave: "empMatricula",  rotulo: "Matrícula",            exemplo: "JFC224",                    grupo: "Colaborador" },
  { chave: "empAdmissao",   rotulo: "Data de Admissão",     exemplo: "01/02/2024",                grupo: "Colaborador" },
  { chave: "empSalario",    rotulo: "Salário",              exemplo: "R$ 12.000,00",              grupo: "Colaborador" },
];

const PH_EMPRESA: PlaceholderDef[] = [
  { chave: "empresaRazaoSocial", rotulo: "Razão Social",         exemplo: "FC ENGENHARIA E CONSTRUCAO LTDA",                grupo: "Empresa" },
  { chave: "empresaCnpj",        rotulo: "CNPJ",                 exemplo: "29.353.906/0001-71",                              grupo: "Empresa" },
  { chave: "empresaEndereco",    rotulo: "Endereço Completo",    exemplo: "JUSCELINO KUBITSCHEK DE OLIVEIRA, 1301, SALA 1104 - GUARATINGUETA - SP", grupo: "Empresa" },
];

const PH_DOCUMENTO: PlaceholderDef[] = [
  { chave: "docNumero", rotulo: "Número do Documento", exemplo: "001/2026",      grupo: "Documento" },
  { chave: "docData",   rotulo: "Data de Emissão",     exemplo: "19/05/2026",    grupo: "Documento" },
  { chave: "docLocal",  rotulo: "Local de Emissão",    exemplo: "Guaratinguetá - SP", grupo: "Documento" },
];

const PH_OBRA: PlaceholderDef[] = [
  { chave: "obraNome",     rotulo: "Nome da Obra",     exemplo: "RESIDENCIAL JARDIM ALPHA", grupo: "Obra" },
  { chave: "obraEndereco", rotulo: "Endereço da Obra", exemplo: "RUA DAS PALMEIRAS, 100 - GUARATINGUETÁ/SP", grupo: "Obra" },
];

// ── Placeholders financeiros ─────────────────────────────────────────────────
const PH_FINANCEIRO: PlaceholderDef[] = [
  { chave: "valor",          rotulo: "Valor (R$)",            exemplo: "R$ 5.000,00",                  grupo: "Financeiro" },
  { chave: "valorExtenso",   rotulo: "Valor por extenso",     exemplo: "cinco mil reais",               grupo: "Financeiro" },
  { chave: "referente",      rotulo: "Referente a",           exemplo: "Salário de Junho/2026",         grupo: "Financeiro" },
  { chave: "dataPagamento",  rotulo: "Data de Pagamento",     exemplo: "30/06/2026",                    grupo: "Financeiro" },
  { chave: "formaPagamento", rotulo: "Forma de Pagamento",    exemplo: "Transferência Bancária (PIX)",  grupo: "Financeiro" },
  { chave: "mesRef",         rotulo: "Mês de Referência",     exemplo: "Junho/2026",                    grupo: "Financeiro" },
];

// ── Placeholders de reunião ───────────────────────────────────────────────────
const PH_REUNIAO: PlaceholderDef[] = [
  { chave: "dataReuniao",   rotulo: "Data da Reunião",       exemplo: "19/05/2026",              grupo: "Reunião" },
  { chave: "localReuniao",  rotulo: "Local",                 exemplo: "Sede FC Engenharia",      grupo: "Reunião" },
  { chave: "horaInicio",    rotulo: "Hora de Início",        exemplo: "09h00",                   grupo: "Reunião" },
  { chave: "horaFim",       rotulo: "Hora de Término",       exemplo: "11h00",                   grupo: "Reunião" },
  { chave: "pauta",         rotulo: "Pauta",                 exemplo: "(itens da pauta)",        grupo: "Reunião" },
  { chave: "participantes", rotulo: "Participantes",         exemplo: "(lista de participantes)", grupo: "Reunião" },
  { chave: "deliberacoes",  rotulo: "Deliberações / Ações",  exemplo: "(ações decididas)",       grupo: "Reunião" },
];

// ── Placeholders de OS/Proposta ───────────────────────────────────────────────
const PH_OS: PlaceholderDef[] = [
  { chave: "clienteNome",    rotulo: "Nome do Cliente",      exemplo: "CONSTRUTORA ALPHA S/A",   grupo: "OS" },
  { chave: "clienteCnpj",    rotulo: "CNPJ do Cliente",      exemplo: "12.345.678/0001-99",      grupo: "OS" },
  { chave: "descricaoServico", rotulo: "Descrição do Serviço", exemplo: "Execução de fundações e estrutura de concreto armado", grupo: "OS" },
  { chave: "prazoExecucao",  rotulo: "Prazo de Execução",    exemplo: "60 dias corridos",        grupo: "OS" },
  { chave: "dataInicio",     rotulo: "Data de Início",       exemplo: "01/07/2026",              grupo: "OS" },
  { chave: "valorTotal",     rotulo: "Valor Total",          exemplo: "R$ 150.000,00",           grupo: "OS" },
];

// ── 7 tipos RH + 6 tipos novos (Financeiro/Planejamento/Contratos) ────────────
export const DOCUMENT_TEMPLATES_META: DocumentTemplateMeta[] = [
  {
    tipo: "contrato_experiencia",
    titulo: "Contrato de Experiência",
    descricao: "Contrato CLT por prazo determinado (experiência) — 45+45 dias.",
    icone: "FileSignature",
    categoria: "rh",
    placeholders: [
      ...PH_COLABORADOR,
      ...PH_EMPRESA,
      ...PH_DOCUMENTO,
      { chave: "empCtps",        rotulo: "CTPS",                  exemplo: "1234567 / 001-SP", grupo: "Colaborador" },
      { chave: "empEndereco",    rotulo: "Endereço do Colaborador", exemplo: "RUA A, 100 - GUARATINGUETÁ/SP", grupo: "Colaborador" },
      { chave: "prazo1",         rotulo: "Prazo 1ª etapa (dias)", exemplo: "45",             grupo: "Específicos" },
      { chave: "prazo2",         rotulo: "Prazo 2ª etapa (dias)", exemplo: "45",             grupo: "Específicos" },
      { chave: "prazoTotal",     rotulo: "Prazo total (dias)",    exemplo: "90",             grupo: "Específicos" },
      { chave: "dataInicio",     rotulo: "Data de início",        exemplo: "21/05/2026",     grupo: "Específicos" },
      { chave: "dataFim",        rotulo: "Data de término (1ª etapa)", exemplo: "05/07/2026", grupo: "Específicos" },
      { chave: "dataFimFinal",   rotulo: "Data de término final (após prorrogação)", exemplo: "19/08/2026", grupo: "Específicos" },
      { chave: "jornadaSemanal", rotulo: "Jornada (descrição)",   exemplo: "de segunda a sexta, das 07h às 17h, totalizando 44 horas semanais", grupo: "Específicos" },
      { chave: "clausulaRemuneracao", rotulo: "Cláusula 2ª — Remuneração (auto)", exemplo: "(montada conforme horista/mensalista)", grupo: "Específicos" },
    ],
  },
  {
    tipo: "termo_responsabilidade",
    titulo: "Termo de Responsabilidade",
    descricao: "Entrega de equipamentos, EPIs e veículos sob responsabilidade do colaborador.",
    icone: "ShieldCheck",
    categoria: "rh",
    placeholders: [
      ...PH_COLABORADOR,
      ...PH_EMPRESA,
      ...PH_DOCUMENTO,
      { chave: "itensTabela", rotulo: "Tabela de Itens (auto)", exemplo: "(gerada automaticamente do formulário)", grupo: "Específicos" },
    ],
  },
  {
    tipo: "comunicado_interno",
    titulo: "Comunicado Interno",
    descricao: "Comunicado oficial da empresa para colaborador(es).",
    icone: "Megaphone",
    categoria: "rh",
    placeholders: [
      ...PH_COLABORADOR,
      ...PH_EMPRESA,
      ...PH_DOCUMENTO,
      { chave: "assunto",  rotulo: "Assunto",            exemplo: "Mudança de horário de trabalho", grupo: "Específicos" },
      { chave: "corpoMsg", rotulo: "Corpo da Mensagem",  exemplo: "(texto livre digitado no formulário)", grupo: "Específicos" },
    ],
  },
  {
    tipo: "advertencia",
    titulo: "Advertência",
    descricao: "Advertência disciplinar (verbal/escrita/suspensão).",
    icone: "AlertTriangle",
    categoria: "rh",
    placeholders: [
      ...PH_COLABORADOR,
      ...PH_EMPRESA,
      ...PH_DOCUMENTO,
      { chave: "tipoAdv",        rotulo: "Tipo de Advertência",     exemplo: "ESCRITA",                          grupo: "Específicos" },
      { chave: "motivo",         rotulo: "Motivo",                  exemplo: "Atraso reiterado sem justificativa", grupo: "Específicos" },
      { chave: "ocorrenciaData", rotulo: "Data da Ocorrência",      exemplo: "10/05/2026",                       grupo: "Específicos" },
      { chave: "baseLegal",      rotulo: "Base Legal",              exemplo: "Art. 482, CLT",                    grupo: "Específicos" },
    ],
  },
  {
    tipo: "aviso_previo",
    titulo: "Aviso Prévio",
    descricao: "Aviso prévio de rescisão (trabalhado ou indenizado).",
    icone: "BellRing",
    categoria: "rh",
    placeholders: [
      ...PH_COLABORADOR,
      ...PH_EMPRESA,
      ...PH_DOCUMENTO,
      { chave: "empCtps",        rotulo: "CTPS",              exemplo: "1234567 / 001-SP", grupo: "Colaborador" },
      { chave: "modalidade",     rotulo: "Modalidade",        exemplo: "TRABALHADO",  grupo: "Específicos" },
      { chave: "dataAviso",      rotulo: "Data do Aviso",     exemplo: "19/05/2026",  grupo: "Específicos" },
      { chave: "dataDesligamento", rotulo: "Data Desligamento", exemplo: "03/06/2026", grupo: "Específicos" },
      { chave: "diasAviso",      rotulo: "Dias de Aviso",     exemplo: "30",          grupo: "Específicos" },
    ],
  },
  {
    tipo: "termo_rescisao",
    titulo: "Termo de Rescisão",
    descricao: "Termo de rescisão do contrato de trabalho.",
    icone: "UserX",
    categoria: "rh",
    placeholders: [
      ...PH_COLABORADOR,
      ...PH_EMPRESA,
      ...PH_DOCUMENTO,
      { chave: "motivoRescisao", rotulo: "Motivo da Rescisão", exemplo: "Sem justa causa", grupo: "Específicos" },
      { chave: "dataRescisao",   rotulo: "Data da Rescisão",   exemplo: "03/06/2026",      grupo: "Específicos" },
      { chave: "verbasRescisao", rotulo: "Verbas Rescisórias", exemplo: "(tabela auto)",   grupo: "Específicos" },
    ],
  },
  {
    tipo: "carta_mdo",
    titulo: "Carta MDO (Mão de Obra)",
    descricao: "Carta de apresentação de mão de obra para obras/clientes.",
    icone: "Hammer",
    categoria: "rh",
    placeholders: [
      ...PH_COLABORADOR,
      ...PH_EMPRESA,
      ...PH_DOCUMENTO,
      ...PH_OBRA,
      { chave: "clienteNome", rotulo: "Nome do Cliente", exemplo: "CONSTRUTORA ALPHA S/A", grupo: "Específicos" },
    ],
  },
  // ── Financeiro ──────────────────────────────────────────────────────────────
  // ── Rev. 4669 — Documentos do Colaborador (dossiê digital com assinatura) ──
  {
    tipo: "ficha_registro",
    titulo: "Ficha de Registro do Empregado",
    descricao: "Ficha de registro com dados pessoais, contratuais e bancários do colaborador.",
    icone: "IdCard",
    categoria: "rh",
    placeholders: [
      ...PH_COLABORADOR, ...PH_EMPRESA, ...PH_DOCUMENTO,
      { chave: "empCtps",        rotulo: "CTPS",               exemplo: "1234567 / 001-SP",  grupo: "Colaborador" },
      { chave: "empPis",         rotulo: "PIS/PASEP",          exemplo: "123.45678.90-1",    grupo: "Colaborador" },
      { chave: "empNascimento",  rotulo: "Data de Nascimento", exemplo: "10/03/1990",        grupo: "Colaborador" },
      { chave: "empEstadoCivil", rotulo: "Estado Civil",       exemplo: "Casado(a)",          grupo: "Colaborador" },
      { chave: "empNomeMae",     rotulo: "Nome da Mãe",        exemplo: "MARIA DA SILVA",     grupo: "Colaborador" },
      { chave: "empTelefone",    rotulo: "Telefone",           exemplo: "(12) 99999-0000",    grupo: "Colaborador" },
      { chave: "empBanco",       rotulo: "Banco",              exemplo: "Itaú",               grupo: "Colaborador" },
      { chave: "empPix",         rotulo: "Chave PIX",          exemplo: "362.506.888-54",     grupo: "Colaborador" },
    ],
  },
  {
    tipo: "termo_equipamentos",
    titulo: "Termo de Responsabilidade por Equipamentos",
    descricao: "Responsabilidade por equipamentos e ferramentas entregues ao colaborador (Art. 462 CLT).",
    icone: "Wrench",
    categoria: "rh",
    placeholders: [
      ...PH_COLABORADOR, ...PH_EMPRESA, ...PH_DOCUMENTO,
      { chave: "equipamentos", rotulo: "Equipamentos entregues", exemplo: "1 Notebook Dell, 1 Celular Samsung", grupo: "Específicos" },
    ],
  },
  {
    tipo: "termo_confidencialidade",
    titulo: "Termo de Confidencialidade (NDA)",
    descricao: "Compromisso de sigilo sobre informações da empresa, clientes e projetos.",
    icone: "Lock",
    categoria: "rh",
    placeholders: [...PH_COLABORADOR, ...PH_EMPRESA, ...PH_DOCUMENTO],
  },
  {
    tipo: "regulamento_interno",
    titulo: "Ciência do Regulamento Interno",
    descricao: "Declaração de recebimento e ciência do regulamento interno da empresa.",
    icone: "BookOpen",
    categoria: "rh",
    placeholders: [...PH_COLABORADOR, ...PH_EMPRESA, ...PH_DOCUMENTO],
  },
  {
    tipo: "codigo_etica",
    titulo: "Ciência do Código de Ética e Conduta",
    descricao: "Declaração de recebimento e compromisso com o código de ética e conduta.",
    icone: "Scale",
    categoria: "rh",
    placeholders: [...PH_COLABORADOR, ...PH_EMPRESA, ...PH_DOCUMENTO],
  },
  {
    tipo: "termo_lgpd",
    titulo: "Termo de Consentimento LGPD",
    descricao: "Consentimento para tratamento de dados pessoais (Lei 13.709/2018).",
    icone: "ShieldCheck",
    categoria: "rh",
    placeholders: [...PH_COLABORADOR, ...PH_EMPRESA, ...PH_DOCUMENTO],
  },
  {
    tipo: "acordo_banco_horas",
    titulo: "Acordo de Banco de Horas",
    descricao: "Acordo individual de banco de horas (Art. 59, §5º da CLT).",
    icone: "Clock",
    categoria: "rh",
    placeholders: [
      ...PH_COLABORADOR, ...PH_EMPRESA, ...PH_DOCUMENTO,
      { chave: "prazoCompensacao", rotulo: "Prazo de compensação", exemplo: "6 (seis) meses", grupo: "Específicos" },
    ],
  },
  {
    tipo: "acordo_compensacao",
    titulo: "Acordo de Compensação de Jornada",
    descricao: "Acordo individual de compensação de jornada de trabalho (Art. 59-A/59-B da CLT).",
    icone: "CalendarClock",
    categoria: "rh",
    placeholders: [
      ...PH_COLABORADOR, ...PH_EMPRESA, ...PH_DOCUMENTO,
      { chave: "jornadaDescricao", rotulo: "Descrição da jornada", exemplo: "Seg a Qui 07h-17h, Sex 07h-16h", grupo: "Específicos" },
    ],
  },
  // ── Rev. 4672 — Fases 2/3: contrato CLT, férias, folha, benefícios, aditivo ──
  {
    tipo: "contrato_trabalho_clt",
    titulo: "Contrato de Trabalho (CLT)",
    descricao: "Contrato individual de trabalho por prazo indeterminado, com variáveis do cadastro.",
    icone: "FileSignature",
    categoria: "rh",
    placeholders: [
      ...PH_COLABORADOR, ...PH_EMPRESA, ...PH_DOCUMENTO,
      { chave: "empCtps",         rotulo: "CTPS",                exemplo: "1234567 / 001-SP",              grupo: "Colaborador" },
      { chave: "jornadaSemanal",  rotulo: "Jornada semanal",     exemplo: "44 horas semanais",             grupo: "Específicos" },
      { chave: "horarioTrabalho", rotulo: "Horário de trabalho", exemplo: "Seg a Qui 07h-17h, Sex 07h-16h", grupo: "Específicos" },
    ],
  },
  {
    tipo: "solicitacao_ferias",
    titulo: "Solicitação de Férias",
    descricao: "Solicitação/aviso de férias com período de gozo e aquisitivo, assinável pelo colaborador.",
    icone: "Plane",
    categoria: "rh",
    placeholders: [
      ...PH_COLABORADOR, ...PH_EMPRESA, ...PH_DOCUMENTO,
      { chave: "feriasInicio",     rotulo: "Início do gozo",       exemplo: "01/09/2026", grupo: "Específicos" },
      { chave: "feriasFim",        rotulo: "Fim do gozo",          exemplo: "30/09/2026", grupo: "Específicos" },
      { chave: "feriasDias",       rotulo: "Dias de gozo",         exemplo: "30",         grupo: "Específicos" },
      { chave: "aquisitivoInicio", rotulo: "Aquisitivo — início",  exemplo: "01/02/2025", grupo: "Específicos" },
      { chave: "aquisitivoFim",    rotulo: "Aquisitivo — fim",     exemplo: "31/01/2026", grupo: "Específicos" },
      { chave: "abonoPecuniario",  rotulo: "Abono pecuniário",     exemplo: "Não",        grupo: "Específicos" },
    ],
  },
  {
    tipo: "recibo_ferias",
    titulo: "Recibo de Férias",
    descricao: "Recibo de pagamento e gozo de férias (quitação), assinável pelo colaborador.",
    icone: "Receipt",
    categoria: "rh",
    placeholders: [
      ...PH_COLABORADOR, ...PH_EMPRESA, ...PH_DOCUMENTO,
      { chave: "feriasInicio",     rotulo: "Início do gozo",      exemplo: "01/09/2026",  grupo: "Específicos" },
      { chave: "feriasFim",        rotulo: "Fim do gozo",         exemplo: "30/09/2026",  grupo: "Específicos" },
      { chave: "feriasDias",       rotulo: "Dias de gozo",        exemplo: "30",          grupo: "Específicos" },
      { chave: "aquisitivoInicio", rotulo: "Aquisitivo — início", exemplo: "01/02/2025",  grupo: "Específicos" },
      { chave: "aquisitivoFim",    rotulo: "Aquisitivo — fim",    exemplo: "31/01/2026",  grupo: "Específicos" },
      { chave: "valorBruto",       rotulo: "Valor bruto",         exemplo: "R$ 8.000,00", grupo: "Específicos" },
      { chave: "valorLiquido",     rotulo: "Valor líquido",       exemplo: "R$ 7.100,00", grupo: "Específicos" },
      { chave: "dataPagamento",    rotulo: "Data de pagamento",   exemplo: "29/08/2026",  grupo: "Específicos" },
    ],
  },
  {
    tipo: "recibo_folha",
    titulo: "Recibo de Pagamento de Salário",
    descricao: "Recibo de folha (holerite, 13º ou adiantamento) como comprovante assinável.",
    icone: "Banknote",
    categoria: "rh",
    placeholders: [
      ...PH_COLABORADOR, ...PH_EMPRESA, ...PH_DOCUMENTO,
      { chave: "tipoRecibo",    rotulo: "Tipo do recibo",     exemplo: "Holerite (salário mensal)", grupo: "Específicos" },
      { chave: "mesRef",        rotulo: "Competência",        exemplo: "Julho/2026",                grupo: "Específicos" },
      { chave: "valorLiquido",  rotulo: "Valor líquido",      exemplo: "R$ 4.350,00",               grupo: "Específicos" },
      { chave: "dataPagamento", rotulo: "Data de pagamento",  exemplo: "05/08/2026",                grupo: "Específicos" },
      { chave: "observacoes",   rotulo: "Observações",        exemplo: "—",                          grupo: "Específicos" },
    ],
  },
  {
    tipo: "termo_aditivo",
    titulo: "Termo Aditivo ao Contrato de Trabalho",
    descricao: "Aditivo contratual: promoção, mudança de salário, função ou jornada.",
    icone: "FilePlus2",
    categoria: "rh",
    placeholders: [
      ...PH_COLABORADOR, ...PH_EMPRESA, ...PH_DOCUMENTO,
      { chave: "tipoAlteracao",      rotulo: "Tipo de alteração",  exemplo: "Promoção com aumento salarial", grupo: "Específicos" },
      { chave: "descricaoAlteracao", rotulo: "Descrição",          exemplo: "Promovido a Encarregado de Obras", grupo: "Específicos" },
      { chave: "novaFuncao",         rotulo: "Nova função",        exemplo: "ENCARREGADO DE OBRAS", grupo: "Específicos" },
      { chave: "novoSalario",        rotulo: "Novo salário",       exemplo: "R$ 4.500,00",          grupo: "Específicos" },
      { chave: "dataVigencia",       rotulo: "Vigência a partir",  exemplo: "01/08/2026",           grupo: "Específicos" },
    ],
  },
  {
    tipo: "adesao_plano_saude",
    titulo: "Termo de Adesão — Plano de Saúde",
    descricao: "Adesão ao plano de saúde com autorização de desconto (Art. 462 CLT).",
    icone: "HeartPulse",
    categoria: "rh",
    placeholders: [
      ...PH_COLABORADOR, ...PH_EMPRESA, ...PH_DOCUMENTO,
      { chave: "operadora",      rotulo: "Operadora",             exemplo: "Unimed",         grupo: "Específicos" },
      { chave: "plano",          rotulo: "Plano",                 exemplo: "Nacional Apto.", grupo: "Específicos" },
      { chave: "coparticipacao", rotulo: "Coparticipação/desconto", exemplo: "R$ 120,00/mês", grupo: "Específicos" },
    ],
  },
  {
    tipo: "adesao_vt",
    titulo: "Termo de Adesão — Vale-Transporte",
    descricao: "Opção pelo vale-transporte com autorização de desconto de até 6% (Lei 7.418/85).",
    icone: "Bus",
    categoria: "rh",
    placeholders: [
      ...PH_COLABORADOR, ...PH_EMPRESA, ...PH_DOCUMENTO,
      { chave: "linhas",   rotulo: "Linhas/percurso",       exemplo: "Linha 010 — Centro ↔ Pedregulho (ida e volta)", grupo: "Específicos" },
      { chave: "valorDia", rotulo: "Valor diário (R$)",     exemplo: "R$ 9,00", grupo: "Específicos" },
    ],
  },
  {
    tipo: "recusa_vt",
    titulo: "Termo de Recusa — Vale-Transporte",
    descricao: "Declaração de NÃO opção pelo vale-transporte (Decreto 95.247/87).",
    icone: "BusFront",
    categoria: "rh",
    placeholders: [
      ...PH_COLABORADOR, ...PH_EMPRESA, ...PH_DOCUMENTO,
      { chave: "motivo", rotulo: "Motivo da recusa", exemplo: "Utilizo veículo próprio", grupo: "Específicos" },
    ],
  },
  {
    tipo: "adesao_va",
    titulo: "Termo de Adesão — Vale-Alimentação/Refeição",
    descricao: "Adesão ao vale-alimentação/refeição (PAT) com ciência das regras de desconto.",
    icone: "UtensilsCrossed",
    categoria: "rh",
    placeholders: [
      ...PH_COLABORADOR, ...PH_EMPRESA, ...PH_DOCUMENTO,
      { chave: "valorMensal", rotulo: "Valor mensal (R$)", exemplo: "R$ 550,00", grupo: "Específicos" },
    ],
  },
  {
    tipo: "adesao_seguro_vida",
    titulo: "Termo de Adesão — Seguro de Vida",
    descricao: "Ciência/adesão ao seguro de vida em grupo e indicação de beneficiários.",
    icone: "Umbrella",
    categoria: "rh",
    placeholders: [
      ...PH_COLABORADOR, ...PH_EMPRESA, ...PH_DOCUMENTO,
      { chave: "seguradora",    rotulo: "Seguradora",    exemplo: "Porto Seguro",     grupo: "Específicos" },
      { chave: "apolice",       rotulo: "Apólice",       exemplo: "0982.123.456",     grupo: "Específicos" },
      { chave: "beneficiarios", rotulo: "Beneficiários", exemplo: "Cônjuge e filhos", grupo: "Específicos" },
    ],
  },
  {
    tipo: "recibo_pagamento",
    titulo: "Recibo de Pagamento",
    descricao: "Recibo de quitação de pagamento (salário, rescisão, serviços, etc.).",
    icone: "FileText",
    categoria: "financeiro",
    placeholders: [
      ...PH_COLABORADOR,
      ...PH_EMPRESA,
      ...PH_DOCUMENTO,
      ...PH_FINANCEIRO,
    ],
  },
  {
    tipo: "comprovante_pagamento",
    titulo: "Comprovante de Pagamento",
    descricao: "Comprovante de transferência / pagamento bancário para colaborador ou fornecedor.",
    icone: "BadgeCheck",
    categoria: "financeiro",
    placeholders: [
      ...PH_COLABORADOR,
      ...PH_EMPRESA,
      ...PH_DOCUMENTO,
      ...PH_FINANCEIRO,
    ],
  },
  {
    tipo: "recibo_adiantamento",
    titulo: "Recibo de Adiantamento",
    descricao: "Recibo de adiantamento salarial ou de viagem.",
    icone: "FileText",
    categoria: "financeiro",
    placeholders: [
      ...PH_COLABORADOR,
      ...PH_EMPRESA,
      ...PH_DOCUMENTO,
      ...PH_FINANCEIRO,
    ],
  },
  // ── Planejamento ────────────────────────────────────────────────────────────
  {
    tipo: "ata_reuniao",
    titulo: "Ata de Reunião",
    descricao: "Ata de reunião interna ou com cliente / partes interessadas.",
    icone: "FileText",
    categoria: "planejamento",
    placeholders: [
      ...PH_EMPRESA,
      ...PH_DOCUMENTO,
      ...PH_OBRA,
      ...PH_REUNIAO,
    ],
  },
  // ── Contratos ───────────────────────────────────────────────────────────────
  {
    tipo: "ordem_servico",
    titulo: "Ordem de Serviço",
    descricao: "Ordem de serviço para contratação de mão de obra ou serviços especializados.",
    icone: "Hammer",
    categoria: "contratos",
    placeholders: [
      ...PH_EMPRESA,
      ...PH_DOCUMENTO,
      ...PH_OBRA,
      ...PH_OS,
    ],
  },
  {
    tipo: "proposta_comercial",
    titulo: "Proposta Comercial",
    descricao: "Proposta comercial de prestação de serviços de engenharia.",
    icone: "FileText",
    categoria: "contratos",
    placeholders: [
      ...PH_EMPRESA,
      ...PH_DOCUMENTO,
      ...PH_OBRA,
      ...PH_OS,
    ],
  },
  {
    tipo: "contrato_pj",
    titulo: "Contrato de Prestação de Serviços",
    descricao: "Contrato civil de prestação de serviços técnicos especializados (art. 593 e seguintes do Código Civil).",
    icone: "FileText",
    categoria: "contratos",
    placeholders: [
      ...PH_EMPRESA,
      ...PH_DOCUMENTO,
      { chave: "representanteLegal",    rotulo: "Representante Legal (Contratante)", exemplo: "FELIPE COSTA ALVES",             grupo: "Contratante" },
      { chave: "contratadaRazaoSocial", rotulo: "Razão Social da Contratada",        exemplo: "JOÃO SILVA SERVIÇOS LTDA",        grupo: "Contratada PJ" },
      { chave: "contratadaCnpj",        rotulo: "CNPJ da Contratada",                exemplo: "12.345.678/0001-99",              grupo: "Contratada PJ" },
      { chave: "contratadaEndereco",    rotulo: "Endereço da Contratada",            exemplo: "RUA A, 100 - GUARATINGUETÁ/SP",   grupo: "Contratada PJ" },
      { chave: "objetoContrato",        rotulo: "Objeto do Contrato",                exemplo: "Execução de serviços de topografia", grupo: "Específicos" },
      { chave: "valorMensal",           rotulo: "Valor Mensal (R$)",                 exemplo: "R$ 10.000,00",                    grupo: "Específicos" },
      { chave: "valorExtenso",          rotulo: "Valor por Extenso",                 exemplo: "dez mil reais",                   grupo: "Específicos" },
      { chave: "valorTotalContrato",    rotulo: "Valor Total do Contrato (R$)",      exemplo: "R$ 60.000,00",                    grupo: "Específicos" },
      { chave: "valorTotalExtenso",     rotulo: "Valor Total por Extenso",           exemplo: "sessenta mil reais",              grupo: "Específicos" },
      { chave: "dataInicio",            rotulo: "Data de Início",                    exemplo: "01/07/2026",                      grupo: "Específicos" },
      { chave: "dataFim",               rotulo: "Data de Término",                   exemplo: "31/12/2026",                      grupo: "Específicos" },
      { chave: "foroComarca",           rotulo: "Foro / Comarca",                    exemplo: "Guaratinguetá/SP",                 grupo: "Específicos" },
    ],
  },
  {
    tipo: "contrato_terceiros",
    titulo: "Contrato Terceiros",
    descricao: "Contrato de prestação de serviços de empresa terceira (empreiteira, fornecedor).",
    icone: "Handshake",
    categoria: "contratos",
    placeholders: [
      ...PH_EMPRESA,
      ...PH_DOCUMENTO,
      ...PH_OBRA,
      { chave: "contratadaNome",          rotulo: "Razão Social da Contratada",    exemplo: "EMPREITEIRA ALPHA LTDA",          grupo: "Contratada" },
      { chave: "contratadaCnpj",          rotulo: "CNPJ da Contratada",            exemplo: "12.345.678/0001-99",             grupo: "Contratada" },
      { chave: "contratadaEndereco",      rotulo: "Endereço da Contratada",        exemplo: "RUA B, 200 - GUARATINGUETÁ/SP",  grupo: "Contratada" },
      { chave: "contratadaRepresentante", rotulo: "Representante da Contratada",   exemplo: "NOME DO RESPONSÁVEL",            grupo: "Contratada" },
      { chave: "descricaoServico",        rotulo: "Descrição do Serviço",          exemplo: "Execução de alvenaria e reboco", grupo: "Específicos" },
      { chave: "valorTotal",              rotulo: "Valor Total (R$)",              exemplo: "R$ 150.000,00",                  grupo: "Específicos" },
      { chave: "dataInicio",              rotulo: "Data de Início",                exemplo: "01/07/2026",                     grupo: "Específicos" },
      { chave: "dataTermino",             rotulo: "Data de Término",               exemplo: "31/12/2026",                     grupo: "Específicos" },
      { chave: "foroComarca",             rotulo: "Foro / Comarca",                exemplo: "Guaratinguetá/SP",                grupo: "Específicos" },
    ],
  },
  {
    tipo: "aviso_encerramento_pj",
    titulo: "Aviso de Encerramento de Contrato PJ",
    descricao: "Comunicado formal de encerramento/rescisão de contrato de prestação de serviços PJ.",
    icone: "FileX",
    categoria: "contratos",
    placeholders: [
      ...PH_EMPRESA,
      ...PH_DOCUMENTO,
      { chave: "representanteLegal",      rotulo: "Representante Legal (Contratante)", exemplo: "FELIPE COSTA ALVES",           grupo: "Contratante" },
      { chave: "contratadaRazaoSocial",   rotulo: "Razão Social da Contratada",        exemplo: "JOÃO SILVA SERVIÇOS LTDA",     grupo: "Contratada PJ" },
      { chave: "contratadaCnpj",          rotulo: "CNPJ da Contratada",                exemplo: "12.345.678/0001-99",           grupo: "Contratada PJ" },
      { chave: "numeroContrato",          rotulo: "Número do Contrato",                exemplo: "001/2025",                     grupo: "Contrato" },
      { chave: "dataInicioContrato",      rotulo: "Data de Início do Contrato",        exemplo: "01/01/2025",                   grupo: "Contrato" },
      { chave: "dataEncerramentoContrato",rotulo: "Data de Encerramento",              exemplo: "31/07/2026",                   grupo: "Contrato" },
      { chave: "motivoEncerramento",      rotulo: "Motivo do Encerramento",            exemplo: "conclusão do objeto contratado", grupo: "Contrato" },
      { chave: "prazoAviso",              rotulo: "Prazo de Aviso Prévio (dias)",       exemplo: "30",                          grupo: "Contrato" },
    ],
  },
];

export const DOCUMENT_TEMPLATE_TIPOS: DocumentTemplateTipo[] =
  DOCUMENT_TEMPLATES_META.map(m => m.tipo);

export function getTemplateMeta(tipo: string): DocumentTemplateMeta | undefined {
  return DOCUMENT_TEMPLATES_META.find(m => m.tipo === tipo);
}

// ── Documentos CUSTOM (Rev. 2751) ──────────────────────────────────────────
// Além dos 7 tipos fixos, a Central de Documentos permite CRIAR documentos
// avulsos (institucionais, fora dos geradores) via IA: subir um PDF modelo →
// IA extrai corpo+placeholders, ou digitar o assunto → IA gera o texto. Esses
// docs usam um `tipo` slug com prefixo `custom_` e os placeholders COMUNS
// (colaborador/empresa/documento/obra), já que não têm campos específicos.

export const PH_COMUM: PlaceholderDef[] = [
  ...PH_COLABORADOR,
  ...PH_EMPRESA,
  ...PH_DOCUMENTO,
  ...PH_OBRA,
];

/** Slug determinístico p/ o `tipo` de um documento custom a partir do título. */
export function slugifyDocTipo(titulo: string): string {
  const base = String(titulo || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")  // remove acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  const slug = base || "documento";
  return `custom_${slug}`.slice(0, 60);
}

/** Um `tipo` é custom quando não pertence aos 7 fixos. */
export function isCustomTipo(tipo: string): boolean {
  return !DOCUMENT_TEMPLATE_TIPOS.includes(tipo as DocumentTemplateTipo);
}

/**
 * Meta resolvida p/ QUALQUER tipo: devolve a meta fixa dos 7 tipos, ou uma
 * meta sintética (placeholders comuns) p/ documentos custom. `titulo` permite
 * dar nome ao doc custom (ex.: vindo da linha do banco ou do que o usuário
 * digitou no "Novo Documento").
 */
export function getDocMetaOrFallback(tipo: string, titulo?: string): DocumentTemplateMeta {
  const fixed = getTemplateMeta(tipo);
  if (fixed) return fixed;
  return {
    tipo: tipo as DocumentTemplateTipo,
    titulo: titulo || "Documento Institucional",
    descricao: "Documento institucional avulso (custom).",
    icone: "FileText",
    placeholders: PH_COMUM,
  };
}

/**
 * Interpola placeholders {{chave}} no HTML do template.
 * Mantém intactos placeholders desconhecidos (útil pra debug).
 */
export function renderTemplate(html: string, dados: Record<string, string | number | null | undefined>): string {
  if (!html) return "";
  return html.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, chave) => {
    const v = dados[chave];
    if (v === undefined || v === null) return `{{${chave}}}`;
    return String(v);
  });
}

// ============================================================================
// Rev. 2747 — CONTROLE ISO DOCUMENTAL + SEEDS (fonte oficial)
// ============================================================================
// A aba "Templates de Documentos" passa a ser a FONTE OFICIAL dos documentos
// institucionais FC. Cada tipo nasce com um seed (Rev. 1, status Vigente) que
// reproduz o texto institucional já praticado pelos geradores. Os módulos
// consultam o template Vigente (getVigente) e caem no HTML hard-coded apenas
// quando não há Vigente (fallback seguro).

export type DocStatus = "rascunho" | "vigente" | "obsoleto";

export const DOC_STATUS_LABELS: Record<DocStatus, string> = {
  rascunho: "Rascunho",
  vigente: "Vigente",
  obsoleto: "Obsoleto",
};

/** Código documental ISO (controle de documentos) por tipo. */
export const DEFAULT_CODIGOS: Record<DocumentTemplateTipo, string> = {
  // RH
  contrato_experiencia:   "FC-RH-001",
  termo_responsabilidade: "FC-RH-002",
  comunicado_interno:     "FC-RH-003",
  advertencia:            "FC-RH-004",
  aviso_previo:           "FC-RH-005",
  termo_rescisao:         "FC-RH-006",
  carta_mdo:              "FC-RH-007",
  // RH — Documentos do Colaborador (Rev. 4669)
  ficha_registro:         "FC-RH-008",
  termo_equipamentos:     "FC-RH-009",
  termo_confidencialidade:"FC-RH-010",
  regulamento_interno:    "FC-RH-011",
  codigo_etica:           "FC-RH-012",
  termo_lgpd:             "FC-RH-013",
  acordo_banco_horas:     "FC-RH-014",
  acordo_compensacao:     "FC-RH-015",
  // RH — Fases 2/3 (Rev. 4672)
  contrato_trabalho_clt:  "FC-RH-016",
  solicitacao_ferias:     "FC-RH-017",
  recibo_ferias:          "FC-RH-018",
  recibo_folha:           "FC-RH-019",
  termo_aditivo:          "FC-RH-020",
  adesao_plano_saude:     "FC-RH-021",
  adesao_vt:              "FC-RH-022",
  recusa_vt:              "FC-RH-023",
  adesao_va:              "FC-RH-024",
  adesao_seguro_vida:     "FC-RH-025",
  // Financeiro
  recibo_pagamento:       "FC-FIN-001",
  comprovante_pagamento:  "FC-FIN-002",
  recibo_adiantamento:    "FC-FIN-003",
  // Planejamento
  ata_reuniao:            "FC-PL-001",
  // Contratos
  ordem_servico:              "FC-CON-001",
  proposta_comercial:         "FC-CON-002",
  aviso_encerramento_pj:      "FC-CON-003",
};

// ── Seed: Aviso de Encerramento de Contrato PJ ───────────────────────────────
const SEED_AVISO_ENCERRAMENTO_PJ = `
<p style="margin-bottom:12px;text-align:justify"><strong>{{empresaRazaoSocial}}</strong>, inscrita no CNPJ sob o nº <strong>{{empresaCnpj}}</strong>, com sede em <strong>{{empresaEndereco}}</strong>, neste ato representada por seu sócio administrador, <strong>{{representanteLegal}}</strong>, doravante denominada simplesmente <strong>CONTRATANTE</strong>, vem, por meio deste instrumento, comunicar formalmente à empresa <strong>{{contratadaRazaoSocial}}</strong>, inscrita no CNPJ sob o nº <strong>{{contratadaCnpj}}</strong>, doravante denominada simplesmente <strong>CONTRATADA</strong>, o encerramento do contrato de prestação de serviços celebrado entre as partes.</p>

<p style="margin-top:14px"><strong>1. DO CONTRATO OBJETO DESTE AVISO</strong></p>
<p style="margin-top:6px;text-align:justify">O presente aviso refere-se ao Contrato de Prestação de Serviços nº <strong>{{numeroContrato}}</strong>, celebrado em <strong>{{dataInicioContrato}}</strong>, cujo objeto consistia na prestação de serviços técnicos especializados pela CONTRATADA à CONTRATANTE.</p>

<p style="margin-top:14px"><strong>2. DO ENCERRAMENTO</strong></p>
<p style="margin-top:6px;text-align:justify">A CONTRATANTE comunica o encerramento do referido contrato em razão de <strong>{{motivoEncerramento}}</strong>, com vigência até a data de <strong>{{dataEncerramentoContrato}}</strong>.</p>

<p style="margin-top:14px"><strong>3. DO PRAZO E DAS OBRIGAÇÕES PENDENTES</strong></p>
<p style="margin-top:6px;text-align:justify">As partes concordam que o prazo de encerramento observará o aviso prévio de <strong>{{prazoAviso}} ({{prazoAviso}}) dias</strong> a contar da data de recebimento deste comunicado, período durante o qual ambas as partes deverão cumprir integralmente as obrigações assumidas no contrato, incluindo eventuais pendências de pagamento, entrega de relatórios, prestação de contas e devolução de documentos ou equipamentos.</p>

<p style="margin-top:14px"><strong>4. DA QUITAÇÃO</strong></p>
<p style="margin-top:6px;text-align:justify">Concluídas todas as obrigações acima mencionadas, as partes darão plena, geral e irrevogável quitação uma à outra, relativamente ao objeto do contrato ora encerrado, nada mais tendo a reclamar a qualquer título.</p>

<p style="margin-top:14px"><strong>5. DAS DISPOSIÇÕES FINAIS</strong></p>
<p style="margin-top:6px;text-align:justify">Este comunicado é firmado em 2 (duas) vias de igual teor e forma, ficando uma via com cada parte.</p>

<p style="margin-top:20px">{{docLocal}}, {{docData}}.</p>
`;

// ── Corpos-semente (apenas o CORPO; o cabeçalho/faixa/assinaturas vêm do
//    buildFcDocument no client). Usam placeholders {{chave}} já catalogados em
//    DOCUMENT_TEMPLATES_META. Reproduzem fielmente o texto institucional atual.
const SEED_CONTRATO_EXPERIENCIA = `
<p><strong>Pelo presente instrumento particular de CONTRATO DE TRABALHO POR PRAZO DETERMINADO (EXPERIÊNCIA), que entre si fazem:</strong></p>

<p style="margin-top:12px"><strong>EMPREGADOR:</strong> {{empresaRazaoSocial}}, inscrita no CNPJ sob nº {{empresaCnpj}}, com sede em {{empresaEndereco}}, doravante denominada simplesmente <strong>EMPREGADOR</strong>.</p>

<p style="margin-top:8px"><strong>EMPREGADO(A):</strong> {{empNome}}, portador(a) do CPF nº {{empCpf}}, RG nº {{empRg}}, CTPS nº {{empCtps}}, residente em {{empEndereco}}, doravante denominado(a) simplesmente <strong>EMPREGADO(A)</strong>.</p>

<p style="margin-top:10px">Têm entre si justo e contratado o seguinte:</p>

<p style="margin-top:14px"><strong>CLÁUSULA 1ª — DA FUNÇÃO.</strong> O(A) EMPREGADO(A) é admitido(a) para exercer a função de <strong>{{empFuncao}}</strong>, obrigando-se a executar as tarefas inerentes à função para a qual foi contratado(a), bem como as que forem compatíveis com a sua condição pessoal.</p>

{{clausulaRemuneracao}}

<p style="margin-top:8px"><strong>CLÁUSULA 3ª — DA JORNADA DE TRABALHO.</strong> A jornada ordinária de trabalho do(a) EMPREGADO(A) será cumprida <strong>{{jornadaSemanal}}</strong>, respeitados os intervalos legais para repouso e alimentação, nos termos do Art. 71 da CLT.</p>

<p style="margin-top:8px"><strong>CLÁUSULA 4ª — DA PRORROGAÇÃO DA JORNADA E HORAS EXTRAORDINÁRIAS.</strong> Nos termos do <strong>Art. 59 da Consolidação das Leis do Trabalho (CLT)</strong> e da <strong>Convenção Coletiva de Trabalho da categoria profissional</strong> vigente, a jornada normal estabelecida na CLÁUSULA 3ª poderá ser acrescida de <strong>até 2 (duas) horas suplementares diárias</strong>, mediante prévia solicitação do EMPREGADOR, sempre que assim exigirem as necessidades operacionais da obra, do serviço ou do contrato com o cliente. O(A) EMPREGADO(A) declara, neste ato, expressa e formal ciência de que a prestação de horas extraordinárias, dentro do limite legal supracitado, constitui <strong>prerrogativa do EMPREGADOR</strong> e parte integrante das condições do presente contrato, comprometendo-se a manter disponibilidade compatível com a possível convocação para tais demandas, ressalvadas as hipóteses de impossibilidade justificada. As horas extras eventualmente prestadas serão integralmente <strong>remuneradas com o adicional legal/convencional aplicável</strong>, ou, alternativamente, <strong>compensadas mediante banco de horas</strong>, na forma do §2º do Art. 59 da CLT e do acordo individual ou coletivo vigente. A presente cláusula constitui aviso prévio formal e inequívoco ao(à) EMPREGADO(A), afastando, para todos os efeitos, qualquer alegação posterior de desconhecimento da referida prerrogativa empresarial.</p>

<p style="margin-top:8px"><strong>CLÁUSULA 5ª — DO PRAZO.</strong> O presente contrato é firmado por prazo determinado de <strong>{{prazo1}} dias</strong>, com início em <strong>{{dataInicio}}</strong> e término previsto em <strong>{{dataFim}}</strong>, podendo ser prorrogado por mais <strong>{{prazo2}} dias</strong>, totalizando <strong>{{prazoTotal}} dias</strong>, com término final em <strong>{{dataFimFinal}}</strong>, conforme Art. 445 da CLT.</p>

<p style="margin-top:8px"><strong>CLÁUSULA 6ª — DA RESCISÃO ANTECIPADA.</strong> Caso o EMPREGADOR rescinda o contrato antes do prazo estipulado, sem justa causa, ficará obrigado a pagar ao EMPREGADO(A), a título de indenização, metade da remuneração a que teria direito até o término do contrato, conforme <strong>Art. 479 da CLT</strong>. Caso o(a) EMPREGADO(A) se desligue antes do prazo, poderá ser obrigado(a) a indenizar o EMPREGADOR nos termos do <strong>Art. 480 da CLT</strong>, limitada a indenização àquela a que teria direito o empregado em idênticas condições (§1º).</p>

<p style="margin-top:8px"><strong>CLÁUSULA 7ª — DAS OBRIGAÇÕES.</strong> O(A) EMPREGADO(A) se obriga a cumprir o regulamento interno da empresa, manter sigilo sobre informações confidenciais e zelar pelos equipamentos e materiais que lhe forem confiados.</p>

<p style="margin-top:8px"><strong>CLÁUSULA 8ª — DO LOCAL DE TRABALHO.</strong> O(A) EMPREGADO(A) prestará serviços nas dependências do EMPREGADOR ou em obras/projetos por ele designados, podendo ser transferido(a) conforme necessidade do serviço.</p>

<p style="margin-top:8px"><strong>CLÁUSULA 9ª — DAS DISPOSIÇÕES GERAIS.</strong> As partes elegem o foro da Comarca de {{docLocal}} para dirimir quaisquer dúvidas oriundas do presente contrato. Fica assegurado ao(a) EMPREGADO(A) todos os direitos previstos na CLT e legislação trabalhista vigente.</p>

<p style="margin-top:16px">E por estarem assim justos e contratados, firmam o presente instrumento em 2 (duas) vias de igual teor e forma, na presença de 2 (duas) testemunhas.</p>
`;

const SEED_TERMO_RESPONSABILIDADE = `
<p style="text-align:justify;text-indent:30px;margin-bottom:12px">
  Eu, <strong>{{empNome}}</strong>, portador(a) do RG nº <strong>{{empRg}}</strong> e CPF nº <strong>{{empCpf}}</strong>, exercendo a função de <strong>{{empFuncao}}</strong>, colaborador(a) da empresa <strong>{{empresaRazaoSocial}}</strong>, inscrita no CNPJ sob o nº <strong>{{empresaCnpj}}</strong>, declaro, para os devidos fins, que recebi da empresa, para utilização no exercício de minhas atividades profissionais, os seguintes bens:
</p>

<ul style="margin:6px 0 12px 28px;padding:0;font-size:11pt">
  <li>Ferramentas;</li>
  <li>Equipamentos;</li>
  <li>Máquinas;</li>
  <li>Aparelhos eletrônicos;</li>
  <li>Veículos;</li>
  <li>Acessórios e demais itens correlatos necessários à execução das atividades laborais.</li>
</ul>

<h3 style="font-size:11pt;font-weight:bold;color:#1B2A4A;border-left:3px solid #1B2A4A;padding-left:8px;margin:18px 0 8px">RELAÇÃO ESPECÍFICA DOS ITENS ENTREGUES NESTA DATA</h3>
<table style="width:100%;border-collapse:collapse;font-size:10.5pt;margin-bottom:10px">
  <thead>
    <tr style="background:#1B2A4A;color:#fff">
      <th style="border:1px solid #1B2A4A;padding:6px 8px;text-align:center;width:36px">#</th>
      <th style="border:1px solid #1B2A4A;padding:6px 8px;text-align:left">Item / Descrição</th>
      <th style="border:1px solid #1B2A4A;padding:6px 8px;text-align:center;width:60px">Qtd.</th>
      <th style="border:1px solid #1B2A4A;padding:6px 8px;text-align:left;width:180px">Estado de Conservação</th>
    </tr>
  </thead>
  <tbody>{{itensTabela}}</tbody>
</table>

<h3 style="font-size:11pt;font-weight:bold;color:#1B2A4A;border-left:3px solid #1B2A4A;padding-left:8px;margin:18px 0 8px">CLÁUSULA 1ª — DA PROPRIEDADE E DAS OBRIGAÇÕES</h3>
<p style="text-align:justify;margin-bottom:8px">Declaro estar ciente de que os bens acima mencionados são de propriedade exclusiva da empresa, comprometendo-me a:</p>
<ol style="margin:0 0 10px 28px;padding:0;font-size:11pt;text-align:justify">
  <li>Utilizá-los exclusivamente para fins profissionais e relacionados às atividades da empresa;</li>
  <li>Zelar pela boa conservação, guarda, limpeza e correto uso dos bens disponibilizados;</li>
  <li>Não permitir o uso por terceiros não autorizados;</li>
  <li>Comunicar imediatamente à empresa qualquer defeito, dano, extravio, furto, roubo, acidente ou irregularidade envolvendo os bens sob minha responsabilidade;</li>
  <li>Devolver todos os itens recebidos em perfeito estado de conservação, ressalvado o desgaste natural decorrente do uso adequado.</li>
</ol>

<h3 style="font-size:11pt;font-weight:bold;color:#1B2A4A;border-left:3px solid #1B2A4A;padding-left:8px;margin:18px 0 8px">CLÁUSULA 2ª — DESCONTOS POR DANO, PERDA OU MAU USO (ART. 462, §1º, CLT)</h3>
<p style="text-align:justify;margin-bottom:6px">Fica expressamente estabelecido que, em caso de dano, perda, extravio, avaria, quebra ou qualquer prejuízo causado em decorrência de mau uso, negligência, imprudência, imperícia, utilização inadequada, descumprimento das orientações da empresa, dolo ou culpa do colaborador, o colaborador autoriza, desde já, nos termos do <strong>artigo 462, §1º, da CLT</strong>, o desconto em folha de pagamento dos valores correspondentes ao prejuízo causado, limitado ao valor efetivamente apurado pela empresa.</p>

<h3 style="font-size:11pt;font-weight:bold;color:#1B2A4A;border-left:3px solid #1B2A4A;padding-left:8px;margin:18px 0 8px">CLÁUSULA 3ª — VEÍCULOS E INFRAÇÕES DE TRÂNSITO</h3>
<p style="text-align:justify;margin-bottom:6px">No caso específico de veículos, o colaborador também se responsabiliza por multas decorrentes de infrações de trânsito cometidas durante sua utilização, danos ocasionados por condução inadequada e descumprimento das normas internas e legislação de trânsito vigente.</p>

<h3 style="font-size:11pt;font-weight:bold;color:#1B2A4A;border-left:3px solid #1B2A4A;padding-left:8px;margin:18px 0 8px">CLÁUSULA 4ª — VIGÊNCIA</h3>
<p style="text-align:justify;margin-bottom:8px">Este termo passa a vigorar na data de sua assinatura e permanecerá válido enquanto houver bens da empresa sob responsabilidade do colaborador.</p>

<p style="text-align:justify;text-indent:30px;margin-top:10px;margin-bottom:8px">Por estarem de pleno acordo, firmam o presente termo.</p>
`;

const SEED_COMUNICADO_INTERNO = `
<div style="margin:8px 0">{{corpoMsg}}</div>
<p style="margin-top:18px;font-size:10pt;color:#475569;font-style:italic">Declaro que recebi, li e estou ciente do conteúdo do comunicado acima identificado.</p>
`;

const SEED_ADVERTENCIA = `
<p style="margin-bottom:10px">Pelo presente instrumento, a empresa <strong>{{empresaRazaoSocial}}</strong>, inscrita no CNPJ sob o nº <strong>{{empresaCnpj}}</strong>, vem aplicar ao(à) colaborador(a) <strong>{{empNome}}</strong>, portador(a) do CPF nº <strong>{{empCpf}}</strong>, ocupante da função de <strong>{{empFuncao}}</strong>, a presente <strong>ADVERTÊNCIA {{tipoAdv}}</strong>, em razão do fato ocorrido em <strong>{{ocorrenciaData}}</strong>, conforme a seguir descrito:</p>
<div style="margin:10px 0;padding:12px 14px;background:#f8fafc;border-left:3px solid #1B2A4A;text-align:justify"><strong>Motivo:</strong> {{motivo}}</div>
<p style="margin-bottom:10px;text-align:justify">A presente medida disciplinar tem por fundamento o <strong>{{baseLegal}}</strong> e o poder diretivo do empregador, visando ao restabelecimento da ordem e da disciplina no ambiente de trabalho.</p>
<p style="margin-bottom:10px;text-align:justify">Esclarecemos que a reincidência ou a prática de novas faltas poderá ensejar a aplicação de medidas disciplinares mais gravosas, inclusive a rescisão do contrato de trabalho por justa causa, nos termos do Art. 482 da CLT.</p>
<p style="margin-top:14px;text-align:justify">Ciente do teor desta advertência, firmo o presente documento.</p>
`;

const SEED_AVISO_PREVIO = `
<p style="margin-bottom:10px">À</p>
<p style="margin-bottom:10px"><strong>{{empNome}}</strong>, portador(a) do CPF nº <strong>{{empCpf}}</strong>, CTPS nº <strong>{{empCtps}}</strong>.</p>
<p style="margin-bottom:10px;text-align:justify">Pelo presente notificamos que, a contar de <strong>{{dataAviso}}</strong>, fica concedido o AVISO PRÉVIO, na modalidade <strong>{{modalidade}}</strong>, pelo prazo de <strong>{{diasAviso}} dias</strong>, nos termos e para os efeitos do disposto na Consolidação das Leis do Trabalho (CLT) e na Lei nº 12.506, de 11/10/2011.</p>
<p style="margin-bottom:10px;text-align:justify">O desligamento definitivo dar-se-á em <strong>{{dataDesligamento}}</strong>, ocasião em que serão apuradas e quitadas as verbas rescisórias devidas, na forma da lei.</p>
<p style="margin-top:14px">Pedimos a devolução da presente com o seu <strong>"CIENTE"</strong>.</p>
`;

const SEED_TERMO_RESCISAO = `
<p style="margin-bottom:10px;text-align:justify">Pelo presente <strong>TERMO DE RESCISÃO DO CONTRATO DE TRABALHO</strong>, a empresa <strong>{{empresaRazaoSocial}}</strong>, inscrita no CNPJ sob o nº <strong>{{empresaCnpj}}</strong>, e o(a) colaborador(a) <strong>{{empNome}}</strong>, portador(a) do CPF nº <strong>{{empCpf}}</strong>, ocupante da função de <strong>{{empFuncao}}</strong>, ajustam a rescisão do contrato de trabalho.</p>
<p style="margin-bottom:10px;text-align:justify"><strong>Motivo da rescisão:</strong> {{motivoRescisao}}. <strong>Data da rescisão:</strong> {{dataRescisao}}.</p>
<h3 style="font-size:11pt;font-weight:bold;color:#1B2A4A;border-left:3px solid #1B2A4A;padding-left:8px;margin:16px 0 8px">DEMONSTRATIVO DE VERBAS RESCISÓRIAS</h3>
<div style="margin-bottom:10px">{{verbasRescisao}}</div>
<p style="margin-top:14px;text-align:justify">Dou plena, geral e irrevogável quitação para nada mais reclamar, a qualquer título, em juízo ou fora dele, relativamente ao extinto contrato de trabalho, ressalvadas as parcelas e diferenças eventualmente devidas e não quitadas neste ato.</p>
`;

const SEED_CARTA_MDO = `
<p style="margin-bottom:10px">À Instituição Financeira: _______________________________</p>
<p style="margin-bottom:10px">Prezados,</p>
<p style="margin-bottom:10px;text-align:justify">A empresa <strong>{{empresaRazaoSocial}}</strong>, inscrita no CNPJ sob o nº <strong>{{empresaCnpj}}</strong>, com sede à <strong>{{empresaEndereco}}</strong>, vem por meio desta encaminhar o(a) colaborador(a) abaixo identificado(a) para fins de abertura de conta salário, conforme previsto na legislação vigente.</p>
<p style="margin-bottom:6px"><strong>Dados do(a) Colaborador(a):</strong></p>
<div style="margin-bottom:4px"><strong>Nome completo:</strong> {{empNome}}</div>
<div style="margin-bottom:4px"><strong>CPF:</strong> {{empCpf}}</div>
<div style="margin-bottom:4px"><strong>RG:</strong> {{empRg}}</div>
<div style="margin-bottom:4px"><strong>Cargo:</strong> {{empFuncao}}</div>
<div style="margin-bottom:4px"><strong>Data de admissão:</strong> {{empAdmissao}}</div>
<p style="margin-top:14px">Desde já agradecemos a atenção e colocamo-nos à disposição para eventuais esclarecimentos.</p>
`;

// ── Seeds Financeiro ──────────────────────────────────────────────────────────
const SEED_RECIBO_PAGAMENTO = `
<p style="text-align:center;font-size:13pt;margin-bottom:16px"><strong>RECIBO DE PAGAMENTO</strong></p>
<p style="margin-bottom:12px;text-align:justify">Eu, <strong>{{empNome}}</strong>, portador(a) do CPF nº <strong>{{empCpf}}</strong>, ocupante da função de <strong>{{empFuncao}}</strong> na empresa <strong>{{empresaRazaoSocial}}</strong>, inscrita no CNPJ sob o nº <strong>{{empresaCnpj}}</strong>, declaro que recebi a importância de <strong>{{valor}}</strong> (<em>{{valorExtenso}}</em>), referente a: <strong>{{referente}}</strong>, relativo ao período de <strong>{{mesRef}}</strong>.</p>
<table style="width:100%;border-collapse:collapse;margin:14px 0;font-size:10.5pt">
  <tr>
    <td style="border:1px solid #D0D5DD;padding:7px 12px;background:#F8FAFC;font-weight:bold;width:35%">Referente a</td>
    <td style="border:1px solid #D0D5DD;padding:7px 12px">{{referente}}</td>
  </tr>
  <tr>
    <td style="border:1px solid #D0D5DD;padding:7px 12px;background:#F8FAFC;font-weight:bold">Valor</td>
    <td style="border:1px solid #D0D5DD;padding:7px 12px"><strong>{{valor}}</strong> ({{valorExtenso}})</td>
  </tr>
  <tr>
    <td style="border:1px solid #D0D5DD;padding:7px 12px;background:#F8FAFC;font-weight:bold">Forma de Pagamento</td>
    <td style="border:1px solid #D0D5DD;padding:7px 12px">{{formaPagamento}}</td>
  </tr>
  <tr>
    <td style="border:1px solid #D0D5DD;padding:7px 12px;background:#F8FAFC;font-weight:bold">Data de Pagamento</td>
    <td style="border:1px solid #D0D5DD;padding:7px 12px">{{dataPagamento}}</td>
  </tr>
</table>
<p style="margin-top:12px;text-align:justify">Dou plena quitação da importância acima recebida, para nada mais reclamar a respeito do período de <strong>{{mesRef}}</strong>.</p>
`;

const SEED_COMPROVANTE_PAGAMENTO = `
<p style="margin-bottom:12px;text-align:justify">A empresa <strong>{{empresaRazaoSocial}}</strong>, inscrita no CNPJ sob o nº <strong>{{empresaCnpj}}</strong>, com sede em <strong>{{empresaEndereco}}</strong>, declara, para os devidos fins, que efetuou o pagamento ao(à) beneficiário(a) <strong>{{empNome}}</strong>, CPF nº <strong>{{empCpf}}</strong>, conforme detalhado abaixo:</p>
<table style="width:100%;border-collapse:collapse;margin:14px 0;font-size:10.5pt">
  <tr>
    <td style="border:1px solid #D0D5DD;padding:7px 12px;background:#F8FAFC;font-weight:bold;width:35%">Beneficiário</td>
    <td style="border:1px solid #D0D5DD;padding:7px 12px">{{empNome}}</td>
  </tr>
  <tr>
    <td style="border:1px solid #D0D5DD;padding:7px 12px;background:#F8FAFC;font-weight:bold">CPF</td>
    <td style="border:1px solid #D0D5DD;padding:7px 12px">{{empCpf}}</td>
  </tr>
  <tr>
    <td style="border:1px solid #D0D5DD;padding:7px 12px;background:#F8FAFC;font-weight:bold">Referente a</td>
    <td style="border:1px solid #D0D5DD;padding:7px 12px">{{referente}}</td>
  </tr>
  <tr>
    <td style="border:1px solid #D0D5DD;padding:7px 12px;background:#F8FAFC;font-weight:bold">Valor</td>
    <td style="border:1px solid #D0D5DD;padding:7px 12px"><strong>{{valor}}</strong> ({{valorExtenso}})</td>
  </tr>
  <tr>
    <td style="border:1px solid #D0D5DD;padding:7px 12px;background:#F8FAFC;font-weight:bold">Forma de Pagamento</td>
    <td style="border:1px solid #D0D5DD;padding:7px 12px">{{formaPagamento}}</td>
  </tr>
  <tr>
    <td style="border:1px solid #D0D5DD;padding:7px 12px;background:#F8FAFC;font-weight:bold">Data do Pagamento</td>
    <td style="border:1px solid #D0D5DD;padding:7px 12px">{{dataPagamento}}</td>
  </tr>
</table>
<p style="margin-top:12px">O presente comprovante é emitido a pedido do interessado para fins de comprovação de quitação.</p>
`;

const SEED_RECIBO_ADIANTAMENTO = `
<p style="text-align:center;font-size:13pt;margin-bottom:16px"><strong>RECIBO DE ADIANTAMENTO</strong></p>
<p style="margin-bottom:12px;text-align:justify">Eu, <strong>{{empNome}}</strong>, portador(a) do CPF nº <strong>{{empCpf}}</strong>, ocupante da função de <strong>{{empFuncao}}</strong>, declaro que recebi da empresa <strong>{{empresaRazaoSocial}}</strong>, CNPJ <strong>{{empresaCnpj}}</strong>, o valor de <strong>{{valor}}</strong> (<em>{{valorExtenso}}</em>) a título de <strong>ADIANTAMENTO</strong>, referente a: <strong>{{referente}}</strong>.</p>
<table style="width:100%;border-collapse:collapse;margin:14px 0;font-size:10.5pt">
  <tr>
    <td style="border:1px solid #D0D5DD;padding:7px 12px;background:#F8FAFC;font-weight:bold;width:35%">Referente a</td>
    <td style="border:1px solid #D0D5DD;padding:7px 12px">{{referente}}</td>
  </tr>
  <tr>
    <td style="border:1px solid #D0D5DD;padding:7px 12px;background:#F8FAFC;font-weight:bold">Valor do Adiantamento</td>
    <td style="border:1px solid #D0D5DD;padding:7px 12px"><strong>{{valor}}</strong> ({{valorExtenso}})</td>
  </tr>
  <tr>
    <td style="border:1px solid #D0D5DD;padding:7px 12px;background:#F8FAFC;font-weight:bold">Forma de Pagamento</td>
    <td style="border:1px solid #D0D5DD;padding:7px 12px">{{formaPagamento}}</td>
  </tr>
  <tr>
    <td style="border:1px solid #D0D5DD;padding:7px 12px;background:#F8FAFC;font-weight:bold">Data</td>
    <td style="border:1px solid #D0D5DD;padding:7px 12px">{{dataPagamento}}</td>
  </tr>
  <tr>
    <td style="border:1px solid #D0D5DD;padding:7px 12px;background:#F8FAFC;font-weight:bold">Mês de Referência</td>
    <td style="border:1px solid #D0D5DD;padding:7px 12px">{{mesRef}}</td>
  </tr>
</table>
<p style="margin-top:12px;text-align:justify">Declaro estar ciente de que o valor recebido como adiantamento será descontado na folha de pagamento do período de competência correspondente, conforme autorização expressa contida neste documento.</p>
`;

// ── Seeds Planejamento ─────────────────────────────────────────────────────────
const SEED_ATA_REUNIAO = `
<p style="margin-bottom:10px;text-align:justify">Aos <strong>{{dataReuniao}}</strong>, às <strong>{{horaInicio}}</strong>, reuniram-se em <strong>{{localReuniao}}</strong>, os representantes abaixo identificados, para tratar dos assuntos constantes da pauta previamente divulgada.</p>

<h3 style="font-size:11pt;font-weight:bold;color:#1B2A4A;border-left:3px solid #1B2A4A;padding-left:8px;margin:16px 0 8px">PARTICIPANTES</h3>
<div style="margin-bottom:10px">{{participantes}}</div>

<h3 style="font-size:11pt;font-weight:bold;color:#1B2A4A;border-left:3px solid #1B2A4A;padding-left:8px;margin:16px 0 8px">PAUTA</h3>
<div style="margin-bottom:10px">{{pauta}}</div>

<h3 style="font-size:11pt;font-weight:bold;color:#1B2A4A;border-left:3px solid #1B2A4A;padding-left:8px;margin:16px 0 8px">DELIBERAÇÕES E AÇÕES</h3>
<div style="margin-bottom:10px">{{deliberacoes}}</div>

<p style="margin-top:14px;text-align:justify">Nada mais havendo a tratar, encerrou-se a reunião às <strong>{{horaFim}}</strong>, da qual a presente ata foi lavrada e, após lida e aprovada, segue assinada pelos presentes.</p>
`;

// ── Seeds Contratos ────────────────────────────────────────────────────────────
const SEED_ORDEM_SERVICO = `
<p style="text-align:center;font-size:13pt;margin-bottom:16px"><strong>ORDEM DE SERVIÇO Nº {{docNumero}}</strong></p>
<p style="margin-bottom:10px;text-align:justify">A empresa <strong>{{empresaRazaoSocial}}</strong>, inscrita no CNPJ sob o nº <strong>{{empresaCnpj}}</strong>, com sede em <strong>{{empresaEndereco}}</strong>, doravante denominada <strong>CONTRATANTE</strong>, e a empresa / pessoa física <strong>{{clienteNome}}</strong>, CNPJ/CPF nº <strong>{{clienteCnpj}}</strong>, doravante denominada <strong>CONTRATADA</strong>, firmam a presente Ordem de Serviço nas seguintes condições:</p>

<h3 style="font-size:11pt;font-weight:bold;color:#1B2A4A;border-left:3px solid #1B2A4A;padding-left:8px;margin:16px 0 8px">OBJETO</h3>
<p style="margin-bottom:8px;text-align:justify">{{descricaoServico}}</p>

<h3 style="font-size:11pt;font-weight:bold;color:#1B2A4A;border-left:3px solid #1B2A4A;padding-left:8px;margin:16px 0 8px">CONDIÇÕES</h3>
<table style="width:100%;border-collapse:collapse;margin:8px 0;font-size:10.5pt">
  <tr>
    <td style="border:1px solid #D0D5DD;padding:7px 12px;background:#F8FAFC;font-weight:bold;width:35%">Local de Execução</td>
    <td style="border:1px solid #D0D5DD;padding:7px 12px">{{obraNome}} — {{obraEndereco}}</td>
  </tr>
  <tr>
    <td style="border:1px solid #D0D5DD;padding:7px 12px;background:#F8FAFC;font-weight:bold">Data de Início</td>
    <td style="border:1px solid #D0D5DD;padding:7px 12px">{{dataInicio}}</td>
  </tr>
  <tr>
    <td style="border:1px solid #D0D5DD;padding:7px 12px;background:#F8FAFC;font-weight:bold">Prazo de Execução</td>
    <td style="border:1px solid #D0D5DD;padding:7px 12px">{{prazoExecucao}}</td>
  </tr>
  <tr>
    <td style="border:1px solid #D0D5DD;padding:7px 12px;background:#F8FAFC;font-weight:bold">Valor Total</td>
    <td style="border:1px solid #D0D5DD;padding:7px 12px"><strong>{{valorTotal}}</strong></td>
  </tr>
</table>

<p style="margin-top:14px;text-align:justify">A CONTRATADA obriga-se a executar os serviços conforme especificações técnicas fornecidas pela CONTRATANTE, respeitando as normas de segurança e qualidade exigidas.</p>
`;

const SEED_PROPOSTA_COMERCIAL = `
<p style="margin-bottom:10px">À Empresa: <strong>{{clienteNome}}</strong></p>
<p style="margin-bottom:10px">Prezados Senhores,</p>
<p style="margin-bottom:10px;text-align:justify">A empresa <strong>{{empresaRazaoSocial}}</strong>, inscrita no CNPJ sob o nº <strong>{{empresaCnpj}}</strong>, com sede em <strong>{{empresaEndereco}}</strong>, vem por meio desta apresentar proposta comercial para a execução dos serviços abaixo descritos:</p>

<h3 style="font-size:11pt;font-weight:bold;color:#1B2A4A;border-left:3px solid #1B2A4A;padding-left:8px;margin:16px 0 8px">OBJETO</h3>
<p style="margin-bottom:8px;text-align:justify">{{descricaoServico}}</p>

<h3 style="font-size:11pt;font-weight:bold;color:#1B2A4A;border-left:3px solid #1B2A4A;padding-left:8px;margin:16px 0 8px">LOCAL DE EXECUÇÃO</h3>
<p style="margin-bottom:8px">{{obraNome}} — {{obraEndereco}}</p>

<h3 style="font-size:11pt;font-weight:bold;color:#1B2A4A;border-left:3px solid #1B2A4A;padding-left:8px;margin:16px 0 8px">CONDIÇÕES COMERCIAIS</h3>
<table style="width:100%;border-collapse:collapse;margin:8px 0;font-size:10.5pt">
  <tr>
    <td style="border:1px solid #D0D5DD;padding:7px 12px;background:#F8FAFC;font-weight:bold;width:35%">Prazo de Execução</td>
    <td style="border:1px solid #D0D5DD;padding:7px 12px">{{prazoExecucao}}</td>
  </tr>
  <tr>
    <td style="border:1px solid #D0D5DD;padding:7px 12px;background:#F8FAFC;font-weight:bold">Início Previsto</td>
    <td style="border:1px solid #D0D5DD;padding:7px 12px">{{dataInicio}}</td>
  </tr>
  <tr>
    <td style="border:1px solid #D0D5DD;padding:7px 12px;background:#F8FAFC;font-weight:bold">Valor Total</td>
    <td style="border:1px solid #D0D5DD;padding:7px 12px"><strong>{{valorTotal}}</strong></td>
  </tr>
</table>

<p style="margin-top:14px;text-align:justify">A presente proposta tem validade de 30 (trinta) dias corridos a contar da data de emissão. Permanecemos à disposição para quaisquer esclarecimentos.</p>
<p style="margin-top:10px">Atenciosamente,</p>
<p><strong>{{empresaRazaoSocial}}</strong></p>
`;

// ── Rev. 4669 — Seeds: Documentos do Colaborador ─────────────────────────────
const SEED_FICHA_REGISTRO = `
<h3 style="font-size:11pt;font-weight:bold;color:#1B2A4A;border-left:3px solid #1B2A4A;padding-left:8px;margin:4px 0 8px">DADOS PESSOAIS</h3>
<table style="width:100%;border-collapse:collapse;margin:8px 0;font-size:10.5pt">
  <tr><td style="border:1px solid #D0D5DD;padding:6px 12px;background:#F8FAFC;font-weight:bold;width:35%">Nome Completo</td><td style="border:1px solid #D0D5DD;padding:6px 12px">{{empNome}}</td></tr>
  <tr><td style="border:1px solid #D0D5DD;padding:6px 12px;background:#F8FAFC;font-weight:bold">CPF</td><td style="border:1px solid #D0D5DD;padding:6px 12px">{{empCpf}}</td></tr>
  <tr><td style="border:1px solid #D0D5DD;padding:6px 12px;background:#F8FAFC;font-weight:bold">RG</td><td style="border:1px solid #D0D5DD;padding:6px 12px">{{empRg}}</td></tr>
  <tr><td style="border:1px solid #D0D5DD;padding:6px 12px;background:#F8FAFC;font-weight:bold">Data de Nascimento</td><td style="border:1px solid #D0D5DD;padding:6px 12px">{{empNascimento}}</td></tr>
  <tr><td style="border:1px solid #D0D5DD;padding:6px 12px;background:#F8FAFC;font-weight:bold">Estado Civil</td><td style="border:1px solid #D0D5DD;padding:6px 12px">{{empEstadoCivil}}</td></tr>
  <tr><td style="border:1px solid #D0D5DD;padding:6px 12px;background:#F8FAFC;font-weight:bold">Nome da Mãe</td><td style="border:1px solid #D0D5DD;padding:6px 12px">{{empNomeMae}}</td></tr>
  <tr><td style="border:1px solid #D0D5DD;padding:6px 12px;background:#F8FAFC;font-weight:bold">Telefone</td><td style="border:1px solid #D0D5DD;padding:6px 12px">{{empTelefone}}</td></tr>
</table>
<h3 style="font-size:11pt;font-weight:bold;color:#1B2A4A;border-left:3px solid #1B2A4A;padding-left:8px;margin:14px 0 8px">DADOS CONTRATUAIS</h3>
<table style="width:100%;border-collapse:collapse;margin:8px 0;font-size:10.5pt">
  <tr><td style="border:1px solid #D0D5DD;padding:6px 12px;background:#F8FAFC;font-weight:bold;width:35%">Matrícula</td><td style="border:1px solid #D0D5DD;padding:6px 12px">{{empMatricula}}</td></tr>
  <tr><td style="border:1px solid #D0D5DD;padding:6px 12px;background:#F8FAFC;font-weight:bold">Função</td><td style="border:1px solid #D0D5DD;padding:6px 12px">{{empFuncao}}</td></tr>
  <tr><td style="border:1px solid #D0D5DD;padding:6px 12px;background:#F8FAFC;font-weight:bold">Data de Admissão</td><td style="border:1px solid #D0D5DD;padding:6px 12px">{{empAdmissao}}</td></tr>
  <tr><td style="border:1px solid #D0D5DD;padding:6px 12px;background:#F8FAFC;font-weight:bold">Salário Base</td><td style="border:1px solid #D0D5DD;padding:6px 12px">{{empSalario}}</td></tr>
  <tr><td style="border:1px solid #D0D5DD;padding:6px 12px;background:#F8FAFC;font-weight:bold">CTPS</td><td style="border:1px solid #D0D5DD;padding:6px 12px">{{empCtps}}</td></tr>
  <tr><td style="border:1px solid #D0D5DD;padding:6px 12px;background:#F8FAFC;font-weight:bold">PIS/PASEP</td><td style="border:1px solid #D0D5DD;padding:6px 12px">{{empPis}}</td></tr>
</table>
<h3 style="font-size:11pt;font-weight:bold;color:#1B2A4A;border-left:3px solid #1B2A4A;padding-left:8px;margin:14px 0 8px">DADOS BANCÁRIOS</h3>
<table style="width:100%;border-collapse:collapse;margin:8px 0;font-size:10.5pt">
  <tr><td style="border:1px solid #D0D5DD;padding:6px 12px;background:#F8FAFC;font-weight:bold;width:35%">Banco</td><td style="border:1px solid #D0D5DD;padding:6px 12px">{{empBanco}}</td></tr>
  <tr><td style="border:1px solid #D0D5DD;padding:6px 12px;background:#F8FAFC;font-weight:bold">Agência / Conta</td><td style="border:1px solid #D0D5DD;padding:6px 12px">{{empAgencia}} / {{empConta}}</td></tr>
  <tr><td style="border:1px solid #D0D5DD;padding:6px 12px;background:#F8FAFC;font-weight:bold">Chave PIX</td><td style="border:1px solid #D0D5DD;padding:6px 12px">{{empPix}}</td></tr>
</table>
<p style="margin-top:14px;text-align:justify">Declaro que as informações acima são verdadeiras e me comprometo a comunicar ao setor de Recursos Humanos qualquer alteração nos dados cadastrais.</p>
<p style="margin-top:10px">{{docLocal}}, {{docData}}.</p>
`;

const SEED_TERMO_EQUIPAMENTOS = `
<p style="margin-bottom:10px;text-align:justify">Eu, <strong>{{empNome}}</strong>, CPF <strong>{{empCpf}}</strong>, {{empFuncao}}, colaborador(a) da empresa <strong>{{empresaRazaoSocial}}</strong> (CNPJ {{empresaCnpj}}), declaro ter recebido, em perfeito estado de conservação e funcionamento, os equipamentos abaixo relacionados, de propriedade da empresa:</p>
<p style="margin:10px 0;padding:10px 12px;border:1px solid #D0D5DD;background:#F8FAFC"><strong>Equipamentos:</strong> {{equipamentos}}</p>
<p style="margin-bottom:8px;text-align:justify">Comprometo-me a:</p>
<ol style="margin:0 0 10px 20px;text-align:justify">
  <li>Utilizar os equipamentos exclusivamente no exercício das minhas funções;</li>
  <li>Zelar pela guarda e conservação, comunicando imediatamente qualquer defeito, perda, roubo ou extravio;</li>
  <li>Devolvê-los quando solicitado pela empresa ou ao término do contrato de trabalho, no estado em que se encontrarem, ressalvado o desgaste natural de uso;</li>
  <li>Autorizar, nos termos do Art. 462, §1º da CLT, o desconto salarial do valor correspondente em caso de dano ou perda decorrente de dolo ou negligência comprovada.</li>
</ol>
<p style="margin-top:10px">{{docLocal}}, {{docData}}.</p>
`;

const SEED_TERMO_CONFIDENCIALIDADE = `
<p style="margin-bottom:10px;text-align:justify">Eu, <strong>{{empNome}}</strong>, CPF <strong>{{empCpf}}</strong>, colaborador(a) da empresa <strong>{{empresaRazaoSocial}}</strong> (CNPJ {{empresaCnpj}}), comprometo-me a manter absoluto sigilo sobre toda e qualquer informação confidencial a que tiver acesso em razão do meu contrato de trabalho, incluindo, mas não se limitando a:</p>
<ol style="margin:0 0 10px 20px;text-align:justify">
  <li>Informações técnicas, comerciais, financeiras e estratégicas da empresa;</li>
  <li>Dados de clientes, fornecedores, propostas, contratos e orçamentos;</li>
  <li>Projetos, metodologias, processos construtivos e documentos internos;</li>
  <li>Dados pessoais de colaboradores e terceiros tratados pela empresa.</li>
</ol>
<p style="margin-bottom:8px;text-align:justify">Estou ciente de que a obrigação de confidencialidade permanece válida mesmo após o término do contrato de trabalho, e de que sua violação poderá caracterizar justa causa (Art. 482, "g", da CLT), sem prejuízo da responsabilização civil e criminal cabível.</p>
<p style="margin-top:10px">{{docLocal}}, {{docData}}.</p>
`;

const SEED_REGULAMENTO_INTERNO = `
<p style="margin-bottom:10px;text-align:justify">Eu, <strong>{{empNome}}</strong>, CPF <strong>{{empCpf}}</strong>, colaborador(a) da empresa <strong>{{empresaRazaoSocial}}</strong>, declaro que <strong>recebi, li e compreendi o Regulamento Interno</strong> da empresa, comprometendo-me a cumpri-lo integralmente.</p>
<p style="margin-bottom:8px;text-align:justify">Estou ciente de que:</p>
<ol style="margin:0 0 10px 20px;text-align:justify">
  <li>O regulamento estabelece normas de conduta, horários, uso de uniformes e equipamentos, e procedimentos internos;</li>
  <li>O descumprimento das normas poderá acarretar as sanções disciplinares previstas (advertência, suspensão e demissão por justa causa, conforme Art. 482 da CLT);</li>
  <li>O regulamento poderá ser atualizado, sendo minha responsabilidade manter-me informado(a) das alterações divulgadas pela empresa.</li>
</ol>
<p style="margin-top:10px">{{docLocal}}, {{docData}}.</p>
`;

const SEED_CODIGO_ETICA = `
<p style="margin-bottom:10px;text-align:justify">Eu, <strong>{{empNome}}</strong>, CPF <strong>{{empCpf}}</strong>, colaborador(a) da empresa <strong>{{empresaRazaoSocial}}</strong>, declaro que <strong>recebi, li e compreendi o Código de Ética e Conduta</strong> da empresa, e me comprometo a:</p>
<ol style="margin:0 0 10px 20px;text-align:justify">
  <li>Agir com honestidade, integridade e respeito nas relações com colegas, clientes, fornecedores e comunidade;</li>
  <li>Não praticar nem tolerar qualquer forma de assédio, discriminação ou violência no ambiente de trabalho;</li>
  <li>Não oferecer, prometer ou receber vantagens indevidas (Lei Anticorrupção — Lei 12.846/2013);</li>
  <li>Zelar pelo patrimônio, pela imagem e pelas informações da empresa;</li>
  <li>Reportar violações a este código pelos canais indicados pela empresa.</li>
</ol>
<p style="margin-bottom:8px;text-align:justify">Estou ciente de que o descumprimento deste código sujeita o colaborador às sanções disciplinares cabíveis, nos termos da CLT.</p>
<p style="margin-top:10px">{{docLocal}}, {{docData}}.</p>
`;

const SEED_TERMO_LGPD = `
<p style="margin-bottom:10px;text-align:justify">Eu, <strong>{{empNome}}</strong>, CPF <strong>{{empCpf}}</strong>, na qualidade de colaborador(a) da empresa <strong>{{empresaRazaoSocial}}</strong> (CNPJ {{empresaCnpj}}), declaro estar ciente e de acordo com o tratamento dos meus dados pessoais pela empresa, nos termos da Lei Geral de Proteção de Dados — Lei nº 13.709/2018 (LGPD), conforme abaixo:</p>
<ol style="margin:0 0 10px 20px;text-align:justify">
  <li><strong>Finalidade:</strong> cumprimento de obrigações trabalhistas, previdenciárias e fiscais; gestão de pessoal (folha, benefícios, saúde e segurança do trabalho, controle de jornada, treinamentos e crachás); e atendimento a exigências de clientes e órgãos fiscalizadores;</li>
  <li><strong>Dados tratados:</strong> dados cadastrais, documentos pessoais, dados bancários, dados de saúde ocupacional (ASO), biometria/fotografia e geolocalização quando aplicável às ferramentas de trabalho;</li>
  <li><strong>Compartilhamento:</strong> os dados poderão ser compartilhados com contadores, operadoras de benefícios, clientes (integração em obra), e órgãos públicos, sempre limitado ao necessário;</li>
  <li><strong>Direitos:</strong> posso solicitar acesso, correção ou informação sobre o tratamento dos meus dados pelo canal de RH da empresa;</li>
  <li><strong>Retenção:</strong> os dados serão mantidos pelos prazos legais aplicáveis, mesmo após o término do contrato.</li>
</ol>
<p style="margin-top:10px">{{docLocal}}, {{docData}}.</p>
`;

const SEED_ACORDO_BANCO_HORAS = `
<p style="margin-bottom:10px;text-align:justify">Pelo presente instrumento, a empresa <strong>{{empresaRazaoSocial}}</strong>, CNPJ <strong>{{empresaCnpj}}</strong>, doravante EMPREGADORA, e o(a) colaborador(a) <strong>{{empNome}}</strong>, CPF <strong>{{empCpf}}</strong>, {{empFuncao}}, doravante EMPREGADO(A), celebram o presente <strong>Acordo Individual de Banco de Horas</strong>, nos termos do Art. 59, §5º da CLT:</p>
<ol style="margin:0 0 10px 20px;text-align:justify">
  <li>As horas extraordinárias trabalhadas serão lançadas em banco de horas, para compensação com folgas ou redução de jornada;</li>
  <li>A compensação ocorrerá no prazo máximo de <strong>{{prazoCompensacao}}</strong>, contado do mês de apuração;</li>
  <li>Não havendo compensação no prazo, as horas serão pagas como extras, com o adicional legal ou convencional;</li>
  <li>Em caso de rescisão contratual, o saldo credor será pago com o adicional de horas extras e o saldo devedor poderá ser descontado, na forma da lei;</li>
  <li>O controle do saldo estará disponível ao empregado por meio do sistema de ponto/ERP da empresa.</li>
</ol>
<p style="margin-top:10px">{{docLocal}}, {{docData}}.</p>
`;

const SEED_ACORDO_COMPENSACAO = `
<p style="margin-bottom:10px;text-align:justify">Pelo presente instrumento, a empresa <strong>{{empresaRazaoSocial}}</strong>, CNPJ <strong>{{empresaCnpj}}</strong>, doravante EMPREGADORA, e o(a) colaborador(a) <strong>{{empNome}}</strong>, CPF <strong>{{empCpf}}</strong>, {{empFuncao}}, doravante EMPREGADO(A), celebram o presente <strong>Acordo Individual de Compensação de Jornada</strong>, nos termos dos Arts. 59, §6º, e 59-B da CLT:</p>
<ol style="margin:0 0 10px 20px;text-align:justify">
  <li>A jornada semanal de trabalho será cumprida da seguinte forma: <strong>{{jornadaDescricao}}</strong>;</li>
  <li>A prorrogação diária destina-se à compensação (ex.: supressão ou redução do trabalho aos sábados), respeitado o limite legal;</li>
  <li>A eventual prestação de horas extras não descaracteriza o presente acordo (Art. 59-B, parágrafo único, da CLT);</li>
  <li>Este acordo vigora por prazo indeterminado, podendo ser alterado mediante novo instrumento.</li>
</ol>
<p style="margin-top:10px">{{docLocal}}, {{docData}}.</p>
`;

// ── Rev. 4672 — Seeds Fases 2/3 ──────────────────────────────────────────────
const SEED_CONTRATO_TRABALHO_CLT = `
<p style="margin-bottom:12px;text-align:justify"><strong>{{empresaRazaoSocial}}</strong>, CNPJ <strong>{{empresaCnpj}}</strong>, com sede em <strong>{{empresaEndereco}}</strong>, doravante <strong>EMPREGADORA</strong>, e <strong>{{empNome}}</strong>, CPF <strong>{{empCpf}}</strong>, CTPS <strong>{{empCtps}}</strong>, doravante <strong>EMPREGADO(A)</strong>, celebram o presente CONTRATO INDIVIDUAL DE TRABALHO POR PRAZO INDETERMINADO, regido pela CLT.</p>
<p style="margin-top:14px"><strong>1. DA FUNÇÃO</strong></p>
<p style="margin-top:6px;text-align:justify">O(A) EMPREGADO(A) exercerá a função de <strong>{{empFuncao}}</strong>, obrigando-se a executar os serviços com zelo e dedicação, podendo a EMPREGADORA determinar a prestação de serviços compatíveis com sua condição pessoal.</p>
<p style="margin-top:14px"><strong>2. DA REMUNERAÇÃO</strong></p>
<p style="margin-top:6px;text-align:justify">Salário mensal de <strong>{{empSalario}}</strong>, pago até o 5º dia útil do mês subsequente, com os descontos legais (INSS, IRRF e demais autorizados).</p>
<p style="margin-top:14px"><strong>3. DA JORNADA</strong></p>
<p style="margin-top:6px;text-align:justify">Jornada de <strong>{{jornadaSemanal}}</strong>, no horário <strong>{{horarioTrabalho}}</strong>, com intervalo para refeição e descanso na forma da lei, ficando facultada a compensação de jornada e o banco de horas mediante acordo individual.</p>
<p style="margin-top:14px"><strong>4. DO LOCAL DE TRABALHO</strong></p>
<p style="margin-top:6px;text-align:justify">O(A) EMPREGADO(A) prestará serviços nas obras e estabelecimentos da EMPREGADORA, concordando com transferências na forma do art. 469 da CLT, quando decorrentes de real necessidade de serviço.</p>
<p style="margin-top:14px"><strong>5. DAS DISPOSIÇÕES GERAIS</strong></p>
<p style="margin-top:6px;text-align:justify">Aplicam-se as normas internas da EMPREGADORA, o regulamento interno, o código de ética e as normas de segurança do trabalho, das quais o(a) EMPREGADO(A) declara ter ciência. Este contrato sucede, quando existente, o contrato de experiência anteriormente firmado.</p>
<p style="margin-top:20px">{{docLocal}}, {{docData}}.</p>
`;

const SEED_SOLICITACAO_FERIAS = `
<p style="margin-bottom:12px;text-align:justify">Eu, <strong>{{empNome}}</strong>, CPF <strong>{{empCpf}}</strong>, função <strong>{{empFuncao}}</strong>, venho solicitar/confirmar o gozo de férias conforme abaixo:</p>
<table style="width:100%;border-collapse:collapse;margin:10px 0" border="1" cellpadding="6">
<tr><td><strong>Período aquisitivo</strong></td><td>{{aquisitivoInicio}} a {{aquisitivoFim}}</td></tr>
<tr><td><strong>Período de gozo</strong></td><td>{{feriasInicio}} a {{feriasFim}} ({{feriasDias}} dias)</td></tr>
<tr><td><strong>Abono pecuniário (venda de 1/3)</strong></td><td>{{abonoPecuniario}}</td></tr>
</table>
<p style="margin-top:10px;text-align:justify">Declaro ciência de que o pagamento das férias será efetuado até 2 (dois) dias antes do início do gozo (art. 145 da CLT) e de que devo retornar ao trabalho no primeiro dia útil seguinte ao término do período.</p>
<p style="margin-top:20px">{{docLocal}}, {{docData}}.</p>
`;

const SEED_RECIBO_FERIAS = `
<p style="margin-bottom:12px;text-align:justify">Recebi de <strong>{{empresaRazaoSocial}}</strong>, CNPJ <strong>{{empresaCnpj}}</strong>, a importância líquida de <strong>{{valorLiquido}}</strong> (bruto: {{valorBruto}}), paga em <strong>{{dataPagamento}}</strong>, referente às minhas férias:</p>
<table style="width:100%;border-collapse:collapse;margin:10px 0" border="1" cellpadding="6">
<tr><td><strong>Período aquisitivo</strong></td><td>{{aquisitivoInicio}} a {{aquisitivoFim}}</td></tr>
<tr><td><strong>Período de gozo</strong></td><td>{{feriasInicio}} a {{feriasFim}} ({{feriasDias}} dias)</td></tr>
</table>
<p style="margin-top:10px;text-align:justify">O valor compreende a remuneração das férias acrescida do terço constitucional (art. 7º, XVII, CF), com os descontos legais. Pelo presente, dou plena e geral quitação do período acima.</p>
<p style="margin-top:20px">{{docLocal}}, {{docData}}.</p>
`;

const SEED_RECIBO_FOLHA = `
<p style="margin-bottom:12px;text-align:justify">Recebi de <strong>{{empresaRazaoSocial}}</strong>, CNPJ <strong>{{empresaCnpj}}</strong>, a importância líquida de <strong>{{valorLiquido}}</strong>, paga em <strong>{{dataPagamento}}</strong>, a título de <strong>{{tipoRecibo}}</strong>, competência <strong>{{mesRef}}</strong>.</p>
<p style="margin-top:10px;text-align:justify">Observações: {{observacoes}}</p>
<p style="margin-top:10px;text-align:justify">Para clareza, firmo o presente recibo dando quitação do valor acima, ressalvado o direito a eventuais diferenças que venham a ser apuradas.</p>
<p style="margin-top:20px">{{docLocal}}, {{docData}}.</p>
`;

const SEED_TERMO_ADITIVO = `
<p style="margin-bottom:12px;text-align:justify"><strong>{{empresaRazaoSocial}}</strong>, CNPJ <strong>{{empresaCnpj}}</strong>, e <strong>{{empNome}}</strong>, CPF <strong>{{empCpf}}</strong>, admitido(a) em <strong>{{empAdmissao}}</strong>, celebram o presente TERMO ADITIVO ao contrato de trabalho:</p>
<p style="margin-top:14px"><strong>1. DA ALTERAÇÃO</strong></p>
<p style="margin-top:6px;text-align:justify">Tipo: <strong>{{tipoAlteracao}}</strong>. {{descricaoAlteracao}}</p>
<table style="width:100%;border-collapse:collapse;margin:10px 0" border="1" cellpadding="6">
<tr><td><strong>Nova função</strong></td><td>{{novaFuncao}}</td></tr>
<tr><td><strong>Novo salário</strong></td><td>{{novoSalario}}</td></tr>
<tr><td><strong>Vigência a partir de</strong></td><td>{{dataVigencia}}</td></tr>
</table>
<p style="margin-top:14px"><strong>2. DA RATIFICAÇÃO</strong></p>
<p style="margin-top:6px;text-align:justify">Permanecem inalteradas as demais cláusulas do contrato de trabalho, que ficam ratificadas. A presente alteração não implica prejuízo ao(à) empregado(a) (art. 468 da CLT).</p>
<p style="margin-top:20px">{{docLocal}}, {{docData}}.</p>
`;

const SEED_ADESAO_PLANO_SAUDE = `
<p style="margin-bottom:12px;text-align:justify">Eu, <strong>{{empNome}}</strong>, CPF <strong>{{empCpf}}</strong>, declaro minha ADESÃO ao plano de saúde oferecido por <strong>{{empresaRazaoSocial}}</strong>:</p>
<table style="width:100%;border-collapse:collapse;margin:10px 0" border="1" cellpadding="6">
<tr><td><strong>Operadora</strong></td><td>{{operadora}}</td></tr>
<tr><td><strong>Plano</strong></td><td>{{plano}}</td></tr>
<tr><td><strong>Coparticipação/desconto mensal</strong></td><td>{{coparticipacao}}</td></tr>
</table>
<p style="margin-top:10px;text-align:justify">AUTORIZO, nos termos do art. 462 da CLT, o desconto em folha da coparticipação/mensalidade indicada, bem como das utilizações previstas em contrato. Estou ciente das regras de carência, rede credenciada e cancelamento.</p>
<p style="margin-top:20px">{{docLocal}}, {{docData}}.</p>
`;

const SEED_ADESAO_VT = `
<p style="margin-bottom:12px;text-align:justify">Eu, <strong>{{empNome}}</strong>, CPF <strong>{{empCpf}}</strong>, nos termos da Lei 7.418/85 e do Decreto 95.247/87, declaro que OPTO pelo recebimento de vale-transporte:</p>
<table style="width:100%;border-collapse:collapse;margin:10px 0" border="1" cellpadding="6">
<tr><td><strong>Linhas/percurso</strong></td><td>{{linhas}}</td></tr>
<tr><td><strong>Valor diário</strong></td><td>{{valorDia}}</td></tr>
</table>
<p style="margin-top:10px;text-align:justify">AUTORIZO o desconto de até 6% (seis por cento) do meu salário-base, na forma da lei. Comprometo-me a utilizar o benefício exclusivamente para deslocamento residência-trabalho e a comunicar qualquer alteração de endereço ou percurso, ciente de que declaração falsa constitui falta grave.</p>
<p style="margin-top:20px">{{docLocal}}, {{docData}}.</p>
`;

const SEED_RECUSA_VT = `
<p style="margin-bottom:12px;text-align:justify">Eu, <strong>{{empNome}}</strong>, CPF <strong>{{empCpf}}</strong>, empregado(a) de <strong>{{empresaRazaoSocial}}</strong>, declaro, nos termos do Decreto 95.247/87, que <strong>NÃO OPTO</strong> pelo recebimento do vale-transporte.</p>
<p style="margin-top:10px;text-align:justify">Motivo: <strong>{{motivo}}</strong>.</p>
<p style="margin-top:10px;text-align:justify">Declaro que esta recusa é feita de forma livre e espontânea, isentando a empresa de qualquer obrigação relativa ao benefício enquanto perdurar esta opção, que poderei rever a qualquer tempo mediante nova declaração por escrito.</p>
<p style="margin-top:20px">{{docLocal}}, {{docData}}.</p>
`;

const SEED_ADESAO_VA = `
<p style="margin-bottom:12px;text-align:justify">Eu, <strong>{{empNome}}</strong>, CPF <strong>{{empCpf}}</strong>, declaro minha ADESÃO ao vale-alimentação/refeição oferecido por <strong>{{empresaRazaoSocial}}</strong> no âmbito do PAT — Programa de Alimentação do Trabalhador, no valor mensal de <strong>{{valorMensal}}</strong>.</p>
<p style="margin-top:10px;text-align:justify">Estou ciente de que: (i) o benefício não integra o salário para nenhum efeito (art. 457, §2º, CLT); (ii) faltas não justificadas geram desconto proporcional do benefício, conforme política interna; (iii) o crédito é pessoal e intransferível.</p>
<p style="margin-top:20px">{{docLocal}}, {{docData}}.</p>
`;

const SEED_ADESAO_SEGURO_VIDA = `
<p style="margin-bottom:12px;text-align:justify">Eu, <strong>{{empNome}}</strong>, CPF <strong>{{empCpf}}</strong>, declaro ciência e ADESÃO ao seguro de vida em grupo contratado por <strong>{{empresaRazaoSocial}}</strong>:</p>
<table style="width:100%;border-collapse:collapse;margin:10px 0" border="1" cellpadding="6">
<tr><td><strong>Seguradora</strong></td><td>{{seguradora}}</td></tr>
<tr><td><strong>Apólice</strong></td><td>{{apolice}}</td></tr>
<tr><td><strong>Beneficiários indicados</strong></td><td>{{beneficiarios}}</td></tr>
</table>
<p style="margin-top:10px;text-align:justify">Estou ciente das coberturas, capitais segurados e condições gerais da apólice, disponíveis no RH, e de que devo manter atualizada a indicação de beneficiários.</p>
<p style="margin-top:20px">{{docLocal}}, {{docData}}.</p>
`;

export const SEED_BODIES: Record<DocumentTemplateTipo, string> = {
  // RH
  contrato_experiencia:   SEED_CONTRATO_EXPERIENCIA.trim(),
  termo_responsabilidade: SEED_TERMO_RESPONSABILIDADE.trim(),
  comunicado_interno:     SEED_COMUNICADO_INTERNO.trim(),
  advertencia:            SEED_ADVERTENCIA.trim(),
  aviso_previo:           SEED_AVISO_PREVIO.trim(),
  termo_rescisao:         SEED_TERMO_RESCISAO.trim(),
  carta_mdo:              SEED_CARTA_MDO.trim(),
  // RH — Documentos do Colaborador (Rev. 4669)
  ficha_registro:          SEED_FICHA_REGISTRO.trim(),
  termo_equipamentos:      SEED_TERMO_EQUIPAMENTOS.trim(),
  termo_confidencialidade: SEED_TERMO_CONFIDENCIALIDADE.trim(),
  regulamento_interno:     SEED_REGULAMENTO_INTERNO.trim(),
  codigo_etica:            SEED_CODIGO_ETICA.trim(),
  termo_lgpd:              SEED_TERMO_LGPD.trim(),
  acordo_banco_horas:      SEED_ACORDO_BANCO_HORAS.trim(),
  acordo_compensacao:      SEED_ACORDO_COMPENSACAO.trim(),
  // RH — Fases 2/3 (Rev. 4672)
  contrato_trabalho_clt:   SEED_CONTRATO_TRABALHO_CLT.trim(),
  solicitacao_ferias:      SEED_SOLICITACAO_FERIAS.trim(),
  recibo_ferias:           SEED_RECIBO_FERIAS.trim(),
  recibo_folha:            SEED_RECIBO_FOLHA.trim(),
  termo_aditivo:           SEED_TERMO_ADITIVO.trim(),
  adesao_plano_saude:      SEED_ADESAO_PLANO_SAUDE.trim(),
  adesao_vt:               SEED_ADESAO_VT.trim(),
  recusa_vt:               SEED_RECUSA_VT.trim(),
  adesao_va:               SEED_ADESAO_VA.trim(),
  adesao_seguro_vida:      SEED_ADESAO_SEGURO_VIDA.trim(),
  // Financeiro
  recibo_pagamento:       SEED_RECIBO_PAGAMENTO.trim(),
  comprovante_pagamento:  SEED_COMPROVANTE_PAGAMENTO.trim(),
  recibo_adiantamento:    SEED_RECIBO_ADIANTAMENTO.trim(),
  // Planejamento
  ata_reuniao:            SEED_ATA_REUNIAO.trim(),
  // Contratos
  ordem_servico:              SEED_ORDEM_SERVICO.trim(),
  proposta_comercial:         SEED_PROPOSTA_COMERCIAL.trim(),
  aviso_encerramento_pj:      SEED_AVISO_ENCERRAMENTO_PJ.trim(),
};

// ── Rev. 4669 — Documentos do Colaborador: tipos geráveis por funcionário ────
// Ordem = ordem de exibição no checklist. `obrigatorio` = entra como pendência
// no checklist quando não assinado; os demais aparecem como "quando aplicável".
export const RH_COLAB_DOCS: { tipo: DocumentTemplateTipo; obrigatorio: boolean }[] = [
  { tipo: "ficha_registro",          obrigatorio: true },
  { tipo: "contrato_experiencia",    obrigatorio: true },
  { tipo: "regulamento_interno",     obrigatorio: true },
  { tipo: "codigo_etica",            obrigatorio: true },
  { tipo: "termo_lgpd",              obrigatorio: true },
  { tipo: "termo_confidencialidade", obrigatorio: false },
  { tipo: "termo_equipamentos",      obrigatorio: false },
  { tipo: "acordo_banco_horas",      obrigatorio: false },
  { tipo: "acordo_compensacao",      obrigatorio: false },
  // Rev. 4672 — Fases 2/3
  { tipo: "contrato_trabalho_clt",   obrigatorio: false },
  { tipo: "adesao_plano_saude",      obrigatorio: false },
  { tipo: "adesao_vt",               obrigatorio: false },
  { tipo: "recusa_vt",               obrigatorio: false },
  { tipo: "adesao_va",               obrigatorio: false },
  { tipo: "adesao_seguro_vida",      obrigatorio: false },
];

// ── Rev. 4672 — Documentos EVENTUAIS (por evento, não entram no checklist) ──
// Gerados sob demanda no dossiê: férias, folha e alterações contratuais.
export const RH_DOCS_EVENTUAIS: { tipo: DocumentTemplateTipo }[] = [
  { tipo: "solicitacao_ferias" },
  { tipo: "recibo_ferias" },
  { tipo: "recibo_folha" },
  { tipo: "termo_aditivo" },
  // Rev. 4679 — gerados automaticamente pelos módulos (Aviso Prévio, Advertências)
  { tipo: "aviso_previo" },
  { tipo: "advertencia" },
];

/** Campos extras pedidos na geração (variáveis que não vêm do cadastro).
 *  `auto: "ferias"` = pré-preenchido da última férias programada do funcionário. */
export type CampoExtraDef = { chave: string; rotulo: string; placeholder?: string; obrigatorio?: boolean };
export const RH_DOC_CAMPOS_EXTRAS: Partial<Record<DocumentTemplateTipo, CampoExtraDef[]>> = {
  contrato_trabalho_clt: [
    { chave: "jornadaSemanal",  rotulo: "Jornada semanal",     placeholder: "44 horas semanais" },
    { chave: "horarioTrabalho", rotulo: "Horário de trabalho", placeholder: "Seg a Qui 07h-17h, Sex 07h-16h" },
  ],
  solicitacao_ferias: [
    { chave: "feriasInicio",     rotulo: "Início do gozo (dd/mm/aaaa)", obrigatorio: true },
    { chave: "feriasFim",        rotulo: "Fim do gozo (dd/mm/aaaa)",    obrigatorio: true },
    { chave: "feriasDias",       rotulo: "Dias de gozo",                obrigatorio: true },
    { chave: "aquisitivoInicio", rotulo: "Aquisitivo — início" },
    { chave: "aquisitivoFim",    rotulo: "Aquisitivo — fim" },
    { chave: "abonoPecuniario",  rotulo: "Abono pecuniário", placeholder: "Não" },
  ],
  recibo_ferias: [
    { chave: "feriasInicio",     rotulo: "Início do gozo (dd/mm/aaaa)", obrigatorio: true },
    { chave: "feriasFim",        rotulo: "Fim do gozo (dd/mm/aaaa)",    obrigatorio: true },
    { chave: "feriasDias",       rotulo: "Dias de gozo",                obrigatorio: true },
    { chave: "aquisitivoInicio", rotulo: "Aquisitivo — início" },
    { chave: "aquisitivoFim",    rotulo: "Aquisitivo — fim" },
    { chave: "valorBruto",       rotulo: "Valor bruto (R$)" },
    { chave: "valorLiquido",     rotulo: "Valor líquido (R$)", obrigatorio: true },
    { chave: "dataPagamento",    rotulo: "Data de pagamento" },
  ],
  recibo_folha: [
    { chave: "tipoRecibo",    rotulo: "Tipo", placeholder: "Holerite / 13º 1ª parcela / 13º 2ª parcela / Adiantamento", obrigatorio: true },
    { chave: "mesRef",        rotulo: "Competência", placeholder: "Julho/2026", obrigatorio: true },
    { chave: "valorLiquido",  rotulo: "Valor líquido (R$)", obrigatorio: true },
    { chave: "dataPagamento", rotulo: "Data de pagamento" },
    { chave: "observacoes",   rotulo: "Observações", placeholder: "—" },
  ],
  termo_aditivo: [
    { chave: "tipoAlteracao",      rotulo: "Tipo de alteração", placeholder: "Promoção / Mudança de salário / Mudança de função", obrigatorio: true },
    { chave: "descricaoAlteracao", rotulo: "Descrição da alteração", obrigatorio: true },
    { chave: "novaFuncao",         rotulo: "Nova função", placeholder: "(mantém atual se vazio)" },
    { chave: "novoSalario",        rotulo: "Novo salário (R$)", placeholder: "(mantém atual se vazio)" },
    { chave: "dataVigencia",       rotulo: "Vigência a partir de", obrigatorio: true },
  ],
  adesao_plano_saude: [
    { chave: "operadora",      rotulo: "Operadora", obrigatorio: true },
    { chave: "plano",          rotulo: "Plano", obrigatorio: true },
    { chave: "coparticipacao", rotulo: "Coparticipação/desconto mensal" },
  ],
  adesao_vt: [
    { chave: "linhas",   rotulo: "Linhas/percurso", obrigatorio: true },
    { chave: "valorDia", rotulo: "Valor diário (R$)" },
  ],
  recusa_vt: [
    { chave: "motivo", rotulo: "Motivo da recusa", placeholder: "Utilizo veículo próprio", obrigatorio: true },
  ],
  adesao_va: [
    { chave: "valorMensal", rotulo: "Valor mensal (R$)" },
  ],
  adesao_seguro_vida: [
    { chave: "seguradora",    rotulo: "Seguradora" },
    { chave: "apolice",       rotulo: "Apólice" },
    { chave: "beneficiarios", rotulo: "Beneficiários", placeholder: "Cônjuge e filhos" },
  ],
  // Rev. 4679 — gerados automaticamente pelos módulos; extras p/ geração manual
  aviso_previo: [
    { chave: "modalidade",       rotulo: "Modalidade", placeholder: "TRABALHADO / INDENIZADO", obrigatorio: true },
    { chave: "dataAviso",        rotulo: "Data do aviso (dd/mm/aaaa)", obrigatorio: true },
    { chave: "dataDesligamento", rotulo: "Data do desligamento (dd/mm/aaaa)", obrigatorio: true },
    { chave: "diasAviso",        rotulo: "Dias de aviso", placeholder: "30" },
  ],
  advertencia: [
    { chave: "tipoAdv",        rotulo: "Tipo", placeholder: "VERBAL / ESCRITA / SUSPENSÃO", obrigatorio: true },
    { chave: "ocorrenciaData", rotulo: "Data da ocorrência (dd/mm/aaaa)", obrigatorio: true },
    { chave: "motivo",         rotulo: "Motivo", obrigatorio: true },
    { chave: "baseLegal",      rotulo: "Base legal", placeholder: "Art. 482 da CLT" },
  ],
};

/** Seed completo (código ISO + corpo) de um tipo, p/ seedDefaults idempotente. */
export function getSeedTemplate(tipo: DocumentTemplateTipo): { codigo: string; conteudoHtml: string } {
  return { codigo: DEFAULT_CODIGOS[tipo], conteudoHtml: SEED_BODIES[tipo] };
}
