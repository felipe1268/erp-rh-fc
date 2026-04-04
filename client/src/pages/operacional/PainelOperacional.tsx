import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import {
  ClipboardList, CheckSquare, Blocks, AlertTriangle, Camera,
  LayoutDashboard, Plus, ArrowRight, CloudRain, Sun, CloudSun,
  FileText, Loader2,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";

export default function PainelOperacional() {
  const { companyId } = useCompany();
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const obras = trpc.obras.listActive.useQuery({ companyId }, { enabled: !!companyId });
  const [obraId, setObraId] = useState<number | null>(null);
  const selectedObraId = obraId || (obras.data as any)?.[0]?.id;

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Painel Operacional</h1>
          <p className="text-sm text-gray-500">Visão consolidada da obra</p>
        </div>
        <Select value={String(selectedObraId || "")} onValueChange={(v) => setObraId(Number(v))}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Selecione a obra" />
          </SelectTrigger>
          <SelectContent>
            {(obras.data as any[])?.map((o: any) => (
              <SelectItem key={o.id} value={String(o.id)}>{o.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!selectedObraId ? (
        <div className="text-center py-20 text-gray-400">
          <LayoutDashboard className="w-16 h-16 mx-auto mb-4 opacity-30" />
          <p>Selecione uma obra para visualizar o painel</p>
        </div>
      ) : dashboard.isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
        </div>
      ) : (
        <>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ClipboardList className="w-6 h-6 text-amber-600" />
              <div>
                <p className="font-semibold text-amber-800">RDO de Hoje — {new Date().toLocaleDateString("pt-BR")}</p>
                <p className="text-sm text-amber-600">
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
