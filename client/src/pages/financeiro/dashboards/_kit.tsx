import { ReactNode, useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import {
  RefreshCw, ChevronLeft, ChevronRight, ArrowUpRight, ArrowUp, ArrowDown, Minus,
  ExternalLink, LucideIcon, Search, ListFilter,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell, TableFooter,
} from "@/components/ui/table";

/* ──────────────────────────────────────────────────────────────────────────
 * Kit compartilhado dos Dashboards Financeiros (Rev. 3243).
 * READ-ONLY · só apresentação. Cada painel monta KPIs + gráficos responsivos
 * (recharts) a partir dos endpoints já existentes, agregados client-side.
 * ──────────────────────────────────────────────────────────────────────── */

export const MESES_ABREV = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value) || 0);
}

/** Eixos/labels curtos — mantém pt-BR (R$ 120 mil / R$ 1,2 mi). */
export function formatBRLCompact(value: number): string {
  const v = Number(value) || 0;
  const abs = Math.abs(v);
  const sig = v < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sig}R$ ${(abs / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (abs >= 1_000) return `${sig}R$ ${(abs / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`;
  return formatBRL(v);
}

/** Paleta categórica moderna (usada em pizzas/barras agrupadas). */
export const PALETTE = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#0ea5e9", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#64748b"];

export type ThemeKey = "emerald" | "rose" | "blue" | "violet" | "amber";

export const THEMES: Record<ThemeKey, { from: string; to: string; ring: string; soft: string; text: string; bar: string }> = {
  emerald: { from: "from-emerald-600", to: "to-teal-500", ring: "ring-emerald-500", soft: "bg-emerald-50", text: "text-emerald-700", bar: "#10b981" },
  rose:    { from: "from-rose-600",    to: "to-red-500",  ring: "ring-rose-500",    soft: "bg-rose-50",    text: "text-rose-700",    bar: "#f43f5e" },
  blue:    { from: "from-blue-600",    to: "to-sky-500",  ring: "ring-blue-500",    soft: "bg-blue-50",    text: "text-blue-700",    bar: "#3b82f6" },
  violet:  { from: "from-violet-600",  to: "to-purple-500", ring: "ring-violet-500", soft: "bg-violet-50",  text: "text-violet-700",  bar: "#8b5cf6" },
  amber:   { from: "from-amber-500",   to: "to-orange-500", ring: "ring-amber-500", soft: "bg-amber-50",   text: "text-amber-700",   bar: "#f59e0b" },
};

/* ─────────────────────────── Header com gradiente ─────────────────────────── */
export function DashHeader({
  theme, icon: Icon, title, subtitle, ano, onAno, onRefresh, right,
}: {
  theme: ThemeKey; icon: LucideIcon; title: string; subtitle?: string;
  ano: number; onAno: (a: number) => void; onRefresh?: () => void; right?: ReactNode;
}) {
  const t = THEMES[theme];
  return (
    <div className={`rounded-2xl bg-gradient-to-r ${t.from} ${t.to} text-white p-5 md:p-6 shadow-lg`}>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center shrink-0">
            <Icon className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold leading-tight">{title}</h1>
            {subtitle && <p className="text-white/80 text-sm">{subtitle}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {right}
          <div className="flex items-center gap-1 bg-white/15 backdrop-blur rounded-lg px-1 py-1">
            <button onClick={() => onAno(ano - 1)} className="p-1.5 rounded-md hover:bg-white/20 transition" aria-label="Ano anterior">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-semibold text-sm w-12 text-center tabular-nums">{ano}</span>
            <button onClick={() => onAno(ano + 1)} className="p-1.5 rounded-md hover:bg-white/20 transition" aria-label="Próximo ano">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          {onRefresh && (
            <button onClick={onRefresh} className="p-2 rounded-lg bg-white/15 backdrop-blur hover:bg-white/25 transition" aria-label="Atualizar">
              <RefreshCw className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────── KPI card ─────────────────────────────────── */
export function KpiCard({
  icon: Icon, label, value, sub, tone = "default", onClick,
}: {
  icon: LucideIcon; label: string; value: string; sub?: string;
  tone?: "default" | "good" | "warn" | "bad"; onClick?: () => void;
}) {
  const tones: Record<string, string> = {
    default: "text-slate-700 bg-slate-100",
    good: "text-emerald-700 bg-emerald-100",
    warn: "text-amber-700 bg-amber-100",
    bad: "text-rose-700 bg-rose-100",
  };
  return (
    <Card
      onClick={onClick}
      className={`p-4 border-slate-200 transition-all ${onClick ? "cursor-pointer hover:shadow-md hover:-translate-y-0.5" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-slate-500 leading-tight mb-1">{label}</p>
          <p className="text-sm md:text-base lg:text-lg font-bold text-slate-900 tabular-nums leading-snug break-all">{value}</p>
          {sub && <p className="text-[11px] text-slate-400 mt-0.5 leading-tight">{sub}</p>}
        </div>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${tones[tone]}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      {onClick && (
        <div className="flex items-center gap-1 text-[11px] text-slate-400 mt-2">
          <ArrowUpRight className="w-3 h-3" /> ver detalhes
        </div>
      )}
    </Card>
  );
}

/* ─────────────────────────────── Chart card ───────────────────────────────── */
export function ChartCard({
  title, subtitle, onOpen, openLabel = "Abrir", height = 280, children, className = "",
}: {
  title: string; subtitle?: string; onOpen?: () => void; openLabel?: string;
  height?: number; children: ReactNode; className?: string;
}) {
  return (
    <Card className={`p-4 border-slate-200 ${className}`}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-slate-800 text-sm md:text-base leading-snug">{title}</h3>
          {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
        {onOpen && (
          <button
            onClick={onOpen}
            className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900 transition px-2 py-1 rounded-md hover:bg-slate-100"
          >
            {openLabel} <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <div className="relative w-full isolate overflow-hidden" style={{ height }}>{children}</div>
    </Card>
  );
}

export function EmptyState({ message = "Sem dados para o período." }: { message?: string }) {
  return (
    <div className="h-full w-full flex items-center justify-center text-sm text-slate-400 border border-dashed border-slate-200 rounded-lg">
      {message}
    </div>
  );
}

/* Tooltip recharts padronizado em BRL. */
export function BRLTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      {label != null && <p className="font-semibold text-slate-700 mb-1">{label}</p>}
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: p.color || p.fill }} />
          <span className="text-slate-500">{p.name}:</span>
          <span className="font-semibold text-slate-800">{formatBRL(Number(p.value) || 0)}</span>
        </div>
      ))}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Rev. 3248 — Primitivos de comparação + drill-down (BRL).
 * READ-ONLY. Usados por todos os 5 dashboards financeiros.
 * ──────────────────────────────────────────────────────────────────────── */

export function formatPct(n: number, casas = 1): string {
  const v = Number(n);
  if (!isFinite(v)) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(casas)}%`;
}

/** Variação percentual (curr vs prev) com tratamento de base zero. */
export function variacaoPct(curr: number, prev: number): number | null {
  const c = Number(curr) || 0, p = Number(prev) || 0;
  const base = Math.abs(p);
  if (base < 0.005) return c > 0 ? Infinity : c < 0 ? -Infinity : 0;
  return ((c - p) / base) * 100;
}

/* Selo de delta com seta ↑/↓ + % colorido. `goodWhen` define a semântica:
 * "up" → subir é bom (receitas), "down" → subir é ruim (custos/despesas). */
export function DeltaBadge({
  curr, prev, goodWhen = "up", size = "sm",
}: {
  curr: number; prev: number; goodWhen?: "up" | "down"; size?: "sm" | "xs";
}) {
  const diff = (Number(curr) || 0) - (Number(prev) || 0);
  const up = diff > 0.005, down = diff < -0.005;
  const pct = variacaoPct(curr, prev);
  const isGood = (goodWhen === "up" && up) || (goodWhen === "down" && down);
  const isBad = (up || down) && !isGood;
  const cls = !up && !down
    ? "text-slate-400 bg-slate-100"
    : isGood ? "text-emerald-700 bg-emerald-100" : "text-rose-700 bg-rose-100";
  const Icon = up ? ArrowUp : down ? ArrowDown : Minus;
  const label =
    pct == null ? "—"
    : pct === Infinity ? "novo"
    : pct === -Infinity ? "zerou"
    : formatPct(pct);
  const pad = size === "xs" ? "px-1 py-0.5 text-[10px]" : "px-1.5 py-0.5 text-[11px]";
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-md font-semibold tabular-nums ${pad} ${cls}`}
      title={`${formatBRL(curr)} vs ${formatBRL(prev)} · Δ ${formatBRL(diff)}`}
    >
      <Icon className="w-3 h-3 shrink-0" />
      {label}
    </span>
  );
}

/* ─────────────────────── Diálogo de drill-down (tabela) ─────────────────────
 * Genérico: clica num gráfico → abre com TODAS as linhas pertinentes em BRL.
 * O DialogContent já traz o botão de maximizar (Rev. 3237). */
export type DetailColumn = {
  key: string;
  label: string;
  align?: "left" | "right" | "center";
  brl?: boolean;                       // formata como moeda
  format?: (v: any, row: any) => ReactNode;
  className?: string;
};

export function DetailDialog({
  open, onOpenChange, title, subtitle, columns, rows, totalKey, onGoTo,
  goLabel = "Abrir tela operacional", icon: Icon = ListFilter, searchable = true,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  subtitle?: string;
  columns: DetailColumn[];
  rows: any[];
  totalKey?: string;
  onGoTo?: () => void;
  goLabel?: string;
  icon?: LucideIcon;
  searchable?: boolean;
}) {
  const [q, setQ] = useState("");
  const alignCls = (a?: string) => (a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left");

  // Busca client-side genérica: casa em qualquer valor cru das colunas.
  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    if (!ql) return rows;
    return rows.filter((r) => columns.some((c) => String(r[c.key] ?? "").toLowerCase().includes(ql)));
  }, [q, rows, columns]);

  const totalAll = totalKey != null ? rows.reduce((s, r) => s + (Number(r[totalKey]) || 0), 0) : null;
  const totalFiltered = totalKey != null ? filtered.reduce((s, r) => s + (Number(r[totalKey]) || 0), 0) : null;
  const isFiltered = q.trim() !== "" && filtered.length !== rows.length;

  const handleOpenChange = (o: boolean) => {
    if (!o) setQ("");
    onOpenChange(o);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        resizable={false}
        className="p-0 gap-0 overflow-hidden flex flex-col w-[96vw] sm:max-w-[1400px] h-[90dvh] max-h-[90dvh] [&_[data-slot=dialog-close]]:text-white [&_[data-slot=dialog-close]]:opacity-90 [&_[data-slot=dialog-close]]:hover:opacity-100 [&_[data-slot=dialog-maximize]]:text-white [&_[data-slot=dialog-maximize]]:opacity-90 [&_[data-slot=dialog-maximize]]:hover:opacity-100"
      >
        {/* Cabeçalho — faixa azul padrão FC */}
        <DialogHeader className="shrink-0 space-y-0 text-left px-6 py-5 bg-gradient-to-r from-[#1B2A4A] to-[#2c3f63] text-white">
          <div className="flex items-start gap-3 pr-20">
            <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
              <Icon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-white text-lg md:text-xl font-bold leading-tight">{title}</DialogTitle>
              {subtitle && <DialogDescription className="text-white/70 text-sm mt-0.5">{subtitle}</DialogDescription>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-4">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium tabular-nums">
              {isFiltered ? `${filtered.length} de ${rows.length}` : rows.length} {rows.length === 1 ? "item" : "itens"}
            </span>
            {totalAll != null && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold tabular-nums">
                Total {formatBRL(isFiltered ? (totalFiltered || 0) : totalAll)}
              </span>
            )}
          </div>
        </DialogHeader>

        {/* Barra de busca */}
        {searchable && rows.length > 0 && (
          <div className="shrink-0 px-6 py-3 border-b border-slate-200 bg-slate-50/70 flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar nos resultados…"
                className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
              />
            </div>
            {isFiltered && <span className="text-xs text-slate-500 tabular-nums">{filtered.length} resultado(s)</span>}
          </div>
        )}

        {/* Corpo — tabela rolável */}
        <div className="flex-1 min-h-0 px-6 py-4">
          {filtered.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <EmptyState message={q.trim() ? "Nenhum item corresponde à busca." : "Sem itens para detalhar."} />
            </div>
          ) : (
            <div className="h-full rounded-xl border border-slate-200 overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-slate-100 z-10">
                  <TableRow>
                    {columns.map((c) => (
                      <TableHead key={c.key} className={`${alignCls(c.align)} text-xs font-semibold text-slate-600 whitespace-nowrap`}>{c.label}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((row, i) => (
                    <TableRow key={i} className="text-xs odd:bg-white even:bg-slate-50/50 hover:bg-blue-50/50 transition-colors">
                      {columns.map((c) => {
                        const raw = row[c.key];
                        const content = c.format
                          ? c.format(raw, row)
                          : c.brl ? formatBRL(Number(raw) || 0)
                          : (raw ?? "—");
                        return (
                          <TableCell key={c.key} className={`${alignCls(c.align)} ${c.brl ? "tabular-nums" : ""} ${c.className || ""}`}>
                            {content}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
                {totalFiltered != null && (
                  <TableFooter className="sticky bottom-0">
                    <TableRow>
                      {columns.map((c, idx) => (
                        <TableCell key={c.key} className={`${alignCls(c.align)} font-bold text-xs tabular-nums`}>
                          {idx === 0 ? `Total · ${filtered.length} item(ns)` : c.key === totalKey ? formatBRL(totalFiltered) : ""}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
            </div>
          )}
        </div>

        {/* Rodapé destacado */}
        {onGoTo && (
          <DialogFooter className="shrink-0 border-t border-slate-200 bg-gray-50 px-6 py-4 sm:justify-end">
            <button
              onClick={onGoTo}
              className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-700 transition shadow-sm"
            >
              <ExternalLink className="w-4 h-4" /> {goLabel}
            </button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ───────────────────── Tabela comparativa mês×mês + ano×ano ─────────────────
 * Para cada mês: valor do ano atual, do ano anterior, Δ a/a (vs mesmo mês),
 * Δ m/m (vs mês anterior do ano atual). Linha de TOTAL no rodapé.
 * `goodWhen` colore as setas (custos: down=bom; receitas: up=bom). */
export function ComparativoAnual({
  title, subtitle, serieAtual, seriePrev, anoAtual, anoPrev,
  goodWhen = "down", valorLabel = "Valor", onOpenMes,
}: {
  title: string;
  subtitle?: string;
  serieAtual: number[];   // 12 posições
  seriePrev: number[];    // 12 posições
  anoAtual: number;
  anoPrev: number;
  goodWhen?: "up" | "down";
  valorLabel?: string;
  onOpenMes?: (mesIndex: number) => void;
}) {
  const totAtual = serieAtual.reduce((s, v) => s + (Number(v) || 0), 0);
  const totPrev = seriePrev.reduce((s, v) => s + (Number(v) || 0), 0);
  const pctAno = variacaoPct(totAtual, totPrev);
  return (
    <Card className="p-4 border-slate-200">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-slate-800 text-sm md:text-base">{title}</h3>
          {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
        </div>
        <DeltaBadge curr={totAtual} prev={totPrev} goodWhen={goodWhen} />
      </div>

      {/* KPIs de variação anual */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="rounded-lg bg-slate-50 px-3 py-2">
          <p className="text-[11px] text-slate-500">Total {anoPrev}</p>
          <p className="text-sm md:text-base font-bold text-slate-600 tabular-nums">{formatBRL(totPrev)}</p>
        </div>
        <div className="rounded-lg bg-violet-50 border border-violet-200 px-3 py-2">
          <p className="text-[11px] text-violet-600 font-semibold">Total {anoAtual}</p>
          <p className="text-sm md:text-base font-bold text-violet-900 tabular-nums">{formatBRL(totAtual)}</p>
        </div>
        <div className="rounded-lg bg-slate-50 px-3 py-2">
          <p className="text-[11px] text-slate-500">Variação a/a</p>
          <p className="text-sm md:text-base font-bold tabular-nums">
            {pctAno == null ? "—" : pctAno === Infinity ? "novo" : formatPct(pctAno)}
          </p>
        </div>
      </div>

      <div className="max-h-[420px] overflow-auto rounded-lg border border-slate-200">
        <Table>
          <TableHeader className="sticky top-0 bg-slate-50 z-10">
            <TableRow>
              <TableHead className="text-xs font-semibold">Mês</TableHead>
              <TableHead className="text-right text-xs font-semibold text-slate-500">{anoPrev}</TableHead>
              <TableHead className="text-right text-xs font-bold text-violet-700 bg-violet-50">{anoAtual}</TableHead>
              <TableHead className="text-right text-xs font-semibold">Δ a/a</TableHead>
              <TableHead className="text-right text-xs font-semibold">Δ m/m</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {MESES_ABREV.map((mes, i) => {
              const cur = Number(serieAtual[i]) || 0;
              const prev = Number(seriePrev[i]) || 0;
              const mesAnt = i > 0 ? (Number(serieAtual[i - 1]) || 0) : null;
              const clicavel = !!onOpenMes && (cur > 0 || prev > 0);
              return (
                <TableRow
                  key={mes}
                  className={`text-xs ${clicavel ? "cursor-pointer hover:bg-slate-50" : ""}`}
                  onClick={clicavel ? () => onOpenMes!(i) : undefined}
                >
                  <TableCell className="font-medium text-slate-700">{mes}</TableCell>
                  <TableCell className="text-right tabular-nums text-slate-400">{prev ? formatBRL(prev) : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold text-violet-900 bg-violet-50/60">{cur ? formatBRL(cur) : "—"}</TableCell>
                  <TableCell className="text-right">
                    {cur === 0 && prev === 0 ? <span className="text-slate-300">—</span> : <DeltaBadge curr={cur} prev={prev} goodWhen={goodWhen} size="xs" />}
                  </TableCell>
                  <TableCell className="text-right">
                    {mesAnt == null || (cur === 0 && mesAnt === 0) ? <span className="text-slate-300">—</span> : <DeltaBadge curr={cur} prev={mesAnt} goodWhen={goodWhen} size="xs" />}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
          <TableFooter className="sticky bottom-0">
            <TableRow>
              <TableCell className="font-bold text-xs">Total {valorLabel}</TableCell>
              <TableCell className="text-right font-bold text-xs tabular-nums text-slate-500">{formatBRL(totPrev)}</TableCell>
              <TableCell className="text-right font-bold text-xs tabular-nums text-violet-900 bg-violet-50">{formatBRL(totAtual)}</TableCell>
              <TableCell className="text-right" colSpan={2}>
                <DeltaBadge curr={totAtual} prev={totPrev} goodWhen={goodWhen} size="xs" />
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>
      {onOpenMes && <p className="text-[11px] text-slate-400 mt-2">Clique num mês para ver os lançamentos.</p>}
    </Card>
  );
}
