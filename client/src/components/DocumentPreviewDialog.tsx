import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Eye, Download, ExternalLink } from "lucide-react";

function extractPathname(urlOrName: string): string {
  try {
    return new URL(urlOrName).pathname;
  } catch {
    return urlOrName.split("?")[0];
  }
}

function isImage(urlOrName: string): boolean {
  return /\.(png|jpg|jpeg|gif|webp)$/i.test(extractPathname(urlOrName));
}

function isPdf(urlOrName: string): boolean {
  return /\.pdf$/i.test(extractPathname(urlOrName));
}

export function canPreviewFile(urlOrName: string): boolean {
  return isPdf(urlOrName) || isImage(urlOrName);
}

interface DocumentPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileUrl: string | null;
  fileName: string | null;
  title?: string;
}

export default function DocumentPreviewDialog({
  open,
  onOpenChange,
  fileUrl,
  fileName,
  title,
}: DocumentPreviewDialogProps) {
  if (!fileUrl || !fileName) return null;

  const showPdf = isPdf(fileUrl) || isPdf(fileName);
  const showImage = isImage(fileUrl) || isImage(fileName);

  const handleDownload = () => {
    const a = document.createElement("a");
    a.href = fileUrl;
    a.download = fileName || "arquivo";
    a.click();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent resizable={false} className="w-[98vw] max-w-[98vw] h-[95vh] bg-white border-gray-200 text-gray-900 overflow-hidden flex flex-col p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <div className="flex items-center gap-2 min-w-0">
            <Eye className="w-5 h-5 text-blue-600 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{title || fileName}</p>
              {title && <p className="text-[11px] text-gray-500">{fileName}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleDownload}>
              <Download className="w-3 h-3 mr-1" /> Baixar
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-hidden bg-gray-100">
          {showPdf && (
            <iframe
              src={fileUrl}
              className="w-full h-full min-h-[70vh]"
              title="Preview PDF"
            />
          )}
          {showImage && (
            <div className="flex items-center justify-center h-full min-h-[70vh] p-4">
              <img
                src={fileUrl}
                alt={title || fileName}
                className="max-w-full max-h-[80vh] object-contain rounded shadow-lg"
              />
            </div>
          )}
          {!showPdf && !showImage && (
            <div className="flex flex-col items-center justify-center h-full min-h-[70vh] gap-4 text-muted-foreground">
              <p className="text-sm">Não é possível visualizar este tipo de arquivo.</p>
              <Button variant="outline" size="sm" onClick={() => window.open(fileUrl, "_blank")}>
                <ExternalLink className="w-3 h-3 mr-1" /> Abrir em nova aba
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
