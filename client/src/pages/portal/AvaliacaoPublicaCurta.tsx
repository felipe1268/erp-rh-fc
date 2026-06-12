import { useRoute } from "wouter";
import { Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import PortalDashboardCliente from "./PortalDashboardCliente";

// Rev. 2980 — Página PÚBLICA de avaliação (NPS) aberta por SHORT-LINK (/a/<codigo>).
// O código curto é resolvido no backend para o token JWT completo e então a avaliação
// é renderizada em modo público. Resolve definitivamente o problema do WhatsApp truncar
// o JWT longo na URL antiga (/portal/avaliacao/<JWT>), que abria "link não vinculado".
export default function AvaliacaoPublicaCurta() {
  const [, params] = useRoute("/a/:codigo");
  const codigo = params?.codigo || "";
  const q = trpc.portalExterno.cliente.resolverLinkAvaliacao.useQuery(
    { codigo },
    { enabled: !!codigo, staleTime: 5 * 60 * 1000, retry: 1 },
  );

  if (!codigo || q.isError || (!q.isLoading && !q.data?.token)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6 text-center text-slate-500">
        Link de avaliação inválido ou expirado. Solicite um novo link à FC Engenharia.
      </div>
    );
  }

  if (!q.data?.token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return <PortalDashboardCliente publicToken={q.data.token} />;
}
