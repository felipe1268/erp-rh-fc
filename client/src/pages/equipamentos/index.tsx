import DashboardLayout from "@/components/DashboardLayout";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import {
  HardHat, Package, Truck, AlertTriangle, ChevronRight,
  Clock, TrendingDown, Building2, CalendarClock, Layers,
  CircleDollarSign, ArrowUpRight, Boxes,
} from "lucide-react";
import { fmtDate, fmtMoney } from "./_shared";
import { useMemo, useState } from "react";

function diasAte(iso?: string | null): number | null {
  if (!iso) return null;
  const t = String(iso).slice(0, 10);
  const d = new Date(t + "T00:00:00");
  if (Number.isNaN(d.getTime())) return null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - hoje.getTime()) / 86400000);
}

function urgenciaTheme(dias: number | null) {
  if (dias == null) return { bg: "bg-slate-100", text: "text-slate-600", ring: "ring-slate-200", bar: "bg-slate-400", label: "—" };
  if (dias < 0) return { bg: "bg-red-100", text: "text-red-700", ring: "ring-red-200", bar: "bg-red-500", label: `Vencido há ${Math.abs(dias)}d` };
  if (dias <= 7) return { bg: "bg-red-100", text: "text-red-700", ring: "ring-red-200", bar: "bg-red-500", label: `${dias}d` };
  if (dias <= 15) return { bg: "bg-orange-100", text: "text-orange-700", ring: "ring-orange-200", bar: "bg-orange-500", label: `${dias}d` };
  if (dias <= 30) return { bg: "bg-amber-100", text: "text-amber-700", ring: "ring-amber-200", bar: "bg-amber-500", label: `${dias}d` };
  return { bg: "bg-emerald-100", text: "text-emerald-700", ring: "ring-emerald-200", bar: "bg-emerald-500", label: `${dias}d` };
}

export default function EquipamentosHub() {
  const { selectedCompany } = useCompany();
  const companyId = Number(selectedCompany?.id) || 0;
  const [expandido, setExpandido] = useState(false);

  const proprios = trpc.equipamentos.propriosListar.useQuery({ companyId }, { enabled: !!companyId });
  const locados = trpc.equipamentos.locadosListar.useQuery({ companyId }, { enabled: !!companyId });
  const vencendo = trpc.equipamentos.locadosListar.useQuery(
    { companyId, vencendoEmDias: 30 },
    { enabled: !!companyId }
  );

  const propriosArr: any[] = proprios.data || [];
  const locadosArr: any[] = locados.data || [];
  const emUso = locadosArr.filter(l => l.status === "em_uso").length;
  const devolvidos = locadosArr.filter(l => l.status === "devolvido").length;
  const emObraProprios = propriosArr.filter(p => p.status === "em_obra").length;

  // Agrupa vencendo por (descricao + obra + fornecedor + fim) → mata o ruído
  // visual de 100s linhas idênticas.
  const grupos = useMemo(() => {
    const arr: any[] = vencendo.data || [];
    const map = new Map<string, any>();
    for (const l of arr) {
      const fim = String(l.dataFimPrevista || "").slice(0, 10);
      const key = `${l.descricao || ""}|${l.obraNome || ""}|${l.fornecedorNome || ""}|${fim}`;
      const g = map.get(key);
      if (g) {
        g.qtd += 1;
        g.valorTotal += Number(l.valorMensal) || 0;
        g.inicios.push(l.dataInicio);
        if (!g.fotoUrl && l.fotoUrl) g.fotoUrl = l.fotoUrl;
      } else {
        map.set(key, {
          key,
          descricao: l.descricao || "—",
          categoria: l.categoria || null,
          obraNome: l.obraNome || "—",
          fornecedorNome: l.fornecedorNome || "—",
          fim,
          inicios: [l.dataInicio],
          qtd: 1,
          valorTotal: Number(l.valorMensal) || 0,
          fotoUrl: l.fotoUrl || null,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => {
      const da = diasAte(a.fim) ?? 9999;
      const db = diasAte(b.fim) ?? 9999;
      if (da !== db) return da - db;
      return b.valorTotal - a.valorTotal;
    });
  }, [vencendo.data]);

  const totUnid = (vencendo.data || []).length;
  const totValor = grupos.reduce((s, g) => s + g.valorTotal, 0);
  const maisUrgente = grupos[0];
  const visiveis = expandido ? grupos : grupos.slice(0, 8);

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Package className="h-6 w-6 text-blue-600" /> Controle de Equipamentos
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Rastreio unitário de equipamentos próprios e locados, com análise CAPEX vs OPEX.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Link href="/equipamentos/proprios">
            <a className="block bg-white border rounded-xl shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition overflow-hidden">
              <div className="bg-gradient-to-br from-blue-500 to-blue-700 text-white p-4 flex items-center gap-3">
                <HardHat className="h-6 w-6" />
                <div className="font-semibold text-sm">Equipamentos Próprios</div>
              </div>
              <div className="p-4">
                <div className="flex items-end justify-between">
                  <div>
                    <div className="text-3xl font-bold text-slate-900 tabular-nums">{propriosArr.length.toLocaleString("pt-BR")}</div>
                    <div className="text-xs text-slate-500 mt-1">unidades cadastradas</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-slate-500">Em obra</div>
                    <div className="text-lg font-semibold text-blue-700 tabular-nums">{emObraProprios.toLocaleString("pt-BR")}</div>
                  </div>
                </div>
                {propriosArr.length > 0 && (
                  <div className="mt-3 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full bg-blue-500" style={{ width: `${Math.min(100, (emObraProprios / propriosArr.length) * 100)}%` }} />
                  </div>
                )}
                <div className="flex items-center justify-end mt-3 text-blue-600 text-xs font-medium">Abrir <ChevronRight className="h-3 w-3" /></div>
              </div>
            </a>
          </Link>
          <Link href="/equipamentos/locados">
            <a className="block bg-white border rounded-xl shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition overflow-hidden">
              <div className="bg-gradient-to-br from-emerald-500 to-emerald-700 text-white p-4 flex items-center gap-3">
                <Truck className="h-6 w-6" />
                <div className="font-semibold text-sm">Equipamentos Locados</div>
              </div>
              <div className="p-4">
                <div className="flex items-end justify-between">
                  <div>
                    <div className="text-3xl font-bold text-slate-900 tabular-nums">{emUso.toLocaleString("pt-BR")}</div>
                    <div className="text-xs text-slate-500 mt-1">em uso ativo</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-slate-500">Devolvidos</div>
                    <div className="text-lg font-semibold text-emerald-700 tabular-nums">{devolvidos.toLocaleString("pt-BR")}</div>
                  </div>
                </div>
                {(emUso + devolvidos) > 0 && (
                  <div className="mt-3 h-1.5 rounded-full bg-slate-100 overflow-hidden flex">
                    <div className="h-full bg-emerald-500" style={{ width: `${(emUso / (emUso + devolvidos)) * 100}%` }} />
                    <div className="h-full bg-slate-300" style={{ width: `${(devolvidos / (emUso + devolvidos)) * 100}%` }} />
                  </div>
                )}
                <div className="flex items-center justify-end mt-3 text-emerald-700 text-xs font-medium">Abrir <ChevronRight className="h-3 w-3" /></div>
              </div>
            </a>
          </Link>
          <Link href="/equipamentos/entregas">
            <a className="block bg-white border rounded-xl shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition overflow-hidden">
              <div className="bg-gradient-to-br from-violet-500 to-violet-700 text-white p-4 flex items-center gap-3">
                <Boxes className="h-6 w-6" />
                <div className="font-semibold text-sm">Entregas do Almoxarifado</div>
              </div>
              <div className="p-4">
                <p className="text-xs text-slate-500 leading-relaxed">
                  Monitore cada ferramenta que saiu do estoque: quem entregou, para qual obra e quando foi confirmado o recebimento.
                </p>
                <div className="flex items-center justify-end mt-3 text-violet-700 text-xs font-medium">Abrir <ChevronRight className="h-3 w-3" /></div>
              </div>
            </a>
          </Link>
        </div>

        {/* Seção redesenhada: Locações vencendo */}
        <section className="bg-gradient-to-br from-white via-amber-50/30 to-white border rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b bg-white/60 backdrop-blur flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-9 w-9 rounded-lg bg-amber-100 ring-1 ring-amber-200 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
              </div>
              <div className="min-w-0">
                <h2 className="font-semibold text-slate-900 text-sm">Locações vencendo em até 30 dias</h2>
                <p className="text-xs text-slate-500 truncate">Agrupado por equipamento + obra + fornecedor + data de fim — priorize as mais urgentes.</p>
              </div>
            </div>
            <Link href="/equipamentos/locados">
              <a className="shrink-0 text-xs text-blue-600 hover:text-blue-700 font-medium inline-flex items-center gap-1">
                Abrir lista <ArrowUpRight className="h-3 w-3" />
              </a>
            </Link>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-slate-100">
            <KpiTile icon={<Layers className="h-4 w-4" />} label="Unidades" value={totUnid.toLocaleString("pt-BR")} sub={`em ${grupos.length} grupos`} tone="amber" />
            <KpiTile icon={<CircleDollarSign className="h-4 w-4" />} label="Valor mensal em risco" value={fmtMoney(totValor)} sub="se não houver renovação" tone="red" />
            <KpiTile
              icon={<CalendarClock className="h-4 w-4" />}
              label="Mais urgente"
              value={maisUrgente ? (urgenciaTheme(diasAte(maisUrgente.fim)).label) : "—"}
              sub={maisUrgente ? `${maisUrgente.descricao.slice(0, 28)}${maisUrgente.descricao.length > 28 ? "…" : ""}` : ""}
              tone="red"
            />
            <KpiTile
              icon={<Building2 className="h-4 w-4" />}
              label="Obras impactadas"
              value={new Set((vencendo.data || []).map((l: any) => l.obraNome || "—")).size.toLocaleString("pt-BR")}
              sub="distintas"
              tone="blue"
            />
          </div>

          <div className="p-4">
            {vencendo.isLoading && (
              <div className="py-8 text-center text-sm text-slate-500">Carregando…</div>
            )}
            {!vencendo.isLoading && grupos.length === 0 && (
              <div className="py-10 text-center">
                <div className="inline-flex h-12 w-12 rounded-full bg-emerald-100 items-center justify-center mb-2">
                  <TrendingDown className="h-5 w-5 text-emerald-600" />
                </div>
                <div className="text-sm font-medium text-slate-800">Nenhuma locação vencendo nos próximos 30 dias.</div>
                <div className="text-xs text-slate-500 mt-1">Tudo sob controle 👌</div>
              </div>
            )}
            {grupos.length > 0 && (
              <ul className="space-y-2">
                {visiveis.map((g) => {
                  const dias = diasAte(g.fim);
                  const tema = urgenciaTheme(dias);
                  // barra: fração do período de 30d já consumida
                  const restantePct = dias == null ? 0 : Math.max(0, Math.min(100, ((30 - Math.max(0, dias)) / 30) * 100));
                  return (
                    <li key={g.key} className="group bg-white border rounded-lg p-3 hover:shadow-md hover:border-amber-300 transition flex gap-3">
                      <div className="shrink-0 h-14 w-14 rounded-md bg-slate-100 border overflow-hidden flex items-center justify-center">
                        {g.fotoUrl ? (
                          <img src={g.fotoUrl} alt={g.descricao} className="h-full w-full object-cover" loading="lazy" />
                        ) : (
                          <Package className="h-6 w-6 text-slate-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-slate-900 text-sm truncate">{g.descricao}</span>
                              {g.qtd > 1 && (
                                <span className="text-[10px] font-bold uppercase tracking-wide bg-slate-900 text-white rounded px-1.5 py-0.5">
                                  ×{g.qtd}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                              <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" />{g.obraNome}</span>
                              <span className="text-slate-300">•</span>
                              <span className="truncate">{g.fornecedorNome}</span>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <span className={`inline-flex items-center gap-1 ${tema.bg} ${tema.text} ring-1 ${tema.ring} rounded-full px-2 py-0.5 text-[11px] font-semibold`}>
                              <Clock className="h-3 w-3" />
                              {tema.label}
                            </span>
                            <div className="text-[11px] text-slate-500 mt-1">fim {fmtDate(g.fim)}</div>
                          </div>
                        </div>
                        <div className="mt-2 flex items-center gap-3">
                          <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                            <div className={`h-full ${tema.bar} transition-all`} style={{ width: `${restantePct}%` }} />
                          </div>
                          <div className="text-xs text-slate-700 tabular-nums shrink-0">
                            <span className="text-slate-400">total/mês</span>{" "}
                            <span className="font-semibold">{fmtMoney(g.valorTotal)}</span>
                            {g.qtd > 1 && <span className="text-slate-400"> ({fmtMoney(g.valorTotal / g.qtd)}/un)</span>}
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
                {grupos.length > 8 && (
                  <li>
                    <button
                      onClick={() => setExpandido(v => !v)}
                      className="w-full text-center py-2 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-md transition"
                    >
                      {expandido ? "Mostrar menos" : `Mostrar mais ${grupos.length - 8} grupo(s)`}
                    </button>
                  </li>
                )}
              </ul>
            )}
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}

function KpiTile({
  icon, label, value, sub, tone,
}: { icon: React.ReactNode; label: string; value: string; sub?: string; tone: "amber" | "red" | "blue" | "emerald" }) {
  const toneMap: Record<string, { ic: string; bg: string }> = {
    amber: { ic: "text-amber-600 bg-amber-100", bg: "bg-white" },
    red: { ic: "text-red-600 bg-red-100", bg: "bg-white" },
    blue: { ic: "text-blue-600 bg-blue-100", bg: "bg-white" },
    emerald: { ic: "text-emerald-600 bg-emerald-100", bg: "bg-white" },
  };
  const t = toneMap[tone];
  return (
    <div className={`${t.bg} px-4 py-3`}>
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-slate-500 font-medium">
        <span className={`h-5 w-5 rounded ${t.ic} flex items-center justify-center`}>{icon}</span>
        {label}
      </div>
      <div className="mt-1 text-lg font-bold text-slate-900 tabular-nums truncate">{value}</div>
      {sub && <div className="text-[11px] text-slate-500 truncate">{sub}</div>}
    </div>
  );
}
