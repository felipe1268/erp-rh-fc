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
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import RhDocAssinatura from "@/components/RhDocAssinatura";
import DependentesCard from "@/components/DependentesCard";
import FCSignSendDialog from "@/components/FCSignSendDialog";
import { PersonPhoto } from "@/components/PersonPhoto";
import { RH_DOC_CAMPOS_EXTRAS, RH_DOCS_EVENTUAIS, getTemplateMeta, type CampoExtraDef } from "@shared/documentTemplates";

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
  const { selectedCompanyId, getCompanyIdsForQuery } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) || 0 : 0;
  const companyIds = getCompanyIdsForQuery();
  const enabled = !!companyId || (companyIds?.length ?? 0) > 0;

  const [busca, setBusca] = useState("");
  const [empSelId, setEmpSelId] = useState<number | null>(null);
  const [docAberto, setDocAberto] = useState<number | null>(null);
  const [assinandoDoc, setAssinandoDoc] = useState<{ id: number; titulo: string } | null>(null);
  const [gerandoTipo, setGerandoTipo] = useState<string | null>(null);
  // Rev. 4672 — dialog de campos extras (contrato CLT, férias, folha, aditivo…)
  const [extrasDoc, setExtrasDoc] = useState<{ tipo: string; titulo: string; campos: CampoExtraDef[] } | null>(null);
  const [extrasVals, setExtrasVals] = useState<Record<string, string>>({});
  // Rev. 4673 — seleção p/ geração em lote + progresso
  const [selTipos, setSelTipos] = useState<Set<string>>(new Set());
  const [lote, setLote] = useState<{ done: number; total: number; atual: string } | null>(null);
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
    const assinados = Object.values(f.docs || {}).filter((d: any) => d.situacao === "assinado").length;
    return Math.round((assinados / totalModelos) * 100);
  };
  const empSel = useMemo(() => funcionarios.find(f => f.id === empSelId) || null, [funcionarios, empSelId]);

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

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return funcionarios.filter(e => !q || (e.nomeCompleto || "").toLowerCase().includes(q) || (e.funcao || "").toLowerCase().includes(q)).slice(0, 80);
  }, [funcionarios, busca]);

  // Rev. 4672 — geração unitária: tipos com campos extras abrem dialog antes
  const iniciarGeracao = (tipo: string, titulo: string) => {
    const campos = (RH_DOC_CAMPOS_EXTRAS as any)[tipo] as CampoExtraDef[] | undefined;
    if (campos?.length) { setExtrasVals({}); setExtrasDoc({ tipo, titulo, campos }); return; }
    setGerandoTipo(tipo);
    gerarMut.mutate({ companyId: empresaDoSel, employeeId: empSelId!, tipo: tipo as any });
  };
  const confirmarGeracao = () => {
    if (!extrasDoc || !empSel) return;
    const faltando = extrasDoc.campos.filter(c => c.obrigatorio && !(extrasVals[c.chave] || "").trim());
    if (faltando.length) { toast.error(`Preencha: ${faltando.map(f => f.rotulo).join(", ")}`); return; }
    const extras: Record<string, string> = {};
    for (const c of extrasDoc.campos) { const v = (extrasVals[c.chave] || "").trim(); if (v) extras[c.chave] = v; }
    setGerandoTipo(extrasDoc.tipo);
    gerarMut.mutate({ companyId: empresaDoSel, employeeId: empSel.id, tipo: extrasDoc.tipo as any, extras });
    setExtrasDoc(null);
  };

  // Rev. 4673 — geração em LOTE com progresso 0–100%
  const faltantes = (checklist?.modelos ?? []).filter((m: any) => m.situacao === "faltando");
  const toggleTipo = (tipo: string) => setSelTipos(prev => {
    const n = new Set(prev);
    n.has(tipo) ? n.delete(tipo) : n.add(tipo);
    return n;
  });
  const gerarLote = async () => {
    if (!empSel || selTipos.size === 0 || lote) return;
    const tipos = (checklist?.modelos ?? []).filter((m: any) => selTipos.has(m.tipo)).map((m: any) => ({ tipo: m.tipo, titulo: m.titulo }));
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

  const pctSel = checklist ? Math.round(((checklist.modelos as any[]).filter(m => m.situacao === "assinado").length / Math.max((checklist.modelos as any[]).length, 1)) * 100) : 0;

  const sit = (s: string) =>
    s === "assinado" ? <Badge className="bg-green-100 text-green-800 border-green-300 text-[10px]">Assinado</Badge>
    : s === "gerado" ? <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-[10px]">Aguardando assinatura</Badge>
    : <Badge variant="outline" className="text-[10px] text-red-600 border-red-300">Faltando</Badge>;

  return (
    <DashboardLayout>
    <div className="p-4 space-y-4 max-w-6xl mx-auto">
      {/* Rev. 4674 — botão Voltar + página dentro do DashboardLayout (menu lateral fixo) */}
      <Button variant="ghost" size="sm" className="-ml-2 gap-1 text-muted-foreground hover:text-foreground w-fit" onClick={() => window.history.back()}>
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
                    <Button variant="outline" size="sm" className="h-7 px-2 text-[10px] gap-1"
                      disabled={faltantes.length === 0 || !!lote}
                      onClick={() => setSelTipos(new Set(faltantes.map((m: any) => m.tipo)))}>
                      <Layers className="h-3 w-3" /> Selecionar faltantes ({faltantes.length})
                    </Button>
                    {selTipos.size > 0 && !lote ? (
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px]" onClick={() => setSelTipos(new Set())}>Limpar</Button>
                    ) : null}
                    <div className="flex-1" />
                    <Button size="sm" className="h-7 px-3 text-[10px] gap-1 bg-[#EE9803] hover:bg-[#EE9803]/90 text-white"
                      disabled={selTipos.size === 0 || !!lote}
                      onClick={gerarLote}>
                      {lote ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                      Gerar selecionados ({selTipos.size})
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
                        {m.docId ? (
                          <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={() => setDocAberto(m.docId)}>Abrir</Button>
                        ) : (
                          <Button variant="outline" size="sm" className="h-6 px-2 text-[10px] gap-1"
                            disabled={(gerarMut.isPending && gerandoTipo === m.tipo) || !!lote}
                            onClick={() => iniciarGeracao(m.tipo, m.titulo)}>
                            {gerarMut.isPending && gerandoTipo === m.tipo ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} Gerar
                          </Button>
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
                            Gerado em {fmtDateTime(d.createdAt)}{d.criadoPorNome ? ` por ${d.criadoPorNome}` : ""}{d.assinadoEm ? ` · Assinado em ${fmtDateTime(d.assinadoEm)}` : ""}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {sit(d.status)}
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

      {/* Rev. 4672 — Dialog de campos extras antes de gerar */}
      <Dialog open={!!extrasDoc} onOpenChange={(o) => { if (!o) setExtrasDoc(null); }}>
        <DialogContent className="max-w-md w-[96vw] max-h-[92dvh] overflow-y-auto" aria-describedby={undefined}>
          <DialogHeader><DialogTitle className="text-base">{extrasDoc?.titulo}</DialogTitle></DialogHeader>
          <div className="space-y-2 text-xs">
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
              onClick={() => { if (extrasDoc) setPreviewReq({ tipo: extrasDoc.tipo, titulo: extrasDoc.titulo, extras: { ...extrasVals } }); }}>
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
                onClick={() => { const p = previewReq; setPreviewReq(null); iniciarGeracao(p.tipo, p.titulo); }}>
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
                <div className="rounded-lg border px-3 py-2 text-[11px]">
                  <span className="inline-block text-green-700 border border-green-600 rounded px-1.5 py-0.5 font-bold text-[10px]">✓ ASSINADO DIGITALMENTE</span>
                  <span className="block text-muted-foreground mt-1">
                    {fmtDateTime(docDetalhe.assinadoEm)}{docDetalhe.assinaturaIp ? ` · IP ${docDetalhe.assinaturaIp}` : ""}
                    {docDetalhe.assinaturaHash ? ` · SHA-256 ${String(docDetalhe.assinaturaHash).slice(0, 16)}…` : ""}
                  </span>
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
                      onClick={() => setAssinandoDoc({ id: docDetalhe.id, titulo: docDetalhe.titulo })}>
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
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
          <div className="max-w-lg w-full my-auto">
            <RhDocAssinatura
              docId={assinandoDoc.id}
              docTitulo={assinandoDoc.titulo}
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
