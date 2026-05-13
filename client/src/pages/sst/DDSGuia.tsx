import { useState, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  CalendarDays, BookOpen, Megaphone, Plus, Trash2, Pencil, Users, FileSignature,
  ClipboardCheck, Check, X as XIcon, ChevronRight, Sparkles, MapPin, UserCheck,
  ChevronDown, ChevronUp, Search,
} from "lucide-react";

// Rev. 1730 — máscara CPF no input do instrutor
function maskCpf(v: string): string {
  const d = (v || "").replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

// Rev. 1730 — histórico de locais usados (até 8) por empresa
const LOCAIS_LS_KEY = (cid: number) => `dds:recentLocais:${cid}`;
function getRecentLocais(cid: number): string[] {
  try { return JSON.parse(localStorage.getItem(LOCAIS_LS_KEY(cid)) || "[]"); } catch { return []; }
}
function pushRecentLocal(cid: number, local: string) {
  if (!local || local.trim().length < 2) return;
  const cur = getRecentLocais(cid).filter(l => l.toLowerCase() !== local.toLowerCase());
  cur.unshift(local.trim());
  localStorage.setItem(LOCAIS_LS_KEY(cid), JSON.stringify(cur.slice(0, 8)));
}

const MESES_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const COR_CLASSES: Record<string, { bg: string; text: string; border: string; chip: string }> = {
  branco:   { bg: "bg-slate-50",   text: "text-slate-800",   border: "border-slate-300",   chip: "bg-slate-200 text-slate-800" },
  laranja:  { bg: "bg-orange-50",  text: "text-orange-800",  border: "border-orange-300",  chip: "bg-orange-500 text-white" },
  lilas:    { bg: "bg-purple-50",  text: "text-purple-800",  border: "border-purple-300",  chip: "bg-purple-500 text-white" },
  verde:    { bg: "bg-emerald-50", text: "text-emerald-800", border: "border-emerald-300", chip: "bg-emerald-500 text-white" },
  amarelo:  { bg: "bg-amber-50",   text: "text-amber-900",   border: "border-amber-300",   chip: "bg-amber-400 text-amber-950" },
  vermelho: { bg: "bg-red-50",     text: "text-red-800",     border: "border-red-300",     chip: "bg-red-500 text-white" },
  rosa:     { bg: "bg-pink-50",    text: "text-pink-800",    border: "border-pink-300",    chip: "bg-pink-500 text-white" },
  azul:     { bg: "bg-blue-50",    text: "text-blue-800",    border: "border-blue-300",    chip: "bg-blue-500 text-white" },
};
function corCfg(c?: string | null) {
  return COR_CLASSES[(c ?? "").toLowerCase()] ?? { bg: "bg-slate-50", text: "text-slate-800", border: "border-slate-300", chip: "bg-slate-300 text-slate-900" };
}

export default function DDSGuia() {
  // Rev. 1728: useCompany().selectedCompanyId é STRING — converter pra number antes de mandar pro tRPC
  const { selectedCompanyId } = useCompany();
  const companyId = parseInt(selectedCompanyId || "0") || 0;
  const utils = trpc.useUtils();
  // Rev. 1730 — usuário logado para auto-fill do instrutor
  const { user } = useAuth() as any;

  const [tab, setTab] = useState<"calendario" | "biblioteca" | "sessoes">("calendario");

  // ===== queries
  const calendarioQ = trpc.dds.calendarioAnual.useQuery({ companyId }, { enabled: !!companyId });
  const temasQ = trpc.dds.listTemas.useQuery({ companyId }, { enabled: !!companyId });
  const sessoesQ = trpc.dds.listSessoes.useQuery({ companyId }, { enabled: !!companyId });

  // ===== mutations gerais
  const seedMut = trpc.dds.seedTemasPadrao.useMutation({
    onSuccess: (r) => {
      toast.success(`${r.inseridos} tema(s) adicionado(s) à biblioteca`);
      utils.dds.listTemas.invalidate(); utils.dds.calendarioAnual.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  // Rev. 1729 — campanhas oficiais de vacinação PNI/MS 2026 (Lei 15.377/2026)
  const seedVacMut = trpc.dds.seedVacinacaoPNI.useMutation({
    onSuccess: (r) => {
      toast.success(`${r.inseridos} campanha(s) de vacinação carregada(s)`);
      utils.dds.listTemas.invalidate(); utils.dds.calendarioAnual.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  // ===== modal: tema
  const [showTema, setShowTema] = useState(false);
  const [editTema, setEditTema] = useState<any | null>(null);
  const [temaForm, setTemaForm] = useState<any>({
    titulo: "", descricao: "", conteudoMd: "", normaReferencia: "",
    categoria: "LIVRE", codigo: "", duracaoMin: 15,
  });
  const abrirNovoTema = () => {
    setEditTema(null);
    setTemaForm({ titulo: "", descricao: "", conteudoMd: "", normaReferencia: "", categoria: "LIVRE", codigo: "", duracaoMin: 15 });
    setShowTema(true);
  };
  const abrirEditTema = (t: any) => {
    setEditTema(t);
    setTemaForm({
      titulo: t.titulo ?? "", descricao: t.descricao ?? "", conteudoMd: t.conteudoMd ?? "",
      normaReferencia: t.normaReferencia ?? "", categoria: t.categoria ?? "LIVRE",
      codigo: t.codigo ?? "", duracaoMin: t.duracaoMin ?? 15,
    });
    setShowTema(true);
  };
  const salvarTemaMut = trpc.dds.criarTema.useMutation({
    onSuccess: () => { toast.success("Tema criado"); utils.dds.listTemas.invalidate(); utils.dds.calendarioAnual.invalidate(); setShowTema(false); },
    onError: (e) => toast.error(e.message),
  });
  const atualizarTemaMut = trpc.dds.atualizarTema.useMutation({
    onSuccess: () => { toast.success("Tema atualizado"); utils.dds.listTemas.invalidate(); utils.dds.calendarioAnual.invalidate(); setShowTema(false); },
    onError: (e) => toast.error(e.message),
  });
  const excluirTemaMut = trpc.dds.excluirTema.useMutation({
    onSuccess: () => { toast.success("Tema excluído"); utils.dds.listTemas.invalidate(); utils.dds.calendarioAnual.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const handleSalvarTema = () => {
    if (!temaForm.titulo || temaForm.titulo.length < 3) { toast.error("Informe o título"); return; }
    if (editTema) {
      atualizarTemaMut.mutate({ companyId, id: editTema.id, ...temaForm });
    } else {
      salvarTemaMut.mutate({ companyId, ...temaForm });
    }
  };

  // ===== modal: nova sessão
  // Rev. 1731 fix: usa listActive (respeita allowedObras do usuário) + filtra status='Em_Andamento' no client
  const obrasQ = trpc.obras.listActive.useQuery({ companyId } as any, { enabled: !!companyId });
  const employeesQ = trpc.employees.list.useQuery({ companyId } as any, { enabled: !!companyId });
  const [showSessao, setShowSessao] = useState(false);
  const [sessaoForm, setSessaoForm] = useState<any>({
    obraId: "", obraIds: [] as number[], data: new Date().toISOString().slice(0, 10), hora: "07:30",
    temaId: "", tituloTema: "", conteudoMd: "",
    instrutor: "", instrutorCpf: "", local: "", observacoes: "",
    funcionarioIds: [] as number[],
  });
  // Rev. 1730 — abrir modal já preenchendo instrutor (usuário logado), data hoje, hora 07:30
  // Se nenhum tema vier, sugere o tema do mês atual (campanha ou vacinação) automaticamente.
  const abrirNovaSessao = (temaPre?: any) => {
    let temaEscolhido = temaPre;
    if (!temaEscolhido) {
      const mesAtual = new Date().getMonth() + 1;
      const sugerido = (temas as any[]).find((t: any) =>
        (t.categoria === "CAMPANHA" || t.categoria === "VACINACAO") && t.mesCampanha === mesAtual
      );
      if (sugerido) temaEscolhido = sugerido;
    }
    setSessaoForm({
      obraId: "", obraIds: [] as number[], data: new Date().toISOString().slice(0, 10), hora: "07:30",
      temaId: temaEscolhido?.id ? String(temaEscolhido.id) : "",
      tituloTema: temaEscolhido?.titulo ?? "",
      conteudoMd: temaEscolhido?.conteudoMd ?? temaEscolhido?.descricao ?? "",
      instrutor: user?.nome ?? user?.name ?? user?.loginName ?? user?.email ?? "",
      instrutorCpf: user?.cpf ? maskCpf(String(user.cpf)) : "",
      local: "",
      observacoes: "",
      funcionarioIds: [] as number[],
    });
    setShowSessao(true);
  };
  const criarSessaoMut = trpc.dds.criarSessao.useMutation({
    onSuccess: (s) => { toast.success("Sessão criada"); utils.dds.listSessoes.invalidate(); utils.dds.calendarioAnual.invalidate(); setShowSessao(false); setSelectedSessaoId(s.id); setTab("sessoes"); },
    onError: (e) => toast.error(e.message),
  });
  // Rev. 1733 — equipe ativa consolidada por NOME (alinhado com cadastro > aba Efetivo / getEfetivoPorObra).
  // Quando há obras duplicadas (mesmo nome, IDs diferentes), unifica o efetivo de TODAS as duplicatas.
  const obrasIdsSel: number[] = Array.isArray(sessaoForm.obraIds) ? sessaoForm.obraIds : [];
  const funcsObraQ = trpc.dds.funcionariosDaObra.useQuery(
    { companyId, obraIds: obrasIdsSel } as any,
    { enabled: !!companyId && obrasIdsSel.length > 0 && showSessao }
  );
  const [showRoteiro, setShowRoteiro] = useState(false);
  const [buscaFunc, setBuscaFunc] = useState("");
  // Rev. 1731 — sidebar de obras + transferência inline + alerta de acidente D-1
  const [buscaObra, setBuscaObra] = useState("");
  const [showTransferir, setShowTransferir] = useState(false);
  const [buscaTransferir, setBuscaTransferir] = useState("");
  const candidatosTransferQ = trpc.dds.colaboradoresParaTransferir.useQuery(
    { companyId, obraIds: obrasIdsSel } as any,
    { enabled: !!companyId && obrasIdsSel.length > 0 && showTransferir }
  );
  const transferirMut = trpc.dds.transferirParaObra.useMutation({
    onSuccess: (_d, vars) => {
      toast.success("Colaborador transferido para a obra");
      // Rev. 1733 — invalida pelo conjunto consolidado da obra alvo.
      utils.dds.funcionariosDaObra.invalidate();
      utils.dds.colaboradoresParaTransferir.invalidate();
      // Auto-marca como presente APENAS se a obra continua selecionada
      setSessaoForm((s: any) => {
        const ids: number[] = Array.isArray(s.obraIds) ? s.obraIds : [];
        if (!ids.includes(vars.obraId)) return s;
        if (s.funcionarioIds.includes(vars.employeeId)) return s;
        return { ...s, funcionarioIds: [...s.funcionarioIds, vars.employeeId] };
      });
    },
    onError: (e) => toast.error(e.message),
  });
  // Acidentes recentes (últimos 7 dias) — D-1 vira alerta vermelho obrigatório
  const acidentesQ = trpc.dds.acidentesRecentes.useQuery(
    { companyId, obraIds: obrasIdsSel.length > 0 ? obrasIdsSel : undefined, diasJanela: 7 } as any,
    { enabled: !!companyId && showSessao }
  );
  // Reseta busca/roteiro ao reabrir
  useEffect(() => { if (showSessao) { setShowRoteiro(false); setBuscaFunc(""); setBuscaObra(""); } }, [showSessao]);
  useEffect(() => { if (showTransferir) setBuscaTransferir(""); }, [showTransferir]);

  const handleSalvarSessao = () => {
    if (!sessaoForm.tituloTema || sessaoForm.tituloTema.length < 3) { toast.error("Informe o título do tema"); return; }
    if (!sessaoForm.data) { toast.error("Informe a data"); return; }
    // Rev. 1730 — guarda local no histórico pra autocomplete futuro
    if (sessaoForm.local) pushRecentLocal(companyId, sessaoForm.local);
    criarSessaoMut.mutate({
      companyId,
      obraId: sessaoForm.obraId ? Number(sessaoForm.obraId) : undefined,
      data: sessaoForm.data,
      hora: sessaoForm.hora || undefined,
      temaId: sessaoForm.temaId ? Number(sessaoForm.temaId) : undefined,
      tituloTema: sessaoForm.tituloTema,
      conteudoMd: sessaoForm.conteudoMd || undefined,
      instrutor: sessaoForm.instrutor || undefined,
      instrutorCpf: sessaoForm.instrutorCpf || undefined,
      local: sessaoForm.local || undefined,
      observacoes: sessaoForm.observacoes || undefined,
      funcionarioIds: sessaoForm.funcionarioIds,
    });
  };

  // ===== detalhe sessão
  const [selectedSessaoId, setSelectedSessaoId] = useState<number | null>(null);
  const sessaoDetalheQ = trpc.dds.getSessao.useQuery(
    { companyId, id: selectedSessaoId ?? 0 },
    { enabled: !!selectedSessaoId },
  );
  const finalizarSessaoMut = trpc.dds.atualizarSessao.useMutation({
    onSuccess: () => { toast.success("Sessão finalizada"); utils.dds.listSessoes.invalidate(); utils.dds.getSessao.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const excluirSessaoMut = trpc.dds.excluirSessao.useMutation({
    onSuccess: () => { toast.success("Sessão excluída"); utils.dds.listSessoes.invalidate(); setSelectedSessaoId(null); },
    onError: (e) => toast.error(e.message),
  });
  const presencaMut = trpc.dds.marcarPresenca.useMutation({
    onSuccess: () => { utils.dds.getSessao.invalidate(); utils.dds.listSessoes.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  // ===== adicionar funcionário ao detalhe
  const [addFuncId, setAddFuncId] = useState<string>("");
  const idsJaNaSessao = useMemo(() => {
    const f = (sessaoDetalheQ.data as any)?.funcionarios ?? [];
    return new Set(f.map((x: any) => x.employeeId).filter(Boolean));
  }, [sessaoDetalheQ.data]);

  const camp = (calendarioQ.data as any)?.meses ?? [];
  const temas = (temasQ.data as any[]) ?? [];
  const sessoes = (sessoesQ.data as any[]) ?? [];

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <ClipboardCheck className="h-7 w-7 text-emerald-600" />
            DDS — Diálogo Diário de Segurança
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Guia completo: calendário das campanhas governamentais, biblioteca de temas conforme NRs e
            registro de sessões com lista de presença e assinatura via FCsign.
          </p>
        </div>
        <div className="flex gap-2">
          {temas.length === 0 && (
            <Button
              variant="outline"
              onClick={() => seedMut.mutate({ companyId })}
              disabled={seedMut.isPending}
            >
              <Sparkles className="h-4 w-4 mr-1" />
              {seedMut.isPending ? "Carregando..." : "Carregar biblioteca padrão (12 campanhas + 13 NRs)"}
            </Button>
          )}
          {/* Rev. 1729 — Lei 15.377/2026 (CLT art. 169-A): empresa deve divulgar campanhas de vacinação */}
          {!temas.some((t: any) => t.categoria === "VACINACAO") && (
            <Button
              variant="outline"
              onClick={() => seedVacMut.mutate({ companyId })}
              disabled={seedVacMut.isPending}
              className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
            >
              <Sparkles className="h-4 w-4 mr-1" />
              {seedVacMut.isPending ? "Carregando..." : "💉 Carregar campanhas de vacinação (PNI/MS — Lei 15.377/2026)"}
            </Button>
          )}
          <Button onClick={() => abrirNovaSessao()}>
            <Plus className="h-4 w-4 mr-1" /> Nova Sessão DDS
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="calendario"><CalendarDays className="h-4 w-4 mr-1" /> Calendário Anual</TabsTrigger>
          <TabsTrigger value="biblioteca"><BookOpen className="h-4 w-4 mr-1" /> Biblioteca de Temas</TabsTrigger>
          <TabsTrigger value="sessoes"><Users className="h-4 w-4 mr-1" /> Sessões ({sessoes.length})</TabsTrigger>
        </TabsList>

        {/* =================== CALENDÁRIO =================== */}
        <TabsContent value="calendario" className="mt-4">
          {temas.length === 0 ? (
            <div className="bg-amber-50 border border-amber-300 rounded-2xl p-6 text-center">
              <Megaphone className="h-10 w-10 text-amber-600 mx-auto mb-2" />
              <h3 className="font-semibold text-amber-900 mb-1">Biblioteca vazia</h3>
              <p className="text-sm text-amber-800 mb-3">
                Carregue o catálogo padrão com 12 campanhas oficiais do governo federal
                (Janeiro Branco, Abril Verde, Maio Amarelo, Setembro Amarelo, Outubro Rosa…)
                e as 13 NRs mais aplicadas em construção civil.
              </p>
              <Button onClick={() => seedMut.mutate({ companyId })} disabled={seedMut.isPending}>
                <Sparkles className="h-4 w-4 mr-1" />
                {seedMut.isPending ? "Carregando..." : "Carregar biblioteca padrão"}
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {camp.map((m: any) => {
                const c0 = m.campanhas?.[0];
                const cor = corCfg(c0?.corCampanha);
                const mesAtual = m.mes === new Date().getMonth() + 1;
                return (
                  <div key={m.mes}
                    className={`rounded-2xl border-2 ${cor.border} ${cor.bg} p-4 shadow-sm ${mesAtual ? "ring-2 ring-emerald-400 ring-offset-2" : ""}`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className={`text-xs font-bold uppercase tracking-wider ${cor.text}`}>
                        {String(m.mes).padStart(2, "0")} • {MESES_PT[m.mes - 1]}
                      </div>
                      <span className="text-xs text-slate-500">
                        {m.sessoesNoMes} sessão(ões) este ano
                      </span>
                    </div>
                    {m.campanhas?.length ? m.campanhas.map((c: any) => (
                      <div key={c.id} className="mb-2">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${cor.chip}`}>
                            {c.codigo}
                          </span>
                        </div>
                        <h3 className={`font-semibold leading-tight ${cor.text}`}>{c.titulo}</h3>
                        <p className="text-xs text-slate-700 mt-1">{c.descricao}</p>
                        {c.normaReferencia && (
                          <p className="text-[10px] text-slate-500 mt-1 italic">{c.normaReferencia}</p>
                        )}
                        <div className="mt-3 flex gap-1">
                          <Button size="sm" variant="default" className="text-xs h-7"
                            onClick={() => abrirNovaSessao(c)}
                          >
                            <Plus className="h-3 w-3 mr-1" /> Iniciar sessão
                          </Button>
                          <Button size="sm" variant="ghost" className="text-xs h-7"
                            onClick={() => abrirEditTema(c)}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    )) : (
                      <p className="text-xs text-slate-500 italic">
                        Sem campanha cadastrada para este mês.
                      </p>
                    )}

                    {/* Rev. 1729 — Sugestões de DDS de VACINAÇÃO (Lei 15.377/2026) */}
                    {m.vacinacao?.length > 0 && (
                      <div className="mt-3 pt-3 border-t-2 border-dashed border-emerald-300">
                        <div className="flex items-center gap-1 mb-2">
                          <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
                          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                            Sugerido pelo ERP — Vacinação
                          </span>
                        </div>
                        {m.vacinacao.map((v: any) => (
                          <div key={v.id} className="mb-2 bg-emerald-50/70 border border-emerald-200 rounded-lg p-2">
                            <h4 className="font-semibold text-sm leading-tight text-emerald-900">{v.titulo}</h4>
                            <p className="text-[11px] text-slate-700 mt-1 line-clamp-3">{v.descricao}</p>
                            {v.normaReferencia && (
                              <p className="text-[9px] text-slate-500 mt-1 italic">{v.normaReferencia}</p>
                            )}
                            <div className="mt-2 flex gap-1">
                              <Button size="sm" variant="default" className="text-[11px] h-6 bg-emerald-600 hover:bg-emerald-700"
                                onClick={() => abrirNovaSessao(v)}
                              >
                                <Plus className="h-3 w-3 mr-1" /> DDS desta vacinação
                              </Button>
                              <Button size="sm" variant="ghost" className="text-[11px] h-6"
                                onClick={() => abrirEditTema(v)}
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* =================== BIBLIOTECA =================== */}
        <TabsContent value="biblioteca" className="mt-4">
          <div className="flex justify-between items-center mb-3">
            <p className="text-sm text-slate-600">{temas.length} tema(s) cadastrado(s).</p>
            <Button size="sm" onClick={abrirNovoTema}><Plus className="h-4 w-4 mr-1" /> Novo tema</Button>
          </div>
          {["NR", "CAMPANHA", "VACINACAO", "LIVRE"].map(cat => {
            const lista = temas.filter((t: any) => t.categoria === cat);
            if (lista.length === 0) return null;
            return (
              <div key={cat} className="mb-6">
                <h3 className="font-semibold text-slate-700 mb-2 flex items-center gap-2">
                  {cat === "NR" ? "Normas Regulamentadoras (NRs)" :
                   cat === "CAMPANHA" ? "Campanhas Governamentais" :
                   cat === "VACINACAO" ? "💉 Campanhas de Vacinação (PNI/MS — Lei 15.377/2026)" : "Temas Livres"}
                  <span className="text-xs text-slate-400 font-normal">({lista.length})</span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {lista.map((t: any) => {
                    const cor = (cat === "CAMPANHA" || cat === "VACINACAO") ? corCfg(t.corCampanha) : { bg: "bg-white", text: "text-slate-800", border: "border-slate-200", chip: "bg-slate-200 text-slate-700" };
                    return (
                      <div key={t.id} className={`rounded-xl border ${cor.border} ${cor.bg} p-3 shadow-sm flex flex-col`}>
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${cor.chip}`}>
                            {t.codigo ?? "—"}
                          </span>
                          <div className="flex gap-1">
                            <button onClick={() => abrirEditTema(t)} className="text-slate-400 hover:text-slate-700" title="Editar">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => confirm(`Excluir "${t.titulo}"?`) && excluirTemaMut.mutate({ companyId, id: t.id })}
                              className="text-slate-400 hover:text-red-600" title="Excluir">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                        <h4 className={`font-semibold text-sm leading-tight ${cor.text}`}>{t.titulo}</h4>
                        {t.descricao && <p className="text-xs text-slate-600 mt-1 line-clamp-3">{t.descricao}</p>}
                        {t.normaReferencia && <p className="text-[10px] text-slate-500 italic mt-1">{t.normaReferencia}</p>}
                        <Button size="sm" className="mt-3 text-xs h-7" onClick={() => abrirNovaSessao(t)}>
                          <Plus className="h-3 w-3 mr-1" /> Iniciar sessão com este tema
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {temas.length === 0 && (
            <div className="text-center text-slate-500 py-12">
              Nenhum tema cadastrado. Use "Carregar biblioteca padrão" no topo da página.
            </div>
          )}
        </TabsContent>

        {/* =================== SESSÕES =================== */}
        <TabsContent value="sessoes" className="mt-4">
          {selectedSessaoId && sessaoDetalheQ.data ? (
            <SessaoDetalhe
              companyId={companyId}
              sessao={sessaoDetalheQ.data as any}
              employees={(employeesQ.data as any[]) ?? []}
              idsJaNaSessao={idsJaNaSessao}
              addFuncId={addFuncId}
              setAddFuncId={setAddFuncId}
              presencaMut={presencaMut}
              finalizarMut={finalizarSessaoMut}
              excluirMut={excluirSessaoMut}
              voltar={() => setSelectedSessaoId(null)}
            />
          ) : (
            <div>
              <Button size="sm" onClick={() => abrirNovaSessao()} className="mb-3">
                <Plus className="h-4 w-4 mr-1" /> Nova sessão
              </Button>
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
                    <tr>
                      <th className="px-3 py-2 text-left">Data</th>
                      <th className="px-3 py-2 text-left">Tema</th>
                      <th className="px-3 py-2 text-left">Obra</th>
                      <th className="px-3 py-2 text-left">Instrutor</th>
                      <th className="px-3 py-2 text-center">Presentes</th>
                      <th className="px-3 py-2 text-center">Status</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessoes.length === 0 && (
                      <tr><td colSpan={7} className="text-center py-12 text-slate-400">Nenhuma sessão registrada ainda.</td></tr>
                    )}
                    {sessoes.map((s: any) => (
                      <tr key={s.id} className="border-t hover:bg-slate-50 cursor-pointer"
                        onClick={() => setSelectedSessaoId(s.id)}>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {s.data ? new Date(s.data + "T12:00:00").toLocaleDateString("pt-BR") : "—"}
                          {s.hora && <span className="text-xs text-slate-400 ml-1">{s.hora}</span>}
                        </td>
                        <td className="px-3 py-2 font-medium text-slate-800">{s.tituloTema}</td>
                        <td className="px-3 py-2 text-slate-600">{s.obraNome ?? <span className="italic text-slate-400">Avulsa/Escritório</span>}</td>
                        <td className="px-3 py-2 text-slate-600">{s.instrutor ?? "—"}</td>
                        <td className="px-3 py-2 text-center">
                          <span className="font-semibold text-emerald-700">{s.presentes}</span>
                          <span className="text-slate-400">/{s.totalParticipantes}</span>
                          {s.assinados > 0 && (
                            <span className="ml-1 text-[10px] text-blue-600">({s.assinados} assin.)</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {s.status === "finalizada" ? (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs">Finalizada</span>
                          ) : s.status === "cancelada" ? (
                            <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-800 text-xs">Cancelada</span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs">Aberta</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right"><ChevronRight className="h-4 w-4 text-slate-400 inline" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ===== MODAL: TEMA ===== */}
      <Dialog open={showTema} onOpenChange={setShowTema}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editTema ? "Editar tema" : "Novo tema"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-1">
                <label className="text-xs font-medium text-slate-600">Categoria</label>
                <Select value={temaForm.categoria} onValueChange={v => setTemaForm({ ...temaForm, categoria: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LIVRE">Livre</SelectItem>
                    <SelectItem value="NR">NR</SelectItem>
                    <SelectItem value="CAMPANHA">Campanha</SelectItem>
                    <SelectItem value="VACINACAO">💉 Vacinação (PNI/MS)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-1">
                <label className="text-xs font-medium text-slate-600">Código</label>
                <Input value={temaForm.codigo} onChange={e => setTemaForm({ ...temaForm, codigo: e.target.value })} placeholder="ex.: NR-35" />
              </div>
              <div className="col-span-1">
                <label className="text-xs font-medium text-slate-600">Duração (min)</label>
                <Input type="number" value={temaForm.duracaoMin}
                  onChange={e => setTemaForm({ ...temaForm, duracaoMin: parseInt(e.target.value) || 15 })} />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Título *</label>
              <Input value={temaForm.titulo} onChange={e => setTemaForm({ ...temaForm, titulo: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Descrição (resumo)</label>
              <Textarea rows={2} value={temaForm.descricao} onChange={e => setTemaForm({ ...temaForm, descricao: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Conteúdo completo</label>
              <Textarea rows={6} value={temaForm.conteudoMd} onChange={e => setTemaForm({ ...temaForm, conteudoMd: e.target.value })}
                placeholder="Roteiro do DDS, riscos, recomendações, EPIs obrigatórios, normas..." />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Norma de referência</label>
              <Input value={temaForm.normaReferencia} onChange={e => setTemaForm({ ...temaForm, normaReferencia: e.target.value })}
                placeholder="ex.: NR-18 (Portaria MTP 3.733/2020)" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTema(false)}>Cancelar</Button>
            <Button onClick={handleSalvarTema} disabled={salvarTemaMut.isPending || atualizarTemaMut.isPending}>
              {editTema ? "Salvar alterações" : "Criar tema"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== MODAL: NOVA SESSÃO (Rev. 1731 — full-screen + sidebar de obras + alerta acidente D-1 + transferir colaborador) ===== */}
      <Dialog open={showSessao} onOpenChange={setShowSessao}>
        <DialogContent className="!max-w-none !w-screen !h-screen !top-0 !left-0 !translate-x-0 !translate-y-0 !rounded-none !border-0 p-0 flex flex-col gap-0 overflow-hidden sm:!max-w-none">
          {(() => {
            const temaSel = temas.find((t: any) => String(t.id) === String(sessaoForm.temaId));
            const corBanner = temaSel?.corCampanha ? corCfg(temaSel.corCampanha) : null;
            const hoje = new Date().toISOString().slice(0, 10);
            const ontem = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); })();
            const recentLocais = getRecentLocais(companyId);
            const equipeObra = (funcsObraQ.data as any[]) ?? [];
            const todosSelecionados = equipeObra.length > 0 && equipeObra.every((e: any) =>
              sessaoForm.funcionarioIds.includes(e.employeeId)
            );
            const equipeFiltrada = buscaFunc
              ? equipeObra.filter((e: any) =>
                  e.nome?.toLowerCase().includes(buscaFunc.toLowerCase()) ||
                  e.funcao?.toLowerCase().includes(buscaFunc.toLowerCase())
                )
              : equipeObra;
            // Rev. 1731 fix: só obras Em_Andamento (já vêm com permissão de allowedObras aplicada pelo listActive)
            // Rev. 1733 — Consolida obras por NOME canônico (mesma regra do getEfetivoPorObra/cadastro > Efetivo).
            // Quando há duplicatas (mesmo nome, IDs diferentes), unifica numa entrada só com obraIds=[...].
            const obrasList = ((obrasQ.data as any[]) ?? []).filter((o: any) => !o.status || o.status === "Em_Andamento");
            const consolidadasMap = new Map<string, { idCanonico: number; ids: number[]; nome: string; cidade: string | null; uf: string | null }>();
            for (const o of obrasList) {
              const key = (o.nome || "").trim().toUpperCase();
              if (!key) continue;
              const ent = consolidadasMap.get(key);
              if (ent) {
                if (!ent.ids.includes(o.id)) ent.ids.push(o.id);
              } else {
                consolidadasMap.set(key, { idCanonico: o.id, ids: [o.id], nome: o.nome, cidade: o.cidade ?? null, uf: o.uf ?? null });
              }
            }
            const obrasConsolidadas = Array.from(consolidadasMap.values()).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
            const obrasFiltradas = buscaObra
              ? obrasConsolidadas.filter((o) => o.nome?.toLowerCase().includes(buscaObra.toLowerCase()))
              : obrasConsolidadas;
            const obraSelObj = obrasConsolidadas.find((o) => obrasIdsSel.length > 0 && o.ids.some((id) => obrasIdsSel.includes(id))) || null;
            const acidentesAll = (acidentesQ.data as any[]) ?? [];
            const acidentesObrigatorios = acidentesAll.filter((a: any) => a.obrigatorio);
            const fmtData = (iso: string) => {
              const [y, m, d] = (iso || "").split("-");
              return d ? `${d}/${m}/${y}` : iso;
            };
            const aplicarAcidenteComoTema = (a: any) => {
              const titulo = `Análise do acidente de ${fmtData(a.dataAcidente)} — ${a.tipoAcidente}`;
              const conteudo = [
                `📋 ANÁLISE DO ACIDENTE — DDS OBRIGATÓRIO (Lei art. 157 CLT, NR-1)`,
                ``,
                `📅 Data/hora: ${fmtData(a.dataAcidente)}${a.horaAcidente ? ` às ${a.horaAcidente}` : ""}`,
                a.empNome ? `👤 Colaborador envolvido: ${a.empNome}` : null,
                a.obraNome ? `🏗️ Obra: ${a.obraNome}` : null,
                `⚠️ Tipo: ${a.tipoAcidente}`,
                `🩹 Gravidade: ${a.gravidade}`,
                a.localAcidente ? `📍 Local: ${a.localAcidente}` : null,
                a.parteCorpoAtingida ? `🦴 Parte do corpo atingida: ${a.parteCorpoAtingida}` : null,
                a.agenteCausador ? `🔧 Agente causador: ${a.agenteCausador}` : null,
                a.diasAfastamento ? `⏱️ Dias de afastamento: ${a.diasAfastamento}` : null,
                ``,
                a.descricao ? `📝 DESCRIÇÃO DOS FATOS:\n${a.descricao}` : null,
                ``,
                a.acaoCorretiva ? `✅ AÇÃO CORRETIVA / LIÇÕES APRENDIDAS:\n${a.acaoCorretiva}` : null,
                ``,
                `🎯 PONTOS A REFORÇAR COM A EQUIPE:`,
                `- Causa raiz e fatores contribuintes`,
                `- Procedimento correto a ser seguido`,
                `- EPIs / medidas de proteção aplicáveis`,
                `- Como reportar quase-acidentes`,
              ].filter(Boolean).join("\n");
              setSessaoForm((s: any) => ({
                ...s,
                temaId: "",
                tituloTema: titulo,
                conteudoMd: conteudo,
              }));
              setShowRoteiro(true);
              toast.success("Tema preenchido com os dados do acidente");
            };
            return (
              <>
                {/* HEADER colorido (cor da campanha quando há tema selecionado) */}
                <div className={`px-6 pt-5 pb-4 rounded-t-lg ${corBanner ? `${corBanner.bg} border-b-4 ${corBanner.border}` : "bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-emerald-200"}`}>
                  <DialogHeader>
                    <DialogTitle className={`flex items-center gap-2 text-lg ${corBanner ? corBanner.text : "text-emerald-900"}`}>
                      <ClipboardCheck className="h-5 w-5" />
                      Nova Sessão DDS
                      {temaSel?.codigo && (
                        <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-bold ${corBanner?.chip ?? "bg-emerald-500 text-white"}`}>
                          {temaSel.codigo}
                        </span>
                      )}
                    </DialogTitle>
                    {temaSel && (
                      <p className={`text-sm font-semibold ${corBanner?.text ?? "text-emerald-800"} mt-1`}>
                        {temaSel.titulo}
                      </p>
                    )}
                  </DialogHeader>
                </div>

                <div className="flex-1 grid grid-cols-12 overflow-hidden min-h-0">
                  {/* ====== SIDEBAR: OBRAS (eixo principal — DDS é por obra) ====== */}
                  <aside className="col-span-12 lg:col-span-3 border-r border-slate-200 bg-slate-50/60 overflow-y-auto p-3 space-y-2">
                    <div className="sticky top-0 bg-slate-50/95 backdrop-blur pb-2 -mt-3 -mx-3 px-3 pt-3 border-b border-slate-200 z-10">
                      <div className="text-[10px] font-bold uppercase text-slate-500 tracking-wider mb-1">
                        Obras ({obrasConsolidadas.length})
                      </div>
                      <div className="relative">
                        <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-slate-400" />
                        <Input value={buscaObra} onChange={e => setBuscaObra(e.target.value)}
                          placeholder="Buscar obra..." className="h-8 pl-7 text-xs" />
                      </div>
                    </div>
                    {/* Card "Avulsa/Escritório" */}
                    <button type="button"
                      onClick={() => setSessaoForm({ ...sessaoForm, obraId: "", obraIds: [], funcionarioIds: [] })}
                      className={`w-full text-left rounded-lg border-2 px-3 py-2 transition ${obrasIdsSel.length === 0 ? "border-emerald-500 bg-emerald-50 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                      <div className="flex items-center gap-2">
                        <MapPin className="h-3.5 w-3.5 text-slate-500" />
                        <span className="text-sm font-semibold text-slate-700">Avulsa / Escritório</span>
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">Sem vínculo a obra</div>
                    </button>
                    {/* Lista de obras (consolidadas por nome) */}
                    {obrasFiltradas.map((o) => {
                      const sel = obrasIdsSel.length > 0 && o.ids.some((id) => obrasIdsSel.includes(id));
                      const acidObra = acidentesAll.filter((a: any) => o.ids.includes(a.obraId) && a.obrigatorio).length;
                      return (
                        <button key={o.idCanonico} type="button"
                          onClick={() => setSessaoForm({ ...sessaoForm, obraId: String(o.idCanonico), obraIds: o.ids, funcionarioIds: [] })}
                          className={`w-full text-left rounded-lg border-2 px-3 py-2 transition ${sel ? "border-emerald-500 bg-emerald-50 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                          <div className="flex items-start gap-2">
                            <div className={`h-2 w-2 rounded-full mt-1.5 flex-shrink-0 ${sel ? "bg-emerald-500" : "bg-slate-300"}`} />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-semibold text-slate-800 truncate">{o.nome}</div>
                              {o.cidade && <div className="text-[10px] text-slate-500 truncate">{o.cidade}{o.uf ? `/${o.uf}` : ""}</div>}
                              {o.ids.length > 1 && (
                                <div className="text-[9px] text-slate-400 italic">{o.ids.length} cadastros consolidados</div>
                              )}
                            </div>
                            {acidObra > 0 && (
                              <span title="Acidente recente — DDS obrigatório" className="px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[9px] font-bold animate-pulse">
                                ⚠️ {acidObra}
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                    {obrasFiltradas.length === 0 && (
                      <p className="text-xs text-slate-400 italic text-center py-4">
                        {buscaObra ? `Nenhuma obra para "${buscaObra}"` : "Nenhuma obra cadastrada"}
                      </p>
                    )}
                  </aside>

                  {/* ====== MAIN: FORMULÁRIO ====== */}
                  <main className="col-span-12 lg:col-span-9 overflow-y-auto p-5 space-y-4">
                    {/* OBRA SELECIONADA — barra-resumo */}
                    <div className="flex items-center gap-3 pb-3 border-b border-slate-200">
                      <MapPin className="h-5 w-5 text-emerald-600" />
                      <div className="flex-1">
                        <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Obra alvo do DDS</div>
                        <div className="text-base font-bold text-slate-800">
                          {obraSelObj ? obraSelObj.nome : "Avulsa / Escritório"}
                        </div>
                      </div>
                      {obrasIdsSel.length > 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-semibold">
                          {equipeObra.length} colaborador(es) na equipe
                        </span>
                      )}
                    </div>

                    {/* ⚠️ ALERTA ACIDENTE D-1 (Lei art. 157 CLT) — TOPO ABSOLUTO */}
                    {acidentesObrigatorios.length > 0 && (
                      <div className="rounded-xl border-2 border-red-400 bg-red-50 p-4 shadow-sm">
                        <div className="flex items-start gap-3">
                          <div className="h-10 w-10 rounded-full bg-red-500 text-white flex items-center justify-center text-xl flex-shrink-0">⚠️</div>
                          <div className="flex-1 min-w-0">
                            <h3 className="text-sm font-bold text-red-900">
                              DDS OBRIGATÓRIO HOJE — Acidente registrado ontem
                            </h3>
                            <p className="text-xs text-red-700 mb-2">
                              Lei art. 157 CLT / NR-1: o DDS do dia seguinte ao acidente deve abordar obrigatoriamente os fatos, causas e medidas preventivas.
                            </p>
                            <div className="space-y-2">
                              {acidentesObrigatorios.map((a: any) => (
                                <div key={a.id} className="rounded-lg bg-white border border-red-200 px-3 py-2">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                      <div className="text-xs font-bold text-red-900">
                                        {a.tipoAcidente} <span className="font-normal text-slate-600">— {a.gravidade}</span>
                                      </div>
                                      <div className="text-[11px] text-slate-700 mt-0.5">
                                        {a.empNome && <span className="font-medium">{a.empNome}</span>}
                                        {a.obraNome && <> · {a.obraNome}</>}
                                        {a.localAcidente && <> · {a.localAcidente}</>}
                                      </div>
                                      {a.descricao && (
                                        <p className="text-[11px] text-slate-600 mt-1 line-clamp-2 italic">"{a.descricao}"</p>
                                      )}
                                    </div>
                                    <button type="button"
                                      onClick={() => aplicarAcidenteComoTema(a)}
                                      className="px-2.5 py-1 rounded-md bg-red-600 text-white text-[10px] font-bold hover:bg-red-700 whitespace-nowrap">
                                      Aplicar como tema
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Acidentes nos últimos 7 dias (não-obrigatórios) — dica suave */}
                    {acidentesAll.filter((a: any) => !a.obrigatorio).length > 0 && acidentesObrigatorios.length === 0 && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs">
                        <div className="font-semibold text-amber-900 mb-1">
                          ℹ️ {acidentesAll.length} acidente(s) nos últimos 7 dias{obrasIdsSel.length > 0 ? " (nesta obra/empresa)" : " na empresa"}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {acidentesAll.slice(0, 3).map((a: any) => (
                            <button key={a.id} type="button"
                              onClick={() => aplicarAcidenteComoTema(a)}
                              className="px-2 py-0.5 rounded-full bg-white border border-amber-300 text-amber-800 text-[10px] hover:bg-amber-100">
                              {fmtData(a.dataAcidente)} · {a.tipoAcidente}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* BLOCO 1 — QUANDO (Data + Hora) */}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                      <div className="md:col-span-6">
                        <label className="text-xs font-medium text-slate-600 flex items-center gap-1">
                          <CalendarDays className="h-3 w-3" /> Data *
                        </label>
                        <Input type="date" value={sessaoForm.data} onChange={e => setSessaoForm({ ...sessaoForm, data: e.target.value })} />
                        <div className="flex gap-1 mt-1">
                          <button type="button"
                            onClick={() => setSessaoForm({ ...sessaoForm, data: hoje })}
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${sessaoForm.data === hoje ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"}`}>
                            Hoje
                          </button>
                          <button type="button"
                            onClick={() => setSessaoForm({ ...sessaoForm, data: ontem })}
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${sessaoForm.data === ontem ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"}`}>
                            Ontem
                          </button>
                        </div>
                      </div>
                      <div className="md:col-span-6">
                        <label className="text-xs font-medium text-slate-600">Hora</label>
                        <Input type="time" value={sessaoForm.hora} onChange={e => setSessaoForm({ ...sessaoForm, hora: e.target.value })} />
                        <div className="flex gap-1 mt-1">
                          {["07:00", "07:30", "12:00", "13:00"].map(h => (
                            <button key={h} type="button"
                              onClick={() => setSessaoForm({ ...sessaoForm, hora: h })}
                              className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold border ${sessaoForm.hora === h ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"}`}>
                              {h}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* BLOCO 2 — TEMA (com sugestão automática + categorias) */}
                  <div>
                    <label className="text-xs font-medium text-slate-600 flex items-center gap-1">
                      <BookOpen className="h-3 w-3" /> Tema da biblioteca
                      <span className="text-[10px] text-emerald-600 font-normal italic ml-1">
                        (✨ sugerido automaticamente o tema do mês)
                      </span>
                    </label>
                    <Select value={sessaoForm.temaId || "_livre"} onValueChange={v => {
                      if (v === "_livre") { setSessaoForm({ ...sessaoForm, temaId: "", tituloTema: "", conteudoMd: "" }); return; }
                      const t = temas.find((x: any) => String(x.id) === v);
                      setSessaoForm({
                        ...sessaoForm, temaId: v,
                        tituloTema: t?.titulo ?? sessaoForm.tituloTema,
                        conteudoMd: t?.conteudoMd ?? t?.descricao ?? sessaoForm.conteudoMd,
                      });
                    }}>
                      <SelectTrigger><SelectValue placeholder="Selecione um tema (ou crie um livre)" /></SelectTrigger>
                      <SelectContent className="max-h-80">
                        <SelectItem value="_livre">📝 Tema livre (sem vínculo à biblioteca)</SelectItem>
                        {["VACINACAO", "CAMPANHA", "NR", "LIVRE"].flatMap(cat => {
                          const lista = temas.filter((t: any) => t.categoria === cat);
                          if (lista.length === 0) return [];
                          const labelCat = cat === "VACINACAO" ? "💉 VACINAÇÃO" : cat === "CAMPANHA" ? "📢 CAMPANHAS" : cat === "NR" ? "⚠️ NRs" : "📋 LIVRES";
                          return [
                            <div key={`h-${cat}`} className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50">
                              {labelCat}
                            </div>,
                            ...lista.map((t: any) => (
                              <SelectItem key={t.id} value={String(t.id)}>
                                {t.codigo ? `[${t.codigo}] ` : ""}{t.titulo}
                              </SelectItem>
                            )),
                          ];
                        })}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* BLOCO 3 — TÍTULO + ROTEIRO COLAPSÁVEL */}
                  <div>
                    <label className="text-xs font-medium text-slate-600">Título do tema *</label>
                    <Input value={sessaoForm.tituloTema} onChange={e => setSessaoForm({ ...sessaoForm, tituloTema: e.target.value })}
                      placeholder="Ex.: Uso correto de EPI em altura" />
                  </div>
                  <div>
                    <button type="button"
                      onClick={() => setShowRoteiro(s => !s)}
                      className="text-xs font-medium text-slate-600 hover:text-slate-900 flex items-center gap-1"
                    >
                      {showRoteiro ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      Conteúdo / roteiro {sessaoForm.conteudoMd ? `(${sessaoForm.conteudoMd.length} caracteres)` : "(opcional)"}
                    </button>
                    {showRoteiro && (
                      <Textarea rows={4} value={sessaoForm.conteudoMd}
                        onChange={e => setSessaoForm({ ...sessaoForm, conteudoMd: e.target.value })}
                        className="mt-1"
                        placeholder="Roteiro / pontos abordados na sessão..." />
                    )}
                    {!showRoteiro && sessaoForm.conteudoMd && (
                      <p className="text-xs text-slate-500 mt-1 line-clamp-2 italic bg-slate-50 rounded px-2 py-1 border border-slate-200">
                        {sessaoForm.conteudoMd.slice(0, 200)}{sessaoForm.conteudoMd.length > 200 ? "..." : ""}
                      </p>
                    )}
                  </div>

                  {/* BLOCO 4 — INSTRUTOR (auto-fill + máscara CPF) */}
                  <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                        <UserCheck className="h-3 w-3" /> Instrutor
                      </label>
                      {(() => {
                        const nomeUser = (user as any)?.nome ?? (user as any)?.name ?? (user as any)?.loginName ?? (user as any)?.email;
                        if (!nomeUser || sessaoForm.instrutor === nomeUser) return null;
                        return (
                          <button type="button"
                            onClick={() => setSessaoForm({ ...sessaoForm, instrutor: nomeUser, instrutorCpf: (user as any)?.cpf ? maskCpf(String((user as any).cpf)) : sessaoForm.instrutorCpf })}
                            className="text-[10px] text-emerald-700 font-semibold hover:underline">
                            ✓ Sou eu ({nomeUser})
                          </button>
                        );
                      })()}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
                      <div className="md:col-span-7">
                        <Input value={sessaoForm.instrutor}
                          onChange={e => setSessaoForm({ ...sessaoForm, instrutor: e.target.value })}
                          placeholder="Nome do instrutor" />
                      </div>
                      <div className="md:col-span-5">
                        <Input value={sessaoForm.instrutorCpf}
                          onChange={e => setSessaoForm({ ...sessaoForm, instrutorCpf: maskCpf(e.target.value) })}
                          placeholder="CPF (000.000.000-00)" inputMode="numeric" maxLength={14} />
                      </div>
                    </div>
                  </div>

                  {/* BLOCO 5 — LOCAL (com histórico) */}
                  <div>
                    <label className="text-xs font-medium text-slate-600 flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> Local
                    </label>
                    <Input value={sessaoForm.local}
                      onChange={e => setSessaoForm({ ...sessaoForm, local: e.target.value })}
                      placeholder="ex.: Refeitório / Pátio / Sala de treinamento"
                      list="dds-locais-recentes" />
                    {recentLocais.length > 0 && (
                      <>
                        <datalist id="dds-locais-recentes">
                          {recentLocais.map(l => <option key={l} value={l} />)}
                        </datalist>
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {recentLocais.slice(0, 5).map(l => (
                            <button key={l} type="button"
                              onClick={() => setSessaoForm({ ...sessaoForm, local: l })}
                              className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${sessaoForm.local === l ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-600 border-slate-300 hover:bg-emerald-50 hover:border-emerald-300"}`}>
                              {l}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>

                    {/* BLOCO 6 — EQUIPE DA OBRA (pré-seleção em massa + transferir colaborador) */}
                    {obrasIdsSel.length > 0 && (
                      <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50/40 p-4">
                        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                          <label className="text-sm font-bold text-emerald-900 flex items-center gap-1.5">
                            <Users className="h-4 w-4" /> Equipe da obra
                            {funcsObraQ.isLoading && <span className="text-[11px] font-normal text-slate-500 italic">(carregando...)</span>}
                            {!funcsObraQ.isLoading && (
                              <span className="text-[11px] font-normal text-slate-600">
                                ({sessaoForm.funcionarioIds.length} de {equipeObra.length} marcado(s) como presente)
                              </span>
                            )}
                          </label>
                          <div className="flex items-center gap-2">
                            {equipeObra.length > 0 && (
                              <button type="button"
                                onClick={() => {
                                  if (todosSelecionados) {
                                    setSessaoForm({ ...sessaoForm, funcionarioIds: [] });
                                  } else {
                                    setSessaoForm({ ...sessaoForm, funcionarioIds: equipeObra.map((e: any) => e.employeeId) });
                                  }
                                }}
                                className="text-[11px] font-semibold text-emerald-700 hover:underline">
                                {todosSelecionados ? "Desmarcar todos" : `✓ Selecionar todos (${equipeObra.length})`}
                              </button>
                            )}
                            <button type="button"
                              onClick={() => setShowTransferir(true)}
                              className="px-2.5 py-1 rounded-md bg-blue-600 text-white text-[11px] font-bold hover:bg-blue-700 flex items-center gap-1">
                              <Plus className="h-3 w-3" /> Transferir colaborador
                            </button>
                          </div>
                        </div>
                        {equipeObra.length === 0 && !funcsObraQ.isLoading && (
                          <div className="rounded-lg bg-amber-50 border border-amber-300 p-3 text-center">
                            <p className="text-xs text-amber-900 font-semibold mb-1">
                              ⚠️ Nenhum colaborador vinculado a esta obra
                            </p>
                            <p className="text-[11px] text-amber-700 mb-2">
                              Use "Transferir colaborador" para vincular colaboradores ativos da empresa e regularizar a equipe agora.
                            </p>
                          </div>
                        )}
                        {equipeObra.length > 0 && (
                          <>
                            <div className="relative mb-2">
                              <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-slate-400" />
                              <Input value={buscaFunc} onChange={e => setBuscaFunc(e.target.value)}
                                placeholder="Buscar por nome ou função..." className="h-8 pl-7 text-xs" />
                            </div>
                            <div className="max-h-72 overflow-y-auto bg-white rounded-lg border border-slate-200 divide-y divide-slate-100">
                              {equipeFiltrada.map((e: any) => {
                                const sel = sessaoForm.funcionarioIds.includes(e.employeeId);
                                return (
                                  <label key={e.employeeId}
                                    className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-emerald-50 ${sel ? "bg-emerald-50" : ""}`}>
                                    <input type="checkbox" checked={sel}
                                      onChange={() => {
                                        const ids = sessaoForm.funcionarioIds;
                                        setSessaoForm({
                                          ...sessaoForm,
                                          funcionarioIds: sel
                                            ? ids.filter((x: number) => x !== e.employeeId)
                                            : [...ids, e.employeeId],
                                        });
                                      }}
                                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-4 w-4" />
                                    <div className="flex-1 min-w-0">
                                      <div className="text-sm font-medium text-slate-800 truncate">{e.nome}</div>
                                      <div className="text-[11px] text-slate-500 truncate">
                                        {e.funcaoNaObra ?? e.funcao ?? "—"}
                                        {e.status && e.status !== "Ativo" && (
                                          <span className="ml-1 px-1 rounded bg-amber-100 text-amber-800 font-semibold">{e.status}</span>
                                        )}
                                      </div>
                                    </div>
                                  </label>
                                );
                              })}
                              {equipeFiltrada.length === 0 && (
                                <p className="text-xs text-slate-400 italic text-center py-3">Nenhum resultado para "{buscaFunc}"</p>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {/* BLOCO 7 — OBSERVAÇÕES (compacto) */}
                    <div>
                      <label className="text-xs font-medium text-slate-600">Observações (opcional)</label>
                      <Textarea rows={2} value={sessaoForm.observacoes}
                        onChange={e => setSessaoForm({ ...sessaoForm, observacoes: e.target.value })}
                        placeholder="Notas adicionais sobre esta sessão..." />
                    </div>
                  </main>
                </div>
              </>
            );
          })()}
          <DialogFooter className="px-5 py-3 border-t border-slate-200 bg-white !mt-0 flex-shrink-0">
            <Button variant="outline" onClick={() => setShowSessao(false)}>Cancelar</Button>
            <Button onClick={handleSalvarSessao} disabled={criarSessaoMut.isPending}>
              {criarSessaoMut.isPending ? "Criando..." : "Criar sessão"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== SUB-DIÁLOGO: TRANSFERIR COLABORADOR PARA A OBRA (Rev. 1731) ===== */}
      <Dialog open={showTransferir} onOpenChange={setShowTransferir}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col p-0">
          <DialogHeader className="px-5 pt-4 pb-3 border-b">
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-blue-600" /> Transferir colaborador para a obra
            </DialogTitle>
            <p className="text-xs text-slate-500 mt-1">
              Lista colaboradores ativos da empresa que ainda <strong>não estão vinculados</strong> a esta obra.
              Ao confirmar, o colaborador é vinculado e marcado como presente nesta sessão.
            </p>
          </DialogHeader>
          <div className="px-5 py-3 border-b">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
              <Input value={buscaTransferir} onChange={e => setBuscaTransferir(e.target.value)}
                placeholder="Buscar por nome, CPF ou função..." className="pl-8" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-2">
            {candidatosTransferQ.isLoading && (
              <p className="text-xs text-slate-500 italic text-center py-6">Carregando colaboradores...</p>
            )}
            {!candidatosTransferQ.isLoading && (() => {
              const all = (candidatosTransferQ.data as any[]) ?? [];
              const filtrados = buscaTransferir
                ? all.filter((c: any) =>
                    c.nome?.toLowerCase().includes(buscaTransferir.toLowerCase()) ||
                    c.cpf?.includes(buscaTransferir) ||
                    c.funcao?.toLowerCase().includes(buscaTransferir.toLowerCase()))
                : all;
              if (filtrados.length === 0) {
                return (
                  <p className="text-xs text-slate-400 italic text-center py-6">
                    {buscaTransferir
                      ? `Nenhum colaborador para "${buscaTransferir}"`
                      : "Todos os colaboradores ativos já estão vinculados a esta obra."}
                  </p>
                );
              }
              return (
                <div className="divide-y divide-slate-100">
                  {filtrados.map((c: any) => (
                    <div key={c.id} className="flex items-center gap-3 py-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-slate-800 truncate">{c.nome}</div>
                        <div className="text-[11px] text-slate-500 truncate">
                          {c.funcao ?? "—"}
                          {c.cpf && <> · CPF {maskCpf(c.cpf)}</>}
                          {c.status && c.status !== "Ativo" && (
                            <span className="ml-1 px-1 rounded bg-amber-100 text-amber-800 font-semibold">{c.status}</span>
                          )}
                        </div>
                      </div>
                      <Button size="sm" variant="outline"
                        onClick={() => {
                          // Rev. 1733 — transfere para o ID canônico (primeiro da lista consolidada)
                          const target = obrasIdsSel[0];
                          if (!target) { toast.error("Selecione uma obra"); return; }
                          transferirMut.mutate({ companyId, obraId: target, employeeId: c.id });
                        }}
                        disabled={transferirMut.isPending}>
                        Transferir →
                      </Button>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
          <DialogFooter className="px-5 py-3 border-t">
            <Button variant="outline" onClick={() => setShowTransferir(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SessaoDetalhe({
  companyId, sessao, employees, idsJaNaSessao, addFuncId, setAddFuncId,
  presencaMut, finalizarMut, excluirMut, voltar,
}: any) {
  const funcs = sessao.funcionarios ?? [];
  const presentes = funcs.filter((f: any) => f.presente === 1).length;
  const assinados = funcs.filter((f: any) => !!f.assinadoEm).length;

  const handleAdicionar = () => {
    if (!addFuncId) return;
    const e = employees.find((x: any) => String(x.id) === addFuncId);
    if (!e) return;
    presencaMut.mutate({
      companyId, sessaoId: sessao.id,
      adicionar: [{ employeeId: e.id, nome: e.nome, cpf: e.cpf, funcao: e.funcao, presente: 1 }],
    });
    setAddFuncId("");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={voltar}>← Voltar para a lista</Button>
        <span className="text-sm text-slate-500">/</span>
        <h2 className="text-lg font-bold text-slate-800">{sessao.tituloTema}</h2>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div><div className="text-xs text-slate-500">Data</div><div className="font-medium">{sessao.data ? new Date(sessao.data + "T12:00:00").toLocaleDateString("pt-BR") : "—"} {sessao.hora}</div></div>
          <div><div className="text-xs text-slate-500">Obra</div><div className="font-medium">{sessao.obraNome ?? "Avulsa"}</div></div>
          <div><div className="text-xs text-slate-500">Instrutor</div><div className="font-medium">{sessao.instrutor ?? "—"}</div></div>
          <div><div className="text-xs text-slate-500">Status</div>
            <div className="font-medium">
              {sessao.status === "finalizada" ? <span className="text-emerald-700">Finalizada</span>
                : sessao.status === "cancelada" ? <span className="text-red-700">Cancelada</span>
                : <span className="text-amber-700">Aberta</span>}
            </div>
          </div>
        </div>
        {sessao.conteudoMd && (
          <div className="mt-3 p-3 bg-slate-50 rounded-lg text-sm text-slate-700 whitespace-pre-wrap">
            {sessao.conteudoMd}
          </div>
        )}
        {sessao.observacoes && (
          <p className="text-xs text-slate-500 italic mt-2">Obs.: {sessao.observacoes}</p>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="font-semibold text-slate-700 flex items-center gap-2">
            <Users className="h-4 w-4" /> Lista de Presença
            <span className="text-xs text-slate-400 font-normal">
              {presentes}/{funcs.length} presentes • {assinados} assinaturas
            </span>
          </h3>
          {sessao.status === "aberta" && (
            <div className="flex gap-2 items-center">
              <Select value={addFuncId} onValueChange={setAddFuncId}>
                <SelectTrigger className="w-72 h-8 text-xs">
                  <SelectValue placeholder="Adicionar funcionário..." />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {employees.filter((e: any) => !idsJaNaSessao.has(e.id)).map((e: any) => (
                    <SelectItem key={e.id} value={String(e.id)}>{e.nome}{e.funcao ? ` — ${e.funcao}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" onClick={handleAdicionar} disabled={!addFuncId || presencaMut.isPending}>
                <Plus className="h-3 w-3 mr-1" /> Adicionar
              </Button>
            </div>
          )}
        </div>

        {funcs.length === 0 ? (
          <p className="text-sm text-slate-400 italic text-center py-8">Nenhum funcionário adicionado ainda.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                <th className="text-left py-1">Nome</th>
                <th className="text-left py-1">CPF</th>
                <th className="text-left py-1">Função</th>
                <th className="text-center py-1">Presente</th>
                <th className="text-center py-1">Assinatura</th>
                {sessao.status === "aberta" && <th className="py-1"></th>}
              </tr>
            </thead>
            <tbody>
              {funcs.map((f: any) => (
                <tr key={f.id} className="border-t">
                  <td className="py-2 font-medium">{f.nome}</td>
                  <td className="py-2 text-slate-600">{f.cpf ?? "—"}</td>
                  <td className="py-2 text-slate-600">{f.funcao ?? "—"}</td>
                  <td className="py-2 text-center">
                    <button
                      disabled={sessao.status !== "aberta"}
                      onClick={() => presencaMut.mutate({
                        companyId, sessaoId: sessao.id,
                        atualizar: [{ id: f.id, presente: f.presente === 1 ? 0 : 1 }],
                      })}
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${f.presente === 1 ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"} disabled:opacity-50`}
                    >
                      {f.presente === 1 ? <><Check className="h-3 w-3 inline mr-1" />Sim</> : <><XIcon className="h-3 w-3 inline mr-1" />Não</>}
                    </button>
                  </td>
                  <td className="py-2 text-center">
                    {f.assinadoEm ? (
                      <span className="text-xs text-blue-700">
                        ✓ {new Date(f.assinadoEm).toLocaleDateString("pt-BR")}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400 italic">pendente</span>
                    )}
                  </td>
                  {sessao.status === "aberta" && (
                    <td className="py-2 text-right">
                      <button onClick={() => presencaMut.mutate({ companyId, sessaoId: sessao.id, remover: [f.id] })}
                        className="text-slate-400 hover:text-red-600">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center gap-3 flex-wrap">
        <FileSignature className="h-6 w-6 text-blue-700 shrink-0" />
        <div className="flex-1 min-w-[240px]">
          <h4 className="font-semibold text-blue-900 text-sm">Assinatura digital via FCsign</h4>
          <p className="text-xs text-blue-800">
            Ao finalizar a sessão, gere o envelope FCsign com a ata e a lista de presentes.
            Cada funcionário assina pelo link enviado por e-mail/SMS.
          </p>
        </div>
        <Button size="sm" variant="outline" disabled
          title="Integração FCsign — disponível na próxima entrega">
          Enviar para FCsign (em breve)
        </Button>
      </div>

      <div className="flex gap-2 justify-end flex-wrap">
        {sessao.status === "aberta" && (
          <Button variant="default" onClick={() => finalizarMut.mutate({ companyId, id: sessao.id, status: "finalizada" })}>
            <Check className="h-4 w-4 mr-1" /> Finalizar sessão
          </Button>
        )}
        {sessao.status === "finalizada" && (
          <Button variant="outline" onClick={() => finalizarMut.mutate({ companyId, id: sessao.id, status: "aberta" })}>
            Reabrir
          </Button>
        )}
        <Button variant="outline" className="text-red-600 hover:bg-red-50"
          onClick={() => confirm("Excluir esta sessão? Não há volta.") && excluirMut.mutate({ companyId, id: sessao.id })}>
          <Trash2 className="h-4 w-4 mr-1" /> Excluir
        </Button>
      </div>
    </div>
  );
}
