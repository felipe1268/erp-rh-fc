import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation, useRoute } from "wouter";
import { toast } from "sonner";
import {
  ArrowLeft, FileText, Search, Download, FileCheck2, Clock, Edit3, FileX2, FolderOpen, Folder, Home, Eye, X,
  ChevronRight, ChevronDown, List, FolderTree, FileImage, File as FileIcon,
} from "lucide-react";
import PortalPrintHeader from "@/components/PortalPrintHeader";
import PrintActions from "@/components/PrintActions";

const fmtBR = (s?: string | null) => (s ? s.split("T")[0].split("-").reverse().join("/") : "—");

const STATUS_INFO: Record<string, { label: string; color: string }> = {
  em_elaboracao: { label: "Em Elaboração", color: "bg-yellow-100 text-yellow-800 border-yellow-300" },
  em_revisao: { label: "Em Revisão", color: "bg-blue-100 text-blue-800 border-blue-300" },
  aprovado: { label: "Aprovado", color: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  reprovado: { label: "Reprovado", color: "bg-rose-100 text-rose-800 border-rose-300" },
  cancelado: { label: "Cancelado", color: "bg-slate-200 text-slate-600 border-slate-300" },
  obsoleto: { label: "Obsoleto", color: "bg-slate-200 text-slate-500 border-slate-300" },
};

export default function PortalProjDocCliente() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/portal/cliente/projdoc/:obraId");
  const obraId = parseInt(params?.obraId || "0");
  const token = localStorage.getItem("portal_token") || "";
  const tipo = localStorage.getItem("portal_tipo") || "";

  useEffect(() => {
    if (!token) { navigate("/portal/cliente/login"); return; }
    if (tipo && tipo !== "cliente") { navigate("/portal/dashboard"); }
    if (!obraId) { navigate("/portal/cliente/hub"); }
  }, [token, tipo, obraId]);

  const tokenCheck = trpc.portalExterno.auth.verificarToken.useQuery({ token }, { enabled: !!token });
  useEffect(() => {
    if (tokenCheck.data && !tokenCheck.data.valid) {
      localStorage.clear();
      toast.error("Sessão expirada");
      navigate("/portal/cliente/login");
    }
  }, [tokenCheck.data]);

  const { data: obras = [] } = trpc.portalExterno.cliente.minhasObras.useQuery({ token }, { enabled: !!token && tipo === "cliente" });
  const obra = (obras as any[]).find((o) => o.id === obraId);

  const { data, isLoading } = trpc.portalExterno.cliente.projDocObra.useQuery(
    { token, obraId },
    { enabled: !!token && obraId > 0 }
  );
  const docs = (data?.documentos || []) as any[];
  const totais = data?.totais || { total: 0, aprovados: 0, emRevisao: 0, emElaboracao: 0, reprovados: 0 };

  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<string>("todos");
  // Rev. 1562 — modos de visualização: árvore (default — agrupa por
  // Disciplina → Formato/extensão) ou lista plana.
  const [viewMode, setViewMode] = useState<"arvore" | "lista">("arvore");
  // Estado de expansão dos grupos (chave: "disc:<sigla>" ou "fmt:<sigla>:<fmt>")
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggleExp = (k: string) => setExpanded((p) => ({ ...p, [k]: !p[k] }));
  // Rev. 1561 — visualizador inline (PDF/imagem) e helper de download
  // autenticado. DWG/DXF não tem viewer nativo no browser → vai direto pra
  // download.
  const [pdfViewer, setPdfViewer] = useState<{ url: string; titulo: string; subtitulo: string } | null>(null);
  const nomeEmpresa = localStorage.getItem("portal_nome") || "Cliente";
  const abrirInline = (id: number, titulo: string, subtitulo: string) => {
    const url = `/api/portal/cliente/projdoc/${id}?token=${encodeURIComponent(token)}#toolbar=0&navpanes=0&scrollbar=1`;
    setPdfViewer({ url, titulo, subtitulo });
  };
  const baixar = (id: number) => {
    const url = `/api/portal/cliente/projdoc/${id}?token=${encodeURIComponent(token)}&download=1`;
    window.open(url, "_blank");
  };

  const lista = useMemo(() => {
    let l = docs;
    if (filtro !== "todos") l = l.filter((d) => d.status === filtro);
    if (busca) {
      const q = busca.toLowerCase();
      l = l.filter((d) =>
        (d.codigo || "").toLowerCase().includes(q) ||
        (d.titulo || "").toLowerCase().includes(q) ||
        (d.tipoNome || "").toLowerCase().includes(q) ||
        (d.disciplinaNome || "").toLowerCase().includes(q)
      );
    }
    return l;
  }, [docs, filtro, busca]);

  // Rev. 1562 — Agrupamento Disciplina → Formato (subpasta/extensão).
  // Estrutura: [{ key, label, sigla, cor, total, formatos: [{ fmt, docs }] }]
  type GrupoFmt = { fmt: string; docs: any[] };
  type GrupoDisc = { key: string; label: string; sigla: string; cor: string | null; total: number; formatos: GrupoFmt[] };
  const arvore: GrupoDisc[] = useMemo(() => {
    const fmtOf = (d: any): string => {
      const sp = (d.subpasta || "").toString().trim().toUpperCase();
      if (sp) return sp;
      const ext = (d.extensao || "").toString().toUpperCase();
      return ext || "OUTROS";
    };
    const map = new Map<string, GrupoDisc>();
    for (const d of lista) {
      const dKey = d.disciplinaSigla || d.disciplinaNome || "SEM";
      const dLabel = d.disciplinaNome || "Sem disciplina";
      const dSigla = d.disciplinaSigla || "—";
      let g = map.get(dKey);
      if (!g) {
        g = { key: dKey, label: dLabel, sigla: dSigla, cor: d.disciplinaCor || null, total: 0, formatos: [] };
        map.set(dKey, g);
      }
      const fmt = fmtOf(d);
      let fg = g.formatos.find((x) => x.fmt === fmt);
      if (!fg) { fg = { fmt, docs: [] }; g.formatos.push(fg); }
      fg.docs.push(d);
      g.total++;
    }
    // Ordena disciplinas (Sem disciplina por último), formatos por nome.
    const arr = Array.from(map.values()).sort((a, b) => {
      if (a.key === "SEM") return 1;
      if (b.key === "SEM") return -1;
      return a.label.localeCompare(b.label);
    });
    arr.forEach((g) => g.formatos.sort((a, b) => a.fmt.localeCompare(b.fmt)));
    return arr;
  }, [lista]);

  // Auto-expandir tudo quando há busca/filtro ativo (UX) ou quando há poucos grupos
  useEffect(() => {
    if (busca || filtro !== "todos") {
      const next: Record<string, boolean> = {};
      arvore.forEach((g) => {
        next[`disc:${g.key}`] = true;
        g.formatos.forEach((f) => { next[`fmt:${g.key}:${f.fmt}`] = true; });
      });
      setExpanded(next);
    }
  }, [busca, filtro, arvore]);

  const fmtMeta = (fmt: string): { color: string; bg: string; icon: any } => {
    const f = fmt.toUpperCase();
    if (f === "PDF") return { color: "text-rose-700", bg: "bg-rose-50 border-rose-200", icon: FileText };
    if (f === "DWG" || f === "DXF" || f === "DWF") return { color: "text-blue-700", bg: "bg-blue-50 border-blue-200", icon: FileIcon };
    if (["JPG", "JPEG", "PNG", "WEBP", "GIF"].includes(f)) return { color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200", icon: FileImage };
    return { color: "text-slate-600", bg: "bg-slate-50 border-slate-200", icon: FileIcon };
  };

  const Kpi = ({ label, value, color, icon: Icon }: any) => (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] uppercase font-semibold text-slate-500 tracking-wide truncate">{label}</p>
          <p className={`text-2xl font-bold mt-0.5 ${color}`}>{value}</p>
        </div>
        <div className={`p-2 rounded-lg ${color.replace("text-", "bg-").replace("-700", "-100")} shrink-0`}>
          <Icon className={`h-5 w-5 ${color}`} />
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-purple-50">
      <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate("/portal/cliente/hub")}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 px-3 py-1.5 rounded-lg shadow-sm"
            >
              <Home className="h-3.5 w-3.5" /> Hub
            </button>
            <button
              onClick={() => navigate("/portal/cliente/modulo/proj-doc")}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-purple-700"
            >
              <ArrowLeft className="h-4 w-4" /> Obras
            </button>
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-purple-600 to-purple-700 flex items-center justify-center shadow-md shrink-0">
              <FileText className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="font-bold text-slate-800 text-sm sm:text-base truncate">Projetos / Documentos Técnicos</h1>
              <p className="text-[11px] text-slate-500 truncate">{obra?.nome || "Obra"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 portal-no-print">
            <PrintActions />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        <PortalPrintHeader obra={obra} titulo="Projetos / Documentos Técnicos" />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Kpi label="Total Documentos" value={totais.total} color="text-purple-700" icon={FolderOpen} />
          <Kpi label="Aprovados" value={totais.aprovados} color="text-emerald-700" icon={FileCheck2} />
          <Kpi label="Em Revisão" value={totais.emRevisao} color="text-blue-700" icon={Clock} />
          <Kpi label="Em Elaboração" value={totais.emElaboracao} color="text-yellow-700" icon={Edit3} />
          <Kpi label="Reprovados" value={totais.reprovados} color="text-rose-700" icon={FileX2} />
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 flex flex-wrap items-center gap-2">
          {([
            { k: "todos", label: "Todos", count: totais.total },
            { k: "aprovado", label: "Aprovados", count: totais.aprovados },
            { k: "em_revisao", label: "Em Revisão", count: totais.emRevisao },
            { k: "em_elaboracao", label: "Em Elaboração", count: totais.emElaboracao },
            { k: "reprovado", label: "Reprovados", count: totais.reprovados },
          ] as const).map((f) => (
            <button
              key={f.k}
              onClick={() => setFiltro(f.k)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium border transition ${
                filtro === f.k ? "bg-purple-50 text-purple-700 border-purple-300" : "text-slate-500 hover:bg-slate-50 border-transparent"
              }`}
            >
              <span className="font-bold">{f.count}</span>
              <span>{f.label}</span>
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            {/* Rev. 1562 — Toggle modo Árvore (Disciplina/Formato) vs Lista */}
            <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden bg-slate-50">
              <button
                type="button"
                onClick={() => setViewMode("arvore")}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold transition ${
                  viewMode === "arvore" ? "bg-purple-600 text-white" : "text-slate-600 hover:bg-slate-100"
                }`}
                title="Agrupar por Disciplina e Formato"
              >
                <FolderTree className="h-3.5 w-3.5" /> Pastas
              </button>
              <button
                type="button"
                onClick={() => setViewMode("lista")}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold transition ${
                  viewMode === "lista" ? "bg-purple-600 text-white" : "text-slate-600 hover:bg-slate-100"
                }`}
                title="Lista plana"
              >
                <List className="h-3.5 w-3.5" /> Lista
              </button>
            </div>
            <div className="relative">
              <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por código, título, tipo ou disciplina..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm w-72 bg-white"
              />
            </div>
          </div>
        </div>

        {/* Rev. 1562 — Render principal: Árvore (Disciplina → Formato) ou Lista plana */}
        {isLoading ? (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden text-center py-16 text-sm text-slate-400">
            Carregando documentos...
          </div>
        ) : lista.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden text-center py-16 text-sm text-slate-400">
            <FolderOpen className="h-10 w-10 mx-auto mb-2 text-slate-300" />
            Nenhum documento encontrado.
          </div>
        ) : viewMode === "arvore" ? (
          <div className="space-y-2">
            {arvore.map((g) => {
              const dKey = `disc:${g.key}`;
              const dOpen = expanded[dKey] !== false; // default open
              return (
                <div key={dKey} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  {/* Cabeçalho da Disciplina */}
                  <button
                    type="button"
                    onClick={() => toggleExp(dKey)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition text-left"
                  >
                    {dOpen ? <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" /> : <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />}
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 shadow-sm"
                      style={{ backgroundColor: g.cor || "#7c3aed" }}
                    >
                      <Folder className="h-5 w-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-800 text-sm truncate">{g.label}</p>
                      <p className="text-[11px] text-slate-500 font-mono">{g.sigla}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {g.formatos.map((f) => {
                        const m = fmtMeta(f.fmt);
                        return (
                          <span key={f.fmt} className={`text-[10px] font-bold px-2 py-0.5 rounded border ${m.bg} ${m.color}`}>
                            {f.fmt} {f.docs.length}
                          </span>
                        );
                      })}
                      <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">{g.total}</span>
                    </div>
                  </button>

                  {dOpen && (
                    <div className="border-t border-slate-100 bg-slate-50/40">
                      {g.formatos.map((f) => {
                        const fKey = `fmt:${g.key}:${f.fmt}`;
                        const fOpen = expanded[fKey] !== false;
                        const m = fmtMeta(f.fmt);
                        const Icon = m.icon;
                        return (
                          <div key={fKey} className="border-b border-slate-100 last:border-b-0">
                            <button
                              type="button"
                              onClick={() => toggleExp(fKey)}
                              className="w-full flex items-center gap-2 px-6 py-2 hover:bg-white transition text-left"
                            >
                              {fOpen ? <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />}
                              <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${m.bg} border`}>
                                <Icon className={`h-3.5 w-3.5 ${m.color}`} />
                              </div>
                              <span className={`font-bold text-[12px] ${m.color}`}>{f.fmt}</span>
                              <span className="text-[11px] text-slate-400">{f.docs.length} documento{f.docs.length === 1 ? "" : "s"}</span>
                            </button>
                            {fOpen && (
                              <div className="bg-white">
                                <table className="w-full text-sm">
                                  <thead className="bg-slate-50 border-y border-slate-200">
                                    <tr>
                                      <th className="text-left pl-12 pr-4 py-1.5 text-[10px] font-semibold text-slate-500 uppercase">Código</th>
                                      <th className="text-left px-4 py-1.5 text-[10px] font-semibold text-slate-500 uppercase">Título</th>
                                      <th className="text-center px-4 py-1.5 text-[10px] font-semibold text-slate-500 uppercase">Rev.</th>
                                      <th className="text-center px-4 py-1.5 text-[10px] font-semibold text-slate-500 uppercase">Status</th>
                                      <th className="text-center px-4 py-1.5 text-[10px] font-semibold text-slate-500 uppercase">Emissão</th>
                                      <th className="text-center px-4 py-1.5 text-[10px] font-semibold text-slate-500 uppercase">Ações</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {f.docs.map((d) => {
                                      const st = STATUS_INFO[d.status || "em_elaboracao"] || STATUS_INFO.em_elaboracao;
                                      return (
                                        <tr key={d.id} className="hover:bg-purple-50/30">
                                          <td className="pl-12 pr-4 py-2 font-mono text-[12px] text-slate-700">{d.codigo}</td>
                                          <td className="px-4 py-2 text-slate-800 text-[13px]">
                                            <p className="font-medium">{d.titulo}</p>
                                            {d.descricao && <p className="text-[11px] text-slate-400 line-clamp-1">{d.descricao}</p>}
                                          </td>
                                          <td className="px-4 py-2 text-center text-[12px] font-bold text-slate-700">{d.revisaoAtual || "0"}</td>
                                          <td className="px-4 py-2 text-center">
                                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold border ${st.color}`}>
                                              {st.label}
                                            </span>
                                          </td>
                                          <td className="px-4 py-2 text-center text-[12px] text-slate-600">{fmtBR(d.dataEmissao)}</td>
                                          <td className="px-4 py-2 text-center">
                                            {d.temArquivo ? (
                                              <div className="flex items-center justify-center gap-2 flex-wrap">
                                                {d.podeVisualizarInline && (
                                                  <button
                                                    onClick={() => abrirInline(d.id, `${d.codigo} — ${d.titulo}`, `Rev. ${d.revisaoAtual || "0"} • ${st.label}`)}
                                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 hover:bg-purple-100 text-[11px] font-semibold border border-purple-200 transition"
                                                    title="Visualizar no navegador"
                                                  >
                                                    <Eye className="h-3 w-3" /> Abrir
                                                  </button>
                                                )}
                                                <button
                                                  onClick={() => baixar(d.id)}
                                                  className="inline-flex items-center gap-1 text-[12px] font-semibold text-purple-700 hover:text-purple-900"
                                                  title={d.extensao ? `Baixar .${d.extensao.toUpperCase()}` : "Baixar"}
                                                >
                                                  <Download className="h-3.5 w-3.5" /> Baixar
                                                  {d.extensao && (
                                                    <span className="ml-1 px-1 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-500 uppercase tracking-wider">
                                                      {d.extensao}
                                                    </span>
                                                  )}
                                                </button>
                                              </div>
                                            ) : (
                                              <span className="text-[11px] text-slate-400">—</span>
                                            )}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-2 text-[11px] font-semibold text-slate-500 uppercase">Código</th>
                  <th className="text-left px-4 py-2 text-[11px] font-semibold text-slate-500 uppercase">Título</th>
                  <th className="text-left px-4 py-2 text-[11px] font-semibold text-slate-500 uppercase">Disciplina</th>
                  <th className="text-left px-4 py-2 text-[11px] font-semibold text-slate-500 uppercase">Formato</th>
                  <th className="text-center px-4 py-2 text-[11px] font-semibold text-slate-500 uppercase">Rev.</th>
                  <th className="text-center px-4 py-2 text-[11px] font-semibold text-slate-500 uppercase">Status</th>
                  <th className="text-center px-4 py-2 text-[11px] font-semibold text-slate-500 uppercase">Emissão</th>
                  <th className="text-center px-4 py-2 text-[11px] font-semibold text-slate-500 uppercase">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lista.map((d) => {
                  const st = STATUS_INFO[d.status || "em_elaboracao"] || STATUS_INFO.em_elaboracao;
                  const fmt = (d.subpasta || d.extensao || "").toString().toUpperCase() || "—";
                  const fm = fmtMeta(fmt);
                  return (
                    <tr key={d.id} className="hover:bg-purple-50/30">
                      <td className="px-4 py-2 font-mono text-[12px] text-slate-700">{d.codigo}</td>
                      <td className="px-4 py-2 text-slate-800 text-[13px]">
                        <p className="font-medium">{d.titulo}</p>
                        {d.descricao && <p className="text-[11px] text-slate-400 line-clamp-1">{d.descricao}</p>}
                      </td>
                      <td className="px-4 py-2 text-[12px]">
                        {d.disciplinaNome ? (
                          <span
                            className="inline-flex items-center gap-1.5 font-semibold"
                            style={{ color: d.disciplinaCor || "#7c3aed" }}
                          >
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.disciplinaCor || "#7c3aed" }} />
                            {d.disciplinaSigla || d.disciplinaNome}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-[12px]">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-bold ${fm.bg} ${fm.color}`}>
                          {fmt}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-center text-[12px] font-bold text-slate-700">{d.revisaoAtual || "0"}</td>
                      <td className="px-4 py-2 text-center">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold border ${st.color}`}>
                          {st.label}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-center text-[12px] text-slate-600">{fmtBR(d.dataEmissao)}</td>
                      <td className="px-4 py-2 text-center">
                        {d.temArquivo ? (
                          <div className="flex items-center justify-center gap-2 flex-wrap">
                            {d.podeVisualizarInline && (
                              <button
                                onClick={() => abrirInline(d.id, `${d.codigo} — ${d.titulo}`, `Rev. ${d.revisaoAtual || "0"} • ${st.label}`)}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 hover:bg-purple-100 text-[11px] font-semibold border border-purple-200 transition"
                                title="Visualizar no navegador"
                              >
                                <Eye className="h-3 w-3" /> Abrir
                              </button>
                            )}
                            <button
                              onClick={() => baixar(d.id)}
                              className="inline-flex items-center gap-1 text-[12px] font-semibold text-purple-700 hover:text-purple-900"
                              title={d.extensao ? `Baixar .${d.extensao.toUpperCase()}` : "Baixar"}
                            >
                              <Download className="h-3.5 w-3.5" /> Baixar
                              {d.extensao && (
                                <span className="ml-1 px-1 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-500 uppercase tracking-wider">
                                  {d.extensao}
                                </span>
                              )}
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* Rev. 1561 — Visualizador inline (PDF/imagem). Mesmo padrão da
          tela RH/Docs: iframe sandbox + #toolbar=0 + marca d'água + bloqueio
          de menu de contexto. Não impede print/screenshot. */}
      {pdfViewer && (
        <div
          className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm flex flex-col animate-in fade-in duration-150"
          onContextMenu={(e) => e.preventDefault()}
        >
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-slate-900/90 text-white border-b border-slate-700">
            <div className="min-w-0">
              <p className="font-semibold text-sm truncate">{pdfViewer.titulo}</p>
              <p className="text-[11px] text-slate-300 truncate">{pdfViewer.subtitulo}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-amber-200 bg-amber-900/40 px-2 py-1 rounded-md border border-amber-700/40">
                Visualização — Download desabilitado
              </span>
              <button
                onClick={() => setPdfViewer(null)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" /> Fechar
              </button>
            </div>
          </div>
          <div className="relative flex-1 min-h-0 bg-slate-800">
            <iframe
              src={pdfViewer.url}
              title={pdfViewer.titulo}
              className="absolute inset-0 w-full h-full bg-white"
              sandbox="allow-same-origin allow-scripts"
            />
            <div className="absolute inset-0 pointer-events-none select-none mix-blend-multiply opacity-[0.07]">
              <div
                className="absolute inset-0 flex items-center justify-center text-slate-900 font-black text-2xl tracking-widest uppercase"
                style={{ transform: "rotate(-30deg)" }}
              >
                {nomeEmpresa} • Visualização
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
