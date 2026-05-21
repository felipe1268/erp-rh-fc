/**
 * Rev. 2218 — Alerta reutilizável: HE aprovada SEM ponto batido.
 *
 * Mostra um card laranja agrupando solicitações de HE aprovadas cujos
 * funcionários não bateram ponto no dia. RH precisa decidir caso a caso
 * se paga (HE retroativa manual) ou se reverte a aprovação.
 *
 * Usado em:
 *   - SolicitacaoHE (aba Aprovações)
 *   - FechamentoPonto (sub-view Períodos HE)
 *   - FolhaPagamento (Módulo Hora Extra)
 *
 * Não renderiza nada quando não há casos.
 */
import { AlertTriangle, Building2, Eye } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

type Props = {
  companyId: number;
  companyIds?: number[];
  mesReferencia?: string;       // YYYY-MM (fallback)
  dataInicio?: string;          // YYYY-MM-DD (preferido)
  dataFim?: string;             // YYYY-MM-DD
  onOpenEmployee?: (employeeId: number) => void;
  onOpenSolicitacao?: (solicitacaoId: number) => void;
  title?: string;
};

export default function HEAprovadaSemPontoAlert({
  companyId,
  companyIds,
  mesReferencia,
  dataInicio,
  dataFim,
  onOpenEmployee,
  onOpenSolicitacao,
  title,
}: Props) {
  const enabled = companyId > 0 || (companyIds?.length ?? 0) > 0;
  const query = trpc.heSolicitacoes.aprovadasSemPonto.useQuery(
    { companyId, companyIds, mesReferencia, dataInicio, dataFim },
    { enabled }
  );

  const items = query.data ?? [];
  if (items.length === 0) return null;

  // Agrupar por solicitação
  const grupos = new Map<number, { sol: any; funcs: any[] }>();
  for (const it of items) {
    if (!grupos.has(it.solicitacaoId)) {
      grupos.set(it.solicitacaoId, {
        sol: {
          id: it.solicitacaoId,
          dataSolicitacao: it.dataSolicitacao,
          horaInicio: it.horaInicio,
          horaFim: it.horaFim,
          motivo: it.motivo,
          obraNome: it.obraNome,
        },
        funcs: [],
      });
    }
    grupos.get(it.solicitacaoId)!.funcs.push(it);
  }

  return (
    <Card className="border-l-4 border-l-orange-500 bg-orange-50/50 no-print">
      <CardContent className="p-3 md:p-4">
        <div className="flex items-start gap-2 mb-3">
          <AlertTriangle className="h-5 w-5 text-orange-600 mt-0.5 shrink-0" />
          <div className="flex-1">
            <h3 className="text-sm md:text-base font-semibold text-orange-900">
              {title || "HE aprovada SEM ponto batido"} ({items.length} {items.length === 1 ? "funcionário" : "funcionários"})
            </h3>
            <p className="text-[11px] md:text-xs text-orange-800/80 mt-0.5">
              Estes funcionários têm hora extra <strong>aprovada</strong> mas não bateram ponto no dia.
              Analise caso a caso se a HE será paga (lançamento manual no Espelho de Ponto) ou se a aprovação deve ser revertida.
            </p>
          </div>
        </div>
        <div className="space-y-2">
          {Array.from(grupos.values()).map(({ sol, funcs }) => (
            <div key={sol.id} className="bg-white border border-orange-200 rounded-md p-2.5">
              <div className="flex flex-wrap items-center gap-2 text-[11px] md:text-xs mb-1.5">
                <Badge className="bg-green-100 text-green-800 border-green-300 text-[10px]">Aprovada</Badge>
                <span className="text-muted-foreground">
                  HE-{String(sol.id).padStart(5, "0")} ·{" "}
                  {new Date(sol.dataSolicitacao + "T12:00:00").toLocaleDateString("pt-BR", {
                    weekday: "short",
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                  })}
                </span>
                {sol.horaInicio && sol.horaFim && (
                  <span className="text-muted-foreground">
                    {sol.horaInicio} — {sol.horaFim}
                  </span>
                )}
                {sol.obraNome && (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Building2 className="h-3 w-3" /> {sol.obraNome}
                  </span>
                )}
                {onOpenSolicitacao && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 ml-auto text-[10px] px-2"
                    onClick={() => onOpenSolicitacao(sol.id)}
                  >
                    <Eye className="h-3 w-3 mr-1" /> Ver solicitação
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {funcs.map((f: any) => {
                  const Tag: any = onOpenEmployee ? "button" : "span";
                  return (
                    <Tag
                      key={f.employeeId}
                      onClick={onOpenEmployee ? () => onOpenEmployee(f.employeeId) : undefined}
                      className={
                        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-100 border border-orange-300 text-orange-900 text-[10px] md:text-xs" +
                        (onOpenEmployee ? " hover:bg-orange-200 transition" : "")
                      }
                      title={onOpenEmployee ? "Abrir Raio-X do funcionário" : undefined}
                    >
                      <span className="font-medium">{f.employeeName}</span>
                      {f.funcao && <span className="text-orange-700/70">· {f.funcao}</span>}
                    </Tag>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
