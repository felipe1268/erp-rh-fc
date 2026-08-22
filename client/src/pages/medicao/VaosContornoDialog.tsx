// Rev. — Dialog "Descontar vãos" do contorno (Levantamento de Campo).
// Lista as esquadrias marcadas no Mapa de Vãos do pavimento da planta e aplica
// o critério de medição (contrato congelado > catálogo global "definido"):
// desconta o vão acima do limite e paga o requadro UMA única vez (ledger no pin
// — cobrança dupla sai zerada com justificativa automática).
//
// Rev. — modo NICHOS: contorno de contagem (un) classificado num serviço por
// quantidade conta os pins de nicho do mapa; cada nicho é pago UMA única vez
// (mesmo ledger anti-duplicidade dos requadros).
import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Lock, DoorOpen, RectangleHorizontal, Box } from "lucide-react";
import { toast } from "sonner";

const brNum = (v: any, d = 2) => {
  const n = Number(v);
  return isFinite(n) ? n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—";
};

export function VaosContornoDialog({
  companyId, contorno, pavimentoId, travado, onClose, onApplied,
}: {
  companyId: number;
  contorno: any;
  pavimentoId: number | null;
  travado: boolean;
  onClose: () => void;
  onApplied: () => void;
}) {
  // Contorno de contagem = modo NICHOS (conta pins de nicho por unidade).
  const modoNichos = contorno?.tipo === "contagem";

  const aplicado = useMemo(() => {
    try { return contorno?.vaosJson ? JSON.parse(contorno.vaosJson) : null; } catch { return null; }
  }, [contorno?.vaosJson]);

  const esqQ = trpc.medicaoCriterios.listarEsquadrias.useQuery(
    { companyId, pavimentoId: pavimentoId || 0 },
    { enabled: !!companyId && !!pavimentoId },
  );
  const esquadrias: any[] = useMemo(
    () => ((esqQ.data as any[]) ?? []).filter((e: any) => modoNichos ? e.tipTipo === "nicho" : e.tipTipo !== "nicho"),
    [esqQ.data, modoNichos],
  );

  const jaAplicadosIds: number[] = (aplicado?.itens ?? []).map((i: any) => i.esquadriaId);
  const [sel, setSel] = useState<number[]>(jaAplicadosIds);

  const aplicarMut = trpc.medicaoCriterios.aplicarVaosContorno.useMutation({
    onSuccess: (r: any) => {
      toast.success(`Vãos aplicados: desconto ${brNum(r.descontoTotal)} m²${r.requadroTotal > 0 ? ` · requadro ${brNum(r.requadroTotal)} m` : ""}.`);
      onApplied(); onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });
  const aplicarNichosMut = trpc.medicaoCriterios.aplicarNichosContorno.useMutation({
    onSuccess: (r: any) => {
      toast.success(`Nichos contados: ${r.pagos} un pagos aqui${r.jaPagos > 0 ? ` · ${r.jaPagos} já pagos em outra medição (zerados)` : ""}.`);
      onApplied(); onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });
  const removerMut = trpc.medicaoCriterios.removerVaosContorno.useMutation({
    onSuccess: () => { toast.success(modoNichos ? "Contagem de nichos removida — quantidade original restaurada." : "Desconto de vãos removido — área bruta restaurada."); onApplied(); onClose(); },
    onError: (e: any) => toast.error(e.message),
  });

  const busy = aplicarMut.isPending || aplicarNichosMut.isPending || removerMut.isPending;

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{modoNichos ? "Contar nichos" : "Descontar vãos"} — contorno nº {contorno?.numero ?? ""}</DialogTitle>
        </DialogHeader>

        {!pavimentoId ? (
          <p className="text-sm text-gray-500">
            Esta planta não está vinculada a um pavimento da obra. Importe a planta do cadastro
            da obra (Projetos para Medição) para usar o mapa de vãos.
          </p>
        ) : esqQ.isLoading ? (
          <div className="text-sm text-gray-400 py-6 text-center"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Carregando {modoNichos ? "nichos" : "vãos"} do pavimento...</div>
        ) : esquadrias.length === 0 ? (
          <p className="text-sm text-gray-500">
            {modoNichos ? (
              <>Nenhum nicho marcado neste pavimento. Marque os nichos em
                Obras → Editar → Projetos (Medição) → <b>Esquadrias</b> (tipo Nicho).</>
            ) : (
              <>Nenhuma esquadria marcada neste pavimento. Marque portas e janelas em
                Obras → Editar → Projetos (Medição) → <b>Esquadrias</b>.</>
            )}
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">
              {modoNichos ? (
                <>Selecione os nichos contidos nesta medição. Cada nicho é pago <b>uma única vez</b> —
                  nicho já pago em outra medição sai zerado com justificativa automática.</>
              ) : (
                <>Selecione os vãos contidos nesta área medida. O critério do serviço decide o que
                  desconta e se paga requadro — vão com requadro já pago sai zerado com justificativa
                  automática na memória de cálculo.</>
              )}
            </p>
            {aplicado && (
              <div className="text-xs bg-indigo-50 border border-indigo-200 rounded-md p-2 text-indigo-800">
                {modoNichos ? (
                  <>Já aplicado: {(aplicado.itens ?? []).filter((i: any) => i.status === "pago_aqui").length} un pagos aqui
                    {(aplicado.itens ?? []).some((i: any) => i.status === "ja_pago") ? <> · {(aplicado.itens ?? []).filter((i: any) => i.status === "ja_pago").length} já pagos em outra medição</> : null}.
                    Reaplicar recalcula do zero.</>
                ) : (
                  <>Já aplicado: área bruta {brNum(aplicado.areaBruta)} m² · desconto{" "}
                    {brNum(contorno?.descontoVaos)} m²
                    {Number(contorno?.requadroMl) > 0 ? <> · requadro {brNum(contorno?.requadroMl)} m</> : null}
                    {" "}(critério: {aplicado.criterio?.servico} — {aplicado.criterio?.origem === "contrato" ? "congelado no contrato" : "catálogo"}).
                    Reaplicar recalcula do zero.</>
                )}
              </div>
            )}
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {esquadrias.map((e: any) => {
                const bloqueadoPorOutro = !!e.requadroPagoEm && e.requadroPagoContornoId !== contorno?.id;
                return (
                  <label key={e.id} className="flex items-center gap-2 text-sm border rounded-md px-2 py-1.5 cursor-pointer hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={sel.includes(e.id)}
                      disabled={busy}
                      onChange={(ev) => setSel(s => ev.target.checked ? [...s, e.id] : s.filter(x => x !== e.id))}
                    />
                    {e.tipTipo === "porta" ? <DoorOpen className="w-4 h-4 text-amber-600" /> : e.tipTipo === "nicho" ? <Box className="w-4 h-4 text-violet-600" /> : <RectangleHorizontal className="w-4 h-4 text-sky-600" />}
                    <span className="font-mono font-semibold">{e.codigo}</span>
                    <span className="text-xs text-gray-500">
                      {e.tipTipo === "nicho"
                        ? (e.largura > 0 ? `${brNum(e.largura)}×${brNum(e.altura)} m · 1 un` : "1 un")
                        : `${brNum(e.largura)}×${brNum(e.altura)} m · ${brNum(e.areaVao)} m²`}
                    </span>
                    {bloqueadoPorOutro && (
                      <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-1.5 py-0.5">
                        <Lock className="w-3 h-3" /> {e.tipTipo === "nicho" ? "já pago" : "requadro já pago"}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
            <div className="flex flex-wrap justify-end gap-2 pt-2 border-t">
              {aplicado && (
                <Button size="sm" variant="outline" className="text-red-600 border-red-200 mr-auto"
                  disabled={busy || travado}
                  onClick={() => removerMut.mutate({ companyId, contornoId: contorno.id })}>
                  {removerMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
                  {modoNichos ? "Remover contagem" : "Remover desconto"}
                </Button>
              )}
              <Button size="sm" variant="outline" disabled={busy} onClick={onClose}>Cancelar</Button>
              <Button size="sm" disabled={busy || sel.length === 0 || travado}
                onClick={() => modoNichos
                  ? aplicarNichosMut.mutate({ companyId, contornoId: contorno.id, esquadriaIds: sel })
                  : aplicarMut.mutate({ companyId, contornoId: contorno.id, esquadriaIds: sel })}>
                {(aplicarMut.isPending || aplicarNichosMut.isPending) ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
                {modoNichos ? `Contar nichos (${sel.length})` : `Aplicar desconto (${sel.length})`}
              </Button>
            </div>
            {travado && <p className="text-[11px] text-amber-600">Levantamento consolidado — só leitura.</p>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
