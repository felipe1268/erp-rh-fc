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
