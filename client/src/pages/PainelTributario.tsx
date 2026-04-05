import { useMemo } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import PrintFooterLGPD from "@/components/PrintFooterLGPD";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import {
  Scale, AlertTriangle, BarChart3, DollarSign, FileText,
  ShieldAlert, Receipt, Loader2,
} from "lucide-react";
import { useLocation } from "wouter";
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
  acordo: "Acordo/Parcelamento", arquivado: "Arquivado", encerrado: "Encerrado",
};

const RISCO_CONFIG: Record<string, { label: string; dot: string; text: string }> = {
  critico: { label: "Crítico", dot: "bg-red-500", text: "text-red-700" },
  alto: { label: "Alto", dot: "bg-orange-500", text: "text-orange-700" },
  medio: { label: "Médio", dot: "bg-amber-500", text: "text-amber-700" },
  baixo: { label: "Baixo", dot: "bg-green-500", text: "text-green-700" },
};

function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  const parts = d.split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return d;
}

function formatBRL(val: string | null | undefined): string {
  if (!val) return "—";
  const clean = val.replace(/R\$\s*/g, "").trim();
  let num: number;
  if (clean.includes(",")) num = parseFloat(clean.replace(/\./g, "").replace(",", "."));
  else num = parseFloat(clean);
  if (isNaN(num)) return val;
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function PainelTributario() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) || undefined : undefined;
  const companyIds = getCompanyIdsForQuery();
  const queryCompanyId = isConstrutoras ? (companyIds[0] || 0) : (companyId || 0);
  const hasValidCompany = isConstrutoras ? companyIds.length > 0 : (!!companyId && companyId > 0);

  const { data: stats, isLoading: statsLoading } = trpc.processosTributarios.estatisticas.useQuery(
    { companyId: queryCompanyId, ...(isConstrutoras ? { companyIds } : {}) },
    { enabled: hasValidCompany }
  );

  const { data: processos, isLoading: processosLoading } = trpc.processosTributarios.listar.useQuery(
    { companyId: queryCompanyId, ...(isConstrutoras ? { companyIds } : {}) },
    { enabled: hasValidCompany }
  );

  const isLoading = statsLoading || processosLoading;

  const processosRecentes = useMemo(() => {
    if (!processos) return [];
    return [...processos].sort((a, b) => {
      const da = String(a.updatedAt || a.createdAt || "");
      const db2 = String(b.updatedAt || b.createdAt || "");
      return db2.localeCompare(da);
    }).slice(0, 5);
  }, [processos]);

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-teal-100 to-teal-200 flex items-center justify-center shadow-sm">
                <Receipt className="h-5 w-5 text-teal-700" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">Painel Tributário</h1>
                <p className="text-muted-foreground text-xs">Gestão de Processos Tributários e Fiscais</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => navigate("/processos-tributarios")}>
              <Receipt className="h-3.5 w-3.5" /> Processos
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => navigate("/dashboards/tributario")}>
              <BarChart3 className="h-3.5 w-3.5" /> Dashboard
            </Button>
          </div>
        </div>

        {!hasValidCompany ? (
          <Card className="bg-card border-border">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Receipt className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Selecione uma empresa</h3>
              <p className="text-muted-foreground text-sm text-center max-w-md">Selecione uma empresa no seletor acima para visualizar o painel tributário.</p>
            </CardContent>
          </Card>
        ) : isLoading ? (
          <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
        ) : !stats ? (
          <div className="text-center py-16 text-muted-foreground">Nenhum dado disponível.</div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <Card className="cursor-pointer hover:shadow-md" onClick={() => navigate("/processos-tributarios")}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Receipt className="h-4 w-4 text-teal-500" />
                    <span className="text-xs text-muted-foreground">Total de Processos</span>
                  </div>
                  <div className="text-2xl font-bold">{stats.total}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    <span className="text-xs text-muted-foreground">Ativos</span>
                  </div>
                  <div className="text-2xl font-bold text-amber-600">{stats.emAndamento}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <FileText className="h-4 w-4 text-green-500" />
                    <span className="text-xs text-muted-foreground">Encerrados</span>
                  </div>
                  <div className="text-2xl font-bold text-green-600">{stats.encerrados}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <ShieldAlert className="h-4 w-4 text-red-500" />
                    <span className="text-xs text-muted-foreground">Valor em Causa</span>
                  </div>
                  <div className="text-lg font-bold text-red-600">{fmtBRL(stats.totalValorCausa)}</div>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Card>
                <CardHeader className="pb-2 pt-3 px-4">
                  <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
                    <Scale className="h-3.5 w-3.5 text-teal-500" />
                    Nível de Risco
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-3 space-y-2">
                  {(["critico", "alto", "medio", "baixo"] as const).map(risco => {
                    const count = stats.porRisco[risco] || 0;
                    const cfg = RISCO_CONFIG[risco];
                    return (
                      <div key={risco} className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <div className={`h-2.5 w-2.5 rounded-full ${cfg.dot}`} />
                          <span className="text-sm text-muted-foreground">{cfg.label}</span>
                        </div>
                        <span className={`text-sm font-bold ${cfg.text}`}>{count}</span>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2 pt-3 px-4">
                  <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
                    <DollarSign className="h-3.5 w-3.5 text-teal-500" />
                    Por Tipo de Tributo
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-3 space-y-2">
                  {Object.entries(stats.porTributo || {}).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([tributo, count]) => (
                    <div key={tributo} className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">{TRIBUTO_LABELS[tributo] || tributo}</span>
                      <span className="text-sm font-bold">{count}</span>
                    </div>
                  ))}
                  {Object.keys(stats.porTributo || {}).length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">Nenhum processo cadastrado</p>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="pb-2 pt-3 px-4">
                <CardTitle className="text-xs font-semibold">Processos Recentes</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                {processosRecentes.length === 0 ? (
                  <div className="text-center py-8">
                    <Receipt className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Nenhum processo tributário cadastrado</p>
                    <Button size="sm" variant="outline" className="mt-2" onClick={() => navigate("/processos-tributarios")}>
                      Cadastrar Processo
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {processosRecentes.map((p) => (
                      <div key={p.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/30 hover:bg-muted/50 cursor-pointer" onClick={() => navigate("/processos-tributarios")}>
                        <div>
                          <span className="text-sm font-mono font-semibold">{p.numeroProcesso}</span>
                          <span className="text-xs text-muted-foreground ml-2">{p.contribuinte}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs px-2 py-0.5 rounded-full bg-teal-100 text-teal-700">{TRIBUTO_LABELS[p.tipoTributo] || p.tipoTributo}</span>
                          <span className="text-xs text-muted-foreground">{formatBRL(p.valorCausa)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
      <PrintFooterLGPD />
    </DashboardLayout>
  );
}
