import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  LayoutDashboard, Settings, Clock, History, Users, Plus, Trash2, Edit, Copy,
  CheckCircle, XCircle, AlertTriangle, TrendingUp, GraduationCap, Eye, Video,
  ChevronDown, ChevronRight, Loader2, ClipboardList, BarChart3, RefreshCw, Search,
} from "lucide-react";

function formatDate(d: string | null | undefined) {
  if (!d) return "-";
  try {
    const dt = new Date(d);
    return dt.toLocaleDateString("pt-BR");
  } catch { return "-"; }
}

const statusLabels: Record<string, string> = {
  pendente: "Pendente", em_andamento: "Em Andamento", aprovado: "Aprovado",
  reprovado: "Reprovado", vencido: "Vencido",
};
const statusColors: Record<string, string> = {
  pendente: "bg-yellow-100 text-yellow-800", em_andamento: "bg-blue-100 text-blue-800",
  aprovado: "bg-green-100 text-green-800", reprovado: "bg-red-100 text-red-800",
  vencido: "bg-gray-100 text-gray-800",
};
const origemLabels: Record<string, string> = {
  manual: "Manual", smo: "SMO", reciclagem: "Reciclagem",
  advertencia: "Advertência", transferencia: "Transferência",
};

export default function IntegracaoSST() {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ?? 0;
  const [tab, setTab] = useState("dashboard");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <GraduationCap className="h-7 w-7 text-emerald-600" />
        <div>
          <h1 className="text-2xl font-bold">Integração de Segurança</h1>
          <p className="text-sm text-muted-foreground">Treinamento de novos colaboradores — vídeos, questionários e certificados</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="dashboard"><LayoutDashboard className="h-4 w-4 mr-1" />Dashboard</TabsTrigger>
          <TabsTrigger value="config"><Settings className="h-4 w-4 mr-1" />Configurações</TabsTrigger>
          <TabsTrigger value="pendentes"><Clock className="h-4 w-4 mr-1" />Pendentes</TabsTrigger>
          <TabsTrigger value="historico"><History className="h-4 w-4 mr-1" />Histórico</TabsTrigger>
          <TabsTrigger value="sessoes"><Users className="h-4 w-4 mr-1" />Sessões</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard"><DashboardTab companyId={companyId} /></TabsContent>
        <TabsContent value="config"><ConfigTab companyId={companyId} /></TabsContent>
        <TabsContent value="pendentes"><PendentesTab companyId={companyId} /></TabsContent>
        <TabsContent value="historico"><HistoricoTab companyId={companyId} /></TabsContent>
        <TabsContent value="sessoes"><SessoesTab companyId={companyId} /></TabsContent>
      </Tabs>
    </div>
  );
}

function DashboardTab({ companyId }: { companyId: number }) {
  const kpis = trpc.integracaoSST.dashboardKpis.useQuery({ companyId }, { enabled: companyId > 0 });
  const alertas = trpc.integracaoSST.alertas.useQuery({ companyId }, { enabled: companyId > 0 });

  if (!companyId) return <p className="text-muted-foreground p-4">Selecione uma empresa.</p>;
  if (kpis.isLoading) return <div className="flex items-center gap-2 p-8"><Loader2 className="h-5 w-5 animate-spin" />Carregando...</div>;

  const k = kpis.data;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
        <KpiCard label="Total" value={k?.total ?? 0} icon={<BarChart3 className="h-5 w-5 text-blue-500" />} />
        <KpiCard label="Aprovados" value={k?.aprovados ?? 0} icon={<CheckCircle className="h-5 w-5 text-green-500" />} color="text-green-700" />
        <KpiCard label="Pendentes" value={k?.pendentes ?? 0} icon={<Clock className="h-5 w-5 text-yellow-500" />} color="text-yellow-700" />
        <KpiCard label="Reprovados" value={k?.reprovados ?? 0} icon={<XCircle className="h-5 w-5 text-red-500" />} color="text-red-700" />
        <KpiCard label="Vencendo (30d)" value={k?.vencendoEm30Dias ?? 0} icon={<AlertTriangle className="h-5 w-5 text-orange-500" />} color="text-orange-700" />
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Indicadores</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between"><span className="text-sm text-muted-foreground">Taxa de Aprovação</span><span className="font-semibold">{k?.taxaAprovacao ?? 0}%</span></div>
            <div className="w-full bg-gray-200 rounded-full h-2"><div className="bg-emerald-500 rounded-full h-2 transition-all" style={{ width: `${k?.taxaAprovacao ?? 0}%` }} /></div>
            <div className="flex justify-between"><span className="text-sm text-muted-foreground">Média de Nota</span><span className="font-semibold">{k?.mediaNota ?? "-"}</span></div>
            <div className="flex justify-between"><span className="text-sm text-muted-foreground">Em Andamento</span><span className="font-semibold">{k?.emAndamento ?? 0}</span></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-orange-500" />Alertas</CardTitle></CardHeader>
          <CardContent>
            {alertas.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {(alertas.data?.length ?? 0) === 0 && <p className="text-sm text-muted-foreground">Nenhum alerta</p>}
                {alertas.data?.map((a, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm border-b last:border-0 pb-2">
                    <Badge variant="outline" className={a.tipo === "advertencia" ? "bg-red-50 text-red-700" : a.tipo === "vencendo" ? "bg-orange-50 text-orange-700" : a.tipo === "reprovado" ? "bg-red-50 text-red-700" : "bg-yellow-50 text-yellow-700"}>
                      {a.tipo}
                    </Badge>
                    <span>{a.mensagem}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color?: string }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-center gap-2 mb-1">{icon}<span className="text-xs text-muted-foreground">{label}</span></div>
        <p className={`text-2xl font-bold ${color || ""}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function ConfigTab({ companyId }: { companyId: number }) {
  const configs = trpc.integracaoSST.listarConfigs.useQuery({ companyId }, { enabled: companyId > 0 });
  const criarConfig = trpc.integracaoSST.criarConfig.useMutation({ onSuccess: () => { configs.refetch(); setShowNew(false); toast.success("Configuração criada"); } });
  const excluirConfig = trpc.integracaoSST.excluirConfig.useMutation({ onSuccess: () => { configs.refetch(); toast.success("Configuração excluída"); } });
  const [showNew, setShowNew] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [notaMinima, setNotaMinima] = useState(70);
  const [validadeMeses, setValidadeMeses] = useState(12);
  const [expandedConfig, setExpandedConfig] = useState<number | null>(null);

  if (!companyId) return <p className="text-muted-foreground p-4">Selecione uma empresa.</p>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold">Configurações de Integração</h3>
        <Button size="sm" onClick={() => setShowNew(true)}><Plus className="h-4 w-4 mr-1" />Nova Configuração</Button>
      </div>

      {configs.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
        <div className="space-y-3">
          {configs.data?.length === 0 && <p className="text-muted-foreground text-sm">Nenhuma configuração cadastrada. Crie uma para começar.</p>}
          {configs.data?.map(cfg => (
            <Card key={cfg.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 cursor-pointer" onClick={() => setExpandedConfig(expandedConfig === cfg.id ? null : cfg.id)}>
                    {expandedConfig === cfg.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <div>
                      <p className="font-medium">{cfg.titulo}</p>
                      <p className="text-xs text-muted-foreground">Nota mínima: {cfg.notaMinima}% · Validade: {cfg.validadeMeses} meses · {cfg.ativo ? "Ativa" : "Inativa"}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant={cfg.ativo ? "default" : "secondary"}>{cfg.ativo ? "Ativa" : "Inativa"}</Badge>
                    <Button variant="ghost" size="sm" onClick={() => excluirConfig.mutate({ id: cfg.id, companyId })}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                  </div>
                </div>
                {expandedConfig === cfg.id && <ModulosEditor configId={cfg.id} companyId={companyId} />}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova Configuração de Integração</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Título</Label><Input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ex: Integração Geral" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Nota Mínima (%)</Label><Input type="number" value={notaMinima} onChange={e => setNotaMinima(Number(e.target.value))} min={1} max={100} /></div>
              <div><Label>Validade (meses)</Label><Input type="number" value={validadeMeses} onChange={e => setValidadeMeses(Number(e.target.value))} min={1} max={60} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>Cancelar</Button>
            <Button disabled={!titulo.trim() || criarConfig.isPending} onClick={() => criarConfig.mutate({ companyId, titulo, notaMinima, validadeMeses })}>
              {criarConfig.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ModulosEditor({ configId, companyId }: { configId: number; companyId: number }) {
  const modulos = trpc.integracaoSST.listarModulos.useQuery({ configId, companyId });
  const criarModulo = trpc.integracaoSST.criarModulo.useMutation({ onSuccess: () => { modulos.refetch(); setShowNew(false); toast.success("Módulo criado"); } });
  const excluirModulo = trpc.integracaoSST.excluirModulo.useMutation({ onSuccess: () => { modulos.refetch(); toast.success("Módulo excluído"); } });
  const salvarPerguntas = trpc.integracaoSST.salvarPerguntas.useMutation({ onSuccess: () => { modulos.refetch(); toast.success("Perguntas salvas"); } });

  const [showNew, setShowNew] = useState(false);
  const [newTitulo, setNewTitulo] = useState("");
  const [newVideo, setNewVideo] = useState("");
  const [newDuracao, setNewDuracao] = useState("");
  const [editingModuloId, setEditingModuloId] = useState<number | null>(null);
  const [perguntasEdit, setPerguntasEdit] = useState<any[]>([]);

  const startEditPerguntas = (modulo: any) => {
    setEditingModuloId(modulo.id);
    setPerguntasEdit(modulo.perguntas?.length > 0 ? modulo.perguntas.map((p: any) => ({
      id: p.id, texto: p.texto, ordem: p.ordem,
      alternativas: p.alternativas?.map((a: any) => ({ id: a.id, texto: a.texto, correta: a.correta, ordem: a.ordem })) || [],
    })) : [{ texto: "", ordem: 1, alternativas: [{ texto: "", correta: true, ordem: 1 }, { texto: "", correta: false, ordem: 2 }] }]);
  };

  const addPergunta = () => {
    setPerguntasEdit([...perguntasEdit, { texto: "", ordem: perguntasEdit.length + 1, alternativas: [{ texto: "", correta: true, ordem: 1 }, { texto: "", correta: false, ordem: 2 }] }]);
  };

  const addAlternativa = (pi: number) => {
    const updated = [...perguntasEdit];
    updated[pi].alternativas.push({ texto: "", correta: false, ordem: updated[pi].alternativas.length + 1 });
    setPerguntasEdit(updated);
  };

  const removePergunta = (pi: number) => {
    setPerguntasEdit(perguntasEdit.filter((_, i) => i !== pi).map((p, i) => ({ ...p, ordem: i + 1 })));
  };

  const removeAlternativa = (pi: number, ai: number) => {
    const updated = [...perguntasEdit];
    updated[pi].alternativas = updated[pi].alternativas.filter((_: any, i: number) => i !== ai).map((a: any, i: number) => ({ ...a, ordem: i + 1 }));
    setPerguntasEdit(updated);
  };

  return (
    <div className="mt-4 border-t pt-4 space-y-3">
      <div className="flex justify-between items-center">
        <h4 className="font-medium text-sm">Módulos de Treinamento</h4>
        <Button size="sm" variant="outline" onClick={() => setShowNew(true)}><Plus className="h-3 w-3 mr-1" />Módulo</Button>
      </div>

      {modulos.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
        <div className="space-y-2">
          {modulos.data?.map((mod, idx) => (
            <Card key={mod.id} className="bg-muted/30">
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{idx + 1}</Badge>
                    <Video className="h-4 w-4 text-blue-500" />
                    <div>
                      <p className="text-sm font-medium">{mod.titulo}</p>
                      <p className="text-xs text-muted-foreground">
                        {mod.videoUrl ? "Vídeo configurado" : "Sem vídeo"} · {mod.perguntas?.length || 0} pergunta(s)
                        {mod.duracaoMinutos ? ` · ${mod.duracaoMinutos} min` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => startEditPerguntas(mod)}><ClipboardList className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => excluirModulo.mutate({ id: mod.id, companyId })}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                  </div>
                </div>

                {editingModuloId === mod.id && (
                  <div className="mt-3 border-t pt-3 space-y-3">
                    <h5 className="text-sm font-medium">Perguntas do Módulo</h5>
                    {perguntasEdit.map((p, pi) => (
                      <Card key={pi} className="bg-white">
                        <CardContent className="p-3 space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-muted-foreground">P{pi + 1}</span>
                            <Input value={p.texto} onChange={e => { const u = [...perguntasEdit]; u[pi].texto = e.target.value; setPerguntasEdit(u); }} placeholder="Texto da pergunta" className="text-sm" />
                            <Button size="sm" variant="ghost" onClick={() => removePergunta(pi)}><Trash2 className="h-3 w-3 text-red-400" /></Button>
                          </div>
                          <div className="ml-6 space-y-1">
                            {p.alternativas.map((a: any, ai: number) => (
                              <div key={ai} className="flex items-center gap-2">
                                <input type="radio" name={`correta_${pi}`} checked={a.correta}
                                  onChange={() => {
                                    const u = [...perguntasEdit];
                                    u[pi].alternativas = u[pi].alternativas.map((alt: any, j: number) => ({ ...alt, correta: j === ai }));
                                    setPerguntasEdit(u);
                                  }} className="accent-emerald-600" />
                                <Input value={a.texto} onChange={e => { const u = [...perguntasEdit]; u[pi].alternativas[ai].texto = e.target.value; setPerguntasEdit(u); }} placeholder={`Alternativa ${ai + 1}`} className="text-sm h-8" />
                                {p.alternativas.length > 2 && <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => removeAlternativa(pi, ai)}><Trash2 className="h-3 w-3 text-red-400" /></Button>}
                              </div>
                            ))}
                            <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => addAlternativa(pi)}><Plus className="h-3 w-3 mr-1" />Alternativa</Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={addPergunta}><Plus className="h-3 w-3 mr-1" />Pergunta</Button>
                      <Button size="sm"
                        disabled={salvarPerguntas.isPending || perguntasEdit.some(p => !p.texto.trim() || p.alternativas.some((a: any) => !a.texto.trim()))}
                        onClick={() => salvarPerguntas.mutate({ moduloId: mod.id, companyId, perguntas: perguntasEdit })}>
                        {salvarPerguntas.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}Salvar Perguntas
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingModuloId(null)}>Fechar</Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo Módulo de Treinamento</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Título</Label><Input value={newTitulo} onChange={e => setNewTitulo(e.target.value)} placeholder="Ex: Uso de EPIs" /></div>
            <div><Label>URL do Vídeo (YouTube)</Label><Input value={newVideo} onChange={e => setNewVideo(e.target.value)} placeholder="https://youtube.com/watch?v=..." /></div>
            <div><Label>Duração (minutos)</Label><Input type="number" value={newDuracao} onChange={e => setNewDuracao(e.target.value)} placeholder="10" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>Cancelar</Button>
            <Button disabled={!newTitulo.trim() || criarModulo.isPending}
              onClick={() => criarModulo.mutate({ configId, companyId, titulo: newTitulo, videoUrl: newVideo || undefined, duracaoMinutos: newDuracao ? Number(newDuracao) : undefined, ordem: (modulos.data?.length || 0) + 1 })}>
              {criarModulo.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PendentesTab({ companyId }: { companyId: number }) {
  const registros = trpc.integracaoSST.listarRegistros.useQuery({ companyId, status: "pendente" }, { enabled: companyId > 0 });
  const emAndamento = trpc.integracaoSST.listarRegistros.useQuery({ companyId, status: "em_andamento" }, { enabled: companyId > 0 });
  const criarRegistro = trpc.integracaoSST.criarRegistro.useMutation({ onSuccess: () => { registros.refetch(); setShowNew(false); toast.success("Integração criada"); } });
  const [showNew, setShowNew] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const allPending = [...(registros.data || []), ...(emAndamento.data || [])];
  const filtered = searchTerm ? allPending.filter(r => r.employeeNome?.toLowerCase().includes(searchTerm.toLowerCase()) || r.employeeCpf?.includes(searchTerm)) : allPending;

  if (!companyId) return <p className="text-muted-foreground p-4">Selecione uma empresa.</p>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <h3 className="font-semibold">Integrações Pendentes</h3>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
            <Input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Buscar..." className="pl-8 w-48" />
          </div>
          <Button size="sm" onClick={() => setShowNew(true)}><Plus className="h-4 w-4 mr-1" />Criar Integração</Button>
        </div>
      </div>

      {registros.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50">
              <th className="p-2 text-left">Colaborador</th>
              <th className="p-2 text-left">CPF</th>
              <th className="p-2 text-left">Função</th>
              <th className="p-2 text-left">Obra</th>
              <th className="p-2 text-left">Status</th>
              <th className="p-2 text-left">Origem</th>
              <th className="p-2 text-left">Criado em</th>
              <th className="p-2 text-left">Link</th>
            </tr></thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={8} className="p-4 text-center text-muted-foreground">Nenhum registro pendente</td></tr>}
              {filtered.map(r => (
                <tr key={r.id} className="border-b hover:bg-muted/20">
                  <td className="p-2 font-medium">{r.employeeNome || "-"}</td>
                  <td className="p-2 text-xs">{r.employeeCpf || "-"}</td>
                  <td className="p-2 text-xs">{r.employeeFuncao || "-"}</td>
                  <td className="p-2 text-xs">{r.obraNome || "-"}</td>
                  <td className="p-2"><Badge className={statusColors[r.status] || ""}>{statusLabels[r.status] || r.status}</Badge></td>
                  <td className="p-2"><Badge variant="outline" className="text-xs">{origemLabels[r.origem] || r.origem}</Badge></td>
                  <td className="p-2 text-xs">{formatDate(r.createdAt)}</td>
                  <td className="p-2">
                    {r.token && (
                      <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/integracao/${r.token}`); toast.success("Link copiado!"); }}>
                        <Copy className="h-3 w-3 mr-1" />Copiar
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent>
          <DialogHeader><DialogTitle>Criar Integração</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>ID do Colaborador</Label><Input type="number" value={employeeId} onChange={e => setEmployeeId(e.target.value)} placeholder="ID do colaborador" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>Cancelar</Button>
            <Button disabled={!employeeId || criarRegistro.isPending}
              onClick={() => criarRegistro.mutate({ companyId, employeeId: Number(employeeId) })}>
              {criarRegistro.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function HistoricoTab({ companyId }: { companyId: number }) {
  const [statusFiltro, setStatusFiltro] = useState("todos");
  const registros = trpc.integracaoSST.listarRegistros.useQuery(
    { companyId, status: statusFiltro as any },
    { enabled: companyId > 0 }
  );
  const [searchTerm, setSearchTerm] = useState("");

  const filtered = searchTerm
    ? (registros.data || []).filter(r => r.employeeNome?.toLowerCase().includes(searchTerm.toLowerCase()) || r.employeeCpf?.includes(searchTerm))
    : (registros.data || []);

  if (!companyId) return <p className="text-muted-foreground p-4">Selecione uma empresa.</p>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <h3 className="font-semibold">Histórico de Integrações</h3>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
            <Input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Buscar..." className="pl-8 w-48" />
          </div>
          <Select value={statusFiltro} onValueChange={setStatusFiltro}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="pendente">Pendente</SelectItem>
              <SelectItem value="em_andamento">Em Andamento</SelectItem>
              <SelectItem value="aprovado">Aprovado</SelectItem>
              <SelectItem value="reprovado">Reprovado</SelectItem>
              <SelectItem value="vencido">Vencido</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {registros.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50">
              <th className="p-2 text-left">Colaborador</th>
              <th className="p-2 text-left">CPF</th>
              <th className="p-2 text-left">Função</th>
              <th className="p-2 text-left">Obra</th>
              <th className="p-2 text-left">Status</th>
              <th className="p-2 text-left">Nota</th>
              <th className="p-2 text-left">Tentativas</th>
              <th className="p-2 text-left">Origem</th>
              <th className="p-2 text-left">Realização</th>
              <th className="p-2 text-left">Validade</th>
            </tr></thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={10} className="p-4 text-center text-muted-foreground">Nenhum registro encontrado</td></tr>}
              {filtered.map(r => (
                <tr key={r.id} className="border-b hover:bg-muted/20">
                  <td className="p-2 font-medium">{r.employeeNome || "-"}</td>
                  <td className="p-2 text-xs">{r.employeeCpf || "-"}</td>
                  <td className="p-2 text-xs">{r.employeeFuncao || "-"}</td>
                  <td className="p-2 text-xs">{r.obraNome || "-"}</td>
                  <td className="p-2"><Badge className={statusColors[r.status] || ""}>{statusLabels[r.status] || r.status}</Badge></td>
                  <td className="p-2 text-center">{r.nota ? `${r.nota}%` : "-"}</td>
                  <td className="p-2 text-center">{r.tentativas}</td>
                  <td className="p-2"><Badge variant="outline" className="text-xs">{origemLabels[r.origem] || r.origem}</Badge></td>
                  <td className="p-2 text-xs">{formatDate(r.dataRealizacao)}</td>
                  <td className="p-2 text-xs">{formatDate(r.dataValidade)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SessoesTab({ companyId }: { companyId: number }) {
  const sessoes = trpc.integracaoSST.listarSessoes.useQuery({ companyId }, { enabled: companyId > 0 });
  const criarSessao = trpc.integracaoSST.criarSessao.useMutation({ onSuccess: () => { sessoes.refetch(); setShowNew(false); toast.success("Sessão criada"); } });
  const [showNew, setShowNew] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [dataSessao, setDataSessao] = useState("");
  const [tipo, setTipo] = useState<"individual" | "grupo">("grupo");

  if (!companyId) return <p className="text-muted-foreground p-4">Selecione uma empresa.</p>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold">Sessões de Integração</h3>
        <Button size="sm" onClick={() => setShowNew(true)}><Plus className="h-4 w-4 mr-1" />Nova Sessão</Button>
      </div>

      {sessoes.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {sessoes.data?.length === 0 && <p className="text-muted-foreground text-sm col-span-full">Nenhuma sessão cadastrada</p>}
          {sessoes.data?.map(s => (
            <Card key={s.id}>
              <CardContent className="p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="font-medium">{s.titulo || "Sessão sem título"}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(s.dataSessao)} · {s.tipo === "grupo" ? "Grupo" : "Individual"}</p>
                  </div>
                  <Badge variant={s.status === "agendada" ? "outline" : s.status === "concluida" ? "default" : "secondary"}>{s.status}</Badge>
                </div>
                <div className="flex gap-4 text-sm">
                  <span><Users className="h-3 w-3 inline mr-1" />{s.participantes ?? 0} participantes</span>
                  <span><CheckCircle className="h-3 w-3 inline mr-1 text-green-500" />{s.aprovados ?? 0} aprovados</span>
                </div>
                {s.responsavel && <p className="text-xs text-muted-foreground mt-1">Responsável: {s.responsavel}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova Sessão de Integração</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Título</Label><Input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ex: Turma Janeiro/2026" /></div>
            <div><Label>Data da Sessão</Label><Input type="date" value={dataSessao} onChange={e => setDataSessao(e.target.value)} /></div>
            <div>
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={(v: "individual" | "grupo") => setTipo(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="grupo">Grupo</SelectItem>
                  <SelectItem value="individual">Individual</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>Cancelar</Button>
            <Button disabled={criarSessao.isPending}
              onClick={() => criarSessao.mutate({ companyId, titulo: titulo || undefined, dataSessao: dataSessao || undefined, tipo })}>
              {criarSessao.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
