import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "../../contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Building2, Search, ArrowLeft, Calendar, Cloud, Users, Wrench, ClipboardList,
  AlertTriangle, Package, MessageSquare, Camera, Video, Plus, Download, FileText,
  Sun, CloudRain, CloudSnow, CloudLightning, Eye, MoreVertical, Trash2, Edit, RefreshCw,
  ChevronRight, MapPin, Clock, BarChart3, CheckCircle, Loader2
} from "lucide-react";

type ViewMode = "obras" | "relatorios" | "detalhe" | "novoRelatorio";

export default function DiarioObra() {
  const { selectedCompanyId } = useCompany();
  const companyId = Number(selectedCompanyId);

  const [view, setView] = useState<ViewMode>("obras");
  const [selectedObraId, setSelectedObraId] = useState<number | null>(null);
  const [selectedRelId, setSelectedRelId] = useState<number | null>(null);
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todas");
  const [mesFilter, setMesFilter] = useState("");
  const [showNovaObra, setShowNovaObra] = useState(false);
  const [showNovoRelatorio, setShowNovoRelatorio] = useState(false);
  const [importando, setImportando] = useState(false);
  const [importandoRel, setImportandoRel] = useState(false);
  const [fotoModal, setFotoModal] = useState<{ id: number; descricao?: string } | null>(null);

  const [novaObra, setNovaObra] = useState({ nome: "", cliente: "", endereco: "", cidade: "", estado: "", responsavel: "", contrato: "" });
  const [novoRel, setNovoRel] = useState({ data: new Date().toISOString().split("T")[0], responsavelNome: "", observacoes: "" });

  const stats = trpc.diarioObra.statsObras.useQuery({ companyId }, { enabled: !!companyId });
  const obras = trpc.diarioObra.listarObras.useQuery({ companyId, status: filtroStatus !== "todas" ? filtroStatus : undefined, busca: busca || undefined }, { enabled: !!companyId });
  const obraDetalhe = trpc.diarioObra.getObra.useQuery({ id: selectedObraId!, companyId }, { enabled: !!selectedObraId && !!companyId });
  const relatorios = trpc.diarioObra.listarRelatorios.useQuery({ companyId, obraId: selectedObraId!, mes: mesFilter || undefined }, { enabled: !!selectedObraId && !!companyId && (view === "relatorios" || view === "detalhe") });
  const relDetalhe = trpc.diarioObra.getRelatorio.useQuery({ id: selectedRelId!, companyId }, { enabled: !!selectedRelId && !!companyId && view === "detalhe" });

  const importarObras = trpc.diarioObra.importarObras.useMutation();
  const importarRel = trpc.diarioObra.importarRelatoriosObra.useMutation();
  const criarObra = trpc.diarioObra.criarObra.useMutation();
  const criarRelatorio = trpc.diarioObra.criarRelatorio.useMutation();
  const deletarObra = trpc.diarioObra.deletarObra.useMutation();
  const deletarRelatorio = trpc.diarioObra.deletarRelatorio.useMutation();

  const fotoData = trpc.diarioObra.getFotoData.useQuery(
    { id: fotoModal?.id ?? 0, companyId },
    { enabled: !!fotoModal && !!companyId }
  );

  const statusLabel = (s: string) => {
    const map: Record<string, { label: string; color: string }> = {
      em_andamento: { label: "Em Andamento", color: "bg-green-500" },
      concluida: { label: "Concluída", color: "bg-blue-500" },
      paralisada: { label: "Paralisada", color: "bg-yellow-500" },
      cancelada: { label: "Cancelada", color: "bg-red-500" },
    };
    return map[s] || { label: s, color: "bg-gray-500" };
  };

  const relStatusLabel = (s: string) => {
    const map: Record<string, { label: string; color: string }> = {
      rascunho: { label: "Rascunho", color: "bg-yellow-500" },
      finalizado: { label: "Finalizado", color: "bg-blue-500" },
      aprovado: { label: "Aprovado", color: "bg-green-500" },
      pendente: { label: "Pendente", color: "bg-orange-500" },
    };
    return map[s] || { label: s, color: "bg-gray-500" };
  };

  const climaIcon = (clima?: string) => {
    if (!clima) return <Cloud className="w-4 h-4 text-gray-400" />;
    const c = clima.toLowerCase();
    if (c.includes("sol") || c.includes("clear") || c.includes("limpo")) return <Sun className="w-4 h-4 text-yellow-500" />;
    if (c.includes("chuva") || c.includes("rain")) return <CloudRain className="w-4 h-4 text-blue-500" />;
    if (c.includes("neve") || c.includes("snow")) return <CloudSnow className="w-4 h-4 text-blue-300" />;
    if (c.includes("trovão") || c.includes("thunder") || c.includes("tempest")) return <CloudLightning className="w-4 h-4 text-purple-500" />;
    return <Cloud className="w-4 h-4 text-gray-500" />;
  };

  const handleImportarObras = async () => {
    setImportando(true);
    try {
      const result = await importarObras.mutateAsync({ companyId });
      alert(`Importação concluída!\n${result.importadas} obras importadas\n${result.ignoradas} já existiam\nTotal: ${result.total}`);
      obras.refetch();
      stats.refetch();
    } catch (e: any) {
      alert(`Erro: ${e.message}`);
    } finally {
      setImportando(false);
    }
  };

  const handleImportarRelatorios = async () => {
    if (!selectedObraId) return;
    setImportandoRel(true);
    try {
      const result = await importarRel.mutateAsync({ companyId, obraId: selectedObraId, comMidia: true });
      alert(`Importação concluída!\n${result.importados} relatórios importados\n${result.ignorados} já existiam\n${result.fotosImportadas} fotos\n${result.videosImportados} vídeos`);
      relatorios.refetch();
      obras.refetch();
    } catch (e: any) {
      alert(`Erro: ${e.message}`);
    } finally {
      setImportandoRel(false);
    }
  };

  const handleCriarObra = async () => {
    try {
      await criarObra.mutateAsync({ companyId, ...novaObra });
      setShowNovaObra(false);
      setNovaObra({ nome: "", cliente: "", endereco: "", cidade: "", estado: "", responsavel: "", contrato: "" });
      obras.refetch();
      stats.refetch();
    } catch (e: any) {
      alert(`Erro: ${e.message}`);
    }
  };

  const handleCriarRelatorio = async () => {
    if (!selectedObraId) return;
    try {
      const result = await criarRelatorio.mutateAsync({ companyId, obraId: selectedObraId, ...novoRel });
      setShowNovoRelatorio(false);
      setNovoRel({ data: new Date().toISOString().split("T")[0], responsavelNome: "", observacoes: "" });
      relatorios.refetch();
      setSelectedRelId(result.id);
      setView("detalhe");
    } catch (e: any) {
      alert(`Erro: ${e.message}`);
    }
  };

  if (view === "detalhe" && relDetalhe.data) {
    const r = relDetalhe.data as any;
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setView("relatorios")}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
          </Button>
          <h1 className="text-2xl font-bold">
            Relatório #{r.numero || r.id} — {r.data ? new Date(r.data).toLocaleDateString("pt-BR") : ""}
          </h1>
          <Badge className={relStatusLabel(r.status).color + " text-white"}>{relStatusLabel(r.status).label}</Badge>
        </div>

        {r.responsavel_nome && (
          <p className="text-sm text-muted-foreground">Responsável: {r.responsavel_nome}</p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Cloud className="w-4 h-4" /> Condição Climática</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              <div className="flex items-center gap-2">{climaIcon(r.clima_manha)} <span>Manhã: {r.clima_manha || "—"} {r.condicao_manha ? `(${r.condicao_manha})` : ""}</span></div>
              <div className="flex items-center gap-2">{climaIcon(r.clima_tarde)} <span>Tarde: {r.clima_tarde || "—"} {r.condicao_tarde ? `(${r.condicao_tarde})` : ""}</span></div>
              <div className="flex items-center gap-2">{climaIcon(r.clima_noite)} <span>Noite: {r.clima_noite || "—"} {r.condicao_noite ? `(${r.condicao_noite})` : ""}</span></div>
              {r.indice_pluviometrico && <div>Pluviométrico: {r.indice_pluviometrico} mm</div>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Clock className="w-4 h-4" /> Horário de Trabalho</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              <div>Início: {r.hora_inicio || "—"}</div>
              <div>Fim: {r.hora_fim || "—"}</div>
              {r.hora_intervalo_inicio && <div>Intervalo: {r.hora_intervalo_inicio} — {r.hora_intervalo_fim}</div>}
              <div className="font-medium">Horas: {r.horas_trabalhadas || "—"}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><FileText className="w-4 h-4" /> Informações</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              {r.dds_realizado && <div>DDS: {r.dds_tema || "Sim"}</div>}
              {r.visitantes && <div>Visitantes: {r.visitantes}</div>}
              {r.observacoes && <div>Obs: {r.observacoes}</div>}
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="maoObra">
          <TabsList className="flex flex-wrap h-auto gap-1">
            <TabsTrigger value="maoObra" className="text-xs">Mão de Obra ({r.maoObra?.length || 0})</TabsTrigger>
            <TabsTrigger value="equipamentos" className="text-xs">Equipamentos ({r.equipamentos?.length || 0})</TabsTrigger>
            <TabsTrigger value="atividades" className="text-xs">Atividades ({r.atividades?.length || 0})</TabsTrigger>
            <TabsTrigger value="ocorrencias" className="text-xs">Ocorrências ({r.ocorrencias?.length || 0})</TabsTrigger>
            <TabsTrigger value="materiais" className="text-xs">Materiais ({r.materiais?.length || 0})</TabsTrigger>
            <TabsTrigger value="comentarios" className="text-xs">Comentários ({r.comentarios?.length || 0})</TabsTrigger>
            <TabsTrigger value="fotos" className="text-xs">Fotos ({r.fotos?.length || 0})</TabsTrigger>
            <TabsTrigger value="videos" className="text-xs">Vídeos ({r.videos?.length || 0})</TabsTrigger>
          </TabsList>

          <TabsContent value="maoObra">
            {r.maoObra?.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead><tr className="border-b bg-muted/50">
                    <th className="text-left p-2">Nome</th><th className="text-left p-2">Função</th><th className="text-left p-2">Empresa</th>
                    <th className="text-left p-2">Tipo</th><th className="text-center p-2">Presente</th><th className="text-left p-2">Horário</th>
                    <th className="text-right p-2">Horas</th>
                  </tr></thead>
                  <tbody>
                    {r.maoObra.map((mo: any) => (
                      <tr key={mo.id} className="border-b hover:bg-muted/30">
                        <td className="p-2">{mo.nome || "—"}</td>
                        <td className="p-2">{mo.funcao || "—"}</td>
                        <td className="p-2">{mo.empresa || "—"}</td>
                        <td className="p-2"><Badge variant="outline" className="text-xs">{mo.tipo === "proprio" ? "Próprio" : "Terceiro"}</Badge></td>
                        <td className="p-2 text-center">{mo.presente ? <CheckCircle className="w-4 h-4 text-green-500 mx-auto" /> : "—"}</td>
                        <td className="p-2">{mo.hora_inicio && mo.hora_fim ? `${mo.hora_inicio} - ${mo.hora_fim}` : "—"}</td>
                        <td className="p-2 text-right">{mo.horas_trabalhadas || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="text-sm text-muted-foreground py-4">Nenhuma mão de obra registrada</p>}
          </TabsContent>

          <TabsContent value="equipamentos">
            {r.equipamentos?.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead><tr className="border-b bg-muted/50">
                    <th className="text-left p-2">Nome</th><th className="text-left p-2">Tipo</th><th className="text-center p-2">Qtd</th>
                    <th className="text-center p-2">Operativo</th><th className="text-left p-2">Situação</th><th className="text-right p-2">Horas</th>
                  </tr></thead>
                  <tbody>
                    {r.equipamentos.map((eq: any) => (
                      <tr key={eq.id} className="border-b hover:bg-muted/30">
                        <td className="p-2">{eq.nome || "—"}</td>
                        <td className="p-2">{eq.tipo || "—"}</td>
                        <td className="p-2 text-center">{eq.quantidade}</td>
                        <td className="p-2 text-center">{eq.operativo ? <CheckCircle className="w-4 h-4 text-green-500 mx-auto" /> : <AlertTriangle className="w-4 h-4 text-yellow-500 mx-auto" />}</td>
                        <td className="p-2">{eq.situacao || "—"}</td>
                        <td className="p-2 text-right">{eq.horas_trabalhadas || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="text-sm text-muted-foreground py-4">Nenhum equipamento registrado</p>}
          </TabsContent>

          <TabsContent value="atividades">
            {r.atividades?.length > 0 ? (
              <div className="space-y-3">
                {r.atividades.map((at: any) => (
                  <Card key={at.id}>
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          {at.item && <span className="font-mono text-xs text-muted-foreground mr-2">{at.item}</span>}
                          <span className="font-medium">{at.descricao || "Sem descrição"}</span>
                          {at.local && <span className="text-sm text-muted-foreground ml-2">({at.local})</span>}
                        </div>
                        {at.percentual_avanco != null && (
                          <Badge variant="outline">{Number(at.percentual_avanco).toFixed(0)}%</Badge>
                        )}
                      </div>
                      {(at.etapa || at.status) && (
                        <div className="text-sm text-muted-foreground mt-1">
                          {at.etapa && <span>Etapa: {at.etapa}</span>}
                          {at.status && <span className="ml-3">Status: {at.status}</span>}
                        </div>
                      )}
                      {(at.unidade || at.quantidade_realizada != null) && (
                        <div className="text-sm mt-1">
                          {at.quantidade_prevista != null && <span>Prev: {at.quantidade_prevista} {at.unidade}</span>}
                          {at.quantidade_realizada != null && <span className="ml-3">Real: {at.quantidade_realizada} {at.unidade}</span>}
                          {at.quantidade_acumulada != null && <span className="ml-3">Acum: {at.quantidade_acumulada} {at.unidade}</span>}
                        </div>
                      )}
                      {at.observacao && <p className="text-sm text-muted-foreground mt-1">{at.observacao}</p>}
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : <p className="text-sm text-muted-foreground py-4">Nenhuma atividade registrada</p>}
          </TabsContent>

          <TabsContent value="ocorrencias">
            {r.ocorrencias?.length > 0 ? (
              <div className="space-y-3">
                {r.ocorrencias.map((oc: any) => (
                  <Card key={oc.id}>
                    <CardContent className="p-4">
                      <p className="font-medium">{oc.descricao}</p>
                      {oc.tipo && <Badge variant="outline" className="mt-1">{oc.tipo}</Badge>}
                      {oc.providencia && <p className="text-sm text-muted-foreground mt-1">Providência: {oc.providencia}</p>}
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : <p className="text-sm text-muted-foreground py-4">Nenhuma ocorrência registrada</p>}
          </TabsContent>

          <TabsContent value="materiais">
            {r.materiais?.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead><tr className="border-b bg-muted/50">
                    <th className="text-left p-2">Tipo</th><th className="text-left p-2">Descrição</th>
                    <th className="text-right p-2">Qtd</th><th className="text-left p-2">Unidade</th>
                    <th className="text-left p-2">NF</th><th className="text-left p-2">Fornecedor</th>
                  </tr></thead>
                  <tbody>
                    {r.materiais.map((m: any) => (
                      <tr key={m.id} className="border-b hover:bg-muted/30">
                        <td className="p-2"><Badge variant="outline" className="text-xs">{m.tipo === "recebido" ? "Recebido" : "Utilizado"}</Badge></td>
                        <td className="p-2">{m.descricao || "—"}</td>
                        <td className="p-2 text-right">{m.quantidade || "—"}</td>
                        <td className="p-2">{m.unidade || "—"}</td>
                        <td className="p-2">{m.nota_fiscal || "—"}</td>
                        <td className="p-2">{m.fornecedor || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="text-sm text-muted-foreground py-4">Nenhum material registrado</p>}
          </TabsContent>

          <TabsContent value="comentarios">
            {r.comentarios?.length > 0 ? (
              <div className="space-y-3">
                {r.comentarios.map((c: any) => (
                  <Card key={c.id}>
                    <CardContent className="p-4">
                      <p>{c.texto}</p>
                      <div className="text-xs text-muted-foreground mt-1">
                        {c.autor && <span>{c.autor}</span>}
                        {c.data_hora && <span className="ml-2">{new Date(c.data_hora).toLocaleString("pt-BR")}</span>}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : <p className="text-sm text-muted-foreground py-4">Nenhum comentário</p>}
          </TabsContent>

          <TabsContent value="fotos">
            {r.fotos?.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {r.fotos.map((f: any) => (
                  <div
                    key={f.id}
                    className="border rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary transition-all"
                    onClick={() => setFotoModal({ id: f.id, descricao: f.descricao })}
                  >
                    <div className="aspect-square bg-muted flex items-center justify-center">
                      <Camera className="w-8 h-8 text-muted-foreground" />
                    </div>
                    {f.descricao && <p className="text-xs p-2 truncate">{f.descricao}</p>}
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-muted-foreground py-4">Nenhuma foto</p>}
          </TabsContent>

          <TabsContent value="videos">
            {r.videos?.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {r.videos.map((v: any) => (
                  <Card key={v.id}>
                    <CardContent className="p-3">
                      <div className="aspect-video bg-muted flex items-center justify-center rounded">
                        <Video className="w-8 h-8 text-muted-foreground" />
                      </div>
                      {v.descricao && <p className="text-xs mt-1 truncate">{v.descricao}</p>}
                      {v.duracao && <p className="text-xs text-muted-foreground">{Math.floor(v.duracao / 60)}:{(v.duracao % 60).toString().padStart(2, "0")}</p>}
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : <p className="text-sm text-muted-foreground py-4">Nenhum vídeo</p>}
          </TabsContent>
        </Tabs>

        {fotoModal && (
          <Dialog open={!!fotoModal} onOpenChange={() => setFotoModal(null)}>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>{fotoModal.descricao || "Foto"}</DialogTitle>
              </DialogHeader>
              <div className="flex items-center justify-center min-h-[300px]">
                {fotoData.isLoading ? (
                  <Loader2 className="w-8 h-8 animate-spin" />
                ) : fotoData.data ? (
                  <img
                    src={`data:${fotoData.data.mimeType};base64,${fotoData.data.base64}`}
                    alt={fotoModal.descricao || "Foto"}
                    className="max-w-full max-h-[70vh] object-contain rounded"
                  />
                ) : (
                  <p className="text-muted-foreground">Foto não disponível</p>
                )}
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
    );
  }

  if (view === "relatorios" && selectedObraId) {
    const obra = obraDetalhe.data as any;
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => { setView("obras"); setSelectedObraId(null); }}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{obra?.nome || "Obra"}</h1>
            {obra?.cliente && <p className="text-sm text-muted-foreground">{obra.cliente}</p>}
          </div>
          {obra?.status && <Badge className={statusLabel(obra.status).color + " text-white"}>{statusLabel(obra.status).label}</Badge>}
        </div>

        {obra && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {obra.endereco && (
              <Card><CardContent className="p-3 flex items-center gap-2"><MapPin className="w-4 h-4 text-muted-foreground" /><span className="text-sm">{obra.endereco}{obra.cidade ? `, ${obra.cidade}` : ""}{obra.estado ? ` - ${obra.estado}` : ""}</span></CardContent></Card>
            )}
            {obra.responsavel && (
              <Card><CardContent className="p-3 flex items-center gap-2"><Users className="w-4 h-4 text-muted-foreground" /><span className="text-sm">{obra.responsavel}</span></CardContent></Card>
            )}
            <Card><CardContent className="p-3 flex items-center gap-2"><ClipboardList className="w-4 h-4 text-muted-foreground" /><span className="text-sm">{obra.total_relatorios || 0} relatórios</span></CardContent></Card>
            <Card><CardContent className="p-3 flex items-center gap-2"><Camera className="w-4 h-4 text-muted-foreground" /><span className="text-sm">{obra.total_fotos || 0} fotos</span></CardContent></Card>
          </div>
        )}

        <div className="flex items-center gap-3 flex-wrap">
          <Input type="month" value={mesFilter} onChange={e => setMesFilter(e.target.value)} className="w-48" placeholder="Filtrar por mês" />
          <Button size="sm" onClick={() => setShowNovoRelatorio(true)}>
            <Plus className="w-4 h-4 mr-1" /> Novo Relatório
          </Button>
          {obra?.external_id && (
            <Button size="sm" variant="outline" onClick={handleImportarRelatorios} disabled={importandoRel}>
              {importandoRel ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Download className="w-4 h-4 mr-1" />}
              {importandoRel ? "Importando..." : "Importar Relatórios"}
            </Button>
          )}
        </div>

        <div className="space-y-2">
          {relatorios.isLoading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : relatorios.data && (relatorios.data as any[]).length > 0 ? (
            (relatorios.data as any[]).map((rel: any) => (
              <Card
                key={rel.id}
                className="cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => { setSelectedRelId(rel.id); setView("detalhe"); }}
              >
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="text-center min-w-[60px]">
                      <div className="text-2xl font-bold">{rel.numero || "—"}</div>
                      <div className="text-xs text-muted-foreground">RDO</div>
                    </div>
                    <div>
                      <div className="font-medium flex items-center gap-2">
                        <Calendar className="w-4 h-4" />
                        {rel.data ? new Date(rel.data).toLocaleDateString("pt-BR") : "—"}
                      </div>
                      <div className="text-sm text-muted-foreground flex items-center gap-3">
                        {rel.responsavel_nome && <span>{rel.responsavel_nome}</span>}
                        {rel.clima_manha && <span className="flex items-center gap-1">{climaIcon(rel.clima_manha)} {rel.clima_manha}</span>}
                        {rel.horas_trabalhadas && <span>{rel.horas_trabalhadas}h</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={relStatusLabel(rel.status).color + " text-white text-xs"}>{relStatusLabel(rel.status).label}</Badge>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <ClipboardList className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>Nenhum relatório encontrado</p>
              {obra?.external_id && <p className="text-sm mt-1">Clique em "Importar Relatórios" para trazer os dados do Diário de Obra</p>}
            </div>
          )}
        </div>

        <Dialog open={showNovoRelatorio} onOpenChange={setShowNovoRelatorio}>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo Relatório</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Data</Label><Input type="date" value={novoRel.data} onChange={e => setNovoRel({ ...novoRel, data: e.target.value })} /></div>
              <div><Label>Responsável</Label><Input value={novoRel.responsavelNome} onChange={e => setNovoRel({ ...novoRel, responsavelNome: e.target.value })} placeholder="Nome do responsável" /></div>
              <div><Label>Observações</Label><Textarea value={novoRel.observacoes} onChange={e => setNovoRel({ ...novoRel, observacoes: e.target.value })} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowNovoRelatorio(false)}>Cancelar</Button>
              <Button onClick={handleCriarRelatorio} disabled={!novoRel.data}>Criar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="w-6 h-6" /> Diário de Obra
          </h1>
          <p className="text-sm text-muted-foreground">Gestão completa de obras e relatórios diários</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={handleImportarObras} disabled={importando}>
            {importando ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Download className="w-4 h-4 mr-1" />}
            {importando ? "Importando..." : "Importar do Diário de Obra"}
          </Button>
          <Button size="sm" onClick={() => setShowNovaObra(true)}>
            <Plus className="w-4 h-4 mr-1" /> Nova Obra
          </Button>
        </div>
      </div>

      {stats.data && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card><CardContent className="p-4 text-center"><div className="text-3xl font-bold">{Number(stats.data.total)}</div><div className="text-xs text-muted-foreground">Total de Obras</div></CardContent></Card>
          <Card><CardContent className="p-4 text-center"><div className="text-3xl font-bold text-green-500">{Number(stats.data.em_andamento)}</div><div className="text-xs text-muted-foreground">Em Andamento</div></CardContent></Card>
          <Card><CardContent className="p-4 text-center"><div className="text-3xl font-bold text-blue-500">{Number(stats.data.concluida)}</div><div className="text-xs text-muted-foreground">Concluídas</div></CardContent></Card>
          <Card><CardContent className="p-4 text-center"><div className="text-3xl font-bold text-yellow-500">{Number(stats.data.paralisada)}</div><div className="text-xs text-muted-foreground">Paralisadas</div></CardContent></Card>
          <Card><CardContent className="p-4 text-center"><div className="text-3xl font-bold">{Number(stats.data.total_relatorios)}</div><div className="text-xs text-muted-foreground">Relatórios</div></CardContent></Card>
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar obras..." value={busca} onChange={e => setBusca(e.target.value)} />
        </div>
        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas</SelectItem>
            <SelectItem value="em_andamento">Em Andamento</SelectItem>
            <SelectItem value="concluida">Concluídas</SelectItem>
            <SelectItem value="paralisada">Paralisadas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {obras.isLoading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 animate-spin" /></div>
      ) : obras.data && (obras.data as any[]).length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(obras.data as any[]).map((obra: any) => (
            <Card
              key={obra.id}
              className="cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all"
              onClick={() => { setSelectedObraId(obra.id); setView("relatorios"); }}
            >
              <CardContent className="p-4">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-semibold text-sm line-clamp-2">{obra.nome}</h3>
                  <Badge className={statusLabel(obra.status).color + " text-white text-xs shrink-0 ml-2"}>
                    {statusLabel(obra.status).label}
                  </Badge>
                </div>
                {obra.cliente && <p className="text-xs text-muted-foreground mb-1">{obra.cliente}</p>}
                {(obra.cidade || obra.estado) && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mb-2">
                    <MapPin className="w-3 h-3" /> {obra.cidade}{obra.estado ? ` - ${obra.estado}` : ""}
                  </p>
                )}
                <div className="flex items-center gap-4 text-xs text-muted-foreground mt-auto pt-2 border-t">
                  <span className="flex items-center gap-1"><ClipboardList className="w-3 h-3" /> {obra.total_relatorios || 0} RDOs</span>
                  <span className="flex items-center gap-1"><Camera className="w-3 h-3" /> {obra.total_fotos || 0} fotos</span>
                  {obra.data_inicio && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {new Date(obra.data_inicio).toLocaleDateString("pt-BR")}</span>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <Building2 className="w-16 h-16 mx-auto mb-3 opacity-50" />
          <p className="text-lg">Nenhuma obra cadastrada</p>
          <p className="text-sm mt-1">Clique em "Importar do Diário de Obra" ou "Nova Obra" para começar</p>
        </div>
      )}

      <Dialog open={showNovaObra} onOpenChange={setShowNovaObra}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova Obra</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Nome da Obra *</Label><Input value={novaObra.nome} onChange={e => setNovaObra({ ...novaObra, nome: e.target.value })} placeholder="Ex: Edifício Residencial Alpha" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Cliente</Label><Input value={novaObra.cliente} onChange={e => setNovaObra({ ...novaObra, cliente: e.target.value })} /></div>
              <div><Label>Contrato</Label><Input value={novaObra.contrato} onChange={e => setNovaObra({ ...novaObra, contrato: e.target.value })} /></div>
            </div>
            <div><Label>Endereço</Label><Input value={novaObra.endereco} onChange={e => setNovaObra({ ...novaObra, endereco: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Cidade</Label><Input value={novaObra.cidade} onChange={e => setNovaObra({ ...novaObra, cidade: e.target.value })} /></div>
              <div><Label>Estado</Label><Input value={novaObra.estado} onChange={e => setNovaObra({ ...novaObra, estado: e.target.value })} /></div>
            </div>
            <div><Label>Responsável</Label><Input value={novaObra.responsavel} onChange={e => setNovaObra({ ...novaObra, responsavel: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNovaObra(false)}>Cancelar</Button>
            <Button onClick={handleCriarObra} disabled={!novaObra.nome}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
