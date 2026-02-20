import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { FolderOpen, Search, GraduationCap, Stethoscope, HardHat, ShieldCheck, AlertTriangle, Plus } from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";

export default function ControleDocumentos() {
  const companiesQ = trpc.companies.list.useQuery();
  const companies = companiesQ.data ?? [];
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const companyId = selectedCompanyId ?? companies[0]?.id ?? 0;
  const [search, setSearch] = useState("");

  const trainingsQ = trpc.sst.trainings.list.useQuery({ companyId }, { enabled: !!companyId });
  const asosQ = trpc.sst.asos.list.useQuery({ companyId }, { enabled: !!companyId });
  const episQ = trpc.sst.epis.list.useQuery({ companyId }, { enabled: !!companyId });

  const trainings = (trainingsQ.data ?? []) as any[];
  const asos = (asosQ.data ?? []) as any[];
  const epis = (episQ.data ?? []) as any[];

  const now = new Date();

  // Verificar vencimentos
  const trainingsVencidos = trainings.filter((t: any) => {
    if (!t.dataValidade) return false;
    return new Date(t.dataValidade) < now;
  });
  const asosVencidos = asos.filter((a: any) => {
    if (!a.dataValidade) return false;
    return new Date(a.dataValidade) < now;
  });

  const getStatusBadge = (dataValidade: string | null) => {
    if (!dataValidade) return <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">Sem validade</span>;
    const d = new Date(dataValidade);
    const diffDays = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-800">Vencido</span>;
    if (diffDays <= 30) return <span className="px-2 py-0.5 rounded-full text-xs bg-yellow-100 text-yellow-800">Vence em {diffDays}d</span>;
    return <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-800">Válido</span>;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Controle de Documentos</h1>
            <p className="text-muted-foreground text-sm">Treinamentos, Exames (ASOs), EPIs e documentação SST</p>
          </div>
          <div className="flex items-center gap-3">
            {companies.length > 1 && (
              <Select value={String(companyId)} onValueChange={v => setSelectedCompanyId(Number(v))}>
                <SelectTrigger className="w-[260px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {companies.map((c: any) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.nomeFantasia || c.razaoSocial}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                  <GraduationCap className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{trainings.length}</p>
                  <p className="text-xs text-muted-foreground">Treinamentos</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
                  <Stethoscope className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{asos.length}</p>
                  <p className="text-xs text-muted-foreground">ASOs / Exames</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center">
                  <HardHat className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{epis.length}</p>
                  <p className="text-xs text-muted-foreground">EPIs</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-red-100 flex items-center justify-center">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{trainingsVencidos.length + asosVencidos.length}</p>
                  <p className="text-xs text-muted-foreground">Vencidos</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por nome do colaborador ou documento..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
          </div>
        </div>

        <Tabs defaultValue="treinamentos" className="w-full">
          <TabsList>
            <TabsTrigger value="treinamentos">Treinamentos</TabsTrigger>
            <TabsTrigger value="asos">ASOs / Exames</TabsTrigger>
            <TabsTrigger value="epis">EPIs</TabsTrigger>
          </TabsList>

          <TabsContent value="treinamentos">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Treinamentos</CardTitle>
                <Button size="sm" onClick={() => toast("Acesse SST - Geral para cadastrar", { description: "Use a página de SST para gerenciar treinamentos." })} className="bg-[#1B2A4A] hover:bg-[#243660]">
                  <Plus className="h-3.5 w-3.5 mr-1" /> Novo
                </Button>
              </CardHeader>
              <CardContent>
                {trainings.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <GraduationCap className="h-10 w-10 text-muted-foreground/50 mb-3" />
                    <p className="text-muted-foreground text-sm">Nenhum treinamento cadastrado.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="pb-2 font-medium">Colaborador</th>
                          <th className="pb-2 font-medium">Treinamento</th>
                          <th className="pb-2 font-medium">Data Realização</th>
                          <th className="pb-2 font-medium">Validade</th>
                          <th className="pb-2 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {trainings.filter((t: any) => {
                          if (!search) return true;
                          const s = search.toLowerCase();
                          return t.employeeName?.toLowerCase().includes(s) || t.nome?.toLowerCase().includes(s);
                        }).map((t: any) => (
                          <tr key={t.id} className="border-b last:border-0">
                            <td className="py-2">{t.employeeName || `#${t.employeeId}`}</td>
                            <td className="py-2">{t.nome || "-"}</td>
                            <td className="py-2">{t.dataRealizacao || "-"}</td>
                            <td className="py-2">{t.dataValidade || "-"}</td>
                            <td className="py-2">{getStatusBadge(t.dataValidade)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="asos">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">ASOs / Exames Médicos</CardTitle>
                <Button size="sm" onClick={() => toast("Acesse SST - Geral para cadastrar", { description: "Use a página de SST para gerenciar ASOs." })} className="bg-[#1B2A4A] hover:bg-[#243660]">
                  <Plus className="h-3.5 w-3.5 mr-1" /> Novo
                </Button>
              </CardHeader>
              <CardContent>
                {asos.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <Stethoscope className="h-10 w-10 text-muted-foreground/50 mb-3" />
                    <p className="text-muted-foreground text-sm">Nenhum ASO cadastrado.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="pb-2 font-medium">Colaborador</th>
                          <th className="pb-2 font-medium">Tipo</th>
                          <th className="pb-2 font-medium">Data Exame</th>
                          <th className="pb-2 font-medium">Validade</th>
                          <th className="pb-2 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {asos.filter((a: any) => {
                          if (!search) return true;
                          const s = search.toLowerCase();
                          return a.employeeName?.toLowerCase().includes(s) || a.tipo?.toLowerCase().includes(s);
                        }).map((a: any) => (
                          <tr key={a.id} className="border-b last:border-0">
                            <td className="py-2">{a.employeeName || `#${a.employeeId}`}</td>
                            <td className="py-2">{a.tipo || "-"}</td>
                            <td className="py-2">{a.dataExame || "-"}</td>
                            <td className="py-2">{a.dataValidade || "-"}</td>
                            <td className="py-2">{getStatusBadge(a.dataValidade)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="epis">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Equipamentos de Proteção Individual</CardTitle>
                <Button size="sm" onClick={() => toast("Acesse SST - Geral para cadastrar", { description: "Use a página de SST para gerenciar EPIs." })} className="bg-[#1B2A4A] hover:bg-[#243660]">
                  <Plus className="h-3.5 w-3.5 mr-1" /> Novo
                </Button>
              </CardHeader>
              <CardContent>
                {epis.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <HardHat className="h-10 w-10 text-muted-foreground/50 mb-3" />
                    <p className="text-muted-foreground text-sm">Nenhum EPI cadastrado.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="pb-2 font-medium">EPI</th>
                          <th className="pb-2 font-medium">CA</th>
                          <th className="pb-2 font-medium">Validade CA</th>
                          <th className="pb-2 font-medium">Quantidade</th>
                          <th className="pb-2 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {epis.filter((e: any) => {
                          if (!search) return true;
                          const s = search.toLowerCase();
                          return e.nome?.toLowerCase().includes(s) || e.ca?.toLowerCase().includes(s);
                        }).map((e: any) => (
                          <tr key={e.id} className="border-b last:border-0">
                            <td className="py-2">{e.nome || "-"}</td>
                            <td className="py-2">{e.ca || "-"}</td>
                            <td className="py-2">{e.dataValidadeCa || "-"}</td>
                            <td className="py-2">{e.quantidade ?? "-"}</td>
                            <td className="py-2">{getStatusBadge(e.dataValidadeCa)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
