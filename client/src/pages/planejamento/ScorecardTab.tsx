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
  Trophy, ShieldCheck, BarChart3, ShoppingCart, Package, Star,
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-gray-500" /> Configurar Scorecard
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
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

  const enabled = !!obraId;

  const score = trpc.scorecard.getScore.useQuery(
    { companyId, obraId: obraId! },
    { enabled, refetchInterval: 60_000 }
  );
  const ferramentas = trpc.scorecard.ferramentasList.useQuery(
    { companyId, obraId: obraId! },
    { enabled: enabled && showFerramentas }
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
                  <span className="text-xs text-gray-500">Custo Previsto</span>
                  <span className="text-sm font-semibold text-red-600">{fmt(financeiro.custoPrevisto)}</span>
                </div>
                <div className="flex items-center justify-between border-t border-gray-200 pt-1.5 mt-0.5">
                  <span className="text-xs font-semibold text-gray-700">Lucro Previsto</span>
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${financeiro.lucroPrevisto >= 0 ? "bg-green-500" : "bg-red-500"}`} />
                    <span className={`text-sm font-bold ${financeiro.lucroPrevisto >= 0 ? "text-green-700" : "text-red-600"}`}>
                      {fmt(financeiro.lucroPrevisto)}
                    </span>
                    {financeiro.valorContrato > 0 && (
                      <span className="text-[10px] text-gray-400">
                        ({((financeiro.lucroPrevisto / financeiro.valorContrato) * 100).toFixed(1)}%)
                      </span>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* ── Realizado ────────────────────────────────────────── */}
          <div className={`rounded-lg border px-3 py-2.5 space-y-1.5 ${financeiro.lucroRealizado >= 0 ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Realizado (financeiro + compras)</p>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Custo Realizado</span>
              <span className="text-sm font-semibold text-red-600">{fmt(financeiro.custoRealizado)}</span>
            </div>
            {/* Barra de progresso custo realizado vs previsto */}
            {financeiro.custoPrevisto > 0 && (
              <div className="space-y-0.5">
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
            <div className="flex items-center justify-between border-t border-gray-200 pt-1.5 mt-0.5">
              <span className="text-sm font-semibold text-gray-700">Lucro Realizado</span>
              <div className="flex items-center gap-1.5">
                <span className={`w-2.5 h-2.5 rounded-full ${financeiro.lucroRealizado >= 0 ? "bg-green-500" : "bg-red-500"}`} />
                <span className={`text-base font-black ${financeiro.lucroRealizado >= 0 ? "text-green-700" : "text-red-600"}`}>
                  {fmt(financeiro.lucroRealizado)}
                </span>
                {financeiro.valorContrato > 0 && (
                  <span className="text-[10px] text-gray-400">
                    ({((financeiro.lucroRealizado / financeiro.valorContrato) * 100).toFixed(1)}%)
                  </span>
                )}
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
                      <span className="text-gray-500">(B) Custo Previsto</span>
                      <span className="font-semibold text-red-600">− {fmt(financeiro.custoPrevisto)}</span>
                    </div>
                    <div className="flex justify-between border-t border-dashed border-gray-200 pt-1 mt-0.5">
                      <span className="font-semibold text-gray-700">Lucro Previsto = A − B</span>
                      <span className={`font-bold ${financeiro.lucroPrevisto >= 0 ? "text-green-700" : "text-red-600"}`}>
                        {fmt(financeiro.lucroPrevisto)} ({financeiro.margemPrevista.toFixed(1)}%)
                      </span>
                    </div>
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
                      <span className="text-gray-500">(C) Custo Realizado</span>
                      <span className="font-semibold text-red-600">− {fmt(financeiro.custoRealizado)}</span>
                    </div>
                    <div className="flex justify-between border-t border-dashed border-gray-200 pt-1 mt-0.5">
                      <span className="font-semibold text-gray-700">Lucro Realizado = A − C</span>
                      <span className={`font-bold ${financeiro.lucroRealizado >= 0 ? "text-green-700" : "text-red-600"}`}>
                        {fmt(financeiro.lucroRealizado)} ({financeiro.margemRealizada.toFixed(1)}%)
                      </span>
                    </div>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">
                    Fonte (C): <span className="font-mono">financial_entries</span> WHERE natureza=&#39;despesa&#39; AND status IN (&#39;pago&#39;, &#39;pago_parcial&#39;, &#39;liquidado&#39;, &#39;baixado&#39;)
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
