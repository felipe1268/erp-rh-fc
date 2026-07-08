/**
 * client/src/pages/fiscal/EfdIcmsIpi.tsx
 * Gerador de EFD-ICMS/IPI — configuração + download do arquivo .txt
 * Guia Prático v3.2.2 (Ato COTEPE/ICMS 44/2018), COD_VER 017.
 */
import { useState, useEffect } from "react";
import { useCompany } from "@/contexts/CompanyContext";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { ChevronDown, ChevronRight, Download, Save, FileText, Settings, UserCheck } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";

const MESES = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];

const ANO_ATUAL = new Date().getFullYear();
const MES_ATUAL = new Date().getMonth() + 1;

interface ConfigState {
  ie: string; im: string; codMun: string; cep: string; logradouro: string;
  numeroEnd: string; complemento: string; bairro: string; telefone: string;
  fax: string; email: string; suframa: string; perfil: "A" | "B" | "C";
  contNome: string; contCpf: string; contCrc: string; contCodMun: string;
  contCnpj: string; contCep: string; contLogradouro: string; contNumero: string;
  contComplemento: string; contBairro: string; contFone: string; contFax: string;
  contEmail: string;
}

const defaultConfig = (): ConfigState => ({
  ie: "", im: "", codMun: "", cep: "", logradouro: "", numeroEnd: "",
  complemento: "", bairro: "", telefone: "", fax: "", email: "", suframa: "",
  perfil: "A",
  contNome: "", contCpf: "", contCrc: "", contCodMun: "", contCnpj: "",
  contCep: "", contLogradouro: "", contNumero: "", contComplemento: "",
  contBairro: "", contFone: "", contFax: "", contEmail: "",
});

function cleanDigits(s: string): string {
  return s.replace(/\D/g, "");
}

function Field({ label, value, onChange, maxLength, hint, className }: {
  label: string; value: string; onChange: (v: string) => void;
  maxLength?: number; hint?: string; className?: string;
}) {
  return (
    <div className={className}>
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <Input
        value={value}
        onChange={e => onChange(e.target.value)}
        maxLength={maxLength}
        placeholder={hint}
        className="mt-1 h-8 text-sm"
      />
    </div>
  );
}

export default function EfdIcmsIpi() {
  const { companyIdNum, selectedCompanyId, companies } = useCompany();
  const { toast } = useToast();

  const [mes, setMes] = useState(MES_ATUAL);
  const [ano, setAno] = useState(ANO_ATUAL);
  const [finalidade, setFinalidade] = useState<"0" | "1">("0");
  const [cfg, setCfg] = useState<ConfigState>(defaultConfig());
  const [empresaOpen, setEmpresaOpen] = useState(false);
  const [contOpen, setContOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Carregar config salva
  const configQ = trpc.efdIcmsIpi.getConfig.useQuery(
    { companyId: companyIdNum },
    { enabled: companyIdNum > 0 }
  );

  useEffect(() => {
    if (configQ.data) {
      const d = configQ.data;
      setCfg({
        ie: d.ie, im: d.im, codMun: d.codMun, cep: d.cep,
        logradouro: d.logradouro, numeroEnd: d.numeroEnd,
        complemento: d.complemento, bairro: d.bairro,
        telefone: d.telefone, fax: d.fax, email: d.email,
        suframa: d.suframa, perfil: d.perfil,
        contNome: d.contNome, contCpf: d.contCpf, contCrc: d.contCrc,
        contCodMun: d.contCodMun, contCnpj: d.contCnpj, contCep: d.contCep,
        contLogradouro: d.contLogradouro, contNumero: d.contNumero,
        contComplemento: d.contComplemento, contBairro: d.contBairro,
        contFone: d.contFone, contFax: d.contFax, contEmail: d.contEmail,
      });
    }
  }, [configQ.data]);

  const saveMut = trpc.efdIcmsIpi.saveConfig.useMutation({
    onSuccess: () => {
      toast({ title: "Configuração salva", description: "Parâmetros da EFD-ICMS/IPI atualizados." });
      configQ.refetch();
    },
    onError: (e) => toast({ variant: "destructive", title: "Erro ao salvar", description: e.message }),
  });

  function set(field: keyof ConfigState) {
    return (v: string) => setCfg(prev => ({ ...prev, [field]: v }));
  }

  async function handleDownload() {
    if (!companyIdNum) {
      toast({ variant: "destructive", title: "Selecione uma empresa" });
      return;
    }
    setDownloading(true);
    try {
      const url = `/api/download/efd-icms-ipi?companyId=${companyIdNum}&mes=${mes}&ano=${ano}&finalidade=${finalidade}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Erro desconhecido" }));
        throw new Error(err.error || "Falha ao gerar arquivo");
      }
      const blob = await res.blob();
      const mesStr = String(mes).padStart(2, "0");
      const fin = finalidade === "1" ? "SUB" : "ORI";
      const filename = `EFD_ICMS_IPI_${companyIdNum}_${mesStr}_${ano}_${fin}.txt`;
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.click();
      URL.revokeObjectURL(link.href);
      toast({ title: "Arquivo gerado", description: `${filename} baixado com sucesso.` });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erro ao gerar EFD", description: e.message });
    } finally {
      setDownloading(false);
    }
  }

  const empresa = companies?.find(c => String(c.id) === selectedCompanyId);
  const nomeEmpresa = empresa?.nomeFantasia || empresa?.razaoSocial || "Empresa selecionada";

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto p-4 space-y-4">
        {/* Cabeçalho */}
        <div className="flex items-center gap-3">
          <FileText className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold">EFD-ICMS/IPI</h1>
            <p className="text-sm text-muted-foreground">
              Escrituração Fiscal Digital · Guia Prático v3.2.2 · COD_VER 017
            </p>
          </div>
        </div>

        {/* Período e finalidade */}
        <div className="bg-white rounded-xl border shadow-sm p-4">
          <p className="text-sm font-semibold text-muted-foreground mb-3">Período e Finalidade</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs font-medium text-muted-foreground">Mês</Label>
              <Select value={String(mes)} onValueChange={v => setMes(Number(v))}>
                <SelectTrigger className="mt-1 h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MESES.map((m, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-medium text-muted-foreground">Ano</Label>
              <Select value={String(ano)} onValueChange={v => setAno(Number(v))}>
                <SelectTrigger className="mt-1 h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 8 }, (_, i) => ANO_ATUAL - 2 + i).map(a => (
                    <SelectItem key={a} value={String(a)}>{a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-medium text-muted-foreground">Finalidade</Label>
              <Select value={finalidade} onValueChange={v => setFinalidade(v as "0" | "1")}>
                <SelectTrigger className="mt-1 h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Original (0)</SelectItem>
                  <SelectItem value="1">Substituto (1)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-medium text-muted-foreground">Perfil</Label>
              <Select value={cfg.perfil} onValueChange={v => setCfg(p => ({ ...p, perfil: v as "A" | "B" | "C" }))}>
                <SelectTrigger className="mt-1 h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="A">Perfil A</SelectItem>
                  <SelectItem value="B">Perfil B</SelectItem>
                  <SelectItem value="C">Perfil C</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Empresa selecionada */}
          {empresa && (
            <div className="mt-3 p-2 bg-muted/40 rounded text-xs text-muted-foreground">
              <span className="font-medium">{nomeEmpresa}</span>
              {empresa.cnpj ? ` · CNPJ ${empresa.cnpj}` : ""}
            </div>
          )}
        </div>

        {/* Config — Empresa */}
        <Collapsible open={empresaOpen} onOpenChange={setEmpresaOpen}>
          <div className="bg-white rounded-xl border shadow-sm">
            <CollapsibleTrigger className="w-full">
              <div className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/30 rounded-xl transition-colors">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Settings className="h-4 w-4 text-primary" />
                  Parâmetros da Empresa
                  <span className="text-xs font-normal text-muted-foreground ml-1">
                    (Registro 0000, 0005)
                  </span>
                </div>
                {empresaOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-4 pb-4 space-y-3 border-t">
                <p className="text-xs text-muted-foreground pt-3">
                  Preencha os campos fiscais da empresa conforme cadastro na SEFAZ-SP.
                  Razão social e CNPJ são obtidos automaticamente do cadastro da empresa.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <Field label="Inscrição Estadual (IE)" value={cfg.ie} onChange={set("ie")} maxLength={14} hint="Apenas dígitos" />
                  <Field label="Inscrição Municipal (IM)" value={cfg.im} onChange={set("im")} maxLength={20} hint="Ex.: 13239401" />
                  <Field label="Código IBGE do Município" value={cfg.codMun} onChange={v => setCfg(p => ({ ...p, codMun: cleanDigits(v).slice(0, 7) }))} maxLength={7} hint="Ex.: 3518701" />
                  <Field label="CEP (apenas dígitos)" value={cfg.cep} onChange={v => setCfg(p => ({ ...p, cep: cleanDigits(v).slice(0, 8) }))} maxLength={8} hint="12505300" />
                  <Field label="Logradouro" value={cfg.logradouro} onChange={set("logradouro")} maxLength={60} hint="Av Juscelino Kubitschek" className="sm:col-span-2" />
                  <Field label="Número" value={cfg.numeroEnd} onChange={set("numeroEnd")} maxLength={10} hint="1301" />
                  <Field label="Complemento" value={cfg.complemento} onChange={set("complemento")} maxLength={60} hint="Sala 1104" />
                  <Field label="Bairro" value={cfg.bairro} onChange={set("bairro")} maxLength={60} hint="Campo do Galvão" />
                  <Field label="Telefone (apenas dígitos)" value={cfg.telefone} onChange={v => setCfg(p => ({ ...p, telefone: cleanDigits(v).slice(0, 11) }))} maxLength={11} hint="12312334441" />
                  <Field label="Fax" value={cfg.fax} onChange={v => setCfg(p => ({ ...p, fax: cleanDigits(v).slice(0, 11) }))} maxLength={11} hint="Opcional" />
                  <Field label="E-mail" value={cfg.email} onChange={set("email")} maxLength={255} hint="fiscal@empresa.com.br" />
                  <Field label="SUFRAMA" value={cfg.suframa} onChange={set("suframa")} maxLength={9} hint="Zona Franca (opcional)" />
                </div>
                <p className="text-xs text-muted-foreground pt-1 italic">
                  UF: SP · IND_ATIV: 1 (Outros — construtora) · Perfil configurado acima.
                </p>
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>

        {/* Config — Contabilista */}
        <Collapsible open={contOpen} onOpenChange={setContOpen}>
          <div className="bg-white rounded-xl border shadow-sm">
            <CollapsibleTrigger className="w-full">
              <div className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/30 rounded-xl transition-colors">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <UserCheck className="h-4 w-4 text-primary" />
                  Dados do Contabilista
                  <span className="text-xs font-normal text-muted-foreground ml-1">
                    (Registro 0100)
                  </span>
                </div>
                {contOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-4 pb-4 space-y-3 border-t">
                <p className="text-xs text-muted-foreground pt-3">
                  Se deixado em branco, o Registro 0100 não é gerado no arquivo EFD.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <Field label="Nome do Contabilista" value={cfg.contNome} onChange={set("contNome")} maxLength={100} hint="Nome completo" className="sm:col-span-2" />
                  <Field label="CPF (apenas dígitos)" value={cfg.contCpf} onChange={v => setCfg(p => ({ ...p, contCpf: cleanDigits(v).slice(0, 11) }))} maxLength={11} hint="12345678900" />
                  <Field label="CRC" value={cfg.contCrc} onChange={set("contCrc")} maxLength={15} hint="CRC/SP-000000-1" />
                  <Field label="CNPJ do Escritório (apenas dígitos)" value={cfg.contCnpj} onChange={v => setCfg(p => ({ ...p, contCnpj: cleanDigits(v).slice(0, 14) }))} maxLength={14} hint="Opcional" />
                  <Field label="Código IBGE Município" value={cfg.contCodMun} onChange={v => setCfg(p => ({ ...p, contCodMun: cleanDigits(v).slice(0, 7) }))} maxLength={7} hint="Ex.: 3518701" />
                  <Field label="CEP (apenas dígitos)" value={cfg.contCep} onChange={v => setCfg(p => ({ ...p, contCep: cleanDigits(v).slice(0, 8) }))} maxLength={8} hint="12345678" />
                  <Field label="Logradouro" value={cfg.contLogradouro} onChange={set("contLogradouro")} maxLength={60} hint="Rua Exemplo" />
                  <Field label="Número" value={cfg.contNumero} onChange={set("contNumero")} maxLength={10} hint="100" />
                  <Field label="Complemento" value={cfg.contComplemento} onChange={set("contComplemento")} maxLength={60} hint="Sala 1" />
                  <Field label="Bairro" value={cfg.contBairro} onChange={set("contBairro")} maxLength={60} hint="Centro" />
                  <Field label="Telefone (apenas dígitos)" value={cfg.contFone} onChange={v => setCfg(p => ({ ...p, contFone: cleanDigits(v).slice(0, 11) }))} maxLength={11} hint="12987654321" />
                  <Field label="Fax" value={cfg.contFax} onChange={v => setCfg(p => ({ ...p, contFax: cleanDigits(v).slice(0, 11) }))} maxLength={11} hint="Opcional" />
                  <Field label="E-mail" value={cfg.contEmail} onChange={set("contEmail")} maxLength={255} hint="contador@escritorio.com.br" />
                </div>
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>

        {/* Ações */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            variant="outline"
            onClick={() => saveMut.mutate({ companyId: companyIdNum, ...cfg })}
            disabled={saveMut.isPending || !companyIdNum}
            className="flex items-center gap-2"
          >
            <Save className="h-4 w-4" />
            {saveMut.isPending ? "Salvando..." : "Salvar Configuração"}
          </Button>

          <Button
            onClick={handleDownload}
            disabled={downloading || !companyIdNum}
            className="flex items-center gap-2"
          >
            <Download className="h-4 w-4" />
            {downloading ? "Gerando arquivo..." : `Gerar EFD · ${MESES[mes - 1]} ${ano}`}
          </Button>
        </div>

        {/* Informativo */}
        <Card className="border-blue-200 bg-blue-50/50">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm text-blue-800">Sobre este arquivo</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-blue-700 space-y-1 pb-4 px-4">
            <p>• O arquivo gerado segue o layout EFD-ICMS/IPI COD_VER 017 (Ato COTEPE/ICMS 44/2018 atualizado).</p>
            <p>• <strong>Perfil A</strong>: inclui itens de NF-e (C170) quando o XML completo estiver disponível.</p>
            <p>• Blocos B, D, G, H e K gerados sem movimento (IND_MOV=1) — construtora ISS.</p>
            <p>• Bloco C inclui NF-e modelo 55 de entradas e saídas do período.</p>
            <p>• Bloco E calcula apuração ICMS a partir das C190 do período.</p>
            <p>• <strong>Validar no PVA (SPED) antes de transmitir.</strong></p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
