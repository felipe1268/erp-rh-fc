import DashboardLayout from "@/components/DashboardLayout";
import { DraggableCommandBar } from "@/components/DraggableCommandBar";
import React, { useState, useMemo, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { normalizarTexto } from "@shared/textNormalization";
import {
  Plus, Search, Trash2, ClipboardList, ChevronRight, ChevronDown, Loader2,
  CheckCircle2, XCircle, Clock, Building2, ListTree, CalendarDays, ShoppingCart, AlertTriangle, Zap, FileText, Package,
  Camera, ImageIcon, X, Briefcase, History, ShoppingBag, Pencil, Copy, CheckSquare,
  UserCircle, ShieldCheck, FileSearch, Truck, Users,
} from "lucide-react";

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  rascunho:  { label: "Rascunho",    cls: "bg-gray-100 text-gray-600 border-gray-200" },
  pendente:  { label: "Pendente",    cls: "bg-amber-50 text-amber-700 border-amber-200" },
  cotacao:   { label: "Em Cotação",  cls: "bg-blue-50 text-blue-700 border-blue-200" },
  aprovado:  { label: "Concluído",   cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  recusado:  { label: "Recusado",    cls: "bg-red-50 text-red-700 border-red-200" },
  cancelado: { label: "Cancelado",   cls: "bg-gray-100 text-gray-500 border-gray-200" },
};

const APROV_CFG: Record<string, { label: string; icon: JSX.Element; cls: string }> = {
  aguardando: { label: "Aguardando", icon: <Clock className="h-3 w-3" />,        cls: "text-amber-600" },
  aprovado:   { label: "Aprovada",   icon: <CheckCircle2 className="h-3 w-3" />, cls: "text-emerald-600" },
  aprovada:   { label: "Aprovada",   icon: <CheckCircle2 className="h-3 w-3" />, cls: "text-emerald-600" },
  recusado:   { label: "Recusada",   icon: <XCircle className="h-3 w-3" />,      cls: "text-red-600" },
  recusada:   { label: "Recusada",   icon: <XCircle className="h-3 w-3" />,      cls: "text-red-600" },
};

const PRIORIDADES = ["baixa", "normal", "alta", "urgente"];
const PRIORIDADE_COR: Record<string, string> = {
  baixa: "text-gray-500", normal: "text-blue-600", alta: "text-amber-600", urgente: "text-red-600"
};
const UNIDADES = ["un", "m", "m²", "m³", "kg", "L", "cx", "pç", "sc", "gl", "vb"];




interface ItemForm {
  descricao: string; unidade: string; quantidade: string; observacoes: string;
  orcamentoItemId?: number; eapCodigo?: string;
  insumoCodigo?: string; composicaoCodigo?: string; precoMeta?: number;
  quantidadeServico?: number; coeficiente?: number; origemEap?: boolean;
  semVerba?: boolean; motivoSemVerba?: string;
  incluirAjudante?: boolean; metaMdoProfissional?: number; metaMdoAjudante?: number;
}
const MOTIVOS_SEM_VERBA = [
  { value: "quebra_dano", label: "Quebra / Dano" },
  { value: "furto", label: "Furto / Roubo" },
  { value: "erro_orcamento", label: "Erro de Orçamento" },
  { value: "qtd_insuficiente", label: "Quantidade Insuficiente" },
  { value: "retrabalho", label: "Retrabalho" },
  { value: "outro", label: "Outro" },
];
const newItem = (): ItemForm => ({ descricao: "", unidade: "un", quantidade: "1", observacoes: "" });

function UltimaCompraCard({ companyId, descricao, insumoCodigo }: { companyId: number; descricao: string; insumoCodigo?: string }) {
  const trimmed = descricao.replace(/^\[[\d.]+\]\s*/, "").trim();
  const hasInput = trimmed.length >= 3 || (insumoCodigo && insumoCodigo.length > 0);
  const histQ = trpc.compras.getHistoricoRecompra.useQuery(
    { companyId, descricao: trimmed || undefined, insumoCodigo: insumoCodigo || undefined },
    { enabled: companyId > 0 && !!hasInput }
  );

  if (!histQ.data || !hasInput) return null;

  const h = histQ.data;
  return (
    <div className="flex items-start gap-2 px-2.5 py-2 rounded-lg bg-blue-50 border border-blue-200 text-xs animate-in fade-in slide-in-from-top-1 duration-200">
      <ShoppingBag className="h-3.5 w-3.5 text-blue-500 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-blue-700 flex items-center gap-1">
          <History className="h-3 w-3" /> Última compra
        </div>
        <div className="text-blue-600 mt-0.5">
          <span className="font-medium">{h.fornecedorNome || "Fornecedor não identificado"}</span>
        </div>
        <div className="text-blue-400 text-[10px] mt-0.5">
          {h.dataOc ? new Date(h.dataOc).toLocaleDateString("pt-BR") : "—"}
          <span className="mx-1">·</span>
          OC {h.numeroOc}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_CFG[status] ?? STATUS_CFG.pendente;
  return <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium border ${c.cls}`}>{c.label}</span>;
}
function AprovBadge({ status }: { status: string | null }) {
  const s = status ?? "aguardando";
  const c = APROV_CFG[s] ?? APROV_CFG.aguardando;
  return <span className={`inline-flex items-center gap-1 text-xs font-medium ${c.cls}`}>{c.icon}{c.label}</span>;
}

function DocLinks({ docs, prefix, route, navigate }: { docs: { id: number; numero: string }[]; prefix: string; route: string; navigate: (path: string) => void }) {
  if (!docs || docs.length === 0) return null;
  return (
    <>
      {docs.map((d, i) => (
        <button key={d.id} type="button" onClick={(e) => { e.stopPropagation(); navigate(`${route}?destaque=${d.id}`); }} className="inline-flex items-center gap-0.5 text-[8px] font-semibold text-indigo-600 hover:text-indigo-800 hover:underline bg-indigo-50 hover:bg-indigo-100 rounded px-1 py-0.5 transition-colors cursor-pointer">
          {d.numero || `${prefix}-${d.id}`}{i < docs.length - 1 ? "" : ""}
        </button>
      ))}
    </>
  );
}

function ConfirmAprovDialog({ confirmAprov, setConfirmAprov, aprovar, desaprovar, user, companyId }: {
  confirmAprov: { id: number; key: string; titulo: string; descricao: string; cor: string; icone: "aprovar" | "recusar" | "voltar" } | null;
  setConfirmAprov: (v: any) => void;
  aprovar: any;
  desaprovar: any;
  user: any;
  companyId: number;
}) {
  const saldoQ = trpc.compras.getSaldoItensSC.useQuery(
    { companyId, solicitacaoId: confirmAprov?.id ?? 0 },
    { enabled: confirmAprov !== null },
  );
  const itens = saldoQ.data ?? [];
  const temProblema = itens.some(i => i.situacao !== "ok");

  function gerarTextoSituacao(item: typeof itens[number]): { texto: string; cor: "red" | "orange" | "gray" | null; badge: string | null } {
    const fmt = (v: number) => v.toLocaleString("pt-BR");
    const u = item.unidade;

    if (item.situacao === "sem_vinculo_sem_verba") {
      return {
        texto: `Este item não possui verba suficiente no orçamento. Na criação da SC, o sistema já havia detectado que a quantidade solicitada (${fmt(item.qtdEstaSC)} ${u}) excede o disponível.`,
        cor: "red",
        badge: "SEM VERBA",
      };
    }

    if (item.situacao === "sem_vinculo") {
      return {
        texto: `Item não encontrado no orçamento da obra. Saldo negativo (${fmt(-item.qtdEstaSC)} ${u}). Necessária realocação de verba antes de prosseguir.`,
        cor: "red",
        badge: "REALOCAR VERBA",
      };
    }

    if (item.situacao === "verba_esgotada_compras") {
      const ocsTexto = item.ocsVinculadas.length > 0 ? ` (${item.ocsVinculadas.join(", ")})` : "";
      return {
        texto: `Toda a verba deste item já foi consumida em compras anteriores. Foram compradas ${fmt(item.qtdComprada)} ${u}${ocsTexto} de um total orçado de ${fmt(item.qtdOrcada)} ${u}. Não há saldo restante.`,
        cor: "red",
        badge: "VERBA ESGOTADA",
      };
    }

    if (item.situacao === "verba_esgotada_solicitacoes") {
      return {
        texto: `Toda a verba deste item já foi comprometida em outras solicitações. Já solicitadas ${fmt(item.qtdSolicitada)} ${u} de um total orçado de ${fmt(item.qtdOrcada)} ${u}. Saldo: ${fmt(item.saldo)} ${u}.`,
        cor: "red",
        badge: "VERBA ESGOTADA",
      };
    }

    if (item.situacao === "saldo_insuficiente") {
      const partes: string[] = [];
      if (item.qtdComprada > 0) {
        partes.push(`já compradas ${fmt(item.qtdComprada)} ${u}${item.ocsVinculadas.length > 0 ? ` via ${item.ocsVinculadas.join(", ")}` : ""}`);
      }
      if (item.qtdSolicitada > 0 && item.qtdSolicitada !== item.qtdComprada) {
        partes.push(`já solicitadas ${fmt(item.qtdSolicitada)} ${u} em outras SCs`);
      }
      const motivo = partes.length > 0 ? partes.join(" e ") + "." : "";
      return {
        texto: `O saldo disponível é de apenas ${fmt(Math.max(0, item.saldo))} ${u}, mas esta SC solicita ${fmt(item.qtdEstaSC)} ${u}. Orçado: ${fmt(item.qtdOrcada)} ${u}. ${motivo}`,
        cor: "red",
        badge: "SALDO INSUFICIENTE",
      };
    }

    if (item.qtdComprada > 0) {
      const ocsTexto = item.ocsVinculadas.length > 0 ? item.ocsVinculadas.join(", ") : "OC";
      return {
        texto: `Parte já comprada: ${fmt(item.qtdComprada)} ${u} via ${ocsTexto}. Saldo restante: ${fmt(item.saldo)} ${u}.`,
        cor: "orange",
        badge: null,
      };
    }

    return { texto: "", cor: null, badge: null };
  }

  const fmt = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  const itensOk = itens.filter(i => i.situacao === "ok");
  const itensAlerta = itens.filter(i => i.situacao !== "ok");

  return (
    <Dialog open={confirmAprov !== null} onOpenChange={v => !v && setConfirmAprov(null)}>
      <DialogContent className="border-gray-200 max-w-3xl w-[90vw]" style={{ background: '#ffffff', color: '#111827' }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 text-lg text-gray-900">
            {confirmAprov?.icone === "aprovar" && <CheckCircle2 className="h-6 w-6 text-emerald-600" />}
            {confirmAprov?.icone === "recusar" && <XCircle className="h-6 w-6 text-red-600" />}
            {confirmAprov?.icone === "voltar" && <Clock className="h-6 w-6 text-amber-600" />}
            {confirmAprov?.titulo}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <div className={`rounded-lg border-2 p-3 ${confirmAprov?.cor === "emerald" ? "border-emerald-200 bg-emerald-50" : confirmAprov?.cor === "red" ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
            <p className={`text-sm ${confirmAprov?.cor === "emerald" ? "text-emerald-800" : confirmAprov?.cor === "red" ? "text-red-800" : "text-amber-800"}`}>
              {confirmAprov?.descricao}
            </p>
          </div>

          {confirmAprov?.key !== "desaprovar" && (() => {
            const problemasGraves = itens.filter(i => i.situacao !== "ok" && i.situacao !== "sem_vinculo");
            if (problemasGraves.length > 0) {
              const msgs: string[] = [];
              if (problemasGraves.some(i => i.situacao === "verba_esgotada_compras" || i.situacao === "verba_esgotada_solicitacoes"))
                msgs.push("itens com verba totalmente esgotada");
              if (problemasGraves.some(i => i.situacao === "saldo_insuficiente"))
                msgs.push("itens com saldo insuficiente");
              if (problemasGraves.some(i => i.situacao === "sem_vinculo_sem_verba"))
                msgs.push("itens sem verba prevista");
              return (
                <div className="rounded-lg border-2 border-red-400 bg-red-50 p-3 space-y-1">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
                    <p className="text-sm font-bold text-red-700">ATENÇÃO — Problemas orçamentários detectados</p>
                  </div>
                  <p className="text-xs text-red-600">Esta SC possui {msgs.join(" e ")}. O fluxo não será bloqueado, mas revise cuidadosamente antes de prosseguir.</p>
                </div>
              );
            }
            return null;
          })()}

          {confirmAprov?.key !== "desaprovar" && <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Controle Orçamentário dos Itens</p>
              <div className="flex items-center gap-3 text-[10px]">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" /> OK</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block" /> Parcial</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-500 inline-block" /> Problema</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-gray-400 inline-block" /> Sem vínculo</span>
              </div>
            </div>
            {saldoQ.isLoading ? (
              <div className="flex items-center gap-2 py-8 justify-center text-gray-400"><Loader2 className="h-5 w-5 animate-spin" /> Carregando dados orçamentários...</div>
            ) : saldoQ.isError ? (
              <div className="flex items-center gap-2 py-8 justify-center text-red-400"><AlertTriangle className="h-5 w-5" /> Erro ao carregar dados orçamentários</div>
            ) : (
              <div className="rounded-lg border border-gray-200 overflow-hidden">
                <div className="max-h-[50vh] overflow-auto">
                  <table className="w-full text-sm table-fixed">
                    <colgroup>
                      <col className="w-8" />
                      <col />
                      <col className="w-10" />
                      <col className="w-16" />
                      <col className="w-24" />
                      <col className="w-24" />
                    </colgroup>
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-gray-100 border-b border-gray-200">
                        <th className="text-left px-2 py-2 text-[10px] font-semibold text-gray-600">#</th>
                        <th className="text-left px-2 py-2 text-[10px] font-semibold text-gray-600">Item</th>
                        <th className="text-center px-1 py-2 text-[10px] font-semibold text-gray-600">UN</th>
                        <th className="text-right px-2 py-2 text-[10px] font-semibold text-blue-700 bg-blue-50/50">SC</th>
                        <th className="text-center px-1 py-2 text-[10px] font-semibold text-gray-600">Saldo</th>
                        <th className="text-center px-1 py-2 text-[10px] font-semibold text-gray-600">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {itens.map((item, idx) => {
                        const info = gerarTextoSituacao(item);
                        const isRed = info.cor === "red";
                        const isOrange = info.cor === "orange";
                        const isGray = info.cor === "gray";
                        const linked = item.situacao !== "sem_vinculo" && item.situacao !== "sem_vinculo_sem_verba";
                        const consumoPct = linked && item.qtdOrcada > 0 ? Math.min(((item.qtdSolicitada) / item.qtdOrcada) * 100, 100) : 0;
                        const rowBg = isRed ? "bg-red-50/60" : isOrange ? "bg-orange-50/50" : isGray ? "bg-gray-50/50" : "";
                        const saldoTooltip = linked
                          ? `Orçado: ${fmt(item.qtdOrcada)} ${item.unidade}\nSolicitado: ${fmt(item.qtdSolicitada)} ${item.unidade}\nComprado: ${fmt(item.qtdComprada)} ${item.unidade}${item.ocsVinculadas.length > 0 ? ` (${item.ocsVinculadas.join(", ")})` : ""}\nSaldo: ${fmt(item.saldo)} ${item.unidade}`
                          : "Sem vínculo ao orçamento";
                        return (
                          <tr key={item.id} className={`border-b border-gray-100 hover:bg-gray-50/80 transition-colors ${rowBg}`}>
                            <td className="px-2 py-2 text-[10px] text-gray-400 font-mono">{idx + 1}</td>
                            <td className="px-2 py-2">
                              <p className={`text-xs font-medium truncate ${isRed ? "text-red-800" : "text-gray-800"}`} title={item.descricao}>
                                {item.descricao}
                              </p>
                              {info.texto && (
                                <p className={`text-[9px] mt-0.5 leading-tight line-clamp-2 ${isRed ? "text-red-500" : isGray ? "text-gray-400" : "text-orange-500"}`} title={info.texto}>
                                  {info.texto}
                                </p>
                              )}
                            </td>
                            <td className="px-1 py-2 text-center text-[10px] text-gray-500">{item.unidade}</td>
                            <td className="px-2 py-2 text-right text-xs font-semibold text-blue-700 bg-blue-50/30 tabular-nums">{fmt(item.qtdEstaSC)}</td>
                            <td className="px-1 py-2 text-center" title={saldoTooltip}>
                              {linked ? (
                                <div className="space-y-1">
                                  <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold ${item.saldo < 0 ? "bg-red-100 text-red-700 border border-red-200" : item.saldo === 0 ? "bg-amber-100 text-amber-700 border border-amber-200" : "bg-emerald-100 text-emerald-700 border border-emerald-200"}`}>
                                    {item.saldo < 0 && <AlertTriangle className="h-2.5 w-2.5" />}
                                    {fmt(item.saldo)} {item.unidade}
                                  </span>
                                  {item.qtdOrcada > 0 && (
                                    <div className="flex items-center gap-1.5 px-1">
                                      <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                        <div
                                          className={`h-full rounded-full ${consumoPct > 100 ? "bg-red-500" : consumoPct > 85 ? "bg-amber-400" : "bg-emerald-400"}`}
                                          style={{ width: `${Math.min(consumoPct, 100)}%` }}
                                        />
                                      </div>
                                      <span className={`text-[9px] font-bold ${consumoPct > 100 ? "text-red-600" : consumoPct > 85 ? "text-amber-600" : "text-emerald-600"}`}>
                                        {Math.round(consumoPct)}%
                                      </span>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-red-500 text-[10px] font-bold">S/ VÍNCULO</span>
                              )}
                            </td>
                            <td className="px-1 py-2 text-center">
                              {info.badge ? (
                                <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-red-600 text-white uppercase leading-tight whitespace-nowrap">{info.badge}</span>
                              ) : isGray ? (
                                <span className="text-[8px] font-medium px-1 py-0.5 rounded bg-gray-200 text-gray-500 uppercase whitespace-nowrap">N/A</span>
                              ) : isOrange ? (
                                <span className="text-[8px] font-medium px-1 py-0.5 rounded bg-amber-100 text-amber-700 uppercase whitespace-nowrap">PARCIAL</span>
                              ) : (
                                <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto" />
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    {itens.length > 0 && (
                      <tfoot>
                        <tr className="bg-gray-50 border-t-2 border-gray-200">
                          <td colSpan={3} className="px-2 py-2 text-[10px] font-semibold text-gray-500">{itens.length} {itens.length === 1 ? "item" : "itens"}</td>
                          <td className="px-2 py-2 text-right text-[10px] font-bold text-blue-700 bg-blue-50/30">{fmt(itens.reduce((s, i) => s + i.qtdEstaSC, 0))}</td>
                          <td />
                          <td className="px-1 py-2 text-center">
                            {itensAlerta.length > 0 ? (
                              <span className="text-[10px] font-bold text-red-600">{itensAlerta.length} alerta{itensAlerta.length > 1 ? "s" : ""}</span>
                            ) : (
                              <span className="text-[10px] font-bold text-emerald-600">Tudo OK</span>
                            )}
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            )}
          </div>}

          <div className="flex items-center justify-between pt-3 border-t border-gray-200">
            <div className="flex items-center gap-4 text-xs text-gray-400">
              {confirmAprov?.key !== "desaprovar" && itens.length > 0 && (
                <>
                  <span>{itensOk.length} OK</span>
                  {itensAlerta.length > 0 && <span className="text-red-500 font-semibold">{itensAlerta.length} com alerta</span>}
                </>
              )}
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setConfirmAprov(null)} className="text-gray-600 px-6">
                Cancelar
              </Button>
              <Button
                onClick={() => {
                  if (!confirmAprov) return;
                  if (confirmAprov.key === "desaprovar") {
                    desaprovar.mutate({ id: confirmAprov.id, companyId });
                  } else {
                    aprovar.mutate({ id: confirmAprov.id, aprovacaoStatus: confirmAprov.key, aprovadorId: user?.id ? parseInt(String(user.id)) : undefined });
                  }
                  setConfirmAprov(null);
                }}
                disabled={aprovar.isPending || desaprovar.isPending}
                className={`gap-1.5 px-6 ${confirmAprov?.cor === "emerald" ? "bg-emerald-600 hover:bg-emerald-500 text-white" : confirmAprov?.cor === "red" ? "bg-red-600 hover:bg-red-500 text-white" : "bg-amber-600 hover:bg-amber-500 text-white"}`}>
                {confirmAprov?.icone === "aprovar" && <CheckCircle2 className="h-4 w-4" />}
                {confirmAprov?.icone === "recusar" && <XCircle className="h-4 w-4" />}
                {confirmAprov?.icone === "voltar" && <Clock className="h-4 w-4" />}
                {confirmAprov?.key === "desaprovar" ? "Sim, Desaprovar" : confirmAprov?.icone === "aprovar" ? "Sim, Aprovar" : confirmAprov?.icone === "recusar" ? "Sim, Recusar" : "Sim, Voltar"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Solicitacoes() {
  const { user } = useAuth();
  const { selectedCompanyId } = useCompany();
  const companyId = parseInt(selectedCompanyId || "0");
  const [, navigate] = useLocation();

  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [showNova, setShowNova] = useState(false);
  const [showDetalhe, setShowDetalhe] = useState<number | null>(null);
  const [destaqueId, setDestaqueId] = useState<number | null>(null);
  const [confirmAprov, setConfirmAprov] = useState<{ id: number; key: string; titulo: string; descricao: string; cor: string; icone: "aprovar" | "recusar" | "voltar" } | null>(null);
  const [showSemVerba, setShowSemVerba] = useState<{
    problemas: string[];
    itensSemVerba: Set<string>;
    consolidados: Map<string, ItemForm>;
  } | null>(null);
  const [semVerbaMotivo, setSemVerbaMotivo] = useState("");
  const [semVerbaObs, setSemVerbaObs] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const d = params.get("destaque");
    if (d) {
      const id = parseInt(d);
      if (!isNaN(id)) { setShowDetalhe(id); setDestaqueId(id); setTimeout(() => setDestaqueId(null), 3000); }
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const [form, setForm] = useState({
    titulo: "", obraId: "", dataNecessidade: "", prioridade: "normal", observacoes: "",
    tipo: "material" as "material" | "servico" | "pacote",
  });
  const [obraSearch, setObraSearch] = useState("");
  const [obraOpen, setObraOpen] = useState(false);
  const obraRef = useRef<HTMLDivElement>(null);
  const [itens, setItens] = useState<ItemForm[]>([newItem()]);
  const [recebQtd, setRecebQtd] = useState<Record<number, string>>({});
  const [selectedEapIds, setSelectedEapIds] = useState<Set<number>>(new Set());
  const [eapSearch, setEapSearch] = useState("");
  const [modoSC, setModoSC] = useState<"eap" | "manual" | "insumo">("eap");
  const [insumoBusca, setInsumoBusca] = useState("");
  const [insumoQtds, setInsumoQtds] = useState<Record<string, string>>({});
  const [insumoExpanded, setInsumoExpanded] = useState<string | null>(null);
  const [eapExpanded, setEapExpanded] = useState<number | null>(null);
  const [eapQtdServico, setEapQtdServico] = useState<Record<number, string>>({});
  const [eapInsumos, setEapInsumos] = useState<Record<number, any[]>>({});
  const [eapExtraDesbloqueado, setEapExtraDesbloqueado] = useState<Record<string, boolean>>({});
  const [incluirAjudanteGlobal, setIncluirAjudanteGlobal] = useState(true);
  const [incluirAjudanteOverride, setIncluirAjudanteOverride] = useState<Record<number, boolean>>({});
  const [loadingInsumos, setLoadingInsumos] = useState<number | null>(null);
  const [saldoData, setSaldoData] = useState<Record<number, any>>({});
  const [imagemPreview, setImagemPreview] = useState<string | null>(null);
  const [imagemBase64, setImagemBase64] = useState<string | null>(null);
  const [imagemNome, setImagemNome] = useState<string>("");
  const [uploadingImagem, setUploadingImagem] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [selectedSCIds, setSelectedSCIds] = useState<Set<number>>(new Set());
  const [confirmExcluirLote, setConfirmExcluirLote] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState<{ titulo: string; prioridade: string; dataNecessidade: string; observacoes: string } | null>(null);
  const [editItens, setEditItens] = useState<any[]>([]);
  const [editingSc, setEditingSc] = useState<{ id: number; companyId: number } | null>(null);
  const [editingOriginalEapIds, setEditingOriginalEapIds] = useState<Set<number>>(new Set());

  const q = trpc.compras.listarSolicitacoes.useQuery(
    { companyId, busca: busca || undefined, status: filtroStatus === "todos" ? undefined : filtroStatus },
    { enabled: companyId > 0 }
  );
  const qTodas = trpc.compras.listarSolicitacoes.useQuery(
    { companyId },
    { enabled: companyId > 0 && filtroStatus !== "todos" }
  );
  const detalheQ = trpc.compras.getSolicitacao.useQuery({ id: showDetalhe! }, { enabled: showDetalhe !== null });
  const obrasQ = trpc.obras.listActive.useQuery({ companyId }, { enabled: companyId > 0 });
  const eapQ = trpc.compras.getEapParaObra.useQuery(
    { obraId: parseInt(form.obraId), companyId },
    { enabled: !!form.obraId && parseInt(form.obraId) > 0 }
  );

  const insumosConsolidadosQ = trpc.compras.getInsumosConsolidados.useQuery(
    { companyId, obraId: parseInt(form.obraId), busca: modoSC === "insumo" ? (insumoBusca || undefined) : undefined, tipoSC: form.tipo as "material" | "servico" | "pacote" },
    { enabled: (modoSC === "insumo" || modoSC === "eap") && !!form.obraId && parseInt(form.obraId) > 0 && companyId > 0, staleTime: 30_000 }
  );

  const conversaoInput = useMemo(() => {
    const items = insumosConsolidadosQ.data ?? [];
    if (!items.length) return [];
    return items.slice(0, 50).map((ins: any) => ({
      descricao: ins.descricao as string,
      unidade: (ins.unidade || "un") as string,
      quantidade: ins.qtdTotalOrcada as number,
    }));
  }, [insumosConsolidadosQ.data]);

  const conversaoQ = trpc.compras.getConversaoComercial.useQuery(
    { insumos: conversaoInput },
    { enabled: conversaoInput.length > 0, staleTime: 5 * 60_000 }
  );

  const conversaoMap = useMemo(() => {
    const map: Record<string, { embalagem: string; fator: number }> = {};
    if (!conversaoQ.data) return map;
    for (let i = 0; i < conversaoQ.data.length; i++) {
      const item = conversaoQ.data[i];
      if (item.conversao && conversaoInput[i]) {
        const key = `${conversaoInput[i].descricao.toLowerCase().trim()}|${conversaoInput[i].unidade.toLowerCase().trim()}`;
        map[key] = { embalagem: item.conversao.embalagem, fator: item.conversao.fator };
      }
    }
    return map;
  }, [conversaoQ.data, conversaoInput]);

  function getConversao(descricao: string, unidade: string, quantidade: number): string | null {
    if (quantidade <= 0) return null;
    const key = `${descricao.toLowerCase().trim()}|${unidade.toLowerCase().trim()}`;
    const conv = conversaoMap[key];
    if (!conv || !conv.fator || conv.fator <= 0) return null;
    const qtdConvertida = quantidade / conv.fator;
    return `≈ ${qtdConvertida < 1 ? qtdConvertida.toFixed(2) : Math.ceil(qtdConvertida).toLocaleString("pt-BR")} ${conv.embalagem}`;
  }

  const sugestoesQ = trpc.compras.getSugestoesCompra.useQuery(
    { companyId, obraId: parseInt(form.obraId) },
    { enabled: showNova && !!form.obraId && parseInt(form.obraId) > 0 && companyId > 0, staleTime: 60_000 }
  );

  const alertasEstoqueQ = trpc.compras.getAlertasEstoque.useQuery(
    { companyId, obraId: parseInt(form.obraId) || undefined },
    { enabled: showNova && companyId > 0, staleTime: 60_000 }
  );

  const agrupamentoQ = trpc.compras.getSCsPendentesAgrupamento.useQuery(
    { companyId, obraId: parseInt(form.obraId) || undefined },
    { enabled: showNova && companyId > 0, staleTime: 30_000 }
  );

  const uploadImagem = trpc.compras.uploadImagemReferenciaSC.useMutation();
  const criar = trpc.compras.criarSolicitacao.useMutation({
    onSuccess: () => { toast.success("SC criada!"); setShowNova(false); resetForm(); q.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const aprovar = trpc.compras.aprovarSolicitacao.useMutation({
    onSuccess: (data) => {
      if (data.cotacaoCriada) {
        toast.success(`SC aprovada! Cotação ${data.cotacaoCriada.numeroCotacao} criada automaticamente.`);
      } else {
        toast.success("Status de aprovação atualizado!");
      }
      q.refetch(); detalheQ.refetch();
    },
    onError: (e) => toast.error(e.message),
  });
  const receber = trpc.compras.registrarRecebimentoItem.useMutation({
    onSuccess: () => { toast.success("Recebimento registrado!"); detalheQ.refetch(); q.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const excluir = trpc.compras.excluirSolicitacao.useMutation({
    onSuccess: () => { toast.success("SC excluída!"); q.refetch(); setShowDetalhe(null); },
    onError: (e) => toast.error(e.message),
  });
  const excluirLote = trpc.compras.excluirSolicitacoesEmLote.useMutation({
    onSuccess: (res) => {
      if (res.errors && res.errors.length > 0) { toast.warning(`${res.count} SC(s) excluída(s). ${res.errors.length} não puderam ser excluídas.`); }
      else { toast.success(`${res.count} SC(s) excluída(s)!`); }
      q.refetch(); setSelectedSCIds(new Set()); setConfirmExcluirLote(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const editar = trpc.compras.editarSolicitacao.useMutation({
    onSuccess: () => {
      toast.success("SC atualizada!");
      q.refetch(); detalheQ.refetch(); setEditMode(false);
      if (editingSc) { setShowNova(false); resetForm(); setEditingSc(null); setEditingOriginalEapIds(new Set()); }
    },
    onError: (e) => toast.error(e.message),
  });
  const duplicar = trpc.compras.duplicarSolicitacao.useMutation({
    onSuccess: (data) => { toast.success(`SC ${data.numeroSc} criada (cópia)!`); q.refetch(); setShowDetalhe(data.id); },
    onError: (e) => toast.error(e.message),
  });
  const desaprovar = trpc.compras.desaprovarSolicitacao.useMutation({
    onSuccess: (data) => {
      const msg = data.cotacoesExcluidas > 0
        ? `SC desaprovada! ${data.cotacoesExcluidas} cotação(ões) excluída(s).`
        : "SC desaprovada! Voltou para Pendente.";
      toast.success(msg);
      q.refetch(); detalheQ.refetch();
      if (data.cotacoesExcluidas > 0) {
        trpcCtx.compras.listarCotacoes.invalidate();
      }
    },
    onError: (e) => toast.error(e.message),
  });
  const aprovarLote = trpc.compras.aprovarSolicitacoesEmLote.useMutation({
    onSuccess: (res) => {
      const ok = res.filter(r => r.ok).length;
      const cots = res.filter(r => r.cotacaoCriada).length;
      toast.success(`${ok} SC(s) aprovada(s)${cots > 0 ? `, ${cots} cotação(ões) criada(s)` : ""}`);
      setSelectedSCIds(new Set());
      q.refetch();
    },
    onError: (e) => toast.error(e.message),
  });
  const cancelar = trpc.compras.atualizarStatusSolicitacao.useMutation({
    onSuccess: () => { toast.success("SC cancelada!"); q.refetch(); detalheQ.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const criarCotacao = trpc.compras.criarCotacao.useMutation({
    onSuccess: (data) => {
      toast.success(`Cotação ${data.numeroCotacao} criada! Redirecionando...`);
      q.refetch();
      setShowDetalhe(null);
      setTimeout(() => navigate("/compras/cotacoes"), 800);
    },
    onError: (e) => toast.error(e.message),
  });

  function handleEnviarParaCotacao(tipo: "material" | "servico") {
    if (!detalhe) return;
    const itens = (detalhe.itens as any[]).map((it: any) => ({
      solicitacaoItemId: it.id,
      descricao: it.descricao,
      unidade: it.unidade || "un",
      quantidade: parseFloat(it.quantidade) || 1,
      precoUnitario: 0,
    }));
    criarCotacao.mutate({
      companyId,
      descricao: detalhe.titulo || detalhe.numeroSc,
      prioridade: detalhe.prioridade || "normal",
      tipo,
      obraId: detalhe.obraId ?? null,
      solicitacaoId: detalhe.id,
      itens,
    });
  }

  const trpcCtx = trpc.useUtils();
  const [batchSaldo, setBatchSaldo] = useState<Record<number, { qtdSolicitada: number; qtdComprada: number; qtdRecebida: number; saldoDisponivel: number; qtdOrcada: number }>>({});

  const eapBreadcrumbMap = useMemo(() => {
    if (!eapQ.data?.items) return {} as Record<string, { code: string; desc: string }[]>;
    const byCode: Record<string, string> = {};
    for (const it of eapQ.data.items) {
      if (it.eapCodigo) byCode[it.eapCodigo] = it.descricao || "";
    }
    const result: Record<string, { code: string; desc: string }[]> = {};
    for (const it of eapQ.data.items) {
      if (!it.eapCodigo) continue;
      const parts = it.eapCodigo.split(".");
      const trail: { code: string; desc: string }[] = [];
      for (let i = 1; i < parts.length; i++) {
        const parentCode = parts.slice(0, i).join(".");
        if (byCode[parentCode]) trail.push({ code: parentCode, desc: byCode[parentCode] });
      }
      result[it.eapCodigo] = trail;
    }
    return result;
  }, [eapQ.data?.items]);

  function getStatusColor(itemId: number): { dot: string; label: string; bg: string } {
    const s = batchSaldo[itemId];
    if (!s) return { dot: "bg-gray-300", label: "Sem info", bg: "" };
    const orc = Number(s.qtdOrcada) || 0;
    const sol = Number(s.qtdSolicitada) || 0;
    const comp = Number(s.qtdComprada) || 0;
    const rec = Number(s.qtdRecebida) || 0;
    if (sol > orc) return { dot: "bg-red-500", label: "Estouro", bg: "bg-red-50" };
    if (rec >= orc && orc > 0) return { dot: "bg-emerald-500", label: "Concluído", bg: "" };
    if (comp > 0 && rec < comp) return { dot: "bg-orange-500", label: "Comprado parcial", bg: "" };
    if (sol > 0 && comp === 0) return { dot: "bg-blue-500", label: "Solicitado", bg: "" };
    if (sol > 0 && comp > 0 && comp < orc) return { dot: "bg-purple-500", label: "Em compra", bg: "" };
    return { dot: "bg-gray-300", label: "Disponível", bg: "" };
  }

  const batchSaldoQ = trpc.compras.getSaldoInsumoPorObra.useQuery(
    { companyId, obraId: parseInt(form.obraId || "0") },
    { enabled: !!form.obraId && parseInt(form.obraId) > 0 && companyId > 0 }
  );
  const coberturaQ = trpc.compras.getCoberturaInsumosEAP.useQuery(
    { companyId, obraId: parseInt(form.obraId || "0"), tipoSC: form.tipo as "material" | "servico" | "pacote" },
    { enabled: !!form.obraId && parseInt(form.obraId) > 0 && companyId > 0 }
  );
  const coberturaMap = Object.fromEntries(
    (coberturaQ.data ?? []).map((c: any) => [c.orcamentoItemId, c])
  );

  useEffect(() => {
    if (batchSaldoQ.data) {
      const map: any = {};
      for (const r of batchSaldoQ.data) map[r.orcamentoItemId] = r;
      setBatchSaldo(map);
    }
  }, [batchSaldoQ.data]);

  function resetForm() {
    setForm({ titulo: "", obraId: "", dataNecessidade: "", prioridade: "normal", observacoes: "", tipo: "material" });
    setObraSearch(""); setObraOpen(false);
    setItens([newItem()]);
    setSelectedEapIds(new Set());
    setEapSearch(""); setModoSC("eap");
    setEapExpanded(null); setEapQtdServico({}); setEapInsumos({}); setSaldoData({}); setEapExtraDesbloqueado({});
    setInsumoBusca(""); setInsumoQtds({}); setInsumoExpanded(null);
    setImagemPreview(null); setImagemBase64(null); setImagemNome("");
    setIncluirAjudanteGlobal(true); setIncluirAjudanteOverride({});
  }

  function handleImagemFile(file: File) {
    if (!file.type.startsWith("image/")) { toast.error("Selecione uma imagem válida."); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error("Imagem muito grande (máx. 10 MB)."); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setImagemPreview(dataUrl);
      setImagemBase64(dataUrl.split(",")[1]);
      setImagemNome(file.name);
    };
    reader.readAsDataURL(file);
  }

  async function handleEapExpand(it: any) {
    if (eapExpanded === it.id) { setEapExpanded(null); return; }
    setEapExpanded(it.id);

    if (form.tipo === "servico") return;

    if (!eapInsumos[it.id] && it.servicoCodigo) {
      setLoadingInsumos(it.id);
      try {
        const insumos = await trpcCtx.compras.getInsumosComposicao.fetch({ companyId, servicoCodigo: it.servicoCodigo, tipoSC: form.tipo });
        setEapInsumos(prev => ({ ...prev, [it.id]: insumos }));
      } catch { setEapInsumos(prev => ({ ...prev, [it.id]: [] })); }
      setLoadingInsumos(null);
    }

    if (!saldoData[it.id]) {
      try {
        const saldo = await trpcCtx.compras.getSaldoOrcamentario.fetch({ companyId, orcamentoItemId: it.id, obraId: parseInt(form.obraId) });
        if (saldo) setSaldoData(prev => ({ ...prev, [it.id]: saldo }));
      } catch {}
    }
  }

  function getInsumoSaldoGlobal(insumoCodigo: string): { saldoDisponivel: number; qtdTotalOrcada: number; qtdJaSolicitada: number; qtdComprada: number; qtdRecebida: number } | null {
    const consolidados = insumosConsolidadosQ.data ?? [];
    const found = consolidados.find((c: any) => c.insumoCodigo === insumoCodigo);
    if (!found) return null;
    return { saldoDisponivel: found.saldoDisponivel, qtdTotalOrcada: found.qtdTotalOrcada, qtdJaSolicitada: found.qtdJaSolicitada, qtdComprada: found.qtdComprada, qtdRecebida: found.qtdRecebida };
  }

  function handleEapQtdChange(orcItemId: number, qtdStr: string, eapItem: any) {
    setEapQtdServico(prev => ({ ...prev, [orcItemId]: qtdStr }));
    const qtdServ = parseFloat(qtdStr) || 0;
    const insumosList = eapInsumos[orcItemId] || [];

    if (qtdServ > 0) {
      let newItems: ItemForm[];

      if (form.tipo === "servico") {
        const incAjud = incluirAjudanteOverride[orcItemId] ?? incluirAjudanteGlobal;
        newItems = [{
          descricao: eapItem.descricao || `[${eapItem.eapCodigo}] Serviço`,
          unidade: eapItem.unidade || "vb",
          quantidade: String(qtdServ),
          observacoes: "",
          orcamentoItemId: orcItemId,
          eapCodigo: eapItem.eapCodigo,
          composicaoCodigo: eapItem.servicoCodigo,
          quantidadeServico: qtdServ,
          origemEap: true,
          incluirAjudante: incAjud,
          metaMdoProfissional: (eapItem as any).mdoProfissional ?? 0,
          metaMdoAjudante: (eapItem as any).mdoAjudante ?? 0,
        }];
      } else if (insumosList.length > 0) {
        const extraDesbloqueados = eapExtraDesbloqueado;
        newItems = insumosList.map(ins => {
          const qtdCalculada = Math.ceil((qtdServ * ins.coeficiente) * 1000) / 1000;
          const saldoGlobal = getInsumoSaldoGlobal(ins.insumoCodigo);
          let qtdFinal = qtdCalculada;
          if (saldoGlobal) {
            const saldoReal = Math.max(0, saldoGlobal.saldoDisponivel);
            if (saldoReal <= 0 && !extraDesbloqueados[ins.insumoCodigo]) {
              qtdFinal = 0;
            } else if (saldoReal < qtdCalculada && !extraDesbloqueados[ins.insumoCodigo]) {
              qtdFinal = saldoReal;
            }
          }
          return {
            descricao: ins.descricao,
            unidade: ins.unidade,
            quantidade: String(qtdFinal),
            observacoes: qtdFinal < qtdCalculada && qtdFinal > 0 ? `Qtd calculada: ${qtdCalculada} (limitada ao saldo disponível)` : qtdFinal === 0 && qtdCalculada > 0 ? `Bloqueado — saldo global esgotado (calculado: ${qtdCalculada})` : "",
            orcamentoItemId: orcItemId,
            eapCodigo: eapItem.eapCodigo,
            insumoCodigo: ins.insumoCodigo,
            composicaoCodigo: eapItem.servicoCodigo,
            precoMeta: ins.precoUnitario,
            quantidadeServico: qtdServ,
            coeficiente: ins.coeficiente,
            origemEap: true,
            qtdCalculadaOriginal: qtdCalculada,
          };
        }).filter(x => x.quantidade !== "0");
      } else {
        newItems = [{
          descricao: `[${eapItem.eapCodigo}] ${eapItem.descricao}`,
          unidade: eapItem.unidade || "vb",
          quantidade: String(qtdServ),
          observacoes: "",
          orcamentoItemId: orcItemId,
          eapCodigo: eapItem.eapCodigo,
          origemEap: true,
        }];
      }

      setItens(prev => {
        const semEsteOrc = prev.filter(x => x.orcamentoItemId !== orcItemId);
        const semVazios = semEsteOrc.filter(x => x.descricao.trim() !== "" || x.orcamentoItemId);
        return [...semVazios, ...newItems];
      });
      setSelectedEapIds(prev => { const n = new Set(prev); n.add(orcItemId); return n; });
    } else {
      setItens(prev => prev.filter(x => x.orcamentoItemId !== orcItemId));
      setSelectedEapIds(prev => { const n = new Set(prev); n.delete(orcItemId); return n; });
    }
  }

  const prevExtraRef = React.useRef(eapExtraDesbloqueado);
  React.useEffect(() => {
    const prevExtra = prevExtraRef.current;
    prevExtraRef.current = eapExtraDesbloqueado;
    const newKeys = Object.keys(eapExtraDesbloqueado).filter(k => eapExtraDesbloqueado[k] && !prevExtra[k]);
    if (newKeys.length === 0) return;
    const eapItems = eapQ.data?.items;
    if (!eapItems) return;
    for (const orcIdStr of Object.keys(eapQtdServico)) {
      const orcId = parseInt(orcIdStr);
      const qtdStr = eapQtdServico[orcId];
      if (!qtdStr || parseFloat(qtdStr) <= 0) continue;
      const insList = eapInsumos[orcId] || [];
      const affected = insList.some(ins => newKeys.includes(ins.insumoCodigo));
      if (affected) {
        const eapItem = eapItems.find(x => x.id === orcId);
        if (eapItem) handleEapQtdChange(orcId, qtdStr, eapItem);
      }
    }
  }, [eapExtraDesbloqueado]);

  function toggleEapItem(it: any) {
    setSelectedEapIds(prev => {
      const next = new Set(prev);
      if (next.has(it.id)) {
        next.delete(it.id);
        setItens(p => p.filter(x => x.orcamentoItemId !== it.id));
        setEapQtdServico(prev => { const n = { ...prev }; delete n[it.id]; return n; });
      } else {
        next.add(it.id);
        const novoItem: ItemForm = {
          descricao: `[${it.eapCodigo}] ${it.descricao}`,
          unidade: it.unidade || "vb",
          quantidade: String(parseFloat(it.quantidade || "1") || 1),
          observacoes: "",
          orcamentoItemId: it.id,
          eapCodigo: it.eapCodigo,
        };
        setItens(p => {
          const semVazio = p.filter(x => x.descricao.trim() !== "" || x.orcamentoItemId);
          return [...semVazio, novoItem];
        });
      }
      return next;
    });
  }

  async function handleSalvar() {
    if (!form.titulo.trim()) return toast.error("Informe o título da solicitação.");
    if (!form.obraId || form.obraId === "none") return toast.error("Selecione a Obra (centro de custo) para esta solicitação.");

    let itensParaSalvar = itens;
    if (modoSC === "insumo") {
      const insumosComQtd = Object.entries(insumoQtds).filter(([, v]) => parseFloat(v) > 0);
      if (insumosComQtd.length === 0) return toast.error("Informe a quantidade de pelo menos um insumo.");
      const consolidadosData = insumosConsolidadosQ.data ?? [];
      itensParaSalvar = insumosComQtd.map(([codigo, qtd]) => {
        const ins = consolidadosData.find((c: any) => c.insumoCodigo === codigo);
        return {
          descricao: ins?.descricao || codigo,
          unidade: ins?.unidade || "un",
          quantidade: qtd,
          observacoes: `Compra consolidada (${ins?.composicoes?.length || 0} composições)`,
          insumoCodigo: codigo,
          precoMeta: ins?.precoMedio || 0,
          origemEap: true,
        };
      });
    }

    const validos = itensParaSalvar.filter(i => i.descricao.trim());
    if (validos.length === 0) return toast.error("Adicione pelo menos um item.");

    const consolidados = new Map<string, ItemForm>();
    for (const it of validos) {
      const key = form.tipo === "servico" && it.orcamentoItemId
        ? `orc_${it.orcamentoItemId}`
        : (it.insumoCodigo || it.descricao);
      if (consolidados.has(key)) {
        const prev = consolidados.get(key)!;
        prev.quantidade = String(parseFloat(prev.quantidade) + parseFloat(it.quantidade));
      } else {
        consolidados.set(key, { ...it });
      }
    }

    const saldoProblems: string[] = [];
    const itensSemVerba = new Set<string>();
    if (form.tipo === "servico") {
      const eapItems = eapQ.data?.items || [];
      for (const [, item] of consolidados) {
        if (!item.orcamentoItemId) continue;
        const eapItem = eapItems.find((e: any) => e.id === item.orcamentoItemId);
        if (!eapItem) continue;
        const mdoSaldo = (eapItem as any).mdoSaldo ?? 0;
        const qtdSolicitando = parseFloat(item.quantidade) || 0;
        if (qtdSolicitando > 0 && mdoSaldo <= 0) {
          saldoProblems.push(`${eapItem.descricao}: SEM SALDO MDO (100%+ contratado)`);
          itensSemVerba.add(String(item.orcamentoItemId));
        } else if (qtdSolicitando > mdoSaldo && mdoSaldo > 0) {
          const excesso = (((qtdSolicitando - mdoSaldo) / parseFloat(String(eapItem.quantidade || 1))) * 100).toFixed(0);
          saldoProblems.push(`${eapItem.descricao}: excede saldo MDO em ${excesso}%`);
          itensSemVerba.add(String(item.orcamentoItemId));
        }
      }
    } else if (modoSC === "eap") {
      const consolidadosData = insumosConsolidadosQ.data ?? [];
      const qtdPorInsumo: Record<string, number> = {};
      for (const [, item] of consolidados) {
        if (item.insumoCodigo) {
          qtdPorInsumo[item.insumoCodigo] = (qtdPorInsumo[item.insumoCodigo] || 0) + parseFloat(item.quantidade);
        }
      }
      for (const [codigo, qtdSolicitando] of Object.entries(qtdPorInsumo)) {
        const insGlobal = consolidadosData.find((c: any) => c.insumoCodigo === codigo);
        if (insGlobal && qtdSolicitando > 0) {
          const saldoDisp = insGlobal.saldoDisponivel;
          if (saldoDisp <= 0 && !eapExtraDesbloqueado[codigo]) {
            saldoProblems.push(`${insGlobal.descricao}: SEM SALDO GLOBAL (100%+ solicitado)`);
            itensSemVerba.add(codigo);
          } else if (qtdSolicitando > saldoDisp && saldoDisp > 0 && !eapExtraDesbloqueado[codigo]) {
            const excesso = (((qtdSolicitando - saldoDisp) / insGlobal.qtdTotalOrcada) * 100).toFixed(0);
            saldoProblems.push(`${insGlobal.descricao}: excede saldo global em ${excesso}%`);
            itensSemVerba.add(codigo);
          }
        }
      }
    } else {
      for (const [orcId, saldo] of Object.entries(saldoData)) {
        const qtdServ = parseFloat(eapQtdServico[parseInt(orcId)] || "0");
        if (qtdServ > 0 && saldo.saldoDisponivel <= 0) {
          saldoProblems.push(`${saldo.descricao}: SEM VERBA DISPONÍVEL (100%+ consumido)`);
          itensSemVerba.add(orcId);
        } else if (qtdServ > 0 && saldo.saldoDisponivel < qtdServ) {
          const excesso = ((qtdServ - saldo.saldoDisponivel) / saldo.qtdOrcada * 100).toFixed(0);
          saldoProblems.push(`${saldo.descricao}: excede saldo em ${excesso}%`);
          itensSemVerba.add(orcId);
        }
      }
    }

    if (saldoProblems.length > 0) {
      setShowSemVerba({ problemas: saldoProblems, itensSemVerba, consolidados });
      setSemVerbaMotivo("");
      setSemVerbaObs("");
      return;
    }

    await executarCriacao(consolidados);
  }

  async function executarCriacao(consolidados: Map<string, ItemForm>) {
    let imgUrl: string | undefined;
    if (imagemBase64 && imagemNome) {
      setUploadingImagem(true);
      try {
        const res = await uploadImagem.mutateAsync({ companyId, fileBase64: imagemBase64, fileName: imagemNome });
        imgUrl = res.url;
      } catch { toast.error("Erro ao enviar imagem de referência."); }
      setUploadingImagem(false);
    }

    const itensPayload = Array.from(consolidados.values()).map(i => ({
      descricao: i.descricao,
      unidade: i.unidade,
      quantidade: parseFloat(i.quantidade) || 1,
      observacoes: i.observacoes || undefined,
      orcamentoItemId: i.orcamentoItemId,
      eapCodigo: i.eapCodigo,
      insumoCodigo: i.insumoCodigo,
      composicaoCodigo: i.composicaoCodigo,
      precoMeta: i.precoMeta,
      quantidadeServico: i.quantidadeServico,
      coeficiente: i.coeficiente,
      origemEap: i.origemEap,
      semVerba: i.semVerba,
      motivoSemVerba: i.motivoSemVerba,
      incluirAjudante: i.incluirAjudante,
      metaMdoProfissional: i.metaMdoProfissional,
      metaMdoAjudante: i.metaMdoAjudante,
    }));

    if (editingSc) {
      editar.mutate({
        id: editingSc.id,
        companyId: editingSc.companyId,
        titulo: form.titulo,
        obraId: parseInt(form.obraId) || null,
        dataNecessidade: form.dataNecessidade || undefined,
        prioridade: form.prioridade,
        observacoes: form.observacoes || undefined,
        tipo: form.tipo,
        itens: itensPayload,
      });
    } else {
      criar.mutate({
        companyId,
        solicitanteId: user?.id ? parseInt(String(user.id)) : undefined,
        titulo: form.titulo,
        obraId: parseInt(form.obraId),
        dataNecessidade: form.dataNecessidade || undefined,
        prioridade: form.prioridade,
        observacoes: form.observacoes || undefined,
        imagemReferenciaUrl: imgUrl,
        tipo: form.tipo,
        itens: itensPayload,
      });
    }
  }

  async function handleConfirmSemVerba() {
    if (!showSemVerba) return;
    if (!semVerbaMotivo) return toast.error("Selecione o motivo da solicitação sem verba.");
    if (!semVerbaObs.trim()) return toast.error("Informe a justificativa para a solicitação sem verba.");
    const { itensSemVerba, consolidados } = showSemVerba;
    const motivoFinal = semVerbaMotivo === "outro" ? `outro: ${semVerbaObs.trim()}` : semVerbaMotivo;
    for (const [, item] of consolidados) {
      const matched = modoSC === "eap" && form.tipo !== "servico"
        ? (item.insumoCodigo && itensSemVerba.has(item.insumoCodigo))
        : (item.orcamentoItemId && itensSemVerba.has(String(item.orcamentoItemId)));
      if (matched) {
        item.semVerba = true;
        item.motivoSemVerba = motivoFinal;
        item.observacoes = item.observacoes
          ? `${item.observacoes} | Justificativa sem verba: ${semVerbaObs.trim()}`
          : `Justificativa sem verba: ${semVerbaObs.trim()}`;
      }
    }
    setShowSemVerba(null);
    await executarCriacao(consolidados);
  }

  const lista = q.data ?? [];
  const detalhe = detalheQ.data;
  const obras = obrasQ.data ?? [];
  const obrasFiltradas = obras.filter((o: any) =>
    `${o.codigo ?? ""} ${o.nome}`.toLowerCase().includes(obraSearch.toLowerCase())
  );

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (obraRef.current && !obraRef.current.contains(e.target as Node)) setObraOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const todasSCs = filtroStatus !== "todos" ? (qTodas.data ?? lista) : lista;
  const urgentesAtivos = useMemo(() => todasSCs.filter((r: any) => r.prioridade === "urgente" && !["aprovado", "cancelado", "recusado"].includes(r.status)), [todasSCs]);
  const kpis = useMemo(() => ({
    pendente: lista.filter(r => r.status === "pendente").length,
    cotacao:  lista.filter(r => r.status === "cotacao").length,
    aprovado: lista.filter(r => r.status === "aprovado").length,
    recusado: lista.filter(r => r.status === "recusado" || r.status === "cancelado").length,
  }), [lista]);

  function nomeObra(id: number | null | undefined) {
    if (!id) return null;
    return obras.find((o: any) => o.id === id)?.nome ?? null;
  }

  return (
    <DashboardLayout>
    <div className="p-6 space-y-5 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-50 border border-amber-200">
            <ClipboardList className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Solicitações de Compra</h1>
            <p className="text-sm text-gray-500">Requisições internas de materiais e serviços</p>
          </div>
        </div>
        <DraggableCommandBar barId="solicitacoes-compra" items={[
          { id: "nova-sc", node: <Button onClick={() => setShowNova(true)} className="bg-amber-600 hover:bg-amber-500 text-white gap-2"><Plus className="h-4 w-4" /> Nova SC</Button> },
        ]} />
      </div>

      {/* KPI badges */}
      <div className="flex flex-wrap gap-3">
        {[
          { label: "Pendente",    count: kpis.pendente,  cls: "bg-amber-50 border-amber-200 text-amber-700",    key: "pendente" },
          { label: "Em Cotação", count: kpis.cotacao,   cls: "bg-blue-50 border-blue-200 text-blue-700",        key: "cotacao" },
          { label: "Concluído",  count: kpis.aprovado,  cls: "bg-emerald-50 border-emerald-200 text-emerald-700", key: "aprovado" },
          { label: "Recusado",   count: kpis.recusado,  cls: "bg-red-50 border-red-200 text-red-700",            key: "recusado" },
        ].map(k => (
          <button key={k.key}
            onClick={() => setFiltroStatus(filtroStatus === k.key ? "todos" : k.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold transition-all ${k.cls} ${filtroStatus === k.key ? "ring-2 ring-offset-1 ring-amber-400" : "opacity-80 hover:opacity-100"}`}>
            <span className="text-xl font-bold">{k.count}</span>
            <span>{k.label}</span>
          </button>
        ))}
      </div>

      {/* Busca + filtro */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input placeholder="Buscar por número, título, setor..." className="pl-9 bg-white border-gray-300 text-gray-900" value={busca} onChange={e => setBusca(e.target.value)} />
        </div>
        <button onClick={() => setFiltroStatus("todos")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${filtroStatus === "todos" ? "bg-amber-600 border-amber-500 text-white" : "bg-white border-gray-300 text-gray-600 hover:border-gray-400"}`}>
          Todos
        </button>
      </div>

      {selectedSCIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg flex-wrap">
          <CheckSquare className="h-4 w-4 text-amber-600" />
          <span className="text-sm text-amber-800 font-medium">{selectedSCIds.size} selecionada(s)</span>
          {lista.filter((s: any) => selectedSCIds.has(s.id) && s.aprovacaoStatus === "aguardando").length > 0 && (
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs gap-1 ml-2"
              disabled={aprovarLote.isPending}
              onClick={() => aprovarLote.mutate({ ids: Array.from(selectedSCIds), companyId, aprovacaoStatus: "aprovada", aprovadorId: user?.id ? parseInt(String(user.id)) : undefined })}>
              {aprovarLote.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
              Aprovar Selecionadas
            </Button>
          )}
          <Button size="sm" variant="destructive" className="text-xs gap-1"
            disabled={excluirLote.isPending}
            onClick={() => setConfirmExcluirLote(true)}>
            <Trash2 className="h-3 w-3" /> Excluir Selecionadas
          </Button>
          <Button size="sm" variant="outline" className="text-xs border-gray-300 text-gray-600"
            onClick={() => setSelectedSCIds(new Set())}>
            Cancelar
          </Button>
        </div>
      )}

      {urgentesAtivos.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-red-50 border border-red-300 rounded-lg animate-pulse">
          <span className="relative flex h-3 w-3 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-600" />
          </span>
          <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
          <span className="text-sm font-semibold text-red-700">
            {urgentesAtivos.length === 1
              ? `1 solicitação URGENTE aguardando atenção — ${urgentesAtivos[0].numeroSc}: ${urgentesAtivos[0].titulo}`
              : `${urgentesAtivos.length} solicitações URGENTES aguardando atenção imediata`
            }
          </span>
        </div>
      )}

      {/* Tabela */}
      <div className="rounded-xl border border-gray-200 overflow-hidden bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="border-gray-200 bg-gray-50 hover:bg-gray-50">
              <TableHead className="w-10">
                <input type="checkbox" className="h-4 w-4 rounded border-gray-300 accent-amber-600"
                  checked={lista.length > 0 && lista.every((s: any) => selectedSCIds.has(s.id))}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedSCIds(new Set(lista.map((s: any) => s.id)));
                    } else {
                      setSelectedSCIds(new Set());
                    }
                  }}
                />
              </TableHead>
              <TableHead className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Número</TableHead>
              <TableHead className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Título / Setor</TableHead>
              <TableHead className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Obra</TableHead>
              <TableHead className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Necessidade</TableHead>
              <TableHead className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Recebido</TableHead>
              <TableHead className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Aprovação</TableHead>
              <TableHead className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Status</TableHead>
              <TableHead className="w-8"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.isLoading ? (
              <TableRow><TableCell colSpan={9} className="text-center py-10 text-gray-400"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></TableCell></TableRow>
            ) : lista.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center py-10 text-gray-400">Nenhuma solicitação encontrada</TableCell></TableRow>
            ) : lista.map((sc: any) => {
              const itC = sc._itens ?? { total: 0, atendidos: 0 };
              const pct = itC.total > 0 ? Math.round((itC.atendidos / itC.total) * 100) : 0;
              const isUrgente = sc.prioridade === "urgente" && !["aprovado", "cancelado", "recusado"].includes(sc.status);
              return (
                <TableRow key={sc.id} className={`cursor-pointer ${isUrgente ? "bg-red-50 border-l-4 border-l-red-500 hover:bg-red-100" : "border-gray-100 hover:bg-gray-50"}`} onClick={() => setShowDetalhe(sc.id)}>
                  <TableCell onClick={e => e.stopPropagation()}>
                    <input type="checkbox" className="h-4 w-4 rounded border-gray-300 accent-amber-600"
                      checked={selectedSCIds.has(sc.id)}
                      onChange={e => {
                        setSelectedSCIds(prev => {
                          const n = new Set(prev);
                          e.target.checked ? n.add(sc.id) : n.delete(sc.id);
                          return n;
                        });
                      }}
                    />
                  </TableCell>
                  <TableCell className="text-gray-900 font-mono font-semibold text-xs">
                    <div className="flex items-center gap-1.5">
                      {isUrgente && (
                        <span className="relative flex h-2.5 w-2.5 shrink-0">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-600" />
                        </span>
                      )}
                      {sc.numeroSc}
                      {((sc as any).tipo === "servico" || (sc as any).tipo === "pacote") && (
                        <span className={`ml-1 px-1.5 py-0.5 text-[9px] font-semibold rounded ${(sc as any).tipo === "servico" ? "bg-purple-100 text-purple-700" : "bg-indigo-100 text-indigo-700"}`}>
                          {(sc as any).tipo === "servico" ? "SERV" : "PKT"}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-gray-900 text-sm font-medium flex items-center gap-1.5">
                      {sc.titulo || "—"}
                      {sc.imagemReferenciaUrl && <ImageIcon className="h-3.5 w-3.5 text-blue-400 shrink-0" title="Possui imagem de referência" />}
                    </div>
                    {sc.departamento && <div className="text-gray-400 text-xs">{sc.departamento}</div>}
                    {sc.prioridade === "urgente" ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase text-red-700 bg-red-100 border border-red-300 rounded px-1.5 py-0.5 mt-0.5">
                        <AlertTriangle className="h-3 w-3" /> URGENTE
                      </span>
                    ) : sc.prioridade && sc.prioridade !== "normal" ? (
                      <span className={`text-[10px] font-semibold uppercase ${PRIORIDADE_COR[sc.prioridade] ?? "text-gray-400"}`}>{sc.prioridade}</span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {sc.obraId ? (
                      <div className="flex items-center gap-1 text-xs text-gray-600">
                        <Building2 className="h-3 w-3 text-gray-400" />
                        {nomeObra(sc.obraId) ?? `#${sc.obraId}`}
                      </div>
                    ) : <span className="text-gray-300 text-xs">—</span>}
                  </TableCell>
                  <TableCell className="text-gray-500 text-xs">{sc.dataNecessidade ? new Date(sc.dataNecessidade + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</TableCell>
                  <TableCell>
                    {itC.total > 0 ? (
                      <div className="flex items-center gap-2 min-w-[80px]">
                        <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-gray-500 shrink-0">{itC.atendidos}/{itC.total}</span>
                      </div>
                    ) : <span className="text-gray-300 text-xs">—</span>}
                  </TableCell>
                  <TableCell><AprovBadge status={sc.aprovacaoStatus} /></TableCell>
                  <TableCell><StatusBadge status={sc.status} /></TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {!["cancelado"].includes(sc.status) && (
                        <button
                          title="Editar SC"
                          className="p-1 rounded hover:bg-blue-100 text-gray-400 hover:text-blue-600 transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowDetalhe(sc.id);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button
                        title="Duplicar SC"
                        className="p-1 rounded hover:bg-blue-100 text-gray-400 hover:text-blue-600 transition-colors"
                        onClick={(e) => { e.stopPropagation(); duplicar.mutate({ id: sc.id, companyId }); }}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      <button
                        title="Excluir SC"
                        className="p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-600 transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Excluir ${sc.numeroSc}? Cotações vinculadas sem OC ativa serão canceladas automaticamente.`)) {
                            excluir.mutate({ id: sc.id });
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                      <ChevronRight className="h-4 w-4 text-gray-400" />
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* ── Dialog Nova SC ─────────────────────────────────────────── */}
      <Dialog open={showNova} onOpenChange={v => { setShowNova(v); if (!v) { resetForm(); setEditingSc(null); setEditingOriginalEapIds(new Set()); } }}>
        <DialogContent
          className="border-gray-200 w-[96vw] max-w-[96vw] h-[94vh] max-h-[94vh] flex flex-col p-0 gap-0"
          style={{ background: '#ffffff', color: '#111827' }}
        >
          {/* Header fixo */}
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-gray-100 shrink-0">
            <DialogTitle style={{ color: '#111827' }} className="text-base font-semibold">{editingSc ? "Editar Solicitação de Compra" : "Nova Solicitação de Compra"}</DialogTitle>
          </DialogHeader>

          {/* Corpo rolável */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="space-y-3">
            {/* Título */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">Título da Solicitação *</label>
              <input
                className="w-full h-8 px-3 text-sm rounded-md border border-gray-300 bg-white text-gray-900 placeholder-gray-400 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-300"
                placeholder="Ex: Materiais de alvenaria - Bloco A"
                value={form.titulo}
                onChange={e => setForm(p => ({ ...p, titulo: e.target.value }))}
                onBlur={e => {
                  const titulo = normalizarTexto(e.target.value);
                  setForm(p => {
                    const mdoPattern = /\bm\.?o\.?\b|mão\s*de\s*obra|\bmdo\b|pedreiro|servente|ajudante|auxiliar|encanador|eletricista|pintor|carpinteiro|armador|soldador|serralheiro|gesseiro|azulejista|marmorista|vidraceiro|impermeabilizador|operador/i;
                    if (p.tipo === "material" && mdoPattern.test(titulo)) {
                      return { ...p, titulo, tipo: "servico" };
                    }
                    return { ...p, titulo };
                  });
                }}
              />
            </div>

            {/* Tipo de Solicitação */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">Tipo de Solicitação</label>
              <div className="flex gap-2">
                {[
                  { value: "material" as const, label: "Material", icon: "📦" },
                  { value: "servico" as const, label: "Serviço / MDO", icon: "🔧" },
                  { value: "pacote" as const, label: "Pacote (Mat+MDO)", icon: "📋" },
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`flex-1 px-3 py-2 text-xs rounded-md border transition-all ${
                      form.tipo === opt.value
                        ? "border-amber-500 bg-amber-50 text-amber-700 font-semibold shadow-sm"
                        : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
                    }`}
                    onClick={() => {
                      setForm(p => ({ ...p, tipo: opt.value }));
                      setSelectedEapIds(new Set());
                      setItens([newItem()]);
                      setEapInsumos({});
                      setEapQtdServico({});
                      setEapExpanded(null);
                      setSaldoData({});
                      setEapExtraDesbloqueado({});
                      if (opt.value === "servico" && modoSC === "insumo") setModoSC("eap");
                    }}
                  >
                    <span className="mr-1">{opt.icon}</span> {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Obra — combobox com busca */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700 flex items-center gap-1">
                <Building2 className="h-3 w-3 text-amber-600" /> Obra / Centro de Custo *
              </label>
              <div className="relative" ref={obraRef}>
                <input
                  className="w-full h-8 px-3 text-sm border border-gray-300 rounded-md bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                  placeholder={obrasQ.isLoading ? "Carregando obras..." : "Digite para buscar a obra..."}
                  value={obraOpen
                    ? obraSearch
                    : form.obraId
                      ? (obras.find((o: any) => String(o.id) === form.obraId) as any)
                          ? `${(obras.find((o: any) => String(o.id) === form.obraId) as any)?.codigo ? `[${(obras.find((o: any) => String(o.id) === form.obraId) as any).codigo}] ` : ""}${(obras.find((o: any) => String(o.id) === form.obraId) as any)?.nome}`
                          : ""
                      : ""
                  }
                  onFocus={() => { setObraOpen(true); setObraSearch(""); }}
                  onChange={e => { setObraSearch(e.target.value); setObraOpen(true); }}
                />
                {obraOpen && (
                  <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-52 overflow-y-auto">
                    {obrasFiltradas.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-gray-400">Nenhuma obra encontrada</div>
                    ) : obrasFiltradas.map((o: any) => (
                      <div
                        key={o.id}
                        className={`px-3 py-1.5 text-sm cursor-pointer hover:bg-amber-50 hover:text-amber-700 ${String(o.id) === form.obraId ? "bg-amber-50 text-amber-700 font-medium" : "text-gray-900"}`}
                        onMouseDown={e => {
                          e.preventDefault();
                          setForm(p => ({ ...p, obraId: String(o.id) }));
                          setSelectedEapIds(new Set());
                          setItens([newItem()]);
                          setObraSearch("");
                          setObraOpen(false);
                          setEapExpanded(null); setEapQtdServico({}); setEapInsumos({}); setSaldoData({}); setBatchSaldo({}); setEapExtraDesbloqueado({});
                        }}
                      >
                        {o.codigo ? <span className="text-gray-400 mr-1">[{o.codigo}]</span> : null}{o.nome}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Modo SC: EAP ou Manual */}
            {form.obraId && (
              <div className="space-y-2">
                <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
                  <button
                    type="button"
                    onClick={() => setModoSC("eap")}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${modoSC === "eap" ? "bg-white text-amber-700 shadow-sm border border-gray-200" : "text-gray-500 hover:text-gray-700"}`}
                  >
                    <Zap className="h-3 w-3" /> Via EAP (Inteligente)
                  </button>
                  {form.tipo !== "servico" && (
                  <button
                    type="button"
                    onClick={() => setModoSC("insumo")}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${modoSC === "insumo" ? "bg-white text-gray-700 shadow-sm border border-gray-200" : "text-gray-500 hover:text-gray-700"}`}
                  >
                    <Package className="h-3 w-3" /> Por Insumo
                  </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setModoSC("manual")}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${modoSC === "manual" ? "bg-white text-gray-700 shadow-sm border border-gray-200" : "text-gray-500 hover:text-gray-700"}`}
                  >
                    <FileText className="h-3 w-3" /> Manual / Avulso
                  </button>
                </div>

                {modoSC === "eap" && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
                        <ListTree className="h-3.5 w-3.5 text-amber-600" />
                        {form.tipo === "servico" ? "Composições da EAP — selecione os serviços para contratar" : form.tipo === "pacote" ? "Serviços da EAP — clique para explodir insumos e mão de obra" : "Serviços da EAP — clique para explodir insumos"}
                      </label>
                      {selectedEapIds.size > 0 && (
                        <span className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                          {selectedEapIds.size} serviço{selectedEapIds.size > 1 ? "s" : ""}
                        </span>
                      )}
                    </div>

                    {form.tipo === "servico" && eapQ.data && eapQ.data.items.some((it: any) => it.temAjudante) && (
                      <div className="flex items-center gap-3 bg-purple-50 border border-purple-200 rounded-lg px-3 py-2 mb-1">
                        <Users className="h-4 w-4 text-purple-600 shrink-0" />
                        <label className="text-xs font-semibold text-purple-800">Considerar MDO:</label>
                        <select
                          value={incluirAjudanteGlobal ? "completa" : "profissional"}
                          onChange={e => {
                            const val = e.target.value === "completa";
                            setIncluirAjudanteGlobal(val);
                            setIncluirAjudanteOverride({});
                            setItens(prev => prev.map(it => it.origemEap ? { ...it, incluirAjudante: val } : it));
                          }}
                          className="text-xs border border-purple-300 rounded px-2 py-1 bg-white text-purple-900 font-medium"
                        >
                          <option value="completa">Equipe completa (profissional + ajudante)</option>
                          <option value="profissional">Só profissional (sem ajudante)</option>
                        </select>
                        <span className="text-[10px] text-purple-600 ml-auto">Aplica para todos os itens</span>
                      </div>
                    )}

                    {eapQ.data?.semOrcamento ? (
                      <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        Esta obra não possui orçamento vinculado. Use o modo Manual.
                      </div>
                    ) : eapQ.data && eapQ.data.items.length > 0 ? (
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[10px] text-gray-500">
                          <span className="font-medium text-gray-600 mr-0.5">Legenda:</span>
                          {form.tipo === "servico" ? (
                            <>
                              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-emerald-500" />Saldo disponível</span>
                              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-purple-500" />100% contratado</span>
                              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-red-500" />Sem saldo</span>
                            </>
                          ) : (
                            <>
                              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-emerald-500" />Disponível</span>
                              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-blue-500" />Solicitado</span>
                              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-amber-500" />Em cotação</span>
                              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-purple-500" />100% comprado</span>
                              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-rose-500" />Recebido</span>
                              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-red-700" />Estouro</span>
                            </>
                          )}
                        </div>
                      <div className="border border-gray-200 rounded-lg overflow-hidden">
                        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 bg-gray-50">
                          <Search className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                          <input
                            className="flex-1 text-xs bg-transparent outline-none text-gray-700 placeholder-gray-400"
                            placeholder="Filtrar serviços da EAP..."
                            value={eapSearch}
                            onChange={e => setEapSearch(e.target.value)}
                          />
                          {(() => {
                            const visibleItems = (eapQ.data?.items ?? [])
                              .filter((it: any) => it.nivel >= 2 && it.tipo !== "grupo")
                              .filter((it: any) => {
                                if (form.tipo === "servico") return !!it.servicoCodigo && it.temMdo;
                                if (!it.servicoCodigo) return true;
                                if (form.tipo === "material") return it.temMat !== false;
                                return true;
                              })
                              .filter((it: any) => !eapSearch || `${it.eapCodigo} ${it.descricao}`.toLowerCase().includes(eapSearch.toLowerCase()));
                            const allSelected = visibleItems.length > 0 && visibleItems.every((it: any) => selectedEapIds.has(it.id) || (parseFloat(eapQtdServico[it.id] || "") > 0));
                            return (
                              <button
                                type="button"
                                onClick={() => {
                                  if (allSelected) {
                                    visibleItems.forEach((it: any) => {
                                      setSelectedEapIds(prev => { const n = new Set(prev); n.delete(it.id); return n; });
                                      setEapQtdServico(prev => { const n = { ...prev }; delete n[it.id]; return n; });
                                    });
                                    setItens(p => p.filter(x => !visibleItems.some((v: any) => v.id === x.orcamentoItemId)));
                                  } else {
                                    visibleItems.forEach((it: any) => {
                                      if (!selectedEapIds.has(it.id) && !(parseFloat(eapQtdServico[it.id] || "") > 0)) {
                                        if (form.tipo === "servico") {
                                          const mdoSaldo = it.mdoSaldo;
                                          handleEapQtdChange(it.id, mdoSaldo != null && mdoSaldo > 0 ? String(mdoSaldo) : "1", it);
                                        } else {
                                          toggleEapItem(it);
                                        }
                                      }
                                    });
                                  }
                                }}
                                className={`text-[10px] font-semibold px-2 py-0.5 rounded border whitespace-nowrap transition-colors ${allSelected ? "bg-red-50 text-red-600 border-red-200 hover:bg-red-100" : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"}`}
                              >
                                {allSelected ? "Desmarcar todos" : "Selecionar todos"}
                              </button>
                            );
                          })()}
                        </div>
                        <div className="max-h-[50vh] overflow-y-auto divide-y divide-gray-100">
                          {eapQ.data.items
                            .filter(it => it.nivel >= 2 && it.tipo !== "grupo")
                            .filter(it => {
                              if (form.tipo === "servico") return !!it.servicoCodigo && (it as any).temMdo;
                              if (!it.servicoCodigo) return true;
                              if (form.tipo === "material") return (it as any).temMat !== false;
                              return true;
                            })
                            .filter(it => !eapSearch || `${it.eapCodigo} ${it.descricao}`.toLowerCase().includes(eapSearch.toLowerCase()))
                            .map(it => {
                              const expanded = eapExpanded === it.id;
                              const insLista = eapInsumos[it.id];
                              const saldo = saldoData[it.id];
                              const qtdStr = eapQtdServico[it.id] || "";
                              const qtdVal = parseFloat(qtdStr) || 0;
                              const statusColor = getStatusColor(it.id);
                              const cob = coberturaMap[it.id];
                              const cobPct = cob && cob.totalInsumos > 0 ? Math.round((cob.insumosCobertos / cob.totalInsumos) * 100) : null;
                              const cobParcial = cob && cob.totalInsumos > 0 && cob.insumosCobertos > 0 && cob.insumosCobertos < cob.totalInsumos;

                              const isOriginalItem = editingSc && editingOriginalEapIds.has(it.id);
                              return (
                                <div key={it.id} className={`group ${statusColor.bg}`}>
                                  <div
                                    onClick={() => handleEapExpand(it)}
                                    className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors ${expanded ? "bg-amber-50 border-l-2 border-l-amber-500" : isOriginalItem ? "bg-blue-50/50 border-l-2 border-l-blue-400 hover:bg-blue-50" : "hover:bg-gray-50"}`}
                                  >
                                    <span className={`inline-block w-4 h-4 rounded-full shrink-0 ${form.tipo === "servico" ? (((it as any).mdoSaldo ?? 0) <= 0 && ((it as any).mdoContratado ?? 0) > 0 ? "bg-purple-500" : ((it as any).mdoSaldo ?? 0) <= 0 ? "bg-red-500" : "bg-emerald-500") : cobParcial && statusColor.label !== "Estouro" ? "bg-orange-500" : statusColor.dot} ring-1 ring-white shadow-sm`} title={form.tipo === "servico" ? (((it as any).mdoSaldo ?? 0) <= 0 && ((it as any).mdoContratado ?? 0) > 0 ? "100% contratado" : ((it as any).mdoSaldo ?? 0) <= 0 ? "Sem saldo" : "Disponível") : cobParcial ? `Parcial: ${cob.insumosCobertos}/${cob.totalInsumos} insumos` : statusColor.label} />
                                    <input
                                      type="checkbox"
                                      checked={selectedEapIds.has(it.id) || qtdVal > 0}
                                      onClick={(e) => e.stopPropagation()}
                                      onChange={async (e) => {
                                        e.stopPropagation();
                                        if (selectedEapIds.has(it.id) || qtdVal > 0) {
                                          setItens(p => p.filter(x => x.orcamentoItemId !== it.id));
                                          setSelectedEapIds(prev => { const n = new Set(prev); n.delete(it.id); return n; });
                                          setEapQtdServico(prev => { const n = { ...prev }; delete n[it.id]; return n; });
                                        } else {
                                          if (form.tipo === "servico") {
                                            const mdoSaldo = (it as any).mdoSaldo;
                                            if (mdoSaldo != null && mdoSaldo > 0) {
                                              handleEapQtdChange(it.id, String(mdoSaldo), it);
                                            } else {
                                              handleEapQtdChange(it.id, "1", it);
                                            }
                                          } else {
                                            if (eapExpanded !== it.id) {
                                              await handleEapExpand(it);
                                            }
                                            let saldoVal = saldoData[it.id]?.saldoDisponivel;
                                            if (saldoVal == null) {
                                              try {
                                                const s = await trpcCtx.compras.getSaldoOrcamentario.fetch({ companyId, orcamentoItemId: it.id, obraId: parseInt(form.obraId) });
                                                if (s) { setSaldoData(prev => ({ ...prev, [it.id]: s })); saldoVal = s.saldoDisponivel; }
                                              } catch {}
                                            }
                                            if (saldoVal != null && saldoVal > 0) {
                                              handleEapQtdChange(it.id, String(saldoVal), it);
                                            }
                                          }
                                        }
                                      }}
                                      className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500 shrink-0 cursor-pointer accent-amber-600"
                                    />
                                    {expanded ? <ChevronDown className="h-3.5 w-3.5 text-amber-600 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400 shrink-0" />}
                                    <div className="flex-1 min-w-0">
                                      <div className="text-xs text-gray-900 truncate">
                                        <span className="font-semibold text-amber-700 mr-1.5">{it.eapCodigo}</span>
                                        {it.descricao}
                                        {editingSc && editingOriginalEapIds.has(it.id) && (
                                          <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-blue-100 text-blue-700 border border-blue-200">
                                            Já na SC
                                          </span>
                                        )}
                                      </div>
                                      {form.tipo === "servico" ? (
                                        <div className="mt-0.5 ml-0.5 space-y-0.5">
                                          {((it as any).mdoSaldo != null) && (
                                            <div className="flex items-center gap-1.5 text-[9px]">
                                              <span className={`font-medium ${((it as any).mdoSaldo ?? 0) > 0 ? "text-emerald-600" : "text-red-600"}`}>
                                                Saldo: {((it as any).mdoSaldo ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} {it.unidade || "vb"}
                                              </span>
                                            </div>
                                          )}
                                          {(it as any).temAjudante && (it as any).mdoProfissional > 0 && (() => {
                                            const incAjud = incluirAjudanteOverride[it.id] ?? incluirAjudanteGlobal;
                                            return (
                                              <div className="flex items-center gap-1.5 text-[9px] flex-wrap">
                                                <span className="text-gray-500">MDO:</span>
                                                <span className={`font-medium ${!incAjud ? "text-purple-700" : "text-gray-600"}`}>
                                                  {incAjud ? "Equipe completa" : "Só profissional"}
                                                </span>
                                                <button
                                                  type="button"
                                                  onClick={e => {
                                                    e.stopPropagation();
                                                    const newVal = !incAjud;
                                                    setIncluirAjudanteOverride(prev => ({ ...prev, [it.id]: newVal }));
                                                    setItens(prev => prev.map(pi => pi.orcamentoItemId === it.id ? { ...pi, incluirAjudante: newVal } : pi));
                                                  }}
                                                  className={`px-1.5 py-0 rounded text-[8px] font-bold border ${incAjud ? "bg-purple-50 text-purple-700 border-purple-300 hover:bg-purple-100" : "bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100"}`}
                                                >
                                                  {incAjud ? "Excluir ajudante" : "Incluir ajudante"}
                                                </button>
                                              </div>
                                            );
                                          })()}
                                        </div>
                                      ) : cob && cob.totalInsumos > 0 && cob.insumosCobertos > 0 && (
                                        <div className="flex items-center gap-1.5 mt-0.5 ml-0.5">
                                          <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                            <div
                                              className={`h-full rounded-full transition-all ${cobPct === 100 ? "bg-emerald-500" : "bg-orange-400"}`}
                                              style={{ width: `${cobPct}%` }}
                                            />
                                          </div>
                                          <span className={`text-[9px] font-semibold ${cobPct === 100 ? "text-emerald-600" : "text-orange-600"}`}>
                                            {cob.insumosCobertos}/{cob.totalInsumos} insumos
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0 text-xs text-gray-400">
                                      <span>{parseFloat(String(it.quantidade ?? "0")).toLocaleString("pt-BR")} {it.unidade || "vb"}</span>
                                      {qtdVal > 0 && <span className="text-amber-600 font-medium">✓</span>}
                                    </div>
                                  </div>

                                  {expanded && (
                                    <div className="px-4 py-3 bg-gray-50 border-l-2 border-l-amber-500 space-y-3">
                                      {form.tipo === "servico" ? (
                                        <>
                                          <div className="grid grid-cols-3 gap-3 text-xs">
                                            <div className="bg-white rounded-lg border border-gray-200 px-3 py-2 text-center">
                                              <div className="text-[10px] text-gray-500 uppercase font-medium">Orçado</div>
                                              <div className="text-sm font-bold text-gray-800">{parseFloat(String(it.quantidade ?? "0")).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}</div>
                                              <div className="text-[10px] text-gray-400">{it.unidade || "vb"}</div>
                                            </div>
                                            <div className="bg-white rounded-lg border border-blue-200 px-3 py-2 text-center">
                                              <div className="text-[10px] text-blue-500 uppercase font-medium">Contratado</div>
                                              <div className="text-sm font-bold text-blue-700">{((it as any).mdoContratado || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}</div>
                                              <div className="text-[10px] text-blue-400">{it.unidade || "vb"}</div>
                                            </div>
                                            <div className={`bg-white rounded-lg border px-3 py-2 text-center ${((it as any).mdoSaldo ?? 0) <= 0 ? "border-red-200" : "border-emerald-200"}`}>
                                              <div className={`text-[10px] uppercase font-medium ${((it as any).mdoSaldo ?? 0) <= 0 ? "text-red-500" : "text-emerald-500"}`}>Saldo</div>
                                              <div className={`text-sm font-bold ${((it as any).mdoSaldo ?? 0) <= 0 ? "text-red-700" : "text-emerald-700"}`}>{((it as any).mdoSaldo ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}</div>
                                              <div className={`text-[10px] ${((it as any).mdoSaldo ?? 0) <= 0 ? "text-red-400" : "text-emerald-400"}`}>{it.unidade || "vb"}</div>
                                            </div>
                                          </div>
                                          {((it as any).mdoSaldo ?? 0) <= 0 && qtdVal > 0 && (
                                            <div className="px-2.5 py-1.5 text-[10px] font-medium bg-amber-100 border border-amber-300 rounded text-amber-800 flex items-center gap-1.5">
                                              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 shrink-0" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                                              Sem saldo disponível — a SC seguirá para aprovação especial (realocação / risco / admin)
                                            </div>
                                          )}
                                          <div className="flex items-center gap-2">
                                            <label className="text-xs text-gray-600 font-medium whitespace-nowrap">Qtd. a contratar:</label>
                                            <input
                                              type="number" min="0" step="0.01"
                                              className="w-28 h-7 px-2 text-xs rounded border bg-white text-gray-900 outline-none focus:ring-1 border-gray-300 focus:border-amber-400 focus:ring-amber-200"
                                              placeholder="0"
                                              value={qtdStr}
                                              onChange={e => handleEapQtdChange(it.id, e.target.value, it)}
                                            />
                                            <span className="text-xs font-bold text-gray-700 bg-gray-100 border border-gray-300 rounded px-1.5 py-0.5">{it.unidade || "vb"}</span>
                                            {((it as any).mdoSaldo ?? 0) > 0 && (
                                              <button
                                                type="button"
                                                className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-300 rounded px-2 py-0.5 hover:bg-emerald-100 transition-colors"
                                                onClick={() => handleEapQtdChange(it.id, String((it as any).mdoSaldo), it)}
                                              >
                                                Usar saldo
                                              </button>
                                            )}
                                          </div>
                                        </>
                                      ) : (
                                        <>
                                      {(() => {
                                        const insListaLocal = eapInsumos[it.id] || [];
                                        const consolidados = insumosConsolidadosQ.data ?? [];
                                        const totalIns = insListaLocal.length;
                                        let comSaldo = 0, semSaldo = 0, parcial = 0;
                                        for (const ins of insListaLocal) {
                                          const c = consolidados.find((x: any) => x.insumoCodigo === ins.insumoCodigo);
                                          if (!c) { comSaldo++; continue; }
                                          const s = c.saldoDisponivel;
                                          if (s <= 0) semSaldo++;
                                          else if (s < Math.ceil((1 * ins.coeficiente) * 1000) / 1000) parcial++;
                                          else comSaldo++;
                                        }
                                        if (totalIns === 0) return null;
                                        return (
                                          <div className="flex items-center gap-3 text-[10px]">
                                            <div className="flex items-center gap-1">
                                              <span className="w-2 h-2 rounded-full bg-emerald-500" />
                                              <span className="text-emerald-700 font-medium">{comSaldo} com saldo</span>
                                            </div>
                                            {parcial > 0 && <div className="flex items-center gap-1">
                                              <span className="w-2 h-2 rounded-full bg-yellow-500" />
                                              <span className="text-yellow-700 font-medium">{parcial} saldo parcial</span>
                                            </div>}
                                            {semSaldo > 0 && <div className="flex items-center gap-1">
                                              <span className="w-2 h-2 rounded-full bg-gray-400" />
                                              <span className="text-gray-600 font-medium">{semSaldo} sem saldo</span>
                                            </div>}
                                            <span className="text-gray-400">({totalIns} insumos — saldo consolidado da obra)</span>
                                          </div>
                                        );
                                      })()}

                                      <div className="flex items-center gap-2">
                                        <label className="text-xs text-gray-600 font-medium whitespace-nowrap">Qtd. serviço a executar:</label>
                                        <input
                                          type="number" min="0" step="0.01"
                                          className="w-28 h-7 px-2 text-xs rounded border bg-white text-gray-900 outline-none focus:ring-1 border-gray-300 focus:border-amber-400 focus:ring-amber-200"
                                          placeholder="0"
                                          value={qtdStr}
                                          onChange={e => handleEapQtdChange(it.id, e.target.value, it)}
                                        />
                                        <span className="text-xs font-bold text-gray-700 bg-gray-100 border border-gray-300 rounded px-1.5 py-0.5">{it.unidade || "vb"}</span>
                                        <span className="text-[10px] text-gray-400">Orçado: {parseFloat(String(it.quantidade ?? "0")).toLocaleString("pt-BR")}</span>
                                      </div>

                                      {loadingInsumos === it.id ? (
                                        <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
                                          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando insumos da composição...
                                        </div>
                                      ) : insLista && insLista.length > 0 ? (
                                        <div className="space-y-1">
                                          <div className="text-[10px] text-gray-500 uppercase font-semibold tracking-wide flex items-center gap-1">
                                            <Package className="h-3 w-3" /> {form.tipo === "servico" ? "Mão de obra" : form.tipo === "pacote" ? "Insumos + Mão de obra" : "Insumos"} da composição ({insLista.length})
                                          </div>
                                          <div className="bg-white rounded border border-gray-200 divide-y divide-gray-100 max-h-48 overflow-y-auto">
                                            {insLista.map((ins: any, idx: number) => {
                                              const qtdCalc = qtdVal > 0 ? Math.ceil((qtdVal * ins.coeficiente) * 1000) / 1000 : 0;
                                              const insConsolidado = (insumosConsolidadosQ.data ?? []).find((c: any) => c.insumoCodigo === ins.insumoCodigo);
                                              const insStatus = insConsolidado?.statusInsumo || "disponivel";
                                              const insStatusDotColor: Record<string, string> = { disponivel: "bg-emerald-500", solicitado: "bg-blue-500", em_cotacao: "bg-amber-500", comprado: "bg-purple-500", recebido: "bg-rose-500", estouro: "bg-red-700" };
                                              const insStatusLabel: Record<string, string> = { disponivel: "Disponível", solicitado: "Solicitado", em_cotacao: "Em cotação", comprado: "100% comprado", recebido: "Recebido", estouro: "Acima do orçado" };
                                              const saldoGlobal = insConsolidado ? insConsolidado.saldoDisponivel : null;
                                              const saldoReal = saldoGlobal != null ? Math.max(0, saldoGlobal) : null;
                                              const isBloqueado = saldoReal != null && saldoReal <= 0 && !eapExtraDesbloqueado[ins.insumoCodigo];
                                              const isCapado = saldoReal != null && saldoReal > 0 && saldoReal < qtdCalc && !eapExtraDesbloqueado[ins.insumoCodigo];
                                              const isExtra = eapExtraDesbloqueado[ins.insumoCodigo];
                                              const qtdEfetiva = isBloqueado ? 0 : isCapado ? saldoReal : qtdCalc;
                                              const insRowBg = isBloqueado ? "bg-gray-100/80 opacity-60" : isExtra ? "bg-amber-50/60" : isCapado ? "bg-yellow-50/50" : insStatus === "estouro" ? "bg-red-50/60" : insStatus === "comprado" ? "bg-purple-50/50" : insStatus === "recebido" ? "bg-rose-50/50" : "";
                                              return (
                                                <div key={idx} className={`flex items-center gap-2 px-2.5 py-1.5 text-xs ${insRowBg}`}>
                                                  <span className={`shrink-0 w-2.5 h-2.5 rounded-full ${isBloqueado ? "bg-gray-400" : insStatusDotColor[insStatus] || "bg-emerald-500"}`} title={isBloqueado ? "Saldo esgotado" : insStatusLabel[insStatus] || "Disponível"} />
                                                  <div className="flex-1 min-w-0">
                                                    <div className="text-gray-900 truncate flex items-center gap-1 flex-wrap">
                                                      {ins.descricao}
                                                      {isBloqueado && <span className="text-[8px] px-1 rounded font-bold bg-gray-200 text-gray-600">SALDO ESGOTADO</span>}
                                                      {isCapado && <span className="text-[8px] px-1 rounded font-bold bg-yellow-100 text-yellow-700">LIMITADO AO SALDO</span>}
                                                      {isExtra && <span className="text-[8px] px-1 rounded font-bold bg-amber-100 text-amber-700">EXTRA-ORÇAMENTO</span>}
                                                      {!isBloqueado && !isCapado && !isExtra && insStatus !== "disponivel" && <span className={`text-[8px] px-1 rounded font-bold ${insStatus === "estouro" ? "bg-red-100 text-red-700" : insStatus === "comprado" ? "bg-purple-100 text-purple-700" : insStatus === "recebido" ? "bg-rose-100 text-rose-700" : insStatus === "em_cotacao" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"}`}>{insStatusLabel[insStatus]}</span>}
                                                      {insConsolidado?.scDocs?.length > 0 && <DocLinks docs={insConsolidado.scDocs} prefix="SC" route="/compras/solicitacoes" navigate={navigate} />}
                                                      {insConsolidado?.cotDocs?.length > 0 && <DocLinks docs={insConsolidado.cotDocs} prefix="COT" route="/compras/cotacoes" navigate={navigate} />}
                                                      {insConsolidado?.ocDocs?.length > 0 && <DocLinks docs={insConsolidado.ocDocs} prefix="OC" route="/compras/ordens" navigate={navigate} />}
                                                    </div>
                                                    <div className="text-[10px] text-gray-400 flex items-center gap-1 flex-wrap">
                                                      Coef: {ins.coeficiente}
                                                      {insConsolidado && <span>| Orçado global: <strong className="text-gray-600">{insConsolidado.qtdTotalOrcada.toLocaleString("pt-BR")}</strong> | Solicitado: <strong className="text-blue-600">{insConsolidado.qtdJaSolicitada.toLocaleString("pt-BR")}</strong> | Saldo: <strong className={saldoGlobal != null && saldoGlobal <= 0 ? "text-red-600" : "text-emerald-600"}>{saldoGlobal != null ? saldoGlobal.toLocaleString("pt-BR") : "?"}</strong></span>}
                                                    </div>
                                                  </div>
                                                  <div className="text-right shrink-0 flex items-center gap-1.5">
                                                    {(isBloqueado || isCapado) && (
                                                      <button type="button" onClick={(e) => { e.stopPropagation(); setEapExtraDesbloqueado(p => ({ ...p, [ins.insumoCodigo]: true })); }} className="text-[8px] font-semibold text-amber-600 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded px-1.5 py-0.5 whitespace-nowrap transition-colors">
                                                        Extra-orçamento
                                                      </button>
                                                    )}
                                                    <div>
                                                      <div className={`font-semibold ${isBloqueado ? "text-gray-400 line-through" : isCapado ? "text-yellow-700" : "text-gray-700"}`}>{(isBloqueado ? qtdCalc : qtdEfetiva).toLocaleString("pt-BR")} {ins.unidade}</div>
                                                      {isCapado && <div className="text-[9px] text-yellow-600">de {qtdCalc.toLocaleString("pt-BR")} calculado</div>}
                                                      
                                                      {(() => { const c = getConversao(ins.descricao, ins.unidade, qtdEfetiva); return c ? <div className="text-[9px] text-purple-600 bg-purple-50 rounded px-1 py-0.5 mt-0.5 font-medium">{c}</div> : null; })()}
                                                    </div>
                                                  </div>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        </div>
                                      ) : insLista && insLista.length === 0 ? (
                                        <div className="text-xs text-gray-400 py-1">Nenhum insumo cadastrado para esta composição. Use o modo Manual.</div>
                                      ) : !it.servicoCodigo ? (
                                        <div className="flex items-center gap-2 text-xs text-orange-600 bg-orange-50 border border-orange-200 rounded px-2.5 py-2 mt-1">
                                          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                          <span>Este item nao possui codigo de composição vinculado no orçamento. Vincule o codigo da composição no modulo de Orcamento para ver os insumos detalhados aqui, ou use o <strong>modo Manual</strong> para adicionar itens diretamente.</span>
                                        </div>
                                      ) : null}
                                        </>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })
                          }
                          {eapQ.data.items.filter(it => it.nivel >= 2 && it.tipo !== "grupo").length === 0 && (
                            <div className="px-3 py-4 text-xs text-center text-gray-400">Nenhum serviço encontrado na EAP</div>
                          )}
                        </div>
                      </div>
                      </div>
                    ) : eapQ.isLoading ? (
                      <div className="text-xs text-gray-400 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 flex items-center gap-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando EAP...
                      </div>
                    ) : eapQ.isError ? (
                      <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                        Erro ao carregar EAP — use o modo Manual.
                      </div>
                    ) : (
                      <div className="text-xs text-gray-400 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                        Nenhum serviço encontrado para esta obra.
                      </div>
                    )}
                  </div>
                )}

                {modoSC === "insumo" && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
                        <Package className="h-3.5 w-3.5 text-purple-600" />
                        Compra Consolidada por Insumo
                      </label>
                    </div>
                    <div className="text-[10px] text-gray-500 bg-purple-50 border border-purple-200 rounded px-2.5 py-1.5 flex items-center justify-between gap-2">
                      <span>Busque um insumo (cimento, areia, etc.) para ver o total consolidado de todas as composições do orçamento. Permite comprar em volume.</span>
                      {(insumosConsolidadosQ.data ?? []).length > 0 && (
                        <button
                          type="button"
                          className="shrink-0 flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold rounded bg-purple-600 text-white hover:bg-purple-700 transition-colors"
                          onClick={() => {
                            const novos: Record<string, string> = {};
                            for (const ins of (insumosConsolidadosQ.data ?? []) as any[]) {
                              if (ins.saldoDisponivel > 0) {
                                novos[ins.insumoCodigo] = String(ins.saldoDisponivel);
                              }
                            }
                            setInsumoQtds(novos);
                            toast.success(`Quantidade preenchida para ${Object.keys(novos).length} insumo(s) com saldo disponível.`);
                          }}
                        >
                          <ShoppingCart className="h-3 w-3" />
                          Comprar Tudo
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                        <input
                          className="w-full h-8 pl-8 pr-3 text-xs rounded-md border border-gray-300 bg-white text-gray-900 placeholder-gray-400 outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-300"
                          placeholder="Buscar insumo... ex: cimento, areia, brita, aço"
                          value={insumoBusca}
                          onChange={e => setInsumoBusca(e.target.value)}
                        />
                      </div>
                    </div>
                    {!form.obraId ? (
                      <div className="text-xs text-gray-400 py-2">Selecione uma obra acima para visualizar os insumos.</div>
                    ) : insumosConsolidadosQ.isLoading ? (
                      <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Consolidando insumos do orçamento...
                      </div>
                    ) : (insumosConsolidadosQ.data ?? []).length === 0 ? (
                      <div className="text-xs text-gray-400 py-2">
                        {insumoBusca ? "Nenhum insumo encontrado para esta busca." : "Digite pelo menos 2 caracteres para buscar."}
                      </div>
                    ) : (
                      <div className="border border-gray-200 rounded-lg overflow-hidden">
                        <div className="bg-gray-50 px-3 py-1.5 text-[10px] text-gray-500 font-medium uppercase tracking-wide border-b border-gray-200 grid grid-cols-[3fr_0.6fr_1fr_1fr_1fr_1fr_0.8fr_1fr_1.5fr] gap-1">
                          <span>Insumo</span>
                          <span className="text-center">Un</span>
                          <span className="text-right">Orçado</span>
                          <span className="text-right">Solic.</span>
                          <span className="text-right">Saldo</span>
                          <span className="text-right">Comp.</span>
                          <span className="text-center">Qtd</span>
                          <span className="text-right">Valor Total</span>
                          <span className="text-center flex items-center justify-center gap-1">Conversão {conversaoQ.isLoading && <span className="inline-block w-2.5 h-2.5 border border-purple-400 border-t-transparent rounded-full animate-spin" />}</span>
                        </div>
                        <div className="max-h-[50vh] overflow-y-auto divide-y divide-gray-100">
                          {(insumosConsolidadosQ.data ?? []).map((ins: any) => {
                            const qtdStr = insumoQtds[ins.insumoCodigo] || "";
                            const qtdVal = parseFloat(qtdStr) || 0;
                            const conv = getConversao(ins.descricao, ins.unidade, qtdVal > 0 ? qtdVal : ins.qtdTotalOrcada);
                            const saldoVal = Object.is(ins.saldoDisponivel, -0) ? 0 : ins.saldoDisponivel;
                            const saldoNeg = saldoVal < 0;
                            const isExpanded = insumoExpanded === ins.insumoCodigo;
                            const statusInsumo = ins.statusInsumo || "disponivel";
                            const statusConfig: Record<string, { cor: string; label: string; bg: string }> = {
                              disponivel: { cor: "bg-emerald-500", label: "Disponível", bg: "" },
                              solicitado: { cor: "bg-blue-500", label: "Solicitado", bg: "" },
                              em_cotacao: { cor: "bg-amber-500", label: "Em cotação", bg: "" },
                              comprado: { cor: "bg-purple-500", label: "100% comprado", bg: "bg-purple-50/50" },
                              recebido: { cor: "bg-rose-500", label: "Recebido", bg: "bg-rose-50/50" },
                              estouro: { cor: "bg-red-700", label: "Acima do orçado", bg: "bg-red-50/60" },
                            };
                            const sc = statusConfig[statusInsumo] || statusConfig.disponivel;
                            const comprado100 = ins.qtdComprada >= ins.qtdTotalOrcada && ins.qtdTotalOrcada > 0;
                            const isExtraOrcamento = qtdVal > 0 && comprado100;
                            return (
                              <div key={ins.insumoCodigo}>
                                {isExtraOrcamento && (
                                  <div className="mx-3 mt-1 px-2.5 py-1.5 text-[10px] font-medium bg-amber-100 border border-amber-300 rounded text-amber-800 flex items-center gap-1.5">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 shrink-0" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                                    Compra extra-orçamento — a emissão da OC exigirá aprovação de administrador
                                  </div>
                                )}
                                <div className={`grid grid-cols-[3fr_0.6fr_1fr_1fr_1fr_1fr_0.8fr_1fr_1.5fr] gap-1 px-3 py-2 text-xs items-center hover:bg-gray-50 ${sc.bg}`}>
                                  <div className="min-w-0 flex items-center gap-1.5">
                                    <input
                                      type="checkbox"
                                      checked={qtdVal > 0}
                                      className="shrink-0 h-3.5 w-3.5 rounded border-gray-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                                      onChange={(e) => {
                                        if (e.target.checked) {
                                          const val = ins.saldoDisponivel > 0 ? String(ins.saldoDisponivel) : "1";
                                          setInsumoQtds(p => ({ ...p, [ins.insumoCodigo]: val }));
                                        } else {
                                          setInsumoQtds(p => { const n = { ...p }; delete n[ins.insumoCodigo]; return n; });
                                        }
                                      }}
                                    />
                                    <div className="min-w-0 flex-1 cursor-pointer" onClick={() => setInsumoExpanded(isExpanded ? null : ins.insumoCodigo)}>
                                    <div className="flex items-center gap-1">
                                      <ChevronDown className={`h-3 w-3 text-gray-400 shrink-0 transition-transform ${isExpanded ? "" : "-rotate-90"}`} />
                                      <span className={`shrink-0 w-2 h-2 rounded-full ${sc.cor}`} title={sc.label} />
                                      <div className="min-w-0">
                                        <div className="text-gray-900 truncate font-medium">{ins.descricao}</div>
                                        <div className="text-[9px] text-gray-400 ml-4 flex items-center gap-1 flex-wrap">{ins.insumoCodigo} · {ins.composicoes.length} composiç{ins.composicoes.length > 1 ? "ões" : "ão"} · <span className="text-purple-500 underline cursor-pointer">ver onde é usado</span>{statusInsumo !== "disponivel" && <span className={`px-1 rounded text-[8px] font-bold ${statusInsumo === "estouro" ? "bg-red-100 text-red-700" : statusInsumo === "comprado" ? "bg-purple-100 text-purple-700" : statusInsumo === "recebido" ? "bg-rose-100 text-rose-700" : statusInsumo === "em_cotacao" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"}`}>{sc.label}</span>}{ins.scDocs?.length > 0 && <DocLinks docs={ins.scDocs} prefix="SC" route="/compras/solicitacoes" navigate={navigate} />}{ins.cotDocs?.length > 0 && <DocLinks docs={ins.cotDocs} prefix="COT" route="/compras/cotacoes" navigate={navigate} />}{ins.ocDocs?.length > 0 && <DocLinks docs={ins.ocDocs} prefix="OC" route="/compras/ordens" navigate={navigate} />}</div>
                                      </div>
                                    </div>
                                    </div>
                                  </div>
                                  <div className="text-center">
                                    <span className="text-[9px] font-bold text-gray-600 bg-gray-100 rounded px-1 py-0.5">{ins.unidade}</span>
                                  </div>
                                  <div className="text-right font-semibold text-gray-700">{ins.qtdTotalOrcada.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}</div>
                                  <div className="text-right text-blue-600">{ins.qtdJaSolicitada.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}</div>
                                  <div className={`text-right font-bold ${saldoNeg ? "text-red-600" : "text-emerald-600"}`}>{saldoVal.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}</div>
                                  <div className="text-right text-purple-600">{ins.qtdComprada.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}</div>
                                  <div className="flex items-center gap-0.5">
                                    <input
                                      type="number" min="0" step="0.01"
                                      className="w-full h-6 px-1 text-xs rounded border border-gray-300 bg-white text-gray-900 outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-200 text-center"
                                      placeholder="0"
                                      value={qtdStr}
                                      onChange={e => setInsumoQtds(p => ({ ...p, [ins.insumoCodigo]: e.target.value }))}
                                    />
                                    {ins.saldoDisponivel > 0 && (
                                      <button
                                        type="button"
                                        title={`Usar saldo: ${ins.saldoDisponivel.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}`}
                                        className="shrink-0 h-6 px-1 text-[8px] font-bold rounded border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors whitespace-nowrap"
                                        onClick={() => setInsumoQtds(p => ({ ...p, [ins.insumoCodigo]: String(ins.saldoDisponivel) }))}
                                      >
                                        Saldo
                                      </button>
                                    )}
                                  </div>
                                  <div className="text-right">
                                  </div>
                                  <div className="text-center">
                                    {conv && <span className="text-[9px] text-purple-600 bg-purple-50 rounded px-1 py-0.5 font-medium">{conv}</span>}
                                  </div>
                                </div>
                                {isExpanded && (ins.eapItens ?? []).length > 0 && (
                                  <div className="bg-purple-50/50 border-t border-purple-100 px-4 py-2">
                                    <div className="text-[10px] font-semibold text-purple-700 mb-1.5 flex items-center gap-1">
                                      <ListTree className="h-3 w-3" />
                                      Onde este insumo é utilizado:
                                    </div>
                                    <div className="space-y-1.5">
                                      {(ins.eapItens as any[]).map((eap: any, idx: number) => {
                                        const trail = eapBreadcrumbMap[eap.eapCodigo] || [];
                                        return (
                                          <div key={idx} className="bg-white rounded px-2.5 py-1.5 border border-purple-100">
                                            {trail.length > 0 && (
                                              <div className="flex items-center gap-0.5 mb-1 flex-wrap">
                                                {trail.map((t: any, ti: number) => (
                                                  <span key={ti} className="flex items-center gap-0.5">
                                                    {ti > 0 && <span className="text-gray-300 text-[8px]">›</span>}
                                                    <span className="text-[9px] text-gray-400 bg-gray-50 rounded px-1 py-0.5 leading-none">{t.desc}</span>
                                                  </span>
                                                ))}
                                              </div>
                                            )}
                                            <div className="flex items-center gap-2 text-[10px]">
                                              <span className="font-mono text-purple-600 font-semibold shrink-0">{eap.eapCodigo}</span>
                                              <span className="text-gray-700 truncate flex-1">{eap.servicoDescricao}</span>
                                              <span className="text-gray-500 shrink-0">Qtd: <b className="text-gray-800">{eap.qtdServico.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}</b></span>
                                              <span className="text-gray-500 shrink-0">× {eap.coeficiente.toLocaleString("pt-BR", { maximumFractionDigits: 4 })}</span>
                                              <span className="text-purple-700 font-bold shrink-0">= {eap.qtdInsumo.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} {ins.unidade}</span>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {modoSC === "manual" && (
                  <div className="text-xs text-gray-500 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 flex items-center gap-1.5">
                    <FileText className="h-3 w-3 text-blue-500 shrink-0" />
                    Modo manual — adicione os itens livremente na seção abaixo.
                  </div>
                )}
              </div>
            )}

            {/* Painéis inteligentes: Sugestões, Alertas Estoque, Agrupamento */}
            {form.obraId && parseInt(form.obraId) > 0 && (
              <div className="space-y-2">
                {(sugestoesQ.data ?? []).length > 0 && (
                  <details className="border border-amber-200 rounded-lg bg-amber-50 overflow-hidden">
                    <summary className="px-3 py-2 text-xs font-semibold text-amber-800 cursor-pointer hover:bg-amber-100 flex items-center gap-1.5">
                      <CalendarDays className="h-3.5 w-3.5 text-amber-600" />
                      Sugestão de Compra — {(sugestoesQ.data ?? []).length} insumos para atividades das próximas 2 semanas
                    </summary>
                    <div className="border-t border-amber-200 max-h-32 overflow-y-auto divide-y divide-amber-100">
                      {(sugestoesQ.data ?? []).map((s: any, i: number) => {
                        const conv = getConversao(s.descricao, s.unidade, s.qtdNecessaria);
                        return (
                          <div key={i} className="px-3 py-1.5 text-xs flex items-center justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <span className="text-gray-900 font-medium truncate block">{s.descricao}</span>
                              <span className="text-[9px] text-amber-600">{s.atividades.slice(0, 2).join(", ")}{s.atividades.length > 2 ? ` +${s.atividades.length - 2}` : ""}</span>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="font-bold text-gray-700">{s.qtdNecessaria.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} {s.unidade}</span>
                              {conv && <div className="text-[9px] text-purple-600">{conv}</div>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </details>
                )}

                {(alertasEstoqueQ.data ?? []).length > 0 && (
                  <details className="border border-red-200 rounded-lg bg-red-50 overflow-hidden">
                    <summary className="px-3 py-2 text-xs font-semibold text-red-800 cursor-pointer hover:bg-red-100 flex items-center gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
                      Estoque Baixo — {(alertasEstoqueQ.data ?? []).length} ite{(alertasEstoqueQ.data ?? []).length > 1 ? "ns" : "m"} abaixo do mínimo
                    </summary>
                    <div className="border-t border-red-200 max-h-28 overflow-y-auto divide-y divide-red-100">
                      {(alertasEstoqueQ.data ?? []).map((a: any) => (
                        <div key={a.id} className="px-3 py-1.5 text-xs flex items-center justify-between gap-2">
                          <span className="text-gray-900 font-medium truncate">{a.nome}</span>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-red-700 font-bold">{a.quantidadeAtual.toLocaleString("pt-BR")} {a.unidade}</span>
                            <span className="text-[9px] text-red-500">mín: {a.estoqueMinimo.toLocaleString("pt-BR")}</span>
                            <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${a.percentual < 30 ? "bg-red-200 text-red-800" : "bg-amber-200 text-amber-800"}`}>{a.percentual}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                )}

                {(agrupamentoQ.data ?? []).length > 0 && (
                  <details className="border border-blue-200 rounded-lg bg-blue-50 overflow-hidden">
                    <summary className="px-3 py-2 text-xs font-semibold text-blue-800 cursor-pointer hover:bg-blue-100 flex items-center gap-1.5">
                      <ShoppingCart className="h-3.5 w-3.5 text-blue-600" />
                      Oportunidade de Agrupamento — {(agrupamentoQ.data ?? []).length} insumos em múltiplas SCs
                    </summary>
                    <div className="border-t border-blue-200 max-h-28 overflow-y-auto divide-y divide-blue-100">
                      {(agrupamentoQ.data ?? []).map((g: any, i: number) => (
                        <div key={i} className="px-3 py-1.5 text-xs flex items-center justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <span className="text-gray-900 font-medium truncate block">{g.descricao}</span>
                            <span className="text-[9px] text-blue-600">{g.scs.map((s: any) => s.scNumero).join(", ")}</span>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="font-bold text-gray-700">{g.totalQtd.toLocaleString("pt-BR")} {g.unidade}</span>
                            <div className="text-[9px] text-blue-600">{g.scs.length} SCs</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )}

            {/* Data | Prioridade */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Data de Necessidade</label>
                <input
                  type="date"
                  className="w-full h-8 px-3 text-sm rounded-md border border-gray-300 bg-white text-gray-900 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-300"
                  value={form.dataNecessidade}
                  onChange={e => setForm(p => ({ ...p, dataNecessidade: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Prioridade</label>
                <Select value={form.prioridade} onValueChange={v => setForm(p => ({ ...p, prioridade: v }))}>
                  <SelectTrigger className="h-8 text-sm border-gray-300 bg-white text-gray-900"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-white border-gray-200">
                    {PRIORIDADES.map(p => <SelectItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Observações */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">Observações</label>
              <textarea
                className="w-full px-3 py-2 text-sm rounded-md border border-gray-300 bg-white text-gray-900 placeholder-gray-400 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-300 resize-none"
                rows={2}
                value={form.observacoes}
                onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))}
              />
            </div>

            {/* Imagem de Referência */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">Imagem de Referência (opcional)</label>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleImagemFile(f); e.target.value = ""; }} />
              <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleImagemFile(f); e.target.value = ""; }} />
              {imagemPreview ? (
                <div className="relative inline-block">
                  <img src={imagemPreview} alt="Referência" className="h-24 w-auto rounded-lg border border-gray-200 object-cover" />
                  <button type="button" onClick={() => { setImagemPreview(null); setImagemBase64(null); setImagemNome(""); }} className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600">
                    <X className="h-3 w-3" />
                  </button>
                  <div className="text-[10px] text-gray-500 mt-1 truncate max-w-[200px]">{imagemNome}</div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50">
                    <ImageIcon className="h-3.5 w-3.5" /> Anexar Foto
                  </button>
                  <button type="button" onClick={() => cameraInputRef.current?.click()} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50">
                    <Camera className="h-3.5 w-3.5" /> Câmera
                  </button>
                </div>
              )}
            </div>

            {/* Itens Solicitados */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-gray-700">
                  Itens Solicitados * {itens.filter(i => i.descricao.trim()).length > 0 && (
                    <span className="text-gray-400 font-normal ml-1">({itens.filter(i => i.descricao.trim()).length} ite{itens.filter(i => i.descricao.trim()).length === 1 ? "m" : "ns"})</span>
                  )}
                </label>
                {modoSC === "manual" && (
                  <button
                    type="button"
                    onClick={() => setItens(p => [...p, newItem()])}
                    className="flex items-center gap-1 px-2 py-1 text-xs border border-gray-300 rounded-md bg-white text-gray-600 hover:bg-gray-50 transition"
                  >
                    <Plus className="h-3 w-3" /> Item
                  </button>
                )}
              </div>

              {modoSC === "eap" && itens.filter(i => i.origemEap).length > 0 ? (
                <div className="space-y-1 max-h-[40vh] overflow-y-auto pr-1">
                  {(() => {
                    const consolidados = new Map<string, { descricao: string; unidade: string; qtdTotal: number; precoMeta: number; origens: string[]; insumoCodigo?: string }>();
                    for (const it of itens.filter(i => i.origemEap)) {
                      const key = it.insumoCodigo || it.descricao;
                      if (consolidados.has(key)) {
                        const prev = consolidados.get(key)!;
                        prev.qtdTotal += parseFloat(it.quantidade) || 0;
                        if (it.eapCodigo && !prev.origens.includes(it.eapCodigo)) prev.origens.push(it.eapCodigo);
                      } else {
                        consolidados.set(key, {
                          descricao: it.descricao,
                          unidade: it.unidade,
                          qtdTotal: parseFloat(it.quantidade) || 0,
                          precoMeta: it.precoMeta || 0,
                          origens: it.eapCodigo ? [it.eapCodigo] : [],
                          insumoCodigo: it.insumoCodigo,
                        });
                      }
                    }
                    const statusDotColors: Record<string, string> = { disponivel: "bg-emerald-500", solicitado: "bg-blue-500", em_cotacao: "bg-amber-500", comprado: "bg-purple-500", recebido: "bg-rose-500", estouro: "bg-red-700" };
                    const statusDotLabels: Record<string, string> = { disponivel: "Disponível", solicitado: "Solicitado", em_cotacao: "Em cotação", comprado: "100% comprado", recebido: "Recebido", estouro: "Acima do orçado" };
                    const consolidadoLookup = (insumosConsolidadosQ.data ?? []) as any[];
                    return Array.from(consolidados.entries()).map(([key, c]) => {
                      const insData = consolidadoLookup.find((x: any) => x.insumoCodigo === c.insumoCodigo);
                      const stIns = insData?.statusInsumo || "disponivel";
                      return (
                      <div key={key} className="space-y-1">
                        <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-50/50 border border-amber-200/50 text-xs">
                          <span className={`shrink-0 w-2 h-2 rounded-full ${statusDotColors[stIns] || "bg-emerald-500"}`} title={statusDotLabels[stIns] || "Disponível"} />
                          <Zap className="h-3 w-3 text-amber-500 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-gray-900 truncate flex items-center gap-1 flex-wrap">{c.descricao} {stIns !== "disponivel" && <span className={`text-[8px] px-1 rounded font-bold ${stIns === "estouro" ? "bg-red-100 text-red-700" : stIns === "comprado" ? "bg-purple-100 text-purple-700" : stIns === "recebido" ? "bg-rose-100 text-rose-700" : stIns === "em_cotacao" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"}`}>{statusDotLabels[stIns]}</span>}{insData?.scDocs?.length > 0 && <DocLinks docs={insData.scDocs} prefix="SC" route="/compras/solicitacoes" navigate={navigate} />}{insData?.cotDocs?.length > 0 && <DocLinks docs={insData.cotDocs} prefix="COT" route="/compras/cotacoes" navigate={navigate} />}{insData?.ocDocs?.length > 0 && <DocLinks docs={insData.ocDocs} prefix="OC" route="/compras/ordens" navigate={navigate} />}</div>
                            {c.origens.length > 1 && (
                              <div className="text-[10px] text-amber-600">Consolidado de {c.origens.length} serviços: {c.origens.join(", ")}</div>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-semibold text-gray-700">{c.qtdTotal.toLocaleString("pt-BR")} {c.unidade}</div>
                            
                          </div>
                        </div>
                        <UltimaCompraCard companyId={companyId} descricao={c.descricao} insumoCodigo={c.insumoCodigo} />
                      </div>
                    ); });
                  })()}
                </div>
              ) : modoSC === "eap" && itens.filter(i => i.origemEap).length === 0 ? (
                <div className="text-xs text-gray-400 bg-gray-50 border border-gray-200 rounded-lg px-3 py-3 text-center">
                  Selecione um serviço acima e informe a quantidade para gerar os itens automaticamente.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-[40vh] overflow-y-auto pr-1">
                  {itens.map((it, idx) => (
                    <div key={idx} className="space-y-1">
                      <div className="flex gap-2 items-center p-2 rounded-lg bg-gray-50 border border-gray-200">
                        <input
                          className="flex-1 h-7 px-2 text-xs rounded border border-gray-300 bg-white text-gray-900 placeholder-gray-400 outline-none focus:border-amber-400"
                          placeholder="Descrição do item *"
                          value={it.descricao}
                          onChange={e => setItens(p => p.map((x, i) => i === idx ? { ...x, descricao: e.target.value } : x))}
                          onBlur={e => setItens(p => p.map((x, i) => i === idx ? { ...x, descricao: normalizarTexto(e.target.value) } : x))}
                        />
                        <Select value={it.unidade} onValueChange={v => setItens(p => p.map((x, i) => i === idx ? { ...x, unidade: v } : x))}>
                          <SelectTrigger className="w-16 h-7 text-xs border-gray-300 bg-white text-gray-900"><SelectValue /></SelectTrigger>
                          <SelectContent className="bg-white border-gray-200">
                            {UNIDADES.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <input
                          className="w-20 h-7 px-2 text-xs rounded border border-gray-300 bg-white text-gray-900 outline-none focus:border-amber-400"
                          type="number" min="0.001" step="0.001" placeholder="Qtd"
                          value={it.quantidade}
                          onChange={e => setItens(p => p.map((x, i) => i === idx ? { ...x, quantidade: e.target.value } : x))}
                        />
                        {itens.length > 1 && (
                          <button onClick={() => setItens(p => p.filter((_, i) => i !== idx))} className="text-gray-400 hover:text-red-500">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      {it.descricao.trim().length >= 3 && (
                        <UltimaCompraCard companyId={companyId} descricao={it.descricao} />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>{/* fim space-y-3 */}
          </div>{/* fim corpo rolável */}

          {/* Rodapé fixo com botões */}
          <div className="px-5 py-3 border-t border-gray-100 bg-white shrink-0 flex gap-2">
              <button
                onClick={() => { setShowNova(false); resetForm(); setEditingSc(null); setEditingOriginalEapIds(new Set()); }}
                className="flex-1 h-9 text-sm border border-gray-300 rounded-md bg-white text-gray-600 hover:bg-gray-50 font-medium transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleSalvar}
                disabled={criar.isPending || editar.isPending || uploadingImagem}
                className="flex-1 h-9 text-sm rounded-md bg-amber-600 hover:bg-amber-500 text-white font-semibold transition disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {(criar.isPending || editar.isPending || uploadingImagem) ? <Loader2 className="h-4 w-4 animate-spin" /> : editingSc ? "Salvar Alterações" : "Criar Solicitação"}
              </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Dialog Confirmação Sem Verba ────────────────────────── */}
      <Dialog open={!!showSemVerba} onOpenChange={v => { if (!v) setShowSemVerba(null); }}>
        <DialogContent className="border-red-200 max-w-lg" style={{ background: '#ffffff', color: '#111827' }}>
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2 rounded-full bg-red-100">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <DialogTitle className="text-red-800 text-base">Itens sem verba orçamentária</DialogTitle>
            </div>
          </DialogHeader>

          <div className="space-y-4">
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-red-700 mb-2">
                Os seguintes itens não possuem verba suficiente ou não foram previstos no orçamento:
              </p>
              <ul className="space-y-1 max-h-32 overflow-y-auto">
                {showSemVerba?.problemas.map((p, i) => (
                  <li key={i} className="text-xs text-red-600 flex items-start gap-1.5">
                    <XCircle className="h-3 w-3 mt-0.5 shrink-0" />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-amber-800 mb-1">
                Deseja realmente prosseguir com esta solicitação?
              </p>
              <p className="text-xs text-amber-700">
                A solicitação será marcada como "sem verba" e precisará de aprovação especial.
                Informe abaixo o motivo e a justificativa.
              </p>
            </div>

            <div>
              <Label className="text-xs font-semibold text-gray-700 mb-1">Motivo *</Label>
              <Select value={semVerbaMotivo} onValueChange={setSemVerbaMotivo}>
                <SelectTrigger className="h-9 text-sm border-gray-300">
                  <SelectValue placeholder="Selecione o motivo..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="quebra_dano">Quebra / Dano em obra</SelectItem>
                  <SelectItem value="furto">Furto / Roubo</SelectItem>
                  <SelectItem value="erro_orcamento">Erro de orçamento (qtd subestimada)</SelectItem>
                  <SelectItem value="qtd_insuficiente">Quantidade insuficiente no orçamento</SelectItem>
                  <SelectItem value="retrabalho">Retrabalho / Refação de serviço</SelectItem>
                  <SelectItem value="aditivo">Aditivo contratual / Escopo novo</SelectItem>
                  <SelectItem value="outro">Outro motivo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs font-semibold text-gray-700 mb-1">Justificativa *</Label>
              <Textarea
                value={semVerbaObs}
                onChange={e => setSemVerbaObs(e.target.value)}
                placeholder="Descreva por que esta compra é necessária mesmo sem verba prevista no orçamento..."
                className="text-sm min-h-[80px] border-gray-300 resize-none"
              />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={() => setShowSemVerba(null)}
              className="flex-1 h-9 text-sm border border-gray-300 rounded-md bg-white text-gray-600 hover:bg-gray-50 font-medium transition"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirmSemVerba}
              disabled={!semVerbaMotivo || !semVerbaObs.trim() || criar.isPending}
              className="flex-1 h-9 text-sm rounded-md bg-red-600 hover:bg-red-500 text-white font-semibold transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {criar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                <>
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Criar mesmo sem verba
                </>
              )}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Dialog Detalhe SC ─────────────────────────────────────── */}
      <Dialog open={showDetalhe !== null} onOpenChange={v => { if (!v) { setShowDetalhe(null); setRecebQtd({}); setEditMode(false); setEditForm(null); setEditItens([]); } }}>
        <DialogContent className="border-gray-200 w-[96vw] max-w-[96vw] h-[94vh] max-h-[94vh] overflow-y-auto" style={{ background: '#ffffff', color: '#111827' }}>
          {detalheQ.isLoading ? (
            <div className="py-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
          ) : detalheQ.isError ? (
            <div className="py-10 text-center space-y-2">
              <AlertTriangle className="h-6 w-6 text-red-500 mx-auto" />
              <p className="text-sm text-red-600 font-medium">Erro ao carregar solicitação</p>
              <p className="text-xs text-gray-500">{detalheQ.error?.message || "Tente novamente."}</p>
              <Button size="sm" variant="outline" onClick={() => detalheQ.refetch()} className="text-xs">Tentar novamente</Button>
            </div>
          ) : detalhe ? (
            <>
              <DialogHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs text-gray-400 uppercase tracking-widest mb-0.5">
                      {(detalhe as any).tipo === "servico" ? "Solicitação de Serviço" : (detalhe as any).tipo === "pacote" ? "Solicitação de Pacote" : "Solicitação de Compra"}
                    </div>
                    <DialogTitle className="text-gray-900 text-lg">
                      {detalhe.numeroSc}
                      {((detalhe as any).tipo === "servico" || (detalhe as any).tipo === "pacote") && (
                        <span className={`ml-2 px-2 py-0.5 text-[10px] font-semibold rounded ${(detalhe as any).tipo === "servico" ? "bg-purple-100 text-purple-700" : "bg-indigo-100 text-indigo-700"}`}>
                          {(detalhe as any).tipo === "servico" ? "SERVIÇO" : "PACOTE"}
                        </span>
                      )}
                    </DialogTitle>
                    {detalhe.titulo && <p className="text-gray-600 text-sm mt-0.5">{detalhe.titulo}</p>}
                  </div>
                  <StatusBadge status={detalhe.status} />
                </div>
                {(detalhe.itens as any[])?.some((it: any) => it.semVerba) && (
                  <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-red-50 border-2 border-red-300 rounded-lg print:border-red-500">
                    <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
                    <span className="text-xs font-bold text-red-700">
                      ATENÇÃO — ITEM(NS) ACIMA DO ORÇADO OU SEM VERBA: Esta solicitação contém {(detalhe.itens as any[]).filter((it: any) => it.semVerba).length} item(ns) que geram prejuízo
                    </span>
                  </div>
                )}
              </DialogHeader>

              {/* Info grid */}
              <div className="grid grid-cols-3 gap-3 text-xs bg-gray-50 rounded-lg p-3 border border-gray-200">
                {[
                  { label: "Obra", value: nomeObra(detalhe.obraId) ?? "—" },
                  { label: "Setor", value: detalhe.departamento || "—" },
                  { label: "Necessidade", value: detalhe.dataNecessidade ? new Date(detalhe.dataNecessidade + "T00:00:00").toLocaleDateString("pt-BR") : "—" },
                  { label: "Prioridade", value: detalhe.prioridade ? (detalhe.prioridade.charAt(0).toUpperCase() + detalhe.prioridade.slice(1)) : "Normal" },
                  { label: "Criado em", value: new Date(detalhe.criadoEm).toLocaleDateString("pt-BR") },
                ].map(f => (
                  <div key={f.label}>
                    <span className="text-gray-400">{f.label}</span>
                    <p className="text-gray-900 mt-0.5 font-medium">{f.value}</p>
                  </div>
                ))}
              </div>

              {/* Imagem de Referência */}
              {detalhe.imagemReferenciaUrl && (
                <div className="border border-gray-200 rounded-lg p-3 space-y-1">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Imagem de Referência</span>
                  <a href={detalhe.imagemReferenciaUrl} target="_blank" rel="noopener noreferrer">
                    <img src={detalhe.imagemReferenciaUrl} alt="Referência" className="h-32 w-auto rounded-lg border border-gray-200 object-cover cursor-pointer hover:opacity-90 transition" />
                  </a>
                </div>
              )}

              {/* Aprovação */}
              <div className="border border-gray-200 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Aprovação</span>
                  <AprovBadge status={detalhe.aprovacaoStatus} />
                </div>
                {detalhe.status === "cotacao" || detalhe.status === "aprovado" ? (
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-500">Esta solicitação já está em andamento no fluxo de compras.</p>
                    <Button size="sm" variant="outline"
                      onClick={() => setConfirmAprov({
                        id: detalhe.id, key: "desaprovar", icone: "voltar",
                        titulo: `Desaprovar ${detalhe.numeroSc}?`,
                        descricao: "A solicitação voltará ao status 'Pendente'. Cotações vinculadas que não possuem OC serão canceladas automaticamente.",
                        cor: "red",
                      })}
                      disabled={aprovar.isPending || desaprovar.isPending}
                      className="text-xs border-red-300 text-red-700 hover:bg-red-50">
                      <XCircle className="h-3 w-3 mr-1" /> Desaprovar
                    </Button>
                  </div>
                ) : (
                <div className="flex gap-2">
                  {[
                    ...(detalhe.aprovacaoStatus !== "aguardando" ? [{ key: "aguardando", label: "Voltar p/ Aguardando", cls: "border-amber-300 text-amber-700 hover:bg-amber-50" }] : []),
                    ...(detalhe.aprovacaoStatus !== "aprovada" ? [{ key: "aprovada", label: "Aprovar", cls: "border-emerald-300 text-emerald-700 hover:bg-emerald-50" }] : []),
                    ...(detalhe.aprovacaoStatus !== "recusada" ? [{ key: "recusada", label: "Recusar", cls: "border-red-300 text-red-700 hover:bg-red-50" }] : []),
                  ].map(a => (
                    <Button key={a.key} size="sm" variant="outline"
                      onClick={() => {
                        if (a.key === "aprovada") {
                          setConfirmAprov({
                            id: detalhe.id, key: a.key, icone: "aprovar",
                            titulo: `Aprovar ${detalhe.numeroSc}?`,
                            descricao: "Ao aprovar, esta SC avançará no fluxo de compras e poderá ser enviada para cotação junto a fornecedores.",
                            cor: "emerald",
                          });
                        } else if (a.key === "recusada") {
                          setConfirmAprov({
                            id: detalhe.id, key: a.key, icone: "recusar",
                            titulo: `Recusar ${detalhe.numeroSc}?`,
                            descricao: "Ao recusar, esta solicitação será bloqueada e não seguirá para cotação. O solicitante será notificado.",
                            cor: "red",
                          });
                        } else {
                          setConfirmAprov({
                            id: detalhe.id, key: a.key, icone: "voltar",
                            titulo: `Voltar ${detalhe.numeroSc} para Aguardando?`,
                            descricao: "A solicitação voltará ao status 'Aguardando Aprovação' e poderá ser reavaliada.",
                            cor: "amber",
                          });
                        }
                      }}
                      disabled={aprovar.isPending}
                      className={`text-xs ${a.cls}`}>
                      {a.label}
                    </Button>
                  ))}
                </div>
                )}
              </div>

              {/* Rastreabilidade */}
              <div className="border border-gray-200 rounded-lg p-3">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">Rastreabilidade do Pedido</div>
                <div className="relative">
                  <div className="absolute left-3 top-4 bottom-4 w-0.5 bg-gray-200" />
                  <div className="space-y-3">
                    {/* Solicitação criada */}
                    <div className="flex items-start gap-3 relative">
                      <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center shrink-0 z-10 ring-2 ring-white">
                        <ClipboardList className="h-3 w-3 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-gray-900">Solicitação criada</div>
                        <div className="text-[10px] text-gray-500 mt-0.5">
                          {new Date(detalhe.criadoEm).toLocaleString("pt-BR")}
                          {detalhe.solicitanteNome && <span className="ml-1.5 text-blue-600 font-medium">por {detalhe.solicitanteNome}</span>}
                        </div>
                      </div>
                    </div>

                    {/* Aprovação */}
                    <div className="flex items-start gap-3 relative">
                      {(() => {
                        const isAprovada = ["aprovada","aprovado"].includes(detalhe.aprovacaoStatus ?? "");
                        const isRecusada = ["recusada","recusado"].includes(detalhe.aprovacaoStatus ?? "");
                        return (
                          <>
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 z-10 ring-2 ring-white ${isAprovada ? "bg-emerald-100" : isRecusada ? "bg-red-100" : "bg-amber-100"}`}>
                        <ShieldCheck className={`h-3 w-3 ${isAprovada ? "text-emerald-600" : isRecusada ? "text-red-600" : "text-amber-600"}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-gray-900">
                          {isAprovada ? "Aprovada" : isRecusada ? "Recusada" : "Aguardando aprovação"}
                        </div>
                        <div className="text-[10px] text-gray-500 mt-0.5">
                          {detalhe.aprovadoEm && new Date(detalhe.aprovadoEm).toLocaleString("pt-BR")}
                          {detalhe.aprovadorNome && <span className="ml-1.5 text-emerald-600 font-medium">por {detalhe.aprovadorNome}</span>}
                          {!detalhe.aprovadorNome && !detalhe.aprovadoEm && <span className="text-amber-500 italic">Pendente</span>}
                        </div>
                      </div>
                          </>
                        );
                      })()}
                    </div>

                    {/* Cotações */}
                    {(detalhe.rastreio?.cotacoes ?? []).length > 0 ? (
                      (detalhe.rastreio.cotacoes as any[]).map((cot: any) => (
                        <div key={cot.id} className="flex items-start gap-3 relative">
                          <div className="w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center shrink-0 z-10 ring-2 ring-white">
                            <FileSearch className="h-3 w-3 text-purple-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold text-gray-900">
                              Cotação {cot.numeroCotacao}
                              <span className={`ml-2 text-[9px] px-1.5 py-0.5 rounded border ${cot.status === "finalizada" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : cot.status === "cancelada" ? "bg-red-50 text-red-600 border-red-200" : "bg-purple-50 text-purple-600 border-purple-200"}`}>
                                {cot.status === "finalizada" ? "Finalizada" : cot.status === "cancelada" ? "Cancelada" : cot.status === "em_andamento" ? "Em andamento" : cot.status}
                              </span>
                            </div>
                            <div className="text-[10px] text-gray-500 mt-0.5">
                              {new Date(cot.criadoEm).toLocaleString("pt-BR")}
                              {cot.total > 0 && <span className="ml-1.5 font-medium text-gray-700">R$ {cot.total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>}
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="flex items-start gap-3 relative">
                        <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center shrink-0 z-10 ring-2 ring-white">
                          <FileSearch className="h-3 w-3 text-gray-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-gray-400 italic">Nenhuma cotação vinculada</div>
                        </div>
                      </div>
                    )}

                    {/* Ordens de Compra */}
                    {(detalhe.rastreio?.ordens ?? []).length > 0 ? (
                      (detalhe.rastreio.ordens as any[]).map((oc: any) => (
                        <div key={oc.id} className="flex items-start gap-3 relative">
                          <div className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center shrink-0 z-10 ring-2 ring-white">
                            <ShoppingCart className="h-3 w-3 text-amber-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold text-gray-900">
                              OC {oc.numeroOc}
                              <span className={`ml-2 text-[9px] px-1.5 py-0.5 rounded border ${oc.status === "entregue" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : oc.status === "cancelada" ? "bg-red-50 text-red-600 border-red-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                                {oc.status === "entregue" ? "Entregue" : oc.status === "cancelada" ? "Cancelada" : oc.status === "parcial" ? "Entrega parcial" : oc.status === "aprovada" ? "Aprovada" : oc.status}
                              </span>
                            </div>
                            <div className="text-[10px] text-gray-500 mt-0.5">
                              {new Date(oc.criadoEm).toLocaleString("pt-BR")}
                              {oc.fornecedorNome && <span className="ml-1.5 text-gray-700">· Fornecedor: <b>{oc.fornecedorNome}</b></span>}
                            </div>
                            <div className="text-[10px] text-gray-500">
                              {oc.total > 0 && <span className="font-medium text-gray-700">R$ {oc.total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>}
                              {oc.aprovadorNome && <span className="ml-1.5 text-emerald-600">· Aprovada por {oc.aprovadorNome}</span>}
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="flex items-start gap-3 relative">
                        <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center shrink-0 z-10 ring-2 ring-white">
                          <ShoppingCart className="h-3 w-3 text-gray-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-gray-400 italic">Nenhuma OC vinculada</div>
                        </div>
                      </div>
                    )}

                    {/* Recebimentos */}
                    {(detalhe.rastreio?.recebimentos ?? []).length > 0 ? (
                      (detalhe.rastreio.recebimentos as any[]).map((rec: any) => (
                        <div key={rec.id} className="flex items-start gap-3 relative">
                          <div className="w-6 h-6 rounded-full bg-teal-100 flex items-center justify-center shrink-0 z-10 ring-2 ring-white">
                            <Truck className="h-3 w-3 text-teal-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold text-gray-900">
                              Recebimento {rec.numeroNf && `· NF ${rec.numeroNf}`}
                              <span className={`ml-2 text-[9px] px-1.5 py-0.5 rounded border ${rec.status === "conferido" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-teal-50 text-teal-700 border-teal-200"}`}>
                                {rec.status === "conferido" ? "Conferido" : rec.status === "divergencia" ? "Com divergência" : rec.status}
                              </span>
                            </div>
                            <div className="text-[10px] text-gray-500 mt-0.5">
                              {new Date(rec.criadoEm).toLocaleString("pt-BR")}
                              {rec.usuarioNome && <span className="ml-1.5 text-teal-600 font-medium">por {rec.usuarioNome}</span>}
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="flex items-start gap-3 relative">
                        <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center shrink-0 z-10 ring-2 ring-white">
                          <Truck className="h-3 w-3 text-gray-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-gray-400 italic">Nenhum recebimento registrado</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Itens */}
              <div className="space-y-2">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Itens</div>
                {(detalhe.itens as any[]).map((it: any) => {
                  const qtdTotal = parseFloat(it.quantidade);
                  const qtdAtend = parseFloat(it.quantidadeAtendida ?? "0");
                  const pct = qtdTotal > 0 ? Math.round((qtdAtend / qtdTotal) * 100) : 0;
                  return (
                    <div key={it.id} className="border border-gray-200 rounded-lg p-3 space-y-2 bg-gray-50">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-gray-900 text-sm font-medium">{it.descricao}</p>
                          <p className="text-gray-400 text-xs">{it.unidade || "un"} · Qtd: {qtdTotal.toLocaleString("pt-BR")}</p>
                          {it.semVerba && (
                            <div className="flex items-center gap-1.5 mt-1">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700 border border-red-200">SEM VERBA</span>
                              {it.motivoSemVerba && <span className="text-[9px] text-red-500 italic">{it.motivoSemVerba === "quebra_dano" ? "Quebra/Dano" : it.motivoSemVerba === "furto" ? "Furto" : it.motivoSemVerba === "erro_orcamento" ? "Erro Orçamento" : it.motivoSemVerba === "qtd_insuficiente" ? "Qtd Insuficiente" : it.motivoSemVerba === "retrabalho" ? "Retrabalho" : "Outro"}</span>}
                            </div>
                          )}
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded border ${it.statusItem === "recebido" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : it.statusItem === "recebido_parcial" ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-gray-100 text-gray-500 border-gray-200"}`}>
                          {it.statusItem === "recebido" ? "Recebido" : it.statusItem === "recebido_parcial" ? `Parcial (${pct}%)` : "Pendente"}
                        </span>
                      </div>
                      {qtdTotal > 0 && (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs text-gray-400">{qtdAtend}/{qtdTotal}</span>
                        </div>
                      )}
                      {!["aprovado"].includes(detalhe.status) && (
                        <div className="flex gap-2 items-center">
                          <Input
                            type="number" min="0" max={qtdTotal} step="0.01"
                            className="w-28 h-7 text-sm bg-white border-gray-300 text-gray-900"
                            placeholder={`Máx ${qtdTotal}`}
                            value={recebQtd[it.id] ?? ""}
                            onChange={e => setRecebQtd(p => ({ ...p, [it.id]: e.target.value }))}
                          />
                          <Button size="sm" variant="outline"
                            onClick={() => receber.mutate({ itemId: it.id, solicitacaoId: detalhe.id, quantidadeAtendida: parseFloat(recebQtd[it.id] ?? "0") || 0 })}
                            disabled={receber.isPending || !recebQtd[it.id]}
                            className="h-7 text-xs border-gray-300 text-gray-600 hover:bg-gray-50">
                            Registrar Recebimento
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Ações */}
              {detalhe.status === "cotacao" && (
                <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                  <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                  <span className="text-xs text-amber-700 font-medium">
                    Esta solicitação já possui cotação em andamento. Não é possível enviar novamente.
                  </span>
                </div>
              )}
              {!["cotacao", "cancelado"].includes(detalhe.status) && detalhe.aprovacaoStatus !== "aprovada" && (
                <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
                  <AlertTriangle className="h-4 w-4 text-blue-500 shrink-0" />
                  <span className="text-xs text-blue-700 font-medium">
                    Aguardando aprovação. Só é possível enviar para cotação após a aprovação da solicitação.
                  </span>
                </div>
              )}
              <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-200">
                {!["cotacao", "aprovado", "cancelado"].includes(detalhe.status) && detalhe.aprovacaoStatus === "aprovada" && (() => {
                  const scTipo = (detalhe as any).tipo || "material";
                  const tipoLabel = scTipo === "servico" ? "Mão de Obra" : scTipo === "pacote" ? "Pacote (Material + MDO)" : "Material";
                  const tipoCor = scTipo === "servico" ? "bg-purple-600 hover:bg-purple-500" : scTipo === "pacote" ? "bg-indigo-600 hover:bg-indigo-500" : "bg-blue-600 hover:bg-blue-500";
                  const tipoIcon = scTipo === "servico" || scTipo === "pacote" ? <Briefcase className="h-3 w-3" /> : <ShoppingCart className="h-3 w-3" />;
                  return (
                    <Button size="sm"
                      onClick={() => handleEnviarParaCotacao(scTipo === "pacote" ? "material" : scTipo)}
                      disabled={criarCotacao.isPending || (detalhe.itens as any[]).length === 0}
                      className={`${tipoCor} text-white text-xs gap-1.5`}>
                      {criarCotacao.isPending
                        ? <><Loader2 className="h-3 w-3 animate-spin" /> Criando cotação...</>
                        : <>{tipoIcon} Enviar para Cotação ({tipoLabel})</>}
                    </Button>
                  );
                })()}
                {!["cancelado"].includes(detalhe.status) && (
                  <Button size="sm" variant="outline"
                    onClick={() => {
                      const scTipo = (detalhe as any).tipo || "material";
                      setForm({
                        titulo: detalhe.titulo || "",
                        obraId: detalhe.obraId ? String(detalhe.obraId) : "",
                        dataNecessidade: detalhe.dataNecessidade || "",
                        prioridade: detalhe.prioridade || "normal",
                        observacoes: detalhe.observacoes || "",
                        tipo: scTipo,
                      });
                      if (detalhe.obraId) {
                        const obra = obrasQ.data?.find((o: any) => o.id === detalhe.obraId);
                        if (obra) setObraSearch(obra.nome || "");
                      }
                      const scItens = (detalhe.itens as any[]).map((it: any): ItemForm => ({
                        descricao: it.descricao || "",
                        unidade: it.unidade || "un",
                        quantidade: String(parseFloat(it.quantidade) || 1),
                        observacoes: it.observacoes || "",
                        orcamentoItemId: it.orcamentoItemId ?? undefined,
                        eapCodigo: it.eapCodigo ?? undefined,
                        insumoCodigo: it.insumoCodigo ?? undefined,
                        composicaoCodigo: it.composicaoCodigo ?? undefined,
                        precoMeta: it.precoMeta ? parseFloat(it.precoMeta) : undefined,
                        quantidadeServico: it.quantidadeServico ? parseFloat(it.quantidadeServico) : undefined,
                        coeficiente: it.coeficiente ? parseFloat(it.coeficiente) : undefined,
                        origemEap: it.origemEap ?? undefined,
                        incluirAjudante: it.incluirAjudante ?? true,
                        metaMdoProfissional: it.metaMdoProfissional ? parseFloat(it.metaMdoProfissional) : undefined,
                        metaMdoAjudante: it.metaMdoAjudante ? parseFloat(it.metaMdoAjudante) : undefined,
                      }));
                      setItens(scItens.length > 0 ? scItens : [newItem()]);
                      const eapIds = new Set<number>();
                      const eapQtd: Record<number, string> = {};
                      const ajudOverrides: Record<number, boolean> = {};
                      for (const it of (detalhe.itens as any[])) {
                        if (it.orcamentoItemId) {
                          const orcId = typeof it.orcamentoItemId === "string" ? parseInt(it.orcamentoItemId) : it.orcamentoItemId;
                          eapIds.add(orcId);
                          if (it.quantidadeServico) {
                            eapQtd[orcId] = String(parseFloat(it.quantidadeServico) || "");
                          }
                          if (it.incluirAjudante != null) {
                            ajudOverrides[orcId] = !!it.incluirAjudante;
                          }
                        }
                      }
                      setSelectedEapIds(eapIds);
                      setEapQtdServico(eapQtd);
                      setEditingOriginalEapIds(new Set(eapIds));
                      setIncluirAjudanteOverride(ajudOverrides);
                      const allAjud = Object.values(ajudOverrides);
                      if (allAjud.length > 0) setIncluirAjudanteGlobal(allAjud.every(v => v));
                      const hasEapItems = (detalhe.itens as any[]).some((it: any) => it.origemEap || it.orcamentoItemId);
                      setModoSC(hasEapItems ? "eap" : "manual");
                      setEditingSc({ id: detalhe.id, companyId: detalhe.companyId ?? companyId });
                      setShowDetalhe(null);
                      setShowNova(true);
                    }}
                    className="border-blue-200 text-blue-600 hover:bg-blue-50 text-xs gap-1">
                    <Pencil className="h-3 w-3" /> Editar
                  </Button>
                )}
                <Button size="sm" variant="outline"
                  onClick={() => duplicar.mutate({ id: detalhe.id, companyId })}
                  disabled={duplicar.isPending}
                  className="border-gray-300 text-gray-600 hover:bg-gray-50 text-xs gap-1">
                  <Copy className="h-3 w-3" /> Duplicar
                </Button>
                {!["cancelado", "aprovado"].includes(detalhe.status) && (
                  <Button size="sm" variant="outline"
                    onClick={() => cancelar.mutate({ id: detalhe.id, status: "cancelado" })}
                    disabled={cancelar.isPending}
                    className="border-gray-300 text-gray-600 hover:bg-gray-50 text-xs">
                    Cancelar SC
                  </Button>
                )}
                <Button size="sm" variant="outline"
                  onClick={() => excluir.mutate({ id: detalhe.id })}
                  disabled={excluir.isPending}
                  className="border-red-200 text-red-600 hover:bg-red-50 text-xs ml-auto gap-1">
                  <Trash2 className="h-3 w-3" /> Excluir
                </Button>
              </div>
            </>
          ) : (
            <div className="py-10 text-center space-y-2">
              <AlertTriangle className="h-6 w-6 text-yellow-500 mx-auto" />
              <p className="text-sm text-gray-600 font-medium">Solicitação não encontrada</p>
              <p className="text-xs text-gray-500">Os dados não puderam ser carregados.</p>
              <div className="flex gap-2 justify-center pt-1">
                <Button size="sm" variant="outline" onClick={() => detalheQ.refetch()} className="text-xs">Tentar novamente</Button>
                <Button size="sm" variant="outline" onClick={() => setShowDetalhe(null)} className="text-xs">Fechar</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={confirmExcluirLote} onOpenChange={setConfirmExcluirLote}>
        <DialogContent className="border-gray-200 max-w-md" style={{ background: '#ffffff', color: '#111827' }}>
          <DialogHeader>
            <DialogTitle className="text-gray-900">Confirmar Exclusão</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600 py-2">
            Tem certeza que deseja excluir <strong>{selectedSCIds.size}</strong> solicitação(ões)? Cotações vinculadas serão canceladas. SCs com OC em andamento não serão excluídas.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setConfirmExcluirLote(false)}>Cancelar</Button>
            <Button variant="destructive" className="gap-1.5" disabled={excluirLote.isPending} onClick={() => excluirLote.mutate({ ids: [...selectedSCIds], companyId })}>
              {excluirLote.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Excluir {selectedSCIds.size} SC(s)
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <ConfirmAprovDialog confirmAprov={confirmAprov} setConfirmAprov={setConfirmAprov} aprovar={aprovar} desaprovar={desaprovar} user={user} companyId={companyId} />
    </div>
    </DashboardLayout>
  );
}
