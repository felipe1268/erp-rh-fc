import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, ChevronRight, ShoppingCart, Hash, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export function ComprasConfigSection() {
  const { selectedCompanyId, isConstrutoras, construtorasIds } = useCompany();
  const companyId = isConstrutoras ? (construtorasIds[0] || 0) : (Number(selectedCompanyId) || 0);

  const [expanded, setExpanded] = useState<"numeracao" | "aprovacao" | null>(null);

  const [prefixo, setPrefixo] = useState("OC");
  const [separador, setSeparador] = useState("-");
  const [formatoAno, setFormatoAno] = useState("4dig");
  const [digitos, setDigitos] = useState("3");

  const { data } = trpc.purchase.getConfigCompras.useQuery(
    { companyId },
    { enabled: !!companyId }
  );

  useEffect(() => {
    if (data?.config) {
      setPrefixo(data.config.prefixo || "OC");
      setSeparador(data.config.separador || "-");
      setFormatoAno(data.config.formatoAno || "4dig");
      setDigitos(String(data.config.digitosSequencial || 3));
    }
  }, [data]);

  const salvarMut = trpc.purchase.salvarConfigOC.useMutation({
    onSuccess: () => toast.success("Configuração de Compras salva!"),
    onError: () => toast.error("Erro ao salvar configuração de Compras"),
  });

  const exemplarNumero = `${prefixo}${separador}${formatoAno === "2dig" ? "26" : formatoAno === "none" ? "" : "2026"}${separador}${"0".repeat(Math.max(0, parseInt(digitos || "3") - 1))}1`;

  return (
    <div className="border rounded-lg overflow-hidden border-rose-200">
      {/* Header da seção de Compras */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-rose-50 text-xs font-bold text-rose-700 uppercase tracking-wider border-b border-rose-200">
        <ShoppingCart className="w-4 h-4" />
        Compras
      </div>

      {/* Sub-seção: Numeração de OC */}
      <div className="border-b border-rose-100 last:border-0">
        <button
          onClick={() => setExpanded(expanded === "numeracao" ? null : "numeracao")}
          className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-rose-50/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Hash className="w-4 h-4 text-rose-500" />
            <span className="font-medium text-gray-800 text-sm">Numeração de Ordens de Compra</span>
            <span className="px-2 py-0.5 bg-rose-100 text-rose-700 rounded text-xs font-mono">
              {exemplarNumero}
            </span>
          </div>
          <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${expanded === "numeracao" ? "rotate-90" : ""}`} />
        </button>

        {expanded === "numeracao" && (
          <div className="px-4 pb-4 bg-white space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <Label className="text-xs">Prefixo</Label>
                <Input
                  value={prefixo}
                  onChange={e => setPrefixo(e.target.value.toUpperCase())}
                  maxLength={10}
                  placeholder="OC"
                  className="mt-1 font-mono"
                />
                <p className="text-xs text-gray-400 mt-1">Ex: OC, PO, ORD</p>
              </div>
              <div>
                <Label className="text-xs">Separador</Label>
                <Select value={separador} onValueChange={setSeparador}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="-">Hífen ( - )</SelectItem>
                    <SelectItem value="/">Barra ( / )</SelectItem>
                    <SelectItem value=".">Ponto ( . )</SelectItem>
                    <SelectItem value="">Sem separador</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Formato do Ano</Label>
                <Select value={formatoAno} onValueChange={setFormatoAno}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="4dig">4 dígitos (2026)</SelectItem>
                    <SelectItem value="2dig">2 dígitos (26)</SelectItem>
                    <SelectItem value="none">Sem ano</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Dígitos do Sequencial</Label>
                <Select value={digitos} onValueChange={setDigitos}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="3">3 dígitos (001)</SelectItem>
                    <SelectItem value="4">4 dígitos (0001)</SelectItem>
                    <SelectItem value="5">5 dígitos (00001)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center justify-between pt-2 border-t">
              <p className="text-xs text-gray-500">Exemplo: <span className="font-mono font-bold text-rose-700">{exemplarNumero}</span></p>
              <Button
                size="sm"
                className="bg-rose-600 hover:bg-rose-700 text-white"
                disabled={salvarMut.isPending}
                onClick={() => salvarMut.mutate({ companyId, prefixo, separador, formatoAno, digitosSequencial: parseInt(digitos) })}
              >
                <Save className="w-3.5 h-3.5 mr-1" />
                {salvarMut.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Sub-seção: Regras de Aprovação */}
      <div>
        <button
          onClick={() => setExpanded(expanded === "aprovacao" ? null : "aprovacao")}
          className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-rose-50/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-4 h-4 text-rose-500" />
            <span className="font-medium text-gray-800 text-sm">Regras de Aprovação</span>
            {data?.regras && data.regras.length > 0 && (
              <span className="px-2 py-0.5 bg-rose-100 text-rose-700 rounded text-xs">
                {data.regras.length} regra{data.regras.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${expanded === "aprovacao" ? "rotate-90" : ""}`} />
        </button>

        {expanded === "aprovacao" && (
          <div className="px-4 pb-4 bg-white">
            {data?.regras && data.regras.length > 0 ? (
              <div className="space-y-2">
                {data.regras.map((r: any) => (
                  <div key={r.id} className="p-3 border rounded-lg text-sm">
                    <p className="font-medium text-gray-800">{r.nome}</p>
                    <p className="text-gray-500 text-xs mt-1">
                      Limite compra direta: <span className="font-medium">R$ {Number(r.limiteCompraDireta || 0).toFixed(2)}</span>
                      {" • "}SLA Emergencial: <span className="font-medium">{r.slaEmergencialHoras}h</span>
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-gray-400 text-sm">
                <ShieldCheck className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                Nenhuma regra de aprovação configurada.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
