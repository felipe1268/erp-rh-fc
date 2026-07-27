import { useEffect, useState, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { User, X, ZoomIn } from "lucide-react";

/**
 * <PersonPhoto> — Rev. 2297
 *
 * Componente único e reutilizável para mostrar foto de pessoa em QUALQUER
 * tela do ERP. Pedido user (23/05/2026): "todo lugar que tiver foto de
 * pessoas, quero poder clicar e ela ser ampliada para saber quem é quem".
 *
 * - Click abre lightbox em overlay (fixed inset-0 com backdrop blur).
 * - ESC fecha. Click no backdrop fecha.
 * - Fallback automático: iniciais do nome em fundo azul-FC quando sem foto.
 * - Em pessoa sem foto OU quando explicitamente `clickable={false}`, o
 *   click é desativado e o cursor volta a default.
 * - Tamanhos pré-definidos (sm/md/lg/xl) ou className customizado.
 */

export type PersonPhotoSize = "xs" | "sm" | "md" | "lg" | "xl";

const SIZE_PRESET: Record<PersonPhotoSize, string> = {
  xs: "h-7 w-7 text-[10px]",
  sm: "h-9 w-9 text-xs",
  md: "h-11 w-11 text-sm",
  lg: "h-14 w-14 text-base",
  xl: "h-20 w-20 text-lg",
};

interface PersonPhotoProps {
  src?: string | null;
  alt: string;
  size?: PersonPhotoSize;
  className?: string;
  /** Desativa o lightbox (útil em listas muito densas ou em prints). */
  clickable?: boolean;
  /** Texto extra abaixo do nome no lightbox (ex.: CPF, função). */
  caption?: string;
  /** Mostra um pequeno ícone de zoom no canto. Default: true quando há foto. */
  showZoomHint?: boolean;
}

function getInitials(name: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function PersonPhoto({
  src,
  alt,
  size = "md",
  className,
  clickable = true,
  caption,
  showZoomHint = true,
}: PersonPhotoProps) {
  const [open, setOpen] = useState(false);
  const [imgError, setImgError] = useState(false);

  const hasPhoto = !!src && !imgError;
  const canOpen = clickable && hasPhoto;
  const sizeCls = className ?? SIZE_PRESET[size];
  const initials = useMemo(() => getInitials(alt), [alt]);

  // Rev. 4639 — avatar usa miniatura ?w=128 (fotos de cadastro são originais
  // de câmera, até 5.7MB; grades de avatares quebram no Safari/iPad). O
  // lightbox ampliado continua usando o original (qualidade).
  const thumbSrc = useMemo(() => {
    if (!src) return src;
    return src.startsWith("/uploads/") && !src.includes("?") ? `${src}?w=128` : src;
  }, [src]);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, close]);

  const Wrapper = canOpen ? "button" : "div";

  return (
    <>
      <Wrapper
        type={canOpen ? "button" : undefined}
        onClick={canOpen ? (e: any) => { e.stopPropagation(); setOpen(true); } : undefined}
        title={canOpen ? `Ampliar foto de ${alt}` : alt}
        aria-label={canOpen ? `Ampliar foto de ${alt}` : alt}
        className={`relative inline-flex items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-white font-semibold shrink-0 ring-1 ring-black/5 ${sizeCls} ${canOpen ? "cursor-zoom-in hover:ring-2 hover:ring-blue-400 transition-all group" : ""}`}
      >
        {hasPhoto ? (
          <img
            src={thumbSrc as string}
            alt={alt}
            loading="lazy"
            className="h-full w-full object-cover object-top"
            onError={() => setImgError(true)}
            draggable={false}
          />
        ) : src && !imgError ? null : (
          <span className="select-none">{initials || <User className="h-1/2 w-1/2 opacity-80" />}</span>
        )}
        {canOpen && showZoomHint && (
          <span className="absolute bottom-0 right-0 hidden group-hover:flex items-center justify-center h-4 w-4 rounded-tl-md bg-blue-600 text-white">
            <ZoomIn className="h-2.5 w-2.5" />
          </span>
        )}
      </Wrapper>

      {open && hasPhoto && createPortal(
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-in fade-in duration-150"
          onClick={close}
          role="dialog"
          aria-modal="true"
          aria-label={`Foto ampliada de ${alt}`}
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); close(); }}
            className="absolute top-4 right-4 h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>

          <figure
            className="flex flex-col items-center gap-3 max-w-[96vw] max-h-[96dvh]"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={src as string}
              alt={alt}
              className="rounded-xl shadow-2xl object-contain bg-white"
              style={{
                maxHeight: "calc(96dvh - 96px)",
                maxWidth: "96vw",
                width: "auto",
                height: "auto",
                imageOrientation: "from-image",
              }}
              draggable={false}
            />
            <figcaption className="text-center text-white">
              <div className="text-base font-semibold">{alt}</div>
              {caption && <div className="text-sm text-white/70 mt-0.5">{caption}</div>}
            </figcaption>
          </figure>
        </div>,
        document.body
      )}
    </>
  );
}

export default PersonPhoto;
