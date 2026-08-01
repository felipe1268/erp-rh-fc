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
  servico?: string | null; // Rev. 4780 — chave do serviço (alvenaria, chapisco...)
};

// Rev. 4780 — serviço do catálogo do levantamento (híbrido: padrão + EAP mapeada).
export type ServicoLevantamento = {
  chave: string;
  nome: string;
  unidadePadrao?: string | null;
  derivaDe?: string | null;               // derivado: mede-se o base 1x
  fator?: string | number | null;         // nº de faces / multiplicador
  orcamentoItemId?: number | null;        // vínculo EAP 1x por serviço
  itemEapCodigo?: string | null;
  itemDescricao?: string | null;
  ativo?: number | boolean | null;
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
  servicos?: ServicoLevantamento[],
): ConsolidadoResultado {
  const orcMap = new Map<number, ItemOrcamentoConsolidavel>(itensOrc.map((i) => [i.id, i]));
  const svcMap = new Map<string, ServicoLevantamento>((servicos ?? []).map((s) => [s.chave, s]));
  const grupos = new Map<string, LinhaConsolidada>();

  // Rev. 4780 — contorno SEM vínculo próprio herda o vínculo EAP do SERVIÇO
  // (vincula-se 1x por serviço, não contorno a contorno).
  const efetivo = (c: ContornoConsolidavel): ContornoConsolidavel => {
    if (c.orcamentoItemId != null || !c.servico) return c;
    const s = svcMap.get(c.servico);
    if (!s) return c;
    return {
      ...c,
      orcamentoItemId: s.orcamentoItemId ?? null,
      itemEapCodigo: c.itemEapCodigo ?? s.itemEapCodigo ?? null,
      itemDescricao: c.itemDescricao ?? s.itemDescricao ?? s.nome,
    };
  };

  // Rev. 4780 — serviços DERIVADOS: mede-se o base 1x (ex.: alvenaria) e cada
  // derivado ativo (chapisco/emboço/reboco/pintura) gera linha = qtd_base × fator.
  const derivados: ContornoConsolidavel[] = [];
  for (const s of svcMap.values()) {
    if (!s.derivaDe || s.ativo === 0 || s.ativo === false) continue;
    // Anti-dupla-contagem: se o usuário mediu o serviço derivado MANUALMENTE
    // (contornos com essa chave), a derivação automática é suprimida.
    if (contornos.some((c) => c.servico === s.chave)) continue;
    const fator = toNum(s.fator ?? 1) || 1;
    for (const c of contornos) {
      if (c.servico !== s.derivaDe) continue;
      derivados.push({
        tipo: c.tipo,
        servico: s.chave,
        unidade: c.unidade,
        quantidade: toNum(c.quantidade) * fator,
        orcamentoItemId: s.orcamentoItemId ?? null,
        itemEapCodigo: s.itemEapCodigo ?? null,
        itemDescricao: s.itemDescricao ?? s.nome,
        rotulo: s.nome,
      });
    }
  }

  for (const raw of [...contornos, ...derivados]) {
    const c = efetivo(raw);
    const chave = c.orcamentoItemId != null ? `oi:${c.orcamentoItemId}`
      : c.servico ? `sv:${c.servico}`
      : `na:${c.tipo}:${c.unidade ?? ""}`;
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
