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
  BookOpen, HardHat,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";

const submodulos = [
  {
    id: "diario",
    titulo: "Diário de Obra",
    descricao: "RDO, Registro Fotográfico e Clima",
    icon: BookOpen,
    cor: "from-amber-500 to-orange-500",
    corBg: "bg-amber-50 dark:bg-amber-950/30",
    corBorda: "border-amber-200 dark:border-amber-800",
    corTexto: "text-amber-700 dark:text-amber-400",
    items: [
      { label: "RDO", path: "/operacional/rdo", icon: ClipboardList },
      { label: "Registro Fotográfico", path: "/operacional/fotos", icon: Camera },
    ],
  },
  {
    id: "concreto",
    titulo: "Controle de Qualidade de Concreto",
    descricao: "Concretagem e Não Conformidades",
    icon: Blocks,
    cor: "from-blue-500 to-cyan-500",
    corBg: "bg-blue-50 dark:bg-blue-950/30",
    corBorda: "border-blue-200 dark:border-blue-800",
    corTexto: "text-blue-700 dark:text-blue-400",
    items: [
      { label: "Concretagem", path: "/operacional/concretagem", icon: Blocks },
      { label: "Não Conformidades", path: "/operacional/nc", icon: AlertTriangle },
    ],
  },
  {
    id: "checklist",
    titulo: "Checklist",
    descricao: "Qualidade e Liberação de Serviços",
    icon: CheckSquare,
    cor: "from-emerald-500 to-teal-500",
    corBg: "bg-emerald-50 dark:bg-emerald-950/30",
    corBorda: "border-emerald-200 dark:border-emerald-800",
    corTexto: "text-emerald-700 dark:text-emerald-400",
    items: [
      { label: "Checklists de Qualidade", path: "/operacional/checklists", icon: ClipboardCheck },
      { label: "Liberação de Serviços", path: "/operacional/liberacao-servicos", icon: ShieldCheck },
    ],
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
          <p className="text-sm text-gray-500">Gestão completa da obra</p>
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {submodulos.map((sub) => (
          <div
            key={sub.id}
            className={`group relative rounded-2xl border ${sub.corBorda} ${sub.corBg} p-5 transition-all hover:shadow-lg hover:scale-[1.02] cursor-default`}
          >
            <div className="flex items-start gap-4 mb-4">
              <div className={`p-3 rounded-xl bg-gradient-to-br ${sub.cor} text-white shadow-lg`}>
                <sub.icon className="h-7 w-7" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-bold text-slate-800 dark:text-white leading-tight">{sub.titulo}</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">{sub.descricao}</p>
              </div>
            </div>
            <div className="space-y-1.5">
              {sub.items.map((item) => (
                <button
                  key={item.path}
                  disabled={!selectedObraId}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all
                    bg-white/60 dark:bg-slate-800/60 hover:bg-white dark:hover:bg-slate-700 
                    border border-transparent hover:border-slate-200 dark:hover:border-slate-600
                    hover:shadow-sm group/item
                    disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white/60 disabled:hover:shadow-none`}
                  onClick={() => selectedObraId && setLocation(`${item.path}?obra=${selectedObraId}`)}
                >
                  <div className={`p-1.5 rounded-lg ${sub.corBg}`}>
                    <item.icon className={`h-4 w-4 ${sub.corTexto}`} />
                  </div>
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300 group-hover/item:text-slate-900 dark:group-hover/item:text-white">
                    {item.label}
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 text-slate-300 ml-auto opacity-0 group-hover/item:opacity-100 transition-opacity" />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {!selectedObraId ? (
        <div className="text-center py-12 text-gray-400">
          <LayoutDashboard className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Selecione uma obra acima para ver os indicadores</p>
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
