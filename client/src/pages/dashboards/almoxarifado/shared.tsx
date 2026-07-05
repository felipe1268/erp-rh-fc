// ============================================================================
// Rev. 4039 — Helpers e componentes compartilhados pelas 6 páginas do
// Dashboard Almoxarifado & Equipamentos (extraído do antigo arquivo único
// `DashAlmoxarifadoEquipamentos.tsx`, que tinha as 6 abas nesse mesmo arquivo).
// ============================================================================
import { Link } from "wouter";
import { ArrowLeft, CalendarRange, X, Search, ArrowUp, ArrowDown, Minus } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

export const fmtBRL = (v: number) => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const fmtNum = (v: number) => (v || 0).toLocaleString("pt-BR");
export const fmtDate = (d: any) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");
// Rev. 2360 — converte "YYYY-MM-DD" → "DD/MM" (padrão BR) pros eixos X dos charts.
export const fmtDayBR = (iso: string) => {
  const [, mm, dd] = (iso || "").split("-");
  return dd && mm ? `${dd}/${mm}` : (iso || "");
};
export const DIAS_SEMANA_PT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
export const MESES_PT_CAP = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

// Rev. 3016 — tema visual por status p/ os badges da lista de equip. próprios
// (cores intuitivas em vez do cinza único).
export function statusProprioTheme(status?: string | null): { label: string; cls: string } {
  const s = String(status || "").trim().toLowerCase();
  const map: Record<string, { label: string; cls: string }> = {
    em_obra:     { label: "Em obra",     cls: "bg-blue-100 text-blue-700 ring-1 ring-blue-200" },
    disponivel:  { label: "Disponível",  cls: "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200" },
    manutencao:  { label: "Manutenção",  cls: "bg-amber-100 text-amber-700 ring-1 ring-amber-200" },
    inativo:     { label: "Inativo",     cls: "bg-slate-200 text-slate-600 ring-1 ring-slate-300" },
    baixado:     { label: "Baixado",     cls: "bg-rose-100 text-rose-700 ring-1 ring-rose-200" },
  };
  return map[s] || { label: status ? String(status) : "—", cls: "bg-slate-100 text-slate-700 ring-1 ring-slate-200" };
}

// Last N days bucket key (YYYY-MM-DD)
export function bucketDayKey(d: Date | string) {
  const x = typeof d === "string" ? new Date(d) : d;
  return x.toISOString().slice(0, 10);
}

// YYYY-MM bucket key
export function monthKey(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  const x = typeof d === "string" ? new Date(d) : d;
  if (isNaN(x.getTime())) return null;
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function lastNMonths(n: number): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const k = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    out.push({ key: k, label: `${MESES_PT_CAP[d.getUTCMonth()]} ${d.getUTCFullYear()}` });
  }
  return out;
}
// Rev. 2330 — Ano fechado (jan→dez do ano escolhido)
export function monthsOfYear(year: number): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  for (let m = 0; m < 12; m++) {
    const k = `${year}-${String(m + 1).padStart(2, "0")}`;
    out.push({ key: k, label: `${MESES_PT_CAP[m]} ${year}` });
  }
  return out;
}

// Rev. 2360 — DeltaSub: badge compacto de variação Δ% vs período anterior.
export function DeltaSub({ current, previous, mediaDia, unidade = "" }: { current: number; previous: number; mediaDia: number; unidade?: string }) {
  const diff = current - previous;
  const pct = previous > 0 ? (diff / previous) * 100 : (current > 0 ? 100 : 0);
  const hasPrev = previous > 0 || current > 0;
  const sym = !hasPrev || diff === 0 ? "─" : diff > 0 ? "↑" : "↓";
  const tone = !hasPrev || diff === 0 ? "text-slate-400" : diff > 0 ? "text-emerald-600" : "text-red-600";
  const pctTxt = !hasPrev ? "—" : Math.abs(pct) >= 999 ? `${diff > 0 ? "+" : ""}${(diff || 0).toLocaleString("pt-BR")}` : `${Math.abs(pct).toFixed(0)}%`;
  return (
    <>
      {mediaDia.toFixed(1)}/dia{unidade} ·{" "}
      <span className={`font-semibold ${tone}`}>{sym} {pctTxt}</span>{" "}
      <span className="text-slate-400">vs {(previous || 0).toLocaleString("pt-BR")}</span>
    </>
  );
}

// Rev. 2332 — DeltaCell: valor + seta direcional vs mês anterior (% ou abs).
export function DeltaCell({ value, prev, money, accent }: { value: number; prev: number | undefined; money?: boolean; accent?: string }) {
  const v = money ? (value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : (value || 0).toLocaleString("pt-BR");
  const hasPrev = prev !== undefined;
  const diff = hasPrev ? (value || 0) - (prev || 0) : 0;
  const pct = hasPrev && prev! !== 0 ? (diff / Math.abs(prev!)) * 100 : null;
  const tone = !hasPrev || diff === 0
    ? "text-slate-400 bg-slate-50 ring-slate-200/60"
    : diff > 0
      ? "text-emerald-700 bg-emerald-50 ring-emerald-200/60"
      : "text-red-700 bg-red-50 ring-red-200/60";
  const Arrow = !hasPrev || diff === 0 ? Minus : diff > 0 ? ArrowUp : ArrowDown;
  const badgeText = !hasPrev
    ? "—"
    : diff === 0
      ? "0"
      : pct !== null && Math.abs(pct) < 999
        ? `${diff > 0 ? "+" : ""}${pct.toFixed(0)}%`
        : `${diff > 0 ? "+" : ""}${(diff || 0).toLocaleString("pt-BR")}`;
  return (
    <div className="flex items-center justify-end gap-2">
      <span className={accent || "text-slate-800"}>{v}</span>
      <span
        className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md ring-1 text-[10px] font-semibold tabular-nums ${tone}`}
        title={hasPrev ? `Mês anterior: ${money ? (prev || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : (prev || 0).toLocaleString("pt-BR")}` : "Sem mês anterior na série"}
      >
        <Arrow className="h-2.5 w-2.5" strokeWidth={2.5} />
        {badgeText}
      </span>
    </div>
  );
}

// Rev. 4039 — Header padrão de página (substitui as abas — cada dashboard
// agora é uma página própria com seu próprio link de volta).
export function AlmoxPageHeader({ icon: Icon, title, subtitle, carregando }: { icon: any; title: string; subtitle: string; carregando?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div>
        <Link href="/dashboards">
          <a className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"><ArrowLeft className="h-3 w-3" /> Voltar aos Dashboards</a>
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2 mt-1">
          <Icon className="h-6 w-6 text-emerald-600" /> {title}
        </h1>
        <p className="text-sm text-slate-600 mt-1">{subtitle}</p>
      </div>
      {carregando && <div className="text-xs text-slate-500">Carregando dados…</div>}
    </div>
  );
}

export type PeriodoMeses = "12m" | number;

// Rev. 2330/2331 — Header padrão pras tabelas mês a mês, agora com state
// PRÓPRIO de cada página (antes era compartilhado pelas 6 abas do arquivo
// único; como cada dashboard virou página própria, cada um tem seu período).
export function MesesHeaderBar({ titulo, periodoMeses, setPeriodoMeses, anosDisponiveis }: {
  titulo: string;
  periodoMeses: PeriodoMeses;
  setPeriodoMeses: (v: PeriodoMeses) => void;
  anosDisponiveis: number[];
}) {
  const periodoLabel = periodoMeses === "12m" ? "últimos 12 meses" : `ano ${periodoMeses}`;
  const periodoOpcoes: Array<{ valor: PeriodoMeses; rotulo: string }> = [
    { valor: "12m", rotulo: "12M" },
    ...anosDisponiveis.map(y => ({ valor: y, rotulo: String(y) })),
  ];
  return (
    <div className="px-5 py-3.5 border-b border-slate-100 bg-gradient-to-r from-slate-50/80 via-white to-white flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-3 min-w-0">
        <div className="shrink-0 h-9 w-9 rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-100/60 ring-1 ring-emerald-200/60 flex items-center justify-center">
          <CalendarRange className="h-4.5 w-4.5 text-emerald-700" />
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-slate-900 text-[15px] leading-tight truncate">{titulo}</div>
          <div className="text-[11px] text-slate-500 mt-0.5 leading-tight">{periodoLabel}</div>
        </div>
      </div>
      <div
        className="inline-flex items-center gap-0.5 p-1 rounded-full bg-slate-100/80 ring-1 ring-slate-200/70 max-w-full overflow-x-auto scrollbar-thin"
        role="tablist"
        aria-label="Período"
      >
        {periodoOpcoes.map(opt => {
          const ativo = String(opt.valor) === String(periodoMeses);
          return (
            <button
              key={String(opt.valor)}
              type="button"
              role="tab"
              aria-selected={ativo}
              onClick={() => setPeriodoMeses(opt.valor)}
              className={[
                "shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-150 whitespace-nowrap",
                ativo
                  ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
                  : "text-slate-500 hover:text-slate-800 hover:bg-white/60",
              ].join(" ")}
            >
              {opt.rotulo}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Rev. 4039 — Dialog genérico de drill-down: usado no clique de QUALQUER
// gráfico das 6 páginas (onChartClick do DashChart). Recebe linhas já
// prontas (rows) + definição de colunas; sem lógica de negócio aqui.
export interface DrillColumn<T> {
  header: string;
  align?: "left" | "right" | "center";
  render: (row: T) => ReactNode;
}
export function DrillDialog<T>({ open, onClose, title, subtitle, rows, columns, searchable, searchPredicate, emptyLabel = "Nenhum registro encontrado." }: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  rows: T[];
  columns: DrillColumn<T>[];
  searchable?: boolean;
  searchPredicate?: (row: T, busca: string) => boolean;
  emptyLabel?: string;
}) {
  const [busca, setBusca] = useState("");
  useEffect(() => { if (!open) setBusca(""); }, [open]);
  if (!open) return null;
  const buscaNorm = busca.trim().toLowerCase();
  const filtradas = buscaNorm && searchPredicate ? rows.filter(r => searchPredicate(r, buscaNorm)) : rows;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[88vh] max-h-[88dvh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="relative overflow-hidden bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-700 text-white">
          <div className="relative px-5 py-4 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold tracking-tight">{title}</h2>
              {subtitle && <p className="text-xs text-white/80 mt-0.5">{subtitle}</p>}
            </div>
            <button onClick={onClose} className="bg-white/15 hover:bg-white/25 backdrop-blur-sm rounded-xl p-2 ring-1 ring-white/30 transition" title="Fechar">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        {searchable && (
          <div className="border-b border-slate-200 bg-slate-50/60 px-5 py-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                autoFocus
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Filtrar…"
                className="w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 outline-none transition" />
            </div>
          </div>
        )}
        <div className="flex-1 overflow-auto">
          {filtradas.length === 0 ? (
            <div className="p-12 text-center text-slate-500">{emptyLabel}</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gradient-to-b from-slate-50 to-slate-50/90 backdrop-blur text-[11px] text-slate-500 uppercase tracking-wide z-10">
                <tr className="border-b border-slate-200">
                  {columns.map((c, i) => (
                    <th key={i} className={`p-2.5 ${i === 0 ? "pl-5" : ""} ${c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left"}`}>{c.header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtradas.map((row, idx) => (
                  <tr key={idx} className="border-t border-slate-100 hover:bg-emerald-50/30 transition">
                    {columns.map((c, i) => (
                      <td key={i} className={`p-2.5 ${i === 0 ? "pl-5" : ""} ${c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left"}`}>{c.render(row)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="border-t border-slate-200 bg-slate-50/80 px-5 py-3 flex items-center justify-between gap-3 text-xs text-slate-600">
          <div>Mostrando <b className="text-slate-900">{filtradas.length}</b> de <b className="text-slate-900">{rows.length}</b> registro(s)</div>
          <button
            onClick={onClose}
            className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg px-3 py-1.5 transition shadow-sm"
          >
            <X className="h-3.5 w-3.5" /> Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
