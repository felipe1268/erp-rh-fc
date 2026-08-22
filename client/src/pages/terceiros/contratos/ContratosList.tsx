import { useState } from "react";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import { NATUREZA_CONTRATO } from "@shared/terceiroNatureza";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, FileText, Search, Building2, Calendar, TrendingUp, TrendingDown, ChevronRight, Trash2, Pencil, X, CheckSquare, Square, Save, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const BRL = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
const fmtDate = (d: string | null | undefined) => {
  if (!d) return "—";
  const [y, m, day] = d.slice(0, 10).split("-");
  return `${day}/${m}/${y}`;
};

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  ativo:     { label: "Ativo",     cls: "bg-green-100 text-green-800 border-green-200" },
  encerrado: { label: "Encerrado", cls: "bg-gray-100 text-gray-600 border-gray-200" },
  suspenso:  { label: "Suspenso",  cls: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  concluido: { label: "Concluído", cls: "bg-blue-100 text-blue-800 border-blue-200" },
};

export default function ContratosList() {
  const [, navigate] = useLocation();
  const { companyId } = useCompany();
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  // Rev. 4998 — exclusão exige motivo (auditoria) + senha do admin master
  const [motivoExcluir, setMotivoExcluir] = useState("");
  const [senhaExcluir, setSenhaExcluir] = useState("");
  const [editContrato, setEditContrato] = useState<{
    id: number; descricao: string; numeroContrato: string; status: string;
    valorOrcamento: string; valorTotal: string; dataInicio: string; dataTermino: string; observacoes: string;
  } | null>(null);

  const utils = trpc.useUtils();
  const { data: contratos = [], isLoading } = trpc.terceiroContratos.listarContratos.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );

  const { data: kpis } = trpc.terceiroContratos.dashboardTerceiroContratos.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );

  const excluirMut = trpc.terceiroContratos.excluirContrato.useMutation({
    onSuccess: () => { toast.success("Contrato excluído"); setMotivoExcluir(""); setSenhaExcluir(""); utils.terceiroContratos.listarContratos.invalidate(); utils.terceiroContratos.dashboardTerceiroContratos.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const excluirLoteMut = trpc.terceiroContratos.excluirContratosLote.useMutation({
    onSuccess: (r) => { toast.success(`${r.deleted} contrato(s) excluído(s)`); setSelecionados(new Set()); setMotivoExcluir(""); setSenhaExcluir(""); utils.terceiroContratos.listarContratos.invalidate(); utils.terceiroContratos.dashboardTerceiroContratos.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const atualizarMut = trpc.terceiroContratos.atualizarContrato.useMutation({
    onSuccess: () => { toast.success("Contrato atualizado"); setEditContrato(null); utils.terceiroContratos.listarContratos.invalidate(); utils.terceiroContratos.dashboardTerceiroContratos.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const filtrados = contratos.filter(c => {
    const ok = filtroStatus === "todos" || c.status === filtroStatus;
    const b = busca.toLowerCase();
    const match = !b || c.descricao.toLowerCase().includes(b) || (c.empresaNome || "").toLowerCase().includes(b) || (c.numeroContrato || "").toLowerCase().includes(b) || (c.obraNome || "").toLowerCase().includes(b);
    return ok && match;
  });

  const semObra = contratos.filter(c => !c.obraId && c.status === "ativo");

  const modoSelecao = selecionados.size > 0;

  const toggleSelecao = (id: number) => {
    setSelecionados(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleTodos = () => {
    if (selecionados.size === filtrados.length) {
      setSelecionados(new Set());
    } else {
      setSelecionados(new Set(filtrados.map(c => c.id)));
    }
  };

  return (
    <DashboardLayout>
      <div className="p-5 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Contratos de Terceiros</h1>
            <p className="text-sm text-gray-500">Contratos de serviço vinculados ao planejamento da obra</p>
          </div>
          <Button onClick={() => navigate("/terceiros/contratos/novo")} className="gap-2 bg-blue-600 hover:bg-blue-700">
            <Plus className="w-4 h-4" /> Novo Contrato
          </Button>
        </div>

        {kpis && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: "Contratos Ativos", value: kpis.totalContratos, sub: "", color: "bg-blue-500" },
              { label: "Total Contratado", value: BRL(kpis.valorTotalContratado), sub: "", color: "bg-indigo-500" },
              { label: "Total Pago", value: BRL(kpis.valorTotalPago), sub: `${kpis.percentualMedioExecucao?.toFixed(1) || 0}% executado`, color: "bg-green-500" },
              { label: "Medições Aguardando", value: kpis.medicoesAguardando, sub: "aprovação", color: "bg-yellow-500" },
            ].map((k, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3 shadow-sm">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${k.color}`}>
                  <TrendingUp className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 font-medium">{k.label}</p>
                  <p className="text-lg font-bold text-gray-900">{k.value}</p>
                  {k.sub && <p className="text-xs text-gray-400">{k.sub}</p>}
                </div>
              </div>
            ))}
          </div>
        )}

        {semObra.length > 0 && (
          <div className="rounded-xl border border-red-300 bg-red-50 p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-red-800">
                {semObra.length === 1
                  ? "1 contrato ativo sem obra vinculada"
                  : `${semObra.length} contratos ativos sem obra vinculada`}
              </p>
              <p className="text-xs text-red-700 mt-0.5">
                Contratos sem obra não aparecem no Scorecard da obra. Abra cada contrato e vincule-o à obra correta.
              </p>
              <ul className="mt-2 space-y-0.5">
                {semObra.map(c => (
                  <li key={c.id} className="text-xs text-red-700 flex items-center gap-1.5">
                    <span className="font-mono bg-red-100 px-1.5 py-0.5 rounded">{c.numeroContrato || `#${c.id}`}</span>
                    <span>{c.descricao}</span>
                    <span className="text-red-400">— {c.empresaNome}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input placeholder="Buscar por empresa, descrição ou obra..." className="pl-9" value={busca} onChange={e => setBusca(e.target.value)} />
          </div>
          <Select value={filtroStatus} onValueChange={setFiltroStatus}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="ativo">Ativos</SelectItem>
              <SelectItem value="concluido">Concluídos</SelectItem>
              <SelectItem value="suspenso">Suspensos</SelectItem>
              <SelectItem value="encerrado">Encerrados</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {modoSelecao && (
          <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl p-3">
            <button onClick={toggleTodos} className="flex items-center gap-2 text-sm text-blue-700 hover:text-blue-900 font-medium">
              {selecionados.size === filtrados.length ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
              {selecionados.size} selecionado(s)
            </button>
            <div className="flex-1" />
            <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => setSelecionados(new Set())}>
              <X className="w-3 h-3" /> Cancelar
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1 text-xs text-red-600 border-red-200 hover:bg-red-50"
                  disabled={excluirLoteMut.isPending}>
                  <Trash2 className="w-3 h-3" /> {excluirLoteMut.isPending ? "Excluindo..." : "Excluir Selecionados"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="max-w-md">
                <AlertDialogHeader>
                  <div className="flex items-center gap-3 mb-1">
                    <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                      <AlertTriangle className="w-5 h-5 text-red-600" />
                    </div>
                    <AlertDialogTitle className="text-lg">Excluir {selecionados.size} contrato(s)?</AlertDialogTitle>
                  </div>
                  <AlertDialogDescription className="text-sm text-gray-600 leading-relaxed">
                    Esta ação é <strong className="text-red-700">irreversível</strong>. Todas as <strong>medições</strong>, <strong>itens</strong> e <strong>documentos</strong> vinculados aos contratos selecionados serão removidos permanentemente.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs font-semibold text-gray-600">Motivo da exclusão *</Label>
                    <Input value={motivoExcluir} onChange={e => setMotivoExcluir(e.target.value)} placeholder="Ex: contrato lançado em duplicidade" className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-gray-600">Senha do admin master</Label>
                    <Input type="password" value={senhaExcluir} onChange={e => setSenhaExcluir(e.target.value)} placeholder="Sua senha de acesso" className="mt-1" />
                  </div>
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel onClick={() => { setMotivoExcluir(""); setSenhaExcluir(""); }}>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
                    disabled={motivoExcluir.trim().length < 5 || excluirLoteMut.isPending}
                    onClick={(e) => {
                      if (motivoExcluir.trim().length < 5) { e.preventDefault(); toast.error("Informe o motivo (mín. 5 caracteres)."); return; }
                      excluirLoteMut.mutate({ ids: [...selecionados], companyId, motivo: motivoExcluir.trim(), password: senhaExcluir || undefined });
                    }}
                  >
                    Sim, excluir {selecionados.size} contrato(s)
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}

        <div className="space-y-2">
          {isLoading ? (
            <div className="py-12 text-center text-gray-400">Carregando...</div>
          ) : filtrados.length === 0 ? (
            <div className="py-12 text-center text-gray-400">
              <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Nenhum contrato encontrado</p>
              <p className="text-sm">Crie o primeiro contrato para começar</p>
            </div>
          ) : filtrados.map(c => {
            const st = STATUS_MAP[c.status || "ativo"] || STATUS_MAP.ativo;
            const pct = c.percentualPago ?? 0;
            const valOrc = Number(c.valorOrcamento ?? 0);
            const valFec = Number(c.valorTotal ?? 0);
            const variacao = valFec - valOrc;
            const variacaoPct = valOrc > 0 ? (variacao / valOrc) * 100 : 0;
            const selected = selecionados.has(c.id);
            return (
              <div
                key={c.id}
                className={`bg-white rounded-xl border p-4 transition-all ${selected ? "border-blue-400 bg-blue-50/30 shadow-md" : "border-gray-200 hover:shadow-md hover:border-blue-300"}`}
              >
                <div className="flex items-start gap-3">
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleSelecao(c.id); }}
                    className="mt-1 flex-shrink-0 text-gray-400 hover:text-blue-600"
                  >
                    {selected ? <CheckSquare className="w-5 h-5 text-blue-600" /> : <Square className="w-5 h-5" />}
                  </button>

                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => navigate(`/terceiros/contratos/${c.id}`)}
                  >
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      {c.numeroContrato && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-mono">{c.numeroContrato}</span>}
                      <Badge className={`text-xs border ${st.cls}`}>{st.label}</Badge>
                      {(() => { const nt = NATUREZA_CONTRATO[(c as any).naturezaContrato || "mao_de_obra"] || NATUREZA_CONTRATO.mao_de_obra; return <Badge className={`text-xs border ${nt.cls}`}>{nt.label}</Badge>; })()}
                      {!(c as any).obraId && (
                        <Badge className="text-xs border bg-red-100 text-red-700 border-red-300 inline-flex items-center gap-1 font-semibold">
                          <AlertTriangle className="w-3 h-3" /> Sem obra vinculada
                        </Badge>
                      )}
                      {(() => {
                        const ass = (c as any).assinaturaStatus as string | null | undefined;
                        if (ass === "concluido") {
                          return <Badge className="text-xs border bg-emerald-100 text-emerald-800 border-emerald-200 inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />Assinado</Badge>;
                        }
                        return <Badge className="text-xs border bg-amber-100 text-amber-800 border-amber-200 inline-flex items-center gap-1"><Clock className="w-3 h-3" />Falta assinatura</Badge>;
                      })()}
                      {valOrc > 0 && (
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border font-medium ${
                          variacao > 0 ? "bg-red-50 text-red-700 border-red-200" :
                          variacao < 0 ? "bg-green-50 text-green-700 border-green-200" :
                          "bg-gray-50 text-gray-500 border-gray-200"
                        }`}>
                          {variacao > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          {variacao > 0 ? "+" : ""}{variacaoPct.toFixed(1)}% vs orçamento
                        </span>
                      )}
                    </div>
                    <p className="font-semibold text-gray-900 truncate">{c.descricao}</p>
                    <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                      <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{c.empresaNome}</span>
                      {c.obraNome && <span>📍 {c.obraNome}</span>}
                      {c.dataInicio && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{fmtDate(c.dataInicio)} → {fmtDate(c.dataTermino)}</span>}
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0">
                    <p className="font-bold text-gray-900">{BRL(valFec)}</p>
                    {valOrc > 0 && <p className="text-xs text-gray-400">Orçado: {BRL(valOrc)}</p>}
                    <p className="text-xs text-gray-400">Pago: {BRL(Number(c.valorPago))}</p>
                  </div>

                  <div className="flex flex-col gap-1 flex-shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditContrato({
                          id: c.id,
                          descricao: c.descricao,
                          numeroContrato: c.numeroContrato || "",
                          status: c.status || "ativo",
                          valorOrcamento: String(valOrc),
                          valorTotal: String(valFec),
                          dataInicio: c.dataInicio || "",
                          dataTermino: c.dataTermino || "",
                          observacoes: "",
                        });
                      }}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600 transition-colors"
                      title="Editar contrato"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button
                          onClick={(e) => e.stopPropagation()}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
                          title="Excluir contrato"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="max-w-md" onClick={(e) => e.stopPropagation()}>
                        <AlertDialogHeader>
                          <div className="flex items-center gap-3 mb-1">
                            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                              <AlertTriangle className="w-5 h-5 text-red-600" />
                            </div>
                            <AlertDialogTitle className="text-lg">Excluir contrato?</AlertDialogTitle>
                          </div>
                          <AlertDialogDescription className="text-sm text-gray-600 leading-relaxed">
                            O contrato <strong className="text-gray-900">{c.numeroContrato || c.descricao}</strong> será excluído permanentemente. Esta ação é <strong className="text-red-700">irreversível</strong> e remove todas as <strong>medições</strong>, <strong>itens</strong> e <strong>documentos</strong> vinculados.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
                          <div>
                            <Label className="text-xs font-semibold text-gray-600">Motivo da exclusão *</Label>
                            <Input value={motivoExcluir} onChange={e => setMotivoExcluir(e.target.value)} placeholder="Ex: contrato lançado em duplicidade" className="mt-1" />
                          </div>
                          <div>
                            <Label className="text-xs font-semibold text-gray-600">Senha do admin master</Label>
                            <Input type="password" value={senhaExcluir} onChange={e => setSenhaExcluir(e.target.value)} placeholder="Sua senha de acesso" className="mt-1" />
                          </div>
                        </div>
                        <AlertDialogFooter>
                          <AlertDialogCancel onClick={(e) => { e.stopPropagation(); setMotivoExcluir(""); setSenhaExcluir(""); }}>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
                            disabled={motivoExcluir.trim().length < 5 || excluirMut.isPending}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (motivoExcluir.trim().length < 5) { e.preventDefault(); toast.error("Informe o motivo (mín. 5 caracteres)."); return; }
                              excluirMut.mutate({ id: c.id, companyId, motivo: motivoExcluir.trim(), password: senhaExcluir || undefined });
                            }}
                          >
                            Sim, excluir
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>

                  <ChevronRight
                    className="w-4 h-4 text-gray-300 flex-shrink-0 mt-1 cursor-pointer"
                    onClick={() => navigate(`/terceiros/contratos/${c.id}`)}
                  />
                </div>

                <div className="mt-3 ml-8">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>Execução financeira</span>
                    <span>{pct.toFixed(1)}%</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {editContrato && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Editar Contrato</h2>
              <button onClick={() => setEditContrato(null)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <Label className="text-sm">Descrição</Label>
                <Input className="mt-1" value={editContrato.descricao} onChange={e => setEditContrato(p => p ? { ...p, descricao: e.target.value } : null)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm">Nº Contrato</Label>
                  <Input className="mt-1" value={editContrato.numeroContrato} onChange={e => setEditContrato(p => p ? { ...p, numeroContrato: e.target.value } : null)} />
                </div>
                <div>
                  <Label className="text-sm">Status</Label>
                  <Select value={editContrato.status} onValueChange={v => setEditContrato(p => p ? { ...p, status: v } : null)}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ativo">Ativo</SelectItem>
                      <SelectItem value="concluido">Concluído</SelectItem>
                      <SelectItem value="suspenso">Suspenso</SelectItem>
                      <SelectItem value="encerrado">Encerrado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm">Valor Orçamento</Label>
                  <Input type="number" className="mt-1" value={editContrato.valorOrcamento} onChange={e => setEditContrato(p => p ? { ...p, valorOrcamento: e.target.value } : null)} />
                </div>
                <div>
                  <Label className="text-sm">Valor Fechado (Contrato)</Label>
                  <Input type="number" className="mt-1" value={editContrato.valorTotal} onChange={e => setEditContrato(p => p ? { ...p, valorTotal: e.target.value } : null)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm">Data Início</Label>
                  <Input type="date" className="mt-1" value={editContrato.dataInicio} onChange={e => setEditContrato(p => p ? { ...p, dataInicio: e.target.value } : null)} />
                </div>
                <div>
                  <Label className="text-sm">Data Término</Label>
                  <Input type="date" className="mt-1" value={editContrato.dataTermino} onChange={e => setEditContrato(p => p ? { ...p, dataTermino: e.target.value } : null)} />
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-5 justify-end">
              <Button variant="outline" onClick={() => setEditContrato(null)}>Cancelar</Button>
              <Button className="bg-blue-600 hover:bg-blue-700 gap-2" disabled={atualizarMut.isPending}
                onClick={() => atualizarMut.mutate({
                  id: editContrato.id,
                  companyId,
                  descricao: editContrato.descricao,
                  numeroContrato: editContrato.numeroContrato || undefined,
                  status: editContrato.status,
                  valorOrcamento: parseFloat(editContrato.valorOrcamento) || undefined,
                  valorTotal: parseFloat(editContrato.valorTotal) || undefined,
                  dataInicio: editContrato.dataInicio || undefined,
                  dataTermino: editContrato.dataTermino || undefined,
                })}>
                <Save className="w-4 h-4" />{atualizarMut.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
