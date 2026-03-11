import { useState, useRef, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import DashboardLayout from "@/components/DashboardLayout";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Wrench, Package, Search, Loader2, Upload, CheckCircle,
  AlertCircle, Plus, Pencil, Trash2, X, Check, Tag,
  ChevronDown, Square, CheckSquare, MinusSquare,
} from "lucide-react";

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function parseBRL(s: string) {
  return parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0;
}
function n(v: any) { return parseFloat(v || "0"); }

const EMPTY_FORM = { codigo: "", descricao: "", unidade: "", tipo: "", precoUnitario: "", precoMin: "" };

/* ════════════════════════════════════════════════════════════════
   COMPONENTE: Dropdown searchable de grupo
   ════════════════════════════════════════════════════════════════ */
function GrupoDropdown({
  value,
  onChange,
  grupos,
  placeholder = "Selecionar grupo...",
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  grupos: { id: number; nome: string }[];
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  // Fecha ao clicar fora
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtrados = grupos.filter(g => !q || g.nome.toLowerCase().includes(q.toLowerCase()));

  function select(nome: string) {
    onChange(nome);
    setOpen(false);
    setQ("");
  }

  return (
    <div ref={ref} className={`relative ${className}`}>
      <div
        className="flex items-center gap-1 h-7 px-2 border rounded text-xs cursor-pointer bg-white hover:border-emerald-400 focus-within:border-emerald-400 focus-within:ring-1 focus-within:ring-emerald-200"
        onClick={() => setOpen(o => !o)}
      >
        {open ? (
          <input
            autoFocus
            className="flex-1 outline-none text-xs bg-transparent"
            placeholder="Buscar grupo..."
            value={q}
            onChange={e => { setQ(e.target.value); }}
            onClick={e => e.stopPropagation()}
            onKeyDown={e => {
              if (e.key === "Escape") { setOpen(false); setQ(""); }
              if (e.key === "Enter" && filtrados.length > 0) select(filtrados[0].nome);
            }}
          />
        ) : (
          <span className={`flex-1 truncate ${value ? "text-foreground" : "text-muted-foreground"}`}>
            {value || placeholder}
          </span>
        )}
        <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" />
      </div>
      {open && (
        <div className="absolute z-50 top-full left-0 mt-0.5 w-full min-w-[220px] bg-white border rounded-md shadow-lg max-h-52 overflow-y-auto">
          <div
            className="px-3 py-1.5 text-xs text-muted-foreground hover:bg-slate-50 cursor-pointer border-b"
            onClick={() => select("")}
          >
            — Sem grupo —
          </div>
          {filtrados.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">Nenhum grupo encontrado.</div>
          ) : (
            filtrados.map(g => (
              <div
                key={g.id}
                onClick={() => select(g.nome)}
                className={`px-3 py-1.5 text-xs cursor-pointer hover:bg-emerald-50 ${g.nome === value ? "bg-emerald-50 font-medium text-emerald-700" : ""}`}
              >
                {g.nome}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   COMPONENTE: Filtro de grupo (barra de busca + seletor)
   ════════════════════════════════════════════════════════════════ */
function GrupoFiltro({
  value,
  onChange,
  grupos,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  grupos: { id: number; nome: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setQ(""); }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtrados = grupos.filter(g => !q || g.nome.toLowerCase().includes(q.toLowerCase()));

  function select(nome: string | null) {
    onChange(nome);
    setOpen(false);
    setQ("");
  }

  return (
    <div ref={ref} className="relative">
      {/* Campo visual */}
      <div
        className={`flex items-center gap-2 h-9 px-3 border rounded-md text-sm cursor-pointer bg-white transition-colors
          ${open ? "border-emerald-400 ring-1 ring-emerald-200" : "border-input hover:border-emerald-300"}
          ${value ? "text-emerald-700 border-emerald-300 bg-emerald-50" : "text-muted-foreground"}`}
        style={{ minWidth: 200 }}
        onClick={() => setOpen(o => !o)}
      >
        <Tag className="h-3.5 w-3.5 flex-shrink-0" />
        {open ? (
          <input
            autoFocus
            className="flex-1 outline-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground"
            placeholder="Digite o grupo..."
            value={q}
            onChange={e => setQ(e.target.value)}
            onClick={e => e.stopPropagation()}
            onKeyDown={e => {
              if (e.key === "Escape") { setOpen(false); setQ(""); }
              if (e.key === "Enter" && filtrados.length > 0) select(filtrados[0].nome);
            }}
          />
        ) : (
          <span className="flex-1 truncate text-sm">{value ?? "Filtrar por grupo"}</span>
        )}
        {value && !open && (
          <button
            onClick={e => { e.stopPropagation(); select(null); }}
            className="ml-auto rounded-full hover:bg-emerald-200 p-0.5"
          >
            <X className="h-3 w-3" />
          </button>
        )}
        {!value && <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 ml-auto" />}
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 w-full min-w-[240px] bg-white border rounded-md shadow-lg max-h-64 overflow-y-auto">
          <div
            className="px-3 py-2 text-sm text-muted-foreground hover:bg-slate-50 cursor-pointer border-b"
            onClick={() => select(null)}
          >
            Todos os grupos
          </div>
          {filtrados.length === 0 ? (
            <div className="px-3 py-3 text-sm text-muted-foreground text-center">Nenhum grupo encontrado.</div>
          ) : (
            filtrados.map(g => (
              <div
                key={g.id}
                onClick={() => select(g.nome)}
                className={`px-3 py-2 text-sm cursor-pointer hover:bg-emerald-50
                  ${g.nome === value ? "bg-emerald-50 font-medium text-emerald-700" : ""}`}
              >
                {g.nome}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   SUB-VIEW: Cadastro de Categorias
   ════════════════════════════════════════════════════════════════ */
function CategoriasView({ companyId }: { companyId: number }) {
  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [editNome, setEditNome] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const { data: grupos = [], isLoading } =
    trpc.orcamento.listarGruposInsumos.useQuery({ companyId }, { enabled: companyId > 0 });

  const salvarMut = trpc.orcamento.salvarGrupoInsumo.useMutation({
    onSuccess: () => {
      utils.orcamento.listarGruposInsumos.invalidate({ companyId });
      setEditingId(null); setSaveError(null);
    },
    onError: (err) => setSaveError(err.message),
  });
  const excluirMut = trpc.orcamento.excluirGrupoInsumo.useMutation({
    onSuccess: () => utils.orcamento.listarGruposInsumos.invalidate({ companyId }),
  });

  function startEdit(g: any) { setEditingId(g.id); setEditNome(g.nome); setSaveError(null); }
  function startNew() { setEditingId("new"); setEditNome(""); setSaveError(null); }
  function cancel() { setEditingId(null); setSaveError(null); }
  function save() {
    if (!editNome.trim()) { setSaveError("Nome obrigatório."); return; }
    salvarMut.mutate({
      companyId,
      id: editingId !== "new" ? (editingId as number) : undefined,
      nome: editNome,
    });
  }

  return (
    <>
      <div className="flex items-center gap-3 mb-5">
        <div className="p-2 rounded-lg bg-violet-100">
          <Tag className="h-5 w-5 text-violet-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Categorias de Insumos</h1>
          <p className="text-sm text-muted-foreground">Grupos padronizados para classificar insumos</p>
        </div>
        <span className="ml-auto text-sm text-muted-foreground font-mono mr-2">{grupos.length} categorias</span>
        <Button size="sm" className="gap-1.5 bg-violet-600 hover:bg-violet-700 text-white"
          onClick={startNew} disabled={editingId === "new"}>
          <Plus className="h-4 w-4" /> Nova Categoria
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <Card className="max-w-xl">
          <div className="divide-y">
            {/* Linha de nova categoria */}
            {editingId === "new" && (
              <div className="flex items-center gap-2 px-4 py-2.5 bg-violet-50">
                <Input
                  autoFocus
                  className="h-7 text-sm flex-1"
                  placeholder="Nome da categoria..."
                  value={editNome}
                  onChange={e => setEditNome(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") cancel(); }}
                />
                {saveError && <span className="text-red-500 text-xs">{saveError}</span>}
                <button onClick={save} disabled={salvarMut.isPending}
                  className="p-1.5 rounded hover:bg-violet-200 text-violet-700" title="Salvar">
                  {salvarMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                </button>
                <button onClick={cancel} className="p-1.5 rounded hover:bg-slate-200 text-slate-500" title="Cancelar">
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {grupos.length === 0 && editingId !== "new" ? (
              <div className="text-center py-16 text-muted-foreground">
                <Tag className="h-8 w-8 mx-auto mb-2 opacity-20" />
                <p className="text-sm">Nenhuma categoria cadastrada.</p>
              </div>
            ) : (
              grupos.map(g => (
                <div key={g.id} className="flex items-center gap-2 px-4 py-2.5 group hover:bg-slate-50">
                  {editingId === g.id ? (
                    <>
                      <Input
                        autoFocus
                        className="h-7 text-sm flex-1"
                        value={editNome}
                        onChange={e => setEditNome(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") cancel(); }}
                      />
                      {saveError && <span className="text-red-500 text-xs">{saveError}</span>}
                      <button onClick={save} disabled={salvarMut.isPending}
                        className="p-1.5 rounded hover:bg-emerald-100 text-emerald-700">
                        {salvarMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      </button>
                      <button onClick={cancel} className="p-1.5 rounded hover:bg-slate-200 text-slate-500">
                        <X className="h-4 w-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm">{g.nome}</span>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => startEdit(g)}
                          className="p-1.5 rounded hover:bg-blue-100 text-blue-600">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => { if (confirm(`Excluir categoria "${g.nome}"?`)) excluirMut.mutate({ companyId, id: g.id }); }}
                          className="p-1.5 rounded hover:bg-red-100 text-red-500">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </Card>
      )}
    </>
  );
}

/* ════════════════════════════════════════════════════════════════
   SUB-VIEW: Composições
   ════════════════════════════════════════════════════════════════ */
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
          <p className="text-sm">{search ? "Nenhuma composição encontrada." : "Nenhuma composição cadastrada ainda."}</p>
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
                    <td className="px-3 py-2">{c.tipo && <Badge variant="outline" className="text-[10px]">{c.tipo}</Badge>}</td>
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

/* ════════════════════════════════════════════════════════════════
   SUB-VIEW: Insumos
   ════════════════════════════════════════════════════════════════ */
function InsumosView({ companyId, onGerenciarCategorias }: { companyId: number; onGerenciarCategorias: () => void }) {
  const [search, setSearch]        = useState("");
  const [catFilter, setCatFilter]  = useState<string | null>(null);
  const [editingId, setEditingId]  = useState<number | "new" | null>(null);
  const [editForm, setEditForm]    = useState(EMPTY_FORM);
  const [saveError, setSaveError]  = useState<string | null>(null);
  const [jobId, setJobId]          = useState<string | null>(null);
  const [jobTotal, setJobTotal]    = useState(0);
  const [importError, setImportError] = useState<string | null>(null);
  const [selected, setSelected]    = useState<Set<number>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();
  const { data: insumos = [], isLoading } =
    trpc.orcamento.listarInsumosCatalogo.useQuery({ companyId }, { enabled: companyId > 0 });
  const { data: grupos = [] } =
    trpc.orcamento.listarGruposInsumos.useQuery({ companyId }, { enabled: companyId > 0 });

  const { data: novoCodigo } = trpc.orcamento.gerarCodigoInsumo.useQuery(
    { companyId }, { enabled: companyId > 0 && editingId === "new" }
  );
  useEffect(() => {
    if (editingId === "new" && novoCodigo && !editForm.codigo) {
      setEditForm(f => ({ ...f, codigo: novoCodigo }));
    }
  }, [novoCodigo, editingId]);

  /* Polling de importação */
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

  const invalidate = useCallback(() => utils.orcamento.listarInsumosCatalogo.invalidate({ companyId }), [companyId]);

  const importMut = trpc.orcamento.importarInsumosCatalogo.useMutation({
    onSuccess: (res) => { setJobId(res.jobId); setJobTotal(res.total); setImportError(null); },
    onError: (err) => setImportError(err.message),
  });
  const salvarMut = trpc.orcamento.salvarInsumo.useMutation({
    onSuccess: () => { invalidate(); setEditingId(null); setSaveError(null); },
    onError: (err) => setSaveError(err.message),
  });
  const excluirMut = trpc.orcamento.excluirInsumo.useMutation({
    onSuccess: () => invalidate(),
  });
  const excluirBulkMut = trpc.orcamento.excluirInsumosBulk.useMutation({
    onSuccess: () => { invalidate(); setSelected(new Set()); },
  });
  const excluirTodosMut = trpc.orcamento.excluirTodosInsumos.useMutation({
    onSuccess: () => { invalidate(); setSelected(new Set()); },
  });

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
    setEditingId(ins.id); setSaveError(null);
    setEditForm({
      codigo:        ins.codigo ?? "",
      descricao:     ins.descricao ?? "",
      unidade:       ins.unidade ?? "",
      tipo:          ins.tipo ?? "",
      precoUnitario: n(ins.precoMedio).toFixed(4).replace(".", ","),
      precoMin:      n(ins.precoMin).toFixed(4).replace(".", ","),
    });
  }
  function startNew() { setEditingId("new"); setSaveError(null); setEditForm({ ...EMPTY_FORM, codigo: novoCodigo ?? "" }); }
  function cancelEdit() { setEditingId(null); setSaveError(null); }
  function handleSave() {
    if (!editForm.descricao.trim()) { setSaveError("Descrição obrigatória."); return; }
    if (!editForm.codigo.trim())    { setSaveError("Código obrigatório."); return; }
    salvarMut.mutate({
      companyId,
      id: editingId !== "new" ? (editingId as number) : undefined,
      codigo: editForm.codigo, descricao: editForm.descricao,
      unidade: editForm.unidade, tipo: editForm.tipo,
      precoUnitario: String(parseBRL(editForm.precoUnitario)),
      precoMin: String(parseBRL(editForm.precoMin)),
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

  /* ── Seleção ── */
  const isImporting = importMut.isPending || (!!jobId && progresso?.status === "running");
  const pct   = progresso?.pct ?? 0;
  const done  = progresso?.done ?? 0;
  const total = progresso?.total ?? jobTotal;

  const q = search.toLowerCase();
  const filt = (insumos as any[]).filter(i =>
    (!catFilter || i.tipo === catFilter) &&
    (!q || i.descricao?.toLowerCase().includes(q) || i.codigo?.toLowerCase().includes(q) || i.tipo?.toLowerCase().includes(q))
  );

  const filtIds = filt.map((i: any) => i.id as number);
  const allFiltSelected = filtIds.length > 0 && filtIds.every(id => selected.has(id));
  const someFiltSelected = filtIds.some(id => selected.has(id)) && !allFiltSelected;

  function toggleRow(id: number) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function toggleAll() {
    if (allFiltSelected) {
      setSelected(prev => { const next = new Set(prev); filtIds.forEach(id => next.delete(id)); return next; });
    } else {
      setSelected(prev => { const next = new Set(prev); filtIds.forEach(id => next.add(id)); return next; });
    }
  }
  function clearSelection() { setSelected(new Set()); }

  function handleExcluirSelecionados() {
    const ids = [...selected];
    if (!confirm(`Excluir ${ids.length} insumo(s) selecionado(s)?`)) return;
    excluirBulkMut.mutate({ companyId, ids });
  }
  function handleExcluirTodos() {
    if (!confirm(`Tem certeza que deseja apagar TODOS os ${insumos.length} insumos do catálogo? Esta ação não pode ser desfeita.`)) return;
    excluirTodosMut.mutate({ companyId });
  }

  const isBulkLoading = excluirBulkMut.isPending || excluirTodosMut.isPending;

  /* ── Render row ── */
  function renderRow(i: any) {
    const isSel = selected.has(i.id);
    if (editingId === i.id) {
      return (
        <tr key={i.id} className="border-b bg-emerald-50">
          <td className="px-3 py-1" />
          <td className="px-2 py-1">{field("codigo", "font-mono w-24")}</td>
          <td className="px-2 py-1">{field("descricao", "min-w-[260px]")}</td>
          <td className="px-2 py-1">
            <GrupoDropdown value={editForm.tipo} onChange={v => setEditForm(f => ({ ...f, tipo: v }))}
              grupos={grupos as any[]} className="w-40" />
          </td>
          <td className="px-2 py-1">{field("unidade", "w-12 text-center")}</td>
          <td className="px-2 py-1">{field("precoUnitario", "w-24 text-right")}</td>
          <td className="px-2 py-1">{field("precoMin", "w-24 text-right")}</td>
          <td className="px-2 py-1 text-center">
            <span className="inline-flex items-center justify-center w-7 h-5 rounded-full bg-slate-100 text-slate-600 font-medium text-[10px]">
              {i.totalOrcamentos}
            </span>
          </td>
          <td className="px-2 py-1">
            <div className="flex items-center gap-1">
              {saveError && <span className="text-red-500 text-[10px] max-w-[80px] truncate">{saveError}</span>}
              <button onClick={handleSave} disabled={salvarMut.isPending}
                className="p-1 rounded hover:bg-emerald-200 text-emerald-700">
                {salvarMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              </button>
              <button onClick={cancelEdit} className="p-1 rounded hover:bg-slate-200 text-slate-500">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </td>
        </tr>
      );
    }
    return (
      <tr key={i.id}
        className={`border-b transition-colors group ${isSel ? "bg-blue-50 hover:bg-blue-100" : "hover:bg-muted/30"}`}>
        {/* Checkbox */}
        <td className="px-3 py-2">
          <button onClick={() => toggleRow(i.id)}
            className={`text-slate-400 hover:text-blue-600 transition-colors ${isSel ? "text-blue-600" : ""}`}>
            {isSel ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
          </button>
        </td>
        <td className="px-4 py-2 font-mono text-[10px] text-slate-500">{i.codigo || "—"}</td>
        <td className="px-3 py-2">{i.descricao}</td>
        <td className="px-3 py-2">
          {i.tipo && <Badge variant="outline" className="text-[10px]">{i.tipo}</Badge>}
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
            <button onClick={() => startEdit(i)} className="p-1 rounded hover:bg-blue-100 text-blue-600">
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => { if (confirm("Excluir este insumo?")) excluirMut.mutate({ companyId, id: i.id }); }}
              className="p-1 rounded hover:bg-red-100 text-red-500">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <>
      {/* Cabeçalho */}
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
        <Button size="sm" variant="outline"
          className="gap-1.5 border-violet-300 text-violet-700 hover:bg-violet-50"
          onClick={onGerenciarCategorias}>
          <Tag className="h-4 w-4" /> Categorias
        </Button>
        <input ref={fileRef} type="file" accept=".xlsx,.xlsm,.xls" className="hidden" onChange={handleFileChange} />
        <Button size="sm" variant="outline"
          className="gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
          onClick={() => fileRef.current?.click()} disabled={isImporting}>
          {isImporting
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Importando...</>
            : <><Upload className="h-4 w-4" /> Importar</>}
        </Button>
        <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
          onClick={startNew} disabled={editingId === "new"}>
          <Plus className="h-4 w-4" /> Novo Insumo
        </Button>
      </div>

      {/* Progresso de importação */}
      {jobId && progresso && progresso.status !== "done" && progresso.status !== "error" && (
        <div className="mb-4 p-4 rounded-lg bg-emerald-50 border border-emerald-200">
          <div className="flex items-center justify-between text-sm text-emerald-800 mb-2">
            <span className="font-medium flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Importando insumos...</span>
            <span className="font-mono font-bold">{pct}%</span>
          </div>
          <div className="w-full bg-emerald-200 rounded-full h-3 overflow-hidden">
            <div className="bg-emerald-500 h-3 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-xs text-emerald-700 mt-1.5">
            {done} de {total} insumos · {progresso.inseridos ?? 0} inseridos · {progresso.atualizados ?? 0} atualizados
          </p>
        </div>
      )}
      {progresso?.status === "done" && jobId && (
        <div className="flex items-center gap-2 mb-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-800">
          <CheckCircle className="h-4 w-4 flex-shrink-0" />
          <span>Importação concluída: <strong>{progresso.total}</strong> insumos — <strong>{progresso.inseridos}</strong> inseridos, <strong>{progresso.atualizados}</strong> atualizados.</span>
          <button onClick={() => setJobId(null)} className="ml-auto">✕</button>
        </div>
      )}
      {importError && (
        <div className="flex items-center gap-2 mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{importError}</span>
          <button onClick={() => setImportError(null)} className="ml-auto">✕</button>
        </div>
      )}

      {/* Busca + Filtro de grupo */}
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar por descrição, código ou grupo..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <GrupoFiltro value={catFilter} onChange={setCatFilter} grupos={grupos as any[]} />
      </div>

      {/* Tabela */}
      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-slate-50 text-muted-foreground">
                  {/* Checkbox "selecionar todos" */}
                  <th className="px-3 py-2 w-8">
                    <button onClick={toggleAll} title={allFiltSelected ? "Desselecionar todos" : "Selecionar todos visíveis"}
                      className="text-slate-400 hover:text-blue-600 transition-colors">
                      {allFiltSelected
                        ? <CheckSquare className="h-4 w-4 text-blue-600" />
                        : someFiltSelected
                          ? <MinusSquare className="h-4 w-4 text-blue-400" />
                          : <Square className="h-4 w-4" />
                      }
                    </button>
                  </th>
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
                    <td className="px-3 py-1" />
                    <td className="px-2 py-1">{field("codigo", "font-mono w-24")}</td>
                    <td className="px-2 py-1">{field("descricao", "min-w-[260px]")}</td>
                    <td className="px-2 py-1">
                      <GrupoDropdown value={editForm.tipo} onChange={v => setEditForm(f => ({ ...f, tipo: v }))}
                        grupos={grupos as any[]} className="w-40" />
                    </td>
                    <td className="px-2 py-1">{field("unidade", "w-12 text-center")}</td>
                    <td className="px-2 py-1">{field("precoUnitario", "w-24 text-right")}</td>
                    <td className="px-2 py-1">{field("precoMin", "w-24 text-right")}</td>
                    <td className="px-2 py-1" />
                    <td className="px-2 py-1">
                      <div className="flex items-center gap-1">
                        {saveError && <span className="text-red-500 text-[10px]">{saveError}</span>}
                        <button onClick={handleSave} disabled={salvarMut.isPending}
                          className="p-1 rounded hover:bg-blue-200 text-blue-700">
                          {salvarMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                        </button>
                        <button onClick={cancelEdit} className="p-1 rounded hover:bg-slate-200 text-slate-500">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )}

                {filt.length === 0 && editingId !== "new" ? (
                  <tr>
                    <td colSpan={9} className="py-16 text-center text-muted-foreground">
                      <Package className="h-8 w-8 mx-auto mb-2 opacity-20" />
                      <p className="text-sm">{search || catFilter ? "Nenhum insumo encontrado." : "Nenhum insumo cadastrado ainda."}</p>
                      {!search && !catFilter && <p className="text-xs mt-1">Use "Importar" ou clique em "Novo Insumo".</p>}
                    </td>
                  </tr>
                ) : filt.map((i: any) => renderRow(i))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── Barra flutuante de ações em massa ── */}
      {(selected.size > 0 || true) && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 transition-all duration-200
          ${selected.size > 0
            ? "opacity-100 translate-y-0 pointer-events-auto"
            : "opacity-0 translate-y-4 pointer-events-none"}`}>
          <div className="flex items-center gap-3 px-5 py-3 bg-slate-900 text-white rounded-2xl shadow-2xl text-sm">
            <span className="font-medium">
              <span className="text-blue-300 font-bold">{selected.size}</span> selecionado{selected.size !== 1 ? "s" : ""}
            </span>
            <button onClick={clearSelection}
              className="text-slate-400 hover:text-white text-xs underline underline-offset-2">
              Limpar
            </button>
            <div className="w-px h-4 bg-slate-600" />
            <button
              onClick={handleExcluirSelecionados}
              disabled={isBulkLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-500 rounded-lg text-xs font-medium transition-colors disabled:opacity-50">
              {excluirBulkMut.isPending
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Trash2 className="h-3.5 w-3.5" />}
              Excluir selecionados
            </button>
            <div className="w-px h-4 bg-slate-600" />
            <button
              onClick={handleExcluirTodos}
              disabled={isBulkLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-red-900 border border-red-800 rounded-lg text-xs font-medium text-red-300 hover:text-red-200 transition-colors disabled:opacity-50">
              {excluirTodosMut.isPending
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Trash2 className="h-3.5 w-3.5" />}
              Apagar todos ({insumos.length})
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/* ════════════════════════════════════════════════════════════════
   PÁGINA PRINCIPAL
   ════════════════════════════════════════════════════════════════ */
export default function BibliotecaOrcamento() {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId) : 0;
  const isInsumos = typeof window !== "undefined" && window.location.pathname.includes("insumos");
  const [showCategorias, setShowCategorias] = useState(false);

  return (
    <DashboardLayout>
      <div className="p-6 max-w-screen-xl mx-auto">
        {!isInsumos ? (
          <ComposicoesView companyId={companyId} />
        ) : showCategorias ? (
          <div>
            <button
              onClick={() => setShowCategorias(false)}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-5"
            >
              ← Voltar para Insumos
            </button>
            <CategoriasView companyId={companyId} />
          </div>
        ) : (
          <InsumosView companyId={companyId} onGerenciarCategorias={() => setShowCategorias(true)} />
        )}
      </div>
    </DashboardLayout>
  );
}
