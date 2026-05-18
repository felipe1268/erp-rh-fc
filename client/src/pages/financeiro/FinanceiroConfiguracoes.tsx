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
import { Settings, Users, Plus, Save, RefreshCw, UserCheck, CheckCircle2, Edit3, Loader2 } from "lucide-react";

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
  // Rev. 2093 — origem do sócio: "manual" (digitar tudo) ou id do funcionário sócio.
  const [partnerOrigin, setPartnerOrigin] = useState<string>("");

  const { data: taxConfig, refetch: refetchTax } = (trpc as any).financial.getTaxConfig.useQuery(
    { companyId },
    { enabled: !!companyId }
  );

  const { data: partners, refetch: refetchPartners } = (trpc as any).financial.getPartners.useQuery(
    { companyId },
    { enabled: !!companyId }
  );

  // Rev. 2093 — funcionários com tipoContrato='Socio' (do módulo Colaboradores).
  const { data: sociosColab, refetch: refetchSociosColab } = (trpc as any).financial.listSociosFromEmployees.useQuery(
    { companyId },
    { enabled: !!companyId && showNewPartner }
  );

  function resetPartnerForm() {
    setPartnerForm({ nome: "", cpf: "", cargo: "", percentualSociedade: "", valorProLabore: "", diaVencimento: "5", pixChave: "" });
    setPartnerOrigin("");
  }

  function onSelectEmployeeSocio(value: string) {
    setPartnerOrigin(value);
    if (value === "manual" || value === "") {
      setPartnerForm(f => ({ ...f, nome: "", cpf: "", cargo: "" }));
      return;
    }
    const emp = (sociosColab ?? []).find((e: any) => String(e.id) === value);
    if (emp) {
      setPartnerForm(f => ({
        ...f,
        nome: emp.nomeCompleto ?? "",
        cpf: emp.cpf ?? "",
        cargo: emp.cargo ?? "Sócio",
      }));
    }
  }

  useEffect(() => {
    if (taxConfig) setTaxForm({ ...taxConfig });
  }, [taxConfig]);

  const updateTaxMut = (trpc as any).financial.updateTaxConfig.useMutation({
    onSuccess: () => { toast({ title: "Configuração salva!" }); refetchTax(); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const createPartnerMut = (trpc as any).financial.createPartner.useMutation({
    onSuccess: () => {
      toast({ title: "Sócio cadastrado!" });
      setShowNewPartner(false);
      resetPartnerForm();
      refetchPartners();
      refetchSociosColab();
    },
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

        {/* Modal novo sócio — Rev. 2093: regras de ouro + seletor de funcionários sócios (Colaboradores) */}
        <Dialog open={showNewPartner} onOpenChange={(v) => { if (!v) { setShowNewPartner(false); resetPartnerForm(); } else setShowNewPartner(true); }}>
          <DialogContent className="max-w-md p-0 overflow-hidden">
            <div className="px-5 pt-4 pb-3 bg-gradient-to-br from-blue-600 to-indigo-600 text-white">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-lg bg-white/15 ring-2 ring-white/30 flex items-center justify-center">
                  <UserCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">Novo Sócio</h3>
                  <p className="text-[11px] text-blue-100">
                    Selecione um sócio cadastrado em Colaboradores ou cadastre manualmente
                  </p>
                </div>
              </div>
            </div>
            <div className="px-5 py-4 space-y-3">
              {/* Seletor: sócios do módulo Colaboradores */}
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Origem do Sócio</label>
                <select
                  value={partnerOrigin}
                  onChange={(e) => onSelectEmployeeSocio(e.target.value)}
                  className="mt-1 h-9 w-full rounded-md border border-gray-200 px-2 text-sm bg-white"
                >
                  <option value="">— Selecione —</option>
                  <optgroup label="Sócios cadastrados (Colaboradores)">
                    {(sociosColab ?? []).length === 0 && (
                      <option disabled value="__empty__">Nenhum funcionário com tipo "Sócio" encontrado</option>
                    )}
                    {(sociosColab ?? []).map((e: any) => (
                      <option key={e.id} value={String(e.id)} disabled={!!e.jaCadastrado}>
                        {e.nomeCompleto}{e.cargo ? ` · ${e.cargo}` : ""}{e.jaCadastrado ? "  ✓ já cadastrado" : ""}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Outros">
                    <option value="manual">Digitar manualmente…</option>
                  </optgroup>
                </select>
                {partnerOrigin && partnerOrigin !== "manual" && (
                  <p className="text-[11px] text-emerald-700 mt-1 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Dados puxados do cadastro em Colaboradores
                  </p>
                )}
                {partnerOrigin === "manual" && (
                  <p className="text-[11px] text-amber-700 mt-1 flex items-center gap-1">
                    <Edit3 className="w-3 h-3" /> Cadastro manual — preencha nome e CPF abaixo
                  </p>
                )}
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Nome Completo *</label>
                <Input
                  value={partnerForm.nome}
                  onChange={e => setPartnerForm(f => ({ ...f, nome: e.target.value }))}
                  placeholder="Nome do sócio"
                  className="mt-1 h-9"
                  disabled={!!partnerOrigin && partnerOrigin !== "manual"}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">CPF</label>
                  <Input
                    value={partnerForm.cpf}
                    onChange={e => setPartnerForm(f => ({ ...f, cpf: e.target.value }))}
                    placeholder="000.000.000-00"
                    className="mt-1 h-9"
                    disabled={!!partnerOrigin && partnerOrigin !== "manual"}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Cargo</label>
                  <Input
                    value={partnerForm.cargo}
                    onChange={e => setPartnerForm(f => ({ ...f, cargo: e.target.value }))}
                    placeholder="Diretor, Sócio…"
                    className="mt-1 h-9"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">% na Sociedade</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={partnerForm.percentualSociedade}
                    onChange={e => setPartnerForm(f => ({ ...f, percentualSociedade: e.target.value }))}
                    placeholder="0,00"
                    className="mt-1 h-9"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Pró-labore (R$)</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={partnerForm.valorProLabore}
                    onChange={e => setPartnerForm(f => ({ ...f, valorProLabore: e.target.value }))}
                    placeholder="0,00"
                    className="mt-1 h-9"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Dia de Vencimento</label>
                  <Input
                    type="number"
                    min="1"
                    max="28"
                    value={partnerForm.diaVencimento}
                    onChange={e => setPartnerForm(f => ({ ...f, diaVencimento: e.target.value }))}
                    className="mt-1 h-9"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Chave PIX</label>
                  <Input
                    value={partnerForm.pixChave}
                    onChange={e => setPartnerForm(f => ({ ...f, pixChave: e.target.value }))}
                    placeholder="CPF, e-mail, telefone…"
                    className="mt-1 h-9"
                  />
                </div>
              </div>
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-2.5 text-[11px] text-blue-700 leading-relaxed">
                <strong>Dica:</strong> sócios já cadastrados como funcionários (tipo "Sócio") em Colaboradores aparecem no seletor acima — basta escolher para puxar nome e CPF, evitando duplicidade.
              </div>
            </div>
            <DialogFooter className="px-5 pb-4">
              <Button type="button" variant="outline" onClick={() => { setShowNewPartner(false); resetPartnerForm(); }} disabled={createPartnerMut.isPending}>
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={() => createPartnerMut.mutate({
                  companyId,
                  nome: partnerForm.nome,
                  cpf: partnerForm.cpf || undefined,
                  cargo: partnerForm.cargo || undefined,
                  percentualSociedade: parseFloat(partnerForm.percentualSociedade) || undefined,
                  valorProLabore: parseFloat(partnerForm.valorProLabore) || undefined,
                  diaVencimento: parseInt(partnerForm.diaVencimento) || 5,
                  pixChave: partnerForm.pixChave || undefined,
                })}
                disabled={createPartnerMut.isPending || partnerForm.nome.trim().length < 2}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {createPartnerMut.isPending ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Salvando…</> : <><Plus className="w-3.5 h-3.5 mr-1.5" />Cadastrar Sócio</>}
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
