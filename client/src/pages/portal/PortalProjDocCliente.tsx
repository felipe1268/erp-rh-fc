import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation, useRoute } from "wouter";
import { toast } from "sonner";
import {
  ArrowLeft, FileText, Search, Download, FileCheck2, Clock, Edit3, FileX2, FolderOpen, Home,
} from "lucide-react";
import PortalPrintHeader from "@/components/PortalPrintHeader";

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

  const lista = useMemo(() => {
    let l = docs;
    if (filtro !== "todos") l = l.filter((d) => d.status === filtro);
    if (busca) {
      const q = busca.toLowerCase();
      l = l.filter((d) =>
        (d.codigo || "").toLowerCase().includes(q) ||
        (d.titulo || "").toLowerCase().includes(q) ||
        (d.tipoNome || "").toLowerCase().includes(q)
      );
    }
    return l;
  }, [docs, filtro, busca]);

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
          <div className="w-12" />
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
          <div className="ml-auto relative">
            <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por código, título ou tipo..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm w-72 bg-white"
            />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="text-center py-16 text-sm text-slate-400">Carregando documentos...</div>
          ) : lista.length === 0 ? (
            <div className="text-center py-16 text-sm text-slate-400">
              <FolderOpen className="h-10 w-10 mx-auto mb-2 text-slate-300" />
              Nenhum documento encontrado.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-2 text-[11px] font-semibold text-slate-500 uppercase">Código</th>
                  <th className="text-left px-4 py-2 text-[11px] font-semibold text-slate-500 uppercase">Título</th>
                  <th className="text-left px-4 py-2 text-[11px] font-semibold text-slate-500 uppercase">Tipo</th>
                  <th className="text-center px-4 py-2 text-[11px] font-semibold text-slate-500 uppercase">Rev.</th>
                  <th className="text-center px-4 py-2 text-[11px] font-semibold text-slate-500 uppercase">Status</th>
                  <th className="text-center px-4 py-2 text-[11px] font-semibold text-slate-500 uppercase">Emissão</th>
                  <th className="text-center px-4 py-2 text-[11px] font-semibold text-slate-500 uppercase">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lista.map((d) => {
                  const st = STATUS_INFO[d.status || "em_elaboracao"] || STATUS_INFO.em_elaboracao;
                  return (
                    <tr key={d.id} className="hover:bg-purple-50/30">
                      <td className="px-4 py-2 font-mono text-[12px] text-slate-700">{d.codigo}</td>
                      <td className="px-4 py-2 text-slate-800 text-[13px]">
                        <p className="font-medium">{d.titulo}</p>
                        {d.descricao && <p className="text-[11px] text-slate-400 line-clamp-1">{d.descricao}</p>}
                      </td>
                      <td className="px-4 py-2 text-slate-600 text-[12px]">
                        {d.tipoSigla ? <span className="font-mono font-bold text-purple-700">{d.tipoSigla}</span> : "—"}
                        {d.tipoNome !== "—" && <span className="text-slate-400 ml-1">{d.tipoNome}</span>}
                      </td>
                      <td className="px-4 py-2 text-center text-[12px] font-bold text-slate-700">{d.revisaoAtual || "0"}</td>
                      <td className="px-4 py-2 text-center">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold border ${st.color}`}>
                          {st.label}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-center text-[12px] text-slate-600">{fmtBR(d.dataEmissao)}</td>
                      <td className="px-4 py-2 text-center">
                        {d.arquivoUrl ? (
                          <a
                            href={d.arquivoUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[12px] font-semibold text-purple-700 hover:text-purple-900"
                          >
                            <Download className="h-3.5 w-3.5" /> Baixar
                          </a>
                        ) : (
                          <span className="text-[11px] text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
}
