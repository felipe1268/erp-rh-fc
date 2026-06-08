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

// ---------------------------------------------------------------------------
// Rev. 2903 — COLETA SÓ SALVA QUANDO TODOS OS DADOS SOLICITADOS ESTÃO PREENCHIDOS.
// Fonte ÚNICA da regra de OBRIGATORIEDADE, compartilhada entre o formulário
// público (botão "Enviar") e o backend (`enviarResposta`), pra não divergirem.

/** Campos de TEXTO que continuam OPCIONAIS mesmo com o grupo habilitado.
 *  "complemento" de endereço pode legitimamente não existir — exigi-lo
 *  bloquearia coletas válidas. */
export const CAMPOS_COLETA_OPCIONAIS = new Set<string>(["complemento"]);

/** Rótulos amigáveis dos campos fixos (pra mensagem "Faltam: …"). */
export const LABEL_CAMPO_COLETA: Record<string, string> = {
  foto: "Foto",
  tamanhoCalcado: "Tamanho do calçado",
  tamanhoCamisa: "Tamanho da camisa",
  tamanhoCalca: "Tamanho da calça",
  telefone: "Telefone",
  celular: "Celular / WhatsApp",
  contatoEmergencia: "Nome do contato de emergência",
  telefoneEmergencia: "Telefone de emergência",
  parentescoEmergencia: "Parentesco (emergência)",
  logradouro: "Logradouro",
  numero: "Número",
  complemento: "Complemento",
  bairro: "Bairro",
  cidade: "Cidade",
  estado: "UF",
  cep: "CEP",
};

/** Campos de TEXTO OBRIGATÓRIOS dos grupos dados (habilitados − opcionais). */
export function camposObrigatorios(grupos: GrupoColetaKey[]): string[] {
  const out: string[] = [];
  for (const g of GRUPOS_COLETA) {
    if (!grupos.includes(g.key)) continue;
    for (const c of g.campos) if (!CAMPOS_COLETA_OPCIONAIS.has(c)) out.push(c);
  }
  return out;
}

/** Lista as chaves AINDA NÃO preenchidas: campos obrigatórios dos grupos + TODOS
 *  os itens custom + a foto (chave especial "foto") quando o grupo está ativo.
 *  Vazia = coleta completa. */
export function camposFaltantesColeta(args: {
  grupos: GrupoColetaKey[];
  itensCustom: ItemCustomColeta[];
  dados: Record<string, any>;
  temFoto: boolean;
}): string[] {
  const { grupos, itensCustom, dados, temFoto } = args;
  const preenchido = (k: string) => {
    const v = dados[k];
    return typeof v === "string" && v.trim() !== "";
  };
  const falt: string[] = [];
  if (grupos.includes("foto") && !temFoto) falt.push("foto");
  for (const c of camposObrigatorios(grupos)) if (!preenchido(c)) falt.push(c);
  for (const it of itensCustom || []) if (!preenchido(it.campo)) falt.push(it.campo);
  return falt;
}

/** Atalho booleano: a coleta tem TODOS os dados solicitados preenchidos? */
export function coletaCompleta(args: {
  grupos: GrupoColetaKey[];
  itensCustom: ItemCustomColeta[];
  dados: Record<string, any>;
  temFoto: boolean;
}): boolean {
  return camposFaltantesColeta(args).length === 0;
}

// ---------------------------------------------------------------------------
// Rev. 2887 — ITENS EXTRAS (custom) por link.
// Além dos 5 grupos fixos, o RH pode adicionar itens avulsos NA HORA de gerar o
// link. Cada item aponta para UM campo de `employees` (escolhido pelo RH) e o
// valor coletado é gravado AUTOMÁTICO nesse campo na aprovação. O catálogo abaixo
// é a WHITELIST de campos mapeáveis — subconjunto SEGURO do whitelist de
// updateEmployee (server/db.ts), SEM os campos já cobertos pelos 5 grupos e SEM
// campos sensíveis (salário, status, lista negra, etc.). Persistido em
// coleta_rh_sessoes.itens_custom_json (JSON array de {campo,label}).

export interface CampoCustomCatalogo {
  campo: string;
  label: string;
  type?: "text" | "date" | "email" | "tel";
}

export interface ItemCustomColeta {
  campo: string;
  label: string;
}

export const CAMPOS_CUSTOM_CATALOGO: CampoCustomCatalogo[] = [
  // Documentos / dados pessoais
  { campo: "cpf", label: "CPF" },
  { campo: "rg", label: "RG" },
  { campo: "orgaoEmissor", label: "Órgão emissor (RG)" },
  { campo: "dataNascimento", label: "Data de nascimento", type: "date" },
  { campo: "sexo", label: "Sexo" },
  { campo: "estadoCivil", label: "Estado civil" },
  { campo: "nacionalidade", label: "Nacionalidade" },
  { campo: "naturalidade", label: "Naturalidade" },
  { campo: "nomeMae", label: "Nome da mãe" },
  { campo: "nomePai", label: "Nome do pai" },
  { campo: "ctps", label: "CTPS" },
  { campo: "serieCtps", label: "Série da CTPS" },
  { campo: "pis", label: "PIS / PASEP" },
  { campo: "tituloEleitor", label: "Título de eleitor" },
  { campo: "certificadoReservista", label: "Certificado de reservista" },
  { campo: "cnh", label: "CNH" },
  { campo: "categoriaCnh", label: "Categoria da CNH" },
  { campo: "validadeCnh", label: "Validade da CNH", type: "date" },
  { campo: "email", label: "E-mail", type: "email" },
  // Dados bancários
  { campo: "banco", label: "Banco (código)" },
  { campo: "bancoNome", label: "Banco (nome)" },
  { campo: "agencia", label: "Agência" },
  { campo: "conta", label: "Conta" },
  { campo: "tipoConta", label: "Tipo de conta" },
  { campo: "tipoChavePix", label: "Tipo de chave PIX" },
  { campo: "chavePix", label: "Chave PIX" },
];

export const CAMPOS_CUSTOM_KEYS: string[] = CAMPOS_CUSTOM_CATALOGO.map((c) => c.campo);

const CAMPO_CUSTOM_BY_KEY = new Map(CAMPOS_CUSTOM_CATALOGO.map((c) => [c.campo, c]));

/** Metadados (label/type) de um campo custom do catálogo (ou undefined). */
export function getCampoCustomMeta(campo: string): CampoCustomCatalogo | undefined {
  return CAMPO_CUSTOM_BY_KEY.get(campo);
}

/** Sanitiza uma lista de itens custom: só campos do catálogo, label não-vazia
 *  (cai pro label do catálogo se vier vazia), dedupe por campo (mantém o 1º). */
export function sanitizeItensCustom(itens: any): ItemCustomColeta[] {
  if (!Array.isArray(itens)) return [];
  const seen = new Set<string>();
  const out: ItemCustomColeta[] = [];
  for (const it of itens) {
    const campo = it?.campo;
    if (typeof campo !== "string") continue;
    const meta = CAMPO_CUSTOM_BY_KEY.get(campo);
    if (!meta || seen.has(campo)) continue;
    const rawLabel = typeof it?.label === "string" ? it.label.trim() : "";
    out.push({ campo, label: rawLabel || meta.label });
    seen.add(campo);
  }
  return out;
}

/** Parse do JSON gravado em `coleta_rh_sessoes.itens_custom_json`. */
export function parseItensCustom(raw: string | null | undefined): ItemCustomColeta[] {
  if (!raw) return [];
  try {
    return sanitizeItensCustom(JSON.parse(raw));
  } catch {
    return [];
  }
}

/** Serializa os itens custom para gravar. Vazio → null. */
export function serializeItensCustom(itens: any): string | null {
  const clean = sanitizeItensCustom(itens);
  return clean.length > 0 ? JSON.stringify(clean) : null;
}
