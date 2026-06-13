import DashboardLayout from "@/components/DashboardLayout";
import PrintFooterLGPD from "@/components/PrintFooterLGPD";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import FullScreenDialog from "@/components/FullScreenDialog";
import RaioXFuncionario from "@/components/RaioXFuncionario";
import { formatCPF, fmtNum } from "@/lib/formatters";
import { normalizarTexto } from "@shared/textNormalization";
import {
  Shield, Plus, Search, Calendar, Users, Trash2, Pencil, Eye, X,
  AlertTriangle, CheckCircle2, Clock, CalendarDays, UserCheck,
  FileText, RefreshCw, Vote, Award, ClipboardList, Link2, Copy, Send,
  Loader2, Trophy, BarChart3, ListChecks, Printer, ChevronLeft, ChevronRight,
} from "lucide-react";
import { useState, useMemo, useEffect } from "react";

function formatDate(d: string | null | undefined) {
  if (!d) return "-";
  const parts = d.split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return d;
}

const STATUS_ELEICAO: Record<string, { label: string; color: string; bg: string }> = {
  Planejamento: { label: "Planejamento", color: "text-gray-700", bg: "bg-gray-100" },
  Inscricoes: { label: "Inscrições", color: "text-blue-700", bg: "bg-blue-100" },
  Campanha: { label: "Campanha", color: "text-purple-700", bg: "bg-purple-100" },
  Votacao: { label: "Votação", color: "text-amber-700", bg: "bg-amber-100" },
  "Votação Aberta": { label: "Votação Aberta", color: "text-amber-800", bg: "bg-amber-100" },
  Apuracao: { label: "Apuração", color: "text-orange-700", bg: "bg-orange-100" },
  Apurada: { label: "Apurada", color: "text-orange-700", bg: "bg-orange-100" },
  Concluida: { label: "Concluída", color: "text-green-700", bg: "bg-green-100" },
  "Concluída": { label: "Concluída", color: "text-green-700", bg: "bg-green-100" },
};

function EmpAvatar({ emp, size = 8 }: { emp: any; size?: 8 | 10 }) {
  const dim = size === 10 ? "w-10 h-10" : "w-8 h-8";
  const txt = size === 10 ? "text-sm" : "text-xs";
  const inicial = (emp?.nomeCompleto || "?")[0];
  const [imgOk, setImgOk] = useState(true);
  if (emp?.fotoUrl && imgOk) {
    return (
      <img
        src={emp.fotoUrl}
        alt={emp?.nomeCompleto || "Foto"}
        className={`${dim} rounded-full object-cover object-top shrink-0 border border-slate-200`}
        onError={() => setImgOk(false)}
      />
    );
  }
  return (
    <div className={`${dim} rounded-full bg-slate-100 flex items-center justify-center shrink-0`}>
      <span className={`${txt} font-bold text-slate-500`}>{inicial}</span>
    </div>
  );
}

function CandidatoAvatar({ c }: { c: any }) {
  const [imgOk, setImgOk] = useState(true);
  if (c?.employeeFoto && imgOk) {
    return (
      <img
        src={c.employeeFoto}
        alt={c.employeeName || "Foto"}
        className="w-9 h-9 rounded-full object-cover object-top shrink-0 border border-slate-200"
        onError={() => setImgOk(false)}
      />
    );
  }
  return (
    <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center shrink-0 text-xs font-bold text-slate-500">{c?.numero ?? (c?.employeeName || "?")[0]}</div>
  );
}

function EmployeeList({ employees, onSelect }: { employees: any[]; onSelect: (id: number) => void }) {
  return (
    <div className="mt-2 border rounded-lg max-h-56 overflow-y-auto bg-white">
      <div className="sticky top-0 bg-slate-50 px-3 py-1.5 border-b text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
        {employees.length} colaborador{employees.length !== 1 ? "es" : ""} encontrado{employees.length !== 1 ? "s" : ""}
      </div>
      {employees.length === 0 ? (
        <div className="p-6 text-center">
          <Users className="h-8 w-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">Nenhum colaborador encontrado</p>
          <p className="text-xs text-slate-400 mt-1">Tente outro nome, CPF, RG ou código interno</p>
        </div>
      ) : employees.slice(0, 50).map((e: any) => (
        <div key={e.id} className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm flex items-center gap-3 border-b border-slate-50 last:border-0 transition-colors" onClick={() => onSelect(e.id)}>
          <EmpAvatar emp={e} size={8} />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-slate-800 truncate">{e.nomeCompleto}</p>
            <p className="text-[11px] text-slate-400">{e.cargo || "Sem cargo"} · {formatCPF(e.cpf)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

const CARGO_CIPA: Record<string, string> = {
  Presidente: "Presidente",
  Vice_Presidente: "Vice-Presidente",
  Secretario: "Secretário",
  Membro_Titular: "Membro Titular",
  Membro_Suplente: "Membro Suplente",
};

export default function CipaCompleta() {
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery} = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) || 0 : 0;
  const companyIds = getCompanyIdsForQuery();
  const [tab, setTab] = useState("visao");
  const [selectedEleicaoId, setSelectedEleicaoId] = useState<number | null>(null);
  const [showEleicaoDialog, setShowEleicaoDialog] = useState(false);
  const [showMembroDialog, setShowMembroDialog] = useState(false);
  const [showReuniaoDialog, setShowReuniaoDialog] = useState(false);
  const [eleicaoForm, setEleicaoForm] = useState<any>({});
  const [membroForm, setMembroForm] = useState<any>({});
  const [reuniaoForm, setReuniaoForm] = useState<any>({});
  const [selReunioes, setSelReunioes] = useState<Set<number>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [raioXEmployeeId, setRaioXEmployeeId] = useState<number | null>(null);
  const [editMembroId, setEditMembroId] = useState<number | null>(null);
  const [editMembroForm, setEditMembroForm] = useState<any>({});

  // Queries
  const { data: necessidade } = trpc.cipa.verificarNecessidade.useQuery(
    { companyId },
    { enabled: !!companyId || companyIds?.length > 0 }
  );
  const { data: eleicoes = [], refetch: refetchEleicoes } = trpc.cipa.eleicoes.list.useQuery(
    { companyId },
    { enabled: !!companyId || companyIds?.length > 0 }
  );
  const { data: membros = [], refetch: refetchMembros } = trpc.cipa.membros.list.useQuery(
    { electionId: selectedEleicaoId || 0 },
    { enabled: !!selectedEleicaoId }
  );
  const { data: reunioes = [], refetch: refetchReunioes } = trpc.cipa.reunioes.list.useQuery(
    { companyId, electionId: selectedEleicaoId || undefined },
    { enabled: !!companyId || companyIds?.length > 0 }
  );
  const { data: empList = [] } = trpc.employees.list.useQuery({ companyId, companyIds, excludeTerminated: true }, { enabled: !!companyId || companyIds?.length > 0 });
  const activeEmployees = useMemo(() => (empList as any[]).filter((e: any) => e.status === "Ativo" && !e.deletedAt), [empList]);

  // Mutations
  const createEleicao = trpc.cipa.eleicoes.create.useMutation({
    onSuccess: () => { refetchEleicoes(); toast.success("Mandato/Eleição criado!"); setShowEleicaoDialog(false); setEleicaoForm({}); },
    onError: (e: any) => toast.error(e.message),
  });
  const updateEleicao = trpc.cipa.eleicoes.update.useMutation({
    onSuccess: () => { refetchEleicoes(); toast.success("Mandato atualizado!"); },
  });
  const deleteEleicao = trpc.cipa.eleicoes.delete.useMutation({
    onSuccess: () => { refetchEleicoes(); toast.success("Mandato excluído!"); },
  });
  const createMembro = trpc.cipa.membros.create.useMutation({
    onSuccess: () => { refetchMembros(); toast.success("Membro adicionado!"); setShowMembroDialog(false); setMembroForm({}); },
    onError: (e: any) => toast.error(e.message),
  });
  const updateMembro = trpc.cipa.membros.update.useMutation({
    onSuccess: () => { refetchMembros(); toast.success("Membro atualizado!"); setEditMembroId(null); setEditMembroForm({}); },
    onError: (e: any) => toast.error(e.message),
  });
  const deleteMembro = trpc.cipa.membros.delete.useMutation({
    onSuccess: () => { refetchMembros(); toast.success("Membro removido!"); },
  });
  const createReuniao = trpc.cipa.reunioes.create.useMutation({
    onSuccess: () => { refetchReunioes(); toast.success("Reunião agendada!"); setShowReuniaoDialog(false); setReuniaoForm({}); },
    onError: (e: any) => toast.error(e.message),
  });
  const deleteReuniao = trpc.cipa.reunioes.delete.useMutation({
    onSuccess: () => { refetchReunioes(); toast.success("Reunião excluída!"); },
  });
  const deleteReuniaoSilent = trpc.cipa.reunioes.delete.useMutation();
  const gerarCalendario = trpc.cipa.reunioes.gerarCalendario.useMutation({
    onSuccess: (data: any) => { refetchReunioes(); toast.success(`${data.reunioesCriadas} reuniões geradas!`); },
    onError: (e: any) => toast.error(e.message),
  });

  // ── Eleição digital / Candidatos / Planos / Ata (Rev. 3041) ──────────────
  const [showCandidatoDialog, setShowCandidatoDialog] = useState(false);
  const [candidatoForm, setCandidatoForm] = useState<any>({});
  const [candEmpSearch, setCandEmpSearch] = useState("");
  const [showPlanoDialog, setShowPlanoDialog] = useState(false);
  const [planoForm, setPlanoForm] = useState<any>({});
  const [editPlanoId, setEditPlanoId] = useState<number | null>(null);
  const [showAtaDialog, setShowAtaDialog] = useState(false);
  const [ataReuniao, setAtaReuniao] = useState<any>(null);
  const [ataForm, setAtaForm] = useState<any>({});
  const [showEfetivarDialog, setShowEfetivarDialog] = useState(false);
  const [efetivarForm, setEfetivarForm] = useState<any>({});
  const [calMonth, setCalMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });

  const reunioesOrdenadas = useMemo(
    () => [...(reunioes as any[])].sort((a: any, b: any) => String(a?.dataReuniao || "").localeCompare(String(b?.dataReuniao || ""))),
    [reunioes],
  );
  const toggleSelReuniao = (id: number) => setSelReunioes(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleSelAllReunioes = () => setSelReunioes(prev => prev.size === reunioesOrdenadas.length && reunioesOrdenadas.length > 0 ? new Set() : new Set(reunioesOrdenadas.map((r: any) => r.id)));
  const handleBulkDeleteReunioes = async () => {
    const ids = Array.from(selReunioes);
    if (ids.length === 0) return;
    if (!confirm(`Excluir ${ids.length} reunião(ões) selecionada(s)? Esta ação não pode ser desfeita.`)) return;
    setBulkDeleting(true);
    let ok = 0;
    const falhas: number[] = [];
    for (const id of ids) {
      try { await deleteReuniaoSilent.mutateAsync({ id }); ok++; }
      catch { falhas.push(id); }
    }
    setBulkDeleting(false);
    setSelReunioes(falhas.length ? new Set(falhas) : new Set());
    refetchReunioes();
    if (falhas.length === 0) toast.success(`${ok} reunião(ões) excluída(s)!`);
    else if (ok === 0) toast.error(`Falha ao excluir ${falhas.length} reunião(ões).`);
    else toast.warning(`${ok} excluída(s), ${falhas.length} falhou(aram) — as que falharam seguem selecionadas.`);
  };

  useEffect(() => { setSelReunioes(new Set()); }, [selectedEleicaoId]);
  useEffect(() => {
    setSelReunioes(prev => {
      if (prev.size === 0) return prev;
      const validos = new Set(reunioesOrdenadas.map((r: any) => r.id));
      const next = new Set(Array.from(prev).filter(id => validos.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [reunioesOrdenadas]);

  const enabledMandato = { enabled: !!selectedEleicaoId } as const;
  const { data: candidatos = [], refetch: refetchCandidatos } = trpc.cipa.candidatos.list.useQuery(
    { companyId, companyIds, electionId: selectedEleicaoId || 0 }, enabledMandato,
  );
  const { data: statusVotacao } = trpc.cipa.eleicaoDigital.statusVotacao.useQuery(
    { companyId, companyIds, electionId: selectedEleicaoId || 0 }, { ...enabledMandato, refetchInterval: tab === "eleicao" ? 8000 : false },
  );
  const { data: resultado } = trpc.cipa.eleicaoDigital.resultado.useQuery(
    { companyId, companyIds, electionId: selectedEleicaoId || 0 }, { ...enabledMandato, refetchInterval: tab === "eleicao" ? 8000 : false },
  );
  const { data: eleitores = [], refetch: refetchEleitores } = trpc.cipa.eleicaoDigital.listEleitores.useQuery(
    { companyId, companyIds, electionId: selectedEleicaoId || 0 }, enabledMandato,
  );
  const { data: planos = [], refetch: refetchPlanos } = trpc.cipa.planosAcao.list.useQuery(
    { companyId, companyIds, mandateId: selectedEleicaoId || 0 }, enabledMandato,
  );

  const createCandidato = trpc.cipa.candidatos.create.useMutation({
    onSuccess: () => { refetchCandidatos(); toast.success("Candidato inscrito!"); setShowCandidatoDialog(false); setCandidatoForm({}); setCandEmpSearch(""); },
    onError: (e: any) => toast.error(e.message),
  });
  const updateCandidato = trpc.cipa.candidatos.update.useMutation({
    onSuccess: () => { refetchCandidatos(); }, onError: (e: any) => toast.error(e.message),
  });
  const deleteCandidato = trpc.cipa.candidatos.delete.useMutation({
    onSuccess: () => { refetchCandidatos(); toast.success("Candidato removido!"); }, onError: (e: any) => toast.error(e.message),
  });
  const abrirVotacao = trpc.cipa.eleicaoDigital.abrirVotacao.useMutation({
    onSuccess: (d: any) => { refetchEleicoes(); refetchEleitores(); toast.success(`Votação aberta! ${d.eleitoresGerados} novos links gerados (${d.totalEleitores} eleitores).`); },
    onError: (e: any) => toast.error(e.message),
  });
  const encerrarVotacao = trpc.cipa.eleicaoDigital.encerrar.useMutation({
    onSuccess: () => { refetchEleicoes(); refetchCandidatos(); toast.success("Votação encerrada e apurada!"); },
    onError: (e: any) => toast.error(e.message),
  });
  const efetivarEleitos = trpc.cipa.eleicaoDigital.efetivarEleitos.useMutation({
    onSuccess: (d: any) => { refetchEleicoes(); refetchMembros(); toast.success(`${d.efetivados} membros efetivados!`); setShowEfetivarDialog(false); setTab("membros"); },
    onError: (e: any) => toast.error(e.message),
  });
  const createPlano = trpc.cipa.planosAcao.create.useMutation({
    onSuccess: () => { refetchPlanos(); toast.success("Ação registrada!"); setShowPlanoDialog(false); setPlanoForm({}); setEditPlanoId(null); },
    onError: (e: any) => toast.error(e.message),
  });
  const updatePlano = trpc.cipa.planosAcao.update.useMutation({
    onSuccess: () => { refetchPlanos(); toast.success("Ação atualizada!"); setShowPlanoDialog(false); setPlanoForm({}); setEditPlanoId(null); },
    onError: (e: any) => toast.error(e.message),
  });
  const deletePlano = trpc.cipa.planosAcao.delete.useMutation({
    onSuccess: () => { refetchPlanos(); toast.success("Ação removida!"); }, onError: (e: any) => toast.error(e.message),
  });
  const updateReuniaoAta = trpc.cipa.reunioes.update.useMutation({
    onSuccess: () => { refetchReunioes(); toast.success("Ata salva!"); }, onError: (e: any) => toast.error(e.message),
  });
  const enviarAta = trpc.signatures.create.useMutation({
    onSuccess: () => { toast.success("Ata enviada para assinatura digital (FCSign)!"); },
    onError: (e: any) => toast.error(e.message),
  });

  const votacaoUrl = (token: string) => `${window.location.origin}/cipa/votar/${token}`;
  function copyLink(token: string) {
    const url = votacaoUrl(token);
    navigator.clipboard?.writeText(url).then(
      () => toast.success("Link copiado!"),
      () => { window.prompt("Copie o link de votação:", url); },
    );
  }

  const membrosAtivos = useMemo(() => (membros as any[]).filter((m: any) => m.statusMembro === "Ativo"), [membros]);

  function buildAtaHtml(r: any): string {
    const dataStr = formatDate(r.dataReuniao);
    const presentes = membrosAtivos.map((m: any) => `<li>${m.employeeName} — ${CARGO_CIPA[m.cargoCipa] || m.cargoCipa} (${m.representacao})</li>`).join("");
    const corpo = (r.ataTexto || ataForm.ataTexto || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br/>");
    const assinaturas = membrosAtivos.slice(0, 6).map((m: any) =>
      `<div style="margin-top:42px;text-align:center;display:inline-block;width:46%;"><div style="border-top:1px solid #333;margin:0 12px;padding-top:4px;font-size:10pt;">${m.employeeName}<br/><span style="color:#666;font-size:9pt;">${CARGO_CIPA[m.cargoCipa] || m.cargoCipa}</span></div></div>`,
    ).join("");
    return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/></head><body style="font-family:'Times New Roman',serif;color:#111;max-width:780px;margin:0 auto;padding:24px;">
      <style>@media print{.no-print{display:none}} body{line-height:1.5}</style>
      <div style="text-align:center;margin-bottom:8px;"><img src="${window.location.origin}/logo-fc.jpg" alt="FC" style="height:84px;object-fit:contain;"/></div>
      <div style="background:#1B2A4A;border:2px solid #fff;padding:14px;text-align:center;margin:10px 0 16px;print-color-adjust:exact;-webkit-print-color-adjust:exact;">
        <span style="color:#fff;font-size:13pt;letter-spacing:3px;text-transform:uppercase;font-weight:bold;">ATA DE REUNIÃO — CIPA</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:10pt;color:#333;margin-bottom:14px;">
        <span><strong>Reunião ${r.tipo === "extraordinaria" ? "Extraordinária" : "Ordinária"}</strong></span>
        <span>Data: ${dataStr}${r.horaInicio ? ` — ${r.horaInicio}${r.horaFim ? ` às ${r.horaFim}` : ""}` : ""}</span>
      </div>
      ${r.local ? `<p style="font-size:10pt;color:#333;"><strong>Local:</strong> ${r.local}</p>` : ""}
      ${r.pauta ? `<p style="font-size:11pt;text-align:justify;"><strong>Pauta:</strong> ${String(r.pauta).replace(/</g, "&lt;")}</p>` : ""}
      <p style="font-size:11pt;"><strong>Membros presentes:</strong></p>
      <ul style="font-size:10.5pt;">${presentes || "<li>—</li>"}</ul>
      <p style="font-size:11pt;"><strong>Deliberações / Registro da Ata:</strong></p>
      <div style="font-size:11.5pt;text-align:justify;hyphens:auto;">${corpo || "—"}</div>
      <div style="margin-top:40px;text-align:center;">${assinaturas}</div>
    </body></html>`;
  }

  function imprimirAta(r: any) {
    const w = window.open("", "_blank");
    if (!w) { toast.error("Permita pop-ups para imprimir a ata."); return; }
    w.document.write(buildAtaHtml(r));
    w.document.close();
    setTimeout(() => { try { w.print(); } catch {} }, 350);
  }

  function enviarAtaAssinatura(r: any) {
    if (membrosAtivos.length === 0) { toast.error("Cadastre membros ativos antes de enviar a ata."); return; }
    const roles: any[] = ["empregador", "testemunha_1", "testemunha_2", "empregado"];
    const signers = membrosAtivos.slice(0, 4).map((m: any, i: number) => ({
      role: roles[i] || "empregado",
      nome: m.employeeName,
      cpf: (m.employeeCpf || "").replace(/\D/g, "") || null,
    }));
    enviarAta.mutate({
      companyId,
      employeeId: membrosAtivos[0].employeeId,
      tipo: "ata_cipa",
      documentTitle: `Ata CIPA — ${formatDate(r.dataReuniao)}`,
      documentHtml: buildAtaHtml(r),
      signers,
      observacoes: `ata_cipa:${r.id}`,
    });
  }

  const candidatosDeferidos = useMemo(() => (candidatos as any[]).filter((c: any) => c.status === "deferido"), [candidatos]);
  const totalEfetivos = necessidade?.efetivos || 0;
  const totalSuplentes = necessidade?.suplentes || 0;

  // Employee search for membro form
  const [empSearch, setEmpSearch] = useState("");
  const [empDropdownOpen, setEmpDropdownOpen] = useState(false);
  const selectedEmp = activeEmployees.find((e: any) => e.id === membroForm.employeeId);

  function getFilteredEmps() {
    const q = empSearch.trim().toLowerCase();
    if (!q) return activeEmployees;
    const qDigits = q.replace(/\D/g, "");
    return activeEmployees.filter((e: any) => {
      if ((e.nomeCompleto || "").toLowerCase().includes(q)) return true;
      if ((e.cpf || "").replace(/\D/g, "").includes(qDigits) && qDigits.length > 0) return true;
      if ((e.rg || "").replace(/\D/g, "").includes(qDigits) && qDigits.length > 0) return true;
      if ((e.codigoInterno || "").toLowerCase().includes(q)) return true;
      if ((e.matricula || "").toLowerCase().includes(q)) return true;
      return false;
    });
  }

  const selectedEleicao = (eleicoes as any[]).find((e: any) => e.id === selectedEleicaoId);

  useEffect(() => {
    if (!selectedEleicaoId && (eleicoes as any[]).length > 0) {
      const hoje = new Date();
      const ativo = (eleicoes as any[]).find((e: any) => {
        const inicio = new Date(e.mandatoInicio);
        const fim = new Date(e.mandatoFim);
        return hoje >= inicio && hoje <= fim;
      });
      setSelectedEleicaoId(ativo ? ativo.id : (eleicoes as any[])[0].id);
    }
  }, [eleicoes, selectedEleicaoId]);

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Shield className="h-6 w-6 text-blue-600" />
              CIPA — Comissão Interna de Prevenção de Acidentes
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Gestão conforme NR-5 — Mandatos, Membros, Reuniões e Estabilidade
            </p>
          </div>
        </div>

        {/* Alerta de Necessidade */}
        {necessidade && (
          <div className={`rounded-lg p-4 border-2 ${necessidade.alertaCipa ? "bg-red-50 border-red-300" : necessidade.necessaria ? "bg-green-50 border-green-300" : "bg-blue-50 border-blue-200"}`}>
            <div className="flex items-start gap-3">
              {necessidade.alertaCipa ? (
                <AlertTriangle className="h-6 w-6 text-red-600 shrink-0 mt-0.5" />
              ) : (
                <Shield className="h-6 w-6 text-green-600 shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <p className={`font-semibold ${necessidade.alertaCipa ? "text-red-800" : "text-green-800"}`}>
                  {necessidade.alertaCipa
                    ? "ATENÇÃO: Empresa precisa constituir CIPA!"
                    : necessidade.necessaria
                      ? "CIPA constituída e em conformidade"
                      : `Empresa com ${necessidade.numFuncionarios} funcionários — CIPA não obrigatória (< 20 funcionários)`
                  }
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Funcionários Ativos:</span>
                    <span className="font-bold ml-1">{fmtNum(necessidade.numFuncionarios)}</span>
                  </div>
                  {necessidade.necessaria && (
                    <>
                      <div>
                        <span className="text-muted-foreground">Efetivos Necessários:</span>
                        <span className="font-bold ml-1">{necessidade.efetivos}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Suplentes Necessários:</span>
                        <span className="font-bold ml-1">{necessidade.suplentes}</span>
                      </div>
                    </>
                  )}
                  {necessidade.designado && (
                    <div>
                      <Badge variant="secondary">Designado de CIPA obrigatório</Badge>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="visao"><Shield className="h-4 w-4 mr-1" /> Visão Geral</TabsTrigger>
            <TabsTrigger value="mandatos"><Vote className="h-4 w-4 mr-1" /> Mandatos/Eleições</TabsTrigger>
            <TabsTrigger value="eleicao"><Award className="h-4 w-4 mr-1" /> Eleição Digital</TabsTrigger>
            <TabsTrigger value="membros"><Users className="h-4 w-4 mr-1" /> Membros</TabsTrigger>
            <TabsTrigger value="reunioes"><CalendarDays className="h-4 w-4 mr-1" /> Reuniões</TabsTrigger>
            <TabsTrigger value="planos"><ListChecks className="h-4 w-4 mr-1" /> Planos de Ação</TabsTrigger>
            <TabsTrigger value="calendario"><Calendar className="h-4 w-4 mr-1" /> Calendário</TabsTrigger>
          </TabsList>

          {/* Visão Geral */}
          <TabsContent value="visao">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><Vote className="h-4 w-4 text-blue-600" /> Mandatos</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">{fmtNum((eleicoes as any[]).length)}</p>
                  <p className="text-xs text-muted-foreground">Total de mandatos registrados</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4 text-green-600" /> Membros Ativos</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">{(membros as any[]).filter((m: any) => m.statusMembro === "Ativo").length}</p>
                  <p className="text-xs text-muted-foreground">No mandato selecionado</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><CalendarDays className="h-4 w-4 text-amber-600" /> Reuniões</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">{fmtNum((reunioes as any[]).length)}</p>
                  <p className="text-xs text-muted-foreground">Total de reuniões</p>
                </CardContent>
              </Card>
            </div>

            {/* Cronograma Eleitoral */}
            <Card className="mt-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Cronograma Eleitoral (NR-5)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-blue-50 rounded-lg p-4 text-sm text-blue-800 space-y-2">
                  <p><strong>60 dias antes do fim do mandato:</strong> Publicar edital de convocação</p>
                  <p><strong>45 dias antes:</strong> Período de inscrições dos candidatos</p>
                  <p><strong>30 dias antes:</strong> Campanha eleitoral</p>
                  <p><strong>Dia da eleição:</strong> Votação secreta, em horário de trabalho</p>
                  <p><strong>Após eleição:</strong> Apuração, posse e registro na SRTE</p>
                  <p className="text-xs text-blue-600 mt-2">
                    <strong>Estabilidade:</strong> Representantes dos empregados têm estabilidade desde o registro da candidatura até 1 ano após o fim do mandato (Art. 10, II, a, ADCT/CF).
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Mandatos/Eleições */}
          <TabsContent value="mandatos">
            <div className="flex justify-end mb-4">
              <Button onClick={() => { setEleicaoForm({}); setShowEleicaoDialog(true); }}>
                <Plus className="h-4 w-4 mr-2" /> Novo Mandato
              </Button>
            </div>

            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="p-3 text-left font-medium">Mandato</th>
                        <th className="p-3 text-left font-medium">Status Eleição</th>
                        <th className="p-3 text-left font-medium">Edital</th>
                        <th className="p-3 text-left font-medium">Inscrições</th>
                        <th className="p-3 text-left font-medium">Eleição</th>
                        <th className="p-3 text-left font-medium">Posse</th>
                        <th className="p-3 text-center font-medium">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(eleicoes as any[]).length === 0 ? (
                        <tr><td colSpan={7} className="py-12 text-center text-muted-foreground">Nenhum mandato registrado</td></tr>
                      ) : (eleicoes as any[]).map((e: any) => {
                        const st = STATUS_ELEICAO[e.statusEleicao] || STATUS_ELEICAO.Planejamento;
                        const isActive = selectedEleicaoId === e.id;
                        return (
                          <tr key={e.id} className={`border-b last:border-0 hover:bg-muted/20 cursor-pointer ${isActive ? "bg-blue-50" : ""}`} onClick={() => setSelectedEleicaoId(e.id)}>
                            <td className="p-3">
                              <div className="font-medium">{formatDate(e.mandatoInicio)} — {formatDate(e.mandatoFim)}</div>
                            </td>
                            <td className="p-3">
                              <span className={`text-xs px-2 py-1 rounded-full font-medium ${st.bg} ${st.color}`}>{st.label}</span>
                            </td>
                            <td className="p-3 text-xs">{formatDate(e.dataEdital)}</td>
                            <td className="p-3 text-xs">{formatDate(e.dataInscricaoInicio)} - {formatDate(e.dataInscricaoFim)}</td>
                            <td className="p-3 text-xs">{formatDate(e.dataEleicao)}</td>
                            <td className="p-3 text-xs">{formatDate(e.dataPosse)}</td>
                            <td className="p-3">
                              <div className="flex items-center justify-center gap-1">
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" title="Excluir" onClick={(ev) => { ev.stopPropagation(); if (confirm("Excluir mandato?")) deleteEleicao.mutate({ id: e.id }); }}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Membros */}
          <TabsContent value="membros">
            {!selectedEleicaoId ? (
              <div className="py-12 text-center text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>Selecione um mandato na aba "Mandatos/Eleições" para ver os membros</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <div className="text-sm text-muted-foreground">
                    Mandato: <strong>{selectedEleicao ? `${formatDate(selectedEleicao.mandatoInicio)} — ${formatDate(selectedEleicao.mandatoFim)}` : ""}</strong>
                  </div>
                  <Button onClick={() => { setMembroForm({}); setShowMembroDialog(true); }}>
                    <Plus className="h-4 w-4 mr-2" /> Adicionar Membro
                  </Button>
                </div>

                <Card>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/30">
                            <th className="p-3 text-left font-medium">Colaborador</th>
                            <th className="p-3 text-left font-medium">CPF</th>
                            <th className="p-3 text-left font-medium">Cargo Empresa</th>
                            <th className="p-3 text-left font-medium">Cargo CIPA</th>
                            <th className="p-3 text-left font-medium">Representação</th>
                            <th className="p-3 text-left font-medium">Estabilidade</th>
                            <th className="p-3 text-center font-medium">Status</th>
                            <th className="p-3 text-center font-medium">Ações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(membros as any[]).length === 0 ? (
                            <tr><td colSpan={8} className="py-12 text-center text-muted-foreground">Nenhum membro cadastrado</td></tr>
                          ) : (membros as any[]).map((m: any) => (
                            <tr key={m.id} className={`border-b last:border-0 hover:bg-muted/20 ${m.statusMembro === "Encerrado" ? "opacity-60" : ""}`}>
                              <td className="p-3 font-medium text-blue-700 cursor-pointer hover:underline" onClick={() => setRaioXEmployeeId(m.employeeId)}>
                                {m.employeeName}
                              </td>
                              <td className="p-3">{formatCPF(m.employeeCpf)}</td>
                              <td className="p-3 text-xs">{m.employeeCargo}</td>
                              <td className="p-3">
                                {editMembroId === m.id ? (
                                  <Select value={editMembroForm.cargoCipa || m.cargoCipa} onValueChange={v => setEditMembroForm({ ...editMembroForm, cargoCipa: v })}>
                                    <SelectTrigger className="h-8 text-xs w-40"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      {Object.entries(CARGO_CIPA).map(([k, v]) => (
                                        <SelectItem key={k} value={k}>{v}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <Badge variant="outline">{CARGO_CIPA[m.cargoCipa] || m.cargoCipa}</Badge>
                                )}
                              </td>
                              <td className="p-3">
                                <span className={`text-xs px-2 py-1 rounded-full font-medium ${m.representacao === "Empregados" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>
                                  {m.representacao}
                                </span>
                              </td>
                              <td className="p-3 text-xs">
                                {m.inicioEstabilidade ? (
                                  <div>
                                    <span className="text-green-600 font-medium">{formatDate(m.inicioEstabilidade)}</span>
                                    <span className="mx-1">a</span>
                                    <span className="text-green-600 font-medium">{formatDate(m.fimEstabilidade)}</span>
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground">Sem estabilidade</span>
                                )}
                              </td>
                              <td className="p-3 text-center">
                                <Badge variant={m.statusMembro === "Ativo" ? "default" : m.statusMembro === "Encerrado" ? "destructive" : "secondary"}>{m.statusMembro}</Badge>
                              </td>
                              <td className="p-3">
                                <div className="flex items-center gap-1">
                                  {editMembroId === m.id ? (
                                    <>
                                      <Button size="sm" className="h-7 text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-2" onClick={() => {
                                        updateMembro.mutate({ id: m.id, cargoCipa: editMembroForm.cargoCipa || m.cargoCipa });
                                      }} disabled={updateMembro.isPending}>
                                        <CheckCircle2 className="h-3 w-3 mr-1" /> Salvar
                                      </Button>
                                      <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={() => { setEditMembroId(null); setEditMembroForm({}); }}>
                                        <X className="h-3 w-3" />
                                      </Button>
                                    </>
                                  ) : (
                                    <>
                                      <Button size="icon" variant="ghost" className="h-7 w-7 text-blue-500" title="Editar cargo" onClick={() => { setEditMembroId(m.id); setEditMembroForm({ cargoCipa: m.cargoCipa }); }}>
                                        <Pencil className="h-3.5 w-3.5" />
                                      </Button>
                                      {m.statusMembro === "Ativo" && (
                                        <Button size="icon" variant="ghost" className="h-7 w-7 text-amber-600" title="Encerrar participação (desligamento/afastamento)" onClick={() => {
                                          if (confirm(`Encerrar participação de ${m.employeeName} na CIPA?\n\nO histórico será mantido, mas o membro não aparecerá mais como ativo.`))
                                            updateMembro.mutate({ id: m.id, statusMembro: "Encerrado" });
                                        }}>
                                          <AlertTriangle className="h-3.5 w-3.5" />
                                        </Button>
                                      )}
                                      {m.statusMembro === "Encerrado" && (
                                        <Button size="icon" variant="ghost" className="h-7 w-7 text-green-600" title="Reativar membro" onClick={() => {
                                          if (confirm(`Reativar ${m.employeeName} na CIPA?`))
                                            updateMembro.mutate({ id: m.id, statusMembro: "Ativo" });
                                        }}>
                                          <RefreshCw className="h-3.5 w-3.5" />
                                        </Button>
                                      )}
                                      <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" title="Remover permanentemente" onClick={() => { if (confirm("Remover membro permanentemente?\n\nPara preservar o histórico, use 'Encerrar' ao invés de remover.")) deleteMembro.mutate({ id: m.id }); }}>
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* Reuniões */}
          <TabsContent value="reunioes">
            <div className="flex items-center justify-between mb-4">
              <div className="flex gap-2">
                {selectedEleicaoId && (
                  <Button variant="outline" size="sm" onClick={() => gerarCalendario.mutate({ mandateId: selectedEleicaoId, companyId })} disabled={gerarCalendario.isPending}>
                    <RefreshCw className={`h-4 w-4 mr-2 ${gerarCalendario.isPending ? "animate-spin" : ""}`} /> Gerar Calendário Anual
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-2">
                {selectedEleicaoId && selReunioes.size > 0 && (
                  <Button variant="destructive" size="sm" onClick={handleBulkDeleteReunioes} disabled={bulkDeleting}>
                    <Trash2 className={`h-4 w-4 mr-2 ${bulkDeleting ? "animate-pulse" : ""}`} /> Excluir {selReunioes.size} selecionada(s)
                  </Button>
                )}
                <Button onClick={() => { setReuniaoForm({}); setShowReuniaoDialog(true); }} disabled={!selectedEleicaoId}>
                  <Plus className="h-4 w-4 mr-2" /> Nova Reunião
                </Button>
              </div>
            </div>

            {!selectedEleicaoId ? (
              <div className="py-12 text-center text-muted-foreground">
                <CalendarDays className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>Selecione um mandato na aba "Mandatos/Eleições" para ver as reuniões</p>
              </div>
            ) : (
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          <th className="p-3 text-center font-medium w-10">
                            <Checkbox
                              checked={reunioesOrdenadas.length > 0 && selReunioes.size === reunioesOrdenadas.length}
                              onCheckedChange={toggleSelAllReunioes}
                              aria-label="Selecionar todas"
                            />
                          </th>
                          <th className="p-3 text-left font-medium">Data</th>
                          <th className="p-3 text-left font-medium">Tipo</th>
                          <th className="p-3 text-left font-medium">Horário</th>
                          <th className="p-3 text-left font-medium">Local</th>
                          <th className="p-3 text-left font-medium">Pauta</th>
                          <th className="p-3 text-center font-medium">Status</th>
                          <th className="p-3 text-center font-medium">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reunioesOrdenadas.length === 0 ? (
                          <tr><td colSpan={8} className="py-12 text-center text-muted-foreground">Nenhuma reunião agendada</td></tr>
                        ) : reunioesOrdenadas.map((r: any) => (
                          <tr key={r.id} className={`border-b last:border-0 hover:bg-muted/20 ${selReunioes.has(r.id) ? "bg-blue-50/60" : ""}`}>
                            <td className="p-3 text-center">
                              <Checkbox
                                checked={selReunioes.has(r.id)}
                                onCheckedChange={() => toggleSelReuniao(r.id)}
                                aria-label="Selecionar reunião"
                              />
                            </td>
                            <td className="p-3 font-medium">{formatDate(r.dataReuniao)}</td>
                            <td className="p-3">
                              <Badge variant={r.tipo === "extraordinaria" ? "destructive" : "outline"}>
                                {r.tipo === "extraordinaria" ? "Extraordinária" : "Ordinária"}
                              </Badge>
                            </td>
                            <td className="p-3 text-xs">{r.horaInicio || "-"} - {r.horaFim || "-"}</td>
                            <td className="p-3 text-xs">{r.local || "-"}</td>
                            <td className="p-3 text-xs max-w-[200px] truncate" title={r.pauta}>{r.pauta || "-"}</td>
                            <td className="p-3 text-center">
                              <Badge variant={r.status === "realizada" ? "default" : r.status === "cancelada" ? "destructive" : "secondary"}>
                                {r.status === "realizada" ? "Realizada" : r.status === "cancelada" ? "Cancelada" : "Agendada"}
                              </Badge>
                            </td>
                            <td className="p-3">
                              <div className="flex items-center justify-center gap-1">
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-blue-600" title="Ata da reunião" onClick={() => { setAtaReuniao(r); setAtaForm({ ataTexto: r.ataTexto || "", status: r.status || "agendada" }); setShowAtaDialog(true); }}>
                                  <FileText className="h-3.5 w-3.5" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" title="Excluir" onClick={() => { if (confirm("Excluir reunião?")) deleteReuniao.mutate({ id: r.id }); }}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Eleição Digital */}
          <TabsContent value="eleicao">
            {!selectedEleicaoId ? (
              <div className="py-12 text-center text-muted-foreground">
                <Award className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>Selecione um mandato na aba "Mandatos/Eleições" para gerir a eleição</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Barra de ações */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm text-muted-foreground">
                    Mandato: <strong>{selectedEleicao ? `${formatDate(selectedEleicao.mandatoInicio)} — ${formatDate(selectedEleicao.mandatoFim)}` : ""}</strong>
                    {selectedEleicao && (() => { const st = STATUS_ELEICAO[selectedEleicao.statusEleicao] || STATUS_ELEICAO.Planejamento; return <span className={`ml-2 text-xs px-2 py-1 rounded-full font-medium ${st.bg} ${st.color}`}>{st.label}</span>; })()}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => { setCandidatoForm({}); setCandEmpSearch(""); setShowCandidatoDialog(true); }}>
                      <Plus className="h-4 w-4 mr-1" /> Inscrever Candidato
                    </Button>
                    {selectedEleicao?.statusEleicao !== "Votação Aberta" && (
                      <Button size="sm" onClick={() => { if (confirm("Abrir a votação digital? Serão gerados links para todos os funcionários ativos.")) abrirVotacao.mutate({ companyId, companyIds, electionId: selectedEleicaoId }); }} disabled={abrirVotacao.isPending || candidatosDeferidos.length < 1}>
                        {abrirVotacao.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Vote className="h-4 w-4 mr-1" />} Abrir Votação
                      </Button>
                    )}
                    {selectedEleicao?.statusEleicao === "Votação Aberta" && (
                      <Button size="sm" variant="destructive" onClick={() => { if (confirm("Encerrar a votação e apurar os votos? Após encerrar, novos votos não serão aceitos.")) encerrarVotacao.mutate({ companyId, companyIds, electionId: selectedEleicaoId }); }} disabled={encerrarVotacao.isPending}>
                        {encerrarVotacao.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />} Encerrar e Apurar
                      </Button>
                    )}
                    {(selectedEleicao?.statusEleicao === "Apurada" || selectedEleicao?.statusEleicao === "Concluída") && (
                      <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500" onClick={() => { setEfetivarForm({ numTitulares: totalEfetivos || 1, numSuplentes: totalSuplentes || 0 }); setShowEfetivarDialog(true); }} disabled={efetivarEleitos.isPending}>
                        <Trophy className="h-4 w-4 mr-1" /> Efetivar Eleitos
                      </Button>
                    )}
                  </div>
                </div>

                {/* Painel de votação */}
                {statusVotacao && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Eleitores</p><p className="text-2xl font-bold">{fmtNum(statusVotacao.totalEleitores)}</p></CardContent></Card>
                    <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Votaram</p><p className="text-2xl font-bold text-emerald-600">{fmtNum(statusVotacao.votaram)}</p></CardContent></Card>
                    <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Abstenções</p><p className="text-2xl font-bold text-amber-600">{fmtNum(statusVotacao.abstencoes)}</p></CardContent></Card>
                    <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Participação</p><p className="text-2xl font-bold">{statusVotacao.percentual}%</p></CardContent></Card>
                  </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Candidatos */}
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4 text-blue-600" /> Candidatos ({(candidatos as any[]).length})</CardTitle></CardHeader>
                    <CardContent className="p-0">
                      {(candidatos as any[]).length === 0 ? (
                        <p className="py-8 text-center text-sm text-muted-foreground">Nenhum candidato inscrito</p>
                      ) : (
                        <div className="divide-y">
                          {(candidatos as any[]).map((c: any) => (
                            <div key={c.id} className="flex items-center gap-3 p-3">
                              <CandidatoAvatar c={c} />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{c.employeeName}</p>
                                <p className="text-[11px] text-muted-foreground">{c.employeeCargo || "—"}{c.numero ? ` · Nº ${c.numero}` : ""}</p>
                              </div>
                              <Badge variant={c.status === "deferido" ? "default" : c.status === "indeferido" ? "destructive" : "secondary"}>{c.status === "deferido" ? "Deferido" : c.status === "indeferido" ? "Indeferido" : "Inscrito"}</Badge>
                              {selectedEleicao?.statusEleicao !== "Votação Aberta" && (
                                <div className="flex items-center gap-1">
                                  {c.status !== "deferido" && <Button size="icon" variant="ghost" className="h-7 w-7 text-emerald-600" title="Deferir" onClick={() => updateCandidato.mutate({ id: c.id, companyId, companyIds, status: "deferido" })}><CheckCircle2 className="h-4 w-4" /></Button>}
                                  {c.status !== "indeferido" && <Button size="icon" variant="ghost" className="h-7 w-7 text-amber-600" title="Indeferir" onClick={() => updateCandidato.mutate({ id: c.id, companyId, companyIds, status: "indeferido" })}><X className="h-4 w-4" /></Button>}
                                  <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" title="Remover" onClick={() => { if (confirm("Remover candidato?")) deleteCandidato.mutate({ id: c.id, companyId, companyIds }); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Apuração */}
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4 text-orange-600" /> Apuração ao vivo</CardTitle></CardHeader>
                    <CardContent>
                      {!resultado || resultado.ranking.length === 0 ? (
                        <p className="py-8 text-center text-sm text-muted-foreground">Sem votos ainda</p>
                      ) : (
                        <div className="space-y-2">
                          {resultado.ranking.map((c: any, i: number) => {
                            const pct = resultado.totalVotos > 0 ? Math.round((c.votos / resultado.totalVotos) * 100) : 0;
                            return (
                              <div key={c.id}>
                                <div className="flex justify-between text-sm mb-0.5">
                                  <span className="font-medium flex items-center gap-1">{i === 0 && c.votos > 0 && <Trophy className="h-3.5 w-3.5 text-amber-500" />}{c.employeeName}</span>
                                  <span className="text-muted-foreground">{fmtNum(c.votos)} ({pct}%)</span>
                                </div>
                                <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} /></div>
                              </div>
                            );
                          })}
                          <div className="flex justify-between text-xs text-muted-foreground pt-2 border-t mt-2">
                            <span>Votos em branco: {fmtNum(resultado.brancos)}</span>
                            <span>Total: {fmtNum(resultado.totalVotos)}</span>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Links de votação */}
                {(eleitores as any[]).length > 0 && (
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Link2 className="h-4 w-4 text-purple-600" /> Links de votação ({(eleitores as any[]).length})</CardTitle></CardHeader>
                    <CardContent className="p-0">
                      <div className="max-h-72 overflow-y-auto divide-y">
                        {(eleitores as any[]).map((v: any) => (
                          <div key={v.id} className="flex items-center gap-3 p-2.5 text-sm">
                            <div className="flex-1 min-w-0"><p className="font-medium truncate">{v.employeeName}</p><p className="text-[11px] text-muted-foreground truncate">{votacaoUrl(v.token)}</p></div>
                            {v.jaVotou === 1 ? <Badge variant="default" className="bg-emerald-600"><CheckCircle2 className="h-3 w-3 mr-1" /> Votou</Badge> : <Badge variant="secondary">Pendente</Badge>}
                            <Button size="icon" variant="ghost" className="h-7 w-7" title="Copiar link" onClick={() => copyLink(v.token)}><Copy className="h-3.5 w-3.5" /></Button>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </TabsContent>

          {/* Planos de Ação */}
          <TabsContent value="planos">
            {!selectedEleicaoId ? (
              <div className="py-12 text-center text-muted-foreground">
                <ListChecks className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>Selecione um mandato para gerir os planos de ação</p>
              </div>
            ) : (
              <>
                <div className="flex justify-end mb-4">
                  <Button onClick={() => { setPlanoForm({ prioridade: "media" }); setEditPlanoId(null); setShowPlanoDialog(true); }}>
                    <Plus className="h-4 w-4 mr-2" /> Nova Ação
                  </Button>
                </div>
                <Card>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/30">
                            <th className="p-3 text-left font-medium">Ação</th>
                            <th className="p-3 text-left font-medium">Responsável</th>
                            <th className="p-3 text-left font-medium">Prazo</th>
                            <th className="p-3 text-center font-medium">Prioridade</th>
                            <th className="p-3 text-center font-medium">Status</th>
                            <th className="p-3 text-center font-medium">Ações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(planos as any[]).length === 0 ? (
                            <tr><td colSpan={6} className="py-12 text-center text-muted-foreground">Nenhuma ação registrada</td></tr>
                          ) : (planos as any[]).map((p: any) => {
                            const venc = p.prazo && p.status !== "concluido" && new Date(p.prazo) < new Date(new Date().toDateString());
                            return (
                              <tr key={p.id} className={`border-b last:border-0 hover:bg-muted/20 ${p.status === "concluido" ? "opacity-60" : ""}`}>
                                <td className="p-3 max-w-[320px]"><p className="break-words">{p.descricao}</p></td>
                                <td className="p-3 text-xs">{p.responsavel || "—"}</td>
                                <td className={`p-3 text-xs ${venc ? "text-red-600 font-semibold" : ""}`}>{formatDate(p.prazo)}</td>
                                <td className="p-3 text-center"><Badge variant={p.prioridade === "alta" ? "destructive" : p.prioridade === "baixa" ? "secondary" : "outline"}>{p.prioridade === "alta" ? "Alta" : p.prioridade === "baixa" ? "Baixa" : "Média"}</Badge></td>
                                <td className="p-3 text-center">
                                  <Select value={p.status} onValueChange={(v) => updatePlano.mutate({ id: p.id, companyId, companyIds, status: v as any })}>
                                    <SelectTrigger className="h-8 text-xs w-36 mx-auto"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="pendente">Pendente</SelectItem>
                                      <SelectItem value="em_andamento">Em andamento</SelectItem>
                                      <SelectItem value="concluido">Concluído</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </td>
                                <td className="p-3">
                                  <div className="flex items-center justify-center gap-1">
                                    <Button size="icon" variant="ghost" className="h-7 w-7 text-blue-500" title="Editar" onClick={() => { setEditPlanoId(p.id); setPlanoForm({ descricao: p.descricao, responsavel: p.responsavel || "", prazo: p.prazo || "", prioridade: p.prioridade, meetingId: p.meetingId || undefined }); setShowPlanoDialog(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
                                    <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" title="Excluir" onClick={() => { if (confirm("Excluir ação?")) deletePlano.mutate({ id: p.id, companyId, companyIds }); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* Calendário */}
          <TabsContent value="calendario">
            {(() => {
              const ano = calMonth.getFullYear(); const mes = calMonth.getMonth();
              const primeiro = new Date(ano, mes, 1);
              const inicioGrid = new Date(primeiro); inicioGrid.setDate(1 - primeiro.getDay());
              const dias: Date[] = []; for (let i = 0; i < 42; i++) { const d = new Date(inicioGrid); d.setDate(inicioGrid.getDate() + i); dias.push(d); }
              const toKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
              const eventos: Record<string, { label: string; cor: string }[]> = {};
              const addEv = (data: string | null, label: string, cor: string) => { if (!data) return; const k = data.slice(0, 10); (eventos[k] ||= []).push({ label, cor }); };
              (reunioes as any[]).forEach((r: any) => addEv(r.dataReuniao, `Reunião ${r.tipo === "extraordinaria" ? "Extraord." : "Ordin."}`, "bg-blue-500"));
              if (selectedEleicao) {
                addEv(selectedEleicao.dataEdital, "Edital", "bg-gray-500");
                addEv(selectedEleicao.dataInscricaoInicio, "Início inscrições", "bg-purple-500");
                addEv(selectedEleicao.dataInscricaoFim, "Fim inscrições", "bg-purple-500");
                addEv(selectedEleicao.dataEleicao, "Eleição", "bg-amber-500");
                addEv(selectedEleicao.dataPosse, "Posse", "bg-emerald-500");
              }
              const hojeKey = toKey(new Date());
              const nomesMes = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
              return (
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{nomesMes[mes]} {ano}</CardTitle>
                      <div className="flex gap-1">
                        <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setCalMonth(new Date(ano, mes - 1, 1))}><ChevronLeft className="h-4 w-4" /></Button>
                        <Button size="sm" variant="outline" className="h-8" onClick={() => { const d = new Date(); setCalMonth(new Date(d.getFullYear(), d.getMonth(), 1)); }}>Hoje</Button>
                        <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setCalMonth(new Date(ano, mes + 1, 1))}><ChevronRight className="h-4 w-4" /></Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-muted-foreground mb-1">
                      {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => <div key={d} className="py-1">{d}</div>)}
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                      {dias.map((d, i) => {
                        const k = toKey(d); const evs = eventos[k] || []; const isMes = d.getMonth() === mes; const isHoje = k === hojeKey;
                        return (
                          <div key={i} className={`min-h-[72px] border rounded-md p-1 text-left ${isMes ? "bg-white" : "bg-slate-50 text-slate-300"} ${isHoje ? "ring-2 ring-blue-400" : ""}`}>
                            <div className={`text-xs font-medium ${isHoje ? "text-blue-600" : ""}`}>{d.getDate()}</div>
                            <div className="space-y-0.5 mt-0.5">
                              {evs.slice(0, 3).map((e, j) => <div key={j} className={`text-[9px] text-white rounded px-1 py-0.5 truncate ${e.cor}`} title={e.label}>{e.label}</div>)}
                              {evs.length > 3 && <div className="text-[9px] text-muted-foreground">+{evs.length - 3}</div>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              );
            })()}
          </TabsContent>
        </Tabs>

        {/* Dialog: Novo Mandato */}
        <FullScreenDialog open={showEleicaoDialog} onClose={() => { setShowEleicaoDialog(false); setEleicaoForm({}); }} title="Novo Mandato / Eleição CIPA" icon={<Vote className="h-5 w-5 text-white" />}>
          <div className="w-full max-w-2xl mx-auto">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Início do Mandato *</label>
                <Input type="date" value={eleicaoForm.mandatoInicio || ""} onChange={e => setEleicaoForm({ ...eleicaoForm, mandatoInicio: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Fim do Mandato *</label>
                <Input type="date" value={eleicaoForm.mandatoFim || ""} onChange={e => setEleicaoForm({ ...eleicaoForm, mandatoFim: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Status da Eleição</label>
                <Select value={eleicaoForm.statusEleicao || "Planejamento"} onValueChange={v => setEleicaoForm({ ...eleicaoForm, statusEleicao: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Planejamento">Planejamento</SelectItem>
                    <SelectItem value="Inscricoes">Inscrições</SelectItem>
                    <SelectItem value="Campanha">Campanha</SelectItem>
                    <SelectItem value="Votacao">Votação</SelectItem>
                    <SelectItem value="Apuracao">Apuração</SelectItem>
                    <SelectItem value="Concluida">Concluída</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Data do Edital</label>
                <Input type="date" value={eleicaoForm.dataEdital || ""} onChange={e => setEleicaoForm({ ...eleicaoForm, dataEdital: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Inscrições Início</label>
                <Input type="date" value={eleicaoForm.dataInscricaoInicio || ""} onChange={e => setEleicaoForm({ ...eleicaoForm, dataInscricaoInicio: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Inscrições Fim</label>
                <Input type="date" value={eleicaoForm.dataInscricaoFim || ""} onChange={e => setEleicaoForm({ ...eleicaoForm, dataInscricaoFim: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Data da Eleição</label>
                <Input type="date" value={eleicaoForm.dataEleicao || ""} onChange={e => setEleicaoForm({ ...eleicaoForm, dataEleicao: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Data da Posse</label>
                <Input type="date" value={eleicaoForm.dataPosse || ""} onChange={e => setEleicaoForm({ ...eleicaoForm, dataPosse: e.target.value })} />
              </div>
              <div className="col-span-2">
                <label className="text-sm font-medium">Observações</label>
                <Textarea value={eleicaoForm.observacoes || ""} onChange={e => setEleicaoForm({ ...eleicaoForm, observacoes: e.target.value })} rows={2} />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <Button variant="outline" onClick={() => { setShowEleicaoDialog(false); setEleicaoForm({}); }}>Cancelar</Button>
              <Button onClick={() => {
                if (!eleicaoForm.mandatoInicio || !eleicaoForm.mandatoFim) { toast.error("Informe início e fim do mandato"); return; }
                createEleicao.mutate({ companyId, companyIds, ...eleicaoForm });
              }} disabled={createEleicao.isPending}>
                {createEleicao.isPending ? "Salvando..." : "Criar Mandato"}
              </Button>
            </div>
          </div>
        </FullScreenDialog>

        {/* Dialog: Novo Membro */}
        <FullScreenDialog open={showMembroDialog} onClose={() => { setShowMembroDialog(false); setMembroForm({}); setEmpSearch(""); setEmpDropdownOpen(false); }} title="Adicionar Membro CIPA" icon={<UserCheck className="h-5 w-5 text-white" />}>
          <div className="w-full max-w-3xl mx-auto space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-3">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Colaborador *</label>
                {selectedEmp ? (
                  <div className="bg-slate-50 rounded-lg p-3 flex items-center gap-3 border border-slate-200">
                    <EmpAvatar emp={selectedEmp} size={10} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800">{selectedEmp.nomeCompleto}</p>
                      <p className="text-xs text-slate-500">{selectedEmp.cargo || "Sem cargo"} · CPF: {formatCPF(selectedEmp.cpf)}</p>
                    </div>
                    <button type="button" className="text-slate-400 hover:text-red-500 transition-colors p-1" onClick={() => { setMembroForm({ ...membroForm, employeeId: undefined }); setEmpSearch(""); }}>
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center border rounded-lg px-3 py-2.5 bg-white focus-within:border-blue-400 transition-colors">
                      <Search className="h-4 w-4 text-slate-400 mr-2 shrink-0" />
                      <input className="flex-1 bg-transparent outline-none text-sm" placeholder="Buscar por nome ou CPF..." value={empSearch} onChange={e => setEmpSearch(e.target.value)} />
                      {empSearch && (
                        <button type="button" className="ml-2 text-slate-400 hover:text-slate-600 transition-colors" onClick={() => setEmpSearch("")}>
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    <EmployeeList employees={getFilteredEmps()} onSelect={(id: number) => { setMembroForm({ ...membroForm, employeeId: id }); setEmpSearch(""); }} />
                  </>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Cargo na CIPA *</label>
                <Select value={membroForm.cargoCipa || ""} onValueChange={v => setMembroForm({ ...membroForm, cargoCipa: v })}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="Selecione o cargo" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Presidente">Presidente</SelectItem>
                    <SelectItem value="Vice_Presidente">Vice-Presidente</SelectItem>
                    <SelectItem value="Secretario">Secretário</SelectItem>
                    <SelectItem value="Membro_Titular">Membro Titular</SelectItem>
                    <SelectItem value="Membro_Suplente">Membro Suplente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Representação *</label>
                <Select value={membroForm.representacao || ""} onValueChange={v => setMembroForm({ ...membroForm, representacao: v })}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Empregador">Empregador</SelectItem>
                    <SelectItem value="Empregados">Empregados</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button className="w-full h-10" onClick={() => {
                  if (!membroForm.employeeId || !membroForm.cargoCipa || !membroForm.representacao) { toast.error("Preencha todos os campos obrigatórios"); return; }
                  createMembro.mutate({ companyId, companyIds, electionId: selectedEleicaoId!, ...membroForm });
                }} disabled={createMembro.isPending || !membroForm.employeeId}>
                  <Plus className="h-4 w-4 mr-2" />
                  {createMembro.isPending ? "Salvando..." : "Adicionar Membro"}
                </Button>
              </div>
            </div>

            {membroForm.representacao === "Empregados" && (
              <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-800">
                <Shield className="h-4 w-4 mt-0.5 shrink-0 text-emerald-600" />
                <div>
                  <strong>Estabilidade automática:</strong> Representantes dos empregados terão estabilidade calculada automaticamente (desde o registro da candidatura até 1 ano após o mandato).
                </div>
              </div>
            )}

            {(membros as any[]).length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Membros já adicionados ({(membros as any[]).length})</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {(membros as any[]).map((m: any) => (
                    <div key={m.id} className="flex items-center gap-3 bg-white rounded-lg border border-slate-100 p-3 hover:shadow-sm transition-shadow">
                      <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                        <span className="text-xs font-bold text-blue-600">{(m.employeeName || "?")[0]}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{m.employeeName}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">{CARGO_CIPA[m.cargoCipa] || m.cargoCipa}</Badge>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${m.representacao === "Empregados" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>
                            {m.representacao}
                          </span>
                        </div>
                      </div>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-400 hover:text-red-500" title="Remover" onClick={() => { if (confirm("Remover membro?")) deleteMembro.mutate({ id: m.id }); }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </FullScreenDialog>

        {/* Dialog: Nova Reunião */}
        <FullScreenDialog open={showReuniaoDialog} onClose={() => { setShowReuniaoDialog(false); setReuniaoForm({}); }} title="Nova Reunião CIPA" icon={<CalendarDays className="h-5 w-5 text-white" />}>
          <div className="w-full max-w-2xl mx-auto">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Data da Reunião *</label>
                <Input type="date" value={reuniaoForm.dataReuniao || ""} onChange={e => setReuniaoForm({ ...reuniaoForm, dataReuniao: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Tipo</label>
                <Select value={reuniaoForm.tipo || "ordinaria"} onValueChange={v => setReuniaoForm({ ...reuniaoForm, tipo: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ordinaria">Ordinária</SelectItem>
                    <SelectItem value="extraordinaria">Extraordinária</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Hora Início</label>
                <Input type="time" value={reuniaoForm.horaInicio || ""} onChange={e => setReuniaoForm({ ...reuniaoForm, horaInicio: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Hora Fim</label>
                <Input type="time" value={reuniaoForm.horaFim || ""} onChange={e => setReuniaoForm({ ...reuniaoForm, horaFim: e.target.value })} />
              </div>
              <div className="col-span-2">
                <label className="text-sm font-medium">Local</label>
                <Input value={reuniaoForm.local || ""} onChange={e => setReuniaoForm({ ...reuniaoForm, local: e.target.value })} placeholder="Ex: Sala de Reuniões" />
              </div>
              <div className="col-span-2">
                <label className="text-sm font-medium">Pauta</label>
                <Textarea value={reuniaoForm.pauta || ""} onChange={e => setReuniaoForm({ ...reuniaoForm, pauta: e.target.value })} rows={3} placeholder="Assuntos a serem discutidos..." />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <Button variant="outline" onClick={() => { setShowReuniaoDialog(false); setReuniaoForm({}); }}>Cancelar</Button>
              <Button onClick={() => {
                if (!reuniaoForm.dataReuniao) { toast.error("Informe a data da reunião"); return; }
                createReuniao.mutate({ mandateId: selectedEleicaoId!, companyId, ...reuniaoForm });
              }} disabled={createReuniao.isPending}>
                {createReuniao.isPending ? "Salvando..." : "Agendar Reunião"}
              </Button>
            </div>
          </div>
        </FullScreenDialog>

        {/* Dialog: Inscrever Candidato */}
        <FullScreenDialog open={showCandidatoDialog} onClose={() => { setShowCandidatoDialog(false); setCandidatoForm({}); setCandEmpSearch(""); }} title="Inscrever Candidato à CIPA" icon={<Award className="h-5 w-5 text-white" />}>
          <div className="w-full max-w-2xl mx-auto space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Colaborador *</label>
              {candidatoForm.employeeId ? (() => {
                const emp = activeEmployees.find((e: any) => e.id === candidatoForm.employeeId);
                return (
                  <div className="bg-slate-50 rounded-lg p-3 flex items-center gap-3 border border-slate-200">
                    <EmpAvatar emp={emp} size={10} />
                    <div className="flex-1 min-w-0"><p className="text-sm font-semibold">{emp?.nomeCompleto}</p><p className="text-xs text-slate-500">{emp?.cargo || "Sem cargo"} · {formatCPF(emp?.cpf)}</p></div>
                    <button type="button" className="text-slate-400 hover:text-red-500 p-1" onClick={() => setCandidatoForm({ ...candidatoForm, employeeId: undefined })}><X className="h-4 w-4" /></button>
                  </div>
                );
              })() : (
                <>
                  <div className="flex items-center border rounded-lg px-3 py-2.5 bg-white focus-within:border-blue-400">
                    <Search className="h-4 w-4 text-slate-400 mr-2 shrink-0" />
                    <input className="flex-1 bg-transparent outline-none text-sm" placeholder="Buscar por nome ou CPF..." value={candEmpSearch} onChange={(e) => setCandEmpSearch(e.target.value)} />
                  </div>
                  <EmployeeList
                    employees={(() => {
                      const jaCand = new Set((candidatos as any[]).map((c: any) => c.employeeId));
                      const q = candEmpSearch.trim().toLowerCase(); const qd = q.replace(/\D/g, "");
                      return activeEmployees.filter((e: any) => !jaCand.has(e.id)).filter((e: any) => !q || (e.nomeCompleto || "").toLowerCase().includes(q) || (qd && (e.cpf || "").replace(/\D/g, "").includes(qd)));
                    })()}
                    onSelect={(id: number) => { setCandidatoForm({ ...candidatoForm, employeeId: id }); setCandEmpSearch(""); }}
                  />
                </>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Número (opcional)</label>
                <Input type="number" value={candidatoForm.numero ?? ""} onChange={(e) => setCandidatoForm({ ...candidatoForm, numero: e.target.value === "" ? undefined : parseInt(e.target.value, 10) })} placeholder="Ex: 10" />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Proposta / Plataforma (opcional)</label>
              <Textarea value={candidatoForm.proposta || ""} onChange={(e) => setCandidatoForm({ ...candidatoForm, proposta: e.target.value })} rows={3} placeholder="Resumo das propostas do candidato..." />
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button variant="outline" onClick={() => { setShowCandidatoDialog(false); setCandidatoForm({}); setCandEmpSearch(""); }}>Cancelar</Button>
              <Button onClick={() => {
                if (!candidatoForm.employeeId) { toast.error("Selecione o colaborador"); return; }
                createCandidato.mutate({ companyId, electionId: selectedEleicaoId!, employeeId: candidatoForm.employeeId, numero: candidatoForm.numero, proposta: candidatoForm.proposta });
              }} disabled={createCandidato.isPending || !candidatoForm.employeeId}>
                {createCandidato.isPending ? "Salvando..." : "Inscrever"}
              </Button>
            </div>
          </div>
        </FullScreenDialog>

        {/* Dialog: Efetivar Eleitos */}
        <FullScreenDialog open={showEfetivarDialog} onClose={() => setShowEfetivarDialog(false)} title="Efetivar Membros Eleitos" icon={<Trophy className="h-5 w-5 text-white" />}>
          <div className="w-full max-w-lg mx-auto space-y-4">
            <p className="text-sm text-muted-foreground">Os candidatos mais votados serão registrados como membros da CIPA, com estabilidade calculada automaticamente (até 1 ano após o fim do mandato).</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Titulares (efetivos) *</label>
                <Input type="number" min={1} value={efetivarForm.numTitulares ?? 1} onChange={(e) => setEfetivarForm({ ...efetivarForm, numTitulares: parseInt(e.target.value, 10) || 1 })} />
              </div>
              <div>
                <label className="text-sm font-medium">Suplentes</label>
                <Input type="number" min={0} value={efetivarForm.numSuplentes ?? 0} onChange={(e) => setEfetivarForm({ ...efetivarForm, numSuplentes: parseInt(e.target.value, 10) || 0 })} />
              </div>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800">Recomendado pela NR-5 para esta empresa: <strong>{totalEfetivos} efetivos</strong> e <strong>{totalSuplentes} suplentes</strong>.</div>
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button variant="outline" onClick={() => setShowEfetivarDialog(false)}>Cancelar</Button>
              <Button className="bg-emerald-600 hover:bg-emerald-500" onClick={() => efetivarEleitos.mutate({ companyId, companyIds, electionId: selectedEleicaoId!, numTitulares: efetivarForm.numTitulares || 1, numSuplentes: efetivarForm.numSuplentes || 0 })} disabled={efetivarEleitos.isPending}>
                {efetivarEleitos.isPending ? "Processando..." : "Efetivar"}
              </Button>
            </div>
          </div>
        </FullScreenDialog>

        {/* Dialog: Plano de Ação */}
        <FullScreenDialog open={showPlanoDialog} onClose={() => { setShowPlanoDialog(false); setPlanoForm({}); setEditPlanoId(null); }} title={editPlanoId ? "Editar Ação" : "Nova Ação"} icon={<ListChecks className="h-5 w-5 text-white" />}>
          <div className="w-full max-w-2xl mx-auto">
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="bg-gradient-to-r from-[#1B2A4A] to-[#2c4373] px-6 py-5 text-white">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-white/15 flex items-center justify-center">
                    <ListChecks className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold leading-tight">{editPlanoId ? "Editar ação" : "Nova ação"}</h3>
                    <p className="text-xs text-white/70">Plano de ação da CIPA · acompanhamento de responsáveis e prazos</p>
                  </div>
                </div>
              </div>

              <div className="p-6 space-y-5">
                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-sm font-semibold text-slate-700"><ClipboardList className="h-4 w-4 text-slate-400" /> Descrição da ação <span className="text-red-500">*</span></label>
                  <Textarea value={planoForm.descricao || ""} onChange={(e) => setPlanoForm({ ...planoForm, descricao: e.target.value })} rows={3} placeholder="O que será feito..." className="resize-none" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-1.5 text-sm font-semibold text-slate-700"><UserCheck className="h-4 w-4 text-slate-400" /> Responsável</label>
                    <Select value={planoForm.responsavel || "none"} onValueChange={(v) => setPlanoForm({ ...planoForm, responsavel: v === "none" ? "" : v })}>
                      <SelectTrigger><SelectValue placeholder="Selecione um cipeiro" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— Sem responsável</SelectItem>
                        {membrosAtivos.map((m: any) => (
                          <SelectItem key={m.id} value={m.employeeName}>{m.employeeName} · {CARGO_CIPA[m.cargoCipa] || m.cargoCipa}</SelectItem>
                        ))}
                        {planoForm.responsavel && !membrosAtivos.some((m: any) => m.employeeName === planoForm.responsavel) && (
                          <SelectItem value={planoForm.responsavel}>{planoForm.responsavel} (externo)</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    {membrosAtivos.length === 0 && (
                      <p className="text-xs text-amber-600">Nenhum cipeiro ativo neste mandato. Cadastre membros na aba "Membros".</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="flex items-center gap-1.5 text-sm font-semibold text-slate-700"><CalendarDays className="h-4 w-4 text-slate-400" /> Prazo</label>
                    <div className="relative">
                      <Input type="date" value={planoForm.prazo || ""} onChange={(e) => setPlanoForm({ ...planoForm, prazo: e.target.value })} className="pr-10" />
                      <CalendarDays className="h-4 w-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="flex items-center gap-1.5 text-sm font-semibold text-slate-700"><AlertTriangle className="h-4 w-4 text-slate-400" /> Prioridade</label>
                    <Select value={planoForm.prioridade || "media"} onValueChange={(v) => setPlanoForm({ ...planoForm, prioridade: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="baixa">Baixa</SelectItem>
                        <SelectItem value="media">Média</SelectItem>
                        <SelectItem value="alta">Alta</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="flex items-center gap-1.5 text-sm font-semibold text-slate-700"><Link2 className="h-4 w-4 text-slate-400" /> Reunião <span className="font-normal text-slate-400">(opcional)</span></label>
                    <Select value={planoForm.meetingId ? String(planoForm.meetingId) : "none"} onValueChange={(v) => setPlanoForm({ ...planoForm, meetingId: v === "none" ? undefined : parseInt(v, 10) })}>
                      <SelectTrigger><SelectValue placeholder="Vincular a reunião" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhuma</SelectItem>
                        {(reunioes as any[]).map((r: any) => <SelectItem key={r.id} value={String(r.id)}>{formatDate(r.dataReuniao)} — {r.tipo === "extraordinaria" ? "Extraord." : "Ordin."}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-200">
                <Button variant="outline" onClick={() => { setShowPlanoDialog(false); setPlanoForm({}); setEditPlanoId(null); }}>Cancelar</Button>
                <Button onClick={() => {
                if (!planoForm.descricao?.trim()) { toast.error("Informe a descrição da ação"); return; }
                if (editPlanoId) {
                  updatePlano.mutate({ id: editPlanoId, companyId, companyIds, descricao: planoForm.descricao, responsavel: planoForm.responsavel, prazo: planoForm.prazo || undefined, prioridade: planoForm.prioridade });
                } else {
                  createPlano.mutate({ companyId, mandateId: selectedEleicaoId!, meetingId: planoForm.meetingId, descricao: planoForm.descricao, responsavel: planoForm.responsavel, prazo: planoForm.prazo || undefined, prioridade: planoForm.prioridade });
                }
              }} disabled={createPlano.isPending || updatePlano.isPending}>
                {(createPlano.isPending || updatePlano.isPending) ? "Salvando..." : (editPlanoId ? "Salvar" : "Criar Ação")}
                </Button>
              </div>
            </div>
          </div>
        </FullScreenDialog>

        {/* Dialog: Ata da Reunião */}
        <FullScreenDialog open={showAtaDialog} onClose={() => { setShowAtaDialog(false); setAtaReuniao(null); setAtaForm({}); }} title="Ata da Reunião CIPA" icon={<FileText className="h-5 w-5 text-white" />}>
          <div className="w-full max-w-3xl mx-auto space-y-4">
            {ataReuniao && (
              <div className="bg-slate-50 rounded-lg p-3 text-sm flex flex-wrap gap-x-6 gap-y-1 border">
                <span><strong>Data:</strong> {formatDate(ataReuniao.dataReuniao)}</span>
                <span><strong>Tipo:</strong> {ataReuniao.tipo === "extraordinaria" ? "Extraordinária" : "Ordinária"}</span>
                {ataReuniao.local && <span><strong>Local:</strong> {ataReuniao.local}</span>}
              </div>
            )}
            <div>
              <label className="text-sm font-medium">Status da reunião</label>
              <Select value={ataForm.status || "agendada"} onValueChange={(v) => setAtaForm({ ...ataForm, status: v })}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="agendada">Agendada</SelectItem>
                  <SelectItem value="realizada">Realizada</SelectItem>
                  <SelectItem value="cancelada">Cancelada</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Texto da Ata</label>
              <Textarea value={ataForm.ataTexto || ""} onChange={(e) => setAtaForm({ ...ataForm, ataTexto: e.target.value })} rows={10} placeholder="Registre as deliberações, discussões e encaminhamentos da reunião..." />
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800">
              <strong>Membros presentes (assinantes):</strong> {membrosAtivos.length === 0 ? "nenhum membro ativo cadastrado" : membrosAtivos.map((m: any) => m.employeeName).join(", ")}
            </div>
            <div className="flex flex-wrap justify-end gap-3 pt-4 border-t">
              <Button variant="outline" onClick={() => imprimirAta({ ...ataReuniao, ...ataForm })}><Printer className="h-4 w-4 mr-2" /> Imprimir</Button>
              <Button variant="outline" onClick={() => enviarAtaAssinatura({ ...ataReuniao, ...ataForm })} disabled={enviarAta.isPending}>
                {enviarAta.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />} Enviar p/ Assinatura
              </Button>
              <Button onClick={() => {
                if (!ataReuniao) return;
                updateReuniaoAta.mutate({ id: ataReuniao.id, ataTexto: ataForm.ataTexto, status: ataForm.status });
                setShowAtaDialog(false);
              }} disabled={updateReuniaoAta.isPending}>
                {updateReuniaoAta.isPending ? "Salvando..." : "Salvar Ata"}
              </Button>
            </div>
          </div>
        </FullScreenDialog>
      </div>

      <RaioXFuncionario employeeId={raioXEmployeeId} open={!!raioXEmployeeId} onClose={() => setRaioXEmployeeId(null)} />
    <PrintFooterLGPD />
    </DashboardLayout>
  );
}
