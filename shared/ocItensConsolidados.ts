/**
 * Consolidação visual de itens de Ordem de Compra.
 *
 * Um mesmo insumo (ex.: CIMENTO) é gravado em VÁRIAS linhas na OC — uma por
 * etapa da EAP do orçamento — para que o custo seja apropriado separadamente
 * por etapa. Isso faz o MESMO item aparecer repetido na OC.
 *
 * Este helper agrupa as linhas pelo par `descrição + unidade` (normalizado),
 * somando quantidade / quantidade entregue / total e derivando o preço
 * unitário ponderado (total ÷ quantidade). O detalhe por etapa fica preservado
 * em `etapas[]`, permitindo expandir na tela. NÃO altera dados — é só leitura.
 *
 * O controle de saldo/custo por etapa continua sendo feito por linha (em VALOR,
 * R$); esta consolidação é puramente de APRESENTAÇÃO.
 */

export interface OcItemConsolidavel {
  id?: number | string;
  descricao?: string | null;
  unidade?: string | null;
  quantidade?: string | number | null;
  quantidadeEntregue?: string | number | null;
  precoUnitario?: string | number | null;
  total?: string | number | null;
  /** Neste sistema, `insumoCodigo` guarda o código da ETAPA (EAP). */
  insumoCodigo?: string | null;
  eapDescricao?: string | null;
  semVerba?: boolean | null;
  motivoSemVerba?: string | null;
  [k: string]: unknown;
}

export interface OcItemConsolidado<T extends OcItemConsolidavel = OcItemConsolidavel> {
  chave: string;
  descricao: string;
  unidade: string;
  quantidade: number;
  quantidadeEntregue: number;
  total: number;
  /** Preço unitário PONDERADO = total ÷ quantidade (fallback: 1ª etapa). */
  precoUnitario: number;
  /** Linhas originais (uma por etapa da EAP), na ordem de aparição. */
  etapas: T[];
  qtdEtapas: number;
  /** true se qualquer etapa está marcada sem verba (avulso ou estouro). */
  temSemVerba: boolean;
  /** true se há etapa em PREJUÍZO (semVerba e motivo ≠ "avulso"). */
  temEstouro: boolean;
  /** true se há etapa FORA DO ORÇAMENTO (avulso). */
  temAvulso: boolean;
}

function num(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (v == null) return 0;
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

function totalDaLinha(it: OcItemConsolidavel): number {
  const t = num(it.total);
  if (t !== 0) return t;
  return num(it.quantidade) * num(it.precoUnitario);
}

export function consolidarOcItens<T extends OcItemConsolidavel>(itens: T[] | null | undefined): OcItemConsolidado<T>[] {
  const mapa = new Map<string, OcItemConsolidado<T>>();
  const ordem: string[] = [];

  for (const it of itens ?? []) {
    const desc = (it?.descricao ?? "").trim();
    const un = (it?.unidade ?? "").trim();
    const chave = `${desc.toLowerCase()}|${un.toLowerCase()}`;

    let g = mapa.get(chave);
    if (!g) {
      g = {
        chave,
        descricao: desc || "—",
        unidade: un || "un",
        quantidade: 0,
        quantidadeEntregue: 0,
        total: 0,
        precoUnitario: 0,
        etapas: [],
        qtdEtapas: 0,
        temSemVerba: false,
        temEstouro: false,
        temAvulso: false,
      };
      mapa.set(chave, g);
      ordem.push(chave);
    }

    g.quantidade += num(it.quantidade);
    g.quantidadeEntregue += num(it.quantidadeEntregue);
    g.total += totalDaLinha(it);
    g.etapas.push(it);

    if (it.semVerba) {
      g.temSemVerba = true;
      if (it.motivoSemVerba === "avulso") g.temAvulso = true;
      else g.temEstouro = true;
    }
  }

  const out = ordem.map((k) => mapa.get(k)!);
  for (const g of out) {
    g.qtdEtapas = g.etapas.length;
    g.precoUnitario = g.quantidade > 0 ? g.total / g.quantidade : num(g.etapas[0]?.precoUnitario);
  }
  return out;
}
