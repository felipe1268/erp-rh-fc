import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import FullScreenDialog from "@/components/FullScreenDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Brain, Scale, ArrowRight, AlertTriangle, CheckCircle2,
  Loader2, Landmark, FileText, ShieldAlert, Lightbulb, ArrowLeftRight
} from "lucide-react";
import { toast } from "sonner";

type Divergencia = {
  item: string;
  valorMatriz: string;
  valorLocal: string;
  maisVantajoso: string;
  impacto: string;
};

type ComparisonResult = {
  resumo: string;
  divergencias: Divergencia[];
  recomendacoes: string[];
  riscos: string[];
  matrizNome: string;
  localNome: string;
};

export default function ComparativoConvencoes() {
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery} = useCompany();
  const [, navigate] = useLocation();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId) : undefined;
  const companyIds = getCompanyIdsForQuery();
  const [open, setOpen] = useState(true);

  const handleClose = () => {
    setOpen(false);
    navigate("/convencoes-coletivas");
  };
  const [matrizId, setMatrizId] = useState<string>("");
  const [localId, setLocalId] = useState<string>("");
  const [result, setResult] = useState<ComparisonResult | null>(null);
  const [loading, setLoading] = useState(false);

  const { data: convencoes } = trpc.sprint1.convencao.listAll.useQuery(
    { companyId: companyId ?? 0 },
    { enabled: !!companyId }
  );

  const compararMut = trpc.sprint1.convencao.compararIA.useMutation();

  const matrizOptions = useMemo(() => {
    if (!convencoes) return [];
    return convencoes.filter((c: any) => c.isMatriz === 1);
  }, [convencoes]);

  const localOptions = useMemo(() => {
    if (!convencoes) return [];
    return convencoes.filter((c: any) => c.isMatriz !== 1 && String(c.id) !== matrizId);
  }, [convencoes, matrizId]);

  const handleComparar = async () => {
    if (!matrizId || !localId) {
      toast.error("Selecione as duas convenções para comparar.");
      return;
    }
    setLoading(true);
    try {
      const res = await compararMut.mutateAsync({
        convencaoMatrizId: parseInt(matrizId),
        convencaoLocalId: parseInt(localId),
      });
      setResult(res);
      toast.success("Comparativo gerado com sucesso!");
    } catch {
      toast.error("Erro ao gerar comparativo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <FullScreenDialog
      open={open}
      onClose={handleClose}
      title="Comparativo de Convenções com IA"
      icon={<Scale className="h-5 w-5 text-white" />}
      headerColor="bg-gradient-to-r from-indigo-700 to-blue-500"
    >
      <div className="w-full space-y-6 py-2">
        {/* Seleção */}
        <div className="bg-muted/30 rounded-lg border border-border p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <ArrowLeftRight className="h-4 w-4 text-indigo-600" />
            Selecione as Convenções para Comparar
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 items-end">
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Convenção Matriz</label>
              <Select value={matrizId || "none"} onValueChange={v => { setMatrizId(v === "none" ? "" : v); setResult(null); }}>
                <SelectTrigger className="bg-input"><SelectValue placeholder="Selecione a matriz" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Selecione</SelectItem>
                  {matrizOptions.map((c: any) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.nome} {c.sindicato ? `(${c.sindicato})` : ""}
                    </SelectItem>
                  ))}
                  {matrizOptions.length === 0 && convencoes && convencoes.length > 0 && (
                    <>
                      {convencoes.map((c: any) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.nome} {c.sindicato ? `(${c.sindicato})` : ""}
                        </SelectItem>
                      ))}
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-center">
              <ArrowRight className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Convenção Local</label>
              <Select value={localId || "none"} onValueChange={v => { setLocalId(v === "none" ? "" : v); setResult(null); }}>
                <SelectTrigger className="bg-input"><SelectValue placeholder="Selecione a local" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Selecione</SelectItem>
                  {localOptions.map((c: any) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.nome} {c.sindicato ? `(${c.sindicato})` : ""}
                    </SelectItem>
                  ))}
                  {localOptions.length === 0 && convencoes && convencoes.length > 0 && (
                    <>
                      {convencoes.filter((c: any) => String(c.id) !== matrizId).map((c: any) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.nome} {c.sindicato ? `(${c.sindicato})` : ""}
                        </SelectItem>
                      ))}
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="mt-4 flex justify-center">
            <Button
              onClick={handleComparar}
              disabled={!matrizId || !localId || loading}
              className="bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 px-8"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Brain className="h-4 w-4 mr-2" />}
              {loading ? "Analisando com IA..." : "Comparar com IA"}
            </Button>
          </div>
        </div>

        {/* Resultado */}
        {!result && !loading && (
          <div className="text-center py-12 text-muted-foreground">
            <Scale className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">Selecione duas convenções para comparar</p>
            <p className="text-xs mt-1">A IA irá analisar as diferenças entre a convenção matriz e a local, identificando divergências e riscos.</p>
          </div>
        )}

        {loading && (
          <div className="text-center py-12">
            <Loader2 className="h-10 w-10 mx-auto mb-3 animate-spin text-indigo-500" />
            <p className="text-sm font-medium">Analisando convenções com IA...</p>
            <p className="text-xs text-muted-foreground mt-1">Isso pode levar alguns segundos.</p>
          </div>
        )}

        {result && (
          <div className="space-y-4">
            {/* Resumo */}
            <div className="bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-950/30 dark:to-blue-950/30 rounded-lg border border-indigo-200 dark:border-indigo-800 p-4">
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-2">
                <Brain className="h-4 w-4 text-indigo-600" />
                Resumo da Análise
              </h3>
              <p className="text-sm text-foreground/80">{result.resumo}</p>
              <div className="flex gap-2 mt-3">
                <Badge variant="outline" className="text-[10px]">
                  <Landmark className="h-3 w-3 mr-1" /> Matriz: {result.matrizNome}
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  <Landmark className="h-3 w-3 mr-1" /> Local: {result.localNome}
                </Badge>
              </div>
            </div>

            {/* Divergências */}
            {result.divergencias.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                  <ArrowLeftRight className="h-4 w-4 text-amber-600" />
                  Divergências Encontradas ({result.divergencias.length})
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-muted/50">
                        <th className="text-left p-2 font-semibold border-b">Item</th>
                        <th className="text-left p-2 font-semibold border-b">Valor Matriz</th>
                        <th className="text-left p-2 font-semibold border-b">Valor Local</th>
                        <th className="text-left p-2 font-semibold border-b">Mais Vantajoso</th>
                        <th className="text-left p-2 font-semibold border-b">Impacto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.divergencias.map((div, i) => (
                        <tr key={i} className="border-b border-border hover:bg-muted/20">
                          <td className="p-2 font-medium">{div.item}</td>
                          <td className="p-2">{div.valorMatriz}</td>
                          <td className="p-2">{div.valorLocal}</td>
                          <td className="p-2">
                            <Badge variant={div.maisVantajoso.toLowerCase().includes("local") ? "default" : "secondary"} className="text-[10px]">
                              {div.maisVantajoso}
                            </Badge>
                          </td>
                          <td className="p-2 text-muted-foreground">{div.impacto}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <Separator />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Recomendações */}
              {result.recomendacoes.length > 0 && (
                <div className="bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-800 p-4">
                  <h3 className="text-sm font-semibold flex items-center gap-2 mb-2 text-green-700">
                    <Lightbulb className="h-4 w-4" />
                    Recomendações
                  </h3>
                  <ul className="space-y-1.5">
                    {result.recomendacoes.map((rec, i) => (
                      <li key={i} className="text-xs text-green-800 dark:text-green-300 flex items-start gap-1.5">
                        <CheckCircle2 className="h-3 w-3 mt-0.5 flex-shrink-0" />
                        {rec}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Riscos */}
              {result.riscos.length > 0 && (
                <div className="bg-red-50 dark:bg-red-950/30 rounded-lg border border-red-200 dark:border-red-800 p-4">
                  <h3 className="text-sm font-semibold flex items-center gap-2 mb-2 text-red-700">
                    <ShieldAlert className="h-4 w-4" />
                    Riscos Identificados
                  </h3>
                  <ul className="space-y-1.5">
                    {result.riscos.map((risco, i) => (
                      <li key={i} className="text-xs text-red-800 dark:text-red-300 flex items-start gap-1.5">
                        <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                        {risco}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </FullScreenDialog>
  );
}
