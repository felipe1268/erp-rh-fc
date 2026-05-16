// Rev. 1880 — Controle de Ferramentas de Terceiros (portaria de obra).
// Tela única que cobre o fluxo completo: ENTRADA com fotos por item, lista do que
// está em obra, e SAÍDA vinculada à entrada original. Modais em fullscreen p/ iPad
// (Regra de Ouro). Fotos são comprimidas no client antes de subir para evitar
// payloads de 5MB+ do iPad.

import { useState, useMemo, useRef } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useCompany } from "@/contexts/CompanyContext";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Wrench, Plus, ArrowDownCircle, ArrowUpCircle, Camera, Trash2, X, Search,
  Building2, User, Phone, FileText, Eye, AlertTriangle, CheckCircle2, Package,
  ArrowLeftRight, Loader2, ImageOff, RotateCcw, Sparkles,
} from "lucide-react";

// ─── Util: comprime imagem para JPEG ≤ ~800px, qualidade 0.78. Retorna base64 puro
//   (sem prefixo data:). Evita enviar 4-8MB direto da câmera do iPad.
function compressToBase64(file: File): Promise<{ base64: string; mime: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1024;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
          else { width = Math.round(width * MAX / height); height = MAX; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.78);
        const base64 = dataUrl.split(",")[1] || "";
        resolve({ base64, mime: "image/jpeg" });
      };
      img.onerror = reject;
      img.src = e.target!.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

type FotoItem = { base64: string; mime: string; preview: string };
type ItemEntrada = {
  descricao: string; marca: string; modelo: string; numeroSerie: string;
  quantidade: number; condicao: string; observacao: string;
  fotos: FotoItem[];           // Rev. 1884 — múltiplas fotos (capa = índice 0)
  detectandoIA?: boolean;      // estado do botão "Detectar com IA"
};
const EMPTY_ITEM: ItemEntrada = {
  descricao: "", marca: "", modelo: "", numeroSerie: "", quantidade: 1,
  condicao: "boa", observacao: "", fotos: [],
};
const MAX_FOTOS_POR_ITEM = 8;

const STATUS_REG_BADGE: Record<string, { label: string; cls: string }> = {
  em_obra:            { label: "Em Obra",           cls: "bg-amber-100 text-amber-800 border-amber-300" },
  devolvido_parcial:  { label: "Devolvido Parcial", cls: "bg-blue-100 text-blue-800 border-blue-300" },
  devolvido_total:    { label: "Devolvido Total",   cls: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  concluido:          { label: "Concluído",         cls: "bg-slate-100 text-slate-700 border-slate-300" },
};
const STATUS_ITEM_BADGE: Record<string, { label: string; cls: string }> = {
  na_obra:    { label: "Na Obra",     cls: "bg-amber-100 text-amber-800" },
  devolvido:  { label: "Devolvido",   cls: "bg-emerald-100 text-emerald-800" },
  perda:      { label: "Perda",       cls: "bg-red-100 text-red-800" },
  danificada: { label: "Danificada",  cls: "bg-orange-100 text-orange-800" },
};

export default function FerramentasTerceiros() {
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id || 0;

  const [filtroTipo, setFiltroTipo] = useState<string>("all");
  const [filtroStatus, setFiltroStatus] = useState<string>("all");
  const [busca, setBusca] = useState("");
  const [openEntrada, setOpenEntrada] = useState(false);
  const [openSaida, setOpenSaida] = useState(false);
  const [verRegistroId, setVerRegistroId] = useState<number | null>(null);

  const kpis = trpc.ferramentasTerceiros.kpis.useQuery({ companyId }, { enabled: !!companyId });
  const registros = trpc.ferramentasTerceiros.listarRegistros.useQuery({
    companyId,
    tipo: filtroTipo !== "all" ? (filtroTipo as any) : undefined,
    status: filtroStatus !== "all" ? filtroStatus : undefined,
    busca: busca || undefined,
    limit: 200,
  }, { enabled: !!companyId });

  const utils = trpc.useUtils();
  const refetchAll = () => {
    utils.ferramentasTerceiros.kpis.invalidate();
    utils.ferramentasTerceiros.listarRegistros.invalidate();
    utils.ferramentasTerceiros.entradasEmAberto.invalidate();
  };

  if (!companyId) {
    return (
      <DashboardLayout>
        <div className="p-8 text-center text-muted-foreground">Selecione uma empresa.</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-4">
        {/* Cabeçalho */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Wrench className="h-6 w-6 text-orange-600" />
              Ferramentas de Terceiros
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Controle de entrada e saída de ferramentas trazidas por empresas terceirizadas, locadoras e autônomos.
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setOpenSaida(true)} variant="outline" className="border-blue-300 text-blue-700 hover:bg-blue-50">
              <ArrowUpCircle className="h-4 w-4 mr-1.5" /> Registrar Saída
            </Button>
            <Button onClick={() => setOpenEntrada(true)} className="bg-emerald-600 hover:bg-emerald-700">
              <Plus className="h-4 w-4 mr-1.5" /> Nova Entrada
            </Button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <KpiCard icon={<Package className="h-5 w-5" />} label="Itens NA OBRA" value={kpis.data?.itensNaObra ?? "—"} cor="amber" />
          <KpiCard icon={<CheckCircle2 className="h-5 w-5" />} label="Itens Devolvidos" value={kpis.data?.itensDevolvidos ?? "—"} cor="emerald" />
          <KpiCard icon={<AlertTriangle className="h-5 w-5" />} label="Problemas" value={kpis.data?.itensProblema ?? "—"} cor="red" />
          <KpiCard icon={<ArrowDownCircle className="h-5 w-5" />} label="Entradas Hoje" value={kpis.data?.entradasHoje ?? "—"} cor="blue" />
          <KpiCard icon={<ArrowUpCircle className="h-5 w-5" />} label="Saídas Hoje" value={kpis.data?.saidasHoje ?? "—"} cor="slate" />
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-2 bg-white border rounded-lg p-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar empresa ou responsável…" className="pl-8" />
          </div>
          <Select value={filtroTipo} onValueChange={setFiltroTipo}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              <SelectItem value="ENTRADA">Entradas</SelectItem>
              <SelectItem value="SAIDA">Saídas</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filtroStatus} onValueChange={setFiltroStatus}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              <SelectItem value="em_obra">Em Obra</SelectItem>
              <SelectItem value="devolvido_parcial">Devolvido Parcial</SelectItem>
              <SelectItem value="devolvido_total">Devolvido Total</SelectItem>
              <SelectItem value="concluido">Concluído (Saídas)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Tabela */}
        <div className="bg-white border rounded-lg overflow-hidden">
          {registros.isLoading ? (
            <div className="p-12 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" /></div>
          ) : !registros.data || registros.data.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <Wrench className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Nenhum registro encontrado.</p>
              <p className="text-sm mt-1">Clique em <strong>Nova Entrada</strong> para começar.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold text-xs uppercase">Data/Hora</th>
                    <th className="text-left px-3 py-2 font-semibold text-xs uppercase">Tipo</th>
                    <th className="text-left px-3 py-2 font-semibold text-xs uppercase">Empresa Terceira</th>
                    <th className="text-left px-3 py-2 font-semibold text-xs uppercase">Responsável</th>
                    <th className="text-left px-3 py-2 font-semibold text-xs uppercase">Itens</th>
                    <th className="text-left px-3 py-2 font-semibold text-xs uppercase">Status</th>
                    <th className="text-left px-3 py-2 font-semibold text-xs uppercase">Lançado por</th>
                    <th className="text-right px-3 py-2 font-semibold text-xs uppercase">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {(registros.data as any[]).map((r) => {
                    const sbadge = STATUS_REG_BADGE[r.status] || { label: r.status, cls: "bg-gray-100 text-gray-700" };
                    return (
                      <tr key={r.id} className="border-b hover:bg-slate-50/60">
                        <td className="px-3 py-2 text-xs whitespace-nowrap">
                          {new Date(r.data_hora).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                        </td>
                        <td className="px-3 py-2">
                          {r.tipo === "ENTRADA" ? (
                            <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300"><ArrowDownCircle className="h-3 w-3 mr-1" />Entrada</Badge>
                          ) : (
                            <Badge className="bg-blue-100 text-blue-800 border-blue-300"><ArrowUpCircle className="h-3 w-3 mr-1" />Saída</Badge>
                          )}
                        </td>
                        <td className="px-3 py-2 font-medium">{r.empresa_terceira}</td>
                        <td className="px-3 py-2 text-xs">
                          <div>{r.responsavel_nome}</div>
                          {r.responsavel_cpf && <div className="text-muted-foreground">{r.responsavel_cpf}</div>}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          <span className="font-semibold">{r.qtd_itens}</span> item(s)
                          {r.tipo === "ENTRADA" && r.qtd_na_obra > 0 && (
                            <span className="text-amber-700 ml-1">· {r.qtd_na_obra} na obra</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <Badge className={`border ${sbadge.cls}`}>{sbadge.label}</Badge>
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{r.lancado_por_nome || "—"}</td>
                        <td className="px-3 py-2 text-right">
                          <Button size="sm" variant="ghost" onClick={() => setVerRegistroId(r.id)} title="Ver detalhes">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* MODAIS */}
      {openEntrada && (
        <ModalEntrada
          companyId={companyId}
          onClose={() => setOpenEntrada(false)}
          onSuccess={() => { setOpenEntrada(false); refetchAll(); toast.success("Entrada registrada com sucesso!"); }}
        />
      )}
      {openSaida && (
        <ModalSaida
          companyId={companyId}
          onClose={() => setOpenSaida(false)}
          onSuccess={() => { setOpenSaida(false); refetchAll(); toast.success("Saída registrada com sucesso!"); }}
        />
      )}
      {verRegistroId !== null && (
        <ModalDetalhes
          companyId={companyId}
          registroId={verRegistroId}
          onClose={() => setVerRegistroId(null)}
        />
      )}
    </DashboardLayout>
  );
}

function KpiCard({ icon, label, value, cor }: { icon: any; label: string; value: any; cor: string }) {
  const cores: Record<string, string> = {
    amber: "bg-amber-50 border-amber-200 text-amber-700",
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-700",
    red: "bg-red-50 border-red-200 text-red-700",
    blue: "bg-blue-50 border-blue-200 text-blue-700",
    slate: "bg-slate-50 border-slate-200 text-slate-700",
  };
  return (
    <div className={`rounded-lg border p-3 ${cores[cor]}`}>
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-[10px] font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// MODAL ENTRADA — fullscreen iPad (Regra de Ouro)
// ════════════════════════════════════════════════════════════════
function ModalEntrada({ companyId, onClose, onSuccess }:
  { companyId: number; onClose: () => void; onSuccess: () => void }) {
  const [empresa, setEmpresa] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [respNome, setRespNome] = useState("");
  const [respCpf, setRespCpf] = useState("");
  const [respTel, setRespTel] = useState("");
  const [quemEntregou, setQuemEntregou] = useState("");
  const [quemRecebeu, setQuemRecebeu] = useState("");
  const [obs, setObs] = useState("");
  const [fotoDoc, setFotoDoc] = useState<{ base64: string; mime: string; preview: string } | null>(null);
  const [itens, setItens] = useState<ItemEntrada[]>([{ ...EMPTY_ITEM }]);
  const [enviando, setEnviando] = useState(false);
  const fotoDocRef = useRef<HTMLInputElement>(null);

  const obras = trpc.obras.list.useQuery({ companyId }, { enabled: !!companyId });
  const [obraId, setObraId] = useState<string>("none");
  const obraNome = obraId !== "none" ? (obras.data || []).find((o: any) => String(o.id) === obraId)?.nome : null;

  const criar = trpc.ferramentasTerceiros.criarEntrada.useMutation();
  const detectarIA = trpc.ferramentasTerceiros.detectarProdutoPorFoto.useMutation();

  async function adicionarFotoItem(idx: number, file: File) {
    try {
      const { base64, mime } = await compressToBase64(file);
      const nova: FotoItem = { base64, mime, preview: `data:${mime};base64,${base64}` };
      setItens(prev => prev.map((it, i) => {
        if (i !== idx) return it;
        if (it.fotos.length >= MAX_FOTOS_POR_ITEM) {
          toast.error(`Máximo ${MAX_FOTOS_POR_ITEM} fotos por item.`);
          return it;
        }
        return { ...it, fotos: [...it.fotos, nova] };
      }));
    } catch { toast.error("Falha ao processar foto."); }
  }
  function removerFotoItem(idx: number, fotoIdx: number) {
    setItens(prev => prev.map((it, i) => i === idx
      ? { ...it, fotos: it.fotos.filter((_, fi) => fi !== fotoIdx) }
      : it));
  }
  async function detectarProdutoIA(idx: number) {
    const it = itens[idx];
    if (!it.fotos.length) { toast.error("Tire ao menos 1 foto antes."); return; }
    setItens(prev => prev.map((p, i) => i === idx ? { ...p, detectandoIA: true } : p));
    try {
      // Rev. 1884 (hotfix) — manda TODAS as fotos do item (até 4) para a IA
      // ter mais ângulos/contexto. Aumenta muito a chance de identificar
      // ferramentas em fotos com iluminação ruim ou ângulo desfavorável.
      const fotosParaIA = it.fotos.slice(0, 4).map(f => ({ base64: f.base64, mime: f.mime }));
      const res = await detectarIA.mutateAsync({ fotos: fotosParaIA });
      if (!res.ok) {
        toast.warning(res.erro || "IA não conseguiu identificar.");
      } else if (!res.descricao) {
        toast.warning("IA não reconheceu a ferramenta. Preencha manualmente.");
      } else {
        setItens(prev => prev.map((p, i) => {
          if (i !== idx) return p;
          return {
            ...p,
            descricao: p.descricao.trim() ? p.descricao : res.descricao,
            marca: p.marca.trim() ? p.marca : res.marca,
            modelo: p.modelo.trim() ? p.modelo : res.modelo,
          };
        }));
        const conf = res.confianca === "alta" ? "alta" : res.confianca === "media" ? "média" : "baixa";
        toast.success(`IA preencheu (confiança ${conf}). Revise antes de salvar.`);
      }
    } catch (e: any) {
      toast.error(e?.message || "Falha ao detectar com IA.");
    } finally {
      setItens(prev => prev.map((p, i) => i === idx ? { ...p, detectandoIA: false } : p));
    }
  }
  async function handleFotoDoc(file: File) {
    try {
      const { base64, mime } = await compressToBase64(file);
      setFotoDoc({ base64, mime, preview: `data:${mime};base64,${base64}` });
    } catch { toast.error("Falha ao processar foto."); }
  }

  function adicionarItem() { setItens(prev => [...prev, { ...EMPTY_ITEM }]); }
  function removerItem(idx: number) { setItens(prev => prev.filter((_, i) => i !== idx)); }
  function atualizarItem(idx: number, campo: keyof ItemEntrada, valor: any) {
    setItens(prev => prev.map((it, i) => i === idx ? { ...it, [campo]: valor } : it));
  }

  async function salvar() {
    if (!empresa.trim()) { toast.error("Informe a empresa terceira."); return; }
    if (!respNome.trim()) { toast.error("Informe o responsável."); return; }
    if (!quemRecebeu.trim()) { toast.error("Informe quem recebeu na obra (rastreabilidade)."); return; }
    if (itens.length === 0) { toast.error("Adicione pelo menos 1 ferramenta."); return; }
    for (let i = 0; i < itens.length; i++) {
      if (!itens[i].descricao.trim()) { toast.error(`Item #${i + 1}: descrição obrigatória.`); return; }
      if (itens[i].fotos.length === 0) { toast.error(`Item #${i + 1}: ao menos 1 foto obrigatória.`); return; }
    }
    setEnviando(true);
    try {
      await criar.mutateAsync({
        companyId,
        obraId: obraId !== "none" ? Number(obraId) : undefined,
        obraNome: obraNome || undefined,
        empresaTerceira: empresa.trim(),
        cnpj: cnpj.trim() || undefined,
        responsavelNome: respNome.trim(),
        responsavelCpf: respCpf.trim() || undefined,
        responsavelTelefone: respTel.trim() || undefined,
        quemEntregou: quemEntregou.trim() || undefined,
        quemRecebeu: quemRecebeu.trim(),
        observacoes: obs.trim() || undefined,
        fotoDocumentoBase64: fotoDoc?.base64,
        fotoDocumentoMime: fotoDoc?.mime,
        itens: itens.map(it => ({
          descricao: it.descricao.trim(),
          marca: it.marca.trim() || undefined,
          modelo: it.modelo.trim() || undefined,
          numeroSerie: it.numeroSerie.trim() || undefined,
          quantidade: it.quantidade,
          fotos: it.fotos.map(f => ({ base64: f.base64, mime: f.mime })),
          condicao: it.condicao as any,
          observacao: it.observacao.trim() || undefined,
        })),
      });
      onSuccess();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao salvar.");
    } finally { setEnviando(false); }
  }

  return (
    <Dialog open={true} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="!fixed !inset-0 !translate-x-0 !translate-y-0 !max-w-none !w-screen !h-screen !rounded-none" style={{ top: 0, left: 0, transform: 'none', display: 'flex', flexDirection: 'column' }}>
        <DialogHeader className="border-b pb-3 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <ArrowDownCircle className="h-5 w-5 text-emerald-600" />
            Nova Entrada de Ferramentas de Terceiro
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Identificação do terceiro */}
          <section className="bg-slate-50 border rounded-lg p-3">
            <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1.5"><Building2 className="h-4 w-4" />Empresa Terceira</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <div className="md:col-span-2">
                <label className="text-xs font-medium text-muted-foreground">Empresa *</label>
                <Input value={empresa} onChange={(e) => setEmpresa(e.target.value)} placeholder="Ex: Locadora ABC Ltda" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">CNPJ</label>
                <Input value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="00.000.000/0001-00" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Obra</label>
                <Select value={obraId} onValueChange={setObraId}>
                  <SelectTrigger><SelectValue placeholder="Selecionar obra…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Sem obra específica —</SelectItem>
                    {(obras.data || []).map((o: any) => (
                      <SelectItem key={o.id} value={String(o.id)}>{o.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          {/* Responsável + quem entregou/recebeu */}
          <section className="bg-slate-50 border rounded-lg p-3">
            <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1.5"><User className="h-4 w-4" />Responsável pela Entrega</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Nome do Responsável *</label>
                <Input value={respNome} onChange={(e) => setRespNome(e.target.value)} placeholder="Quem assina a entrega" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">CPF</label>
                <Input value={respCpf} onChange={(e) => setRespCpf(e.target.value)} placeholder="000.000.000-00" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground"><Phone className="h-3 w-3 inline" /> Telefone</label>
                <Input value={respTel} onChange={(e) => setRespTel(e.target.value)} placeholder="(00) 00000-0000" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Quem ENTREGOU (terceiro)</label>
                <Input value={quemEntregou} onChange={(e) => setQuemEntregou(e.target.value)} placeholder="Motorista, ajudante…" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Quem RECEBEU (obra) *</label>
                <Input value={quemRecebeu} onChange={(e) => setQuemRecebeu(e.target.value)} placeholder="Almoxarife, mestre, portaria" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Foto do Documento (RG/CNH)</label>
                <div className="flex items-center gap-2">
                  <input ref={fotoDocRef} type="file" accept="image/*" capture="environment" className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleFotoDoc(e.target.files[0])} />
                  <Button type="button" variant="outline" size="sm" onClick={() => fotoDocRef.current?.click()}>
                    <Camera className="h-3.5 w-3.5 mr-1" /> {fotoDoc ? "Trocar" : "Tirar Foto"}
                  </Button>
                  {fotoDoc && (
                    <>
                      <img src={fotoDoc.preview} alt="doc" className="h-10 w-10 object-cover rounded border" />
                      <Button type="button" variant="ghost" size="sm" onClick={() => setFotoDoc(null)}><X className="h-3.5 w-3.5" /></Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* Itens */}
          <section className="bg-white border-2 border-emerald-200 rounded-lg p-3">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-emerald-700 flex items-center gap-1.5">
                <Wrench className="h-4 w-4" /> Ferramentas Recebidas ({itens.length})
              </h3>
              <Button type="button" size="sm" onClick={adicionarItem} className="bg-emerald-600 hover:bg-emerald-700">
                <Plus className="h-4 w-4 mr-1" /> Adicionar Item
              </Button>
            </div>
            <div className="space-y-3">
              {itens.map((it, idx) => (
                <div key={idx} className="border rounded-lg p-3 bg-slate-50 grid grid-cols-1 md:grid-cols-[180px_1fr_auto] gap-3">
                  {/* Fotos (1..8) + botão Detectar com IA */}
                  <div>
                    <ItemFotosInput
                      fotos={it.fotos}
                      onAdd={(f) => adicionarFotoItem(idx, f)}
                      onRemove={(fi) => removerFotoItem(idx, fi)}
                      max={MAX_FOTOS_POR_ITEM}
                    />
                    <Button
                      type="button" variant="outline" size="sm"
                      className="w-full mt-2 border-violet-300 text-violet-700 hover:bg-violet-50 hover:text-violet-800"
                      disabled={!it.fotos.length || it.detectandoIA}
                      onClick={() => detectarProdutoIA(idx)}
                      title={!it.fotos.length ? "Tire uma foto primeiro" : "Sugerir descrição/marca/modelo pela 1ª foto"}
                    >
                      {it.detectandoIA
                        ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />Analisando…</>
                        : <><Sparkles className="h-3.5 w-3.5 mr-1" />Detectar com IA</>}
                    </Button>
                  </div>
                  {/* Campos */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div className="col-span-2">
                      <label className="text-xs font-medium text-muted-foreground">Descrição *</label>
                      <Input value={it.descricao} onChange={(e) => atualizarItem(idx, "descricao", e.target.value)} placeholder="Ex: Martelete Bosch GBH 2-26" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Marca</label>
                      <Input value={it.marca} onChange={(e) => atualizarItem(idx, "marca", e.target.value)} placeholder="Bosch" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Modelo</label>
                      <Input value={it.modelo} onChange={(e) => atualizarItem(idx, "modelo", e.target.value)} placeholder="GBH 2-26" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Nº Série / Patrimônio</label>
                      <Input value={it.numeroSerie} onChange={(e) => atualizarItem(idx, "numeroSerie", e.target.value)} placeholder="opcional" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Qtde</label>
                      <Input type="number" min={1} value={it.quantidade} onChange={(e) => atualizarItem(idx, "quantidade", Math.max(1, parseInt(e.target.value) || 1))} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Condição</label>
                      <Select value={it.condicao} onValueChange={(v) => atualizarItem(idx, "condicao", v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="nova">Nova</SelectItem>
                          <SelectItem value="boa">Boa</SelectItem>
                          <SelectItem value="regular">Regular</SelectItem>
                          <SelectItem value="ruim">Ruim</SelectItem>
                          <SelectItem value="danificada">Danificada</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2 md:col-span-4">
                      <label className="text-xs font-medium text-muted-foreground">Observação</label>
                      <Input value={it.observacao} onChange={(e) => atualizarItem(idx, "observacao", e.target.value)} placeholder="Ex: Sem maleta, com 2 brocas." />
                    </div>
                  </div>
                  {/* Remover */}
                  <div className="flex items-start">
                    <Button type="button" variant="ghost" size="sm" onClick={() => removerItem(idx)} disabled={itens.length === 1} title="Remover">
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Observações gerais */}
          <section className="bg-slate-50 border rounded-lg p-3">
            <label className="text-xs font-medium text-muted-foreground">Observações Gerais</label>
            <Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} placeholder="Notas sobre a entrega (avarias preexistentes, restrições, etc.)" />
          </section>
        </div>

        {/* Footer */}
        <div className="border-t p-3 flex items-center justify-between shrink-0 bg-white">
          <p className="text-xs text-muted-foreground">
            <FileText className="h-3 w-3 inline mr-1" />
            Todos os campos com * são obrigatórios. Ao menos 1 foto por item (até {MAX_FOTOS_POR_ITEM}). Use <Sparkles className="h-3 w-3 inline text-violet-600" /> "Detectar com IA" para preencher pela foto.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={enviando}>Cancelar</Button>
            <Button onClick={salvar} disabled={enviando} className="bg-emerald-600 hover:bg-emerald-700">
              {enviando ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Salvando…</> : <><CheckCircle2 className="h-4 w-4 mr-1.5" />Confirmar Entrada</>}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Rev. 1884 — componente multi-foto. Mostra grid com thumbnails + botão "+ foto"
// (até `max`). Primeira foto recebe badge "CAPA" (vai como `foto_url` no banco).
// Mantém `capture="environment"` para abrir a câmera traseira no iPad.
function ItemFotosInput({ fotos, onAdd, onRemove, max }: {
  fotos: FotoItem[]; onAdd: (f: File) => void; onRemove: (idx: number) => void; max: number;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const cheio = fotos.length >= max;
  return (
    <div>
      <input ref={ref} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => { if (e.target.files?.[0]) { onAdd(e.target.files[0]); e.target.value = ""; } }} />
      <div className="grid grid-cols-2 gap-1.5">
        {fotos.map((f, i) => (
          <div key={i} className="relative">
            <img src={f.preview} alt={`foto ${i + 1}`} className={`h-20 w-full object-cover rounded border-2 ${i === 0 ? "border-emerald-400" : "border-slate-200"}`} />
            {i === 0 && (
              <span className="absolute top-0 left-0 bg-emerald-600 text-white text-[8px] font-bold px-1 py-0.5 rounded-br">CAPA</span>
            )}
            {/* Rev. 1884 (hardening pós-review architect) — alvo de toque ≥24px (Apple HIG). */}
            <button type="button" onClick={() => onRemove(i)} title="Remover esta foto" aria-label={`Remover foto ${i + 1}`}
              className="absolute -top-2 -right-2 bg-red-600 hover:bg-red-700 text-white rounded-full h-6 w-6 flex items-center justify-center shadow border-2 border-white">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {!cheio && (
          <button type="button" onClick={() => ref.current?.click()}
            className={`h-20 w-full rounded border-2 border-dashed flex flex-col items-center justify-center
              ${fotos.length === 0 ? "border-amber-400 bg-amber-50 text-amber-700 hover:bg-amber-100" : "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"}`}>
            <Camera className="h-5 w-5" />
            <span className="text-[9px] font-semibold mt-0.5">{fotos.length === 0 ? "FOTO *" : "+ FOTO"}</span>
          </button>
        )}
      </div>
      <div className="text-[10px] text-muted-foreground mt-1 text-center">
        {fotos.length}/{max} foto{fotos.length === 1 ? "" : "s"}{cheio ? " (limite)" : ""}
      </div>
    </div>
  );
}

function ItemFotoInput({ preview, onPick, onClear }: { preview: string; onPick: (f: File) => void; onClear: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col items-center gap-1">
      <input ref={ref} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => e.target.files?.[0] && onPick(e.target.files[0])} />
      {preview ? (
        <div className="relative">
          <img src={preview} className="h-24 w-24 object-cover rounded border-2 border-emerald-300" alt="" />
          <button type="button" onClick={onClear} className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full p-0.5"><X className="h-3 w-3" /></button>
        </div>
      ) : (
        <button type="button" onClick={() => ref.current?.click()}
          className="h-24 w-24 border-2 border-dashed border-amber-400 bg-amber-50 rounded flex flex-col items-center justify-center text-amber-700 hover:bg-amber-100">
          <Camera className="h-6 w-6" />
          <span className="text-[10px] font-semibold mt-0.5">FOTO *</span>
        </button>
      )}
      {preview && (
        <button type="button" onClick={() => ref.current?.click()} className="text-[10px] text-emerald-700 hover:underline flex items-center gap-0.5">
          <RotateCcw className="h-2.5 w-2.5" /> Trocar
        </button>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// MODAL SAÍDA — vincula a uma ENTRADA pai
// ════════════════════════════════════════════════════════════════
function ModalSaida({ companyId, onClose, onSuccess }:
  { companyId: number; onClose: () => void; onSuccess: () => void }) {
  const [registroPaiId, setRegistroPaiId] = useState<number | null>(null);
  const [respNome, setRespNome] = useState("");
  const [respCpf, setRespCpf] = useState("");
  const [quemEntregou, setQuemEntregou] = useState("");
  const [quemRecebeu, setQuemRecebeu] = useState("");
  const [obs, setObs] = useState("");
  const [selecionados, setSelecionados] = useState<Record<number, {
    selecionado: boolean; condicao: string; status: string; observacao: string;
    fotoBase64: string; fotoMime: string; fotoPreview: string;
  }>>({});
  const [enviando, setEnviando] = useState(false);

  const entradas = trpc.ferramentasTerceiros.entradasEmAberto.useQuery({ companyId });
  const itensPai = trpc.ferramentasTerceiros.itensNaObraPorRegistro.useQuery(
    { companyId, registroPaiId: registroPaiId || 0 },
    { enabled: !!registroPaiId }
  );
  const criar = trpc.ferramentasTerceiros.criarSaida.useMutation();

  async function handleFoto(itemId: number, file: File) {
    try {
      const { base64, mime } = await compressToBase64(file);
      setSelecionados(prev => ({
        ...prev,
        [itemId]: { ...(prev[itemId] || { selecionado: true, condicao: "boa", status: "devolvido", observacao: "" }), fotoBase64: base64, fotoMime: mime, fotoPreview: `data:${mime};base64,${base64}` }
      }));
    } catch { toast.error("Falha ao processar foto."); }
  }

  function toggleItem(itemId: number) {
    setSelecionados(prev => {
      const atual = prev[itemId];
      if (atual) {
        const novo = { ...prev };
        delete novo[itemId];
        return novo;
      }
      return { ...prev, [itemId]: { selecionado: true, condicao: "boa", status: "devolvido", observacao: "", fotoBase64: "", fotoMime: "", fotoPreview: "" } };
    });
  }
  function atualizar(itemId: number, campo: string, valor: any) {
    setSelecionados(prev => ({ ...prev, [itemId]: { ...prev[itemId], [campo]: valor } }));
  }

  async function salvar() {
    if (!registroPaiId) { toast.error("Selecione a entrada de origem."); return; }
    if (!respNome.trim()) { toast.error("Informe o responsável pela retirada."); return; }
    const ids = Object.keys(selecionados).map(Number);
    if (ids.length === 0) { toast.error("Marque ao menos 1 ferramenta para retirada."); return; }
    for (const id of ids) {
      if (!selecionados[id].fotoBase64) { toast.error("Toda saída exige foto da ferramenta."); return; }
    }
    setEnviando(true);
    try {
      await criar.mutateAsync({
        companyId,
        registroPaiId,
        responsavelNome: respNome.trim(),
        responsavelCpf: respCpf.trim() || undefined,
        quemEntregou: quemEntregou.trim() || undefined,
        quemRecebeu: quemRecebeu.trim() || undefined,
        observacoes: obs.trim() || undefined,
        itensDevolvidos: ids.map(id => ({
          itemEntradaId: id,
          condicaoSaida: selecionados[id].condicao as any,
          statusItem: selecionados[id].status as any,
          fotoBase64: selecionados[id].fotoBase64,
          fotoMime: selecionados[id].fotoMime,
          observacao: selecionados[id].observacao.trim() || undefined,
        })),
      });
      onSuccess();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao salvar.");
    } finally { setEnviando(false); }
  }

  const entradaEscolhida = useMemo(() => {
    return (entradas.data as any[] | undefined)?.find(e => e.id === registroPaiId);
  }, [entradas.data, registroPaiId]);

  return (
    <Dialog open={true} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="!fixed !inset-0 !translate-x-0 !translate-y-0 !max-w-none !w-screen !h-screen !rounded-none" style={{ top: 0, left: 0, transform: 'none', display: 'flex', flexDirection: 'column' }}>
        <DialogHeader className="border-b pb-3 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <ArrowUpCircle className="h-5 w-5 text-blue-600" />
            Registrar Saída de Ferramentas de Terceiro
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Seleção da entrada pai */}
          <section className="bg-slate-50 border rounded-lg p-3">
            <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
              <ArrowLeftRight className="h-4 w-4" /> Entrada de Origem
            </h3>
            <Select value={registroPaiId ? String(registroPaiId) : ""} onValueChange={(v) => { setRegistroPaiId(Number(v)); setSelecionados({}); }}>
              <SelectTrigger><SelectValue placeholder="Selecione a entrada de origem com itens ainda na obra…" /></SelectTrigger>
              <SelectContent>
                {(entradas.data as any[] | undefined)?.map((e) => (
                  <SelectItem key={e.id} value={String(e.id)}>
                    #{e.id} · {e.empresa_terceira} · {e.responsavel_nome} · {e.qtd_na_obra} item(s) na obra · {new Date(e.data_hora).toLocaleDateString("pt-BR")}
                  </SelectItem>
                ))}
                {(!entradas.data || entradas.data.length === 0) && (
                  <SelectItem value="__none__" disabled>Nenhuma entrada em aberto.</SelectItem>
                )}
              </SelectContent>
            </Select>
            {entradaEscolhida && (
              <div className="mt-2 text-xs text-muted-foreground">
                <strong>{entradaEscolhida.empresa_terceira}</strong> · Obra: {entradaEscolhida.obra_nome || "—"}
              </div>
            )}
          </section>

          {/* Responsável pela retirada */}
          {registroPaiId && (
            <section className="bg-slate-50 border rounded-lg p-3">
              <h3 className="text-sm font-semibold text-slate-700 mb-2"><User className="h-4 w-4 inline mr-1" />Responsável pela Retirada</h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground">Nome *</label>
                  <Input value={respNome} onChange={(e) => setRespNome(e.target.value)} placeholder="Quem assina a retirada" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">CPF</label>
                  <Input value={respCpf} onChange={(e) => setRespCpf(e.target.value)} placeholder="000.000.000-00" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Quem RETIROU (terceiro)</label>
                  <Input value={quemEntregou} onChange={(e) => setQuemEntregou(e.target.value)} placeholder="Pessoa que veio buscar" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Quem LIBEROU (obra)</label>
                  <Input value={quemRecebeu} onChange={(e) => setQuemRecebeu(e.target.value)} placeholder="Almoxarife, portaria" />
                </div>
              </div>
            </section>
          )}

          {/* Lista de itens "na obra" da entrada escolhida */}
          {registroPaiId && (
            <section className="bg-white border-2 border-blue-200 rounded-lg p-3">
              <h3 className="text-sm font-semibold text-blue-700 mb-2">
                Itens em Obra — {(itensPai.data as any[] | undefined)?.length || 0} disponível(eis)
              </h3>
              {itensPai.isLoading ? (
                <div className="p-6 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
              ) : (
                <div className="space-y-2">
                  {(itensPai.data as any[] | undefined)?.map((it) => {
                    const sel = selecionados[it.id];
                    return (
                      <div key={it.id} className={`border rounded p-2 ${sel ? "bg-blue-50 border-blue-300" : "bg-slate-50"}`}>
                        <div className="flex items-start gap-3">
                          <input type="checkbox" className="mt-1.5 h-4 w-4" checked={!!sel} onChange={() => toggleItem(it.id)} />
                          {it.foto_url ? (
                            <img src={it.foto_url} className="h-16 w-16 object-cover rounded border" alt="" />
                          ) : (
                            <div className="h-16 w-16 bg-slate-100 rounded flex items-center justify-center"><ImageOff className="h-6 w-6 text-slate-400" /></div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm">{it.descricao}</div>
                            <div className="text-xs text-muted-foreground">
                              {[it.marca, it.modelo, it.numero_serie].filter(Boolean).join(" · ") || "—"}
                              {" · qtde "}{it.quantidade}
                              {" · entrou "}<Badge className="text-[9px] py-0">{it.condicao}</Badge>
                            </div>
                          </div>
                        </div>
                        {sel && (
                          <div className="mt-2 grid grid-cols-1 md:grid-cols-[120px_1fr_1fr_2fr] gap-2 pl-7">
                            <div>
                              <label className="text-[10px] font-semibold text-blue-700">FOTO SAÍDA *</label>
                              <ItemFotoInput preview={sel.fotoPreview} onPick={(f) => handleFoto(it.id, f)} onClear={() => atualizar(it.id, "fotoPreview", "") || atualizar(it.id, "fotoBase64", "") || atualizar(it.id, "fotoMime", "")} />
                            </div>
                            <div>
                              <label className="text-[10px] font-semibold text-blue-700">Condição</label>
                              <Select value={sel.condicao} onValueChange={(v) => atualizar(it.id, "condicao", v)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="nova">Nova</SelectItem>
                                  <SelectItem value="boa">Boa</SelectItem>
                                  <SelectItem value="regular">Regular</SelectItem>
                                  <SelectItem value="ruim">Ruim</SelectItem>
                                  <SelectItem value="danificada">Danificada</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <label className="text-[10px] font-semibold text-blue-700">Status</label>
                              <Select value={sel.status} onValueChange={(v) => atualizar(it.id, "status", v)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="devolvido">Devolvido OK</SelectItem>
                                  <SelectItem value="danificada">Devolvido Danificado</SelectItem>
                                  <SelectItem value="perda">Perda (não devolveu)</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <label className="text-[10px] font-semibold text-blue-700">Observação</label>
                              <Input value={sel.observacao} onChange={(e) => atualizar(it.id, "observacao", e.target.value)} placeholder="ex: Falta a chave" />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {registroPaiId && (
            <section className="bg-slate-50 border rounded-lg p-3">
              <label className="text-xs font-medium text-muted-foreground">Observações Gerais da Saída</label>
              <Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} />
            </section>
          )}
        </div>

        <div className="border-t p-3 flex items-center justify-between shrink-0 bg-white">
          <p className="text-xs text-muted-foreground">
            <strong>{Object.keys(selecionados).length}</strong> item(s) marcado(s) para saída.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={enviando}>Cancelar</Button>
            <Button onClick={salvar} disabled={enviando || !registroPaiId} className="bg-blue-600 hover:bg-blue-700">
              {enviando ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Salvando…</> : <><CheckCircle2 className="h-4 w-4 mr-1.5" />Confirmar Saída</>}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ════════════════════════════════════════════════════════════════
// MODAL DETALHES — visualização de um registro
// ════════════════════════════════════════════════════════════════
function ModalDetalhes({ companyId, registroId, onClose }:
  { companyId: number; registroId: number; onClose: () => void }) {
  const q = trpc.ferramentasTerceiros.getById.useQuery({ companyId, id: registroId });
  const r = q.data?.registro as any;
  const itens = (q.data?.itens || []) as any[];

  return (
    <Dialog open={true} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="!fixed !inset-0 !translate-x-0 !translate-y-0 !max-w-none !w-screen !h-screen !rounded-none" style={{ top: 0, left: 0, transform: 'none', display: 'flex', flexDirection: 'column' }}>
        <DialogHeader className="border-b pb-3 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            {r?.tipo === "ENTRADA" ? <ArrowDownCircle className="h-5 w-5 text-emerald-600" /> : <ArrowUpCircle className="h-5 w-5 text-blue-600" />}
            Registro #{registroId} — {r?.tipo === "ENTRADA" ? "Entrada" : "Saída"}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {q.isLoading ? (
            <div className="p-12 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto" /></div>
          ) : !r ? (
            <p className="text-muted-foreground">Registro não encontrado.</p>
          ) : (
            <>
              <section className="bg-slate-50 border rounded-lg p-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <Info label="Empresa" value={r.empresa_terceira} />
                  <Info label="CNPJ" value={r.cnpj} />
                  <Info label="Responsável" value={r.responsavel_nome} />
                  <Info label="CPF" value={r.responsavel_cpf} />
                  <Info label="Telefone" value={r.responsavel_telefone} />
                  <Info label="Obra" value={r.obra_nome} />
                  <Info label="Quem entregou" value={r.quem_entregou} />
                  <Info label="Quem recebeu" value={r.quem_recebeu} />
                  <Info label="Data/Hora" value={new Date(r.data_hora).toLocaleString("pt-BR")} />
                  <Info label="Lançado por" value={r.lancado_por_nome} />
                  {r.registro_pai_id && <Info label="Entrada pai" value={`#${r.registro_pai_id}`} />}
                  <Info label="Status" value={STATUS_REG_BADGE[r.status]?.label || r.status} />
                </div>
                {r.observacoes && (
                  <div className="mt-2 pt-2 border-t text-xs">
                    <strong className="text-muted-foreground">Observações:</strong> {r.observacoes}
                  </div>
                )}
                {r.foto_documento_url && (
                  <div className="mt-2 pt-2 border-t">
                    <strong className="text-xs text-muted-foreground">Documento do responsável:</strong>
                    <a href={r.foto_documento_url} target="_blank" rel="noreferrer">
                      <img src={r.foto_documento_url} className="h-32 mt-1 rounded border" alt="documento" />
                    </a>
                  </div>
                )}
              </section>

              <section>
                <h3 className="text-sm font-semibold mb-2">Itens ({itens.length})</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {itens.map((it) => {
                    const sb = STATUS_ITEM_BADGE[it.status_item] || { label: it.status_item, cls: "bg-gray-100" };
                    // Rev. 1884 — galeria de fotos. Usa `fotos_urls[]` quando presente
                    // (items novos), fallback para `foto_url` (items legados).
                    const galeria: string[] = Array.isArray(it.fotos_urls) && it.fotos_urls.length > 0
                      ? it.fotos_urls
                      : (it.foto_url ? [it.foto_url] : []);
                    return (
                      <div key={it.id} className="border rounded-lg p-3 bg-white flex gap-3">
                        {galeria.length > 0 ? (
                          <div className="shrink-0 flex flex-col gap-1">
                            <a href={galeria[0]} target="_blank" rel="noreferrer">
                              <img src={galeria[0]} className="h-24 w-24 object-cover rounded border" alt="" />
                            </a>
                            {galeria.length > 1 && (
                              <div className="grid grid-cols-3 gap-0.5 w-24">
                                {galeria.slice(1, 7).map((u, gi) => (
                                  <a key={gi} href={u} target="_blank" rel="noreferrer">
                                    <img src={u} className="h-7 w-full object-cover rounded border" alt={`extra ${gi + 2}`} />
                                  </a>
                                ))}
                                {galeria.length > 7 && (
                                  <div className="h-7 bg-slate-100 rounded border flex items-center justify-center text-[9px] font-semibold text-slate-600">
                                    +{galeria.length - 7}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="h-24 w-24 bg-slate-100 rounded flex items-center justify-center"><ImageOff className="h-6 w-6 text-slate-400" /></div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-sm">{it.descricao}</div>
                          <div className="text-xs text-muted-foreground">
                            {[it.marca, it.modelo].filter(Boolean).join(" · ") || "—"}
                          </div>
                          {it.numero_serie && <div className="text-xs">SN: <code>{it.numero_serie}</code></div>}
                          <div className="text-xs mt-1">Qtde {it.quantidade} · <Badge className="text-[9px]">{it.condicao}</Badge></div>
                          <Badge className={`mt-1 text-[10px] ${sb.cls}`}>{sb.label}</Badge>
                          {it.observacao && <p className="text-[11px] text-muted-foreground mt-1 italic">{it.observacao}</p>}
                          {it.item_entrada_id && <p className="text-[10px] text-blue-600 mt-1">→ Item original #{it.item_entrada_id}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </>
          )}
        </div>
        <div className="border-t p-3 flex justify-end shrink-0 bg-white">
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <p className="text-[10px] uppercase text-muted-foreground font-semibold">{label}</p>
      <p className="text-sm">{value || <span className="text-muted-foreground">—</span>}</p>
    </div>
  );
}
