import { useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation, useRoute } from "wouter";
import { toast } from "sonner";
import { Building2, ArrowLeft, MapPin, ArrowRight, CalendarRange, ShieldCheck, FileText, Home } from "lucide-react";

const MODULO_INFO: Record<string, { titulo: string; cor: string; corBg: string; icon: any; rotaPorObra: (id: number) => string }> = {
  "planejamento": {
    titulo: "Planejamento da Obra",
    cor: "from-blue-600 to-indigo-700",
    corBg: "bg-blue-50 text-blue-700",
    icon: CalendarRange,
    rotaPorObra: (id) => `/portal/cliente/obra/${id}`,
  },
  "rh-documentos": {
    titulo: "RH / Controle de Documentos",
    cor: "from-emerald-600 to-emerald-700",
    corBg: "bg-emerald-50 text-emerald-700",
    icon: ShieldCheck,
    rotaPorObra: (id) => `/portal/cliente/rh/${id}`,
  },
  "proj-doc": {
    titulo: "Proj./Doc. Técnicos",
    cor: "from-purple-600 to-purple-700",
    corBg: "bg-purple-50 text-purple-700",
    icon: FileText,
    rotaPorObra: (id) => `/portal/cliente/projdoc/${id}`,
  },
};

const STATUS_BADGE: Record<string, string> = {
  "Em Andamento": "bg-emerald-100 text-emerald-800",
  "Planejada": "bg-blue-100 text-blue-800",
  "Concluida": "bg-slate-200 text-slate-700",
  "Suspensa": "bg-amber-100 text-amber-800",
  "Cancelada": "bg-rose-100 text-rose-800",
};

export default function PortalSelecionarObraCliente() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/portal/cliente/modulo/:moduloId");
  const moduloId = params?.moduloId || "";
  const info = MODULO_INFO[moduloId];

  const token = localStorage.getItem("portal_token") || "";
  const tipo = localStorage.getItem("portal_tipo") || "";

  useEffect(() => {
    if (!token) { navigate("/portal/cliente/login"); return; }
    if (tipo && tipo !== "cliente") { navigate("/portal/dashboard"); }
    if (!info) { navigate("/portal/cliente/hub"); }
  }, [token, tipo, info]);

  const { data: minhasObras = [], isLoading } = trpc.portalExterno.cliente.minhasObras.useQuery(
    { token }, { enabled: !!token && tipo === "cliente" }
  );

  if (!info) return null;
  const Icon = info.icon;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <button
            onClick={() => navigate("/portal/cliente/hub")}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 px-3 py-1.5 rounded-lg shadow-sm"
          >
            <Home className="h-3.5 w-3.5" /> Tela Inicial
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${info.cor} flex items-center justify-center shadow-md shrink-0`}>
              <Icon className="h-5 w-5 text-white" />
            </div>
            <h1 className="font-bold text-slate-800 text-sm sm:text-base truncate">{info.titulo}</h1>
          </div>
          <div className="w-12" />
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-slate-800">Escolha a obra</h2>
          <p className="text-sm text-slate-500 mt-1">
            Selecione a obra que deseja consultar — você verá apenas dados pertinentes ao módulo "{info.titulo}".
          </p>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-sm text-slate-400">Carregando obras...</div>
        ) : minhasObras.length === 0 ? (
          <div className="p-6 rounded-xl border border-dashed border-amber-300 bg-amber-50 text-center">
            <p className="text-sm text-amber-800 font-medium">
              Nenhuma obra vinculada ao seu cadastro. Entre em contato com a FC Engenharia.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(minhasObras as any[]).map((o) => (
              <button
                key={o.id}
                onClick={() => navigate(info.rotaPorObra(o.id))}
                className="group text-left bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-lg hover:border-blue-300 transition-all relative overflow-hidden"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Building2 className="h-4 w-4 text-slate-400 shrink-0" />
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide truncate">{o.codigo || "Obra"}</span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-blue-600 group-hover:translate-x-1 transition-all" />
                </div>
                <h3 className="text-base font-bold text-slate-800 mt-2 line-clamp-2">{o.nome}</h3>
                {(o.cidade || o.estado) && (
                  <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                    <MapPin className="h-3 w-3" /> {[o.cidade, o.estado].filter(Boolean).join(" / ")}
                  </p>
                )}
                <div className="mt-3 flex items-center justify-between">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_BADGE[o.status] || "bg-slate-100 text-slate-700"}`}>
                    {o.status || "—"}
                  </span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${info.corBg}`}>Acessar →</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
