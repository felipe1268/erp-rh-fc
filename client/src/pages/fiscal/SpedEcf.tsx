/**
 * SPED ECF — IRPJ / CSLL (Lucro Presumido, anual)
 */
import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, Download, Save, FileText, Settings, Info } from "lucide-react";
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

const HOJE = new Date();

interface CfgState {
  codQualifPj: string; setorAtiv: string;
  percPresIrpj: string; percPresCSLL: string;
  nire: string; indEscConsDem: string;
}

const defaultCfg = (): CfgState => ({
  codQualifPj:"05", setorAtiv:"04",
  percPresIrpj:"32", percPresCSLL:"32",
  nire:"", indEscConsDem:"0",
});

export default function SpedEcf() {
  const { companyIdNum, selectedCompanyId, companies } = useCompany();
  const { toast } = useToast();
  const [ano, setAno]       = useState(HOJE.getFullYear());
  const [finalidade, setFinalidade] = useState<"0"|"1">("0");
  const [cfg, setCfg]       = useState<CfgState>(defaultCfg());
  const [cfgOpen, setCfgOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const configQ = trpc.spedEcf.getConfig.useQuery(
    { companyId: companyIdNum }, { enabled: companyIdNum > 0 }
  );
  useEffect(() => {
    if (!configQ.data) return;
    const d = configQ.data;
    setCfg({
      codQualifPj:  d.cod_qualif_pj   ?? "05",
      setorAtiv:    d.setor_ativ      ?? "04",
      percPresIrpj: d.perc_pres_irpj  ?? "32",
      percPresCSLL: d.perc_pres_csll  ?? "32",
      nire:         d.nire            ?? "",
      indEscConsDem:d.ind_esc_cons_dem ?? "0",
    });
  }, [configQ.data]);

  const saveMut = trpc.spedEcf.saveConfig.useMutation({
    onSuccess:()=>{ toast({title:"Configuração salva"}); configQ.refetch(); },
    onError:e=>toast({variant:"destructive",title:"Erro",description:e.message}),
  });

  async function handleDownload() {
    if (!companyIdNum) { toast({variant:"destructive",title:"Selecione uma empresa"}); return; }
    setDownloading(true);
    try {
      const url = `/api/download/sped-ecf?companyId=${companyIdNum}&ano=${ano}&finalidade=${finalidade}`;
      const res = await fetch(url, { credentials:"include" });
      if (!res.ok) { const e=await res.json().catch(()=>({error:"Erro"})); throw new Error(e.error); }
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `SPED_ECF_${companyIdNum}_${ano}_${finalidade==="1"?"SUB":"ORI"}.txt`;
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
          <FileText className="h-6 w-6 text-primary shrink-0"/>
          <div>
            <h1 className="text-xl font-bold">SPED ECF</h1>
            <p className="text-sm text-muted-foreground">Escrituração Contábil Fiscal · IRPJ/CSLL · Lucro Presumido · Layout v9</p>
          </div>
        </div>

        {/* Seletor de ano */}
        <div className="rounded-2xl border border-slate-200 shadow-sm bg-white overflow-hidden">
          <div className="px-4 py-4 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <button type="button" onClick={()=>setAno(a=>a-1)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
                <ChevronLeft className="w-5 h-5"/>
              </button>
              <span className="text-2xl font-bold text-gray-800 min-w-[5rem] text-center">{ano}</span>
              <button type="button" onClick={()=>setAno(a=>a+1)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
                <ChevronRight className="w-5 h-5"/>
              </button>
            </div>
            <div className="text-sm text-muted-foreground">
              Período: <span className="font-medium">01/01/{ano} a 31/12/{ano}</span>
            </div>
            <div className="flex-1"/>
            <Select value={finalidade} onValueChange={v=>setFinalidade(v as "0"|"1")}>
              <SelectTrigger className="h-8 text-xs w-28"><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Original</SelectItem>
                <SelectItem value="1">Substituto</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" onClick={handleDownload} disabled={downloading||!companyIdNum} className="h-9 text-sm gap-2 px-4">
              <Download className="h-4 w-4"/>
              {downloading ? "Gerando…" : `Gerar ECF · ${ano}`}
            </Button>
          </div>
          {empresa && (
            <div className="px-4 py-2 border-t border-slate-100 flex items-center gap-2 text-xs text-muted-foreground bg-slate-50/60">
              <span className="font-medium text-gray-700">{nomeEmpresa}</span>
              {empresa.cnpj && <span>· CNPJ {empresa.cnpj}</span>}
              <span className="ml-auto">Ano {ano} · {finalidade==="1"?"Substituto":"Original"} · Lucro Presumido</span>
            </div>
          )}
        </div>

        {/* Legenda clara do período a encaminhar */}
        <div className="rounded-xl border border-blue-200 bg-blue-50/70 px-4 py-3 flex items-start gap-2.5">
          <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5"/>
          <p className="text-xs text-blue-800 leading-relaxed">
            <strong>Período a encaminhar: o ANO {ano} COMPLETO</strong> (de 01/01/{ano} até 31/12/{ano}).
            O SPED ECF não tem versão mensal — é sempre um arquivo por ano. Envie ao contador
            depois de fechar todos os meses de {ano} no sistema.
          </p>
        </div>

        {/* Parâmetros ECF */}
        <Collapsible open={cfgOpen} onOpenChange={setCfgOpen}>
          <div className="bg-white rounded-xl border shadow-sm">
            <CollapsibleTrigger asChild>
              <button className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 rounded-xl transition-colors">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Settings className="h-4 w-4 text-primary"/>
                  Parâmetros ECF
                  <span className="text-xs font-normal text-muted-foreground">· Registros 0000 / 0020 / N600 / P300</span>
                </div>
                {cfgOpen ? <ChevronLeft className="h-4 w-4 text-muted-foreground rotate-90"/> : <ChevronRight className="h-4 w-4 text-muted-foreground"/>}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-4 pb-4 border-t space-y-3">
                <p className="text-xs text-muted-foreground pt-3">
                  Percentuais de presunção conforme atividade (Construção Civil / Serviços em geral: 32%).
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground">Qualificação PJ (COD_QUALIF_PJ)</Label>
                    <Select value={cfg.codQualifPj} onValueChange={v=>setCfg(p=>({...p,codQualifPj:v}))}>
                      <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue/></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="05">05 — Soc. Empresária Limitada</SelectItem>
                        <SelectItem value="01">01 — SA Aberta</SelectItem>
                        <SelectItem value="02">02 — SA Fechada</SelectItem>
                        <SelectItem value="14">14 — Empresário Individual</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground">Setor de Atividade</Label>
                    <Select value={cfg.setorAtiv} onValueChange={v=>setCfg(p=>({...p,setorAtiv:v}))}>
                      <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue/></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="04">04 — Construção Civil</SelectItem>
                        <SelectItem value="01">01 — Financeiro</SelectItem>
                        <SelectItem value="02">02 — Seguros</SelectItem>
                        <SelectItem value="03">03 — Comércio</SelectItem>
                        <SelectItem value="05">05 — Outros</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground">% Presunção IRPJ</Label>
                    <Input value={cfg.percPresIrpj} onChange={e=>setCfg(p=>({...p,percPresIrpj:e.target.value}))} className="mt-1 h-8 text-sm" placeholder="32"/>
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground">% Presunção CSLL</Label>
                    <Input value={cfg.percPresCSLL} onChange={e=>setCfg(p=>({...p,percPresCSLL:e.target.value}))} className="mt-1 h-8 text-sm" placeholder="32"/>
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground">NIRE (Junta Comercial)</Label>
                    <Input value={cfg.nire} onChange={e=>setCfg(p=>({...p,nire:e.target.value}))} className="mt-1 h-8 text-sm" placeholder="Opcional"/>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground italic space-y-0.5">
                  <p>Construtoras LP: IRPJ = base × {cfg.percPresIrpj}% × 15% + adicional 10% s/ excesso de R$20k/mês.</p>
                  <p>CSLL = base × {cfg.percPresCSLL}% × 9%.</p>
                </div>
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

        <Card className="border-amber-200 bg-amber-50/50">
          <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm text-amber-800">Sobre o arquivo</CardTitle></CardHeader>
          <CardContent className="text-xs text-amber-700 space-y-1 pb-4 px-4">
            <p>• SPED ECF layout v9 — IRPJ e CSLL regime Lucro Presumido.</p>
            <p>• Bloco N: apuração trimestral do IRPJ (15% + adicional 10% s/ excesso R$20k/mês).</p>
            <p>• Bloco P: apuração trimestral da CSLL (9%).</p>
            <p>• Bloco J (balanço): requer integração com módulo contábil para dados completos.</p>
            <p>• <strong>Validar no PVA SPED antes de transmitir.</strong></p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
