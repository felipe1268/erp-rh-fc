// Rev. 1960 — Catálogo de ÁREAS TEMÁTICAS de DDS (sub-classificação dentro de
// `dds_temas.categoria`). Permite filtros mais finos na Biblioteca e na aba
// "Uso por Obra", e é atribuída automaticamente pela IA quando gera roteiros
// ou novos temas. NÃO substitui `categoria` (NR | CAMPANHA | VACINACAO | LIVRE)
// — é uma dimensão ortogonal usada apenas para organização visual e filtro.
//
// Convenções:
//   - 17 áreas fixas + "GERAL" como fallback (= não classificado / transversal).
//   - Valores ALL_CAPS (string segura para banco/coluna varchar(40)).
//   - Labels com emoji e cor curta (Tailwind text-*) usados nos chips/badges.
//   - Mantemos o catálogo SHORT propositalmente — IA fica mais precisa com
//     vocabulário fechado, e o filtro fica utilizável.

export type DDSAreaTema =
  | "ALTURA"
  | "ELETRICA"
  | "MAQUINAS"
  | "ESCAVACAO"
  | "ESPACO_CONFINADO"
  | "SOLDAGEM"
  | "QUIMICOS"
  | "INCENDIO"
  | "ERGONOMIA"
  | "EPI"
  | "SAUDE"
  | "TRANSITO"
  | "EMERGENCIA"
  | "CONDUTA"
  | "DOCUMENTACAO"
  | "AMBIENTE"
  | "GERAL";

export const DDS_AREA_VALUES: DDSAreaTema[] = [
  "ALTURA", "ELETRICA", "MAQUINAS", "ESCAVACAO", "ESPACO_CONFINADO",
  "SOLDAGEM", "QUIMICOS", "INCENDIO", "ERGONOMIA", "EPI",
  "SAUDE", "TRANSITO", "EMERGENCIA", "CONDUTA", "DOCUMENTACAO",
  "AMBIENTE", "GERAL",
];

export interface DDSAreaInfo {
  value: DDSAreaTema;
  label: string;
  emoji: string;
  hint: string;
  // classes Tailwind p/ chip (bg+text+border) — paleta consistente
  chip: string;
}

export const DDS_AREAS: Record<DDSAreaTema, DDSAreaInfo> = {
  ALTURA:           { value: "ALTURA",           label: "Trabalho em altura", emoji: "🪜", hint: "Andaime, plataforma, cinto paraquedista, queda, NR-35.",                       chip: "bg-rose-50 text-rose-800 border-rose-200" },
  ELETRICA:         { value: "ELETRICA",         label: "Elétrica",            emoji: "⚡", hint: "Choque, alta tensão, bota dielétrica, bloqueio/etiquetagem, NR-10.",         chip: "bg-amber-50 text-amber-800 border-amber-200" },
  MAQUINAS:         { value: "MAQUINAS",         label: "Máquinas e ferramentas", emoji: "🛠️", hint: "Serra, esmerilhadeira, betoneira, vibrador, ferramenta manual, NR-12.",  chip: "bg-orange-50 text-orange-800 border-orange-200" },
  ESCAVACAO:        { value: "ESCAVACAO",        label: "Escavação e fundação", emoji: "⛏️", hint: "Soterramento, valas, taludes, fundação, NR-18.",                            chip: "bg-yellow-50 text-yellow-900 border-yellow-200" },
  ESPACO_CONFINADO: { value: "ESPACO_CONFINADO", label: "Espaço confinado",     emoji: "🕳️", hint: "Reservatório, poço, tanque, gases, NR-33.",                                 chip: "bg-stone-100 text-stone-800 border-stone-300" },
  SOLDAGEM:         { value: "SOLDAGEM",         label: "Soldagem e corte",     emoji: "🔥", hint: "Solda, queimadura, gases, óculos, fagulhas, NR-18.",                       chip: "bg-red-50 text-red-800 border-red-200" },
  QUIMICOS:         { value: "QUIMICOS",         label: "Químicos e sílica",    emoji: "🧪", hint: "FISPQ, solvente, cimento, sílica, pintura, NR-26 / NR-15.",                chip: "bg-fuchsia-50 text-fuchsia-800 border-fuchsia-200" },
  INCENDIO:         { value: "INCENDIO",         label: "Incêndio e brigada",   emoji: "🚒", hint: "Extintor, brigada, evacuação, NR-23.",                                     chip: "bg-red-50 text-red-700 border-red-200" },
  ERGONOMIA:        { value: "ERGONOMIA",        label: "Ergonomia",            emoji: "🦴", hint: "LER/DORT, postura, peso, movimento repetitivo, NR-17.",                    chip: "bg-cyan-50 text-cyan-800 border-cyan-200" },
  EPI:              { value: "EPI",              label: "EPI",                  emoji: "🦺", hint: "Capacete, jugular, óculos, luva, bota, protetor auricular, NR-06.",        chip: "bg-lime-50 text-lime-800 border-lime-200" },
  SAUDE:            { value: "SAUDE",            label: "Saúde e bem-estar",    emoji: "❤️", hint: "Saúde física, mental, vacina, hidratação, sono, álcool, prevenção.",      chip: "bg-pink-50 text-pink-800 border-pink-200" },
  TRANSITO:         { value: "TRANSITO",         label: "Trânsito e veículos",  emoji: "🚛", hint: "Caminhão, betoneira, motociclista, deslocamento casa-obra.",               chip: "bg-blue-50 text-blue-800 border-blue-200" },
  EMERGENCIA:       { value: "EMERGENCIA",       label: "Emergência",           emoji: "🚨", hint: "Primeiros socorros, RCP, fratura, hemorragia, queimadura.",                chip: "bg-red-50 text-red-900 border-red-300" },
  CONDUTA:          { value: "CONDUTA",          label: "Conduta e cultura",    emoji: "🤝", hint: "5S, observação de comportamento, denúncia, exemplo do líder, time.",      chip: "bg-violet-50 text-violet-800 border-violet-200" },
  DOCUMENTACAO:     { value: "DOCUMENTACAO",     label: "Documentação SST",     emoji: "📋", hint: "APR, PT, OS, check-list, LV, DDS, CIPA, PCMSO, PGR.",                     chip: "bg-slate-100 text-slate-800 border-slate-300" },
  AMBIENTE:         { value: "AMBIENTE",         label: "Meio ambiente",        emoji: "🌱", hint: "Resíduos, sustentabilidade, descarte, água, energia.",                    chip: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  GERAL:            { value: "GERAL",            label: "Geral / transversal",  emoji: "📌", hint: "Tema transversal ou não classificado.",                                    chip: "bg-slate-50 text-slate-700 border-slate-200" },
};

// Texto compacto pra prompt da IA — exatamente o vocabulário aceito + dica curta.
export const DDS_AREAS_PROMPT_TEXT: string = DDS_AREA_VALUES
  .map(v => `   - "${v}": ${DDS_AREAS[v].label} (${DDS_AREAS[v].hint})`)
  .join("\n");

export function isDDSArea(v: any): v is DDSAreaTema {
  return typeof v === "string" && (DDS_AREA_VALUES as string[]).includes(v);
}

export function coerceDDSArea(v: any): DDSAreaTema | null {
  if (!v) return null;
  const s = String(v).trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (isDDSArea(s)) return s;
  return null;
}
