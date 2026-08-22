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
  requadroMl?: string | number | null; // Rev. — metros lineares de requadro gerados pelo desconto de vãos
  // Rev. 4863 — MÚLTIPLOS itens da EAP no mesmo contorno (checkbox): JSON de
  // [{orcamentoItemId, eapCodigo, descricao, unidade, modo:'fator'|'fixo', fator?, quantidade?}]
  itensJson?: string | null;
};

// Rev. 4863 — entrada de vínculo múltiplo (parse tolerante; nunca lança).
export type VinculoExtra = {
  orcamentoItemId: number;
  eapCodigo?: string | null;
  descricao?: string | null;
  unidade?: string | null;
  modo?: "fator" | "fixo";
  fator?: string | number | null;      // multiplica a quantidade do contorno
  quantidade?: string | number | null; // usada quando modo='fixo'
};

export function parseItensExtras(raw: unknown): VinculoExtra[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(String(raw));
    if (!Array.isArray(arr)) return [];
    return arr.filter((e) => e && Number(e.orcamentoItemId) > 0)
      .map((e) => ({ ...e, orcamentoItemId: Number(e.orcamentoItemId) }));
  } catch { return []; }
}

// Rev. 4863 — quantidade de um vínculo extra a partir da quantidade do contorno.
export function quantidadeExtra(e: VinculoExtra, qtdContorno: number): number {
  if (e.modo === "fixo") {
    const q = parseFloat(String(e.quantidade ?? "0"));
    return Number.isFinite(q) ? q : 0;
  }
  const f = parseFloat(String(e.fator ?? "1"));
  return qtdContorno * (Number.isFinite(f) && f > 0 ? f : 1);
}

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

  // Rev. — REQUADRO de esquadrias (mapa de vãos): cada contorno com desconto de
  // vão pode carregar requadro_ml (pago 1x por vão, ledger no pin). Vira linha
  // própria no consolidado ("Requadro — <serviço>", em m) para nunca sumir do
  // boletim/memória de cálculo.
  const requadros: ContornoConsolidavel[] = [];
  for (const c of contornos) {
    const ml = toNum(c.requadroMl);
    if (ml <= 0) continue;
    const svcNome = c.servico ? (svcMap.get(c.servico)?.nome ?? c.servico) : (c.rotulo || "serviço");
    requadros.push({
      tipo: "linear",
      servico: c.servico ? `requadro:${c.servico}` : "requadro",
      unidade: "m",
      quantidade: ml,
      rotulo: `Requadro de esquadrias — ${svcNome}`,
      itemDescricao: `Requadro de esquadrias — ${svcNome}`,
    });
  }

  // Rev. 4863 — MÚLTIPLOS itens por contorno: cada vínculo extra vira uma linha
  // própria (qtd = qtd do contorno × fator, ou quantidade fixa), somada por item.
  // Anti-dupla-contagem: extra igual ao item EFETIVO do contorno (direto OU
  // herdado do serviço) e extra igual ao item de um serviço DERIVADO que já
  // gera linha automática deste contorno são ignorados.
  const derivadoIdsPorBase = new Map<string, Set<number>>();
  for (const s of svcMap.values()) {
    if (!s.derivaDe || s.ativo === 0 || s.ativo === false) continue;
    if (contornos.some((c) => c.servico === s.chave)) continue; // derivação suprimida
    if (s.orcamentoItemId == null) continue;
    const set = derivadoIdsPorBase.get(s.derivaDe) ?? new Set<number>();
    set.add(Number(s.orcamentoItemId));
    derivadoIdsPorBase.set(s.derivaDe, set);
  }
  const extras: ContornoConsolidavel[] = [];
  for (const c of contornos) {
    const lista = parseItensExtras(c.itensJson);
    if (!lista.length) continue;
    const base = toNum(c.quantidade);
    const mainId = efetivo(c).orcamentoItemId ?? null;
    const derivSet = c.servico ? derivadoIdsPorBase.get(c.servico) : undefined;
    for (const e of lista) {
      if (mainId != null && e.orcamentoItemId === mainId) continue; // não duplica o principal
      if (derivSet?.has(e.orcamentoItemId)) continue;              // já sai como derivado
      extras.push({
        tipo: c.tipo,
        rotulo: c.rotulo,
        unidade: e.unidade ?? null,
        quantidade: quantidadeExtra(e, base),
        orcamentoItemId: e.orcamentoItemId,
        itemEapCodigo: e.eapCodigo ?? null,
        itemDescricao: e.descricao ?? null,
        // sem 'servico': extra não herda vínculo de serviço nem gera derivados
      });
    }
  }

  for (const raw of [...contornos, ...derivados, ...requadros, ...extras]) {
    const c = efetivo(raw);
    // Rev. 4863 — contorno SÓ com vínculos múltiplos (sem item principal nem
    // herança de serviço): não gera linha "Sem item vinculado" — as linhas
    // reais já saíram dos extras.
    if (c.orcamentoItemId == null && parseItensExtras(raw.itensJson).length > 0) continue;
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
