import { useState, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { useCompany } from "@/contexts/CompanyContext";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  Upload, FileSpreadsheet, X, AlertCircle,
  CheckCircle, Loader2, Calculator,
} from "lucide-react";
import { toast } from "sonner";

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1];
      res(base64);
    };
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });
}

export default function OrcamentoImportar() {
  const { user } = useAuth();
  const { selectedCompanyId: selCompId } = useCompany();
  const companyId = selCompId ? parseInt(selCompId) : undefined;
  const [, navigate] = useLocation();

  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [metaPerc, setMetaPerc] = useState(20);
  const [isUploading, setIsUploading] = useState(false);
  const [resultado, setResultado] = useState<any>(null);
  const [erro, setErro] = useState<string | null>(null);

  const importarMutation = trpc.orcamento.importar.useMutation({
    onSuccess: (data) => {
      setResultado(data);
      setIsUploading(false);
      toast.success("Planilha importada com sucesso!");
    },
    onError: (e) => {
      setErro(e.message);
      setIsUploading(false);
      toast.error(e.message || "Erro na importação");
    },
  });

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped && (dropped.name.endsWith(".xlsx") || dropped.name.endsWith(".xls"))) {
      setFile(dropped);
      setErro(null);
    } else {
      toast.error("Formato inválido. Envie um arquivo .xlsx ou .xls");
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) { setFile(f); setErro(null); }
  };

  const handleImportar = async () => {
    if (!file || !companyId) return;
    setIsUploading(true);
    setErro(null);
    try {
      const base64 = await fileToBase64(file);
      await importarMutation.mutateAsync({
        companyId,
        fileBase64: base64,
        fileName: file.name,
        metaPercentual: metaPerc / 100,
        userName: (user as any)?.name || (user as any)?.email || "Sistema",
      });
    } catch {
      setIsUploading(false);
    }
  };

  if (resultado) {
    return (
      <DashboardLayout>
        <div className="max-w-xl mx-auto space-y-6 pt-6 p-4">
          <Card className="border-emerald-700 bg-zinc-900">
            <CardContent className="pt-8 pb-8 text-center space-y-4">
              <div className="flex justify-center">
                <div className="p-4 rounded-full bg-emerald-500/20">
                  <CheckCircle className="h-10 w-10 text-emerald-400" />
                </div>
              </div>
              <h2 className="text-xl font-bold text-white">Importação concluída!</h2>
              <p className="text-zinc-400 text-sm">
                <span className="text-white font-medium">{resultado.itemCount}</span> itens importados com sucesso.
              </p>
              <div className="grid grid-cols-3 gap-3 mt-2">
                <div className="rounded-lg bg-zinc-800 p-3">
                  <p className="text-xs text-zinc-500">Venda</p>
                  <p className="text-sm font-bold text-emerald-400">{formatBRL(resultado.totalVenda)}</p>
                </div>
                <div className="rounded-lg bg-zinc-800 p-3">
                  <p className="text-xs text-zinc-500">Custo</p>
                  <p className="text-sm font-bold text-amber-400">{formatBRL(resultado.totalCusto)}</p>
                </div>
                <div className="rounded-lg bg-zinc-800 p-3">
                  <p className="text-xs text-zinc-500">Meta</p>
                  <p className="text-sm font-bold text-purple-400">{formatBRL(resultado.totalMeta)}</p>
                </div>
              </div>
              <div className="flex gap-2 justify-center mt-4">
                <Button
                  variant="outline"
                  onClick={() => { setResultado(null); setFile(null); }}
                  className="border-zinc-700"
                >
                  Importar outro
                </Button>
                <Button
                  className="bg-cyan-600 hover:bg-cyan-700"
                  onClick={() => navigate(`/orcamento/${resultado.id}`)}
                >
                  Ver Orçamento <Calculator className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto space-y-6 pt-4 p-4">

        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Upload className="h-6 w-6 text-cyan-400" />
            Importar Planilha Excel
          </h1>
          <p className="text-zinc-400 mt-1">
            A planilha deve ter as abas <span className="text-cyan-300 font-mono">Orçamento</span> e{" "}
            <span className="text-cyan-300 font-mono">BDI</span>.
          </p>
        </div>

        {/* Zona de Upload */}
        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-zinc-300">Arquivo Excel</CardTitle>
          </CardHeader>
          <CardContent>
            {!file ? (
              <div
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                className={`
                  border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors
                  ${dragging ? "border-cyan-500 bg-cyan-500/10" : "border-zinc-700 hover:border-zinc-500"}
                `}
                onClick={() => document.getElementById("file-input")?.click()}
              >
                <FileSpreadsheet className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
                <p className="text-zinc-400 text-sm">
                  Arraste o arquivo aqui ou{" "}
                  <span className="text-cyan-400 underline cursor-pointer">clique para selecionar</span>
                </p>
                <p className="text-zinc-600 text-xs mt-1">Formatos: .xlsx, .xls</p>
                <input
                  id="file-input"
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>
            ) : (
              <div className="flex items-center gap-3 p-4 rounded-lg bg-zinc-800 border border-zinc-700">
                <FileSpreadsheet className="h-8 w-8 text-emerald-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{file.name}</p>
                  <p className="text-xs text-zinc-500">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0 text-zinc-500 hover:text-red-400"
                  onClick={() => setFile(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Meta % */}
        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-zinc-300">
              Percentual de Meta (desconto sobre custo)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <Slider
                  min={1}
                  max={50}
                  step={1}
                  value={[metaPerc]}
                  onValueChange={([v]) => setMetaPerc(v)}
                  className="w-full"
                />
              </div>
              <div className="w-20 shrink-0">
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={metaPerc}
                  onChange={e => setMetaPerc(Math.min(50, Math.max(1, Number(e.target.value))))}
                  className="text-center bg-zinc-800 border-zinc-700 text-white font-bold"
                />
              </div>
              <span className="text-zinc-400 text-sm shrink-0">%</span>
            </div>
            <p className="text-xs text-zinc-500">
              O preço Meta = Custo × (1 − {metaPerc}%). Padrão: 20%. Pode ser alterado depois por admin_master.
            </p>
          </CardContent>
        </Card>

        {/* Erro */}
        {erro && (
          <div className="flex items-start gap-3 p-4 rounded-lg bg-red-950 border border-red-800">
            <AlertCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
            <p className="text-sm text-red-300">{erro}</p>
          </div>
        )}

        {/* Botão importar */}
        <div className="flex justify-end">
          <Button
            onClick={handleImportar}
            disabled={!file || isUploading || !companyId}
            className="bg-cyan-600 hover:bg-cyan-700 gap-2 min-w-[160px]"
          >
            {isUploading ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Processando...</>
            ) : (
              <><Upload className="h-4 w-4" /> Importar Orçamento</>
            )}
          </Button>
        </div>

        {/* Instruções */}
        <Card className="border-zinc-800 bg-zinc-900/40">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-zinc-500 font-semibold uppercase tracking-wide mb-2">Estrutura esperada da planilha</p>
            <ul className="space-y-1 text-xs text-zinc-500">
              <li>• Aba <span className="text-zinc-300">Orçamento</span>: colunas 9=nível, 10=item EAP, 14=tipo, 15=descrição, 16=unidade, 17=qtd</li>
              <li>• Colunas de custo: 18=custo mat. unit., 20=custo MO unit., 24=total venda, 30=total mat., 31=total MO, 32=total custo</li>
              <li>• Aba <span className="text-zinc-300">BDI</span>: linhas com código (col 2), descrição (col 3) e percentual (col 7) — linha B-02 = %BDI total</li>
              <li>• Aba <span className="text-zinc-300">Insumos</span> (opcional): gera curva ABC automaticamente</li>
            </ul>
          </CardContent>
        </Card>

      </div>
    </DashboardLayout>
  );
}
