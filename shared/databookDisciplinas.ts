// Rev. 2861 — Databook de Obra: numeração POR DISCIPLINA para facilitar a busca.
// O `numeroSequencial` continua sendo o ID estável e global da ficha (nunca muda,
// então fichas aprovadas mantêm o número para sempre). O CÓDIGO exibido combina o
// prefixo da disciplina com esse número (ex.: "EST-014" = Estrutura, ficha 14),
// dando organização por disciplina SEM renumerar nada.

export const DISCIPLINA_PREFIXOS: Record<string, string> = {
  Estrutura: "EST",
  Hidráulica: "HID",
  Elétrica: "ELE",
  Acabamento: "ACB",
  Impermeabilização: "IMP",
  "Esquadrias / Vidros": "ESQ",
  Pintura: "PIN",
  "Cobertura / Telhado": "COB",
  "Climatização / HVAC": "CLI",
  "Incêndio / SPDA": "INC",
  Paisagismo: "PAI",
  Equipamentos: "EQP",
  Outros: "OUT",
};

// Ordem canônica das disciplinas (usada para agrupar/separar listas e índice).
export const DISCIPLINAS_ORDEM: string[] = [
  "Estrutura",
  "Hidráulica",
  "Elétrica",
  "Acabamento",
  "Impermeabilização",
  "Esquadrias / Vidros",
  "Pintura",
  "Cobertura / Telhado",
  "Climatização / HVAC",
  "Incêndio / SPDA",
  "Paisagismo",
  "Equipamentos",
  "Outros",
];

export function prefixoDisciplina(disciplina?: string | null): string {
  if (!disciplina) return "OUT";
  return DISCIPLINA_PREFIXOS[disciplina] ?? "OUT";
}

export function codigoFicha(
  disciplina: string | null | undefined,
  numeroSequencial: number | null | undefined,
): string {
  const n = Number(numeroSequencial ?? 0);
  return `${prefixoDisciplina(disciplina)}-${String(n).padStart(3, "0")}`;
}

// Índice de ordenação da disciplina (desconhecidas/sem disciplina vão para o fim).
export function ordemDisciplina(disciplina?: string | null): number {
  const idx = DISCIPLINAS_ORDEM.indexOf(disciplina ?? "Outros");
  return idx === -1 ? DISCIPLINAS_ORDEM.length : idx;
}
