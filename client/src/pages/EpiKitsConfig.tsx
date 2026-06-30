import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import {
  Plus, Trash2, Pencil, Settings2, HardHat, Package, ShieldCheck, BookOpen,
  Clock, Palette, ChevronDown, ChevronUp, CheckCircle2, AlertTriangle, Sparkles, GraduationCap,
  Wand2, Loader2, X, Check, RotateCcw
} from "lucide-react";
import { toast } from "sonner";
import { useCompany } from "@/contexts/CompanyContext";

type ConfigTab = "kits" | "cores" | "vida_util" | "treinamentos";

export default function EpiKitsConfig() {
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery} = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) || 0 : 0;
  const companyIds = getCompanyIdsForQuery();
  const [tab, setTab] = useState<ConfigTab>("kits");
  const [showKitForm, setShowKitForm] = useState(false);
  const [editingKit, setEditingKit] = useState<any>(null);
  const [expandedKit, setExpandedKit] = useState<number | null>(null);

  // IA suggestion states
  const [iaSugestaoKits, setIaSugestaoKits] = useState<any[] | null>(null);
  const [iaSugestaoKitsEstoque, setIaSugestaoKitsEstoque] = useState<any[] | null>(null);
  const [iaSugestaoCores, setIaSugestaoCores] = useState<any[] | null>(null);
  const [iaSugestaoVida, setIaSugestaoVida] = useState<any[] | null>(null);
  const [iaSugestaoTreino, setIaSugestaoTreino] = useState<any[] | null>(null);

  // Kit Form State — deve ficar ANTES das queries (TDZ: funcoesDisponiveisQ usa kitForm)
  const [kitForm, setKitForm] = useState({
    nome: "", funcao: "", descricao: "", funcoesCobertasJson: [] as string[],
    items: [{ nomeEpi: "", categoria: "EPI" as "EPI" | "Uniforme" | "Calcado", quantidade: 1, obrigatorio: true }],
  });

  // Queries
  const kitsQ = trpc.epiAvancado.kitsList.useQuery({ companyId, companyIds }, { enabled: !!companyId || companyIds?.length > 0 });
  const funcoesDisponiveisQ = trpc.epiAvancado.funcoesDisponiveis.useQuery(
    { companyId, companyIds, funcaoAtual: editingKit?.funcao, funcoesCobertasAtuais: kitForm.funcoesCobertasJson },
    { enabled: showKitForm && (!!companyId || (companyIds?.length ?? 0) > 0) }
  );
  const coresQ = trpc.epiAvancado.coresCapaceteList.useQuery({ companyId, companyIds }, { enabled: !!companyId || companyIds?.length > 0 });
  const vidaUtilQ = trpc.epiAvancado.vidaUtilList.useQuery({ companyId, companyIds }, { enabled: !!companyId || companyIds?.length > 0 });
  const treinamentosQ = trpc.epiAvancado.treinamentosVinculadosList.useQuery({ companyId, companyIds }, { enabled: !!companyId || companyIds?.length > 0 });

  // Mutations
  const seedAllMut = trpc.epiAvancado.seedAllDefaults.useMutation({
    onSuccess: (data) => {
      kitsQ.refetch(); coresQ.refetch(); vidaUtilQ.refetch(); treinamentosQ.refetch();
      toast.success(data.message);
    },
    onError: (err) => toast.error(err.message),
  });
  const createKitMut = trpc.epiAvancado.kitsCreate.useMutation({
    onSuccess: () => { kitsQ.refetch(); funcoesDisponiveisQ.refetch(); setShowKitForm(false); toast.success("Kit criado!"); },
    onError: (err) => toast.error(err.message),
  });
  const updateKitMut = trpc.epiAvancado.kitsUpdate.useMutation({
    onSuccess: () => { kitsQ.refetch(); funcoesDisponiveisQ.refetch(); setEditingKit(null); setShowKitForm(false); toast.success("Kit atualizado!"); },
    onError: (err) => toast.error(err.message),
  });
  const deleteKitMut = trpc.epiAvancado.kitsDelete.useMutation({
    onSuccess: () => { kitsQ.refetch(); funcoesDisponiveisQ.refetch(); toast.success("Kit removido!"); },
    onError: (err) => toast.error(err.message),
  });
  const coresUpsertMut = trpc.epiAvancado.coresCapaceteUpsert.useMutation({
    onSuccess: () => { coresQ.refetch(); toast.success("Cores salvas!"); },
    onError: (err) => toast.error(err.message),
  });
  const vidaUtilUpsertMut = trpc.epiAvancado.vidaUtilUpsert.useMutation({
    onSuccess: () => { vidaUtilQ.refetch(); toast.success("Vida útil salva!"); },
    onError: (err) => toast.error(err.message),
  });
  const treinamentosUpsertMut = trpc.epiAvancado.treinamentosVinculadosUpsert.useMutation({
    onSuccess: () => { treinamentosQ.refetch(); toast.success("Treinamentos salvos!"); },
    onError: (err) => toast.error(err.message),
  });

  const iaErrMsg = (err: { message?: string }) => {
    const m = err?.message ?? "";
    if (m === "Load failed" || m === "Failed to fetch") return "Conexão perdida. Verifique sua rede e tente novamente.";
    return "Erro na IA: " + m;
  };

  // IA Mutations
  const iaKitsMut = trpc.epiAvancado.iaSugerirKitsPorFuncao.useMutation({
    onSuccess: (data) => {
      setIaSugestaoKits(data.kits || []);
      toast.success(`IA gerou ${data.kits?.length || 0} sugestões de kits!`);
    },
    onError: (err) => toast.error(iaErrMsg(err)),
  });

  const iaKitsEstoqueMut = trpc.epiAvancado.iaSugerirKitsComEstoque.useMutation({
    onSuccess: (data) => {
      setIaSugestaoKitsEstoque(data.kits || []);
      const total = (data.kits || []).length;
      const semEstoque = (data.kits || []).flatMap((k: any) => k.items || []).filter((i: any) => !i.disponivel).length;
      toast.success(`IA gerou ${total} kits! ${semEstoque > 0 ? `${semEstoque} itens precisam ser providenciados.` : "Tudo disponível em estoque."}`);
    },
    onError: (err) => toast.error(iaErrMsg(err)),
  });

  // IA mutation for use inside the kit form dialog (specific function)
  const iaKitsDialogMut = trpc.epiAvancado.iaSugerirKitsPorFuncao.useMutation({
    onSuccess: (data) => {
      const kit = data.kits?.[0];
      if (!kit) { toast.error("IA não retornou sugestões para essa função."); return; }
      setKitForm(f => ({
        ...f,
        nome: f.nome.trim() || kit.nome || `Kit ${f.funcao}`,
        descricao: f.descricao.trim() || kit.descricao || "",
        items: (kit.items || []).map((i: any) => ({
          nomeEpi: i.nomeEpi || "",
          categoria: (i.categoria === "Uniforme" || i.categoria === "Calcado") ? i.categoria : "EPI" as any,
          quantidade: i.quantidade || 1,
          obrigatorio: i.obrigatorio !== false,
        })),
      }));
      toast.success(`IA sugeriu ${kit.items?.length || 0} EPIs para ${kit.funcao}!`);
    },
    onError: (err) => toast.error(iaErrMsg(err)),
  });
  const iaCoresMut = trpc.epiAvancado.iaSugerirCoresCapacete.useMutation({
    onSuccess: (data) => {
      setIaSugestaoCores(data.cores || []);
      toast.success(`IA gerou ${data.cores?.length || 0} sugestões de cores!`);
    },
    onError: (err) => toast.error(iaErrMsg(err)),
  });
  const iaVidaMut = trpc.epiAvancado.iaSugerirVidaUtil.useMutation({
    onSuccess: (data) => {
      setIaSugestaoVida(data.items || []);
      toast.success(`IA gerou ${data.items?.length || 0} sugestões de vida útil!`);
    },
    onError: (err) => toast.error(iaErrMsg(err)),
  });
  const iaTreinoMut = trpc.epiAvancado.iaSugerirTreinamentos.useMutation({
    onSuccess: (data) => {
      setIaSugestaoTreino(data.items || []);
      toast.success(`IA gerou ${data.items?.length || 0} sugestões de treinamentos!`);
    },
    onError: (err) => toast.error(iaErrMsg(err)),
  });

  const kits = kitsQ.data ?? [];
  const cores = coresQ.data ?? [];
  const vidaUtil = vidaUtilQ.data ?? [];
  const treinamentos = treinamentosQ.data ?? [];

  const hasData = kits.length > 0 || cores.length > 0 || vidaUtil.length > 0 || treinamentos.length > 0;

  function resetKitForm() {
    setKitForm({ nome: "", funcao: "", descricao: "", funcoesCobertasJson: [], items: [{ nomeEpi: "", categoria: "EPI", quantidade: 1, obrigatorio: true }] });
    setEditingKit(null);
  }

  // Cores form
  const [coresForm, setCoresForm] = useState<{ cor: string; hexColor: string; funcoes: string; descricao: string }[]>([]);
  const coresFormInit = useMemo(() => {
    if (cores.length > 0 && coresForm.length === 0) {
      return cores.map((c: any) => ({ cor: c.cor, hexColor: c.hexColor || "", funcoes: c.funcoes, descricao: c.descricao || "" }));
    }
    return coresForm;
  }, [cores, coresForm]);

  // Vida útil form
  const [vidaForm, setVidaForm] = useState<{ nomeEpi: string; categoriaEpi: string; vidaUtilMeses: number; observacoes: string }[]>([]);
  const vidaFormInit = useMemo(() => {
    if (vidaUtil.length > 0 && vidaForm.length === 0) {
      return vidaUtil.map((v: any) => ({ nomeEpi: v.nomeEpi, categoriaEpi: v.categoriaEpi || "", vidaUtilMeses: v.vidaUtilMeses, observacoes: v.observacoes || "" }));
    }
    return vidaForm;
  }, [vidaUtil, vidaForm]);

  // Treinamentos form
  const [treinoForm, setTreinoForm] = useState<{ nomeEpi: string; normaExigida: string; nomeTreinamento: string; obrigatorio: boolean }[]>([]);
  const treinoFormInit = useMemo(() => {
    if (treinamentos.length > 0 && treinoForm.length === 0) {
      return treinamentos.map((t: any) => ({ nomeEpi: t.nomeEpi, normaExigida: t.normaExigida, nomeTreinamento: t.nomeTreinamento, obrigatorio: !!t.obrigatorio }));
    }
    return treinoForm;
  }, [treinamentos, treinoForm]);

  // IA Button Component
  function IAButton({ loading, onClick, label }: { loading: boolean; onClick: () => void; label?: string }) {
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={onClick}
        disabled={loading}
        className="bg-gradient-to-r from-violet-50 to-purple-50 border-violet-200 text-violet-700 hover:from-violet-100 hover:to-purple-100 hover:border-violet-300 hover:text-violet-800 transition-all"
      >
        {loading ? (
          <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Gerando...</>
        ) : (
          <><Wand2 className="h-3.5 w-3.5 mr-1.5" /> {label || "Gerar com IA"}</>
        )}
      </Button>
    );
  }

  // IA Suggestion Banner
  function IASuggestionBanner({ count, onClear, onAcceptAll, loading }: { count: number; onClear: () => void; onAcceptAll?: () => void; loading?: boolean }) {
    return (
      <div className="bg-gradient-to-r from-violet-50 via-purple-50 to-indigo-50 border border-violet-200 rounded-lg p-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center">
            <Wand2 className="h-4 w-4 text-violet-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-violet-800">IA gerou {count} sugestões</p>
            <p className="text-xs text-violet-600">Revise, edite ou remova itens antes de salvar</p>
          </div>
        </div>
        <div className="flex gap-2">
          {onAcceptAll && (
            <Button size="sm" onClick={onAcceptAll} disabled={loading}
              className="bg-violet-600 hover:bg-violet-700 text-white text-xs">
              {loading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Check className="h-3 w-3 mr-1" />}
              Salvar Todos
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={onClear} className="border-violet-200 text-violet-600 hover:bg-violet-50 text-xs">
            <X className="h-3 w-3 mr-1" /> Descartar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => {}} className="text-violet-500 text-xs">
            <RotateCcw className="h-3 w-3 mr-1" /> Regenerar
          </Button>
        </div>
      </div>
    );
  }

  // Save all IA kit suggestions
  const [savingKits, setSavingKits] = useState(false);
  const [autoGenerating, setAutoGenerating] = useState(false);

  const [autoGenProgress, setAutoGenProgress] = useState(0);

  async function createKitsFromArray(kitsArr: any[], onProgress?: (pct: number) => void) {
    for (let i = 0; i < kitsArr.length; i++) {
      const kit = kitsArr[i];
      await createKitMut.mutateAsync({ companyId, companyIds, nome: kit.nome,
        funcao: kit.funcao,
        descricao: kit.descricao || undefined,
        items: (kit.items || []).map((i: any) => ({
          nomeEpi: i.nomeEpi,
          categoria: (i.categoria === "Uniforme" || i.categoria === "Calcado") ? i.categoria : "EPI",
          quantidade: i.quantidade || 1,
          obrigatorio: i.obrigatorio !== false,
        })),
      });
      onProgress?.(Math.round(((i + 1) / kitsArr.length) * 100));
    }
  }

  async function saveAllIAKits() {
    if (!iaSugestaoKits || iaSugestaoKits.length === 0) return;
    setSavingKits(true);
    try {
      await createKitsFromArray(iaSugestaoKits);
      toast.success(`${iaSugestaoKits.length} kits salvos com sucesso!`);
      setIaSugestaoKits(null);
      kitsQ.refetch();
      funcoesDisponiveisQ.refetch();
    } catch (err: any) {
      toast.error("Erro ao salvar kits: " + err.message);
    } finally {
      setSavingKits(false);
    }
  }

  async function generateAndSaveAllKits() {
    setAutoGenerating(true);
    setAutoGenProgress(0);
    // Phase 1 (0→35%): IA gerando — progresso simulado enquanto aguarda
    const interval = setInterval(() => {
      setAutoGenProgress(p => p < 33 ? p + 1 : p);
    }, 300);
    try {
      const data = await iaKitsMut.mutateAsync({ companyId });
      clearInterval(interval);
      const kits = data?.kits ?? [];
      if (kits.length === 0) { toast.error("IA não retornou kits. Tente novamente."); setAutoGenProgress(0); return; }
      setAutoGenProgress(35);
      // Phase 2 (35→100%): salvando cada kit
      await createKitsFromArray(kits, pct => setAutoGenProgress(35 + Math.round(pct * 0.65)));
      setAutoGenProgress(100);
      toast.success(`${kits.length} kit(s) gerado(s) e salvo(s) automaticamente!`);
      setIaSugestaoKits(null);
      kitsQ.refetch();
      funcoesDisponiveisQ.refetch();
    } catch (err: any) {
      clearInterval(interval);
      toast.error(iaErrMsg(err));
    } finally {
      clearInterval(interval);
      setTimeout(() => { setAutoGenerating(false); setAutoGenProgress(0); }, 800);
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[#1B3A5C] flex items-center gap-2">
            <Settings2 className="h-5 w-5" /> Configurações Avançadas de EPI
          </h2>
          <p className="text-sm text-muted-foreground">Kits por função, cores de capacete, vida útil e treinamentos vinculados</p>
        </div>
        {!hasData && (
          <Button onClick={() => seedAllMut.mutate({ companyId })} disabled={seedAllMut.isPending}
            className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700">
            <Sparkles className="h-4 w-4 mr-1" /> {seedAllMut.isPending ? "Configurando..." : "Configurar Padrões NR-6"}
          </Button>
        )}
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg overflow-x-auto">
        <button onClick={() => setTab("kits")}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${tab === "kits" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
          <Package className="h-3.5 w-3.5 inline mr-1" /> Kits por Função ({kits.length})
        </button>
        <button onClick={() => { setTab("cores"); if (coresForm.length === 0 && cores.length > 0) setCoresForm(cores.map((c: any) => ({ cor: c.cor, hexColor: c.hexColor || "", funcoes: c.funcoes, descricao: c.descricao || "" }))); }}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${tab === "cores" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
          <Palette className="h-3.5 w-3.5 inline mr-1" /> Cores Capacete ({cores.length})
        </button>
        <button onClick={() => { setTab("vida_util"); if (vidaForm.length === 0 && vidaUtil.length > 0) setVidaForm(vidaUtil.map((v: any) => ({ nomeEpi: v.nomeEpi, categoriaEpi: v.categoriaEpi || "", vidaUtilMeses: v.vidaUtilMeses, observacoes: v.observacoes || "" }))); }}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${tab === "vida_util" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
          <Clock className="h-3.5 w-3.5 inline mr-1" /> Vida Útil ({vidaUtil.length})
        </button>
        <button onClick={() => { setTab("treinamentos"); if (treinoForm.length === 0 && treinamentos.length > 0) setTreinoForm(treinamentos.map((t: any) => ({ nomeEpi: t.nomeEpi, normaExigida: t.normaExigida, nomeTreinamento: t.nomeTreinamento, obrigatorio: !!t.obrigatorio }))); }}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${tab === "treinamentos" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
          <GraduationCap className="h-3.5 w-3.5 inline mr-1" /> Treinamentos ({treinamentos.length})
        </button>
      </div>

      {/* ============================================================ */}
      {/* KITS POR FUNÇÃO */}
      {/* ============================================================ */}
      {tab === "kits" && (
        <div className="space-y-3">
          <div className="flex flex-wrap justify-between items-center gap-2">
            <div className="flex flex-wrap gap-2">
              <button
                disabled={autoGenerating || iaKitsMut.isPending}
                onClick={generateAndSaveAllKits}
                className="relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#1B2A4A] text-white border border-[#1B2A4A] hover:bg-[#243660] disabled:opacity-80 transition-colors overflow-hidden min-w-[200px]"
              >
                {autoGenerating && (
                  <span
                    className="absolute inset-0 bg-white/15 transition-all duration-300"
                    style={{ width: `${autoGenProgress}%` }}
                  />
                )}
                <span className="relative flex items-center gap-1.5">
                  {autoGenerating ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                    <span>Gerando e salvando... {autoGenProgress}%</span></>
                  ) : (
                    <><Sparkles className="h-3.5 w-3.5 shrink-0" /> Gerar Kits para Todas as Funções</>
                  )}
                </span>
              </button>
              <IAButton
                loading={iaKitsMut.isPending}
                onClick={() => iaKitsMut.mutate({ companyId })}
                label="Sugerir (revisar antes)"
              />
              <button
                disabled={iaKitsEstoqueMut.isPending}
                onClick={() => iaKitsEstoqueMut.mutate({ companyId })}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 disabled:opacity-50 transition-colors"
              >
                {iaKitsEstoqueMut.isPending ? (
                  <><span className="animate-spin mr-1">⏳</span> Consultando estoque...</>
                ) : (
                  <><span>🏭</span> Sugerir pelo Meu Estoque</>
                )}
              </button>
            </div>
            <Button size="sm" onClick={() => { resetKitForm(); setShowKitForm(true); }}>
              <Plus className="h-4 w-4 mr-1" /> Novo Kit
            </Button>
          </div>

          {/* IA Suggestions for Kits */}
          {iaSugestaoKits && iaSugestaoKits.length > 0 && (
            <div className="space-y-3">
              <IASuggestionBanner
                count={iaSugestaoKits.length}
                onClear={() => setIaSugestaoKits(null)}
                onAcceptAll={saveAllIAKits}
                loading={savingKits}
              />
              <div className="space-y-2">
                {iaSugestaoKits.map((kit, kidx) => (
                  <Card key={kidx} className="border-violet-200 bg-violet-50/30 overflow-hidden">
                    <div className="p-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-violet-100 flex items-center justify-center">
                          <Wand2 className="h-5 w-5 text-violet-600" />
                        </div>
                        <div>
                          <h4 className="font-semibold text-sm text-violet-900">{kit.nome}</h4>
                          <p className="text-xs text-violet-600">Função: {kit.funcao} | {kit.items?.length || 0} itens | {kit.descricao}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="ghost" className="h-7 text-violet-600 hover:bg-violet-100" onClick={() => {
                          setEditingKit(null);
                          setKitForm({
                            nome: kit.nome, funcao: kit.funcao, descricao: kit.descricao || "",
                            items: kit.items?.map((i: any) => ({
                              nomeEpi: i.nomeEpi,
                              categoria: (i.categoria === "Uniforme" || i.categoria === "Calcado") ? i.categoria : "EPI" as any,
                              quantidade: i.quantidade || 1,
                              obrigatorio: i.obrigatorio !== false,
                            })) || [],
                          });
                          setShowKitForm(true);
                        }}>
                          <Pencil className="h-3 w-3 mr-1" /> Editar
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-green-600 hover:bg-green-50" onClick={async () => {
                          try {
                            await createKitMut.mutateAsync({ companyId, companyIds, nome: kit.nome,
                              funcao: kit.funcao,
                              descricao: kit.descricao || undefined,
                              items: kit.items.map((i: any) => ({
                                nomeEpi: i.nomeEpi,
                                categoria: (i.categoria === "Uniforme" || i.categoria === "Calcado") ? i.categoria : "EPI",
                                quantidade: i.quantidade || 1,
                                obrigatorio: i.obrigatorio !== false,
                              })),
                            });
                            setIaSugestaoKits(prev => prev?.filter((_, i) => i !== kidx) || null);
                          } catch {}
                        }}>
                          <Check className="h-3 w-3 mr-1" /> Aceitar
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-red-500 hover:bg-red-50" onClick={() => {
                          setIaSugestaoKits(prev => prev?.filter((_, i) => i !== kidx) || null);
                        }}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <div className="border-t border-violet-200 px-3 py-2 bg-violet-50/50">
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                        {kit.items?.map((item: any, idx: number) => (
                          <div key={idx} className="flex items-center gap-2 text-xs py-1">
                            <CheckCircle2 className="h-3.5 w-3.5 text-violet-500 shrink-0" />
                            <span className="font-medium">{item.nomeEpi}</span>
                            <Badge variant="outline" className="text-[10px] px-1 border-violet-200">{item.categoria}</Badge>
                            <span className="text-muted-foreground">x{item.quantidade}</span>
                            {!item.obrigatorio && <Badge variant="secondary" className="text-[10px]">Opcional</Badge>}
                          </div>
                        ))}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* IA Sugestões COM ESTOQUE */}
          {iaSugestaoKitsEstoque && iaSugestaoKitsEstoque.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-base">🏭</span>
                  <div>
                    <p className="text-xs font-semibold text-emerald-800">
                      {iaSugestaoKitsEstoque.length} kits sugeridos com base no seu estoque
                    </p>
                    <p className="text-[11px] text-emerald-700">
                      Itens em <span className="text-red-600 font-semibold">vermelho</span> não estão disponíveis — precisam ser comprados.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-emerald-700 hover:bg-emerald-100" onClick={async () => {
                    for (const kit of iaSugestaoKitsEstoque) {
                      try {
                        await createKitMut.mutateAsync({
                          companyId, companyIds,
                          nome: kit.nome, funcao: kit.funcao, descricao: kit.descricao || undefined,
                          items: kit.items.map((i: any) => ({
                            nomeEpi: i.nomeEpi,
                            categoria: (i.categoria === "Uniforme" || i.categoria === "Calcado") ? i.categoria : "EPI",
                            quantidade: i.quantidade || 1,
                            obrigatorio: i.obrigatorio !== false,
                          })),
                        });
                      } catch {}
                    }
                    setIaSugestaoKitsEstoque(null);
                  }}>
                    <Check className="h-3 w-3 mr-1" /> Aceitar Todos
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-gray-500 hover:bg-gray-100" onClick={() => setIaSugestaoKitsEstoque(null)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                {iaSugestaoKitsEstoque.map((kit: any, kidx: number) => {
                  const itemsOk = (kit.items || []).filter((i: any) => i.disponivel);
                  const itemsNok = (kit.items || []).filter((i: any) => !i.disponivel);
                  return (
                    <Card key={kidx} className="border-emerald-200 overflow-hidden">
                      <div className="p-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center text-lg">🏗️</div>
                          <div>
                            <h4 className="font-semibold text-sm">{kit.nome}</h4>
                            <p className="text-xs text-muted-foreground">
                              Função: {kit.funcao} &bull; {itemsOk.length} disponíveis
                              {itemsNok.length > 0 && <span className="text-red-600 font-medium"> &bull; {itemsNok.length} a providenciar</span>}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-blue-600 hover:bg-blue-50" onClick={() => {
                            setEditingKit(null);
                            setKitForm({
                              nome: kit.nome, funcao: kit.funcao, descricao: kit.descricao || "",
                              items: kit.items?.map((i: any) => ({
                                nomeEpi: i.nomeEpi,
                                categoria: (i.categoria === "Uniforme" || i.categoria === "Calcado") ? i.categoria : "EPI" as any,
                                quantidade: i.quantidade || 1,
                                obrigatorio: i.obrigatorio !== false,
                              })) || [],
                            });
                            setShowKitForm(true);
                          }}>
                            <Pencil className="h-3 w-3 mr-1" /> Editar
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-green-600 hover:bg-green-50" onClick={async () => {
                            try {
                              await createKitMut.mutateAsync({
                                companyId, companyIds, nome: kit.nome, funcao: kit.funcao,
                                descricao: kit.descricao || undefined,
                                items: kit.items.map((i: any) => ({
                                  nomeEpi: i.nomeEpi,
                                  categoria: (i.categoria === "Uniforme" || i.categoria === "Calcado") ? i.categoria : "EPI",
                                  quantidade: i.quantidade || 1,
                                  obrigatorio: i.obrigatorio !== false,
                                })),
                              });
                              setIaSugestaoKitsEstoque(prev => prev?.filter((_, i) => i !== kidx) || null);
                            } catch {}
                          }}>
                            <Check className="h-3 w-3 mr-1" /> Aceitar
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-red-500 hover:bg-red-50" onClick={() => setIaSugestaoKitsEstoque(prev => prev?.filter((_, i) => i !== kidx) || null)}>
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      {/* Items grid — disponíveis e indisponíveis */}
                      <div className="border-t border-emerald-100 px-3 py-2 bg-gray-50/50 space-y-1">
                        {itemsOk.length > 0 && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1">
                            {itemsOk.map((item: any, idx: number) => (
                              <div key={idx} className="flex items-center gap-1.5 text-xs py-0.5">
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                                <span className="font-medium truncate">{item.nomeEpi}</span>
                                <span className="text-muted-foreground shrink-0">x{item.quantidade}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {itemsNok.length > 0 && (
                          <>
                            {itemsOk.length > 0 && <div className="border-t border-red-200 my-1.5" />}
                            <p className="text-[10px] font-semibold text-red-600 uppercase tracking-wide mb-1">⚠ Providenciar — sem estoque</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1">
                              {itemsNok.map((item: any, idx: number) => (
                                <div key={idx} className="flex items-center gap-1.5 text-xs py-0.5 bg-red-50 rounded px-1.5 border border-red-200">
                                  <span className="text-red-500 shrink-0">✕</span>
                                  <span className="font-semibold text-red-700 truncate">{item.nomeEpi}</span>
                                  <span className="text-red-500 shrink-0">x{item.quantidade}</span>
                                  {!item.noCatalogo && <Badge variant="outline" className="text-[9px] px-1 border-red-300 text-red-600 shrink-0">Comprar</Badge>}
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {kits.length === 0 && !iaSugestaoKits ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Package className="h-10 w-10 text-muted-foreground/50 mb-3" />
                <p className="text-sm text-muted-foreground mb-3">Nenhum kit configurado.</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => seedAllMut.mutate({ companyId })} disabled={seedAllMut.isPending}>
                    <Sparkles className="h-4 w-4 mr-1" /> Configurar Padrões NR-6
                  </Button>
                  <IAButton loading={iaKitsMut.isPending} onClick={() => iaKitsMut.mutate({ companyId })} label="Gerar com IA" />
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {kits.map((kit: any) => (
                <Card key={kit.id} className="overflow-hidden">
                  <div className="p-3 flex items-center justify-between cursor-pointer hover:bg-gray-50"
                    onClick={() => setExpandedKit(expandedKit === kit.id ? null : kit.id)}>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                        <HardHat className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-sm">{kit.nome}</h4>
                        <p className="text-xs text-muted-foreground">
                          Função: {kit.funcao}
                          {(() => { try { const c = JSON.parse(kit.funcoesCobertasJson || "[]"); return c.length > 0 ? ` +${c.length} similar${c.length > 1 ? "es" : ""}` : ""; } catch { return ""; } })()}
                          {" "}| {kit.items?.length || 0} itens
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={kit.ativo ? "default" : "secondary"}>{kit.ativo ? "Ativo" : "Inativo"}</Badge>
                      <Button size="sm" variant="ghost" onClick={(e) => {
                        e.stopPropagation();
                        setEditingKit(kit);
                        const cobertasExistentes: string[] = (() => { try { return JSON.parse(kit.funcoesCobertasJson || "[]"); } catch { return []; } })();
                        setKitForm({
                          nome: kit.nome, funcao: kit.funcao, descricao: kit.descricao || "",
                          funcoesCobertasJson: cobertasExistentes,
                          items: kit.items?.map((i: any) => ({ nomeEpi: i.nomeEpi, categoria: i.categoria, quantidade: i.quantidade, obrigatorio: !!i.obrigatorio })) || [],
                        });
                        setShowKitForm(true);
                      }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="text-red-600" onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Remover kit "${kit.nome}"?`)) deleteKitMut.mutate({ id: kit.id });
                      }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                      {expandedKit === kit.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </div>
                  </div>
                  {expandedKit === kit.id && kit.items && (
                    <div className="border-t px-3 py-2 bg-gray-50/50">
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                        {kit.items.map((item: any, idx: number) => (
                          <div key={idx} className="flex items-center gap-2 text-xs py-1">
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                            <span className="font-medium">{item.nomeEpi}</span>
                            <Badge variant="outline" className="text-[10px] px-1">{item.categoria}</Badge>
                            <span className="text-muted-foreground">x{item.quantidade}</span>
                            {!item.obrigatorio && <Badge variant="secondary" className="text-[10px]">Opcional</Badge>}
                          </div>
                        ))}
                      </div>
                      {kit.descricao && <p className="text-xs text-muted-foreground mt-2 italic">{kit.descricao}</p>}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}

          {/* Kit Form Dialog */}
          {showKitForm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full flex flex-col max-h-[90vh]">
                {/* Dialog header */}
                <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center">
                      <Package className="h-5 w-5 text-blue-700" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-[#1B3A5C]">
                        {editingKit ? "Editar Kit de EPI" : "Novo Kit de EPI"}
                      </h3>
                      <p className="text-xs text-muted-foreground">Defina a função e use IA para sugerir os EPIs automaticamente</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setShowKitForm(false); resetKitForm(); }}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                  {/* Função + IA highlight box */}
                  <div className="rounded-xl border-2 border-violet-200 bg-gradient-to-br from-violet-50 to-indigo-50 p-4 space-y-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Wand2 className="h-4 w-4 text-violet-600" />
                      <span className="text-sm font-semibold text-violet-800">Função do Trabalhador</span>
                      <Badge variant="outline" className="text-[10px] border-violet-300 text-violet-600">Passo 1</Badge>
                    </div>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        {funcoesDisponiveisQ.isLoading ? (
                          <div className="h-9 flex items-center px-3 rounded-md border border-violet-200 bg-white text-xs text-muted-foreground gap-2">
                            <Loader2 className="h-3 w-3 animate-spin text-violet-400" /> Carregando funções...
                          </div>
                        ) : funcoesDisponiveisQ.isError ? (
                          <Input
                            value={kitForm.funcao}
                            onChange={e => setKitForm(f => ({ ...f, funcao: e.target.value }))}
                            placeholder="Digite a função (ex: Pedreiro)..."
                            className="flex-1 border-violet-200 focus-visible:ring-violet-400 bg-white h-9"
                          />
                        ) : (funcoesDisponiveisQ.data?.funcoes?.length ?? 0) === 0 && !editingKit ? (
                          funcoesDisponiveisQ.data?.totalFuncoesCadastradas === 0 ? (
                            <div className="h-9 flex items-center px-3 rounded-md border border-orange-200 bg-orange-50 text-xs text-orange-700 gap-1.5">
                              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                              Nenhuma função cadastrada no RH. Cadastre funções em Colaboradores → Funções.
                            </div>
                          ) : (
                            <div className="h-9 flex items-center px-3 rounded-md border border-violet-200 bg-amber-50 text-xs text-amber-700 gap-1.5">
                              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                              Todas as {funcoesDisponiveisQ.data?.totalFuncoesCadastradas} funções já possuem kit. Edite um kit existente ou use "Funções Similares".
                            </div>
                          )
                        ) : (
                          <Select
                            value={kitForm.funcao}
                            onValueChange={v => setKitForm(f => ({ ...f, funcao: v }))}
                          >
                            <SelectTrigger className="border-violet-200 focus:ring-violet-400 bg-white h-9 text-sm">
                              <SelectValue placeholder="Selecione a função..." />
                            </SelectTrigger>
                            <SelectContent>
                              {(funcoesDisponiveisQ.data?.funcoes || []).map(nome => (
                                <SelectItem key={nome} value={nome}>{nome}</SelectItem>
                              ))}
                              {(funcoesDisponiveisQ.data?.funcoes?.length ?? 0) === 0 && editingKit && (
                                <SelectItem value={kitForm.funcao}>{kitForm.funcao}</SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                      <Button
                        onClick={() => {
                          if (!kitForm.funcao.trim()) { toast.error("Selecione a Função antes de gerar com IA"); return; }
                          iaKitsDialogMut.mutate({ companyId, funcao: kitForm.funcao });
                        }}
                        disabled={iaKitsDialogMut.isPending || !kitForm.funcao.trim()}
                        className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white shrink-0"
                        size="sm"
                      >
                        {iaKitsDialogMut.isPending ? (
                          <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Gerando...</>
                        ) : (
                          <><Sparkles className="h-3.5 w-3.5 mr-1.5" /> Gerar com IA</>
                        )}
                      </Button>
                    </div>
                    {iaKitsDialogMut.isPending && (
                      <p className="text-xs text-violet-600 flex items-center gap-1.5">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Consultando NR-6 e NR-18 do Ministério do Trabalho...
                      </p>
                    )}
                    {!iaKitsDialogMut.isPending && kitForm.funcao.trim() && kitForm.items.length > 0 && (
                      <p className="text-xs text-violet-600 flex items-center gap-1.5">
                        <CheckCircle2 className="h-3 w-3" />
                        {kitForm.items.length} item(ns) carregado(s). Edite abaixo conforme necessário.
                      </p>
                    )}
                  </div>

                  {/* Funções similares (opcional) */}
                  {kitForm.funcao.trim() && (() => {
                    const opcoesSimil = (funcoesDisponiveisQ.data?.funcoes || []).filter(f => f !== kitForm.funcao);
                    if (opcoesSimil.length === 0) return null;
                    return (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5">
                          <Label className="text-xs font-medium text-slate-700">Cobre funções similares</Label>
                          <Badge variant="outline" className="text-[10px] border-slate-300 text-slate-500">Opcional</Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Marque funções com a mesma atividade (ex.: Carpinteiro I, II, III) — elas usarão este mesmo kit.
                        </p>
                        <div className="rounded-md border border-slate-200 bg-slate-50/60 p-2 flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                          {opcoesSimil.map(nome => {
                            const selecionada = kitForm.funcoesCobertasJson.includes(nome);
                            return (
                              <button
                                key={nome}
                                type="button"
                                onClick={() => setKitForm(f => ({
                                  ...f,
                                  funcoesCobertasJson: selecionada
                                    ? f.funcoesCobertasJson.filter(x => x !== nome)
                                    : [...f.funcoesCobertasJson, nome],
                                }))}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium transition-colors ${
                                  selecionada
                                    ? "bg-blue-600 border-blue-600 text-white"
                                    : "bg-white border-slate-300 text-slate-600 hover:border-blue-400"
                                }`}
                              >
                                {selecionada && <Check className="h-2.5 w-2.5" />}
                                {nome}
                              </button>
                            );
                          })}
                        </div>
                        {kitForm.funcoesCobertasJson.length > 0 && (
                          <p className="text-[11px] text-blue-700 flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            {kitForm.funcoesCobertasJson.length} função(ões) similar(es) vinculada(s) a este kit.
                          </p>
                        )}
                      </div>
                    );
                  })()}

                  {/* Nome do Kit */}
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <Label className="text-xs font-medium">Nome do Kit *</Label>
                      <Badge variant="outline" className="text-[10px]">Passo 2</Badge>
                    </div>
                    <Input
                      value={kitForm.nome}
                      onChange={e => setKitForm(f => ({ ...f, nome: e.target.value }))}
                      placeholder="Ex: Kit Pedreiro Completo"
                      className="h-9"
                    />
                  </div>

                  {/* Descrição */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Descrição</Label>
                    <Input value={kitForm.descricao} onChange={e => setKitForm(f => ({ ...f, descricao: e.target.value }))} placeholder="Descrição do kit..." className="h-9" />
                  </div>

                  {/* Itens */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-1.5">
                        <Label className="text-xs font-medium">Itens do Kit</Label>
                        <Badge variant="outline" className="text-[10px]">Passo 3</Badge>
                        {kitForm.items.length > 0 && (
                          <Badge className="text-[10px] bg-blue-100 text-blue-700 border-0">{kitForm.items.length}</Badge>
                        )}
                      </div>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setKitForm(f => ({
                        ...f, items: [...f.items, { nomeEpi: "", categoria: "EPI", quantidade: 1, obrigatorio: true }]
                      }))}>
                        <Plus className="h-3 w-3 mr-1" /> Adicionar Item
                      </Button>
                    </div>

                    {kitForm.items.length === 0 ? (
                      <div className="border-2 border-dashed border-gray-200 rounded-lg py-8 text-center">
                        <ShieldCheck className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                        <p className="text-xs text-muted-foreground">Preencha a Função e clique em <strong>Gerar com IA</strong></p>
                        <p className="text-xs text-muted-foreground">ou adicione itens manualmente</p>
                      </div>
                    ) : (
                      <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                        {kitForm.items.map((item, idx) => (
                          <div key={idx} className="flex gap-2 items-center bg-gray-50 rounded-lg px-2 py-1.5">
                            <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                              <span className="text-[9px] font-bold text-blue-700">{idx + 1}</span>
                            </div>
                            <Input className="flex-1 h-7 text-xs border-0 bg-transparent focus-visible:ring-0 p-0" value={item.nomeEpi}
                              onChange={e => { const items = [...kitForm.items]; items[idx].nomeEpi = e.target.value; setKitForm(f => ({ ...f, items })); }}
                              placeholder="Nome do EPI" />
                            <Select value={item.categoria} onValueChange={v => { const items = [...kitForm.items]; items[idx].categoria = v as any; setKitForm(f => ({ ...f, items })); }}>
                              <SelectTrigger className="w-24 h-7 text-xs border-gray-200"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="EPI">EPI</SelectItem>
                                <SelectItem value="Uniforme">Uniforme</SelectItem>
                                <SelectItem value="Calcado">Calçado</SelectItem>
                              </SelectContent>
                            </Select>
                            <Input type="number" className="w-14 h-7 text-xs border-gray-200" min={1} value={item.quantidade}
                              onChange={e => { const items = [...kitForm.items]; items[idx].quantidade = parseInt(e.target.value) || 1; setKitForm(f => ({ ...f, items })); }} />
                            <Badge
                              variant={item.obrigatorio ? "default" : "secondary"}
                              className={`text-[10px] cursor-pointer shrink-0 ${item.obrigatorio ? "bg-green-100 text-green-700 border-green-200 hover:bg-green-200" : "hover:bg-gray-200"}`}
                              onClick={() => { const items = [...kitForm.items]; items[idx].obrigatorio = !items[idx].obrigatorio; setKitForm(f => ({ ...f, items })); }}
                            >
                              {item.obrigatorio ? "Obrig." : "Opc."}
                            </Badge>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-400 hover:text-red-600 hover:bg-red-50" onClick={() => {
                              setKitForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
                            }}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Dialog footer */}
                <div className="flex gap-3 px-6 pb-5 pt-3 border-t shrink-0">
                  <Button variant="outline" className="flex-1" onClick={() => { setShowKitForm(false); resetKitForm(); }}>Cancelar</Button>
                  <Button className="flex-1 bg-[#1B2A4A] hover:bg-[#243660]"
                    disabled={createKitMut.isPending || updateKitMut.isPending}
                    onClick={() => {
                      if (!kitForm.nome.trim() || !kitForm.funcao.trim()) return toast.error("Nome e função são obrigatórios");
                      const validItems = kitForm.items.filter(i => i.nomeEpi.trim());
                      if (validItems.length === 0) return toast.error("Adicione pelo menos um item ao kit");
                      if (editingKit) {
                        updateKitMut.mutate({ id: editingKit.id, nome: kitForm.nome, funcao: kitForm.funcao, funcoesCobertasJson: kitForm.funcoesCobertasJson, descricao: kitForm.descricao || undefined, items: validItems });
                      } else {
                        createKitMut.mutate({ companyId, companyIds, nome: kitForm.nome, funcao: kitForm.funcao, funcoesCobertasJson: kitForm.funcoesCobertasJson, descricao: kitForm.descricao || undefined, items: validItems });
                      }
                    }}>
                    {(createKitMut.isPending || updateKitMut.isPending) ? (
                      <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Salvando...</>
                    ) : editingKit ? "Atualizar Kit" : "Criar Kit"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* CORES DE CAPACETE */}
      {/* ============================================================ */}
      {tab === "cores" && (
        <div className="space-y-3">
          <div className="flex justify-end gap-2 flex-wrap">
            <Button size="sm" variant="outline" className="text-xs" onClick={() => {
              const padrao = [
                { cor: "Branco", hexColor: "#FFFFFF", funcoes: "Engenheiros, Mestres de Obras, Encarregados", descricao: "Liderança e supervisão" },
                { cor: "Azul", hexColor: "#1E40AF", funcoes: "Pedreiros (alvenaria e estruturas)", descricao: "Serviços de alvenaria" },
                { cor: "Verde", hexColor: "#16A34A", funcoes: "Serventes, Operários, Téc. Segurança, Armadores", descricao: "Operacional e segurança" },
                { cor: "Amarelo", hexColor: "#EAB308", funcoes: "Visitantes", descricao: "Identificação de visitantes" },
                { cor: "Vermelho", hexColor: "#DC2626", funcoes: "Carpinteiros, Bombeiros", descricao: "Carpintaria e combate a incêndio" },
                { cor: "Laranja", hexColor: "#EA580C", funcoes: "Eletricistas", descricao: "Serviços elétricos" },
                { cor: "Cinza", hexColor: "#6B7280", funcoes: "Estagiários, Visitantes técnicos", descricao: "Estagiários e visitantes técnicos" },
                { cor: "Marrom", hexColor: "#92400E", funcoes: "Soldadores", descricao: "Serviços de solda" },
                { cor: "Preto", hexColor: "#1F2937", funcoes: "Operadores de máquinas pesadas", descricao: "Operação de máquinas" },
              ];
              setCoresForm(padrao);
              toast.success("Padrão NR-6/NR-18 carregado! Edite conforme necessário e clique em Salvar.");
            }}>
              <HardHat className="h-3 w-3 mr-1" /> Carregar Padrão NR-6/NR-18
            </Button>
            <IAButton loading={iaCoresMut.isPending} onClick={() => iaCoresMut.mutate({ companyId })} label="Sugerir Cores com IA" />
          </div>

          {/* IA Suggestions for Cores */}
          {iaSugestaoCores && iaSugestaoCores.length > 0 && (
            <div className="space-y-3">
              <IASuggestionBanner
                count={iaSugestaoCores.length}
                onClear={() => setIaSugestaoCores(null)}
                onAcceptAll={() => {
                  setCoresForm(iaSugestaoCores.map(c => ({ cor: c.cor, hexColor: c.hexColor || "#000000", funcoes: c.funcoes, descricao: c.descricao || "" })));
                  setIaSugestaoCores(null);
                  toast.success("Sugestões aplicadas! Clique em 'Salvar Cores' para confirmar.");
                }}
              />
              <Card className="border-violet-200 bg-violet-50/30">
                <CardContent className="pt-3">
                  <div className="space-y-2">
                    {iaSugestaoCores.map((cor, idx) => (
                      <div key={idx} className="flex gap-2 items-center">
                        <div className="w-8 h-8 rounded-full border-2 shrink-0" style={{ backgroundColor: cor.hexColor || "#ccc", borderColor: cor.hexColor || "#ccc" }} />
                        <span className="text-xs font-medium w-20">{cor.cor}</span>
                        <span className="text-xs text-violet-600 flex-1">{cor.funcoes}</span>
                        <span className="text-xs text-muted-foreground italic max-w-[200px] truncate">{cor.descricao}</span>
                        <Button size="sm" variant="ghost" className="h-7 text-red-500" onClick={() => {
                          setIaSugestaoCores(prev => prev?.filter((_, i) => i !== idx) || null);
                        }}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Palette className="h-4 w-4" /> Tabela de Cores de Capacete por Função
              </CardTitle>
              <p className="text-xs text-muted-foreground">Referência NR-6 / NR-18 — Padrão de cores na construção civil</p>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {(coresForm.length > 0 ? coresForm : coresFormInit).map((cor, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <div className="w-8 h-8 rounded-full border-2 shrink-0" style={{ backgroundColor: cor.hexColor || "#ccc", borderColor: cor.hexColor || "#ccc" }} />
                    <Input className="w-24 h-8 text-xs" value={cor.cor}
                      onChange={e => { const c = [...(coresForm.length > 0 ? coresForm : coresFormInit)]; c[idx] = { ...c[idx], cor: e.target.value }; setCoresForm(c); }}
                      placeholder="Cor" />
                    <Input className="w-20 h-8 text-xs" type="color" value={cor.hexColor || "#000000"}
                      onChange={e => { const c = [...(coresForm.length > 0 ? coresForm : coresFormInit)]; c[idx] = { ...c[idx], hexColor: e.target.value }; setCoresForm(c); }} />
                    <Input className="flex-1 h-8 text-xs" value={cor.funcoes}
                      onChange={e => { const c = [...(coresForm.length > 0 ? coresForm : coresFormInit)]; c[idx] = { ...c[idx], funcoes: e.target.value }; setCoresForm(c); }}
                      placeholder="Funções (separadas por vírgula)" />
                    <Button size="sm" variant="ghost" className="h-8 text-red-500" onClick={() => {
                      const c = [...(coresForm.length > 0 ? coresForm : coresFormInit)].filter((_, i) => i !== idx);
                      setCoresForm(c);
                    }}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                <div className="flex gap-2 pt-2">
                  <Button size="sm" variant="outline" onClick={() => {
                    setCoresForm([...(coresForm.length > 0 ? coresForm : coresFormInit), { cor: "", hexColor: "#000000", funcoes: "", descricao: "" }]);
                  }}>
                    <Plus className="h-3 w-3 mr-1" /> Adicionar Cor
                  </Button>
                  <Button size="sm" className="bg-[#1B2A4A] hover:bg-[#243660]" disabled={coresUpsertMut.isPending}
                    onClick={() => {
                      const valid = (coresForm.length > 0 ? coresForm : coresFormInit).filter(c => c.cor.trim() && c.funcoes.trim());
                      coresUpsertMut.mutate({ companyId, companyIds, cores: valid });
                    }}>
                    {coresUpsertMut.isPending ? "Salvando..." : "Salvar Cores"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ============================================================ */}
      {/* VIDA ÚTIL */}
      {/* ============================================================ */}
      {tab === "vida_util" && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <IAButton loading={iaVidaMut.isPending} onClick={() => iaVidaMut.mutate({ companyId })} label="Sugerir Vida Útil com IA" />
          </div>

          {/* IA Suggestions for Vida Útil */}
          {iaSugestaoVida && iaSugestaoVida.length > 0 && (
            <div className="space-y-3">
              <IASuggestionBanner
                count={iaSugestaoVida.length}
                onClear={() => setIaSugestaoVida(null)}
                onAcceptAll={() => {
                  setVidaForm(iaSugestaoVida.map(v => ({ nomeEpi: v.nomeEpi, categoriaEpi: v.categoriaEpi || "EPI", vidaUtilMeses: v.vidaUtilMeses, observacoes: v.observacoes || "" })));
                  setIaSugestaoVida(null);
                  toast.success("Sugestões aplicadas! Clique em 'Salvar Vida Útil' para confirmar.");
                }}
              />
              <Card className="border-violet-200 bg-violet-50/30">
                <CardContent className="pt-3">
                  <div className="space-y-1.5">
                    {iaSugestaoVida.map((item, idx) => (
                      <div key={idx} className="flex gap-2 items-center text-xs">
                        <Clock className="h-3.5 w-3.5 text-violet-500 shrink-0" />
                        <span className="font-medium flex-1">{item.nomeEpi}</span>
                        <Badge variant="outline" className="text-[10px] border-violet-200">{item.categoriaEpi}</Badge>
                        <span className="font-semibold text-violet-700">{item.vidaUtilMeses} meses</span>
                        <span className="text-muted-foreground italic max-w-[200px] truncate">{item.observacoes}</span>
                        <Button size="sm" variant="ghost" className="h-6 text-red-500" onClick={() => {
                          setIaSugestaoVida(prev => prev?.filter((_, i) => i !== idx) || null);
                        }}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Clock className="h-4 w-4" /> Configuração de Vida Útil dos EPIs
              </CardTitle>
              <p className="text-xs text-muted-foreground">Define o tempo máximo de uso de cada EPI. Alertas serão gerados automaticamente quando o vencimento estiver próximo.</p>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {(vidaForm.length > 0 ? vidaForm : vidaFormInit).map((item, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <Input className="flex-1 h-8 text-xs" value={item.nomeEpi}
                      onChange={e => { const v = [...(vidaForm.length > 0 ? vidaForm : vidaFormInit)]; v[idx] = { ...v[idx], nomeEpi: e.target.value }; setVidaForm(v); }}
                      placeholder="Nome do EPI" />
                    <Select value={item.categoriaEpi || "EPI"} onValueChange={val => { const v = [...(vidaForm.length > 0 ? vidaForm : vidaFormInit)]; v[idx] = { ...v[idx], categoriaEpi: val }; setVidaForm(v); }}>
                      <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="EPI">EPI</SelectItem>
                        <SelectItem value="Uniforme">Uniforme</SelectItem>
                        <SelectItem value="Calcado">Calçado</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="flex items-center gap-1">
                      <Input type="number" className="w-20 h-8 text-xs" min={1} value={item.vidaUtilMeses}
                        onChange={e => { const v = [...(vidaForm.length > 0 ? vidaForm : vidaFormInit)]; v[idx] = { ...v[idx], vidaUtilMeses: parseInt(e.target.value) || 1 }; setVidaForm(v); }} />
                      <span className="text-xs text-muted-foreground whitespace-nowrap">meses</span>
                    </div>
                    <Button size="sm" variant="ghost" className="h-8 text-red-500" onClick={() => {
                      const v = [...(vidaForm.length > 0 ? vidaForm : vidaFormInit)].filter((_, i) => i !== idx);
                      setVidaForm(v);
                    }}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                <div className="flex gap-2 pt-2">
                  <Button size="sm" variant="outline" onClick={() => {
                    setVidaForm([...(vidaForm.length > 0 ? vidaForm : vidaFormInit), { nomeEpi: "", categoriaEpi: "EPI", vidaUtilMeses: 6, observacoes: "" }]);
                  }}>
                    <Plus className="h-3 w-3 mr-1" /> Adicionar
                  </Button>
                  <Button size="sm" className="bg-[#1B2A4A] hover:bg-[#243660]" disabled={vidaUtilUpsertMut.isPending}
                    onClick={() => {
                      const valid = (vidaForm.length > 0 ? vidaForm : vidaFormInit).filter(v => v.nomeEpi.trim());
                      vidaUtilUpsertMut.mutate({ companyId, companyIds, items: valid });
                    }}>
                    {vidaUtilUpsertMut.isPending ? "Salvando..." : "Salvar Vida Útil"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ============================================================ */}
      {/* TREINAMENTOS VINCULADOS */}
      {/* ============================================================ */}
      {tab === "treinamentos" && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <IAButton loading={iaTreinoMut.isPending} onClick={() => iaTreinoMut.mutate({ companyId })} label="Sugerir Treinamentos com IA" />
          </div>

          {/* IA Suggestions for Treinamentos */}
          {iaSugestaoTreino && iaSugestaoTreino.length > 0 && (
            <div className="space-y-3">
              <IASuggestionBanner
                count={iaSugestaoTreino.length}
                onClear={() => setIaSugestaoTreino(null)}
                onAcceptAll={() => {
                  setTreinoForm(iaSugestaoTreino.map(t => ({ nomeEpi: t.nomeEpi, normaExigida: t.normaExigida, nomeTreinamento: t.nomeTreinamento, obrigatorio: t.obrigatorio !== false })));
                  setIaSugestaoTreino(null);
                  toast.success("Sugestões aplicadas! Clique em 'Salvar Treinamentos' para confirmar.");
                }}
              />
              <Card className="border-violet-200 bg-violet-50/30">
                <CardContent className="pt-3">
                  <div className="space-y-1.5">
                    {iaSugestaoTreino.map((item, idx) => (
                      <div key={idx} className="flex gap-2 items-center text-xs">
                        <GraduationCap className="h-3.5 w-3.5 text-violet-500 shrink-0" />
                        <span className="font-medium">{item.nomeEpi}</span>
                        <Badge variant="outline" className="text-[10px] border-violet-200">{item.normaExigida}</Badge>
                        <span className="flex-1 text-violet-700">{item.nomeTreinamento}</span>
                        {item.obrigatorio && <Badge className="text-[10px] bg-red-100 text-red-700 border-red-200">Obrigatório</Badge>}
                        <Button size="sm" variant="ghost" className="h-6 text-red-500" onClick={() => {
                          setIaSugestaoTreino(prev => prev?.filter((_, i) => i !== idx) || null);
                        }}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <GraduationCap className="h-4 w-4" /> Treinamentos Vinculados a EPIs
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                EPIs que exigem treinamento para uso. O sistema bloqueará ou alertará na entrega se o funcionário não possuir o treinamento válido.
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {(treinoForm.length > 0 ? treinoForm : treinoFormInit).map((item, idx) => (
                  <div key={idx} className="flex gap-2 items-center flex-wrap">
                    <Input className="flex-1 min-w-[140px] h-8 text-xs" value={item.nomeEpi}
                      onChange={e => { const t = [...(treinoForm.length > 0 ? treinoForm : treinoFormInit)]; t[idx] = { ...t[idx], nomeEpi: e.target.value }; setTreinoForm(t); }}
                      placeholder="Nome do EPI" />
                    <Input className="w-20 h-8 text-xs" value={item.normaExigida}
                      onChange={e => { const t = [...(treinoForm.length > 0 ? treinoForm : treinoFormInit)]; t[idx] = { ...t[idx], normaExigida: e.target.value }; setTreinoForm(t); }}
                      placeholder="NR-XX" />
                    <Input className="flex-1 min-w-[180px] h-8 text-xs" value={item.nomeTreinamento}
                      onChange={e => { const t = [...(treinoForm.length > 0 ? treinoForm : treinoFormInit)]; t[idx] = { ...t[idx], nomeTreinamento: e.target.value }; setTreinoForm(t); }}
                      placeholder="Nome do treinamento" />
                    <Button size="sm" variant="ghost" className="h-8 text-red-500" onClick={() => {
                      const t = [...(treinoForm.length > 0 ? treinoForm : treinoFormInit)].filter((_, i) => i !== idx);
                      setTreinoForm(t);
                    }}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                <div className="flex gap-2 pt-2">
                  <Button size="sm" variant="outline" onClick={() => {
                    setTreinoForm([...(treinoForm.length > 0 ? treinoForm : treinoFormInit), { nomeEpi: "", normaExigida: "", nomeTreinamento: "", obrigatorio: true }]);
                  }}>
                    <Plus className="h-3 w-3 mr-1" /> Adicionar
                  </Button>
                  <Button size="sm" className="bg-[#1B2A4A] hover:bg-[#243660]" disabled={treinamentosUpsertMut.isPending}
                    onClick={() => {
                      const valid = (treinoForm.length > 0 ? treinoForm : treinoFormInit).filter(t => t.nomeEpi.trim() && t.normaExigida.trim());
                      treinamentosUpsertMut.mutate({ companyId, companyIds, items: valid });
                    }}>
                    {treinamentosUpsertMut.isPending ? "Salvando..." : "Salvar Treinamentos"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Info box */}
          <Card className="border-amber-200 bg-amber-50/50">
            <CardContent className="py-3">
              <div className="flex gap-2 items-start">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-800">
                  <p className="font-semibold mb-1">Como funciona o bloqueio de entrega?</p>
                  <p>Quando um TST for entregar um EPI que exige treinamento, o sistema verificará automaticamente se o funcionário possui o treinamento correspondente com validade vigente. Se não possuir, será exibido um alerta com a NR exigida.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
