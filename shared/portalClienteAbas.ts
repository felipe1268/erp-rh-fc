// Abas do Portal do Cliente — Tela de Planejamento por Obra (/portal/cliente/obra/:obraId)
// Lista compartilhada entre admin (controle de liberação) e portal (renderização das tabs).

export type PortalClienteAbaKey =
  | "visao_geral"
  | "cronograma"
  | "gantt"
  | "avanco_semanal"
  | "prog_semanal"
  | "curva_s"
  | "refis"
  | "crono_financeiro"
  | "prev_medicao"
  | "caminho_critico"
  | "diagrama_rede"
  | "custo_rh"
  | "bim_3d"
  | "efetivo"
  | "revisoes";

export type PortalClienteAbaInfo = {
  key: PortalClienteAbaKey;
  label: string;
  // implementado: já existe view funcional na página do cliente
  // em_breve: aba pode ser liberada, mas mostra placeholder "Em breve" no portal
  status: "implementado" | "em_breve";
};

export const PORTAL_CLIENTE_ABAS: PortalClienteAbaInfo[] = [
  { key: "visao_geral", label: "Visão Geral", status: "implementado" },
  { key: "cronograma", label: "Cronograma", status: "implementado" },
  { key: "avanco_semanal", label: "Avanço Semanal", status: "implementado" },
  { key: "prog_semanal", label: "Prog. Semanal", status: "implementado" },
  { key: "curva_s", label: "Curva S", status: "implementado" },
  { key: "revisoes", label: "Revisões", status: "implementado" },
  { key: "gantt", label: "Gantt", status: "implementado" },
  { key: "refis", label: "REFIS", status: "implementado" },
  { key: "caminho_critico", label: "Caminho Crítico", status: "implementado" },
  { key: "efetivo", label: "Efetivo", status: "implementado" },
  { key: "crono_financeiro", label: "Crono. Financeiro", status: "em_breve" },
  { key: "prev_medicao", label: "Prev. Medição", status: "em_breve" },
  { key: "diagrama_rede", label: "Diagrama de Rede", status: "em_breve" },
  { key: "custo_rh", label: "Custo RH", status: "em_breve" },
  { key: "bim_3d", label: "BIM 3D", status: "em_breve" },
];

// Aba sempre liberada (default mínimo). Não é possível desabilitar a Visão Geral —
// senão a página fica vazia e o cliente não vê nada da obra que clicou.
export const ABA_OBRIGATORIA: PortalClienteAbaKey = "visao_geral";

// Default ao criar um novo acesso de cliente (ou quando a coluna estiver NULL).
export const ABAS_LIBERADAS_DEFAULT: PortalClienteAbaKey[] = ["visao_geral"];

export const TODAS_AS_ABAS: PortalClienteAbaKey[] = PORTAL_CLIENTE_ABAS.map((a) => a.key);

export function parseAbasLiberadas(raw: string | null | undefined): PortalClienteAbaKey[] {
  if (!raw) return ABAS_LIBERADAS_DEFAULT;
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return ABAS_LIBERADAS_DEFAULT;
    const valid = new Set(TODAS_AS_ABAS);
    const out = arr.filter((k): k is PortalClienteAbaKey => typeof k === "string" && valid.has(k as PortalClienteAbaKey));
    if (!out.includes(ABA_OBRIGATORIA)) out.unshift(ABA_OBRIGATORIA);
    return out;
  } catch {
    return ABAS_LIBERADAS_DEFAULT;
  }
}

export function serializeAbasLiberadas(abas: PortalClienteAbaKey[]): string {
  const valid = new Set(TODAS_AS_ABAS);
  const filtered = abas.filter((k) => valid.has(k));
  if (!filtered.includes(ABA_OBRIGATORIA)) filtered.unshift(ABA_OBRIGATORIA);
  // dedup mantendo ordem
  const seen = new Set<string>();
  const dedup = filtered.filter((k) => (seen.has(k) ? false : (seen.add(k), true)));
  return JSON.stringify(dedup);
}
