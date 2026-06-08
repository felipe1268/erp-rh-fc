// Rev. 2895 — Consolidação do Levantamento de Campo (contornos → R$ por item).
// Função PURA reutilizada pelo servidor (medicao.getConsolidadoCampo) e pelo
// cliente no MODO OFFLINE (recalcula localmente sem ir ao banco).

export type ContornoConsolidavel = {
  orcamentoItemId?: number | null;
  tipo: string;
  rotulo?: string | null;
  unidade?: string | null;
  quantidade?: string | number | null;
  itemEapCodigo?: string | null;
  itemDescricao?: string | null;
};

export type ItemOrcamentoConsolidavel = {
  id: number;
  eapCodigo?: string | null;
  descricao?: string | null;
  unidade?: string | null;
  vendaUnitTotal?: string | number | null;
};

export type LinhaConsolidada = {
  orcamentoItemId: number | null;
  eapCodigo: string | null;
  descricao: string;
  unidade: string | null;
  precoUnitario: number;
  quantidade: number;
  valorTotal: number;
  contornos: number;
};

export type ConsolidadoResultado = { linhas: LinhaConsolidada[]; totalGeral: number };

function toNum(v: unknown): number {
  const n = parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

export function consolidarContornos(
  contornos: ContornoConsolidavel[],
  itensOrc: ItemOrcamentoConsolidavel[],
): ConsolidadoResultado {
  const orcMap = new Map<number, ItemOrcamentoConsolidavel>(itensOrc.map((i) => [i.id, i]));
  const grupos = new Map<string, LinhaConsolidada>();
  for (const c of contornos) {
    const chave = c.orcamentoItemId != null ? `oi:${c.orcamentoItemId}` : `na:${c.tipo}:${c.unidade ?? ""}`;
    const orc = c.orcamentoItemId != null ? orcMap.get(c.orcamentoItemId) : undefined;
    const preco = orc ? toNum(orc.vendaUnitTotal) : 0;
    const qtd = toNum(c.quantidade);
    let g = grupos.get(chave);
    if (!g) {
      g = {
        orcamentoItemId: c.orcamentoItemId ?? null,
        eapCodigo: c.itemEapCodigo ?? orc?.eapCodigo ?? null,
        descricao: c.itemDescricao ?? orc?.descricao ?? (c.rotulo || "Sem item vinculado"),
        unidade: c.unidade ?? orc?.unidade ?? null,
        precoUnitario: preco,
        quantidade: 0,
        valorTotal: 0,
        contornos: 0,
      };
      grupos.set(chave, g);
    }
    g.quantidade += qtd;
    g.valorTotal += qtd * preco;
    g.contornos += 1;
  }
  const linhas = Array.from(grupos.values()).sort((a, b) =>
    String(a.eapCodigo ?? "zzz").localeCompare(String(b.eapCodigo ?? "zzz")));
  const totalGeral = linhas.reduce((s, l) => s + l.valorTotal, 0);
  return { linhas, totalGeral };
}
