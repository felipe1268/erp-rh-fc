import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  ShieldCheck, Trash2, UserPlus, Search, Crown, UserCheck, Loader2, Info,
} from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  obraId: number;
  obraNome: string;
};

export default function ModalAprovadoresEstoque({
  open, onOpenChange, obraId, obraNome,
}: Props) {
  const utils = trpc.useUtils();
  const [busca, setBusca] = useState("");
  const [removendoId, setRemovendoId] = useState<number | null>(null);

  const listQ = trpc.compras.responsaveisAuditoriaListar.useQuery(
    { obraId },
    { enabled: open && obraId > 0 },
  );
  const candidatosQ = trpc.compras.responsaveisAuditoriaCandidatos.useQuery(
    { obraId, busca },
    { enabled: open && obraId > 0, staleTime: 10_000 },
  );

  const addMut = trpc.compras.responsaveisAuditoriaAdicionar.useMutation({
    onSuccess: (r) => {
      toast.success(r.duplicado ? "Usuário já era aprovador" : "Aprovador adicionado");
      utils.compras.responsaveisAuditoriaListar.invalidate({ obraId });
      utils.compras.responsaveisAuditoriaCandidatos.invalidate({ obraId, busca });
      utils.compras.auditoriaPendenciasCount.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const remMut = trpc.compras.responsaveisAuditoriaRemover.useMutation({
    onSuccess: () => {
      toast.success("Aprovador removido");
      setRemovendoId(null);
      utils.compras.responsaveisAuditoriaListar.invalidate({ obraId });
      utils.compras.responsaveisAuditoriaCandidatos.invalidate({ obraId, busca });
      utils.compras.auditoriaPendenciasCount.invalidate();
    },
    onError: (e) => { setRemovendoId(null); toast.error(e.message); },
  });

  const aprovadores = listQ.data ?? [];
  const principal = aprovadores.find((a: any) => a.tipo === "principal");
  const delegados = aprovadores.filter((a: any) => a.tipo === "delegado");
  const candidatos = candidatosQ.data ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 gap-0 overflow-hidden max-w-2xl">
        <div
          className="px-6 py-4 flex items-center gap-3"
          style={{
            background: "linear-gradient(135deg, #1B2A4A 0%, #243456 100%)",
            printColorAdjust: "exact",
          }}
        >
          <div className="bg-white/10 p-2 rounded-lg">
            <ShieldCheck className="w-6 h-6 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <DialogHeader className="space-y-0">
              <DialogTitle className="text-white text-base font-semibold leading-tight truncate">
                Aprovadores de Auditoria do Estoque
              </DialogTitle>
              <p className="text-white/60 text-xs truncate">
                {obraNome}
              </p>
            </DialogHeader>
          </div>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-6 space-y-5">
          <div className="flex items-start gap-2 text-xs text-slate-600 bg-blue-50 border border-blue-200 rounded-lg p-3">
            <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-slate-700 mb-0.5">
                Quem pode aprovar exclusões e ajustes manuais de estoque desta obra?
              </p>
              <p>
                <strong>Principal</strong> (1 só) gerencia a lista de delegados.
                <strong className="ml-1">Delegados</strong> também aprovam, mas não podem gerenciar a lista.
                Admins sempre podem aprovar.
              </p>
            </div>
          </div>

          <div>
            <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">
              Aprovadores atuais
            </h4>
            {listQ.isLoading ? (
              <div className="text-center py-6 text-slate-400">
                <Loader2 className="w-5 h-5 animate-spin inline" />
              </div>
            ) : aprovadores.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm border-2 border-dashed border-slate-200 rounded-lg">
                Nenhum aprovador cadastrado. Só admins podem validar auditorias desta obra.
              </div>
            ) : (
              <div className="space-y-2">
                {principal && (
                  <AprovadorRow
                    a={principal}
                    onRemove={() => setRemovendoId(principal.id)}
                    removing={remMut.isPending && removendoId === principal.id}
                  />
                )}
                {delegados.map((a: any) => (
                  <AprovadorRow
                    key={a.id}
                    a={a}
                    onRemove={() => setRemovendoId(a.id)}
                    removing={remMut.isPending && removendoId === a.id}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="border-t pt-4">
            <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">
              Adicionar aprovador
            </h4>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por nome, e-mail ou usuário..."
                className="pl-9"
              />
            </div>
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {candidatosQ.isLoading ? (
                <div className="text-center py-4 text-slate-400">
                  <Loader2 className="w-4 h-4 animate-spin inline" />
                </div>
              ) : candidatos.length === 0 ? (
                <div className="text-center py-4 text-slate-400 text-sm">
                  {busca
                    ? "Nenhum usuário encontrado."
                    : "Todos os usuários da empresa já são aprovadores."}
                </div>
              ) : (
                candidatos.map((u: any) => (
                  <div
                    key={u.id}
                    className="flex items-center justify-between gap-3 p-2.5 hover:bg-slate-50 rounded-lg border border-slate-100"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800 truncate">
                        {u.name || u.email || `User#${u.id}`}
                      </p>
                      <p className="text-xs text-slate-500 truncate">
                        {u.email} {u.role && <span className="text-slate-400">· {u.role}</span>}
                      </p>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={addMut.isPending}
                        onClick={() => addMut.mutate({ obraId, userId: u.id, tipo: "delegado" })}
                      >
                        <UserPlus className="w-3.5 h-3.5 mr-1" /> Delegado
                      </Button>
                      {!principal && (
                        <Button
                          size="sm"
                          disabled={addMut.isPending}
                          className="bg-[#1B2A4A] hover:bg-[#243456]"
                          onClick={() => addMut.mutate({ obraId, userId: u.id, tipo: "principal" })}
                        >
                          <Crown className="w-3.5 h-3.5 mr-1" /> Principal
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="border-t bg-slate-50/60 px-6 py-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Confirmação de remoção */}
      <Dialog open={removendoId !== null} onOpenChange={(v) => !v && setRemovendoId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Remover aprovador?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            Este usuário não poderá mais aprovar/rejeitar auditorias do estoque desta obra.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRemovendoId(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={remMut.isPending}
              onClick={() => removendoId && remMut.mutate({ id: removendoId })}
            >
              {remMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Trash2 className="w-4 h-4 mr-1" />}
              Remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

function AprovadorRow({ a, onRemove, removing }: { a: any; onRemove: () => void; removing: boolean }) {
  const isPrincipal = a.tipo === "principal";
  return (
    <div
      className={`flex items-center justify-between gap-3 p-3 rounded-lg border ${
        isPrincipal ? "bg-amber-50 border-amber-200" : "bg-white border-slate-200"
      }`}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div
          className={`p-2 rounded-full shrink-0 ${
            isPrincipal ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"
          }`}
        >
          {isPrincipal ? <Crown className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-800 truncate">
            {a.userNome || `User#${a.userId}`}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <Badge
              variant="outline"
              className={
                isPrincipal
                  ? "border-amber-300 text-amber-800 bg-amber-100 text-[10px] px-1.5 py-0"
                  : "border-slate-300 text-slate-700 text-[10px] px-1.5 py-0"
              }
            >
              {isPrincipal ? "PRINCIPAL" : "DELEGADO"}
            </Badge>
            {a.criadoPorNome && (
              <span className="text-[11px] text-slate-400 truncate">
                adicionado por {a.criadoPorNome}
              </span>
            )}
          </div>
        </div>
      </div>
      <Button
        size="sm"
        variant="ghost"
        className="text-red-600 hover:text-red-700 hover:bg-red-50 shrink-0"
        disabled={removing}
        onClick={onRemove}
      >
        {removing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
      </Button>
    </div>
  );
}
