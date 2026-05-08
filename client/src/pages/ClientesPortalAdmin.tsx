import { useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Mail, KeyRound, Send, Search, MessageSquare, Star,
  Loader2, ShieldCheck, CheckCircle2, AlertCircle, Copy, Reply,
  Smile, Frown, TrendingUp, Users, Plus, Trash2, RefreshCw, UserPlus,
  Lock, UnlockKeyhole,
} from "lucide-react";

const fmtBR = (s?: string | null) => (s ? s.split("T")[0].split("-").reverse().join("/") : "—");
const fmtCNPJ = (v?: string) => {
  if (!v) return "";
  const d = v.replace(/\D/g, "");
  if (d.length === 14) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
  if (d.length === 11) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
  return v;
};

const LIMITE_SUGERIDO = 4;

export default function ClientesPortalAdmin() {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId) : 0;
  const [tab, setTab] = useState<"acessos" | "comentarios" | "avaliacoes">("acessos");
  const [busca, setBusca] = useState("");

  const utils = trpc.useUtils();
  const { data: clientesList = [], isLoading: loadingClientes } = trpc.clientes.list.useQuery({ companyId }, { enabled: !!companyId });
  const { data: acessos = [] } = trpc.portalExterno.admin.listarAcessosCliente.useQuery({ companyId }, { enabled: !!companyId });
  const { data: comentarios = [], isLoading: loadingCom } = trpc.portalExterno.admin.listarComentariosCliente.useQuery({ companyId }, { enabled: !!companyId && tab === "comentarios" });
  const { data: dashAval, isLoading: loadingAval } = trpc.portalExterno.admin.dashboardAvaliacoesCliente.useQuery({ companyId }, { enabled: !!companyId && tab === "avaliacoes" });

  // Map cliente -> lista de acessos (múltiplos)
  const acessosPorCliente = useMemo(() => {
    const m = new Map<number, any[]>();
    for (const a of acessos as any[]) {
      if (!a.clienteId) continue;
      const arr = m.get(a.clienteId) || [];
      arr.push(a);
      m.set(a.clienteId, arr);
    }
    return m;
  }, [acessos]);

  const totalAcessosAtivos = (acessos as any[]).filter((a) => a.ativo === 1).length;

  // ===== Modal Gerenciar acessos =====
  const [gerenciarTarget, setGerenciarTarget] = useState<any | null>(null);
  const [novoNome, setNovoNome] = useState("");
  const [novoEmail, setNovoEmail] = useState("");
  const [enviarEmail, setEnviarEmail] = useState(true);
  const [resultadoAcesso, setResultadoAcesso] = useState<any | null>(null);

  const gerarMut = trpc.portalExterno.admin.gerarAcessoCliente.useMutation({
    onSuccess: (r) => {
      setResultadoAcesso(r);
      utils.portalExterno.admin.listarAcessosCliente.invalidate();
      setNovoNome(""); setNovoEmail("");
      if (r.acao === "reenviado") {
        toast.success(r.emailEnviado ? `Acesso atualizado e e-mail reenviado para ${r.emailDestino}` : "Acesso atualizado");
      } else {
        toast.success(r.emailEnviado ? `Acesso criado e e-mail enviado para ${r.emailDestino}` : "Acesso criado");
      }
    },
    onError: (e) => toast.error(e.message),
  });
  const desativarMut = trpc.portalExterno.admin.desativarAcesso.useMutation({
    onSuccess: () => { toast.success("Acesso desativado"); utils.portalExterno.admin.listarAcessosCliente.invalidate(); },
  });
  const reativarMut = trpc.portalExterno.admin.reativarAcessoCliente.useMutation({
    onSuccess: () => { toast.success("Acesso reativado"); utils.portalExterno.admin.listarAcessosCliente.invalidate(); },
  });
  const removerMut = trpc.portalExterno.admin.removerAcessoCliente.useMutation({
    onSuccess: () => { toast.success("Acesso removido"); utils.portalExterno.admin.listarAcessosCliente.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  // ===== Responder comentário =====
  const [respondendo, setRespondendo] = useState<any | null>(null);
  const [respMsg, setRespMsg] = useState("");
  const responderMut = trpc.portalExterno.admin.responderComentarioCliente.useMutation({
    onSuccess: () => {
      toast.success("Resposta enviada ao cliente");
      setRespondendo(null); setRespMsg("");
      utils.portalExterno.admin.listarComentariosCliente.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  // ===== Filtragem clientes =====
  const filtrados = useMemo(() => (clientesList as any[]).filter((c) => {
    const t = busca.toLowerCase();
    if (!t) return true;
    const acs = acessosPorCliente.get(c.id) || [];
    return [
      c.razaoSocial, c.nomeFantasia, c.cnpj, c.cpf, c.contatoEmail, c.email,
      ...acs.flatMap((a: any) => [a.nomeResponsavel, a.emailResponsavel]),
    ].some((v) => v?.toLowerCase().includes(t));
  }), [clientesList, busca, acessosPorCliente]);

  const naoLidos = useMemo(() => (comentarios as any[]).filter((c) => c.autorTipo === "cliente" && !c.lidoEm).length, [comentarios]);

  const acessosDoTarget: any[] = useMemo(() => {
    if (!gerenciarTarget) return [];
    return acessosPorCliente.get(gerenciarTarget.id) || [];
  }, [gerenciarTarget, acessosPorCliente]);
  const ativosDoTarget = acessosDoTarget.filter((a) => a.ativo === 1).length;
  const atingiuLimite = ativosDoTarget >= LIMITE_SUGERIDO;

  const abrirGerenciar = (c: any) => {
    setGerenciarTarget(c);
    setResultadoAcesso(null);
    setNovoNome(c.contatoNome || "");
    setNovoEmail(c.contatoEmail || c.email || "");
    setEnviarEmail(true);
  };

  return (
    <DashboardLayout>
      <div className="p-5 max-w-7xl mx-auto">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-11 h-11 rounded-xl bg-blue-600 flex items-center justify-center text-white">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Portal do Cliente — Administração</h1>
            <p className="text-xs text-slate-500">Gere acessos (até {LIMITE_SUGERIDO} usuários por cliente), responda comentários e acompanhe a satisfação (NPS) dos clientes.</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b mb-5">
          {[
            { k: "acessos", label: "Acessos", icon: KeyRound, badge: null },
            { k: "comentarios", label: "Comentários", icon: MessageSquare, badge: naoLidos > 0 ? naoLidos : null },
            { k: "avaliacoes", label: "Avaliações (NPS)", icon: Star, badge: null },
          ].map((t) => {
            const Icon = t.icon as any;
            const active = tab === t.k;
            return (
              <button key={t.k} onClick={() => setTab(t.k as any)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition ${active ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
                <Icon className="w-4 h-4" /> {t.label}
                {t.badge != null && <Badge className="bg-rose-500 text-white">{t.badge}</Badge>}
              </button>
            );
          })}
        </div>

        {/* TAB ACESSOS */}
        {tab === "acessos" && (
          <div>
            <div className="flex items-center justify-between mb-4 gap-2">
              <div className="relative w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input className="pl-9" placeholder="Buscar por nome, CNPJ, e-mail..." value={busca} onChange={(e) => setBusca(e.target.value)} />
              </div>
              <div className="text-xs text-slate-500">
                {totalAcessosAtivos} acesso(s) ativo(s) · {clientesList.length} cliente(s) cadastrado(s)
              </div>
            </div>
            {loadingClientes ? (
              <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>
            ) : (
              <div className="bg-white border rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-2.5">Cliente</th>
                      <th className="px-4 py-2.5">CNPJ/CPF</th>
                      <th className="px-4 py-2.5">Usuários do portal</th>
                      <th className="px-4 py-2.5">Último login</th>
                      <th className="px-4 py-2.5 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filtrados.map((c: any) => {
                      const acs = acessosPorCliente.get(c.id) || [];
                      const ativos = acs.filter((a: any) => a.ativo === 1);
                      const ultimoLogin = acs
                        .map((a: any) => a.ultimoLogin)
                        .filter(Boolean)
                        .sort()
                        .reverse()[0];
                      return (
                        <tr key={c.id} className="hover:bg-slate-50">
                          <td className="px-4 py-2.5">
                            <div className="font-medium text-slate-800">{c.razaoSocial}</div>
                            {c.nomeFantasia && <div className="text-xs text-slate-500">{c.nomeFantasia}</div>}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-xs">{fmtCNPJ(c.cnpj || c.cpf) || <span className="text-slate-400">—</span>}</td>
                          <td className="px-4 py-2.5">
                            {acs.length === 0 ? (
                              <Badge variant="outline" className="text-slate-500">Sem acesso</Badge>
                            ) : (
                              <div className="flex items-center gap-2">
                                <Badge className={ativos.length === 0 ? "bg-rose-500" : ativos.length >= LIMITE_SUGERIDO ? "bg-amber-500" : "bg-emerald-600"}>
                                  {ativos.length}/{LIMITE_SUGERIDO} ativos
                                </Badge>
                                {acs.length > ativos.length && (
                                  <span className="text-xs text-slate-400">({acs.length - ativos.length} inativo{acs.length - ativos.length > 1 ? "s" : ""})</span>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-slate-600">{ultimoLogin ? fmtBR(ultimoLogin) : "—"}</td>
                          <td className="px-4 py-2.5 text-right">
                            <Button size="sm" variant="outline" onClick={() => abrirGerenciar(c)} className="gap-1.5">
                              <Users className="w-3.5 h-3.5" /> Gerenciar acessos
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                    {filtrados.length === 0 && (
                      <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Nenhum cliente.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB COMENTÁRIOS */}
        {tab === "comentarios" && (
          <div>
            {loadingCom ? <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div> : (
              comentarios.length === 0 ? (
                <div className="bg-white border rounded-xl p-12 text-center text-slate-400">
                  <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Nenhum comentário recebido ainda.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {(comentarios as any[]).map((m) => {
                    const isCli = m.autorTipo === "cliente";
                    const cli = (clientesList as any[]).find((c) => c.id === m.clienteId);
                    return (
                      <div key={m.id} className={`bg-white border rounded-xl p-4 ${isCli && !m.lidoEm ? "border-l-4 border-l-rose-500" : ""}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                              <Badge className={isCli ? "bg-blue-600" : "bg-emerald-600"}>{isCli ? "Cliente" : "FC"}</Badge>
                              <span className="font-semibold text-slate-700">{cli?.razaoSocial || m.autorNome}</span>
                              <span>·</span>
                              <span>{fmtBR(m.criadoEm)}</span>
                              {isCli && !m.lidoEm && <Badge className="bg-rose-500">Não lido</Badge>}
                            </div>
                            <p className="text-sm text-slate-700 whitespace-pre-wrap">{m.mensagem}</p>
                          </div>
                          {isCli && (
                            <Button size="sm" variant="outline" onClick={() => { setRespondendo({ ...m, clienteRazao: cli?.razaoSocial }); setRespMsg(""); }} className="gap-1.5 shrink-0">
                              <Reply className="w-3.5 h-3.5" /> Responder
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            )}
          </div>
        )}

        {/* TAB AVALIAÇÕES */}
        {tab === "avaliacoes" && (
          <div>
            {loadingAval ? <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div> : !dashAval || dashAval.total === 0 ? (
              <div className="bg-white border rounded-xl p-12 text-center text-slate-400">
                <Star className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Nenhuma avaliação recebida ainda.</p>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="grid md:grid-cols-4 gap-3">
                  <div className="bg-white border rounded-xl p-4">
                    <div className="text-xs text-slate-500">Respostas</div>
                    <div className="text-3xl font-bold text-slate-800 mt-1">{dashAval.total}</div>
                    <Users className="w-5 h-5 text-blue-500 mt-1" />
                  </div>
                  <div className={`rounded-xl p-4 text-white ${dashAval.nps == null ? "bg-slate-400" : dashAval.nps >= 50 ? "bg-emerald-600" : dashAval.nps >= 0 ? "bg-amber-500" : "bg-rose-600"}`}>
                    <div className="text-xs opacity-90">NPS</div>
                    <div className="text-3xl font-bold mt-1">{dashAval.nps ?? "—"}</div>
                    <TrendingUp className="w-5 h-5 mt-1 opacity-80" />
                  </div>
                  <div className="bg-white border rounded-xl p-4">
                    <div className="text-xs text-slate-500">Média geral</div>
                    <div className="text-3xl font-bold text-slate-800 mt-1">{dashAval.medias.geral ?? "—"}</div>
                    <Star className="w-5 h-5 text-amber-500 mt-1" />
                  </div>
                  <div className="bg-white border rounded-xl p-4">
                    <div className="text-xs text-slate-500">Promotores · Neutros · Detratores</div>
                    <div className="text-lg font-bold text-slate-800 mt-1 flex gap-2">
                      <span className="text-emerald-600">{dashAval.promotores}</span>·
                      <span className="text-amber-600">{dashAval.neutros}</span>·
                      <span className="text-rose-600">{dashAval.detratores}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-white border rounded-xl p-4">
                  <h3 className="font-semibold text-slate-800 mb-3">Médias por critério (0–10)</h3>
                  <div className="grid md:grid-cols-5 gap-3 text-sm">
                    {[
                      { k: "equipe", label: "Equipe FC" }, { k: "obra", label: "Obra" },
                      { k: "atendimento", label: "Atendimento" }, { k: "prazo", label: "Prazos" },
                      { k: "qualidade", label: "Qualidade" },
                    ].map((c) => {
                      const v = (dashAval.medias as any)[c.k];
                      const cor = v == null ? "bg-slate-200" : v >= 8 ? "bg-emerald-500" : v >= 6 ? "bg-amber-500" : "bg-rose-500";
                      return (
                        <div key={c.k}>
                          <div className="flex justify-between text-xs text-slate-500"><span>{c.label}</span><span className="font-bold text-slate-700">{v ?? "—"}</span></div>
                          <div className="h-2 bg-slate-100 rounded-full mt-1 overflow-hidden">
                            <div className={cor} style={{ width: `${(v ?? 0) * 10}%`, height: "100%" }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-white border rounded-xl p-4">
                  <h3 className="font-semibold text-slate-800 mb-3">Por obra</h3>
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase text-slate-500">
                      <tr><th className="py-2">Obra</th><th>Respostas</th><th>Média geral</th><th>NPS</th></tr>
                    </thead>
                    <tbody className="divide-y">
                      {dashAval.porObra.map((o, i) => (
                        <tr key={i}>
                          <td className="py-2 font-medium">{o.obraNome}</td>
                          <td>{o.respostas}</td>
                          <td>{o.mediaGeral}</td>
                          <td><Badge className={o.nps == null ? "bg-slate-400" : o.nps >= 50 ? "bg-emerald-500" : o.nps >= 0 ? "bg-amber-500" : "bg-rose-500"}>{o.nps ?? "—"}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="bg-white border rounded-xl p-4">
                  <h3 className="font-semibold text-slate-800 mb-3">Comentários anônimos recentes</h3>
                  <div className="space-y-2">
                    {dashAval.avaliacoes.filter((a: any) => a.comentarioPositivo || a.comentarioMelhoria).slice(0, 30).map((a: any) => (
                      <div key={a.id} className="border rounded-lg p-3">
                        <div className="text-xs text-slate-500 mb-1 flex items-center gap-2">
                          {a.obraNome && <span className="font-medium text-slate-700">{a.obraNome}</span>}
                          <span>· {fmtBR(a.criadoEm)}</span>
                          <span>· Nota geral: <b className={a.notaGeral >= 9 ? "text-emerald-600" : a.notaGeral <= 6 ? "text-rose-600" : "text-amber-600"}>{a.notaGeral}</b></span>
                        </div>
                        {a.comentarioPositivo && <p className="text-sm text-emerald-700"><Smile className="inline w-4 h-4 mr-1" />{a.comentarioPositivo}</p>}
                        {a.comentarioMelhoria && <p className="text-sm text-rose-700 mt-1"><Frown className="inline w-4 h-4 mr-1" />{a.comentarioMelhoria}</p>}
                      </div>
                    ))}
                    {dashAval.avaliacoes.filter((a: any) => a.comentarioPositivo || a.comentarioMelhoria).length === 0 && (
                      <p className="text-sm text-slate-400 text-center py-4">Nenhum comentário escrito ainda.</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Modal: Gerenciar acessos do cliente */}
        <Dialog open={!!gerenciarTarget} onOpenChange={(o) => { if (!o) { setGerenciarTarget(null); setResultadoAcesso(null); } }}>
          <DialogContent className="max-w-3xl bg-white p-0 overflow-hidden gap-0">
            {gerenciarTarget && (() => {
              const submitNovo = () => {
                if (!novoNome.trim()) { toast.error("Informe o nome do usuário"); return; }
                if (!novoEmail.trim() || !/.+@.+\..+/.test(novoEmail)) { toast.error("Informe um e-mail válido"); return; }
                gerarMut.mutate({
                  clienteId: gerenciarTarget.id, companyId,
                  nome: novoNome.trim(), email: novoEmail.trim(), enviarEmail,
                });
              };
              const onKeyDown = (e: React.KeyboardEvent) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey || (e.target as HTMLElement).tagName === "INPUT")) {
                  e.preventDefault(); submitNovo();
                }
              };
              const pct = Math.min(100, (ativosDoTarget / LIMITE_SUGERIDO) * 100);
              const corBarra = ativosDoTarget === 0 ? "bg-slate-300" : ativosDoTarget >= LIMITE_SUGERIDO ? "bg-amber-500" : "bg-emerald-500";
              return (
                <>
                  {/* Header com gradiente */}
                  <div className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white px-6 py-5">
                    <DialogHeader className="space-y-0">
                      <div className="flex items-start gap-3">
                        <div className="w-11 h-11 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center shrink-0">
                          <Users className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <DialogTitle className="text-white text-base font-semibold leading-tight truncate pr-8">
                            {gerenciarTarget.razaoSocial}
                          </DialogTitle>
                          <p className="text-xs text-blue-100 mt-0.5 font-mono">
                            {fmtCNPJ(gerenciarTarget.cnpj || gerenciarTarget.cpf) || <span className="text-rose-200">CNPJ/CPF não cadastrado</span>}
                          </p>
                        </div>
                      </div>
                    </DialogHeader>
                    {/* Contador visual */}
                    <div className="mt-4 flex items-center gap-3">
                      <div className="flex-1">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-blue-100">Usuários ativos no portal</span>
                          <span className="font-bold tabular-nums">{ativosDoTarget} de {LIMITE_SUGERIDO} <span className="opacity-70 font-normal">recomendados</span></span>
                        </div>
                        <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
                          <div className={`h-full ${corBarra} transition-all`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="px-6 py-5 max-h-[65vh] overflow-y-auto space-y-5">
                    {/* Form de cadastro rápido — sempre visível no topo */}
                    <div className="border rounded-xl bg-gradient-to-br from-blue-50/60 to-white p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <UserPlus className="w-4 h-4 text-blue-600" />
                        <h4 className="text-sm font-semibold text-slate-800">Cadastrar novo usuário</h4>
                        {atingiuLimite && (
                          <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50 text-[10px] gap-1">
                            <AlertCircle className="w-3 h-3" /> limite recomendado atingido
                          </Badge>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs text-slate-600">Nome completo</Label>
                          <Input className="mt-1 h-10" autoFocus value={novoNome} onChange={(e) => setNovoNome(e.target.value)}
                            onKeyDown={onKeyDown} placeholder="Ex.: João da Silva" />
                        </div>
                        <div>
                          <Label className="text-xs text-slate-600">E-mail</Label>
                          <Input className="mt-1 h-10" type="email" value={novoEmail} onChange={(e) => setNovoEmail(e.target.value)}
                            onKeyDown={onKeyDown} placeholder="usuario@empresa.com" />
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-3 mt-3 flex-wrap">
                        <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
                          <input type="checkbox" checked={enviarEmail} onChange={(e) => setEnviarEmail(e.target.checked)} className="rounded" />
                          <Mail className="w-3.5 h-3.5 text-slate-400" />
                          Enviar e-mail de boas-vindas com a senha provisória
                        </label>
                        <Button onClick={submitNovo} disabled={gerarMut.isPending} className="bg-blue-600 hover:bg-blue-700 gap-2 h-9">
                          {gerarMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                          Adicionar acesso
                        </Button>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-2">Dica: pressione <kbd className="px-1 py-0.5 bg-slate-100 border border-slate-200 rounded text-[10px] font-mono">Enter</kbd> para adicionar rapidamente.</p>

                      {resultadoAcesso && (
                        <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm space-y-1.5 animate-in fade-in slide-in-from-top-1">
                          <div className="flex items-center gap-2 text-emerald-700 font-semibold">
                            <CheckCircle2 className="w-4 h-4" /> Acesso {resultadoAcesso.acao === "reenviado" ? "atualizado" : "criado"} com sucesso!
                          </div>
                          <div className="text-xs flex items-center gap-2 flex-wrap">
                            <b>Senha provisória:</b>
                            <code className="bg-amber-100 px-2 py-0.5 rounded font-mono select-all">{resultadoAcesso.senhaTemporaria}</code>
                            <button onClick={() => { navigator.clipboard.writeText(resultadoAcesso.senhaTemporaria); toast.success("Copiada!"); }}
                              className="text-blue-600 hover:text-blue-800 inline-flex items-center gap-1 text-xs"><Copy className="w-3.5 h-3.5" /> copiar</button>
                          </div>
                          <div className="text-xs text-slate-600">
                            {resultadoAcesso.emailEnviado
                              ? <span className="text-emerald-700">✓ E-mail enviado para {resultadoAcesso.emailDestino}</span>
                              : resultadoAcesso.emailErro
                                ? <span className="text-rose-700">✗ Falha no e-mail: {resultadoAcesso.emailErro}</span>
                                : <span className="text-slate-500">E-mail não enviado (apenas registrado).</span>}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Lista de usuários — cards */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Usuários cadastrados {acessosDoTarget.length > 0 && <span className="text-slate-400 normal-case font-normal">· {acessosDoTarget.length}</span>}
                        </h4>
                      </div>
                      {acessosDoTarget.length === 0 ? (
                        <div className="border border-dashed border-slate-200 rounded-xl p-8 text-center bg-slate-50/50">
                          <Users className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                          <p className="text-sm text-slate-500 font-medium">Nenhum usuário cadastrado ainda</p>
                          <p className="text-xs text-slate-400 mt-1">Use o formulário acima para criar o primeiro acesso.</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {acessosDoTarget
                            .slice()
                            .sort((a: any, b: any) => (b.ativo - a.ativo) || (a.id - b.id))
                            .map((a: any) => {
                              const ativo = a.ativo === 1;
                              const aguardando = ativo && a.primeiroAcesso === 1;
                              const nome = a.nomeResponsavel || a.emailResponsavel || "Usuário";
                              const iniciais = nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p: string) => p[0]?.toUpperCase()).join("") || "?";
                              const corAvatar = ativo
                                ? aguardando ? "bg-amber-500" : "bg-emerald-600"
                                : "bg-slate-400";
                              return (
                                <div key={a.id} className={`border rounded-xl p-3 flex items-center gap-3 transition hover:shadow-sm ${ativo ? "bg-white" : "bg-slate-50/60 opacity-75"}`}>
                                  <div className={`w-10 h-10 rounded-full ${corAvatar} text-white flex items-center justify-center text-sm font-semibold shrink-0`}>
                                    {iniciais}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-semibold text-slate-800 truncate">{a.nomeResponsavel || <span className="italic text-slate-400">sem nome</span>}</span>
                                      {ativo
                                        ? (aguardando
                                          ? <Badge className="bg-amber-500 text-[10px]">Aguardando 1º acesso</Badge>
                                          : <Badge className="bg-emerald-600 text-[10px]">Ativo</Badge>)
                                        : <Badge variant="outline" className="text-rose-600 border-rose-200 text-[10px]">Inativo</Badge>}
                                    </div>
                                    <div className="text-xs text-slate-500 flex items-center gap-3 mt-0.5 flex-wrap">
                                      <span className="inline-flex items-center gap-1 truncate"><Mail className="w-3 h-3" />{a.emailResponsavel || "—"}</span>
                                      <span className="inline-flex items-center gap-1 text-slate-400">
                                        último login: {a.ultimoLogin ? fmtBR(a.ultimoLogin) : "nunca"}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    {ativo ? (
                                      <>
                                        <Button size="icon" variant="ghost" className="h-8 w-8 text-blue-600 hover:bg-blue-50" title="Reenviar senha provisória"
                                          disabled={gerarMut.isPending}
                                          onClick={() => {
                                            if (!a.emailResponsavel) { toast.error("Acesso sem e-mail cadastrado."); return; }
                                            if (!confirm(`Gerar nova senha provisória e reenviar para ${a.emailResponsavel}?`)) return;
                                            gerarMut.mutate({
                                              clienteId: gerenciarTarget.id, companyId,
                                              nome: a.nomeResponsavel || "Usuário",
                                              email: a.emailResponsavel,
                                              enviarEmail: true,
                                            });
                                          }}>
                                          <RefreshCw className="w-4 h-4" />
                                        </Button>
                                        <Button size="icon" variant="ghost" className="h-8 w-8 text-amber-600 hover:bg-amber-50" title="Desativar"
                                          onClick={() => { if (confirm("Desativar este acesso? O usuário não conseguirá mais entrar.")) desativarMut.mutate({ id: a.id }); }}>
                                          <Lock className="w-4 h-4" />
                                        </Button>
                                      </>
                                    ) : (
                                      <Button size="icon" variant="ghost" className="h-8 w-8 text-emerald-700 hover:bg-emerald-50" title="Reativar"
                                        onClick={() => reativarMut.mutate({ id: a.id, companyId })}>
                                        <UnlockKeyhole className="w-4 h-4" />
                                      </Button>
                                    )}
                                    <Button size="icon" variant="ghost" className="h-8 w-8 text-rose-600 hover:bg-rose-50" title="Remover definitivamente"
                                      onClick={() => { if (confirm("Remover este acesso DEFINITIVAMENTE? Esta ação não pode ser desfeita.")) removerMut.mutate({ id: a.id, companyId }); }}>
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="border-t bg-slate-50 px-6 py-3 flex justify-end">
                    <Button variant="outline" onClick={() => { setGerenciarTarget(null); setResultadoAcesso(null); }}>Fechar</Button>
                  </div>
                </>
              );
            })()}
          </DialogContent>
        </Dialog>

        {/* Modal: Responder comentário */}
        <Dialog open={!!respondendo} onOpenChange={(o) => { if (!o) setRespondendo(null); }}>
          <DialogContent className="max-w-lg bg-white">
            <DialogHeader><DialogTitle>Responder ao cliente</DialogTitle></DialogHeader>
            {respondendo && (
              <div className="space-y-3">
                <div className="bg-slate-50 rounded-lg p-3 text-sm">
                  <div className="text-xs text-slate-500 mb-1">{respondendo.clienteRazao} · {fmtBR(respondendo.criadoEm)}</div>
                  <p className="text-slate-700 whitespace-pre-wrap">{respondendo.mensagem}</p>
                </div>
                <textarea value={respMsg} onChange={(e) => setRespMsg(e.target.value)} rows={5}
                  className="w-full border rounded-md px-3 py-2 text-sm resize-none" placeholder="Escreva sua resposta..." />
                <DialogFooter>
                  <Button variant="outline" onClick={() => setRespondendo(null)}>Cancelar</Button>
                  <Button onClick={() => responderMut.mutate({ companyId, clienteId: respondendo.clienteId, obraId: respondendo.obraId ?? null, mensagem: respMsg.trim() })}
                    disabled={!respMsg.trim() || responderMut.isPending} className="bg-blue-600 hover:bg-blue-700 gap-2">
                    <Send className="w-4 h-4" /> Enviar resposta
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
