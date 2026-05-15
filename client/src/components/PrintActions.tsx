import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Printer, FileDown, Download, RectangleVertical, RectangleHorizontal } from "lucide-react";
import { toast } from "sonner";

type Orientation = "portrait" | "landscape";

interface PrintActionsProps {
  /** Título do documento para o PDF */
  title?: string;
  /** Mostrar botão de Excel */
  showExcel?: boolean;
  /** Callback para exportar Excel */
  onExportExcel?: () => void;
  /** Classes extras */
  className?: string;
  /** Orientação padrão (default: portrait) */
  defaultOrientation?: Orientation;
}

const STYLE_ID = "__print_orientation_runtime__";

/**
 * Injeta uma regra @page com a orientação escolhida ANTES de chamar window.print().
 * O <style> é appended no final do <head>, então sobrescreve o @page A4 default
 * definido em client/src/index.css. Tambem aplica o atributo data-print-orientation
 * no <body> para que regras CSS especificas (ex.: tamanho de fonte em paisagem)
 * possam reagir.
 *
 * Limpa tudo ao final via 'afterprint'. Tambem reforca regras anti-pagina-em-branco
 * via @page e @media print injetados (defesa em profundidade contra trailing blank).
 */
function applyOrientationAndPrint(orientation: Orientation) {
  if (typeof document === "undefined") return;

  const old = document.getElementById(STYLE_ID);
  if (old) old.remove();

  const margins =
    orientation === "landscape"
      ? "8mm 8mm 14mm 8mm"
      : "10mm 8mm 14mm 8mm";

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.setAttribute("media", "print");
  style.textContent = `
    @page { size: A4 ${orientation}; margin: ${margins}; }
    @page :first { margin-top: ${orientation === "landscape" ? "8mm" : "10mm"}; }

    /* R-012 reforço: matar pagina em branco trailing em definitivo */
    html, body { height: auto !important; min-height: 0 !important; max-height: none !important; overflow: visible !important; }
    html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body, body > *, #root, #root > *, main, [role="main"] {
      page-break-after: avoid !important;
      break-after: avoid-page !important;
    }
    /* Ultimo filho de qualquer container de conteudo nao gera quebra */
    .print-area > *:last-child,
    .print-area *:last-child:not(:empty),
    body > *:last-child,
    main > *:last-child,
    #root > *:last-child {
      margin-bottom: 0 !important;
      padding-bottom: 0 !important;
      page-break-after: avoid !important;
      break-after: avoid-page !important;
    }
    /* Containers vazios viram display:none p/ nao reservar pagina */
    div:empty, section:empty, article:empty, aside:empty { display: none !important; }
  `;
  document.head.appendChild(style);
  document.body.setAttribute("data-print-orientation", orientation);

  let fallbackTimer: number | undefined;
  const cleanup = () => {
    const s = document.getElementById(STYLE_ID);
    if (s) s.remove();
    document.body.removeAttribute("data-print-orientation");
    if (fallbackTimer !== undefined) {
      window.clearTimeout(fallbackTimer);
      fallbackTimer = undefined;
    }
  };
  window.addEventListener("afterprint", cleanup, { once: true });
  // Safety net: alguns browsers (Safari/Firefox em modos especificos) podem
  // nao disparar afterprint. Garantir que o <style> nao fique pendurado.
  fallbackTimer = window.setTimeout(cleanup, 60_000);

  setTimeout(() => window.print(), 60);
}

/**
 * Componente reutilizavel de acoes de impressao/exportacao.
 * REGRA DE OURO: deve estar presente em TODAS as telas do sistema.
 * Rev. 1843 — adiciona toggle Retrato/Paisagem e killer agressivo de pagina em branco.
 */
export default function PrintActions({
  title,
  showExcel,
  onExportExcel,
  className = "",
  defaultOrientation = "portrait",
}: PrintActionsProps) {
  const [orientation, setOrientation] = useState<Orientation>(defaultOrientation);

  useEffect(() => {
    return () => {
      const s = document.getElementById(STYLE_ID);
      if (s) s.remove();
      if (typeof document !== "undefined") {
        document.body.removeAttribute("data-print-orientation");
      }
    };
  }, []);

  const handlePrint = useCallback(() => {
    applyOrientationAndPrint(orientation);
  }, [orientation]);

  const handlePDF = useCallback(() => {
    toast.info(
      `Gerando PDF (${orientation === "landscape" ? "paisagem" : "retrato"})... Selecione 'Salvar como PDF' na janela.`,
      { duration: 4000 }
    );
    setTimeout(() => applyOrientationAndPrint(orientation), 350);
  }, [orientation]);

  return (
    <div className={`flex items-center gap-2 print-hidden ${className}`}>
      <ToggleGroup
        type="single"
        size="sm"
        variant="outline"
        value={orientation}
        onValueChange={(v) => v && setOrientation(v as Orientation)}
        className="h-8"
        aria-label="Orientação da página"
      >
        <ToggleGroupItem
          value="portrait"
          aria-label="Retrato"
          title="Retrato (A4)"
          className="text-xs h-8 px-2"
        >
          <RectangleVertical className="h-3.5 w-3.5 mr-1" /> Retrato
        </ToggleGroupItem>
        <ToggleGroupItem
          value="landscape"
          aria-label="Paisagem"
          title="Paisagem (A4)"
          className="text-xs h-8 px-2"
        >
          <RectangleHorizontal className="h-3.5 w-3.5 mr-1" /> Paisagem
        </ToggleGroupItem>
      </ToggleGroup>
      <Button variant="outline" size="sm" className="text-xs h-8" onClick={handlePrint} title={title}>
        <Printer className="h-3.5 w-3.5 mr-1" /> Imprimir
      </Button>
      <Button variant="outline" size="sm" className="text-xs h-8" onClick={handlePDF} title={title}>
        <FileDown className="h-3.5 w-3.5 mr-1" /> PDF
      </Button>
      {showExcel && onExportExcel && (
        <Button
          variant="outline"
          size="sm"
          className="text-xs h-8 text-green-700 border-green-300 hover:bg-green-50"
          onClick={onExportExcel}
        >
          <Download className="h-3.5 w-3.5 mr-1" /> Excel
        </Button>
      )}
    </div>
  );
}
