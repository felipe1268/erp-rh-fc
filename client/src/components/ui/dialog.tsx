import { cn } from "@/lib/utils";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Maximize2, Minimize2, XIcon } from "lucide-react";
import * as React from "react";

// Context to track composition state across dialog children
const DialogCompositionContext = React.createContext<{
  isComposing: () => boolean;
  setComposing: (composing: boolean) => void;
  justEndedComposing: () => boolean;
  markCompositionEnd: () => void;
}>({
  isComposing: () => false,
  setComposing: () => {},
  justEndedComposing: () => false,
  markCompositionEnd: () => {},
});

export const useDialogComposition = () =>
  React.useContext(DialogCompositionContext);

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  const composingRef = React.useRef(false);
  const justEndedRef = React.useRef(false);
  const endTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const contextValue = React.useMemo(
    () => ({
      isComposing: () => composingRef.current,
      setComposing: (composing: boolean) => {
        composingRef.current = composing;
      },
      justEndedComposing: () => justEndedRef.current,
      markCompositionEnd: () => {
        justEndedRef.current = true;
        if (endTimerRef.current) {
          clearTimeout(endTimerRef.current);
        }
        endTimerRef.current = setTimeout(() => {
          justEndedRef.current = false;
        }, 150);
      },
    }),
    []
  );

  return (
    <DialogCompositionContext.Provider value={contextValue}>
      <DialogPrimitive.Root data-slot="dialog" {...props} />
    </DialogCompositionContext.Provider>
  );
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return (
    <DialogPrimitive.Portal
      data-slot="dialog-portal"
      container={typeof document !== 'undefined' ? document.getElementById('radix-portal') ?? undefined : undefined}
      {...props}
    />
  );
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50",
        className
      )}
      {...props}
    />
  );
}

DialogOverlay.displayName = "DialogOverlay";

// Hook for resizable dialog width
function useResizableWidth(initialWidth: number, minWidth = 320, maxWidth = 1600) {
  const [width, setWidth] = React.useState(initialWidth);
  const isDragging = React.useRef<"left" | "right" | null>(null);
  const startX = React.useRef(0);
  const startWidth = React.useRef(0);

  const onMouseDown = React.useCallback(
    (side: "left" | "right") => (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      isDragging.current = side;
      startX.current = e.clientX;
      startWidth.current = width;

      const onMouseMove = (ev: MouseEvent) => {
        if (!isDragging.current) return;
        const dx = ev.clientX - startX.current;
        // Both sides move symmetrically (centered dialog)
        const delta = isDragging.current === "right" ? dx * 2 : -dx * 2;
        const newW = Math.min(maxWidth, Math.max(minWidth, startWidth.current + delta));
        setWidth(newW);
      };

      const onMouseUp = () => {
        isDragging.current = null;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [width, minWidth, maxWidth]
  );

  return { width, onMouseDown };
}

function useDraggable() {
  const [offset, setOffset] = React.useState({ x: 0, y: 0 });
  const isDragging = React.useRef(false);
  const startPos = React.useRef({ x: 0, y: 0 });
  const startOffset = React.useRef({ x: 0, y: 0 });

  const reset = React.useCallback(() => setOffset({ x: 0, y: 0 }), []);

  const onDragStart = React.useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button, input, textarea, select, a, [role="button"]')) return;
    e.preventDefault();
    isDragging.current = true;
    startPos.current = { x: e.clientX, y: e.clientY };
    startOffset.current = { ...offset };

    const onMove = (ev: MouseEvent) => {
      if (!isDragging.current) return;
      setOffset({
        x: startOffset.current.x + (ev.clientX - startPos.current.x),
        y: startOffset.current.y + (ev.clientY - startPos.current.y),
      });
    };
    const onUp = () => {
      isDragging.current = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
    };
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [offset]);

  return { offset, onDragStart, resetDrag: reset };
}

// Rev. 5127 — permite headers customizados renderizarem seu próprio botão de
// maximizar (evita o botão flutuante padrão sobrepor botões "Fechar" custom).
const DialogMaximizeContext = React.createContext<{
  maximized: boolean;
  toggle: () => void;
} | null>(null);

function DialogMaximizeButton({ className }: { className?: string }) {
  const ctx = React.useContext(DialogMaximizeContext);
  if (!ctx) return null;
  return (
    <button
      type="button"
      data-slot="dialog-maximize"
      onClick={ctx.toggle}
      aria-pressed={ctx.maximized}
      aria-label={ctx.maximized ? "Restaurar janela" : "Maximizar janela"}
      title={ctx.maximized ? "Restaurar janela" : "Maximizar janela"}
      className={className}
    >
      {ctx.maximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
      <span className="sr-only">{ctx.maximized ? "Restaurar janela" : "Maximizar janela"}</span>
    </button>
  );
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  onEscapeKeyDown,
  resizable = true,
  draggable = false,
  maximizable = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean;
  resizable?: boolean;
  draggable?: boolean;
  maximizable?: boolean;
}) {
  const { isComposing } = useDialogComposition();
  const { width, onMouseDown } = useResizableWidth(512);
  const { offset, onDragStart, resetDrag } = useDraggable();
  // Rev. 3237 — maximizar/restaurar a janela (vale p/ TODOS os diálogos shadcn do app).
  const [maximized, setMaximized] = React.useState(false);
  // Rev. 5127 — contexto p/ botão de maximizar customizado dentro de headers próprios
  // (evita o botão flutuante sobrepor botões de "Fechar" custom, ex.: detalhe da OC)
  const maximizeCtx = React.useMemo(
    () => ({ maximized, toggle: () => setMaximized((v) => !v) }),
    [maximized]
  );

  const handleEscapeKeyDown = React.useCallback(
    (e: KeyboardEvent) => {
      const isCurrentlyComposing = (e as any).isComposing || isComposing();
      if (isCurrentlyComposing) {
        e.preventDefault();
        return;
      }
      onEscapeKeyDown?.(e);
    },
    [isComposing, onEscapeKeyDown]
  );

  // Quando maximizado: ocupa quase a viewport inteira e ignora drag/resize manuais.
  const dragStyle = !maximized && draggable && (offset.x !== 0 || offset.y !== 0)
    ? { transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))` }
    : undefined;

  // Rev. 4661 — separa o style externo p/ merge controlado (senão o spread
  // de props sobrescreve sizeStyle e o maximizar "não faz nada")
  const { style: styleProp, ...restProps } = props as any;

  const sizeStyle = maximized
    ? {
        width: "calc(100vw - 1rem)",
        maxWidth: "calc(100vw - 1rem)",
        height: "calc(100dvh - 1rem)",
        maxHeight: "calc(100dvh - 1rem)",
      }
    : resizable
      ? { width: `min(${width}px, calc(100vw - 1rem))`, maxWidth: "calc(100vw - 1rem)" }
      : {};

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-4 sm:p-6 shadow-lg duration-200 max-h-[92dvh] overflow-y-auto overscroll-contain",
          draggable && !maximized && "cursor-grab active:cursor-grabbing",
          className
        )}
        style={maximized
          ? { ...styleProp, ...sizeStyle }
          : { ...sizeStyle, ...dragStyle, ...styleProp }}
        onEscapeKeyDown={handleEscapeKeyDown}
        onMouseDown={draggable && !maximized ? onDragStart : undefined}
        onAnimationEnd={draggable ? resetDrag : undefined}
        {...restProps}
      >
        <DialogMaximizeContext.Provider value={maximizeCtx}>
          {children}
        </DialogMaximizeContext.Provider>
        <div className="absolute top-4 right-4 flex items-center gap-1">
          {maximizable && (
            <button
              type="button"
              data-slot="dialog-maximize"
              onClick={() => setMaximized((v) => !v)}
              aria-pressed={maximized}
              aria-label={maximized ? "Restaurar janela" : "Maximizar janela"}
              title={maximized ? "Restaurar janela" : "Maximizar janela"}
              className="ring-offset-background focus:ring-ring rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
            >
              {maximized ? <Minimize2 /> : <Maximize2 />}
              <span className="sr-only">{maximized ? "Restaurar janela" : "Maximizar janela"}</span>
            </button>
          )}
          {showCloseButton && (
            <DialogPrimitive.Close
              data-slot="dialog-close"
              className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
            >
              <XIcon />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          )}
        </div>
        {/* Resize handles — ocultos quando maximizado */}
        {resizable && !maximized && (
          <>
            {/* Left edge handle */}
            <div
              onMouseDown={onMouseDown("left")}
              className="absolute top-0 left-0 w-2 h-full cursor-col-resize z-[60] group"
              style={{ transform: "translateX(-50%)" }}
            >
              <div className="absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 w-1 h-8 rounded-full bg-border opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            {/* Right edge handle */}
            <div
              onMouseDown={onMouseDown("right")}
              className="absolute top-0 right-0 w-2 h-full cursor-col-resize z-[60] group"
              style={{ transform: "translateX(50%)" }}
            >
              <div className="absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 w-1 h-8 rounded-full bg-border opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      {...props}
    />
  );
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    />
  );
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg leading-none font-semibold", className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogMaximizeButton,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger
};
