// Rev. 2373 — Inventário Visual de Baias (areia, pedra, lajota — granel).
// Operador olha a baia física e toca em 1 de 5 botões grandes:
// VAZIA / 1/4 / METADE / 3/4 / CHEIA. Foto opcional. Histórico fica registrado.
// Pensado pra operador de 4ª série: poucos cliques, contraste alto, sem digitação.
import DashboardLayout from "@/components/DashboardLayout";
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { toast } from "sonner";
import {
  Package, Plus, Loader2, Camera, X, History, Building2, Pencil, Trash2,
  TrendingUp, TrendingDown, Minus, ImagePlus, CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { compressImageIfNeeded } from "@/lib/imageCompress";

const NIVEIS = [
  { pct: 0,   label: "VAZIA",   curto: "0",     cor: "bg-red-600 hover:bg-red-700 ring-red-300",       texto: "text-white" },
  { pct: 25,  label: "1/4",     curto: "25%",   cor: "bg-orange-500 hover:bg-orange-600 ring-orange-300", texto: "text-white" },
  { pct: 50,  label: "METADE",  curto: "50%",   cor: "bg-amber-500 hover:bg-amber-600 ring-amber-300",    texto: "text-white" },
  { pct: 75,  label: "3/4",     curto: "75%",   cor: "bg-lime-600 hover:bg-lime-700 ring-lime-300",       texto: "text-white" },
  { pct: 100, label: "CHEIA",   curto: "100%",  cor: "bg-emerald-600 hover:bg-emerald-700 ring-emerald-300", texto: "text-white" },
] as const;

function corPorPct(pct: number | null | undefined) {
  if (pct == null) return "bg-slate-300";
  if (pct === 0) return "bg-red-600";
  if (pct <= 25) return "bg-orange-500";
  if (pct <= 50) return "bg-amber-500";
  if (pct <= 75) return "bg-lime-600";
  return "bg-emerald-600";
}

function fmtData(s?: string | null) {
  if (!s) return "—";
  try {
    const d = new Date(s);
    return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch { return s; }
}

const MATERIAIS_SUGERIDOS = ["Areia média", "Areia fina", "Brita 0", "Brita 1", "Brita 2", "Pedrisco", "Lajota cerâmica", "Tijolo", "Bloco de concreto", "Argamassa", "Cimento (granel)"];

export default function InventarioVisualBaias() {
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id ?? 0;
  const utils = trpc.useUtils();

  const { data: obrasAtivas = [] } = trpc.obras.listActive.useQuery({ companyId }, { enabled: !!companyId });
  const [obraFiltro, setObraFiltro] = useState<number | "todas">("todas");

  const { data: baias = [], isLoading } = trpc.warehouse.baiaListar.useQuery(
    { companyId, obraId: obraFiltro === "todas" ? undefined : obraFiltro },
    { enabled: !!companyId },
  );

  const [modalNova, setModalNova] = useState(false);
  const [editando, setEditando] = useState<any | null>(null);
  const [form, setForm] = useState({ obraId: 0, nome: "", material: "", unidade: "m³", capacidade: "", observacoes: "" });
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [uploadingFoto, setUploadingFoto] = useState(false);

  const [leituraBaia, setLeituraBaia] = useState<any | null>(null);
  const [leituraPct, setLeituraPct] = useState<number | null>(null);
  const [leituraObs, setLeituraObs] = useState("");
  const [leituraFoto, setLeituraFoto] = useState<File | null>(null);

  const [historicoBaia, setHistoricoBaia] = useState<any | null>(null);
  const [excluindo, setExcluindo] = useState<any | null>(null);

  const criarMut = trpc.warehouse.baiaCriar.useMutation({
    onSuccess: () => { toast.success("Baia criada!"); utils.warehouse.baiaListar.invalidate(); fecharForm(); },
    onError: (e) => toast.error(e.message),
  });
  const editarMut = trpc.warehouse.baiaEditar.useMutation({
    onSuccess: () => { toast.success("Baia atualizada!"); utils.warehouse.baiaListar.invalidate(); fecharForm(); },
    onError: (e) => toast.error(e.message),
  });
  const desativarMut = trpc.warehouse.baiaDesativar.useMutation({
    onSuccess: () => { toast.success("Baia removida."); utils.warehouse.baiaListar.invalidate(); setExcluindo(null); },
    onError: (e) => toast.error(e.message),
  });
  const leituraMut = trpc.warehouse.baiaLeituraRegistrar.useMutation({
    onSuccess: () => { toast.success("Leitura registrada!"); utils.warehouse.baiaListar.invalidate(); fecharLeitura(); },
    onError: (e) => toast.error(e.message),
  });

  const { data: historicoLeituras = [] } = trpc.warehouse.baiaLeiturasListar.useQuery(
    { companyId, baiaId: historicoBaia?.id ?? 0 },
    { enabled: !!historicoBaia },
  );

  function abrirNova() {
    setEditando(null);
    setForm({ obraId: obraFiltro !== "todas" ? Number(obraFiltro) : 0, nome: "", material: "", unidade: "m³", capacidade: "", observacoes: "" });
    setFotoFile(null);
    setModalNova(true);
  }
  function abrirEdicao(b: any) {
    setEditando(b);
    setForm({
      obraId: b.obraId, nome: b.nome, material: b.material, unidade: b.unidade,
      capacidade: b.capacidadeEstimada ?? "", observacoes: b.observacoes ?? "",
    });
    setFotoFile(null);
    setModalNova(true);
  }
  function fecharForm() {
    setModalNova(false); setEditando(null); setFotoFile(null);
    setForm({ obraId: 0, nome: "", material: "", unidade: "m³", capacidade: "", observacoes: "" });
  }
  async function salvarForm() {
    if (!form.obraId) return toast.error("Escolha a obra");
    if (!form.nome.trim()) return toast.error("Informe o nome da baia");
    if (!form.material.trim()) return toast.error("Informe o material");
    setUploadingFoto(true);
    try {
      let fotoB64: string | undefined, fotoMime: string | undefined;
      if (fotoFile) {
        const c = await compressImageIfNeeded(fotoFile);
        fotoB64 = c.base64; fotoMime = c.contentType;
      }
      const base = {
        companyId,
        nome: form.nome.trim(),
        material: form.material.trim(),
        unidade: form.unidade.trim() || "m³",
        capacidadeEstimada: form.capacidade ? parseFloat(form.capacidade) : null,
        observacoes: form.observacoes.trim() || undefined,
        fotoBase64: fotoB64, fotoMime,
      };
      if (editando) {
        await editarMut.mutateAsync({ id: editando.id, ...base });
      } else {
        await criarMut.mutateAsync({ obraId: form.obraId, ...base });
      }
    } catch (e: any) {
      toast.error(e?.message || "Falha ao salvar foto");
    } finally { setUploadingFoto(false); }
  }

  function abrirLeitura(baia: any, pct: number) {
    setLeituraBaia(baia);
    setLeituraPct(pct);
    setLeituraObs("");
    setLeituraFoto(null);
  }
  function fecharLeitura() {
    setLeituraBaia(null); setLeituraPct(null); setLeituraObs(""); setLeituraFoto(null);
  }
  async function confirmarLeitura() {
    if (!leituraBaia || leituraPct == null) return;
    try {
      let fotoB64: string | undefined, fotoMime: string | undefined;
      if (leituraFoto) {
        const c = await compressImageIfNeeded(leituraFoto);
        fotoB64 = c.base64; fotoMime = c.contentType;
      }
      await leituraMut.mutateAsync({
        companyId, baiaId: leituraBaia.id, percentual: leituraPct,
        observacoes: leituraObs.trim() || undefined,
        fotoBase64: fotoB64, fotoMime,
      });
    } catch (e: any) { toast.error(e?.message || "Falha"); }
  }

  const baiasFiltradas = useMemo(() => {
    if (obraFiltro === "todas") return baias;
    return baias.filter((b: any) => b.obraId === obraFiltro);
  }, [baias, obraFiltro]);

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-md">
              <Package className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Inventário Visual</h1>
              <p className="text-sm text-slate-600">Areia, pedra, lajota — olhou a baia, tocou no botão.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={obraFiltro}
              onChange={e => setObraFiltro(e.target.value === "todas" ? "todas" : Number(e.target.value))}
              className="h-11 px-3 text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value="todas">Todas as obras</option>
              {obrasAtivas.map((o: any) => <option key={o.id} value={o.id}>{o.nome}</option>)}
            </select>
            <Button onClick={abrirNova} className="h-11 bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
              <Plus className="w-4 h-4" /> Nova baia
            </Button>
          </div>
        </div>

        {/* Lista */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div>
        ) : baiasFiltradas.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-white p-12 text-center">
            <Package className="w-16 h-16 mx-auto text-slate-300 mb-3" />
            <p className="text-lg font-semibold text-slate-700">Nenhuma baia cadastrada</p>
            <p className="text-sm text-slate-500 mt-1 mb-4">Cadastre uma baia (areia, pedra, lajota…) pra começar a controlar visualmente.</p>
            <Button onClick={abrirNova} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
              <Plus className="w-4 h-4" /> Cadastrar primeira baia
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {baiasFiltradas.map((b: any) => {
              const ult = b.ultimaLeitura;
              const ant = b.leituraAnterior;
              const pctAtual: number | null = ult ? Number(ult.percentual) : null;
              const pctAnt: number | null = ant ? Number(ant.percentual) : null;
              const delta = pctAtual != null && pctAnt != null ? pctAtual - pctAnt : null;
              return (
                <div key={b.id} className="bg-white rounded-2xl border-2 border-slate-200 overflow-hidden shadow-sm hover:shadow-lg transition-shadow">
                  {/* Foto */}
                  <div className="relative h-40 bg-gradient-to-br from-slate-100 to-slate-200">
                    {b.fotoUrl ? (
                      <img src={b.fotoUrl} alt={b.nome} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-400">
                        <Camera className="w-14 h-14" />
                      </div>
                    )}
                    <div className="absolute top-2 right-2 flex gap-1">
                      <button onClick={() => abrirEdicao(b)} className="bg-white/90 hover:bg-white p-1.5 rounded-lg shadow" title="Editar">
                        <Pencil className="w-3.5 h-3.5 text-slate-700" />
                      </button>
                      <button onClick={() => setExcluindo(b)} className="bg-white/90 hover:bg-white p-1.5 rounded-lg shadow" title="Remover">
                        <Trash2 className="w-3.5 h-3.5 text-red-600" />
                      </button>
                    </div>
                    {/* Barra de nível visual no canto inferior */}
                    {pctAtual != null && (
                      <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-3 py-1.5 flex items-center gap-2">
                        <div className="flex-1 h-2 bg-white/30 rounded-full overflow-hidden">
                          <div className={`h-full ${corPorPct(pctAtual)} transition-all`} style={{ width: `${pctAtual}%` }} />
                        </div>
                        <span className="text-white text-xs font-bold">{pctAtual}%</span>
                        {delta != null && delta !== 0 && (
                          delta > 0 ? <TrendingUp className="w-3.5 h-3.5 text-emerald-300" /> :
                          <TrendingDown className="w-3.5 h-3.5 text-red-300" />
                        )}
                        {delta === 0 && <Minus className="w-3.5 h-3.5 text-slate-300" />}
                      </div>
                    )}
                  </div>
                  {/* Header info */}
                  <div className="p-3 border-b border-slate-100">
                    <p className="font-bold text-base text-slate-900 truncate">{b.nome}</p>
                    <div className="flex items-center justify-between gap-2 mt-1 text-xs">
                      <span className="inline-flex items-center gap-1 text-amber-700 font-semibold">
                        <Package className="w-3 h-3" /> {b.material}
                      </span>
                      <span className="text-slate-500">{b.unidade}{b.capacidadeEstimada ? ` · cap. ${b.capacidadeEstimada}` : ""}</span>
                    </div>
                    <div className="flex items-center gap-1 mt-1 text-[11px] text-slate-500">
                      <Building2 className="w-3 h-3" />
                      <span className="truncate">{b.obraNome ?? "Sem obra"}</span>
                    </div>
                    {ult && (
                      <div className="text-[11px] text-slate-500 mt-1">
                        Última leitura: <span className="font-semibold text-slate-700">{ult.lida_por_nome || "—"}</span> · {fmtData(ult.lida_em)}
                      </div>
                    )}
                  </div>
                  {/* 5 botões grandes */}
                  <div className="p-3">
                    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2">Como está agora?</p>
                    <div className="grid grid-cols-5 gap-1.5">
                      {NIVEIS.map(n => (
                        <button
                          key={n.pct}
                          onClick={() => abrirLeitura(b, n.pct)}
                          className={`${n.cor} ${n.texto} rounded-lg py-3 px-1 font-bold text-[11px] sm:text-xs shadow-sm hover:shadow active:scale-95 transition-all ring-2 ring-transparent hover:ring-offset-1 ${pctAtual === n.pct ? "ring-offset-2 " + n.cor.split(" ").pop() : ""}`}
                          title={`Marcar como ${n.label}`}
                        >
                          <div className="leading-tight">{n.label}</div>
                          <div className="text-[9px] opacity-80 font-medium">{n.curto}</div>
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => setHistoricoBaia(b)}
                      className="mt-2 w-full text-[11px] text-slate-500 hover:text-slate-800 flex items-center justify-center gap-1 py-1"
                    >
                      <History className="w-3 h-3" /> Ver histórico
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal Nova/Editar Baia */}
      <Dialog open={modalNova} onOpenChange={v => !v && fecharForm()}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editando ? "Editar baia" : "Nova baia"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {!editando && (
              <div>
                <Label className="text-xs">Obra *</Label>
                <select
                  value={form.obraId}
                  onChange={e => setForm(p => ({ ...p, obraId: Number(e.target.value) }))}
                  className="mt-1 w-full h-10 px-3 text-sm border border-slate-300 rounded-md bg-white"
                >
                  <option value={0}>— escolher obra —</option>
                  {obrasAtivas.map((o: any) => <option key={o.id} value={o.id}>{o.nome}</option>)}
                </select>
              </div>
            )}
            <div>
              <Label className="text-xs">Nome da baia *</Label>
              <Input value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))} placeholder="Ex: Baia areia média - lado esquerdo" />
            </div>
            <div>
              <Label className="text-xs">Material *</Label>
              <Input value={form.material} onChange={e => setForm(p => ({ ...p, material: e.target.value }))} placeholder="Ex: Areia média" list="materiais-sug" />
              <datalist id="materiais-sug">
                {MATERIAIS_SUGERIDOS.map(m => <option key={m} value={m} />)}
              </datalist>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Unidade</Label>
                <Input value={form.unidade} onChange={e => setForm(p => ({ ...p, unidade: e.target.value }))} placeholder="m³" />
              </div>
              <div>
                <Label className="text-xs">Capacidade (opcional)</Label>
                <Input type="number" step="0.1" value={form.capacidade} onChange={e => setForm(p => ({ ...p, capacidade: e.target.value }))} placeholder="Ex: 8" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Foto da baia (opcional)</Label>
              <label className="mt-1 flex items-center justify-center gap-2 h-20 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50">
                <input type="file" accept="image/*" capture="environment" className="hidden"
                  onChange={e => setFotoFile(e.target.files?.[0] ?? null)} />
                {fotoFile ? (
                  <span className="text-sm text-emerald-700 flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> {fotoFile.name}</span>
                ) : (
                  <span className="text-sm text-slate-500 flex items-center gap-1"><ImagePlus className="w-4 h-4" /> Tirar / escolher foto</span>
                )}
              </label>
            </div>
            <div>
              <Label className="text-xs">Observações (opcional)</Label>
              <Textarea rows={2} value={form.observacoes} onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={fecharForm}>Cancelar</Button>
            <Button onClick={salvarForm} disabled={uploadingFoto || criarMut.isPending || editarMut.isPending} className="bg-emerald-600 hover:bg-emerald-700">
              {(uploadingFoto || criarMut.isPending || editarMut.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Confirmar leitura */}
      <Dialog open={!!leituraBaia} onOpenChange={v => !v && fecharLeitura()}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Confirmar leitura</DialogTitle></DialogHeader>
          {leituraBaia && leituraPct != null && (
            <div className="space-y-3">
              <div className={`rounded-xl p-4 ${corPorPct(leituraPct)} text-white text-center`}>
                <p className="text-xs uppercase tracking-wide opacity-90">{leituraBaia.nome}</p>
                <p className="text-3xl font-black mt-1">{NIVEIS.find(n => n.pct === leituraPct)?.label}</p>
                <p className="text-sm opacity-90">{leituraPct}%</p>
              </div>
              <div>
                <Label className="text-xs">Foto da baia (opcional, mas recomendado)</Label>
                <label className="mt-1 flex items-center justify-center gap-2 h-20 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50">
                  <input type="file" accept="image/*" capture="environment" className="hidden"
                    onChange={e => setLeituraFoto(e.target.files?.[0] ?? null)} />
                  {leituraFoto ? (
                    <span className="text-sm text-emerald-700 flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> {leituraFoto.name}</span>
                  ) : (
                    <span className="text-sm text-slate-500 flex items-center gap-1"><Camera className="w-4 h-4" /> Tirar foto agora</span>
                  )}
                </label>
              </div>
              <div>
                <Label className="text-xs">Observação (opcional)</Label>
                <Textarea rows={2} value={leituraObs} onChange={e => setLeituraObs(e.target.value)} placeholder="Ex: pedreiro pediu pra repor amanhã" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={fecharLeitura}>Cancelar</Button>
            <Button onClick={confirmarLeitura} disabled={leituraMut.isPending} className="bg-emerald-600 hover:bg-emerald-700">
              {leituraMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Histórico */}
      <Dialog open={!!historicoBaia} onOpenChange={v => !v && setHistoricoBaia(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5" /> Histórico — {historicoBaia?.nome}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {historicoLeituras.length === 0 ? (
              <p className="text-sm text-slate-500 italic text-center py-6">Nenhuma leitura ainda.</p>
            ) : historicoLeituras.map((l: any) => (
              <div key={l.id} className="flex items-start gap-3 p-3 border border-slate-200 rounded-lg">
                <div className={`${corPorPct(Number(l.percentual))} text-white font-bold text-sm rounded-lg w-14 h-14 flex flex-col items-center justify-center flex-shrink-0`}>
                  <span className="text-lg leading-none">{l.percentual}%</span>
                </div>
                {l.fotoUrl && (
                  <img src={l.fotoUrl} alt="" className="w-14 h-14 rounded-lg object-cover flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">{l.lidaPorNome || "—"}</p>
                  <p className="text-xs text-slate-500">{fmtData(l.lidaEm)}</p>
                  {l.observacoes && <p className="text-xs text-slate-700 mt-1 italic">{l.observacoes}</p>}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm exclusão */}
      <Dialog open={!!excluindo} onOpenChange={v => !v && setExcluindo(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Remover baia?</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-600">A baia <span className="font-semibold">{excluindo?.nome}</span> será desativada. O histórico de leituras fica preservado.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExcluindo(null)}>Cancelar</Button>
            <Button onClick={() => excluindo && desativarMut.mutate({ id: excluindo.id, companyId })} disabled={desativarMut.isPending} className="bg-red-600 hover:bg-red-700">
              {desativarMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Remover"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
