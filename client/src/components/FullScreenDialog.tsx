import { Button } from "@/components/ui/button";
import { ArrowLeft, X } from "lucide-react";
import { useEffect, type ReactNode } from "react";

interface FullScreenDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  headerColor?: string;
  children: ReactNode;
  footer?: ReactNode;
  headerActions?: ReactNode;
}

export default function FullScreenDialog({
  open,
  onClose,
  title,
  subtitle,
  icon,
  headerColor = "bg-gradient-to-r from-[#1B2A4A] to-[#2d4a7a]",
  children,
  footer,
  headerActions,
}: FullScreenDialogProps) {
  // Block body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [open]);

  // ESC to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col" style={{ width: "100vw", height: "100vh" }}>
      {/* HEADER */}
      <div className={`shrink-0 ${headerColor} text-white px-4 sm:px-6 py-3 flex items-center justify-between shadow-lg`}>
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
        <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
          {children}
        </div>
      </div>

      {/* FOOTER (optional) */}
      {footer && (
        <div className="shrink-0 border-t bg-white px-4 sm:px-6 py-3 flex items-center justify-end gap-3">
          {footer}
        </div>
      )}
    </div>
  );
}
