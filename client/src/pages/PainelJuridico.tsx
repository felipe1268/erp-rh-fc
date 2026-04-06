import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import PrintFooterLGPD from "@/components/PrintFooterLGPD";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import {
  Scale, Gavel, ChevronRight, Receipt, BookOpen, Loader2,
  AlertTriangle, ShieldAlert, FileText,
} from "lucide-react";
import { useLocation } from "wouter";
import { useCompany } from "@/contexts/CompanyContext";

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

export default function PainelJuridico() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) || undefined : undefined;
  const companyIds = getCompanyIdsForQuery();
  const queryCompanyId = isConstrutoras ? (companyIds[0] || 0) : (companyId || 0);
  const hasValidCompany = isConstrutoras ? companyIds.length > 0 : (!!companyId && companyId > 0);

  const { data: dashTrab, isLoading: loadTrab } = trpc.dashboards.juridico.useQuery(
    { companyId: queryCompanyId, ...(isConstrutoras ? { companyIds } : {}) },
    { enabled: hasValidCompany }
  );
  const { data: dashTrib, isLoading: loadTrib } = trpc.dashboards.tributario.useQuery(
    { companyId: queryCompanyId, ...(isConstrutoras ? { companyIds } : {}) },
    { enabled: hasValidCompany }
  );
  const { data: dashCiv, isLoading: loadCiv } = trpc.dashboards.civil.useQuery(
    { companyId: queryCompanyId, ...(isConstrutoras ? { companyIds } : {}) },
    { enabled: hasValidCompany }
  );

  const isLoading = loadTrab || loadTrib || loadCiv;

  const submodulos = [
    {
      title: "Trabalhista",
      subtitle: "Processos Trabalhistas, DataJud, Audiências",
      icon: Gavel,
      from: "#1B2A4A", to: "#D4A843", glow: "rgba(212,168,67,0.30)",
      panelPath: "/painel/juridico-trabalhista",
      listPath: "/processos-trabalhistas",
      data: dashTrab,
    },
    {
      title: "Tributário",
      subtitle: "Processos Tributários e Fiscais",
      icon: Receipt,
      from: "#0D9488", to: "#14B8A6", glow: "rgba(20,184,166,0.30)",
      panelPath: "/painel/tributario",
      listPath: "/processos-tributarios",
      data: dashTrib,
    },
    {
      title: "Civil",
      subtitle: "Processos Cíveis",
      icon: BookOpen,
      from: "#4F46E5", to: "#6366F1", glow: "rgba(99,102,241,0.30)",
      panelPath: "/painel/civil",
      listPath: "/processos-civis",
      data: dashCiv,
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-amber-100 to-amber-200 flex items-center justify-center shadow-sm">
                <Scale className="h-5 w-5 text-amber-700" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">Painel Jurídico</h1>
                <p className="text-muted-foreground text-xs">Gestão Jurídica — Trabalhista, Tributário e Civil</p>
              </div>
            </div>
          </div>
        </div>

        {!hasValidCompany ? (
          <Card className="bg-card border-border">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Scale className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Selecione uma empresa</h3>
              <p className="text-muted-foreground text-sm text-center max-w-md">Selecione uma empresa no seletor acima para visualizar o painel jurídico.</p>
            </CardContent>
          </Card>
        ) : isLoading ? (
          <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            <div>
              <h2 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Sub-módulos</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {submodulos.map((sub) => (
                  <button
                    key={sub.title}
                    onClick={() => navigate(sub.panelPath)}
                    className="group relative overflow-hidden rounded-xl border border-border/60 bg-card p-5 text-left transition-all hover:shadow-lg hover:scale-[1.02] cursor-pointer"
                  >
                    <div className="absolute inset-0 opacity-[0.07] rounded-xl" style={{ background: `linear-gradient(135deg, ${sub.from}, ${sub.to})` }} />
                    <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full opacity-20 blur-2xl transition-opacity group-hover:opacity-40" style={{ background: sub.glow }} />
                    <div className="relative">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="h-11 w-11 rounded-xl flex items-center justify-center shadow-sm" style={{ background: `linear-gradient(135deg, ${sub.from}, ${sub.to})` }}>
                          <sub.icon className="h-5 w-5 text-white" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-foreground">{sub.title}</h3>
                          <p className="text-[10px] text-muted-foreground">{sub.subtitle}</p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>

                      {sub.data?.resumo && (
                        <div className="grid grid-cols-2 gap-2 mt-2">
                          <div className="bg-muted/40 rounded-lg p-2">
                            <div className="flex items-center gap-1 mb-0.5">
                              <FileText className="h-3 w-3 text-muted-foreground" />
                              <span className="text-[9px] text-muted-foreground">Total</span>
                            </div>
                            <span className="text-lg font-bold">{sub.data.resumo.totalProcessos}</span>
                          </div>
                          <div className="bg-muted/40 rounded-lg p-2">
                            <div className="flex items-center gap-1 mb-0.5">
                              <AlertTriangle className="h-3 w-3 text-amber-500" />
                              <span className="text-[9px] text-muted-foreground">Ativos</span>
                            </div>
                            <span className="text-lg font-bold text-amber-600">{sub.data.resumo.processosAtivos}</span>
                          </div>
                          <div className="bg-muted/40 rounded-lg p-2">
                            <div className="flex items-center gap-1 mb-0.5">
                              <ShieldAlert className="h-3 w-3 text-red-500" />
                              <span className="text-[9px] text-muted-foreground">Em Risco</span>
                            </div>
                            <span className="text-sm font-bold text-red-600">{fmtBRL(sub.data.resumo.valorEmRisco)}</span>
                          </div>
                          <div className="bg-muted/40 rounded-lg p-2">
                            <div className="flex items-center gap-1 mb-0.5">
                              <Scale className="h-3 w-3 text-green-500" />
                              <span className="text-[9px] text-muted-foreground">Encerrados</span>
                            </div>
                            <span className="text-lg font-bold text-green-600">{sub.data.resumo.processosEncerrados}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h2 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Resumo Consolidado</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {(() => {
                  const totalProcessos = (dashTrab?.resumo.totalProcessos || 0) + (dashTrib?.resumo.totalProcessos || 0) + (dashCiv?.resumo.totalProcessos || 0);
                  const totalAtivos = (dashTrab?.resumo.processosAtivos || 0) + (dashTrib?.resumo.processosAtivos || 0) + (dashCiv?.resumo.processosAtivos || 0);
                  const totalEncerrados = (dashTrab?.resumo.processosEncerrados || 0) + (dashTrib?.resumo.processosEncerrados || 0) + (dashCiv?.resumo.processosEncerrados || 0);
                  const totalRisco = (dashTrab?.resumo.valorEmRisco || 0) + (dashTrib?.resumo.valorEmRisco || 0) + (dashCiv?.resumo.valorEmRisco || 0);
                  return [
                    { label: "Total de Processos", value: totalProcessos.toString(), icon: Scale, color: "text-blue-600", bg: "bg-blue-50" },
                    { label: "Processos Ativos", value: totalAtivos.toString(), icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50" },
                    { label: "Encerrados", value: totalEncerrados.toString(), icon: FileText, color: "text-green-600", bg: "bg-green-50" },
                    { label: "Valor em Risco Total", value: fmtBRL(totalRisco), icon: ShieldAlert, color: "text-red-600", bg: "bg-red-50" },
                  ];
                })().map((kpi) => (
                  <Card key={kpi.label}>
                    <CardContent className="p-3">
                      <div className="flex items-center gap-2">
                        <div className={`h-8 w-8 rounded-lg ${kpi.bg} flex items-center justify-center`}>
                          <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
                        </div>
                        <div>
                          <p className={`text-lg font-bold ${kpi.color}`}>{kpi.value}</p>
                          <p className="text-[9px] text-muted-foreground">{kpi.label}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
      <PrintFooterLGPD />
    </DashboardLayout>
  );
}
