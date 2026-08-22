import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  Blocks, Plus, Loader2, ArrowLeft, Eye,
  AlertTriangle, CheckCircle, Clock,
  Map as MapIcon, FileText, Undo2, Eraser, Trash2, Search,
} from "lucide-react";
import PlantaViewer, { type PlantaExtra } from "@/pages/apontamento/PlantaViewer";

// Cor do elemento na planta / badge de qualidade:
// vermelho = algum ensaio reprovado; verde = ensaio aprovado; âmbar = concretado
// aguardando ensaio; azul = pendente.
function corQualidade(e: any): string {
  if (Number(e?.ensaios_reprovados) > 0) return "#dc2626";
  if (Number(e?.ensaios_aprovados) > 0) return "#16a34a";
  if (e?.status === "concretado") return "#f59e0b";
  return "#3b82f6";
}

const TIPOS_ELEMENTO = ["Laje", "Viga", "Pilar", "Bloco de Fundação", "Estaca", "Sapata", "Baldrame", "Muro de Arrimo", "Reservatório", "Piso"];

export default function Concretagem() {
  const { companyId } = useCompany();
  const [location] = useLocation();
  const params = new URLSearchParams(location.split("?")[1] || "");
  const obraIdParam = Number(params.get("obra")) || 0;
  const [filtroStatusObra, setFiltroStatusObra] = useState<string>("Em_Andamento");
  const todasObras = trpc.obras.list.useQuery({ companyId }, { enabled: !!companyId });
  const obrasFiltradas = (todasObras.data as any[])?.filter((o: any) =>
    filtroStatusObra === "todas" ? true : o.status === filtroStatusObra
  ) || [];
  const [obraId, setObraId] = useState<number>(obraIdParam);
  const selectedObraId = obraId || obraIdParam || obrasFiltradas[0]?.id || 0;

  const mapa = trpc.operacional.listarConcretagem.useQuery(
    { companyId, obraId: selectedObraId },
    { enabled: !!companyId && !!selectedObraId },
  );

  const [dialogNovoElemento, setDialogNovoElemento] = useState(false);
  const [dialogLancamento, setDialogLancamento] = useState<number | null>(null);
  const [viewLancamentos, setViewLancamentos] = useState<number | null>(null);
  const [dialogCP, setDialogCP] = useState<number | null>(null);

  const [novoElemento, setNovoElemento] = useState({ pavimento: "", elemento: "", tipoElemento: "", fck: 25, volumePrevisto: 0, dataPrevista: "" });
  const [lancForm, setLancForm] = useState<any>({});
  const [cpForm, setCpForm] = useState<any>({});

  // ===== Trecho na planta (mapa de concretagem visual) =====
  const [dialogPlanta, setDialogPlanta] = useState<any | null>(null); // elemento do mapa
  const [plantaPav, setPlantaPav] = useState<number>(0);
  const [desenho, setDesenho] = useState<{ x: number; y: number }[]>([]);
  const [desenhoCtx, setDesenhoCtx] = useState<{ pdfId: number; pagina: number } | null>(null);
  const pavimentos = trpc.medicao.listarPavimentosObra.useQuery(
    { companyId, obraId: selectedObraId },
    { enabled: !!dialogPlanta && !!companyId && !!selectedObraId },
  );
  const pavSel = plantaPav || Number((pavimentos.data as any[])?.[0]?.id) || 0;
  const trechos = trpc.operacional.listarTrechosConcretagem.useQuery(
    { companyId, obraId: selectedObraId },
    { enabled: !!dialogPlanta && !!companyId && !!selectedObraId },
  );
  const salvarTrecho = trpc.operacional.salvarTrechoConcretagem.useMutation({
    onSuccess: () => { toast.success("Trecho salvo na planta!"); setDesenho([]); setDesenhoCtx(null); trechos.refetch(); mapa.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const excluirTrecho = trpc.operacional.excluirTrechoConcretagem.useMutation({
    onSuccess: () => { toast.success("Trecho removido"); trechos.refetch(); mapa.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const extras: PlantaExtra[] = ((trechos.data as any[]) || []).map((t: any) => {
    let pts: any[] = [];
    try { pts = JSON.parse(t.geometria_json || "[]"); } catch { /* geometria inválida */ }
    const elem = (mapa.data as any[])?.find((e: any) => Number(e.id) === Number(t.mapa_id));
    return {
      id: Number(t.id), pdfId: Number(t.pdf_id), pagina: Number(t.pagina || 1),
      pontos: pts, cor: corQualidade(elem || { status: "concretado" }), rotulo: String(t.elemento || ""),
    };
  });
  const trechosDoElemento = ((trechos.data as any[]) || []).filter((t: any) => Number(t.mapa_id) === Number(dialogPlanta?.id));
  const abrirPlanta = (elem: any) => { setDesenho([]); setDesenhoCtx(null); setPlantaPav(0); setDialogPlanta(elem); };

  // Poka-yoke de volume: previsto × já lançado do elemento em edição
  const elemLanc = (mapa.data as any[])?.find((e: any) => Number(e.id) === Number(dialogLancamento));
  const infoVolume = elemLanc ? (() => {
    const prev = parseFloat(elemLanc.volume_previsto || 0);
    const real = parseFloat(elemLanc.volume_realizado || 0);
    const novo = parseFloat(lancForm.volumeEntregue || 0);
    const estoura = prev > 0 && real + novo > prev * 1.1;
    return (
      <div className={`text-xs rounded-md px-2 py-1.5 ${estoura ? "bg-red-50 text-red-600" : "bg-slate-50 text-gray-500"}`}>
        Previsto: <b>{prev.toFixed(1)} m³</b> • Já lançado: <b>{real.toFixed(1)} m³</b>
        {novo > 0 && <> • Com este caminhão: <b>{(real + novo).toFixed(1)} m³</b></>}
        {estoura && <span className="flex items-center gap-1 mt-0.5"><AlertTriangle className="w-3 h-3" /> Soma dos caminhões vai passar o volume previsto em mais de 10%</span>}
      </div>
    );
  })() : null;

  // Nota de remessa digitada na obra — referência para localizar o caminhão.
  const camposNfe = (
    <div className="grid grid-cols-2 gap-3">
      <div><Label>Fornecedor</Label><Input value={lancForm.fornecedor || ""} onChange={(e) => setLancForm({ ...lancForm, fornecedor: e.target.value })} /></div>
      <div><Label>Nota de Remessa</Label><Input inputMode="numeric" placeholder="Nº da nota que chega com o caminhão" value={lancForm.notaFiscal || ""} onChange={(e) => setLancForm({ ...lancForm, notaFiscal: e.target.value })} /></div>
    </div>
  );

  const dialogPlantaEl = (
    <Dialog open={!!dialogPlanta} onOpenChange={(o) => { if (!o) setDialogPlanta(null); }}>
      <DialogContent className="max-w-[95vw] md:max-w-4xl max-h-[92dvh] overflow-y-auto rounded-2xl p-3 md:p-5">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <MapIcon className="w-4 h-4 text-amber-600" /> Trecho na planta — {dialogPlanta?.elemento}
          </DialogTitle>
        </DialogHeader>
        {(pavimentos.data as any[])?.length ? (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {(pavimentos.data as any[]).map((p: any) => (
                <button key={p.id} type="button"
                  className={`rounded-full border px-3 py-1.5 text-[11px] font-medium ${Number(p.id) === pavSel ? "border-amber-500 bg-amber-100 text-amber-800" : "border-slate-200 text-gray-500"}`}
                  onClick={() => { setPlantaPav(Number(p.id)); setDesenho([]); setDesenhoCtx(null); }}>
                  {p.nome}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500">Toque na planta para marcar os cantos do trecho concretado (mín. 3 pontos).</p>
            {pavSel > 0 && (
              <PlantaViewer inline companyId={companyId} obraId={selectedObraId} pavimentoId={pavSel}
                extras={extras}
                desenhoPontos={desenho}
                onDesenharPonto={(p, ctx) => {
                  setDesenho((d) => (desenhoCtx && (desenhoCtx.pdfId !== ctx.pdfId || desenhoCtx.pagina !== ctx.pagina)) ? [p] : [...d, p]);
                  setDesenhoCtx(ctx);
                }} />
            )}
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={!desenho.length} onClick={() => setDesenho((d) => d.slice(0, -1))}>
                <Undo2 className="w-4 h-4 mr-1" /> Desfazer
              </Button>
              <Button size="sm" variant="outline" disabled={!desenho.length} onClick={() => { setDesenho([]); }}>
                <Eraser className="w-4 h-4 mr-1" /> Limpar
              </Button>
              <Button size="sm" className="ml-auto" disabled={desenho.length < 3 || !desenhoCtx || salvarTrecho.isPending}
                onClick={() => salvarTrecho.mutate({
                  companyId, obraId: selectedObraId, mapaId: Number(dialogPlanta.id),
                  pavimentoId: pavSel, pdfId: desenhoCtx!.pdfId, pagina: desenhoCtx!.pagina,
                  geometriaJson: JSON.stringify(desenho),
                })}>
                {salvarTrecho.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-1" />}
                Salvar trecho
              </Button>
            </div>
            {trechosDoElemento.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-gray-500">Trechos deste elemento:</p>
                {trechosDoElemento.map((t: any) => (
                  <div key={t.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-1.5 text-sm">
                    <span>Trecho #{t.id} — pág. {t.pagina || 1}</span>
                    <Button size="sm" variant="ghost" className="text-red-500 h-7" disabled={excluirTrecho.isPending}
                      onClick={() => excluirTrecho.mutate({ id: Number(t.id), companyId })}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : pavimentos.isLoading ? (
          <div className="text-center py-10 text-gray-400"><Loader2 className="w-5 h-5 animate-spin inline" /></div>
        ) : (
          <p className="text-center py-8 text-sm text-gray-400">
            Esta obra ainda não tem pavimentos com planta importada — importe o projeto no Levantamento de Campo.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );

  const criarElemento = trpc.operacional.criarElementoConcretagem.useMutation({
    onSuccess: () => { toast.success("Elemento adicionado!"); mapa.refetch(); setDialogNovoElemento(false); },
  });
  const registrarLanc = trpc.operacional.registrarLancamento.useMutation({
    onSuccess: (data) => {
      toast.success(`Lançamento registrado! Tempo máx: ${data.tempoMaximoMinutos || "—"} min`);
      if (data.tempoMaximoMinutos && data.tempoMaximoMinutos > 150) {
        toast.warning("Atenção: tempo entre saída da usina e fim do lançamento excedeu 2h30!");
      }
      mapa.refetch();
      setDialogLancamento(null);
    },
  });
  const registrarCP = trpc.operacional.registrarCP.useMutation({
    onSuccess: () => { toast.success("CP registrado!"); setDialogCP(null); },
  });

  const lancamentos = trpc.operacional.listarLancamentos.useQuery(
    { mapaId: viewLancamentos!, companyId },
    { enabled: !!viewLancamentos && !!companyId },
  );

  if (viewLancamentos) {
    const elem = (mapa.data as any[])?.find((e: any) => e.id === viewLancamentos);
    return (
      <div className="p-6 space-y-4 max-w-5xl mx-auto">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setViewLancamentos(null)}><ArrowLeft className="w-4 h-4" /></Button>
          <h1 className="text-xl font-bold">Lançamentos — {elem?.elemento}</h1>
          <Badge variant="outline">{elem?.pavimento}</Badge>
          <Badge variant="outline">fck {elem?.fck} MPa</Badge>
        </div>

        <div className="flex gap-3">
          <Button onClick={() => { setLancForm({ dataLancamento: new Date().toISOString().split("T")[0], volumeEntregue: 0 }); setDialogLancamento(viewLancamentos); }}>
            <Plus className="w-4 h-4 mr-2" /> Novo Lançamento
          </Button>
        </div>

        {lancamentos.isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-amber-500" /></div>
        ) : (lancamentos.data as any[])?.length === 0 ? (
          <p className="text-center py-8 text-gray-400">Nenhum lançamento registrado</p>
        ) : (
          <div className="space-y-3">
            {(lancamentos.data as any[])?.map((l: any) => (
              <Card key={l.id}>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{new Date(l.data_lancamento + "T12:00:00").toLocaleDateString("pt-BR")}</p>
                      <p className="text-sm text-gray-500">
                        {l.fornecedor && `Fornecedor: ${l.fornecedor} • `}
                        {l.nota_fiscal && `Remessa: ${l.nota_fiscal} • `}
                        Volume: {l.volume_entregue} m³
                      </p>
                      {Number(l.ensaios_total) > 0 && (
                        <p className={`text-xs mt-0.5 ${Number(l.ensaios_reprovados) > 0 ? "text-red-600 font-medium" : Number(l.ensaios_aprovados) > 0 ? "text-green-600" : "text-amber-600"}`}>
                          {Number(l.ensaios_reprovados) > 0 ? "Ensaio REPROVADO (fck abaixo do projeto)"
                            : Number(l.ensaios_aprovados) > 0 ? "Ensaio aprovado"
                            : "Ensaio aguardando ruptura"} • {l.ensaios_total} ensaio(s)
                        </p>
                      )}
                      <div className="flex gap-4 text-xs text-gray-400 mt-1">
                        {l.hora_saida_usina && <span>Saída usina: {l.hora_saida_usina}</span>}
                        {l.hora_chegada_obra && <span>Chegada: {l.hora_chegada_obra}</span>}
                        {l.hora_inicio_lancamento && <span>Início: {l.hora_inicio_lancamento}</span>}
                        {l.hora_fim_lancamento && <span>Fim: {l.hora_fim_lancamento}</span>}
                      </div>
                      {l.tempo_maximo_minutos && l.tempo_maximo_minutos > 150 && (
                        <div className="flex items-center gap-1 text-xs text-red-500 mt-1">
                          <AlertTriangle className="w-3 h-3" /> Tempo excedido: {l.tempo_maximo_minutos} min
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{l.total_cps || 0} CPs</Badge>
                      <Button size="sm" variant="outline" onClick={() => { setCpForm({ lancamentoId: l.id, numeroCp: "", dataMoldagem: l.data_lancamento, fckProjeto: 0 }); setDialogCP(l.id); }}>
                        <Plus className="w-3 h-3 mr-1" /> CP
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={!!dialogLancamento} onOpenChange={() => setDialogLancamento(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Novo Lançamento de Concreto</DialogTitle></DialogHeader>
            <div className="space-y-3 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Data</Label><Input type="date" value={lancForm.dataLancamento || ""} onChange={(e) => setLancForm({ ...lancForm, dataLancamento: e.target.value })} /></div>
                <div><Label>Volume (m³)</Label><Input type="number" step="0.1" value={lancForm.volumeEntregue || ""} onChange={(e) => setLancForm({ ...lancForm, volumeEntregue: parseFloat(e.target.value) || 0 })} /></div>
              </div>
              {camposNfe}
              {infoVolume}
              <div className="grid grid-cols-2 gap-3">
                <div><Label>fck Nota (MPa)</Label><Input type="number" value={lancForm.fckNota || ""} onChange={(e) => setLancForm({ ...lancForm, fckNota: parseInt(e.target.value) || 0 })} /></div>
                <div><Label>Temperatura (°C)</Label><Input type="number" value={lancForm.temperatura || ""} onChange={(e) => setLancForm({ ...lancForm, temperatura: parseInt(e.target.value) || 0 })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Slump Previsto (cm)</Label><Input type="number" value={lancForm.slumpPrevisto || ""} onChange={(e) => setLancForm({ ...lancForm, slumpPrevisto: parseInt(e.target.value) || 0 })} /></div>
                <div><Label>Slump Realizado (cm)</Label><Input type="number" value={lancForm.slumpRealizado || ""} onChange={(e) => setLancForm({ ...lancForm, slumpRealizado: parseInt(e.target.value) || 0 })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Saída Usina</Label><Input type="time" value={lancForm.horaSaidaUsina || ""} onChange={(e) => setLancForm({ ...lancForm, horaSaidaUsina: e.target.value })} /></div>
                <div><Label>Chegada Obra</Label><Input type="time" value={lancForm.horaChegadaObra || ""} onChange={(e) => setLancForm({ ...lancForm, horaChegadaObra: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Início Lançamento</Label><Input type="time" value={lancForm.horaInicioLancamento || ""} onChange={(e) => setLancForm({ ...lancForm, horaInicioLancamento: e.target.value })} /></div>
                <div><Label>Fim Lançamento</Label><Input type="time" value={lancForm.horaFimLancamento || ""} onChange={(e) => setLancForm({ ...lancForm, horaFimLancamento: e.target.value })} /></div>
              </div>
              <div><Label>Observações</Label><Textarea value={lancForm.observacoes || ""} onChange={(e) => setLancForm({ ...lancForm, observacoes: e.target.value })} /></div>
              <Button className="w-full" disabled={!lancForm.volumeEntregue || registrarLanc.isPending}
                onClick={() => registrarLanc.mutate({ mapaId: viewLancamentos!, companyId, obraId: selectedObraId, ...lancForm })}>
                {registrarLanc.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Registrar Lançamento
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={!!dialogCP} onOpenChange={() => setDialogCP(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Registrar Corpo de Prova</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Número CP</Label><Input value={cpForm.numeroCp || ""} onChange={(e) => setCpForm({ ...cpForm, numeroCp: e.target.value })} placeholder="Ex: CP-001" /></div>
              <div><Label>Data Moldagem</Label><Input type="date" value={cpForm.dataMoldagem || ""} onChange={(e) => setCpForm({ ...cpForm, dataMoldagem: e.target.value })} /></div>
              <div><Label>fck Projeto (MPa)</Label><Input type="number" value={cpForm.fckProjeto || ""} onChange={(e) => setCpForm({ ...cpForm, fckProjeto: parseInt(e.target.value) || 0 })} /></div>
              <Button className="w-full" disabled={!cpForm.numeroCp || registrarCP.isPending}
                onClick={() => registrarCP.mutate({ lancamentoId: dialogCP!, companyId, ...cpForm })}>
                Registrar CP
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Mapa de Concretagem</h1>
          <p className="text-sm text-gray-500">Controle de lançamentos de concreto</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select value={filtroStatusObra} onValueChange={(v) => { setFiltroStatusObra(v); setObraId(0); }}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Em_Andamento">Em andamento</SelectItem>
              <SelectItem value="Concluida">Concluídas</SelectItem>
              <SelectItem value="Paralisada">Paralisadas</SelectItem>
              <SelectItem value="todas">Todas</SelectItem>
            </SelectContent>
          </Select>
          <Select value={String(selectedObraId || "")} onValueChange={(v) => setObraId(Number(v))}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Selecione a obra" /></SelectTrigger>
            <SelectContent>
              {obrasFiltradas.map((o: any) => <SelectItem key={o.id} value={String(o.id)}>{o.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={() => { setNovoElemento({ pavimento: "", elemento: "", tipoElemento: "", fck: 25, volumePrevisto: 0, dataPrevista: "" }); setDialogNovoElemento(true); }} disabled={!selectedObraId}>
            <Plus className="w-4 h-4 mr-2" /> Novo Elemento
          </Button>
        </div>
      </div>

      {mapa.isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-amber-500" /></div>
      ) : (mapa.data as any[])?.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <Blocks className="w-16 h-16 mx-auto mb-4 opacity-30" />
          <p>Nenhum elemento de concretagem cadastrado</p>
        </div>
      ) : (
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-gray-50 text-left text-gray-500">
              <th className="py-2 px-3">Pavimento</th>
              <th className="py-2 px-3">Elemento</th>
              <th className="py-2 px-3">Tipo</th>
              <th className="py-2 px-3">fck (MPa)</th>
              <th className="py-2 px-3">Vol. Previsto (m³)</th>
              <th className="py-2 px-3">Vol. Realizado (m³)</th>
              <th className="py-2 px-3">Status</th>
              <th className="py-2 px-3">Qualidade</th>
              <th className="py-2 px-3 w-32">Ações</th>
            </tr></thead>
            <tbody>
              {(mapa.data as any[])?.map((e: any) => {
                const volReal = parseFloat(e.volume_realizado || 0);
                const volPrev = parseFloat(e.volume_previsto || 0);
                const diff = volPrev > 0 ? ((volReal - volPrev) / volPrev * 100).toFixed(1) : null;
                return (
                  <tr key={e.id} className="border-b hover:bg-gray-50">
                    <td className="py-2 px-3">{e.pavimento || "—"}</td>
                    <td className="py-2 px-3 font-medium">{e.elemento}</td>
                    <td className="py-2 px-3">{e.tipo_elemento || "—"}</td>
                    <td className="py-2 px-3">{e.fck}</td>
                    <td className="py-2 px-3">{volPrev.toFixed(1)}</td>
                    <td className="py-2 px-3">
                      {volReal.toFixed(1)}
                      {diff && <span className={`text-xs ml-1 ${parseFloat(diff) > 10 ? "text-red-500" : "text-green-500"}`}>({diff}%)</span>}
                    </td>
                    <td className="py-2 px-3">
                      <Badge variant={e.status === "concretado" ? "default" : "secondary"}>
                        {e.status === "concretado" ? "Concretado" : "Pendente"}
                      </Badge>
                    </td>
                    <td className="py-2 px-3">
                      {Number(e.ensaios_reprovados) > 0 ? (
                        <Badge className="bg-red-100 text-red-700 hover:bg-red-100 gap-1"><AlertTriangle className="w-3 h-3" /> fck reprovado</Badge>
                      ) : Number(e.ensaios_aprovados) > 0 ? (
                        <Badge className="bg-green-100 text-green-700 hover:bg-green-100 gap-1"><CheckCircle className="w-3 h-3" /> fck ok</Badge>
                      ) : Number(e.ensaios_total) > 0 ? (
                        <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 gap-1"><Clock className="w-3 h-3" /> aguardando</Badge>
                      ) : (
                        <span className="text-gray-300 text-xs">sem ensaio</span>
                      )}
                    </td>
                    <td className="py-2 px-3">
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setViewLancamentos(e.id)}>
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => { setLancForm({ dataLancamento: new Date().toISOString().split("T")[0], volumeEntregue: 0 }); setDialogLancamento(e.id); }}>
                          <Plus className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="ghost" title="Trecho na planta" className={Number(e.total_trechos) > 0 ? "text-amber-600" : "text-gray-400"}
                          onClick={() => abrirPlanta(e)}>
                          <MapIcon className="w-4 h-4" />
                          {Number(e.total_trechos) > 0 && <span className="text-[10px] ml-0.5">{e.total_trechos}</span>}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={dialogNovoElemento} onOpenChange={setDialogNovoElemento}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo Elemento de Concretagem</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Pavimento</Label><Input value={novoElemento.pavimento} onChange={(e) => setNovoElemento({ ...novoElemento, pavimento: e.target.value })} placeholder="Ex: Térreo, 1° Pav." /></div>
            <div><Label>Elemento</Label><Input value={novoElemento.elemento} onChange={(e) => setNovoElemento({ ...novoElemento, elemento: e.target.value })} placeholder="Ex: Laje L1, Viga V01" /></div>
            <div><Label>Tipo</Label>
              <Select value={novoElemento.tipoElemento} onValueChange={(v) => setNovoElemento({ ...novoElemento, tipoElemento: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{TIPOS_ELEMENTO.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>fck (MPa)</Label><Input type="number" value={novoElemento.fck} onChange={(e) => setNovoElemento({ ...novoElemento, fck: parseInt(e.target.value) || 25 })} /></div>
              <div><Label>Volume Previsto (m³)</Label><Input type="number" step="0.1" value={novoElemento.volumePrevisto || ""} onChange={(e) => setNovoElemento({ ...novoElemento, volumePrevisto: parseFloat(e.target.value) || 0 })} /></div>
            </div>
            <div><Label>Data Prevista</Label><Input type="date" value={novoElemento.dataPrevista} onChange={(e) => setNovoElemento({ ...novoElemento, dataPrevista: e.target.value })} /></div>
            <Button className="w-full" disabled={!novoElemento.elemento || criarElemento.isPending}
              onClick={() => criarElemento.mutate({ companyId, obraId: selectedObraId, ...novoElemento })}>
              {criarElemento.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Adicionar Elemento
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!dialogLancamento && !viewLancamentos} onOpenChange={() => setDialogLancamento(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Novo Lançamento de Concreto</DialogTitle></DialogHeader>
          <div className="space-y-3 max-h-[70vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Data</Label><Input type="date" value={lancForm.dataLancamento || ""} onChange={(e) => setLancForm({ ...lancForm, dataLancamento: e.target.value })} /></div>
              <div><Label>Volume (m³)</Label><Input type="number" step="0.1" value={lancForm.volumeEntregue || ""} onChange={(e) => setLancForm({ ...lancForm, volumeEntregue: parseFloat(e.target.value) || 0 })} /></div>
            </div>
            {camposNfe}
            {infoVolume}
            <div className="grid grid-cols-2 gap-3">
              <div><Label>fck Nota (MPa)</Label><Input type="number" value={lancForm.fckNota || ""} onChange={(e) => setLancForm({ ...lancForm, fckNota: parseInt(e.target.value) || 0 })} /></div>
              <div><Label>Saída Usina</Label><Input type="time" value={lancForm.horaSaidaUsina || ""} onChange={(e) => setLancForm({ ...lancForm, horaSaidaUsina: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Chegada Obra</Label><Input type="time" value={lancForm.horaChegadaObra || ""} onChange={(e) => setLancForm({ ...lancForm, horaChegadaObra: e.target.value })} /></div>
              <div><Label>Início Lançamento</Label><Input type="time" value={lancForm.horaInicioLancamento || ""} onChange={(e) => setLancForm({ ...lancForm, horaInicioLancamento: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Fim Lançamento</Label><Input type="time" value={lancForm.horaFimLancamento || ""} onChange={(e) => setLancForm({ ...lancForm, horaFimLancamento: e.target.value })} /></div>
            </div>
            <Button className="w-full" disabled={!lancForm.volumeEntregue || registrarLanc.isPending}
              onClick={() => registrarLanc.mutate({ mapaId: dialogLancamento!, companyId, obraId: selectedObraId, ...lancForm })}>
              Registrar Lançamento
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {dialogPlantaEl}
    </div>
  );
}
