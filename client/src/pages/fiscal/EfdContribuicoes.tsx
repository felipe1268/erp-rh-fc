/**
 * EFD Contribuições — PIS/COFINS (mensal, regime cumulativo)
 */
import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, Download, Save, FileText, Settings } from "lucide-react";
import { useCompany } from "@/contexts/CompanyContext";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import DashboardLayout from "@/components/DashboardLayout";
import PeriodSelectorCard from "@/components/PeriodSelectorCard";

const MESES_SHORT = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const MESES_FULL  = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const HOJE = new Date();

const COD_INC_TRIB_OPTS = [
  { value:"1", label:"1 — Lucro Real" },
  { value:"2", label:"2 — Lucro Real — Tributação diferenciada" },
  { value:"3", label:"3 — Lucro Presumido" },
  { value:"4", label:"4 — Simples Nacional" },
];

interface CfgState {
  codIncTrib: string; indRegCum: string;
  aliqPis: string; aliqCofins: string; percPresumido: string;
}

const defaultCfg = (): CfgState => ({
  codIncTrib:"3", indRegCum:"1", aliqPis:"0.65", aliqCofins:"3.00", percPresumido:"32",
});

export default function EfdContribuicoes() {
  const { companyIdNum, selectedCompanyId, companies } = useCompany();
  const { toast } = useToast();
  const [ano, setAno]       = useState(HOJE.getFullYear());
  const [mes, setMes]       = useState<number|null>(HOJE.getMonth()+1);
  const [finalidade, setFinalidade] = useState<"0"|"1">("0");
  const [cfg, setCfg]       = useState<CfgState>(defaultCfg());
  const [cfgOpen, setCfgOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const configQ = trpc.efdContribuicoes.getConfig.useQuery(
    { companyId: companyIdNum }, { enabled: companyIdNum > 0 }
  );
  useEffect(() => {
    if (!configQ.data) return;
    const d = configQ.data;
    setCfg({
      codIncTrib:   d.cod_inc_trib   ?? "3",
      indRegCum:    d.ind_reg_cum    ?? "1",
      aliqPis:      d.aliq_pis       ?? "0.65",
      aliqCofins:   d.aliq_cofins    ?? "3.00",
      percPresumido:d.perc_presumido ?? "32",
    });
  }, [configQ.data]);

  const saveMut = trpc.efdContribuicoes.saveConfig.useMutation({
    onSuccess:() => { toast({title:"Configuração salva"}); configQ.refetch(); },
    onError: e => toast({variant:"destructive",title:"Erro",description:e.message}),
  });

  async function handleDownload() {
    if (!companyIdNum) { toast({variant:"destructive",title:"Selecione uma empresa"}); return; }
    setDownloading(true);
    try {
      const anoTodo = mes === null;
      const url = anoTodo
        ? `/api/download/efd-contribuicoes-ano?companyId=${companyIdNum}&ano=${ano}&finalidade=${finalidade}`
        : `/api/download/efd-contribuicoes?companyId=${companyIdNum}&mes=${mes}&ano=${ano}&finalidade=${finalidade}`;
      const res = await fetch(url, { credentials:"include" });
      if (!res.ok) { const e=await res.json().catch(()=>({error:"Erro"})); throw new Error(e.error); }
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      const fin = finalidade==="1"?"SUB":"ORI";
      a.download = anoTodo
        ? `EFD_CONTRIB_${companyIdNum}_${ano}_${fin}.zip`
        : `EFD_CONTRIB_${companyIdNum}_${String(mes).padStart(2,"0")}_${ano}_${fin}.txt`;
      a.click(); URL.revokeObjectURL(a.href);
      toast({title:"Arquivo gerado com sucesso"});
    } catch(e:any) { toast({variant:"destructive",title:"Erro",description:e.message}); }
    finally { setDownloading(false); }
  }

  const empresa = companies?.find(c => String(c.id) === selectedCompanyId);
  const nomeEmpresa = empresa?.nomeFantasia || empresa?.razaoSocial || "";

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto p-4 space-y-4">

        <div className="flex items-center gap-3">
          <FileText className="h-6 w-6 text-primary shrink-0" />
          <div>
            <h1 className="text-xl font-bold">EFD Contribuições</h1>
            <p className="text-sm text-muted-foreground">PIS/COFINS · Regime Cumulativo · Guia Prático v1.34</p>
          </div>
        </div>

        {/* Seletor de período — padrão do sistema */}
        <PeriodSelectorCard
          ano={ano}
          mes={mes}
          onAno={setAno}
          onMes={setMes}
          onAnoTodo={()=>setMes(null)}
          actions={
            <>
              <Select value={finalidade} onValueChange={v=>setFinalidade(v as "0"|"1")}>
                <SelectTrigger className="h-8 text-xs w-28"><SelectValue/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Original</SelectItem>
                  <SelectItem value="1">Substituto</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" onClick={handleDownload} disabled={downloading||!companyIdNum} className="h-8 text-xs gap-1.5 px-3">
                <Download className="h-3.5 w-3.5"/>
                {downloading ? "Gerando…" : mes===null ? `Baixar tudo · ${ano}` : `Gerar · ${MESES_SHORT[mes-1]} ${ano}`}
              </Button>
            </>
          }
        />
        {empresa && (
          <div className="px-4 py-2 -mt-2 rounded-b-xl border border-t-0 border-slate-200 flex items-center gap-2 text-xs text-muted-foreground bg-slate-50/60">
            <span className="font-medium text-gray-700">{nomeEmpresa}</span>
            {empresa.cnpj && <span>· CNPJ {empresa.cnpj}</span>}
            <span className="ml-auto">{mes===null ? `Ano todo ${ano}` : `${MESES_FULL[mes-1]} ${ano}`} · {finalidade==="1"?"Substituto":"Original"}</span>
          </div>
        )}

        {/* Config regime tributário */}
        <Collapsible open={cfgOpen} onOpenChange={setCfgOpen}>
          <div className="bg-white rounded-xl border shadow-sm">
            <CollapsibleTrigger asChild>
              <button className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 rounded-xl transition-colors">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Settings className="h-4 w-4 text-primary"/>
                  Regime Tributário
                  <span className="text-xs font-normal text-muted-foreground">· Registro 0110</span>
                </div>
                {cfgOpen ? <ChevronLeft className="h-4 w-4 text-muted-foreground rotate-90"/> : <ChevronRight className="h-4 w-4 text-muted-foreground"/>}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-4 pb-4 border-t space-y-3">
                <p className="text-xs text-muted-foreground pt-3">Parâmetros para o Registro 0110 (regime de tributação PIS/COFINS).</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground">Regime de Tributação (COD_INC_TRIB)</Label>
                    <Select value={cfg.codIncTrib} onValueChange={v=>setCfg(p=>({...p,codIncTrib:v}))}>
                      <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue/></SelectTrigger>
                      <SelectContent>{COD_INC_TRIB_OPTS.map(o=><SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground">Regime Cumulativo (IND_REG_CUM)</Label>
                    <Select value={cfg.indRegCum} onValueChange={v=>setCfg(p=>({...p,indRegCum:v}))}>
                      <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue/></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 — Cumulativo (LP)</SelectItem>
                        <SelectItem value="2">2 — Não-Cumulativo (LR)</SelectItem>
                        <SelectItem value="3">3 — Ambos</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground">Alíquota PIS (%)</Label>
                    <Input value={cfg.aliqPis} onChange={e=>setCfg(p=>({...p,aliqPis:e.target.value}))} className="mt-1 h-8 text-sm" placeholder="0.65"/>
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground">Alíquota COFINS (%)</Label>
                    <Input value={cfg.aliqCofins} onChange={e=>setCfg(p=>({...p,aliqCofins:e.target.value}))} className="mt-1 h-8 text-sm" placeholder="3.00"/>
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground">% Base Presumida (serviços)</Label>
                    <Input value={cfg.percPresumido} onChange={e=>setCfg(p=>({...p,percPresumido:e.target.value}))} className="mt-1 h-8 text-sm" placeholder="32"/>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground italic">Construtoras em Lucro Presumido: cumulativo, PIS 0,65%, COFINS 3%, base 32%.</p>
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>

        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={()=>saveMut.mutate({companyId:companyIdNum,...cfg})}
            disabled={saveMut.isPending||!companyIdNum} className="gap-2">
            <Save className="h-4 w-4"/>
            {saveMut.isPending?"Salvando…":"Salvar Configuração"}
          </Button>
        </div>

        <Card className="border-green-200 bg-green-50/50">
          <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm text-green-800">Sobre o arquivo</CardTitle></CardHeader>
          <CardContent className="text-xs text-green-700 space-y-1 pb-4 px-4">
            <p>• EFD Contribuições versão 006 — PIS/COFINS regime cumulativo.</p>
            <p>• NFS-e (serviços) → Bloco A com PIS {cfg.aliqPis}% e COFINS {cfg.aliqCofins}%.</p>
            <p>• NF-e (mercadorias) → Bloco C (CST 50 — sem direito a crédito no cumulativo).</p>
            <p>• Bloco M apura o valor a recolher por trimestre (M200/M210 PIS · M600/M610 COFINS).</p>
            <p>• <strong>Validar no PVA SPED antes de transmitir.</strong></p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
