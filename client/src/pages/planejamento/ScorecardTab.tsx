import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Trophy, ShieldCheck, BarChart3, BarChart2, ShoppingCart, Package, Star,
  Settings, Plus, Trash2, TrendingUp, TrendingDown, AlertTriangle,
  CheckCircle2, Loader2, Wrench, DollarSign, ChevronDown, ChevronUp,
  Users, HardHat, RefreshCw, Info,
} from "lucide-react";
import { RadialBarChart, RadialBar, PolarAngleAxis, ResponsiveContainer, Tooltip } from "recharts";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fPct = (v: number) => `${v.toFixed(1)}%`;
const today = () => new Date().toISOString().slice(0, 10);

function ScoreGauge({ score, size = 140 }: { score: number; size?: number }) {
  const color = score >= 80 ? "#22c55e" : score >= 60 ? "#f59e0b" : score >= 40 ? "#f97316" : "#ef4444";
  const data = [{ name: "score", value: score, fill: color }];
  return (
    <div style={{ width: size, height: size }} className="relative">
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          cx="50%" cy="50%"
          innerRadius="70%" outerRadius="90%"
          startAngle={225} endAngle={-45}
          data={data}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar background dataKey="value" cornerRadius={8} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-black" style={{ color }}>{score}</span>
        <span className="text-[10px] text-gray-400 font-medium">/ 100</span>
      </div>
    </div>
  );
}

function MiniGauge({ score }: { score: number }) {
  const color = score >= 80 ? "bg-green-500" : score >= 60 ? "bg-amber-500" : score >= 40 ? "bg-orange-500" : "bg-red-500";
  return (
    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${score}%` }} />
    </div>
  );
}

function getBonusFatorLabel(score: number) {
  if (score >= 90) return { pct: 100, label: "100%", color: "text-green-600" };
  if (score >= 75) return { pct: 80, label: "80%", color: "text-lime-600" };
  if (score >= 60) return { pct: 50, label: "50%", color: "text-amber-600" };
  if (score >= 40) return { pct: 20, label: "20%", color: "text-orange-600" };
  return { pct: 0, label: "0%", color: "text-red-600" };
}

const DIMENSAO_META: { key: string; label: string; icon: React.ReactNode; color: string; bg: string }[] = [
  { key: "seguranca",    label: "Segurança",    icon: <HardHat className="w-4 h-4" />,      color: "text-red-600",    bg: "bg-red-50 border-red-100" },
  { key: "planejamento", label: "Planejamento", icon: <BarChart3 className="w-4 h-4" />,     color: "text-blue-600",   bg: "bg-blue-50 border-blue-100" },
  { key: "compras",      label: "Compras",      icon: <ShoppingCart className="w-4 h-4" />,  color: "text-violet-600", bg: "bg-violet-50 border-violet-100" },
  { key: "almox",        label: "Almoxarifado", icon: <Package className="w-4 h-4" />,       color: "text-teal-600",   bg: "bg-teal-50 border-teal-100" },
  { key: "qualidade",    label: "Qualidade",    icon: <Star className="w-4 h-4" />,          color: "text-amber-600",  bg: "bg-amber-50 border-amber-100" },
];

const EVENTO_ICONS: Record<string, React.ReactNode> = {
  seguranca:    <HardHat className="w-3.5 h-3.5 text-red-500" />,
  planejamento: <BarChart3 className="w-3.5 h-3.5 text-blue-500" />,
  compras:      <ShoppingCart className="w-3.5 h-3.5 text-violet-500" />,
  almox:        <Package className="w-3.5 h-3.5 text-teal-500" />,
  qualidade:    <Star className="w-3.5 h-3.5 text-amber-500" />,
};

// ─── Config Modal ────────────────────────────────────────────────────────────
function ConfigModal({ open, onClose, companyId, obraId, currentConfig, onSaved }: {
  open: boolean; onClose: () => void; companyId: number; obraId: number;
  currentConfig: any; onSaved: () => void;
}) {
  const [bonusTipo, setBonusTipo]   = useState<"percentual_lucro" | "valor_fixo">(currentConfig?.bonus_tipo ?? "percentual_lucro");
  const [bonusValor, setBonusValor] = useState(String(currentConfig?.bonus_valor ?? "5"));
  const [aliquotaImpostos, setAliquotaImpostos] = useState(String(parseFloat(currentConfig?.aliquota_impostos ?? "17")));
  const [pctCustosFixos,   setPctCustosFixos]   = useState(String(parseFloat(currentConfig?.pct_custos_fixos  ?? "0")));
  const [pesos, setPesos] = useState({
    seguranca:    parseInt(currentConfig?.peso_seguranca    ?? "30"),
    planejamento: parseInt(currentConfig?.peso_planejamento ?? "25"),
    compras:      parseInt(currentConfig?.peso_compras      ?? "20"),
    almox:        parseInt(currentConfig?.peso_almox        ?? "15"),
    qualidade:    parseInt(currentConfig?.peso_qualidade    ?? "10"),
  });
  const saveConfig = trpc.scorecard.saveConfig.useMutation({
    onSuccess: () => { toast.success("Configuração salva!"); onSaved(); onClose(); },
    onError: (e) => toast.error(e.message),
  });
  const somaTotal = Object.values(pesos).reduce((s, v) => s + v, 0);
  const setPeso = (k: string, v: number) => setPesos(p => ({ ...p, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-gray-500" /> Configurar Scorecard
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* Bônus */}
          <div>
            <Label>Tipo de Bônus</Label>
            <Select value={bonusTipo} onValueChange={(v) => setBonusTipo(v as any)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="percentual_lucro">% do Lucro Líquido da Obra</SelectItem>
                <SelectItem value="valor_fixo">Valor Fixo (R$)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{bonusTipo === "percentual_lucro" ? "Percentual (%)" : "Valor Fixo (R$)"}</Label>
            <Input type="number" min={0} step={0.5} value={bonusValor}
              onChange={e => setBonusValor(e.target.value)} className="mt-1" />
          </div>

          {/* Alíquotas para Lucro Líquido */}
          <div className="border-t pt-3 space-y-3">
            <Label className="block text-sm font-semibold text-gray-700">Deduções para Lucro Líquido</Label>
            <p className="text-[11px] text-gray-400 -mt-1">
              Aplicadas sobre o Valor do Contrato para calcular o Lucro Líquido (após impostos e overhead).
            </p>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-600 w-40">Alíquota de Impostos</span>
              <Input type="number" min={0} max={100} step={0.1} value={aliquotaImpostos}
                onChange={e => setAliquotaImpostos(e.target.value)} className="w-20 text-center text-sm h-8" />
              <span className="text-xs text-gray-400">% sobre receita</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-600 w-40">Custos Fixos / Overhead</span>
              <Input type="number" min={0} max={100} step={0.1} value={pctCustosFixos}
                onChange={e => setPctCustosFixos(e.target.value)} className="w-20 text-center text-sm h-8" />
              <span className="text-xs text-gray-400">% sobre receita</span>
            </div>
            <p className="text-[11px] text-gray-400">
              Alíquota real de referência: <strong>15,16%</strong> (≈ 17% arredondado). Inclui ISS, PIS/COFINS, IRPJ e CSLL sobre receita bruta.
            </p>
          </div>

          {/* Pesos por dimensão */}
          <div className="border-t pt-3">
            <div className="flex items-center justify-between mb-2">
              <Label>Pesos por Dimensão</Label>
              <span className={`text-xs font-bold ${somaTotal === 100 ? "text-green-600" : "text-red-600"}`}>
                Soma: {somaTotal}% {somaTotal !== 100 && "(deve ser 100%)"}
              </span>
            </div>
            <div className="space-y-2">
              {DIMENSAO_META.map(d => (
                <div key={d.key} className="flex items-center gap-3">
                  <span className={`text-xs w-24 ${d.color}`}>{d.label}</span>
                  <Input type="number" min={0} max={100} step={5}
                    value={pesos[d.key as keyof typeof pesos]}
                    onChange={e => setPeso(d.key, parseInt(e.target.value) || 0)}
                    className="w-20 text-center text-sm h-8" />
                  <span className="text-xs text-gray-400">%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            disabled={somaTotal !== 100 || saveConfig.isPending}
            onClick={() => saveConfig.mutate({
              companyId, obraId, bonusTipo, bonusValor: parseFloat(bonusValor) || 0,
              pesoSeguranca: pesos.seguranca, pesoPlanejamento: pesos.planejamento,
              pesoCompras: pesos.compras, pesoAlmox: pesos.almox, pesoQualidade: pesos.qualidade,
              metaSpi: 0.9, metaCpi: 0.9, maxAcidentesGraves: 0, maxEmergenciaisPct: 10,
              aliquotaImpostos: parseFloat(aliquotaImpostos) || 0,
              pctCustosFixos:   parseFloat(pctCustosFixos)   || 0,
            })}
          >
            {saveConfig.isPending ? <><Loader2 className="w-4 h-4 animate-spin mr-1" />Salvando…</> : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Retrabalho Modal ────────────────────────────────────────────────────────
function NovoRetrabalhoModal({ open, onClose, companyId, obraId, onSaved }: {
  open: boolean; onClose: () => void; companyId: number; obraId: number; onSaved: () => void;
}) {
  const [form, setForm] = useState({ dataOcorrencia: today(), servicoAfetado: "", causaRaiz: "", custoEstimado: "" });
  const create = trpc.scorecard.retrabalhoCreate.useMutation({
    onSuccess: () => { toast.success("Retrabalho registrado."); onSaved(); onClose(); setForm({ dataOcorrencia: today(), servicoAfetado: "", causaRaiz: "", custoEstimado: "" }); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Wrench className="w-5 h-5 text-amber-500" />Registrar Retrabalho</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label>Data da Ocorrência</Label>
            <Input type="date" value={form.dataOcorrencia} onChange={e => setForm(f => ({ ...f, dataOcorrencia: e.target.value }))} className="mt-1" />
          </div>
          <div>
            <Label>Serviço / Atividade Afetada *</Label>
            <Input placeholder="Ex: Reboco parede eixo B" value={form.servicoAfetado}
              onChange={e => setForm(f => ({ ...f, servicoAfetado: e.target.value }))} className="mt-1" />
          </div>
          <div>
            <Label>Causa Raiz</Label>
            <Textarea placeholder="Descreva a causa do retrabalho…" value={form.causaRaiz}
              onChange={e => setForm(f => ({ ...f, causaRaiz: e.target.value }))} className="mt-1" rows={3} />
          </div>
          <div>
            <Label>Custo Estimado (R$)</Label>
            <Input type="number" min={0} step={100} placeholder="0,00" value={form.custoEstimado}
              onChange={e => setForm(f => ({ ...f, custoEstimado: e.target.value }))} className="mt-1" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={!form.servicoAfetado || create.isPending}
            onClick={() => create.mutate({ companyId, obraId, dataOcorrencia: form.dataOcorrencia,
              servicoAfetado: form.servicoAfetado, causaRaiz: form.causaRaiz || undefined,
              custoEstimado: form.custoEstimado ? parseFloat(form.custoEstimado) : undefined })}>
            {create.isPending ? <><Loader2 className="w-4 h-4 animate-spin mr-1" />Salvando…</> : "Registrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Principal ───────────────────────────────────────────────────────────────
export default function ScorecardTab({ proj }: { proj: any }) {
  const { user } = useAuth();
  const isAdmin = ["admin", "admin_master"].includes(user?.role ?? "");
  const obraId   = proj?.obraId ?? null;
  const companyId = proj?.companyId ?? 0;

  const [showConfig, setShowConfig] = useState(false);
  const [showRetrabalho, setShowRetrabalho] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [showEventos, setShowEventos] = useState(true);
  const [showFerramentas, setShowFerramentas] = useState(false);
  const [showRetrabalhos, setShowRetrabalhos] = useState(false);
  const [showMemoria, setShowMemoria] = useState(false);
  const [showAnalise, setShowAnalise] = useState(false);
  const [abaAnalise, setAbaAnalise] = useState<"compras" | "ferramentas" | "locacoes" | "seguranca" | "rh">("seguranca");
  const [expandedRH, setExpandedRH] = useState<Set<number>>(new Set());
  const [rhMesInicio, setRhMesInicio] = useState<string>("");
  const [rhMesFim, setRhMesFim]   = useState<string>("");

  const enabled = !!obraId;

  const score = trpc.scorecard.getScore.useQuery(
    { companyId, obraId: obraId! },
    { enabled, refetchInterval: 60_000 }
  );
  const ferramentas = trpc.scorecard.ferramentasList.useQuery(
    { companyId, obraId: obraId! },
    { enabled: enabled && showFerramentas }
  );
  const analise = trpc.scorecard.getAnalise.useQuery(
    { companyId, obraId: obraId! },
    { enabled: enabled && showAnalise && abaAnalise !== "seguranca" && abaAnalise !== "rh", staleTime: 120_000 }
  );
  const analiseSeguranca = trpc.scorecard.getSeguranca.useQuery(
    { companyId, obraId: obraId! },
    { enabled: enabled && showAnalise && abaAnalise === "seguranca", staleTime: 120_000 }
  );
  const analiseRH = trpc.scorecard.getCustosRH.useQuery(
    { companyId, obraId: obraId!, mesInicio: rhMesInicio || undefined, mesFim: rhMesFim || undefined },
    { enabled: enabled && showAnalise && abaAnalise === "rh", staleTime: 120_000 }
  );
  const utils = trpc.useUtils();
  const refetch = () => { utils.scorecard.getScore.invalidate(); utils.scorecard.ferramentasList.invalidate(); };

  const deleteRetrabalho = trpc.scorecard.retrabalhoDelete.useMutation({
    onSuccess: () => { toast.success("Retrabalho removido."); refetch(); setDeleteId(null); },
    onError: (e) => toast.error(e.message),
  });

  if (!obraId) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
        <div className="text-center space-y-2">
          <Trophy className="w-10 h-10 mx-auto text-gray-300" />
          <p>Este projeto não tem uma obra vinculada.</p>
          <p className="text-xs">Vincule uma obra para ativar o Scorecard do Gestor.</p>
        </div>
      </div>
    );
  }

  if (score.isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>;
  }

  if (score.isError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2 text-center px-4">
        <AlertTriangle className="w-8 h-8 text-amber-500" />
        <p className="text-sm font-medium text-gray-700">Erro ao carregar o Scorecard</p>
        <p className="text-xs text-gray-400 break-all">{(score.error as any)?.message ?? "Erro desconhecido"}</p>
        <Button size="sm" variant="outline" className="mt-2" onClick={refetch}><RefreshCw className="w-3.5 h-3.5 mr-1" />Tentar novamente</Button>
      </div>
    );
  }

  const data = score.data;
  if (!data) {
    return <div className="flex items-center justify-center h-64 text-gray-400 text-sm">Sem dados disponíveis.</div>;
  }

  const { scores, detalhes, financeiro, bonus, eventos, config } = data;
  const total = scores.total;
  const fatorInfo = getBonusFatorLabel(total);

  const scoreColor = total >= 80 ? "text-green-600" : total >= 60 ? "text-amber-600" : total >= 40 ? "text-orange-600" : "text-red-600";

  return (
    <div className="p-4 space-y-5">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-amber-500" />
          <h2 className="text-base font-bold text-gray-800">Scorecard do Gestor</h2>
          {proj?.responsavel && (
            <Badge variant="outline" className="text-xs font-normal">{proj.responsavel}</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={refetch}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" />Atualizar
          </Button>
          {isAdmin && (
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setShowConfig(true)}>
              <Settings className="w-3.5 h-3.5 mr-1" />Configurar
            </Button>
          )}
        </div>
      </div>

      {/* ── Score + Bônus (topo) ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Score Total */}
        <Card className="border shadow-sm">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-6">
              <ScoreGauge score={total} size={120} />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500 font-medium mb-1">Score Total</p>
                <div className="flex items-baseline gap-1 mb-2">
                  <span className={`text-4xl font-black ${scoreColor}`}>{total}</span>
                  <span className="text-sm text-gray-400">/ 100</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {total >= 90 && <Badge className="bg-green-100 text-green-700 text-[10px]">Excelente</Badge>}
                  {total >= 75 && total < 90 && <Badge className="bg-lime-100 text-lime-700 text-[10px]">Muito Bom</Badge>}
                  {total >= 60 && total < 75 && <Badge className="bg-amber-100 text-amber-700 text-[10px]">Regular</Badge>}
                  {total >= 40 && total < 60 && <Badge className="bg-orange-100 text-orange-700 text-[10px]">Atenção</Badge>}
                  {total < 40 && <Badge className="bg-red-100 text-red-700 text-[10px]">Crítico</Badge>}
                </div>
                <div className="mt-3 space-y-0.5">
                  <p className="text-[11px] text-gray-400">Fator de bônus: <span className={`font-bold ${fatorInfo.color}`}>{fatorInfo.label}</span></p>
                  {total < 90 && (
                    <p className="text-[10px] text-gray-400">
                      +{90 - total} pts para bônus 100%
                    </p>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Bônus */}
        <Card className="border shadow-sm">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-2 mb-3">
              <DollarSign className="w-4 h-4 text-green-600" />
              <p className="text-xs font-semibold text-gray-700">Bônus do Gestor</p>
              {!config && isAdmin && (
                <button onClick={() => setShowConfig(true)} className="ml-auto text-[10px] text-blue-600 underline">Configurar</button>
              )}
            </div>
            {!config ? (
              <div className="flex flex-col items-center justify-center py-4 text-center">
                <Info className="w-8 h-8 text-gray-300 mb-2" />
                <p className="text-xs text-gray-400">Nenhuma meta configurada.</p>
                {isAdmin && <button onClick={() => setShowConfig(true)} className="text-xs text-blue-600 underline mt-1">Configurar agora</button>}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-[11px] text-gray-500">Tipo</span>
                  <span className="text-[11px] font-medium text-gray-700">
                    {bonus.bonusTipo === "percentual_lucro" ? `${bonus.bonusValorConfig}% do LL` : "Valor fixo"}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[11px] text-gray-500">Bônus máximo (score 100%)</span>
                  <span className="text-sm font-bold text-gray-700">{fmt(bonus.bonusMaximo)}</span>
                </div>
                <div className="h-px bg-gray-100" />
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-600">Bônus projetado</span>
                  <span className={`text-lg font-black ${total >= 60 ? "text-green-600" : "text-red-600"}`}>{fmt(bonus.bonusProjetado)}</span>
                </div>
                {bonus.bonusMaximo > 0 && bonus.bonusProjetado < bonus.bonusMaximo && (
                  <p className="text-[10px] text-gray-400 text-right">
                    Perda potencial: <span className="text-red-500 font-medium">{fmt(bonus.bonusMaximo - bonus.bonusProjetado)}</span>
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── 5 Dimensões ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {DIMENSAO_META.map(d => {
          const s = scores[d.key as keyof typeof scores] as number;
          const pesoKey = `peso_${d.key}` as string;
          const peso = config ? parseInt(String((config as any)[pesoKey] ?? "0")) : null;
          return (
            <Card key={d.key} className={`border ${d.bg} shadow-sm`}>
              <CardContent className="p-3">
                <div className={`flex items-center gap-1.5 mb-2 ${d.color}`}>
                  {d.icon}
                  <span className="text-[11px] font-semibold">{d.label}</span>
                  {peso !== null && <span className="ml-auto text-[9px] text-gray-400">{peso}%</span>}
                </div>
                <div className={`text-2xl font-black mb-1.5 ${d.color}`}>{s}<span className="text-sm font-normal text-gray-400">/100</span></div>
                <MiniGauge score={s} />
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ── Destaques Resumo ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        {[
          { label: "Acidentes", value: detalhes.acidentesCount, icon: <AlertTriangle className="w-3.5 h-3.5 text-red-500" />, bad: detalhes.acidentesCount > 0 },
          { label: "Advertências", value: detalhes.warningsCount, icon: <AlertTriangle className="w-3.5 h-3.5 text-orange-500" />, bad: detalhes.warningsCount > 0 },
          { label: "OCs Emerg.", value: `${detalhes.totalEmergenciais} (${detalhes.pctEmergencial}%)`, icon: <ShoppingCart className="w-3.5 h-3.5 text-violet-500" />, bad: detalhes.pctEmergencial > 10 },
          { label: "DDS Realiz.", value: detalhes.ddsCount, icon: <Users className="w-3.5 h-3.5 text-blue-500" />, bad: false },
          { label: "Retrabalhos", value: detalhes.retrabalhos, icon: <Wrench className="w-3.5 h-3.5 text-amber-500" />, bad: detalhes.retrabalhos > 0 },
          { label: "Ferramentas Perdidas", value: detalhes.ferramentasPerdidas, icon: <Package className="w-3.5 h-3.5 text-teal-500" />, bad: detalhes.ferramentasPerdidas > 0 },
        ].map((item, i) => (
          <div key={i} className={`rounded-lg border p-2 text-center ${item.bad ? "bg-red-50 border-red-100" : "bg-gray-50 border-gray-100"}`}>
            <div className="flex justify-center mb-1">{item.icon}</div>
            <div className={`text-base font-black ${item.bad ? "text-red-600" : "text-gray-700"}`}>{item.value}</div>
            <div className="text-[9px] text-gray-500 leading-tight">{item.label}</div>
          </div>
        ))}
      </div>

      {/* ── SPI / CPI ───────────────────────────────────────────────────────── */}
      {(detalhes.spi !== null || detalhes.cpi !== null) && (
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "SPI (Prazo)", val: detalhes.spi, suffix: detalhes.refisCount > 0 ? `${detalhes.refisCount} REFI(s)` : null },
            { label: "CPI (Custo)", val: detalhes.cpi },
          ].map((kpi, i) => {
            if (kpi.val === null) return null;
            const good = kpi.val >= 0.9;
            return (
              <div key={i} className={`rounded-lg border p-3 ${good ? "bg-green-50 border-green-100" : "bg-red-50 border-red-100"}`}>
                <p className="text-[11px] text-gray-500 mb-0.5">{kpi.label}</p>
                <div className="flex items-baseline gap-1.5">
                  <span className={`text-2xl font-black ${good ? "text-green-600" : "text-red-600"}`}>{kpi.val.toFixed(2)}</span>
                  {good ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <AlertTriangle className="w-4 h-4 text-red-500" />}
                </div>
                {kpi.suffix && <p className="text-[10px] text-gray-400 mt-0.5">{kpi.suffix} emitido(s)</p>}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Raio-X Financeiro ───────────────────────────────────────────────── */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-green-600" />
            Raio-X Financeiro da Obra
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">

          {/* ── Previsto ─────────────────────────────────────────── */}
          <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5 space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Previsto (orçamento)</p>
            {financeiro.valorContrato === 0 ? (
              <p className="text-xs text-amber-600 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />Nenhum orçamento vinculado a esta obra.
              </p>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Valor do Contrato</span>
                  <span className="text-sm font-semibold text-gray-800">{fmt(financeiro.valorContrato)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">(−) Custo Direto Previsto</span>
                  <span className="text-sm font-semibold text-red-600">{fmt(financeiro.custoPrevisto)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">= Lucro Bruto Previsto</span>
                  <span className="text-sm font-semibold text-gray-700">{fmt(financeiro.lucroBrutoPrevisto)}</span>
                </div>
                {(financeiro.aliquotaImpostos > 0 || financeiro.pctCustosFixos > 0) && (
                  <>
                    {financeiro.aliquotaImpostos > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">(−) Impostos ({financeiro.aliquotaImpostos.toFixed(1)}%)</span>
                        <span className="text-xs font-medium text-orange-600">{fmt(financeiro.impostosPrevistos)}</span>
                      </div>
                    )}
                    {financeiro.pctCustosFixos > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">(−) Custos Fixos ({financeiro.pctCustosFixos.toFixed(1)}%)</span>
                        <span className="text-xs font-medium text-orange-600">{fmt(financeiro.custosFixosPrevistos)}</span>
                      </div>
                    )}
                  </>
                )}
                <div className="flex items-center justify-between border-t border-gray-200 pt-1.5 mt-0.5">
                  <span className="text-xs font-bold text-gray-700">
                    = Lucro Líquido Previsto
                    {financeiro.aliquotaImpostos === 0 && financeiro.pctCustosFixos === 0 && (
                      <button onClick={() => setShowConfig(true)} className="ml-1.5 text-[10px] text-blue-500 font-normal underline">configurar deduções</button>
                    )}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${financeiro.lucroLiquidoPrevisto >= 0 ? "bg-green-500" : "bg-red-500"}`} />
                    <span className={`text-sm font-bold ${financeiro.lucroLiquidoPrevisto >= 0 ? "text-green-700" : "text-red-600"}`}>
                      {fmt(financeiro.lucroLiquidoPrevisto)}
                    </span>
                    <span className="text-[10px] text-gray-400">({financeiro.margemPrevista.toFixed(1)}%)</span>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* ── Realizado ────────────────────────────────────────── */}
          <div className={`rounded-lg border px-3 py-2.5 space-y-1.5 ${financeiro.lucroLiquidoRealizado >= 0 ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Realizado (financeiro + compras)</p>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Valor do Contrato</span>
              <span className="text-sm font-semibold text-gray-700">{fmt(financeiro.valorContrato)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">(−) Custo Realizado</span>
              <span className="text-sm font-semibold text-red-600">{fmt(financeiro.custoRealizado)}</span>
            </div>
            {financeiro.custoPrevisto > 0 && (
              <div className="space-y-0.5 pb-0.5">
                <div className="h-1.5 w-full rounded-full bg-gray-200 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${financeiro.custoRealizado / financeiro.custoPrevisto > 1 ? "bg-red-500" : financeiro.custoRealizado / financeiro.custoPrevisto > 0.85 ? "bg-amber-500" : "bg-blue-500"}`}
                    style={{ width: `${Math.min((financeiro.custoRealizado / financeiro.custoPrevisto) * 100, 100)}%` }}
                  />
                </div>
                <p className="text-[10px] text-gray-400 text-right">
                  {((financeiro.custoRealizado / financeiro.custoPrevisto) * 100).toFixed(1)}% do custo previsto consumido
                </p>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">= Lucro Bruto Realizado</span>
              <span className="text-sm font-semibold text-gray-700">{fmt(financeiro.lucroBrutoRealizado)}</span>
            </div>
            {(financeiro.aliquotaImpostos > 0 || financeiro.pctCustosFixos > 0) && (
              <>
                {financeiro.aliquotaImpostos > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">(−) Impostos ({financeiro.aliquotaImpostos.toFixed(1)}%)</span>
                    <span className="text-xs font-medium text-orange-600">{fmt(financeiro.impostosRealizados)}</span>
                  </div>
                )}
                {financeiro.pctCustosFixos > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">(−) Custos Fixos ({financeiro.pctCustosFixos.toFixed(1)}%)</span>
                    <span className="text-xs font-medium text-orange-600">{fmt(financeiro.custosFixosRealizados)}</span>
                  </div>
                )}
              </>
            )}
            <div className="flex items-center justify-between border-t border-gray-200 pt-1.5 mt-0.5">
              <span className="text-sm font-bold text-gray-700">= Lucro Líquido Realizado</span>
              <div className="flex items-center gap-1.5">
                <span className={`w-2.5 h-2.5 rounded-full ${financeiro.lucroLiquidoRealizado >= 0 ? "bg-green-500" : "bg-red-500"}`} />
                <span className={`text-base font-black ${financeiro.lucroLiquidoRealizado >= 0 ? "text-green-700" : "text-red-600"}`}>
                  {fmt(financeiro.lucroLiquidoRealizado)}
                </span>
                <span className="text-[10px] text-gray-400">({financeiro.margemRealizada.toFixed(1)}%)</span>
              </div>
            </div>
          </div>

          {financeiro.lucroRealizado < 0 && (
            <p className="text-[10px] text-red-500 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />Obra com resultado negativo — bônus não calculado sobre lucro negativo.
            </p>
          )}

          {/* ── Memória de Cálculo (colapsável) ──────────────────── */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 text-xs font-medium text-gray-600 transition-colors"
              onClick={() => setShowMemoria(v => !v)}
            >
              <span className="flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-blue-500" />
                Memória de Cálculo
              </span>
              {showMemoria ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            {showMemoria && (
              <div className="px-3 py-3 space-y-4 text-xs bg-white">

                {/* Fonte do orçamento */}
                {financeiro.orcamentoInfo ? (
                  <div className="bg-blue-50 border border-blue-100 rounded px-2.5 py-1.5 text-[10px] text-blue-700 space-y-0.5">
                    <p className="font-semibold">Orçamento de referência</p>
                    <p>Código: <span className="font-mono">{financeiro.orcamentoInfo.codigo}</span> — Status: <span className="capitalize">{financeiro.orcamentoInfo.status}</span></p>
                    <p>Fonte do Valor do Contrato: <span className="font-mono">{financeiro.orcamentoInfo.fonteContrato === "valorNegociado" ? "valorNegociado (preço negociado com cliente)" : "totalVenda (preço de venda do orçamento)"}</span></p>
                  </div>
                ) : (
                  <p className="text-amber-600 text-[10px]">⚠ Nenhum orçamento vinculado — valores do contrato indisponíveis.</p>
                )}

                {/* Fórmula Previsto */}
                <div className="space-y-1">
                  <p className="font-semibold text-gray-700 uppercase tracking-wide text-[10px]">Previsto</p>
                  <div className="font-mono space-y-0.5 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-gray-500">(A) Valor do Contrato</span>
                      <span className="font-semibold">{fmt(financeiro.valorContrato)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">(B) Custo Direto Previsto</span>
                      <span className="font-semibold text-red-600">− {fmt(financeiro.custoPrevisto)}</span>
                    </div>
                    <div className="flex justify-between border-t border-dashed border-gray-200 pt-1 mt-0.5">
                      <span className="text-gray-600">Lucro Bruto = A − B</span>
                      <span className="font-semibold text-gray-700">{fmt(financeiro.lucroBrutoPrevisto)}</span>
                    </div>
                    {financeiro.aliquotaImpostos > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">(C) Impostos ({financeiro.aliquotaImpostos.toFixed(2)}% × A)</span>
                        <span className="font-semibold text-orange-600">− {fmt(financeiro.impostosPrevistos)}</span>
                      </div>
                    )}
                    {financeiro.pctCustosFixos > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">(D) Custos Fixos ({financeiro.pctCustosFixos.toFixed(2)}% × A)</span>
                        <span className="font-semibold text-orange-600">− {fmt(financeiro.custosFixosPrevistos)}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-dashed border-gray-200 pt-1 mt-0.5">
                      <span className="font-bold text-gray-800">
                        Lucro Líquido = A − B{financeiro.aliquotaImpostos > 0 ? " − C" : ""}{financeiro.pctCustosFixos > 0 ? " − D" : ""}
                      </span>
                      <span className={`font-bold ${financeiro.lucroLiquidoPrevisto >= 0 ? "text-green-700" : "text-red-600"}`}>
                        {fmt(financeiro.lucroLiquidoPrevisto)} ({financeiro.margemPrevista.toFixed(1)}%)
                      </span>
                    </div>
                    {financeiro.aliquotaImpostos === 0 && financeiro.pctCustosFixos === 0 && (
                      <p className="text-[10px] text-amber-600 mt-1">⚠ Sem impostos/custos fixos configurados — Lucro Líquido = Lucro Bruto. Configure em "Configurar".</p>
                    )}
                  </div>
                </div>

                {/* Fórmula Realizado */}
                <div className="space-y-1">
                  <p className="font-semibold text-gray-700 uppercase tracking-wide text-[10px]">Realizado</p>
                  <div className="font-mono space-y-0.5 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-gray-500">(A) Valor do Contrato</span>
                      <span className="font-semibold">{fmt(financeiro.valorContrato)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">(E) Custo Realizado</span>
                      <span className="font-semibold text-red-600">− {fmt(financeiro.custoRealizado)}</span>
                    </div>
                    <div className="flex justify-between border-t border-dashed border-gray-200 pt-1 mt-0.5">
                      <span className="text-gray-600">Lucro Bruto = A − E</span>
                      <span className="font-semibold text-gray-700">{fmt(financeiro.lucroBrutoRealizado)}</span>
                    </div>
                    {financeiro.aliquotaImpostos > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">(C) Impostos ({financeiro.aliquotaImpostos.toFixed(2)}% × A)</span>
                        <span className="font-semibold text-orange-600">− {fmt(financeiro.impostosRealizados)}</span>
                      </div>
                    )}
                    {financeiro.pctCustosFixos > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">(D) Custos Fixos ({financeiro.pctCustosFixos.toFixed(2)}% × A)</span>
                        <span className="font-semibold text-orange-600">− {fmt(financeiro.custosFixosRealizados)}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-dashed border-gray-200 pt-1 mt-0.5">
                      <span className="font-bold text-gray-800">
                        Lucro Líquido = A − E{financeiro.aliquotaImpostos > 0 ? " − C" : ""}{financeiro.pctCustosFixos > 0 ? " − D" : ""}
                      </span>
                      <span className={`font-bold ${financeiro.lucroLiquidoRealizado >= 0 ? "text-green-700" : "text-red-600"}`}>
                        {fmt(financeiro.lucroLiquidoRealizado)} ({financeiro.margemRealizada.toFixed(1)}%)
                      </span>
                    </div>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">
                    Fonte (E): <span className="font-mono">financial_entries</span> WHERE natureza=&#39;despesa&#39; AND status IN (&#39;pago&#39;, &#39;pago_parcial&#39;, &#39;liquidado&#39;, &#39;baixado&#39;)
                  </p>
                </div>

                {/* Breakdown custo por categoria */}
                {financeiro.custoPorCategoria.length > 0 && (
                  <div className="space-y-1">
                    <p className="font-semibold text-gray-700 uppercase tracking-wide text-[10px]">Composição do Custo Realizado (C)</p>
                    <div className="space-y-0.5 max-h-40 overflow-y-auto pr-1">
                      {financeiro.custoPorCategoria.map((cat: any, i: number) => (
                        <div key={i} className="flex justify-between text-[10px] py-0.5 border-b border-gray-50">
                          <span className="text-gray-500 truncate max-w-[60%]">
                            <span className="text-blue-600">[{cat.origem}]</span> {cat.conta}
                          </span>
                          <span className="font-semibold text-gray-700 shrink-0">{fmt(cat.total)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              </div>
            )}
          </div>

        </CardContent>
      </Card>

      {/* ── Análise Gerencial ────────────────────────────────────────────────── */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-2 pt-3 px-4 cursor-pointer" onClick={() => setShowAnalise(v => !v)}>
          <CardTitle className="text-sm flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-violet-600" />
            Análise Gerencial da Obra
            <div className="flex gap-1 ml-1 flex-wrap">
              {analise.data?.resumo?.alertasDesvio > 0 && (
                <Badge className="bg-red-100 text-red-700 text-[9px]">{analise.data.resumo.alertasDesvio} OC sem almox</Badge>
              )}
              {analise.data?.resumo?.alertasRecorrencia > 0 && (
                <Badge className="bg-amber-100 text-amber-700 text-[9px]">{analise.data.resumo.alertasRecorrencia} recompras</Badge>
              )}
              {(analiseSeguranca.data?.resumo?.totalAdvertencias ?? 0) > 0 && (
                <Badge className="bg-red-100 text-red-700 text-[9px]">{analiseSeguranca.data!.resumo.totalAdvertencias} advert.</Badge>
              )}
              {(analiseSeguranca.data?.resumo?.cltSemAso ?? 0) > 0 && (
                <Badge className="bg-amber-100 text-amber-700 text-[9px]">{analiseSeguranca.data!.resumo.cltSemAso} sem ASO</Badge>
              )}
            </div>
            <span className="ml-auto">{showAnalise ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}</span>
          </CardTitle>
        </CardHeader>
        {showAnalise && (
          <CardContent className="px-4 pb-4">
            {analise.isLoading ? (
              <div className="flex items-center justify-center py-8 gap-2 text-gray-400 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />Carregando análise…
              </div>
            ) : !analise.data ? (
              <p className="text-xs text-gray-400 py-4 text-center">Sem dados disponíveis.</p>
            ) : (
              <div className="space-y-4">

                {/* ── KPIs resumo ─── */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "Gasto em Compras", v: fmt(analise.data.resumo.totalGastoCompras), color: "text-gray-800" },
                    { label: "Custo de Locações", v: fmt(analise.data.resumo.totalLocacoes), color: "text-gray-800" },
                    { label: "Locações Ativas", v: String(analise.data.resumo.numLocacoesAtivas), color: "text-blue-700" },
                    { label: "Ferramentas Almox", v: String(analise.data.resumo.numItensAlmox), color: "text-teal-700" },
                    { label: "Em Uso (equipe)", v: String(analise.data.resumo.totalFerramentasEmUso), color: "text-indigo-700" },
                    { label: "OC sem entrada almox", v: String(analise.data.resumo.alertasDesvio), color: analise.data.resumo.alertasDesvio > 0 ? "text-red-600 font-bold" : "text-gray-500" },
                  ].map((k, i) => (
                    <div key={i} className="rounded-lg border border-gray-100 bg-gray-50 px-2.5 py-2 text-center">
                      <p className={`text-sm font-bold ${k.color}`}>{k.v}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">{k.label}</p>
                    </div>
                  ))}
                </div>

                {/* ── Abas ─── */}
                <div className="flex gap-1 border-b border-gray-200 pb-0 flex-wrap">
                  {(["seguranca", "rh", "compras", "ferramentas", "locacoes"] as const).map(aba => (
                    <button key={aba} onClick={() => setAbaAnalise(aba)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-t-md border-b-2 transition-colors ${abaAnalise === aba ? "border-violet-500 text-violet-700 bg-violet-50" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
                      {aba === "seguranca" ? "🛡️ Segurança" : aba === "rh" ? "👥 RH / Folha" : aba === "compras" ? "📦 Compras" : aba === "ferramentas" ? "🔧 Ferramentas" : "🚜 Locações"}
                    </button>
                  ))}
                </div>

                {/* ════════════ ABA: SEGURANÇA ════════════ */}
                {abaAnalise === "seguranca" && (
                  <div className="space-y-4">
                    {analiseSeguranca.isLoading ? (
                      <div className="flex items-center justify-center py-8 gap-2 text-gray-400 text-sm">
                        <Loader2 className="w-4 h-4 animate-spin" />Carregando dados de segurança…
                      </div>
                    ) : !analiseSeguranca.data ? (
                      <p className="text-xs text-gray-400 py-4 text-center">Sem dados disponíveis.</p>
                    ) : (
                      <div className="space-y-4">
                        {/* KPIs de segurança */}
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { label: "CLT na Obra", v: String(analiseSeguranca.data.resumo.totalClt), color: "text-gray-800" },
                            { label: "Terceiros", v: String(analiseSeguranca.data.resumo.totalTerceiros), color: "text-gray-800" },
                            { label: "Advertências", v: String(analiseSeguranca.data.resumo.totalAdvertencias), color: analiseSeguranca.data.resumo.totalAdvertencias > 0 ? "text-red-600 font-bold" : "text-gray-500" },
                            { label: "Sem ASO", v: String(analiseSeguranca.data.resumo.cltSemAso), color: analiseSeguranca.data.resumo.cltSemAso > 0 ? "text-amber-600 font-bold" : "text-gray-500" },
                            { label: "ASO Vencido", v: String(analiseSeguranca.data.resumo.cltAsoVencido), color: analiseSeguranca.data.resumo.cltAsoVencido > 0 ? "text-red-600 font-bold" : "text-gray-500" },
                            { label: "Custo EPI", v: fmt(analiseSeguranca.data.resumo.totalCustoEpi), color: "text-indigo-700" },
                          ].map((k, i) => (
                            <div key={i} className="rounded-lg border border-gray-100 bg-gray-50 px-2.5 py-2 text-center">
                              <p className={`text-sm font-bold ${k.color}`}>{k.v}</p>
                              <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">{k.label}</p>
                            </div>
                          ))}
                        </div>

                        {/* ─── QUADRO CLT ─── */}
                        {analiseSeguranca.data.clt.length > 0 && (
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5 flex items-center gap-1">
                              <Users className="w-3 h-3" />Funcionários CLT ({analiseSeguranca.data.clt.length})
                            </p>
                            <div className="rounded border border-gray-100 overflow-hidden">
                              <table className="w-full text-[10px]">
                                <thead className="bg-gray-50">
                                  <tr>
                                    <th className="text-left px-2 py-1.5 text-gray-500 font-semibold">Nome / Função</th>
                                    <th className="text-center px-2 py-1.5 text-gray-500 font-semibold w-16">ASO</th>
                                    <th className="text-center px-2 py-1.5 text-gray-500 font-semibold w-16">Trein.</th>
                                    <th className="text-center px-2 py-1.5 text-gray-500 font-semibold w-12">Advert.</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {analiseSeguranca.data.clt.map((e: any, i: number) => {
                                    const asoOk = e.aso_status === 'valido';
                                    const asoVenc = e.aso_status === 'vencido';
                                    const trVal = parseInt(String(e.treinamentos_validos ?? 0));
                                    const trVenc = parseInt(String(e.treinamentos_vencidos ?? 0));
                                    const adv = parseInt(String(e.num_advertencias ?? 0));
                                    return (
                                      <tr key={i} className={`border-t border-gray-50 ${adv > 0 ? "bg-red-50/50" : ""}`}>
                                        <td className="px-2 py-1.5">
                                          <p className="font-medium text-gray-800 truncate max-w-[130px]">{e.nome}</p>
                                          {e.cargo && <p className="text-gray-400 truncate max-w-[130px]">{e.cargo}</p>}
                                        </td>
                                        <td className="px-2 py-1.5 text-center">
                                          {asoOk ? (
                                            <span className="text-green-600 font-bold">✓</span>
                                          ) : asoVenc ? (
                                            <span className="text-red-600 font-bold" title={`Vencido em ${e.aso_validade}`}>!</span>
                                          ) : (
                                            <span className="text-amber-500 font-bold">—</span>
                                          )}
                                        </td>
                                        <td className="px-2 py-1.5 text-center">
                                          {trVal > 0 ? (
                                            <span className="text-green-600 font-bold">{trVal}</span>
                                          ) : (
                                            <span className="text-gray-300">0</span>
                                          )}
                                          {trVenc > 0 && <span className="text-red-500 ml-0.5">({trVenc}v)</span>}
                                        </td>
                                        <td className="px-2 py-1.5 text-center">
                                          {adv > 0 ? (
                                            <span className="text-red-600 font-bold">{adv}</span>
                                          ) : (
                                            <span className="text-gray-300">—</span>
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                            <p className="text-[9px] text-gray-400 mt-1">ASO: ✓=válido  !=vencido  —=sem registro · Trein.: quantidade válida (v=vencidos)</p>
                          </div>
                        )}

                        {/* ─── QUADRO TERCEIROS ─── */}
                        {analiseSeguranca.data.terceiros.length > 0 && (
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5 flex items-center gap-1">
                              <HardHat className="w-3 h-3" />Terceiros ({analiseSeguranca.data.terceiros.length})
                              {analiseSeguranca.data.resumo.terceirosSemDoc > 0 && (
                                <Badge className="ml-1 bg-amber-100 text-amber-700 text-[9px]">{analiseSeguranca.data.resumo.terceirosSemDoc} sem doc</Badge>
                              )}
                            </p>
                            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                              {analiseSeguranca.data.terceiros.map((t: any, i: number) => {
                                const docs = parseInt(String(t.docs_preenchidos ?? 0));
                                const semDoc = docs === 0;
                                const adv = parseInt(String(t.num_advertencias ?? 0));
                                return (
                                  <div key={i} className={`rounded border px-2.5 py-1.5 text-[10px] ${semDoc ? "border-amber-200 bg-amber-50" : adv > 0 ? "border-red-200 bg-red-50" : "border-gray-100 bg-gray-50"}`}>
                                    <div className="flex items-center gap-2">
                                      <span className="flex-1 font-medium text-gray-800 truncate">{t.nome}</span>
                                      <span className="text-gray-400 shrink-0">{t.empresa_nome}</span>
                                      {adv > 0 && <Badge className="bg-red-100 text-red-700 text-[9px]">{adv} advert.</Badge>}
                                      {semDoc ? (
                                        <Badge className="bg-amber-100 text-amber-700 text-[9px]">⚠ Sem docs</Badge>
                                      ) : (
                                        <Badge className="bg-green-100 text-green-700 text-[9px]">{docs} doc(s)</Badge>
                                      )}
                                    </div>
                                    <div className="flex gap-3 mt-0.5 text-gray-400 flex-wrap">
                                      {t.funcao && <span>{t.funcao}</span>}
                                      <span>ASO: {t.aso_status === 'valido' ? '✓' : t.aso_status === 'vencido' ? '⚠ Vencido' : '—'}</span>
                                      {t.nr35_validade && <span>NR-35: {t.nr35_validade.slice(0,10)}</span>}
                                      {t.nr10_validade && <span>NR-10: {t.nr10_validade.slice(0,10)}</span>}
                                      {t.nr33_validade && <span>NR-33: {t.nr33_validade.slice(0,10)}</span>}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* ─── TREINAMENTOS POR NORMA ─── */}
                        {analiseSeguranca.data.treinamentosNorma.length > 0 && (
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Treinamentos por Norma (CLT)</p>
                            <div className="rounded border border-gray-100 overflow-hidden">
                              <table className="w-full text-[10px]">
                                <thead className="bg-gray-50">
                                  <tr>
                                    <th className="text-left px-2 py-1.5 text-gray-500 font-semibold">Norma / Treinamento</th>
                                    <th className="text-right px-2 py-1.5 text-gray-500 font-semibold w-14">Funcion.</th>
                                    <th className="text-right px-2 py-1.5 text-gray-500 font-semibold w-12">Válidos</th>
                                    <th className="text-right px-2 py-1.5 text-gray-500 font-semibold w-12">Vencidos</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {analiseSeguranca.data.treinamentosNorma.map((n: any, i: number) => {
                                    const venc = parseInt(String(n.vencidos ?? 0));
                                    return (
                                      <tr key={i} className="border-t border-gray-50">
                                        <td className="px-2 py-1.5 text-gray-700 font-medium">{n.norma}</td>
                                        <td className="px-2 py-1.5 text-right text-gray-500">{n.total_funcionarios}</td>
                                        <td className="px-2 py-1.5 text-right text-green-600 font-semibold">{n.validos}</td>
                                        <td className={`px-2 py-1.5 text-right font-semibold ${venc > 0 ? "text-red-600" : "text-gray-300"}`}>{venc > 0 ? venc : "—"}</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {/* ─── ADVERTÊNCIAS ─── */}
                        {(analiseSeguranca.data.advertencias.length > 0 || analiseSeguranca.data.advertenciasTerceiros.length > 0) && (
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-red-500 mb-1.5 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />Advertências e Notificações ({analiseSeguranca.data.resumo.totalAdvertencias})
                            </p>
                            <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                              {[...analiseSeguranca.data.advertencias.map((w: any) => ({ ...w, tipo: "clt" })),
                                ...analiseSeguranca.data.advertenciasTerceiros.map((w: any) => ({ ...w, tipo: "terceiro" }))]
                                .sort((a: any, b: any) => b.data_ocorrencia?.localeCompare(a.data_ocorrencia ?? ""))
                                .map((w: any, i: number) => (
                                <div key={i} className="flex items-start gap-2 rounded bg-red-50 border border-red-100 px-2.5 py-1.5 text-[10px]">
                                  <div className="flex-1">
                                    <span className="font-semibold text-red-700">{w.tipo_advertencia}</span>
                                    <span className="text-gray-400 mx-1">·</span>
                                    <span className="text-gray-700">{w.funcionario_nome}</span>
                                    {w.tipo === "terceiro" && w.empresa_nome && (
                                      <span className="text-gray-400 ml-1">({w.empresa_nome})</span>
                                    )}
                                    {w.motivo && <p className="text-gray-500 mt-0.5 truncate">{w.motivo}</p>}
                                  </div>
                                  <span className="text-gray-400 shrink-0">{w.data_ocorrencia}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* ─── EPI CURVA ABC ─── */}
                        {analiseSeguranca.data.epiPorTipo.length > 0 && (
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Curva ABC — Consumo de EPI</p>
                            <div className="rounded border border-gray-100 overflow-hidden">
                              <table className="w-full text-[10px]">
                                <thead className="bg-gray-50">
                                  <tr>
                                    <th className="text-left px-2 py-1.5 text-gray-500 font-semibold w-6">Cl.</th>
                                    <th className="text-left px-2 py-1.5 text-gray-500 font-semibold">EPI</th>
                                    <th className="text-right px-2 py-1.5 text-gray-500 font-semibold w-14">Custo</th>
                                    <th className="text-right px-2 py-1.5 text-gray-500 font-semibold w-10">Un.</th>
                                    <th className="text-right px-2 py-1.5 text-gray-500 font-semibold w-10">Func.</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {analiseSeguranca.data.epiPorTipo.map((ep: any, i: number) => (
                                    <tr key={i} className="border-t border-gray-50">
                                      <td className="px-2 py-1">
                                        <span className={`font-bold text-xs ${ep.classe_abc === 'A' ? 'text-green-600' : ep.classe_abc === 'B' ? 'text-blue-600' : 'text-gray-400'}`}>{ep.classe_abc}</span>
                                      </td>
                                      <td className="px-2 py-1 text-gray-700 max-w-[130px] truncate">{ep.epi_nome}</td>
                                      <td className="px-2 py-1 text-right font-semibold text-gray-700">{fmt(parseFloat(String(ep.custo_total ?? 0)))}</td>
                                      <td className="px-2 py-1 text-right text-gray-400">{ep.total_unidades}</td>
                                      <td className="px-2 py-1 text-right text-gray-400">{ep.num_funcionarios}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {/* ─── EPI POR FUNCIONÁRIO ─── */}
                        {analiseSeguranca.data.epiPorFuncionario.length > 0 && (
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">EPI por Funcionário (maior consumo)</p>
                            <div className="space-y-1">
                              {(() => {
                                const maxCusto = Math.max(...analiseSeguranca.data!.epiPorFuncionario.map((e: any) => parseFloat(String(e.custo_estimado ?? 0))));
                                return analiseSeguranca.data!.epiPorFuncionario.slice(0, 15).map((e: any, i: number) => {
                                  const custo = parseFloat(String(e.custo_estimado ?? 0));
                                  const pct = maxCusto > 0 ? (custo / maxCusto) * 100 : 0;
                                  return (
                                    <div key={i} className="flex items-center gap-2 text-[10px]">
                                      <span className="w-24 text-gray-700 truncate shrink-0">{e.funcionario_nome?.split(' ')[0]}</span>
                                      <div className="flex-1 h-4 bg-gray-100 rounded overflow-hidden">
                                        <div className="h-full bg-indigo-400 rounded transition-all flex items-center pl-1"
                                          style={{ width: `${pct}%` }}>
                                          {pct > 25 && <span className="text-white text-[8px] font-semibold truncate">{fmt(custo)}</span>}
                                        </div>
                                      </div>
                                      {pct <= 25 && <span className="text-gray-600 shrink-0 text-[9px]">{fmt(custo)}</span>}
                                      <span className="text-gray-400 shrink-0">{e.total_unidades}un</span>
                                    </div>
                                  );
                                });
                              })()}
                            </div>
                          </div>
                        )}

                        {analiseSeguranca.data.clt.length === 0 && analiseSeguranca.data.terceiros.length === 0 && (
                          <p className="text-xs text-gray-400 text-center py-4">Nenhum colaborador cadastrado nesta obra.</p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* ════════════ ABA: RH / FOLHA ════════════ */}
                {abaAnalise === "rh" && (
                  <div className="space-y-4">
                    {/* Filtro de período */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Período:</span>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-gray-400">De</span>
                        <input type="month" value={rhMesInicio}
                          onChange={e => { setRhMesInicio(e.target.value); }}
                          className="border border-gray-200 rounded px-1.5 py-0.5 text-[10px] text-gray-700 bg-white" />
                        <span className="text-[10px] text-gray-400">Até</span>
                        <input type="month" value={rhMesFim}
                          onChange={e => { setRhMesFim(e.target.value); }}
                          className="border border-gray-200 rounded px-1.5 py-0.5 text-[10px] text-gray-700 bg-white" />
                        {(rhMesInicio || rhMesFim) && (
                          <button onClick={() => { setRhMesInicio(""); setRhMesFim(""); }}
                            className="text-[9px] text-gray-400 hover:text-red-500 px-1">✕ limpar</button>
                        )}
                      </div>
                    </div>

                    {analiseRH.isLoading ? (
                      <div className="flex items-center justify-center py-8 gap-2 text-gray-400 text-sm">
                        <Loader2 className="w-4 h-4 animate-spin" />Calculando custos da folha…
                      </div>
                    ) : !analiseRH.data ? (
                      <p className="text-xs text-gray-400 py-4 text-center">Sem dados de folha para esta obra.</p>
                    ) : (
                      <div className="space-y-4">
                        {/* ── KPIs ── */}
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { label: "Funcionários", v: String(analiseRH.data.resumo.totalFuncionarios), color: "text-indigo-700" },
                            { label: "Custo Total Empresa", v: fmt(analiseRH.data.resumo.custoTotalEmpresa), color: "text-violet-700 font-bold" },
                            { label: "Salário Bruto Total", v: fmt(analiseRH.data.resumo.salarioBrutoTotal), color: "text-gray-800" },
                            { label: "Horas Extras", v: fmt(analiseRH.data.resumo.heTotal), color: analiseRH.data.resumo.heTotal > 0 ? "text-amber-700" : "text-gray-400" },
                            { label: "VR + VA", v: fmt(analiseRH.data.resumo.vrTotal + analiseRH.data.resumo.vaTotal), color: "text-teal-700" },
                            { label: "FGTS (Empregador)", v: fmt(analiseRH.data.resumo.fgtsTotal), color: "text-blue-700" },
                          ].map((k, i) => (
                            <div key={i} className="rounded-lg border border-gray-100 bg-gray-50 px-2.5 py-2 text-center">
                              <p className={`text-sm font-bold ${k.color}`}>{k.v}</p>
                              <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">{k.label}</p>
                            </div>
                          ))}
                        </div>

                        {/* ── Nota metodológica ── */}
                        <p className="text-[10px] text-gray-400 italic bg-blue-50 border border-blue-100 rounded px-2 py-1.5 leading-snug">
                          Custo proporcional ao período de alocação na obra.
                          Funcionário que ficou 15 dias aqui e 15 dias em outra obra tem <strong>50% do custo mensal</strong> alocado aqui.
                          Fonte: Folha de Pagamento (RH) + VR/VA (iFood) × histórico de obra.
                        </p>

                        {/* ── Tabela de funcionários ── */}
                        {analiseRH.data.funcionarios.length === 0 ? (
                          <p className="text-xs text-gray-400 py-4 text-center">Nenhuma folha encontrada para esta obra no período.</p>
                        ) : (
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">
                              Custo por Funcionário — ordenado por custo total
                            </p>
                            <div className="overflow-x-auto rounded border border-gray-200">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500">
                                    <th className="text-left px-2 py-1.5 font-semibold">Funcionário</th>
                                    <th className="text-center px-2 py-1.5 font-semibold">Dias</th>
                                    <th className="text-right px-2 py-1.5 font-semibold">Sal. Bruto</th>
                                    <th className="text-right px-2 py-1.5 font-semibold">HE</th>
                                    <th className="text-right px-2 py-1.5 font-semibold">VR+VA</th>
                                    <th className="text-right px-2 py-1.5 font-semibold">FGTS</th>
                                    <th className="text-right px-2 py-1.5 font-semibold">Custo Empresa</th>
                                    <th className="w-6"></th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {analiseRH.data.funcionarios.map((f: any) => {
                                    const isOpen = expandedRH.has(Number(f.employee_id));
                                    const toggle = () => setExpandedRH(prev => {
                                      const n = new Set(prev);
                                      if (n.has(Number(f.employee_id))) n.delete(Number(f.employee_id));
                                      else n.add(Number(f.employee_id));
                                      return n;
                                    });
                                    const vr = Number(f.vr_total ?? 0);
                                    const va = Number(f.va_total ?? 0);
                                    return (
                                      <>
                                        <tr key={f.employee_id}
                                          onClick={toggle}
                                          className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors">
                                          <td className="px-2 py-1.5">
                                            <p className="font-medium text-gray-800 leading-tight">{f.nome}</p>
                                            <p className="text-[9px] text-gray-400">{f.matricula ?? "—"} · {f.cargo ?? "—"}</p>
                                          </td>
                                          <td className="text-center px-2 py-1.5 text-gray-600">{f.total_dias_na_obra}</td>
                                          <td className="text-right px-2 py-1.5 text-gray-700">{fmt(Number(f.salario_bruto_total))}</td>
                                          <td className="text-right px-2 py-1.5 text-amber-700">{Number(f.he_total) > 0 ? fmt(Number(f.he_total)) : <span className="text-gray-300">—</span>}</td>
                                          <td className="text-right px-2 py-1.5 text-teal-700">{(vr + va) > 0 ? fmt(vr + va) : <span className="text-gray-300">—</span>}</td>
                                          <td className="text-right px-2 py-1.5 text-blue-700">{fmt(Number(f.fgts_total))}</td>
                                          <td className="text-right px-2 py-1.5 font-semibold text-violet-700">{fmt(Number(f.custo_total_empresa))}</td>
                                          <td className="px-1 py-1.5 text-gray-400">{isOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}</td>
                                        </tr>
                                        {isOpen && (
                                          <tr key={`${f.employee_id}-detail`} className="bg-indigo-50/40">
                                            <td colSpan={8} className="px-3 py-2">
                                              <p className="text-[9px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">
                                                Detalhamento mensal — {f.nome}
                                              </p>
                                              <div className="overflow-x-auto">
                                                <table className="w-full text-[10px]">
                                                  <thead>
                                                    <tr className="text-gray-400 border-b border-indigo-100">
                                                      <th className="text-left py-1 pr-3 font-semibold">Mês</th>
                                                      <th className="text-center py-1 pr-3 font-semibold">Dias / Total</th>
                                                      <th className="text-center py-1 pr-3 font-semibold">Fração</th>
                                                      <th className="text-right py-1 pr-3 font-semibold">Sal. Bruto</th>
                                                      <th className="text-right py-1 pr-3 font-semibold">HE</th>
                                                      <th className="text-right py-1 pr-3 font-semibold">VR</th>
                                                      <th className="text-right py-1 pr-3 font-semibold">VA</th>
                                                      <th className="text-right py-1 pr-3 font-semibold">FGTS</th>
                                                      <th className="text-right py-1 pr-3 font-semibold">INSS</th>
                                                      <th className="text-right py-1 font-semibold">Custo Empresa</th>
                                                    </tr>
                                                  </thead>
                                                  <tbody>
                                                    {(f.historico_mensal ?? []).map((m: any, mi: number) => (
                                                      <tr key={mi} className="border-b border-indigo-100/50 hover:bg-indigo-100/30">
                                                        <td className="py-1 pr-3 text-gray-700 font-medium">{m.mes}</td>
                                                        <td className="py-1 pr-3 text-center text-gray-500">{m.diasNaObra}/{m.diasNoMes}</td>
                                                        <td className="py-1 pr-3 text-center">
                                                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${Number(m.fracao) < 1 ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}`}>
                                                            {(Number(m.fracao) * 100).toFixed(0)}%
                                                          </span>
                                                        </td>
                                                        <td className="py-1 pr-3 text-right text-gray-700">{fmt(Number(m.salarioBruto))}</td>
                                                        <td className="py-1 pr-3 text-right text-amber-700">{Number(m.horasExtras) > 0 ? fmt(Number(m.horasExtras)) : <span className="text-gray-300">—</span>}</td>
                                                        <td className="py-1 pr-3 text-right text-teal-700">{Number(m.vr) > 0 ? fmt(Number(m.vr)) : <span className="text-gray-300">—</span>}</td>
                                                        <td className="py-1 pr-3 text-right text-teal-600">{Number(m.va) > 0 ? fmt(Number(m.va)) : <span className="text-gray-300">—</span>}</td>
                                                        <td className="py-1 pr-3 text-right text-blue-700">{fmt(Number(m.fgts))}</td>
                                                        <td className="py-1 pr-3 text-right text-gray-600">{fmt(Number(m.inss))}</td>
                                                        <td className="py-1 text-right font-semibold text-violet-700">{fmt(Number(m.custoEmpresa))}</td>
                                                      </tr>
                                                    ))}
                                                  </tbody>
                                                  <tfoot>
                                                    <tr className="border-t-2 border-indigo-200 font-semibold text-gray-700">
                                                      <td className="py-1 pr-3 text-[9px] uppercase">Total</td>
                                                      <td className="py-1 pr-3 text-center text-gray-500">{f.total_dias_na_obra}d</td>
                                                      <td></td>
                                                      <td className="py-1 pr-3 text-right">{fmt(Number(f.salario_bruto_total))}</td>
                                                      <td className="py-1 pr-3 text-right text-amber-700">{fmt(Number(f.he_total))}</td>
                                                      <td className="py-1 pr-3 text-right text-teal-700">{fmt(Number(f.vr_total))}</td>
                                                      <td className="py-1 pr-3 text-right text-teal-600">{fmt(Number(f.va_total))}</td>
                                                      <td className="py-1 pr-3 text-right text-blue-700">{fmt(Number(f.fgts_total))}</td>
                                                      <td className="py-1 pr-3 text-right">{fmt(Number(f.inss_total))}</td>
                                                      <td className="py-1 text-right text-violet-700">{fmt(Number(f.custo_total_empresa))}</td>
                                                    </tr>
                                                  </tfoot>
                                                </table>
                                              </div>
                                            </td>
                                          </tr>
                                        )}
                                      </>
                                    );
                                  })}
                                </tbody>
                                <tfoot>
                                  <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold text-xs text-gray-700">
                                    <td className="px-2 py-2 text-[10px] uppercase tracking-wide">TOTAL OBRA</td>
                                    <td className="text-center px-2 py-2 text-gray-500">—</td>
                                    <td className="text-right px-2 py-2">{fmt(analiseRH.data.resumo.salarioBrutoTotal)}</td>
                                    <td className="text-right px-2 py-2 text-amber-700">{fmt(analiseRH.data.resumo.heTotal)}</td>
                                    <td className="text-right px-2 py-2 text-teal-700">{fmt(analiseRH.data.resumo.vrTotal + analiseRH.data.resumo.vaTotal)}</td>
                                    <td className="text-right px-2 py-2 text-blue-700">{fmt(analiseRH.data.resumo.fgtsTotal)}</td>
                                    <td className="text-right px-2 py-2 font-bold text-violet-700">{fmt(analiseRH.data.resumo.custoTotalEmpresa)}</td>
                                    <td></td>
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* ════════════ ABA: COMPRAS ════════════ */}
                {abaAnalise === "compras" && (
                  <div className="space-y-4">

                    {/* Gastos mensais */}
                    {analise.data.mensal.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Gastos por mês</p>
                        <div className="space-y-1">
                          {(() => {
                            const maxVal = Math.max(...analise.data!.mensal.map((m: any) => parseFloat(String(m.total_compras ?? 0))));
                            return analise.data!.mensal.map((m: any, i: number) => {
                              const v = parseFloat(String(m.total_compras ?? 0));
                              const pct = maxVal > 0 ? (v / maxVal) * 100 : 0;
                              return (
                                <div key={i} className="flex items-center gap-2 text-xs">
                                  <span className="w-14 text-right text-gray-500 shrink-0">{m.mes}</span>
                                  <div className="flex-1 h-5 bg-gray-100 rounded overflow-hidden">
                                    <div className="h-full bg-violet-400 rounded transition-all flex items-center pl-1.5"
                                      style={{ width: `${pct}%` }}>
                                      {pct > 20 && <span className="text-white text-[9px] font-semibold truncate">{fmt(v)}</span>}
                                    </div>
                                  </div>
                                  {pct <= 20 && <span className="text-gray-600 shrink-0 text-[10px]">{fmt(v)}</span>}
                                  <span className="text-gray-400 shrink-0 text-[10px]">{m.num_ocs} OC(s)</span>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      </div>
                    )}

                    {/* Alertas de recorrência */}
                    {analise.data.recorrencia.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-600 mb-1.5 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />Alertas de Recompra Excessiva (≥3 OCs/mês)
                        </p>
                        <div className="space-y-1">
                          {analise.data.recorrencia.map((r: any, i: number) => (
                            <div key={i} className="flex items-center gap-2 rounded bg-amber-50 border border-amber-100 px-2.5 py-1.5 text-xs">
                              <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                              <span className="flex-1 text-gray-700 truncate font-medium">{r.item}</span>
                              <span className="text-amber-700 shrink-0 font-bold">{r.num_ocs}× em {r.mes}</span>
                              <span className="text-gray-400 shrink-0">{fmt(parseFloat(String(r.total_mes)))}</span>
                            </div>
                          ))}
                        </div>
                        <p className="text-[10px] text-amber-600 mt-1">Comprar o mesmo item ≥3 vezes no mês indica falta de planejamento.</p>
                      </div>
                    )}

                    {/* OCs sem entrada no almox */}
                    {analise.data.ocsSemAlmox.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-red-600 mb-1.5 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />OCs entregues sem entrada no almox
                        </p>
                        <div className="space-y-1">
                          {analise.data.ocsSemAlmox.map((oc: any, i: number) => (
                            <div key={i} className="flex items-center gap-2 rounded bg-red-50 border border-red-100 px-2.5 py-1.5 text-xs">
                              <span className="text-red-700 font-mono font-bold shrink-0">{oc.numero_oc}</span>
                              <span className="flex-1 text-gray-600 truncate">{oc.fornecedor_nome ?? "—"}</span>
                              <span className="text-gray-400 text-[10px] shrink-0">{oc.num_itens} iten(s)</span>
                              <span className="text-red-700 font-semibold shrink-0">{fmt(parseFloat(String(oc.total ?? 0)))}</span>
                            </div>
                          ))}
                        </div>
                        <p className="text-[10px] text-red-600 mt-1">⚠ Material possivelmente entregue direto ao campo sem passar pelo almox — risco de desvio.</p>
                      </div>
                    )}

                    {/* Curva ABC */}
                    {analise.data.curvaMat.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Curva ABC de Materiais</p>
                        <div className="rounded border border-gray-100 overflow-hidden">
                          <table className="w-full text-[10px]">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="text-left px-2 py-1.5 text-gray-500 font-semibold w-6">Cl.</th>
                                <th className="text-left px-2 py-1.5 text-gray-500 font-semibold">Item</th>
                                <th className="text-right px-2 py-1.5 text-gray-500 font-semibold">Valor</th>
                                <th className="text-right px-2 py-1.5 text-gray-500 font-semibold w-10">%</th>
                                <th className="text-right px-2 py-1.5 text-gray-500 font-semibold w-10">OCs</th>
                              </tr>
                            </thead>
                            <tbody>
                              {analise.data.curvaMat.map((m: any, i: number) => (
                                <tr key={i} className="border-t border-gray-50">
                                  <td className="px-2 py-1">
                                    <span className={`font-bold text-xs ${m.classe_abc === 'A' ? 'text-green-600' : m.classe_abc === 'B' ? 'text-blue-600' : 'text-gray-400'}`}>
                                      {m.classe_abc}
                                    </span>
                                  </td>
                                  <td className="px-2 py-1 text-gray-700 max-w-[140px] truncate">{m.item}</td>
                                  <td className="px-2 py-1 text-right font-semibold text-gray-700">{fmt(parseFloat(String(m.total_valor)))}</td>
                                  <td className="px-2 py-1 text-right text-gray-400">{m.pct}%</td>
                                  <td className="px-2 py-1 text-right text-gray-400">{m.num_ocs}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <p className="text-[10px] text-gray-400 mt-1">
                          <span className="text-green-600 font-bold">A</span>=80% do gasto &nbsp;
                          <span className="text-blue-600 font-bold">B</span>=15% &nbsp;
                          <span className="text-gray-400 font-bold">C</span>=5%
                        </p>
                      </div>
                    )}

                    {analise.data.curvaMat.length === 0 && (
                      <p className="text-xs text-gray-400 text-center py-4">Nenhuma OC registrada para esta obra.</p>
                    )}
                  </div>
                )}

                {/* ════════════ ABA: FERRAMENTAS ════════════ */}
                {abaAnalise === "ferramentas" && (
                  <div className="space-y-3">
                    {analise.data.ferramentasAlmox.length === 0 ? (
                      <p className="text-xs text-gray-400 text-center py-4">Nenhuma ferramenta ou equipamento cadastrado no almox desta obra.</p>
                    ) : (
                      <>
                        <p className="text-[10px] text-gray-400">Lista de ferramentas e equipamentos no almoxarifado, cruzada com os empréstimos (warehouse).</p>
                        <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                          {analise.data.ferramentasAlmox.map((f: any, i: number) => {
                            const qtdAlmox = parseFloat(String(f.quantidade_atual ?? 0));
                            const emUso = parseInt(String(f.em_uso_cnt ?? 0));
                            const suspeita = f.suspeita_desvio === true || f.suspeita_desvio === "true";
                            return (
                              <div key={i} className={`rounded border px-2.5 py-2 text-xs ${suspeita ? "border-red-200 bg-red-50" : emUso > 0 ? "border-indigo-100 bg-indigo-50" : "border-gray-100 bg-gray-50"}`}>
                                <div className="flex items-center gap-2">
                                  <span className="flex-1 font-medium text-gray-800 truncate">{f.nome}</span>
                                  {suspeita ? (
                                    <Badge className="bg-red-100 text-red-700 text-[9px]">⚠ Possível Desvio</Badge>
                                  ) : emUso > 0 ? (
                                    <Badge className="bg-indigo-100 text-indigo-700 text-[9px]">Em Uso</Badge>
                                  ) : qtdAlmox > 0 ? (
                                    <Badge className="bg-green-100 text-green-700 text-[9px]">No Almox</Badge>
                                  ) : (
                                    <Badge className="bg-gray-100 text-gray-500 text-[9px]">Zerado</Badge>
                                  )}
                                </div>
                                <div className="flex gap-3 mt-1 text-[10px] text-gray-500">
                                  {f.categoria && <span>{f.categoria}</span>}
                                  <span>Almox: <strong>{qtdAlmox}</strong></span>
                                  {emUso > 0 && <span className="text-indigo-600">Em uso: <strong>{emUso}</strong> — {f.em_uso_pessoas}</span>}
                                  {f.valor_unitario && <span>{fmt(parseFloat(String(f.valor_unitario)))}/un</span>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* ════════════ ABA: LOCAÇÕES ════════════ */}
                {abaAnalise === "locacoes" && (
                  <div className="space-y-3">
                    {analise.data.locacoes.length === 0 ? (
                      <p className="text-xs text-gray-400 text-center py-4">Nenhum equipamento locado registrado para esta obra.</p>
                    ) : (
                      <>
                        {/* Curva ABC locações */}
                        {(() => {
                          const comCusto = analise.data!.locacoes.filter((l: any) => parseFloat(String(l.custo_estimado ?? 0)) > 0);
                          if (comCusto.length < 2) return null;
                          const total = comCusto.reduce((s: number, l: any) => s + parseFloat(String(l.custo_estimado)), 0);
                          let acum = 0;
                          return (
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Curva ABC — Custo de Locação</p>
                              <div className="space-y-1">
                                {comCusto.sort((a: any, b: any) => parseFloat(String(b.custo_estimado)) - parseFloat(String(a.custo_estimado))).map((l: any, i: number) => {
                                  const v = parseFloat(String(l.custo_estimado));
                                  const pct = total > 0 ? (v / total) * 100 : 0;
                                  acum += pct;
                                  const classe = acum - pct < 80 ? "A" : acum - pct < 95 ? "B" : "C";
                                  return (
                                    <div key={i} className="flex items-center gap-2 text-[10px]">
                                      <span className={`w-4 font-bold ${classe === 'A' ? 'text-green-600' : classe === 'B' ? 'text-blue-600' : 'text-gray-400'}`}>{classe}</span>
                                      <span className="flex-1 truncate text-gray-700">{l.descricao}</span>
                                      <span className="text-gray-400">{l.dias_locado}d</span>
                                      <span className="font-semibold text-gray-700">{fmt(v)}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })()}

                        {/* Lista completa */}
                        <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                          {analise.data.locacoes.map((l: any, i: number) => {
                            const dias = parseInt(String(l.dias_locado ?? 0));
                            const custo = parseFloat(String(l.custo_estimado ?? 0));
                            const statusColor = l.status === 'em_uso' ? "border-blue-200 bg-blue-50" : l.status === 'atrasado' ? "border-red-200 bg-red-50" : "border-gray-100 bg-gray-50";
                            return (
                              <div key={i} className={`rounded border px-2.5 py-2 text-xs ${statusColor}`}>
                                <div className="flex items-center gap-2">
                                  <span className="flex-1 font-medium text-gray-800 truncate">{l.descricao}</span>
                                  <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${l.status === 'em_uso' ? 'bg-blue-200 text-blue-800' : l.status === 'atrasado' ? 'bg-red-200 text-red-800' : 'bg-gray-200 text-gray-600'}`}>
                                    {l.status === 'em_uso' ? 'Em uso' : l.status === 'atrasado' ? 'Atrasado' : 'Devolvido'}
                                  </span>
                                </div>
                                <div className="flex gap-3 mt-1 text-[10px] text-gray-500 flex-wrap">
                                  {l.fornecedor_nome && <span>{l.fornecedor_nome}</span>}
                                  <span>Início: {l.data_inicio}</span>
                                  <span>Prev.: {l.data_fim_prevista}</span>
                                  <span className="font-medium text-gray-700">{dias} dia(s)</span>
                                  {custo > 0 && <span className="text-indigo-700 font-semibold">{fmt(custo)}</span>}
                                  {l.funcionario_responsavel_nome && <span>Resp: {l.funcionario_responsavel_nome}</span>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                )}

              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* ── Log de Eventos ──────────────────────────────────────────────────── */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-2 pt-3 px-4 cursor-pointer" onClick={() => setShowEventos(v => !v)}>
          <CardTitle className="text-sm flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-gray-500" />
            Log de Eventos ({eventos.length})
            <span className="ml-auto">{showEventos ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}</span>
          </CardTitle>
        </CardHeader>
        {showEventos && (
          <CardContent className="px-4 pb-4">
            {eventos.length === 0 ? (
              <p className="text-xs text-gray-400 py-4 text-center">Nenhum evento registrado — score limpo! 🎉</p>
            ) : (
              <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                {eventos.map((ev, i) => (
                  <div key={i} className={`flex items-start gap-2 rounded-md px-2.5 py-1.5 text-xs ${ev.pontos >= 0 ? "bg-green-50" : "bg-red-50"}`}>
                    <span className="mt-0.5 shrink-0">{EVENTO_ICONS[ev.tipo] ?? <Info className="w-3.5 h-3.5 text-gray-400" />}</span>
                    <span className="flex-1 text-gray-700">{ev.descricao}</span>
                    <span className={`shrink-0 font-bold ${ev.pontos >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {ev.pontos >= 0 ? "+" : ""}{ev.pontos} pts
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* ── Controle de Ferramentas ─────────────────────────────────────────── */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-2 pt-3 px-4 cursor-pointer" onClick={() => setShowFerramentas(v => !v)}>
          <CardTitle className="text-sm flex items-center gap-2">
            <Wrench className="w-4 h-4 text-teal-600" />
            Controle de Ferramentas e Equipamentos
            {detalhes.ferramentasPerdidas > 0 && (
              <Badge className="ml-1 bg-red-100 text-red-700 text-[9px]">{detalhes.ferramentasPerdidas} perdida(s)</Badge>
            )}
            <span className="ml-auto">{showFerramentas ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}</span>
          </CardTitle>
        </CardHeader>
        {showFerramentas && (
          <CardContent className="px-4 pb-4">
            {ferramentas.isLoading ? (
              <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
            ) : (ferramentas.data?.length ?? 0) === 0 ? (
              <p className="text-xs text-gray-400 py-4 text-center">Nenhuma ferramenta/equipamento registrado nesta obra.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-gray-500">
                      <th className="text-left pb-1.5 font-medium">Item</th>
                      <th className="text-left pb-1.5 font-medium">Com quem</th>
                      <th className="text-left pb-1.5 font-medium">Desde</th>
                      <th className="text-left pb-1.5 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(ferramentas.data ?? []).map((f: any) => (
                      <tr key={f.id} className="border-b border-gray-50 last:border-0">
                        <td className="py-1.5 pr-2 font-medium text-gray-800">{f.item_nome}</td>
                        <td className="py-1.5 pr-2 text-gray-600">{f.funcionario_nome || "—"}</td>
                        <td className="py-1.5 pr-2 text-gray-500">{f.data_emprestimo || "—"}</td>
                        <td className="py-1.5">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                            f.status === "devolvido" ? "bg-green-100 text-green-700" :
                            f.status === "perdido"   ? "bg-red-100 text-red-700" :
                            "bg-blue-100 text-blue-700"
                          }`}>
                            {f.status === "emprestado" ? "Em uso" : f.status === "devolvido" ? "Devolvido" : "Perdido"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* ── Retrabalhos ─────────────────────────────────────────────────────── */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm flex items-center gap-2 cursor-pointer" onClick={() => setShowRetrabalhos(v => !v)}>
            <Wrench className="w-4 h-4 text-amber-600" />
            Retrabalhos Registrados ({detalhes.retrabalhos})
            {isAdmin && (
              <Button size="sm" className="ml-auto h-7 text-xs" onClick={e => { e.stopPropagation(); setShowRetrabalho(true); }}>
                <Plus className="w-3.5 h-3.5 mr-1" />Registrar
              </Button>
            )}
            <span className={isAdmin ? "ml-1" : "ml-auto"}>{showRetrabalhos ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}</span>
          </CardTitle>
        </CardHeader>
        {showRetrabalhos && (
          <CardContent className="px-4 pb-4">
            {detalhes.retrabalhos === 0 ? (
              <p className="text-xs text-gray-400 py-4 text-center">Nenhum retrabalho registrado. 👍</p>
            ) : (
              <div className="space-y-2">
                {(score.data?.eventos ?? []).filter(ev => ev.tipo === "qualidade" && ev.descricao.startsWith("Retrabalho:")).map((ev, i) => (
                  <div key={i} className="flex items-start gap-2 bg-amber-50 rounded-lg p-2.5">
                    <Wrench className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-700">{ev.descricao.replace("Retrabalho: ", "")}</p>
                    </div>
                    <span className="text-[10px] text-red-500 font-bold shrink-0">−5 pts</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* ── Modais ──────────────────────────────────────────────────────────── */}
      {showConfig && (
        <ConfigModal
          open={showConfig}
          onClose={() => setShowConfig(false)}
          companyId={companyId}
          obraId={obraId!}
          currentConfig={config}
          onSaved={refetch}
        />
      )}
      {showRetrabalho && (
        <NovoRetrabalhoModal
          open={showRetrabalho}
          onClose={() => setShowRetrabalho(false)}
          companyId={companyId}
          obraId={obraId!}
          onSaved={refetch}
        />
      )}
      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir retrabalho?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação irá remover o retrabalho do scorecard e aumentar a pontuação de Qualidade.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700"
              onClick={() => deleteId && deleteRetrabalho.mutate({ id: deleteId, companyId })}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
