/**
 * SPED ECD — Escrituração Contábil Digital (anual)
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

const HOJE = new Date();

interface CfgState {
  nire: string; indSitEspecial: string; indEscCons: string;
  codScp: string; setorAtiv: string; codHashEnt: string;
}

const defaultCfg = (): CfgState => ({
  nire:"", indSitEspecial:"0", indEscCons:"0",
  codScp:"", setorAtiv:"04", codHashEnt:"",
});

export default function SpedEcd() {
  const { companyIdNum, selectedCompanyId, companies } = useCompany();
  const { toast } = useToast();
  const [ano, setAno]       = useState(HOJE.getFullYear());
  const [finalidade, setFinalidade] = useState<"0"|"1">("0");
  const [cfg, setCfg]       = useState<CfgState>(defaultCfg());
  const [cfgOpen, setCfgOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const configQ = trpc.spedEcd.getConfig.useQuery(
    { companyId: companyIdNum }, { enabled: companyIdNum > 0 }
  );
  useEffect(() => {
    if (!configQ.data) return;
    const d = configQ.data;
    setCfg({
      nire:           d.nire             ?? "",
      indSitEspecial: d.ind_sit_especial ?? "0",
      indEscCons:     d.ind_esc_cons     ?? "0",
      codScp:         d.cod_scp          ?? "",
      setorAtiv:      d.setor_ativ       ?? "04",
      codHashEnt:     d.cod_hash_ent     ?? "",
    });
  }, [configQ.data]);

  const saveMut = trpc.spedEcd.saveConfig.useMutation({
    onSuccess:()=>{ toast({title:"Configuração salva"}); configQ.refetch(); },
    onError:e=>toast({variant:"destructive",title:"Erro",description:e.message}),
  });

  async function handleDownload() {
    if (!companyIdNum) { toast({variant:"destructive",title:"Selecione uma empresa"}); return; }
    setDownloading(true);
    try {
      const url = `/api/download/sped-ecd?companyId=${companyIdNum}&ano=${ano}&finalidade=${finalidade}`;
      const res = await fetch(url, { credentials:"include" });
      if (!res.ok) { const e=await res.json().catch(()=>({error:"Erro"})); throw new Error(e.error); }
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `SPED_ECD_${companyIdNum}_${ano}_${finalidade==="1"?"SUB":"ORI"}.txt`;
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
            <h1 className="text-xl font-bold">SPED ECD</h1>
            <p className="text-sm text-muted-foreground">Escrituração Contábil Digital · Livro Diário · Layout v11</p>
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
              {downloading ? "Gerando…" : `Gerar ECD · ${ano}`}
            </Button>
          </div>
          {empresa && (
            <div className="px-4 py-2 border-t border-slate-100 flex items-center gap-2 text-xs text-muted-foreground bg-slate-50/60">
              <span className="font-medium text-gray-700">{nomeEmpresa}</span>
              {empresa.cnpj && <span>· CNPJ {empresa.cnpj}</span>}
              <span className="ml-auto">Ano {ano} · {finalidade==="1"?"Substituto":"Original"}</span>
            </div>
          )}
        </div>

        {/* Parâmetros ECD */}
        <Collapsible open={cfgOpen} onOpenChange={setCfgOpen}>
          <div className="bg-white rounded-xl border shadow-sm">
            <CollapsibleTrigger asChild>
              <button className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 rounded-xl transition-colors">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Settings className="h-4 w-4 text-primary"/>
                  Parâmetros ECD
                  <span className="text-xs font-normal text-muted-foreground">· Registro 0000</span>
                </div>
                {cfgOpen ? <ChevronLeft className="h-4 w-4 text-muted-foreground rotate-90"/> : <ChevronRight className="h-4 w-4 text-muted-foreground"/>}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-4 pb-4 border-t space-y-3">
                <p className="text-xs text-muted-foreground pt-3">
                  Identificação da escrituração contábil (Registro 0000 da ECD).
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground">NIRE (Junta Comercial)</Label>
                    <Input value={cfg.nire} onChange={e=>setCfg(p=>({...p,nire:e.target.value}))} className="mt-1 h-8 text-sm" placeholder="Opcional"/>
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground">Situação Especial</Label>
                    <Select value={cfg.indSitEspecial} onValueChange={v=>setCfg(p=>({...p,indSitEspecial:v}))}>
                      <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue/></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">0 — Normal</SelectItem>
                        <SelectItem value="1">1 — Fusão</SelectItem>
                        <SelectItem value="2">2 — Cisão</SelectItem>
                        <SelectItem value="3">3 — Incorporação</SelectItem>
                        <SelectItem value="4">4 — Extinção</SelectItem>
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
                        <SelectItem value="03">03 — Comércio</SelectItem>
                        <SelectItem value="05">05 — Outros</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground">Escrituração Consolidada</Label>
                    <Select value={cfg.indEscCons} onValueChange={v=>setCfg(p=>({...p,indEscCons:v}))}>
                      <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue/></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">0 — Não consolidada</SelectItem>
                        <SelectItem value="1">1 — Consolidada</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground">COD_HASH_ENT (opcional)</Label>
                    <Input value={cfg.codHashEnt} onChange={e=>setCfg(p=>({...p,codHashEnt:e.target.value}))} className="mt-1 h-8 text-sm" placeholder="Hash da entidade"/>
                  </div>
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

        <Card className="border-purple-200 bg-purple-50/50">
          <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm text-purple-800">Sobre o arquivo</CardTitle></CardHeader>
          <CardContent className="text-xs text-purple-700 space-y-1 pb-4 px-4">
            <p>• SPED ECD layout v11 — Livro Diário completo (Bloco I) + Demonstrações (Bloco J).</p>
            <p>• Plano de contas gerado do cadastro de <strong>Categorias Financeiras</strong> do sistema.</p>
            <p>• Lançamentos derivados dos <strong>Lançamentos Financeiros</strong> do período, agrupados por conta.</p>
            <p>• Para escrituração analítica completa (partidas dobradas), configure o módulo contábil.</p>
            <p>• <strong>Validar no PVA SPED antes de transmitir.</strong></p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
