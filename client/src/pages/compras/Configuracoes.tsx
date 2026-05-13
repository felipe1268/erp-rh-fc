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
import { Switch } from "@/components/ui/switch";
import { Settings, Save, Hash, ShieldCheck, Loader2, Wrench, Bell } from "lucide-react";
import { toast } from "sonner";

export default function ComprasConfiguracoes() {
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id ?? 0;

  const [prefixo, setPrefixo] = useState("OC");
  const [separador, setSeparador] = useState("-");
  const [formatoAno, setFormatoAno] = useState("4dig");
  const [digitos, setDigitos] = useState("3");

  const [prefixoOs, setPrefixoOs] = useState("OS");
  const [retencaoTecnica, setRetencaoTecnica] = useState("5");
  const [diaCorte, setDiaCorte] = useState("25");
  const [prazoAprovacao, setPrazoAprovacao] = useState("5");
  const [diaPagamento, setDiaPagamento] = useState("10");
  const [alertaReservasAtivo, setAlertaReservasAtivo] = useState(true);

  const { data, isLoading } = trpc.purchase.getConfigCompras.useQuery(
    { companyId },
    { enabled: !!companyId }
  );

  useEffect(() => {
    if (data?.config) {
      setPrefixo(data.config.prefixo || "OC");
      setSeparador(data.config.separador === "" ? "none" : (data.config.separador || "-"));
      setFormatoAno(data.config.formatoAno || "4dig");
      setDigitos(String(data.config.digitosSequencial || 3));
      setPrefixoOs((data.config as any).prefixoOs || "OS");
      setRetencaoTecnica(String((data.config as any).retencaoTecnicaPerc ?? 5));
      setDiaCorte(String((data.config as any).diaCorte ?? 25));
      setPrazoAprovacao(String((data.config as any).prazoAprovacaoDias ?? 5));
      setDiaPagamento(String((data.config as any).diaPagamento ?? 10));
      setAlertaReservasAtivo(((data.config as any).alertaReservasAtivo ?? 1) !== 0);
    }
  }, [data]);

  const utils = trpc.useUtils();
  const salvarConfigMut = trpc.purchase.salvarConfigOC.useMutation({
    onSuccess: () => {
      toast.success("Configurações salvas!");
      utils.purchase.getConfigCompras.invalidate({ companyId });
    },
    onError: () => toast.error("Erro ao salvar configurações"),
  });

  const sep = separador === "none" ? "" : separador;
  const exemplarNumero = `${prefixo}${sep}${formatoAno === "2dig" ? "26" : "2026"}${sep}${"0".repeat(parseInt(digitos || "3") - 1)}1`;

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
            <TabsTrigger value="servicos" className="flex items-center gap-2">
              <Wrench className="h-4 w-4" />Serviços / Contratos
            </TabsTrigger>
            <TabsTrigger value="alertas" className="flex items-center gap-2">
              <Bell className="h-4 w-4" />Alertas
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
                        <SelectItem value="none">Sem separador</SelectItem>
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
                    companyId, prefixo, separador: sep, formatoAno, digitosSequencial: parseInt(digitos),
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

          <TabsContent value="servicos" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Configurações de Ordens de Serviço e Contratos PJ</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
                  <p className="text-sm text-purple-700">
                    Ao aprovar uma OS (Ordem de Serviço), o sistema gera automaticamente um contrato PJ
                    no módulo Terceiros com os parâmetros abaixo. O fornecedor é importado como prestador PJ.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Prefixo da OS</Label>
                    <Input placeholder="OS" value={prefixoOs} onChange={e => setPrefixoOs(e.target.value.toUpperCase())} maxLength={10} />
                    <p className="text-xs text-gray-400 mt-1">Ex: OS, SVC</p>
                  </div>
                  <div>
                    <Label>Retenção Técnica (%)</Label>
                    <Input type="number" min="0" max="20" step="0.5" value={retencaoTecnica} onChange={e => setRetencaoTecnica(e.target.value)} />
                    <p className="text-xs text-gray-400 mt-1">Percentual retido de cada medição. Liberado no fim do contrato.</p>
                  </div>
                  <div>
                    <Label>Dia de Corte da Medição</Label>
                    <Input type="number" min="1" max="31" value={diaCorte} onChange={e => setDiaCorte(e.target.value)} />
                    <p className="text-xs text-gray-400 mt-1">Dia do mês para encerrar a medição (ex: dia 25)</p>
                  </div>
                  <div>
                    <Label>Prazo de Aprovação (dias úteis)</Label>
                    <Input type="number" min="1" max="15" value={prazoAprovacao} onChange={e => setPrazoAprovacao(e.target.value)} />
                    <p className="text-xs text-gray-400 mt-1">Dias úteis para aprovar a medição após o corte</p>
                  </div>
                  <div>
                    <Label>Dia de Pagamento</Label>
                    <Input type="number" min="1" max="31" value={diaPagamento} onChange={e => setDiaPagamento(e.target.value)} />
                    <p className="text-xs text-gray-400 mt-1">Dia do mês seguinte para pagamento (ex: dia 10)</p>
                  </div>
                </div>

                <Button className="bg-purple-600 hover:bg-purple-700"
                  disabled={salvarConfigMut.isPending}
                  onClick={() => salvarConfigMut.mutate({
                    companyId, prefixo, separador: sep, formatoAno, digitosSequencial: parseInt(digitos),
                    prefixoOs, retencaoTecnicaPerc: parseFloat(retencaoTecnica),
                    diaCorte: parseInt(diaCorte), prazoAprovacaoDias: parseInt(prazoAprovacao),
                    diaPagamento: parseInt(diaPagamento),
                  } as any)}>
                  {salvarConfigMut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                  <Save className="h-4 w-4 mr-2" />Salvar Configurações de Serviços
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="alertas" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Critérios de Alertas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
                  <p className="text-sm text-amber-800">
                    Habilite ou desabilite alertas globais do módulo de Compras. Quando desligado,
                    o pop-up e o banner deixam de aparecer para todos os usuários da empresa.
                  </p>
                </div>

                <div className="flex items-start justify-between gap-4 p-4 border rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Bell className="h-4 w-4 text-amber-600" />
                      <Label className="text-base font-medium cursor-pointer">
                        Alerta de Reservas Preventivas
                      </Label>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                      Mostra um pop-up e um banner em todas as telas avisando sobre reservas
                      preventivas próximas do vencimento ou já vencidas. Quando desligado, o
                      sistema continua criando reservas, mas <strong>não exibe avisos visuais</strong>
                      &nbsp;— a equipe de Compras passa a acompanhar pela tela
                      <em> /compras/realocacao</em>.
                    </p>
                  </div>
                  <Switch
                    checked={alertaReservasAtivo}
                    onCheckedChange={setAlertaReservasAtivo}
                  />
                </div>

                <Button
                  className="bg-amber-600 hover:bg-amber-700"
                  disabled={salvarConfigMut.isPending}
                  onClick={() => salvarConfigMut.mutate({
                    companyId,
                    alertaReservasAtivo,
                  } as any)}
                >
                  {salvarConfigMut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                  <Save className="h-4 w-4 mr-2" />Salvar Critérios de Alertas
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
