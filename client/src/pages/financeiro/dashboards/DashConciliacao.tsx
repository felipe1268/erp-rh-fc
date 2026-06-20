import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { useCompany } from "@/hooks/useCompany";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell,
} from "recharts";
import { ArrowLeftRight, ArrowDownLeft, ArrowUpRight, Scale, CheckCircle2, Clock, Percent } from "lucide-react";
import {
  PALETTE, formatBRL, formatBRLCompact, DashHeader, KpiCard, ChartCard, EmptyState, BRLTooltip,
  ComparativoAnual, DetailDialog, DetailColumn,
} from "./_kit";
import { formatDate } from "@/lib/dateUtils";

const DESTINO = "/financeiro/conciliacao";

const COLS: DetailColumn[] = [
  { key: "conta", label: "Conta bancária" },
  { key: "linhas", label: "Linhas", align: "right" },
  { key: "conciliadas", label: "Conciliadas", align: "right" },
  { key: "pendentes", label: "Pendentes", align: "right" },
  { key: "valorEntradas", label: "Entradas (R$)", align: "right", brl: true },
  { key: "valorSaidas", label: "Saídas (R$)", align: "right", brl: true },
  {
    key: "saldo", label: "Saldo (R$)", align: "right",
    format: (v: any) => {
      const n = Number(v) || 0;
      return (
        <span className={`tabular-nums font-semibold ${n > 0 ? "text-emerald-600" : n < 0 ? "text-red-600" : "text-slate-500"}`}>
          {formatBRL(n)}
        </span>
      );
    },
  },
  { key: "valorConciliado", label: "Conciliado (R$)", align: "right", brl: true },
  { key: "valorPendenteEntradas", label: "Créd. a conciliar (R$)", align: "right", brl: true },
  { key: "valorPendenteSaidas", label: "Déb. a conciliar (R$)", align: "right", brl: true },
  { key: "valorPendente", label: "Total a conciliar (R$)", align: "right", brl: true },
];

export default function DashConciliacao() {
  const { companyId } = useCompany();
  const [, setLocation] = useLocation();
  const [ano, setAno] = useState(new Date().getFullYear());
  const ir = () => setLocation(DESTINO);

  const dataInicio = `${ano}-01-01`;
  const dataFim = `${ano}-12-31`;

  const { data: contas, refetch: r1 } = (trpc as any).financial.getBankAccounts.useQuery(
    { companyId }, { enabled: !!companyId }
  );
  const { data: status, isLoading, refetch: r2 } = (trpc as any).financial.getBankAccountsConciliacaoStatus.useQuery(
    { companyId, dataInicio, dataFim }, { enabled: !!companyId }
  );
  const { data: mensal, refetch: r3 } = (trpc as any).financial.getConciliacaoResumoMensal.useQuery(
    { companyId, ano }, { enabled: !!companyId }
  );
  const { data: mensalPrev } = (trpc as any).financial.getConciliacaoResumoMensal.useQuery(
    { companyId, ano: ano - 1 }, { enabled: !!companyId }
  );
  const refetch = () => { r1(); r2(); r3(); };

  const contasArr: any[] = Array.isArray(contas) ? contas : [];
  const statusArr: any[] = Array.isArray(status) ? status : [];
  const nomeConta = (id: number) => {
    const c = contasArr.find((x) => Number(x.id) === Number(id));
    if (!c) return `Conta ${id}`;
    return [c.banco, c.descricao].filter(Boolean).join(" · ") || `Conta ${id}`;
  };

  const [det, setDet] = useState(false);
  // Rev. 3346 — drill-in de CONFERÊNCIA TOTAL: abre TODAS as linhas individuais do extrato.
  // null = fechado; "entradas" | "saidas" | "todos" define o recorte aberto pelo card clicado.
  // Rev. 3349 — "interno" abre a movimentação interna (transf. entre contas/aplicação/intra-FC).
  const [lanc, setLanc] = useState<null | "entradas" | "saidas" | "todos" | "interno">(null);

  const { data: lancamentos, isLoading: lancLoading } = (trpc as any).financial.getConciliacaoLancamentos.useQuery(
    { companyId, dataInicio, dataFim }, { enabled: !!companyId && lanc !== null }
  );

  const kpis = useMemo(() => {
    let total = 0, conciliadas = 0, valorTotal = 0, valorConciliado = 0, valorEntradas = 0, valorSaidas = 0;
    let valorConciliadoEntradas = 0, valorConciliadoSaidas = 0, pendentesEntradas = 0, pendentesSaidas = 0;
    // Rev. 3349 — acumula a movimentação INTERNA (transf. entre contas/aplicação/intra-FC).
    let valorEntradasInternas = 0, valorSaidasInternas = 0, qtdEntradasInternas = 0, qtdSaidasInternas = 0;
    for (const s of statusArr) {
      total += Number(s.total) || 0;
      conciliadas += Number(s.conciliadas) || 0;
      valorTotal += Number(s.valorTotal) || 0;
      valorConciliado += Number(s.valorConciliado) || 0;
      valorEntradas += Number(s.valorEntradas) || 0;
      valorSaidas += Number(s.valorSaidas) || 0;
      valorConciliadoEntradas += Number(s.valorConciliadoEntradas) || 0;
      valorConciliadoSaidas += Number(s.valorConciliadoSaidas) || 0;
      pendentesEntradas += Number(s.pendentesEntradas) || 0;
      pendentesSaidas += Number(s.pendentesSaidas) || 0;
      valorEntradasInternas += Number(s.valorEntradasInternas) || 0;
      valorSaidasInternas += Number(s.valorSaidasInternas) || 0;
      qtdEntradasInternas += Number(s.qtdEntradasInternas) || 0;
      qtdSaidasInternas += Number(s.qtdSaidasInternas) || 0;
    }
    const valorPendente = Math.max(valorTotal - valorConciliado, 0);
    // Rev. 3316 — pendente SEPARADO por direção (não somar crédito + débito como se
    // fossem o mesmo sinal, que era o que inflava o "Pendente" p/ um número irreal).
    const valorPendenteEntradas = Math.max(valorEntradas - valorConciliadoEntradas, 0);
    const valorPendenteSaidas = Math.max(valorSaidas - valorConciliadoSaidas, 0);
    const pct = valorTotal > 0 ? (valorConciliado / valorTotal) * 100 : 0;
    const saldoLiquido = valorEntradas - valorSaidas;
    // Rev. 3349 — CAIXA REAL (externo) = bruto − interno. O usuário (opção 1) pediu que os
    // cards de movimentação reflitam o caixa real e a movimentação interna fique num card à parte.
    const valorEntradasExternas = Math.max(valorEntradas - valorEntradasInternas, 0);
    const valorSaidasExternas = Math.max(valorSaidas - valorSaidasInternas, 0);
    const saldoExterno = valorEntradasExternas - valorSaidasExternas;
    const valorInternoTotal = valorEntradasInternas + valorSaidasInternas;
    return {
      total, conciliadas, pendentes: Math.max(total - conciliadas, 0),
      valorTotal, valorConciliado, valorPendente, valorEntradas, valorSaidas, saldoLiquido, pct,
      valorPendenteEntradas, valorPendenteSaidas, pendentesEntradas, pendentesSaidas,
      valorEntradasInternas, valorSaidasInternas, qtdEntradasInternas, qtdSaidasInternas,
      valorEntradasExternas, valorSaidasExternas, saldoExterno, valorInternoTotal,
      contas: statusArr.length,
    };
  }, [statusArr]);

  const detalheContas = useMemo(() =>
    statusArr.map((s) => ({
      conta: nomeConta(s.contaBancariaId),
      linhas: Number(s.total) || 0,
      conciliadas: Number(s.conciliadas) || 0,
      pendentes: Math.max((Number(s.total) || 0) - (Number(s.conciliadas) || 0), 0),
      valorTotal: Number(s.valorTotal) || 0,
      valorEntradas: Number(s.valorEntradas) || 0,
      valorSaidas: Number(s.valorSaidas) || 0,
      saldo: (Number(s.valorEntradas) || 0) - (Number(s.valorSaidas) || 0),
      valorConciliado: Number(s.valorConciliado) || 0,
      valorPendente: Math.max((Number(s.valorTotal) || 0) - (Number(s.valorConciliado) || 0), 0),
      // Rev. 3316 — pendente por direção (crédito × débito).
      valorPendenteEntradas: Math.max((Number(s.valorEntradas) || 0) - (Number(s.valorConciliadoEntradas) || 0), 0),
      valorPendenteSaidas: Math.max((Number(s.valorSaidas) || 0) - (Number(s.valorConciliadoSaidas) || 0), 0),
    })).sort((a, b) => b.valorTotal - a.valorTotal),
  [statusArr, contasArr]);

  // Rev. 3346 — linhas individuais do extrato p/ a conferência total. O totalizador (totalKey
  // "valor") DEVE bater com o KPI do card: Entradas soma os créditos (valor exibido = v ≥ 0),
  // Saídas soma os débitos em módulo (|valor|), "todos" soma o valor com sinal (= saldo líquido).
  const lancArr: any[] = Array.isArray(lancamentos) ? lancamentos : [];
  const lancRows = useMemo(() => {
    if (lanc === null) return [];
    // Rev. 3349 — "entradas"/"saidas"/"todos" são CAIXA REAL (externo, !interno); "interno"
    // abre só a movimentação interna. Assim o totalizador bate com cada card respectivo.
    const ext = lancArr.filter((l) => !l.interno);
    const recorte = lanc === "entradas"
      ? ext.filter((l) => Number(l.valor) >= 0)
      : lanc === "saidas"
        ? ext.filter((l) => Number(l.valor) < 0)
        : lanc === "interno"
          ? lancArr.filter((l) => l.interno)
          : ext;
    return recorte.map((l) => {
      const v = Number(l.valor) || 0;
      return {
        data: l.data,
        conta: nomeConta(l.contaBancariaId),
        descricao: l.descricao || "—",
        situacao: Number(l.conciliado) === 1 ? "Conciliado" : "Pendente",
        // valor exibido em módulo p/ Saídas; com sinal nos demais (bate com o card).
        valor: lanc === "saidas" ? Math.abs(v) : v,
      };
    });
  }, [lanc, lancArr, contasArr]);

  const LANC_COLS: DetailColumn[] = useMemo(() => [
    { key: "data", label: "Data", format: (v: any) => formatDate(v) },
    { key: "conta", label: "Conta bancária" },
    { key: "descricao", label: "Descrição" },
    {
      key: "situacao", label: "Situação", align: "center",
      format: (v: any) => (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${v === "Conciliado" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
          {v}
        </span>
      ),
    },
    {
      key: "valor", label: "Valor (R$)", align: "right",
      format: (v: any) => {
        const n = Number(v) || 0;
        return (
          <span className={`tabular-nums font-semibold ${lanc === "saidas" || n < 0 ? "text-red-600" : n > 0 ? "text-emerald-600" : "text-slate-500"}`}>
            {formatBRL(n)}
          </span>
        );
      },
    },
  ], [lanc]);

  const lancTitle = lanc === "entradas" ? "Entradas (créditos · caixa real) — todos os lançamentos"
    : lanc === "saidas" ? "Saídas (débitos · caixa real) — todos os lançamentos"
    : lanc === "interno" ? "Movimentação interna — transf. entre contas, aplicação/resgate e intra-FC"
    : "Movimentação do extrato (caixa real) — todos os lançamentos";

  const pizza = useMemo(() => ([
    { name: "Conciliado", value: kpis.valorConciliado },
    { name: "Pendente", value: kpis.valorPendente },
  ].filter((x) => x.value > 0)), [kpis]);

  const porConta = useMemo(() =>
    detalheContas.slice(0, 10).map((d) => ({
      name: d.conta, Conciliado: d.valorConciliado, Pendente: d.valorPendente,
    })),
  [detalheContas]);

  // Rev. 3300 — régua mensal agora é SALDO LÍQUIDO (entrou − saiu), não mais "giro bruto"
  // (entrada+saída somadas), que o usuário descartou por não fazer sentido contábil.
  const serieAtual = useMemo(() => {
    const a = new Array(12).fill(0);
    for (const m of (Array.isArray(mensal) ? mensal : [])) { const i = Number(m.mes); if (i >= 1 && i <= 12) a[i - 1] = (Number(m.valorEntradas) || 0) - (Number(m.valorSaidas) || 0); }
    return a;
  }, [mensal]);
  const seriePrev = useMemo(() => {
    const a = new Array(12).fill(0);
    for (const m of (Array.isArray(mensalPrev) ? mensalPrev : [])) { const i = Number(m.mes); if (i >= 1 && i <= 12) a[i - 1] = (Number(m.valorEntradas) || 0) - (Number(m.valorSaidas) || 0); }
    return a;
  }, [mensalPrev]);

  const semDados = !isLoading && statusArr.length === 0;

  return (
    <DashboardLayout>
      <div className="max-w-[1600px] mx-auto p-4 md:p-6 space-y-5">
        <DashHeader
          theme="blue" icon={ArrowLeftRight} title="Dashboard · Conciliação Bancária"
          subtitle={`Valor movimentado no extrato × conciliado · ${ano}`} ano={ano} onAno={setAno} onRefresh={refetch}
        />

        {/* Rev. 3282 — Movimentação separada em Entradas / Saídas / Saldo líquido (o giro
            bruto vira subtítulo, p/ não confundir entrada+saída somadas com "o que sobrou"). */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 px-1">Movimentação do extrato · caixa real</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard icon={ArrowDownLeft} label="Entradas (caixa real)" value={formatBRL(kpis.valorEntradasExternas)} tone="good"
              sub="Externo · clique p/ conferir" onClick={() => setLanc("entradas")} />
            <KpiCard icon={ArrowUpRight} label="Saídas (caixa real)" value={formatBRL(kpis.valorSaidasExternas)} tone="bad"
              sub="Externo · clique p/ conferir" onClick={() => setLanc("saidas")} />
            <KpiCard icon={Scale} label="Saldo líquido (caixa real)" value={formatBRL(kpis.saldoExterno)}
              tone={kpis.saldoExterno >= 0 ? "good" : "bad"}
              sub="Entrou − saiu (externo) · clique p/ ver" onClick={() => setLanc("todos")} />
            <KpiCard icon={ArrowLeftRight} label="Movimentação interna" value={formatBRL(kpis.valorInternoTotal)} tone="default"
              sub={`${kpis.qtdEntradasInternas + kpis.qtdSaidasInternas} lançamento(s) · clique p/ conferir`} onClick={() => setLanc("interno")} />
          </div>
          <p className="text-[11px] leading-relaxed text-slate-400 px-1">
            <span className="font-medium text-slate-500">Como é calculado:</span> soma das linhas do extrato bancário
            importado no período, separando o <strong>caixa real (externo)</strong> da <strong>movimentação interna</strong>.
            <strong> Entradas/Saídas (caixa real)</strong> = créditos/débitos que NÃO são transferência entre as contas da
            própria FC, varredura de aplicação/resgate nem PIX/TED intra-FC; <strong>Saldo líquido</strong> = entradas − saídas
            (só externo). A <strong>Movimentação interna</strong> reúne esses lançamentos num card à parte — só conferência, não
            entram no caixa real. Linhas excluídas não entram na conta.
          </p>
        </div>

        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 px-1">Conciliação</h3>
          {/* Rev. 3316 — "Pendente" foi separado em Créditos a conciliar × Débitos a conciliar.
              Antes era 1 card só que somava crédito + débito em módulo (ex.: 8,2M + 9,6M = 17,9M),
              um valor sem significado contábil que confundia a leitura. */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard icon={CheckCircle2} label="Conciliado" value={formatBRL(kpis.valorConciliado)} tone="good"
              sub={`${kpis.conciliadas} de ${kpis.total} linhas`} onClick={() => setDet(true)} />
            <KpiCard icon={ArrowDownLeft} label="Créditos a conciliar" value={formatBRL(kpis.valorPendenteEntradas)} tone="warn"
              sub={`${kpis.pendentesEntradas} entrada(s) sem baixa`} onClick={() => setDet(true)} />
            <KpiCard icon={ArrowUpRight} label="Débitos a conciliar" value={formatBRL(kpis.valorPendenteSaidas)} tone="warn"
              sub={`${kpis.pendentesSaidas} saída(s) sem baixa`} onClick={() => setDet(true)} />
            <KpiCard icon={Percent} label="% conciliado (R$)" value={`${kpis.pct.toFixed(0)}%`}
              tone={kpis.pct >= 90 ? "good" : kpis.pct >= 50 ? "warn" : "bad"}
              sub={`${kpis.pendentes} de ${kpis.total} linhas a conciliar`} onClick={() => setDet(true)} />
          </div>
          <p className="text-[11px] leading-relaxed text-slate-400 px-1">
            <span className="font-medium text-slate-500">Como é calculado:</span> <strong>Conciliado</strong> = linhas do
            extrato já casadas com um lançamento do ERP (valor em módulo). <strong>A conciliar</strong> = linhas ainda sem
            correspondência, separadas por <strong>crédito</strong> (a receber/identificar) e <strong>débito</strong> (a
            pagar/identificar) — não somamos crédito + débito, pois têm sinais opostos. <strong>% conciliado</strong> =
            conciliado ÷ total movimentado (em módulo).
          </p>
        </div>

        {semDados ? (
          <div className="py-20"><EmptyState message={`Nenhuma linha de extrato importada em ${ano}.`} /></div>
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ChartCard title="Conciliado × pendente (R$)" subtitle="Clique para ver as contas" onOpen={ir}>
                {pizza.length === 0 ? <EmptyState /> : (
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={pizza} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={95}
                        innerRadius={55} paddingAngle={2} onClick={() => setDet(true)} className="cursor-pointer">
                        <Cell fill="#10b981" /><Cell fill="#f59e0b" />
                      </Pie>
                      <Tooltip content={<BRLTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>

              <ChartCard title="Por conta bancária (R$)" subtitle="Clique para detalhar todas as contas" onOpen={ir} height={Math.max(220, porConta.length * 44)}>
                {porConta.length === 0 ? <EmptyState /> : (
                  <ResponsiveContainer>
                    <BarChart data={porConta} layout="vertical" onClick={() => setDet(true)} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" horizontal={false} />
                      <XAxis type="number" tickFormatter={formatBRLCompact} tick={{ fontSize: 11, fill: "#64748b" }} />
                      <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11, fill: "#475569" }} />
                      <Tooltip content={<BRLTooltip />} cursor={{ fill: "#f1f5f9" }} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="Conciliado" stackId="a" fill="#10b981" maxBarSize={28} className="cursor-pointer" />
                      <Bar dataKey="Pendente" stackId="a" fill="#f59e0b" radius={[0, 4, 4, 0]} maxBarSize={28} className="cursor-pointer" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>
            </div>

            <ComparativoAnual
              title="Saldo líquido do extrato — mês a mês e ano a ano"
              subtitle={`Entradas − saídas em ${ano} vs ${ano - 1}`}
              serieAtual={serieAtual} seriePrev={seriePrev}
              anoAtual={ano} anoPrev={ano - 1} goodWhen="up" valorLabel="Saldo líquido"
            />
          </>
        )}

        <DetailDialog
          open={det} onOpenChange={setDet}
          title="Conciliação por conta bancária" subtitle={`Ano ${ano} · valores em BRL`}
          columns={COLS} rows={detalheContas} onGoTo={ir} totalKey="saldo"
        />

        {/* Rev. 3346 — Conferência total: TODAS as linhas individuais do extrato. */}
        <DetailDialog
          open={lanc !== null} onOpenChange={(o) => setLanc(o ? lanc : null)}
          icon={ArrowLeftRight}
          title={lancLoading ? "Carregando lançamentos…" : lancTitle}
          subtitle={`Ano ${ano} · ${lancRows.length} lançamento(s) · totalizador confere com o card`}
          columns={LANC_COLS} rows={lancRows} onGoTo={ir} totalKey="valor"
        />
      </div>
    </DashboardLayout>
  );
}
