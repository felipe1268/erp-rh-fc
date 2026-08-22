// ============================================================================
// Rev. 4673 — DOCUMENTOS DO COLABORADOR (layout moderno + geração em lote + FCSign)
//   - Lista de funcionários com FOTO + % de completude documental (0–100%)
//   - Checklist com CHECKBOX: gerar vários documentos de uma vez, com barra
//     de progresso percentual durante o lote
//   - Assinatura digital via FCSign (links p/ WhatsApp, igual à ficha de EPI)
//     além do pad presencial
// Rev. 4669/4672 — dossiê digital, campos extras, eventuais, dependentes.
// ============================================================================
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { popNavBack } from "@/lib/navHistory";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { toast } from "sonner";
import DOMPurify from "dompurify";
import {
  Loader2, FileText, PenLine, Download, Search, CheckCircle2, AlertTriangle,
  Circle, Plus, Trash2, ShieldCheck, FolderOpen, Layers, Send, ArrowLeft, Eye,
  Building2, Ban,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import RhDocAssinatura from "@/components/RhDocAssinatura";
import DependentesCard from "@/components/DependentesCard";
import FCSignSendDialog from "@/components/FCSignSendDialog";
import EmpregadorAssinaturaPendentes from "@/components/EmpregadorAssinaturaPendentes";
import { PersonPhoto } from "@/components/PersonPhoto";
import { RH_DOC_CAMPOS_EXTRAS, RH_DOCS_EVENTUAIS, getTemplateMeta, isCustomTipo, type CampoExtraDef } from "@shared/documentTemplates";
import { useAuth } from "@/_core/hooks/useAuth";

// Rev. 5048 — item entregue (documentos custom, ex.: Termo de Recebimento)
type ItemEntregue = { descricao: string; qtd: string; estado: string };

function fmtDateTime(v?: string | null): string {
  if (!v) return "";
  const s = String(v);
  const m = s.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const d = m ? `${m[3]}/${m[2]}/${m[1]}` : s.slice(0, 10);
  const hm = s.match(/[T ](\d{2}):(\d{2})/);
  return hm ? `${d} ${hm[1]}:${hm[2]}` : d;
}

const thumb = (u?: string | null) => (u && u.startsWith("/uploads/") ? `${u}?w=128` : u || null);

function pctColor(p: number) {
  return p >= 100 ? "bg-green-500" : p >= 60 ? "bg-[#EE9803]" : "bg-red-400";
}

export default function DocumentosColaborador() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "admin_master";
  const { selectedCompanyId, getCompanyIdsForQuery } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) || 0 : 0;
  const companyIds = getCompanyIdsForQuery();
  const enabled = !!companyId || (companyIds?.length ?? 0) > 0;

  const [busca, setBusca] = useState("");
  const [empSelId, setEmpSelId] = useState<number | null>(null);
  const [docAberto, setDocAberto] = useState<number | null>(null);
  const [assinandoDoc, setAssinandoDoc] = useState<{ id: number; titulo: string; tipo?: string } | null>(null);
  const [gerandoTipo, setGerandoTipo] = useState<string | null>(null);
  // Rev. 4672 — dialog de campos extras (contrato CLT, férias, folha, aditivo…)
  const [extrasDoc, setExtrasDoc] = useState<{ tipo: string; titulo: string; campos: CampoExtraDef[]; custom?: boolean } | null>(null);
  const [extrasVals, setExtrasVals] = useState<Record<string, string>>({});
  // Rev. 5048 — itens entregues (documento custom): tabela dinâmica
  const [extrasItens, setExtrasItens] = useState<ItemEntregue[]>([]);
  // Rev. 4673 — seleção p/ geração em lote + progresso
  const [selTipos, setSelTipos] = useState<Set<string>>(new Set());
  const [lote, setLote] = useState<{ done: number; total: number; atual: string } | null>(null);
  // N/A em lote
  const [naConfirmOpen, setNaConfirmOpen] = useState(false);
  const [naLote, setNaLote] = useState<{ done: number; total: number } | null>(null);
  // Rev. 4673 — FCSign
  const [fcsignDoc, setFcsignDoc] = useState<{ id: number; titulo: string; html: string } | null>(null);
  // Rev. 4675 — olhinho: pré-visualização SEM salvar
  const [previewReq, setPreviewReq] = useState<{ tipo: string; titulo: string; extras?: Record<string, string> } | null>(null);

  const utils = trpc.useUtils();
  // Rev. 4673 — lista com foto + situação documental de TODOS (1 query em lote)
  const { data: geral, isLoading: loadingEmps } = trpc.rhDocumentos.checklistGeral.useQuery(
    { companyId, companyIds } as any,
    { enabled }
  );
  const funcionarios = (geral?.funcionarios ?? []) as any[];
  const totalModelos = (geral?.modelos ?? []).length || 1;
  const pctDe = (f: any) => {
    const assinados = Object.values(f.docs || {}).filter((d: any) => d.situacao === "assinado" || d.situacao === "nao_aplicavel").length;
    return Math.round((assinados / totalModelos) * 100);
  };
  const empSel = useMemo(() => funcionarios.find(f => f.id === empSelId) || null, [funcionarios, empSelId]);
  // Co-assinatura do empregador: respeita flag do backend (com fallback a isAdmin)
  const canManageEmployerSignature: boolean = isAdmin && ((geral as any)?.canManageEmployerSignature ?? isAdmin);

  // Rev. 4671 — pré-seleção via ?emp=<id>
  useEffect(() => {
    if (empSelId || funcionarios.length === 0) return;
    const empParam = new URLSearchParams(window.location.search).get("emp");
    const id = empParam ? parseInt(empParam, 10) : 0;
    if (id && funcionarios.some(f => f.id === id)) setEmpSelId(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [funcionarios]);

  // limpa seleção de lote ao trocar de funcionário
  useEffect(() => { setSelTipos(new Set()); }, [empSelId]);

  const empresaDoSel = empSel?.companyId || companyId;

  const { data: checklist, isLoading: loadingCheck } = trpc.rhDocumentos.checklist.useQuery(
    { companyId: empresaDoSel, employeeId: empSelId ?? 0 },
    { enabled: !!empSel }
  );
  const { data: docs = [] } = trpc.rhDocumentos.listar.useQuery(
    { companyId: empresaDoSel, employeeId: empSelId ?? 0 },
    { enabled: !!empSel }
  );
  // Rev. 4675 — preview sob demanda (não grava nada no dossiê)
  const { data: previewData, isLoading: loadingPreview } = trpc.rhDocumentos.preview.useQuery(
    { companyId: empresaDoSel, employeeId: empSelId ?? 0, tipo: (previewReq?.tipo ?? "ficha_registro") as any, extras: previewReq?.extras },
    { enabled: !!previewReq && !!empSel }
  );
  const { data: docDetalhe, isLoading: loadingDoc } = trpc.rhDocumentos.get.useQuery(
    { id: docAberto ?? 0 },
    { enabled: !!docAberto }
  );

  const refetchTudo = () => {
    utils.rhDocumentos.listar.invalidate();
    utils.rhDocumentos.checklist.invalidate();
    utils.rhDocumentos.checklistGeral.invalidate();
    utils.rhDocumentos.get.invalidate();
  };

  const gerarMut = trpc.rhDocumentos.gerar.useMutation({
    onSuccess: (r) => {
      toast.success("Documento gerado!");
      setGerandoTipo(null);
      refetchTudo();
      setDocAberto(r.id);
    },
    onError: (e) => { toast.error(e.message); setGerandoTipo(null); },
  });
  // Instância separada p/ o LOTE (sem abrir o preview a cada documento)
  const gerarLoteMut = trpc.rhDocumentos.gerar.useMutation();
  const excluirMut = trpc.rhDocumentos.excluir.useMutation({
    onSuccess: () => { toast.success("Documento excluído."); refetchTudo(); },
    onError: (e) => toast.error(e.message),
  });
  // Rev. 4978 — N/A: colaborador já possui o documento assinado fisicamente
  const naMut = trpc.rhDocumentos.marcarNaoAplicavel.useMutation({
    onSuccess: () => { toast.success("Marcado como N/A (não se aplica)."); refetchTudo(); },
    onError: (e) => toast.error(e.message),
  });

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return funcionarios.filter(e => !q || (e.nomeCompleto || "").toLowerCase().includes(q) || (e.funcao || "").toLowerCase().includes(q)).slice(0, 80);
  }, [funcionarios, busca]);

  // Rev. 4672 — geração unitária: tipos com campos extras abrem dialog antes
  const iniciarGeracao = (tipo: string, titulo: string) => {
    const campos = (RH_DOC_CAMPOS_EXTRAS as any)[tipo] as CampoExtraDef[] | undefined;
    if (campos?.length) { setExtrasVals({}); setExtrasItens([]); setExtrasDoc({ tipo, titulo, campos }); return; }
    // Rev. 5048 — documento CUSTOM: abre dialog com itens entregues + observações
    if (isCustomTipo(tipo)) {
      setExtrasVals({});
      setExtrasItens([{ descricao: "", qtd: "1", estado: "Novo" }]);
      setExtrasDoc({ tipo, titulo, custom: true, campos: [{ chave: "observacoes", rotulo: "Observações (opcional)", obrigatorio: false, placeholder: "Detalhes adicionais sobre a entrega, condições especiais, etc." } as CampoExtraDef] });
      return;
    }
    setGerandoTipo(tipo);
    gerarMut.mutate({ companyId: empresaDoSel, employeeId: empSelId!, tipo: tipo as any });
  };
  // Rev. 5048 — extras compartilhados entre gerar e pré-visualizar
  const montarExtras = (): Record<string, string> => {
    const extras: Record<string, string> = {};
    for (const c of extrasDoc?.campos || []) { const v = (extrasVals[c.chave] || "").trim(); if (v) extras[c.chave] = v; }
    if (extrasDoc?.custom) {
      const itens = extrasItens.filter(i => i.descricao.trim());
      if (itens.length) extras.itensEntreguesJson = JSON.stringify(itens.map(i => ({ descricao: i.descricao.trim(), qtd: i.qtd.trim() || "1", estado: i.estado.trim() })));
    }
    return extras;
  };
  const confirmarGeracao = () => {
    if (!extrasDoc || !empSel) return;
    const faltando = extrasDoc.campos.filter(c => c.obrigatorio && !(extrasVals[c.chave] || "").trim());
    if (faltando.length) { toast.error(`Preencha: ${faltando.map(f => f.rotulo).join(", ")}`); return; }
    setGerandoTipo(extrasDoc.tipo);
    gerarMut.mutate({ companyId: empresaDoSel, employeeId: empSel.id, tipo: extrasDoc.tipo as any, extras: montarExtras() });
    setExtrasDoc(null);
  };

  // Rev. 4673 — geração em LOTE com progresso 0–100%
  const faltantes = (checklist?.modelos ?? []).filter((m: any) => m.situacao === "faltando");
  const toggleTipo = (tipo: string) => setSelTipos(prev => {
    const n = new Set(prev);
    n.has(tipo) ? n.delete(tipo) : n.add(tipo);
    return n;
  });
  const todosFaltantesSelecionados = faltantes.length > 0 && faltantes.every((m: any) => selTipos.has(m.tipo));
  const selecionarTodosFaltantes = (checked: boolean) => {
    setSelTipos(checked ? new Set(faltantes.map((m: any) => m.tipo)) : new Set());
  };
  const gerarLote = async () => {
    if (!empSel || selTipos.size === 0 || lote) return;
    // Rev. 5048 — documentos custom ficam FORA do lote (precisam dos itens
    // entregues/observações digitados no dialog próprio)
    const pulados = (checklist?.modelos ?? []).filter((m: any) => selTipos.has(m.tipo) && isCustomTipo(m.tipo));
    if (pulados.length) toast.info(`Gere individualmente (pedem itens/observações): ${pulados.map((m: any) => m.titulo).join(", ")}`);
    const tipos = (checklist?.modelos ?? []).filter((m: any) => selTipos.has(m.tipo) && !isCustomTipo(m.tipo)).map((m: any) => ({ tipo: m.tipo, titulo: m.titulo }));
    if (tipos.length === 0) { setLote(null); return; }
    let ok = 0, falhas: string[] = [];
    setLote({ done: 0, total: tipos.length, atual: tipos[0]?.titulo || "" });
    for (let i = 0; i < tipos.length; i++) {
      setLote({ done: i, total: tipos.length, atual: tipos[i].titulo });
      try {
        await gerarLoteMut.mutateAsync({ companyId: empresaDoSel, employeeId: empSel.id, tipo: tipos[i].tipo as any });
        ok++;
      } catch (e: any) {
        falhas.push(`${tipos[i].titulo}: ${e?.message || "falha"}`);
      }
    }
    setLote({ done: tipos.length, total: tipos.length, atual: "" });
    refetchTudo();
    setSelTipos(new Set());
    setTimeout(() => setLote(null), 1200);
    if (falhas.length) toast.error(`${ok} gerado(s) · falhas: ${falhas.join("; ")}`);
    else toast.success(`${ok} documento(s) gerado(s)!`);
  };
  const lotePct = lote ? Math.round((lote.done / Math.max(lote.total, 1)) * 100) : 0;

  // Marca N/A em lote para todos os itens selecionados
  const marcarNALote = async () => {
    if (!empSel || selTipos.size === 0 || naLote) return;
    const alvos = (checklist?.modelos ?? []).filter((m: any) => selTipos.has(m.tipo) && m.situacao === "faltando");
    if (alvos.length === 0) { setNaConfirmOpen(false); return; }
    setNaConfirmOpen(false);
    setNaLote({ done: 0, total: alvos.length });
    let ok = 0;
    const falhas: string[] = [];
    for (let i = 0; i < alvos.length; i++) {
      setNaLote({ done: i, total: alvos.length });
      try {
        await naMut.mutateAsync({ companyId: empresaDoSel, employeeId: empSel.id, tipo: alvos[i].tipo as any });
        ok++;
      } catch (e: any) {
        falhas.push(alvos[i].titulo);
      }
    }
    setNaLote({ done: alvos.length, total: alvos.length });
    refetchTudo();
    setSelTipos(new Set());
    setTimeout(() => setNaLote(null), 1200);
    if (falhas.length) toast.error(`${ok} marcado(s) como N/A · falhas: ${falhas.join(", ")}`);
    else toast.success(`${ok} documento(s) marcado(s) como N/A.`);
  };

  // Rev. 4978 — N/A conta como resolvido no % (documento já assinado fisicamente)
  const pctSel = checklist ? Math.round(((checklist.modelos as any[]).filter(m => m.situacao === "assinado" || m.situacao === "nao_aplicavel").length / Math.max((checklist.modelos as any[]).length, 1)) * 100) : 0;

  const sit = (s: string) =>
    s === "assinado" ? <Badge className="bg-green-100 text-green-800 border-green-300 text-[10px]">Assinado</Badge>
    : s === "gerado" ? <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-[10px]">Aguardando assinatura</Badge>
    : s === "nao_aplicavel" ? <Badge className="bg-slate-200 text-slate-600 border-slate-300 text-[10px]">N/A</Badge>
    : <Badge variant="outline" className="text-[10px] text-red-600 border-red-300">Faltando</Badge>;

  // Badges para co-assinatura do empregador — backwards-compatible.
  // Campos canônicos: empregadorAssinadoEm (truthy = assinado), empregadorModo.
  const sitEmpregador = (d: any) => {
    if (!d) return null;
    if (d.empregadorAssinadoEm) {
      return (
        <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-[10px] gap-1">
          <Building2 className="w-2.5 h-2.5" /> Empregador assinou
        </Badge>
      );
    }
    // colaborador assinou, doc é elegível e ainda sem data do empregador = aguardando
    const elegivel = d.employerSignatureRequired ?? d.empregadorElegivel ?? false;
    if (d.status === "assinado" && !d.empregadorAssinadoEm && elegivel) {
      return (
        <Badge className="bg-slate-100 text-slate-600 border-slate-300 text-[10px] gap-1">
          <Building2 className="w-2.5 h-2.5" /> Aguarda empregador
        </Badge>
      );
    }
    return null;
  };

  return (
    <DashboardLayout>
    <div className="p-4 space-y-4 max-w-6xl mx-auto">
      {/* Rev. 4674 — botão Voltar + página dentro do DashboardLayout (menu lateral fixo) */}
      {/* Rev. 4680 — Voltar via pilha interna: volta UMA tela (ex.: Controle de Documentos) */}
      <Button variant="ghost" size="sm" className="-ml-2 gap-1 text-muted-foreground hover:text-foreground w-fit" onClick={() => { const prev = popNavBack(); if (prev) setLocation(prev); else if (window.history.length > 1) window.history.back(); else setLocation("/"); }}>
        <ArrowLeft className="w-4 h-4" /> Voltar
      </Button>
      <div className="flex items-center gap-2">
        <FolderOpen className="h-6 w-6 text-[#0A1E3C]" />
        <div>
          <h1 className="text-lg font-bold text-[#0A1E3C]">Documentos do Colaborador</h1>
          <p className="text-xs text-muted-foreground">Dossiê digital: gere, colete assinatura e mantenha a documentação de cada funcionário em dia.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
        {/* Lista de funcionários — foto + % de completude */}
        <Card className="overflow-hidden">
          <CardHeader className="pb-2 bg-gradient-to-r from-[#0A1E3C] to-[#12305e] text-white rounded-t-lg">
            <CardTitle className="text-sm">Funcionários</CardTitle>
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-2 top-2.5 text-slate-400" />
              <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou função…" className="pl-7 h-8 text-xs bg-white text-slate-900" />
            </div>
          </CardHeader>
          <CardContent className="p-1.5 max-h-[70vh] overflow-y-auto">
            {loadingEmps ? (
              <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-[#0A1E3C]" /></div>
            ) : filtrados.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">Nenhum funcionário encontrado.</p>
            ) : filtrados.map((e: any) => {
              const pct = pctDe(e);
              const ativo = empSelId === e.id;
              return (
                <button
                  key={e.id}
                  onClick={() => setEmpSelId(e.id)}
                  className={`w-full text-left px-2 py-1.5 rounded-lg flex items-center gap-2 ${ativo ? "bg-[#0A1E3C] text-white" : "hover:bg-slate-100"}`}
                >
                  <PersonPhoto src={thumb(e.fotoUrl)} alt={e.nomeCompleto} size="sm" clickable={false} showZoomHint={false} />
                  <div className="min-w-0 flex-1">
                    <span className="font-medium block truncate text-xs" title={e.nomeCompleto}>{e.nomeCompleto}</span>
                    <span className={`block truncate text-[10px] ${ativo ? "text-white/70" : "text-muted-foreground"}`}>{e.funcao || "—"}</span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <div className={`h-1 flex-1 rounded-full overflow-hidden ${ativo ? "bg-white/20" : "bg-slate-200"}`}>
                        <div className={`h-full rounded-full ${pctColor(pct)}`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className={`text-[9px] font-semibold w-7 text-right ${ativo ? "text-white/90" : "text-slate-500"}`}>{pct}%</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </CardContent>
        </Card>

        {/* Painel do funcionário */}
        <div className="space-y-4">
          {/* Fila de co-assinatura do empregador — apenas para admins autorizados */}
          {canManageEmployerSignature && companyId > 0 && (
            <EmpregadorAssinaturaPendentes companyId={companyId} />
          )}

          {!empSel ? (
            <Card><CardContent className="py-16 text-center text-sm text-muted-foreground">Selecione um funcionário para ver o checklist documental.</CardContent></Card>
          ) : loadingCheck || !checklist ? (
            <Card><CardContent className="py-16 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-[#0A1E3C]" /></CardContent></Card>
          ) : (
            <>
              {/* Cabeçalho do dossiê — foto + progresso geral */}
              <Card className="overflow-hidden">
                <div className="bg-gradient-to-r from-[#0A1E3C] to-[#12305e] text-white px-4 py-3 flex items-center gap-3">
                  <PersonPhoto src={thumb(empSel.fotoUrl)} alt={empSel.nomeCompleto} size="lg" caption={empSel.funcao || undefined} />
                  <div className="min-w-0 flex-1">
                    <h2 className="text-sm font-bold truncate">{empSel.nomeCompleto}</h2>
                    <p className="text-[11px] text-white/70 truncate">{empSel.funcao || "—"}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <div className="h-2 flex-1 max-w-xs rounded-full bg-white/20 overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${pctColor(pctSel)}`} style={{ width: `${pctSel}%` }} />
                      </div>
                      <span className="text-xs font-bold text-[#EE9803]">{pctSel}%</span>
                      <span className="text-[10px] text-white/60">assinados</span>
                    </div>
                  </div>
                  <ShieldCheck className="h-8 w-8 text-white/30 shrink-0 hidden sm:block" />
                </div>

                {/* Barra de ações do lote */}
                <CardContent className="pt-3 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2 pb-1">
                    <label className="flex items-center gap-1.5 h-7 px-2 rounded-md border text-[10px] cursor-pointer hover:bg-slate-50 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50">
                      <Checkbox
                        checked={todosFaltantesSelecionados ? true : selTipos.size > 0 ? "indeterminate" : false}
                        onCheckedChange={(checked) => selecionarTodosFaltantes(checked === true || checked === "indeterminate")}
                        disabled={faltantes.length === 0 || !!lote}
                        aria-label="Selecionar todos os documentos faltantes"
                        className="h-3.5 w-3.5 data-[state=checked]:bg-[#EE9803] data-[state=checked]:border-[#EE9803] data-[state=indeterminate]:bg-[#EE9803] data-[state=indeterminate]:border-[#EE9803]"
                      />
                      <Layers className="h-3 w-3" />
                      <span>Selecionar todos ({faltantes.length})</span>
                    </label>
                    {selTipos.size > 0 && !lote && !naLote ? (
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px]" onClick={() => setSelTipos(new Set())}>Limpar</Button>
                    ) : null}
                    <div className="flex-1" />
                    {/* N/A em lote — marca todos os selecionados como não se aplica */}
                    <Button size="sm" variant="outline" className="h-7 px-3 text-[10px] gap-1 border-slate-300 text-slate-600 hover:bg-slate-50"
                      disabled={selTipos.size === 0 || !!lote || !!naLote}
                      onClick={() => setNaConfirmOpen(true)}>
                      {naLote ? <Loader2 className="h-3 w-3 animate-spin" /> : <Ban className="h-3 w-3" />}
                      {naLote
                        ? `N/A… ${naLote.done}/${naLote.total}`
                        : `N/A (${selTipos.size})`}
                    </Button>
                    <Button size="sm" className="h-7 px-3 text-[10px] gap-1 bg-[#EE9803] hover:bg-[#EE9803]/90 text-white"
                      disabled={selTipos.size === 0 || !!lote || !!naLote}
                      onClick={gerarLote}>
                      {lote ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                      {todosFaltantesSelecionados ? `Gerar todos (${selTipos.size})` : `Gerar selecionados (${selTipos.size})`}
                    </Button>
                  </div>

                  {lote ? (
                    <div className="rounded-lg border bg-slate-50 px-3 py-2 space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-600 truncate">{lote.atual ? `Gerando: ${lote.atual}…` : "Concluído!"}</span>
                        <span className="font-bold text-[#0A1E3C]">{lotePct}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
                        <div className="h-full rounded-full bg-[#EE9803] transition-all" style={{ width: `${lotePct}%` }} />
                      </div>
                      <span className="text-[10px] text-muted-foreground">{lote.done} de {lote.total} documento(s)</span>
                    </div>
                  ) : null}

                  {/* Checklist com checkbox */}
                  {checklist.modelos.map((m: any) => (
                    <div key={m.tipo} className={`flex items-center justify-between gap-2 border rounded-lg px-2 py-1.5 ${selTipos.has(m.tipo) ? "border-[#EE9803] bg-orange-50/50" : ""}`}>
                      <div className="flex items-center gap-2 min-w-0">
                        {m.situacao === "faltando" ? (
                          <Checkbox
                            checked={selTipos.has(m.tipo)}
                            onCheckedChange={() => toggleTipo(m.tipo)}
                            disabled={!!lote}
                            className="h-4 w-4 shrink-0 data-[state=checked]:bg-[#EE9803] data-[state=checked]:border-[#EE9803]"
                          />
                        ) : m.situacao === "assinado" ? <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                          : <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />}
                        <span className="text-xs truncate" title={m.titulo}>
                          {m.titulo}
                          {!m.obrigatorio && <span className="text-muted-foreground text-[10px]"> (quando aplicável)</span>}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {sit(m.situacao)}
                        {/* Rev. 4675 — olhinho: vê o documento preenchido antes de gerar/enviar */}
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-slate-500 hover:text-[#0A1E3C]" title="Pré-visualizar preenchido"
                          onClick={() => setPreviewReq({ tipo: m.tipo, titulo: m.titulo })}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        {m.situacao === "nao_aplicavel" ? (
                          /* Rev. 4978 — desfazer o N/A: exclui o marcador e volta a "Faltando" */
                          <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] text-slate-500"
                            disabled={excluirMut.isPending}
                            onClick={() => { if (m.docId && confirm(`Desfazer o N/A de "${m.titulo}"? O documento volta a constar como pendente.`)) excluirMut.mutate({ id: m.docId }); }}>
                            Desfazer
                          </Button>
                        ) : m.docId ? (
                          <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={() => setDocAberto(m.docId)}>Abrir</Button>
                        ) : (
                          <>
                            <Button variant="outline" size="sm" className="h-6 px-2 text-[10px] gap-1"
                              disabled={(gerarMut.isPending && gerandoTipo === m.tipo) || !!lote}
                              onClick={() => iniciarGeracao(m.tipo, m.titulo)}>
                              {gerarMut.isPending && gerandoTipo === m.tipo ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} Gerar
                            </Button>
                            {/* Rev. 4978 — N/A: já possui esse documento assinado (coleta física anterior) */}
                            <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] text-slate-500 hover:text-slate-700"
                              title="Não se aplica: o colaborador já possui este documento assinado — não precisa colher de novo"
                              disabled={naMut.isPending || !!lote}
                              onClick={() => { if (confirm(`Marcar "${m.titulo}" como N/A (não se aplica)?\n\nUse quando o colaborador já possui este documento assinado — ele deixa de contar como pendente.`)) naMut.mutate({ companyId: empresaDoSel, employeeId: empSel.id, tipo: m.tipo as any }); }}>
                              N/A
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}

                  {/* Resumo SST + anexos */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 pt-2">
                    <div className="border rounded px-2 py-1.5 text-[11px] flex items-center gap-1.5">
                      {checklist.sst.asoVigente ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> : <Circle className="h-3.5 w-3.5 text-red-400" />}
                      ASO vigente
                    </div>
                    <div className="border rounded px-2 py-1.5 text-[11px] flex items-center gap-1.5">
                      {checklist.sst.osAssinada ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> : <Circle className="h-3.5 w-3.5 text-red-400" />}
                      OS (NR-01) assinada
                    </div>
                    <div className="border rounded px-2 py-1.5 text-[11px] flex items-center gap-1.5">
                      {checklist.sst.epiEntregas > 0 && checklist.sst.epiAssinaturas > 0 ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> : <Circle className="h-3.5 w-3.5 text-slate-300" />}
                      EPIs: {checklist.sst.epiEntregas} entrega(s)
                    </div>
                    <div className="border rounded px-2 py-1.5 text-[11px] flex items-center gap-1.5">
                      {checklist.sst.treinamentosVigentes > 0 ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> : <Circle className="h-3.5 w-3.5 text-slate-300" />}
                      Treinamentos vigentes: {checklist.sst.treinamentosVigentes}
                    </div>
                    <div className="border rounded px-2 py-1.5 text-[11px] flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5 text-[#0A1E3C]" /> Anexos: {checklist.anexos}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Rev. 4672 — Documentos eventuais (por evento: férias, folha, aditivo) */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <FileText className="h-4 w-4 text-[#0A1E3C]" /> Documentos eventuais
                  </CardTitle>
                  <p className="text-[10px] text-muted-foreground">Gerados sob demanda: férias, recibos de folha e alterações contratuais. Ficam no histórico abaixo.</p>
                </CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {RH_DOCS_EVENTUAIS.map(({ tipo }) => {
                    const meta = getTemplateMeta(tipo);
                    if (!meta) return null;
                    return (
                      <div key={tipo} className="flex items-center justify-between gap-2 border rounded px-2 py-1.5">
                        <span className="text-xs truncate" title={meta.titulo}>{meta.titulo}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-slate-500 hover:text-[#0A1E3C]" title="Pré-visualizar preenchido"
                            onClick={() => setPreviewReq({ tipo, titulo: meta.titulo })}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="outline" size="sm" className="h-6 px-2 text-[10px] gap-1"
                            disabled={gerarMut.isPending && gerandoTipo === tipo}
                            onClick={() => iniciarGeracao(tipo, meta.titulo)}>
                            {gerarMut.isPending && gerandoTipo === tipo ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} Gerar
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              {/* Rev. 4672 — Fase 4: dependentes do colaborador */}
              <DependentesCard companyId={empresaDoSel} employeeId={empSel.id} />

              {/* Histórico de documentos gerados */}
              {docs.length > 0 && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Documentos gerados</CardTitle></CardHeader>
                  <CardContent className="space-y-1.5">
                    {(docs as any[]).map((d) => (
                      <div key={d.id} className="flex items-center justify-between gap-2 border rounded px-2 py-1.5">
                        <div className="min-w-0">
                          <span className="text-xs font-medium block truncate" title={d.titulo}>{d.titulo} {d.codigo ? <span className="text-muted-foreground">({d.codigo})</span> : null}</span>
                          <span className="text-[10px] text-muted-foreground">
                            Gerado em {fmtDateTime(d.createdAt)}{d.criadoPorNome ? ` por ${d.criadoPorNome}` : ""}{d.assinadoEm ? ` · Col. assinou em ${fmtDateTime(d.assinadoEm)}` : ""}
                            {d.empregadorAssinadoEm ? ` · Empregador assinou em ${fmtDateTime(d.empregadorAssinadoEm)}` : ""}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {sit(d.status)}
                          {sitEmpregador(d)}
                          <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={() => setDocAberto(d.id)}>Abrir</Button>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </div>

      {/* Dialog confirmação N/A em lote */}
      <Dialog open={naConfirmOpen} onOpenChange={(o) => { if (!o) setNaConfirmOpen(false); }}>
        <DialogContent className="max-w-sm w-[92vw]" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Ban className="h-4 w-4 text-slate-500" />
              Marcar {selTipos.size} documento(s) como N/A?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Use quando o colaborador já possui estes documentos assinados fisicamente — eles deixam de contar como pendentes.
          </p>
          <div className="max-h-40 overflow-y-auto border rounded-md px-3 py-2 text-xs space-y-1 bg-slate-50">
            {(checklist?.modelos ?? [])
              .filter((m: any) => selTipos.has(m.tipo) && m.situacao === "faltando")
              .map((m: any) => <div key={m.tipo} className="text-slate-700">• {m.titulo}</div>)}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setNaConfirmOpen(false)}>Cancelar</Button>
            <Button size="sm" onClick={marcarNALote} className="gap-1.5">
              <Ban className="h-3.5 w-3.5" /> Confirmar N/A
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rev. 4672 — Dialog de campos extras antes de gerar */}
      <Dialog open={!!extrasDoc} onOpenChange={(o) => { if (!o) setExtrasDoc(null); }}>
        <DialogContent className="max-w-md w-[96vw] max-h-[92dvh] overflow-y-auto" aria-describedby={undefined}>
          <DialogHeader><DialogTitle className="text-base">{extrasDoc?.titulo}</DialogTitle></DialogHeader>
          <div className="space-y-2 text-xs">
            {/* Rev. 5048 — documento custom: itens entregues (tabela dinâmica) */}
            {extrasDoc?.custom && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="font-medium">Itens entregues</label>
                  <Button type="button" variant="outline" size="sm" className="h-6 px-2 text-[10px] gap-1"
                    onClick={() => setExtrasItens(v => [...v, { descricao: "", qtd: "1", estado: "Novo" }])}>
                    <Plus className="h-3 w-3" /> Adicionar item
                  </Button>
                </div>
                {extrasItens.map((it, idx) => (
                  <div key={idx} className="flex items-center gap-1.5">
                    <span className="text-[10px] text-muted-foreground w-4 shrink-0">#{idx + 1}</span>
                    <Input className="h-8 text-xs flex-1" placeholder="Ex: Notebook Dell Latitude 7420, S/N ABC12345"
                      value={it.descricao}
                      onChange={e => setExtrasItens(v => v.map((x, i) => i === idx ? { ...x, descricao: e.target.value } : x))} />
                    <Input className="h-8 text-xs w-14 shrink-0" placeholder="Qtd."
                      value={it.qtd}
                      onChange={e => setExtrasItens(v => v.map((x, i) => i === idx ? { ...x, qtd: e.target.value } : x))} />
                    <Input className="h-8 text-xs w-24 shrink-0" placeholder="Estado"
                      value={it.estado}
                      onChange={e => setExtrasItens(v => v.map((x, i) => i === idx ? { ...x, estado: e.target.value } : x))} />
                    {extrasItens.length > 1 && (
                      <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0 text-red-500"
                        onClick={() => setExtrasItens(v => v.filter((_, i) => i !== idx))}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
                <p className="text-[10px] text-muted-foreground">Os itens entram na tabela "Relação específica dos itens entregues" do documento.</p>
              </div>
            )}
            {extrasDoc?.campos.map(c => (
              <div key={c.chave}>
                <label className="font-medium">{c.rotulo}{c.obrigatorio ? " *" : ""}</label>
                <Input className="h-8 text-xs mt-0.5" placeholder={c.placeholder || ""}
                  value={extrasVals[c.chave] || ""}
                  onChange={e => setExtrasVals(v => ({ ...v, [c.chave]: e.target.value }))} />
              </div>
            ))}
            <p className="text-[10px] text-muted-foreground">Campos em branco saem vazios no documento. Dados do colaborador e da empresa entram automaticamente.</p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => setExtrasDoc(null)}>Cancelar</Button>
            {/* Rev. 4675 — olhinho também aqui: vê com os valores digitados */}
            <Button variant="outline" size="sm" className="gap-1"
              onClick={() => { if (extrasDoc) setPreviewReq({ tipo: extrasDoc.tipo, titulo: extrasDoc.titulo, extras: montarExtras() }); }}>
              <Eye className="h-3.5 w-3.5" /> Pré-visualizar
            </Button>
            <Button size="sm" className="bg-[#0A1E3C] hover:bg-[#0A1E3C]/90" disabled={gerarMut.isPending} onClick={confirmarGeracao}>
              {gerarMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null} Gerar documento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rev. 4675 — Dialog do olhinho: documento preenchido, SEM salvar */}
      <Dialog open={!!previewReq} onOpenChange={(o) => { if (!o) setPreviewReq(null); }}>
        <DialogContent className="max-w-3xl w-[96vw] max-h-[92dvh] overflow-y-auto" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Eye className="h-5 w-5 text-[#0A1E3C]" /> {previewReq?.titulo}
              <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-300 bg-amber-50">Pré-visualização — nada foi salvo</Badge>
            </DialogTitle>
          </DialogHeader>
          {loadingPreview || !previewData ? (
            <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-[#0A1E3C]" /></div>
          ) : (
            <div
              className="border rounded-lg p-4 text-[12px] leading-relaxed bg-white overflow-x-auto break-words"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(previewData.conteudoHtml) }}
            />
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => setPreviewReq(null)}>Fechar</Button>
            {previewReq ? (
              <Button size="sm" className="gap-1 bg-[#0A1E3C] hover:bg-[#0A1E3C]/90"
                disabled={gerarMut.isPending}
                onClick={() => {
                  const p = previewReq; setPreviewReq(null);
                  // Rev. 5048 — se veio do dialog de campos extras, gera com os
                  // MESMOS valores pré-visualizados (não reabre em branco)
                  if (p.extras && Object.keys(p.extras).length && empSel) {
                    setGerandoTipo(p.tipo);
                    gerarMut.mutate({ companyId: empresaDoSel, employeeId: empSel.id, tipo: p.tipo as any, extras: p.extras });
                    setExtrasDoc(null);
                    return;
                  }
                  iniciarGeracao(p.tipo, p.titulo);
                }}>
                <Plus className="h-3.5 w-3.5" /> Gerar este documento
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de preview do documento */}
      <Dialog open={!!docAberto} onOpenChange={(o) => { if (!o) setDocAberto(null); }}>
        <DialogContent className="max-w-3xl w-[96vw] max-h-[92dvh] overflow-y-auto" aria-describedby={undefined}>
          {loadingDoc || !docDetalhe ? (
            <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-[#0A1E3C]" /></div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-base">
                  <FileText className="h-5 w-5 text-[#0A1E3C]" /> {docDetalhe.titulo}
                  {docDetalhe.codigo ? <Badge variant="outline" className="text-[10px]">{docDetalhe.codigo}</Badge> : null}
                  {sit(docDetalhe.status)}
                </DialogTitle>
              </DialogHeader>

              <div
                className="border rounded-lg p-4 text-[12px] leading-relaxed bg-white overflow-x-auto break-words"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(docDetalhe.conteudoHtml) }}
              />

              {docDetalhe.status === "assinado" ? (
                <div className="rounded-lg border px-3 py-2 text-[11px] space-y-1.5">
                  {/* Assinatura do colaborador */}
                  <div>
                    <span className="inline-block text-green-700 border border-green-600 rounded px-1.5 py-0.5 font-bold text-[10px]">✓ ASSINADO DIGITALMENTE (COLABORADOR)</span>
                    <span className="block text-muted-foreground mt-0.5">
                      {fmtDateTime(docDetalhe.assinadoEm)}{(docDetalhe as any).assinaturaIp ? ` · IP ${(docDetalhe as any).assinaturaIp}` : ""}
                      {(docDetalhe as any).assinaturaHash ? ` · SHA-256 ${String((docDetalhe as any).assinaturaHash).slice(0, 16)}…` : ""}
                    </span>
                  </div>
                  {/* Co-assinatura do empregador — campos canônicos:
                      empregadorAssinadoEm, empregadorSocioNome (signatário legal),
                      empregadorOperadorNome (quem operou/confirmou), empregadorModo */}
                  {(() => {
                    const dd = docDetalhe as any;
                    if (dd.empregadorAssinadoEm) {
                      const socioNome = dd.empregadorSocioNome;
                      const operadorNome = dd.empregadorOperadorNome;
                      return (
                        <div>
                          <span className="inline-flex items-center gap-1 text-blue-700 border border-blue-500 rounded px-1.5 py-0.5 font-bold text-[10px]">
                            <Building2 className="w-2.5 h-2.5" /> ✓ CO-ASSINADO PELO EMPREGADOR
                          </span>
                          <span className="block text-muted-foreground mt-0.5">
                            {fmtDateTime(dd.empregadorAssinadoEm)}
                            {socioNome ? ` · signatário: ${socioNome}` : ""}
                            {operadorNome && operadorNome !== socioNome
                              ? ` · operado por: ${operadorNome}` : ""}
                            {dd.empregadorModo ? ` · modo: ${dd.empregadorModo}` : ""}
                          </span>
                        </div>
                      );
                    }
                    const elegivel = dd.employerSignatureRequired ?? dd.empregadorElegivel ?? false;
                    if (dd.status === "assinado" && elegivel) {
                      return (
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                          <Building2 className="w-3 h-3 text-blue-400" />
                          Aguardando co-assinatura do empregador
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>
              ) : null}

              <DialogFooter className="gap-2 sm:gap-0 flex-wrap">
                {docDetalhe.status !== "assinado" ? (
                  <Button variant="outline" size="sm" className="gap-1 text-red-600 border-red-300"
                    disabled={excluirMut.isPending}
                    onClick={() => { if (confirm("Excluir este documento?")) { excluirMut.mutate({ id: docDetalhe.id }); setDocAberto(null); } }}>
                    <Trash2 className="h-3.5 w-3.5" /> Excluir
                  </Button>
                ) : null}
                <Button variant="outline" size="sm" onClick={() => setDocAberto(null)}>Fechar</Button>
                {docDetalhe.status !== "assinado" ? (
                  <>
                    <Button variant="outline" size="sm" className="gap-1 border-[#0A1E3C] text-[#0A1E3C]"
                      onClick={() => setAssinandoDoc({ id: docDetalhe.id, titulo: docDetalhe.titulo, tipo: (docDetalhe as any).tipo })}>
                      <PenLine className="h-3.5 w-3.5" /> Assinar agora
                    </Button>
                    <Button size="sm" className="gap-1 bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 text-white"
                      onClick={() => setFcsignDoc({ id: docDetalhe.id, titulo: docDetalhe.titulo, html: docDetalhe.conteudoHtml })}>
                      <Send className="h-3.5 w-3.5" /> FCSign
                    </Button>
                  </>
                ) : null}
                <Button size="sm" className="gap-1.5 bg-[#0A1E3C] hover:bg-[#0A1E3C]/90"
                  onClick={() => window.open(`/api/download/rh-documento-pdf?id=${docDetalhe.id}`, "_blank")}>
                  <Download className="h-4 w-4" /> Baixar PDF
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Rev. 4673 — FCSign: envio p/ assinatura por link (igual ficha de EPI) */}
      {fcsignDoc && empSel ? (
        <FCSignSendDialog
          open={!!fcsignDoc}
          onOpenChange={(v) => { if (!v) { setFcsignDoc(null); refetchTudo(); } }}
          companyId={empresaDoSel}
          employeeId={empSel.id}
          tipo="rh_documento"
          documentTitle={fcsignDoc.titulo}
          documentHtml={fcsignDoc.html}
          empregadoNome={empSel.nomeCompleto}
          empregadoCpf={empSel.cpf || undefined}
          observacoes={`rh_documento:${fcsignDoc.id}`}
        />
      ) : null}

      {/* Overlay de assinatura presencial (pad) */}
      {assinandoDoc && empSel ? (
        <div
          // pointer-events-auto: o Dialog (Radix) atrás seta pointer-events:none
          // no <body>; sem isso o pad fica 100% travado (mouse e touch).
          className="pointer-events-auto fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4 overflow-y-auto overscroll-contain"
          onWheel={(e) => e.stopPropagation()}
        >
          <div className="max-w-lg w-full my-auto">
            <RhDocAssinatura
              docId={assinandoDoc.id}
              docTitulo={assinandoDoc.titulo}
              docTipo={(assinandoDoc as any).tipo}
              employeeName={empSel.nomeCompleto}
              onComplete={() => { setAssinandoDoc(null); refetchTudo(); }}
              onCancel={() => setAssinandoDoc(null)}
            />
          </div>
        </div>
      ) : null}
    </div>
    </DashboardLayout>
  );
}
