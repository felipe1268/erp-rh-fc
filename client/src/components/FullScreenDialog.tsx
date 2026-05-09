import { Button } from "@/components/ui/button";
import { ArrowLeft, X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

interface FullScreenDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  headerColor?: string;
  headerStyle?: React.CSSProperties;
  children: ReactNode;
  footer?: ReactNode;
  headerActions?: ReactNode;
  zIndex?: number;
}

// ───── Stack global de FullScreenDialogs (scroll-lock + Escape no topo) ─────
const FSD_STACK: Array<() => void> = [];
let FSD_LOCK_COUNT = 0;
let FSD_PREV_OVERFLOW: string | null = null;

function pushScrollLock() {
  if (FSD_LOCK_COUNT === 0 && typeof document !== "undefined") {
    FSD_PREV_OVERFLOW = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  FSD_LOCK_COUNT++;
}
function popScrollLock() {
  FSD_LOCK_COUNT = Math.max(0, FSD_LOCK_COUNT - 1);
  if (FSD_LOCK_COUNT === 0 && typeof document !== "undefined") {
    document.body.style.overflow = FSD_PREV_OVERFLOW ?? "";
    FSD_PREV_OVERFLOW = null;
  }
}

export default function FullScreenDialog({
  open,
  onClose,
  zIndex,
  title,
  subtitle,
  icon,
  headerColor = "bg-gradient-to-r from-[#1B2A4A] to-[#2d4a7a]",
  headerStyle,
  children,
  footer,
  headerActions,
}: FullScreenDialogProps) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const closerRef = useRef<() => void>(() => onCloseRef.current());

  // Scroll-lock contado + registro no stack para Escape só fechar o topo
  useEffect(() => {
    if (!open) return;
    pushScrollLock();
    const closer = closerRef.current;
    FSD_STACK.push(closer);
    return () => {
      const idx = FSD_STACK.lastIndexOf(closer);
      if (idx >= 0) FSD_STACK.splice(idx, 1);
      popScrollLock();
    };
  }, [open]);

  // ESC global: só fecha o dialog do topo (último a abrir)
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const top = FSD_STACK[FSD_STACK.length - 1];
      if (top === closerRef.current) {
        e.stopPropagation();
        onCloseRef.current();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-background flex flex-col" style={{ width: "100vw", height: "100dvh", zIndex: zIndex ?? 50 }}>
      {/* HEADER */}
      <div className={`shrink-0 ${headerStyle ? '' : headerColor} text-white px-4 sm:px-6 py-3 flex items-center justify-between shadow-lg`} style={headerStyle}>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onClose} className="text-white hover:bg-white/20 h-9 w-9 shrink-0" title="Voltar">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          {icon && <div className="bg-white/20 p-2 rounded-lg">{icon}</div>}
          <div>
            <h1 className="text-lg sm:text-xl font-bold tracking-tight">{title}</h1>
            {subtitle && <p className="text-sm text-white/80">{subtitle}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {headerActions}
          <Button variant="ghost" size="sm" onClick={onClose} className="text-white hover:bg-white/20 gap-1.5 border border-white/30">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Button>
        </div>
      </div>

      {/* CONTENT */}
      <div className="flex-1 overflow-y-auto bg-gray-50/50">
        <div className="max-w-7xl mx-auto p-3 sm:p-4 lg:p-6">
          {children}
        </div>
      </div>

      {/* FOOTER (optional) */}
      {footer && (
        <div
          className="shrink-0 border-t bg-white px-4 sm:px-6 py-3 flex items-center justify-end gap-3 flex-wrap"
          style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
        >
          {footer}
        </div>
      )}
    </div>
  );
}
