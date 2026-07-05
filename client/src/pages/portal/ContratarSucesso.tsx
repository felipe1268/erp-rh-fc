import { trpc } from "@/lib/trpc";
import { useSearch, useLocation } from "wouter";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ContratarSucesso() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const sessionId = new URLSearchParams(search).get("session_id") || "";

  const { data, isLoading, error } = trpc.billing.getCheckoutSessionStatus.useQuery(
    { sessionId },
    { enabled: !!sessionId, refetchInterval: (q) => (q.state.data?.status === "complete" ? false : 2000) }
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8 text-center">
        {(!sessionId || error) && (
          <>
            <XCircle className="w-14 h-14 text-red-500 mx-auto mb-4" />
            <h1 className="text-xl font-bold text-gray-800">Não foi possível confirmar o pagamento</h1>
            <p className="text-gray-500 mt-2 text-sm">Verifique o link ou tente novamente.</p>
          </>
        )}
        {sessionId && !error && isLoading && (
          <>
            <Loader2 className="w-14 h-14 text-orange-500 mx-auto mb-4 animate-spin" />
            <h1 className="text-xl font-bold text-gray-800">Confirmando seu pagamento...</h1>
            <p className="text-gray-500 mt-2 text-sm">Isso leva só alguns segundos.</p>
          </>
        )}
        {sessionId && !error && !isLoading && data && (
          <>
            <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto mb-4" />
            <h1 className="text-xl font-bold text-gray-800">Assinatura confirmada!</h1>
            <p className="text-gray-500 mt-2 text-sm">
              Enviamos as credenciais de acesso para <strong>{data.customerEmail}</strong>.
              Verifique também a caixa de spam. No primeiro acesso você será solicitado a trocar sua senha.
            </p>
            <Button className="mt-6 w-full h-11 bg-orange-500 hover:bg-orange-600" onClick={() => navigate("/login")}>
              Ir para o login
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
