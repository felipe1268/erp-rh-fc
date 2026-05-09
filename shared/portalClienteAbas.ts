// Abas do Portal do Cliente — Tela de Planejamento por Obra (/portal/cliente/obra/:obraId)
// Lista compartilhada entre admin (controle de liberação) e portal (renderização das tabs).
//
// Rev. 1564 — Além das abas de Planejamento, esta lista agora também
// controla quais MÓDULOS (cards do Hub) o cliente vê. Os dois conjuntos
// são gravados juntos no mesmo JSON em portal_credentials.abasLiberadas
// (módulos com prefixo "mod_*"). As funções parse* separam por prefixo.

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
  { key: "crono_financeiro", label: "Crono. Financeiro", status: "implementado" },
  { key: "prev_medicao", label: "Prev. Medição", status: "implementado" },
  { key: "diagrama_rede", label: "Diagrama de Rede", status: "implementado" },
  { key: "custo_rh", label: "Custo RH", status: "implementado" },
  { key: "bim_3d", label: "BIM 3D", status: "implementado" },
];

// Aba sempre liberada (default mínimo). Não é possível desabilitar a Visão Geral —
// senão a página fica vazia e o cliente não vê nada da obra que clicou.
export const ABA_OBRIGATORIA: PortalClienteAbaKey = "visao_geral";

export const TODAS_AS_ABAS: PortalClienteAbaKey[] = PORTAL_CLIENTE_ABAS.map((a) => a.key);

// ===================== MÓDULOS (cards do Hub) =====================
// Rev. 1564 — Controle dos cards visíveis no Hub do Cliente.

export type PortalClienteModuloKey =
  | "mod_planejamento"
  | "mod_rh_documentos"
  | "mod_proj_doc"
  | "mod_avaliacao";

export type PortalClienteModuloInfo = {
  key: PortalClienteModuloKey;
  /** id do módulo usado nas rotas internas do Hub (sem prefixo). */
  id: "planejamento" | "rh-documentos" | "proj-doc" | "avaliacao";
  label: string;
  descricao: string;
};

export const PORTAL_CLIENTE_MODULOS: PortalClienteModuloInfo[] = [
  { key: "mod_planejamento", id: "planejamento", label: "Planejamento", descricao: "Cronograma, avanço, Curva S, Gantt, REFIS, etc." },
  { key: "mod_rh_documentos", id: "rh-documentos", label: "RH & Docs", descricao: "ASOs, treinamentos, exames e documentos da equipe." },
  { key: "mod_proj_doc", id: "proj-doc", label: "Proj./Doc. Técnicos", descricao: "Projetos e documentos técnicos por disciplina/formato." },
  { key: "mod_avaliacao", id: "avaliacao", label: "Avaliação", descricao: "Avaliação anônima mensal (NPS) do cliente." },
];

export const TODOS_OS_MODULOS: PortalClienteModuloKey[] = PORTAL_CLIENTE_MODULOS.map((m) => m.key);

/** Módulo sempre liberado (mínimo): Avaliação — para o cliente sempre poder dar feedback. */
export const MODULO_OBRIGATORIO: PortalClienteModuloKey = "mod_avaliacao";

// Default ao criar um novo acesso de cliente (ou quando a coluna estiver NULL).
// Por padrão, libera TODAS as abas implementadas e TODOS os módulos.
export const ABAS_LIBERADAS_DEFAULT: PortalClienteAbaKey[] = PORTAL_CLIENTE_ABAS
  .filter((a) => a.status === "implementado")
  .map((a) => a.key);

export const MODULOS_LIBERADOS_DEFAULT: PortalClienteModuloKey[] = TODOS_OS_MODULOS.slice();

// ===================== Parse / Serialize =====================
// O JSON salvo em portal_credentials.abasLiberadas é uma mistura de
// chaves de aba e chaves de módulo (com prefixo "mod_"). As funções
// abaixo isolam cada conjunto.

const isModuloKey = (k: string): k is PortalClienteModuloKey => k.startsWith("mod_");
const isAbaKey = (k: string): k is PortalClienteAbaKey => !k.startsWith("mod_");

export function parseAbasLiberadas(raw: string | null | undefined): PortalClienteAbaKey[] {
  if (!raw) return ABAS_LIBERADAS_DEFAULT;
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return ABAS_LIBERADAS_DEFAULT;
    const validAbas = new Set<string>(TODAS_AS_ABAS);
    const onlyAbas = arr.filter((k) => typeof k === "string" && isAbaKey(k));
    // Se o JSON antigo não tinha NENHUMA chave de aba (só módulos), considera default.
    // Caso contrário, filtra para válidas.
    if (onlyAbas.length === 0) return ABAS_LIBERADAS_DEFAULT;
    const out = onlyAbas.filter((k): k is PortalClienteAbaKey => validAbas.has(k));
    if (!out.includes(ABA_OBRIGATORIA)) out.unshift(ABA_OBRIGATORIA);
    return out;
  } catch {
    return ABAS_LIBERADAS_DEFAULT;
  }
}

export function parseModulosLiberados(raw: string | null | undefined): PortalClienteModuloKey[] {
  if (!raw) return MODULOS_LIBERADOS_DEFAULT;
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return MODULOS_LIBERADOS_DEFAULT;
    const validMods = new Set<string>(TODOS_OS_MODULOS);
    const onlyMods = arr.filter((k) => typeof k === "string" && isModuloKey(k));
    // Backward compat: registros antigos não têm chaves de módulo no JSON →
    // assume todos liberados (comportamento pré-1564).
    if (onlyMods.length === 0) return MODULOS_LIBERADOS_DEFAULT;
    const out = onlyMods.filter((k): k is PortalClienteModuloKey => validMods.has(k));
    if (!out.includes(MODULO_OBRIGATORIO)) out.unshift(MODULO_OBRIGATORIO);
    return out;
  } catch {
    return MODULOS_LIBERADOS_DEFAULT;
  }
}

/**
 * Serializa abas + módulos no mesmo JSON (compatível com a coluna existente).
 * Aceita um array misto de chaves; valida cada uma e garante as obrigatórias.
 */
export function serializeAbasLiberadas(itens: Array<PortalClienteAbaKey | PortalClienteModuloKey | string>): string {
  const validAbas = new Set<string>(TODAS_AS_ABAS);
  const validMods = new Set<string>(TODOS_OS_MODULOS);
  const filtered: string[] = [];
  for (const k of itens) {
    if (typeof k !== "string") continue;
    if (isModuloKey(k) && validMods.has(k)) filtered.push(k);
    else if (!isModuloKey(k) && validAbas.has(k)) filtered.push(k);
  }
  if (!filtered.includes(ABA_OBRIGATORIA)) filtered.unshift(ABA_OBRIGATORIA);
  if (!filtered.includes(MODULO_OBRIGATORIO)) filtered.unshift(MODULO_OBRIGATORIO);
  // dedup mantendo ordem
  const seen = new Set<string>();
  const dedup = filtered.filter((k) => (seen.has(k) ? false : (seen.add(k), true)));
  return JSON.stringify(dedup);
}
