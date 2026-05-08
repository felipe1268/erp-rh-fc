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
  Lock, UnlockKeyhole, SlidersHorizontal, ExternalLink,
} from "lucide-react";
import { PORTAL_CLIENTE_ABAS, parseAbasLiberadas, ABA_OBRIGATORIA, type PortalClienteAbaKey } from "@shared/portalClienteAbas";

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
  const setAbasMut = trpc.portalExterno.admin.setAbasLiberadasCliente.useMutation({
    onSuccess: () => { toast.success("Abas atualizadas"); utils.portalExterno.admin.listarAcessosCliente.invalidate(); setAbasTarget(null); },
    onError: (e) => toast.error(e.message),
  });

  // ===== Modal: liberar abas do Portal por usuário =====
  const [abasTarget, setAbasTarget] = useState<any | null>(null);
  const [abasSel, setAbasSel] = useState<Set<PortalClienteAbaKey>>(new Set());
  const [abasPicker, setAbasPicker] = useState<{ cliente: any; usuarios: any[] } | null>(null);
  const abrirAbas = (a: any) => {
    setAbasTarget(a);
    setAbasSel(new Set(parseAbasLiberadas(a.abasLiberadas)));
  };
  const toggleAba = (k: PortalClienteAbaKey) => {
    if (k === ABA_OBRIGATORIA) return;
    setAbasSel((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };

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
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-slate-800">Portal do Cliente — Administração</h1>
            <p className="text-xs text-slate-500">Gere acessos (até {LIMITE_SUGERIDO} usuários por cliente), responda comentários e acompanhe a satisfação (NPS) dos clientes.</p>
          </div>
          <a href="/portal/cliente/login" target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold shadow-sm shrink-0"
            title="Abrir o Portal do Cliente em nova aba">
            <ExternalLink className="w-4 h-4" />
            Abrir Portal do Cliente
          </a>
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
                            <div className="flex items-center justify-end gap-1.5">
                              {ativos.length > 0 && (
                                <Button size="sm" variant="outline"
                                  onClick={() => {
                                    if (ativos.length === 1) abrirAbas(ativos[0]);
                                    else setAbasPicker({ cliente: c, usuarios: ativos });
                                  }}
                                  className="gap-1.5 text-indigo-700 border-indigo-200 hover:bg-indigo-50"
                                  title="Liberar abas do Portal por usuário"
                                >
                                  <SlidersHorizontal className="w-3.5 h-3.5" /> Abas
                                </Button>
                              )}
                              <Button size="sm" variant="outline" onClick={() => abrirGerenciar(c)} className="gap-1.5">
                                <Users className="w-3.5 h-3.5" /> Gerenciar acessos
                              </Button>
                            </div>
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
          <DialogContent
            resizable={false}
            className="!max-w-none w-[98vw] h-[96vh] xl:w-[95vw] xl:h-[92vh] bg-white p-0 overflow-hidden gap-0 flex flex-col"
            style={{ width: "98vw", maxWidth: "98vw", height: "96vh" }}
          >
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
                  <div className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white px-8 py-5 shrink-0">
                    <DialogHeader className="space-y-0">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center shrink-0">
                          <Users className="w-6 h-6" />
                        </div>
                        <div className="flex-1 min-w-0 pr-10">
                          <p className="text-[11px] text-blue-100 uppercase tracking-wider font-semibold mb-0.5">Acessos do Portal do Cliente</p>
                          <DialogTitle className="text-white text-lg font-semibold leading-tight truncate">
                            {gerenciarTarget.razaoSocial}
                          </DialogTitle>
                          <p className="text-xs text-blue-100 mt-1 font-mono">
                            {fmtCNPJ(gerenciarTarget.cnpj || gerenciarTarget.cpf) || <span className="text-rose-200">CNPJ/CPF não cadastrado</span>}
                          </p>
                        </div>
                        <div className="hidden sm:flex flex-col items-end shrink-0 min-w-[200px]">
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-3xl font-bold tabular-nums leading-none">{ativosDoTarget}</span>
                            <span className="text-sm text-blue-100">/ {LIMITE_SUGERIDO}</span>
                          </div>
                          <p className="text-[10px] text-blue-100 uppercase tracking-wider mt-1">usuários ativos</p>
                          <div className="h-1.5 w-full bg-white/20 rounded-full overflow-hidden mt-2">
                            <div className={`h-full ${corBarra} transition-all`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      </div>
                    </DialogHeader>
                  </div>

                  {/* Conteúdo: 2 colunas em telas grandes */}
                  <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[360px_minmax(0,1fr)] xl:grid-cols-[420px_minmax(0,1fr)] gap-0 overflow-hidden">
                    {/* COLUNA ESQUERDA: cadastro */}
                    <div className="border-r bg-slate-50/40 p-6 overflow-y-auto">
                      <div className="flex items-center gap-2 mb-4">
                        <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                          <UserPlus className="w-4 h-4 text-blue-700" />
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold text-slate-800">Cadastrar novo usuário</h4>
                          <p className="text-[11px] text-slate-500">Os campos são salvos imediatamente.</p>
                        </div>
                      </div>

                      {atingiuLimite && (
                        <div className="mb-3 bg-amber-50 border border-amber-200 rounded-lg p-2.5 flex items-start gap-2 text-xs text-amber-800">
                          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                          <div>Limite recomendado de {LIMITE_SUGERIDO} acessos atingido. Você ainda pode adicionar mais — desative algum se preferir.</div>
                        </div>
                      )}

                      <div className="space-y-3">
                        <div>
                          <Label className="text-xs text-slate-600 font-medium">Nome completo *</Label>
                          <Input className="mt-1 h-10 bg-white" autoFocus value={novoNome} onChange={(e) => setNovoNome(e.target.value)}
                            onKeyDown={onKeyDown} placeholder="Ex.: João da Silva" />
                        </div>
                        <div>
                          <Label className="text-xs text-slate-600 font-medium">E-mail *</Label>
                          <Input className="mt-1 h-10 bg-white" type="email" value={novoEmail} onChange={(e) => setNovoEmail(e.target.value)}
                            onKeyDown={onKeyDown} placeholder="usuario@empresa.com" />
                        </div>

                        <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer select-none bg-white border rounded-lg p-2.5 hover:bg-slate-50">
                          <input type="checkbox" checked={enviarEmail} onChange={(e) => setEnviarEmail(e.target.checked)} className="rounded mt-0.5" />
                          <div className="flex-1">
                            <div className="font-medium flex items-center gap-1.5"><Mail className="w-3.5 h-3.5 text-slate-500" /> Enviar e-mail de boas-vindas</div>
                            <div className="text-[11px] text-slate-500 mt-0.5">O usuário receberá a senha provisória por e-mail.</div>
                          </div>
                        </label>

                        <Button onClick={submitNovo} disabled={gerarMut.isPending} className="bg-blue-600 hover:bg-blue-700 gap-2 h-11 w-full text-sm">
                          {gerarMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                          Adicionar acesso
                        </Button>
                        <p className="text-[11px] text-slate-400 text-center">Dica: pressione <kbd className="px-1 py-0.5 bg-white border border-slate-200 rounded text-[10px] font-mono">Enter</kbd> em qualquer campo para adicionar.</p>
                      </div>

                      {resultadoAcesso && (
                        <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm space-y-2 animate-in fade-in slide-in-from-top-1">
                          <div className="flex items-center gap-2 text-emerald-700 font-semibold">
                            <CheckCircle2 className="w-4 h-4" /> Acesso {resultadoAcesso.acao === "reenviado" ? "atualizado" : "criado"}!
                          </div>
                          <div className="text-xs">
                            <div className="text-slate-600 mb-1">Senha provisória:</div>
                            <div className="flex items-center gap-2">
                              <code className="bg-amber-100 border border-amber-200 px-2 py-1 rounded font-mono text-sm select-all flex-1">{resultadoAcesso.senhaTemporaria}</code>
                              <button onClick={() => { navigator.clipboard.writeText(resultadoAcesso.senhaTemporaria); toast.success("Copiada!"); }}
                                className="text-blue-600 hover:bg-blue-50 inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-blue-200">
                                <Copy className="w-3.5 h-3.5" /> copiar
                              </button>
                            </div>
                          </div>
                          <div className="text-xs">
                            {resultadoAcesso.emailEnviado
                              ? <span className="text-emerald-700">✓ E-mail enviado para {resultadoAcesso.emailDestino}</span>
                              : resultadoAcesso.emailErro
                                ? <span className="text-rose-700">✗ Falha no e-mail: {resultadoAcesso.emailErro}</span>
                                : <span className="text-slate-500">E-mail não enviado (apenas registrado).</span>}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* COLUNA DIREITA: lista */}
                    <div className="p-6 overflow-y-auto">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h4 className="text-sm font-semibold text-slate-800">Usuários cadastrados</h4>
                          <p className="text-[11px] text-slate-500">{acessosDoTarget.length} no total · {ativosDoTarget} ativo{ativosDoTarget === 1 ? "" : "s"}</p>
                        </div>
                      </div>

                      {acessosDoTarget.length === 0 ? (
                        <div className="border border-dashed border-slate-200 rounded-xl p-12 text-center bg-slate-50/50">
                          <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                          <p className="text-sm text-slate-500 font-medium">Nenhum usuário cadastrado ainda</p>
                          <p className="text-xs text-slate-400 mt-1">Use o formulário ao lado para criar o primeiro acesso.</p>
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
                                <div key={a.id} className={`border rounded-xl p-4 flex items-center gap-4 transition hover:shadow-md hover:border-slate-300 ${ativo ? "bg-white" : "bg-slate-50/60 opacity-75"}`}>
                                  <div className={`w-12 h-12 rounded-full ${corAvatar} text-white flex items-center justify-center text-base font-semibold shrink-0`}>
                                    {iniciais}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-semibold text-slate-800 text-sm truncate">{a.nomeResponsavel || <span className="italic text-slate-400">sem nome</span>}</span>
                                      {ativo
                                        ? (aguardando
                                          ? <Badge className="bg-amber-500 text-[10px]">Aguardando 1º acesso</Badge>
                                          : <Badge className="bg-emerald-600 text-[10px]">Ativo</Badge>)
                                        : <Badge variant="outline" className="text-rose-600 border-rose-200 text-[10px]">Inativo</Badge>}
                                    </div>
                                    <div className="text-xs text-slate-500 flex items-center gap-4 mt-1 flex-wrap">
                                      <span className="inline-flex items-center gap-1 truncate"><Mail className="w-3 h-3 text-slate-400" />{a.emailResponsavel || "—"}</span>
                                      <span className="inline-flex items-center gap-1 text-slate-400">
                                        último login: {a.ultimoLogin ? fmtBR(a.ultimoLogin) : "nunca"}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    {ativo && (
                                      <Button size="icon" variant="ghost" className="h-9 w-9 text-indigo-600 hover:bg-indigo-50" title="Liberar abas do Portal"
                                        onClick={() => abrirAbas(a)}>
                                        <SlidersHorizontal className="w-4 h-4" />
                                      </Button>
                                    )}
                                    {ativo ? (
                                      <>
                                        <Button size="icon" variant="ghost" className="h-9 w-9 text-blue-600 hover:bg-blue-50" title="Reenviar senha provisória"
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
                                        <Button size="icon" variant="ghost" className="h-9 w-9 text-amber-600 hover:bg-amber-50" title="Desativar"
                                          onClick={() => { if (confirm("Desativar este acesso? O usuário não conseguirá mais entrar.")) desativarMut.mutate({ id: a.id }); }}>
                                          <Lock className="w-4 h-4" />
                                        </Button>
                                      </>
                                    ) : (
                                      <Button size="icon" variant="ghost" className="h-9 w-9 text-emerald-700 hover:bg-emerald-50" title="Reativar"
                                        onClick={() => reativarMut.mutate({ id: a.id, companyId })}>
                                        <UnlockKeyhole className="w-4 h-4" />
                                      </Button>
                                    )}
                                    <Button size="icon" variant="ghost" className="h-9 w-9 text-rose-600 hover:bg-rose-50" title="Remover definitivamente"
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

                  <div className="border-t bg-slate-50 px-6 py-3 flex items-center justify-between shrink-0">
                    <p className="text-xs text-slate-500">Limite recomendado: <b>{LIMITE_SUGERIDO}</b> acessos por cliente.</p>
                    <Button variant="outline" onClick={() => { setGerenciarTarget(null); setResultadoAcesso(null); }}>Fechar</Button>
                  </div>
                </>
              );
            })()}
          </DialogContent>
        </Dialog>

        {/* Modal: Picker — escolher usuário para liberar abas (atalho da lista de clientes) */}
        <Dialog open={!!abasPicker} onOpenChange={(o) => { if (!o) setAbasPicker(null); }}>
          <DialogContent className="max-w-lg bg-white">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <SlidersHorizontal className="w-5 h-5 text-indigo-600" />
                Liberar abas — escolha o usuário
              </DialogTitle>
            </DialogHeader>
            {abasPicker && (
              <div className="space-y-2">
                <div className="bg-slate-50 rounded-lg p-3 text-sm">
                  <div className="font-semibold text-slate-800">{abasPicker.cliente.razaoSocial}</div>
                  {abasPicker.cliente.nomeFantasia && <div className="text-xs text-slate-500">{abasPicker.cliente.nomeFantasia}</div>}
                </div>
                <p className="text-xs text-slate-500">Selecione o usuário ativo para configurar quais abas ele verá no Portal:</p>
                <div className="space-y-1.5 max-h-[55vh] overflow-y-auto">
                  {abasPicker.usuarios.map((u: any) => {
                    const liber = parseAbasLiberadas(u.abasLiberadas);
                    return (
                      <button key={u.id}
                        onClick={() => { setAbasPicker(null); abrirAbas(u); }}
                        className="w-full text-left border rounded-lg p-3 hover:bg-indigo-50 hover:border-indigo-200 transition flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="font-medium text-slate-800 truncate">{u.nomeResponsavel || u.emailResponsavel}</div>
                          <div className="text-xs text-slate-500 truncate">{u.emailResponsavel}</div>
                        </div>
                        <Badge variant="outline" className="shrink-0 text-[10px]">{liber.length} aba{liber.length === 1 ? "" : "s"}</Badge>
                      </button>
                    );
                  })}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setAbasPicker(null)}>Fechar</Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Modal: Liberar abas do Portal por usuário */}
        <Dialog open={!!abasTarget} onOpenChange={(o) => { if (!o) setAbasTarget(null); }}>
          <DialogContent className="bg-white p-0 gap-0 flex flex-col !max-w-none w-screen h-screen !rounded-none !translate-x-0 !translate-y-0 !top-0 !left-0 sm:!max-w-none"
            style={{ width: "100vw", height: "100vh", maxWidth: "100vw", maxHeight: "100vh", top: 0, left: 0, transform: "none", borderRadius: 0 }}>
            <DialogHeader className="px-6 py-4 border-b shrink-0">
              <DialogTitle className="flex items-center gap-2 text-lg">
                <SlidersHorizontal className="w-5 h-5 text-indigo-600" />
                Abas liberadas no Portal do Cliente
              </DialogTitle>
            </DialogHeader>
            {abasTarget && (
              <div className="flex flex-col flex-1 min-h-0 px-6 py-4 gap-3">
                <div className="bg-slate-50 rounded-lg p-3 text-sm flex flex-wrap items-center justify-between gap-2 shrink-0">
                  <div>
                    <div className="font-semibold text-slate-800">{abasTarget.nomeResponsavel || abasTarget.emailResponsavel}</div>
                    <div className="text-xs text-slate-500">{abasTarget.emailResponsavel}</div>
                  </div>
                  <Badge variant="outline" className="text-xs">{abasSel.size} de {PORTAL_CLIENTE_ABAS.length} abas selecionadas</Badge>
                </div>
                <p className="text-xs text-slate-500 shrink-0">
                  Selecione quais abas este usuário verá ao abrir uma obra (<b>/portal/cliente/obra/...</b>).
                  A aba <b>Visão Geral</b> é obrigatória — sem ela o usuário não vê nada da obra clicada.
                </p>
                <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 flex-1 overflow-y-auto pr-1 content-start">
                  {PORTAL_CLIENTE_ABAS.map((aba) => {
                    const checked = abasSel.has(aba.key);
                    const obrig = aba.key === ABA_OBRIGATORIA;
                    return (
                      <label key={aba.key}
                        className={`flex items-start gap-2 border rounded-lg p-2.5 cursor-pointer text-sm transition ${checked ? "bg-indigo-50 border-indigo-200" : "bg-white hover:bg-slate-50"} ${obrig ? "opacity-90" : ""}`}>
                        <input type="checkbox" className="mt-0.5" checked={checked} disabled={obrig} onChange={() => toggleAba(aba.key)} />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-slate-800 flex items-center gap-1.5 flex-wrap">
                            {aba.label}
                            {obrig && <Badge variant="outline" className="text-[9px]">obrigatória</Badge>}
                            {aba.status === "em_breve" && <Badge className="bg-amber-500 text-[9px]">em breve</Badge>}
                          </div>
                          {aba.status === "em_breve" && (
                            <div className="text-[10px] text-slate-500 mt-0.5">Aba liberável; conteúdo será disponibilizado em revisões futuras.</div>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
            <DialogFooter className="gap-2 px-6 py-4 border-t bg-slate-50 shrink-0 flex-row flex-wrap">
              <Button variant="outline" size="sm" onClick={() => setAbasSel(new Set(PORTAL_CLIENTE_ABAS.map((a) => a.key)))}>Selecionar todas</Button>
              <Button variant="outline" size="sm" onClick={() => setAbasSel(new Set([ABA_OBRIGATORIA]))}>Apenas a obrigatória</Button>
              <div className="flex-1" />
              <Button variant="outline" onClick={() => setAbasTarget(null)}>Cancelar</Button>
              <Button onClick={() => abasTarget && setAbasMut.mutate({ id: abasTarget.id, companyId, abas: Array.from(abasSel) })}
                disabled={setAbasMut.isPending || !abasTarget} className="bg-indigo-600 hover:bg-indigo-700 gap-2">
                {setAbasMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Salvar
              </Button>
            </DialogFooter>
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
