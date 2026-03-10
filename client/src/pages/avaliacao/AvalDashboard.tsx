import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useCompany } from "@/contexts/CompanyContext";
import {
  Users, ClipboardCheck, TrendingUp, AlertTriangle, Trophy, Star,
  Medal, Flame, BookOpen, ChevronRight
} from "lucide-react";

const REC_CONFIG: Record<string, { color: string; bg: string; icon: any; label: string }> = {
  "SUGERIR DEMISSÃO": { color: "#EF4444", bg: "#FEF2F2", icon: AlertTriangle, label: "Demissão" },
  "ATENÇÃO - ACOMPANHAR": { color: "#F97316", bg: "#FFF7ED", icon: Flame, label: "Atenção" },
  "TREINAMENTO": { color: "#EAB308", bg: "#FEFCE8", icon: BookOpen, label: "Treinamento" },
  "PROMOÇÃO / PREMIAÇÃO": { color: "#22C55E", bg: "#F0FDF4", icon: Trophy, label: "Promoção" },
};

function getMediaColor(media: number): string {
  if (media < 2) return "#EF4444";
  if (media < 3) return "#F97316";
  if (media < 4) return "#EAB308";
  if (media < 5) return "#22C55E";
  return "#1e3a5f";
}

export default function AvalDashboard({ onNavigateEmployee }: { onNavigateEmployee?: (id: number) => void }) {
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery} = useCompany();
  const companyId = (selectedCompanyId && selectedCompanyId !== 'construtoras') ? parseInt(selectedCompanyId, 10) : 0;
  const companyIds = getCompanyIdsForQuery();

  const stats = trpc.avaliacao.dashboard.globalStats.useQuery({ companyId }, { enabled: companyId > 0 || companyIds.length > 0 });
  const ranking = trpc.avaliacao.dashboard.employeeRanking.useQuery({ companyId, limit: 10 }, { enabled: companyId > 0 || companyIds.length > 0 });
  const topBottom = trpc.avaliacao.dashboard.topBottomEmployees.useQuery({ companyId, limit: 5 }, { enabled: companyId > 0 || companyIds.length > 0 });

  const s = stats.data;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center"><ClipboardCheck className="w-5 h-5 text-blue-600" /></div>
              <div>
                <p className="text-2xl font-bold text-[#0F172A]">{s?.totalAvaliacoes || 0}</p>
                <p className="text-xs text-[#64748B]">Avaliações</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center"><Users className="w-5 h-5 text-green-600" /></div>
              <div>
                <p className="text-2xl font-bold text-[#0F172A]">{s?.totalAvaliadores || 0}</p>
                <p className="text-xs text-[#64748B]">Avaliadores</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center"><Star className="w-5 h-5 text-amber-600" /></div>
              <div>
                <p className="text-2xl font-bold text-[#0F172A]">{s?.mediaGeral ? Number(s.mediaGeral).toFixed(1) : "—"}</p>
                <p className="text-xs text-[#64748B]">Média Geral</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center"><TrendingUp className="w-5 h-5 text-purple-600" /></div>
              <div>
                <p className="text-2xl font-bold text-[#0F172A]">{s?.totalPesquisas || 0}</p>
                <p className="text-xs text-[#64748B]">Pesquisas</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recommendation Distribution */}
      {s?.porRecomendacao && s.porRecomendacao.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Distribuição por Recomendação</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {s.porRecomendacao.map((item: any) => {
                const rec = item.recomendacao || "Sem recomendação";
                const cfg = REC_CONFIG[rec] || { color: "#94A3B8", bg: "#F1F5F9", icon: Star, label: rec };
                const Icon = cfg.icon;
                return (
                  <div key={rec} className="flex items-center gap-3 p-3 rounded-lg" style={{ backgroundColor: cfg.bg }}>
                    <Icon className="w-5 h-5 shrink-0" style={{ color: cfg.color }} />
                    <div>
                      <p className="text-lg font-bold" style={{ color: cfg.color }}>{item.count}</p>
                      <p className="text-xs" style={{ color: cfg.color }}>{cfg.label}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Ranking */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Medal className="w-4 h-4 text-[#1e3a5f]" /> Ranking de Desempenho</CardTitle>
          </CardHeader>
          <CardContent>
            {ranking.isLoading ? (
              <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-12 bg-[#F1F5F9] rounded-lg animate-pulse" />)}</div>
            ) : ranking.data?.length === 0 ? (
              <p className="text-sm text-[#94A3B8] text-center py-6">Nenhuma avaliação ainda.</p>
            ) : (
              <div className="space-y-1.5">
                {ranking.data?.map((emp: any, idx: number) => {
                  const media = Number(emp.mediaGeral);
                  return (
                    <button key={emp.employeeId} onClick={() => onNavigateEmployee?.(emp.employeeId)}
                      className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-[#F8FAFC] transition-colors text-left">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                        style={{ backgroundColor: idx === 0 ? "#FFD700" : idx === 1 ? "#C0C0C0" : idx === 2 ? "#CD7F32" : "#E2E8F0", color: idx < 3 ? "#fff" : "#64748B" }}>
                        {idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[#0F172A] truncate">{emp.nome}</p>
                        <p className="text-xs text-[#64748B]">{emp.funcao}</p>
                      </div>
                      <span className="text-sm font-bold" style={{ color: getMediaColor(media) }}>{media.toFixed(1)}</span>
                      <ChevronRight className="w-4 h-4 text-[#94A3B8]" />
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top/Bottom Employees */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-red-500" /> Destaques e Alertas</CardTitle>
          </CardHeader>
          <CardContent>
            {topBottom.isLoading ? (
              <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-12 bg-[#F1F5F9] rounded-lg animate-pulse" />)}</div>
            ) : (
              <div className="space-y-4">
                {topBottom.data?.top && topBottom.data.top.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-green-600 uppercase tracking-wider mb-2">Melhores Desempenhos</p>
                    <div className="space-y-1">
                      {topBottom.data.top.map((emp: any) => (
                        <button key={emp.employeeId} onClick={() => onNavigateEmployee?.(emp.employeeId)}
                          className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-[#F8FAFC] transition-colors text-left">
                          <Trophy className="w-4 h-4 text-green-500 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-[#0F172A] truncate">{emp.nome}</p>
                            <p className="text-xs text-[#64748B]">{emp.funcao}</p>
                          </div>
                          <span className="text-sm font-bold text-green-600">{Number(emp.mediaGeral).toFixed(1)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {topBottom.data?.bottom && topBottom.data.bottom.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-red-500 uppercase tracking-wider mb-2">Precisam de Atenção</p>
                    <div className="space-y-1">
                      {topBottom.data.bottom.map((emp: any) => (
                        <button key={emp.employeeId} onClick={() => onNavigateEmployee?.(emp.employeeId)}
                          className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-[#F8FAFC] transition-colors text-left">
                          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-[#0F172A] truncate">{emp.nome}</p>
                            <p className="text-xs text-[#64748B]">{emp.funcao}</p>
                          </div>
                          <span className="text-sm font-bold text-red-500">{Number(emp.mediaGeral).toFixed(1)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
