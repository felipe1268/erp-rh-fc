import { Button } from "@/components/ui/button";
import { Printer, FileDown, Download } from "lucide-react";
import { toast } from "sonner";

interface PrintActionsProps {
  /** Título do documento para o PDF */
  title?: string;
  /** Mostrar botão de Excel */
  showExcel?: boolean;
  /** Callback para exportar Excel */
  onExportExcel?: () => void;
  /** Classes extras */
  className?: string;
}

/**
 * Componente reutilizável de ações de impressão/exportação.
 * REGRA DE OURO: deve estar presente em TODAS as telas do sistema.
 */
export default function PrintActions({ title, showExcel, onExportExcel, className = "" }: PrintActionsProps) {

  const handlePrint = () => {
    window.print();
  };

  const handlePDF = async () => {
    toast.info("Gerando PDF... A janela de impressão será aberta. Selecione 'Salvar como PDF'.", { duration: 5000 });
    // Pequeno delay para o toast aparecer antes do print dialog
    setTimeout(() => {
      window.print();
    }, 500);
  };

  return (
    <div className={`flex items-center gap-2 print-hidden ${className}`}>
      <Button variant="outline" size="sm" className="text-xs h-8" onClick={handlePrint}>
        <Printer className="h-3.5 w-3.5 mr-1" /> Imprimir
      </Button>
      <Button variant="outline" size="sm" className="text-xs h-8" onClick={handlePDF}>
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
