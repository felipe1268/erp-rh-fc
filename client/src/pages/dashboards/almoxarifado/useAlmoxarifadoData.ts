// ============================================================================
// Rev. 4039 — Hook único com TODAS as queries + agregações usadas pelas 6
// páginas do Dashboard Almoxarifado & Equipamentos (extraído do antigo
// arquivo único `DashAlmoxarifadoEquipamentos.tsx`). Cada página chama este
// hook e usa só a parte que precisa — evita duplicar a lógica de agregação
// em 6 arquivos diferentes.
// ============================================================================
import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { bucketDayKey, monthKey, lastNMonths, monthsOfYear, type PeriodoMeses } from "./shared";

export function useAlmoxarifadoData() {
  const { selectedCompany } = useCompany();
  const companyId = Number(selectedCompany?.id) || 0;
  const enabled = !!companyId;

  // ── Queries (todas em paralelo via react-query) ────────────────────────────
  const itensQ        = trpc.compras.listarItens.useQuery({ companyId, incluirAplicacaoDireta: true }, { enabled });
  const movsQ         = trpc.warehouse.listMovements.useQuery({ companyId, limit: 2000 }, { enabled });
  const loansOpenQ    = trpc.warehouse.listOpenLoans.useQuery({ companyId }, { enabled });
  const insumosQ      = trpc.warehouse.listInsumos.useQuery({ companyId, limit: 200 }, { enabled });
  const transfQ       = trpc.warehouse.listTransferencias.useQuery({ companyId, limit: 200 }, { enabled });
  const propriosQ     = trpc.equipamentos.propriosListar.useQuery({ companyId }, { enabled });
  const locadosQ      = trpc.equipamentos.locadosListar.useQuery({ companyId }, { enabled });
  const vencendoQ     = trpc.equipamentos.locadosListar.useQuery({ companyId, vencendoEmDias: 30 }, { enabled });
  const obrasQ        = trpc.obras.listActive.useQuery({ companyId }, { enabled });
  const ferramentasQ  = trpc.ferramentasTerceiros.listarRegistros.useQuery({ companyId, limit: 200 }, { enabled });
  // Rev. 4039 — nova agregação por funcionário (retiradas + empréstimos abertos).
  const porFuncionarioQ = trpc.warehouse.dashboardPorFuncionario.useQuery({ companyId }, { enabled });

  const obrasMap = useMemo(() => {
    const m = new Map<number, string>();
    for (const o of ((obrasQ.data || []) as any[])) m.set(Number(o.id), String(o.nome || `Obra #${o.id}`));
    return m;
  }, [obrasQ.data]);

  // ── Agregados Estoque ──────────────────────────────────────────────────────
  const stockAgg = useMemo(() => {
    const itens = (itensQ.data || []) as any[];
    const total = itens.length;
    let unidadesEstoque = 0, valorTotal = 0, abaixoMin = 0, semEstoque = 0;
    const porCategoria = new Map<string, { qtd: number; valor: number }>();
    const semCategoriaItens: any[] = [];
    const topPorValor: Array<{ item: any; saldo: number; preco: number; valor: number }> = [];
    for (const it of itens) {
      // Rev. 2448 — Fields corretos do schema `almoxarifado_itens`:
      // `quantidadeAtual` (não saldoAtual) e `valorUnitario` (não precoMedio).
      const saldo = Number(it.quantidadeAtual ?? it.saldoAtual ?? it.quantidade ?? 0);
      const preco = Number(it.valorUnitario ?? it.precoMedio ?? it.precoUnitario ?? 0);
      unidadesEstoque += saldo;
      valorTotal += saldo * preco;
      const min = Number(it.quantidadeMinima ?? it.estoqueMinimo ?? 0);
      if (saldo <= 0) semEstoque += 1;
      else if (min > 0 && saldo < min) abaixoMin += 1;
      const catRaw = it.categoria ? String(it.categoria).trim() : "";
      const cat = catRaw || "— sem categoria —";
      if (!catRaw) semCategoriaItens.push(it);
      const cur = porCategoria.get(cat) || { qtd: 0, valor: 0 };
      cur.qtd += 1; cur.valor += saldo * preco;
      porCategoria.set(cat, cur);
      topPorValor.push({ item: it, saldo, preco, valor: saldo * preco });
    }
    const cats = Array.from(porCategoria.entries())
      .map(([k, v]) => ({ categoria: k, qtd: v.qtd, valor: v.valor }))
      .sort((a, b) => b.valor - a.valor);
    topPorValor.sort((a, b) => b.valor - a.valor);
    return {
      total, unidadesEstoque, valorTotal, abaixoMin, semEstoque, cats,
      semCategoriaItens,
      topPorValor: topPorValor.slice(0, 15),
    };
  }, [itensQ.data]);

  // Rev. 2360 — período variável (7/30/90 dias) selecionável só na página Movs.
  const [movsPeriodoDias, setMovsPeriodoDias] = useState<7 | 30 | 90>(30);

  // Mapa itemId -> valorUnitario, pra calcular "valor movimentado" (a
  // tabela de movimentações não guarda valor, só quantidade).
  const itensValorMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of ((itensQ.data || []) as any[])) {
      const preco = Number(it.valorUnitario ?? it.precoMedio ?? it.precoUnitario ?? 0);
      m.set(String(it.id), preco);
    }
    return m;
  }, [itensQ.data]);

  // ── Agregados Movimentações (período variável) ─────────────────────────────
  const movAgg = useMemo(() => {
    const dias = movsPeriodoDias;
    const movs = ((movsQ.data || []) as any[]).filter(m => !m.estornadaEm);
    const limite = new Date(); limite.setDate(limite.getDate() - (dias - 1));
    const limiteKey = bucketDayKey(limite);
    const limiteAnt = new Date(); limiteAnt.setDate(limiteAnt.getDate() - (2 * dias - 1));
    const limiteAntKey = bucketDayKey(limiteAnt);

    const periodoAtual = movs.filter(m => bucketDayKey(m.criadoEm) >= limiteKey);
    const periodoAnterior = movs.filter(m => {
      const k = bucketDayKey(m.criadoEm);
      return k >= limiteAntKey && k < limiteKey;
    });

    const porTipo = new Map<string, number>();
    const porDia: Record<string, { entradas: number; saidas: number }> = {};
    const porDiaSemana = [0, 0, 0, 0, 0, 0, 0];
    const porItem = new Map<string, { nome: string; entradas: number; saidas: number; total: number; valor: number }>();
    const porObra = new Map<string, { nome: string; entradas: number; saidas: number; total: number }>();
    for (let i = 0; i < dias; i++) {
      const d = new Date(); d.setDate(d.getDate() - (dias - 1 - i));
      porDia[bucketDayKey(d)] = { entradas: 0, saidas: 0 };
    }
    let totalEntradas = 0, totalSaidas = 0, valorTotalMovimentado = 0;
    for (const m of periodoAtual) {
      porTipo.set(m.tipo, (porTipo.get(m.tipo) || 0) + 1);
      const k = bucketDayKey(m.criadoEm);
      if (!porDia[k]) porDia[k] = { entradas: 0, saidas: 0 };
      const qtd = Math.abs(Number(m.quantidade || 0));
      const isEntrada = String(m.tipo || "").toLowerCase().includes("entrada");
      if (isEntrada) { porDia[k].entradas += qtd; totalEntradas += qtd; }
      else { porDia[k].saidas += qtd; totalSaidas += qtd; }
      const dow = new Date(m.criadoEm).getDay();
      if (dow >= 0 && dow <= 6) porDiaSemana[dow] += 1;
      const itemKey = String(m.itemId || m.itemNome || "—");
      const itemNome = String(m.itemNome || "— sem item —");
      const preco = itensValorMap.get(String(m.itemId)) || 0;
      const valorMov = qtd * preco;
      valorTotalMovimentado += valorMov;
      const ci = porItem.get(itemKey) || { nome: itemNome, entradas: 0, saidas: 0, total: 0, valor: 0 };
      ci.nome = itemNome;
      if (isEntrada) ci.entradas += qtd; else ci.saidas += qtd;
      ci.total += qtd;
      ci.valor += valorMov;
      porItem.set(itemKey, ci);
      const oNome = m.obraNome || (m.obraId ? (obrasMap.get(Number(m.obraId)) || `Obra #${m.obraId}`) : "— sem obra —");
      const co = porObra.get(oNome) || { nome: oNome, entradas: 0, saidas: 0, total: 0 };
      if (isEntrada) co.entradas += qtd; else co.saidas += qtd;
      co.total += qtd;
      porObra.set(oNome, co);
    }
    let entAnt = 0, saiAnt = 0;
    for (const m of periodoAnterior) {
      const qtd = Math.abs(Number(m.quantidade || 0));
      const isEntrada = String(m.tipo || "").toLowerCase().includes("entrada");
      if (isEntrada) entAnt += qtd; else saiAnt += qtd;
    }
    return {
      dias,
      totalMovs: periodoAtual.length,
      totalEntradas, totalSaidas, valorTotalMovimentado,
      mediaDiaEntradas: totalEntradas / dias,
      mediaDiaSaidas: totalSaidas / dias,
      mediaDiaMovs: periodoAtual.length / dias,
      entAnt, saiAnt,
      movsAnt: periodoAnterior.length,
      porTipo: Array.from(porTipo.entries()).map(([t, c]) => ({ tipo: t, count: c })).sort((a, b) => b.count - a.count),
      porDia,
      porDiaSemana,
      topItens: Array.from(porItem.values()).sort((a, b) => b.total - a.total).slice(0, 10),
      topItensPorValor: Array.from(porItem.values()).sort((a, b) => b.valor - a.valor).slice(0, 10),
      topObras: Array.from(porObra.values()).sort((a, b) => b.total - a.total).slice(0, 8),
      periodoAtual,
    };
  }, [movsQ.data, movsPeriodoDias, obrasMap, itensValorMap]);

  // Rev. 2360 — Memo SEPARADO pro chart da Visão Geral (sempre 30d fixos).
  const visaoGeralMovs = useMemo(() => {
    const movs = ((movsQ.data || []) as any[]).filter(m => !m.estornadaEm);
    const limite = new Date(); limite.setDate(limite.getDate() - 29);
    const limiteKey = bucketDayKey(limite);
    const last30 = movs.filter(m => bucketDayKey(m.criadoEm) >= limiteKey);
    const porDia: Record<string, { entradas: number; saidas: number }> = {};
    for (let i = 0; i < 30; i++) {
      const d = new Date(); d.setDate(d.getDate() - (29 - i));
      porDia[bucketDayKey(d)] = { entradas: 0, saidas: 0 };
    }
    for (const m of last30) {
      const k = bucketDayKey(m.criadoEm);
      if (!porDia[k]) porDia[k] = { entradas: 0, saidas: 0 };
      const qtd = Math.abs(Number(m.quantidade || 0));
      const isEntrada = String(m.tipo || "").toLowerCase().includes("entrada");
      if (isEntrada) porDia[k].entradas += qtd;
      else porDia[k].saidas += qtd;
    }
    return { porDia };
  }, [movsQ.data]);

  // ── Equipamentos Próprios ──────────────────────────────────────────────────
  const proprAgg = useMemo(() => {
    const list = (propriosQ.data || []) as any[];
    const total = list.length;
    const porStatus = new Map<string, number>();
    let valorAtivos = 0;
    for (const p of list) {
      const s = String(p.status || "indefinido");
      porStatus.set(s, (porStatus.get(s) || 0) + 1);
      valorAtivos += Number(p.valorAquisicao || 0);
    }
    return { total, valorAtivos, porStatus: Array.from(porStatus.entries()) };
  }, [propriosQ.data]);

  // ── Equipamentos Locados ───────────────────────────────────────────────────
  const locAgg = useMemo(() => {
    const list = (locadosQ.data || []) as any[];
    const HOJE_AGG = new Date(); HOJE_AGG.setHours(0, 0, 0, 0);
    const ativos = list.filter(l => l.status === "em_uso");
    const devolvidos = list.filter(l => l.status === "devolvido");
    const atrasados = list.filter(l => l.status === "atrasado" || (l.status === "em_uso" && l.dataFimPrevista && new Date(l.dataFimPrevista) < HOJE_AGG));
    const vencendo = (vencendoQ.data || []) as any[];
    const custoMes = ativos.reduce((acc, l) => acc + Number(l.valorMensal || 0), 0);
    const porFornecedor = new Map<string, { qtd: number; custo: number }>();
    const porObra = new Map<string, { qtd: number; custo: number }>();
    const semObra = ativos.filter(l => !l.obraId).length;
    for (const l of ativos) {
      const f = String(l.fornecedorNome || "— sem fornecedor —");
      const cur = porFornecedor.get(f) || { qtd: 0, custo: 0 };
      cur.qtd += 1; cur.custo += Number(l.valorMensal || 0);
      porFornecedor.set(f, cur);
      const oNome = l.obraId ? (obrasMap.get(Number(l.obraId)) || `Obra #${l.obraId}`) : "— sem obra —";
      const co = porObra.get(oNome) || { qtd: 0, custo: 0 };
      co.qtd += 1; co.custo += Number(l.valorMensal || 0);
      porObra.set(oNome, co);
    }
    return {
      total: list.length,
      ativos: ativos.length, devolvidos: devolvidos.length, atrasados: atrasados.length,
      vencendo30: vencendo.length, custoMes, semObra,
      porFornecedor: Array.from(porFornecedor.entries()).map(([n, v]) => ({ nome: n, ...v })).sort((a, b) => b.custo - a.custo),
      porObra: Array.from(porObra.entries()).map(([n, v]) => ({ nome: n, ...v })).sort((a, b) => b.custo - a.custo),
      vencendo,
    };
  }, [locadosQ.data, vencendoQ.data, obrasMap]);

  // ── Ferramentas terceiros ──────────────────────────────────────────────────
  const ferrAgg = useMemo(() => {
    const list = (ferramentasQ.data || []) as any[];
    return { total: list.length, items: list.slice(0, 30) };
  }, [ferramentasQ.data]);

  // ── Empréstimos / Insumos / Transferências ─────────────────────────────────
  const opsAgg = useMemo(() => ({
    loansAbertos: ((loansOpenQ.data || []) as any[]).length,
    insumos: ((insumosQ.data || []) as any[]).length,
    transferencias: ((transfQ.data || []) as any[]).length,
  }), [loansOpenQ.data, insumosQ.data, transfQ.data]);

  // ── Comparativo mês a mês (state próprio de cada página) ──────────────────
  const [periodoMeses, setPeriodoMeses] = useState<PeriodoMeses>(() => new Date().getFullYear());

  const anosDisponiveis = useMemo(() => {
    const anos = new Set<number>();
    const yearOf = (d: any) => { const k = monthKey(d); return k ? Number(k.slice(0, 4)) : null; };
    const push = (y: number | null) => { if (y && y >= 2000 && y <= 2100) anos.add(y); };
    for (const m of ((movsQ.data || []) as any[])) push(yearOf(m.criadoEm));
    for (const p of ((propriosQ.data || []) as any[])) push(yearOf(p.dataAquisicao || p.criadoEm));
    for (const l of ((locadosQ.data || []) as any[])) { push(yearOf(l.dataInicio || l.criadoEm)); push(yearOf(l.dataDevolucao)); }
    for (const f of ((ferramentasQ.data || []) as any[])) push(yearOf(f.data_hora || f.dataHora || f.criado_em || f.criadoEm));
    for (const it of ((itensQ.data || []) as any[])) push(yearOf(it.criadoEm || it.createdAt));
    anos.add(new Date().getUTCFullYear());
    return Array.from(anos).sort((a, b) => b - a);
  }, [movsQ.data, propriosQ.data, locadosQ.data, ferramentasQ.data, itensQ.data]);

  const monthlyAgg = useMemo(() => {
    const months = periodoMeses === "12m" ? lastNMonths(12) : monthsOfYear(periodoMeses);
    const empty = () => months.reduce((acc, m) => { acc[m.key] = 0; return acc; }, {} as Record<string, number>);

    const movsEntradas = empty();
    const movsSaidas = empty();
    const movsCount = empty();
    const propriosNovos = empty();
    const propriosValor = empty();
    const locadosIniciados = empty();
    const locadosDevolvidos = empty();
    const locadosCustoIniciado = empty();
    const ferramentasReg = empty();
    const itensCadastrados = empty();

    for (const m of ((movsQ.data || []) as any[])) {
      if (m.estornadaEm) continue;
      const k = monthKey(m.criadoEm);
      if (!k || !(k in movsCount)) continue;
      const qtd = Math.abs(Number(m.quantidade || 0));
      const isEntrada = String(m.tipo || "").toLowerCase().includes("entrada");
      movsCount[k] += 1;
      if (isEntrada) movsEntradas[k] += qtd;
      else movsSaidas[k] += qtd;
    }
    for (const p of ((propriosQ.data || []) as any[])) {
      const k = monthKey(p.dataAquisicao || p.criadoEm);
      if (!k || !(k in propriosNovos)) continue;
      propriosNovos[k] += 1;
      propriosValor[k] += Number(p.valorAquisicao || 0);
    }
    for (const l of ((locadosQ.data || []) as any[])) {
      const ki = monthKey(l.dataInicio || l.criadoEm);
      if (ki && ki in locadosIniciados) {
        locadosIniciados[ki] += 1;
        locadosCustoIniciado[ki] += Number(l.valorMensal || 0);
      }
      const kd = monthKey(l.dataDevolucao);
      if (kd && kd in locadosDevolvidos) locadosDevolvidos[kd] += 1;
    }
    for (const f of ((ferramentasQ.data || []) as any[])) {
      const k = monthKey(f.data_hora || f.dataHora || f.criado_em || f.criadoEm);
      if (k && k in ferramentasReg) ferramentasReg[k] += 1;
    }
    for (const it of ((itensQ.data || []) as any[])) {
      const k = monthKey(it.criadoEm || it.createdAt);
      if (k && k in itensCadastrados) itensCadastrados[k] += 1;
    }

    return {
      months,
      movsEntradas, movsSaidas, movsCount,
      propriosNovos, propriosValor,
      locadosIniciados, locadosDevolvidos, locadosCustoIniciado,
      ferramentasReg, itensCadastrados,
    };
  }, [periodoMeses, movsQ.data, propriosQ.data, locadosQ.data, ferramentasQ.data, itensQ.data]);

  const carregando = itensQ.isLoading || propriosQ.isLoading || locadosQ.isLoading;

  return {
    companyId, enabled,
    itensQ, movsQ, loansOpenQ, insumosQ, transfQ, propriosQ, locadosQ, vencendoQ, obrasQ, ferramentasQ, porFuncionarioQ,
    obrasMap,
    stockAgg,
    movsPeriodoDias, setMovsPeriodoDias, movAgg, visaoGeralMovs,
    proprAgg, locAgg, ferrAgg, opsAgg,
    periodoMeses, setPeriodoMeses, anosDisponiveis, monthlyAgg,
    carregando,
  };
}
