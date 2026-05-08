import { useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  UserCheck, Mail, KeyRound, Send, Search, MessageSquare, Star,
  Loader2, ShieldCheck, CheckCircle2, AlertCircle, Copy, Reply,
  Smile, Meh, Frown, TrendingUp, Users,
} from "lucide-react";

const fmtBR = (s?: string | null) => (s ? s.split("T")[0].split("-").reverse().join("/") : "—");
const fmtCNPJ = (v?: string) => {
  if (!v) return "";
  const d = v.replace(/\D/g, "");
  if (d.length === 14) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
  if (d.length === 11) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
  return v;
};

export default function ClientesPortalAdmin() {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId) : 0;
  const [tab, setTab] = useState<"acessos" | "comentarios" | "avaliacoes">("acessos");
  const [busca, setBusca] = useState("");

  const utils = trpc.useUtils();
  const { data: clientesList = [], isLoading: loadingClientes } = trpc.clientes.list.useQuery({ companyId }, { enabled: !!companyId });
  const { data: acessos = [], isLoading: loadingAcessos } = trpc.portalExterno.admin.listarAcessosCliente.useQuery({ companyId }, { enabled: !!companyId });
  const { data: comentarios = [], isLoading: loadingCom } = trpc.portalExterno.admin.listarComentariosCliente.useQuery({ companyId }, { enabled: !!companyId && tab === "comentarios" });
  const { data: dashAval, isLoading: loadingAval } = trpc.portalExterno.admin.dashboardAvaliacoesCliente.useQuery({ companyId }, { enabled: !!companyId && tab === "avaliacoes" });

  // Map cliente -> acesso
  const acessoPorCliente = useMemo(() => {
    const m = new Map<number, any>();
    for (const a of acessos as any[]) if (a.clienteId) m.set(a.clienteId, a);
    return m;
  }, [acessos]);

  // ===== Gerar acesso =====
  const [gerarTarget, setGerarTarget] = useState<any | null>(null);
  const [resultadoAcesso, setResultadoAcesso] = useState<any | null>(null);
  const gerarMut = trpc.portalExterno.admin.gerarAcessoCliente.useMutation({
    onSuccess: (r) => {
      setResultadoAcesso(r);
      utils.portalExterno.admin.listarAcessosCliente.invalidate();
      if (r.emailEnviado) toast.success(`Acesso gerado e e-mail enviado para ${r.emailDestino}`);
      else if (r.emailErro) toast.warning(`Acesso gerado, mas falha no e-mail: ${r.emailErro}`);
      else toast.success("Acesso gerado com sucesso");
    },
    onError: (e) => toast.error(e.message),
  });
  const desativarMut = trpc.portalExterno.admin.desativarAcesso.useMutation({
    onSuccess: () => { toast.success("Acesso desativado"); utils.portalExterno.admin.listarAcessosCliente.invalidate(); },
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
    return !t || [c.razaoSocial, c.nomeFantasia, c.cnpj, c.cpf, c.contatoEmail, c.email].some((v) => v?.toLowerCase().includes(t));
  }), [clientesList, busca]);

  const naoLidos = useMemo(() => (comentarios as any[]).filter((c) => c.autorTipo === "cliente" && !c.lidoEm).length, [comentarios]);

  return (
    <DashboardLayout>
      <div className="p-5 max-w-7xl mx-auto">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-11 h-11 rounded-xl bg-blue-600 flex items-center justify-center text-white">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Portal do Cliente — Administração</h1>
            <p className="text-xs text-slate-500">Gere acessos, responda comentários e acompanhe a satisfação (NPS) dos clientes.</p>
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
                {acessos.length} acesso(s) ativo(s) · {clientesList.length} cliente(s) cadastrado(s)
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
                      <th className="px-4 py-2.5">E-mail contato</th>
                      <th className="px-4 py-2.5">Status acesso</th>
                      <th className="px-4 py-2.5">Último login</th>
                      <th className="px-4 py-2.5 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filtrados.map((c: any) => {
                      const a = acessoPorCliente.get(c.id);
                      return (
                        <tr key={c.id} className="hover:bg-slate-50">
                          <td className="px-4 py-2.5">
                            <div className="font-medium text-slate-800">{c.razaoSocial}</div>
                            {c.nomeFantasia && <div className="text-xs text-slate-500">{c.nomeFantasia}</div>}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-xs">{fmtCNPJ(c.cnpj || c.cpf)}</td>
                          <td className="px-4 py-2.5 text-xs">{c.contatoEmail || c.email || <span className="text-slate-400">—</span>}</td>
                          <td className="px-4 py-2.5">
                            {!a ? <Badge variant="outline" className="text-slate-500">Sem acesso</Badge>
                              : a.ativo === 1
                                ? (a.primeiroAcesso === 1
                                  ? <Badge className="bg-amber-500">Aguardando 1º acesso</Badge>
                                  : <Badge className="bg-emerald-500">Ativo</Badge>)
                                : <Badge variant="outline" className="text-rose-500 border-rose-300">Inativo</Badge>}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-slate-600">{a?.ultimoLogin ? fmtBR(a.ultimoLogin) : "—"}</td>
                          <td className="px-4 py-2.5 text-right">
                            <div className="flex justify-end gap-2">
                              <Button size="sm" variant="outline" onClick={() => { setGerarTarget(c); setResultadoAcesso(null); }} className="gap-1.5">
                                <Send className="w-3.5 h-3.5" /> {a ? "Reenviar" : "Gerar acesso"}
                              </Button>
                              {a && a.ativo === 1 && (
                                <Button size="sm" variant="outline" onClick={() => { if (confirm("Desativar acesso deste cliente?")) desativarMut.mutate({ id: a.id }); }} className="text-rose-600 border-rose-200 hover:bg-rose-50">
                                  Desativar
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {filtrados.length === 0 && (
                      <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Nenhum cliente.</td></tr>
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

        {/* Modal: Gerar acesso */}
        <Dialog open={!!gerarTarget} onOpenChange={(o) => { if (!o) { setGerarTarget(null); setResultadoAcesso(null); } }}>
          <DialogContent className="max-w-md bg-white">
            <DialogHeader><DialogTitle>Gerar acesso ao Portal do Cliente</DialogTitle></DialogHeader>
            {gerarTarget && !resultadoAcesso && (
              <div className="space-y-3 text-sm">
                <p>Será gerada uma senha provisória para <b>{gerarTarget.razaoSocial}</b> e enviada por e-mail.</p>
                <div className="bg-slate-50 rounded-lg p-3 space-y-1 text-xs">
                  <div><b>Identificador:</b> {fmtCNPJ(gerarTarget.cnpj || gerarTarget.cpf) || <span className="text-rose-600">não cadastrado</span>}</div>
                  <div><b>E-mail destino:</b> {gerarTarget.contatoEmail || gerarTarget.email || <span className="text-rose-600">não cadastrado</span>}</div>
                </div>
                {(!gerarTarget.contatoEmail && !gerarTarget.email) && (
                  <div className="bg-amber-50 border border-amber-200 rounded p-2 text-xs text-amber-800 flex gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> Cadastre um e-mail no cliente antes de enviar boas-vindas.
                  </div>
                )}
                <DialogFooter>
                  <Button variant="outline" onClick={() => setGerarTarget(null)}>Cancelar</Button>
                  <Button onClick={() => gerarMut.mutate({ clienteId: gerarTarget.id, companyId, enviarEmail: true })}
                    disabled={gerarMut.isPending} className="bg-blue-600 hover:bg-blue-700 gap-2">
                    {gerarMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                    Gerar e enviar e-mail
                  </Button>
                </DialogFooter>
              </div>
            )}
            {resultadoAcesso && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-emerald-700"><CheckCircle2 className="w-5 h-5" /> <b>Acesso gerado com sucesso!</b></div>
                <div className="bg-slate-50 rounded-lg p-3 text-sm space-y-1.5">
                  <div><b>Identificador:</b> <span className="font-mono">{resultadoAcesso.identificador}</span></div>
                  <div className="flex items-center gap-2">
                    <b>Senha provisória:</b>
                    <code className="bg-amber-100 px-2 py-0.5 rounded font-mono">{resultadoAcesso.senhaTemporaria}</code>
                    <button onClick={() => { navigator.clipboard.writeText(resultadoAcesso.senhaTemporaria); toast.success("Copiada!"); }}
                      className="text-blue-600 hover:text-blue-800"><Copy className="w-4 h-4" /></button>
                  </div>
                  <div className="text-xs text-slate-600 pt-1 border-t">
                    {resultadoAcesso.emailEnviado
                      ? <span className="text-emerald-700">✓ E-mail de boas-vindas enviado para {resultadoAcesso.emailDestino}</span>
                      : resultadoAcesso.emailErro
                        ? <span className="text-rose-700">✗ Falha ao enviar e-mail: {resultadoAcesso.emailErro}</span>
                        : <span className="text-slate-500">E-mail não enviado.</span>}
                  </div>
                </div>
                <DialogFooter><Button onClick={() => { setGerarTarget(null); setResultadoAcesso(null); }} className="bg-blue-600 hover:bg-blue-700">Fechar</Button></DialogFooter>
              </div>
            )}
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
