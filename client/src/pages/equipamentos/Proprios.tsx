import DashboardLayout from "@/components/DashboardLayout";
import { useState, useMemo, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { toast } from "sonner";
import {
  Plus, Search, Pencil, X, HardHat, Camera, ChevronDown, ChevronUp,
  Sparkles, Trash2, Boxes, Wrench, CheckCircle2, Layers, Hash,
} from "lucide-react";
import { FotosUploader, FotoItem, compressImage, fmtMoney, fmtDate, Spinner } from "./_shared";

const EMPTY_FORM = {
  codigoPatrimonio: "", descricao: "", categoria: "", numeroSerie: "",
  marca: "", modelo: "", dataAquisicao: "", valorAquisicao: "",
  vidaUtilMeses: "", observacoes: "",
};

// Rev. 2364 — chips de categoria de toque rápido (servente toca em vez de digitar).
// Casa com as categorias de vida útil do CAPEX (server/routers/equipamentos.ts:90-96).
const CATEGORIAS_QUICK = [
  "Andaime", "Betoneira", "Compressor", "Gerador",
  "Compactador", "Serra", "Furadeira", "Ferramenta elétrica",
];

const STATUS_LABELS: Record<string, string> = {
  disponivel: "Disponível", em_obra: "Em obra", manutencao: "Manutenção", baixado: "Baixado",
};
const STATUS_COLORS: Record<string, string> = {
  disponivel: "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200",
  em_obra:    "bg-blue-100 text-blue-700 ring-1 ring-blue-200",
  manutencao: "bg-amber-100 text-amber-700 ring-1 ring-amber-200",
  baixado:    "bg-slate-200 text-slate-700 ring-1 ring-slate-300",
};

export default function EquipamentosProprios() {
  const { selectedCompany } = useCompany();
  const companyId = Number(selectedCompany?.id) || 0;
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<string>("");

  const utils = trpc.useUtils();
  const { data = [], isLoading } = trpc.equipamentos.propriosListar.useQuery(
    { companyId, busca: busca || undefined, status: (filtroStatus as any) || undefined },
    { enabled: !!companyId }
  );
  // Rev. 2364 — segunda query SEM filtros pra contagem total real (auto-ID).
  const { data: totalList = [], isFetched: totalFetched } =
    trpc.equipamentos.propriosListar.useQuery(
      { companyId },
      { enabled: !!companyId, staleTime: 30_000 }
    );

  const [modal, setModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [fotos, setFotos] = useState<FotoItem[]>([]);
  const [mostrarDetalhes, setMostrarDetalhes] = useState(false);
  const fotoInputRef = useRef<HTMLInputElement>(null);

  function gerarPatrimonioAuto() {
    let maxN = 0;
    for (const p of (totalList || []) as any[]) {
      const m = /^EQP-(\d+)$/i.exec(String(p.codigoPatrimonio || ""));
      if (m) {
        const n = parseInt(m[1], 10);
        if (n > maxN) maxN = n;
      }
    }
    const proximo = maxN + 1;
    return `EQP-${String(proximo).padStart(4, "0")}`;
  }

  function abrirNovo() {
    setForm({ ...EMPTY_FORM }); setFotos([]); setEditingId(null);
    setMostrarDetalhes(false); setModal(true);
  }

  // Rev. 2374 — Fila de importação vinda do Almoxarifado.
  const [importQueue, setImportQueue] = useState<Array<{ nome: string; fotoUrl: string; categoria: string }>>([]);
  const [importTotal, setImportTotal] = useState(0);
  function preencherFormDoItem(it: { nome: string; fotoUrl: string; categoria: string }) {
    setForm({
      ...EMPTY_FORM,
      descricao: it.nome,
      categoria: it.categoria || "",
      codigoPatrimonio: gerarPatrimonioAuto(),
    });
    setFotos(it.fotoUrl ? [{ url: it.fotoUrl, uploadedAt: new Date().toISOString() }] : []);
    setEditingId(null);
    setMostrarDetalhes(false);
    setModal(true);
  }
  useEffect(() => {
    if (!companyId) return;
    if (!totalFetched) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("importAlmox") !== "1") return;
    try {
      const raw = sessionStorage.getItem("fc:importAlmoxEquip:queue");
      const tipo = sessionStorage.getItem("fc:importAlmoxEquip:tipo");
      if (!raw || tipo !== "proprio") return;
      const payload = JSON.parse(raw) as { companyId: number; itens: Array<{ nome: string; fotoUrl: string; categoria: string }> };
      const arr = payload?.itens;
      if (!payload || payload.companyId !== companyId) {
        sessionStorage.removeItem("fc:importAlmoxEquip:queue");
        sessionStorage.removeItem("fc:importAlmoxEquip:tipo");
        url.searchParams.delete("importAlmox");
        window.history.replaceState({}, "", url.pathname + (url.search ? `?${url.searchParams.toString()}` : ""));
        toast.error("A fila de importação era de outra empresa. Foi descartada.");
        return;
      }
      if (!Array.isArray(arr) || arr.length === 0) return;
      sessionStorage.removeItem("fc:importAlmoxEquip:queue");
      sessionStorage.removeItem("fc:importAlmoxEquip:tipo");
      url.searchParams.delete("importAlmox");
      window.history.replaceState({}, "", url.pathname + (url.search ? `?${url.searchParams.toString()}` : ""));
      setImportTotal(arr.length);
      setImportQueue(arr.slice(1));
      preencherFormDoItem(arr[0]);
      toast.info(`${arr.length} equipamento${arr.length !== 1 ? "s" : ""} pra cadastrar como PRÓPRIO. Revise e salve cada um.`);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, totalFetched]);

  async function handleFotoTop(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const news: FotoItem[] = [];
    for (const f of files) {
      try {
        const url = await compressImage(f);
        news.push({ url, uploadedAt: new Date().toISOString() });
      } catch {}
    }
    setFotos(prev => [...prev, ...news].slice(0, 6));
    e.target.value = "";
  }
  function abrirEdit(p: any) {
    setForm({
      codigoPatrimonio: p.codigoPatrimonio,
      descricao: p.descricao,
      categoria: p.categoria || "",
      numeroSerie: p.numeroSerie || "",
      marca: p.marca || "",
      modelo: p.modelo || "",
      dataAquisicao: (p.dataAquisicao || "").slice(0, 10),
      valorAquisicao: p.valorAquisicao ? String(Number(p.valorAquisicao)).replace(".", ",") : "",
      vidaUtilMeses: p.vidaUtilMeses ? String(p.vidaUtilMeses) : "",
      observacoes: p.observacoes || "",
    });
    setFotos((p.fotosJson as FotoItem[]) || []);
    setEditingId(p.id);
    setMostrarDetalhes(true);
    setModal(true);
  }

  const criar = trpc.equipamentos.proprioCriar.useMutation({
    onSuccess: () => {
      utils.equipamentos.propriosListar.invalidate();
      if (importQueue.length > 0) {
        const [next, ...rest] = importQueue;
        setImportQueue(rest);
        setTimeout(() => preencherFormDoItem(next), 250);
        toast.success("Cadastrado! Próximo da fila…");
      } else {
        setModal(false);
        if (importTotal > 0) {
          toast.success(`${importTotal} equipamento${importTotal !== 1 ? "s" : ""} próprio${importTotal !== 1 ? "s" : ""} importado${importTotal !== 1 ? "s" : ""} do Almoxarifado.`);
          setImportTotal(0);
        } else {
          toast.success("Equipamento cadastrado!");
        }
      }
    },
    onError: (e) => toast.error(e.message),
  });
  const atualizar = trpc.equipamentos.proprioAtualizar.useMutation({
    onSuccess: () => { utils.equipamentos.propriosListar.invalidate(); setModal(false); toast.success("Atualizado."); },
    onError: (e) => toast.error(e.message),
  });

  function salvar() {
    if (!form.descricao.trim()) return toast.error("Diga o que é o equipamento (descrição).");
    if (!editingId && !form.codigoPatrimonio.trim() && !totalFetched) {
      return toast.error("Carregando lista de patrimônios… tente em 1s.");
    }
    const patrimonio = form.codigoPatrimonio.trim() || gerarPatrimonioAuto();
    const valor = parseFloat(form.valorAquisicao.replace(",", ".")) || undefined;
    const vida = parseInt(form.vidaUtilMeses) || undefined;
    if (editingId) {
      atualizar.mutate({
        companyId, id: editingId,
        descricao: form.descricao,
        categoria: form.categoria || null,
        marca: form.marca || null,
        modelo: form.modelo || null,
        valorAquisicao: valor ?? null,
        vidaUtilMeses: vida ?? null,
        observacoes: form.observacoes || null,
        fotos: fotos.length > 0 ? fotos : undefined,
      });
    } else {
      criar.mutate({
        companyId,
        codigoPatrimonio: patrimonio,
        descricao: form.descricao,
        categoria: form.categoria || undefined,
        numeroSerie: form.numeroSerie || undefined,
        marca: form.marca || undefined,
        modelo: form.modelo || undefined,
        dataAquisicao: form.dataAquisicao || undefined,
        valorAquisicao: valor,
        vidaUtilMeses: vida,
        fotos: fotos.length > 0 ? fotos : undefined,
        observacoes: form.observacoes || undefined,
      });
    }
  }

  const stats = useMemo(() => {
    const s = { total: data.length, em_obra: 0, disponivel: 0, manutencao: 0 };
    for (const p of data as any[]) {
      if (p.status === "em_obra") s.em_obra++;
      else if (p.status === "disponivel") s.disponivel++;
      else if (p.status === "manutencao") s.manutencao++;
    }
    return s;
  }, [data]);

  return (
    <DashboardLayout>
      {/* Rev. 2510 — Header com identidade FC (faixa azul #1B2A4A, regra de ouro) */}
      <div
        className="text-white shadow-lg"
        style={{
          background: "linear-gradient(135deg, #1B2A4A 0%, #2E4373 100%)",
          printColorAdjust: "exact" as any,
        }}
      >
        <div className="max-w-7xl mx-auto px-4 py-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-11 w-11 rounded-lg bg-white/10 backdrop-blur flex items-center justify-center ring-1 ring-white/20 shrink-0">
              <HardHat className="h-6 w-6 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-white text-base sm:text-lg font-bold uppercase tracking-[0.2em] truncate">
                Equipamentos Próprios
              </h1>
              <p className="text-white/70 text-xs mt-0.5 truncate">
                Parque permanente da FC · controle unitário com foto, patrimônio e CAPEX
              </p>
            </div>
          </div>
          <button
            onClick={abrirNovo}
            className="inline-flex items-center gap-2 bg-white text-[#1B2A4A] hover:bg-blue-50 active:scale-[0.98] px-4 py-2.5 rounded-lg font-semibold shadow-md transition shrink-0"
          >
            <Plus className="h-5 w-5" /> <span className="hidden sm:inline">Cadastrar</span><span className="sm:hidden">Novo</span>
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-5 space-y-5">
        {/* KPIs com ícones coloridos */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard icon={<Layers className="h-4 w-4" />}        label="Total"        value={stats.total}      color="slate"   />
          <KpiCard icon={<HardHat className="h-4 w-4" />}       label="Em obra"      value={stats.em_obra}    color="blue"    />
          <KpiCard icon={<CheckCircle2 className="h-4 w-4" />}  label="Disponíveis"  value={stats.disponivel} color="emerald" />
          <KpiCard icon={<Wrench className="h-4 w-4" />}        label="Manutenção"   value={stats.manutencao} color="amber"   />
        </div>

        {/* Filtros sticky no topo da lista */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar por descrição, patrimônio ou nº de série…"
              className="w-full pl-9 pr-3 py-2.5 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-200 outline-none rounded-lg text-sm transition"
            />
          </div>
          <div className="flex gap-2">
            {[
              { v: "",           l: "Todos",        c: "border-slate-300 text-slate-700" },
              { v: "disponivel", l: "Disponíveis",  c: "border-emerald-300 text-emerald-700" },
              { v: "em_obra",    l: "Em obra",      c: "border-blue-300 text-blue-700" },
              { v: "manutencao", l: "Manutenção",   c: "border-amber-300 text-amber-700" },
              { v: "baixado",    l: "Baixados",     c: "border-slate-400 text-slate-600" },
            ].map(opt => {
              const active = filtroStatus === opt.v;
              return (
                <button
                  key={opt.v || "all"}
                  onClick={() => setFiltroStatus(opt.v)}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold border-2 transition whitespace-nowrap ${
                    active
                      ? "bg-[#1B2A4A] text-white border-[#1B2A4A] shadow"
                      : `bg-white hover:bg-slate-50 ${opt.c}`
                  }`}
                >
                  {opt.l}
                </button>
              );
            })}
          </div>
        </div>

        {/* Grid de cards visuais (foto grande à esquerda, dados à direita) */}
        {isLoading ? (
          <div className="p-12 bg-white border border-slate-200 rounded-xl shadow-sm flex justify-center">
            <Spinner />
          </div>
        ) : data.length === 0 ? (
          <div className="p-12 bg-white border border-slate-200 rounded-xl shadow-sm text-center">
            <HardHat className="h-16 w-16 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-600 mb-1">Nenhum equipamento cadastrado</p>
            <p className="text-xs text-slate-500 mb-4">
              {busca || filtroStatus ? "Tente limpar os filtros." : "Toque em \"Cadastrar\" pra começar."}
            </p>
            {!busca && !filtroStatus && (
              <button
                onClick={abrirNovo}
                className="inline-flex items-center gap-2 bg-[#1B2A4A] hover:bg-[#2E4373] text-white px-4 py-2 rounded-lg text-sm font-semibold"
              >
                <Plus className="h-4 w-4" /> Cadastrar primeiro equipamento
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {(data as any[]).map(p => {
              const pFotos = (p.fotosJson as FotoItem[]) || [];
              const foto = pFotos[0];
              return (
                <div
                  key={p.id}
                  className="group bg-white border border-slate-200 hover:border-blue-400 hover:shadow-md rounded-xl overflow-hidden shadow-sm transition cursor-pointer flex"
                  onClick={() => abrirEdit(p)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter") abrirEdit(p); }}
                >
                  <div className="w-28 sm:w-32 shrink-0 bg-gradient-to-br from-slate-100 to-slate-200 relative">
                    {foto ? (
                      <img src={foto.url} alt={p.descricao} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-400">
                        <HardHat className="h-10 w-10" />
                      </div>
                    )}
                    {pFotos.length > 1 && (
                      <span className="absolute bottom-1 right-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">
                        +{pFotos.length - 1}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 p-3 flex flex-col gap-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <span className="inline-flex items-center gap-1 text-[10px] font-mono font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                        <Hash className="h-3 w-3" /> {p.codigoPatrimonio}
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); abrirEdit(p); }}
                        aria-label="Editar"
                        className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 opacity-0 group-hover:opacity-100 transition"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <h3 className="font-semibold text-slate-800 text-sm leading-snug line-clamp-2">{p.descricao}</h3>
                    <div className="flex items-center justify-between gap-2 mt-auto">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_COLORS[p.status] || "bg-slate-100 ring-1 ring-slate-200"}`}>
                        {STATUS_LABELS[p.status] || p.status}
                      </span>
                      <span className="text-[11px] text-slate-500 truncate">
                        {p.categoria || "—"}
                      </span>
                    </div>
                    {(p.valorAquisicao || p.dataAquisicao) && (
                      <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1.5 border-t border-slate-100">
                        <span>{p.valorAquisicao ? fmtMoney(p.valorAquisicao) : "—"}</span>
                        <span>{fmtDate(p.dataAquisicao) || "—"}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal — Rev. 2510 com faixa azul FC no topo (regra de ouro) */}
      {modal && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center sm:p-4"
          onClick={() => setModal(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="prop-modal-title"
        >
          <div
            className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl max-w-xl w-full max-h-[92dvh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div
              className="px-5 py-4 text-white flex items-center justify-between sticky top-0 z-10"
              style={{
                background: "linear-gradient(135deg, #1B2A4A 0%, #2E4373 100%)",
                printColorAdjust: "exact" as any,
              }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-9 w-9 rounded-lg bg-white/10 backdrop-blur flex items-center justify-center ring-1 ring-white/20 shrink-0">
                  <HardHat className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h2 id="prop-modal-title" className="text-white text-sm font-bold uppercase tracking-[0.2em] truncate">
                    {editingId ? "Editar Equipamento" : "Novo Equipamento"}
                  </h2>
                  <p className="text-white/70 text-[10px] mt-0.5 truncate">
                    {editingId ? `Patrimônio ${form.codigoPatrimonio}` : "Parque próprio FC"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setModal(false)}
                aria-label="Fechar"
                className="p-1.5 rounded-lg hover:bg-white/10 transition shrink-0"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {importTotal > 0 && (
              <div className="bg-emerald-50 border-b-2 border-emerald-300 px-5 py-3 flex items-center gap-3">
                <Boxes className="h-5 w-5 text-emerald-700 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-bold text-emerald-900">
                    Importando do Almoxarifado · {importTotal - importQueue.length} de {importTotal}
                  </p>
                  <p className="text-[11px] text-emerald-700/90 leading-tight">
                    Revise os dados e salve. Restam {importQueue.length} equipamento{importQueue.length !== 1 ? "s" : ""} na fila.
                  </p>
                </div>
                <button
                  onClick={() => { setImportQueue([]); setImportTotal(0); toast.info("Importação cancelada."); }}
                  className="text-xs text-emerald-700 hover:text-emerald-900 font-medium underline"
                >
                  Parar fila
                </button>
              </div>
            )}

            <div className="p-5 space-y-5">
              {/* 1) FOTO */}
              {!editingId && (
                <div>
                  <input
                    ref={fotoInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    multiple
                    onChange={handleFotoTop}
                    className="hidden"
                  />
                  {fotos.length === 0 ? (
                    <button
                      type="button"
                      onClick={() => fotoInputRef.current?.click()}
                      className="w-full border-2 border-dashed border-blue-300 hover:border-blue-500 hover:bg-blue-50 rounded-2xl py-8 flex flex-col items-center justify-center gap-2 text-blue-700 active:scale-[0.98] transition"
                    >
                      <Camera className="h-12 w-12" />
                      <span className="text-base font-semibold">Bater foto do equipamento</span>
                      <span className="text-xs text-slate-500">Toque pra abrir a câmera</span>
                    </button>
                  ) : (
                    <div>
                      <div className="grid grid-cols-3 gap-2">
                        {fotos.map((f, i) => (
                          <div key={i} className="relative group">
                            <img src={f.url} alt={`foto-${i}`} className="w-full h-24 object-cover rounded-lg border" />
                            <button
                              type="button"
                              onClick={() => setFotos(prev => prev.filter((_, j) => j !== i))}
                              aria-label="Remover foto"
                              className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-1 shadow"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                        {fotos.length < 6 && (
                          <button
                            type="button"
                            onClick={() => fotoInputRef.current?.click()}
                            className="h-24 border-2 border-dashed border-slate-300 hover:border-blue-400 rounded-lg flex items-center justify-center text-slate-400 hover:text-blue-600"
                            aria-label="Adicionar mais fotos"
                          >
                            <Camera className="h-7 w-7" />
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-1.5 text-center">{fotos.length} foto(s) · máx 6</p>
                    </div>
                  )}
                </div>
              )}

              {/* 2) DESCRIÇÃO */}
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1.5">
                  O que é? <span className="text-red-600">*</span>
                </label>
                <input
                  value={form.descricao}
                  onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))}
                  placeholder="Ex: Furadeira Bosch GSB 550, Andaime tubular 1,5m…"
                  autoFocus
                  className="w-full px-3 py-3 border-2 border-slate-200 focus:border-blue-500 focus:outline-none rounded-lg text-base"
                />
              </div>

              {/* 3) CATEGORIA */}
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1.5">Categoria</label>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIAS_QUICK.map(cat => {
                    const active = form.categoria.toLowerCase() === cat.toLowerCase();
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setForm(p => ({ ...p, categoria: active ? "" : cat }))}
                        className={`px-3 py-2 rounded-full text-sm font-medium border-2 transition ${
                          active
                            ? "bg-[#1B2A4A] text-white border-[#1B2A4A] shadow"
                            : "bg-white text-slate-700 border-slate-200 hover:border-blue-400"
                        }`}
                      >
                        {cat}
                      </button>
                    );
                  })}
                </div>
                {form.categoria && !CATEGORIAS_QUICK.some(c => c.toLowerCase() === form.categoria.toLowerCase()) && (
                  <input
                    value={form.categoria}
                    onChange={e => setForm(p => ({ ...p, categoria: e.target.value }))}
                    placeholder="Outra categoria"
                    className="mt-2 w-full px-3 py-2 border rounded text-sm"
                  />
                )}
              </div>

              {/* 4) PATRIMÔNIO */}
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1.5">
                  Patrimônio {!editingId && <span className="text-xs font-normal text-slate-500">(deixe vazio pra gerar automático)</span>}
                </label>
                <div className="flex gap-2">
                  <input
                    value={form.codigoPatrimonio}
                    disabled={!!editingId}
                    onChange={e => setForm(p => ({ ...p, codigoPatrimonio: e.target.value }))}
                    placeholder={editingId ? "" : gerarPatrimonioAuto()}
                    className="flex-1 px-3 py-2.5 border rounded-lg text-base font-mono disabled:bg-slate-100"
                  />
                  {!editingId && (
                    <button
                      type="button"
                      onClick={() => setForm(p => ({ ...p, codigoPatrimonio: gerarPatrimonioAuto() }))}
                      className="px-3 py-2 border-2 border-blue-200 hover:border-blue-400 text-blue-700 rounded-lg text-sm font-medium inline-flex items-center gap-1"
                    >
                      <Sparkles className="h-4 w-4" /> Auto
                    </button>
                  )}
                </div>
              </div>

              {/* 5) MAIS DETALHES */}
              <div className="border-t pt-3">
                <button
                  type="button"
                  onClick={() => setMostrarDetalhes(v => !v)}
                  aria-expanded={mostrarDetalhes}
                  className="w-full flex items-center justify-between py-2 text-sm font-medium text-slate-600 hover:text-slate-900"
                >
                  <span>Mais detalhes (opcional)</span>
                  {mostrarDetalhes ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>

                {mostrarDetalhes && (
                  <div className="space-y-3 pt-2">
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="N° Série">
                        <input value={form.numeroSerie} disabled={!!editingId}
                          onChange={e => setForm(p => ({ ...p, numeroSerie: e.target.value }))}
                          className="w-full px-2 py-1.5 border rounded text-sm disabled:bg-slate-100" />
                      </Field>
                      <Field label="Marca">
                        <input value={form.marca} onChange={e => setForm(p => ({ ...p, marca: e.target.value }))}
                          className="w-full px-2 py-1.5 border rounded text-sm" />
                      </Field>
                    </div>
                    <Field label="Modelo">
                      <input value={form.modelo} onChange={e => setForm(p => ({ ...p, modelo: e.target.value }))}
                        className="w-full px-2 py-1.5 border rounded text-sm" />
                    </Field>
                    <div className="grid grid-cols-3 gap-3">
                      <Field label="Data Aquisição">
                        <input type="date" value={form.dataAquisicao} disabled={!!editingId}
                          onChange={e => setForm(p => ({ ...p, dataAquisicao: e.target.value }))}
                          className="w-full px-2 py-1.5 border rounded text-sm disabled:bg-slate-100" />
                      </Field>
                      <Field label="Valor (R$)">
                        <input value={form.valorAquisicao} onChange={e => setForm(p => ({ ...p, valorAquisicao: e.target.value }))}
                          placeholder="0,00" className="w-full px-2 py-1.5 border rounded text-sm" />
                      </Field>
                      <Field label="Vida útil (meses)">
                        <input value={form.vidaUtilMeses} onChange={e => setForm(p => ({ ...p, vidaUtilMeses: e.target.value }))}
                          placeholder="ex: 84" className="w-full px-2 py-1.5 border rounded text-sm" />
                      </Field>
                    </div>
                    <Field label="Observações">
                      <textarea value={form.observacoes} onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))}
                        rows={2} className="w-full px-2 py-1.5 border rounded text-sm" />
                    </Field>
                    {editingId && (
                      <FotosUploader fotos={fotos} onChange={setFotos} label="Fotos do equipamento" />
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="px-5 py-3 border-t bg-slate-50 flex items-center justify-end gap-2 sticky bottom-0">
              <button onClick={() => setModal(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-slate-100">Cancelar</button>
              <button onClick={salvar} disabled={criar.isPending || atualizar.isPending}
                className="px-6 py-2.5 text-base font-semibold bg-[#1B2A4A] hover:bg-[#2E4373] text-white rounded-lg shadow disabled:opacity-50 inline-flex items-center gap-2">
                {(criar.isPending || atualizar.isPending) && <Spinner />}
                {criar.isPending || atualizar.isPending ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

const KPI_COLOR: Record<string, { bg: string; ring: string; text: string; icon: string }> = {
  slate:   { bg: "bg-slate-50",   ring: "ring-slate-200",   text: "text-slate-800",   icon: "bg-slate-500"   },
  blue:    { bg: "bg-blue-50",    ring: "ring-blue-200",    text: "text-blue-700",    icon: "bg-blue-500"    },
  emerald: { bg: "bg-emerald-50", ring: "ring-emerald-200", text: "text-emerald-700", icon: "bg-emerald-500" },
  amber:   { bg: "bg-amber-50",   ring: "ring-amber-200",   text: "text-amber-700",   icon: "bg-amber-500"   },
};
function KpiCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: keyof typeof KPI_COLOR }) {
  const c = KPI_COLOR[color];
  return (
    <div className={`relative overflow-hidden rounded-xl ring-1 ${c.ring} ${c.bg} p-3`}>
      <div className="flex items-center gap-2 mb-1.5">
        <div className={`h-6 w-6 rounded-md ${c.icon} text-white flex items-center justify-center shadow-sm`}>
          {icon}
        </div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600 truncate">{label}</p>
      </div>
      <p className={`text-3xl font-extrabold tabular-nums ${c.text}`}>{value}</p>
    </div>
  );
}

function Field({ label, children, disabled }: { label: string; children: React.ReactNode; disabled?: boolean }) {
  return (
    <div>
      <label className={`block text-xs font-medium mb-1 ${disabled ? "text-slate-400" : "text-slate-700"}`}>{label}</label>
      {children}
    </div>
  );
}
