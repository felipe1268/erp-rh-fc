import { Fragment, useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation, useRoute } from "wouter";
import { toast } from "sonner";
import {
  ArrowLeft, ShieldCheck, Users, FileCheck2, FileX2, FileWarning,
  GraduationCap, ChevronDown, ChevronRight, Search, Home, Eye, X,
} from "lucide-react";
import PortalPrintHeader from "@/components/PortalPrintHeader";
import PrintActions from "@/components/PrintActions";
import { getNrDescricao } from "@shared/trainingRules";

const fmtBR = (s?: string | null) => (s ? s.split("T")[0].split("-").reverse().join("/") : "—");

export default function PortalRhDocumentosCliente() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/portal/cliente/rh/:obraId");
  const obraId = parseInt(params?.obraId || "0");
  const token = localStorage.getItem("portal_token") || "";
  const tipo = localStorage.getItem("portal_tipo") || "";
  const nomeEmpresa = localStorage.getItem("portal_nome") || "Cliente";

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

  const { data, isLoading } = trpc.portalExterno.cliente.documentosRhObra.useQuery(
    { token, obraId },
    { enabled: !!token && obraId > 0 }
  );

  const funcionarios = (data?.funcionarios || []) as any[];
  const totais = data?.totais || { funcionarios: 0, asoVigente: 0, asoVencido: 0, semAso: 0 };

  const [busca, setBusca] = useState("");
  const [filtroAso, setFiltroAso] = useState<"todos" | "vigente" | "vencido" | "sem_aso">("todos");
  const [exp, setExp] = useState<Record<number, boolean>>({});
  const [fotoZoom, setFotoZoom] = useState<{ url: string; nome: string } | null>(null);
  // Rev. 1555 — visualizador de PDF inline (sem download).
  // O backend faz proxy autenticado em /api/portal/cliente/documento/:tipo/:id
  // e devolve com Content-Disposition: inline. O front embute em iframe com
  // sandbox + #toolbar=0 pra esconder a barra do visualizador (que tem
  // botão de download). Não é à prova de print/screenshot.
  const [pdfViewer, setPdfViewer] = useState<{ url: string; titulo: string; subtitulo: string } | null>(null);
  const abrirPdf = (tipo: "aso" | "treinamento", id: number, titulo: string, subtitulo: string) => {
    const url = `/api/portal/cliente/documento/${tipo}/${id}?token=${encodeURIComponent(token)}#toolbar=0&navpanes=0&scrollbar=1`;
    setPdfViewer({ url, titulo, subtitulo });
  };

  const lista = useMemo(() => {
    let l = funcionarios;
    if (filtroAso !== "todos") l = l.filter((f) => f.asoStatus === filtroAso);
    if (busca) {
      const q = busca.toLowerCase();
      l = l.filter((f) => (f.nome || "").toLowerCase().includes(q) || (f.funcao || "").toLowerCase().includes(q));
    }
    return [...l].sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
  }, [funcionarios, filtroAso, busca]);

  const Kpi = ({ label, value, color, icon: Icon }: any) => (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] uppercase font-semibold text-slate-500 tracking-wide truncate">{label}</p>
          <p className={`text-2xl font-bold mt-0.5 ${color}`}>{value}</p>
        </div>
        <div className={`p-2 rounded-lg ${color.replace("text-", "bg-").replace("-700", "-100").replace("-600", "-100")} shrink-0`}>
          <Icon className={`h-5 w-5 ${color}`} />
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50">
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
              onClick={() => navigate("/portal/cliente/modulo/rh-documentos")}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-emerald-700"
            >
              <ArrowLeft className="h-4 w-4" /> Obras
            </button>
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-600 to-emerald-700 flex items-center justify-center shadow-md shrink-0">
              <ShieldCheck className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="font-bold text-slate-800 text-sm sm:text-base truncate">RH / Controle de Documentos</h1>
              <p className="text-[11px] text-slate-500 truncate">{obra?.nome || "Obra"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 portal-no-print">
            <PrintActions />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        <PortalPrintHeader obra={obra} titulo="RH / Controle de Documentos" />
        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi label="Funcionários" value={totais.funcionarios} color="text-blue-700" icon={Users} />
          <Kpi label="ASO Vigente" value={totais.asoVigente} color="text-emerald-700" icon={FileCheck2} />
          <Kpi label="ASO Vencido" value={totais.asoVencido} color="text-rose-700" icon={FileX2} />
          <Kpi label="Sem ASO" value={totais.semAso} color="text-slate-700" icon={FileWarning} />
        </div>

        {/* Filtros */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 flex flex-wrap items-center gap-2">
          {([
            { k: "todos", label: "Todos", count: totais.funcionarios },
            { k: "vigente", label: "ASO Vigente", count: totais.asoVigente },
            { k: "vencido", label: "ASO Vencido", count: totais.asoVencido },
            { k: "sem_aso", label: "Sem ASO", count: totais.semAso },
          ] as const).map((f) => (
            <button
              key={f.k}
              onClick={() => setFiltroAso(f.k as any)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium border transition ${
                filtroAso === f.k ? "bg-emerald-50 text-emerald-700 border-emerald-300" : "text-slate-500 hover:bg-slate-50 border-transparent"
              }`}
            >
              <span className="font-bold">{f.count}</span>
              <span>{f.label}</span>
            </button>
          ))}
          <div className="ml-auto relative">
            <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por nome ou função..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm w-64 bg-white"
            />
          </div>
        </div>

        {/* Tabela */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="text-center py-16 text-sm text-slate-400">Carregando documentos...</div>
          ) : lista.length === 0 ? (
            <div className="text-center py-16 text-sm text-slate-400">Nenhum funcionário encontrado.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="w-8" />
                  <th className="text-left px-4 py-2 text-[11px] font-semibold text-slate-500 uppercase">Funcionário</th>
                  <th className="text-left px-4 py-2 text-[11px] font-semibold text-slate-500 uppercase">Função</th>
                  <th className="text-center px-4 py-2 text-[11px] font-semibold text-slate-500 uppercase">ASO</th>
                  <th className="text-center px-4 py-2 text-[11px] font-semibold text-slate-500 uppercase">Treinamentos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lista.map((f: any) => {
                  const expanded = !!exp[f.id];
                  const asoColor = f.asoStatus === "vigente" ? "bg-emerald-100 text-emerald-800" :
                                   f.asoStatus === "vencido" ? "bg-rose-100 text-rose-800" :
                                   "bg-slate-100 text-slate-600";
                  return (
                    <Fragment key={f.id}>
                      <tr className="hover:bg-emerald-50/30">
                        <td className="px-2 py-2 text-center">
                          <button onClick={() => setExp((x) => ({ ...x, [f.id]: !x[f.id] }))}>
                            {expanded ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                          </button>
                        </td>
                        <td className="px-4 py-2 font-medium text-slate-800 text-[13px]">
                          <div className="flex items-center gap-2.5">
                            {f.fotoUrl ? (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setFotoZoom({ url: f.fotoUrl, nome: f.nome }); }}
                                className="shrink-0 rounded-full focus:outline-none focus:ring-2 focus:ring-emerald-400 hover:ring-2 hover:ring-emerald-300 transition"
                                title="Clique para ampliar"
                              >
                                <img
                                  src={f.fotoUrl}
                                  alt={f.nome}
                                  className="w-8 h-8 rounded-full object-cover object-top border border-slate-200 cursor-zoom-in"
                                />
                              </button>
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                                {(f.nome || "?").split(" ").filter(Boolean).slice(0, 2).map((p: string) => p[0]).join("").toUpperCase()}
                              </div>
                            )}
                            <span>{f.nome}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2 text-slate-600 text-[13px]">{f.funcao || "—"}</td>
                        <td className="px-4 py-2 text-center">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${asoColor}`}>
                            {f.asoStatus === "vigente" ? "Vigente" : f.asoStatus === "vencido" ? "Vencido" : "Sem ASO"}
                          </span>
                          {f.aso?.dataValidade && (
                            <p className="text-[10px] text-slate-400 mt-0.5">até {fmtBR(f.aso.dataValidade)}</p>
                          )}
                        </td>
                        <td className="px-4 py-2 text-center">
                          <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-slate-700">
                            <GraduationCap className="h-3.5 w-3.5 text-emerald-600" /> {f.treinamentosVigentes}
                          </span>
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="bg-slate-50/50">
                          <td colSpan={5} className="px-6 py-4">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
                              <div>
                                <p className="font-semibold text-slate-600 mb-1.5 flex items-center gap-1.5">
                                  <FileCheck2 className="h-3.5 w-3.5 text-emerald-600" /> ASO
                                </p>
                                {f.aso ? (
                                  <>
                                    <ul className="space-y-1 text-slate-600">
                                      <li><b>Tipo:</b> {f.aso.tipo}</li>
                                      <li><b>Resultado:</b> {f.aso.resultado}</li>
                                      <li><b>Exame:</b> {fmtBR(f.aso.dataExame)}</li>
                                      <li><b>Validade:</b> {fmtBR(f.aso.dataValidade)}</li>
                                    </ul>
                                    {f.aso.temPdf && (
                                      <button
                                        onClick={() => abrirPdf("aso", f.aso.id, `ASO — ${f.nome}`, `${f.aso.tipo || "Periódico"} • Validade ${fmtBR(f.aso.dataValidade)}`)}
                                        className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-[11px] font-semibold border border-emerald-200 transition"
                                      >
                                        <Eye className="h-3 w-3" /> Ver PDF
                                      </button>
                                    )}
                                  </>
                                ) : <p className="text-slate-400">Sem ASO registrado.</p>}
                              </div>
                              <div>
                                <p className="font-semibold text-slate-600 mb-1.5 flex items-center gap-1.5">
                                  <GraduationCap className="h-3.5 w-3.5 text-emerald-600" /> Treinamentos ({f.treinamentos.length})
                                </p>
                                {f.treinamentos.length === 0 ? (
                                  <p className="text-slate-400">Sem treinamentos.</p>
                                ) : (
                                  <ul className="space-y-1.5 text-slate-600 max-h-44 overflow-y-auto">
                                    {f.treinamentos.map((t: any, i: number) => {
                                      // Rev. 1556 — descrição curta da NR ao lado do código.
                                      // Prioridade: nome do treinamento gravado → descrição
                                      // padrão da NR. Não duplica se o nome já for o código.
                                      const desc = (t.nome && t.nome.toUpperCase() !== String(t.norma || "").toUpperCase())
                                        ? t.nome
                                        : getNrDescricao(t.norma);
                                      return (
                                        <li key={i} className="flex items-start justify-between gap-2 py-0.5">
                                          <div className="min-w-0 flex-1">
                                            <div className="flex items-baseline gap-1.5 flex-wrap">
                                              <b className="text-slate-800">{t.norma || t.nome || "—"}</b>
                                              {desc && (
                                                <span className="text-slate-500 text-[11px] truncate" title={desc}>
                                                  {desc}
                                                </span>
                                              )}
                                            </div>
                                            <div className="text-[10.5px] text-slate-400">
                                              val. {fmtBR(t.dataValidade)}
                                            </div>
                                          </div>
                                          {t.temPdf && (
                                            <button
                                              onClick={() => abrirPdf("treinamento", t.id, `Certificado — ${t.norma || t.nome}${desc ? " · " + desc : ""}`, `${f.nome} • Validade ${fmtBR(t.dataValidade)}`)}
                                              className="shrink-0 mt-0.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-[10px] font-semibold border border-emerald-200 transition"
                                            >
                                              <Eye className="h-3 w-3" /> Ver
                                            </button>
                                          )}
                                        </li>
                                      );
                                    })}
                                  </ul>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </main>

      {/* Visualizador de PDF (inline, sem download) — Rev. 1555.
          O iframe usa sandbox sem 'allow-downloads', e o hash #toolbar=0
          esconde a barra do PDF.js (que tem botão de baixar). Botão direito
          é bloqueado via onContextMenu. NÃO é à prova de print/screenshot. */}
      {pdfViewer && (
        <div
          className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm flex flex-col animate-in fade-in duration-150"
          onContextMenu={(e) => e.preventDefault()}
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-slate-900/90 text-white border-b border-slate-700">
            <div className="min-w-0">
              <p className="font-semibold text-sm truncate">{pdfViewer.titulo}</p>
              <p className="text-[11px] text-slate-300 truncate">{pdfViewer.subtitulo}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-amber-200 bg-amber-900/40 px-2 py-1 rounded-md border border-amber-700/40" title="Documento de uso restrito">
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
          {/* Body — iframe ocupando o resto, com marca d'água sutil cobrindo */}
          <div className="relative flex-1 min-h-0 bg-slate-800">
            <iframe
              src={pdfViewer.url}
              title={pdfViewer.titulo}
              className="absolute inset-0 w-full h-full bg-white"
              sandbox="allow-same-origin allow-scripts"
            />
            {/* Marca d'água diagonal repetida — identifica o cliente acessando.
                pointer-events:none pra não atrapalhar a navegação no PDF. */}
            <div
              className="absolute inset-0 pointer-events-none select-none mix-blend-multiply opacity-[0.07]"
              style={{
                backgroundImage: `repeating-linear-gradient(-30deg, transparent 0 60px, rgba(0,0,0,0.0) 60px 240px)`,
              }}
            >
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

      {/* Lightbox de foto */}
      {fotoZoom && (
        <div
          className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setFotoZoom(null)}
        >
          <div
            className="relative max-w-[90vw] max-h-[90vh] flex flex-col items-center gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={fotoZoom.url}
              alt={fotoZoom.nome}
              className="max-w-[90vw] max-h-[78vh] object-contain rounded-2xl shadow-2xl border-2 border-white/20"
            />
            <div className="text-center">
              <p className="text-white font-semibold text-base">{fotoZoom.nome}</p>
              <button
                onClick={() => setFotoZoom(null)}
                className="mt-2 inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-medium transition"
              >
                Fechar
              </button>
            </div>
            <button
              onClick={() => setFotoZoom(null)}
              className="absolute -top-3 -right-3 w-9 h-9 rounded-full bg-white text-slate-800 hover:bg-slate-100 shadow-lg flex items-center justify-center text-xl font-bold transition"
              aria-label="Fechar"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
