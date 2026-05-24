import DashboardLayout from "@/components/DashboardLayout";
import { useState, useMemo, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { toast } from "sonner";
import { Plus, Search, Pencil, X, HardHat, Camera, ChevronDown, ChevronUp, Sparkles, Trash2, Boxes } from "lucide-react";
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
  disponivel: "bg-emerald-100 text-emerald-700",
  em_obra: "bg-blue-100 text-blue-700",
  manutencao: "bg-amber-100 text-amber-700",
  baixado: "bg-slate-200 text-slate-700",
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
  // Não pode usar `data.length` porque essa lista é filtrada por busca/status
  // (gera colisões com patrimônios já existentes fora do filtro ativo).
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

  // Rev. 2364 — gera patrimônio automático "EQP-NNNN" baseado no count TOTAL
  // (não na lista filtrada). Olha o maior `EQP-N` já cadastrado e soma 1 pra
  // evitar colisão quando IDs antigos foram apagados ou misturados.
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

  // Rev. 2374 — Fila de importação vinda do Almoxarifado (?importAlmox=1).
  // O usuário marcou N equipamentos no Almoxarifado, clicou "É PRÓPRIO da FC"
  // e foi parar aqui — abrimos o modal pré-preenchido com nome+categoria+foto
  // do 1º item, e a cada save avançamos pro próximo até esvaziar a fila.
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
    if (!totalFetched) return; // espera contagem pro EQP-NNNN não colidir
    const url = new URL(window.location.href);
    if (url.searchParams.get("importAlmox") !== "1") return;
    try {
      const raw = sessionStorage.getItem("fc:importAlmoxEquip:queue");
      const tipo = sessionStorage.getItem("fc:importAlmoxEquip:tipo");
      if (!raw || tipo !== "proprio") return;
      const payload = JSON.parse(raw) as { companyId: number; itens: Array<{ nome: string; fotoUrl: string; categoria: string }> };
      const arr = payload?.itens;
      // Rev. 2374 — rejeita se a empresa atual ≠ empresa de origem (anti-contaminação).
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
    setMostrarDetalhes(true); // ao editar, abre detalhes pra ver tudo
    setModal(true);
  }

  const criar = trpc.equipamentos.proprioCriar.useMutation({
    onSuccess: () => {
      utils.equipamentos.propriosListar.invalidate();
      // Rev. 2374 — se há fila de importação do Almoxarifado, avança pro próximo
      // item em vez de fechar o modal. Quando a fila esvazia, fecha + toast final.
      if (importQueue.length > 0) {
        const [next, ...rest] = importQueue;
        setImportQueue(rest);
        // pequeno delay pra dar tempo do invalidate atualizar `totalList` (EQP-NNNN)
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
    // Rev. 2364 — patrimônio auto-preenchido se vazio. Aguarda a query de
    // contagem total chegar (totalFetched) pra evitar colisão com EQP-0001
    // quando o usuário salva antes do load inicial.
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
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <HardHat className="h-6 w-6 text-blue-600" /> Equipamentos Próprios
            </h1>
            <p className="text-sm text-slate-600">Cadastro unitário do parque próprio da empresa.</p>
          </div>
          <button onClick={abrirNovo} className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded shadow-sm">
            <Plus className="h-4 w-4" /> Novo
          </button>
        </div>

        <div className="grid grid-cols-4 gap-3">
          <Stat title="Total" value={stats.total} color="text-slate-800" />
          <Stat title="Em obra" value={stats.em_obra} color="text-blue-700" />
          <Stat title="Disponíveis" value={stats.disponivel} color="text-emerald-700" />
          <Stat title="Manutenção" value={stats.manutencao} color="text-amber-700" />
        </div>

        <div className="bg-white border rounded-lg shadow-sm p-3 flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por descrição, patrimônio, série…"
              className="w-full pl-9 pr-3 py-2 border rounded text-sm" />
          </div>
          <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} className="px-3 py-2 border rounded text-sm">
            <option value="">Todos os status</option>
            <option value="disponivel">Disponíveis</option>
            <option value="em_obra">Em obra</option>
            <option value="manutencao">Manutenção</option>
            <option value="baixado">Baixados</option>
          </select>
        </div>

        <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="p-8 flex justify-center"><Spinner /></div>
          ) : data.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">Nenhum equipamento cadastrado.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left text-xs text-slate-600 uppercase">
                  <th className="px-3 py-2">Foto</th>
                  <th className="px-3 py-2">Patrimônio</th>
                  <th className="px-3 py-2">Descrição</th>
                  <th className="px-3 py-2">Categoria</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Valor aquis.</th>
                  <th className="px-3 py-2">Aquisição</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {(data as any[]).map(p => {
                  const fotos = (p.fotosJson as FotoItem[]) || [];
                  return (
                    <tr key={p.id} className="border-t hover:bg-slate-50">
                      <td className="px-3 py-2">
                        {fotos[0]
                          ? <img src={fotos[0].url} className="w-10 h-10 object-cover rounded" />
                          : <div className="w-10 h-10 rounded bg-slate-100 flex items-center justify-center text-slate-400 text-xs">—</div>}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{p.codigoPatrimonio}</td>
                      <td className="px-3 py-2 font-medium text-slate-800">{p.descricao}</td>
                      <td className="px-3 py-2 text-slate-600">{p.categoria || "—"}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[p.status] || "bg-slate-100"}`}>
                          {STATUS_LABELS[p.status] || p.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">{p.valorAquisicao ? fmtMoney(p.valorAquisicao) : "—"}</td>
                      <td className="px-3 py-2 text-slate-600">{fmtDate(p.dataAquisicao)}</td>
                      <td className="px-3 py-2 text-right">
                        <button onClick={() => abrirEdit(p)} className="text-blue-600 hover:bg-blue-50 p-1 rounded">
                          <Pencil className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {modal && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center sm:p-4"
          onClick={() => setModal(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="prop-modal-title"
        >
          <div
            className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-w-xl w-full max-h-[92dvh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-5 py-3 border-b flex items-center justify-between sticky top-0 bg-white z-10">
              <h2 id="prop-modal-title" className="font-semibold text-slate-800 text-lg">
                {editingId ? "Editar Equipamento" : "Cadastrar Equipamento"}
              </h2>
              <button onClick={() => setModal(false)} aria-label="Fechar">
                <X className="h-6 w-6 text-slate-500" />
              </button>
            </div>
            {/* Rev. 2374 — Banner da fila de importação do Almoxarifado */}
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
              {/* 1) FOTO — destaque máximo. Servente toca, abre câmera traseira. */}
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

              {/* 2) DESCRIÇÃO — único campo obrigatório, em destaque */}
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

              {/* 3) CATEGORIA — chips de toque rápido */}
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
                            ? "bg-blue-600 text-white border-blue-600 shadow"
                            : "bg-white text-slate-700 border-slate-200 hover:border-blue-400"
                        }`}
                      >
                        {cat}
                      </button>
                    );
                  })}
                </div>
                {/* permite categoria livre digitada se não bater com nenhum chip */}
                {form.categoria && !CATEGORIAS_QUICK.some(c => c.toLowerCase() === form.categoria.toLowerCase()) && (
                  <input
                    value={form.categoria}
                    onChange={e => setForm(p => ({ ...p, categoria: e.target.value }))}
                    placeholder="Outra categoria"
                    className="mt-2 w-full px-3 py-2 border rounded text-sm"
                  />
                )}
              </div>

              {/* 4) PATRIMÔNIO — auto-gerado, mas editável */}
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
                      className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg flex items-center gap-1 text-sm"
                      title="Gerar patrimônio automático"
                    >
                      <Sparkles className="h-4 w-4" /> Auto
                    </button>
                  )}
                </div>
              </div>

              {/* 5) MAIS DETALHES — collapsible, fechado por default */}
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
                className="px-6 py-2 text-base font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow disabled:opacity-50">
                {criar.isPending || atualizar.isPending ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

function Stat({ title, value, color }: { title: string; value: number; color: string }) {
  return (
    <div className="bg-white border rounded-lg shadow-sm p-3">
      <div className="text-xs text-slate-500 uppercase">{title}</div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
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
