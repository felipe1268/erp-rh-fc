import { useState, useRef, useCallback } from "react";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader,
  AlertDialogTitle, AlertDialogDescription, AlertDialogFooter,
  AlertDialogAction, AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { AlertTriangle, HelpCircle, Sparkles, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type ConfirmTone = "default" | "destructive" | "warning" | "info";

export type ConfirmOptions = {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  tone?: ConfirmTone;
};

const TONE = {
  destructive: {
    icon: Trash2,
    bg: "bg-red-100",
    fg: "text-red-600",
    btn: "bg-red-600 hover:bg-red-700 text-white border-transparent",
  },
  warning: {
    icon: AlertTriangle,
    bg: "bg-amber-100",
    fg: "text-amber-700",
    btn: "bg-amber-600 hover:bg-amber-700 text-white border-transparent",
  },
  info: {
    icon: Sparkles,
    bg: "bg-blue-100",
    fg: "text-blue-700",
    btn: "bg-blue-600 hover:bg-blue-700 text-white border-transparent",
  },
  default: {
    icon: HelpCircle,
    bg: "bg-slate-100",
    fg: "text-slate-700",
    btn: "bg-slate-900 hover:bg-slate-800 text-white border-transparent",
  },
} as const;

export function useConfirm() {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<ConfirmOptions>({ title: "" });
  const resolverRef = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setOpts(options);
      setOpen(true);
    });
  }, []);

  const handle = (val: boolean) => {
    setOpen(false);
    const r = resolverRef.current;
    resolverRef.current = null;
    if (r) r(val);
  };

  const tone = TONE[opts.tone ?? "default"];
  const Icon = tone.icon;

  const ConfirmDialog = (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) handle(false); }}>
      <AlertDialogContent className="max-w-md p-0 gap-0 overflow-hidden">
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-start gap-4">
            <div className={cn("shrink-0 w-11 h-11 rounded-full flex items-center justify-center", tone.bg)}>
              <Icon className={cn("w-5 h-5", tone.fg)} />
            </div>
            <div className="min-w-0 flex-1">
              <AlertDialogHeader className="space-y-1.5">
                <AlertDialogTitle className="text-base font-bold text-slate-900 leading-tight">
                  {opts.title}
                </AlertDialogTitle>
                {opts.description && (
                  <AlertDialogDescription className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
                    {opts.description}
                  </AlertDialogDescription>
                )}
              </AlertDialogHeader>
            </div>
          </div>
        </div>
        <AlertDialogFooter className="px-6 py-3 bg-slate-50 border-t border-slate-200">
          <AlertDialogCancel onClick={() => handle(false)} className="border-slate-300">
            {opts.cancelText ?? "Cancelar"}
          </AlertDialogCancel>
          <AlertDialogAction onClick={() => handle(true)} className={tone.btn}>
            {opts.confirmText ?? "Confirmar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { confirm, ConfirmDialog };
}
