// Rev. 2865 — COLETA DE CAMPO (RH): grupos de informação coletáveis por link.
// ---------------------------------------------------------------------------
// Fonte ÚNICA compartilhada entre o seletor interno (ColetaCampo.tsx), o
// formulário público (ColetaCampoPublica.tsx) e o backend (coletaRh.ts).
// Antes de gerar o link, o RH escolhe QUAIS grupos serão coletados; a escolha
// é persistida em coleta_rh_sessoes.campos_json (JSON array de chaves de grupo).
// NULL/ausente = TODOS os grupos (backward compat para links antigos).

export type GrupoColetaKey = "foto" | "epi" | "contato" | "emergencia" | "endereco";

export interface GrupoColeta {
  key: GrupoColetaKey;
  label: string;
  emoji: string;
  descricao: string;
  /** Campos de `employees` cobertos pelo grupo. "foto" não tem campo de texto
   *  (vai via fotoUrl/fotoBase64), então `campos` fica vazio. */
  campos: string[];
}

export const GRUPOS_COLETA: GrupoColeta[] = [
  { key: "foto", label: "Foto", emoji: "📷", descricao: "Foto do funcionário", campos: [] },
  { key: "epi", label: "EPI / Uniforme", emoji: "🦺", descricao: "Tamanhos de calçado, camisa e calça", campos: ["tamanhoCalcado", "tamanhoCamisa", "tamanhoCalca"] },
  { key: "contato", label: "Contato", emoji: "📞", descricao: "Telefone e celular / WhatsApp", campos: ["telefone", "celular"] },
  { key: "emergencia", label: "Contato de emergência", emoji: "🆘", descricao: "Nome, telefone e parentesco", campos: ["contatoEmergencia", "telefoneEmergencia", "parentescoEmergencia"] },
  { key: "endereco", label: "Endereço", emoji: "🏠", descricao: "Logradouro, número, bairro, cidade, UF e CEP", campos: ["logradouro", "numero", "complemento", "bairro", "cidade", "estado", "cep"] },
];

export const GRUPOS_COLETA_KEYS: GrupoColetaKey[] = GRUPOS_COLETA.map((g) => g.key);

/** Parse do JSON armazenado em `coleta_rh_sessoes.campos_json`.
 *  null/""/inválido → null (= TODOS os grupos, backward compat);
 *  array → só os grupos válidos presentes (ou null se sobrar vazio). */
export function parseGruposColeta(raw: string | null | undefined): GrupoColetaKey[] | null {
  if (!raw) return null;
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return null;
    const filt = arr.filter((k: any): k is GrupoColetaKey => (GRUPOS_COLETA_KEYS as string[]).includes(k));
    return filt.length > 0 ? filt : null;
  } catch {
    return null;
  }
}

/** Lista EFETIVA de grupos (null/ausente = todos). Para uso no público/leitura. */
export function resolverGruposColeta(raw: string | null | undefined): GrupoColetaKey[] {
  return parseGruposColeta(raw) ?? [...GRUPOS_COLETA_KEYS];
}

/** Serializa a seleção do RH para gravar. Vazio OU igual-a-todos → null
 *  (= todos, mantém idempotência e compat). Ordem canônica preservada. */
export function serializeGruposColeta(grupos: string[] | null | undefined): string | null {
  if (!grupos) return null;
  const set = new Set(grupos.filter((k) => (GRUPOS_COLETA_KEYS as string[]).includes(k)));
  if (set.size === 0 || set.size === GRUPOS_COLETA_KEYS.length) return null;
  const ord = GRUPOS_COLETA_KEYS.filter((k) => set.has(k));
  return JSON.stringify(ord);
}

/** Conjunto de campos de TEXTO habilitados para os grupos dados. */
export function camposHabilitados(grupos: GrupoColetaKey[]): Set<string> {
  const s = new Set<string>();
  for (const g of GRUPOS_COLETA) if (grupos.includes(g.key)) for (const c of g.campos) s.add(c);
  return s;
}
