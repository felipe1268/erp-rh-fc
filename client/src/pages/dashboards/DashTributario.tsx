import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Receipt, BarChart3, Scale, AlertTriangle, FileText, DollarSign, Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

const TRIBUTO_LABELS: Record<string, string> = {
  icms: "ICMS", iss: "ISS", iptu: "IPTU", irpj: "IRPJ", csll: "CSLL",
  pis: "PIS", cofins: "COFINS", ipi: "IPI", inss: "INSS", fgts: "FGTS",
  itbi: "ITBI", itcmd: "ITCMD", taxa: "Taxa", contribuicao: "Contribuição", outros: "Outros",
};

const STATUS_LABELS: Record<string, string> = {
  em_andamento: "Em Andamento", aguardando_julgamento: "Aguardando Julgamento",
  recurso_administrativo: "Recurso Administrativo", recurso: "Recurso Judicial",
  execucao_fiscal: "Execução Fiscal", sentenca: "Sentença",
  acordo: "Acordo", arquivado: "Arquivado", encerrado: "Encerrado",
};

const RISCO_CONFIG: Record<string, { label: string; dot: string; text: string; bg: string }> = {
  critico: { label: "Crítico", dot: "bg-red-500", text: "text-red-700", bg: "bg-red-50" },
  alto: { label: "Alto", dot: "bg-orange-500", text: "text-orange-700", bg: "bg-orange-50" },
  medio: { label: "Médio", dot: "bg-amber-500", text: "text-amber-700", bg: "bg-amber-50" },
  baixo: { label: "Baixo", dot: "bg-green-500", text: "text-green-700", bg: "bg-green-50" },
};

export default function DashTributario() {
  const [, navigate] = useLocation();
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) || undefined : undefined;
  const companyIds = getCompanyIdsForQuery();
  const queryCompanyId = isConstrutoras ? (companyIds[0] || 0) : (companyId || 0);
  const hasValidCompany = isConstrutoras ? companyIds.length > 0 : (!!companyId && companyId > 0);

  const { data: stats, isLoading } = trpc.processosTributarios.estatisticas.useQuery(
    { companyId: queryCompanyId, ...(isConstrutoras ? { companyIds } : {}) },
    { enabled: hasValidCompany }
  );

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-teal-100 to-teal-200 flex items-center justify-center shadow-sm">
              <BarChart3 className="h-5 w-5 text-teal-700" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Dashboard Tributário</h1>
              <p className="text-muted-foreground text-xs">Análise detalhada dos processos tributários</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("/painel/tributario")}>
              <Receipt className="h-3.5 w-3.5 mr-1" /> Painel
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate("/processos-tributarios")}>
              <FileText className="h-3.5 w-3.5 mr-1" /> Processos
            </Button>
          </div>
        </div>

        {!hasValidCompany ? (
          <Card><CardContent className="flex flex-col items-center justify-center py-16">
            <Receipt className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Selecione uma empresa</h3>
            <p className="text-muted-foreground text-sm">Selecione uma empresa para visualizar o dashboard.</p>
          </CardContent></Card>
        ) : isLoading ? (
          <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
        ) : !stats ? (
          <div className="text-center py-16 text-muted-foreground">Nenhum dado disponível.</div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <Card><CardContent className="p-4 text-center">
                <div className="text-xs text-muted-foreground mb-1">Total</div>
                <div className="text-2xl font-bold">{stats.total}</div>
              </CardContent></Card>
              <Card><CardContent className="p-4 text-center">
                <div className="text-xs text-muted-foreground mb-1">Ativos</div>
                <div className="text-2xl font-bold text-blue-600">{stats.emAndamento}</div>
              </CardContent></Card>
              <Card><CardContent className="p-4 text-center">
                <div className="text-xs text-muted-foreground mb-1">Encerrados</div>
                <div className="text-2xl font-bold text-green-600">{stats.encerrados}</div>
              </CardContent></Card>
              <Card><CardContent className="p-4 text-center">
                <div className="text-xs text-muted-foreground mb-1">Valor em Causa</div>
                <div className="text-lg font-bold text-red-600">{fmtBRL(stats.totalValorCausa)}</div>
              </CardContent></Card>
              <Card><CardContent className="p-4 text-center">
                <div className="text-xs text-muted-foreground mb-1">Valor Pago</div>
                <div className="text-lg font-bold text-amber-600">{fmtBRL(stats.totalValorPago)}</div>
              </CardContent></Card>
              <Card><CardContent className="p-4 text-center">
                <div className="text-xs text-muted-foreground mb-1">Autos Infração</div>
                <div className="text-lg font-bold text-purple-600">{fmtBRL(stats.totalAutoInfracao)}</div>
              </CardContent></Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1.5"><AlertTriangle className="h-4 w-4 text-teal-500" /> Por Risco</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {(["critico", "alto", "medio", "baixo"] as const).map(risco => {
                    const count = stats.porRisco[risco] || 0;
                    const cfg = RISCO_CONFIG[risco];
                    const pct = stats.emAndamento > 0 ? Math.round((count / stats.emAndamento) * 100) : 0;
                    return (
                      <div key={risco}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-1.5">
                            <div className={`h-2.5 w-2.5 rounded-full ${cfg.dot}`} />
                            <span className="text-sm">{cfg.label}</span>
                          </div>
                          <span className={`text-sm font-bold ${cfg.text}`}>{count}</span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full ${cfg.dot} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1.5"><Scale className="h-4 w-4 text-teal-500" /> Por Status</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {Object.entries(stats.porStatus || {}).sort((a, b) => b[1] - a[1]).map(([status, count]) => (
                    <div key={status} className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">{STATUS_LABELS[status] || status}</span>
                      <span className="text-sm font-bold">{count}</span>
                    </div>
                  ))}
                  {Object.keys(stats.porStatus || {}).length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Sem dados</p>}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1.5"><DollarSign className="h-4 w-4 text-teal-500" /> Por Tributo</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {Object.entries(stats.porTributo || {}).sort((a, b) => b[1] - a[1]).map(([tributo, count]) => (
                    <div key={tributo} className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">{TRIBUTO_LABELS[tributo] || tributo}</span>
                      <span className="text-sm font-bold">{count}</span>
                    </div>
                  ))}
                  {Object.keys(stats.porTributo || {}).length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Sem dados</p>}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
