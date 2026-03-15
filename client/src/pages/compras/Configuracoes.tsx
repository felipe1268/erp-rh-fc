import DashboardLayout from "@/components/DashboardLayout";
import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings, Save, Hash, ShieldCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function ComprasConfiguracoes() {
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id ?? 0;

  const [prefixo, setPrefixo] = useState("OC");
  const [separador, setSeparador] = useState("-");
  const [formatoAno, setFormatoAno] = useState("4dig");
  const [digitos, setDigitos] = useState("3");

  const { data, isLoading } = trpc.purchase.getConfigCompras.useQuery(
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

  const salvarConfigMut = trpc.purchase.salvarConfigOC.useMutation({
    onSuccess: () => toast.success("Configurações salvas!"),
    onError: () => toast.error("Erro ao salvar configurações"),
  });

  const exemplarNumero = `${prefixo}${separador}${formatoAno === "2dig" ? "26" : "2026"}${separador}${"0".repeat(parseInt(digitos || "3") - 1)}1`;

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gray-100 rounded-lg">
            <Settings className="h-6 w-6 text-gray-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Configurações de Compras</h1>
            <p className="text-sm text-gray-500">Personalize o módulo de compras para sua empresa</p>
          </div>
        </div>

        <Tabs defaultValue="numeracao">
          <TabsList>
            <TabsTrigger value="numeracao" className="flex items-center gap-2">
              <Hash className="h-4 w-4" />Numeração de OC
            </TabsTrigger>
            <TabsTrigger value="aprovacao" className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />Regras de Aprovação
            </TabsTrigger>
          </TabsList>

          <TabsContent value="numeracao" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Formato do Número da OC</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-sm text-blue-600 mb-1">Exemplo do número gerado:</p>
                  <p className="text-2xl font-mono font-bold text-blue-800">{exemplarNumero}</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Prefixo</Label>
                    <Input placeholder="OC" value={prefixo} onChange={e => setPrefixo(e.target.value.toUpperCase())} maxLength={10} />
                    <p className="text-xs text-gray-400 mt-1">Ex: OC, PO, ORD</p>
                  </div>
                  <div>
                    <Label>Separador</Label>
                    <Select value={separador} onValueChange={setSeparador}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="-">Hífen ( - )</SelectItem>
                        <SelectItem value="/">Barra ( / )</SelectItem>
                        <SelectItem value=".">Ponto ( . )</SelectItem>
                        <SelectItem value="">Sem separador</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Formato do Ano</Label>
                    <Select value={formatoAno} onValueChange={setFormatoAno}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="4dig">4 dígitos (2026)</SelectItem>
                        <SelectItem value="2dig">2 dígitos (26)</SelectItem>
                        <SelectItem value="none">Sem ano</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Dígitos do Sequencial</Label>
                    <Select value={digitos} onValueChange={setDigitos}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="3">3 dígitos (001)</SelectItem>
                        <SelectItem value="4">4 dígitos (0001)</SelectItem>
                        <SelectItem value="5">5 dígitos (00001)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button className="bg-blue-600 hover:bg-blue-700"
                  disabled={salvarConfigMut.isPending}
                  onClick={() => salvarConfigMut.mutate({
                    companyId, prefixo, separador, formatoAno, digitosSequencial: parseInt(digitos),
                  })}>
                  {salvarConfigMut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                  <Save className="h-4 w-4 mr-2" />Salvar Configurações
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="aprovacao" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Regras de Aprovação</CardTitle>
              </CardHeader>
              <CardContent>
                {data?.regras && data.regras.length > 0 ? (
                  <div className="space-y-3">
                    {data.regras.map((r: any) => (
                      <div key={r.id} className="p-4 border rounded-lg">
                        <p className="font-medium">{r.nome}</p>
                        <p className="text-sm text-gray-500">Limite compra direta: R$ {Number(r.limiteCompraDireta || 0).toFixed(2)}</p>
                        <p className="text-sm text-gray-500">SLA Emergencial: {r.slaEmergencialHoras}h</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <ShieldCheck className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                    <p>Nenhuma regra de aprovação configurada.</p>
                    <p className="text-sm">Configure as regras de aprovação para o fluxo de compras.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
