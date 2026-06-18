// ───────────────────────────────────────────────────────────────────────────
// BIBLIOTECA INTERNA — MOTIVOS / ALÍNEAS DE DEVOLUÇÃO DE CHEQUE (Rev. 3235)
// ───────────────────────────────────────────────────────────────────────────
// Tabela de motivos de devolução de cheque do Sistema Financeiro Nacional
// (Banco Central do Brasil — alíneas de devolução, base CMN/Resolução 1.682 e
// alterações, espelhando o padrão FEBRABAN/Compe). Serve de dicionário p/ o ERP
// TRADUZIR os códigos que aparecem no extrato bancário ("CHEQUE DEVOLVIDO MOT 39",
// "DEV ALINEA 11", "CH DEVOLVIDO 21" etc.) e classificar a TENTATIVA DE PAGAMENTO
// FRUSTRADA (débito do cheque + crédito de devolução do MESMO cheque = saldo zero).
//
// Campos por motivo:
//   - motivo        : texto curto explicativo
//   - grupo         : agrupamento de gestão (sem_fundos | sustacao | impedimento |
//                     irregularidade | apresentacao_indevida | operacional)
//   - sustado       : true quando é contraordem/sustação/oposição (decisão do emitente)
//   - reapresentavel: true quando o cheque PODE ser reapresentado p/ nova compensação
//                     (orientação geral — a 2ª devolução por falta de fundos [12] já
//                     leva o emitente ao CCF; 43/44 não são reapresentáveis).
// ───────────────────────────────────────────────────────────────────────────

export type GrupoDevolucao =
  | "sem_fundos"
  | "sustacao"
  | "impedimento"
  | "irregularidade"
  | "apresentacao_indevida"
  | "operacional";

export interface MotivoDevolucao {
  codigo: number;
  motivo: string;
  grupo: GrupoDevolucao;
  sustado: boolean;
  reapresentavel: boolean;
}

export const GRUPO_DEVOLUCAO_LABEL: Record<GrupoDevolucao, string> = {
  sem_fundos: "Sem fundos",
  sustacao: "Sustação / contraordem",
  impedimento: "Impedimento ao pagamento",
  irregularidade: "Irregularidade no cheque",
  apresentacao_indevida: "Apresentação indevida",
  operacional: "Operacional / outros",
};

const M = (
  codigo: number,
  motivo: string,
  grupo: GrupoDevolucao,
  sustado = false,
  reapresentavel = false,
): MotivoDevolucao => ({ codigo, motivo, grupo, sustado, reapresentavel });

export const MOTIVOS_DEVOLUCAO_CHEQUE: Record<number, MotivoDevolucao> = {
  // Insuficiência de fundos
  11: M(11, "Cheque sem fundos — 1ª apresentação", "sem_fundos", false, true),
  12: M(12, "Cheque sem fundos — 2ª apresentação (vai ao CCF)", "sem_fundos", false, false),
  13: M(13, "Conta encerrada", "impedimento", false, false),
  14: M(14, "Prática espúria", "irregularidade", false, false),
  // Impedimento ao pagamento
  20: M(20, "Folha de cheque cancelada por solicitação do correntista", "impedimento", false, false),
  21: M(21, "Contraordem (revogação) ou oposição (sustação) pelo emitente/portador", "sustacao", true, true),
  22: M(22, "Divergência ou insuficiência de assinatura", "irregularidade", false, true),
  23: M(23, "Cheques de órgão/entidade pública fora das especificações", "impedimento", false, false),
  24: M(24, "Bloqueio judicial ou determinação do Banco Central", "impedimento", false, false),
  25: M(25, "Cancelamento de talonário pelo banco sacado", "impedimento", false, false),
  26: M(26, "Inoperância temporária de transporte", "impedimento", false, true),
  27: M(27, "Feriado municipal não previsto no calendário", "impedimento", false, true),
  28: M(28, "Contraordem/oposição (sustação) por furto ou roubo", "sustacao", true, false),
  29: M(29, "Falta de confirmação do recebimento do talonário pelo correntista", "impedimento", false, false),
  30: M(30, "Furto ou roubo de malotes", "impedimento", false, false),
  // Irregularidade
  31: M(31, "Erro formal (sem data, sem assinatura, sem valor por extenso etc.)", "irregularidade", false, true),
  33: M(33, "Divergência de endosso", "irregularidade", false, true),
  34: M(34, "Cheque apresentado por banco não indicado no cruzamento, sem endosso-mandato", "irregularidade", false, true),
  35: M(35, "Cheque fraudado / emitido sem controle do banco / adulterado", "irregularidade", false, false),
  37: M(37, "Registro inconsistente na compensação eletrônica", "operacional", false, true),
  39: M(39, "Imagem do cheque fora dos padrões técnicos da COMPE (truncagem)", "operacional", false, true),
  // Apresentação indevida
  40: M(40, "Moeda inválida", "apresentacao_indevida", false, true),
  41: M(41, "Cheque apresentado a banco que não o sacado", "apresentacao_indevida", false, true),
  42: M(42, "Cheque não compensável na sessão/sistema em que apresentado", "apresentacao_indevida", false, true),
  43: M(43, "Devolvido antes pelos motivos 21,22,23,24,31,34 — não reapresentável", "impedimento", false, false),
  44: M(44, "Cheque prescrito", "impedimento", false, false),
  45: M(45, "Cheque emitido por entidade obrigada a usar outro instrumento", "impedimento", false, false),
  48: M(48, "Cheque acima do limite legal sem identificação do beneficiário", "irregularidade", false, true),
  49: M(49, "Remessa nula (falha do banco remetente)", "operacional", false, true),
  // Operacional / outros
  59: M(59, "Informação essencial faltante ou inconsistente", "operacional", false, true),
  60: M(60, "Instrumento inadequado para o tipo de apresentação", "operacional", false, true),
  61: M(61, "Item não compensável", "operacional", false, true),
  64: M(64, "Arquivo lógico não processado / processado parcialmente", "operacional", false, true),
  70: M(70, "Sustação ou revogação provisória", "sustacao", true, true),
  71: M(71, "Inadimplemento contratual da cooperativa de crédito", "operacional", false, false),
  72: M(72, "Contrato de compensação encerrado (cooperativa)", "operacional", false, false),
};

// Retorna o motivo mapeado; p/ códigos fora da tabela devolve uma entrada genérica
// (mantém o código surfaçado p/ análise em vez de descartar a informação).
export function getMotivoDevolucao(codigo: number | null | undefined): MotivoDevolucao | null {
  if (codigo == null || !Number.isFinite(codigo)) return null;
  const c = Math.trunc(codigo);
  return (
    MOTIVOS_DEVOLUCAO_CHEQUE[c] ?? {
      codigo: c,
      motivo: `Devolução de cheque (motivo ${c})`,
      grupo: "operacional",
      sustado: false,
      reapresentavel: true,
    }
  );
}

// ─────────────────────────── Parsers de descrição ───────────────────────────

// Extrai o CÓDIGO do motivo de devolução de uma descrição do extrato.
// Cobre "MOT 39", "MOTIVO 11", "ALINEA 21", "AL 22", "DEV 12", "DEVOLVIDO 28",
// "DEVOLUCAO 13" e o número solto logo após "DEVOLVIDO".
export function parseMotivoCodigo(descricao: any): number | null {
  const s = String(descricao ?? "");
  const m = s.match(/\b(?:mot(?:ivo)?|al(?:[ií]nea)?|dev(?:olvido|olucao|olu[cç][aã]o)?)\b[^0-9]{0,6}(\d{1,3})/i);
  if (m && m[1]) { const n = parseInt(m[1], 10); if (Number.isFinite(n)) return n; }
  return null;
}

export function parseMotivoDevolucao(descricao: any): MotivoDevolucao | null {
  return getMotivoDevolucao(parseMotivoCodigo(descricao));
}

// "Cheque especial" é LIMITE/CRÉDITO ROTATIVO (overdraft) — NÃO é cheque em papel.
// Tarifas/juros/IOF de cheque especial (e seus estornos) contêm "cheque" mas NÃO
// são tentativa de pagamento de cheque, então devem ser excluídos do pareamento.
function pareceChequeEspecial(s: string): boolean {
  return /cheque\s+especial|ch\.?\s*especial|cheq\.?\s*esp\b|\blis\b|limite\s+especial/.test(s);
}

// A descrição indica um cheque DEVOLVIDO/SUSTADO (o crédito que estorna o débito).
export function pareceDevolucaoCheque(descricao: any): boolean {
  const s = String(descricao ?? "").toLowerCase();
  if (pareceChequeEspecial(s)) return false;
  if (/devolv|sustad|sustac|estorn|contraordem|contra-ordem|oposic/.test(s)) {
    return /cheq|\bch\b|compe/.test(s) || /\bdoc\b/.test(s) || /mot|alinea|al\b/.test(s);
  }
  return false;
}

// A descrição indica a COMPENSAÇÃO/PAGAMENTO de um cheque (o débito original).
export function pareceCompensacaoCheque(descricao: any): boolean {
  const s = String(descricao ?? "").toLowerCase();
  if (pareceChequeEspecial(s)) return false;
  // Tarifas/juros/anuidades NÃO são compensação de cheque (mesmo citando "cheque").
  if (/tarifa|tar\.|juros|\biof\b|anuidad|manuten[cç]|\bces\b|pacote\s+servic/.test(s)) return false;
  if (pareceDevolucaoCheque(descricao)) return false;
  return /cheq/.test(s) || (/\bch\b/.test(s) && /compe|pag|liquid/.test(s));
}

// Nº do documento ("Doc 000861" → "861") — chave forte de pareamento débito↔crédito.
export function parseDocNumero(descricao: any): string | null {
  const m = String(descricao ?? "").match(/\bdoc(?:umento)?\.?\s*n?[ºo°.]*\s*0*(\d{1,12})/i);
  if (m && m[1]) return m[1].replace(/^0+/, "") || m[1];
  return null;
}

// Nº do cheque embutido na descrição ("CHEQUE Nº 001037" → "1037").
export function parseChequeNumero(descricao: any): string | null {
  const m = String(descricao ?? "").match(/cheque\s*n?[ºo°.]*\s*0*(\d{1,12})/i);
  if (m && m[1]) return m[1].replace(/^0+/, "") || m[1];
  return null;
}

// ──────────────────── Detecção de pares de estorno ────────────────────
// Recebe linhas do extrato JÁ normalizadas e devolve os PARES "débito de cheque +
// crédito de devolução do MESMO cheque". Cada par é uma tentativa de pagamento
// frustrada (saldo zero) — não conta como saída nem como entrada.

export interface LinhaEstornoMin {
  id: any;
  valorCents: number | null;
  isCredito: boolean; // crédito/entrada = valor ≥ 0
  descricao: any;
  data: string | null; // YYYY-MM-DD
}

export interface ParEstorno {
  debitoId: any;
  creditoId: any;
  valorCents: number;
  doc: string | null;
  chequeNumero: string | null;
  motivo: MotivoDevolucao | null;
  dataDebito: string | null;
  dataCredito: string | null;
  descricaoDebito: string;
  descricaoCredito: string;
}

// Diferença em dias entre duas datas ISO (YYYY-MM-DD); ∞ se alguma faltar/for inválida.
function diffDias(a: string | null, b: string | null): number {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  const ta = Date.parse(`${a}T00:00:00Z`);
  const tb = Date.parse(`${b}T00:00:00Z`);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return Number.POSITIVE_INFINITY;
  return Math.abs(tb - ta) / 86400000;
}

// Escolhe, entre candidatos, o débito mais coerente com a data da devolução:
// prefere o débito ANTERIOR (ou no mesmo dia) mais próximo do crédito; senão o 1º.
function escolherDebito(cands: LinhaEstornoMin[], dataCredito: string | null): LinhaEstornoMin | null {
  if (cands.length === 0) return null;
  if (cands.length === 1) return cands[0];
  if (dataCredito) {
    const antes = cands
      .filter((d) => d.data && d.data <= dataCredito)
      .sort((a, b) => String(b.data).localeCompare(String(a.data)));
    if (antes.length) return antes[0];
  }
  return [...cands].sort((a, b) => String(a.data ?? "").localeCompare(String(b.data ?? "")))[0];
}

export function detectarParesEstorno(linhas: LinhaEstornoMin[]): ParEstorno[] {
  const pares: ParEstorno[] = [];
  const usados = new Set<any>();
  const debitos = linhas.filter(
    (l) => !l.isCredito && l.valorCents != null && l.valorCents > 0 && pareceCompensacaoCheque(l.descricao),
  );
  const creditos = linhas
    .filter((l) => l.isCredito && l.valorCents != null && l.valorCents > 0 && pareceDevolucaoCheque(l.descricao))
    .sort((a, b) => String(a.data ?? "").localeCompare(String(b.data ?? "")));

  for (const cr of creditos) {
    if (usados.has(cr.id)) continue;
    const doc = parseDocNumero(cr.descricao);
    const chq = parseChequeNumero(cr.descricao);
    const mesmoValor = debitos.filter((d) => !usados.has(d.id) && d.valorCents === cr.valorCents);
    if (mesmoValor.length === 0) continue;

    let escolhido: LinhaEstornoMin | null = null;
    if (doc) {
      const byDoc = mesmoValor.filter((d) => parseDocNumero(d.descricao) === doc);
      if (byDoc.length) escolhido = escolherDebito(byDoc, cr.data);
    }
    if (!escolhido && chq) {
      const byChq = mesmoValor.filter((d) => parseChequeNumero(d.descricao) === chq);
      if (byChq.length) escolhido = escolherDebito(byChq, cr.data);
    }
    if (!escolhido) {
      // Sem nº/doc: só pareia por valor quando há UM candidato (evita parear cheque errado)
      // E dentro de uma janela curta (devolução costuma ocorrer poucos dias após a
      // compensação) — assim um débito coincidente de meses atrás não é pareado.
      const antesOuIgual = mesmoValor.filter(
        (d) => !d.data || !cr.data || (d.data <= cr.data && diffDias(d.data, cr.data) <= 60),
      );
      const pool = antesOuIgual.length ? antesOuIgual : [];
      if (pool.length === 1) escolhido = pool[0];
    }
    if (!escolhido) continue;

    usados.add(escolhido.id);
    usados.add(cr.id);
    pares.push({
      debitoId: escolhido.id,
      creditoId: cr.id,
      valorCents: cr.valorCents as number,
      doc: doc ?? parseDocNumero(escolhido.descricao),
      chequeNumero: chq ?? parseChequeNumero(escolhido.descricao),
      motivo: parseMotivoDevolucao(cr.descricao),
      dataDebito: escolhido.data ?? null,
      dataCredito: cr.data ?? null,
      descricaoDebito: String(escolhido.descricao ?? ""),
      descricaoCredito: String(cr.descricao ?? ""),
    });
  }
  return pares;
}
