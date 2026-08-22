import { useLocation, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import RaioXFuncionario from "@/components/RaioXFuncionario";
import { Lock } from "lucide-react";

export default function RaioXDirectPage() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const requestedId = params.id ? parseInt(params.id, 10) : null;

  // Verifica acesso antes de renderizar o componente com ID arbitrário.
  // mode 'full'  → Admin Master / RH-DP: abre normalmente.
  // mode 'self'  → self-only: só permite abrir o próprio employeeId.
  //                Se a URL aponta pra outro, exibe mensagem de bloqueio.
  // mode 'none'  → sem acesso: exibe mensagem de bloqueio.
  // FAIL-CLOSED: enquanto o status não resolve, accessMode fica "unresolved" e
  // nada é renderizado além do loading. Erro na consulta → tratado como "none".
  const { data: accessStatus, isLoading: accessLoading, error: accessError } = trpc.docs.raioXAccessStatus.useQuery(
    undefined,
    { retry: false }
  );
  const accessMode: "full" | "self" | "none" | "unresolved" =
    accessError ? "none" : (accessStatus?.mode ?? "unresolved");
  const accessResolved = accessMode !== "unresolved";
  const selfEmployeeId = accessStatus?.employeeId ?? null;

  if (accessLoading || !accessResolved) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  // mode 'none' → bloqueio total
  if (accessMode === "none") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 px-4">
        <div className="h-16 w-16 rounded-full bg-slate-100 flex items-center justify-center">
          <Lock className="h-8 w-8 text-slate-400" />
        </div>
        <p className="text-lg font-semibold text-slate-700">Você não tem autorização pra isso</p>
        <p className="text-sm text-slate-500 text-center max-w-sm">
          Seu perfil não tem permissão para acessar o Raio-X de funcionários.
        </p>
      </div>
    );
  }

  // mode 'self' → só pode ver o próprio employeeId
  if (accessMode === "self") {
    // URL aponta para ID diferente do próprio: bloqueia
    if (requestedId !== null && selfEmployeeId !== null && requestedId !== selfEmployeeId) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen gap-4 px-4">
          <div className="h-16 w-16 rounded-full bg-slate-100 flex items-center justify-center">
            <Lock className="h-8 w-8 text-slate-400" />
          </div>
          <p className="text-lg font-semibold text-slate-700">Você não tem autorização pra isso</p>
          <p className="text-sm text-slate-500 text-center max-w-sm">
            Este colaborador não está disponível para o seu perfil de acesso.
          </p>
        </div>
      );
    }
    // Abre a própria ficha (usa selfEmployeeId como fonte autoritativa)
    return (
      <RaioXFuncionario
        employeeId={selfEmployeeId}
        open={!!selfEmployeeId}
        onClose={() => navigate("/relatorios/raio-x")}
      />
    );
  }

  // mode 'full' → acesso irrestrito
  return (
    <RaioXFuncionario
      employeeId={requestedId}
      open={true}
      onClose={() => navigate("/relatorios/raio-x")}
    />
  );
}
