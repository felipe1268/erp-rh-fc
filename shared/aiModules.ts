// Rev. 2805 — Catálogo canônico dos módulos que possuem funcionalidades de IA.
// Usado tanto no backend (enforcement em cada endpoint de IA) quanto no frontend
// (tela Configurações › Inteligência Artificial). A CHAVE é a identidade estável
// gravada em `ai_module_config.modulo` — NÃO renomear sem migração.

export type AiModuleKey =
  | "compras"
  | "rh"
  | "recrutamento"
  | "sst"
  | "planejamento"
  | "financeiro"
  | "oraculo"
  | "assistente";

export interface AiModuleDef {
  key: AiModuleKey;
  label: string;
  descricao: string;
}

export const AI_MODULES: AiModuleDef[] = [
  {
    key: "compras",
    label: "Compras",
    descricao: "Leitura de cotações e propostas por IA (PDFs/fotos) na tela de Cotações.",
  },
  {
    key: "rh",
    label: "RH / DP — Convenção Coletiva",
    descricao: "Extração e análise de Convenção Coletiva (CCT) a partir do PDF.",
  },
  {
    key: "recrutamento",
    label: "Recrutamento — Currículos",
    descricao: "Leitura e classificação automática de currículos (OCR + IA).",
  },
  {
    key: "sst",
    label: "Segurança (SST) — EPIs",
    descricao: "Sugestões de kits de EPI, cores de capacete, vida útil e treinamentos.",
  },
  {
    key: "planejamento",
    label: "Planejamento — Análise de Efetivo",
    descricao: "Análise de efetivo e simulação de cronograma com IA.",
  },
  {
    key: "financeiro",
    label: "Financeiro — Leitura de Comprovantes",
    descricao: "Leitura de comprovantes (PIX/boleto) por IA na Conciliação Bancária para identificar beneficiário, CNPJ/CPF e ID da transação.",
  },
  {
    key: "oraculo",
    label: "Oráculo",
    descricao: "Assistente geral com leitura do snapshot de dados do sistema.",
  },
  {
    key: "assistente",
    label: "Assistente por Módulo",
    descricao: "Chat especializado por persona (Engenharia, RH, Suprimentos, etc.).",
  },
];

export const AI_MODULE_KEYS: AiModuleKey[] = AI_MODULES.map(m => m.key);

export function isAiModuleKey(v: string): v is AiModuleKey {
  return (AI_MODULE_KEYS as string[]).includes(v);
}

// Rev. 2809 — Catálogo das PERSONAS do chat de "Perguntas e Respostas"
// (componente `IAModuloChat` — o botão verde flutuante com o ícone de
// Sparkles). É a ÚNICA IA que o liga/desliga da tela Configurações controla.
// A persona crua (`planejamento`, `orcamento`, ...) é o `modulo` enviado ao
// endpoint `iaModulos.chat`; a chave gravada em `ai_module_config.modulo` é
// SEMPRE prefixada `qa_` p/ NÃO colidir com as chaves de feature acima
// (ex.: a feature "compras" = leitura de cotações é distinta do chat "compras").
export type QaChatPersona =
  | "planejamento"
  | "orcamento"
  | "compras"
  | "rh"
  | "financeiro"
  | "sst"
  | "medicao";

export type QaChatModuleKey =
  | "qa_planejamento"
  | "qa_orcamento"
  | "qa_compras"
  | "qa_rh"
  | "qa_financeiro"
  | "qa_sst"
  | "qa_medicao";

export interface QaChatModuleDef {
  key: QaChatModuleKey;
  persona: QaChatPersona;
  label: string;
  descricao: string;
}

export const QA_CHAT_MODULES: QaChatModuleDef[] = [
  {
    key: "qa_planejamento",
    persona: "planejamento",
    label: "Planejamento",
    descricao: "Eng. de Planejamento — cronograma, avanço físico, Curva S, produtividade.",
  },
  {
    key: "qa_orcamento",
    persona: "orcamento",
    label: "Orçamento",
    descricao: "Orçamentista — custos, BDI, composições, SINAPI, Curva ABC.",
  },
  {
    key: "qa_compras",
    persona: "compras",
    label: "Compras / Suprimentos",
    descricao: "Gestor de Suprimentos — fornecedores, cotações, negociação, lead times.",
  },
  {
    key: "qa_rh",
    persona: "rh",
    label: "RH / DP",
    descricao: "Especialista RH/DP — CLT, folha, rescisão, férias, eSocial.",
  },
  {
    key: "qa_financeiro",
    persona: "financeiro",
    label: "Financeiro",
    descricao: "Controller Financeiro — fluxo de caixa, medições, DRE, viabilidade.",
  },
  {
    key: "qa_sst",
    persona: "sst",
    label: "Segurança (SST)",
    descricao: "Eng. de Segurança — NRs, EPIs, treinamentos, CIPA.",
  },
  {
    key: "qa_medicao",
    persona: "medicao",
    label: "Medição",
    descricao: "Especialista em Medição — critérios, retenções, aditivos contratuais.",
  },
];

export const QA_CHAT_MODULE_KEYS: QaChatModuleKey[] = QA_CHAT_MODULES.map(m => m.key);

export function qaChatModuleKey(persona: string): QaChatModuleKey {
  return `qa_${persona}` as QaChatModuleKey;
}

export function isQaChatModuleKey(v: string): v is QaChatModuleKey {
  return (QA_CHAT_MODULE_KEYS as string[]).includes(v);
}
