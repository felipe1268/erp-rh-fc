import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import {
  ClipboardList, CheckSquare, Blocks, AlertTriangle, Camera,
  LayoutDashboard, Plus, ArrowRight, CloudRain,
  Loader2, ShieldCheck, ClipboardCheck,
  HardHat,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";

const submodulos = [
  {
    id: "rdo",
    titulo: "RDO",
    subtitulo: "Relatório Diário...",
    icon: ClipboardList,
    accentFrom: "#F59E0B",
    accentTo: "#D97706",
    path: "/operacional/rdo",
  },
  {
    id: "fotos",
    titulo: "Fotos",
    subtitulo: "Registro Fotogr...",
    icon: Camera,
    accentFrom: "#8B5CF6",
    accentTo: "#7C3AED",
    path: "/operacional/fotos",
  },
  {
    id: "concretagem",
    titulo: "Concretagem",
    subtitulo: "Controle de Con...",
    icon: Blocks,
    accentFrom: "#3B82F6",
    accentTo: "#2563EB",
    path: "/operacional/concretagem",
  },
  {
    id: "nc",
    titulo: "Não Conform.",
    subtitulo: "Controle de NCs",
    icon: AlertTriangle,
    accentFrom: "#EF4444",
    accentTo: "#DC2626",
    path: "/operacional/nc",
  },
  {
    id: "checklists",
    titulo: "Checklists",
    subtitulo: "Qualidade",
    icon: ClipboardCheck,
    accentFrom: "#10B981",
    accentTo: "#059669",
    path: "/operacional/checklists",
  },
  {
    id: "liberacao",
    titulo: "Liberação",
    subtitulo: "Liberação de Se...",
    icon: ShieldCheck,
    accentFrom: "#0EA5E9",
    accentTo: "#0284C7",
    path: "/operacional/liberacao-servicos",
  },
  {
    id: "clima",
    titulo: "Clima",
    subtitulo: "Condições Clim...",
    icon: CloudRain,
    accentFrom: "#6366F1",
    accentTo: "#4F46E5",
    path: "/operacional/rdo",
  },
];

export default function PainelOperacional() {
  const { companyId } = useCompany();
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const [filtroStatus, setFiltroStatus] = useState<string>("Em_Andamento");
  const todasObras = trpc.obras.list.useQuery({ companyId }, { enabled: !!companyId });
  const obrasFiltradas = (todasObras.data as any[])?.filter((o: any) =>
    filtroStatus === "todas" ? true : o.status === filtroStatus
  ) || [];
  const [obraId, setObraId] = useState<number | null>(null);
  const selectedObraId = obraId || obrasFiltradas[0]?.id;

  const dashboard = trpc.operacional.dashboardOperacional.useQuery(
    { companyId, obraId: selectedObraId! },
    { enabled: !!companyId && !!selectedObraId },
  );
  const criarRDO = trpc.operacional.criarRDO.useMutation({
    onSuccess: (data) => {
      setLocation(`/operacional/rdo?obra=${selectedObraId}&id=${data.id}`);
    },
  });

  const d = dashboard.data;
  const hoje = new Date().toISOString().split("T")[0];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
            <HardHat className="h-7 w-7 text-amber-500" />
            Painel Operacional
          </h1>
          <p className="text-sm text-gray-500">Visão consolidada da obra</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filtroStatus} onValueChange={(v) => { setFiltroStatus(v); setObraId(null); }}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Em_Andamento">Em andamento</SelectItem>
              <SelectItem value="Concluida">Concluídas</SelectItem>
              <SelectItem value="Paralisada">Paralisadas</SelectItem>
              <SelectItem value="todas">Todas</SelectItem>
            </SelectContent>
          </Select>
          <Select value={String(selectedObraId || "")} onValueChange={(v) => setObraId(Number(v))}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Selecione a obra" />
            </SelectTrigger>
            <SelectContent>
              {obrasFiltradas.map((o: any) => (
                <SelectItem key={o.id} value={String(o.id)}>{o.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        {submodulos.map((mod) => (
          <div
            key={mod.id}
            onClick={() => setLocation(selectedObraId ? `${mod.path}?obra=${selectedObraId}` : mod.path)}
            className="group relative flex flex-col items-center justify-center text-center rounded-2xl p-3 cursor-pointer transition-all duration-200 hover:scale-[1.04] select-none"
            style={{
              width: '115px',
              minHeight: '96px',
              background: `linear-gradient(145deg, ${mod.accentFrom}16, ${mod.accentTo}0a)`,
              border: `1.5px solid ${mod.accentFrom}38`,
              boxShadow: `0 4px 20px -6px ${mod.accentFrom}28`,
            }}
          >
            <div
              className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
              style={{ background: `radial-gradient(ellipse at 50% 60%, ${mod.accentFrom}20 0%, transparent 70%)` }}
            />
            <div
              className="h-11 w-11 rounded-xl flex items-center justify-center mb-2 transition-transform duration-200 group-hover:scale-110 group-hover:-translate-y-0.5"
              style={{
                background: `linear-gradient(135deg, ${mod.accentFrom}, ${mod.accentTo})`,
                boxShadow: `0 4px 12px -3px ${mod.accentFrom}55`,
              }}
            >
              <mod.icon className="h-5 w-5 text-white" />
            </div>
            <p className="text-[12px] font-extrabold leading-tight text-[#1B2A4A] dark:text-white tracking-tight w-full truncate">{mod.titulo}</p>
            <p className="text-[9.5px] text-gray-400 leading-tight mt-0.5 w-full truncate">{mod.subtitulo}</p>
          </div>
        ))}
      </div>

      {!selectedObraId ? (
        <div className="text-center py-12 text-gray-400">
          <LayoutDashboard className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Selecione uma obra para visualizar o painel</p>
        </div>
      ) : dashboard.isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
        </div>
      ) : (
        <>
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ClipboardList className="w-6 h-6 text-amber-600" />
              <div>
                <p className="font-semibold text-amber-800 dark:text-amber-300">RDO de Hoje — {new Date().toLocaleDateString("pt-BR")}</p>
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  {d?.rdo?.hojeStatus === "finalizado" ? "Finalizado" :
                    d?.rdo?.hojeStatus === "rascunho" ? "Rascunho — pendente de finalização" :
                      "Não criado ainda"}
                </p>
              </div>
            </div>
            {d?.rdo?.hojeStatus === "nao_criado" ? (
              <Button className="bg-amber-600 hover:bg-amber-700" onClick={() => criarRDO.mutate({ companyId, obraId: selectedObraId, data: hoje, responsavelNome: user?.nome || user?.email })} disabled={criarRDO.isPending}>
                {criarRDO.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                Criar RDO de Hoje
              </Button>
            ) : (
              <Button variant="outline" onClick={() => setLocation(`/operacional/rdo?obra=${selectedObraId}&id=${d?.rdo?.hojeId}`)}>
                <ArrowRight className="w-4 h-4 mr-2" /> Abrir RDO
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setLocation(`/operacional/rdo?obra=${selectedObraId}`)}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
                  <ClipboardList className="w-4 h-4" /> RDOs
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{d?.rdo?.total_rdos || 0}</p>
                <div className="flex gap-2 mt-2">
                  <Badge variant="outline" className="text-green-600">{d?.rdo?.finalizados || 0} finalizados</Badge>
                  <Badge variant="outline" className="text-amber-600">{d?.rdo?.rascunhos || 0} pendentes</Badge>
                </div>
              </CardContent>
            </Card>

            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setLocation(`/operacional/nc?obra=${selectedObraId}`)}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" /> Não Conformidades
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{d?.ncs?.total_ncs || 0}</p>
                <div className="flex gap-2 mt-2">
                  <Badge variant="outline" className="text-red-600">{d?.ncs?.abertas || 0} abertas</Badge>
                  <Badge variant="outline" className="text-green-600">{d?.ncs?.fechadas || 0} fechadas</Badge>
                </div>
              </CardContent>
            </Card>

            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setLocation(`/operacional/concretagem?obra=${selectedObraId}`)}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
                  <Blocks className="w-4 h-4" /> Concretagem
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{d?.concretagem?.concretados || 0}/{d?.concretagem?.total_elementos || 0}</p>
                <div className="flex gap-2 mt-2">
                  <Badge variant="outline" className="text-blue-600">{d?.concretagem?.pendentes || 0} pendentes</Badge>
                </div>
              </CardContent>
            </Card>

            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setLocation(`/operacional/checklists?obra=${selectedObraId}`)}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
                  <CheckSquare className="w-4 h-4" /> Checklists
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{d?.checklists?.total || 0}</p>
                <div className="flex gap-2 mt-2">
                  <Badge variant="outline" className="text-green-600">{d?.checklists?.concluidos || 0} concluídos</Badge>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Camera className="w-4 h-4" /> Registro Fotográfico
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{d?.fotos?.total || 0} fotos</p>
                <Button variant="outline" className="mt-3" onClick={() => setLocation(`/operacional/fotos?obra=${selectedObraId}`)}>
                  Ver Galeria <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <CloudRain className="w-4 h-4" /> Clima
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{d?.rdo?.dias_chuva || 0} dias de chuva</p>
                <p className="text-sm text-gray-500 mt-1">Total de {d?.rdo?.total_rdos || 0} RDOs registrados</p>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
