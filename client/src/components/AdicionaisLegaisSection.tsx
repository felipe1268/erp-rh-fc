/**
 * Adicionais Legais (Insalubridade / Periculosidade) — aba Profissional do colaborador.
 *
 * Vigência com histórico preservado: ativar cria uma linha nova; desativar só
 * fecha a data fim. Reativar depois cria outro período. A folha calcula
 * automaticamente na competência: insalubridade = % × salário mínimo vigente;
 * periculosidade = 30% × salário base (pró-rata pelos dias de vigência no mês).
 * CLT art. 193 §2º: não acumula os dois — o servidor bloqueia.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, ShieldAlert, Flame, Power, History } from "lucide-react";
import { cn } from "@/lib/utils";

const fmtDataBR = (d?: string | null) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "—");
const hojeISO = () => new Date().toISOString().slice(0, 10);

const TIPOS = [
  {
    key: "insalubridade" as const,
    label: "Ad. de Insalubridade",
    Icon: ShieldAlert,
    cor: "amber",
    baseHint: "% sobre o salário mínimo vigente",
    percentuais: [10, 20, 40],
  },
  {
    key: "periculosidade" as const,
    label: "Ad. de Periculosidade",
    Icon: Flame,
    cor: "red",
    baseHint: "30% sobre o salário base",
    percentuais: [30],
  },
];

export default function AdicionaisLegaisSection({ employeeId }: { employeeId: number | null }) {
  const utils = trpc.useUtils();
  const { data: adicionais = [], isLoading } = trpc.adicionaisLegais.list.useQuery(
    { employeeId: employeeId || 0 },
    { enabled: !!employeeId },
  );

  const [ativarDialog, setAtivarDialog] = useState<null | { tipo: "insalubridade" | "periculosidade" }>(null);
  const [formPct, setFormPct] = useState<number>(10);
  const [formInicio, setFormInicio] = useState(hojeISO());
  const [desativarDialog, setDesativarDialog] = useState<any | null>(null);
  const [formFim, setFormFim] = useState(hojeISO());

  const invalidate = () => employeeId && utils.adicionaisLegais.list.invalidate({ employeeId });

  const ativarMut = trpc.adicionaisLegais.ativar.useMutation({
    onSuccess: () => { toast.success("Adicional ativado — entra na folha da competência da vigência"); invalidate(); setAtivarDialog(null); },
    onError: (e) => toast.error(e.message || "Erro ao ativar adicional"),
  });
  const desativarMut = trpc.adicionaisLegais.desativar.useMutation({
    onSuccess: () => { toast.success("Adicional desativado — histórico preservado"); invalidate(); setDesativarDialog(null); },
    onError: (e) => toast.error(e.message || "Erro ao desativar"),
  });

  if (!employeeId) {
    return (
      <div className="rounded-xl border border-dashed p-4 text-xs text-muted-foreground">
        Salve o colaborador primeiro para configurar Adicionais Legais (Insalubridade / Periculosidade).
      </div>
    );
  }

  const porTipo = (tipo: string) => (adicionais as any[]).filter((a) => a.tipo === tipo);
  const vigente = (tipo: string) => porTipo(tipo).find((a) => !a.dataFim);

  return (
    <div className="rounded-xl border overflow-hidden shadow-sm">
      <div className="bg-gradient-to-r from-amber-600 to-orange-600 px-4 py-2.5 flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 text-white/80" />
        <span className="text-sm font-semibold text-white">Adicionais Legais</span>
        <span className="ml-auto text-[10px] text-white/80">Insalubridade × salário mínimo • Periculosidade × salário base</span>
      </div>
      <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
        {isLoading ? (
          <div className="col-span-full flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Carregando...</div>
        ) : TIPOS.map((t) => {
          const ativo = vigente(t.key);
          const historico = porTipo(t.key).filter((a) => a.dataFim);
          return (
            <div key={t.key} className={cn("rounded-lg border p-3", ativo ? (t.cor === "amber" ? "border-amber-300 bg-amber-50/60" : "border-red-300 bg-red-50/60") : "bg-slate-50/50")}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <t.Icon className={cn("h-4 w-4", t.cor === "amber" ? "text-amber-600" : "text-red-600")} />
                  <div>
                    <p className="text-sm font-semibold">{t.label}</p>
                    <p className="text-[10px] text-muted-foreground">{t.baseHint}</p>
                  </div>
                </div>
                {ativo ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">ATIVO {ativo.percentual}%</span>
                ) : (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">INATIVO</span>
                )}
              </div>

              {ativo ? (
                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="text-[11px] text-muted-foreground">Vigente desde <b>{fmtDataBR(ativo.dataInicio)}</b>{ativo.registradoPor ? ` • por ${ativo.registradoPor}` : ""}</p>
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1 border-red-300 text-red-700 hover:bg-red-50"
                    onClick={() => { setDesativarDialog(ativo); setFormFim(hojeISO()); }}>
                    <Power className="h-3 w-3" />Desativar
                  </Button>
                </div>
              ) : (
                <div className="mt-2 flex justify-end">
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1 border-green-300 text-green-700 hover:bg-green-50"
                    onClick={() => { setAtivarDialog({ tipo: t.key }); setFormPct(t.percentuais[0]); setFormInicio(hojeISO()); }}>
                    <Power className="h-3 w-3" />Ativar
                  </Button>
                </div>
              )}

              {historico.length > 0 && (
                <div className="mt-2 border-t pt-2">
                  <p className="text-[10px] font-semibold text-muted-foreground flex items-center gap-1 mb-1"><History className="h-3 w-3" />Períodos anteriores</p>
                  <div className="space-y-0.5">
                    {historico.map((h: any) => (
                      <p key={h.id} className="text-[11px] text-muted-foreground">
                        {fmtDataBR(h.dataInicio)} → {fmtDataBR(h.dataFim)} • {h.percentual}%{h.registradoPor ? ` • ${h.registradoPor}` : ""}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Dialog Ativar */}
      <Dialog open={!!ativarDialog} onOpenChange={(o) => { if (!o) setAtivarDialog(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ativar {ativarDialog?.tipo === "periculosidade" ? "Ad. de Periculosidade" : "Ad. de Insalubridade"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs font-semibold">Percentual</Label>
              <div className="flex gap-1.5 mt-1">
                {(ativarDialog?.tipo === "periculosidade" ? [30] : [10, 20, 40]).map((p) => (
                  <button key={p} onClick={() => setFormPct(p)}
                    className={cn("flex-1 rounded-lg border px-2 py-2 text-sm font-bold", formPct === p ? "border-amber-400 bg-amber-50 text-amber-800" : "hover:bg-slate-50")}>
                    {p}%
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                {ativarDialog?.tipo === "periculosidade" ? "Fixo por lei: 30% sobre o salário base." : "Sobre o salário mínimo vigente (grau mínimo 10%, médio 20%, máximo 40%)."}
              </p>
            </div>
            <div>
              <Label className="text-xs font-semibold">Início da vigência</Label>
              <Input type="date" value={formInicio} onChange={(e) => setFormInicio(e.target.value)} className="mt-1" />
              <p className="text-[11px] text-muted-foreground mt-1">Entra na folha a partir desta data (pró-rata no mês).</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAtivarDialog(null)} disabled={ativarMut.isPending}>Cancelar</Button>
            <Button disabled={ativarMut.isPending || !formInicio}
              onClick={() => ativarDialog && ativarMut.mutate({ employeeId, tipo: ativarDialog.tipo, percentual: formPct, dataInicio: formInicio })}>
              {ativarMut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}Ativar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Desativar */}
      <Dialog open={!!desativarDialog} onOpenChange={(o) => { if (!o) setDesativarDialog(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Desativar adicional</DialogTitle>
          </DialogHeader>
          {desativarDialog && (
            <div className="space-y-3">
              <p className="text-sm break-words">
                {desativarDialog.tipo === "periculosidade" ? "Ad. de Periculosidade" : "Ad. de Insalubridade"} ({desativarDialog.percentual}%), vigente desde <b>{fmtDataBR(desativarDialog.dataInicio)}</b>. O período fica registrado no histórico e pode ser reativado depois.
              </p>
              <div>
                <Label className="text-xs font-semibold">Fim da vigência</Label>
                <Input type="date" value={formFim} min={String(desativarDialog.dataInicio).slice(0, 10)} onChange={(e) => setFormFim(e.target.value)} className="mt-1" />
                <p className="text-[11px] text-muted-foreground mt-1">A folha paga pró-rata até esta data.</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDesativarDialog(null)} disabled={desativarMut.isPending}>Cancelar</Button>
            <Button variant="destructive" disabled={desativarMut.isPending || !formFim}
              onClick={() => desativarMut.mutate({ id: desativarDialog.id, dataFim: formFim })}>
              {desativarMut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}Desativar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
