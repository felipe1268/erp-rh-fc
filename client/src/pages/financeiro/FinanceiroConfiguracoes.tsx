import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import { Settings, Users, Plus, Save, RefreshCw } from "lucide-react";

function formatBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

export default function FinanceiroConfiguracoes() {
  const { companyId } = useCompany();
  const { toast } = useToast();
  const [showNewPartner, setShowNewPartner] = useState(false);
  const [showAutoImport, setShowAutoImport] = useState(false);
  const [importMes, setImportMes] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const [taxForm, setTaxForm] = useState<any>({});
  const [partnerForm, setPartnerForm] = useState({
    nome: "", cpf: "", cargo: "", percentualSociedade: "",
    valorProLabore: "", diaVencimento: "5", pixChave: "",
  });

  const { data: taxConfig, refetch: refetchTax } = (trpc as any).financial.getTaxConfig.useQuery(
    { companyId },
    { enabled: !!companyId }
  );

  const { data: partners, refetch: refetchPartners } = (trpc as any).financial.getPartners.useQuery(
    { companyId },
    { enabled: !!companyId }
  );

  useEffect(() => {
    if (taxConfig) setTaxForm({ ...taxConfig });
  }, [taxConfig]);

  const updateTaxMut = (trpc as any).financial.updateTaxConfig.useMutation({
    onSuccess: () => { toast({ title: "Configuração salva!" }); refetchTax(); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const createPartnerMut = (trpc as any).financial.createPartner.useMutation({
    onSuccess: () => { toast({ title: "Sócio cadastrado!" }); setShowNewPartner(false); refetchPartners(); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const importMut = (trpc as any).financial.runAutoImport.useMutation({
    onSuccess: (r: any) => { toast({ title: `Importação concluída! Folha: ${r.folha}, PJ: ${r.pj}, Parceiros: ${r.parceiros}` }); setShowAutoImport(false); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  function handleSaveTax() {
    updateTaxMut.mutate({
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
    });
  }

  const taxFields = [
    { label: "ISS (%)", key: "aliquotaISS" },
    { label: "PIS (%)", key: "aliquotaPIS" },
    { label: "COFINS (%)", key: "aliquotaCOFINS" },
    { label: "IRPJ (%)", key: "aliquotaIRPJ" },
    { label: "CSLL (%)", key: "aliquotaCSLL" },
    { label: "INSS Empresa (%)", key: "aliquotaINSSEmpresa" },
    { label: "FGTS (%)", key: "aliquotaFGTS" },
    { label: "RAT (%)", key: "aliquotaRAT" },
  ];

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Settings className="w-6 h-6 text-blue-600" />Configurações Financeiras
            </h1>
            <p className="text-sm text-gray-500 mt-1">Regime tributário, alíquotas e sócios</p>
          </div>
          <Button variant="outline" onClick={() => setShowAutoImport(true)}>
            <RefreshCw className="w-4 h-4 mr-2" />Auto-Importar Dados
          </Button>
        </div>

        <Tabs defaultValue="tributario">
          <TabsList>
            <TabsTrigger value="tributario">Configuração Tributária</TabsTrigger>
            <TabsTrigger value="socios">Sócios / Pró-labore</TabsTrigger>
          </TabsList>

          {/* Aba Tributário */}
          <TabsContent value="tributario" className="mt-4">
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Regime Tributário</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <Label>Regime Tributário</Label>
                    <Select value={taxForm.regimeTributario ?? "simples_nacional"} onValueChange={v => setTaxForm((f: any) => ({ ...f, regimeTributario: v }))}>
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
                      <Label>Alíquota Simples (%)</Label>
                      <Input type="number" step="0.01" className="mt-1" value={taxForm.aliquotaSimples ?? ""} onChange={e => setTaxForm((f: any) => ({ ...f, aliquotaSimples: e.target.value }))} />
                    </div>
                  )}
                </div>

                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-3">Alíquotas de Tributos</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {taxFields.map(({ label, key }) => (
                      <div key={key}>
                        <Label className="text-xs">{label}</Label>
                        <Input type="number" step="0.01" className="mt-1" value={taxForm[key] ?? ""} onChange={e => setTaxForm((f: any) => ({ ...f, [key]: e.target.value }))} />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button onClick={handleSaveTax} disabled={updateTaxMut.isPending} className="bg-blue-600 hover:bg-blue-700 text-white">
                    <Save className="w-4 h-4 mr-2" />
                    {updateTaxMut.isPending ? "Salvando..." : "Salvar Configuração"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Aba Sócios */}
          <TabsContent value="socios" className="mt-4">
            <Card className="border-0 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="w-4 h-4" />Sócios e Pró-labore
                </CardTitle>
                <Button size="sm" onClick={() => setShowNewPartner(true)} className="bg-blue-600 hover:bg-blue-700 text-white">
                  <Plus className="w-4 h-4 mr-1" />Novo Sócio
                </Button>
              </CardHeader>
              <CardContent>
                {!partners || partners.length === 0 ? (
                  <div className="py-8 text-center text-gray-400">
                    <Users className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p>Nenhum sócio cadastrado.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {partners.map((p: any) => (
                      <div key={p.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                        <div>
                          <p className="font-medium text-gray-800">{p.nome}</p>
                          <p className="text-xs text-gray-500">
                            {p.cargo ?? "Sócio"} • {p.cpf ?? "CPF não informado"}
                          </p>
                          {p.pixChave && <p className="text-xs text-blue-600">PIX: {p.pixChave}</p>}
                        </div>
                        <div className="text-right">
                          {p.percentualSociedade && (
                            <p className="text-sm font-semibold text-gray-700">{p.percentualSociedade}% sociedade</p>
                          )}
                          {p.valorProLabore && (
                            <p className="text-sm text-green-700 font-medium">{formatBRL(Number(p.valorProLabore))}/mês</p>
                          )}
                          <p className="text-xs text-gray-400">Venc. dia {p.diaVencimento ?? 5}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Modal novo sócio */}
        <Dialog open={showNewPartner} onOpenChange={setShowNewPartner}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Novo Sócio</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Nome Completo *</Label>
                <Input value={partnerForm.nome} onChange={e => setPartnerForm(f => ({ ...f, nome: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>CPF</Label>
                  <Input value={partnerForm.cpf} onChange={e => setPartnerForm(f => ({ ...f, cpf: e.target.value }))} placeholder="000.000.000-00" />
                </div>
                <div>
                  <Label>Cargo</Label>
                  <Input value={partnerForm.cargo} onChange={e => setPartnerForm(f => ({ ...f, cargo: e.target.value }))} placeholder="Diretor, Sócio..." />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>% na Sociedade</Label>
                  <Input type="number" step="0.01" value={partnerForm.percentualSociedade} onChange={e => setPartnerForm(f => ({ ...f, percentualSociedade: e.target.value }))} />
                </div>
                <div>
                  <Label>Pró-labore (R$)</Label>
                  <Input type="number" step="0.01" value={partnerForm.valorProLabore} onChange={e => setPartnerForm(f => ({ ...f, valorProLabore: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Dia de Vencimento</Label>
                  <Input type="number" min="1" max="28" value={partnerForm.diaVencimento} onChange={e => setPartnerForm(f => ({ ...f, diaVencimento: e.target.value }))} />
                </div>
                <div>
                  <Label>Chave PIX</Label>
                  <Input value={partnerForm.pixChave} onChange={e => setPartnerForm(f => ({ ...f, pixChave: e.target.value }))} placeholder="CPF, email, telefone..." />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowNewPartner(false)}>Cancelar</Button>
              <Button onClick={() => createPartnerMut.mutate({ companyId, nome: partnerForm.nome, cpf: partnerForm.cpf || undefined, cargo: partnerForm.cargo || undefined, percentualSociedade: parseFloat(partnerForm.percentualSociedade) || undefined, valorProLabore: parseFloat(partnerForm.valorProLabore) || undefined, diaVencimento: parseInt(partnerForm.diaVencimento) || 5, pixChave: partnerForm.pixChave || undefined })} disabled={createPartnerMut.isPending} className="bg-blue-600 hover:bg-blue-700 text-white">
                {createPartnerMut.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal auto-importar */}
        <Dialog open={showAutoImport} onOpenChange={setShowAutoImport}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Auto-Importar Dados Financeiros</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Importa automaticamente folha CLT, pagamentos PJ e lançamentos de parceiros como lançamentos financeiros.
              </p>
              <div>
                <Label>Mês de Referência</Label>
                <Input type="month" value={importMes} onChange={e => setImportMes(e.target.value)} className="mt-1" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAutoImport(false)}>Cancelar</Button>
              <Button onClick={() => importMut.mutate({ companyId, mesCompetencia: importMes })} disabled={importMut.isPending} className="bg-blue-600 hover:bg-blue-700 text-white">
                <RefreshCw className={`w-4 h-4 mr-2 ${importMut.isPending ? "animate-spin" : ""}`} />
                {importMut.isPending ? "Importando..." : "Importar Agora"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
