/**
 * Rev. 4622 — Dicionário CANÔNICO de restrições operacionais (LGPD).
 *
 * Fonte única usada pelo formulário de ASO (Controle de Documentos) e pela
 * rota pública do QR "Verificar Aptidão". O QR NUNCA exibe texto livre do
 * ASO — somente estas frases fixas, escolhidas pelo RH (caixinhas) ou
 * disparadas por instruções detectadas no texto ("não pode…", "proibido…").
 */
export const RESTRICOES_OPERACIONAIS: Array<{ key: string; label: string }> = [
  { key: "altura", label: "Trabalho em altura: NÃO permitido" },
  { key: "espaco_confinado", label: "Espaço confinado: NÃO permitido" },
  { key: "peso", label: "Levantamento de peso / esforço físico: restrito" },
  { key: "ruido", label: "Exposição a ruído: restrita" },
  { key: "calor", label: "Exposição a calor: restrita" },
  { key: "eletricidade", label: "Trabalho com eletricidade: NÃO permitido" },
  { key: "noturno", label: "Trabalho noturno: NÃO permitido" },
  { key: "maquinas", label: "Operação de máquinas/equipamentos: restrita" },
  { key: "quimicos", label: "Exposição a agentes químicos/poeira: restrita" },
  { key: "veiculos", label: "Condução de veículos: NÃO permitida" },
  { key: "solda", label: "Atividades de soldagem: restritas" },
  { key: "escavacao", label: "Trabalho em escavação/subsolo: restrito" },
];

export const RESTRICOES_OPERACIONAIS_KEYS = RESTRICOES_OPERACIONAIS.map((r) => r.key);

export function labelRestricaoOperacional(key: string): string | null {
  return RESTRICOES_OPERACIONAIS.find((r) => r.key === key)?.label ?? null;
}

/** Parse defensivo da coluna asos.restricoesOperacionais (JSON array de keys). */
export function parseRestricoesOperacionais(raw: unknown): string[] {
  if (!raw) return [];
  try {
    const arr = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(arr)) return [];
    return arr.map(String).filter((k) => RESTRICOES_OPERACIONAIS_KEYS.includes(k));
  } catch {
    return [];
  }
}
