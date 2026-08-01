/**
 * Rev. 4785 — Diálogos do ERP (substituem alert/confirm/prompt nativos).
 *
 * Problema: no iPad/Safari os diálogos nativos mostram o domínio técnico no
 * topo ("b41aedae….replit.dev diz"), o que assusta e polui a tela.
 *
 * Solução:
 * - appAlert / appConfirm / appPrompt: Promises com visual do ERP (shadcn).
 * - <AppDialogHost/> montado uma vez no root renderiza a fila.
 * - window.alert é SOBRESCRITO globalmente (retorno void → seguro): TODO alert
 *   do ERP já sai bonito sem mexer em cada tela.
 * - window.confirm/window.prompt NÃO são sobrescritos (são síncronos; trocar
 *   por Promise quebraria os chamadores). Telas migram chamando appConfirm /
 *   appPrompt com await.
 */
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Pending = {
  id: number;
  kind: "alert" | "confirm" | "prompt";
  title: string;
  message: string;
  defaultValue?: string;
  placeholder?: string;
  confirmText?: string;
  destructive?: boolean;
  resolve: (v: any) => void;
};

let seq = 1;
let queue: Pending[] = [];
let notify: (() => void) | null = null;

function push(p: Omit<Pending, "id">) {
  queue = [...queue, { ...p, id: seq++ }];
  notify?.();
}

export function appAlert(message: string, title = "Atenção"): Promise<void> {
  return new Promise((resolve) => push({ kind: "alert", title, message: String(message ?? ""), resolve }));
}

export function appConfirm(
  message: string,
  opts?: { title?: string; confirmText?: string; destructive?: boolean },
): Promise<boolean> {
  return new Promise((resolve) =>
    push({
      kind: "confirm",
      title: opts?.title ?? "Confirmação",
      message: String(message ?? ""),
      confirmText: opts?.confirmText ?? "Confirmar",
      destructive: opts?.destructive,
      resolve,
    }),
  );
}

export function appPrompt(
  message: string,
  defaultValue = "",
  opts?: { title?: string; placeholder?: string; confirmText?: string },
): Promise<string | null> {
  return new Promise((resolve) =>
    push({
      kind: "prompt",
      title: opts?.title ?? "Informe",
      message: String(message ?? ""),
      defaultValue,
      placeholder: opts?.placeholder,
      confirmText: opts?.confirmText ?? "OK",
      resolve,
    }),
  );
}

export function AppDialogHost() {
  const [, setTick] = useState(0);
  const [valor, setValor] = useState("");
  const atual = queue[0] ?? null;

  useEffect(() => {
    notify = () => setTick((t) => t + 1);
    // Sobrescreve o alert nativo do ERP inteiro (retorno void → seguro).
    const nativo = window.alert;
    window.alert = (m?: any) => { void appAlert(typeof m === "string" ? m : String(m ?? "")); };
    return () => {
      notify = null;
      window.alert = nativo;
      // Teardown: resolve pendências com "cancelado" p/ não deixar Promise órfã
      // (ex.: crash capturado pelo ErrorBoundary desmonta o host).
      const pendentes = queue; queue = [];
      for (const p of pendentes) p.resolve(p.kind === "confirm" ? false : p.kind === "prompt" ? null : undefined);
    };
  }, []);

  // Sincroniza o input do prompt quando o item da vez muda.
  useEffect(() => { setValor(atual?.kind === "prompt" ? (atual.defaultValue ?? "") : ""); }, [atual?.id]);

  if (!atual) return null;

  const fechar = (resultado: any) => {
    queue = queue.slice(1);
    setTick((t) => t + 1);
    atual.resolve(resultado);
  };
  const cancelValue = atual.kind === "confirm" ? false : atual.kind === "prompt" ? null : undefined;

  return (
    <Dialog open onOpenChange={(v) => { if (!v) fechar(cancelValue); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className={atual.destructive ? "text-red-700" : undefined}>{atual.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{atual.message}</p>
          {atual.kind === "prompt" && (
            <Input
              autoFocus
              value={valor}
              placeholder={atual.placeholder}
              onChange={(e) => setValor(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") fechar(valor); }}
            />
          )}
          <div className="flex gap-2 justify-end">
            {atual.kind !== "alert" && (
              <Button variant="outline" onClick={() => fechar(cancelValue)}>Cancelar</Button>
            )}
            <Button
              variant={atual.destructive ? "destructive" : "default"}
              onClick={() => fechar(atual.kind === "confirm" ? true : atual.kind === "prompt" ? valor : undefined)}
            >
              {atual.kind === "alert" ? "OK" : atual.confirmText}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
