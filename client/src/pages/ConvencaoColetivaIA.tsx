import { useState, useMemo, useRef } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  FileSearch, Upload, Loader2, CheckCircle2, AlertTriangle, Eye, Trash2,
  Brain, FileText, Sparkles, ArrowLeft, Save, Building2, Calendar, DollarSign, Users,
} from "lucide-react";

type ViewMode = "lista" | "relatorio";

// Campos extraídos exibidos no relatório (label + agrupamento)
const CAMPOS_EXTRACAO: { key: string; label: string; grupo: string; mono?: boolean }[] = [
  { key: "sindicato", label: "Sindicato", grupo: "Identificação" },
  { key: "cnpjSindicato", label: "CNPJ do Sindicato", grupo: "Identificação" },
  { key: "numeroCct", label: "Nº da CCT", grupo: "Identificação" },
  { key: "dataBase", label: "Data-base", grupo: "Identificação" },
  { key: "vigenciaInicio", label: "Vigência início", grupo: "Identificação" },
  { key: "vigenciaFim", label: "Vigência fim", grupo: "Identificação" },
  { key: "dataRetroativoInicio", label: "Retroativo desde", grupo: "Identificação" },
  { key: "percentualReajuste", label: "% Reajuste", grupo: "Salário", mono: true },
  { key: "pisoSalarial", label: "Piso salarial (novo)", grupo: "Salário", mono: true },
  { key: "pisoSalarialAnterior", label: "Piso anterior", grupo: "Salário", mono: true },
  { key: "valeAlimentacao", label: "Vale Alimentação (VA)", grupo: "Benefícios", mono: true },
  { key: "valeRefeicao", label: "Vale Refeição (VR)", grupo: "Benefícios", mono: true },
  { key: "valeTransporte", label: "Vale Transporte (VT)", grupo: "Benefícios", mono: true },
  { key: "cestaBasica", label: "Cesta básica / Café", grupo: "Benefícios", mono: true },
  { key: "auxilioFarmacia", label: "Auxílio Farmácia", grupo: "Benefícios", mono: true },
  { key: "seguroVida", label: "Seguro de Vida", grupo: "Benefícios", mono: true },
  { key: "adicionalInsalubridade", label: "Ad. Insalubridade", grupo: "Adicionais", mono: true },
  { key: "adicionalPericulosidade", label: "Ad. Periculosidade", grupo: "Adicionais", mono: true },
  { key: "adicionalNoturno", label: "Ad. Noturno", grupo: "Adicionais", mono: true },
  { key: "horaExtraDiurna", label: "HE Diurna", grupo: "Adicionais", mono: true },
  { key: "horaExtraNoturna", label: "HE Noturna", grupo: "Adicionais", mono: true },
  { key: "horaExtraDomingo", label: "HE Domingo/Feriado", grupo: "Adicionais", mono: true },
  { key: "contribuicaoAssistencial", label: "Contribuição Assistencial", grupo: "Sindical", mono: true },
];

const GRUPOS = ["Identificação", "Salário", "Benefícios", "Adicionais", "Sindical"];

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  processando: { label: "Processando", cls: "bg-blue-100 text-blue-700 border-blue-200" },
  analisado: { label: "Analisado", cls: "bg-amber-100 text-amber-700 border-amber-200" },
  aplicado: { label: "Aplicado", cls: "bg-green-100 text-green-700 border-green-200" },
  erro: { label: "Erro", cls: "bg-red-100 text-red-700 border-red-200" },
};

const brl = (v: any) => {
  const n = Number(String(v ?? "").replace(/\./g, "").replace(",", ".")) || Number(v) || 0;
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function ConvencaoColetivaIA() {
  const { companyIdNum, getCompanyIdsForQuery } = useCompany();
  const companyId = companyIdNum;
  const companyIds = getCompanyIdsForQuery();
  const { user } = useAuth();
  const isMaster = user?.role === "admin_master";

  const [viewMode, setViewMode] = useState<ViewMode>("lista");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [ano, setAno] = useState(new Date().getFullYear());
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [analiseProgress, setAnaliseProgress] = useState(0);
  const analiseIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const utils = trpc.useUtils();
  const listaQuery = trpc.convencaoIA.listar.useQuery({ companyId, companyIds }, { enabled: !!companyId });

  function _stopAnaliseInterval() {
    if (analiseIntervalRef.current) { clearInterval(analiseIntervalRef.current); analiseIntervalRef.current = null; }
  }
  function _startAnaliseInterval() {
    _stopAnaliseInterval();
    setAnaliseProgress(0);
    analiseIntervalRef.current = setInterval(() => {
      setAnaliseProgress((p) => {
        if (p >= 90) return p;
        return Math.min(90, p + (0.4 + Math.random() * 1.2));
      });
    }, 700);
  }

  const processarMut = trpc.convencaoIA.processarPdf.useMutation({
    onSuccess: (data) => {
      _stopAnaliseInterval();
      setAnaliseProgress(100);
      setTimeout(() => setAnaliseProgress(0), 800);
      toast.success("PDF analisado pela IA com sucesso!");
      utils.convencaoIA.listar.invalidate();
      setShowUpload(false);
      setFile(null);
      setSelectedId(data.id);
      setViewMode("relatorio");
    },
    onError: (e) => {
      _stopAnaliseInterval();
      setAnaliseProgress(0);
      toast.error(e.message);
    },
  });

  const handleUpload = async () => {
    if (!file) return toast.error("Selecione o PDF da convenção.");
    if (!companyId) return toast.error("Selecione uma empresa.");
    _startAnaliseInterval();
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1] || "";
      processarMut.mutate({
        companyId,
        anoReferencia: ano,
        fileBase64: base64,
        fileName: file.name,
        mimeType: file.type || "application/pdf",
      });
    };
    reader.onerror = () => { _stopAnaliseInterval(); setAnaliseProgress(0); toast.error("Falha ao ler o arquivo."); };
    reader.readAsDataURL(file);
  };

  const lista = listaQuery.data || [];

  // ===================== RELATÓRIO =====================
  if (viewMode === "relatorio" && selectedId) {
    return (
      <DashboardLayout>
        <RelatorioView
          analiseId={selectedId}
          companyId={companyId}
          companyIds={companyIds}
          isMaster={isMaster}
          onVoltar={() => { setViewMode("lista"); setSelectedId(null); utils.convencaoIA.listar.invalidate(); }}
        />
      </DashboardLayout>
    );
  }

  // ===================== LISTA / HISTÓRICO =====================
  return (
    <DashboardLayout>
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-100 text-indigo-700">
            <FileSearch className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              Convenção Coletiva (IA)
              <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200 gap-1">
                <Sparkles className="w-3 h-3" /> IA
              </Badge>
            </h1>
            <p className="text-sm text-muted-foreground">
              Suba o PDF da CCT/circular do ano. A IA extrai todas as mudanças e você aplica o reajuste de salários e benefícios em massa.
            </p>
          </div>
        </div>
        <Button onClick={() => setShowUpload(true)} className="bg-indigo-600 hover:bg-indigo-700">
          <Upload className="w-4 h-4 mr-2" /> Nova Análise
        </Button>
      </div>

      {listaQuery.isLoading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
      ) : lista.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <FileSearch className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p className="font-medium">Nenhuma análise ainda</p>
            <p className="text-sm mt-1">Clique em "Nova Análise" para subir o PDF da convenção coletiva.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {lista.map((a: any) => {
            const badge = STATUS_BADGE[a.status] || STATUS_BADGE.analisado;
            return (
              <Card key={a.id} className="hover:shadow-md transition-shadow">
                <CardContent className="py-4 flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="p-2 rounded-lg bg-muted shrink-0"><FileText className="w-5 h-5 text-muted-foreground" /></div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-lg">{a.anoReferencia}</span>
                        <Badge variant="outline" className={badge.cls}>{badge.label}</Badge>
                        {a.percentualReajuste && <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">{a.percentualReajuste}%</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {a.sindicato || "Sindicato não identificado"}
                        {a.numeroCct ? ` • CCT ${a.numeroCct}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground/70 truncate">
                        {a.documentoNome} • por {a.criadoPor || "—"}
                        {a.aplicadoEm ? ` • aplicado em ${new Date(a.aplicadoEm).toLocaleDateString("pt-BR")}` : ""}
                      </p>
                      {a.status === "erro" && a.erroMensagem && (
                        <p className="text-xs text-red-600 mt-1 line-clamp-2">{a.erroMensagem}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {a.documentoUrl && (
                      <a href={a.documentoUrl} target="_blank" rel="noreferrer">
                        <Button variant="outline" size="sm"><FileText className="w-4 h-4 mr-1" /> PDF</Button>
                      </a>
                    )}
                    {a.status !== "erro" && (
                      <Button size="sm" onClick={() => { setSelectedId(a.id); setViewMode("relatorio"); }}>
                        <Eye className="w-4 h-4 mr-1" /> {a.status === "aplicado" ? "Ver" : "Analisar"}
                      </Button>
                    )}
                    {isMaster && a.status !== "aplicado" && (
                      <ExcluirBtn id={a.id} onDone={() => utils.convencaoIA.listar.invalidate()} />
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialog Upload */}
      <Dialog open={showUpload} onOpenChange={(o) => { if (!processarMut.isPending) setShowUpload(o); }}>
        <DialogContent className="p-0 overflow-hidden gap-0 w-[640px] max-w-[calc(100vw-2rem)]" resizable={false} maximizable={false}>
          {/* Header colorido */}
          <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 px-6 py-5 flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                <Brain className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-white font-semibold text-base leading-tight">Nova Análise por IA</h2>
                <p className="text-indigo-200 text-xs mt-0.5">Extração automática da CCT/Circular</p>
              </div>
            </div>
          </div>

          {/* Corpo */}
          <div className="px-6 pt-5 pb-4 space-y-4">

            {/* Ano + upload lado a lado */}
            <div className="flex items-end gap-3">
              <div className="w-28 shrink-0">
                <Label className="text-xs font-medium text-slate-600">Ano de referência</Label>
                <Input
                  type="number"
                  value={ano}
                  onChange={(e) => setAno(parseInt(e.target.value) || ano)}
                  className="mt-1 h-9 text-center font-semibold text-slate-800"
                />
              </div>
              <div className="flex-1">
                <Label className="text-xs font-medium text-slate-600">PDF da Convenção / Circular</Label>
                <div
                  onClick={() => fileRef.current?.click()}
                  className={`mt-1 h-9 flex items-center gap-2 px-3 rounded-md border-2 border-dashed cursor-pointer transition-all text-sm
                    ${file
                      ? "border-indigo-400 bg-indigo-50 text-indigo-700"
                      : "border-slate-300 bg-slate-50 text-slate-500 hover:border-indigo-300 hover:bg-indigo-50/40"
                    }`}
                >
                  {file ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-indigo-500" />
                      <span className="truncate font-medium text-xs">{file.name}</span>
                      <span className="text-xs text-indigo-400 shrink-0">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 shrink-0" />
                      <span className="text-xs">Selecionar arquivo PDF</span>
                    </>
                  )}
                </div>
                <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] || null)} />
              </div>
            </div>

            {/* Aviso compacto */}
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <p className="text-xs text-amber-700">A IA extrai os valores — revise no relatório antes de aplicar. Nada muda automaticamente.</p>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-6 py-3 bg-slate-50 border-t border-slate-100">
            <Button variant="ghost" size="sm" onClick={() => setShowUpload(false)} disabled={processarMut.isPending} className="text-slate-600">
              Cancelar
            </Button>
            <Button
              onClick={handleUpload}
              disabled={processarMut.isPending || !file}
              className="relative overflow-hidden bg-indigo-600 hover:bg-indigo-700 min-w-[160px]"
            >
              {processarMut.isPending && (
                <span
                  className="absolute inset-0 bg-white/15 transition-all duration-700"
                  style={{ width: `${analiseProgress}%` }}
                />
              )}
              <span className="relative flex items-center gap-1.5">
                {processarMut.isPending
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Analisando… {Math.round(analiseProgress)}%</>
                  : <><Brain className="w-3.5 h-3.5" /> Analisar com IA</>
                }
              </span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
    </DashboardLayout>
  );
}

function ExcluirBtn({ id, onDone }: { id: number; onDone: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const mut = trpc.convencaoIA.excluir.useMutation({
    onSuccess: () => { toast.success("Análise excluída."); onDone(); setConfirm(false); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <>
      <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => setConfirm(true)}>
        <Trash2 className="w-4 h-4" />
      </Button>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader><DialogTitle>Excluir análise?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Esta análise (não aplicada) será removida. Esta ação não afeta funcionários.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => mut.mutate({ id })} disabled={mut.isPending}>
              {mut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ===================== RELATÓRIO + SIMULAÇÃO + APLICAÇÃO =====================
function RelatorioView({ analiseId, companyId, companyIds, isMaster, onVoltar }: {
  analiseId: number; companyId: number; companyIds: number[]; isMaster: boolean; onVoltar: () => void;
}) {
  const utils = trpc.useUtils();
  const detalheQuery = trpc.convencaoIA.buscarPorId.useQuery({ id: analiseId });
  const simularQuery = trpc.convencaoIA.simular.useQuery({ analiseId, companyId, companyIds });

  const [editValues, setEditValues] = useState<Record<string, any> | null>(null);
  const [excludedFuncs, setExcludedFuncs] = useState<Set<number>>(new Set());
  const [excludedCampos, setExcludedCampos] = useState<Set<string>>(new Set());
  const [showAplicar, setShowAplicar] = useState(false);

  const salvarMut = trpc.convencaoIA.atualizarExtracao.useMutation({
    onSuccess: () => { toast.success("Ajustes salvos."); utils.convencaoIA.buscarPorId.invalidate(); utils.convencaoIA.simular.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const aplicarMut = trpc.convencaoIA.aplicar.useMutation({
    onSuccess: (data) => {
      toast.success(`Aplicado a ${data.funcionariosAplicados} funcionário(s) — ${data.camposAplicados} alteração(ões).`);
      utils.convencaoIA.buscarPorId.invalidate();
      utils.convencaoIA.simular.invalidate();
      utils.convencaoIA.listar.invalidate();
      setShowAplicar(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const detalhe = detalheQuery.data;
  const sim = simularQuery.data;
  const aplicado = detalhe?.status === "aplicado";

  const extracao = useMemo(() => editValues ?? (detalhe?.extracao || {}), [editValues, detalhe]);

  const setCampo = (k: string, v: string) => {
    setEditValues((prev) => ({ ...(prev ?? detalhe?.extracao ?? {}), [k]: v }));
  };

  const toggleFunc = (id: number) => {
    setExcludedFuncs((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const toggleCampo = (k: string) => {
    setExcludedCampos((prev) => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });
  };

  if (detalheQuery.isLoading || !detalhe) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin" /></div>;
  }

  const beneficiosCct = sim?.beneficiosCct || [];
  const simulacao = sim?.simulacao || [];
  const incluidos = simulacao.filter((s: any) => !excludedFuncs.has(s.employeeId));

  // Campos aplicáveis (salário + benefícios disponíveis no CCT)
  const camposAplicaveis: { key: string; label: string }[] = [];
  if (Number(extracao.percentualReajuste) > 0) camposAplicaveis.push({ key: "salario", label: "Salário (reajuste)" });
  for (const b of beneficiosCct) if (b.aplicavel) camposAplicaveis.push({ key: b.key, label: b.label });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <Button variant="ghost" size="sm" onClick={onVoltar} className="mb-2"><ArrowLeft className="w-4 h-4 mr-1" /> Voltar</Button>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            Relatório — Convenção {detalhe.anoReferencia}
            <Badge variant="outline" className={(STATUS_BADGE[detalhe.status] || STATUS_BADGE.analisado).cls}>
              {(STATUS_BADGE[detalhe.status] || STATUS_BADGE.analisado).label}
            </Badge>
          </h2>
          <p className="text-sm text-muted-foreground flex items-center gap-3 flex-wrap mt-1">
            <span className="flex items-center gap-1"><Building2 className="w-3.5 h-3.5" /> {extracao.sindicato || "—"}</span>
            <span className="flex items-center gap-1"><FileText className="w-3.5 h-3.5" /> CCT {extracao.numeroCct || "—"}</span>
            {detalhe.documentoUrl && <a href={detalhe.documentoUrl} target="_blank" rel="noreferrer" className="text-indigo-600 underline">ver PDF</a>}
          </p>
        </div>
        {!aplicado && (
          <div className="flex gap-2">
            {editValues && (
              <Button variant="outline" onClick={() => salvarMut.mutate({ id: analiseId, extracao: editValues })} disabled={salvarMut.isPending}>
                {salvarMut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />} Salvar ajustes
              </Button>
            )}
            {isMaster ? (
              <Button onClick={() => setShowAplicar(true)} className="bg-green-600 hover:bg-green-700" disabled={camposAplicaveis.length === 0}>
                <CheckCircle2 className="w-4 h-4 mr-2" /> Aplicar
              </Button>
            ) : (
              <Badge variant="outline" className="bg-muted text-muted-foreground self-center">Apenas Admin Master aplica</Badge>
            )}
          </div>
        )}
      </div>

      {aplicado && (
        <Card className="border-green-200 bg-green-50/50">
          <CardContent className="py-3 flex items-center gap-3 text-sm">
            <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
            <span>Esta convenção já foi aplicada em {detalhe.aplicadoEm ? new Date(detalhe.aplicadoEm).toLocaleString("pt-BR") : "—"} por {detalhe.aplicadoPor || "—"}. As alterações estão registradas e não podem ser reaplicadas.</span>
          </CardContent>
        </Card>
      )}

      {/* Campos extraídos */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Brain className="w-4 h-4 text-indigo-600" /> Mudanças extraídas pela IA</CardTitle>
          {!aplicado && <p className="text-xs text-muted-foreground">Revise e ajuste os valores antes de aplicar. Valores monetários sem "R$", use ponto decimal (ex.: 1800.00).</p>}
        </CardHeader>
        <CardContent className="space-y-5">
          {GRUPOS.map((grupo) => {
            const campos = CAMPOS_EXTRACAO.filter((c) => c.grupo === grupo);
            return (
              <div key={grupo}>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{grupo}</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {campos.map((c) => (
                    <div key={c.key}>
                      <Label className="text-xs">{c.label}</Label>
                      <Input
                        value={extracao[c.key] ?? ""}
                        onChange={(e) => setCampo(c.key, e.target.value)}
                        disabled={aplicado}
                        className={`mt-1 ${c.mono ? "font-mono" : ""}`}
                        placeholder="—"
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {extracao.observacoes && (
            <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
              <strong>Observações da IA:</strong> {extracao.observacoes}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Resumo simulação */}
      {sim && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <ResumoCard icon={<Users className="w-4 h-4" />} label="Funcionários" value={String(sim.resumo.totalFuncionarios)} />
          <ResumoCard icon={<DollarSign className="w-4 h-4" />} label="Impacto mensal" value={`R$ ${brl(sim.resumo.totalDiferencaMensal)}`} />
          <ResumoCard icon={<Calendar className="w-4 h-4" />} label={`Retroativo (${sim.mesesRetroativos}m)`} value={`R$ ${brl(sim.resumo.totalRetroativo)}`} />
          <ResumoCard icon={<DollarSign className="w-4 h-4" />} label="Custo total estimado" value={`R$ ${brl(sim.resumo.custoTotalEstimado)}`} highlight />
        </div>
      )}

      {/* Filtro de campos */}
      {!aplicado && camposAplicaveis.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Campos a aplicar</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            {camposAplicaveis.map((c) => (
              <label key={c.key} className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={!excludedCampos.has(c.key)} onCheckedChange={() => toggleCampo(c.key)} />
                {c.label}
              </label>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Tabela simulação por funcionário */}
      {simularQuery.isLoading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between">
              <span>Simulação por funcionário</span>
              {!aplicado && <span className="text-xs font-normal text-muted-foreground">{incluidos.length} de {simulacao.length} selecionados</span>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    {!aplicado && <th className="py-2 px-2 w-10">Incluir</th>}
                    <th className="py-2 px-2">Funcionário</th>
                    <th className="py-2 px-2">Função</th>
                    <th className="py-2 px-2 text-right">Salário atual</th>
                    <th className="py-2 px-2 text-right">Salário novo</th>
                    <th className="py-2 px-2 text-right">Diferença</th>
                    <th className="py-2 px-2 text-right">Retroativo</th>
                    <th className="py-2 px-2">Benefícios</th>
                  </tr>
                </thead>
                <tbody>
                  {simulacao.map((f: any) => {
                    const excluded = excludedFuncs.has(f.employeeId);
                    const benMuda = (f.beneficios || []).filter((b: any) => b.muda);
                    return (
                      <tr key={f.employeeId} className={`border-b hover:bg-muted/50 ${excluded ? "opacity-40" : ""}`}>
                        {!aplicado && (
                          <td className="py-2 px-2"><Checkbox checked={!excluded} onCheckedChange={() => toggleFunc(f.employeeId)} /></td>
                        )}
                        <td className="py-2 px-2 font-medium">{f.nome}</td>
                        <td className="py-2 px-2 text-muted-foreground">{f.funcao || "—"}</td>
                        <td className="py-2 px-2 text-right">R$ {brl(f.salarioAtual)}</td>
                        <td className="py-2 px-2 text-right font-semibold text-green-600">{f.salarioMuda ? `R$ ${brl(f.salarioNovo)}` : "—"}</td>
                        <td className="py-2 px-2 text-right text-primary">{Number(f.diferenca) > 0 ? `+R$ ${brl(f.diferenca)}` : "—"}</td>
                        <td className="py-2 px-2 text-right">{Number(f.valorRetroativo) > 0 ? `R$ ${brl(f.valorRetroativo)}` : "—"}</td>
                        <td className="py-2 px-2">
                          <div className="flex flex-wrap gap-1">
                            {benMuda.length === 0 ? <span className="text-muted-foreground text-xs">—</span> :
                              benMuda.map((b: any) => (
                                <Badge key={b.key} variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[10px]">
                                  {b.label}: {brl(b.atual)}→{brl(b.novo)}
                                </Badge>
                              ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {simulacao.length === 0 && (
                    <tr><td colSpan={aplicado ? 7 : 8} className="py-8 text-center text-muted-foreground">Nenhum funcionário ativo (não-PJ) encontrado.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialog confirmação aplicar */}
      <Dialog open={showAplicar} onOpenChange={(o) => { if (!aplicarMut.isPending) setShowAplicar(o); }}>
        <DialogContent>
          <DialogHeader><DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-amber-600" /> Confirmar aplicação</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <p>Você está prestes a aplicar a convenção a <strong>{incluidos.length} funcionário(s)</strong>.</p>
            <ul className="list-disc pl-5 text-muted-foreground space-y-1">
              <li>Salários serão reajustados via o motor de dissídio (com auditoria e regra de não-regressão, Art. 468 CLT).</li>
              <li>Benefícios serão atualizados nas fichas dos funcionários.</li>
              <li>Cada alteração fica registrada por funcionário/campo (rastreável).</li>
              <li><strong>Ação irreversível</strong> — esta análise não poderá ser reaplicada.</li>
            </ul>
            {excludedCampos.size > 0 && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                Campos excluídos desta aplicação: {Array.from(excludedCampos).join(", ")}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAplicar(false)} disabled={aplicarMut.isPending}>Cancelar</Button>
            <Button
              className="bg-green-600 hover:bg-green-700"
              disabled={aplicarMut.isPending || incluidos.length === 0}
              onClick={() => aplicarMut.mutate({
                analiseId, companyId, companyIds,
                funcionariosExcluidos: Array.from(excludedFuncs),
                camposExcluidos: Array.from(excludedCampos),
              })}
            >
              {aplicarMut.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Aplicando…</> : <><CheckCircle2 className="w-4 h-4 mr-2" /> Aplicar a {incluidos.length}</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ResumoCard({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: string; highlight?: boolean }) {
  return (
    <Card className={highlight ? "border-indigo-200 bg-indigo-50/50" : ""}>
      <CardContent className="py-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">{icon} {label}</div>
        <p className={`text-xl font-bold ${highlight ? "text-indigo-700" : ""}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
