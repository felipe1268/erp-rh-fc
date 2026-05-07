import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Lock, AlertTriangle, Clock, ArrowRight } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { Link } from "wouter";

const PERFIS_COMPRAS = new Set([
  "comprador", "compras", "gerente_compras", "diretor_compras",
  "lider_compras", "supervisor_compras", "admin_master", "diretor",
]);

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDataBR = (s: string) => {
  const d = new Date(s);
  return d.toLocaleDateString("pt-BR");
};

/**
 * Modal global que aparece para perfis de Compras quando há reservas
 * preventivas pendentes (dia 5/6/7+). Mostra-se 1x por sessão.
 */
export function ReservasAlertModal() {
  const { selectedCompany } = useCompany();
  const { user } = useAuth();
  const companyId = selectedCompany?.id ?? 0;
  const role = (user as any)?.role as string | undefined;
  const isCompras = role && PERFIS_COMPRAS.has(role);

  const [aberto, setAberto] = useState(false);
  const [jaMostrado, setJaMostrado] = useState(false);

  const { data } = trpc.compras.verificarTravamentoCompras.useQuery(
    { companyId },
    { enabled: !!companyId && !!isCompras, refetchInterval: 5 * 60_000 },
  );

  useEffect(() => {
    if (!data || jaMostrado || !isCompras) return;
    const reservas = data.reservasAtivas ?? [];
    if (reservas.length === 0) return;
    // Mostra a partir do dia 5 (ou se já está vencida).
    const aviso = reservas.some((r: any) => r.diasRestantes <= 3 || r.vencida);
    if (aviso) {
      setAberto(true);
      setJaMostrado(true);
    }
  }, [data, jaMostrado, isCompras]);

  if (!isCompras || !data) return null;
  const reservas = data.reservasAtivas ?? [];
  const travado = data.travado;

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogContent className="max-w-2xl bg-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-700">
            {travado ? (
              <>
                <Lock className="h-5 w-5 text-red-600" />
                <span className="text-red-700">Compras BLOQUEADAS — Reservas vencidas</span>
              </>
            ) : (
              <>
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                Reservas Preventivas pendentes
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-sm text-gray-700">
            {travado ? (
              <>Há <strong>{(data.vencidas ?? []).length}</strong> reserva(s) vencida(s) na sua empresa.
              Novas cotações deficitárias estão <strong>bloqueadas</strong> até que a equipe resolva os pendentes.
              Operações saudáveis (sem déficit) seguem normais.</>
            ) : (
              <>Há <strong>{reservas.length}</strong> reserva(s) preventiva(s) ativa(s) na sua empresa.
              Resolva-as antes do prazo para evitar travamento de novas cotações deficitárias.</>
            )}
          </p>

          <div className="rounded-xl border border-gray-200 bg-gray-50 max-h-64 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-100 sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Cotação</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Responsável</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Valor</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Prazo</th>
                  <th className="text-center px-3 py-2 font-medium text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody>
                {reservas.slice(0, 20).map((r: any) => (
                  <tr key={r.id} className="border-t border-gray-200">
                    <td className="px-3 py-2 font-mono text-blue-700">#{r.cotacaoId}</td>
                    <td className="px-3 py-2 text-gray-700">{r.responsavelNome ?? "—"}</td>
                    <td className="px-3 py-2 text-right font-semibold text-orange-700">{fmt(r.valorTotal)}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{fmtDataBR(r.prazoLimite)}</td>
                    <td className="px-3 py-2 text-center">
                      {r.vencida ? (
                        <Badge variant="destructive" className="text-[10px]">VENCIDA</Badge>
                      ) : r.diasRestantes <= 2 ? (
                        <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-200 text-[10px]">
                          <Clock className="h-3 w-3 mr-0.5" />
                          {r.diasRestantes}d
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px]">
                          <Clock className="h-3 w-3 mr-0.5" />
                          {r.diasRestantes}d
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={() => setAberto(false)}>Lembrar depois</Button>
            <Link href="/compras/realocacao">
              <Button className="bg-purple-600 hover:bg-purple-700" onClick={() => setAberto(false)}>
                Ir para Realocações <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Banner persistente que aparece no topo de páginas do módulo Compras
 * quando há reservas preventivas pendentes.
 */
export function ReservasBanner() {
  const { selectedCompany } = useCompany();
  const { user } = useAuth();
  const companyId = selectedCompany?.id ?? 0;
  const role = (user as any)?.role as string | undefined;
  const isCompras = role && PERFIS_COMPRAS.has(role);

  const { data } = trpc.compras.verificarTravamentoCompras.useQuery(
    { companyId },
    { enabled: !!companyId && !!isCompras, refetchInterval: 5 * 60_000 },
  );

  if (!isCompras || !data) return null;
  const reservas = data.reservasAtivas ?? [];
  if (reservas.length === 0) return null;
  const travado = data.travado;
  const vencidas = (data.vencidas ?? []).length;

  return (
    <div className={`rounded-xl border px-4 py-3 flex items-center gap-3 text-sm shadow-sm ${
      travado
        ? "bg-red-50 border-red-200 text-red-800"
        : "bg-amber-50 border-amber-200 text-amber-800"
    }`}>
      {travado ? <Lock className="h-5 w-5 text-red-600 shrink-0" /> : <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />}
      <div className="flex-1 min-w-0">
        {travado ? (
          <span>
            <strong>Compras travada:</strong> {vencidas} reserva(s) vencida(s) — novas cotações deficitárias bloqueadas.
            Resolva em <Link href="/compras/realocacao"><span className="underline font-medium cursor-pointer">Realocações</span></Link>.
          </span>
        ) : (
          <span>
            <strong>{reservas.length} reserva(s) preventiva(s) ativa(s)</strong> —
            resolva antes do prazo para evitar travamento.
            <Link href="/compras/realocacao"><span className="ml-1 underline font-medium cursor-pointer">Ver Reservas</span></Link>.
          </span>
        )}
      </div>
    </div>
  );
}
