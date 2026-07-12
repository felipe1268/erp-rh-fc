import DashboardLayout from "@/components/DashboardLayout";
import { DraggableCommandBar } from "@/components/DraggableCommandBar";
import { ItemDescricaoInput } from "@/components/compras/ItemDescricaoInput";
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
import { normalizarTexto, stripAccents } from "@shared/textNormalization";
import { formatNumeroScDisplay, formatNumeroScShort } from "@shared/numeroSc";
import { formatNumeroCotacaoDisplay } from "@shared/numeroCotacao";
import { formatNumeroOcDisplay } from "@shared/numeroOc";
import {
  Plus, Search, Trash2, ClipboardList, ChevronRight, ChevronDown, Loader2,
  CheckCircle2, XCircle, Clock, Building2, ListTree, CalendarDays, ShoppingCart, AlertTriangle, Zap, FileText, Package,
  Camera, ImageIcon, X, Briefcase, History, ShoppingBag, Pencil, Copy, CheckSquare, FileDown,
  UserCircle, ShieldCheck, FileSearch, Truck, Users, Layers, ArrowRightLeft, Sparkles, RotateCw, Car, Link2, Film, Paperclip,
  Info, ArrowDown, ArrowUp, ArrowUpDown, HardHat, Warehouse, Wrench,
} from "lucide-react";

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  rascunho:  { label: "Rascunho",    cls: "bg-gray-100 text-gray-600 border-gray-200" },
  pendente:  { label: "Pendente",    cls: "bg-amber-50 text-amber-700 border-amber-200" },
  cotacao:   { label: "Em Cotação",  cls: "bg-blue-50 text-blue-700 border-blue-200" },
  aprovado:  { label: "Concluído",   cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  recusado:  { label: "Recusado",    cls: "bg-red-50 text-red-700 border-red-200" },
  cancelado: { label: "Cancelado",   cls: "bg-gray-100 text-gray-500 border-gray-200" },
  // Rev. 1693 — Status derivado (não persistido). Usado quando todas as OCs
  // vinculadas já foram entregues/recebidas e só o pagamento (financeiro)
  // está em aberto. Separa pendência logística de pendência financeira.
  aguardando_pagamento: { label: "Aguardando Pagamento", cls: "bg-violet-50 text-violet-700 border-violet-200" },
};

// Rev. 1693 — Deriva o status efetivo da SC para fins de badge visual.
// Se todas as OCs estão entregues mas o status cru ainda é pendente/cotacao/
// em_andamento (porque o pagamento não saiu), exibe "Aguardando Pagamento"
// em vez de "Pendente" — clareza para o usuário e separação clara entre
// pendência logística (entrega) e pendência financeira (pagamento).
function statusEfetivoSC(r: any): string {
  const st = String(r?.status ?? "");
  if (r?._ocsEntregues === true && ["pendente", "cotacao", "em_andamento"].includes(st)) {
    return "aguardando_pagamento";
  }
  return st;
}

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

function ManualEapLink({ eapItems, linkedEap, onLink, onLinkMultiple, onUnlink }: {
  eapItems: any[];
  linkedEap: any | null;
  onLink: (eapItem: any) => void;
  onLinkMultiple?: (eapItems: any[]) => void;
  onUnlink: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busca, setBusca] = useState("");
  const [picked, setPicked] = useState<Record<number, any>>({});

  if (linkedEap) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-emerald-50 border border-emerald-200 text-[10px]">
        <Link2 className="h-3 w-3 text-emerald-600 shrink-0" />
        <span className="text-emerald-800 font-medium truncate flex-1">
          Vinculado: <span className="font-bold">{linkedEap.eapCodigo}</span> — {linkedEap.descricao}
        </span>
        <button type="button" onClick={onUnlink} className="text-red-400 hover:text-red-600 shrink-0" title="Desvincular">
          <X className="h-3 w-3" />
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => { setOpen(true); setBusca(""); setPicked({}); }}
        className="flex items-center gap-1 px-2 py-1 text-[10px] text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded transition"
      >
        <Link2 className="h-3 w-3" /> Vincular a item(ns) da EAP (opcional)
      </button>
    );
  }

  const filtrados = eapItems.filter((e: any) =>
    !busca || stripAccents(`${e.eapCodigo} ${e.descricao}`.toLowerCase()).includes(stripAccents(busca.toLowerCase()))
  );
  const pickedCount = Object.keys(picked).length;
  const multiEnabled = !!onLinkMultiple;

  function confirmarMulti() {
    if (!onLinkMultiple) return;
    const arr = Object.values(picked);
    if (arr.length === 0) return;
    onLinkMultiple(arr);
    setOpen(false);
    setPicked({});
    setBusca("");
  }

  return (
    <div className="border border-amber-200 rounded-lg bg-amber-50/50 overflow-hidden">
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-amber-100">
        <Link2 className="h-3 w-3 text-amber-600 shrink-0" />
        <input
          autoFocus
          className="flex-1 text-[11px] bg-transparent outline-none text-gray-700 placeholder-gray-400"
          placeholder={multiEnabled ? "Buscar e marcar vários itens da EAP..." : "Buscar item da EAP..."}
          value={busca}
          onChange={e => setBusca(e.target.value)}
        />
        {multiEnabled && pickedCount > 0 && (
          <button
            type="button"
            onClick={confirmarMulti}
            className="px-2 py-0.5 text-[10px] font-bold rounded bg-amber-600 hover:bg-amber-500 text-white transition shrink-0"
            title="Adicionar todos os itens marcados"
          >
            + Adicionar {pickedCount}
          </button>
        )}
        <button type="button" onClick={() => { setOpen(false); setPicked({}); }} className="text-gray-400 hover:text-gray-600">
          <X className="h-3 w-3" />
        </button>
      </div>
      <div className="max-h-48 overflow-y-auto divide-y divide-amber-100">
        {filtrados.length === 0 ? (
          <div className="px-2 py-2 text-[10px] text-gray-400 text-center">Nenhum item encontrado</div>
        ) : filtrados.slice(0, 50).map((e: any) => {
          const isPicked = !!picked[e.id];
          return (
            <div
              key={e.id}
              className={`w-full text-left px-2 py-1.5 text-[10px] hover:bg-amber-100 transition flex items-center gap-1.5 ${isPicked ? "bg-amber-100" : ""}`}
            >
              {multiEnabled && (
                <input
                  type="checkbox"
                  checked={isPicked}
                  onChange={ev => {
                    setPicked(p => {
                      const n = { ...p };
                      if (ev.target.checked) n[e.id] = e;
                      else delete n[e.id];
                      return n;
                    });
                  }}
                  className="h-3 w-3 accent-amber-600 cursor-pointer shrink-0"
                  onClick={ev => ev.stopPropagation()}
                />
              )}
              <button
                type="button"
                onClick={() => { onLink(e); setOpen(false); setPicked({}); }}
                className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
                title="Clique para vincular este item (apenas)"
              >
                <span className="font-bold text-amber-700 shrink-0">{e.eapCodigo}</span>
                <span className="text-gray-700 truncate flex-1">{e.descricao}</span>
                {e.unidade && <span className="text-gray-400 shrink-0">{e.unidade}</span>}
              </button>
            </div>
          );
        })}
      </div>
      {multiEnabled && (
        <div className="px-2 py-1 bg-amber-50 border-t border-amber-100 text-[9px] text-amber-700 flex items-center justify-between gap-2">
          <span>Marque vários para inserir todos de uma vez. Clicar no nome vincula só ele.</span>
          {pickedCount > 0 && (
            <button type="button" onClick={() => setPicked({})} className="text-amber-600 hover:text-amber-800 underline shrink-0">
              limpar ({pickedCount})
            </button>
          )}
        </div>
      )}
    </div>
  );
}

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
          OC {formatNumeroOcDisplay(h.numeroOc)}
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

function DisciplinasModal({ open, onClose, orcamentoId, companyId, disciplinasQ, classificarMut, corrigirMut, renomearMut, onAddItem, itensNaSC }: {
  open: boolean; onClose: () => void; orcamentoId?: number; companyId: number;
  disciplinasQ: any; classificarMut: any; corrigirMut: any; renomearMut: any;
  onAddItem: (item: any, qtdOverride?: number) => void;
  itensNaSC?: string[];
}) {
  const [expandido, setExpandido] = useState<string | null>(null);
  const [editandoNome, setEditandoNome] = useState<string | null>(null);
  const [novoNome, setNovoNome] = useState("");
  const [moverItem, setMoverItem] = useState<{ id: number; eapCodigo: string; descricao: string; disciplinaOriginal: string } | null>(null);
  const [moverPara, setMoverPara] = useState("");
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [moverSelecionadosPara, setMoverSelecionadosPara] = useState("");
  const [showMoverSelecionados, setShowMoverSelecionados] = useState(false);
  const [qtdCustom, setQtdCustom] = useState<Record<string, string>>({});

  const data = disciplinasQ.data;
  const status = data?.status;
  const disciplinas = data?.disciplinas || [];
  const loading = disciplinasQ.isLoading || classificarMut.isPending;
  const scSet = useMemo(() => new Set(itensNaSC || []), [itensNaSC]);

  const progressoQ = trpc.compras.classificacaoProgresso.useQuery(
    { orcamentoId: orcamentoId!, companyId },
    { enabled: classificarMut.isPending && !!orcamentoId, refetchInterval: 2000 }
  );
  const prog = progressoQ.data;
  const progresso = classificarMut.isPending ? (prog?.percentual ?? 2) : 0;

  const allDisciplinaNames = disciplinas.map((d: any) => d.nome);

  const selKey = (disc: string, eap: string) => `${disc}||${eap}`;
  const parseSelKey = (k: string) => { const [disc, eap] = k.split("||"); return { disc, eap }; };

  const toggleItem = (disc: string, eap: string, saldo?: number) => {
    const k = selKey(disc, eap);
    setSelecionados(prev => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });
    if (!selecionados.has(k) && saldo !== undefined && !qtdCustom[k]) {
      setQtdCustom(prev => ({ ...prev, [k]: String(saldo > 0 ? saldo : 0) }));
    }
  };

  const toggleDisciplina = (disc: any) => {
    const keys = disc.itens.map((i: any) => selKey(disc.nome, i.eapCodigo));
    const allSelected = keys.every((k: string) => selecionados.has(k));
    setSelecionados(prev => {
      const n = new Set(prev);
      if (allSelected) { keys.forEach((k: string) => n.delete(k)); }
      else { keys.forEach((k: string) => n.add(k)); }
      return n;
    });
    if (!allSelected) {
      setQtdCustom(prev => {
        const n = { ...prev };
        disc.itens.forEach((i: any) => {
          const k = selKey(disc.nome, i.eapCodigo);
          if (!n[k]) n[k] = String(i.saldo > 0 ? i.saldo : 0);
        });
        return n;
      });
    }
  };

  const isDisciplinaAllSelected = (disc: any) => disc.itens.length > 0 && disc.itens.every((i: any) => selecionados.has(selKey(disc.nome, i.eapCodigo)));
  const isDisciplinaPartial = (disc: any) => disc.itens.some((i: any) => selecionados.has(selKey(disc.nome, i.eapCodigo))) && !isDisciplinaAllSelected(disc);

  const selecionadosInfo = () => {
    const items: { id: number; eapCodigo: string; descricao: string; disciplinaOriginal: string }[] = [];
    selecionados.forEach(k => {
      const { disc, eap } = parseSelKey(k);
      const d = disciplinas.find((dd: any) => dd.nome === disc);
      if (!d) return;
      const item = d.itens.find((i: any) => i.eapCodigo === eap);
      if (item) items.push({ id: item.id, eapCodigo: item.eapCodigo, descricao: item.descricao, disciplinaOriginal: disc });
    });
    return items;
  };

  const disciplinasComSelecionados = () => {
    const discs = new Set<string>();
    selecionados.forEach(k => { discs.add(parseSelKey(k).disc); });
    return Array.from(discs);
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent resizable={false} className="!max-w-none !w-[100vw] !h-[100vh] !max-h-[100vh] overflow-y-auto !rounded-none !m-0 !p-6 !top-0 !left-0 !translate-x-0 !translate-y-0">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Layers className="h-5 w-5 text-violet-600" />
            Visão por Disciplina
          </DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
            <p className="text-sm text-gray-500">{classificarMut.isPending ? "IA classificando serviços..." : "Carregando..."}</p>
            {classificarMut.isPending && prog && (
              <div className="w-80">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-violet-600 font-medium">
                    {prog.etapa}
                  </span>
                  <span className="text-xs text-violet-600 font-semibold">{progresso}%</span>
                </div>
                <div className="h-3 bg-violet-100 rounded-full overflow-hidden relative">
                  <div className="h-full bg-gradient-to-r from-violet-500 to-violet-600 rounded-full transition-all duration-1000 ease-out" style={{ width: `${progresso}%` }} />
                </div>
                <div className="flex items-center justify-between mt-1.5">
                  <p className="text-[10px] text-gray-400">
                    Lote {prog.loteAtual} de {prog.totalLotes}
                  </p>
                  <p className="text-[10px] text-gray-400">
                    {prog.itensProcessados.toLocaleString("pt-BR")} / {prog.totalItens.toLocaleString("pt-BR")} itens
                  </p>
                </div>
                {prog.totalLotes > 1 && (
                  <div className="flex gap-1 mt-2 justify-center">
                    {Array.from({ length: prog.totalLotes }, (_, i) => (
                      <div key={i} className={`h-1.5 rounded-full transition-all duration-500 ${
                        i < prog.loteAtual ? "bg-violet-500" : i === prog.loteAtual ? "bg-violet-300 animate-pulse" : "bg-gray-200"
                      }`} style={{ width: `${Math.max(100 / prog.totalLotes, 6)}%`, maxWidth: 24, minWidth: 6 }} />
                    ))}
                  </div>
                )}
              </div>
            )}
            {classificarMut.isPending && !prog && (
              <div className="w-80">
                <div className="h-3 bg-violet-100 rounded-full overflow-hidden">
                  <div className="h-full bg-violet-300 rounded-full animate-pulse" style={{ width: "15%" }} />
                </div>
                <p className="text-[10px] text-gray-400 mt-1.5 text-center">Preparando classificação...</p>
              </div>
            )}
          </div>
        )}

        {!loading && disciplinasQ.isError && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <XCircle className="h-10 w-10 text-red-400" />
            <p className="text-sm text-red-600">{disciplinasQ.error?.message || "Erro ao carregar disciplinas"}</p>
            <Button variant="outline" size="sm" onClick={() => disciplinasQ.refetch()}>Tentar novamente</Button>
          </div>
        )}

        {!loading && !disciplinasQ.isError && status === "no_db" && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <XCircle className="h-10 w-10 text-red-400" />
            <p className="text-sm text-red-600">Banco de dados indisponível. Tente novamente mais tarde.</p>
          </div>
        )}

        {!loading && !disciplinasQ.isError && status === "nao_classificado" && (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <Sparkles className="h-12 w-12 text-violet-400" />
            <div className="text-center">
              <p className="text-sm font-medium text-gray-700">Serviços ainda não classificados por disciplina</p>
              <p className="text-xs text-gray-500 mt-1">A IA vai analisar os serviços do orçamento e agrupá-los por disciplina construtiva</p>
            </div>
            <Button
              onClick={() => orcamentoId && classificarMut.mutate({ orcamentoId, companyId })}
              className="bg-violet-600 hover:bg-violet-700 gap-2"
            >
              <Sparkles className="h-4 w-4" /> Classificar com IA
            </Button>
          </div>
        )}

        {!loading && status === "ok" && disciplinas.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <p className="text-xs text-gray-500">
                  {disciplinas.length} disciplina{disciplinas.length > 1 ? "s" : ""} · {disciplinas.reduce((s: number, d: any) => s + d.totalItens, 0)} serviços classificados
                </p>
                {(() => {
                  const totalItens = disciplinas.reduce((s: number, d: any) => s + d.itens.length, 0);
                  const allKeys = disciplinas.flatMap((d: any) => d.itens.map((i: any) => selKey(d.nome, i.eapCodigo)));
                  const allSel = totalItens > 0 && allKeys.every((k: string) => selecionados.has(k));
                  return (
                    <button
                      type="button"
                      onClick={() => {
                        if (allSel) { setSelecionados(new Set()); }
                        else { setSelecionados(new Set(allKeys)); }
                      }}
                      className="text-xs text-violet-600 hover:text-violet-800 font-medium hover:underline"
                    >
                      {allSel ? "Desmarcar todos" : "Selecionar todos"}
                    </button>
                  );
                })()}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => orcamentoId && classificarMut.mutate({ orcamentoId, companyId, force: true })}
                disabled={classificarMut.isPending}
                className="text-xs gap-1.5"
              >
                <RotateCw className="h-3 w-3" /> Reclassificar
              </Button>
            </div>

            {disciplinas.map((disc: any) => {
              const isOpen = expandido === disc.nome;
              const discAllSel = isDisciplinaAllSelected(disc);
              const discPartial = isDisciplinaPartial(disc);
              const discNaSC = disc.itens.filter((i: any) => scSet.has(i.eapCodigo)).length;
              const discTodosNaSC = discNaSC > 0 && discNaSC === disc.itens.length;
              return (
                <div key={disc.nome} className={`border rounded-lg overflow-hidden ${discTodosNaSC ? "border-emerald-300 bg-emerald-50/40" : ""}`}>
                  <div className={`w-full flex items-center justify-between px-4 py-3 transition-colors ${discTodosNaSC ? "bg-emerald-50 hover:bg-emerald-100" : "bg-gray-50 hover:bg-gray-100"}`}>
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={discAllSel}
                        ref={el => { if (el) el.indeterminate = discPartial; }}
                        onChange={() => toggleDisciplina(disc)}
                        className="h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500 cursor-pointer accent-violet-600"
                        onClick={e => e.stopPropagation()}
                      />
                      <button type="button" onClick={() => setExpandido(isOpen ? null : disc.nome)} className="flex items-center gap-2">
                        {isOpen ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                      </button>
                      {editandoNome === disc.nome ? (
                        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                          <input
                            className="text-sm font-medium border rounded px-2 py-0.5 w-48"
                            value={novoNome}
                            onChange={e => setNovoNome(e.target.value)}
                            autoFocus
                            onKeyDown={e => {
                              if (e.key === "Enter" && novoNome.trim() && novoNome !== disc.nome) {
                                renomearMut.mutate({ companyId, orcamentoId: orcamentoId!, nomeAtual: disc.nome, nomeNovo: novoNome.trim() });
                                setEditandoNome(null);
                              }
                              if (e.key === "Escape") setEditandoNome(null);
                            }}
                          />
                          <button type="button" onClick={() => {
                            if (novoNome.trim() && novoNome !== disc.nome) {
                              renomearMut.mutate({ companyId, orcamentoId: orcamentoId!, nomeAtual: disc.nome, nomeNovo: novoNome.trim() });
                            }
                            setEditandoNome(null);
                          }} className="text-emerald-600 hover:text-emerald-700"><CheckCircle2 className="h-4 w-4" /></button>
                          <button type="button" onClick={() => setEditandoNome(null)} className="text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-800">{disc.nome}</span>
                          <button type="button" onClick={e => { e.stopPropagation(); setEditandoNome(disc.nome); setNovoNome(disc.nome); }} className="text-gray-400 hover:text-gray-600">
                            <Pencil className="h-3 w-3" />
                          </button>
                          {discTodosNaSC ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-100 border border-emerald-200 rounded-full px-2 py-0.5">
                              <CheckCircle2 className="h-3 w-3" /> Todos na SC
                            </span>
                          ) : discNaSC > 0 ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                              {discNaSC}/{disc.itens.length} na SC
                            </span>
                          ) : null}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-500">{disc.totalItens} ite{disc.totalItens > 1 ? "ns" : "m"}</span>
                      <div className="flex items-center gap-1.5">
                        {disc.contratados > 0 && <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">{disc.contratados} contratado{disc.contratados > 1 ? "s" : ""}</span>}
                        {disc.comSaldo > 0 && <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">{disc.comSaldo} parcial</span>}
                        {disc.semContrato > 0 && <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700">{disc.semContrato} s/ contrato</span>}
                      </div>
                      <div className="w-16 bg-gray-200 rounded-full h-2">
                        <div className="bg-violet-500 h-2 rounded-full transition-all" style={{ width: `${disc.pctContratado}%` }} />
                      </div>
                      <span className="text-xs font-medium text-gray-600 w-8 text-right">{disc.pctContratado}%</span>
                    </div>
                  </div>

                  {isOpen && (
                    <div className="divide-y">
                      {disc.itens.map((item: any) => {
                        const jaNaSC = scSet.has(item.eapCodigo);
                        const temSCExistente = item.scs && item.scs.length > 0;
                        const isContratado = item.status === "contratado";
                        return (
                        <div key={item.id} className={`px-4 py-2 hover:bg-gray-50 text-xs ${isContratado ? "bg-amber-50/50 border-l-[3px] border-l-amber-400" : jaNaSC ? "bg-emerald-50/60" : ""}`}>
                          <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={selecionados.has(selKey(disc.nome, item.eapCodigo))}
                                onChange={() => toggleItem(disc.nome, item.eapCodigo, item.saldo)}
                                className="h-3.5 w-3.5 rounded border-gray-300 text-violet-600 focus:ring-violet-500 cursor-pointer accent-violet-600 shrink-0"
                              />
                              <code className="text-violet-700 font-mono text-[10px] bg-violet-50 px-1.5 py-0.5 rounded">{item.eapCodigo}</code>
                              <span className="truncate text-gray-700">{item.descricao}</span>
                              {jaNaSC && <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-emerald-700 bg-emerald-100 rounded px-1.5 py-0.5 shrink-0">Na SC atual</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-3 ml-2 shrink-0">
                            <span className="text-gray-500">{item.unidade}</span>
                            <span className="text-gray-600 font-medium w-14 text-right">{item.qtdOrcada}</span>
                            {item.qtdSolicitada > 0 && <span className="text-amber-600 w-14 text-right">Sol: {item.qtdSolicitada}</span>}
                            <span className={`w-14 text-right font-medium ${item.saldo > 0 ? "text-emerald-600" : item.saldo < 0 ? "text-red-600" : "text-gray-400"}`}>
                              {item.saldo > 0 ? `+${item.saldo}` : item.saldo}
                            </span>
                            {selecionados.has(selKey(disc.nome, item.eapCodigo)) && item.saldo > 0 && (
                              <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                <span className="text-[10px] text-gray-500">Qtd:</span>
                                <input
                                  type="number"
                                  min={0}
                                  max={item.saldo}
                                  step="any"
                                  value={qtdCustom[selKey(disc.nome, item.eapCodigo)] ?? String(item.saldo)}
                                  onChange={e => setQtdCustom(prev => ({ ...prev, [selKey(disc.nome, item.eapCodigo)]: e.target.value }))}
                                  className="w-16 h-6 px-1.5 text-xs text-right border border-violet-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-violet-500"
                                />
                              </div>
                            )}
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              item.status === "contratado" ? "bg-emerald-100 text-emerald-700" :
                              item.status === "parcial" ? "bg-amber-100 text-amber-700" :
                              "bg-red-100 text-red-700"
                            }`}>
                              {item.status === "contratado" ? "Contratado" : item.status === "parcial" ? "Parcial" : "S/ Contrato"}
                            </span>
                            {item.classificadoPor === "ia" && <span className="text-violet-400" title="Classificado por IA"><Sparkles className="h-3 w-3" /></span>}
                            <button
                              type="button"
                              onClick={() => setMoverItem({ id: item.id, eapCodigo: item.eapCodigo, descricao: item.descricao, disciplinaOriginal: disc.nome })}
                              className="text-gray-400 hover:text-violet-600" title="Mover para outra disciplina"
                            >
                              <ArrowRightLeft className="h-3.5 w-3.5" />
                            </button>
                            {item.status !== "contratado" && item.saldo > 0 && (
                              jaNaSC ? (
                                <span className="text-emerald-500 flex items-center gap-0.5 font-medium"><CheckCircle2 className="h-3 w-3" /></span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const k = selKey(disc.nome, item.eapCodigo);
                                    const customQtd = qtdCustom[k] ? parseFloat(qtdCustom[k]) : undefined;
                                    onAddItem(item, customQtd && customQtd > 0 ? customQtd : undefined);
                                  }}
                                  className="text-violet-600 hover:text-violet-800 font-medium flex items-center gap-0.5"
                                >
                                  <Plus className="h-3 w-3" /> SC
                                </button>
                              )
                            )}
                          </div>
                          </div>
                          {temSCExistente && (
                            <div className="ml-10 mt-1 mb-1 flex flex-wrap items-center gap-1.5">
                              <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
                              <span className="text-[10px] text-amber-700 font-medium">Já solicitado:</span>
                              {item.scs.map((sc: any) => (
                                <span key={sc.scId} className="inline-flex items-center gap-1 text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-200 rounded px-1.5 py-0.5" title={`Qtd: ${sc.qtd} · Status: ${sc.status}`}>
                                  {formatNumeroScDisplay(sc.numeroSc)} <span className="text-amber-600 font-normal">({sc.qtd} {item.unidade})</span>
                                </span>
                              ))}
                              {isContratado && <span className="text-[10px] text-red-600 font-bold ml-1">ESCOPO 100% CONTRATADO</span>}
                            </div>
                          )}
                        </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {selecionados.size > 0 && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-violet-700 text-white rounded-xl shadow-2xl px-5 py-3 flex items-center gap-4 animate-in slide-in-from-bottom-4">
            <span className="text-sm font-medium">{selecionados.size} ite{selecionados.size > 1 ? "ns" : "m"} selecionado{selecionados.size > 1 ? "s" : ""}</span>
            <Button size="sm" variant="secondary" className="bg-emerald-500 hover:bg-emerald-400 text-white border-0 gap-1.5 text-xs font-semibold" onClick={() => {
              let added = 0;
              let skippedContratado = 0;
              selecionadosInfo().forEach(i => {
                if (scSet.has(i.eapCodigo)) return;
                const d = disciplinas.find((dd: any) => dd.nome === i.disciplinaOriginal);
                const item = d?.itens?.find((it: any) => it.eapCodigo === i.eapCodigo);
                if (item && item.status === "contratado") { skippedContratado++; return; }
                if (item && item.saldo > 0) {
                  const k = selKey(i.disciplinaOriginal, i.eapCodigo);
                  const customQtd = qtdCustom[k] ? parseFloat(qtdCustom[k]) : undefined;
                  const qtdFinal = customQtd && customQtd > 0 ? customQtd : undefined;
                  onAddItem(item, qtdFinal);
                  added++;
                }
              });
              if (skippedContratado > 0) toast.warning(`${skippedContratado} ite${skippedContratado > 1 ? "ns" : "m"} ignorado${skippedContratado > 1 ? "s" : ""} — escopo já 100% contratado em outra(s) SC`);
              if (added === 0 && skippedContratado === 0) toast.info("Nenhum item novo para adicionar (já estão na SC ou sem saldo)");
              else if (added > 0) toast.success(`${added} ite${added > 1 ? "ns" : "m"} adicionado${added > 1 ? "s" : ""} à SC`);
              setSelecionados(new Set()); setQtdCustom({});
            }}>
              <Plus className="h-3.5 w-3.5" /> Adicionar à SC ({(() => {
                const info = selecionadosInfo();
                return info.filter(i => {
                  if (scSet.has(i.eapCodigo)) return false;
                  const d = disciplinas.find((dd: any) => dd.nome === i.disciplinaOriginal);
                  const item = d?.itens?.find((it: any) => it.eapCodigo === i.eapCodigo);
                  return item && item.status !== "contratado" && item.saldo > 0;
                }).length;
              })()})
            </Button>
            <Button size="sm" variant="secondary" className="bg-white/20 hover:bg-white/30 text-white border-0 gap-1.5 text-xs" onClick={() => { setShowMoverSelecionados(true); setMoverSelecionadosPara(""); }}>
              <ArrowRightLeft className="h-3.5 w-3.5" /> Mover disciplina
            </Button>
            <button type="button" onClick={() => setSelecionados(new Set())} className="text-white/70 hover:text-white ml-1" title="Limpar seleção">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {showMoverSelecionados && (
          <Dialog open={showMoverSelecionados} onOpenChange={() => { setShowMoverSelecionados(false); setMoverSelecionadosPara(""); }}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle className="text-sm">Mover {selecionados.size} ite{selecionados.size > 1 ? "ns" : "m"} para outra disciplina</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="max-h-32 overflow-y-auto text-xs text-gray-600 space-y-0.5">
                  {selecionadosInfo().slice(0, 10).map(i => (
                    <p key={i.eapCodigo} className="truncate"><code className="text-violet-600">{i.eapCodigo}</code> {i.descricao}</p>
                  ))}
                  {selecionados.size > 10 && <p className="text-gray-400">...e mais {selecionados.size - 10}</p>}
                </div>
                <div>
                  <Label className="text-xs">Mover todos para:</Label>
                  <Select value={moverSelecionadosPara} onValueChange={setMoverSelecionadosPara}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione a disciplina" /></SelectTrigger>
                    <SelectContent>
                      {allDisciplinaNames.map((n: string) => (
                        <SelectItem key={n} value={n}>{n}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => { setShowMoverSelecionados(false); setMoverSelecionadosPara(""); }}>Cancelar</Button>
                  <Button size="sm" disabled={!moverSelecionadosPara || corrigirMut.isPending} className="bg-violet-600 hover:bg-violet-700" onClick={() => {
                    const itens = selecionadosInfo()
                      .filter(i => i.disciplinaOriginal !== moverSelecionadosPara)
                      .map(i => ({ id: i.id, eapCodigo: i.eapCodigo, descricao: i.descricao, disciplinaOriginal: i.disciplinaOriginal, disciplinaNova: moverSelecionadosPara }));
                    if (itens.length > 0) corrigirMut.mutate({ companyId, orcamentoId: orcamentoId!, itens });
                    setShowMoverSelecionados(false); setMoverSelecionadosPara(""); setSelecionados(new Set());
                  }}>Mover {selecionados.size}</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}

        {moverItem && (
          <Dialog open={!!moverItem} onOpenChange={() => setMoverItem(null)}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle className="text-sm">Mover para outra disciplina</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Item: <span className="font-medium text-gray-700">{moverItem.eapCodigo}</span></p>
                  <p className="text-xs text-gray-600 truncate">{moverItem.descricao}</p>
                  <p className="text-xs text-gray-400 mt-1">De: <span className="font-medium">{moverItem.disciplinaOriginal}</span></p>
                </div>
                <div>
                  <Label className="text-xs">Mover para:</Label>
                  <Select value={moverPara} onValueChange={setMoverPara}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione a disciplina" /></SelectTrigger>
                    <SelectContent>
                      {allDisciplinaNames.filter((n: string) => n !== moverItem.disciplinaOriginal).map((n: string) => (
                        <SelectItem key={n} value={n}>{n}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => { setMoverItem(null); setMoverPara(""); }}>Cancelar</Button>
                  <Button size="sm" disabled={!moverPara || corrigirMut.isPending} className="bg-violet-600 hover:bg-violet-700" onClick={() => {
                    corrigirMut.mutate({
                      companyId, orcamentoId: orcamentoId!,
                      itens: [{ id: moverItem.id, eapCodigo: moverItem.eapCodigo, descricao: moverItem.descricao, disciplinaOriginal: moverItem.disciplinaOriginal, disciplinaNova: moverPara }],
                    });
                    setMoverItem(null); setMoverPara("");
                  }}>Mover</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </DialogContent>
    </Dialog>
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
                        const insumosComp = (item as any).insumos as Array<{ insumoCodigo: string; descricao: string; unidade: string | null; coeficiente: number; qtdCalculada: number }> | undefined;
                        const hasInsumos = insumosComp && insumosComp.length > 0;
                        return (
                          <React.Fragment key={item.id}>
                          <tr className={`border-b border-gray-100 hover:bg-gray-50/80 transition-colors ${rowBg}`}>
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
                          {hasInsumos && (
                            <tr className="border-b border-gray-100">
                              <td colSpan={6} className="px-0 py-0">
                                <div className="ml-6 mr-2 my-1.5 rounded border border-gray-200 bg-gray-50/80 overflow-hidden">
                                  <div className="px-2 py-1 bg-gray-100 border-b border-gray-200">
                                    <span className="text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Insumos da composição nesta SC</span>
                                  </div>
                                  <table className="w-full">
                                    <tbody>
                                      {insumosComp!.map(ins => (
                                        <tr key={ins.insumoCodigo} className="border-b border-gray-100 last:border-b-0">
                                          <td className="px-2 py-1 text-[10px] text-gray-400 font-mono w-20">{ins.insumoCodigo}</td>
                                          <td className="px-2 py-1 text-[10px] text-gray-700">{ins.descricao}</td>
                                          <td className="px-1 py-1 text-[10px] text-gray-500 text-center w-10">{ins.unidade ?? "—"}</td>
                                          <td className="px-1 py-1 text-[10px] text-gray-500 text-right w-14 tabular-nums" title={`Coef: ${ins.coeficiente}`}>{fmt(ins.qtdCalculada)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </td>
                            </tr>
                          )}
                          </React.Fragment>
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
                    aprovar.mutate({ id: confirmAprov.id, aprovacaoStatus: confirmAprov.key, aprovadorId: user?.id ? parseInt(String(user.id)) : undefined, aprovadorNome: user?.nome || user?.name || undefined });
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
  // Rev. 1734 — Filtro derivado do card "Status das Solicitações" (9 mini-blocos clicáveis)
  const [filtroBreakdown, setFiltroBreakdown] = useState<string | null>(null);
  const [filtroObra, setFiltroObra] = useState("todas");
  const [filtroClassificacao, setFiltroClassificacao] = useState("todas");
  // Rev. 3276 — Filtro por período (Data postada = criadoEm). Vazio = sem restrição.
  const [filtroDataDe, setFiltroDataDe] = useState("");
  const [filtroDataAte, setFiltroDataAte] = useState("");
  // Rev. 2089 — Ordenação clicável por coluna. Default: criadoEm DESC (mais recentes primeiro).
  type SortKey = "criadoEm" | "tipo" | "prioridade" | "status" | "numeroSc" | "titulo" | "obra" | "solicitante" | "dataNecessidade";
  const [sortKey, setSortKey] = useState<SortKey>("criadoEm");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  function toggleSort(k: SortKey) {
    if (sortKey === k) {
      setSortDir(d => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(k);
      // Defaults sensatos: datas/número DESC (mais recente/maior primeiro), textos ASC.
      setSortDir(["criadoEm", "numeroSc", "dataNecessidade"].includes(k) ? "desc" : "asc");
    }
  }
  const [showNova, setShowNova] = useState(false);
  const [confirmFecharNova, setConfirmFecharNova] = useState(false);
  const [showDisciplinas, setShowDisciplinas] = useState(false);
  const [showDetalhe, setShowDetalhe] = useState<number | null>(null);
  const [abaScDetalhe, setAbaScDetalhe] = useState<"detalhes" | "cotacao" | "oc">("detalhes");
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
    tipo: "material" as "material" | "servico" | "pacote" | "equipamento" | "pecas_veiculo",
    incluirEquipamentos: false,
    vehicleId: "" as string,
    // Rev. 2290 — Locação (só relevante p/ tipo=equipamento).
    isLocacao: false,
    locacaoDuracaoDias: "" as string,
    locacaoDataInicioPrevista: "" as string,
    locacaoDataFimPrevista: "" as string,
  });
  const [obraSearch, setObraSearch] = useState("");
  const [obraOpen, setObraOpen] = useState(false);
  const obraRef = useRef<HTMLDivElement>(null);
  const [veiculoSearch, setVeiculoSearch] = useState("");
  const [veiculoOpen, setVeiculoOpen] = useState(false);
  const veiculoRef = useRef<HTMLDivElement>(null);
  const [itens, setItens] = useState<ItemForm[]>([newItem()]);
  const [recebQtd, setRecebQtd] = useState<Record<number, string>>({});
  const [selectedEapIds, setSelectedEapIds] = useState<Set<number>>(new Set());
  const [eapSearch, setEapSearch] = useState("");
  const [eapLegendFilter, setEapLegendFilter] = useState<string | null>(null);
  const [modoSC, setModoSC] = useState<"eap" | "manual" | "insumo">("eap");
  const [insumoBusca, setInsumoBusca] = useState("");
  const [insumoQtds, setInsumoQtds] = useState<Record<string, string>>({});
  const [insumoExpanded, setInsumoExpanded] = useState<string | null>(null);
  const [eapExpanded, setEapExpanded] = useState<number | null>(null);
  const [eapTreeCollapsed, setEapTreeCollapsed] = useState<Set<string>>(new Set());
  const [eapQtdServico, setEapQtdServico] = useState<Record<number, string>>({});
  const [eapInsumos, setEapInsumos] = useState<Record<number, any[]>>({});
  const [eapExtraDesbloqueado, setEapExtraDesbloqueado] = useState<Record<string, boolean>>({});
  const [eapInsumoSel, setEapInsumoSel] = useState<Record<string, boolean>>({});
  const [eapInsumoQtdManual, setEapInsumoQtdManual] = useState<Record<string, string>>({});
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
  const [pendingAnexos, setPendingAnexos] = useState<{ url?: string; nome: string; tipo: string; ts: number; base64?: string; preview?: string }[]>([]);
  const [anexoDragOver, setAnexoDragOver] = useState(false);
  const [selectedSCIds, setSelectedSCIds] = useState<Set<number>>(new Set());
  const [confirmExcluirLote, setConfirmExcluirLote] = useState(false);
  const [excluirProgress, setExcluirProgress] = useState<{ total: number; done: number; errors: string[]; running: boolean } | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState<{ titulo: string; prioridade: string; dataNecessidade: string; observacoes: string } | null>(null);
  const [editItens, setEditItens] = useState<any[]>([]);
  const [editingSc, setEditingSc] = useState<{ id: number; companyId: number } | null>(null);
  const [editingOriginalEapIds, setEditingOriginalEapIds] = useState<Set<number>>(new Set());
  const [sugestaoEap, setSugestaoEap] = useState<string | null>(null);
  const [sugestaoAberta, setSugestaoAberta] = useState(false);

  const q = trpc.compras.listarSolicitacoes.useQuery(
    { companyId, busca: busca || undefined, status: (filtroStatus === "todos" || filtroStatus === "pendente_oc" || filtroStatus === "pendente_entrega") ? undefined : filtroStatus },
    { enabled: companyId > 0 }
  );
  const qTodas = trpc.compras.listarSolicitacoes.useQuery(
    { companyId },
    { enabled: companyId > 0 && filtroStatus !== "todos" }
  );
  const detalheQ = trpc.compras.getSolicitacao.useQuery({ id: showDetalhe! }, { enabled: showDetalhe !== null });
  const detalhe = detalheQ.data;
  const scCotacaoId = (detalhe?.rastreio?.cotacoes as any[])?.[0]?.id ?? null;
  const scOcId = (detalhe?.rastreio?.ordens as any[])?.[0]?.id ?? null;
  const scCotacaoQ = trpc.compras.getCotacao.useQuery({ id: scCotacaoId! }, { enabled: scCotacaoId !== null && abaScDetalhe === "cotacao" });
  const scMapaQ = trpc.compras.getMapaCotacao.useQuery({ cotacaoId: scCotacaoId! }, { enabled: scCotacaoId !== null && abaScDetalhe === "cotacao" });
  // Rev. 2806 — Cobertura de itens da SC (quantos já estão em cotação) + "cotar restantes"
  const coberturaScQ = trpc.compras.getCoberturaSolicitacao.useQuery({ solicitacaoId: showDetalhe! }, { enabled: showDetalhe !== null });
  const cotarRestantesMut = trpc.compras.cotarItensRestantes.useMutation({
    onSuccess: (data: any) => {
      toast.success(`Nova cotação ${data.nova.numeroCotacao} criada com ${data.itens} ${data.itens === 1 ? "item restante" : "itens restantes"}.`);
      detalheQ.refetch(); q.refetch(); coberturaScQ.refetch();
    },
    onError: (e) => toast.error(e.message),
  });
  useEffect(() => {
    if (abaScDetalhe === "cotacao" && !scCotacaoId) setAbaScDetalhe("detalhes");
    if (abaScDetalhe === "oc" && !scOcId) setAbaScDetalhe("detalhes");
  }, [abaScDetalhe, scCotacaoId, scOcId]);
  const obrasQ = trpc.obras.listActive.useQuery({ companyId }, { enabled: companyId > 0 });
  const veiculosQ = trpc.frotas.listVehicles.useQuery({ companyId }, { enabled: companyId > 0, staleTime: 600000 });
  const eapQ = trpc.compras.getEapParaObra.useQuery(
    { obraId: parseInt(form.obraId), companyId },
    { enabled: !!form.obraId && parseInt(form.obraId) > 0 }
  );

  const insumosConsolidadosQ = trpc.compras.getInsumosConsolidados.useQuery(
    { companyId, obraId: parseInt(form.obraId), busca: modoSC === "insumo" ? (insumoBusca || undefined) : undefined, tipoSC: (form.tipo === "pecas_veiculo" ? "material" : form.tipo) as "material" | "servico" | "pacote" | "equipamento", incluirEquip: form.incluirEquipamentos },
    { enabled: (modoSC === "insumo" || modoSC === "eap") && !!form.obraId && parseInt(form.obraId) > 0 && companyId > 0, staleTime: 30_000 }
  );

  const sugestoesContratQ = trpc.compras.getSugestoesContratacao.useQuery(
    { companyId, obraId: parseInt(form.obraId), eapCodigoSelecionado: sugestaoEap!, tipo: form.tipo },
    { enabled: !!sugestaoEap && !!form.obraId && parseInt(form.obraId) > 0 && companyId > 0 && form.tipo === "servico", staleTime: 60_000 }
  );

  const orcIdParaDisciplina = eapQ.data?.orcamentoId as number | undefined;
  const disciplinasQ = trpc.compras.getDisciplinas.useQuery(
    { orcamentoId: orcIdParaDisciplina!, companyId },
    { enabled: showDisciplinas && !!orcIdParaDisciplina && companyId > 0, staleTime: 30_000 }
  );
  const classificarMut = trpc.compras.classificarDisciplinas.useMutation({
    onSuccess: (r) => {
      if (r.status === "ok") {
        toast.success(`Classificação concluída: ${r.total} itens em ${r.disciplinas} disciplinas`);
        disciplinasQ.refetch();
      } else {
        toast.info(r.msg || "Já classificado");
      }
    },
    onError: (e) => toast.error(e.message),
  });
  const corrigirMut = trpc.compras.corrigirDisciplina.useMutation({
    onSuccess: () => { toast.success("Disciplina corrigida!"); disciplinasQ.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const renomearMut = trpc.compras.renomearDisciplina.useMutation({
    onSuccess: () => { toast.success("Disciplina renomeada!"); disciplinasQ.refetch(); },
    onError: (e) => toast.error(e.message),
  });

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

  const conversaoManualInput = useMemo(() => {
    return itens
      .filter(it => it.descricao.trim().length >= 3)
      .slice(0, 50)
      .map(it => ({
        descricao: it.descricao.trim(),
        unidade: it.unidade || "un",
        quantidade: parseFloat(it.quantidade) || 1,
      }));
  }, [itens]);

  const conversaoManualQ = trpc.compras.getConversaoComercial.useQuery(
    { insumos: conversaoManualInput },
    { enabled: conversaoManualInput.length > 0, staleTime: 5 * 60_000 }
  );

  const conversaoManualMap = useMemo(() => {
    const map: Record<string, { embalagem: string; fator: number }> = {};
    if (!conversaoManualQ.data) return map;
    for (let i = 0; i < conversaoManualQ.data.length; i++) {
      const item = conversaoManualQ.data[i];
      if (item.conversao && conversaoManualInput[i]) {
        const key = `${conversaoManualInput[i].descricao.toLowerCase().trim()}|${conversaoManualInput[i].unidade.toLowerCase().trim()}`;
        map[key] = { embalagem: item.conversao.embalagem, fator: item.conversao.fator };
      }
    }
    return map;
  }, [conversaoManualQ.data, conversaoManualInput]);

  function getConversaoManual(descricao: string, unidade: string, quantidade: number): { display: string; unidadeNova: string; qtdNova: number } | null {
    if (quantidade <= 0) return null;
    const key = `${descricao.toLowerCase().trim()}|${unidade.toLowerCase().trim()}`;
    const conv = conversaoManualMap[key];
    if (!conv || !conv.fator || conv.fator <= 0) return null;
    const qtdNova = quantidade / conv.fator;
    const qtdArred = Math.ceil(qtdNova * 1000) / 1000;
    const display = `${qtdNova < 1 ? qtdNova.toFixed(2) : Math.ceil(qtdNova).toLocaleString("pt-BR")} ${conv.embalagem}`;
    return { display, unidadeNova: conv.embalagem, qtdNova: qtdArred };
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
  const removeAnexo = trpc.compras.removeAnexoSC.useMutation({
    onSuccess: () => { detalheQ.refetch(); },
    onError: (e) => toast.error(e.message),
  });
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
  const cancelarItem = trpc.compras.cancelarItemSc.useMutation({
    onSuccess: () => { toast.success("Item excluído da solicitação!"); detalheQ.refetch(); q.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const excluirBatchRef = useRef(false);
  const excluir = trpc.compras.excluirSolicitacao.useMutation({
    onSuccess: () => { if (!excluirBatchRef.current) { toast.success("SC excluída!"); q.refetch(); setShowDetalhe(null); } },
    onError: (e) => { if (!excluirBatchRef.current) toast.error(e.message); },
  });
  const excluirLoteSeq = async (ids: number[]) => {
    const total = ids.length;
    const errors: string[] = [];
    excluirBatchRef.current = true;
    setExcluirProgress({ total, done: 0, errors: [], running: true });
    for (let i = 0; i < ids.length; i++) {
      try {
        await excluir.mutateAsync({ id: ids[i] });
      } catch (e: any) {
        errors.push(e?.message ?? `Erro ao excluir SC #${ids[i]}`);
      }
      setExcluirProgress({ total, done: i + 1, errors: [...errors], running: i + 1 < total });
    }
    excluirBatchRef.current = false;
    if (errors.length > 0) { toast.warning(`${total - errors.length} SC(s) excluída(s). ${errors.length} não puderam ser excluídas.`); }
    else { toast.success(`${total} SC(s) excluída(s)!`); }
    q.refetch(); setSelectedSCIds(new Set());
    setTimeout(() => { setExcluirProgress(null); setConfirmExcluirLote(false); }, 800);
  };
  const editar = trpc.compras.editarSolicitacao.useMutation({
    onSuccess: () => {
      toast.success("SC atualizada!");
      q.refetch(); detalheQ.refetch(); setEditMode(false);
      if (editingSc) { setShowNova(false); resetForm(); setEditingSc(null); setEditingOriginalEapIds(new Set()); }
    },
    onError: (e) => toast.error(e.message),
  });
  const duplicar = trpc.compras.duplicarSolicitacao.useMutation({
    onSuccess: (data) => { toast.success(`SC ${formatNumeroScDisplay(data.numeroSc)} criada (cópia)!`); q.refetch(); setShowDetalhe(data.id); },
    onError: (e) => toast.error(e.message),
  });

  // Rev. 1743 — Atalho "Gerar PDF" por SC: monta HTML standalone e dispara print do navegador.
  // No iOS Safari/iPadOS o diálogo de print oferece "Salvar em PDF" automaticamente.
  const gerarPdfSC = async (scId: number) => {
    try {
      const sc: any = await trpcCtx.compras.getSolicitacao.fetch({ id: scId });
      if (!sc) { toast.error("SC não encontrada"); return; }
      const fmtBR = (s?: string | null) => s ? String(s).split("T")[0].split("-").reverse().join("/") : "—";
      const fmtMoeda = (v: any) => v != null ? `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—";
      const fmtQtd = (v: any) => { const n = parseFloat(String(v ?? "0")); return Number.isFinite(n) ? n.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "—"; };
      const esc = (s: any) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
      const itensHtml = (sc.itens as any[] || []).map((it, i) => `
        <tr>
          <td style="text-align:center">${i + 1}</td>
          <td>${esc(it.descricao)}${it.eapCodigo ? `<div style="font-size:10px;color:#666">EAP: ${esc(it.eapCodigo)}</div>` : ""}</td>
          <td style="text-align:right">${esc(fmtQtd(it.quantidade))}</td>
          <td style="text-align:center">${esc(it.unidade || "—")}</td>
          <td style="text-align:right">${it.precoMeta ? fmtMoeda(it.precoMeta) : "—"}</td>
          <td>${esc(it.observacoes || "")}</td>
        </tr>`).join("");
      const tipoLabel = sc.tipo === "servico" ? "Mão de Obra" : sc.tipo === "pacote" ? "Pacote (MAT+MO)" : sc.tipo === "equipamento" ? "Equipamento" : sc.tipo === "pecas_veiculo" ? "Manutenção de Veículos" : "Material";
      const prioLabel: Record<string, string> = { baixa: "Baixa", normal: "Normal", urgente: "URGENTE" };
      const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(formatNumeroScDisplay(sc.numeroSc))}</title>
<style>
  *{box-sizing:border-box} body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1f2937;margin:24px;font-size:12px}
  h1{font-size:20px;margin:0 0 4px 0;color:#0f172a}
  .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0f172a;padding-bottom:12px;margin-bottom:16px}
  .meta{display:grid;grid-template-columns:repeat(2,1fr);gap:8px 24px;margin-bottom:16px}
  .meta div{padding:6px 8px;background:#f8fafc;border-left:3px solid #3b82f6;border-radius:4px}
  .meta b{display:block;font-size:10px;color:#64748b;text-transform:uppercase;font-weight:600;margin-bottom:2px}
  table{width:100%;border-collapse:collapse;margin-top:8px}
  th{background:#1e293b;color:#fff;padding:8px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.3px}
  td{padding:8px;border-bottom:1px solid #e2e8f0;vertical-align:top}
  tbody tr:nth-child(even){background:#f8fafc}
  .obs{margin-top:16px;padding:12px;background:#fef9c3;border-left:4px solid #ca8a04;border-radius:4px}
  .footer{margin-top:24px;padding-top:12px;border-top:1px solid #cbd5e1;font-size:10px;color:#64748b;display:flex;justify-content:space-between}
  .badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600;text-transform:uppercase}
  .b-pri-urg{background:#fee2e2;color:#991b1b} .b-pri-norm{background:#dbeafe;color:#1e40af} .b-pri-baixa{background:#dcfce7;color:#166534}
  @media print{body{margin:12px} .noprint{display:none}}
</style></head><body>
<div class="head">
  <div>
    <h1>Solicitação de Compra ${esc(formatNumeroScDisplay(sc.numeroSc))}</h1>
    <div style="color:#64748b;font-size:11px">${esc(sc.titulo || "")}</div>
  </div>
  <div style="text-align:right">
    <div style="font-size:14px;font-weight:600">${esc(tipoLabel)}</div>
    <span class="badge b-pri-${sc.prioridade === "urgente" ? "urg" : sc.prioridade === "baixa" ? "baixa" : "norm"}">${esc(prioLabel[sc.prioridade] || sc.prioridade || "—")}</span>
  </div>
</div>
<div class="meta">
  <div><b>Obra</b>${esc(sc.obraNome || sc.projetoNome || "—")}</div>
  <div><b>Departamento</b>${esc(sc.departamento || "—")}</div>
  <div><b>Solicitante</b>${esc(sc.solicitanteNome || sc.criadoPorNome || "—")}</div>
  <div><b>Data Necessidade</b>${fmtBR(sc.dataNecessidade)}</div>
  <div><b>Status</b>${esc(sc.status || "—")} · ${esc(sc.aprovacaoStatus || "—")}</div>
  <div><b>Criado em</b>${fmtBR(sc.criadoEm || sc.createdAt)}</div>
</div>
<table>
  <thead><tr><th style="width:30px">#</th><th>Descrição</th><th style="width:80px">Qtd</th><th style="width:60px">Un.</th><th style="width:110px">Preço meta</th><th style="width:200px">Observações</th></tr></thead>
  <tbody>${itensHtml || `<tr><td colspan="6" style="text-align:center;color:#94a3b8;padding:24px">Sem itens</td></tr>`}</tbody>
</table>
${sc.observacoes ? `<div class="obs"><b>Observações da SC:</b><br>${esc(sc.observacoes)}</div>` : ""}
<div class="footer"><span>FC Engenharia · ERP RH/DP</span><span>Impresso em ${new Date().toLocaleString("pt-BR")}</span></div>
<script>setTimeout(function(){window.print()},250);</script>
</body></html>`;
      const w = window.open("", "_blank", "width=900,height=1200");
      if (!w) { toast.error("Bloqueador de pop-up impediu abrir o PDF. Permita pop-ups e tente novamente."); return; }
      w.document.open(); w.document.write(html); w.document.close();
    } catch (err: any) {
      toast.error("Falha ao gerar PDF: " + (err?.message || "erro desconhecido"));
    }
  };
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

  function handleEnviarParaCotacao(tipo: "material" | "servico" | "pacote" | "equipamento" | "pecas_veiculo") {
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
      userId: user?.id ? parseInt(String(user.id)) : undefined,
      userName: user?.nome || user?.name || undefined,
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

  function getEapLegendKey(it: any): string {
    if (form.tipo === "servico") {
      const mdoSaldo = (it as any).mdoSaldo ?? 0;
      const mdoContratado = (it as any).mdoContratado ?? 0;
      if (mdoSaldo <= 0 && mdoContratado > 0) return "contratado";
      if (mdoSaldo <= 0) return "sem_saldo";
      return "disponivel";
    }
    const cob = coberturaMap[it.id];
    if (!cob || !cob.totalInsumos) return "disponivel";
    const insData = (insumosConsolidadosQ?.data ?? []) as any[];
    const itemInsumos = insData.filter((x: any) => x.eapId === it.id || x.orcamentoItemId === it.id);
    const statuses = itemInsumos.map((x: any) => x.statusInsumo || "disponivel");
    if (statuses.includes("estouro")) return "estouro";
    if (statuses.every((s: string) => s === "recebido") && statuses.length > 0) return "recebido";
    if (statuses.every((s: string) => s === "comprado" || s === "recebido") && statuses.length > 0) return "comprado";
    if (statuses.some((s: string) => s === "em_cotacao")) return "em_cotacao";
    if (statuses.some((s: string) => s === "solicitado" || s === "em_cotacao" || s === "comprado")) return "solicitado";
    if (cob.insumosCobertos >= cob.totalInsumos) return "solicitado";
    if (cob.insumosCobertos > 0) return "solicitado";
    return "disponivel";
  }

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
    { companyId, obraId: parseInt(form.obraId || "0"), tipoSC: (form.tipo === "pecas_veiculo" ? "material" : form.tipo) as "material" | "servico" | "pacote" | "equipamento", incluirEquip: form.incluirEquipamentos },
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

  function isFormDirty(): boolean {
    if (form.titulo.trim()) return true;
    if (form.obraId) return true;
    if (form.dataNecessidade) return true;
    if (form.observacoes.trim()) return true;
    if (form.vehicleId) return true;
    if (pendingAnexos.length > 0) return true;
    if (selectedEapIds.size > 0) return true;
    if (itens.some(it => (it.descricao && it.descricao.trim()) || (it.quantidade && Number(it.quantidade) > 0))) return true;
    return false;
  }

  function tentarFecharNova() {
    if (isFormDirty()) {
      setConfirmFecharNova(true);
    } else {
      setShowNova(false);
      resetForm();
      setEditingSc(null);
      setEditingOriginalEapIds(new Set());
    }
  }

  function resetForm() {
    setForm({ titulo: "", obraId: "", dataNecessidade: "", prioridade: "normal", observacoes: "", tipo: "material", incluirEquipamentos: false, vehicleId: "", isLocacao: false, locacaoDuracaoDias: "", locacaoDataInicioPrevista: "", locacaoDataFimPrevista: "" });
    setObraSearch(""); setObraOpen(false);
    setVeiculoSearch(""); setVeiculoOpen(false);
    setItens([newItem()]);
    setSelectedEapIds(new Set());
    setEapSearch(""); setModoSC("eap");
    setEapExpanded(null); setEapQtdServico({}); setEapInsumos({}); setSaldoData({}); setEapExtraDesbloqueado({});
    setEapInsumoSel({}); setEapInsumoQtdManual({});
    setInsumoBusca(""); setInsumoQtds({}); setInsumoExpanded(null);
    setImagemPreview(null); setImagemBase64(null); setImagemNome("");
    setPendingAnexos([]);
    setIncluirAjudanteGlobal(true); setIncluirAjudanteOverride({});
  }

  function handleImagemFile(file: File) {
    const allowedTypes = ["image/", "application/pdf", "video/"];
    const isAllowed = allowedTypes.some(t => file.type.startsWith(t));
    if (!isAllowed) { toast.error("Formato não suportado. Use imagens, PDF ou vídeo."); return; }
    const maxSize = file.type.startsWith("video/") ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > maxSize) { toast.error(`Arquivo muito grande (máx. ${maxSize / 1024 / 1024} MB).`); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const base64 = dataUrl.split(",")[1];
      const isImg = file.type.startsWith("image/");
      const isVid = file.type.startsWith("video/");
      const tipo = isImg ? "imagem" : isVid ? "video" : "pdf";
      setPendingAnexos(prev => [...prev, { nome: file.name, tipo, ts: Date.now(), base64, preview: isImg ? dataUrl : undefined }]);
      if (isImg && !imagemPreview) {
        setImagemPreview(dataUrl);
        setImagemBase64(base64);
        setImagemNome(file.name);
      }
    };
    reader.readAsDataURL(file);
  }

  function handleMultipleFiles(files: FileList | File[]) {
    Array.from(files).forEach(f => handleImagemFile(f));
  }

  async function handleEapExpand(it: any) {
    if (eapExpanded === it.id) { setEapExpanded(null); return; }
    setEapExpanded(it.id);

    const isComposto = it.isComposto || it.tipo === "Composto" || it.servicoCodigo === "composto";
    if (form.tipo === "servico" && !isComposto) return;

    const codigoParaBusca = it.servicoCodigoOriginal || it.servicoCodigo;
    if (!eapInsumos[it.id] && codigoParaBusca && codigoParaBusca !== "composto") {
      setLoadingInsumos(it.id);
      try {
        const insumos = await trpcCtx.compras.getInsumosComposicao.fetch({ companyId, servicoCodigo: codigoParaBusca, tipoSC: form.tipo, incluirEquip: form.incluirEquipamentos });
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

  function calcInsumoQtdFinal(ins: any, qtdServ: number, extraDesbloqueados: Record<string, boolean>) {
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
    return { qtdCalculada, qtdFinal };
  }

  function toggleInsumoSel(orcItemId: number, ins: any, eapItem: any) {
    const selKey = `${orcItemId}_${ins.insumoCodigo}`;
    const wasSelected = eapInsumoSel[selKey];
    const newSel = { ...eapInsumoSel, [selKey]: !wasSelected };
    let newQtdManual = eapInsumoQtdManual;
    if (wasSelected) {
      newQtdManual = { ...eapInsumoQtdManual };
      delete newQtdManual[selKey];
    }
    setEapInsumoSel(newSel);
    setEapInsumoQtdManual(newQtdManual);
    const qtdServ = parseFloat(eapQtdServico[orcItemId] || "0");
    rebuildInsumosItensDirect(orcItemId, eapItem, qtdServ, newSel, newQtdManual);
  }

  function handleInsumoQtdManual(orcItemId: number, ins: any, qtdStr: string, eapItem: any) {
    const selKey = `${orcItemId}_${ins.insumoCodigo}`;
    const newQtdManual = { ...eapInsumoQtdManual, [selKey]: qtdStr };
    const newSel = { ...eapInsumoSel, [selKey]: true };
    setEapInsumoQtdManual(newQtdManual);
    setEapInsumoSel(newSel);
    const qtdServ = parseFloat(eapQtdServico[orcItemId] || "0");
    rebuildInsumosItensDirect(orcItemId, eapItem, qtdServ, newSel, newQtdManual);
  }

  function rebuildInsumosItensDirect(orcItemId: number, eapItem: any, qtdServ: number, selMap: Record<string, boolean>, qtdMap: Record<string, string>) {
    const insumosList = eapInsumos[orcItemId] || [];
    if (form.tipo === "servico" || insumosList.length === 0) return;
    const newItems: ItemForm[] = [];
    for (const ins of insumosList) {
      const selKey = `${orcItemId}_${ins.insumoCodigo}`;
      if (!selMap[selKey]) continue;
      const manualQtd = qtdMap[selKey];
      const { qtdCalculada, qtdFinal } = calcInsumoQtdFinal(ins, qtdServ, eapExtraDesbloqueado);
      const qtdUsar = manualQtd !== undefined ? parseFloat(manualQtd) || 0 : qtdFinal;
      if (qtdUsar <= 0 && manualQtd === undefined) continue;
      newItems.push({
        descricao: ins.descricao,
        unidade: ins.unidade,
        quantidade: String(Math.max(0, qtdUsar)),
        observacoes: "",
        orcamentoItemId: orcItemId,
        eapCodigo: eapItem.eapCodigo,
        insumoCodigo: ins.insumoCodigo,
        composicaoCodigo: eapItem.servicoCodigo,
        precoMeta: ins.precoUnitario,
        quantidadeServico: qtdServ,
        coeficiente: ins.coeficiente,
        origemEap: true,
        qtdCalculadaOriginal: qtdCalculada,
      });
    }
    setItens(prev => {
      const avulsosDeste = prev.filter(x => x.orcamentoItemId === orcItemId && !x.insumoCodigo && !x.origemEap);
      const semEsteOrc = prev.filter(x => x.orcamentoItemId !== orcItemId);
      const semVazios = semEsteOrc.filter(x => x.descricao.trim() !== "" || x.orcamentoItemId);
      return [...semVazios, ...newItems, ...avulsosDeste];
    });
    if (newItems.length > 0) {
      setSelectedEapIds(prev => { const n = new Set(prev); n.add(orcItemId); return n; });
    } else {
      setSelectedEapIds(prev => { const n = new Set(prev); n.delete(orcItemId); return n; });
    }
  }

  function handleEapQtdChange(orcItemId: number, qtdStr: string, eapItem: any) {
    setEapQtdServico(prev => ({ ...prev, [orcItemId]: qtdStr }));
    const qtdServ = parseFloat(qtdStr) || 0;
    const insumosList = eapInsumos[orcItemId] || [];

    if (qtdServ > 0 && eapItem?.eapCodigo) {
      setSugestaoEap(eapItem.eapCodigo);
      setSugestaoAberta(true);
    }

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
        setItens(prev => {
          const avulsosDeste = prev.filter(x => x.orcamentoItemId === orcItemId && !x.insumoCodigo && !x.origemEap);
          const semEsteOrc = prev.filter(x => x.orcamentoItemId !== orcItemId);
          const semVazios = semEsteOrc.filter(x => x.descricao.trim() !== "" || x.orcamentoItemId);
          return [...semVazios, ...newItems, ...avulsosDeste];
        });
        setSelectedEapIds(prev => { const n = new Set(prev); n.add(orcItemId); return n; });
      } else if (insumosList.length > 0) {
        const newSel: Record<string, boolean> = {};
        const newQtd: Record<string, string> = {};
        for (const ins of insumosList) {
          const selKey = `${orcItemId}_${ins.insumoCodigo}`;
          const { qtdFinal } = calcInsumoQtdFinal(ins, qtdServ, eapExtraDesbloqueado);
          if (eapInsumoSel[selKey] !== undefined) {
            newSel[selKey] = eapInsumoSel[selKey];
            if (eapInsumoQtdManual[selKey] !== undefined) {
              newQtd[selKey] = eapInsumoQtdManual[selKey];
            }
          } else {
            newSel[selKey] = qtdFinal > 0;
          }
        }
        setEapInsumoSel(prev => ({ ...prev, ...newSel }));
        setEapInsumoQtdManual(prev => ({ ...prev, ...newQtd }));

        const finalItems: ItemForm[] = [];
        for (const ins of insumosList) {
          const selKey = `${orcItemId}_${ins.insumoCodigo}`;
          if (!newSel[selKey]) continue;
          const manualQtdVal = newQtd[selKey];
          const { qtdCalculada, qtdFinal } = calcInsumoQtdFinal(ins, qtdServ, eapExtraDesbloqueado);
          const qtdUsar = manualQtdVal !== undefined ? parseFloat(manualQtdVal) || 0 : qtdFinal;
          if (qtdUsar <= 0) continue;
          finalItems.push({
            descricao: ins.descricao,
            unidade: ins.unidade,
            quantidade: String(qtdUsar),
            observacoes: manualQtdVal !== undefined ? "" : (qtdFinal < qtdCalculada && qtdFinal > 0 ? `Qtd calculada: ${qtdCalculada} (limitada ao saldo disponível)` : qtdFinal === 0 && qtdCalculada > 0 ? `Bloqueado — saldo global esgotado (calculado: ${qtdCalculada})` : ""),
            orcamentoItemId: orcItemId,
            eapCodigo: eapItem.eapCodigo,
            insumoCodigo: ins.insumoCodigo,
            composicaoCodigo: eapItem.servicoCodigo,
            precoMeta: ins.precoUnitario,
            quantidadeServico: qtdServ,
            coeficiente: ins.coeficiente,
            origemEap: true,
            qtdCalculadaOriginal: qtdCalculada,
          });
        }
        setItens(prev => {
          const avulsosDeste = prev.filter(x => x.orcamentoItemId === orcItemId && !x.insumoCodigo && !x.origemEap);
          const semEsteOrc = prev.filter(x => x.orcamentoItemId !== orcItemId);
          const semVazios = semEsteOrc.filter(x => x.descricao.trim() !== "" || x.orcamentoItemId);
          return [...semVazios, ...finalItems, ...avulsosDeste];
        });
        setSelectedEapIds(prev => { const n = new Set(prev); n.add(orcItemId); return n; });
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
        setItens(prev => {
          const avulsosDeste = prev.filter(x => x.orcamentoItemId === orcItemId && !x.insumoCodigo && !x.origemEap);
          const semEsteOrc = prev.filter(x => x.orcamentoItemId !== orcItemId);
          const semVazios = semEsteOrc.filter(x => x.descricao.trim() !== "" || x.orcamentoItemId);
          return [...semVazios, ...newItems, ...avulsosDeste];
        });
        setSelectedEapIds(prev => { const n = new Set(prev); n.add(orcItemId); return n; });
      }
    } else {
      setItens(prev => prev.filter(x => x.orcamentoItemId !== orcItemId));
      setSelectedEapIds(prev => { const n = new Set(prev); n.delete(orcItemId); return n; });
      const insList = eapInsumos[orcItemId] || [];
      const keysToClean: string[] = insList.map((ins: any) => `${orcItemId}_${ins.insumoCodigo}`);
      setEapInsumoSel(prev => { const n = { ...prev }; keysToClean.forEach(k => delete n[k]); return n; });
      setEapInsumoQtdManual(prev => { const n = { ...prev }; keysToClean.forEach(k => delete n[k]); return n; });
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

  function isTituloItem(it: any, allItems: any[]): boolean {
    const prefix = it.eapCodigo + ".";
    const hasChildren = allItems.some((o: any) => o.eapCodigo.startsWith(prefix));
    const qtdZero = !it.quantidade || parseFloat(String(it.quantidade)) === 0;
    const descEndsColon = it.descricao?.trim().endsWith(":");
    let score = 0;
    if (hasChildren) score++;
    if (qtdZero) score++;
    if (descEndsColon) score++;
    return score >= 2;
  }

  function handleEapDoubleClick(clickedItem: any) {
    const eapItems = eapQ.data?.items;
    if (!eapItems) return;

    const allVisible = eapItems.filter((it: any) => it.nivel >= 2 && it.tipo !== "grupo");

    const prefix = clickedItem.eapCodigo + ".";
    const childItems = allVisible
      .filter((it: any) => {
        if (form.tipo === "servico") return !!it.servicoCodigo && (it as any).temMdo;
        if (form.tipo === "equipamento") return !!it.servicoCodigo && (it as any).temEquip;
        if (form.tipo === "pecas_veiculo") return (it as any).temMat !== false;
        if (!it.servicoCodigo) return true;
        if (form.tipo === "material") return (it as any).temMat !== false;
        return true;
      })
      .filter((it: any) => it.eapCodigo.startsWith(prefix) || it.id === clickedItem.id)
      .filter((it: any) => !isTituloItem(it, eapItems));

    if (childItems.length === 0) return;

    const allSelected = childItems.every((it: any) => selectedEapIds.has(it.id) || (parseFloat(eapQtdServico[it.id] || "") > 0));

    if (allSelected) {
      childItems.forEach((it: any) => {
        setSelectedEapIds(prev => { const n = new Set(prev); n.delete(it.id); return n; });
        setEapQtdServico(prev => { const n = { ...prev }; delete n[it.id]; return n; });
      });
      setItens(p => p.filter(x => !childItems.some((c: any) => c.id === x.orcamentoItemId)));
    } else {
      childItems.forEach((it: any) => {
        if (!selectedEapIds.has(it.id) && !(parseFloat(eapQtdServico[it.id] || "") > 0)) {
          if (form.tipo === "servico" || form.tipo === "pacote") {
            const mdoSaldo = (it as any).mdoSaldo;
            if (mdoSaldo != null && mdoSaldo > 0) {
              handleEapQtdChange(it.id, String(mdoSaldo), it);
            } else {
              const orcQtd = parseFloat(it.quantidade || "0");
              const contratado = (it as any).mdoContratado || 0;
              const saldoCalc = orcQtd - contratado;
              handleEapQtdChange(it.id, saldoCalc > 0 ? String(saldoCalc) : "1", it);
            }
          } else {
            toggleEapItem(it);
          }
        }
      });
    }
    toast.success(allSelected
      ? `${childItems.length} itens desmarcados (${clickedItem.eapCodigo})`
      : `${childItems.length} itens selecionados (${clickedItem.eapCodigo})`
    );
  }

  function toggleEapItem(it: any) {
    setSelectedEapIds(prev => {
      const next = new Set(prev);
      if (next.has(it.id)) {
        next.delete(it.id);
        setItens(p => p.filter(x => x.orcamentoItemId !== it.id));
        setEapQtdServico(prev => { const n = { ...prev }; delete n[it.id]; return n; });
      } else {
        next.add(it.id);
        if (it.eapCodigo) { setSugestaoEap(it.eapCodigo); setSugestaoAberta(true); }
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
    if (!form.obraId && modoSC !== "manual") return toast.error("Selecione a Obra ou use o modo Manual para compras sem obra.");
    if (form.tipo === "pecas_veiculo" && !form.vehicleId) return toast.error("Selecione o veículo para SC de Manutenção de Veículos.");

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

    const validos = itensParaSalvar.filter(i => i.descricao.trim()).map(i => {
      if (modoSC === "manual" && !i.orcamentoItemId && !i.origemEap) {
        return { ...i, semVerba: true, motivoSemVerba: "avulso" };
      }
      // Rev. 2956 — item VINCULADO a uma linha de orçamento (orcamentoItemId) nunca é
      // "avulso"; limpa flag estagnado p/ não re-persistir a contradição no save/edição.
      if (i.orcamentoItemId && (i as any).motivoSemVerba === "avulso") {
        return { ...i, semVerba: false, motivoSemVerba: undefined };
      }
      return i;
    });
    if (validos.length === 0) return toast.error("Adicione pelo menos um item.");

    const consolidados = new Map<string, ItemForm>();
    let avulsoIdx = 0;
    for (const it of validos) {
      const isAvulsoEap = it.orcamentoItemId && !it.insumoCodigo && !it.origemEap;
      const key = isAvulsoEap
        ? `avulso_${it.orcamentoItemId}_${avulsoIdx++}`
        : form.tipo === "servico" && it.orcamentoItemId
        ? `orc_${it.orcamentoItemId}`
        : it.eapCodigo
        ? `eap_${it.eapCodigo}`
        : (it.insumoCodigo || it.descricao);
      if (consolidados.has(key)) {
        const prev = consolidados.get(key)!;
        // Rev. 4018 — Item 6: soma em ponto flutuante sem arredondar produzia
        // artefatos tipo 0.1+0.2=0.30000000000000004 ao consolidar itens
        // duplicados (ex. mesmo insumo repetido na SC), fazendo a quantidade
        // "mudar sozinha" ao salvar. Arredonda pra 3 casas (numeric(14,3) do banco).
        prev.quantidade = String(Math.round((parseFloat(prev.quantidade) + parseFloat(it.quantidade)) * 1000) / 1000);
      } else {
        consolidados.set(key, { ...it });
      }
    }

    const saldoProblems: string[] = [];
    const itensSemVerba = new Set<string>();
    if (!editingSc) {
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
            qtdPorInsumo[item.insumoCodigo] = Math.round(((qtdPorInsumo[item.insumoCodigo] || 0) + parseFloat(item.quantidade)) * 1000) / 1000;
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
    setUploadingImagem(true);
    const uploadedAnexos: { url: string; nome: string; tipo: string; ts: number }[] = [];
    let imgUrl: string | undefined;

    for (const anx of pendingAnexos) {
      if (anx.base64) {
        try {
          const res = await uploadImagem.mutateAsync({ companyId, fileBase64: anx.base64, fileName: anx.nome });
          uploadedAnexos.push({ url: res.url, nome: res.nome || anx.nome, tipo: res.tipo || anx.tipo, ts: res.ts || anx.ts });
          if (anx.tipo === "imagem" && !imgUrl) imgUrl = res.url;
        } catch { toast.error(`Erro ao enviar ${anx.nome}`); }
      } else if (anx.url) {
        uploadedAnexos.push({ url: anx.url, nome: anx.nome, tipo: anx.tipo, ts: anx.ts });
        if (anx.tipo === "imagem" && !imgUrl) imgUrl = anx.url;
      }
    }

    if (!imgUrl && imagemBase64 && imagemNome) {
      try {
        const res = await uploadImagem.mutateAsync({ companyId, fileBase64: imagemBase64, fileName: imagemNome });
        imgUrl = res.url;
      } catch { toast.error("Erro ao enviar imagem de referência."); }
    }
    setUploadingImagem(false);

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
        obraId: form.obraId && form.obraId !== "0" ? parseInt(form.obraId) : null,
        vehicleId: form.vehicleId ? parseInt(form.vehicleId) : null,
        dataNecessidade: form.dataNecessidade || undefined,
        prioridade: form.prioridade,
        observacoes: form.observacoes || undefined,
        tipo: form.tipo,
        incluirEquipamentos: form.incluirEquipamentos || undefined,
        // Rev. 2290 — Locação (edição).
        isLocacao: form.tipo === "equipamento" ? form.isLocacao : false,
        locacaoDuracaoDias: form.tipo === "equipamento" && form.isLocacao && form.locacaoDuracaoDias ? parseInt(form.locacaoDuracaoDias, 10) : null,
        locacaoDataInicioPrevista: form.tipo === "equipamento" && form.isLocacao ? (form.locacaoDataInicioPrevista || null) : null,
        locacaoDataFimPrevista: form.tipo === "equipamento" && form.isLocacao ? (form.locacaoDataFimPrevista || null) : null,
        imagemReferenciaUrl: imgUrl ? imgUrl : (imagemPreview && !imagemBase64 ? undefined : null),
        anexos: uploadedAnexos,
        itens: itensPayload,
      });
    } else {
      criar.mutate({
        companyId,
        solicitanteId: user?.id ? parseInt(String(user.id)) : undefined,
        userId: user?.id ? parseInt(String(user.id)) : undefined,
        userName: user?.nome || user?.name || undefined,
        titulo: form.titulo,
        obraId: form.obraId && form.obraId !== "0" ? parseInt(form.obraId) : null,
        vehicleId: form.vehicleId ? parseInt(form.vehicleId) : null,
        dataNecessidade: form.dataNecessidade || undefined,
        prioridade: form.prioridade,
        observacoes: form.observacoes || undefined,
        imagemReferenciaUrl: imgUrl,
        anexos: uploadedAnexos,
        tipo: form.tipo,
        incluirEquipamentos: form.incluirEquipamentos || undefined,
        // Rev. 2290 — Locação (criação).
        isLocacao: form.tipo === "equipamento" ? form.isLocacao : undefined,
        locacaoDuracaoDias: form.tipo === "equipamento" && form.isLocacao && form.locacaoDuracaoDias ? parseInt(form.locacaoDuracaoDias, 10) : undefined,
        locacaoDataInicioPrevista: form.tipo === "equipamento" && form.isLocacao ? (form.locacaoDataInicioPrevista || undefined) : undefined,
        locacaoDataFimPrevista: form.tipo === "equipamento" && form.isLocacao ? (form.locacaoDataFimPrevista || undefined) : undefined,
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
  const obras = obrasQ.data ?? [];
  const obrasFiltradas = obras.filter((o: any) =>
    `${o.codigo ?? ""} ${o.nome}`.toLowerCase().includes(obraSearch.toLowerCase())
  );

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (obraRef.current && !obraRef.current.contains(e.target as Node)) setObraOpen(false);
      if (veiculoRef.current && !veiculoRef.current.contains(e.target as Node)) setVeiculoOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Rev. 3276 — Predicado de período sobre a Data postada (criadoEm). Vazio = passa tudo.
  const dentroDoPeriodo = (r: any): boolean => {
    if (!filtroDataDe && !filtroDataAte) return true;
    const ts = r.criadoEm ? new Date(r.criadoEm).getTime() : 0;
    if (!ts) return false;
    if (filtroDataDe && ts < new Date(filtroDataDe + "T00:00:00").getTime()) return false;
    if (filtroDataAte && ts > new Date(filtroDataAte + "T23:59:59.999").getTime()) return false;
    return true;
  };
  const listaFiltradaObraBase = (filtroObra === "todas" ? lista : lista.filter((r: any) => String(r.obraId) === filtroObra)).filter(dentroDoPeriodo);
  // Considera SC como "totalmente entregue" quando:
  //  - já está num status final (concluida/recebido/aprovado/recusado/cancelado), OU
  //  - todos os itens da SC têm quantidadeAtendida >= quantidade
  //    (atendidos === total e total > 0)
  const scEntregueTotal = (r: any) => {
    const st = String(r.status || "");
    if (["aprovado", "concluida", "recebido", "recusado", "cancelado"].includes(st)) return true;
    // Rev. 1684: separar entrega (logística) de pagamento (financeiro).
    // Quando TODAS as OCs vinculadas estão em status de entrega, a SC é considerada
    // entregue mesmo que o pagamento ainda esteja pendente.
    if (r._ocsEntregues === true) return true;
    const it = r._itens || { total: 0, atendidos: 0 };
    return it.total > 0 && it.atendidos >= it.total;
  };
  const listaFiltradaObraStatus = filtroStatus === "pendente_oc"
    ? listaFiltradaObraBase.filter((r: any) => !(r._hasOC) && !["aprovado", "recusado", "cancelado"].includes(r.status))
    : filtroStatus === "pendente_entrega"
    ? listaFiltradaObraBase.filter((r: any) => r._hasOC === true && !scEntregueTotal(r))
    : listaFiltradaObraBase;
  // Rev. 2301 — helper único de tipo efetivo (usado pelo filter abaixo + contadores dos pills).
  const effectiveTipo = (r: any): "material" | "servico" | "equipamento" | "pacote" | "manutencao" => {
    const t = r.tipo || "material";
    if (t === "pecas_veiculo" || r.vehicleId) return "manutencao";
    if (t === "manutencao") return "manutencao";
    if (t === "servico") return "servico";
    if (t === "equipamento") return "equipamento";
    if (t === "pacote") return "pacote";
    return "material";
  };
  const listaFiltradaObraSemBreakdown = filtroClassificacao === "todas"
    ? listaFiltradaObraStatus
    : listaFiltradaObraStatus.filter((r: any) => effectiveTipo(r) === filtroClassificacao);
  // Rev. 1734 — Predicados dos 9 mini-blocos do card "Status das Solicitações"
  // (mesma lógica do useMemo statusBreakdown, agora exposta como filtro clicável)
  const breakdownPredicates: Record<string, (r: any) => boolean> = {
    aguardandoAprov: (r) => (r.aprovacaoStatus ?? "aguardando") === "aguardando" && !["aprovado", "recusado", "cancelado"].includes(r.status),
    aprovadasSemOC: (r) => ["aprovada", "aprovado"].includes(r.aprovacaoStatus ?? "") && !r._hasOC && !["aprovado", "recusado", "cancelado"].includes(r.status),
    pendente: (r) => r.status === "pendente",
    emCotacao: (r) => r.status === "cotacao",
    emAndamento: (r) => r.status === "em_andamento",
    entreguesParcial: (r) => r._hasOC === true && r._ocsEntregues !== true && !scEntregueTotal(r),
    concluidas: (r) => r.status === "aprovado" || scEntregueTotal(r),
    recusadas: (r) => r.status === "recusado" || ["recusada", "recusado"].includes(r.aprovacaoStatus ?? ""),
    canceladas: (r) => r.status === "cancelado",
  };
  const listaFiltradaObraPreSort = filtroBreakdown && breakdownPredicates[filtroBreakdown]
    ? listaFiltradaObraSemBreakdown.filter(breakdownPredicates[filtroBreakdown])
    : listaFiltradaObraSemBreakdown;
  // Rev. 2089 — Ordenação ativa (default: criadoEm DESC). Sempre tie-break por criadoEm DESC.
  const listaFiltradaObra = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const getVal = (r: any): string | number => {
      switch (sortKey) {
        case "criadoEm": return r.criadoEm ? new Date(r.criadoEm).getTime() : 0;
        case "dataNecessidade": return r.dataNecessidade ? new Date(r.dataNecessidade + "T00:00:00").getTime() : 0;
        case "numeroSc": return String(r.numeroSc ?? "");  // ordenado via localeCompare numeric abaixo
        case "titulo": return String(r.titulo ?? "").toLowerCase();
        // Rev. 2295 — Ordenação por TIPO (badge MAT/MDO/EQUIP/etc.). Concatena `isLocacao`
        // pra "equipamento" agrupar EQUIP·LOC perto de EQUIP. Substituiu "aprovacaoStatus"
        // (obsoleto desde a Rev. 2294 — toda SC nasce aprovada).
        case "tipo": return `${String(r.tipo ?? "material")}${r.isLocacao ? "_loc" : ""}`.toLowerCase();
        // Rev. 2295 — Prioridade ordenada por peso semântico (URGENTE → ALTA → NORMAL → BAIXA),
        // não alfabético (alfabético colocaria "alta" antes de "urgente", inverso do esperado).
        case "prioridade": {
          const peso: Record<string, number> = { urgente: 0, alta: 1, normal: 2, baixa: 3 };
          return peso[String(r.prioridade ?? "normal").toLowerCase()] ?? 99;
        }
        case "status": return String(r.status ?? "").toLowerCase();
        case "obra": return (nomeObra(r.obraId) ?? "").toLowerCase();
        case "solicitante": return String(r.criadoPorNome ?? "").toLowerCase();
        default: return 0;
      }
    };
    const arr = [...listaFiltradaObraPreSort];
    arr.sort((a, b) => {
      const va = getVal(a), vb = getVal(b);
      let cmp = 0;
      if (typeof va === "string" && typeof vb === "string") {
        // localeCompare com numeric: true → ordena "SC-2026-100" depois de "SC-2026-20" corretamente.
        cmp = va.localeCompare(vb, "pt-BR", { numeric: true, sensitivity: "base" });
      } else {
        if (va < vb) cmp = -1;
        else if (va > vb) cmp = 1;
      }
      if (cmp !== 0) return cmp * dir;
      // Tie-break: mais recentes primeiro
      const ta = a.criadoEm ? new Date(a.criadoEm).getTime() : 0;
      const tb = b.criadoEm ? new Date(b.criadoEm).getTime() : 0;
      return tb - ta;
    });
    return arr;
  }, [listaFiltradaObraPreSort, sortKey, sortDir, obras]);
  const todasSCs = filtroStatus !== "todos" ? (qTodas.data ?? lista) : lista;
  const urgentesAtivos = useMemo(() => todasSCs.filter((r: any) => r.prioridade === "urgente" && !["aprovado", "cancelado", "recusado"].includes(r.status) && !r._hasOC), [todasSCs]);
  // KPIs sempre calculados a partir do total sem filtro de status (apenas filtro de obra aplicado)
  const listaKpisBase = (filtroObra === "todas" ? todasSCs : todasSCs.filter((r: any) => String(r.obraId) === filtroObra)).filter(dentroDoPeriodo);
  const kpis = useMemo(() => ({
    pendenteOC:       listaKpisBase.filter((r: any) => !(r._hasOC) && !["aprovado", "recusado", "cancelado"].includes(r.status)).length,
    pendenteEntrega:  listaKpisBase.filter((r: any) => r._hasOC === true && !scEntregueTotal(r)).length,
    aprovado: listaKpisBase.filter((r: any) => r.status === "aprovado" || scEntregueTotal(r)).length,
    recusado: listaKpisBase.filter((r: any) => r.status === "recusado").length,
  }), [listaKpisBase]);

  // Rev. 1732 — Status detalhado das solicitações (card superior)
  const statusBreakdown = useMemo(() => {
    const ativas = listaKpisBase.filter((r: any) => !["aprovado", "recusado", "cancelado"].includes(r.status) && !scEntregueTotal(r));
    return {
      total: listaKpisBase.length,
      ativas: ativas.length,
      aguardandoAprov: listaKpisBase.filter((r: any) => (r.aprovacaoStatus ?? "aguardando") === "aguardando" && !["aprovado", "recusado", "cancelado"].includes(r.status)).length,
      aprovadasSemOC: listaKpisBase.filter((r: any) => ["aprovada", "aprovado"].includes(r.aprovacaoStatus ?? "") && !r._hasOC && !["aprovado", "recusado", "cancelado"].includes(r.status)).length,
      emCotacao: listaKpisBase.filter((r: any) => r.status === "cotacao").length,
      emAndamento: listaKpisBase.filter((r: any) => r.status === "em_andamento").length,
      pendente: listaKpisBase.filter((r: any) => r.status === "pendente").length,
      entreguesParcial: listaKpisBase.filter((r: any) => r._hasOC === true && r._ocsEntregues !== true && !scEntregueTotal(r)).length,
      concluidas: listaKpisBase.filter((r: any) => r.status === "aprovado" || scEntregueTotal(r)).length,
      recusadas: listaKpisBase.filter((r: any) => r.status === "recusado" || ["recusada", "recusado"].includes(r.aprovacaoStatus ?? "")).length,
      canceladas: listaKpisBase.filter((r: any) => r.status === "cancelado").length,
      urgentes: listaKpisBase.filter((r: any) => r.prioridade === "urgente" && !["aprovado", "recusado", "cancelado"].includes(r.status) && !r._hasOC).length,
    };
  }, [listaKpisBase]);

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

      {/* Rev. 1732 — Card superior: status detalhado das solicitações */}
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-amber-600" />
              Status das Solicitações
              <span className="text-[10px] font-semibold text-slate-500">
                ({statusBreakdown.total} no total · {statusBreakdown.ativas} ativas)
              </span>
            </h2>
            <p className="text-[11px] text-slate-500">Visão consolidada por estado de aprovação, cotação e entrega{filtroObra !== "todas" ? " (obra filtrada)" : ""}.</p>
          </div>
          {statusBreakdown.urgentes > 0 && (
            <span className="px-3 py-1 rounded-full bg-red-50 border border-red-300 text-red-700 text-xs font-bold animate-pulse">
              ⚠️ {statusBreakdown.urgentes} URGENTE{statusBreakdown.urgentes > 1 ? "S" : ""}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-9 divide-x divide-slate-100">
          {[
            { key: "aguardandoAprov",  label: "Aguardando aprovação",  count: statusBreakdown.aguardandoAprov, color: "text-amber-700",   bar: "bg-amber-400",   ring: "ring-amber-400"   },
            { key: "aprovadasSemOC",   label: "Aprovadas (sem OC)",    count: statusBreakdown.aprovadasSemOC,  color: "text-emerald-700", bar: "bg-emerald-400", ring: "ring-emerald-400" },
            { key: "pendente",         label: "Pendente",              count: statusBreakdown.pendente,        color: "text-slate-700",   bar: "bg-slate-400",   ring: "ring-slate-400"   },
            { key: "emCotacao",        label: "Em cotação",            count: statusBreakdown.emCotacao,       color: "text-sky-700",     bar: "bg-sky-400",     ring: "ring-sky-400"     },
            { key: "emAndamento",      label: "Em andamento",          count: statusBreakdown.emAndamento,     color: "text-indigo-700",  bar: "bg-indigo-400",  ring: "ring-indigo-400"  },
            { key: "entreguesParcial", label: "Entrega parcial",       count: statusBreakdown.entreguesParcial, color: "text-orange-700", bar: "bg-orange-400", ring: "ring-orange-400"  },
            { key: "concluidas",       label: "Concluídas",            count: statusBreakdown.concluidas,      color: "text-green-700",   bar: "bg-green-400",   ring: "ring-green-400"   },
            { key: "recusadas",        label: "Recusadas",             count: statusBreakdown.recusadas,       color: "text-red-700",     bar: "bg-red-400",     ring: "ring-red-400"     },
            { key: "canceladas",       label: "Canceladas",            count: statusBreakdown.canceladas,      color: "text-zinc-600",    bar: "bg-zinc-400",    ring: "ring-zinc-400"    },
          ].map((s) => {
            const ativo = filtroBreakdown === s.key;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => {
                  // Rev. 1734 — clicar filtra a tabela. Toggle no mesmo bloco limpa o filtro.
                  setFiltroBreakdown(ativo ? null : s.key);
                  // Garante que o filtro de macro-status (KPI badges abaixo) seja "todos" pra não conflitar
                  if (!ativo) setFiltroStatus("todos");
                }}
                className={`px-3 py-3 flex flex-col items-start gap-1 text-left transition-all hover:bg-slate-50 ${ativo ? `ring-2 ring-inset ${s.ring} bg-slate-100/60` : ""}`}
                title={ativo ? "Clique novamente para limpar o filtro" : `Filtrar tabela por: ${s.label}`}
              >
                <div className="flex items-baseline gap-1.5">
                  <span className={`text-2xl font-extrabold tabular-nums ${s.color}`}>{s.count}</span>
                  <span className={`h-1.5 w-1.5 rounded-full ${s.bar} ${s.count > 0 ? "" : "opacity-30"}`} />
                </div>
                <span className="text-[11px] text-slate-600 leading-tight">{s.label}</span>
              </button>
            );
          })}
        </div>
        {filtroBreakdown && (
          <div className="px-5 py-2 border-t border-slate-100 bg-amber-50/40 flex items-center justify-between text-xs">
            <span className="text-amber-900">
              <span className="font-semibold">Filtro ativo:</span>{" "}
              tabela exibindo apenas <strong>{listaFiltradaObra.length}</strong> solicitação(ões) que casam com este status.
            </span>
            <button type="button" onClick={() => setFiltroBreakdown(null)}
              className="text-amber-700 font-semibold hover:underline">
              Limpar filtro ✕
            </button>
          </div>
        )}
      </div>

      {/* KPI badges */}
      <div className="flex flex-wrap gap-3">
        {[
          { label: "Pend. de OC",       count: kpis.pendenteOC,      cls: "bg-amber-50 border-amber-200 text-amber-700",        key: "pendente_oc",      ring: "ring-amber-400" },
          { label: "Pend. de Entrega",  count: kpis.pendenteEntrega, cls: "bg-orange-50 border-orange-200 text-orange-700",     key: "pendente_entrega", ring: "ring-orange-400" },
          { label: "Concluído",         count: kpis.aprovado,        cls: "bg-emerald-50 border-emerald-200 text-emerald-700",  key: "aprovado",         ring: "ring-emerald-400" },
          { label: "Recusado",          count: kpis.recusado,        cls: "bg-red-50 border-red-200 text-red-700",              key: "recusado",         ring: "ring-red-400" },
        ].map(k => (
          <button key={k.key}
            onClick={() => setFiltroStatus(filtroStatus === k.key ? "todos" : k.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold transition-all ${k.cls} ${filtroStatus === k.key ? `ring-2 ring-offset-1 ${k.ring}` : "opacity-80 hover:opacity-100"}`}>
            <span className="text-xl font-bold">{k.count}</span>
            <span>{k.label}</span>
          </button>
        ))}
      </div>

      {/* Busca + filtro */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input placeholder="Buscar por número, título, setor..." className="pl-9 bg-white border-gray-300 text-gray-900" value={busca} onChange={e => setBusca(e.target.value)} />
        </div>
        <Select value={filtroObra} onValueChange={setFiltroObra}>
          <SelectTrigger className="w-[240px] bg-white border-gray-300">
            <Building2 className="h-4 w-4 text-gray-400 mr-1" />
            <SelectValue placeholder="Todas as obras" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as obras</SelectItem>
            {obras.map((o: any) => (
              <SelectItem key={o.id} value={String(o.id)}>{o.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {/* Rev. 3276 — Filtro por período (Data postada). De/Até + limpar. */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white border border-gray-300 rounded-md">
          <CalendarDays className="h-4 w-4 text-gray-400 shrink-0" />
          <Input
            type="date"
            value={filtroDataDe}
            max={filtroDataAte || undefined}
            onChange={e => setFiltroDataDe(e.target.value)}
            className="h-7 w-[140px] border-0 shadow-none px-1 text-gray-900 focus-visible:ring-0"
            title="Data postada — de"
            aria-label="Data postada de"
          />
          <span className="text-gray-400 text-sm">até</span>
          <Input
            type="date"
            value={filtroDataAte}
            min={filtroDataDe || undefined}
            onChange={e => setFiltroDataAte(e.target.value)}
            className="h-7 w-[140px] border-0 shadow-none px-1 text-gray-900 focus-visible:ring-0"
            title="Data postada — até"
            aria-label="Data postada até"
          />
          {(filtroDataDe || filtroDataAte) && (
            <button
              type="button"
              onClick={() => { setFiltroDataDe(""); setFiltroDataAte(""); }}
              className="text-gray-400 hover:text-gray-700 transition-colors"
              title="Limpar período"
              aria-label="Limpar filtro de período"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {/* Rev. 2301 — Filtro por TIPO em pills coloridos (substitui o dropdown).
            Contadores cross-filter: respeitam busca + obra + status (breakdown + kpis),
            só ignoram o próprio filtro de classificação. */}
        {(() => {
          const baseContagemTipo = filtroBreakdown && breakdownPredicates[filtroBreakdown]
            ? listaFiltradaObraStatus.filter(breakdownPredicates[filtroBreakdown])
            : listaFiltradaObraStatus;
          const contar = (t: string) => baseContagemTipo.filter((r: any) => effectiveTipo(r) === t).length;
          const tiposPills = [
            { key: "todas",       label: "Todos",       icon: Layers,    count: baseContagemTipo.length,    cls: "bg-slate-50 border-slate-300 text-slate-700",     ring: "ring-slate-400" },
            { key: "material",    label: "Material",    icon: Package,   count: contar("material"),         cls: "bg-blue-50 border-blue-300 text-blue-700",        ring: "ring-blue-400" },
            { key: "servico",     label: "MDO",         icon: HardHat,   count: contar("servico"),          cls: "bg-purple-50 border-purple-300 text-purple-700",  ring: "ring-purple-400" },
            { key: "pacote",      label: "Pacote",      icon: Layers,    count: contar("pacote"),           cls: "bg-indigo-50 border-indigo-300 text-indigo-700",  ring: "ring-indigo-400" },
            { key: "equipamento", label: "Equipamento", icon: Warehouse, count: contar("equipamento"),      cls: "bg-cyan-50 border-cyan-300 text-cyan-700",        ring: "ring-cyan-400" },
            { key: "manutencao",  label: "Manutenção",  icon: Wrench,    count: contar("manutencao"),       cls: "bg-amber-50 border-amber-300 text-amber-700",     ring: "ring-amber-400" },
          ];
          return (
            <div className="flex flex-wrap gap-2 items-center">
              {tiposPills.map(t => {
                const Icon = t.icon;
                const ativo = filtroClassificacao === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setFiltroClassificacao(t.key)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${t.cls} ${ativo ? `ring-2 ring-offset-1 ${t.ring}` : "opacity-75 hover:opacity-100"}`}
                    title={`Filtrar por ${t.label}`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{t.label}</span>
                    <span className="ml-1 px-1.5 py-0.5 rounded-md bg-white/70 text-[10px] tabular-nums">{t.count}</span>
                  </button>
                );
              })}
            </div>
          );
        })()}
        <button onClick={() => { setFiltroStatus("todos"); setFiltroClassificacao("todas"); }}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${filtroStatus === "todos" && filtroClassificacao === "todas" ? "bg-amber-600 border-amber-500 text-white" : "bg-white border-gray-300 text-gray-600 hover:border-gray-400"}`}>
          Todos
        </button>
      </div>

      {selectedSCIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg flex-wrap">
          <CheckSquare className="h-4 w-4 text-amber-600" />
          <span className="text-sm text-amber-800 font-medium">{selectedSCIds.size} selecionada(s)</span>
          {/* Rev. 2294 — Botão "Aprovar Selecionadas" em lote removido: aprovação automática. */}
          <Button size="sm" variant="destructive" className="text-xs gap-1"
            disabled={!!excluirProgress?.running}
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
              ? `1 solicitação URGENTE aguardando atenção — ${formatNumeroScDisplay(urgentesAtivos[0].numeroSc)}: ${urgentesAtivos[0].titulo}`
              : `${urgentesAtivos.length} solicitações URGENTES aguardando atenção imediata`
            }
          </span>
        </div>
      )}

      {/* Tabela */}
      {/* Rev. 2089 — Indicador de ordenação ativa + reset rápido pro default (criadoEm DESC). */}
      <div className="flex items-center justify-end gap-2 text-xs text-gray-500">
        <span>Ordenado por:</span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-700 font-medium">
          {({
            criadoEm: "Data postada",
            tipo: "Tipo",
            prioridade: "Prioridade",
            status: "Status",
            numeroSc: "Número",
            titulo: "Título",
            obra: "Obra",
            solicitante: "Solicitante",
            dataNecessidade: "Necessidade",
          } as Record<SortKey, string>)[sortKey]}
          {sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
        </span>
        {!(sortKey === "criadoEm" && sortDir === "desc") && (
          <button
            type="button"
            onClick={() => { setSortKey("criadoEm"); setSortDir("desc"); }}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
            title="Voltar para ordem por data postada (mais recentes primeiro)"
          >
            <RotateCw className="h-3 w-3" /> mais recentes
          </button>
        )}
      </div>
      <div className="rounded-xl border border-gray-200 overflow-hidden bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="border-gray-200 bg-gray-50 hover:bg-gray-50">
              <TableHead className="w-10">
                <input type="checkbox" className="h-4 w-4 rounded border-gray-300 accent-amber-600"
                  checked={listaFiltradaObra.length > 0 && listaFiltradaObra.every((s: any) => selectedSCIds.has(s.id))}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedSCIds(new Set(listaFiltradaObra.map((s: any) => s.id)));
                    } else {
                      setSelectedSCIds(new Set());
                    }
                  }}
                />
              </TableHead>
              {([
                // Rev. 2295 — Coluna "Aprovação" virou "Tipo" (Rev. 2294 tornou aprovação automática,
                // o badge "Aprovada" sempre verde era ruído puro). Coluna "Prioridade" foi
                // adicionada como ordenável, atendendo o pedido "preciso poder organizar
                // as colunas das solicitações de compras".
                { k: "tipo", label: "Tipo" },
                { k: "prioridade", label: "Prioridade" },
                { k: "status", label: "Status" },
                { k: "numeroSc", label: "Número" },
                { k: "titulo", label: "Título / Setor" },
                { k: "obra", label: "Obra" },
                { k: "solicitante", label: "Solicitante" },
                { k: "dataNecessidade", label: "Necessidade" },
              ] as { k: SortKey; label: string }[]).map(col => {
                const active = sortKey === col.k;
                const Icon = active ? (sortDir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
                return (
                  <TableHead key={col.k} className="text-gray-500 text-xs font-semibold uppercase tracking-wider">
                    <button
                      type="button"
                      onClick={() => toggleSort(col.k)}
                      title={`Ordenar por ${col.label}${active ? (sortDir === "asc" ? " (crescente)" : " (decrescente)") : ""}`}
                      className={`inline-flex items-center gap-1 hover:text-amber-700 transition-colors ${active ? "text-amber-700" : ""}`}
                    >
                      {col.label}
                      <Icon className={`h-3 w-3 ${active ? "opacity-100" : "opacity-40"}`} />
                    </button>
                  </TableHead>
                );
              })}
              <TableHead className="text-gray-500 text-xs font-semibold uppercase tracking-wider whitespace-nowrap">Recebido</TableHead>
              <TableHead className="w-8"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.isLoading ? (
              <TableRow><TableCell colSpan={11} className="text-center py-10 text-gray-400"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></TableCell></TableRow>
            ) : listaFiltradaObra.length === 0 ? (
              <TableRow><TableCell colSpan={11} className="text-center py-10 text-gray-400">Nenhuma solicitação encontrada</TableCell></TableRow>
            ) : listaFiltradaObra.map((sc: any) => {
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
                  {/* Rev. 2295 — Célula "Aprovação" foi substituída por "Tipo" (badge MAT/MDO/EQUIP/VEÍC).
                       Aprovação virou automática (Rev. 2294) e mostrar "Aprovada" pra TUDO era ruído. */}
                  <TableCell>
                    <span className={`px-2 py-0.5 text-[10px] font-semibold rounded ${
                      (sc as any).tipo === "servico" ? "bg-purple-100 text-purple-700"
                      : (sc as any).tipo === "pacote" ? "bg-indigo-100 text-indigo-700"
                      : (sc as any).tipo === "equipamento" ? "bg-cyan-100 text-cyan-700"
                      : (sc as any).tipo === "pecas_veiculo" || (sc as any).tipo === "manutencao" ? "bg-teal-100 text-teal-700"
                      : "bg-blue-100 text-blue-700"
                    }`}>
                      {(sc as any).tipo === "servico" ? "MDO"
                        : (sc as any).tipo === "pacote" ? "MAT+MDO"
                        : (sc as any).tipo === "equipamento" ? ((sc as any).isLocacao ? "EQUIP·LOC" : "EQUIP")
                        : (sc as any).tipo === "pecas_veiculo" || (sc as any).tipo === "manutencao" ? "VEÍC"
                        : "MAT"}
                    </span>
                  </TableCell>
                  {/* Rev. 2295 — Célula nova "Prioridade" (URGENTE/ALTA/NORMAL/BAIXA), ordenável por peso. */}
                  <TableCell>
                    <span className={`px-2 py-0.5 text-[10px] font-semibold rounded ${
                      sc.prioridade === "urgente" ? "bg-red-100 text-red-700"
                      : sc.prioridade === "alta" ? "bg-orange-100 text-orange-700"
                      : sc.prioridade === "baixa" ? "bg-gray-100 text-gray-600"
                      : "bg-slate-100 text-slate-700"
                    }`}>
                      {String(sc.prioridade ?? "normal").toUpperCase()}
                    </span>
                  </TableCell>
                  <TableCell><StatusBadge status={statusEfetivoSC(sc)} /></TableCell>
                  <TableCell className="text-gray-900 font-mono font-semibold text-xs">
                    <div className="flex items-center gap-1.5">
                      {isUrgente && (
                        <span className="relative flex h-2.5 w-2.5 shrink-0">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-600" />
                        </span>
                      )}
                      {formatNumeroScShort(sc.numeroSc)}
                      <span className={`ml-1 px-1.5 py-0.5 text-[9px] font-semibold rounded ${(sc as any).tipo === "servico" ? "bg-purple-100 text-purple-700" : (sc as any).tipo === "pacote" ? "bg-indigo-100 text-indigo-700" : (sc as any).tipo === "equipamento" ? "bg-cyan-100 text-cyan-700" : (sc as any).tipo === "pecas_veiculo" || (sc as any).tipo === "manutencao" ? "bg-teal-100 text-teal-700" : "bg-blue-100 text-blue-700"}`}>
                        {(sc as any).tipo === "servico" ? "MDO" : (sc as any).tipo === "pacote" ? "MAT+MDO" : (sc as any).tipo === "equipamento" ? ((sc as any).isLocacao ? "EQUIP·LOC" : "EQUIP") : (sc as any).tipo === "pecas_veiculo" || (sc as any).tipo === "manutencao" ? "VEÍC" : "MAT"}
                      </span>
                      {((sc as any).origemModulo === "frotas" || (sc as any).origem_modulo === "frotas") && (
                        <span className="ml-1 px-1.5 py-0.5 text-[9px] font-semibold rounded bg-orange-100 text-orange-700">FROTAS</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-xs">
                    <div className="text-gray-900 text-sm font-medium flex items-start gap-1.5 break-words whitespace-normal">
                      <span className="break-words">{sc.titulo || "—"}</span>
                      {sc.imagemReferenciaUrl && <ImageIcon className="h-3.5 w-3.5 text-blue-400 shrink-0 mt-0.5" title="Possui imagem de referência" />}
                    </div>
                    {sc.departamento && <div className="text-gray-400 text-xs break-words whitespace-normal">{sc.departamento}</div>}
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
                  <TableCell className="text-gray-600 text-xs break-words whitespace-normal max-w-[140px]">
                    {sc.criadoPorNome || <span className="text-gray-300">—</span>}
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
                        onClick={(e) => { e.stopPropagation(); duplicar.mutate({ id: sc.id, companyId, userId: user?.id, userName: user?.name }); }}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      <button
                        title="Gerar PDF da SC"
                        className="p-1 rounded hover:bg-emerald-100 text-gray-400 hover:text-emerald-600 transition-colors"
                        onClick={(e) => { e.stopPropagation(); gerarPdfSC(sc.id); }}
                      >
                        <FileDown className="h-3.5 w-3.5" />
                      </button>
                      <button
                        title="Excluir SC"
                        className="p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-600 transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Excluir ${formatNumeroScDisplay(sc.numeroSc)}? Cotações vinculadas sem OC ativa serão canceladas automaticamente.`)) {
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
      <Dialog open={showNova} onOpenChange={v => { if (!v) { tentarFecharNova(); } else { setShowNova(true); } }}>
        <DialogContent
          className="border-gray-200 w-[96vw] max-w-[96vw] h-[94vh] max-h-[94vh] flex flex-col p-0 gap-0"
          style={{ background: '#ffffff', color: '#111827' }}
          onPointerDownOutside={(e) => { if (isFormDirty()) e.preventDefault(); }}
          onInteractOutside={(e) => { if (isFormDirty()) e.preventDefault(); }}
          onEscapeKeyDown={(e) => { if (isFormDirty()) { e.preventDefault(); setConfirmFecharNova(true); } }}
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
                  { value: "equipamento" as const, label: "Equipamento", icon: "⚙️" },
                  { value: "pacote" as const, label: "Pacote (MAT + MO)", icon: "📋" },
                  { value: "pecas_veiculo" as const, label: "Manutenção de Veículos", icon: "🚗" },
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
                      if (form.tipo === opt.value) return;
                      setForm(p => ({ ...p, tipo: opt.value, incluirEquipamentos: false, vehicleId: opt.value !== "pecas_veiculo" ? "" : p.vehicleId, isLocacao: opt.value === "equipamento" ? p.isLocacao : false, locacaoDuracaoDias: opt.value === "equipamento" ? p.locacaoDuracaoDias : "", locacaoDataInicioPrevista: opt.value === "equipamento" ? p.locacaoDataInicioPrevista : "", locacaoDataFimPrevista: opt.value === "equipamento" ? p.locacaoDataFimPrevista : "" }));
                      if (!editingSc) {
                        setSelectedEapIds(new Set());
                        setItens([newItem()]);
                        setEapInsumos({});
                        setEapQtdServico({});
                        setEapExpanded(null);
                        setSaldoData({});
                        setEapExtraDesbloqueado({});
                      }
                      if ((opt.value === "servico" || opt.value === "equipamento") && modoSC === "insumo") setModoSC("eap");
                    }}
                  >
                    <span className="mr-1">{opt.icon}</span> {opt.label}
                  </button>
                ))}
                {form.tipo === "pacote" && (
                  <label className="flex items-center gap-1.5 ml-2 text-xs cursor-pointer whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={form.incluirEquipamentos}
                      onChange={e => {
                        const checked = e.target.checked;
                        setForm(p => ({ ...p, incluirEquipamentos: checked }));
                        setEapInsumos({});
                        setEapExpanded(null);
                      }}
                      className="h-3.5 w-3.5 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                    />
                    <span className={form.incluirEquipamentos ? "text-green-700 font-semibold" : "text-gray-500 font-medium"}>
                      {form.incluirEquipamentos ? "MAT + MO + EQUIP" : "MAT + MO (sem equip.)"}
                    </span>
                  </label>
                )}
              </div>
              {form.tipo === "pecas_veiculo" && (
                <div className="relative mt-2" ref={veiculoRef}>
                  <label className="text-xs font-medium text-gray-700 flex items-center gap-1 mb-1">
                    <Car className="h-3 w-3 text-cyan-600" /> Selecione o Veículo <span className="text-red-500">*</span>
                  </label>
                  <input
                    className="w-full h-8 px-3 text-sm border border-gray-300 rounded-md bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent"
                    placeholder="Digite a placa ou nome do veículo..."
                    value={veiculoOpen
                      ? veiculoSearch
                      : form.vehicleId
                        ? (() => { const v = (veiculosQ.data || []).find((v: any) => String(v.id) === form.vehicleId); return v ? `${v.placa} — ${v.nome || v.modelo || ""}` : ""; })()
                        : ""
                    }
                    onFocus={() => { setVeiculoOpen(true); setVeiculoSearch(""); }}
                    onChange={e => { setVeiculoSearch(e.target.value); setVeiculoOpen(true); }}
                  />
                  {form.vehicleId && !veiculoOpen && (
                    <button type="button" onClick={() => setForm(p => ({ ...p, vehicleId: "" }))} className="absolute right-2 bottom-1.5 text-gray-400 hover:text-red-500">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {veiculoOpen && (
                    <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-52 overflow-y-auto">
                      {(() => {
                        const veiculos = (veiculosQ.data || []) as any[];
                        const filtered = veiculoSearch
                          ? veiculos.filter((v: any) => `${v.placa} ${v.nome || ""} ${v.modelo || ""}`.toLowerCase().includes(veiculoSearch.toLowerCase()))
                          : veiculos;
                        if (filtered.length === 0) return <div className="px-3 py-2 text-sm text-gray-400">Nenhum veículo encontrado</div>;
                        return filtered.slice(0, 20).map((v: any) => (
                          <div
                            key={v.id}
                            className={`px-3 py-1.5 text-sm cursor-pointer hover:bg-cyan-50 hover:text-cyan-700 ${String(v.id) === form.vehicleId ? "bg-cyan-50 text-cyan-700 font-medium" : "text-gray-900"}`}
                            onMouseDown={e => {
                              e.preventDefault();
                              setForm(p => ({ ...p, vehicleId: String(v.id) }));
                              setVeiculoSearch("");
                              setVeiculoOpen(false);
                            }}
                          >
                            <span className="font-medium">{v.placa}</span> <span className="text-gray-400">—</span> {v.nome || v.modelo || ""}
                          </div>
                        ));
                      })()}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Obra — combobox com busca */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700 flex items-center gap-1">
                <Building2 className="h-3 w-3 text-amber-600" /> Obra / Centro de Custo
              </label>
              <div className="relative" ref={obraRef}>
                <input
                  className={`w-full h-8 ${form.obraId && !obraOpen ? "pr-16" : "pr-3"} pl-3 text-sm border border-gray-300 rounded-md bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent cursor-pointer`}
                  placeholder={obrasQ.isLoading ? "Carregando obras..." : "Digite para buscar a obra..."}
                  value={obraOpen
                    ? obraSearch
                    : form.obraId
                      ? form.obraId === "0"
                        ? "Escritório Central / Sem Obra"
                        : (obras.find((o: any) => String(o.id) === form.obraId) as any)
                            ? `${(obras.find((o: any) => String(o.id) === form.obraId) as any)?.codigo ? `[${(obras.find((o: any) => String(o.id) === form.obraId) as any).codigo}] ` : ""}${(obras.find((o: any) => String(o.id) === form.obraId) as any)?.nome}`
                            : ""
                      : ""
                  }
                  onFocus={() => { setObraOpen(true); setObraSearch(""); }}
                  onClick={() => { setObraOpen(true); setObraSearch(""); }}
                  onChange={e => { setObraSearch(e.target.value); setObraOpen(true); }}
                />
                {form.obraId && !obraOpen && (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    <button
                      type="button"
                      title="Trocar obra"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setObraOpen(true); setObraSearch(""); }}
                      className="text-[10px] font-semibold text-amber-700 hover:text-amber-900 px-1.5 py-0.5 rounded hover:bg-amber-50"
                    >
                      Trocar
                    </button>
                    <button
                      type="button"
                      title="Limpar obra"
                      onClick={(e) => {
                        e.preventDefault(); e.stopPropagation();
                        const hadObra = !!form.obraId;
                        setForm(p => ({ ...p, obraId: "" }));
                        setObraSearch("");
                        if (hadObra && !editingSc) {
                          setSelectedEapIds(new Set());
                          setItens([newItem()]);
                          setEapExpanded(null); setEapQtdServico({}); setEapInsumos({}); setSaldoData({}); setBatchSaldo({}); setEapExtraDesbloqueado({}); setEapInsumoSel({}); setEapInsumoQtdManual({});
                        }
                        setObraOpen(true);
                      }}
                      className="text-gray-400 hover:text-red-600"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                {obraOpen && (
                  <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-52 overflow-y-auto">
                    <div
                      className={`px-3 py-1.5 text-sm cursor-pointer hover:bg-blue-50 hover:text-blue-700 border-b border-gray-100 flex items-center gap-1.5 ${form.obraId === "0" ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-600"}`}
                      onMouseDown={e => {
                        e.preventDefault();
                        setForm(p => ({ ...p, obraId: "0" }));
                        setModoSC("manual");
                        if (!editingSc) {
                          setSelectedEapIds(new Set());
                          setItens([newItem()]);
                        }
                        setObraSearch("");
                        setObraOpen(false);
                      }}
                    >
                      <Building2 className="h-3 w-3" /> Escritório Central / Sem Obra
                    </div>
                    {obrasFiltradas.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-gray-400">Nenhuma obra encontrada</div>
                    ) : obrasFiltradas.map((o: any) => (
                      <div
                        key={o.id}
                        className={`px-3 py-1.5 text-sm cursor-pointer hover:bg-amber-50 hover:text-amber-700 ${String(o.id) === form.obraId ? "bg-amber-50 text-amber-700 font-medium" : "text-gray-900"}`}
                        onMouseDown={e => {
                          e.preventDefault();
                          const obraChanged = form.obraId !== String(o.id);
                          setForm(p => ({ ...p, obraId: String(o.id) }));
                          if (!editingSc && obraChanged) {
                            setSelectedEapIds(new Set());
                            setItens([newItem()]);
                            setEapExpanded(null); setEapQtdServico({}); setEapInsumos({}); setSaldoData({}); setBatchSaldo({}); setEapExtraDesbloqueado({}); setEapInsumoSel({}); setEapInsumoQtdManual({});
                          }
                          setObraSearch("");
                          setObraOpen(false);
                        }}
                      >
                        {o.codigo ? <span className="text-gray-400 mr-1">[{o.codigo}]</span> : null}{o.nome}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Rev. 2290 — Bloco de Locação (aparece DEPOIS da Obra, só quando
                tipo=Equipamento E obra selecionada). Card inteiro clicável.
                Quando ativo, "Início Previsto" sincroniza com Data de Necessidade
                (evita digitar duas vezes) e a Data de Necessidade some do form. */}
            {form.tipo === "equipamento" && form.obraId && (
              <div className={`rounded-xl overflow-hidden shadow-sm transition-all ${form.isLocacao ? "ring-2 ring-amber-400/60 shadow-amber-200/40" : "border border-gray-200 hover:border-amber-300 hover:shadow-md"}`}>
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.isLocacao}
                  onClick={() => {
                    const checked = !form.isLocacao;
                    setForm(p => ({
                      ...p,
                      isLocacao: checked,
                      locacaoDuracaoDias: checked ? p.locacaoDuracaoDias : "",
                      locacaoDataInicioPrevista: checked ? p.locacaoDataInicioPrevista : "",
                      locacaoDataFimPrevista: checked ? p.locacaoDataFimPrevista : "",
                    }));
                  }}
                  className={`w-full text-left flex items-center justify-between gap-3 px-4 py-3 transition-all focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-inset cursor-pointer ${form.isLocacao
                    ? "bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-white"
                    : "bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 hover:from-amber-100 hover:via-orange-100 hover:to-amber-100"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg shadow-sm transition-all ${form.isLocacao ? "bg-white/20 ring-1 ring-white/40" : "bg-amber-200/70"}`}>
                      <Truck className={`h-5 w-5 ${form.isLocacao ? "text-white" : "text-amber-700"}`} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className={`text-sm font-bold uppercase tracking-wide ${form.isLocacao ? "text-white" : "text-amber-900"}`}>
                          É Locação de Equipamento?
                        </h4>
                        {form.isLocacao
                          ? <span className="px-2 py-0.5 text-[9px] font-extrabold rounded-full bg-white text-amber-700 shadow-sm tracking-wider">ALUGUEL ATIVO</span>
                          : <span className="px-2 py-0.5 text-[9px] font-bold rounded-full bg-amber-600 text-white shadow-sm tracking-wider animate-pulse">CLIQUE PARA ATIVAR</span>
                        }
                      </div>
                      <p className={`text-[11px] mt-0.5 ${form.isLocacao ? "text-amber-50" : "text-amber-800/80"}`}>
                        {form.isLocacao
                          ? "Suprimentos vai cotar com fornecedores de aluguel — informe o período abaixo."
                          : "Marque se for ALUGAR (não comprar) — Suprimentos cotará como locação."}
                      </p>
                    </div>
                  </div>
                  <div
                    aria-hidden
                    className={`relative inline-flex h-7 w-12 shrink-0 rounded-full transition-colors duration-200 ${form.isLocacao ? "bg-white/30 ring-1 ring-white/60" : "bg-white ring-1 ring-amber-400"}`}
                  >
                    <span className={`pointer-events-none inline-block h-6 w-6 transform rounded-full shadow-md ring-0 transition duration-200 ease-in-out mt-0.5 ${form.isLocacao ? "translate-x-[22px] bg-white" : "translate-x-0.5 bg-amber-500"}`} />
                  </div>
                </button>
                {form.isLocacao && (
                  <div className="bg-amber-50/40 px-4 py-3 space-y-3">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="rounded-lg bg-white border border-amber-200/70 p-2.5 shadow-sm">
                        <label className="flex items-center gap-1.5 text-[10px] font-bold text-amber-700 uppercase tracking-wider mb-1.5">
                          <CalendarDays className="h-3 w-3" /> Início Previsto <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="date"
                          value={form.locacaoDataInicioPrevista}
                          onChange={e => {
                            const ini = e.target.value;
                            setForm(p => {
                              const next = { ...p, locacaoDataInicioPrevista: ini, dataNecessidade: ini };
                              const dias = parseInt(p.locacaoDuracaoDias || "0", 10);
                              if (ini && dias > 0) {
                                const d = new Date(ini + "T00:00:00");
                                d.setDate(d.getDate() + dias);
                                next.locacaoDataFimPrevista = d.toISOString().slice(0, 10);
                              }
                              return next;
                            });
                          }}
                          className="w-full h-9 px-2 text-sm border border-gray-300 rounded-md bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                        />
                        <p className="mt-1 text-[9px] text-amber-700/80 leading-tight">↳ vira a Data de Necessidade da SC</p>
                      </div>
                      <div className="rounded-lg bg-white border border-amber-200/70 p-2.5 shadow-sm">
                        <label className="flex items-center gap-1.5 text-[10px] font-bold text-amber-700 uppercase tracking-wider mb-1.5">
                          <Clock className="h-3 w-3" /> Duração <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            min={1}
                            placeholder="ex.: 30"
                            value={form.locacaoDuracaoDias}
                            onChange={e => {
                              const v = e.target.value;
                              setForm(p => {
                                const next = { ...p, locacaoDuracaoDias: v };
                                const dias = parseInt(v || "0", 10);
                                if (p.locacaoDataInicioPrevista && dias > 0) {
                                  const d = new Date(p.locacaoDataInicioPrevista + "T00:00:00");
                                  d.setDate(d.getDate() + dias);
                                  next.locacaoDataFimPrevista = d.toISOString().slice(0, 10);
                                }
                                return next;
                              });
                            }}
                            className="w-full h-9 pl-2 pr-10 text-sm border border-gray-300 rounded-md bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-amber-600 uppercase">dias</span>
                        </div>
                      </div>
                      <div className="rounded-lg bg-white border border-amber-200/70 p-2.5 shadow-sm">
                        <label className="flex items-center gap-1.5 text-[10px] font-bold text-amber-700 uppercase tracking-wider mb-1.5">
                          <CalendarDays className="h-3 w-3" /> Fim Previsto
                        </label>
                        <input
                          type="date"
                          value={form.locacaoDataFimPrevista}
                          onChange={e => setForm(p => ({ ...p, locacaoDataFimPrevista: e.target.value }))}
                          className="w-full h-9 px-2 text-sm border border-gray-300 rounded-md bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                        />
                      </div>
                    </div>
                    <div className="flex items-start gap-2 rounded-md bg-amber-100/70 border border-amber-300/60 px-3 py-2">
                      <Sparkles className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                      <div className="text-[11px] text-amber-900 leading-snug">
                        <strong>Alerta automático:</strong> o Almoxarifado será notificado{" "}
                        <strong>antes do fim previsto</strong> para programar a devolução do equipamento ao fornecedor.
                        {form.locacaoDataInicioPrevista && form.locacaoDataFimPrevista && form.locacaoDuracaoDias && (
                          <span className="block mt-1 text-amber-800">
                            📅 Período: <strong>{form.locacaoDataInicioPrevista.split("-").reverse().join("/")}</strong>{" "}
                            → <strong>{form.locacaoDataFimPrevista.split("-").reverse().join("/")}</strong>{" "}
                            <span className="font-bold">({form.locacaoDuracaoDias} dias)</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Modo SC: EAP ou Manual */}
            {(form.obraId && form.obraId !== "0") && (
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
                  {orcIdParaDisciplina && (
                    <button
                      type="button"
                      onClick={() => setShowDisciplinas(true)}
                      className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all bg-violet-50 text-violet-700 hover:bg-violet-100 border border-violet-200"
                    >
                      <Layers className="h-3 w-3" /> Por Disciplina
                    </button>
                  )}
                </div>

                {modoSC === "eap" && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
                        <ListTree className="h-3.5 w-3.5 text-amber-600" />
                        {form.tipo === "servico" ? "Composições da EAP — selecione os serviços para contratar" : form.tipo === "equipamento" ? "Serviços da EAP — clique para explodir equipamentos" : form.tipo === "pacote" ? "Serviços da EAP — clique para explodir insumos e mão de obra" : "Serviços da EAP — clique para explodir insumos"}
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
                        <div className="flex flex-wrap items-center gap-x-1 gap-y-1 px-1 text-[10px] text-gray-500">
                          <span className="font-medium text-gray-600 mr-0.5">Legenda:</span>
                          {form.tipo === "servico" ? (
                            <>
                              {[
                                { key: "disponivel", color: "bg-emerald-500", label: "Saldo disponível" },
                                { key: "contratado", color: "bg-purple-500", label: "100% contratado" },
                                { key: "sem_saldo", color: "bg-red-500", label: "Sem saldo" },
                              ].map(lg => (
                                <button key={lg.key} type="button" onClick={() => setEapLegendFilter(prev => prev === lg.key ? null : lg.key)} className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full transition-all cursor-pointer ${eapLegendFilter === lg.key ? "ring-2 ring-offset-1 ring-gray-400 bg-gray-100 font-semibold" : "hover:bg-gray-100"}`}>
                                  <span className={`inline-block w-3 h-3 rounded-full ${lg.color}`} />{lg.label}
                                </button>
                              ))}
                            </>
                          ) : (
                            <>
                              {[
                                { key: "disponivel", color: "bg-emerald-500", label: "Disponível" },
                                { key: "solicitado", color: "bg-blue-500", label: "Solicitado" },
                                { key: "em_cotacao", color: "bg-amber-500", label: "Em cotação" },
                                { key: "comprado", color: "bg-purple-500", label: "100% comprado" },
                                { key: "recebido", color: "bg-rose-500", label: "Recebido" },
                                { key: "estouro", color: "bg-red-700", label: "Estouro" },
                              ].map(lg => (
                                <button key={lg.key} type="button" onClick={() => setEapLegendFilter(prev => prev === lg.key ? null : lg.key)} className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full transition-all cursor-pointer ${eapLegendFilter === lg.key ? "ring-2 ring-offset-1 ring-gray-400 bg-gray-100 font-semibold" : "hover:bg-gray-100"}`}>
                                  <span className={`inline-block w-3 h-3 rounded-full ${lg.color}`} />{lg.label}
                                </button>
                              ))}
                            </>
                          )}
                          {eapLegendFilter && <button type="button" onClick={() => setEapLegendFilter(null)} className="text-[9px] text-red-500 hover:text-red-700 ml-1 font-semibold">✕ Limpar</button>}
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
                                if (it.isComposto || it.tipo === "Composto" || it.servicoCodigo === "composto") return true;
                                if (form.tipo === "servico") return !!it.servicoCodigo && it.temMdo;
                                if (form.tipo === "equipamento") return !!it.servicoCodigo && it.temEquip;
                                if (!it.servicoCodigo) return true;
                                if (form.tipo === "material") return it.temMat !== false;
                                return true;
                              })
                              .filter((it: any) => !eapSearch || stripAccents(`${it.eapCodigo} ${it.descricao}`.toLowerCase()).includes(stripAccents(eapSearch.toLowerCase())))
                              .filter((it: any) => !eapLegendFilter || getEapLegendKey(it) === eapLegendFilter);
                            const allSelected = visibleItems.length > 0 && visibleItems.every((it: any) => selectedEapIds.has(it.id) || (parseFloat(eapQtdServico[it.id] || "") > 0) || itens.some(x => x.eapCodigo && x.eapCodigo === it.eapCodigo));
                            return (
                              <button
                                type="button"
                                onClick={() => {
                                  if (allSelected) {
                                    visibleItems.forEach((it: any) => {
                                      setSelectedEapIds(prev => { const n = new Set(prev); n.delete(it.id); return n; });
                                      setEapQtdServico(prev => { const n = { ...prev }; delete n[it.id]; return n; });
                                    });
                                    setItens(p => p.filter(x => !visibleItems.some((v: any) => v.id === x.orcamentoItemId || (x.eapCodigo && x.eapCodigo === v.eapCodigo))));
                                  } else {
                                    visibleItems.forEach((it: any) => {
                                      if (!selectedEapIds.has(it.id) && !(parseFloat(eapQtdServico[it.id] || "") > 0)) {
                                        if (form.tipo === "servico" || form.tipo === "pacote") {
                                          const mdoSaldo = it.mdoSaldo;
                                          if (mdoSaldo != null && mdoSaldo > 0) {
                                            handleEapQtdChange(it.id, String(mdoSaldo), it);
                                          } else {
                                            const orcQtd = parseFloat(it.quantidade || "0");
                                            const contratado = (it as any).mdoContratado || 0;
                                            const saldoCalc = orcQtd - contratado;
                                            handleEapQtdChange(it.id, saldoCalc > 0 ? String(saldoCalc) : "1", it);
                                          }
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
                          {(() => {
                            const allItems = eapQ.data.items;
                            const isLeaf = (it: any) => {
                              if (it.isComposto || it.tipo === "Composto" || it.servicoCodigo === "composto") return true;
                              if (form.tipo === "servico") return !!it.servicoCodigo && it.servicoCodigo !== "composto" && (it as any).temMdo;
                              if (form.tipo === "equipamento") return !!it.servicoCodigo && it.servicoCodigo !== "composto" && (it as any).temEquip;
                              if (it.tipo === "grupo" || it.tipo === "Etapa/Subetapa") return false;
                              if (!it.servicoCodigo && allItems.some((c: any) => c.eapCodigo !== it.eapCodigo && c.eapCodigo?.startsWith(it.eapCodigo + "."))) return false;
                              if (form.tipo === "material") return (it as any).temMat !== false;
                              return true;
                            };
                            const isGroup = (it: any) => !isLeaf(it);
                            const leafItems = allItems.filter((it: any) => isLeaf(it));
                            const searchMatch = (it: any) => !eapSearch || stripAccents(`${it.eapCodigo} ${it.descricao}`.toLowerCase()).includes(stripAccents(eapSearch.toLowerCase()));
                            const legendMatch = (it: any) => !eapLegendFilter || getEapLegendKey(it) === eapLegendFilter;
                            const filteredLeaves = new Set(leafItems.filter(searchMatch).filter(legendMatch).map((it: any) => it.id));
                            const hasVisibleChild = (groupCode: string) => {
                              return leafItems.some((it: any) => filteredLeaves.has(it.id) && it.eapCodigo?.startsWith(groupCode + "."));
                            };
                            const isSearching = !!eapSearch || !!eapLegendFilter;
                            const isCollapsed = (code: string) => !isSearching && eapTreeCollapsed.has(code);
                            const isHiddenByParent = (code: string) => {
                              const parts = code.split(".");
                              for (let i = 1; i < parts.length; i++) {
                                const parentCode = parts.slice(0, i).join(".");
                                if (isCollapsed(parentCode)) return true;
                              }
                              return false;
                            };
                            const toggleGroup = (code: string) => {
                              setEapTreeCollapsed(prev => {
                                const next = new Set(prev);
                                if (next.has(code)) next.delete(code);
                                else next.add(code);
                                return next;
                              });
                            };
                            const seenGroupCodes = new Set<string>();
                            const visibleItems = allItems.filter((it: any) => {
                              if (isHiddenByParent(it.eapCodigo)) return false;
                              if (isGroup(it)) {
                                if (seenGroupCodes.has(it.eapCodigo)) return false;
                                if (!hasVisibleChild(it.eapCodigo)) return false;
                                seenGroupCodes.add(it.eapCodigo);
                                return true;
                              }
                              return filteredLeaves.has(it.id);
                            });
                            return visibleItems.map((it: any) => {
                              if (isGroup(it)) {
                                const collapsed = isCollapsed(it.eapCodigo);
                                const childLeaves = leafItems.filter((c: any) => filteredLeaves.has(c.id) && c.eapCodigo?.startsWith(it.eapCodigo + "."));
                                const allChildSelected = childLeaves.length > 0 && childLeaves.every((c: any) => selectedEapIds.has(c.id) || (parseFloat(eapQtdServico[c.id] || "") > 0) || itens.some(x => x.eapCodigo && x.eapCodigo === c.eapCodigo));
                                const someChildSelected = childLeaves.some((c: any) => selectedEapIds.has(c.id) || (parseFloat(eapQtdServico[c.id] || "") > 0) || itens.some(x => x.eapCodigo && x.eapCodigo === c.eapCodigo));
                                const indent = Math.max(0, (it.nivel || 1) - 1);
                                return (
                                  <div key={`grp-${it.eapCodigo}-${it.id}`}
                                    className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors hover:bg-gray-50 ${indent === 0 ? "bg-gray-100 border-l-3 border-l-gray-400" : "bg-gray-50/60"}`}
                                    style={{ paddingLeft: `${12 + indent * 20}px` }}
                                    onClick={() => toggleGroup(it.eapCodigo)}
                                  >
                                    {collapsed ? <ChevronRight className="h-4 w-4 text-gray-500 shrink-0" /> : <ChevronDown className="h-4 w-4 text-gray-500 shrink-0" />}
                                    <span className={`font-bold text-xs ${indent === 0 ? "text-gray-800" : "text-gray-700"}`}>
                                      <span className="text-amber-700 mr-1.5">{it.eapCodigo}</span>
                                      {it.descricao?.toUpperCase()}
                                    </span>
                                    {(it.isComposto || it.tipo === "Composto") && (
                                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 shrink-0">COMPOSTO</span>
                                    )}
                                    <span className="ml-auto text-[10px] text-gray-400 shrink-0">{childLeaves.length} item(ns)</span>
                                    {someChildSelected && (
                                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${allChildSelected ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                                        {childLeaves.filter((c: any) => selectedEapIds.has(c.id) || (parseFloat(eapQtdServico[c.id] || "") > 0) || itens.some(x => x.eapCodigo && x.eapCodigo === c.eapCodigo)).length}/{childLeaves.length}
                                      </span>
                                    )}
                                  </div>
                                );
                              }
                              const indent = Math.max(0, (it.nivel || 1) - 1);
                              return ((() => {
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
                                <div key={it.id} className="group">
                                  <div
                                    onClick={() => handleEapExpand(it)}
                                    onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); handleEapDoubleClick(it); }}
                                    className={`flex items-center gap-2.5 py-2 cursor-pointer transition-colors ${expanded ? "bg-amber-50 border-l-2 border-l-amber-500" : isOriginalItem ? "bg-blue-50/50 border-l-2 border-l-blue-400 hover:bg-blue-50" : "hover:bg-gray-50"}`}
                                    style={{ paddingLeft: `${12 + indent * 20}px`, paddingRight: '12px' }}
                                  >
                                    <span className={`inline-block w-4 h-4 rounded-full shrink-0 ${form.tipo === "servico" ? (((it as any).mdoSaldo ?? 0) <= 0 && ((it as any).mdoContratado ?? 0) > 0 ? "bg-purple-500" : ((it as any).mdoSaldo ?? 0) <= 0 ? "bg-red-500" : "bg-emerald-500") : cob && cob.totalInsumos > 0 ? (cob.insumosCobertos >= cob.totalInsumos ? "bg-blue-500" : cob.insumosCobertos > 0 ? "bg-orange-500" : "bg-emerald-500") : "bg-gray-300"} ring-1 ring-white shadow-sm`} title={form.tipo === "servico" ? (((it as any).mdoSaldo ?? 0) <= 0 && ((it as any).mdoContratado ?? 0) > 0 ? "100% contratado" : ((it as any).mdoSaldo ?? 0) <= 0 ? "Sem saldo" : "Disponível") : cob && cob.totalInsumos > 0 ? (cob.insumosCobertos >= cob.totalInsumos ? `Todos ${cob.totalInsumos} insumos solicitados` : cob.insumosCobertos > 0 ? `Parcial: ${cob.insumosCobertos}/${cob.totalInsumos} insumos` : "Disponível") : "Sem info"} />
                                    <input
                                      type="checkbox"
                                      checked={selectedEapIds.has(it.id) || qtdVal > 0 || itens.some(x => x.eapCodigo && x.eapCodigo === it.eapCodigo)}
                                      onClick={(e) => e.stopPropagation()}
                                      onChange={async (e) => {
                                        e.stopPropagation();
                                        const eapMatch = itens.some(x => x.eapCodigo && x.eapCodigo === it.eapCodigo);
                                        if (selectedEapIds.has(it.id) || qtdVal > 0 || eapMatch) {
                                          setItens(p => p.filter(x => x.orcamentoItemId !== it.id && !(x.eapCodigo && x.eapCodigo === it.eapCodigo)));
                                          setSelectedEapIds(prev => { const n = new Set(prev); n.delete(it.id); return n; });
                                          setEapQtdServico(prev => { const n = { ...prev }; delete n[it.id]; return n; });
                                        } else {
                                          if (form.tipo === "servico" || form.tipo === "pacote") {
                                            const mdoSaldo = (it as any).mdoSaldo;
                                            if (mdoSaldo != null && mdoSaldo > 0) {
                                              handleEapQtdChange(it.id, String(mdoSaldo), it);
                                            } else {
                                              const orcQtd = parseFloat(it.quantidade || "0");
                                              const contratado = (it as any).mdoContratado || 0;
                                              const saldoCalc = orcQtd - contratado;
                                              handleEapQtdChange(it.id, saldoCalc > 0 ? String(saldoCalc) : "1", it);
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
                                        {(it.isComposto || it.tipo === "Composto") && (
                                          <span className="ml-2 text-[9px] font-bold px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 shrink-0">COMPOSTO</span>
                                        )}
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
                                          {(it.isComposto || it.tipo === "Composto") && (
                                            <>
                                              {loadingInsumos === it.id ? (
                                                <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
                                                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando insumos da composição...
                                                </div>
                                              ) : insLista && insLista.length > 0 ? (
                                                <div className="space-y-1">
                                                  <div className="text-[10px] text-gray-500 uppercase font-semibold tracking-wide flex items-center gap-1">
                                                    <Package className="h-3 w-3" /> Insumos da composição ({insLista.length})
                                                  </div>
                                                  <div className="bg-white rounded border border-gray-200 divide-y divide-gray-100 max-h-48 overflow-y-auto">
                                                    {insLista.map((ins: any, idx: number) => (
                                                      <div key={idx} className="flex items-center gap-2 px-2.5 py-1.5 text-xs">
                                                        <div className="flex-1 min-w-0">
                                                          <div className="text-gray-900 truncate">{ins.descricao}</div>
                                                          <div className="text-[10px] text-gray-400">Coef: {ins.coeficiente} | {ins.unidade}</div>
                                                        </div>
                                                        <div className="text-right shrink-0 text-gray-600 font-medium">
                                                          {(qtdVal > 0 ? Math.ceil((qtdVal * ins.coeficiente) * 1000) / 1000 : 0).toLocaleString("pt-BR")} {ins.unidade}
                                                        </div>
                                                      </div>
                                                    ))}
                                                  </div>
                                                </div>
                                              ) : insLista && insLista.length === 0 ? (
                                                <div className="text-xs text-gray-400 py-1">Nenhum insumo cadastrado para esta composição.</div>
                                              ) : null}
                                            </>
                                          )}
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
                                          <div className="text-[10px] text-gray-500 uppercase font-semibold tracking-wide flex items-center gap-1 justify-between">
                                            <span className="flex items-center gap-1">
                                              <Package className="h-3 w-3" /> {form.tipo === "servico" ? "Mão de obra" : form.tipo === "pacote" ? "Insumos + Mão de obra" : "Insumos"} da composição ({insLista.length})
                                              {(() => { const selCount = insLista.filter((ins: any) => eapInsumoSel[`${it.id}_${ins.insumoCodigo}`]).length; return selCount > 0 ? <span className="text-amber-600 font-bold">— {selCount} selecionado{selCount > 1 ? "s" : ""}</span> : null; })()}
                                            </span>
                                            {form.tipo !== "servico" && (
                                              <div className="flex gap-2">
                                                <button type="button" className="text-[9px] text-blue-600 hover:text-blue-800 font-semibold" onClick={() => {
                                                  const newSel = { ...eapInsumoSel };
                                                  insLista.forEach((ins: any) => { newSel[`${it.id}_${ins.insumoCodigo}`] = true; });
                                                  setEapInsumoSel(newSel);
                                                  rebuildInsumosItensDirect(it.id, it, qtdVal, newSel, eapInsumoQtdManual);
                                                }}>Todos</button>
                                                <button type="button" className="text-[9px] text-gray-500 hover:text-gray-700 font-semibold" onClick={() => {
                                                  const newSel = { ...eapInsumoSel };
                                                  const newQtd = { ...eapInsumoQtdManual };
                                                  insLista.forEach((ins: any) => { const k = `${it.id}_${ins.insumoCodigo}`; newSel[k] = false; delete newQtd[k]; });
                                                  setEapInsumoSel(newSel);
                                                  setEapInsumoQtdManual(newQtd);
                                                  rebuildInsumosItensDirect(it.id, it, qtdVal, newSel, newQtd);
                                                }}>Nenhum</button>
                                              </div>
                                            )}
                                          </div>
                                          <div className="bg-white rounded border border-gray-200 divide-y divide-gray-100 max-h-64 overflow-y-auto">
                                            {insLista.map((ins: any, idx: number) => {
                                              const selKey = `${it.id}_${ins.insumoCodigo}`;
                                              const isSelected = !!eapInsumoSel[selKey];
                                              const qtdCalc = qtdVal > 0 ? Math.ceil((qtdVal * ins.coeficiente) * 1000) / 1000 : 0;
                                              const insConsolidado = (insumosConsolidadosQ.data ?? []).find((c: any) => c.insumoCodigo === ins.insumoCodigo);
                                              const insStatusGlobal = insConsolidado?.statusInsumo || "disponivel";
                                              const solicitadoNestaComposicao = insConsolidado?.scPorComposicao?.includes(it.id) ?? false;
                                              const insStatusLocal = solicitadoNestaComposicao ? insStatusGlobal : "disponivel";
                                              const insStatusDotColor: Record<string, string> = { disponivel: "bg-emerald-500", solicitado: "bg-blue-500", em_cotacao: "bg-amber-500", comprado: "bg-purple-500", recebido: "bg-rose-500", estouro: "bg-red-700" };
                                              const insStatusLabel: Record<string, string> = { disponivel: "Disponível", solicitado: "Solicitado", em_cotacao: "Em cotação", comprado: "100% comprado", recebido: "Recebido", estouro: "Acima do orçado" };
                                              const saldoGlobal = insConsolidado ? insConsolidado.saldoDisponivel : null;
                                              const saldoReal = saldoGlobal != null ? Math.max(0, saldoGlobal) : null;
                                              const isBloqueado = saldoReal != null && saldoReal <= 0 && !eapExtraDesbloqueado[ins.insumoCodigo];
                                              const isCapado = saldoReal != null && saldoReal > 0 && saldoReal < qtdCalc && !eapExtraDesbloqueado[ins.insumoCodigo];
                                              const isExtra = eapExtraDesbloqueado[ins.insumoCodigo];
                                              const qtdEfetiva = isBloqueado ? 0 : isCapado ? saldoReal! : qtdCalc;
                                              const manualQtdStr = eapInsumoQtdManual[selKey];
                                              const displayQtd = manualQtdStr !== undefined ? manualQtdStr : (isSelected && qtdEfetiva > 0 ? String(qtdEfetiva) : "0");
                                              const insRowBg = !isSelected ? "bg-gray-50/50" : isBloqueado ? "bg-gray-100/80 opacity-60" : isExtra ? "bg-amber-50/60" : isCapado ? "bg-yellow-50/50" : insStatusLocal === "estouro" ? "bg-red-50/60" : insStatusLocal === "comprado" ? "bg-purple-50/50" : insStatusLocal === "recebido" ? "bg-rose-50/50" : "";
                                              return (
                                                <div key={idx} className={`flex items-center gap-2 px-2.5 py-2 text-xs ${insRowBg} cursor-pointer hover:bg-blue-50/40 transition-colors`} onClick={() => toggleInsumoSel(it.id, ins, it)}>
                                                  <input type="checkbox" checked={isSelected} onChange={() => {}} className="shrink-0 h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500 cursor-pointer" />
                                                  <span className={`shrink-0 w-2.5 h-2.5 rounded-full ${isBloqueado ? "bg-gray-400" : insStatusDotColor[insStatusLocal] || "bg-emerald-500"}`} title={isBloqueado ? "Saldo esgotado" : solicitadoNestaComposicao ? insStatusLabel[insStatusLocal] : (insStatusGlobal !== "disponivel" ? `Disponível nesta composição (${insStatusLabel[insStatusGlobal]} em outras)` : "Disponível")} />
                                                  <div className="flex-1 min-w-0">
                                                    <div className="text-gray-900 truncate flex items-center gap-1 flex-wrap">
                                                      {ins.descricao}
                                                      {isBloqueado && <span className="text-[8px] px-1 rounded font-bold bg-gray-200 text-gray-600">SALDO ESGOTADO</span>}
                                                      {isCapado && <span className="text-[8px] px-1 rounded font-bold bg-yellow-100 text-yellow-700">LIMITADO AO SALDO</span>}
                                                      {isExtra && <span className="text-[8px] px-1 rounded font-bold bg-amber-100 text-amber-700">EXTRA-ORÇAMENTO</span>}
                                                      {!isBloqueado && !isCapado && !isExtra && solicitadoNestaComposicao && insStatusLocal !== "disponivel" && <span className={`text-[8px] px-1 rounded font-bold ${insStatusLocal === "estouro" ? "bg-red-100 text-red-700" : insStatusLocal === "comprado" ? "bg-purple-100 text-purple-700" : insStatusLocal === "recebido" ? "bg-rose-100 text-rose-700" : insStatusLocal === "em_cotacao" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"}`}>{insStatusLabel[insStatusLocal]}</span>}
                                                      {!isBloqueado && !isCapado && !isExtra && !solicitadoNestaComposicao && insStatusGlobal !== "disponivel" && <span className="text-[8px] px-1 rounded font-medium bg-gray-100 text-gray-500">{insStatusLabel[insStatusGlobal]} em outra comp.</span>}
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
                                                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                                      <input
                                                        type="number" min="0" step="0.001"
                                                        className={`w-20 h-6 px-1.5 text-xs rounded border text-right outline-none focus:ring-1 ${isSelected ? "bg-white border-amber-300 focus:border-amber-400 focus:ring-amber-200 text-gray-900 font-semibold" : "bg-gray-100 border-gray-200 text-gray-400"}`}
                                                        value={displayQtd}
                                                        disabled={!isSelected && !qtdVal}
                                                        onChange={(e) => handleInsumoQtdManual(it.id, ins, e.target.value, it)}
                                                      />
                                                      <span className="text-[10px] text-gray-500 font-medium w-8">{ins.unidade}</span>
                                                    </div>
                                                  </div>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        </div>
                                      ) : insLista && insLista.length === 0 ? (
                                        <div className="text-xs text-gray-400 py-1">Nenhum insumo cadastrado para esta composição.</div>
                                      ) : !it.servicoCodigo ? (
                                        <div className="flex items-center gap-2 text-xs text-orange-600 bg-orange-50 border border-orange-200 rounded px-2.5 py-2 mt-1">
                                          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                          <span>Este item nao possui codigo de composição vinculado no orçamento. Vincule o codigo da composição no modulo de Orcamento para ver os insumos detalhados aqui, ou use o <strong>modo Manual</strong> para adicionar itens diretamente.</span>
                                        </div>
                                      ) : null}

                                      {form.tipo !== "servico" && expanded && (
                                        <div className="mt-2 space-y-1.5">
                                          {itens.filter(x => x.orcamentoItemId === it.id && !x.insumoCodigo && !x.origemEap).length > 0 && (
                                            <div className="text-[10px] text-gray-500 uppercase font-semibold tracking-wide flex items-center gap-1">
                                              <Package className="h-3 w-3" /> Itens avulsos vinculados ({itens.filter(x => x.orcamentoItemId === it.id && !x.insumoCodigo && !x.origemEap).length})
                                            </div>
                                          )}
                                          {itens.map((avIt, avIdx) => {
                                            if (avIt.orcamentoItemId !== it.id || avIt.insumoCodigo || avIt.origemEap) return null;
                                            return (
                                              <div key={`av-${avIdx}`} className="bg-orange-50/60 border border-orange-200 rounded px-2.5 py-2 space-y-1.5">
                                                <div className="flex gap-2 items-end">
                                                  <div className="flex-1 min-w-0">
                                                    <label className="block text-[9px] font-bold text-orange-700 uppercase tracking-wider leading-none mb-0.5 px-0.5">Descrição</label>
                                                    <input
                                                      className="w-full h-7 px-2 text-xs rounded border border-orange-300 bg-white text-gray-900 placeholder-gray-400 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-300"
                                                      placeholder="Descrição do produto *"
                                                      value={avIt.descricao}
                                                      onClick={e => e.stopPropagation()}
                                                      onChange={e => { const v = e.target.value; setItens(p => p.map((x, i) => i === avIdx ? { ...x, descricao: v } : x)); }}
                                                    />
                                                  </div>
                                                  <div className="shrink-0">
                                                    <label className="block text-[9px] font-bold text-orange-700 uppercase tracking-wider leading-none mb-0.5 px-0.5">Un</label>
                                                    <Select value={avIt.unidade} onValueChange={v => setItens(p => p.map((x, i) => i === avIdx ? { ...x, unidade: v } : x))}>
                                                      <SelectTrigger className="w-[72px] h-7 text-xs font-semibold border-orange-300 bg-white text-gray-900 px-2" onClick={e => e.stopPropagation()}><SelectValue /></SelectTrigger>
                                                      <SelectContent className="bg-white border-gray-200">
                                                        {UNIDADES.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                                                      </SelectContent>
                                                    </Select>
                                                  </div>
                                                  <div className="shrink-0">
                                                    <label className="block text-[9px] font-bold text-orange-700 uppercase tracking-wider leading-none mb-0.5 px-0.5">Qtd</label>
                                                    <input
                                                      className="w-24 h-7 px-2 text-xs font-semibold text-right rounded border border-orange-300 bg-white text-gray-900 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-300"
                                                      type="number" min="0.001" step="0.001" placeholder="0"
                                                      value={avIt.quantidade}
                                                      onClick={e => e.stopPropagation()}
                                                      onChange={e => { const v = e.target.value; setItens(p => p.map((x, i) => i === avIdx ? { ...x, quantidade: v } : x)); }}
                                                    />
                                                  </div>
                                                  <button onClick={e => { e.stopPropagation(); setItens(p => p.filter((_, i) => i !== avIdx)); }} className="text-gray-400 hover:text-red-500 self-end mb-1">
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                  </button>
                                                </div>
                                                <input
                                                  className="w-full h-7 px-2 text-xs rounded border border-orange-200 bg-white text-gray-700 placeholder-gray-400 outline-none focus:border-amber-400"
                                                  placeholder="Especificação do produto (ex: marca, modelo, referência)"
                                                  value={avIt.observacoes}
                                                  onClick={e => e.stopPropagation()}
                                                  onChange={e => { const v = e.target.value; setItens(p => p.map((x, i) => i === avIdx ? { ...x, observacoes: v } : x)); }}
                                                />
                                                <div className="flex items-center gap-1 text-[9px] text-orange-600 font-medium">
                                                  <AlertTriangle className="h-2.5 w-2.5" /> Item fora da composição — usa verba de {it.eapCodigo}
                                                </div>
                                              </div>
                                            );
                                          })}
                                          <button
                                            type="button"
                                            onClick={e => {
                                              e.stopPropagation();
                                              setItens(p => [...p, {
                                                descricao: "",
                                                unidade: "un",
                                                quantidade: "1",
                                                observacoes: "",
                                                orcamentoItemId: it.id,
                                                eapCodigo: it.eapCodigo,
                                                origemEap: false,
                                              }]);
                                            }}
                                            className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-semibold text-orange-700 bg-orange-50 hover:bg-orange-100 border border-orange-300 rounded transition-colors"
                                          >
                                            <Plus className="h-3 w-3" /> Item avulso neste orçamento
                                          </button>
                                        </div>
                                      )}
                                        </>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })());
                            });
                          })()}
                          {eapQ.data.items.length === 0 && (
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

                {sugestaoAberta && sugestoesContratQ.data && (sugestoesContratQ.data.atividadesRelacionadas.length > 0 || sugestoesContratQ.data.fornecedoresSugeridos.length > 0) && (
                  <div className="mt-3 space-y-2">
                    {sugestoesContratQ.data.atividadesRelacionadas.length > 0 && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg overflow-hidden">
                        <div className="px-3 py-2 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Zap className="h-3.5 w-3.5 text-blue-600" />
                            <span className="text-xs font-semibold text-blue-800">
                              Sugestão: +{sugestoesContratQ.data.totalDisponiveis} atividade{sugestoesContratQ.data.totalDisponiveis > 1 ? "s" : ""} relacionada{sugestoesContratQ.data.totalDisponiveis > 1 ? "s" : ""} disponíve{sugestoesContratQ.data.totalDisponiveis > 1 ? "is" : "l"} no grupo {sugestoesContratQ.data.grupoEap}
                            </span>
                          </div>
                          <button type="button" onClick={() => setSugestaoAberta(false)} className="text-blue-400 hover:text-blue-600">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <p className="px-3 text-[10px] text-blue-600 -mt-1 mb-1.5">Incluir mais atividades pode gerar economia na contratação por volume.</p>
                        <div className="max-h-[120px] overflow-y-auto divide-y divide-blue-100">
                          {sugestoesContratQ.data.atividadesRelacionadas.map((s: any) => {
                            const jaIncluido = selectedEapIds.has(s.id);
                            return (
                              <div key={s.id} className={`px-3 py-1.5 flex items-center justify-between text-xs ${jaIncluido ? "bg-blue-100" : "hover:bg-blue-100/50"}`}>
                                <div className="flex-1 min-w-0">
                                  <span className="font-mono text-blue-700 mr-1.5">{s.eapCodigo}</span>
                                  <span className="text-gray-700">{s.descricao}</span>
                                  <span className="text-gray-400 ml-1">({parseFloat(s.quantidade || "0").toLocaleString("pt-BR")} {s.unidade})</span>
                                </div>
                                {jaIncluido ? (
                                  <span className="text-[10px] text-blue-600 font-semibold flex items-center gap-0.5"><CheckCircle2 className="h-3 w-3" /> Incluído</span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const eapItems = eapQ.data?.items;
                                      const found = eapItems?.find((e: any) => e.id === s.id);
                                      if (found) {
                                        if (form.tipo === "servico") {
                                          const mdoSaldo = (found as any).mdoSaldo;
                                          handleEapQtdChange(found.id, mdoSaldo > 0 ? String(mdoSaldo) : "1", found);
                                        } else {
                                          toggleEapItem(found);
                                        }
                                      }
                                    }}
                                    className="text-[10px] font-semibold text-blue-700 bg-white border border-blue-300 rounded px-2 py-0.5 hover:bg-blue-100 transition-colors"
                                  >
                                    + Incluir
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {sugestoesContratQ.data.fornecedoresSugeridos.length > 0 && (
                      <div className="bg-emerald-50 border border-emerald-200 rounded-lg overflow-hidden">
                        <div className="px-3 py-2 flex items-center gap-2">
                          <Users className="h-3.5 w-3.5 text-emerald-600" />
                          <span className="text-xs font-semibold text-emerald-800">Fornecedores que já realizaram serviços similares</span>
                        </div>
                        <div className="max-h-[100px] overflow-y-auto divide-y divide-emerald-100">
                          {sugestoesContratQ.data.fornecedoresSugeridos.map((f: any) => (
                            <div key={f.fornecedorId} className="px-3 py-1.5 flex items-center justify-between text-xs">
                              <div className="flex-1 min-w-0">
                                <span className="font-semibold text-gray-800">{f.nomeFantasia || f.razaoSocial}</span>
                                {f.cidade && <span className="text-gray-400 ml-1">({f.cidade}/{f.estado})</span>}
                                {f.obraNome && <span className="text-gray-400 ml-1.5 text-[10px]">Obra: {f.obraNome}</span>}
                              </div>
                              <div className="flex items-center gap-2">
                                {f.alertaConcentracao && (
                                  <span className="text-[9px] font-bold text-red-600 bg-red-50 border border-red-200 rounded px-1.5 py-0.5 flex items-center gap-0.5">
                                    <AlertTriangle className="h-2.5 w-2.5" />
                                    {f.qtdContratosAtivos} contratos ativos
                                  </span>
                                )}
                                {!f.alertaConcentracao && f.qtdContratosAtivos > 0 && (
                                  <span className="text-[9px] text-gray-500">{f.qtdContratosAtivos} contrato{f.qtdContratosAtivos > 1 ? "s" : ""}</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
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
                  <div className="text-xs text-gray-500 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 space-y-1">
                    <div className="flex items-center gap-1.5">
                      <FileText className="h-3 w-3 text-blue-500 shrink-0" />
                      Modo manual — adicione os itens livremente na seção abaixo.
                    </div>
                    {form.obraId && parseInt(form.obraId) > 0 && (
                      <div className="flex items-center gap-1.5 text-orange-600 text-[10px] font-medium">
                        <AlertTriangle className="h-3 w-3 shrink-0" />
                        Itens sem vínculo à EAP serão marcados como "fora do orçamento" e exigirão verba realocada na cotação.
                      </div>
                    )}
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

            {/* Data | Prioridade — quando isLocacao, a Data de Necessidade
                vira espelho do "Início Previsto" (não duplicar input). */}
            <div className={form.isLocacao ? "" : "grid grid-cols-2 gap-2"}>
              {!form.isLocacao && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-700">Data de Necessidade</label>
                  <input
                    type="date"
                    className="w-full h-8 px-3 text-sm rounded-md border border-gray-300 bg-white text-gray-900 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-300"
                    value={form.dataNecessidade}
                    onChange={e => setForm(p => ({ ...p, dataNecessidade: e.target.value }))}
                  />
                </div>
              )}
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

            {/* Anexos (imagens, PDFs, vídeos) */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">Anexos (opcional)</label>
              <input ref={fileInputRef} type="file" accept="image/*,application/pdf,video/mp4,video/quicktime,video/avi,video/x-matroska" multiple className="hidden" onChange={e => { if (e.target.files) handleMultipleFiles(e.target.files); e.target.value = ""; }} />
              <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleImagemFile(f); e.target.value = ""; }} />
              <div
                className={`rounded-lg border-2 border-dashed p-3 transition-colors ${anexoDragOver ? "border-blue-400 bg-blue-50" : "border-gray-200 bg-gray-50 hover:border-gray-300"}`}
                onDragOver={e => { e.preventDefault(); setAnexoDragOver(true); }}
                onDragLeave={() => setAnexoDragOver(false)}
                onDrop={e => { e.preventDefault(); setAnexoDragOver(false); if (e.dataTransfer.files?.length) handleMultipleFiles(e.dataTransfer.files); }}
              >
                {pendingAnexos.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {pendingAnexos.map((anx, idx) => (
                      <div key={idx} className="relative group">
                        {anx.tipo === "imagem" && anx.preview ? (
                          <img src={anx.preview} alt={anx.nome} className="h-20 w-20 rounded-lg border border-gray-200 object-cover" />
                        ) : anx.tipo === "pdf" ? (
                          <div className="h-20 w-20 rounded-lg border border-gray-200 bg-red-50 flex flex-col items-center justify-center">
                            <FileText className="h-6 w-6 text-red-500" />
                            <span className="text-[9px] text-red-600 mt-1">PDF</span>
                          </div>
                        ) : (
                          <div className="h-20 w-20 rounded-lg border border-gray-200 bg-blue-50 flex flex-col items-center justify-center">
                            <Film className="h-6 w-6 text-blue-500" />
                            <span className="text-[9px] text-blue-600 mt-1">Vídeo</span>
                          </div>
                        )}
                        <button type="button" onClick={() => setPendingAnexos(prev => prev.filter((_, i) => i !== idx))} className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 opacity-0 group-hover:opacity-100 transition-opacity">
                          <X className="h-3 w-3" />
                        </button>
                        <div className="text-[9px] text-gray-500 mt-0.5 truncate max-w-[80px]">{anx.nome}</div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50">
                    <Paperclip className="h-3.5 w-3.5" /> Anexar Arquivo
                  </button>
                  <button type="button" onClick={() => cameraInputRef.current?.click()} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50">
                    <Camera className="h-3.5 w-3.5" /> Câmera
                  </button>
                  <span className="text-xs text-gray-400">ou arraste arquivos aqui</span>
                </div>
              </div>
              {uploadingImagem && <div className="text-xs text-blue-600 mt-1">Enviando anexos...</div>}
            </div>

            {/* Itens Solicitados */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-gray-700">
                  Itens Solicitados * {itens.filter(i => i.descricao.trim()).length > 0 && (
                    <span className="text-gray-400 font-normal ml-1">({itens.filter(i => i.descricao.trim()).length} ite{itens.filter(i => i.descricao.trim()).length === 1 ? "m" : "ns"})</span>
                  )}
                </label>
                <button
                  type="button"
                  onClick={() => setItens(p => [...p, newItem()])}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold border border-amber-300 rounded-md bg-amber-50 text-amber-700 hover:bg-amber-100 hover:border-amber-400 transition shadow-sm"
                  title="Adicionar outro item à esta Solicitação"
                >
                  <Plus className="h-3.5 w-3.5" /> Adicionar Item
                </button>
              </div>

              {(itens.filter(i => i.origemEap).length > 0 || (modoSC === "eap" && itens.filter(i => !i.origemEap && i.orcamentoItemId && i.descricao.trim()).length > 0)) ? (
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
                  {itens.filter(i => !i.origemEap && i.orcamentoItemId && i.descricao.trim()).map((avIt, idx) => (
                    <div key={`av-sum-${idx}`} className="flex items-center gap-2 p-2 rounded-lg bg-orange-50/50 border border-orange-200/50 text-xs">
                      <AlertTriangle className="h-3 w-3 text-orange-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-gray-900 truncate flex items-center gap-1 flex-wrap">
                          {avIt.descricao}
                          <span className="text-[8px] px-1 rounded font-bold bg-orange-100 text-orange-700">AVULSO</span>
                          {avIt.eapCodigo && <span className="text-[9px] text-gray-500">verba: {avIt.eapCodigo}</span>}
                        </div>
                        {avIt.observacoes && (
                          <div className="text-[10px] text-gray-500 italic truncate">{avIt.observacoes}</div>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-semibold text-gray-700">{parseFloat(avIt.quantidade).toLocaleString("pt-BR")} {avIt.unidade}</div>
                      </div>
                    </div>
                  ))}
                  {/* Rev. 2290 — Editor inline para items soltos adicionados via "+ Adicionar Item"
                      mesmo quando há itens EAP (modos Via EAP / Por Disciplina / Por Insumo). */}
                  {(() => {
                    const idxsSolo = itens.map((it, i) => ({ it, i })).filter(x => !x.it.origemEap && !x.it.orcamentoItemId);
                    if (idxsSolo.length === 0) return null;
                    return (
                      <div className="mt-2 pt-2 border-t border-dashed border-amber-300/60 space-y-1.5">
                        <div className="flex items-center gap-1.5 text-[10px] font-semibold text-amber-700 uppercase tracking-wide px-1">
                          <Plus className="h-3 w-3" /> Itens avulsos adicionados ({idxsSolo.length})
                          <span className="text-amber-600/70 font-normal normal-case tracking-normal">— sem vínculo com EAP, exigem verba realocada</span>
                        </div>
                        {idxsSolo.map(({ it, i: idx }) => (
                          <div key={`solo-edit-${idx}`} className="p-2 rounded-lg border bg-orange-50/50 border-orange-200 space-y-1.5">
                            <div className="flex gap-2 items-end">
                              <div className="flex-1 min-w-0">
                                <label className="block text-[9px] font-bold text-orange-700 uppercase tracking-wider leading-none mb-0.5 px-0.5">Descrição</label>
                                <input
                                  className="w-full h-7 px-2 text-xs rounded border border-orange-300 bg-white text-gray-900 placeholder-gray-400 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-300"
                                  placeholder="Descrição do item *"
                                  value={it.descricao}
                                  onChange={e => setItens(p => p.map((x, j) => j === idx ? { ...x, descricao: e.target.value } : x))}
                                  onBlur={e => setItens(p => p.map((x, j) => j === idx ? { ...x, descricao: normalizarTexto(e.target.value) } : x))}
                                />
                              </div>
                              <div className="shrink-0">
                                <label className="block text-[9px] font-bold text-orange-700 uppercase tracking-wider leading-none mb-0.5 px-0.5">Un</label>
                                <Select value={it.unidade} onValueChange={v => setItens(p => p.map((x, j) => j === idx ? { ...x, unidade: v } : x))}>
                                  <SelectTrigger className="w-[72px] h-7 text-xs font-semibold border-orange-300 bg-white text-gray-900 px-2"><SelectValue /></SelectTrigger>
                                  <SelectContent className="bg-white border-gray-200">
                                    {UNIDADES.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="shrink-0">
                                <label className="block text-[9px] font-bold text-orange-700 uppercase tracking-wider leading-none mb-0.5 px-0.5">Qtd</label>
                                <input
                                  className="w-24 h-7 px-2 text-xs font-semibold text-right rounded border border-orange-300 bg-white text-gray-900 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-300"
                                  type="number" min="0.001" step="0.001" placeholder="0"
                                  value={it.quantidade}
                                  onChange={e => setItens(p => p.map((x, j) => j === idx ? { ...x, quantidade: e.target.value } : x))}
                                />
                              </div>
                              <button
                                type="button"
                                onClick={() => setItens(p => p.filter((_, j) => j !== idx))}
                                className="text-gray-400 hover:text-red-500 self-end mb-1"
                                title="Remover item"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            <input
                              className="w-full h-7 px-2 text-xs rounded border border-orange-200 bg-white text-gray-700 placeholder-gray-400 outline-none focus:border-amber-400"
                              placeholder="Especificação do produto (ex: marca, modelo, referência)"
                              value={it.observacoes}
                              onChange={e => setItens(p => p.map((x, j) => j === idx ? { ...x, observacoes: e.target.value } : x))}
                            />
                            {(() => {
                              const qtd = parseFloat(it.quantidade) || 0;
                              const conv = getConversaoManual(it.descricao, it.unidade, qtd);
                              if (!conv) return null;
                              return (
                                <div className="flex items-center gap-1.5 text-[9px] text-purple-700 bg-purple-50 border border-purple-200 rounded px-2 py-1">
                                  <ArrowRightLeft className="h-2.5 w-2.5 shrink-0 text-purple-500" />
                                  <span>Padrão de compra: <strong>{conv.display}</strong></span>
                                  <button
                                    type="button"
                                    onClick={() => setItens(p => p.map((x, j) => j === idx ? { ...x, unidade: conv.unidadeNova, quantidade: String(Math.ceil(conv.qtdNova)) } : x))}
                                    className="ml-auto px-1.5 py-0.5 rounded bg-purple-600 text-white font-semibold hover:bg-purple-700 transition text-[9px]"
                                  >
                                    Converter
                                  </button>
                                </div>
                              );
                            })()}
                            {it.descricao.trim() && (
                              <div className="flex items-center gap-1 text-[9px] text-orange-600 font-medium">
                                <AlertTriangle className="h-2.5 w-2.5" /> Item fora do orçamento — será necessário verba realocada para liberar OC/OS
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              ) : modoSC === "eap" ? (
                <div className="text-xs text-gray-400 bg-gray-50 border border-gray-200 rounded-lg px-3 py-3 text-center">
                  Selecione um serviço acima e informe a quantidade para gerar os itens automaticamente.
                </div>
              ) : (() => {
                const eapItems = eapQ.data?.items ?? [];
                const eapLeafItems = eapItems.filter((e: any) => e.nivel >= 2 && e.tipo !== "grupo");
                // Agrupar itens consecutivos pelo orcamentoItemId. Itens sem vínculo são grupos solo.
                type Grupo = { key: string; orcamentoItemId?: number; linkedEap: any | null; indices: number[] };
                const grupos: Grupo[] = [];
                itens.forEach((it, idx) => {
                  if (it.orcamentoItemId) {
                    const ultimo = grupos[grupos.length - 1];
                    if (ultimo && ultimo.orcamentoItemId === it.orcamentoItemId) {
                      ultimo.indices.push(idx);
                      return;
                    }
                    const linkedEap = eapLeafItems.find((e: any) => e.id === it.orcamentoItemId) || null;
                    grupos.push({ key: `eap-${it.orcamentoItemId}-${idx}`, orcamentoItemId: it.orcamentoItemId, linkedEap, indices: [idx] });
                  } else {
                    grupos.push({ key: `solo-${idx}`, linkedEap: null, indices: [idx] });
                  }
                });

                const renderInsumoRow = (idx: number, isChild: boolean) => {
                  const it = itens[idx];
                  return (
                    <div key={idx} className={`p-2 rounded-lg border space-y-1.5 ${!it.orcamentoItemId && it.descricao.trim() ? "bg-orange-50/50 border-orange-200" : isChild ? "bg-white border-emerald-100" : "bg-gray-50 border-gray-200"}`}>
                      <div className="flex gap-2 items-end">
                        <div className="flex-1 min-w-0">
                          <label className="block text-[9px] font-bold text-gray-500 uppercase tracking-wider leading-none mb-0.5 px-0.5">Descrição</label>
                          <ItemDescricaoInput
                            companyId={companyId}
                            value={it.descricao}
                            placeholder={isChild ? "Descrição do insumo *" : "Descrição do item *"}
                            className="w-full h-7 px-2 text-xs rounded border border-gray-300 bg-white text-gray-900 placeholder-gray-400 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-300"
                            onChange={v => setItens(p => p.map((x, i) => i === idx ? { ...x, descricao: v } : x))}
                            onBlur={v => setItens(p => p.map((x, i) => i === idx ? { ...x, descricao: normalizarTexto(v) } : x))}
                            onSelectUnidade={u => setItens(p => p.map((x, i) => i === idx ? { ...x, unidade: u } : x))}
                          />
                        </div>
                        <div className="shrink-0">
                          <label className="block text-[9px] font-bold text-gray-500 uppercase tracking-wider leading-none mb-0.5 px-0.5">Un</label>
                          <Select value={it.unidade} onValueChange={v => setItens(p => p.map((x, i) => i === idx ? { ...x, unidade: v } : x))}>
                            <SelectTrigger className="w-[72px] h-7 text-xs font-semibold border-gray-300 bg-white text-gray-900 px-2"><SelectValue /></SelectTrigger>
                            <SelectContent className="bg-white border-gray-200">
                              {UNIDADES.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="shrink-0">
                          <label className="block text-[9px] font-bold text-gray-500 uppercase tracking-wider leading-none mb-0.5 px-0.5">Qtd</label>
                          <input
                            className="w-24 h-7 px-2 text-xs font-semibold text-right rounded border border-gray-300 bg-white text-gray-900 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-300"
                            type="number" min="0.001" step="0.001" placeholder="0"
                            value={it.quantidade}
                            onChange={e => setItens(p => p.map((x, i) => i === idx ? { ...x, quantidade: e.target.value } : x))}
                          />
                        </div>
                        {itens.length > 1 && (
                          <button onClick={() => setItens(p => p.filter((_, i) => i !== idx))} className="text-gray-400 hover:text-red-500" title="Remover este insumo">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      <input
                        className="w-full h-7 px-2 text-xs rounded border border-gray-200 bg-white text-gray-700 placeholder-gray-400 outline-none focus:border-amber-400"
                        placeholder="Especificação do produto (ex: marca, modelo, referência)"
                        value={it.observacoes}
                        onChange={e => setItens(p => p.map((x, i) => i === idx ? { ...x, observacoes: e.target.value } : x))}
                      />
                      {it.descricao.trim().length >= 3 && (
                        <UltimaCompraCard companyId={companyId} descricao={it.descricao} />
                      )}
                      {(() => {
                        const qtd = parseFloat(it.quantidade) || 0;
                        const conv = getConversaoManual(it.descricao, it.unidade, qtd);
                        if (!conv) return null;
                        return (
                          <div className="flex items-center gap-1.5 text-[9px] text-purple-700 bg-purple-50 border border-purple-200 rounded px-2 py-1">
                            <ArrowRightLeft className="h-2.5 w-2.5 shrink-0 text-purple-500" />
                            <span>Padrão de compra: <strong>{conv.display}</strong></span>
                            <button
                              type="button"
                              onClick={() => setItens(p => p.map((x, i) => i === idx ? { ...x, unidade: conv.unidadeNova, quantidade: String(Math.ceil(conv.qtdNova)) } : x))}
                              className="ml-auto px-1.5 py-0.5 rounded bg-purple-600 text-white font-semibold hover:bg-purple-700 transition text-[9px]"
                            >
                              Converter
                            </button>
                          </div>
                        );
                      })()}
                    </div>
                  );
                };

                return (
                  <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
                    {grupos.map(g => {
                      // GRUPO COM EAP VINCULADA — header único + lista de insumos
                      if (g.linkedEap) {
                        const ep = g.linkedEap;
                        const firstIdx = g.indices[0];
                        return (
                          <div key={g.key} className="border border-emerald-200 rounded-lg bg-emerald-50/30 overflow-hidden">
                            <div className="flex items-center gap-1.5 px-2 py-1.5 bg-emerald-50 border-b border-emerald-200 text-[11px]">
                              <Link2 className="h-3 w-3 text-emerald-600 shrink-0" />
                              <span className="text-emerald-800 font-medium truncate flex-1">
                                Item EAP <span className="font-bold">{ep.eapCodigo}</span> — {ep.descricao}
                              </span>
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200 shrink-0">
                                {g.indices.length} insumo{g.indices.length > 1 ? "s" : ""}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setItens(prev => prev.map(x => x.orcamentoItemId === ep.id ? { ...x, orcamentoItemId: undefined, eapCodigo: undefined, origemEap: false } : x));
                                }}
                                className="text-red-400 hover:text-red-600 shrink-0"
                                title="Desvincular todos os insumos deste item EAP"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                            <div className="p-2 space-y-1.5">
                              {g.indices.map(i => renderInsumoRow(i, true))}
                              <button
                                type="button"
                                onClick={() => {
                                  const novo: ItemForm = {
                                    descricao: "",
                                    unidade: "un",
                                    quantidade: "1",
                                    observacoes: "",
                                    orcamentoItemId: ep.id,
                                    eapCodigo: ep.eapCodigo,
                                  };
                                  setItens(prev => {
                                    const novos = [...prev];
                                    const lastIdx = g.indices[g.indices.length - 1];
                                    novos.splice(lastIdx + 1, 0, novo);
                                    return novos;
                                  });
                                }}
                                className="w-full inline-flex items-center justify-center gap-1 px-2 py-1 text-[10px] font-medium text-emerald-700 hover:text-emerald-900 hover:bg-emerald-100 rounded border border-dashed border-emerald-300 transition"
                              >
                                <Plus className="h-3 w-3" /> Adicionar outro insumo neste item EAP
                              </button>
                            </div>
                          </div>
                        );
                      }
                      // GRUPO SOLO — sem EAP vinculada
                      const idx = g.indices[0];
                      const it = itens[idx];
                      return (
                        <div key={g.key} className="space-y-1">
                          {renderInsumoRow(idx, false)}
                          {!it.orcamentoItemId && it.descricao.trim() && (
                            <div className="flex items-center gap-1 px-2 text-[9px] text-orange-600 font-medium">
                              <AlertTriangle className="h-2.5 w-2.5" /> Item fora do orçamento — será necessário verba realocada para liberar OC/OS
                            </div>
                          )}
                          {form.obraId && parseInt(form.obraId) > 0 && eapLeafItems.length > 0 && (
                            <ManualEapLink
                              eapItems={eapLeafItems}
                              linkedEap={null}
                              onLink={(eapItem: any) => setItens(p => p.map((x, i) => i === idx ? { ...x, orcamentoItemId: eapItem.id, eapCodigo: eapItem.eapCodigo } : x))}
                              onLinkMultiple={(eapList: any[]) => {
                                if (!eapList.length) return;
                                // Rev. 2732: vincular um MATERIAL digitado pelo usuário a uma etapa da EAP é
                                // apenas um vínculo orçamentário ("Vinculado a:") — NÃO pode DUPLICAR a linha
                                // (antes mantinha a linha original E inseria a nova logo abaixo, gerando o item
                                // "fantasma": material + etapa, com a etapa caindo "S/ VERBA" na cotação) nem
                                // trocar a unidade/descrição do item pela da etapa. A 1ª etapa selecionada
                                // vincula NA PRÓPRIA linha (in place, idêntico ao onLink — preserva todos os
                                // campos do item). Etapas ADICIONAIS viram linhas novas (a própria etapa).
                                // Linha vazia (sem descrição/sem vínculo): a 1ª etapa VIRA a própria etapa.
                                const isRowEmpty = !it.descricao.trim() && !it.orcamentoItemId;
                                const [primeira, ...resto] = eapList;
                                const novosResto: ItemForm[] = resto.map((e: any) => ({
                                  descricao: e.descricao || "",
                                  unidade: e.unidade || "un",
                                  quantidade: it.quantidade || "1",
                                  observacoes: "",
                                  orcamentoItemId: e.id,
                                  eapCodigo: e.eapCodigo,
                                }));
                                const linkedRow: ItemForm = isRowEmpty
                                  ? {
                                      descricao: primeira.descricao || "",
                                      unidade: primeira.unidade || "un",
                                      quantidade: it.quantidade || "1",
                                      observacoes: "",
                                      orcamentoItemId: primeira.id,
                                      eapCodigo: primeira.eapCodigo,
                                    }
                                  : { ...it, orcamentoItemId: primeira.id, eapCodigo: primeira.eapCodigo };
                                setItens(prev => {
                                  const novos = [...prev];
                                  novos.splice(idx, 1, linkedRow, ...novosResto);
                                  return novos;
                                });
                              }}
                              onUnlink={() => {}}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

          </div>{/* fim space-y-3 */}
          </div>{/* fim corpo rolável */}

          {/* Rodapé fixo com botões */}
          <div className="px-5 py-3 border-t border-gray-100 bg-white shrink-0 flex gap-2">
              <button
                onClick={tentarFecharNova}
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

      {/* ── Rev. 2292 — Dialog "Descartar solicitação?" redesenhado no padrão FC ──
          Antes: caixa branca simples, título sem ícone, botões empilhados sem
          hierarquia clara, scrollbar horizontal vazia abaixo dos botões.
          Agora (mesmo padrão dos demais modais — Rev. 1983 "Itens sem verba"):
          - DialogContent p-0 overflow-hidden flex-col, sem scrollbar fantasma
          - Header com faixa âmbar sutil + ícone AlertTriangle em pill + título
            bold + subtítulo curto explicando a ação
          - Corpo px-5 py-4 com mensagem destacada em card âmbar leve
          - Footer sticky com borda superior: ação primária (Salvar) full-width
            destacada em âmbar, depois linha c/ "Continuar editando" (neutro) e
            "Descartar" (vermelho) — hierarquia visual clara */}
      <Dialog open={confirmFecharNova} onOpenChange={setConfirmFecharNova}>
        <DialogContent
          className="border-amber-200 w-[min(92vw,460px)] max-w-[460px] p-0 overflow-hidden gap-0 flex flex-col"
          style={{ background: '#ffffff', color: '#111827' }}
        >
          {/* Header — faixa âmbar sutil + ícone em pill */}
          <DialogHeader className="px-5 py-4 bg-gradient-to-b from-amber-50 to-white border-b border-amber-100 space-y-0">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-full bg-amber-100 ring-4 ring-amber-50 shrink-0">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-amber-900 text-base font-bold leading-tight">
                  Descartar solicitação?
                </DialogTitle>
                <p className="text-[11px] text-amber-700/80 mt-0.5 leading-snug">
                  Você ainda não salvou esta solicitação. Confirme antes de fechar.
                </p>
              </div>
            </div>
          </DialogHeader>

          {/* Corpo — mensagem em card âmbar leve */}
          <div className="px-5 py-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 flex gap-2.5">
              <Info className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-900 leading-snug">
                Você preencheu informações nesta solicitação. Se fechar agora, <strong>todos os dados digitados serão perdidos</strong>.
              </p>
            </div>
          </div>

          {/* Footer sticky — ação primária + secundárias */}
          <div className="px-5 py-3 border-t border-gray-200 bg-gray-50/60 flex flex-col gap-2">
            <button
              onClick={() => { setConfirmFecharNova(false); handleSalvar(); }}
              disabled={criar.isPending || editar.isPending || uploadingImagem}
              className="w-full h-9 text-sm rounded-md bg-amber-600 hover:bg-amber-500 text-white font-semibold disabled:opacity-60 flex items-center justify-center gap-2 shadow-sm transition"
            >
              {(criar.isPending || editar.isPending || uploadingImagem) ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {editingSc ? "Salvar Alterações" : "Salvar Solicitação"}
            </button>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmFecharNova(false)}
                className="flex-1 h-9 text-sm border border-gray-300 rounded-md bg-white text-gray-700 hover:bg-gray-50 font-medium transition"
              >
                Continuar editando
              </button>
              <button
                onClick={() => {
                  setConfirmFecharNova(false);
                  setShowNova(false);
                  resetForm();
                  setEditingSc(null);
                  setEditingOriginalEapIds(new Set());
                }}
                className="flex-1 h-9 text-sm rounded-md bg-red-600 hover:bg-red-500 text-white font-semibold transition flex items-center justify-center gap-1.5"
              >
                <X className="h-3.5 w-3.5" />
                Descartar
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Rev. 1983 — Modal "Itens sem verba" redesenhado ──────────
          Antes: padding apertado, scroll horizontal vazio embaixo, lista
          vermelha "spam", botões pretos competindo. Agora:
          - header com faixa vermelha clara + título grande + subtítulo
          - badge contador "N item(s) sem verba"
          - lista em cards brancos com chip XCircle (legível, sem fundo
            vermelho saturado), scroll vertical só quando passa de ~150px
          - aviso âmbar com ícone Info, texto enxuto
          - form com labels claros + asterisco vermelho + helper opcional
          - footer sticky com borda superior e botão de ação destacado
          - overflow-x-hidden no DialogContent (mata a barra horizontal
            que aparecia na print original) */}
      <Dialog open={!!showSemVerba} onOpenChange={v => { if (!v) setShowSemVerba(null); }}>
        <DialogContent
          className="border-red-200 w-[min(92vw,560px)] max-w-[560px] p-0 overflow-hidden gap-0 flex flex-col max-h-[90vh]"
          style={{ background: '#ffffff', color: '#111827' }}
        >
          {/* Header com faixa vermelha sutil */}
          <DialogHeader className="px-5 py-4 bg-gradient-to-b from-red-50 to-white border-b border-red-100 space-y-0">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-full bg-red-100 ring-4 ring-red-50 shrink-0">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-red-900 text-base font-bold leading-tight">
                  Itens sem verba orçamentária
                </DialogTitle>
                <p className="text-[11px] text-red-700/80 mt-0.5 leading-snug">
                  Esta solicitação contém itens sem cobertura no orçamento da obra.
                </p>
              </div>
            </div>
          </DialogHeader>

          {/* Corpo rolável */}
          <div className="px-5 py-4 space-y-4 overflow-y-auto overflow-x-hidden flex-1">
            {/* Lista de problemas */}
            <div className="rounded-lg border border-red-200 bg-red-50/40 overflow-hidden">
              <div className="px-3 py-2 bg-red-50 border-b border-red-200 flex items-center justify-between">
                <p className="text-[11px] font-semibold text-red-800 uppercase tracking-wide">
                  Itens sinalizados
                </p>
                <span className="text-[10px] font-bold text-red-700 bg-white border border-red-200 rounded-full px-2 py-0.5 tabular-nums">
                  {showSemVerba?.problemas.length || 0} item(ns)
                </span>
              </div>
              <ul className="max-h-[150px] overflow-y-auto divide-y divide-red-100">
                {showSemVerba?.problemas.map((p, i) => (
                  <li key={i} className="px-3 py-2 flex items-start gap-2 hover:bg-red-50/60">
                    <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-red-500" />
                    <span className="text-xs text-red-900 leading-snug break-words min-w-0">{p}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Aviso âmbar */}
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex gap-2.5">
              <Info className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-amber-900 leading-snug">
                  Deseja realmente prosseguir?
                </p>
                <p className="text-[11px] text-amber-800 mt-0.5 leading-snug">
                  A solicitação será marcada como <strong>sem verba</strong> e exigirá aprovação especial.
                  Informe abaixo o motivo e a justificativa.
                </p>
              </div>
            </div>

            {/* Form */}
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-1">
                  Motivo <span className="text-red-600">*</span>
                </Label>
                <Select value={semVerbaMotivo} onValueChange={setSemVerbaMotivo}>
                  <SelectTrigger className="h-9 text-sm border-gray-300 focus:ring-2 focus:ring-red-200 focus:border-red-400">
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

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-[11px] font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-1">
                    Justificativa <span className="text-red-600">*</span>
                  </Label>
                  <span className="text-[10px] text-gray-500 tabular-nums">
                    {semVerbaObs.length} caractere(s)
                  </span>
                </div>
                <Textarea
                  value={semVerbaObs}
                  onChange={e => setSemVerbaObs(e.target.value)}
                  placeholder="Descreva por que esta compra é necessária mesmo sem verba prevista no orçamento..."
                  className="text-sm min-h-[90px] border-gray-300 resize-none focus:ring-2 focus:ring-red-200 focus:border-red-400"
                />
                <p className="text-[10px] text-gray-500 leading-snug">
                  Detalhe o cenário (ex.: aditivo contratual, retrabalho não previsto, item esquecido no escopo).
                </p>
              </div>
            </div>
          </div>

          {/* Footer sticky */}
          <div className="px-5 py-3 border-t border-gray-200 bg-gray-50/80 flex gap-2">
            <button
              type="button"
              onClick={() => setShowSemVerba(null)}
              className="flex-1 h-9 text-sm border border-gray-300 rounded-md bg-white text-gray-700 hover:bg-gray-100 font-medium transition"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirmSemVerba}
              disabled={!semVerbaMotivo || !semVerbaObs.trim() || criar.isPending}
              className="flex-[1.4] h-9 text-sm rounded-md bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm shadow-red-200"
            >
              {criar.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Criando...
                </>
              ) : (
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
      <Dialog open={showDetalhe !== null} onOpenChange={v => { if (!v) { setShowDetalhe(null); setRecebQtd({}); setEditMode(false); setEditForm(null); setEditItens([]); setAbaScDetalhe("detalhes"); } }}>
        <DialogContent className="border-gray-200 w-[96vw] max-w-[96vw] h-[94vh] max-h-[94vh] flex flex-col overflow-hidden" style={{ background: '#ffffff', color: '#111827' }}>
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
                <div className="mr-10 space-y-1.5">
                  <div className="text-xs text-gray-400 uppercase tracking-widest mb-0.5">
                    {(detalhe as any).tipo === "servico" ? "Solicitação de Serviço" : (detalhe as any).tipo === "pacote" ? "Solicitação de Pacote" : (detalhe as any).tipo === "pecas_veiculo" ? "Manutenção de Veículos" : "Solicitação de Compra"}
                  </div>
                  <DialogTitle className="text-gray-900 text-lg">
                    {formatNumeroScDisplay(detalhe.numeroSc)}
                    {detalhe.titulo && <span className="ml-2 text-gray-500 font-normal">— {detalhe.titulo}</span>}
                    {(detalhe as any).tipo && (detalhe as any).tipo !== "material" && (
                      <span className={`ml-2 px-2 py-0.5 text-[10px] font-semibold rounded ${
                        (detalhe as any).tipo === "servico" ? "bg-purple-100 text-purple-700"
                        : (detalhe as any).tipo === "pacote" ? "bg-indigo-100 text-indigo-700"
                        : (detalhe as any).tipo === "equipamento" ? "bg-cyan-100 text-cyan-700"
                        : (detalhe as any).tipo === "pecas_veiculo" ? "bg-teal-100 text-teal-700"
                        : "bg-blue-100 text-blue-700"
                      }`}>
                        {(detalhe as any).tipo === "servico" ? "MDO" : (detalhe as any).tipo === "pacote" ? "MAT+MDO" : (detalhe as any).tipo === "equipamento" ? ((detalhe as any).isLocacao ? "EQUIP·LOCAÇÃO" : "EQUIP") : (detalhe as any).tipo === "pecas_veiculo" ? "VEÍC" : (detalhe as any).tipo?.toUpperCase()}
                      </span>
                    )}
                  </DialogTitle>
                  <div className="flex items-center gap-2">
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
                            incluirEquipamentos: (detalhe as any).incluirEquipamentos || false,
                            vehicleId: (detalhe as any).vehicleId ? String((detalhe as any).vehicleId) : "",
                            // Rev. 2290 — Locação (carrega da SC ao editar).
                            isLocacao: !!(detalhe as any).isLocacao,
                            locacaoDuracaoDias: (detalhe as any).locacaoDuracaoDias ? String((detalhe as any).locacaoDuracaoDias) : "",
                            locacaoDataInicioPrevista: (detalhe as any).locacaoDataInicioPrevista || "",
                            locacaoDataFimPrevista: (detalhe as any).locacaoDataFimPrevista || "",
                          });
                          if (detalhe.obraId) {
                            const obra = obrasQ.data?.find((o: any) => o.id === detalhe.obraId);
                            if (obra) setObraSearch(obra.nome || "");
                          }
                          setVeiculoSearch(""); setVeiculoOpen(false);
                          const existingAnexos = Array.isArray((detalhe as any).anexos) ? (detalhe as any).anexos : [];
                          if (existingAnexos.length > 0) {
                            setPendingAnexos(existingAnexos.map((a: any) => ({ url: a.url, nome: a.nome, tipo: a.tipo, ts: a.ts || Date.now(), preview: a.tipo === "imagem" ? a.url : undefined })));
                            const firstImg = existingAnexos.find((a: any) => a.tipo === "imagem");
                            setImagemPreview(firstImg?.url || null);
                            setImagemBase64(null);
                            setImagemNome("");
                          } else if (detalhe.imagemReferenciaUrl) {
                            setPendingAnexos([{ url: detalhe.imagemReferenciaUrl, nome: "imagem_referencia", tipo: "imagem", ts: Date.now(), preview: detalhe.imagemReferenciaUrl }]);
                            setImagemPreview(detalhe.imagemReferenciaUrl);
                            setImagemBase64(null);
                            setImagemNome("");
                          } else {
                            setPendingAnexos([]);
                            setImagemPreview(null);
                            setImagemBase64(null);
                            setImagemNome("");
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
                            semVerba: it.semVerba ?? undefined,
                            motivoSemVerba: it.motivoSemVerba ?? undefined,
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
                          const hasAvulsoItems = (detalhe.itens as any[]).some((it: any) => it.motivoSemVerba === "avulso");
                          const hasEapOrigemItems = (detalhe.itens as any[]).some((it: any) => it.origemEap && it.motivoSemVerba !== "avulso");
                          setModoSC(hasAvulsoItems && !hasEapOrigemItems ? "manual" : hasEapOrigemItems ? "eap" : "manual");
                          setEditingSc({ id: detalhe.id, companyId: detalhe.companyId ?? companyId });
                          setShowDetalhe(null);
                          setShowNova(true);
                        }}
                        className="border-blue-200 text-blue-600 hover:bg-blue-50 text-xs gap-1 shrink-0">
                        <Pencil className="h-3 w-3" /> Editar
                      </Button>
                    )}
                    <StatusBadge status={statusEfetivoSC(detalhe)} />
                  </div>
                </div>
                {(detalhe.itens as any[])?.some((it: any) => it.semVerba) && (() => {
                  const avulsos = (detalhe.itens as any[]).filter((it: any) => it.semVerba && it.motivoSemVerba === "avulso");
                  const estouros = (detalhe.itens as any[]).filter((it: any) => it.semVerba && it.motivoSemVerba !== "avulso");
                  return (
                    <div className="mt-2 space-y-1.5">
                      {avulsos.length > 0 && (
                        <div className="flex items-center gap-2 px-3 py-2 bg-orange-50 border-2 border-orange-300 rounded-lg print:border-orange-500">
                          <AlertTriangle className="h-4 w-4 text-orange-600 shrink-0" />
                          <span className="text-xs font-bold text-orange-700">
                            FORA DO ORÇAMENTO — {avulsos.length} item(ns) avulso(s) sem vínculo orçamentário. Necessita verba realocada na cotação para liberação.
                          </span>
                        </div>
                      )}
                      {estouros.length > 0 && (
                        <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border-2 border-red-300 rounded-lg print:border-red-500">
                          <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
                          <span className="text-xs font-bold text-red-700">
                            ATENÇÃO — {estouros.length} item(ns) acima do orçado que geram prejuízo
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </DialogHeader>

              <div className="flex-1 overflow-y-auto min-h-0 space-y-3">
              {/* Abas: Detalhes / Cotação / OC */}
              {(scCotacaoId || scOcId) && (
              <div className="flex items-center gap-0 bg-gray-100 rounded-xl p-1 mt-1">
                {([
                  { key: "detalhes" as const, label: "Detalhes", icon: <ClipboardList className="h-4 w-4" /> },
                  ...(scCotacaoId ? [{ key: "cotacao" as const, label: `Cotação ${formatNumeroCotacaoDisplay((detalhe.rastreio?.cotacoes as any[])?.[0]?.numeroCotacao)}`, icon: <FileSearch className="h-4 w-4" /> }] : []),
                  ...(scOcId ? [{ key: "oc" as const, label: `OC ${formatNumeroOcDisplay((detalhe.rastreio?.ordens as any[])?.[0]?.numeroOc ?? "")}`, icon: <ShoppingCart className="h-4 w-4" /> }] : []),
                ] as { key: "detalhes" | "cotacao" | "oc"; label: string; icon: React.ReactNode }[]).map(tab => (
                  <button key={tab.key} type="button" onClick={() => setAbaScDetalhe(tab.key)}
                    className={`flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg transition-all flex-1 justify-center ${
                      abaScDetalhe === tab.key
                        ? "bg-white text-blue-700 shadow-sm ring-1 ring-gray-200"
                        : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                    }`}>
                    {tab.icon} {tab.label}
                  </button>
                ))}
              </div>
              )}

              {abaScDetalhe === "detalhes" && (<>
              {/* Info grid */}
              <div className="grid grid-cols-3 gap-3 text-xs bg-gray-50 rounded-lg p-3 border border-gray-200">
                {[
                  { label: "Obra", value: nomeObra(detalhe.obraId) ?? "—" },
                  { label: "Setor", value: detalhe.departamento || "—" },
                  { label: "Veículo", value: (() => { const vid = (detalhe as any).vehicleId; if (!vid) return "—"; const v = (veiculosQ.data || []).find((ve: any) => ve.id === vid); return v ? `${v.placa} — ${v.nome || v.modelo || ""}` : `#${vid}`; })() },
                  { label: "Necessidade", value: detalhe.dataNecessidade ? new Date(detalhe.dataNecessidade + "T00:00:00").toLocaleDateString("pt-BR") : "—" },
                  { label: "Prioridade", value: detalhe.prioridade ? (detalhe.prioridade.charAt(0).toUpperCase() + detalhe.prioridade.slice(1)) : "Normal" },
                  { label: "Criado em", value: new Date(detalhe.criadoEm).toLocaleDateString("pt-BR") },
                ].map(f => (
                  <div key={f.label}>
                    <span className="text-gray-400">{f.label}</span>
                    <p className="text-gray-900 mt-0.5 font-medium">{f.value}</p>
                  </div>
                ))}
                {detalhe.observacoes && (
                  <div className="col-span-3">
                    <span className="text-gray-400">Observações</span>
                    <p className="text-gray-900 mt-0.5 font-medium whitespace-pre-wrap break-words">{detalhe.observacoes}</p>
                  </div>
                )}
              </div>

              {/* Anexos */}
              {(() => {
                const anexosList: { url: string; nome: string; tipo: string }[] = Array.isArray((detalhe as any).anexos) && (detalhe as any).anexos.length > 0
                  ? (detalhe as any).anexos
                  : detalhe.imagemReferenciaUrl ? [{ url: detalhe.imagemReferenciaUrl, nome: "imagem_referencia", tipo: "imagem" }] : [];
                const canEdit = ["pendente", "aprovado"].includes(detalhe.status || "");
                return (anexosList.length > 0 || canEdit) ? (
                  <div className="border border-gray-200 rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
                        Anexos {anexosList.length > 0 && `(${anexosList.length})`}
                      </span>
                      {canEdit && (
                        <label className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 cursor-pointer">
                          <Paperclip className="h-3 w-3" /> Adicionar
                          <input type="file" accept="image/*,application/pdf,video/mp4,video/quicktime,video/avi,video/x-matroska" multiple className="hidden" onChange={async (e) => {
                            if (!e.target.files) return;
                            for (const file of Array.from(e.target.files)) {
                              const allowedTypes = ["image/", "application/pdf", "video/"];
                              const isAllowed = allowedTypes.some(t => file.type.startsWith(t));
                              if (!isAllowed) { toast.error(`${file.name}: formato não suportado`); continue; }
                              const reader = new FileReader();
                              reader.onload = async (ev) => {
                                const base64 = (ev.target?.result as string).split(",")[1];
                                try {
                                  await uploadImagem.mutateAsync({ companyId: detalhe.companyId ?? companyId, fileBase64: base64, fileName: file.name, solicitacaoId: detalhe.id });
                                  detalheQ.refetch();
                                  toast.success(`${file.name} anexado`);
                                } catch { toast.error(`Erro ao enviar ${file.name}`); }
                              };
                              reader.readAsDataURL(file);
                            }
                            e.target.value = "";
                          }} />
                        </label>
                      )}
                    </div>
                    {anexosList.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {anexosList.map((anx, idx) => (
                          <div key={idx} className="relative group">
                            <a href={anx.url} target="_blank" rel="noopener noreferrer" className="block">
                              {anx.tipo === "imagem" ? (
                                <img src={anx.url} alt={anx.nome} className="h-24 w-24 rounded-lg border border-gray-200 object-cover hover:opacity-90 transition" />
                              ) : anx.tipo === "pdf" ? (
                                <div className="h-24 w-24 rounded-lg border border-gray-200 bg-red-50 flex flex-col items-center justify-center hover:bg-red-100 transition">
                                  <FileText className="h-8 w-8 text-red-500" />
                                  <span className="text-[9px] text-red-600 mt-1">PDF</span>
                                </div>
                              ) : (
                                <div className="h-24 w-24 rounded-lg border border-gray-200 bg-blue-50 flex flex-col items-center justify-center hover:bg-blue-100 transition">
                                  <Film className="h-8 w-8 text-blue-500" />
                                  <span className="text-[9px] text-blue-600 mt-1">Vídeo</span>
                                </div>
                              )}
                            </a>
                            {canEdit && (
                              <button type="button" onClick={() => removeAnexo.mutate({ solicitacaoId: detalhe.id, companyId: detalhe.companyId ?? companyId, url: anx.url })}
                                className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 opacity-0 group-hover:opacity-100 transition-opacity">
                                <X className="h-3 w-3" />
                              </button>
                            )}
                            <div className="text-[9px] text-gray-500 mt-0.5 truncate max-w-[96px]">{anx.nome}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null;
              })()}

              {/* Rev. 2294 — Bloco de Aprovação manual removido: SC/OC nascem
                  aprovadas automaticamente. A existência da SC já é a aprovação. */}

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

                    {/* Rev. 2806 — Selo de cobertura: quantos itens da SC já estão em cotação */}
                    {coberturaScQ.data && coberturaScQ.data.total > 0 && (coberturaScQ.data.cotacoes?.length ?? 0) > 0 && (() => {
                      const cob = coberturaScQ.data;
                      const completo = cob.pendentes === 0;
                      return (
                        <div className={`flex items-center flex-wrap gap-2 rounded-lg border px-3 py-2 mb-1 ${completo ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
                          {completo
                            ? <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                            : <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />}
                          <span className={`text-xs font-semibold ${completo ? "text-emerald-800" : "text-amber-800"}`}>
                            {completo
                              ? `Todos os ${cob.total} itens estão em cotação`
                              : `${cob.cobertos} de ${cob.total} itens em cotação · ${cob.pendentes} pendente${cob.pendentes === 1 ? "" : "s"}`}
                          </span>
                          {!completo && (
                            <button type="button" disabled={cotarRestantesMut.isPending}
                              onClick={() => cotarRestantesMut.mutate({ solicitacaoId: showDetalhe!, userId: user?.id ? parseInt(String(user.id)) : undefined, userName: user?.nome || user?.name || undefined })}
                              className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-40 transition-colors">
                              {cotarRestantesMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileSearch className="h-3 w-3" />} Cotar {cob.pendentes} restante{cob.pendentes === 1 ? "" : "s"}
                            </button>
                          )}
                        </div>
                      );
                    })()}

                    {/* Cotações */}
                    {(detalhe.rastreio?.cotacoes ?? []).length > 0 ? (
                      (detalhe.rastreio.cotacoes as any[]).map((cot: any) => (
                        <div key={cot.id} className="flex items-start gap-3 relative">
                          <div className="w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center shrink-0 z-10 ring-2 ring-white">
                            <FileSearch className="h-3 w-3 text-purple-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold text-gray-900">
                              Cotação {formatNumeroCotacaoDisplay(cot.numeroCotacao)}
                              {/* Rev. 1687 — Quando há OC ativa vinculada, força badge "Aprovada"
                                  mesmo se o status cru no banco ficou em 'pendente' (path manual / legado). */}
                              {(() => {
                                const efetivoAprovada = cot._temOC === true && (cot.status === "pendente" || cot.status === "em_andamento");
                                const efetivoStatus = efetivoAprovada ? "aprovada" : cot.status;
                                const cls = efetivoStatus === "finalizada" || efetivoStatus === "aprovada" || efetivoStatus === "concluida"
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                  : efetivoStatus === "cancelada"
                                    ? "bg-red-50 text-red-600 border-red-200"
                                    : "bg-purple-50 text-purple-600 border-purple-200";
                                const label = efetivoStatus === "finalizada" ? "Finalizada"
                                  : efetivoStatus === "aprovada" ? "Aprovada"
                                  : efetivoStatus === "concluida" ? "Concluída"
                                  : efetivoStatus === "cancelada" ? "Cancelada"
                                  : efetivoStatus === "em_andamento" ? "Em andamento"
                                  : efetivoStatus;
                                return <span className={`ml-2 text-[9px] px-1.5 py-0.5 rounded border ${cls}`}>{label}</span>;
                              })()}
                            </div>
                            <div className="text-[10px] text-gray-500 mt-0.5">
                              {new Date(cot.criadoEm).toLocaleString("pt-BR")}
                              {cot.criadoPorNome && <span className="ml-1.5 text-purple-600 font-medium">por {cot.criadoPorNome}</span>}
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
                              OC {formatNumeroOcDisplay(oc.numeroOc)}
                              <span className={`ml-2 text-[9px] px-1.5 py-0.5 rounded border ${oc.status === "entregue" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : oc.status === "cancelada" ? "bg-red-50 text-red-600 border-red-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                                {oc.status === "entregue" ? "Entregue" : oc.status === "cancelada" ? "Cancelada" : oc.status === "parcial" ? "Entrega parcial" : oc.status === "aprovada" ? "Aprovada" : oc.status}
                              </span>
                            </div>
                            <div className="text-[10px] text-gray-500 mt-0.5">
                              {new Date(oc.criadoEm).toLocaleString("pt-BR")}
                              {oc.criadoPorNome && <span className="ml-1.5 text-amber-600 font-medium">por {oc.criadoPorNome}</span>}
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
                  const parentEapInline = (detalhe.itens as any[]).find((p: any) =>
                    p.id !== it.id &&
                    p.orcamentoItemId &&
                    p.orcamentoItemId === it.orcamentoItemId &&
                    (p.origemEap || (!p.insumoCodigo && p.eapCodigo))
                  );
                  const parentEap = parentEapInline || (it.parentEapDescricao ? {
                    descricao: it.parentEapDescricao,
                    eapCodigo: it.parentEapCodigo || it.eapCodigo,
                  } : null);
                  const isChildInsumo = !!it.orcamentoItemId && !!parentEap && (
                    !!it.insumoCodigo || (parentEap.descricao && parentEap.descricao.trim() !== (it.descricao || "").trim())
                  );
                  return (
                    <div key={it.id} className="border border-gray-200 rounded-lg p-3 space-y-2 bg-gray-50">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-gray-900 text-sm font-medium">{it.descricao}</p>
                          {isChildInsumo && (
                            <p className="text-[11px] text-blue-700 mt-0.5 flex items-center gap-1">
                              <span className="text-gray-400">↳</span>
                              <span className="font-medium">Vinculado a:</span>
                              {parentEap.eapCodigo && <span className="text-gray-500">[{parentEap.eapCodigo}]</span>}
                              <span>{parentEap.descricao}</span>
                            </p>
                          )}
                          {it.observacoes && (
                            <p className="text-gray-500 text-xs italic">{it.observacoes}</p>
                          )}
                          <p className="text-gray-400 text-xs">{it.unidade || "un"} · Qtd: {qtdTotal.toLocaleString("pt-BR")}</p>
                          {it.semVerba && (
                            <div className="flex items-center gap-1.5 mt-1">
                              {it.motivoSemVerba === "avulso" ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-700 border border-orange-200">⚠ FORA DO ORÇAMENTO</span>
                              ) : (
                                <>
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700 border border-red-200">SEM VERBA</span>
                                  {it.motivoSemVerba && <span className="text-[9px] text-red-500 italic">{it.motivoSemVerba === "quebra_dano" ? "Quebra/Dano" : it.motivoSemVerba === "furto" ? "Furto" : it.motivoSemVerba === "erro_orcamento" ? "Erro Orçamento" : it.motivoSemVerba === "qtd_insuficiente" ? "Qtd Insuficiente" : it.motivoSemVerba === "retrabalho" ? "Retrabalho" : "Outro"}</span>}
                                </>
                              )}
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
                          <Button size="sm" variant="outline"
                            onClick={() => { if (confirm(`Excluir o item "${it.descricao}" desta solicitação?`)) cancelarItem.mutate({ itemId: it.id, solicitacaoId: detalhe.id }); }}
                            disabled={cancelarItem.isPending}
                            className="h-7 text-xs border-red-200 text-red-600 hover:bg-red-50">
                            <X className="h-3 w-3 mr-1" />Excluir Item
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
              {/* Rev. 2294 — Banner "Aguardando aprovação" removido: SC já nasce aprovada. */}
              <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-200">
                {!["cotacao", "aprovado", "cancelado"].includes(detalhe.status) && (() => {
                  const scTipo = (detalhe as any).tipo || "material";
                  const tipoLabel = scTipo === "servico" ? "Mão de Obra" : scTipo === "pacote" ? "Pacote (MAT + MO)" : scTipo === "equipamento" ? "Equipamento" : scTipo === "pecas_veiculo" ? "Manutenção de Veículos" : "Material";
                  const tipoCor = scTipo === "servico" ? "bg-purple-600 hover:bg-purple-500" : scTipo === "pacote" ? "bg-indigo-600 hover:bg-indigo-500" : scTipo === "pecas_veiculo" ? "bg-cyan-600 hover:bg-cyan-500" : "bg-blue-600 hover:bg-blue-500";
                  const tipoIcon = scTipo === "servico" || scTipo === "pacote" ? <Briefcase className="h-3 w-3" /> : scTipo === "pecas_veiculo" ? <Car className="h-3 w-3" /> : <ShoppingCart className="h-3 w-3" />;
                  return (
                    <Button size="sm"
                      onClick={() => handleEnviarParaCotacao(scTipo as "material" | "servico" | "pacote" | "equipamento" | "pecas_veiculo")}
                      disabled={criarCotacao.isPending || (detalhe.itens as any[]).length === 0}
                      className={`${tipoCor} text-white text-xs gap-1.5`}>
                      {criarCotacao.isPending
                        ? <><Loader2 className="h-3 w-3 animate-spin" /> Criando cotação...</>
                        : <>{tipoIcon} Enviar para Cotação ({tipoLabel})</>}
                    </Button>
                  );
                })()}
                <Button size="sm" variant="outline"
                  onClick={() => duplicar.mutate({ id: detalhe.id, companyId, userId: user?.id, userName: user?.name })}
                  disabled={duplicar.isPending}
                  className="border-gray-300 text-gray-600 hover:bg-gray-50 text-xs gap-1">
                  <Copy className="h-3 w-3" /> Duplicar
                </Button>
                <Button size="sm" variant="outline"
                  onClick={() => gerarPdfSC(detalhe.id)}
                  className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 text-xs gap-1">
                  <FileDown className="h-3 w-3" /> Gerar PDF
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
              </>)}

              {/* ── Aba Cotação ── */}
              {abaScDetalhe === "cotacao" && scCotacaoId && (
                <div className="space-y-4">
                  {scCotacaoQ.isLoading || scMapaQ.isLoading ? (
                    <div className="py-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
                  ) : scCotacaoQ.data ? (() => {
                    const cot = scCotacaoQ.data;
                    const mapa = scMapaQ.data;
                    const participantes = mapa?.participantes ?? [];
                    const mapaItens = mapa?.itens ?? [];
                    const vencedor = participantes.find((p: any) => p.selecionado);
                    const cotStatusRaw = (cot as any).status;
                    // Rev. 1687 — status efetivo: se a cotação tem OC ATIVA vinculada
                    // (sinalizado pelo `_temOC` da rastreio do SC), exibe "Aprovada"
                    // mesmo quando o banco ficou em 'pendente'/'em_andamento'.
                    const cotRastreio = (detalhe?.rastreio?.cotacoes as any[] | undefined)?.find((c: any) => c.id === scCotacaoId);
                    const cotStatus = (cotRastreio?._temOC === true && (cotStatusRaw === "pendente" || cotStatusRaw === "em_andamento"))
                      ? "aprovada"
                      : cotStatusRaw;
                    const statusCfg: Record<string, { label: string; cls: string }> = {
                      pendente: { label: "Pendente", cls: "bg-amber-100 text-amber-700 border-amber-200" },
                      em_andamento: { label: "Em Andamento", cls: "bg-blue-100 text-blue-700 border-blue-200" },
                      aprovada: { label: "Aprovada", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
                      concluida: { label: "Concluída", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
                      cancelada: { label: "Cancelada", cls: "bg-red-100 text-red-700 border-red-200" },
                      recusada: { label: "Recusada", cls: "bg-red-100 text-red-700 border-red-200" },
                    };
                    const stCfg = statusCfg[cotStatus] ?? statusCfg.pendente;
                    const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
                    const n = (v: any) => parseFloat(String(v ?? "0")) || 0;
                    return (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="text-sm font-bold text-gray-900">{formatNumeroCotacaoDisplay((cot as any).numeroCotacao)}</h3>
                            <p className="text-xs text-gray-500">{(cot as any).descricao || "Sem descrição"}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 text-[10px] font-semibold rounded border ${stCfg.cls}`}>{stCfg.label}</span>
                            <Button size="sm" variant="outline" onClick={() => { window.open(`/compras/cotacoes?destaque=${scCotacaoId}`, "_blank"); }}
                              className="text-xs border-blue-200 text-blue-600 hover:bg-blue-50 gap-1">
                              <FileText className="h-3 w-3" /> Abrir Cotação Completa
                            </Button>
                          </div>
                        </div>

                        <div className="grid grid-cols-4 gap-3 text-xs bg-gray-50 rounded-lg p-3 border border-gray-200">
                          {[
                            { label: "Tipo", value: (cot as any).tipo === "pacote" ? "Pacote (MAT+MDO)" : (cot as any).tipo === "servico" ? "Serviço (MDO)" : (cot as any).tipo === "equipamento" ? "Equipamento" : (cot as any).tipo === "pecas_veiculo" ? "Manutenção de Veículos" : "Material" },
                            { label: "Fornecedores", value: `${participantes.length} participante(s)` },
                            { label: "Total", value: vencedor ? fmt(n(vencedor.totalOrcado)) : (cot as any).total ? fmt(n((cot as any).total)) : "—" },
                            { label: "Validade", value: (cot as any).dataValidade ? new Date((cot as any).dataValidade + "T00:00:00").toLocaleDateString("pt-BR") : "—" },
                          ].map(f => (
                            <div key={f.label}>
                              <span className="text-gray-400">{f.label}</span>
                              <p className="text-gray-900 mt-0.5 font-medium">{f.value}</p>
                            </div>
                          ))}
                        </div>

                        {vencedor && (
                          <div className="border border-emerald-200 rounded-lg p-3 bg-emerald-50/50">
                            <div className="flex items-center gap-2 mb-2">
                              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                              <span className="text-xs font-semibold text-emerald-700 uppercase tracking-widest">Fornecedor Vencedor</span>
                            </div>
                            <div className="grid grid-cols-3 gap-3 text-xs">
                              <div>
                                <span className="text-gray-400">Fornecedor</span>
                                <p className="text-gray-900 font-medium">{(vencedor as any).fornecedor?.nomeFantasia || (vencedor as any).fornecedor?.razaoSocial || "—"}</p>
                              </div>
                              <div>
                                <span className="text-gray-400">Total</span>
                                <p className="text-gray-900 font-medium">{fmt(n(vencedor.totalOrcado))}</p>
                              </div>
                              <div>
                                <span className="text-gray-400">Medição</span>
                                <p className="text-gray-900 font-medium">
                                  {(vencedor as any).moduloMedicao === "medicao_mensal" ? "Medição Mensal"
                                    : (vencedor as any).moduloMedicao === "medicao_avanco" ? "Medição por Avanço"
                                    : (vencedor as any).moduloMedicao === "medicao_etapa" ? "Medição por Etapa"
                                    : (vencedor as any).moduloMedicao === "empreitada" ? "Empreitada Global"
                                    : (vencedor as any).moduloMedicao === "administracao" ? "Administração"
                                    : "—"}
                                </p>
                              </div>
                            </div>
                          </div>
                        )}

                        {participantes.length > 0 && (
                          <div className="border border-gray-200 rounded-lg overflow-hidden">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="bg-gray-50 border-b border-gray-200">
                                  <th className="px-3 py-2 text-left text-gray-500 font-semibold">Fornecedor</th>
                                  <th className="px-3 py-2 text-right text-gray-500 font-semibold">Total</th>
                                  <th className="px-3 py-2 text-center text-gray-500 font-semibold">Prazo</th>
                                  <th className="px-3 py-2 text-center text-gray-500 font-semibold">Medição</th>
                                  <th className="px-3 py-2 text-center text-gray-500 font-semibold">Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {participantes.map((p: any) => {
                                  const isVenc = p.selecionado;
                                  return (
                                    <tr key={p.fornecedorId} className={`border-b border-gray-100 ${isVenc ? "bg-emerald-50/50" : ""}`}>
                                      <td className="px-3 py-2 font-medium text-gray-900">
                                        {p.fornecedor?.nomeFantasia || p.fornecedor?.razaoSocial || `#${p.fornecedorId}`}
                                        {isVenc && <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 border border-emerald-200 font-bold">VENCEDOR</span>}
                                      </td>
                                      <td className="px-3 py-2 text-right font-medium">{fmt(n(p.totalOrcado))}</td>
                                      <td className="px-3 py-2 text-center">{p.prazoEntregaDias ? `${p.prazoEntregaDias} dias` : "—"}</td>
                                      <td className="px-3 py-2 text-center">
                                        {p.moduloMedicao ? (
                                          <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-purple-100 text-purple-700 border border-purple-200">
                                            {p.moduloMedicao === "medicao_mensal" ? "Mensal" : p.moduloMedicao === "medicao_avanco" ? "Avanço" : p.moduloMedicao === "medicao_etapa" ? "Etapa" : p.moduloMedicao === "empreitada" ? "Empreitada" : p.moduloMedicao === "administracao" ? "Admin" : p.moduloMedicao}
                                          </span>
                                        ) : "—"}
                                      </td>
                                      <td className="px-3 py-2 text-center">
                                        {isVenc ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 mx-auto" /> : <span className="text-gray-400">—</span>}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {mapaItens.length > 0 && (
                          <div className="border border-gray-200 rounded-lg overflow-hidden">
                            <div className="px-3 py-2 bg-gray-50 border-b border-gray-200">
                              <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Itens da Cotação ({mapaItens.length})</span>
                            </div>
                            <div className="max-h-64 overflow-y-auto">
                              <table className="w-full text-xs">
                                <thead className="sticky top-0 bg-white">
                                  <tr className="border-b border-gray-200">
                                    <th className="px-3 py-1.5 text-left text-gray-500 font-semibold">Descrição</th>
                                    <th className="px-3 py-1.5 text-center text-gray-500 font-semibold">Un</th>
                                    <th className="px-3 py-1.5 text-right text-gray-500 font-semibold">Qtd</th>
                                    <th className="px-3 py-1.5 text-right text-gray-500 font-semibold">Meta Unit.</th>
                                    {vencedor && <th className="px-3 py-1.5 text-right text-emerald-600 font-semibold">Preço Venc.</th>}
                                  </tr>
                                </thead>
                                <tbody>
                                  {mapaItens.map((it: any) => {
                                    const vKey = vencedor ? `${it.id}_${vencedor.fornecedorId}` : null;
                                    const vResp = vKey ? mapa?.respostaMap?.[vKey] : null;
                                    return (
                                      <tr key={it.id} className="border-b border-gray-100">
                                        <td className="px-3 py-1.5 text-gray-900">{it.descricao}</td>
                                        <td className="px-3 py-1.5 text-center text-gray-500">{it.unidade || "un"}</td>
                                        <td className="px-3 py-1.5 text-right">{n(it.quantidade).toLocaleString("pt-BR")}</td>
                                        <td className="px-3 py-1.5 text-right text-blue-700">{n(it.metaUnitario) > 0 ? fmt(n(it.metaUnitario)) : "—"}</td>
                                        {vencedor && <td className="px-3 py-1.5 text-right text-emerald-700 font-medium">{vResp ? fmt(n((vResp as any).precoUnitario)) : "—"}</td>}
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {(cot as any).contratoTerceiroId && (
                          <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
                            <FileText className="h-4 w-4 text-blue-600" />
                            <span className="text-xs text-blue-700 font-medium">Contrato de Serviço vinculado ao módulo Terceiros</span>
                            <Button size="sm" variant="outline" onClick={() => { window.open(`/terceiros/contratos/${(cot as any).contratoTerceiroId}`, "_blank"); }}
                              className="ml-auto text-xs border-blue-200 text-blue-600 hover:bg-blue-50 gap-1">
                              <FileText className="h-3 w-3" /> Ver Contrato
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })() : (
                    <div className="py-10 text-center text-sm text-gray-500">Cotação não encontrada</div>
                  )}
                </div>
              )}

              {/* ── Aba OC ── */}
              {abaScDetalhe === "oc" && scOcId && (
                <div className="space-y-4">
                  {(() => {
                    const ordens = (detalhe.rastreio?.ordens as any[]) ?? [];
                    const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
                    const n = (v: any) => parseFloat(String(v ?? "0")) || 0;
                    return (
                      <div className="space-y-4">
                        {ordens.map((oc: any) => {
                          const ocStatusCfg: Record<string, { label: string; cls: string }> = {
                            pendente: { label: "Pendente", cls: "bg-amber-100 text-amber-700 border-amber-200" },
                            aprovada: { label: "Aprovada", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
                            entregue: { label: "Entregue", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
                            parcial: { label: "Entrega Parcial", cls: "bg-amber-100 text-amber-700 border-amber-200" },
                            cancelada: { label: "Cancelada", cls: "bg-red-100 text-red-700 border-red-200" },
                          };
                          const stCfg = ocStatusCfg[oc.status] ?? ocStatusCfg.pendente;
                          return (
                            <div key={oc.id} className="border border-gray-200 rounded-lg p-4 space-y-3">
                              <div className="flex items-center justify-between">
                                <div>
                                  <h3 className="text-sm font-bold text-gray-900">OC {formatNumeroOcDisplay(oc.numeroOc)}</h3>
                                  <p className="text-xs text-gray-500">{new Date(oc.criadoEm).toLocaleString("pt-BR")}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className={`px-2 py-0.5 text-[10px] font-semibold rounded border ${stCfg.cls}`}>{stCfg.label}</span>
                                  <Button size="sm" variant="outline" onClick={() => { window.open(`/compras/ordens?destaque=${oc.id}`, "_blank"); }}
                                    className="text-xs border-blue-200 text-blue-600 hover:bg-blue-50 gap-1">
                                    <ShoppingCart className="h-3 w-3" /> Abrir OC Completa
                                  </Button>
                                </div>
                              </div>

                              <div className="grid grid-cols-4 gap-3 text-xs bg-gray-50 rounded-lg p-3 border border-gray-200">
                                <div>
                                  <span className="text-gray-400">Fornecedor</span>
                                  <p className="text-gray-900 mt-0.5 font-medium">{oc.fornecedorNome || "—"}</p>
                                </div>
                                <div>
                                  <span className="text-gray-400">Total</span>
                                  <p className="text-gray-900 mt-0.5 font-medium">{oc.total > 0 ? fmt(oc.total) : "—"}</p>
                                </div>
                                <div>
                                  <span className="text-gray-400">Aprovação</span>
                                  <p className="text-gray-900 mt-0.5 font-medium">
                                    {oc.aprovadorNome ? <span className="text-emerald-700">Aprovada por {oc.aprovadorNome}</span> : <span className="text-amber-600">Pendente</span>}
                                  </p>
                                </div>
                                <div>
                                  <span className="text-gray-400">Status</span>
                                  <p className="text-gray-900 mt-0.5 font-medium">{stCfg.label}</p>
                                </div>
                              </div>
                            </div>
                          );
                        })}

                        {(detalhe.rastreio?.recebimentos ?? []).length > 0 && (
                          <div className="border border-gray-200 rounded-lg p-3">
                            <div className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">Recebimentos</div>
                            <div className="space-y-2">
                              {(detalhe.rastreio.recebimentos as any[]).map((rec: any) => (
                                <div key={rec.id} className="flex items-center gap-3 px-3 py-2 bg-gray-50 rounded-lg border border-gray-100">
                                  <Truck className="h-4 w-4 text-teal-600 shrink-0" />
                                  <div className="flex-1">
                                    <span className="text-xs font-medium text-gray-900">Recebimento {rec.numeroNf ? `· NF ${rec.numeroNf}` : ""}</span>
                                    <span className="text-[10px] text-gray-500 ml-2">{new Date(rec.criadoEm).toLocaleString("pt-BR")}</span>
                                  </div>
                                  <span className={`px-1.5 py-0.5 text-[9px] font-medium rounded border ${rec.status === "conferido" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-teal-50 text-teal-700 border-teal-200"}`}>
                                    {rec.status === "conferido" ? "Conferido" : rec.status === "divergencia" ? "Divergência" : rec.status}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}
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
      <Dialog open={confirmExcluirLote} onOpenChange={(v) => { if (!excluirProgress?.running) setConfirmExcluirLote(v); }}>
        <DialogContent className="border-gray-200 max-w-md" style={{ background: '#ffffff', color: '#111827' }}>
          <DialogHeader>
            <DialogTitle className="text-gray-900">Confirmar Exclusão</DialogTitle>
          </DialogHeader>
          {excluirProgress ? (
            <div className="py-3 space-y-3">
              <div className="flex items-center justify-between text-sm text-gray-700">
                <span>{excluirProgress.running ? "Excluindo..." : "Concluído!"}</span>
                <span className="font-medium">{excluirProgress.done}/{excluirProgress.total}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-300 ease-out" style={{ width: `${(excluirProgress.done / excluirProgress.total) * 100}%`, backgroundColor: excluirProgress.errors.length > 0 ? '#f59e0b' : excluirProgress.running ? '#3b82f6' : '#22c55e' }} />
              </div>
              {excluirProgress.errors.length > 0 && (
                <div className="text-xs text-amber-600 space-y-0.5 max-h-20 overflow-y-auto">
                  {excluirProgress.errors.map((err, i) => <p key={i}>• {err}</p>)}
                </div>
              )}
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-600 py-2">
                Tem certeza que deseja excluir <strong>{selectedSCIds.size}</strong> solicitação(ões)? Cotações vinculadas serão canceladas. SCs com OC em andamento não serão excluídas.
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setConfirmExcluirLote(false)}>Cancelar</Button>
                <Button variant="destructive" className="gap-1.5" onClick={() => excluirLoteSeq([...selectedSCIds])}>
                  <Trash2 className="h-3.5 w-3.5" />
                  Excluir {selectedSCIds.size} SC(s)
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <ConfirmAprovDialog confirmAprov={confirmAprov} setConfirmAprov={setConfirmAprov} aprovar={aprovar} desaprovar={desaprovar} user={user} companyId={companyId} />

      <DisciplinasModal
        open={showDisciplinas}
        onClose={() => setShowDisciplinas(false)}
        orcamentoId={orcIdParaDisciplina}
        companyId={companyId}
        disciplinasQ={disciplinasQ}
        classificarMut={classificarMut}
        corrigirMut={corrigirMut}
        renomearMut={renomearMut}
        itensNaSC={itens.filter(i => i.eapCodigo).map(i => i.eapCodigo!)}
        onAddItem={(item: any, qtdOverride?: number) => {
          const qtd = qtdOverride ?? (item.saldo > 0 ? item.saldo : item.qtdOrcada);
          const newItem: ItemForm = {
            eapCodigo: item.eapCodigo,
            descricao: item.descricao,
            unidade: item.unidade,
            quantidade: String(qtd),
            observacoes: "",
            origemEap: true,
            orcamentoItemId: item.orcamentoItemId ?? undefined,
          };
          setItens(prev => {
            if (prev.some(i => i.eapCodigo === item.eapCodigo)) {
              toast.info(`Item ${item.eapCodigo} já está na SC`);
              return prev;
            }
            return [...prev, newItem];
          });
          if (item.orcamentoItemId) {
            setSelectedEapIds(prev => { const s = new Set(prev); s.add(item.orcamentoItemId); return s; });
            if (form.tipo === "servico") {
              setEapQtdServico(prev => ({ ...prev, [item.orcamentoItemId]: String(qtd) }));
            }
          }
        }}
      />
    </div>
    </DashboardLayout>
  );
}
