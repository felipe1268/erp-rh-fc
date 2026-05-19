/**
 * Rev. 2141 — Templates institucionais FC (metadados compartilhados).
 *
 * Define os 7 tipos de documento gerenciáveis na aba
 * "Templates de Documentos" em Configurações, junto com a lista de
 * placeholders disponíveis para cada tipo. Usado tanto pelo backend
 * (validação + render) quanto pelo frontend (editor WYSIWYG + sidebar
 * de placeholders clicáveis).
 */

export type DocumentTemplateTipo =
  | "contrato_experiencia"
  | "termo_responsabilidade"
  | "comunicado_interno"
  | "advertencia"
  | "aviso_previo"
  | "termo_rescisao"
  | "carta_mdo";

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

// ── 7 tipos de documento institucional FC ───────────────────────────────────
export const DOCUMENT_TEMPLATES_META: DocumentTemplateMeta[] = [
  {
    tipo: "contrato_experiencia",
    titulo: "Contrato de Experiência",
    descricao: "Contrato CLT por prazo determinado (experiência) — 45+45 dias.",
    icone: "FileSignature",
    placeholders: [
      ...PH_COLABORADOR,
      ...PH_EMPRESA,
      ...PH_DOCUMENTO,
      { chave: "prazo1",         rotulo: "Prazo 1ª etapa (dias)", exemplo: "45",             grupo: "Específicos" },
      { chave: "prazo2",         rotulo: "Prazo 2ª etapa (dias)", exemplo: "45",             grupo: "Específicos" },
      { chave: "dataFim",        rotulo: "Data de término",       exemplo: "05/07/2026",     grupo: "Específicos" },
      { chave: "jornadaSemanal", rotulo: "Jornada semanal",       exemplo: "44 horas",       grupo: "Específicos" },
    ],
  },
  {
    tipo: "termo_responsabilidade",
    titulo: "Termo de Responsabilidade",
    descricao: "Entrega de equipamentos, EPIs e veículos sob responsabilidade do colaborador.",
    icone: "ShieldCheck",
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
    placeholders: [
      ...PH_COLABORADOR,
      ...PH_EMPRESA,
      ...PH_DOCUMENTO,
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
    placeholders: [
      ...PH_COLABORADOR,
      ...PH_EMPRESA,
      ...PH_DOCUMENTO,
      ...PH_OBRA,
      { chave: "clienteNome", rotulo: "Nome do Cliente", exemplo: "CONSTRUTORA ALPHA S/A", grupo: "Específicos" },
    ],
  },
];

export const DOCUMENT_TEMPLATE_TIPOS: DocumentTemplateTipo[] =
  DOCUMENT_TEMPLATES_META.map(m => m.tipo);

export function getTemplateMeta(tipo: string): DocumentTemplateMeta | undefined {
  return DOCUMENT_TEMPLATES_META.find(m => m.tipo === tipo);
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
