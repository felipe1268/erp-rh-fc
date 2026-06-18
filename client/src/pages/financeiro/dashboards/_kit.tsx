import { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import {
  RefreshCw, ChevronLeft, ChevronRight, ArrowUpRight, ArrowUp, ArrowDown, Minus,
  ExternalLink, LucideIcon,
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
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500 truncate">{label}</p>
          <p className="text-xl md:text-2xl font-bold text-slate-900 mt-1 tabular-nums truncate">{value}</p>
          {sub && <p className="text-xs text-slate-400 mt-0.5 truncate">{sub}</p>}
        </div>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${tones[tone]}`}>
          <Icon className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} />
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
          <h3 className="font-semibold text-slate-800 text-sm md:text-base truncate">{title}</h3>
          {subtitle && <p className="text-xs text-slate-400 truncate">{subtitle}</p>}
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
      <div style={{ width: "100%", height }}>{children}</div>
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
  open, onOpenChange, title, subtitle, columns, rows, totalKey, onGoTo, goLabel = "Abrir tela operacional",
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
}) {
  const total = totalKey != null
    ? rows.reduce((s, r) => s + (Number(r[totalKey]) || 0), 0)
    : null;
  const alignCls = (a?: string) => (a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {subtitle && <DialogDescription>{subtitle}</DialogDescription>}
        </DialogHeader>
        <div className="max-h-[62vh] overflow-auto rounded-lg border border-slate-200">
          {rows.length === 0 ? (
            <div className="py-16"><EmptyState message="Sem itens para detalhar." /></div>
          ) : (
            <Table>
              <TableHeader className="sticky top-0 bg-slate-50 z-10">
                <TableRow>
                  {columns.map((c) => (
                    <TableHead key={c.key} className={`${alignCls(c.align)} text-xs font-semibold`}>{c.label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, i) => (
                  <TableRow key={i} className="text-xs">
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
              {total != null && (
                <TableFooter className="sticky bottom-0">
                  <TableRow>
                    {columns.map((c, idx) => (
                      <TableCell key={c.key} className={`${alignCls(c.align)} font-bold text-xs tabular-nums`}>
                        {idx === 0 ? `Total · ${rows.length} item(ns)` : c.key === totalKey ? formatBRL(total) : ""}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          )}
        </div>
        {onGoTo && (
          <DialogFooter>
            <button
              onClick={onGoTo}
              className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-700 transition"
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
          <p className="text-[11px] text-slate-500">Total {anoAtual}</p>
          <p className="text-sm md:text-base font-bold text-slate-900 tabular-nums">{formatBRL(totAtual)}</p>
        </div>
        <div className="rounded-lg bg-slate-50 px-3 py-2">
          <p className="text-[11px] text-slate-500">Total {anoPrev}</p>
          <p className="text-sm md:text-base font-bold text-slate-600 tabular-nums">{formatBRL(totPrev)}</p>
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
              <TableHead className="text-right text-xs font-semibold">{anoPrev}</TableHead>
              <TableHead className="text-right text-xs font-semibold">{anoAtual}</TableHead>
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
                  <TableCell className="text-right tabular-nums text-slate-500">{prev ? formatBRL(prev) : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums text-slate-900">{cur ? formatBRL(cur) : "—"}</TableCell>
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
              <TableCell className="text-right font-bold text-xs tabular-nums">{formatBRL(totPrev)}</TableCell>
              <TableCell className="text-right font-bold text-xs tabular-nums">{formatBRL(totAtual)}</TableCell>
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
