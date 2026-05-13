import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  CalendarDays, BookOpen, Megaphone, Plus, Trash2, Pencil, Users, FileSignature,
  ClipboardCheck, Check, X as XIcon, ChevronRight, Sparkles,
} from "lucide-react";

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
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ?? 1;
  const utils = trpc.useUtils();

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
  const obrasQ = trpc.obras.listar.useQuery({ companyId } as any, { enabled: !!companyId });
  const employeesQ = trpc.employees.list.useQuery({ companyId } as any, { enabled: !!companyId });
  const [showSessao, setShowSessao] = useState(false);
  const [sessaoForm, setSessaoForm] = useState<any>({
    obraId: "", data: new Date().toISOString().slice(0, 10), hora: "07:30",
    temaId: "", tituloTema: "", conteudoMd: "",
    instrutor: "", instrutorCpf: "", local: "", observacoes: "",
    funcionarioIds: [] as number[],
  });
  const abrirNovaSessao = (temaPre?: any) => {
    setSessaoForm({
      obraId: "", data: new Date().toISOString().slice(0, 10), hora: "07:30",
      temaId: temaPre?.id ? String(temaPre.id) : "",
      tituloTema: temaPre?.titulo ?? "",
      conteudoMd: temaPre?.conteudoMd ?? temaPre?.descricao ?? "",
      instrutor: "", instrutorCpf: "", local: "", observacoes: "",
      funcionarioIds: [],
    });
    setShowSessao(true);
  };
  const criarSessaoMut = trpc.dds.criarSessao.useMutation({
    onSuccess: (s) => { toast.success("Sessão criada"); utils.dds.listSessoes.invalidate(); utils.dds.calendarioAnual.invalidate(); setShowSessao(false); setSelectedSessaoId(s.id); setTab("sessoes"); },
    onError: (e) => toast.error(e.message),
  });
  const handleSalvarSessao = () => {
    if (!sessaoForm.tituloTema || sessaoForm.tituloTema.length < 3) { toast.error("Informe o título do tema"); return; }
    if (!sessaoForm.data) { toast.error("Informe a data"); return; }
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
          {["NR", "CAMPANHA", "LIVRE"].map(cat => {
            const lista = temas.filter((t: any) => t.categoria === cat);
            if (lista.length === 0) return null;
            return (
              <div key={cat} className="mb-6">
                <h3 className="font-semibold text-slate-700 mb-2 flex items-center gap-2">
                  {cat === "NR" ? "Normas Regulamentadoras (NRs)" :
                   cat === "CAMPANHA" ? "Campanhas Governamentais" : "Temas Livres"}
                  <span className="text-xs text-slate-400 font-normal">({lista.length})</span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {lista.map((t: any) => {
                    const cor = cat === "CAMPANHA" ? corCfg(t.corCampanha) : { bg: "bg-white", text: "text-slate-800", border: "border-slate-200", chip: "bg-slate-200 text-slate-700" };
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

      {/* ===== MODAL: NOVA SESSÃO ===== */}
      <Dialog open={showSessao} onOpenChange={setShowSessao}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova Sessão DDS</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-600">Data *</label>
                <Input type="date" value={sessaoForm.data} onChange={e => setSessaoForm({ ...sessaoForm, data: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Hora</label>
                <Input type="time" value={sessaoForm.hora} onChange={e => setSessaoForm({ ...sessaoForm, hora: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Obra</label>
                <Select value={sessaoForm.obraId || "_avulsa"} onValueChange={v => setSessaoForm({ ...sessaoForm, obraId: v === "_avulsa" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Avulsa/Escritório" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_avulsa">Avulsa / Escritório</SelectItem>
                    {((obrasQ.data as any[]) ?? []).map((o: any) => (
                      <SelectItem key={o.id} value={String(o.id)}>{o.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Tema</label>
              <Select value={sessaoForm.temaId || "_livre"} onValueChange={v => {
                if (v === "_livre") { setSessaoForm({ ...sessaoForm, temaId: "" }); return; }
                const t = temas.find((x: any) => String(x.id) === v);
                setSessaoForm({
                  ...sessaoForm, temaId: v,
                  tituloTema: t?.titulo ?? sessaoForm.tituloTema,
                  conteudoMd: t?.conteudoMd ?? t?.descricao ?? sessaoForm.conteudoMd,
                });
              }}>
                <SelectTrigger><SelectValue placeholder="Selecione (ou deixe livre)" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="_livre">Tema livre (sem vínculo à biblioteca)</SelectItem>
                  {temas.map((t: any) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {t.codigo ? `[${t.codigo}] ` : ""}{t.titulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Título do tema *</label>
              <Input value={sessaoForm.tituloTema} onChange={e => setSessaoForm({ ...sessaoForm, tituloTema: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Conteúdo / roteiro</label>
              <Textarea rows={4} value={sessaoForm.conteudoMd} onChange={e => setSessaoForm({ ...sessaoForm, conteudoMd: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-600">Instrutor</label>
                <Input value={sessaoForm.instrutor} onChange={e => setSessaoForm({ ...sessaoForm, instrutor: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">CPF do instrutor</label>
                <Input value={sessaoForm.instrutorCpf} onChange={e => setSessaoForm({ ...sessaoForm, instrutorCpf: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Local</label>
              <Input value={sessaoForm.local} onChange={e => setSessaoForm({ ...sessaoForm, local: e.target.value })}
                placeholder="ex.: Refeitório / Pátio / Sala de treinamento" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Observações</label>
              <Textarea rows={2} value={sessaoForm.observacoes} onChange={e => setSessaoForm({ ...sessaoForm, observacoes: e.target.value })} />
            </div>
            <p className="text-xs text-slate-500 italic">
              Você poderá adicionar a lista de presença depois de criar a sessão.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSessao(false)}>Cancelar</Button>
            <Button onClick={handleSalvarSessao} disabled={criarSessaoMut.isPending}>
              {criarSessaoMut.isPending ? "Criando..." : "Criar sessão"}
            </Button>
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
