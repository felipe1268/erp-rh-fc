import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Save, ChevronRight, Banknote, FileText, Users, RefreshCw } from "lucide-react";
import { toast } from "sonner";

function fmtBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

const TAX_FIELDS = [
  { label: "ISS (%)", key: "aliquotaISS" },
  { label: "PIS (%)", key: "aliquotaPIS" },
  { label: "COFINS (%)", key: "aliquotaCOFINS" },
  { label: "IRPJ (%)", key: "aliquotaIRPJ" },
  { label: "CSLL (%)", key: "aliquotaCSLL" },
  { label: "INSS Empresa (%)", key: "aliquotaINSSEmpresa" },
  { label: "FGTS (%)", key: "aliquotaFGTS" },
  { label: "RAT (%)", key: "aliquotaRAT" },
];

export function FinanceiroConfigSection({ onManageSocios }: { onManageSocios?: () => void }) {
  const { selectedCompanyId } = useCompany();
  const companyId = Number(selectedCompanyId) || 0;

  const [expanded, setExpanded] = useState<"tributario" | "socios" | null>(null);
  const [taxForm, setTaxForm] = useState<any>({});
  const [showAutoImport, setShowAutoImport] = useState(false);
  const [importMes, setImportMes] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const { data: taxConfig, refetch: refetchTax } = (trpc as any).financial.getTaxConfig.useQuery(
    { companyId }, { enabled: !!companyId }
  );
  const { data: partners } = (trpc as any).financial.getPartners.useQuery(
    { companyId }, { enabled: !!companyId }
  );

  useEffect(() => { if (taxConfig) setTaxForm({ ...taxConfig }); }, [taxConfig]);

  const updateTaxMut = (trpc as any).financial.updateTaxConfig.useMutation({
    onSuccess: () => { toast.success("Configuração tributária salva!"); refetchTax(); },
    onError: (e: any) => toast.error(e.message || "Erro ao salvar"),
  });

  const importMut = (trpc as any).financial.runAutoImport.useMutation({
    onSuccess: (r: any) => {
      toast.success(`Importação concluída! Folha: ${r.folha}, PJ: ${r.pj}, Parceiros: ${r.parceiros}`);
      setShowAutoImport(false);
    },
    onError: (e: any) => toast.error(e.message || "Erro na importação"),
  });

  const regimeLabel: Record<string, string> = {
    simples_nacional: "Simples Nacional",
    lucro_presumido: "Lucro Presumido",
    lucro_real: "Lucro Real",
    mei: "MEI",
  };

  return (
    <div className="border rounded-lg overflow-hidden border-emerald-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-emerald-50 border-b border-emerald-200">
        <div className="flex items-center gap-2 text-xs font-bold text-emerald-700 uppercase tracking-wider">
          <Banknote className="w-4 h-4" />
          Financeiro
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-emerald-700 h-7 px-2 text-xs hover:bg-emerald-100"
          onClick={() => setShowAutoImport(true)}
        >
          <RefreshCw className="w-3.5 h-3.5 mr-1" />
          Auto-Importar Dados
        </Button>
      </div>

      {/* Sub-seção: Tributário */}
      <div className="border-b border-emerald-100 last:border-0">
        <button
          onClick={() => setExpanded(expanded === "tributario" ? null : "tributario")}
          className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-emerald-50/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <FileText className="w-4 h-4 text-emerald-500" />
            <span className="font-medium text-gray-800 text-sm">Configuração Tributária</span>
            {taxForm.regimeTributario && (
              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-xs">
                {regimeLabel[taxForm.regimeTributario] || taxForm.regimeTributario}
              </span>
            )}
          </div>
          <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${expanded === "tributario" ? "rotate-90" : ""}`} />
        </button>

        {expanded === "tributario" && (
          <div className="px-4 pb-4 bg-white space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">Regime Tributário</Label>
                <Select
                  value={taxForm.regimeTributario ?? "simples_nacional"}
                  onValueChange={v => setTaxForm((f: any) => ({ ...f, regimeTributario: v }))}
                >
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="simples_nacional">Simples Nacional</SelectItem>
                    <SelectItem value="lucro_presumido">Lucro Presumido</SelectItem>
                    <SelectItem value="lucro_real">Lucro Real</SelectItem>
                    <SelectItem value="mei">MEI</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {taxForm.regimeTributario === "simples_nacional" && (
                <div>
                  <Label className="text-xs">Alíquota Simples (%)</Label>
                  <Input
                    type="number" step="0.01" className="mt-1"
                    value={taxForm.aliquotaSimples ?? ""}
                    onChange={e => setTaxForm((f: any) => ({ ...f, aliquotaSimples: e.target.value }))}
                  />
                </div>
              )}
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-600 mb-2">Alíquotas de Tributos</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {TAX_FIELDS.map(({ label, key }) => (
                  <div key={key}>
                    <Label className="text-xs">{label}</Label>
                    <Input
                      type="number" step="0.01" className="mt-1"
                      value={taxForm[key] ?? ""}
                      onChange={e => setTaxForm((f: any) => ({ ...f, [key]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t">
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={updateTaxMut.isPending}
                onClick={() => updateTaxMut.mutate({
                  companyId,
                  regimeTributario: taxForm.regimeTributario,
                  aliquotaSimples: parseFloat(taxForm.aliquotaSimples) || undefined,
                  aliquotaISS: parseFloat(taxForm.aliquotaISS),
                  aliquotaPIS: parseFloat(taxForm.aliquotaPIS),
                  aliquotaCOFINS: parseFloat(taxForm.aliquotaCOFINS),
                  aliquotaIRPJ: parseFloat(taxForm.aliquotaIRPJ),
                  aliquotaCSLL: parseFloat(taxForm.aliquotaCSLL),
                  aliquotaINSSEmpresa: parseFloat(taxForm.aliquotaINSSEmpresa),
                  aliquotaFGTS: parseFloat(taxForm.aliquotaFGTS),
                  aliquotaRAT: parseFloat(taxForm.aliquotaRAT),
                })}
              >
                <Save className="w-3.5 h-3.5 mr-1" />
                {updateTaxMut.isPending ? "Salvando..." : "Salvar Tributário"}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Sub-seção: Sócios */}
      <div>
        <button
          onClick={() => setExpanded(expanded === "socios" ? null : "socios")}
          className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-emerald-50/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Users className="w-4 h-4 text-emerald-500" />
            <span className="font-medium text-gray-800 text-sm">Sócios e Pró-labore</span>
            {partners && partners.length > 0 && (
              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-xs">
                {partners.length} sócio{partners.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${expanded === "socios" ? "rotate-90" : ""}`} />
        </button>

        {expanded === "socios" && (
          <div className="px-4 pb-4 bg-white space-y-3">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-3 text-sm text-emerald-900 flex items-start gap-2">
              <Users className="w-4 h-4 mt-0.5 flex-shrink-0 text-emerald-600" />
              <p>
                O cadastro dos sócios e o pró-labore agora ficam em um <strong>único local</strong>:{" "}
                <strong>Configurações → Sócios</strong>. Lá os sócios vêm direto do módulo Colaboradores
                (tipo "Sócio") e você define o administrador, a participação, o pró-labore e a chave PIX.
              </p>
            </div>
            {partners && partners.length > 0 && (
              <div className="space-y-2">
                {partners.map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
                    <div>
                      <p className="font-medium text-gray-800 text-sm">{p.nome}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {p.cargo ?? "Sócio"}{p.cpf ? ` • ${p.cpf}` : ""}
                        {p.pixChave ? ` • PIX: ${p.pixChave}` : ""}
                      </p>
                    </div>
                    <div className="text-right text-xs">
                      {p.percentualSociedade && <p className="font-semibold text-gray-700">{p.percentualSociedade}% soc.</p>}
                      {p.valorProLabore && <p className="text-emerald-700 font-medium">{fmtBRL(Number(p.valorProLabore))}/mês</p>}
                      <p className="text-gray-400">Venc. dia {p.diaVencimento ?? 5}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end">
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => onManageSocios?.()}
              >
                <Users className="w-3.5 h-3.5 mr-1" /> Gerenciar sócios em Configurações → Sócios
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Modal: Auto-Importar */}
      <Dialog open={showAutoImport} onOpenChange={setShowAutoImport}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Auto-Importar Dados Financeiros</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Importa automaticamente folha CLT, pagamentos PJ e lançamentos de parceiros como lançamentos financeiros.
            </p>
            <div>
              <Label className="text-sm">Mês de Referência</Label>
              <Input type="month" className="mt-1" value={importMes} onChange={e => setImportMes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAutoImport(false)}>Cancelar</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={importMut.isPending}
              onClick={() => importMut.mutate({ companyId, mesCompetencia: importMes })}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${importMut.isPending ? "animate-spin" : ""}`} />
              {importMut.isPending ? "Importando..." : "Importar Agora"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
