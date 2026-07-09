/**
 * client/src/pages/fiscal/EfdIcmsIpi.tsx
 * Gerador de EFD-ICMS/IPI — seletor de período padrão do sistema (white-card)
 * Guia Prático v3.2.2 (Ato COTEPE/ICMS 44/2018), COD_VER 017.
 */
import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, Download, Save, FileText, Settings, UserCheck } from "lucide-react";
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

interface ConfigState {
  ie: string; im: string; codMun: string; cep: string; logradouro: string;
  numeroEnd: string; complemento: string; bairro: string; telefone: string;
  fax: string; email: string; suframa: string; perfil: "A"|"B"|"C";
  contNome: string; contCpf: string; contCrc: string; contCodMun: string;
  contCnpj: string; contCep: string; contLogradouro: string; contNumero: string;
  contComplemento: string; contBairro: string; contFone: string; contFax: string;
  contEmail: string;
}

const defaultCfg = (): ConfigState => ({
  ie:"", im:"", codMun:"", cep:"", logradouro:"", numeroEnd:"",
  complemento:"", bairro:"", telefone:"", fax:"", email:"", suframa:"",
  perfil:"A",
  contNome:"", contCpf:"", contCrc:"", contCodMun:"", contCnpj:"",
  contCep:"", contLogradouro:"", contNumero:"", contComplemento:"",
  contBairro:"", contFone:"", contFax:"", contEmail:"",
});

function dig(s: string) { return s.replace(/\D/g,""); }

function Field({ label, value, onChange, maxLength, hint, className }: {
  label: string; value: string; onChange:(v:string)=>void;
  maxLength?: number; hint?: string; className?: string;
}) {
  return (
    <div className={className}>
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <Input value={value} onChange={e=>onChange(e.target.value)}
        maxLength={maxLength} placeholder={hint} className="mt-1 h-8 text-sm" />
    </div>
  );
}

export default function EfdIcmsIpi() {
  const { companyIdNum, selectedCompanyId, companies } = useCompany();
  const { toast } = useToast();

  const [ano, setAno]             = useState(HOJE.getFullYear());
  const [mes, setMes]             = useState<number|null>(HOJE.getMonth() + 1);
  const [finalidade, setFinalidade] = useState<"0"|"1">("0");
  const [cfg, setCfg]             = useState<ConfigState>(defaultCfg());
  const [empresaOpen, setEmpresaOpen] = useState(false);
  const [contOpen, setContOpen]   = useState(false);
  const [downloading, setDownloading] = useState(false);

  const configQ = trpc.efdIcmsIpi.getConfig.useQuery(
    { companyId: companyIdNum },
    { enabled: companyIdNum > 0 }
  );

  useEffect(() => {
    if (!configQ.data) return;
    const d = configQ.data;
    setCfg({
      ie:d.ie, im:d.im, codMun:d.codMun, cep:d.cep,
      logradouro:d.logradouro, numeroEnd:d.numeroEnd,
      complemento:d.complemento, bairro:d.bairro,
      telefone:d.telefone, fax:d.fax, email:d.email,
      suframa:d.suframa, perfil:d.perfil,
      contNome:d.contNome, contCpf:d.contCpf, contCrc:d.contCrc,
      contCodMun:d.contCodMun, contCnpj:d.contCnpj, contCep:d.contCep,
      contLogradouro:d.contLogradouro, contNumero:d.contNumero,
      contComplemento:d.contComplemento, contBairro:d.contBairro,
      contFone:d.contFone, contFax:d.contFax, contEmail:d.contEmail,
    });
  }, [configQ.data]);

  const saveMut = trpc.efdIcmsIpi.saveConfig.useMutation({
    onSuccess: () => {
      toast({ title:"Configuração salva", description:"Parâmetros da EFD-ICMS/IPI atualizados." });
      configQ.refetch();
    },
    onError: e => toast({ variant:"destructive", title:"Erro ao salvar", description:e.message }),
  });

  function set(field: keyof ConfigState) {
    return (v: string) => setCfg(p => ({ ...p, [field]: v }));
  }

  async function handleDownload() {
    if (!companyIdNum) { toast({ variant:"destructive", title:"Selecione uma empresa" }); return; }
    setDownloading(true);
    try {
      const anoTodo = mes === null;
      const url = anoTodo
        ? `/api/download/efd-icms-ipi-ano?companyId=${companyIdNum}&ano=${ano}&finalidade=${finalidade}`
        : `/api/download/efd-icms-ipi?companyId=${companyIdNum}&mes=${mes}&ano=${ano}&finalidade=${finalidade}`;
      const res = await fetch(url, { credentials:"include" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error:"Erro desconhecido" }));
        throw new Error(err.error || "Falha ao gerar arquivo");
      }
      const blob = await res.blob();
      const fin = finalidade === "1" ? "SUB" : "ORI";
      const filename = anoTodo
        ? `EFD_ICMS_IPI_${companyIdNum}_${ano}_${fin}.zip`
        : `EFD_ICMS_IPI_${companyIdNum}_${String(mes).padStart(2,"0")}_${ano}_${fin}.txt`;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
      toast({ title:"Arquivo gerado", description:`${filename} baixado com sucesso.` });
    } catch (e: any) {
      toast({ variant:"destructive", title:"Erro ao gerar EFD", description:e.message });
    } finally {
      setDownloading(false);
    }
  }

  const empresa = companies?.find(c => String(c.id) === selectedCompanyId);
  const nomeEmpresa = empresa?.nomeFantasia || empresa?.razaoSocial || "";

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto p-4 space-y-4">

        {/* Cabeçalho */}
        <div className="flex items-center gap-3">
          <FileText className="h-6 w-6 text-primary shrink-0" />
          <div>
            <h1 className="text-xl font-bold">EFD-ICMS/IPI</h1>
            <p className="text-sm text-muted-foreground">
              Escrituração Fiscal Digital · Guia Prático v3.2.2 · COD_VER 017
            </p>
          </div>
        </div>

        {/* ── Seletor de período — padrão do sistema ─────────────────── */}
        <PeriodSelectorCard
          ano={ano}
          mes={mes}
          onAno={setAno}
          onMes={setMes}
          onAnoTodo={() => setMes(null)}
          actions={
            <>
              <Select value={cfg.perfil} onValueChange={v => setCfg(p => ({ ...p, perfil: v as "A"|"B"|"C" }))}>
                <SelectTrigger className="h-8 text-xs w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="A">Perfil A</SelectItem>
                  <SelectItem value="B">Perfil B</SelectItem>
                  <SelectItem value="C">Perfil C</SelectItem>
                </SelectContent>
              </Select>

              <Select value={finalidade} onValueChange={v => setFinalidade(v as "0"|"1")}>
                <SelectTrigger className="h-8 text-xs w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Original</SelectItem>
                  <SelectItem value="1">Substituto</SelectItem>
                </SelectContent>
              </Select>

              <Button
                size="sm"
                onClick={handleDownload}
                disabled={downloading || !companyIdNum}
                className="h-8 text-xs gap-1.5 px-3"
              >
                <Download className="h-3.5 w-3.5" />
                {downloading ? "Gerando…" : mes===null ? `Baixar tudo · ${ano}` : `Gerar · ${MESES_SHORT[mes-1]} ${ano}`}
              </Button>
            </>
          }
        />
        {empresa && (
          <div className="px-4 py-2 -mt-2 rounded-b-xl border border-t-0 border-slate-200 flex items-center gap-2 text-xs text-muted-foreground bg-slate-50/60">
            <span className="font-medium text-gray-700">{nomeEmpresa}</span>
            {empresa.cnpj && <span>· CNPJ {empresa.cnpj}</span>}
            <span className="ml-auto text-gray-500">
              {mes===null ? `Ano todo ${ano}` : `${MESES_FULL[mes-1]} ${ano}`} · {finalidade === "1" ? "Substituto" : "Original"} · Perfil {cfg.perfil}
            </span>
          </div>
        )}

        {/* Legenda clara do período a encaminhar */}
        <div className="rounded-xl border border-blue-200 bg-blue-50/70 px-4 py-3 flex items-start gap-2.5">
          <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5"/>
          {mes === null ? (
            <p className="text-xs text-blue-800 leading-relaxed">
              <strong>Modo "Ano todo" selecionado:</strong> vai gerar um arquivo separado para
              CADA mês de {ano} (compactados em um .zip). Use isso só se precisar enviar vários
              meses atrasados de uma vez — no dia a dia, o normal é enviar mês a mês (clique num mês acima).
            </p>
          ) : (
            <p className="text-xs text-blue-800 leading-relaxed">
              <strong>Período a encaminhar: {MESES_FULL[mes-1]} de {ano}</strong> (mês fechado, referente
              ao movimento daquele mês). É este o arquivo que normalmente você envia ao contador
              todo mês, dentro do prazo definido pela Receita Federal.
            </p>
          )}
        </div>

        {/* ── Parâmetros da Empresa ───────────────────────────────────── */}
        <Collapsible open={empresaOpen} onOpenChange={setEmpresaOpen}>
          <div className="bg-white rounded-xl border shadow-sm">
            <CollapsibleTrigger asChild>
              <button className="w-full flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/30 rounded-xl transition-colors">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Settings className="h-4 w-4 text-primary" />
                  Parâmetros da Empresa
                  <span className="text-xs font-normal text-muted-foreground">· Registro 0000 / 0005</span>
                </div>
                {empresaOpen
                  ? <ChevronLeft className="h-4 w-4 text-muted-foreground rotate-90" />
                  : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-4 pb-4 border-t space-y-3">
                <p className="text-xs text-muted-foreground pt-3">
                  Preencha os campos fiscais conforme cadastro na SEFAZ-SP.
                  Razão social e CNPJ são obtidos automaticamente do cadastro da empresa.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <Field label="Inscrição Estadual (IE)"    value={cfg.ie}        onChange={set("ie")}       maxLength={14} hint="Apenas dígitos" />
                  <Field label="Inscrição Municipal (IM)"   value={cfg.im}        onChange={set("im")}       maxLength={20} hint="Ex.: 13239401" />
                  <Field label="Código IBGE do Município"   value={cfg.codMun}    onChange={v=>setCfg(p=>({...p,codMun:dig(v).slice(0,7)}))}   maxLength={7} hint="3518701" />
                  <Field label="CEP (apenas dígitos)"       value={cfg.cep}       onChange={v=>setCfg(p=>({...p,cep:dig(v).slice(0,8)}))}      maxLength={8} hint="12505300" />
                  <Field label="Logradouro" className="sm:col-span-2" value={cfg.logradouro} onChange={set("logradouro")} maxLength={60} hint="Av. Exemplo" />
                  <Field label="Número"                     value={cfg.numeroEnd} onChange={set("numeroEnd")} maxLength={10} hint="1301" />
                  <Field label="Complemento"                value={cfg.complemento} onChange={set("complemento")} maxLength={60} hint="Sala 1104" />
                  <Field label="Bairro"                     value={cfg.bairro}    onChange={set("bairro")}   maxLength={60} hint="Centro" />
                  <Field label="Telefone (apenas dígitos)"  value={cfg.telefone}  onChange={v=>setCfg(p=>({...p,telefone:dig(v).slice(0,11)}))} maxLength={11} hint="12312334441" />
                  <Field label="Fax"                        value={cfg.fax}       onChange={v=>setCfg(p=>({...p,fax:dig(v).slice(0,11)}))}     maxLength={11} hint="Opcional" />
                  <Field label="E-mail"                     value={cfg.email}     onChange={set("email")}    maxLength={255} hint="fiscal@empresa.com.br" />
                  <Field label="SUFRAMA"                    value={cfg.suframa}   onChange={set("suframa")}  maxLength={9}  hint="Zona Franca (opcional)" />
                </div>
                <p className="text-xs text-muted-foreground italic">
                  UF: SP · IND_ATIV: 1 (Outros — construtora) · Perfil configurado no seletor acima.
                </p>
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>

        {/* ── Dados do Contabilista ───────────────────────────────────── */}
        <Collapsible open={contOpen} onOpenChange={setContOpen}>
          <div className="bg-white rounded-xl border shadow-sm">
            <CollapsibleTrigger asChild>
              <button className="w-full flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/30 rounded-xl transition-colors">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <UserCheck className="h-4 w-4 text-primary" />
                  Dados do Contabilista
                  <span className="text-xs font-normal text-muted-foreground">· Registro 0100</span>
                </div>
                {contOpen
                  ? <ChevronLeft className="h-4 w-4 text-muted-foreground rotate-90" />
                  : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-4 pb-4 border-t space-y-3">
                <p className="text-xs text-muted-foreground pt-3">
                  Se deixado em branco, o Registro 0100 não é gerado no arquivo EFD.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <Field label="Nome do Contabilista" className="sm:col-span-2" value={cfg.contNome} onChange={set("contNome")} maxLength={100} hint="Nome completo" />
                  <Field label="CPF (apenas dígitos)"        value={cfg.contCpf}  onChange={v=>setCfg(p=>({...p,contCpf:dig(v).slice(0,11)}))} maxLength={11} hint="12345678900" />
                  <Field label="CRC"                         value={cfg.contCrc}  onChange={set("contCrc")} maxLength={15} hint="CRC/SP-000000-1" />
                  <Field label="CNPJ do Escritório"          value={cfg.contCnpj} onChange={v=>setCfg(p=>({...p,contCnpj:dig(v).slice(0,14)}))} maxLength={14} hint="Opcional" />
                  <Field label="Código IBGE Município"       value={cfg.contCodMun} onChange={v=>setCfg(p=>({...p,contCodMun:dig(v).slice(0,7)}))} maxLength={7} hint="3518701" />
                  <Field label="CEP (apenas dígitos)"        value={cfg.contCep}  onChange={v=>setCfg(p=>({...p,contCep:dig(v).slice(0,8)}))} maxLength={8} hint="12345678" />
                  <Field label="Logradouro" className="sm:col-span-2" value={cfg.contLogradouro} onChange={set("contLogradouro")} maxLength={60} hint="Rua Exemplo" />
                  <Field label="Número"                      value={cfg.contNumero} onChange={set("contNumero")} maxLength={10} hint="100" />
                  <Field label="Complemento"                 value={cfg.contComplemento} onChange={set("contComplemento")} maxLength={60} hint="Sala 1" />
                  <Field label="Bairro"                      value={cfg.contBairro} onChange={set("contBairro")} maxLength={60} hint="Centro" />
                  <Field label="Telefone (apenas dígitos)"   value={cfg.contFone} onChange={v=>setCfg(p=>({...p,contFone:dig(v).slice(0,11)}))} maxLength={11} hint="12987654321" />
                  <Field label="Fax"                         value={cfg.contFax}  onChange={v=>setCfg(p=>({...p,contFax:dig(v).slice(0,11)}))} maxLength={11} hint="Opcional" />
                  <Field label="E-mail"                      value={cfg.contEmail} onChange={set("contEmail")} maxLength={255} hint="contador@escritorio.com.br" />
                </div>
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>

        {/* ── Botão salvar + informativo ──────────────────────────────── */}
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={() => saveMut.mutate({ companyId: companyIdNum, ...cfg })}
            disabled={saveMut.isPending || !companyIdNum}
            className="gap-2"
          >
            <Save className="h-4 w-4" />
            {saveMut.isPending ? "Salvando…" : "Salvar Configuração"}
          </Button>
        </div>

        <Card className="border-blue-200 bg-blue-50/50">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm text-blue-800">Sobre o arquivo gerado</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-blue-700 space-y-1 pb-4 px-4">
            <p>• Formato EFD-ICMS/IPI COD_VER 017 (Ato COTEPE/ICMS 44/2018 atualizado).</p>
            <p>• <strong>Perfil A</strong>: inclui itens de NF-e (C170) quando XML completo disponível.</p>
            <p>• Blocos B, D, G, H gerados sem movimento (IND_MOV=1) — construtora ISS, não ICMS.</p>
            <p>• Bloco E calcula apuração ICMS a partir dos C190 do período.</p>
            <p>• <strong>Validar no PVA (SPED) antes de transmitir.</strong></p>
          </CardContent>
        </Card>

      </div>
    </DashboardLayout>
  );
}
