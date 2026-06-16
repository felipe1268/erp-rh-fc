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
import { Switch } from "@/components/ui/switch";
import { Settings, Users, Plus, Save, RefreshCw, UserCheck, CheckCircle2, Edit3, Loader2,
  Calculator, Receipt, Landmark, Briefcase, Info, AlertCircle, TrendingUp, Wallet, Lightbulb,
  PiggyBank, BadgePercent, Sparkles, Zap } from "lucide-react";

function formatBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

// Rev. 2094 — Defaults brasileiros típicos por regime tributário.
// Valores aproximados pra economia / serviços de engenharia; user pode ajustar.
// Simples Nacional: alíquota efetiva no DAS substitui PIS/COFINS/IRPJ/CSLL/INSS individuais.
// Lucro Presumido: serviços (presunção 32%), alíquotas sobre receita bruta.
// Lucro Real: alíquotas cheias.
// MEI: tudo zerado (DAS-MEI fixo mensal, fora do escopo deste form).
const REGIME_DEFAULTS: Record<string, Record<string, string>> = {
  simples_nacional: {
    aliquotaSimples: "10.00",
    aliquotaISS: "0", aliquotaPIS: "0", aliquotaCOFINS: "0",
    aliquotaIRPJ: "0", aliquotaCSLL: "0", aliquotaINSSEmpresa: "0",
    aliquotaFGTS: "8.00", aliquotaRAT: "3.00",
  },
  lucro_presumido: {
    aliquotaSimples: "0",
    aliquotaISS: "5.00", aliquotaPIS: "0.65", aliquotaCOFINS: "3.00",
    aliquotaIRPJ: "4.80", aliquotaCSLL: "2.88", aliquotaINSSEmpresa: "20.00",
    aliquotaFGTS: "8.00", aliquotaRAT: "3.00",
  },
  lucro_real: {
    aliquotaSimples: "0",
    aliquotaISS: "5.00", aliquotaPIS: "1.65", aliquotaCOFINS: "7.60",
    aliquotaIRPJ: "15.00", aliquotaCSLL: "9.00", aliquotaINSSEmpresa: "20.00",
    aliquotaFGTS: "8.00", aliquotaRAT: "3.00",
  },
  mei: {
    aliquotaSimples: "0",
    aliquotaISS: "0", aliquotaPIS: "0", aliquotaCOFINS: "0",
    aliquotaIRPJ: "0", aliquotaCSLL: "0", aliquotaINSSEmpresa: "0",
    aliquotaFGTS: "0", aliquotaRAT: "0",
  },
};

// Classes Tailwind precisam ser estáticas pra não serem purgadas — por isso o map literal.
const REGIME_CARDS = [
  { v: "simples_nacional", label: "Simples Nacional", desc: "DAS unificado, ideal pra micro/pequenas empresas",       icon: PiggyBank,
    activeRing: "ring-2 ring-blue-500 border-blue-300 bg-blue-50/60",
    activeIcon: "bg-blue-100 text-blue-700",    activeText: "text-blue-700",    activeCheck: "text-blue-600" },
  { v: "lucro_presumido",  label: "Lucro Presumido",  desc: "Presunção de lucro fixa (32% serviços / 8% comércio)",   icon: Calculator,
    activeRing: "ring-2 ring-indigo-500 border-indigo-300 bg-indigo-50/60",
    activeIcon: "bg-indigo-100 text-indigo-700", activeText: "text-indigo-700", activeCheck: "text-indigo-600" },
  { v: "lucro_real",       label: "Lucro Real",       desc: "Apuração sobre lucro contábil real (grandes empresas)",  icon: TrendingUp,
    activeRing: "ring-2 ring-purple-500 border-purple-300 bg-purple-50/60",
    activeIcon: "bg-purple-100 text-purple-700", activeText: "text-purple-700", activeCheck: "text-purple-600" },
  { v: "mei",              label: "MEI",              desc: "Microempreendedor individual (DAS-MEI mensal fixo)",     icon: Briefcase,
    activeRing: "ring-2 ring-emerald-500 border-emerald-300 bg-emerald-50/60",
    activeIcon: "bg-emerald-100 text-emerald-700", activeText: "text-emerald-700", activeCheck: "text-emerald-600" },
] as const;

// Agrupamento didático das alíquotas + tooltip curto por tributo.
const TAX_GROUPS = [
  {
    title: "Tributos Federais",
    icon: Landmark,
    color: "from-blue-500 to-indigo-500",
    fields: [
      { key: "aliquotaPIS",    label: "PIS",    help: "Contribuição ao Programa de Integração Social (cumulativo: 0,65% · não-cumulativo: 1,65%)" },
      { key: "aliquotaCOFINS", label: "COFINS", help: "Contribuição p/ Financiamento da Seguridade Social (cumulativo: 3% · não-cumulativo: 7,6%)" },
      { key: "aliquotaIRPJ",   label: "IRPJ",   help: "Imposto de Renda Pessoa Jurídica (presumido: 4,8% rec · real: 15% lucro)" },
      { key: "aliquotaCSLL",   label: "CSLL",   help: "Contribuição Social sobre o Lucro Líquido (presumido: 2,88% rec · real: 9% lucro)" },
    ],
  },
  {
    title: "Tributos Municipais",
    icon: Receipt,
    color: "from-amber-500 to-orange-500",
    fields: [
      { key: "aliquotaISS", label: "ISS", help: "Imposto Sobre Serviços (varia por município, normalmente 2% a 5%)" },
    ],
  },
  {
    title: "Encargos Trabalhistas",
    icon: Wallet,
    color: "from-emerald-500 to-teal-500",
    fields: [
      { key: "aliquotaINSSEmpresa", label: "INSS Empresa", help: "Contribuição patronal ao INSS sobre a folha (geralmente 20%)" },
      { key: "aliquotaFGTS",        label: "FGTS",         help: "Fundo de Garantia do Tempo de Serviço (8% da folha)" },
      { key: "aliquotaRAT",         label: "RAT",          help: "Riscos Ambientais do Trabalho (1% leve · 2% médio · 3% grave — construção civil normalmente 3%)" },
    ],
  },
] as const;

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

  const [autoImportOn, setAutoImportOn] = useState(false);
  useEffect(() => {
    if (taxConfig) {
      setTaxForm({ ...taxConfig });
      setAutoImportOn(Number(taxConfig.autoImportEnabled) === 1);
    }
  }, [taxConfig]);

  const setAutoImportMut = (trpc as any).financial.setAutoImport.useMutation({
    onSuccess: (r: any) => {
      toast({ title: r?.enabled ? "Importação automática ATIVADA." : "Importação automática DESATIVADA." });
      refetchTax();
    },
    onError: (e: any) => { setAutoImportOn(prev => !prev); toast({ title: "Erro", description: e.message, variant: "destructive" }); },
  });

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

  // Rev. 2094 — Auto-preenche alíquotas com defaults brasileiros ao trocar o regime tributário.
  // Só aplica se a alíquota atual estiver vazia/zerada — preserva ajustes manuais do user.
  function handleChangeRegime(newRegime: string) {
    const defaults = REGIME_DEFAULTS[newRegime] ?? {};
    setTaxForm((f: any) => {
      const next = { ...f, regimeTributario: newRegime };
      let touched = 0;
      for (const k of Object.keys(defaults)) {
        const cur = String(f[k] ?? "").trim();
        if (cur === "" || cur === "0" || cur === "0.00" || cur === "0,00") {
          next[k] = defaults[k];
          touched++;
        }
      }
      if (touched > 0) {
        toast({
          title: "Alíquotas sugeridas preenchidas",
          description: `${touched} campo(s) foram preenchidos com valores típicos do regime ${newRegime.replace("_", " ")}. Revise antes de salvar.`,
        });
      }
      return next;
    });
  }

  // Métricas didáticas pra aba Sócios.
  const totalPercent = (partners ?? []).reduce(
    (acc: number, p: any) => acc + (parseFloat(p.percentualSociedade ?? "0") || 0), 0
  );
  const totalProLabore = (partners ?? []).reduce(
    (acc: number, p: any) => acc + (parseFloat(p.valorProLabore ?? "0") || 0), 0
  );
  const percentOk = Math.abs(totalPercent - 100) < 0.01;

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto p-6 space-y-5">

        {/* Header gradient — padrão regras de ouro */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 px-6 py-5 text-white shadow-lg">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
          <div className="relative flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-white/15 ring-4 ring-white/20 backdrop-blur-sm flex items-center justify-center">
                <Settings className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Configurações Financeiras</h1>
                <p className="text-sm text-blue-100">Regime tributário, alíquotas e quadro societário</p>
              </div>
            </div>
            <Button onClick={() => setShowAutoImport(true)} className="bg-white text-blue-700 hover:bg-blue-50 font-semibold h-10 shadow-md">
              <RefreshCw className="w-4 h-4 mr-2" />Auto-Importar Dados
            </Button>
          </div>
        </div>

        {/* Rev. 3183 — Toggle por empresa: importação automática de dados financeiros (default OFF) */}
        <div className="flex items-start justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 px-5 py-4">
          <div className="flex items-start gap-3">
            <Zap className={`w-5 h-5 mt-0.5 ${autoImportOn ? "text-emerald-600" : "text-gray-400"}`} />
            <div>
              <h3 className="font-semibold text-gray-800 text-sm">Importação Automática de Dados</h3>
              <p className="text-xs text-gray-500 mt-1 max-w-2xl">
                Quando <strong>ligada</strong>, o sistema importa sozinho lançamentos financeiros
                (folha, PJ, parceiros, despesas e receitas/medições) periodicamente e ao aprovar medições.
                Quando <strong>desligada</strong>, nada entra automático — você usa o botão
                <em> Auto-Importar Dados</em> ou os <em>Recebíveis Previstos</em> quando quiser.
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <Switch
              checked={autoImportOn}
              disabled={!companyId || setAutoImportMut.isPending}
              onCheckedChange={(v: boolean) => {
                setAutoImportOn(v);
                setAutoImportMut.mutate({ companyId, enabled: v });
              }}
            />
            <span className={`text-[11px] font-semibold ${autoImportOn ? "text-emerald-600" : "text-gray-400"}`}>
              {autoImportOn ? "Ligada" : "Desligada"}
            </span>
          </div>
        </div>

        <Tabs defaultValue="tributario">
          <TabsList className="bg-white border border-gray-200 p-1 h-auto">
            <TabsTrigger value="tributario" className="data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 gap-1.5">
              <Calculator className="w-4 h-4" />Configuração Tributária
            </TabsTrigger>
            <TabsTrigger value="socios" className="data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 gap-1.5">
              <Users className="w-4 h-4" />Sócios / Pró-labore
            </TabsTrigger>
          </TabsList>

          {/* ============================== ABA TRIBUTÁRIA ============================== */}
          <TabsContent value="tributario" className="mt-4 space-y-5">

            {/* Cards visuais de Regime Tributário (auto-preenche alíquotas ao trocar) */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-blue-600" />Regime Tributário
                </CardTitle>
                <p className="text-xs text-gray-500 mt-0.5">Escolha o regime — as alíquotas serão sugeridas automaticamente.</p>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {REGIME_CARDS.map((r) => {
                    const { v, label, desc, icon: Icon, activeRing, activeIcon, activeText, activeCheck } = r;
                    const active = (taxForm.regimeTributario ?? "simples_nacional") === v;
                    const ringCls = active ? activeRing : "border-gray-200 hover:border-gray-300 bg-white";
                    return (
                      <button
                        key={v}
                        type="button"
                        onClick={() => handleChangeRegime(v)}
                        className={`text-left rounded-xl border p-3 transition shadow-sm hover:shadow ${ringCls}`}
                      >
                        <div className="flex items-start gap-2">
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${active ? activeIcon : "bg-gray-100 text-gray-500"}`}>
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1">
                              <p className={`text-sm font-semibold ${active ? activeText : "text-gray-800"}`}>{label}</p>
                              {active && <CheckCircle2 className={`w-3.5 h-3.5 ${activeCheck}`} />}
                            </div>
                            <p className="text-[11px] text-gray-500 leading-snug mt-0.5">{desc}</p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {taxForm.regimeTributario === "simples_nacional" && (
                  <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50/60 p-3 flex items-start gap-3">
                    <BadgePercent className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <label className="text-xs font-medium text-blue-900 uppercase tracking-wide">Alíquota Simples Efetiva (%)</label>
                      <div className="flex items-end gap-3 mt-1">
                        <Input
                          type="number" step="0.01"
                          className="h-9 max-w-[140px] bg-white"
                          value={taxForm.aliquotaSimples ?? ""}
                          onChange={e => setTaxForm((f: any) => ({ ...f, aliquotaSimples: e.target.value }))}
                        />
                        <p className="text-[11px] text-blue-800 leading-tight pb-1.5">
                          Alíquota DAS efetiva (anexos III/IV — construção civil normalmente 6%–18%, varia por faixa de receita).
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Grupos de alíquotas */}
            {TAX_GROUPS.map(({ title, icon: GIcon, color, fields }) => (
              <Card key={title} className="border-0 shadow-sm overflow-hidden">
                <div className={`bg-gradient-to-r ${color} text-white px-5 py-2.5 flex items-center gap-2`}>
                  <GIcon className="w-4 h-4" />
                  <h3 className="text-sm font-semibold">{title}</h3>
                </div>
                <CardContent className="p-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {fields.map(({ key, label, help }) => (
                      <div key={key}>
                        <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label} (%)</label>
                        <Input
                          type="number" step="0.01"
                          className="h-9 mt-1"
                          value={taxForm[key] ?? ""}
                          onChange={e => setTaxForm((f: any) => ({ ...f, [key]: e.target.value }))}
                        />
                        <p className="text-[10.5px] text-gray-500 mt-1 leading-snug flex items-start gap-1">
                          <Info className="w-3 h-3 mt-0.5 shrink-0 text-gray-400" />
                          <span>{help}</span>
                        </p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}

            {/* Footer salvar */}
            <div className="flex items-center justify-between gap-3 bg-white border border-gray-200 rounded-xl px-5 py-3 shadow-sm">
              <p className="text-xs text-gray-500 flex items-center gap-1.5">
                <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
                Dica: troque o regime acima pra preencher as alíquotas com valores típicos automaticamente.
              </p>
              <Button onClick={handleSaveTax} disabled={updateTaxMut.isPending} className="bg-blue-600 hover:bg-blue-700 text-white h-10 shadow-md">
                {updateTaxMut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                {updateTaxMut.isPending ? "Salvando..." : "Salvar Configuração"}
              </Button>
            </div>
          </TabsContent>

          {/* ============================== ABA SÓCIOS ============================== */}
          <TabsContent value="socios" className="mt-4 space-y-4">

            {/* KPI bar didática */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-2 text-gray-500 text-[11px] uppercase tracking-wide font-medium">
                  <Users className="w-3.5 h-3.5" />Sócios cadastrados
                </div>
                <p className="text-2xl font-bold text-gray-800 mt-1">{partners?.length ?? 0}</p>
              </div>
              <div className={`border rounded-xl p-4 shadow-sm ${percentOk ? "bg-white border-gray-200" : "bg-amber-50 border-amber-200"}`}>
                <div className={`flex items-center gap-2 text-[11px] uppercase tracking-wide font-medium ${percentOk ? "text-gray-500" : "text-amber-700"}`}>
                  <BadgePercent className="w-3.5 h-3.5" />% Sociedade alocado
                </div>
                <p className={`text-2xl font-bold mt-1 ${percentOk ? "text-gray-800" : "text-amber-700"}`}>{totalPercent.toFixed(2)}%</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-2 text-gray-500 text-[11px] uppercase tracking-wide font-medium">
                  <Wallet className="w-3.5 h-3.5" />Total Pró-labore / mês
                </div>
                <p className="text-2xl font-bold text-green-700 mt-1">{formatBRL(totalProLabore)}</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-2 text-gray-500 text-[11px] uppercase tracking-wide font-medium">
                  <TrendingUp className="w-3.5 h-3.5" />Custo anual estimado
                </div>
                <p className="text-2xl font-bold text-gray-800 mt-1">{formatBRL(totalProLabore * 13)}</p>
                <p className="text-[10px] text-gray-400">12 meses + 13º</p>
              </div>
            </div>

            {/* Alerta se % ≠ 100% */}
            {(partners?.length ?? 0) > 0 && !percentOk && (
              <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3">
                <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                <div className="text-xs text-amber-800">
                  <p className="font-semibold">Quadro societário incompleto</p>
                  <p>A soma dos percentuais dos sócios é <strong>{totalPercent.toFixed(2)}%</strong> — o ideal é 100,00%. Ajuste o % de cada sócio editando o cadastro.</p>
                </div>
              </div>
            )}

            <Card className="border-0 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-600" />Quadro Societário
                </CardTitle>
                <Button size="sm" onClick={() => setShowNewPartner(true)} className="bg-blue-600 hover:bg-blue-700 text-white h-9 shadow-sm">
                  <Plus className="w-4 h-4 mr-1" />Novo Sócio
                </Button>
              </CardHeader>
              <CardContent>
                {!partners || partners.length === 0 ? (
                  <div className="py-10 text-center">
                    <div className="w-14 h-14 rounded-full bg-blue-50 mx-auto mb-3 flex items-center justify-center">
                      <UserCheck className="w-7 h-7 text-blue-400" />
                    </div>
                    <p className="text-sm font-medium text-gray-700">Nenhum sócio cadastrado ainda.</p>
                    <p className="text-xs text-gray-500 mt-1">Os sócios já existem no módulo Colaboradores (tipo "Sócio") — basta importá-los aqui.</p>
                    <Button size="sm" onClick={() => setShowNewPartner(true)} className="mt-4 bg-blue-600 hover:bg-blue-700 text-white">
                      <Plus className="w-4 h-4 mr-1" />Cadastrar primeiro sócio
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {partners.map((p: any) => {
                      const initials = (p.nome ?? "?").split(" ").slice(0, 2).map((s: string) => s[0]).join("").toUpperCase();
                      const pct = parseFloat(p.percentualSociedade ?? "0") || 0;
                      return (
                        <div key={p.id} className="flex items-center justify-between gap-3 p-3.5 bg-gray-50 hover:bg-gray-100/70 rounded-lg border border-gray-100 transition">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
                              {initials || "S"}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-gray-800 truncate">{p.nome}</p>
                              <p className="text-xs text-gray-500 truncate">
                                {p.cargo ?? "Sócio"} • {p.cpf ?? "CPF não informado"}
                              </p>
                              {p.pixChave && (
                                <p className="text-[11px] text-blue-600 truncate flex items-center gap-1 mt-0.5">
                                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500" />PIX: {p.pixChave}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            {pct > 0 && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-[11px] font-semibold">
                                <BadgePercent className="w-3 h-3" />{pct.toFixed(2)}%
                              </span>
                            )}
                            {p.valorProLabore && (
                              <p className="text-sm text-green-700 font-semibold mt-1">{formatBRL(Number(p.valorProLabore))}<span className="text-[10px] text-green-600/70 font-normal">/mês</span></p>
                            )}
                            <p className="text-[10px] text-gray-400 mt-0.5">Venc. dia {p.diaVencimento ?? 5}</p>
                          </div>
                        </div>
                      );
                    })}
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
