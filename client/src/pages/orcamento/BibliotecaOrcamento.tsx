import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import DashboardLayout from "@/components/DashboardLayout";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Wrench, Package, Search, Loader2, Upload, CheckCircle,
  AlertCircle, Plus, Pencil, Trash2, X, Check,
} from "lucide-react";

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function parseBRL(s: string) {
  return parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0;
}
function n(v: any) { return parseFloat(v || "0"); }

/* ── FORM INICIAL VAZIO ──────────────────────────────────────── */
const EMPTY_FORM = { codigo: "", descricao: "", unidade: "", tipo: "", precoUnitario: "", precoMin: "" };

/* ── COMPOSIÇÕES ─────────────────────────────────────────────── */
function ComposicoesView({ companyId }: { companyId: number }) {
  const [search, setSearch] = useState("");
  const { data: composicoes = [], isLoading } =
    trpc.orcamento.listarComposicoesCatalogo.useQuery({ companyId }, { enabled: companyId > 0 });

  const q = search.toLowerCase();
  const filt = composicoes.filter((c: any) =>
    !q || c.descricao?.toLowerCase().includes(q) || c.codigo?.toLowerCase().includes(q) || c.tipo?.toLowerCase().includes(q)
  );

  return (
    <>
      <div className="flex items-center gap-3 mb-5">
        <div className="p-2 rounded-lg bg-blue-100">
          <Wrench className="h-5 w-5 text-blue-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Composições</h1>
          <p className="text-sm text-muted-foreground">Catálogo central de composições da empresa</p>
        </div>
        <span className="ml-auto text-sm text-muted-foreground font-mono">{composicoes.length} registros</span>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Buscar por descrição, código ou tipo..."
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : filt.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Wrench className="h-10 w-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm">{search ? "Nenhuma composição encontrada para esta busca." : "Nenhuma composição cadastrada ainda."}</p>
          <p className="text-xs mt-1">Acesse um orçamento e use o botão "Biblioteca" para enviar itens.</p>
        </div>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-slate-50 text-muted-foreground">
                  <th className="text-left px-4 py-2 w-28">Código</th>
                  <th className="text-left px-3 py-2 min-w-[300px]">Descrição</th>
                  <th className="text-left px-3 py-2 w-32">Tipo</th>
                  <th className="text-center px-3 py-2 w-16">Un</th>
                  <th className="text-right px-3 py-2 w-28 text-blue-600">Custo Mat</th>
                  <th className="text-right px-3 py-2 w-28 text-orange-500">Custo MO</th>
                  <th className="text-right px-3 py-2 w-28 font-semibold">Total Unit</th>
                  <th className="text-center px-3 py-2 w-24">Orçamentos</th>
                </tr>
              </thead>
              <tbody>
                {filt.map((c: any) => (
                  <tr key={c.id} className="border-b hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-2 font-mono text-[10px] text-slate-500">{c.codigo || "—"}</td>
                    <td className="px-3 py-2">{c.descricao}</td>
                    <td className="px-3 py-2">
                      {c.tipo && <Badge variant="outline" className="text-[10px]">{c.tipo}</Badge>}
                    </td>
                    <td className="px-3 py-2 text-center text-muted-foreground">{c.unidade || "—"}</td>
                    <td className="px-3 py-2 text-right text-blue-600 tabular-nums">{formatBRL(n(c.custoUnitMat))}</td>
                    <td className="px-3 py-2 text-right text-orange-500 tabular-nums">{formatBRL(n(c.custoUnitMdo))}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatBRL(n(c.custoUnitTotal))}</td>
                    <td className="px-3 py-2 text-center">
                      <span className="inline-flex items-center justify-center w-7 h-5 rounded-full bg-slate-100 text-slate-600 font-medium text-[10px]">
                        {c.totalOrcamentos}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}

/* ── INSUMOS ─────────────────────────────────────────────────── */
function InsumosView({ companyId }: { companyId: number }) {
  const [search, setSearch]         = useState("");
  const [catFilter, setCatFilter]   = useState<string | null>(null);
  const [editingId, setEditingId]   = useState<number | "new" | null>(null);
  const [editForm, setEditForm]     = useState(EMPTY_FORM);
  const [saveError, setSaveError]   = useState<string | null>(null);
  const [jobId, setJobId]           = useState<string | null>(null);
  const [jobTotal, setJobTotal]     = useState(0);
  const [importError, setImportError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();
  const { data: insumos = [], isLoading } =
    trpc.orcamento.listarInsumosCatalogo.useQuery({ companyId }, { enabled: companyId > 0 });

  const { data: novoCodigo } = trpc.orcamento.gerarCodigoInsumo.useQuery(
    { companyId },
    { enabled: companyId > 0 && editingId === "new" }
  );

  // Preenche o código automático quando abre o form de novo insumo
  useEffect(() => {
    if (editingId === "new" && novoCodigo && !editForm.codigo) {
      setEditForm(f => ({ ...f, codigo: novoCodigo }));
    }
  }, [novoCodigo, editingId]);

  /* ── Polling de importação ──────────────────────────────────── */
  const { data: progresso } = trpc.orcamento.progressoImportacao.useQuery(
    { jobId: jobId ?? "" },
    {
      enabled: !!jobId,
      refetchInterval: (query: any) => {
        const data = query?.state?.data;
        if (!data || data.status === "running") return 600;
        return false;
      },
    }
  );
  useEffect(() => {
    if (!progresso) return;
    if (progresso.status === "done") utils.orcamento.listarInsumosCatalogo.invalidate({ companyId });
    if (progresso.status === "error") setImportError(progresso.error ?? "Erro desconhecido.");
  }, [progresso?.status]);

  /* ── Mutations ──────────────────────────────────────────────── */
  const importMut = trpc.orcamento.importarInsumosCatalogo.useMutation({
    onSuccess: (res) => { setJobId(res.jobId); setJobTotal(res.total); setImportError(null); },
    onError: (err) => setImportError(err.message),
  });

  const salvarMut = trpc.orcamento.salvarInsumo.useMutation({
    onSuccess: () => {
      utils.orcamento.listarInsumosCatalogo.invalidate({ companyId });
      setEditingId(null);
      setSaveError(null);
    },
    onError: (err) => setSaveError(err.message),
  });

  const excluirMut = trpc.orcamento.excluirInsumo.useMutation({
    onSuccess: () => utils.orcamento.listarInsumosCatalogo.invalidate({ companyId }),
  });

  /* ── Handlers ───────────────────────────────────────────────── */
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setJobId(null); setImportError(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = (ev.target?.result as string).split(",")[1];
      if (!base64) return;
      importMut.mutate({ companyId, fileBase64: base64, fileName: file.name });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  function startEdit(ins: any) {
    setEditingId(ins.id);
    setSaveError(null);
    setEditForm({
      codigo:        ins.codigo ?? "",
      descricao:     ins.descricao ?? "",
      unidade:       ins.unidade ?? "",
      tipo:          ins.tipo ?? "",
      precoUnitario: n(ins.precoMedio).toFixed(4).replace(".", ","),
      precoMin:      n(ins.precoMin).toFixed(4).replace(".", ","),
    });
  }

  function startNew() {
    setEditingId("new");
    setSaveError(null);
    setEditForm({ ...EMPTY_FORM, codigo: novoCodigo ?? "" });
  }

  function cancelEdit() { setEditingId(null); setSaveError(null); }

  function handleSave() {
    if (!editForm.descricao.trim()) { setSaveError("Descrição obrigatória."); return; }
    if (!editForm.codigo.trim())    { setSaveError("Código obrigatório."); return; }
    salvarMut.mutate({
      companyId,
      id:            editingId !== "new" ? (editingId as number) : undefined,
      codigo:        editForm.codigo,
      descricao:     editForm.descricao,
      unidade:       editForm.unidade,
      tipo:          editForm.tipo,
      precoUnitario: String(parseBRL(editForm.precoUnitario)),
      precoMin:      String(parseBRL(editForm.precoMin)),
    });
  }

  function field(key: keyof typeof EMPTY_FORM, className?: string) {
    return (
      <Input
        className={`h-6 text-xs px-1.5 py-0 ${className ?? ""}`}
        value={editForm[key]}
        onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
        onKeyDown={e => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") cancelEdit(); }}
      />
    );
  }

  /* ── Filtros ────────────────────────────────────────────────── */
  const categorias = Array.from(new Set(
    insumos.map((i: any) => i.tipo).filter(Boolean)
  )).sort() as string[];

  const isImporting = importMut.isPending || (!!jobId && progresso?.status === "running");
  const pct   = progresso?.pct ?? 0;
  const done  = progresso?.done ?? 0;
  const total = progresso?.total ?? jobTotal;

  const q = search.toLowerCase();
  const filt = (insumos as any[]).filter(i =>
    (!catFilter || i.tipo === catFilter) &&
    (!q || i.descricao?.toLowerCase().includes(q) || i.codigo?.toLowerCase().includes(q) || i.tipo?.toLowerCase().includes(q))
  );

  /* ── Render row helper ──────────────────────────────────────── */
  function renderRow(i: any) {
    const isEditing = editingId === i.id;
    if (isEditing) {
      return (
        <tr key={i.id} className="border-b bg-emerald-50">
          <td className="px-2 py-1">{field("codigo", "font-mono w-24")}</td>
          <td className="px-2 py-1">{field("descricao", "min-w-[260px]")}</td>
          <td className="px-2 py-1">{field("tipo", "w-36")}</td>
          <td className="px-2 py-1">{field("unidade", "w-12 text-center")}</td>
          <td className="px-2 py-1">{field("precoUnitario", "w-24 text-right tabular-nums")}</td>
          <td className="px-2 py-1">{field("precoMin", "w-24 text-right tabular-nums")}</td>
          <td className="px-2 py-1 text-center">
            <span className="inline-flex items-center justify-center w-7 h-5 rounded-full bg-slate-100 text-slate-600 font-medium text-[10px]">
              {i.totalOrcamentos}
            </span>
          </td>
          <td className="px-2 py-1">
            <div className="flex items-center gap-1">
              {saveError && <span className="text-red-500 text-[10px] mr-1">{saveError}</span>}
              <button onClick={handleSave} disabled={salvarMut.isPending}
                className="p-1 rounded hover:bg-emerald-200 text-emerald-700" title="Salvar">
                {salvarMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              </button>
              <button onClick={cancelEdit} className="p-1 rounded hover:bg-slate-200 text-slate-500" title="Cancelar">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </td>
        </tr>
      );
    }
    return (
      <tr key={i.id} className="border-b hover:bg-muted/30 transition-colors group">
        <td className="px-4 py-2 font-mono text-[10px] text-slate-500">{i.codigo || "—"}</td>
        <td className="px-3 py-2">{i.descricao}</td>
        <td className="px-3 py-2">
          {i.tipo && (
            <Badge
              variant="outline"
              className="text-[10px] cursor-pointer hover:bg-emerald-50"
              onClick={() => setCatFilter(catFilter === i.tipo ? null : i.tipo)}
            >{i.tipo}</Badge>
          )}
        </td>
        <td className="px-3 py-2 text-center text-muted-foreground">{i.unidade || "—"}</td>
        <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatBRL(n(i.precoMedio))}</td>
        <td className="px-3 py-2 text-right text-slate-400 tabular-nums">{formatBRL(n(i.precoMin))}</td>
        <td className="px-3 py-2 text-center">
          <span className="inline-flex items-center justify-center w-7 h-5 rounded-full bg-slate-100 text-slate-600 font-medium text-[10px]">
            {i.totalOrcamentos}
          </span>
        </td>
        <td className="px-2 py-1">
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => startEdit(i)}
              className="p-1 rounded hover:bg-blue-100 text-blue-600" title="Editar">
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => { if (confirm("Excluir este insumo?")) excluirMut.mutate({ companyId, id: i.id }); }}
              className="p-1 rounded hover:bg-red-100 text-red-500" title="Excluir">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <>
      {/* ── Cabeçalho ── */}
      <div className="flex items-center gap-3 mb-5">
        <div className="p-2 rounded-lg bg-emerald-100">
          <Package className="h-5 w-5 text-emerald-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Insumos</h1>
          <p className="text-sm text-muted-foreground">Catálogo central de insumos da empresa</p>
        </div>
        <span className="ml-auto text-sm text-muted-foreground font-mono mr-2">
          {filt.length}/{insumos.length} registros
        </span>
        <input ref={fileRef} type="file" accept=".xlsx,.xlsm,.xls" className="hidden" onChange={handleFileChange} />
        <Button size="sm" variant="outline"
          className="gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
          onClick={() => fileRef.current?.click()} disabled={isImporting}>
          {isImporting
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Importando...</>
            : <><Upload className="h-4 w-4" /> Importar Planilha</>}
        </Button>
        <Button size="sm"
          className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
          onClick={startNew} disabled={editingId === "new"}>
          <Plus className="h-4 w-4" /> Novo Insumo
        </Button>
      </div>

      {/* ── Barra de progresso ── */}
      {jobId && progresso && progresso.status !== "done" && progresso.status !== "error" && (
        <div className="mb-4 p-4 rounded-lg bg-emerald-50 border border-emerald-200">
          <div className="flex items-center justify-between text-sm text-emerald-800 mb-2">
            <span className="font-medium flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Importando insumos...
            </span>
            <span className="font-mono font-bold">{pct}%</span>
          </div>
          <div className="w-full bg-emerald-200 rounded-full h-3 overflow-hidden">
            <div className="bg-emerald-500 h-3 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-xs text-emerald-700 mt-1.5">
            {done} de {total} insumos processados
            {progresso.inseridos > 0 && ` · ${progresso.inseridos} inseridos`}
            {progresso.atualizados > 0 && ` · ${progresso.atualizados} atualizados`}
          </p>
        </div>
      )}
      {progresso?.status === "done" && jobId && (
        <div className="flex items-center gap-2 mb-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-800">
          <CheckCircle className="h-4 w-4 flex-shrink-0" />
          <span>Importação concluída: <strong>{progresso.total}</strong> insumos — <strong>{progresso.inseridos}</strong> inseridos, <strong>{progresso.atualizados}</strong> atualizados.</span>
          <button onClick={() => setJobId(null)} className="ml-auto text-emerald-600 hover:text-emerald-800">✕</button>
        </div>
      )}
      {importError && (
        <div className="flex items-center gap-2 mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{importError}</span>
          <button onClick={() => setImportError(null)} className="ml-auto text-red-600 hover:text-red-800">✕</button>
        </div>
      )}

      {/* ── Busca + filtro categorias ── */}
      <div className="flex gap-3 mb-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar por descrição, código ou tipo..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {/* Chips de categoria */}
      {categorias.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          <button
            onClick={() => setCatFilter(null)}
            className={`px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors ${
              !catFilter ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-600 border-slate-300 hover:border-emerald-400"
            }`}
          >
            Todos
          </button>
          {categorias.map(cat => (
            <button
              key={cat}
              onClick={() => setCatFilter(catFilter === cat ? null : cat)}
              className={`px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors ${
                catFilter === cat ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-600 border-slate-300 hover:border-emerald-400"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* ── Tabela ── */}
      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-slate-50 text-muted-foreground">
                  <th className="text-left px-4 py-2 w-24">Código</th>
                  <th className="text-left px-3 py-2 min-w-[260px]">Descrição</th>
                  <th className="text-left px-3 py-2 w-36">Grupo</th>
                  <th className="text-center px-3 py-2 w-12">Un</th>
                  <th className="text-right px-3 py-2 w-28 font-semibold">Preço (c/enc.)</th>
                  <th className="text-right px-3 py-2 w-28 text-slate-500">Preço Base</th>
                  <th className="text-center px-3 py-2 w-20">Orçamentos</th>
                  <th className="w-16" />
                </tr>
              </thead>
              <tbody>
                {/* Linha de novo insumo */}
                {editingId === "new" && (
                  <tr className="border-b bg-blue-50">
                    <td className="px-2 py-1">{field("codigo", "font-mono w-24")}</td>
                    <td className="px-2 py-1">{field("descricao", "min-w-[260px]")}</td>
                    <td className="px-2 py-1">{field("tipo", "w-36")}</td>
                    <td className="px-2 py-1">{field("unidade", "w-12 text-center")}</td>
                    <td className="px-2 py-1">{field("precoUnitario", "w-24 text-right tabular-nums")}</td>
                    <td className="px-2 py-1">{field("precoMin", "w-24 text-right tabular-nums")}</td>
                    <td className="px-2 py-1" />
                    <td className="px-2 py-1">
                      <div className="flex items-center gap-1">
                        {saveError && <span className="text-red-500 text-[10px] mr-1 max-w-[120px] truncate">{saveError}</span>}
                        <button onClick={handleSave} disabled={salvarMut.isPending}
                          className="p-1 rounded hover:bg-blue-200 text-blue-700" title="Salvar">
                          {salvarMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                        </button>
                        <button onClick={cancelEdit} className="p-1 rounded hover:bg-slate-200 text-slate-500" title="Cancelar">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )}

                {filt.length === 0 && editingId !== "new" ? (
                  <tr>
                    <td colSpan={8} className="py-16 text-center text-muted-foreground">
                      <Package className="h-8 w-8 mx-auto mb-2 opacity-20" />
                      <p className="text-sm">{search || catFilter ? "Nenhum insumo encontrado." : "Nenhum insumo cadastrado ainda."}</p>
                      {!search && !catFilter && (
                        <p className="text-xs mt-1">Use "Importar Planilha" ou clique em "Novo Insumo".</p>
                      )}
                    </td>
                  </tr>
                ) : (
                  filt.map((i: any) => renderRow(i))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}

/* ── PÁGINA PRINCIPAL ────────────────────────────────────────── */
export default function BibliotecaOrcamento() {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId) : 0;
  const isInsumos = typeof window !== "undefined" && window.location.pathname.includes("insumos");

  return (
    <DashboardLayout>
      <div className="p-6 max-w-screen-xl mx-auto">
        {isInsumos
          ? <InsumosView companyId={companyId} />
          : <ComposicoesView companyId={companyId} />
        }
      </div>
    </DashboardLayout>
  );
}
