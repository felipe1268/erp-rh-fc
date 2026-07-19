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
    titulo: "Contrato PJ",
    descricao: "Contrato de prestação de serviços PJ (pessoa jurídica / autônomo).",
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
<p style="margin-bottom:10px">Prezado(a) Colaborador(a) <strong>{{empNome}}</strong>,</p>
<div style="margin:8px 0">{{corpoMsg}}</div>
<p style="margin-top:14px">Permanecemos à disposição para quaisquer esclarecimentos.</p>
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

export const SEED_BODIES: Record<DocumentTemplateTipo, string> = {
  // RH
  contrato_experiencia:   SEED_CONTRATO_EXPERIENCIA.trim(),
  termo_responsabilidade: SEED_TERMO_RESPONSABILIDADE.trim(),
  comunicado_interno:     SEED_COMUNICADO_INTERNO.trim(),
  advertencia:            SEED_ADVERTENCIA.trim(),
  aviso_previo:           SEED_AVISO_PREVIO.trim(),
  termo_rescisao:         SEED_TERMO_RESCISAO.trim(),
  carta_mdo:              SEED_CARTA_MDO.trim(),
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

/** Seed completo (código ISO + corpo) de um tipo, p/ seedDefaults idempotente. */
export function getSeedTemplate(tipo: DocumentTemplateTipo): { codigo: string; conteudoHtml: string } {
  return { codigo: DEFAULT_CODIGOS[tipo], conteudoHtml: SEED_BODIES[tipo] };
}
