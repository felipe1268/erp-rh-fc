// Rev. — Dialog "Rodapé pela planta" (Levantamento de Campo).
// O critério do rodapé (piso cerâmico/porcelanato) paga por m² via
// perímetro × altura. O contorno já tem o perímetro conhecido; este dialog
// desconta as larguras das PORTAS marcadas no Mapa de Vãos do pavimento,
// pergunta a altura do rodapé (ex.: 0,05 m) e sugere a área resultante.
// O usuário pode ajustar/aceitar; o valor é gravado normalmente no contorno.
import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, DoorOpen, Ruler } from "lucide-react";

const brNum = (v: any, d = 2) => {
  const n = Number(v);
  return isFinite(n) ? n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—";
};
const parseBr = (s: string) => {
  const v = parseFloat(String(s).includes(",") ? String(s).replace(/\./g, "").replace(",", ".") : String(s));
  return isFinite(v) ? v : NaN;
};

export function RodapeContornoDialog({
  companyId, contorno, pavimentoId, travado, saving, onClose, onAplicar,
}: {
  companyId: number;
  contorno: any;
  pavimentoId: number | null;
  travado: boolean;
  saving: boolean;
  onClose: () => void;
  onAplicar: (areaM2: number, memoria: string) => void;
}) {
  const perimetro = (() => { const n = parseFloat(String(contorno?.perimetro ?? "0")); return isFinite(n) && n > 0 ? n : 0; })();

  const esqQ = trpc.medicaoCriterios.listarEsquadrias.useQuery(
    { companyId, pavimentoId: pavimentoId || 0 },
    { enabled: !!companyId && !!pavimentoId },
  );
  const portas: any[] = useMemo(
    () => ((esqQ.data as any[]) ?? []).filter((e: any) => e.tipTipo === "porta"),
    [esqQ.data],
  );

  // Seleção de portas: null = padrão (todas as portas do pavimento marcadas).
  const [selManual, setSelManual] = useState<number[] | null>(null);
  const sel = selManual ?? portas.map((p: any) => p.id);
  const toggle = (id: number, on: boolean) =>
    setSelManual(on ? [...sel, id] : sel.filter((x) => x !== id));

  const [alturaTxt, setAlturaTxt] = useState("");
  // Área final editável: null = segue a sugestão; digitar destaca do cálculo.
  const [areaManual, setAreaManual] = useState<string | null>(null);

  const altura = parseBr(alturaTxt);
  const alturaOk = isFinite(altura) && altura > 0 && altura <= 2;
  const descontoPortas = portas.filter((p: any) => sel.includes(p.id))
    .reduce((s: number, p: any) => s + (Number(p.largura) || 0), 0);
  const perimetroLiq = Math.max(0, perimetro - descontoPortas);
  const areaSugerida = alturaOk ? +(perimetroLiq * altura).toFixed(4) : 0;

  const areaFinalTxt = areaManual ?? (alturaOk ? brNum(areaSugerida) : "");
  const areaFinal = parseBr(areaFinalTxt);
  const areaOk = isFinite(areaFinal) && areaFinal > 0;

  const memoria = (() => {
    const partes = [`perímetro ${brNum(perimetro)} m`];
    if (descontoPortas > 0) partes.push(`− portas ${brNum(descontoPortas)} m (${sel.length} un)`);
    partes.push(`= ${brNum(perimetroLiq)} m × altura ${brNum(altura)} m`);
    return `Rodapé: ${partes.join(" ")} = ${brNum(areaFinal)} m²${areaManual != null && Math.abs(areaFinal - areaSugerida) > 0.005 ? " (ajustado manualmente)" : ""}`;
  })();

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ruler className="w-4 h-4 text-teal-600" />
            Rodapé pela planta — contorno nº {contorno?.numero ?? ""}
          </DialogTitle>
        </DialogHeader>

        {perimetro <= 0 ? (
          <p className="text-sm text-gray-500">
            Este contorno não tem perímetro calculado — redesenhe ou ajuste o contorno na planta para usar este cálculo.
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">
              O rodapé é pago por m²: <b>perímetro do ambiente × altura do rodapé</b>,
              descontando a largura das portas (o rodapé não passa na porta).
            </p>

            {/* Perímetro do contorno */}
            <div className="rounded-md border bg-slate-50 px-3 py-2 text-sm flex items-center justify-between">
              <span className="text-gray-600">Perímetro do contorno</span>
              <span className="font-bold tabular-nums">{brNum(perimetro)} m</span>
            </div>

            {/* Portas do Mapa de Vãos */}
            {!pavimentoId ? (
              <p className="text-[11px] text-amber-600">
                Esta planta não está vinculada a um pavimento da obra — sem Mapa de Vãos não há
                portas para descontar (o cálculo usa o perímetro cheio).
              </p>
            ) : esqQ.isLoading ? (
              <div className="text-sm text-gray-400 py-3 text-center"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Carregando portas do pavimento...</div>
            ) : portas.length === 0 ? (
              <p className="text-[11px] text-gray-400">
                Nenhuma porta marcada neste pavimento no Mapa de Vãos — o cálculo usa o perímetro cheio.
              </p>
            ) : (
              <div>
                <div className="text-xs font-medium text-gray-600 mb-1">
                  Portas a descontar ({sel.length} de {portas.length} · −{brNum(descontoPortas)} m)
                </div>
                <div className="space-y-1 max-h-44 overflow-y-auto">
                  {portas.map((p: any) => (
                    <label key={p.id} className="flex items-center gap-2 text-sm border rounded-md px-2 py-1.5 cursor-pointer hover:bg-slate-50">
                      <input type="checkbox" checked={sel.includes(p.id)} disabled={saving}
                        onChange={(ev) => toggle(p.id, ev.target.checked)} />
                      <DoorOpen className="w-4 h-4 text-amber-600" />
                      <span className="font-mono font-semibold">{p.codigo}</span>
                      <span className="text-xs text-gray-500">largura {brNum(p.largura)} m</span>
                    </label>
                  ))}
                </div>
                <p className="text-[10px] text-gray-400 mt-1">
                  Desmarque as portas que não pertencem a este ambiente.
                </p>
              </div>
            )}

            {/* Altura do rodapé */}
            <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
              <div>
                <Label className="text-[11px] text-gray-500">Altura do rodapé (m)</Label>
                <Input inputMode="decimal" autoFocus className="text-right font-semibold"
                  value={alturaTxt} placeholder="0,05"
                  onChange={(e) => { setAlturaTxt(e.target.value); setAreaManual(null); }} />
              </div>
              <div className="flex gap-1 pb-0.5">
                {["0,05", "0,07", "0,10", "0,15"].map((h) => (
                  <button key={h} type="button"
                    className={`rounded-full border px-2 py-1 text-[11px] font-medium ${alturaTxt === h ? "border-teal-500 bg-teal-50 text-teal-700" : "border-slate-200 bg-white text-gray-500 hover:bg-slate-50"}`}
                    onClick={() => { setAlturaTxt(h); setAreaManual(null); }}>
                    {h}
                  </button>
                ))}
              </div>
            </div>

            {/* Resultado */}
            <div className={`rounded-md border px-3 py-2.5 text-xs ${alturaOk ? "bg-teal-50/60 border-teal-200 text-teal-900" : "bg-slate-50 border-slate-200 text-gray-400"}`}>
              {alturaOk ? (
                <div className="space-y-1.5">
                  <div className="tabular-nums">
                    {brNum(perimetro)} m{descontoPortas > 0 ? <> − {brNum(descontoPortas)} m (portas)</> : null} = {brNum(perimetroLiq)} m × {brNum(altura)} m
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">Área do rodapé (m²) — ajuste se precisar:</span>
                    <Input inputMode="decimal" className="h-8 w-28 text-right font-bold bg-white"
                      value={areaFinalTxt}
                      onChange={(e) => setAreaManual(e.target.value)} />
                  </div>
                  {areaManual != null && Math.abs((isFinite(areaFinal) ? areaFinal : 0) - areaSugerida) > 0.005 && (
                    <button type="button" className="text-[10px] underline text-teal-700"
                      onClick={() => setAreaManual(null)}>
                      Voltar à sugestão ({brNum(areaSugerida)} m²)
                    </button>
                  )}
                </div>
              ) : (
                <>Informe a altura do rodapé para calcular a área sugerida.</>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button size="sm" variant="outline" disabled={saving} onClick={onClose}>Cancelar</Button>
              <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white"
                disabled={saving || travado || !alturaOk || !areaOk}
                onClick={() => onAplicar(+areaFinal.toFixed(4), memoria)}>
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
                Gravar {areaOk ? `${brNum(areaFinal)} m²` : ""}
              </Button>
            </div>
            {travado && <p className="text-[11px] text-amber-600">Levantamento consolidado — só leitura.</p>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
