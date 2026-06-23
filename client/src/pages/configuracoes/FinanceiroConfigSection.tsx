import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { Save, ChevronRight, Banknote, FileText, Users, RefreshCw, Zap, Shield, Upload, Play, RotateCcw, CheckCircle, AlertCircle, Loader2, Plus, Trash2, ChevronDown } from "lucide-react";
import { toast } from "sonner";

function fmtBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

const TAX_FIELDS = [
  { label: "ISS (%)", key: "aliquotaISS" },
  { label: "PIS (%)", key: "aliquotaPIS" },
  { label: "COFINS (%)", key: "aliquotaCOFINS" },
  { label: "IRPJ (%)", key: "aliquotaIRPJ" },
  { label: "CSLL (%)", key: "aliquotaCSLL" },
  { label: "INSS Empresa (%)", key: "aliquotaINSSEmpresa" },
  { label: "FGTS (%)", key: "aliquotaFGTS" },
  { label: "RAT (%)", key: "aliquotaRAT" },
];

export function FinanceiroConfigSection({ onManageSocios }: { onManageSocios?: () => void }) {
  const { selectedCompanyId } = useCompany();
  const companyId = Number(selectedCompanyId) || 0;

  const [expanded, setExpanded] = useState<"tributario" | "socios" | "sefaz" | "nfseMun" | null>(null);

  // ── NFS-e Emitidas Municipais state ──
  const { data: municipios, refetch: refetchMunicipios } = (trpc as any).nfseEmitidas.getMunicipios.useQuery(
    { companyId }, { enabled: !!companyId }
  );
  // Estado local: mapa ibge_code → { inscricao, senha, enabled }
  const [munForms, setMunForms] = useState<Record<number, { inscricao: string; senha: string; enabled: boolean; syncHora: number }>>({});
  const [munPeriodo, setMunPeriodo] = useState<Record<number, { de: string; ate: string }>>({});
  const [bulkDe, setBulkDe] = useState("");
  const [bulkAte, setBulkAte] = useState("");
  const [bulkResult, setBulkResult] = useState<null | { resultados: any[]; totalImportadas: number; totalIgnoradas: number; municipios: number }>(null);
  useEffect(() => {
    if (!municipios || !Array.isArray(municipios)) return;
    const m: Record<number, { inscricao: string; senha: string; enabled: boolean; syncHora: number }> = {};
    municipios.forEach((mun: any) => {
      m[Number(mun.ibge_code)] = {
        inscricao: mun.inscricao_municipal || "",
        senha: mun.token || "",
        enabled: !!mun.enabled,
        syncHora: Number(mun.sync_hora ?? 6),
      };
    });
    setMunForms(m);
  }, [municipios]);

  const syncAllMut = (trpc as any).nfseEmitidas.syncAllMunicipios.useMutation({
    onSuccess: (r: any) => {
      setBulkResult(r);
      refetchMunicipios();
      if (r.municipios === 0) toast.warning("Nenhum município com Inscrição Municipal configurada.");
      else toast.success(`Concluído: ${r.totalImportadas} NFS-e importadas em ${r.municipios} município(s).`);
    },
    onError: (e: any) => toast.error(e.message || "Erro na importação em lote"),
  });
  const saveMunMut = (trpc as any).nfseEmitidas.saveMunicipio.useMutation({
    onSuccess: () => { toast.success("Configuração salva!"); refetchMunicipios(); },
    onError: (e: any) => toast.error(e.message || "Erro ao salvar"),
  });
  const syncMunMut = (trpc as any).nfseEmitidas.syncMunicipio.useMutation({
    onSuccess: (r: any) => {
      if (r.erro) toast.error("Sync: " + r.erro);
      else if (r.aviso) toast.warning("⚠️ " + r.aviso);
      else toast.success(`${r.importadas} NFS-e importadas, ${r.ignoradas} ignoradas.`);
      refetchMunicipios();
    },
    onError: (e: any) => toast.error(e.message || "Erro na sincronização"),
  });
  const addMunMut = (trpc as any).nfseEmitidas.addMunicipio.useMutation({
    onSuccess: () => { toast.success("Cidade adicionada!"); refetchMunicipios(); setShowAddDialog(false); resetAddForm(); },
    onError: (e: any) => toast.error(e.message || "Erro ao adicionar"),
  });
  const deleteMunMut = (trpc as any).nfseEmitidas.deleteMunicipio.useMutation({
    onSuccess: () => { toast.success("Cidade removida."); refetchMunicipios(); setConfirmDeleteIbge(null); },
    onError: (e: any) => toast.error(e.message || "Erro ao remover"),
  });

  // Dialog "Nova Cidade"
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [confirmDeleteIbge, setConfirmDeleteIbge] = useState<number | null>(null);
  const emptyAddForm = { nome: "", uf: "SP", provider: "siapgeo", endpoint: "", inscricao: "", senha: "", ibge: "", showEndpoint: false };
  const [addForm, setAddForm] = useState(emptyAddForm);
  function resetAddForm() { setAddForm(emptyAddForm); }

  const PROVIDER_OPTIONS = [
    { value: "siapgeo", label: "SIAP GEO", color: "bg-sky-100 text-sky-700" },
    { value: "sil", label: "SIL Tecnologia", color: "bg-violet-100 text-violet-700" },
    { value: "giap", label: "GIAP / Token", color: "bg-amber-100 text-amber-700" },
    { value: "tinus", label: "TINUS ABRASF", color: "bg-teal-100 text-teal-700" },
    { value: "nfse_nacional", label: "NFS-e Nacional", color: "bg-indigo-100 text-indigo-700" },
  ];

  const UF_LIST = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

  // ── SEFAZ state ──
  const [sefazForm, setSefazForm] = useState({ cnpj: "", uf: "SP", ambiente: "producao", syncEnabled: true, syncHora: 6 });
  const [sefazPassword, setSefazPassword] = useState("");
  const [sefazCertName, setSefazCertName] = useState<string | null>(null);
  const [sefazCertB64, setSefazCertB64] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: sefazCfg, refetch: refetchSefaz } = (trpc as any).sefaz.getConfig.useQuery(
    { companyId }, { enabled: !!companyId }
  );
  useEffect(() => {
    if (sefazCfg) {
      setSefazForm({
        cnpj: sefazCfg.cnpj || "",
        uf: sefazCfg.uf || "SP",
        ambiente: sefazCfg.ambiente || "producao",
        syncEnabled: Number(sefazCfg.sync_enabled) === 1,
        syncHora: Number(sefazCfg.sync_hora ?? 6),
      });
    }
  }, [sefazCfg]);

  const saveSefazMut = (trpc as any).sefaz.saveConfig.useMutation({
    onSuccess: () => { toast.success("Configuração SEFAZ salva!"); refetchSefaz(); setSefazCertB64(null); setSefazPassword(""); },
    onError: (e: any) => toast.error(e.message || "Erro ao salvar"),
  });
  const syncNowMut = (trpc as any).sefaz.syncNow.useMutation({
    onSuccess: (r: any) => {
      if (r.erro) { toast.error("SEFAZ: " + r.erro); }
      else if (r.aviso) { toast.warning(`⚠️ Limite SEFAZ: tente novamente em 1 hora. (${r.importadas ?? 0} importadas)`); }
      else { toast.success(`Sincronizado! ${r.importadas} NF-e importadas, ${r.ignoradas} ignoradas.`); }
      refetchSefaz();
    },
    onError: (e: any) => toast.error(e.message || "Erro na sincronização"),
  });
  const resetNSUMut = (trpc as any).sefaz.resetNSU.useMutation({
    onSuccess: () => { toast.success("NSU zerado — próxima sincronização buscará do início."); refetchSefaz(); },
    onError: (e: any) => toast.error(e.message || "Erro"),
  });

  function handleCertFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSefazCertName(file.name);
    const reader = new FileReader();
    reader.onload = ev => {
      const b64 = (ev.target?.result as string).split(",")[1] || "";
      setSefazCertB64(b64);
    };
    reader.readAsDataURL(file);
  }

  function handleSaveSefaz() {
    if (!sefazForm.cnpj.replace(/\D/g, "")) { toast.error("Informe o CNPJ."); return; }
    saveSefazMut.mutate({
      companyId,
      cnpj: sefazForm.cnpj,
      uf: sefazForm.uf,
      ambiente: sefazForm.ambiente as any,
      syncEnabled: sefazForm.syncEnabled,
      syncHora: sefazForm.syncHora,
      ...(sefazCertB64 ? { certPfxBase64: sefazCertB64 } : {}),
      ...(sefazPassword ? { certPassword: sefazPassword } : {}),
    });
  }

  function fmtSyncAt(dt: string | null) {
    if (!dt) return "Nunca sincronizado";
    return new Date(dt).toLocaleString("pt-BR");
  }
  const [taxForm, setTaxForm] = useState<any>({});
  const [autoImportOn, setAutoImportOn] = useState(false);
  const [showAutoImport, setShowAutoImport] = useState(false);
  const [importMes, setImportMes] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const { data: taxConfig, refetch: refetchTax } = (trpc as any).financial.getTaxConfig.useQuery(
    { companyId }, { enabled: !!companyId }
  );
  const { data: partners } = (trpc as any).financial.getPartners.useQuery(
    { companyId }, { enabled: !!companyId }
  );

  useEffect(() => {
    if (taxConfig) {
      setTaxForm({ ...taxConfig });
      setAutoImportOn(Number(taxConfig.autoImportEnabled) === 1);
    }
  }, [taxConfig]);

  const updateTaxMut = (trpc as any).financial.updateTaxConfig.useMutation({
    onSuccess: () => { toast.success("Configuração tributária salva!"); refetchTax(); },
    onError: (e: any) => toast.error(e.message || "Erro ao salvar"),
  });

  const setAutoImportMut = (trpc as any).financial.setAutoImport.useMutation({
    onSuccess: (r: any) => {
      toast.success(r?.enabled ? "Importação automática ATIVADA." : "Importação automática DESATIVADA.");
      refetchTax();
    },
    onError: (e: any) => { setAutoImportOn(prev => !prev); toast.error(e.message || "Erro ao alterar"); },
  });

  const importMut = (trpc as any).financial.runAutoImport.useMutation({
    onSuccess: (r: any) => {
      toast.success(`Importação concluída! Folha: ${r.folha}, PJ: ${r.pj}, Parceiros: ${r.parceiros}`);
      setShowAutoImport(false);
    },
    onError: (e: any) => toast.error(e.message || "Erro na importação"),
  });

  const regimeLabel: Record<string, string> = {
    simples_nacional: "Simples Nacional",
    lucro_presumido: "Lucro Presumido",
    lucro_real: "Lucro Real",
    mei: "MEI",
  };

  return (
    <div className="border rounded-lg overflow-hidden border-emerald-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-emerald-50 border-b border-emerald-200">
        <div className="flex items-center gap-2 text-xs font-bold text-emerald-700 uppercase tracking-wider">
          <Banknote className="w-4 h-4" />
          Financeiro
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-emerald-700 h-7 px-2 text-xs hover:bg-emerald-100"
          onClick={() => setShowAutoImport(true)}
        >
          <RefreshCw className="w-3.5 h-3.5 mr-1" />
          Auto-Importar Dados
        </Button>
      </div>

      {/* Sub-seção: Importação Automática (toggle por empresa — default OFF) */}
      <div className="border-b border-emerald-100">
        <div className="flex items-start justify-between gap-3 px-4 py-3 bg-white">
          <div className="flex items-start gap-3">
            <Zap className={`w-4 h-4 mt-0.5 ${autoImportOn ? "text-emerald-500" : "text-gray-400"}`} />
            <div>
              <span className="font-medium text-gray-800 text-sm">Importação Automática de Dados</span>
              <p className="text-xs text-gray-500 mt-0.5 max-w-md">
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
      </div>

      {/* Sub-seção: Tributário */}
      <div className="border-b border-emerald-100 last:border-0">
        <button
          onClick={() => setExpanded(expanded === "tributario" ? null : "tributario")}
          className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-emerald-50/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <FileText className="w-4 h-4 text-emerald-500" />
            <span className="font-medium text-gray-800 text-sm">Configuração Tributária</span>
            {taxForm.regimeTributario && (
              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-xs">
                {regimeLabel[taxForm.regimeTributario] || taxForm.regimeTributario}
              </span>
            )}
          </div>
          <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${expanded === "tributario" ? "rotate-90" : ""}`} />
        </button>

        {expanded === "tributario" && (
          <div className="px-4 pb-4 bg-white space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">Regime Tributário</Label>
                <Select
                  value={taxForm.regimeTributario ?? "simples_nacional"}
                  onValueChange={v => setTaxForm((f: any) => ({ ...f, regimeTributario: v }))}
                >
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
                  <Label className="text-xs">Alíquota Simples (%)</Label>
                  <Input
                    type="number" step="0.01" className="mt-1"
                    value={taxForm.aliquotaSimples ?? ""}
                    onChange={e => setTaxForm((f: any) => ({ ...f, aliquotaSimples: e.target.value }))}
                  />
                </div>
              )}
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-600 mb-2">Alíquotas de Tributos</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {TAX_FIELDS.map(({ label, key }) => (
                  <div key={key}>
                    <Label className="text-xs">{label}</Label>
                    <Input
                      type="number" step="0.01" className="mt-1"
                      value={taxForm[key] ?? ""}
                      onChange={e => setTaxForm((f: any) => ({ ...f, [key]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t">
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={updateTaxMut.isPending}
                onClick={() => updateTaxMut.mutate({
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
                })}
              >
                <Save className="w-3.5 h-3.5 mr-1" />
                {updateTaxMut.isPending ? "Salvando..." : "Salvar Tributário"}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Sub-seção: Sócios */}
      <div>
        <button
          onClick={() => setExpanded(expanded === "socios" ? null : "socios")}
          className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-emerald-50/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Users className="w-4 h-4 text-emerald-500" />
            <span className="font-medium text-gray-800 text-sm">Sócios e Pró-labore</span>
            {partners && partners.length > 0 && (
              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-xs">
                {partners.length} sócio{partners.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${expanded === "socios" ? "rotate-90" : ""}`} />
        </button>

        {expanded === "socios" && (
          <div className="px-4 pb-4 bg-white space-y-3">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-3 text-sm text-emerald-900 flex items-start gap-2">
              <Users className="w-4 h-4 mt-0.5 flex-shrink-0 text-emerald-600" />
              <p>
                O cadastro dos sócios e o pró-labore agora ficam em um <strong>único local</strong>:{" "}
                <strong>Configurações → Sócios</strong>. Lá os sócios vêm direto do módulo Colaboradores
                (tipo "Sócio") e você define o administrador, a participação, o pró-labore e a chave PIX.
              </p>
            </div>
            {partners && partners.length > 0 && (
              <div className="space-y-2">
                {partners.map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
                    <div>
                      <p className="font-medium text-gray-800 text-sm">{p.nome}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {p.cargo ?? "Sócio"}{p.cpf ? ` • ${p.cpf}` : ""}
                        {p.pixChave ? ` • PIX: ${p.pixChave}` : ""}
                      </p>
                    </div>
                    <div className="text-right text-xs">
                      {p.percentualSociedade && <p className="font-semibold text-gray-700">{p.percentualSociedade}% soc.</p>}
                      {p.valorProLabore && <p className="text-emerald-700 font-medium">{fmtBRL(Number(p.valorProLabore))}/mês</p>}
                      <p className="text-gray-400">Venc. dia {p.diaVencimento ?? 5}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end">
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => onManageSocios?.()}
              >
                <Users className="w-3.5 h-3.5 mr-1" /> Gerenciar sócios em Configurações → Sócios
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Sub-seção: NF-e SEFAZ */}
      <div className="border-b border-emerald-100 last:border-0">
        <button
          onClick={() => setExpanded(expanded === "sefaz" ? null : "sefaz")}
          className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-emerald-50/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Shield className="w-4 h-4 text-emerald-500" />
            <span className="font-medium text-gray-800 text-sm">Integração SEFAZ (NF-e Recebidas)</span>
            {sefazCfg?.tem_certificado && (
              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-xs flex items-center gap-1">
                <CheckCircle className="w-3 h-3" /> Certificado OK
              </span>
            )}
            {!sefazCfg?.tem_certificado && sefazCfg && (
              <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> Sem certificado
              </span>
            )}
          </div>
          <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${expanded === "sefaz" ? "rotate-90" : ""}`} />
        </button>

        {expanded === "sefaz" && (
          <div className="px-4 pb-4 bg-white space-y-4">
            {/* Explicação */}
            <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 px-3 py-3 text-sm text-indigo-900 flex items-start gap-2">
              <Shield className="w-4 h-4 mt-0.5 shrink-0 text-indigo-600" />
              <p>
                Consulta automaticamente o WebService <strong>NFeDistribuicaoDFe</strong> da SEFAZ Federal
                e importa todas as NF-e onde o CNPJ da empresa é <strong>destinatário</strong>.
                Roda todo dia às 06:00. Requer certificado digital <strong>A1 (.pfx)</strong>.
              </p>
            </div>

            {/* Status da última sync */}
            {sefazCfg?.last_sync_at && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                <span>Última sincronização: <strong>{fmtSyncAt(sefazCfg.last_sync_at)}</strong></span>
                {(() => {
                  try {
                    const r = JSON.parse(sefazCfg.last_sync_result || "{}");
                    if (r.erro) return <span className="text-red-600 font-medium" title={r.erro}>— ❌ Erro: {r.erro.slice(0, 120)}</span>;
                    if (r.aviso) {
                      // Cooldown automático: calcular se ainda dentro do período
                      if (r.rateLimitedAt) {
                        const elapsedMin = Math.floor((Date.now() - new Date(r.rateLimitedAt).getTime()) / 60000);
                        const restMin = Math.max(0, 58 - elapsedMin);
                        return <span className="text-amber-600 font-medium">— ⚠️ Rate limit SEFAZ (cStat=656){restMin > 0 ? ` — aguardar ~${restMin} min` : " — pode tentar novamente"}</span>;
                      }
                      return <span className="text-amber-600 font-medium">— ⚠️ {r.aviso.slice(0, 100)}</span>;
                    }
                    return <span className="text-emerald-700">— {r.importadas ?? 0} importadas, {r.ignoradas ?? 0} ignoradas</span>;
                  } catch { return null; }
                })()}
              </div>
            )}

            {/* Sync automático toggle */}
            <div className="flex items-center justify-between gap-3 py-1">
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-gray-800">Sincronização automática horária</span>
                <p className="text-xs text-gray-500 mt-0.5">
                  Busca NF-e automaticamente <strong>toda hora</strong> (limite SEFAZ: 1 chamada/hora/CNPJ).
                  O histórico completo é trazido aos poucos — até 50 NF-e por hora, sem ação manual.
                </p>
              </div>
              <div className="flex flex-col items-end gap-0.5">
                <Switch
                  checked={sefazForm.syncEnabled}
                  onCheckedChange={v => setSefazForm(f => ({ ...f, syncEnabled: v }))}
                />
                <span className={`text-[11px] font-semibold ${sefazForm.syncEnabled ? "text-emerald-600" : "text-gray-400"}`}>
                  {sefazForm.syncEnabled ? "Ligada" : "Desligada"}
                </span>
              </div>
            </div>

            {/* Campos de configuração */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">CNPJ da Empresa</Label>
                <Input
                  className="mt-1 text-sm"
                  placeholder="00.000.000/0000-00"
                  value={sefazForm.cnpj}
                  onChange={e => setSefazForm(f => ({ ...f, cnpj: e.target.value }))}
                />
              </div>
              <div>
                <Label className="text-xs">UF (Estado)</Label>
                <Select value={sefazForm.uf} onValueChange={v => setSefazForm(f => ({ ...f, uf: v }))}>
                  <SelectTrigger className="mt-1 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"].map(uf => (
                      <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Ambiente</Label>
                <Select value={sefazForm.ambiente} onValueChange={v => setSefazForm(f => ({ ...f, ambiente: v }))}>
                  <SelectTrigger className="mt-1 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="producao">Produção</SelectItem>
                    <SelectItem value="homologacao">Homologação (Testes)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Certificado A1 */}
            <div className="space-y-2">
              <Label className="text-xs">Certificado Digital A1 (.pfx)</Label>
              <div className="flex items-center gap-2">
                <input ref={fileInputRef} type="file" accept=".pfx,.p12" className="hidden" onChange={handleCertFile} />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-xs border-indigo-300 text-indigo-700 hover:bg-indigo-50"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="w-3.5 h-3.5 mr-1" />
                  {sefazCertName || (sefazCfg?.tem_certificado ? "Substituir .pfx" : "Selecionar .pfx")}
                </Button>
                {sefazCertName && <span className="text-xs text-emerald-600 font-medium">✓ {sefazCertName}</span>}
                {!sefazCertName && sefazCfg?.tem_certificado && (
                  <span className="text-xs text-emerald-600">Certificado já cadastrado</span>
                )}
              </div>
              <div>
                <Label className="text-xs">Senha do Certificado</Label>
                <Input
                  type="password"
                  className="mt-1 text-sm max-w-xs"
                  placeholder={sefazCfg?.tem_certificado ? "••••••• (deixe em branco para manter)" : "Senha do .pfx"}
                  value={sefazPassword}
                  onChange={e => setSefazPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
            </div>

            {/* Ações */}
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={saveSefazMut.isPending}
                onClick={handleSaveSefaz}
              >
                {saveSefazMut.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1" />}
                Salvar Configuração
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-indigo-300 text-indigo-700 hover:bg-indigo-50"
                disabled={!sefazCfg?.tem_certificado || syncNowMut.isPending}
                onClick={() => syncNowMut.mutate({ companyId })}
              >
                {syncNowMut.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Play className="w-3.5 h-3.5 mr-1" />}
                Sincronizar Agora
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-slate-500 text-xs"
                disabled={resetNSUMut.isPending}
                onClick={() => resetNSUMut.mutate({ companyId })}
                title="Zera o NSU — próxima sync buscará todas as NF-e desde o início"
              >
                <RotateCcw className="w-3 h-3 mr-1" />
                Resetar NSU
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Sub-seção: NFS-e Emitidas Municipais */}
      <div className="border-b border-emerald-100 last:border-0">
        <button
          onClick={() => setExpanded(expanded === "nfseMun" ? null : "nfseMun")}
          className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-emerald-50/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <FileText className="w-4 h-4 text-blue-500" />
            <span className="font-medium text-gray-800 text-sm">NFS-e Emitidas (Prefeituras Municipais)</span>
            {municipios && municipios.filter((m: any) => m.inscricao_municipal).length > 0 && (
              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs flex items-center gap-1">
                <CheckCircle className="w-3 h-3" /> {municipios.filter((m: any) => m.inscricao_municipal).length} configurada(s)
              </span>
            )}
          </div>
          <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${expanded === "nfseMun" ? "rotate-90" : ""}`} />
        </button>

        {expanded === "nfseMun" && (
          <div className="px-4 pb-4 bg-white space-y-3">
            {/* Explicação */}
            <div className="rounded-lg border border-blue-200 bg-blue-50/60 px-3 py-3 text-sm text-blue-900 flex items-start gap-2">
              <FileText className="w-4 h-4 mt-0.5 shrink-0 text-blue-600" />
              <p>
                Consulta NFS-e <strong>emitidas pela empresa</strong> nos portais das prefeituras municipais.
                Informe a <strong>Inscrição Municipal</strong> (= login do portal) e a <strong>senha</strong> de cada cidade.
                O botão "Sincronizar" importa as notas para a aba <strong>NFS-e Emitidas</strong>.
              </p>
            </div>

            {/* ── Painel "Baixar Tudo" ── */}
            <div className="rounded-xl border-2 border-dashed border-blue-300 bg-blue-50/40 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
                  <RefreshCw className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-blue-900">Baixar Tudo — Consolidar Base</p>
                  <p className="text-[11px] text-blue-700">Importa NFS-e de <strong>todos os municípios</strong> configurados de uma vez. Use para montar o histórico completo.</p>
                </div>
              </div>

              {/* Período */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-600 whitespace-nowrap font-medium">De</span>
                  <Input type="date" className="h-8 text-xs w-36 bg-white" value={bulkDe} onChange={e => { setBulkDe(e.target.value); setBulkResult(null); }} />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-600 whitespace-nowrap font-medium">Até</span>
                  <Input type="date" className="h-8 text-xs w-36 bg-white" value={bulkAte} onChange={e => { setBulkAte(e.target.value); setBulkResult(null); }} />
                </div>
                {(bulkDe || bulkAte) && (
                  <button className="text-[10px] text-gray-400 hover:text-gray-600 underline" onClick={() => { setBulkDe(""); setBulkAte(""); setBulkResult(null); }}>limpar datas</button>
                )}
              </div>
              {!bulkDe && (
                <p className="text-[10px] text-blue-600 bg-blue-100 rounded px-2 py-1 inline-block">
                  💡 Sem data inicial → usa os últimos 30 dias. Para o histórico completo, coloque a data de abertura da empresa.
                </p>
              )}

              <Button
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-8 px-4 w-full sm:w-auto"
                disabled={syncAllMut.isPending}
                onClick={() => {
                  setBulkResult(null);
                  syncAllMut.mutate({ companyId, dataInicial: bulkDe || undefined, dataFinal: bulkAte || undefined });
                }}
              >
                {syncAllMut.isPending
                  ? <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />Importando... aguarde</>
                  : <><RefreshCw className="w-3.5 h-3.5 mr-2" />Baixar Tudo</>
                }
              </Button>

              {/* Resultado */}
              {bulkResult && (
                <div className="rounded-lg border border-blue-200 bg-white p-3 space-y-2 text-xs">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-semibold text-gray-700">{bulkResult.municipios} município(s)</span>
                    <span className="text-emerald-700 font-semibold">✓ {bulkResult.totalImportadas} importadas</span>
                    <span className="text-gray-500">{bulkResult.totalIgnoradas} ignoradas (já existiam)</span>
                  </div>
                  {bulkResult.resultados.map((r: any) => (
                    <div key={r.ibge} className={`flex items-center justify-between px-2 py-1 rounded ${r.erro ? "bg-red-50 border border-red-200" : "bg-gray-50 border border-gray-100"}`}>
                      <span className="font-medium">{r.nome} <span className="text-gray-400 font-normal">{r.uf}</span></span>
                      {r.erro
                        ? <span className="text-red-600 text-[10px]">❌ {r.erro.slice(0, 80)}</span>
                        : <span className="text-emerald-700">{r.importadas} import. · {r.ignoradas} ignor.</span>
                      }
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Cards de cada município */}
            {(municipios || []).map((mun: any) => {
              const ibge = Number(mun.ibge_code);
              const form = munForms[ibge] || { inscricao: "", senha: "", enabled: false, syncHora: 6 };
              const isSyncing = syncMunMut.isPending && (syncMunMut.variables as any)?.ibgeCode === ibge;
              const isSaving = saveMunMut.isPending && (saveMunMut.variables as any)?.ibgeCode === ibge;

              let syncResult: { importadas?: number; ignoradas?: number; erro?: string; aviso?: string } = {};
              try { syncResult = JSON.parse(mun.last_sync_result || "{}"); } catch {}

              const providerBadge: Record<string, { label: string; color: string }> = {
                nfse_nacional: { label: "NFS-e Nacional", color: "bg-indigo-100 text-indigo-700" },
                sil: { label: "SIL Tecnologia", color: "bg-violet-100 text-violet-700" },
                giap: { label: "GIAP / Token", color: "bg-amber-100 text-amber-700" },
                tinus: { label: "TINUS ABRASF", color: "bg-teal-100 text-teal-700" },
                siapgeo: { label: "SIAP GEO", color: "bg-sky-100 text-sky-700" },
              };
              const badge = providerBadge[mun.provider] || { label: mun.provider, color: "bg-gray-100 text-gray-600" };

              return (
                <div key={ibge} className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                  {/* Header do card */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-800 text-sm">{mun.nome_municipio}</span>
                      <span className="text-xs font-medium text-gray-400">{mun.uf}</span>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${badge.color}`}>{badge.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {form.inscricao ? (
                        <span className="text-[10px] text-emerald-700 font-semibold flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" /> Configurado
                        </span>
                      ) : (
                        <span className="text-[10px] text-amber-600 font-semibold flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> Sem inscrição
                        </span>
                      )}
                      <button
                        title="Remover cidade"
                        className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                        onClick={() => setConfirmDeleteIbge(ibge)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Campos */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs text-gray-600">Inscrição Municipal / Login</Label>
                      <Input
                        className="mt-1 text-sm h-8"
                        placeholder="Ex: 13239401"
                        value={form.inscricao}
                        onChange={e => setMunForms(f => ({ ...f, [ibge]: { ...f[ibge], inscricao: e.target.value } }))}
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-600">Senha do Portal</Label>
                      <Input
                        type="password"
                        className="mt-1 text-sm h-8"
                        placeholder="••••••••"
                        value={form.senha}
                        onChange={e => setMunForms(f => ({ ...f, [ibge]: { ...f[ibge], senha: e.target.value } }))}
                      />
                    </div>
                  </div>

                  {/* Toggle sync + última sync + horário */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Switch
                        checked={form.enabled}
                        onCheckedChange={v => setMunForms(f => ({ ...f, [ibge]: { ...f[ibge], enabled: v } }))}
                      />
                      <span className={`text-[11px] font-medium ${form.enabled ? "text-emerald-600" : "text-gray-400"}`}>
                        {form.enabled ? "Sync automático ligado" : "Sync automático desligado"}
                      </span>
                      {/* Seletor de hora */}
                      <div className="flex items-center gap-1.5 ml-1">
                        <span className="text-[10px] text-gray-500">às</span>
                        <Select
                          value={String(form.syncHora ?? 6)}
                          onValueChange={v => setMunForms(f => ({ ...f, [ibge]: { ...f[ibge], syncHora: Number(v) } }))}
                        >
                          <SelectTrigger className="h-6 text-[11px] w-20 px-2">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: 24 }, (_, h) => (
                              <SelectItem key={h} value={String(h)}>
                                {String(h).padStart(2, "0")}:00
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    {mun.last_sync_at && (
                      <span className="text-[10px] text-slate-400">
                        {new Date(mun.last_sync_at).toLocaleString("pt-BR")}
                      </span>
                    )}
                  </div>

                  {/* Resultado da última sync */}
                  {mun.last_sync_at && (
                    <div className="text-[11px] px-2 py-1 rounded bg-white border border-slate-200">
                      {syncResult.erro
                        ? <span className="text-red-600">❌ {syncResult.erro.slice(0, 100)}</span>
                        : syncResult.aviso
                        ? <span className="text-amber-600">⚠️ {syncResult.aviso.slice(0, 100)}</span>
                        : <span className="text-emerald-700">✓ {syncResult.importadas ?? 0} importadas, {syncResult.ignoradas ?? 0} ignoradas</span>
                      }
                    </div>
                  )}

                  {/* Período de importação */}
                  <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                    <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Período de importação</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-gray-500 whitespace-nowrap">De</span>
                        <Input
                          type="date"
                          className="h-7 text-xs w-36 px-2"
                          value={munPeriodo[ibge]?.de || ""}
                          onChange={e => setMunPeriodo(p => ({ ...p, [ibge]: { ...p[ibge], de: e.target.value, ate: p[ibge]?.ate || "" } }))}
                        />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-gray-500 whitespace-nowrap">Até</span>
                        <Input
                          type="date"
                          className="h-7 text-xs w-36 px-2"
                          value={munPeriodo[ibge]?.ate || ""}
                          onChange={e => setMunPeriodo(p => ({ ...p, [ibge]: { ...p[ibge], ate: e.target.value, de: p[ibge]?.de || "" } }))}
                        />
                      </div>
                      {(munPeriodo[ibge]?.de || munPeriodo[ibge]?.ate) && (
                        <button
                          className="text-[10px] text-gray-400 hover:text-gray-600 underline"
                          onClick={() => setMunPeriodo(p => ({ ...p, [ibge]: { de: "", ate: "" } }))}
                        >
                          limpar
                        </button>
                      )}
                    </div>
                    {!munPeriodo[ibge]?.de && !munPeriodo[ibge]?.ate && (
                      <p className="text-[10px] text-gray-400">Sem datas → importa os últimos 30 dias.</p>
                    )}
                  </div>

                  {/* Ações */}
                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-7 px-3"
                      disabled={isSaving}
                      onClick={() => saveMunMut.mutate({
                        companyId,
                        ibgeCode: ibge,
                        inscricaoMunicipal: form.inscricao,
                        token: form.senha,
                        enabled: form.enabled,
                        syncHora: form.syncHora,
                      })}
                    >
                      {isSaving ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Save className="w-3 h-3 mr-1" />}
                      Salvar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-blue-300 text-blue-700 hover:bg-blue-50 text-xs h-7 px-3"
                      disabled={isSyncing || !form.inscricao}
                      title={!form.inscricao ? "Preencha a Inscrição Municipal primeiro" : ""}
                      onClick={() => syncMunMut.mutate({
                        companyId,
                        ibgeCode: ibge,
                        dataInicial: munPeriodo[ibge]?.de || undefined,
                        dataFinal: munPeriodo[ibge]?.ate || undefined,
                      })}
                    >
                      {isSyncing ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Play className="w-3 h-3 mr-1" />}
                      {munPeriodo[ibge]?.de ? "Sincronizar Período" : "Sincronizar Agora"}
                    </Button>
                  </div>
                </div>
              );
            })}

            {/* Botão adicionar nova cidade */}
            <Button
              size="sm"
              variant="outline"
              className="w-full border-dashed border-blue-300 text-blue-600 hover:bg-blue-50 hover:border-blue-400 text-xs h-8"
              onClick={() => { resetAddForm(); setShowAddDialog(true); }}
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" /> Adicionar Cidade
            </Button>

            {(!municipios || municipios.length === 0) && (
              <div className="text-center text-gray-400 text-sm py-4">Carregando municípios...</div>
            )}
          </div>
        )}
      </div>

      {/* Dialog: Nova Cidade */}
      <Dialog open={showAddDialog} onOpenChange={v => { setShowAddDialog(v); if (!v) resetAddForm(); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Plus className="w-4 h-4 text-blue-600" /> Nova Cidade
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <Label className="text-xs text-gray-600">Nome do Município *</Label>
                <Input
                  className="mt-1 text-sm h-8"
                  placeholder="Ex: São Paulo"
                  value={addForm.nome}
                  onChange={e => setAddForm(f => ({ ...f, nome: e.target.value }))}
                />
              </div>
              <div>
                <Label className="text-xs text-gray-600">UF *</Label>
                <Select value={addForm.uf} onValueChange={v => setAddForm(f => ({ ...f, uf: v }))}>
                  <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {UF_LIST.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-xs text-gray-600">Sistema / Portal *</Label>
              <Select value={addForm.provider} onValueChange={v => setAddForm(f => ({ ...f, provider: v }))}>
                <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROVIDER_OPTIONS.map(p => (
                    <SelectItem key={p.value} value={p.value}>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded mr-2 ${p.color}`}>{p.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-gray-600">Inscrição Municipal / Login</Label>
                <Input
                  className="mt-1 text-sm h-8"
                  placeholder="Ex: 13239401"
                  value={addForm.inscricao}
                  onChange={e => setAddForm(f => ({ ...f, inscricao: e.target.value }))}
                />
              </div>
              <div>
                <Label className="text-xs text-gray-600">Senha do Portal</Label>
                <Input
                  type="password"
                  className="mt-1 text-sm h-8"
                  placeholder="••••••••"
                  value={addForm.senha}
                  onChange={e => setAddForm(f => ({ ...f, senha: e.target.value }))}
                />
              </div>
            </div>

            {/* Avançado: endpoint + ibge */}
            <button
              className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-700"
              onClick={() => setAddForm(f => ({ ...f, showEndpoint: !f.showEndpoint }))}
            >
              <ChevronDown className={`w-3 h-3 transition-transform ${addForm.showEndpoint ? "rotate-180" : ""}`} />
              Configurações avançadas (endpoint / código IBGE)
            </button>
            {addForm.showEndpoint && (
              <div className="space-y-2 pt-1 border-t border-slate-100">
                <div>
                  <Label className="text-xs text-gray-600">Endpoint WebService (opcional)</Label>
                  <Input
                    className="mt-1 text-sm h-8 font-mono text-[11px]"
                    placeholder="https://..."
                    value={addForm.endpoint}
                    onChange={e => setAddForm(f => ({ ...f, endpoint: e.target.value }))}
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">Deixe em branco para usar o padrão do sistema selecionado.</p>
                </div>
                <div>
                  <Label className="text-xs text-gray-600">Código IBGE (7 dígitos, opcional)</Label>
                  <Input
                    className="mt-1 text-sm h-8"
                    placeholder="Ex: 3550308"
                    value={addForm.ibge}
                    maxLength={7}
                    onChange={e => setAddForm(f => ({ ...f, ibge: e.target.value.replace(/\D/g, "") }))}
                  />
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => { setShowAddDialog(false); resetAddForm(); }}>Cancelar</Button>
            <Button
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white"
              disabled={!addForm.nome.trim() || addMunMut.isPending}
              onClick={() => addMunMut.mutate({
                companyId,
                nomeMunicipio: addForm.nome.trim(),
                uf: addForm.uf,
                provider: addForm.provider,
                endpoint: addForm.endpoint || undefined,
                inscricaoMunicipal: addForm.inscricao || undefined,
                token: addForm.senha || undefined,
                ibgeCode: addForm.ibge ? Number(addForm.ibge) : undefined,
              })}
            >
              {addMunMut.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Plus className="w-3.5 h-3.5 mr-1" />}
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog: Confirmar exclusão de cidade */}
      <AlertDialog open={confirmDeleteIbge !== null} onOpenChange={v => { if (!v) setConfirmDeleteIbge(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover cidade?</AlertDialogTitle>
            <AlertDialogDescription>
              A configuração da cidade será removida. As NFS-e já importadas <strong>não são apagadas</strong>.
              Você pode adicionar a cidade novamente a qualquer momento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => confirmDeleteIbge !== null && deleteMunMut.mutate({ companyId, ibgeCode: confirmDeleteIbge })}
            >
              {deleteMunMut.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null}
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal: Auto-Importar */}
      <Dialog open={showAutoImport} onOpenChange={setShowAutoImport}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Auto-Importar Dados Financeiros</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Importa automaticamente folha CLT, pagamentos PJ e lançamentos de parceiros como lançamentos financeiros.
            </p>
            <div>
              <Label className="text-sm">Mês de Referência</Label>
              <Input type="month" className="mt-1" value={importMes} onChange={e => setImportMes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAutoImport(false)}>Cancelar</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={importMut.isPending}
              onClick={() => importMut.mutate({ companyId, mesCompetencia: importMes })}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${importMut.isPending ? "animate-spin" : ""}`} />
              {importMut.isPending ? "Importando..." : "Importar Agora"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
