/**
 * client/src/pages/financeiro/dashboards/DashDivergencias.tsx
 * Rev. 4682 — Central de Divergências entre módulos (poka-yoke 2/6).
 * Verificação só de LEITURA: lista registros desencontrados entre módulos
 * (RH × Aviso Prévio, Cheques × Contas a Pagar, Compras × Financeiro, etc.).
 * Nada é corrigido automaticamente — o usuário decide caso a caso.
 */
import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShieldCheck, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

const fmtBRL = (v: any) => Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (s: any) => (typeof s === "string" && s.length >= 10 ? s.slice(0, 10).split("-").reverse().join("/") : String(s ?? ""));

function ItemLinha({ check, item }: { check: string; item: any }) {
  switch (check) {
    case "aviso_ativo":
      return <span><strong>{item.nome}</strong> — aviso de {fmtDate(item.avisoInicio)} a {fmtDate(item.avisoFim)} (cadastro segue "Ativo")</span>;
    case "desligado_obra":
      return <span><strong>{item.nome}</strong> ({item.status}) — ainda alocado em <strong>{item.obra || "obra"}</strong></span>;
    case "desligado_epi":
      return <span><strong>{item.nome}</strong> — {item.episAbertos} EPI(s) sem devolução registrada</span>;
    case "desligado_seguro":
      return <span><strong>{item.nome}</strong> — cobertura de seguro "{item.seguroStatus}"</span>;
    case "cheque_titulo":
      return <span>Cheque <strong>{item.numeroCheque || `#${item.chequeId}`}</strong> ({fmtBRL(item.valor)}) está "{item.chequeStatus}" mas o título #{item.entryId} está "{item.tituloStatus}"</span>;
    case "medicao_dupla":
      return <span>Medição <strong>#{item.medicaoId}</strong> — {item.lancamentos} lançamentos no Contas a Receber (total {fmtBRL(item.valorTotal)})</span>;
    case "oc_sem_financeiro":
      return <span>OC <strong>{item.numeroOc}</strong> ({item.fornecedor || "sem fornecedor"}) — status "{item.status}" sem conta a pagar</span>;
    case "financeiro_orfao":
      return <span>Título <strong>#{item.entryId}</strong> ({fmtBRL(item.valor)}, "{item.tituloStatus}") — OC {item.numeroOc} foi CANCELADA</span>;
    case "ferias_ponto":
      return <span><strong>{item.nome}</strong> — férias {fmtDate(item.feriasInicio)}–{fmtDate(item.feriasFim)} com {item.batidas} dia(s) de ponto batido</span>;
    default:
      return <span>{JSON.stringify(item)}</span>;
  }
}

export default function DashDivergencias() {
  const { companyId } = useCompany();
  const q = trpc.divergencias.list.useQuery(
    { companyId: companyId ?? 0 },
    { enabled: !!companyId, staleTime: 60_000 },
  );
  const d = q.data;
  const comProblema = useMemo(() => (d?.checks ?? []).filter((c: any) => c.itens.length > 0), [d]);
  const semProblema = useMemo(() => (d?.checks ?? []).filter((c: any) => c.itens.length === 0), [d]);

  return (
    <DashboardLayout>
      <div className="p-3 sm:p-6 space-y-4 max-w-5xl mx-auto">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-[#0A1E3C]">Central de Divergências</h1>
            <p className="text-xs text-muted-foreground">Cruzamento automático entre módulos — só leitura; nada é alterado sem você.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => q.refetch()} disabled={q.isFetching}>
            {q.isFetching ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            Verificar agora
          </Button>
        </div>

        {q.isLoading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Cruzando dados dos módulos…
          </div>
        ) : q.isError ? (
          <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 space-y-1">
            <p className="font-semibold">Erro ao executar as verificações.</p>
            <p className="text-xs">{q.error?.message}</p>
            <button className="text-xs underline" onClick={() => q.refetch()}>Tentar novamente</button>
          </div>
        ) : d ? (
          <>
            {d.falhasChecks.length > 0 && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                ⚠️ Resultado parcial — verificações que falharam: {d.falhasChecks.join(", ")}.
              </div>
            )}

            {d.totalDivergencias === 0 ? (
              <div className="flex flex-col items-center py-14 gap-2 text-green-700">
                <ShieldCheck className="h-10 w-10" />
                <p className="font-semibold">Nenhuma divergência encontrada</p>
                <p className="text-xs text-muted-foreground">Todos os módulos estão consistentes entre si.</p>
              </div>
            ) : (
              <div className="rounded-lg border border-orange-300 bg-orange-50 px-4 py-3 text-sm text-orange-800 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 shrink-0" />
                <span><strong>{d.totalDivergencias}</strong> divergência(s) encontrada(s) em {comProblema.length} verificação(ões).</span>
              </div>
            )}

            {comProblema.map((ck: any) => (
              <Card key={ck.key} className="border-orange-200">
                <CardHeader className="py-3">
                  <CardTitle className="text-sm flex items-center justify-between gap-2 flex-wrap">
                    <span className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-orange-500" />
                      {ck.titulo}
                    </span>
                    <span className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">{ck.modulo}</Badge>
                      <Badge className="bg-orange-500">{ck.itens.length}</Badge>
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <ul className="space-y-1.5 text-xs text-slate-700">
                    {ck.itens.map((item: any, i: number) => (
                      <li key={i} className="border-b border-slate-100 pb-1.5 last:border-0 break-words">
                        <ItemLinha check={ck.key} item={item} />
                      </li>
                    ))}
                  </ul>
                  {ck.itens.length >= 200 && (
                    <p className="text-[10px] text-muted-foreground mt-2">Mostrando os primeiros 200 casos.</p>
                  )}
                </CardContent>
              </Card>
            ))}

            {semProblema.length > 0 && (
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm flex items-center gap-2 text-green-700">
                    <ShieldCheck className="h-4 w-4" /> Verificações sem divergência ({semProblema.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <ul className="text-xs text-muted-foreground space-y-1">
                    {semProblema.map((ck: any) => (
                      <li key={ck.key}>✓ {ck.titulo} <span className="text-slate-400">({ck.modulo})</span></li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
