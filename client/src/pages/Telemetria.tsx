import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import {
  BarChart3, Users, Clock, Eye, ArrowLeft, Search, Brain, Activity,
  TrendingUp, AlertTriangle, Monitor, MousePointerClick, ChevronDown, ChevronUp,
  Download, User, Calendar,
} from "lucide-react";
import { useState, useMemo } from "react";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/_core/hooks/useAuth";

type Periodo = "7d" | "30d" | "90d" | "all";

const PERIODO_LABELS: Record<Periodo, string> = {
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
  "90d": "Últimos 90 dias",
  "all": "Todo período",
};

function formatDuracao(segundos: number): string {
  if (segundos < 60) return `${Math.round(segundos)}s`;
  if (segundos < 3600) return `${Math.round(segundos / 60)}min`;
  const h = Math.floor(segundos / 3600);
  const m = Math.round((segundos % 3600) / 60);
  return `${h}h ${m}min`;
}

function formatDate(d: string | Date): string {
  if (!d) return "-";
  if (typeof d === "string" && /^\d{2}\/\d{2}\/\d{2}/.test(d)) return d;
  const date = new Date(d);
  if (isNaN(date.getTime())) return String(d);
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "America/Sao_Paulo" });
}

function formatDateTime(d: string | Date): string {
  if (!d) return "-";
  if (typeof d === "string" && /^\d{2}\/\d{2}\/\d{2},\s\d{2}:\d{2}$/.test(d)) return d;
  const date = new Date(d);
  if (isNaN(date.getTime())) return String(d);
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
  });
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 70 ? "bg-green-500" : score >= 40 ? "bg-yellow-500" : "bg-red-500";
  const label = score >= 70 ? "Engajado" : score >= 40 ? "Moderado" : "Baixo";
  return (
    <div className="flex items-center gap-2 min-w-[160px]">
      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-medium w-8 text-right">{Math.round(score)}</span>
      <Badge variant="outline" className={`text-xs ${score >= 70 ? 'text-green-700 border-green-300' : score >= 40 ? 'text-yellow-700 border-yellow-300' : 'text-red-700 border-red-300'}`}>
        {label}
      </Badge>
    </div>
  );
}

function HorizontalBar({ value, max, label, color = "bg-blue-500" }: { value: number; max: number; label: string; color?: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="text-sm text-gray-600 w-48 truncate" title={label}>{label}</span>
      <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm font-semibold w-12 text-right">{value}</span>
    </div>
  );
}

function SimpleBarChart({ data, labelKey, valueKey, color = "bg-blue-500" }: {
  data: any[]; labelKey: string; valueKey: string; color?: string;
}) {
  if (!data?.length) return <p className="text-sm text-gray-400 py-4">Sem dados</p>;
  const max = Math.max(...data.map(d => Number(d[valueKey] ?? 0)));
  return (
    <div className="space-y-1">
      {data.map((d, i) => (
        <HorizontalBar key={i} value={Number(d[valueKey])} max={max} label={String(d[labelKey])} color={color} />
      ))}
    </div>
  );
}

function DailyChart({ data, onDayClick, selectedDay }: { data: Array<{ dia: string; total: string | number }>; onDayClick?: (dia: string) => void; selectedDay?: string | null }) {
  if (!data?.length) return <p className="text-sm text-gray-400 py-4">Sem dados</p>;
  const max = Math.max(...data.map(d => Number(d.total)));
  return (
    <div className="flex items-end gap-1 h-40 overflow-x-auto pb-6 relative">
      {data.map((d, i) => {
        const h = max > 0 ? (Number(d.total) / max) * 100 : 0;
        const isoDay = typeof d.dia === "string" && d.dia.length >= 10 ? d.dia.substring(0, 10) : d.dia;
        const isSelected = selectedDay && isoDay === selectedDay;
        return (
          <div key={i} className={`flex flex-col items-center min-w-[20px] flex-1 group relative ${onDayClick ? "cursor-pointer" : ""}`}
            onClick={() => onDayClick?.(String(isoDay))}>
            <div className="absolute -top-5 text-xs font-medium text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity">
              {Number(d.total)}
            </div>
            <div className={`w-full rounded-t transition-all ${isSelected ? "bg-blue-700 ring-2 ring-blue-400" : "bg-blue-500 hover:bg-blue-600"}`} style={{ height: `${h}%`, minHeight: h > 0 ? 4 : 0 }} />
            <span className={`text-[9px] mt-1 rotate-45 origin-left whitespace-nowrap absolute -bottom-5 ${isSelected ? "text-blue-700 font-bold" : "text-gray-400"}`}>
              {formatDate(d.dia)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function HourChart({ data, companyId, periodo }: { data: Array<{ hora: number; total: string | number }>; companyId?: number; periodo?: string }) {
  const [selectedHour, setSelectedHour] = useState<number | null>(null);
  const hours = Array.from({ length: 24 }, (_, i) => {
    const found = data?.find(d => Number(d.hora) === i);
    return { hora: i, total: Number(found?.total ?? 0) };
  });
  const max = Math.max(...hours.map(h => h.total));

  const usuariosQ = trpc.telemetria.getUsuariosPorHora.useQuery(
    { companyId: companyId ?? 0, hora: selectedHour ?? 0, periodo },
    { enabled: selectedHour !== null && (companyId ?? 0) > 0 }
  );

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-1 h-32">
        {hours.map((h) => {
          const pct = max > 0 ? (h.total / max) * 100 : 0;
          const isSelected = selectedHour === h.hora;
          return (
            <div key={h.hora} className="flex flex-col items-center flex-1 group relative cursor-pointer" onClick={() => setSelectedHour(isSelected ? null : h.hora)}>
              <div className="absolute -top-5 text-xs font-medium text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity">
                {h.total}
              </div>
              <div className={`w-full rounded-t transition-all ${isSelected ? "bg-purple-700 ring-2 ring-purple-400" : "bg-purple-500 hover:bg-purple-600"}`} style={{ height: `${pct}%`, minHeight: pct > 0 ? 4 : 0 }} />
              <span className={`text-[9px] mt-1 ${isSelected ? "text-purple-700 font-bold" : "text-gray-400"}`}>{h.hora}h</span>
            </div>
          );
        })}
      </div>
      {selectedHour !== null && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-purple-700">Usuários ativos às {selectedHour}h</span>
            <button onClick={() => setSelectedHour(null)} className="text-xs text-gray-400 hover:text-gray-600">Fechar</button>
          </div>
          {usuariosQ.isLoading ? (
            <p className="text-xs text-gray-400">Carregando...</p>
          ) : (usuariosQ.data?.length ?? 0) === 0 ? (
            <p className="text-xs text-gray-400">Nenhum usuário registrado neste horário.</p>
          ) : (
            <div className="space-y-1">
              {(usuariosQ.data ?? []).map((u: any) => (
                <div key={u.user_id} className="flex items-center justify-between text-xs bg-white rounded px-2 py-1.5 border border-purple-100">
                  <div className="flex items-center gap-1.5">
                    <User className="h-3 w-3 text-purple-500" />
                    <span className="text-gray-800 font-medium">{u.user_name || `Usuário #${u.user_id}`}</span>
                  </div>
                  <span className="text-gray-400">{Number(u.total)} acessos</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const DIAS_SEMANA_CORES = ["bg-red-400", "bg-blue-500", "bg-blue-500", "bg-blue-500", "bg-blue-500", "bg-blue-500", "bg-orange-400"];

function WeekdayChart({ data }: { data: Array<{ dia_semana: number; total: string | number }> }) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const found = data?.find(d => Number(d.dia_semana) === i);
    return { dia: i, total: Number(found?.total ?? 0) };
  });
  const max = Math.max(...days.map(d => d.total), 1);
  return (
    <div className="flex items-end gap-2 h-32">
      {days.map((d) => {
        const pct = max > 0 ? (d.total / max) * 100 : 0;
        return (
          <div key={d.dia} className="flex flex-col items-center flex-1 group relative">
            <div className="absolute -top-5 text-xs font-medium text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity">
              {d.total}
            </div>
            <div className={`w-full rounded-t transition-all hover:opacity-80 ${DIAS_SEMANA_CORES[d.dia]}`} style={{ height: `${pct}%`, minHeight: pct > 0 ? 4 : 0 }} />
            <span className={`text-[10px] mt-1 font-medium ${d.dia === 0 || d.dia === 6 ? "text-red-400" : "text-gray-500"}`}>{DIAS_SEMANA[d.dia]}</span>
          </div>
        );
      })}
    </div>
  );
}

function DayDetailPanel({ companyId, dia, userId, onClose }: { companyId: number; dia: string; userId?: number; onClose: () => void }) {
  const { data, isLoading, isError, refetch } = trpc.telemetria.detalheDia.useQuery(
    { companyId, dia, userId },
    { enabled: companyId > 0 }
  );
  const [activeSection, setActiveSection] = useState<"paginas" | "usuarios" | "timeline">("paginas");
  const [filterUser, setFilterUser] = useState<number | null>(null);

  const diaFmt = (() => {
    const [y, m, d] = dia.split("-");
    const dt = new Date(Number(y), Number(m) - 1, Number(d));
    const dias = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
    return `${dias[dt.getDay()]}, ${d}/${m}/${y}`;
  })();

  const totalVisitas = data?.porPagina?.reduce((s: number, p: any) => s + Number(p.total_visitas), 0) ?? 0;
  const totalTempo = data?.porPagina?.reduce((s: number, p: any) => s + Number(p.tempo_total), 0) ?? 0;
  const totalUsuarios = data?.porUsuario?.length ?? 0;
  const totalPaginas = data?.porPagina?.length ?? 0;

  const filteredTimeline = filterUser
    ? (data?.timeline ?? []).filter((t: any) => Number(t.user_id) === filterUser)
    : (data?.timeline ?? []);

  return (
    <Card className="border-blue-300 ring-1 ring-blue-200">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Calendar className="h-4 w-4 text-blue-600" />
            Detalhes do dia — {diaFmt}
          </CardTitle>
          <button onClick={onClose} className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded hover:bg-gray-100">Fechar</button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8"><div className="animate-spin h-6 w-6 border-3 border-blue-500 border-t-transparent rounded-full" /></div>
        ) : isError ? (
          <div className="text-center py-6">
            <p className="text-sm text-red-500 mb-2">Erro ao carregar dados deste dia.</p>
            <button onClick={() => refetch()} className="text-xs text-blue-600 hover:underline">Tentar novamente</button>
          </div>
        ) : !data || totalVisitas === 0 ? (
          <p className="text-sm text-gray-400 py-4">Nenhum acesso registrado neste dia.</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-3">
              <div className="bg-blue-50 rounded-lg p-3 text-center">
                <p className="text-xl font-bold text-blue-700">{totalVisitas}</p>
                <p className="text-[10px] text-blue-600 uppercase">Visitas</p>
              </div>
              <div className="bg-green-50 rounded-lg p-3 text-center">
                <p className="text-xl font-bold text-green-700">{totalUsuarios}</p>
                <p className="text-[10px] text-green-600 uppercase">Usuários</p>
              </div>
              <div className="bg-purple-50 rounded-lg p-3 text-center">
                <p className="text-xl font-bold text-purple-700">{totalPaginas}</p>
                <p className="text-[10px] text-purple-600 uppercase">Telas</p>
              </div>
              <div className="bg-orange-50 rounded-lg p-3 text-center">
                <p className="text-xl font-bold text-orange-700">{formatDuracao(totalTempo)}</p>
                <p className="text-[10px] text-orange-600 uppercase">Tempo Total</p>
              </div>
            </div>

            <div className="flex gap-1 border-b">
              {([
                { key: "paginas", label: "Telas Visitadas", icon: Monitor },
                { key: "usuarios", label: "Por Usuário", icon: Users },
                { key: "timeline", label: "Timeline", icon: Clock },
              ] as const).map(tab => (
                <button key={tab.key}
                  className={`px-3 py-2 text-xs font-medium flex items-center gap-1 border-b-2 transition-colors ${activeSection === tab.key ? "border-blue-600 text-blue-700" : "border-transparent text-gray-500 hover:text-gray-700"}`}
                  onClick={() => setActiveSection(tab.key)}>
                  <tab.icon className="h-3 w-3" /> {tab.label}
                </button>
              ))}
            </div>

            {activeSection === "paginas" && (
              <div className="space-y-1 max-h-[400px] overflow-y-auto">
                <div className="grid grid-cols-[1fr_80px_80px_80px_80px] gap-2 text-[10px] text-gray-500 uppercase font-semibold px-2 py-1 border-b sticky top-0 bg-white">
                  <span>Tela</span>
                  <span className="text-center">Visitas</span>
                  <span className="text-center">Usuários</span>
                  <span className="text-center">T. Total</span>
                  <span className="text-center">T. Médio</span>
                </div>
                {(data.porPagina ?? []).map((p: any, i: number) => {
                  const maxTempo = Math.max(...(data.porPagina ?? []).map((x: any) => Number(x.tempo_total)));
                  const pct = maxTempo > 0 ? (Number(p.tempo_total) / maxTempo) * 100 : 0;
                  return (
                    <div key={i} className="grid grid-cols-[1fr_80px_80px_80px_80px] gap-2 items-center px-2 py-2 rounded hover:bg-blue-50/50 text-sm relative group">
                      <div className="absolute inset-y-0 left-0 bg-blue-100/40 rounded" style={{ width: `${pct}%` }} />
                      <span className="relative font-medium text-gray-800 truncate" title={p.pagina}>{p.pagina}</span>
                      <span className="relative text-center text-gray-600">{Number(p.total_visitas)}</span>
                      <span className="relative text-center text-gray-600">{Number(p.usuarios_unicos)}</span>
                      <span className="relative text-center font-medium text-blue-700">{formatDuracao(Number(p.tempo_total))}</span>
                      <span className="relative text-center text-gray-500">{formatDuracao(Number(p.tempo_medio))}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {activeSection === "usuarios" && (
              <div className="space-y-1 max-h-[400px] overflow-y-auto">
                <div className="grid grid-cols-[1fr_60px_60px_60px_80px_60px_60px] gap-2 text-[10px] text-gray-500 uppercase font-semibold px-2 py-1 border-b sticky top-0 bg-white">
                  <span>Usuário</span>
                  <span className="text-center">Visitas</span>
                  <span className="text-center">Ações</span>
                  <span className="text-center">Telas</span>
                  <span className="text-center">Tempo</span>
                  <span className="text-center">Entrou</span>
                  <span className="text-center">Saiu</span>
                </div>
                {(data.porUsuario ?? []).map((u: any) => (
                  <div key={u.user_id} className="grid grid-cols-[1fr_60px_60px_60px_80px_60px_60px] gap-2 items-center px-2 py-2 rounded hover:bg-green-50/50 text-sm cursor-pointer"
                    onClick={() => { setFilterUser(Number(u.user_id)); setActiveSection("timeline"); }}>
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded-full bg-blue-100 flex items-center justify-center text-[10px] font-bold text-blue-700 shrink-0">
                        {(u.user_name || "?").charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium text-gray-800 truncate">{u.user_name}</span>
                    </div>
                    <span className="text-center text-gray-600">{Number(u.total_paginas)}</span>
                    <span className="text-center text-gray-600">{Number(u.total_acoes)}</span>
                    <span className="text-center text-gray-600">{Number(u.paginas_distintas)}</span>
                    <span className="text-center font-medium text-blue-700">{formatDuracao(Number(u.tempo_total))}</span>
                    <span className="text-center text-green-600 text-xs">{u.primeiro_acesso}</span>
                    <span className="text-center text-red-500 text-xs">{u.ultimo_acesso}</span>
                  </div>
                ))}
              </div>
            )}

            {activeSection === "timeline" && (
              <div className="space-y-2">
                {filterUser && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-gray-500">Filtrando por:</span>
                    <Badge className="bg-blue-100 text-blue-700">{filteredTimeline[0]?.user_name || `#${filterUser}`}</Badge>
                    <button onClick={() => setFilterUser(null)} className="text-gray-400 hover:text-gray-600 underline">Limpar filtro</button>
                  </div>
                )}
                <div className="max-h-[400px] overflow-y-auto space-y-0.5">
                  {filteredTimeline.map((t: any, i: number) => (
                    <div key={i} className={`flex items-center gap-3 px-2 py-1.5 rounded text-xs ${t.tipo === "action" ? "bg-amber-50/50" : "hover:bg-gray-50"}`}>
                      <span className="text-gray-400 font-mono w-16 shrink-0">{t.horario}</span>
                      <div className={`h-2 w-2 rounded-full shrink-0 ${t.tipo === "action" ? "bg-amber-500" : "bg-blue-500"}`} />
                      {!filterUser && (
                        <span className="text-gray-500 font-medium w-28 truncate shrink-0 cursor-pointer hover:text-blue-600"
                          onClick={() => setFilterUser(Number(t.user_id))}>
                          {t.user_name}
                        </span>
                      )}
                      <span className="text-gray-800 flex-1 truncate">
                        {t.tipo === "action" ? <><span className="text-amber-700 font-medium">{t.acao}</span> <span className="text-gray-400">em</span> {t.pagina}</> : t.pagina}
                      </span>
                      {t.tipo === "page_visit" && Number(t.duracao_segundos) > 0 && (
                        <span className="text-blue-600 font-medium shrink-0">{formatDuracao(Number(t.duracao_segundos))}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function KPICard({ icon: Icon, label, value, sub, color = "text-blue-600" }: {
  icon: any; label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-lg bg-gray-50 ${color}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
            <p className="text-2xl font-bold">{value}</p>
            {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PerfilUsuario({ userId, companyId, periodo, onBack }: {
  userId: number; companyId: number; periodo: Periodo; onBack: () => void;
}) {
  const { data, isLoading } = trpc.telemetria.perfilUsuario.useQuery(
    { companyId, userId, periodo },
    { enabled: companyId > 0 }
  );

  if (isLoading) return <div className="flex justify-center p-8"><div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" /></div>;
  if (!data?.info) return <p className="text-gray-400 p-8">Nenhum dado encontrado para este usuário.</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-1" /> Voltar</Button>
        <h2 className="text-xl font-bold">{data.info.user_name}</h2>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard icon={Eye} label="Páginas Visitadas" value={Number(data.info.total_paginas)} color="text-blue-600" />
        <KPICard icon={MousePointerClick} label="Ações Realizadas" value={Number(data.info.total_acoes)} color="text-green-600" />
        <KPICard icon={Monitor} label="Páginas Únicas" value={Number(data.info.paginas_distintas)} color="text-purple-600" />
        <KPICard icon={Clock} label="Tempo Total" value={formatDuracao(Number(data.info.tempo_total))} color="text-orange-600" />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Páginas Mais Acessadas</CardTitle></CardHeader>
          <CardContent><SimpleBarChart data={data.paginas} labelKey="pagina" valueKey="total" /></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Ações Mais Frequentes</CardTitle></CardHeader>
          <CardContent><SimpleBarChart data={data.acoes} labelKey="acao" valueKey="total" color="bg-green-500" /></CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Uso por Dia</CardTitle></CardHeader>
          <CardContent><DailyChart data={data.porDia} /></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Uso por Hora</CardTitle></CardHeader>
          <CardContent><HourChart data={data.porHora} companyId={companyId} periodo={periodo} /></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Info</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><span className="text-gray-500">Primeiro acesso:</span> <strong>{formatDateTime(data.info.primeiro_acesso)}</strong></div>
            <div><span className="text-gray-500">Último acesso:</span> <strong>{formatDateTime(data.info.ultimo_acesso)}</strong></div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function Telemetria() {
  const { user } = useAuth();
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId
    ? parseInt(selectedCompanyId, 10) : 0;
  const [periodo, setPeriodo] = useState<Periodo>("30d");
  const [activeTab, setActiveTab] = useState("plataforma");
  const [selectedUser, setSelectedUser] = useState<number | null>(null);
  const [searchFilter, setSearchFilter] = useState("");
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const dashQuery = trpc.telemetria.dashboardGeral.useQuery(
    { companyId, periodo },
    { enabled: companyId > 0 && activeTab === "plataforma" && !selectedUser }
  );
  const scoreQuery = trpc.telemetria.scoreEngajamento.useQuery(
    { companyId },
    { enabled: companyId > 0 && activeTab === "plataforma" && !selectedUser }
  );
  const iaQuery = trpc.telemetria.analyticsIA.useQuery(
    { companyId, periodo },
    { enabled: companyId > 0 && activeTab === "ia" }
  );

  const dash = dashQuery.data;
  const scores = scoreQuery.data ?? [];
  const ia = iaQuery.data;

  if (user?.role !== "admin_master") {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <p className="text-gray-500">Acesso restrito a Admin Master.</p>
        </div>
      </DashboardLayout>
    );
  }

  const toggleRow = (id: number) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const MODULE_LABELS_MAP: Record<string, string> = {
    planejamento: "Planejamento", orcamento: "Orçamento", compras: "Compras",
    rh: "RH/DP", financeiro: "Financeiro", sst: "SST", medicao: "Medição",
    "rh-dp": "RH/DP", juridico: "Jurídico", terceiros: "Terceiros",
    parceiros: "Parceiros", almoxarifado: "Almoxarifado",
    "gestao-documentos": "Gestão Documentos",
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Activity className="h-6 w-6 text-blue-600" />
              Telemetria & Analytics
            </h1>
            <p className="text-sm text-gray-500 mt-1">Monitoramento completo de uso da plataforma</p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={periodo} onValueChange={(v) => setPeriodo(v as Periodo)}>
              <SelectTrigger className="w-44">
                <Calendar className="h-4 w-4 mr-1" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PERIODO_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setSelectedUser(null); }}>
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="plataforma" className="flex items-center gap-1">
              <Monitor className="h-4 w-4" /> Uso da Plataforma
            </TabsTrigger>
            <TabsTrigger value="ia" className="flex items-center gap-1">
              <Brain className="h-4 w-4" /> Analytics da IA
            </TabsTrigger>
          </TabsList>

          <TabsContent value="plataforma" className="space-y-4 mt-4">
            {selectedUser ? (
              <PerfilUsuario userId={selectedUser} companyId={companyId} periodo={periodo} onBack={() => setSelectedUser(null)} />
            ) : dashQuery.isLoading ? (
              <div className="flex justify-center p-12"><div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" /></div>
            ) : dash && dash.totalAcessos === 0 ? (
              <div className="text-center py-20">
                <Monitor className="w-16 h-16 mx-auto text-gray-200 mb-4" />
                <h3 className="text-lg font-semibold text-gray-500 mb-2">Nenhum dado de uso registrado</h3>
                <p className="text-sm text-gray-400 max-w-md mx-auto">Quando os usuários navegarem pela plataforma, as estatísticas de uso aparecerão aqui automaticamente.</p>
              </div>
            ) : dash ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <KPICard icon={Eye} label="Total de Acessos" value={dash.totalAcessos.toLocaleString("pt-BR")} color="text-blue-600" />
                  <KPICard icon={Users} label="Usuários Ativos" value={dash.usuariosAtivos} color="text-green-600" />
                  <KPICard icon={Clock} label="Tempo Médio/Página" value={formatDuracao(dash.tempoMedio)} color="text-purple-600" />
                  <KPICard icon={AlertTriangle} label="Usuários Inativos (7d+)" value={dash.usuariosInativos.length} color="text-red-600" />
                </div>

                <div className="grid md:grid-cols-3 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-1">
                        <TrendingUp className="h-4 w-4" /> Evolução Diária
                        <span className="text-[10px] text-gray-400 font-normal ml-1">(clique em um dia para ver detalhes)</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <DailyChart data={dash.usoPorDia} selectedDay={selectedDay}
                        onDayClick={(d) => setSelectedDay(prev => prev === d ? null : d)} />
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1"><Clock className="h-4 w-4" /> Uso por Hora</CardTitle></CardHeader>
                    <CardContent><HourChart data={dash.usoPorHora} companyId={companyId} periodo={periodo} /></CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1"><Calendar className="h-4 w-4" /> Uso por Dia da Semana</CardTitle></CardHeader>
                    <CardContent><WeekdayChart data={dash.usoPorDiaSemana ?? []} /></CardContent>
                  </Card>
                </div>

                {selectedDay && (
                  <DayDetailPanel companyId={companyId} dia={selectedDay} onClose={() => setSelectedDay(null)} />
                )}

                <div className="grid md:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">Páginas Mais Acessadas (Top 15)</CardTitle></CardHeader>
                    <CardContent>
                      <div className="space-y-1 max-h-[400px] overflow-y-auto">
                        <div className="grid grid-cols-[1fr_60px_80px] gap-2 text-[10px] text-gray-500 uppercase font-semibold px-1 pb-1 border-b">
                          <span>Tela</span>
                          <span className="text-center">Visitas</span>
                          <span className="text-center">T. Médio</span>
                        </div>
                        {dash.paginasMaisAcessadas.slice(0, 15).map((p: any, i: number) => {
                          const maxVal = Number(dash.paginasMaisAcessadas[0]?.total ?? 1);
                          const pct = maxVal > 0 ? (Number(p.total) / maxVal) * 100 : 0;
                          return (
                            <div key={i} className="grid grid-cols-[1fr_60px_80px] gap-2 items-center py-1.5 px-1 rounded hover:bg-blue-50/50 text-sm relative">
                              <div className="absolute inset-y-0 left-0 bg-blue-100/30 rounded" style={{ width: `${pct}%` }} />
                              <span className="relative text-gray-700 truncate" title={p.pagina}>{p.pagina}</span>
                              <span className="relative text-center text-gray-600 font-medium">{Number(p.total)}</span>
                              <span className="relative text-center text-blue-600 text-xs">{Number(p.tempo_medio) > 0 ? formatDuracao(Number(p.tempo_medio)) : "—"}</span>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">Uso por Módulo</CardTitle></CardHeader>
                    <CardContent>
                      <SimpleBarChart
                        data={(dash.usoPorModulo ?? []).map((m: any) => ({ ...m, modulo: MODULE_LABELS_MAP[m.modulo] || m.modulo }))}
                        labelKey="modulo" valueKey="total" color="bg-indigo-500"
                      />
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-1"><Users className="h-4 w-4" /> Score de Engajamento (últimos 30 dias)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {scores.length === 0 ? (
                      <p className="text-sm text-gray-400 py-4">Sem dados de engajamento ainda.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b text-left text-gray-500">
                              <th className="py-2 pr-4">Usuário</th>
                              <th className="py-2 pr-2 text-center">Dias Ativos</th>
                              <th className="py-2 pr-2 text-center">Visitas</th>
                              <th className="py-2 pr-2 text-center">Ações</th>
                              <th className="py-2 pr-2 text-center">Págs. Únicas</th>
                              <th className="py-2 pr-2 text-center">Tempo</th>
                              <th className="py-2">Score</th>
                              <th className="py-2"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {scores.map((s: any) => (
                              <tr key={s.user_id} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedUser(Number(s.user_id))}>
                                <td className="py-2 pr-4 font-medium">{s.user_name}</td>
                                <td className="py-2 pr-2 text-center">{Number(s.dias_ativos)}</td>
                                <td className="py-2 pr-2 text-center">{Number(s.visitas)}</td>
                                <td className="py-2 pr-2 text-center">{Number(s.acoes)}</td>
                                <td className="py-2 pr-2 text-center">{Number(s.paginas_unicas)}</td>
                                <td className="py-2 pr-2 text-center">{formatDuracao(Number(s.tempo_total))}</td>
                                <td className="py-2"><ScoreBar score={Number(s.score)} /></td>
                                <td className="py-2"><Button variant="ghost" size="sm"><Eye className="h-3 w-3" /></Button></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-1"><Users className="h-4 w-4" /> Ranking de Usuários</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-left text-gray-500">
                            <th className="py-2 pr-4">#</th>
                            <th className="py-2 pr-4">Usuário</th>
                            <th className="py-2 pr-2 text-center">Visitas</th>
                            <th className="py-2 pr-2 text-center">Ações</th>
                            <th className="py-2 pr-2 text-center">Págs. Únicas</th>
                            <th className="py-2 pr-2 text-center">Tempo Total</th>
                            <th className="py-2">Último Acesso</th>
                            <th className="py-2"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {(dash.rankingUsuarios ?? []).map((u: any, i: number) => (
                            <tr key={u.user_id} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedUser(Number(u.user_id))}>
                              <td className="py-2 pr-4 font-bold text-gray-400">{i + 1}</td>
                              <td className="py-2 pr-4 font-medium">{u.user_name}</td>
                              <td className="py-2 pr-2 text-center">{Number(u.total_paginas)}</td>
                              <td className="py-2 pr-2 text-center">{Number(u.total_acoes)}</td>
                              <td className="py-2 pr-2 text-center">{Number(u.paginas_distintas)}</td>
                              <td className="py-2 pr-2 text-center">{formatDuracao(Number(u.tempo_total))}</td>
                              <td className="py-2 text-gray-500">{formatDateTime(u.ultimo_acesso)}</td>
                              <td className="py-2"><Button variant="ghost" size="sm"><Eye className="h-3 w-3" /></Button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>

                {dash.paginasSemAcesso.length > 0 && (
                  <Card className="border-red-200">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-1 text-red-600">
                        <AlertTriangle className="h-4 w-4" /> Funcionalidades Pouco Usadas (sem acesso há 30+ dias)
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {dash.paginasSemAcesso.map((p: any, i: number) => (
                          <div key={i} className="flex items-center justify-between p-2 bg-red-50 rounded text-sm">
                            <span className="font-medium">{p.pagina}</span>
                            <span className="text-gray-500">Último acesso: {formatDate(p.ultimo_acesso)} ({Number(p.total_historico)} acessos totais)</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {dash.usuariosInativos.length > 0 && (
                  <Card className="border-orange-200">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-1 text-orange-600">
                        <AlertTriangle className="h-4 w-4" /> Usuários Inativos (7+ dias sem acesso)
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                        {dash.usuariosInativos.map((u: any) => (
                          <div key={u.user_id} className="flex items-center gap-2 p-2 bg-orange-50 rounded text-sm cursor-pointer hover:bg-orange-100"
                            onClick={() => setSelectedUser(Number(u.user_id))}>
                            <User className="h-4 w-4 text-orange-500" />
                            <div>
                              <p className="font-medium">{u.user_name}</p>
                              <p className="text-xs text-gray-500">Último: {formatDateTime(u.ultimo_acesso)} | {Number(u.total_acessos)} acessos</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            ) : null}
          </TabsContent>

          <TabsContent value="ia" className="space-y-4 mt-4">
            {iaQuery.isLoading ? (
              <div className="flex justify-center p-12"><div className="animate-spin h-8 w-8 border-4 border-purple-500 border-t-transparent rounded-full" /></div>
            ) : ia && ia.totalConsultas === 0 ? (
              <div className="text-center py-20">
                <Brain className="w-16 h-16 mx-auto text-gray-200 mb-4" />
                <h3 className="text-lg font-semibold text-gray-500 mb-2">Nenhuma conversa com a IA registrada</h3>
                <p className="text-sm text-gray-400 max-w-md mx-auto">Quando os usuários utilizarem o assistente de IA nos módulos, as estatísticas aparecerão aqui automaticamente.</p>
              </div>
            ) : ia ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <KPICard icon={Brain} label="Total de Conversas" value={ia.totalConsultas.toLocaleString("pt-BR")} color="text-purple-600" />
                  <KPICard icon={Users} label="Usuários Únicos" value={ia.porUsuario.length} color="text-green-600" />
                  <KPICard icon={BarChart3} label="Módulos Utilizados" value={ia.porModulo.length} color="text-blue-600" />
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">Evolução Diária</CardTitle></CardHeader>
                    <CardContent><DailyChart data={ia.porDia} /></CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">Uso por Módulo da IA</CardTitle></CardHeader>
                    <CardContent>
                      <SimpleBarChart
                        data={(ia.porModulo ?? []).map((m: any) => ({ ...m, modulo: MODULE_LABELS_MAP[m.modulo] || m.modulo }))}
                        labelKey="modulo" valueKey="total" color="bg-purple-500"
                      />
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Ranking de Uso da IA</CardTitle></CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-left text-gray-500">
                            <th className="py-2 pr-4">#</th>
                            <th className="py-2 pr-4">Usuário</th>
                            <th className="py-2 pr-2 text-center">Consultas</th>
                            <th className="py-2">Último Uso</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ia.porUsuario.map((u: any, i: number) => (
                            <tr key={u.user_id} className="border-b hover:bg-gray-50">
                              <td className="py-2 pr-4 font-bold text-gray-400">{i + 1}</td>
                              <td className="py-2 pr-4 font-medium">{u.user_name}</td>
                              <td className="py-2 pr-2 text-center font-semibold">{Number(u.total)}</td>
                              <td className="py-2 text-gray-500">{formatDateTime(u.ultimo_uso)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm">Histórico de Conversas com a IA</CardTitle>
                      <div className="relative w-64">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <Input
                          placeholder="Buscar nas perguntas..."
                          value={searchFilter}
                          onChange={(e) => setSearchFilter(e.target.value)}
                          className="pl-8 h-8 text-sm"
                        />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-0 max-h-[500px] overflow-y-auto">
                      {(ia.ultimasPerguntas ?? [])
                        .filter((p: any) => !searchFilter || p.pergunta?.toLowerCase().includes(searchFilter.toLowerCase()) || p.user_name?.toLowerCase().includes(searchFilter.toLowerCase()))
                        .map((p: any) => (
                        <div key={p.id} className="border-b py-2">
                          <div className="flex items-center justify-between cursor-pointer" onClick={() => toggleRow(p.id)}>
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <Badge variant="outline" className="text-xs shrink-0">
                                {MODULE_LABELS_MAP[p.modulo] || p.modulo}
                              </Badge>
                              <span className="text-sm font-medium truncate">{p.user_name}</span>
                              <span className="text-xs text-gray-400 shrink-0">{p.criado_em_fmt || formatDateTime(p.criado_em)}</span>
                            </div>
                            {expandedRows.has(p.id) ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                          </div>
                          <p className="text-sm text-gray-600 mt-1 truncate">{p.pergunta}</p>
                          {expandedRows.has(p.id) && (
                            <div className="mt-2 p-3 bg-gray-50 rounded text-sm">
                              <p className="font-medium text-gray-500 mb-1">Pergunta:</p>
                              <p className="mb-3 whitespace-pre-wrap">{p.pergunta}</p>
                              <p className="font-medium text-gray-500 mb-1">Resposta:</p>
                              <p className="whitespace-pre-wrap text-gray-700">{p.resposta}</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : null}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
