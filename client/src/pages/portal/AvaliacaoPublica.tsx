import { useRoute } from "wouter";
import PortalDashboardCliente from "./PortalDashboardCliente";

// Rev. 2890 — Página PÚBLICA de avaliação (NPS) acessada por link aberto enviado
// ao cliente (sem login). Reaproveita o PortalDashboardCliente em modo público
// (publicToken) — focando apenas o formulário de avaliação anônima.
export default function AvaliacaoPublica() {
  const [, params] = useRoute("/portal/avaliacao/:token");
  const token = params?.token || "";
  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6 text-center text-slate-500">
        Link de avaliação inválido. Solicite um novo link à FC Engenharia.
      </div>
    );
  }
  return <PortalDashboardCliente publicToken={token} />;
}
