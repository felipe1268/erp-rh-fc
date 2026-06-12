import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Mail, KeyRound, Send, Search, MessageSquare, Star,
  Loader2, ShieldCheck, CheckCircle2, AlertCircle, Copy, Reply,
  Smile, Frown, Meh, TrendingUp, Users, Plus, Trash2, RefreshCw, UserPlus,
  Lock, UnlockKeyhole, SlidersHorizontal, ExternalLink, Layers,
  Building2, ThumbsUp, X, CalendarDays, Pencil, ChevronUp, ChevronDown, ChevronRight, ListOrdered,
  HardHat, MapPin, Globe2,
} from "lucide-react";
import {
  PORTAL_CLIENTE_ABAS, parseAbasLiberadas, ABA_OBRIGATORIA, type PortalClienteAbaKey,
  PORTAL_CLIENTE_MODULOS, parseModulosLiberados, MODULO_OBRIGATORIO, type PortalClienteModuloKey,
  parseObrasLiberadas,
} from "@shared/portalClienteAbas";

const fmtBR = (s?: string | null) => (s ? s.split(/[T ]/)[0].split("-").reverse().join("/") : "—");
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
  // Aba inicial via deep-link (?tab=) OU navegação pela sidebar (_navParams).
  const readNavTab = (): "acessos" | "comentarios" | "avaliacoes" => {
    if (typeof window === "undefined") return "acessos";
    const stored = sessionStorage.getItem("_navParams");
    const params = stored ? new URLSearchParams(stored) : new URLSearchParams(window.location.search);
    const t = params.get("tab");
    return t === "avaliacoes" || t === "comentarios" ? t : "acessos";
  };
  const [tab, setTab] = useState<"acessos" | "comentarios" | "avaliacoes">(readNavTab);
  // Sincroniza com cliques na sidebar (sessionStorage._navParams + evento) e deep-link.
  const applyNavParams = useCallback(() => {
    const stored = sessionStorage.getItem("_navParams");
    const params = stored ? new URLSearchParams(stored) : new URLSearchParams(window.location.search);
    const t = params.get("tab");
    if (stored) sessionStorage.removeItem("_navParams");
    if (t === "avaliacoes" || t === "comentarios" || t === "acessos") setTab(t);
  }, []);
  useEffect(() => { applyNavParams(); }, [applyNavParams]);
  useEffect(() => {
    const handler = () => applyNavParams();
    window.addEventListener("navParamsUpdated", handler);
    return () => window.removeEventListener("navParamsUpdated", handler);
  }, [applyNavParams]);
  const [busca, setBusca] = useState("");

  const utils = trpc.useUtils();
  const { user } = useAuth();
  const isMaster = user?.role === "admin_master";
  const { data: clientesList = [], isLoading: loadingClientes } = trpc.clientes.list.useQuery({ companyId }, { enabled: !!companyId });
  const { data: acessos = [] } = trpc.portalExterno.admin.listarAcessosCliente.useQuery({ companyId }, { enabled: !!companyId });
  const { data: comentarios = [], isLoading: loadingCom } = trpc.portalExterno.admin.listarComentariosCliente.useQuery({ companyId }, { enabled: !!companyId && tab === "comentarios" });
  // Rev. 1569 — agrupamento por período (mês/ano) controlado pela UI
  const [agruparPor, setAgruparPor] = useState<"mes" | "ano">("mes");
  const { data: dashAval, isLoading: loadingAval } = trpc.portalExterno.admin.dashboardAvaliacoesCliente.useQuery(
    { companyId, agruparPor },
    { enabled: !!companyId && tab === "avaliacoes" },
  );
  const { data: portalCfg } = trpc.portalExterno.admin.getPortalClienteConfig.useQuery(
    { companyId }, { enabled: !!companyId && tab === "avaliacoes" },
  );
  const periodicidadeAtual = portalCfg?.periodicidade ?? "mensal";
  const setPeriodicidadeMut = trpc.portalExterno.admin.setPortalClienteConfig.useMutation({
    onSuccess: () => {
      toast.success("Periodicidade atualizada");
      utils.portalExterno.admin.getPortalClienteConfig.invalidate();
      utils.portalExterno.admin.dashboardAvaliacoesCliente.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  // Rev. 2890 — Gerar link público de avaliação (NPS) p/ enviar ao cliente.
  // Rev. 2892 — link SEPARADO POR OBRA: seletor opcional de obra embutida no token.
  const [linkAvaliacao, setLinkAvaliacao] = useState<string>("");
  const [linksAvaliacao, setLinksAvaliacao] = useState<string[]>([]);
  const [linkObraNome, setLinkObraNome] = useState<string | null>(null);
  const [linkObraId, setLinkObraId] = useState<number | "">("");
  // Rev. 2973 — quantos links DE USO ÚNICO gerar de uma vez (cada link = 1 avaliação).
  const [linkQtd, setLinkQtd] = useState<number | "">(1);
  const obrasEmpresa = trpc.portalExterno.admin.obrasDaEmpresaAdmin.useQuery(
    { companyId: companyId ?? 0 },
    { enabled: !!companyId },
  );
  const gerarLinkAvalMut = trpc.portalExterno.admin.gerarLinkAvaliacao.useMutation({
    onSuccess: (r) => {
      const tokens = (r as any).tokens?.length ? (r as any).tokens as string[] : [r.token];
      const urls = tokens.map((t) => `${window.location.origin}/portal/avaliacao/${t}`);
      setLinksAvaliacao(urls);
      setLinkAvaliacao(urls[0]);
      setLinkObraNome(r.obraNome ?? null);
      if (urls.length === 1) {
        navigator.clipboard?.writeText(urls[0]).then(
          () => toast.success("Link gerado e copiado para a área de transferência!"),
          () => toast.success("Link de avaliação gerado!"),
        );
      } else {
        toast.success(`${urls.length} links de uso único gerados!`);
      }
    },
    onError: (e) => toast.error(e.message),
  });
  // Rev. 1569 — cancelar avaliação (Admin Master)
  const cancelarAvalMut = trpc.portalExterno.admin.cancelarAvaliacaoCliente.useMutation({
    onSuccess: () => {
      toast.success("Avaliação cancelada. O cliente já pode registrar uma nova.");
      utils.portalExterno.admin.dashboardAvaliacoesCliente.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const cancelarAvaliacao = (a: any) => {
    const motivo = window.prompt(
      "Cancelar esta avaliação?\n\nIsso libera o cliente para enviar uma nova avaliação no mesmo período.\n\nMotivo (opcional):",
      "",
    );
    if (motivo === null) return;
    cancelarAvalMut.mutate({ id: a.id, companyId, motivo: motivo || undefined });
  };

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
  const liberarAvalCredMut = trpc.portalExterno.admin.liberarAvaliacaoCredAtual.useMutation({
    onSuccess: (r) => {
      const periodo = r.periodicidade === "anual" ? "ano" : "mês";
      toast.success(r.jaEstavaLiberado
        ? `Este usuário já podia avaliar neste ${periodo}.`
        : `Avaliação liberada — o usuário pode enviar uma nova neste ${periodo}.`);
    },
    onError: (e) => toast.error(e.message),
  });
  const removerMut = trpc.portalExterno.admin.removerAcessoCliente.useMutation({
    onSuccess: () => { toast.success("Acesso removido"); utils.portalExterno.admin.listarAcessosCliente.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  // Rev. 1574 — edição de nome/e-mail
  const [editTarget, setEditTarget] = useState<any | null>(null);
  const [editNome, setEditNome] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const atualizarMut = trpc.portalExterno.admin.atualizarAcessoCliente.useMutation({
    onSuccess: () => {
      toast.success("Acesso atualizado");
      utils.portalExterno.admin.listarAcessosCliente.invalidate();
      setEditTarget(null);
    },
    onError: (e) => toast.error(e.message),
  });
  const abrirEditar = (a: any) => {
    setEditTarget(a);
    setEditNome(a.nomeResponsavel || "");
    setEditEmail(a.emailResponsavel || "");
  };
  const submitEditar = () => {
    if (!editTarget) return;
    if (editNome.trim().length < 2) { toast.error("Informe o nome completo"); return; }
    if (!/^\S+@\S+\.\S+$/.test(editEmail.trim())) { toast.error("E-mail inválido"); return; }
    atualizarMut.mutate({ id: editTarget.id, companyId, nome: editNome.trim(), email: editEmail.trim() });
  };
  const setAbasMut = trpc.portalExterno.admin.setAbasLiberadasCliente.useMutation({
    onSuccess: () => { toast.success("Abas atualizadas"); utils.portalExterno.admin.listarAcessosCliente.invalidate(); setAbasTarget(null); },
    onError: (e) => toast.error(e.message),
  });

  // ===== Modal: liberar módulos + abas do Portal por usuário =====
  // Rev. 1603 — Admin master pode REORDENAR módulos e abas; a ordem
  // gravada no servidor é usada como padrão no Portal do Cliente.
  // Por isso usamos arrays (ordenados) ao invés de Sets.
  const [abasTarget, setAbasTarget] = useState<any | null>(null);
  const [abasSel, setAbasSel] = useState<PortalClienteAbaKey[]>([]);
  const [modSel, setModSel] = useState<PortalClienteModuloKey[]>([]);
  const [abasPicker, setAbasPicker] = useState<{ cliente: any; usuarios: any[] } | null>(null);
  // Rev. 1606 — modal de confirmação para "Liberar avaliação" (substitui o
  // confirm() nativo que mostrava o domínio do Replit feio no topo).
  const [confirmLiberarAval, setConfirmLiberarAval] = useState<{ credId: number; nome: string; email: string } | null>(null);
  const abrirAbas = (a: any) => {
    setAbasTarget(a);
    setAbasSel(parseAbasLiberadas(a.abasLiberadas));
    setModSel(parseModulosLiberados(a.abasLiberadas));
  };

  // ===== Modal: obras liberadas por usuário (Rev. 2851) =====
  const [obrasTarget, setObrasTarget] = useState<any | null>(null);
  const [obrasModo, setObrasModo] = useState<"todas" | "custom">("todas");
  const [obrasSel, setObrasSel] = useState<number[]>([]);
  const obrasDoCliente = trpc.portalExterno.admin.obrasDoClienteAdmin.useQuery(
    { companyId, clienteId: obrasTarget?.clienteId ?? 0 },
    { enabled: !!companyId && !!obrasTarget?.clienteId },
  );
  const setObrasMut = trpc.portalExterno.admin.setObrasLiberadasCliente.useMutation({
    onSuccess: () => { toast.success("Obras liberadas atualizadas"); utils.portalExterno.admin.listarAcessosCliente.invalidate(); setObrasTarget(null); },
    onError: (e) => toast.error(e.message),
  });
  const abrirObras = (a: any) => {
    const wl = parseObrasLiberadas(a.obrasLiberadas); // null = todas
    setObrasTarget(a);
    setObrasModo(wl === null ? "todas" : "custom");
    setObrasSel(wl === null ? [] : wl);
  };
  const toggleObra = (id: number) => {
    setObrasSel((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };
  const salvarObras = () => {
    if (!obrasTarget) return;
    const obraIds = obrasModo === "todas" ? null : obrasSel;
    setObrasMut.mutate({ id: obrasTarget.id, companyId, obraIds });
  };
  const toggleAba = (k: PortalClienteAbaKey) => {
    if (k === ABA_OBRIGATORIA) return;
    setAbasSel((prev) => prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]);
  };
  const toggleModulo = (k: PortalClienteModuloKey) => {
    if (k === MODULO_OBRIGATORIO) return;
    setModSel((prev) => prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]);
  };
  const moveItem = <T,>(arr: T[], idx: number, dir: -1 | 1): T[] => {
    const next = [...arr];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return arr;
    [next[idx], next[j]] = [next[j], next[idx]];
    return next;
  };
  const moverAba = (idx: number, dir: -1 | 1) => setAbasSel((prev) => moveItem(prev, idx, dir));
  const moverModulo = (idx: number, dir: -1 | 1) => setModSel((prev) => moveItem(prev, idx, dir));
  const planejamentoLiberado = modSel.includes("mod_planejamento");
  // Itens não selecionados (mostrados abaixo dos selecionados, sem ordem)
  const abasNaoSel = useMemo(
    () => PORTAL_CLIENTE_ABAS.filter((a) => !abasSel.includes(a.key)),
    [abasSel],
  );
  const modulosNaoSel = useMemo(
    () => PORTAL_CLIENTE_MODULOS.filter((m) => !modSel.includes(m.key)),
    [modSel],
  );

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

  // Rev. 1594 — Apagar mensagem (somente Admin Master)
  const deletarComentarioMut = trpc.portalExterno.admin.deletarComentarioCliente.useMutation({
    onSuccess: () => {
      toast.success("Mensagem apagada");
      utils.portalExterno.admin.listarComentariosCliente.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const handleDeletarComentario = (m: any) => {
    const previa = (m.mensagem || "").trim().slice(0, 80);
    if (!confirm(`Apagar esta mensagem?\n\n"${previa}${(m.mensagem || "").length > 80 ? "…" : ""}"\n\nEsta ação é permanente e não pode ser desfeita.`)) return;
    deletarComentarioMut.mutate({ id: m.id, companyId });
  };

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
                                  title="Liberar módulos e abas do Portal por usuário"
                                >
                                  <SlidersHorizontal className="w-3.5 h-3.5" /> Módulos & Abas
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
                          <div className="flex items-center gap-2 shrink-0">
                            {isCli && (
                              <Button size="sm" variant="outline" onClick={() => { setRespondendo({ ...m, clienteRazao: cli?.razaoSocial }); setRespMsg(""); }} className="gap-1.5">
                                <Reply className="w-3.5 h-3.5" /> Responder
                              </Button>
                            )}
                            {isMaster && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleDeletarComentario(m)}
                                disabled={deletarComentarioMut.isPending}
                                className="gap-1.5 text-rose-600 hover:bg-rose-50 hover:text-rose-700 border-rose-200"
                                title="Apagar mensagem (Admin Master)"
                              >
                                <Trash2 className="w-3.5 h-3.5" /> Apagar
                              </Button>
                            )}
                          </div>
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
          <div className="space-y-4">
            {/* Rev. 1569 — Configuração de periodicidade + agrupador de período */}
            <div className="bg-white border rounded-xl p-4 flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-slate-500" />
                <span className="text-sm font-medium text-slate-700">Periodicidade da avaliação:</span>
                <div className="inline-flex border rounded-lg overflow-hidden">
                  {[
                    { v: "mensal", label: "Mês a mês" },
                    { v: "anual", label: "Ano a ano" },
                  ].map((o) => {
                    const sel = periodicidadeAtual === o.v;
                    return (
                      <button key={o.v}
                        onClick={() => setPeriodicidadeMut.mutate({ companyId, periodicidade: o.v as "mensal" | "anual" })}
                        disabled={setPeriodicidadeMut.isPending || !isMaster}
                        title={isMaster ? "" : "Apenas Admin Master pode alterar a periodicidade"}
                        className={`px-3 py-1.5 text-xs font-semibold transition ${sel ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"} ${!isMaster ? "opacity-60 cursor-not-allowed" : ""}`}
                      >
                        {o.label}
                      </button>
                    );
                  })}
                </div>
                <span className="text-xs text-slate-400">
                  Limite anônimo de 1 envio por {periodicidadeAtual === "anual" ? "ano" : "mês"} por usuário.
                  {!isMaster && " (alteração restrita ao Admin Master)"}
                </span>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <span className="text-sm text-slate-700">Visualizar por:</span>
                <div className="inline-flex border rounded-lg overflow-hidden">
                  {[
                    { v: "mes", label: "Mês" },
                    { v: "ano", label: "Ano" },
                  ].map((o) => {
                    const sel = agruparPor === o.v;
                    return (
                      <button key={o.v} onClick={() => setAgruparPor(o.v as "mes" | "ano")}
                        className={`px-3 py-1.5 text-xs font-semibold transition ${sel ? "bg-slate-800 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
                      >
                        {o.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Rev. 2890 — Link público de avaliação p/ enviar direto ao cliente (sem login) */}
            <div className="bg-white border rounded-xl p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <Send className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-medium text-slate-700">Link de avaliação (sem login)</span>
                </div>
                <span className="text-xs text-slate-400">
                  Gere um link público p/ enviar ao cliente responder a pesquisa de satisfação direto, sem precisar de acesso ao portal. Validade de 180 dias.
                </span>
                {/* Rev. 2892 — seletor de obra: o link gerado fica TRAVADO nessa obra */}
                <select
                  value={linkObraId}
                  onChange={(e) => setLinkObraId(e.target.value ? Number(e.target.value) : "")}
                  className="border rounded-md px-2 py-1.5 text-sm bg-white max-w-[220px]"
                  title="Obra à qual o link será vinculado"
                >
                  <option value="" disabled>Selecione a obra…</option>
                  {(obrasEmpresa.data ?? [])
                    .filter((o: any) => String(o.status ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "_") === "em_andamento")
                    .map((o: any) => (
                      <option key={o.id} value={o.id}>{o.nome}</option>
                    ))}
                </select>
                {/* Rev. 2973 — quantos links DE USO ÚNICO gerar (cada link = 1 avaliação) */}
                <div className="flex items-center gap-1.5">
                  <label className="text-xs text-slate-500 whitespace-nowrap" title="Cada link permite apenas UMA avaliação. Gere vários para enviar a avaliadores diferentes da mesma obra.">
                    Qtd. de links
                  </label>
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    value={linkQtd}
                    onChange={(e) => {
                      // Rev. 2975 — permite APAGAR o campo (string vazia) enquanto digita;
                      // o clamp 1–50 só acontece no blur/submit (antes voltava p/ 1 na hora).
                      const raw = e.target.value;
                      if (raw === "") { setLinkQtd(""); return; }
                      const n = Math.floor(Number(raw));
                      setLinkQtd(Number.isFinite(n) ? Math.min(50, Math.max(1, n)) : "");
                    }}
                    onBlur={() => {
                      setLinkQtd((q) => (typeof q === "number" && q >= 1 ? Math.min(50, q) : 1));
                    }}
                    className="w-16 text-sm"
                    title="Cada link permite apenas UMA avaliação"
                  />
                </div>
                <Button
                  onClick={() => companyId && linkObraId !== "" && gerarLinkAvalMut.mutate({ companyId, obraId: linkObraId, quantidade: typeof linkQtd === "number" && linkQtd >= 1 ? Math.min(50, linkQtd) : 1 })}
                  disabled={gerarLinkAvalMut.isPending || !companyId || linkObraId === ""}
                  size="sm"
                  className="ml-auto gap-1.5 bg-blue-600 hover:bg-blue-700"
                >
                  {gerarLinkAvalMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
                  {typeof linkQtd === "number" && linkQtd > 1 ? `Gerar ${linkQtd} links` : "Gerar link"}
                </Button>
              </div>
              {linkAvaliacao && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-slate-600 w-full">
                    {linkObraNome ? <>Link vinculado à obra: <b className="text-slate-800">{linkObraNome}</b></> : "Link de avaliação gerado"}
                  </span>
                  {/* Rev. 2973 — cada link é DE USO ÚNICO (1 avaliação) */}
                  <span className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-0.5 w-full">
                    {(linksAvaliacao.length || 1) > 1
                      ? `${linksAvaliacao.length} links gerados — cada um permite apenas UMA avaliação. Envie um para cada avaliador.`
                      : "Este link permite apenas UMA avaliação."}
                  </span>
                  <div className="flex flex-col gap-2 w-full">
                    {(linksAvaliacao.length ? linksAvaliacao : [linkAvaliacao]).map((url, idx) => (
                      <div key={url} className="flex flex-wrap items-center gap-2">
                        {(linksAvaliacao.length || 1) > 1 && (
                          <span className="text-xs font-semibold text-slate-500 w-6 text-right">{idx + 1}.</span>
                        )}
                        <Input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="flex-1 min-w-[260px] text-xs font-mono" />
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          onClick={() => navigator.clipboard?.writeText(url).then(
                            () => toast.success("Link copiado!"),
                            () => toast.error("Não foi possível copiar"),
                          )}
                        >
                          <Copy className="w-4 h-4" /> Copiar
                        </Button>
                        <a href={url} target="_blank" rel="noopener noreferrer">
                          <Button variant="outline" size="sm" className="gap-1.5">
                            <ExternalLink className="w-4 h-4" /> Abrir
                          </Button>
                        </a>
                        {/* Rev. 2969 — compartilhar via WhatsApp com mensagem cordial pronta */}
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5 text-green-700 border-green-300 hover:bg-green-50"
                          onClick={() => {
                            const msg =
                              `Olá! Tudo bem? 😊\n\n` +
                              `Aqui é da *FC Engenharia*. Antes de tudo, queremos agradecer muito pela confiança em nosso trabalho${linkObraNome ? ` na obra ${linkObraNome}` : ""} — é um prazer ter você como nosso cliente.\n\n` +
                              `A sua opinião é o que nos move a melhorar a cada dia. Por isso, gostaríamos de convidá-lo(a) a compartilhar como tem sido a sua experiência com a nossa equipe.\n\n` +
                              `A avaliação é bem rapidinha (leva só alguns minutos), totalmente anônima e nos ajuda demais a evoluir e a oferecer um serviço cada vez melhor para você.\n\n` +
                              `Quando puder, é só acessar por aqui:\n${url}\n\n` +
                              `Muito obrigado pelo seu tempo e pela parceria! Conte sempre conosco. 🤝`;
                            window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank", "noopener,noreferrer");
                          }}
                        >
                          <MessageSquare className="w-4 h-4" /> WhatsApp
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

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

                {/* Recomendação (clássica NPS: Sim · Talvez · Não) */}
                {dashAval.recomendacao && dashAval.recomendacao.total > 0 && (
                  <div className="bg-white border rounded-xl p-4">
                    <h3 className="font-semibold text-slate-800 mb-3">Recomendaria a FC para outras empresas?</h3>
                    <div className="grid grid-cols-3 gap-3 text-sm">
                      <div className="rounded-lg border-2 border-emerald-200 bg-emerald-50 p-3 text-center">
                        <Smile className="w-5 h-5 text-emerald-600 mx-auto mb-1" />
                        <div className="text-2xl font-bold text-emerald-700">{dashAval.recomendacao.sim}</div>
                        <div className="text-[11px] uppercase tracking-wide text-emerald-700">Sim</div>
                      </div>
                      <div className="rounded-lg border-2 border-amber-200 bg-amber-50 p-3 text-center">
                        <Meh className="w-5 h-5 text-amber-600 mx-auto mb-1" />
                        <div className="text-2xl font-bold text-amber-700">{dashAval.recomendacao.talvez}</div>
                        <div className="text-[11px] uppercase tracking-wide text-amber-700">Talvez</div>
                      </div>
                      <div className="rounded-lg border-2 border-rose-200 bg-rose-50 p-3 text-center">
                        <Frown className="w-5 h-5 text-rose-600 mx-auto mb-1" />
                        <div className="text-2xl font-bold text-rose-700">{dashAval.recomendacao.nao}</div>
                        <div className="text-[11px] uppercase tracking-wide text-rose-700">Não</div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="bg-white border rounded-xl p-4">
                  <h3 className="font-semibold text-slate-800 mb-3">Médias por critério (0–10)</h3>
                  <div className="grid md:grid-cols-4 gap-3 text-sm">
                    {[
                      { k: "equipe", label: "Equipe FC" },
                      { k: "gestor", label: "Gestor responsável" },
                      { k: "empresa", label: "Empresa FC" },
                      { k: "obra", label: "Andamento da obra" },
                      { k: "atendimento", label: "Atendimento" },
                      { k: "prazo", label: "Prazos" },
                      { k: "qualidade", label: "Qualidade" },
                      // Rev. 1592 — Escritório Central
                      { k: "escritorio", label: "Escritório Central" },
                      { k: "faturamento", label: "Faturamento / Contratos" },
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

                {/* Rev. 1595 — Perguntas personalizadas (extras) */}
                {(dashAval as any).perguntasExtras && (dashAval as any).perguntasExtras.length > 0 && (
                  <div className="bg-white border rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <SlidersHorizontal className="w-4 h-4 text-indigo-600" />
                      <h3 className="font-semibold text-slate-800">Perguntas personalizadas</h3>
                      <Badge variant="outline" className="ml-1 text-[10px]">{(dashAval as any).perguntasExtras.length}</Badge>
                    </div>
                    <div className="grid md:grid-cols-2 gap-3">
                      {(dashAval as any).perguntasExtras.map((p: any) => {
                        const isNumero = p.tipo === "nota_0_10" || p.tipo === "sim_nao_talvez";
                        return (
                          <div key={p.id} className="border rounded-lg p-3">
                            <div className="text-xs text-slate-500 mb-1 flex items-center gap-2">
                              <span className="font-medium text-slate-700 truncate">{p.label}</span>
                              {!p.ativa && <Badge variant="outline" className="text-[9px] py-0 px-1 border-slate-300 text-slate-500">inativa</Badge>}
                            </div>
                            {isNumero ? (
                              <div className="flex items-baseline gap-2">
                                <span className="text-2xl font-bold text-indigo-700">{p.media ?? "—"}</span>
                                <span className="text-xs text-slate-500">média · {p.totalRespostas} resposta(s)</span>
                              </div>
                            ) : (
                              <>
                                <p className="text-xs text-slate-500">{p.totalRespostas} resposta(s) de texto</p>
                                {p.respostasTexto && p.respostasTexto.length > 0 && (
                                  <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                                    {p.respostasTexto.slice(0, 5).map((t: string, i: number) => (
                                      <p key={i} className="text-xs text-slate-700 bg-slate-50 rounded px-2 py-1 border">"{t}"</p>
                                    ))}
                                    {p.respostasTexto.length > 5 && (
                                      <p className="text-[11px] text-slate-400">+ {p.respostasTexto.length - 5} resposta(s) adicional(is)</p>
                                    )}
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Rev. 1569 — Visão por período (mês/ano) */}
                {dashAval.porPeriodo && dashAval.porPeriodo.length > 0 && (
                  <div className="bg-white border rounded-xl p-4">
                    <h3 className="font-semibold text-slate-800 mb-3">Por {agruparPor === "ano" ? "ano" : "mês"}</h3>
                    <table className="w-full text-sm">
                      <thead className="text-left text-xs uppercase text-slate-500">
                        <tr><th className="py-2">{agruparPor === "ano" ? "Ano" : "Mês"}</th><th>Respostas</th><th>Média geral</th><th>NPS</th></tr>
                      </thead>
                      <tbody className="divide-y">
                        {dashAval.porPeriodo.map((p: any, i: number) => {
                          const label = agruparPor === "ano"
                            ? p.periodo
                            : (p.periodo && p.periodo.length === 7 ? p.periodo.split("-").reverse().join("/") : p.periodo);
                          return (
                            <tr key={i}>
                              <td className="py-2 font-medium">{label}</td>
                              <td>{p.respostas}</td>
                              <td>{p.mediaGeral ?? "—"}</td>
                              <td><Badge className={p.nps == null ? "bg-slate-400" : p.nps >= 50 ? "bg-emerald-500" : p.nps >= 0 ? "bg-amber-500" : "bg-rose-500"}>{p.nps ?? "—"}</Badge></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="bg-white border rounded-xl p-4">
                  <h3 className="font-semibold text-slate-800 mb-3">Avaliações recebidas (mais recentes)</h3>
                  <p className="text-xs text-slate-500 mb-3">
                    Apenas o <b>Admin Master</b> pode cancelar uma avaliação. Cancelar libera o usuário-cliente para enviar uma nova avaliação no mesmo período.
                    {!isMaster && " Você não tem este perfil — o botão de cancelar está oculto."}
                  </p>
                  <div className="space-y-2">
                    {(dashAval.avaliacoes as any[]).slice(0, 50).map((a: any) => (
                      <div key={a.id} className="border rounded-lg p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-xs text-slate-500 mb-1 flex items-center gap-2 flex-wrap">
                            {a.obraNome && <span className="font-medium text-slate-700">{a.obraNome}</span>}
                            <span>· {fmtBR(a.criadoEm)}</span>
                            <span>· Nota geral: <b className={a.notaGeral >= 9 ? "text-emerald-600" : a.notaGeral <= 6 ? "text-rose-600" : "text-amber-600"}>{a.notaGeral ?? "—"}</b></span>
                            {a.recomendaria != null && (
                              <Badge className={a.recomendaria === 2 ? "bg-emerald-500" : a.recomendaria === 1 ? "bg-amber-500" : "bg-rose-500"}>
                                {a.recomendaria === 2 ? "Recomenda" : a.recomendaria === 1 ? "Talvez recomenda" : "Não recomenda"}
                              </Badge>
                            )}
                            {a.gestorNome && <span className="text-slate-600">· Gestor: <b>{a.gestorNome}</b></span>}
                          </div>
                          {isMaster && (
                            <button
                              onClick={() => cancelarAvaliacao(a)}
                              disabled={cancelarAvalMut.isPending}
                              title="Cancelar avaliação (Admin Master) — libera nova avaliação no mesmo período"
                              className="shrink-0 inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-rose-200 text-rose-600 hover:bg-rose-50"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Cancelar
                            </button>
                          )}
                        </div>
                        {/* Notas detalhadas em badges compactos */}
                        <div className="flex flex-wrap gap-1 mt-1 text-[11px] text-slate-600">
                          {[
                            { k: "notaEquipe", l: "Equipe" }, { k: "notaGestor", l: "Gestor" },
                            { k: "notaEmpresa", l: "Empresa" }, { k: "notaObra", l: "Obra" },
                            { k: "notaAtendimento", l: "Atend." }, { k: "notaPrazo", l: "Prazo" },
                            { k: "notaQualidade", l: "Qualidade" },
                            // Rev. 1592 — Escritório Central
                            { k: "notaEscritorio", l: "Escritório" }, { k: "notaFaturamento", l: "Faturamento" },
                          ].filter((c) => a[c.k] != null).map((c) => (
                            <span key={c.k} className="px-1.5 py-0.5 rounded bg-slate-100 border">{c.l}: <b>{a[c.k]}</b></span>
                          ))}
                        </div>
                        {a.comentarioPositivo && <p className="text-sm text-emerald-700 mt-1"><Smile className="inline w-4 h-4 mr-1" />{a.comentarioPositivo}</p>}
                        {a.comentarioMelhoria && <p className="text-sm text-rose-700 mt-1"><Frown className="inline w-4 h-4 mr-1" />{a.comentarioMelhoria}</p>}
                        {a.comentarioEquipe && <p className="text-sm text-blue-700 mt-1"><Users className="inline w-4 h-4 mr-1" /><b>Equipe:</b> {a.comentarioEquipe}</p>}
                        {a.comentarioGestor && <p className="text-sm text-amber-700 mt-1"><Star className="inline w-4 h-4 mr-1" /><b>Gestor:</b> {a.comentarioGestor}</p>}
                        {a.comentarioEmpresa && <p className="text-sm text-emerald-700 mt-1"><Building2 className="inline w-4 h-4 mr-1" /><b>Empresa:</b> {a.comentarioEmpresa}</p>}
                        {/* Rev. 1592 — comentário do bloco Escritório Central */}
                        {a.comentarioEscritorio && <p className="text-sm text-purple-700 mt-1"><Building2 className="inline w-4 h-4 mr-1" /><b>Escritório:</b> {a.comentarioEscritorio}</p>}
                      </div>
                    ))}
                    {(dashAval.avaliacoes as any[]).length === 0 && (
                      <p className="text-sm text-slate-400 text-center py-4">Nenhuma avaliação registrada ainda.</p>
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
                                    {ativo && (
                                      <Button size="icon" variant="ghost" className="h-9 w-9 text-cyan-700 hover:bg-cyan-50" title="Obras liberadas para este usuário"
                                        onClick={() => abrirObras(a)}>
                                        <HardHat className="w-4 h-4" />
                                      </Button>
                                    )}
                                    {ativo && (
                                      <Button size="icon" variant="ghost" className="h-9 w-9 text-slate-700 hover:bg-slate-100" title="Editar nome / e-mail"
                                        onClick={() => abrirEditar(a)}>
                                        <Pencil className="w-4 h-4" />
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
                                        {isMaster && (
                                          <Button size="icon" variant="ghost" className="h-9 w-9 text-emerald-600 hover:bg-emerald-50" title="Liberar avaliação (Admin Master) — permite ao usuário enviar nova avaliação no período atual"
                                            disabled={liberarAvalCredMut.isPending}
                                            onClick={() => setConfirmLiberarAval({
                                              credId: a.id,
                                              nome: a.nomeResponsavel || "Usuário sem nome",
                                              email: a.emailResponsavel || "",
                                            })}>
                                            <Star className="w-4 h-4" />
                                          </Button>
                                        )}
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

        {/* Modal: Picker — escolher usuário para liberar abas. Rev. 1784 — R-001 full-screen + visual rico. */}
        <Dialog open={!!abasPicker} onOpenChange={(o) => { if (!o) setAbasPicker(null); }}>
          <DialogContent
            resizable={false}
            showCloseButton={false}
            className="w-[100vw] sm:w-[98vw] max-w-none h-[100dvh] sm:h-[96dvh] max-h-[100dvh] sm:max-h-[96dvh] p-0 gap-0 overflow-hidden flex flex-col rounded-none sm:rounded-lg border-0 sm:border bg-white"
          >
            {abasPicker && (
              <>
                {/* Header gradient (R-002) */}
                <div className="bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 text-white p-4 sm:p-6 shrink-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="bg-white/15 backdrop-blur-sm rounded-lg p-2 sm:p-2.5 shrink-0">
                        <SlidersHorizontal className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                      </div>
                      <div className="min-w-0">
                        <DialogHeader className="space-y-0">
                          <DialogTitle className="text-white text-base sm:text-xl font-semibold leading-tight">
                            Liberar módulos &amp; abas
                          </DialogTitle>
                        </DialogHeader>
                        <p className="text-white/80 text-xs sm:text-sm mt-0.5">
                          Escolha o usuário do Portal para configurar quais abas ele verá
                        </p>
                        <div className="mt-2 inline-flex items-center gap-2 bg-white/15 backdrop-blur-sm rounded-md px-2.5 py-1">
                          <Building2 className="w-3.5 h-3.5 text-white/90 shrink-0" />
                          <span className="text-xs sm:text-sm font-medium text-white truncate max-w-[60vw] sm:max-w-[50vw]" title={abasPicker.cliente.razaoSocial}>
                            {abasPicker.cliente.razaoSocial}
                          </span>
                          {abasPicker.cliente.nomeFantasia && (
                            <span className="hidden sm:inline text-xs text-white/70 truncate max-w-[20vw]" title={abasPicker.cliente.nomeFantasia}>
                              · {abasPicker.cliente.nomeFantasia}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAbasPicker(null)}
                      aria-label="Fechar"
                      className="shrink-0 rounded-md p-1.5 hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white/40 transition"
                    >
                      <X className="w-5 h-5 text-white" />
                    </button>
                  </div>
                </div>

                {/* Body — KPI strip + lista de usuários (R-002 + R-004 cards stacked) */}
                <div className="flex-1 overflow-auto p-4 sm:p-6 bg-slate-50/40">
                  {/* KPI strip */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3 mb-4 sm:mb-5">
                    <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-3 sm:p-4">
                      <div className="text-[10px] sm:text-xs text-slate-500 uppercase font-semibold tracking-wide">Usuários ativos</div>
                      <div className="text-xl sm:text-2xl font-bold text-slate-800 tabular-nums mt-0.5">
                        {abasPicker.usuarios.length}
                      </div>
                    </div>
                    <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-3 sm:p-4">
                      <div className="text-[10px] sm:text-xs text-slate-500 uppercase font-semibold tracking-wide">Abas liberadas (total)</div>
                      <div className="text-xl sm:text-2xl font-bold text-indigo-700 tabular-nums mt-0.5">
                        {abasPicker.usuarios.reduce((acc: number, u: any) => acc + parseAbasLiberadas(u.abasLiberadas).length, 0)}
                      </div>
                    </div>
                    <div className="col-span-2 sm:col-span-1 bg-white rounded-lg border border-slate-200 shadow-sm p-3 sm:p-4">
                      <div className="text-[10px] sm:text-xs text-slate-500 uppercase font-semibold tracking-wide">Sem nenhuma aba</div>
                      <div className="text-xl sm:text-2xl font-bold text-amber-700 tabular-nums mt-0.5">
                        {abasPicker.usuarios.filter((u: any) => parseAbasLiberadas(u.abasLiberadas).length === 0).length}
                      </div>
                    </div>
                  </div>

                  <div className="text-sm text-slate-700 mb-3 font-medium">
                    Selecione um usuário para configurar suas abas no Portal:
                  </div>

                  {abasPicker.usuarios.length === 0 ? (
                    <div className="bg-white border border-dashed border-slate-300 rounded-lg p-8 text-center">
                      <Users className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                      <div className="text-sm font-medium text-slate-600">Nenhum usuário ativo encontrado</div>
                      <div className="text-xs text-slate-500 mt-1">Cadastre usuários neste cliente para liberar acesso ao Portal.</div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
                      {abasPicker.usuarios.map((u: any) => {
                        const liber = parseAbasLiberadas(u.abasLiberadas);
                        const initials = (u.nomeResponsavel || u.emailResponsavel || "?")
                          .split(/\s+/).filter(Boolean).slice(0, 2).map((s: string) => s[0]?.toUpperCase()).join("") || "?";
                        const semAbas = liber.length === 0;
                        return (
                          <button
                            key={u.id}
                            type="button"
                            tabIndex={0}
                            role="button"
                            aria-label={`Configurar abas de ${u.nomeResponsavel || u.emailResponsavel}`}
                            onClick={() => { setAbasPicker(null); abrirAbas(u); }}
                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setAbasPicker(null); abrirAbas(u); } }}
                            className="group text-left bg-white border border-slate-200 rounded-lg p-3 sm:p-4 hover:border-indigo-300 hover:shadow-md focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:outline-none transition flex items-center gap-3"
                          >
                            <div className="shrink-0 w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white flex items-center justify-center font-bold text-sm shadow-sm">
                              {initials}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold text-slate-800 truncate text-sm sm:text-base" title={u.nomeResponsavel || u.emailResponsavel}>
                                {u.nomeResponsavel || u.emailResponsavel}
                              </div>
                              <div className="text-xs text-slate-500 truncate" title={u.emailResponsavel}>
                                {u.emailResponsavel}
                              </div>
                              <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] font-bold ${semAbas ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}
                                >
                                  {liber.length} aba{liber.length === 1 ? "" : "s"}
                                </Badge>
                                {semAbas && (
                                  <span className="text-[10px] text-amber-700 font-medium">⚠ sem acesso</span>
                                )}
                              </div>
                            </div>
                            <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-500 shrink-0 transition" />
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="border-t bg-white px-4 sm:px-6 py-3 flex items-center justify-between gap-2 shrink-0">
                  <div className="text-xs text-slate-500 hidden sm:block">
                    Dica: clique em um usuário para abrir o configurador de abas.
                  </div>
                  <Button variant="outline" onClick={() => setAbasPicker(null)} className="ml-auto">
                    Fechar
                  </Button>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Modal: Liberar avaliação NPS — Rev. 1606
            Substitui o confirm() nativo do navegador (que mostrava o domínio
            do Replit "...replit.dev diz" no topo) por um diálogo do sistema
            com cabeçalho âmbar (combina com o ícone Estrela de Avaliação). */}
        <Dialog open={!!confirmLiberarAval} onOpenChange={(o) => { if (!o) setConfirmLiberarAval(null); }}>
          <DialogContent className="bg-white max-w-md p-0 gap-0 overflow-hidden">
            {confirmLiberarAval && (
              <>
                <div className="bg-gradient-to-br from-amber-500 to-orange-500 px-5 py-4 flex items-start gap-3">
                  <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                    <Star className="w-5 h-5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <DialogTitle className="text-white text-base font-semibold leading-tight">
                      Liberar nova avaliação?
                    </DialogTitle>
                    <p className="text-white/85 text-xs mt-0.5">
                      Ação reservada ao Admin Master.
                    </p>
                  </div>
                </div>
                <div className="px-5 py-4 space-y-3">
                  <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                    <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Usuário</p>
                    <p className="text-sm font-semibold text-slate-800 leading-tight">{confirmLiberarAval.nome}</p>
                    {confirmLiberarAval.email && (
                      <p className="text-xs text-slate-500 truncate">{confirmLiberarAval.email}</p>
                    )}
                  </div>
                  <p className="text-sm text-slate-700 leading-relaxed">
                    Ao confirmar, este usuário poderá enviar uma <b>nova avaliação NPS</b> no
                    período atual, mesmo que já tenha respondido. Útil quando o cliente
                    pediu para corrigir uma resposta enviada por engano.
                  </p>
                  <p className="text-[11px] text-slate-500 italic">
                    A avaliação anterior continua registrada no histórico — esta ação apenas
                    abre uma nova janela de envio.
                  </p>
                </div>
                <DialogFooter className="px-5 py-3 bg-slate-50 border-t border-slate-200 gap-2">
                  <Button variant="outline" onClick={() => setConfirmLiberarAval(null)} disabled={liberarAvalCredMut.isPending}>
                    Cancelar
                  </Button>
                  <Button
                    className="bg-amber-600 hover:bg-amber-700 text-white"
                    disabled={liberarAvalCredMut.isPending}
                    onClick={() => {
                      const credId = confirmLiberarAval.credId;
                      liberarAvalCredMut.mutate({ credId, companyId }, {
                        onSettled: () => setConfirmLiberarAval(null),
                      });
                    }}
                  >
                    <Star className="w-4 h-4 mr-1.5" />
                    {liberarAvalCredMut.isPending ? "Liberando..." : "Liberar avaliação"}
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Modal: Liberar abas do Portal por usuário */}
        <Dialog open={!!abasTarget} onOpenChange={(o) => { if (!o) setAbasTarget(null); }}>
          <DialogContent className="bg-white p-0 gap-0 flex flex-col !max-w-none w-screen !rounded-none !translate-x-0 !translate-y-0 !top-0 !left-0 sm:!max-w-none"
            style={{ width: "100vw", height: "100dvh", maxWidth: "100vw", maxHeight: "100dvh", top: 0, left: 0, transform: "none", borderRadius: 0 }}>
            <DialogHeader className="px-6 py-4 border-b shrink-0">
              <DialogTitle className="flex items-center gap-2 text-lg">
                <SlidersHorizontal className="w-5 h-5 text-indigo-600" />
                Liberações do Portal — Módulos e Abas
              </DialogTitle>
            </DialogHeader>
            {abasTarget && (
              <div className="flex flex-col flex-1 min-h-0 px-6 py-4 gap-4">
                <div className="bg-slate-50 rounded-lg p-3 text-sm flex flex-wrap items-center justify-between gap-2 shrink-0">
                  <div>
                    <div className="font-semibold text-slate-800">{abasTarget.nomeResponsavel || abasTarget.emailResponsavel}</div>
                    <div className="text-xs text-slate-500">{abasTarget.emailResponsavel}</div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-xs">{modSel.length} de {PORTAL_CLIENTE_MODULOS.length} módulos</Badge>
                    <Badge variant="outline" className="text-xs">{abasSel.length} de {PORTAL_CLIENTE_ABAS.length} abas</Badge>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto pr-1 space-y-5 min-h-0">
                  {/* ───── 1) MÓDULOS DO HUB ───── */}
                  <section>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div>
                        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                          <Layers className="w-4 h-4 text-indigo-600" /> 1. Módulos do Portal
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Cards visíveis no Hub (<b>/portal/cliente/hub</b>). Desligue para esconder o card por completo. O módulo <b>Avaliação</b> é obrigatório para que o cliente sempre possa enviar feedback.
                        </p>
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        <Button variant="outline" size="sm" onClick={() => setModSel(PORTAL_CLIENTE_MODULOS.map((m) => m.key))}>Todos</Button>
                        <Button variant="outline" size="sm" onClick={() => setModSel([MODULO_OBRIGATORIO])}>Só obrigatório</Button>
                      </div>
                    </div>
                    {/* Selecionados (com setas para reordenar — esta é a ORDEM PADRÃO no Hub do cliente) */}
                    {modSel.length > 0 && (
                      <>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 mb-1.5 flex items-center gap-1.5">
                          <ListOrdered className="w-3.5 h-3.5" /> Liberados — ordem padrão do cliente
                        </div>
                        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2 mb-3">
                          {modSel.map((key, idx) => {
                            const mod = PORTAL_CLIENTE_MODULOS.find((m) => m.key === key);
                            if (!mod) return null;
                            const obrig = mod.key === MODULO_OBRIGATORIO;
                            return (
                              <div key={mod.key} className="flex items-start gap-2 border-2 border-indigo-300 bg-indigo-50 rounded-lg p-3 text-sm">
                                <div className="flex flex-col gap-0.5 shrink-0">
                                  <button type="button" onClick={() => moverModulo(idx, -1)} disabled={idx === 0}
                                    className="p-0.5 rounded hover:bg-indigo-200 disabled:opacity-30 disabled:cursor-not-allowed" title="Mover para cima">
                                    <ChevronUp className="w-3.5 h-3.5 text-indigo-700" />
                                  </button>
                                  <button type="button" onClick={() => moverModulo(idx, 1)} disabled={idx === modSel.length - 1}
                                    className="p-0.5 rounded hover:bg-indigo-200 disabled:opacity-30 disabled:cursor-not-allowed" title="Mover para baixo">
                                    <ChevronDown className="w-3.5 h-3.5 text-indigo-700" />
                                  </button>
                                </div>
                                <span className="text-[10px] font-bold text-indigo-700 mt-0.5 w-4 shrink-0 text-right">{idx + 1}</span>
                                <input type="checkbox" className="mt-0.5" checked disabled={obrig} onChange={() => toggleModulo(mod.key)} />
                                <div className="flex-1 min-w-0">
                                  <div className="font-semibold text-slate-800 flex items-center gap-1.5 flex-wrap">
                                    {mod.label}
                                    {obrig && <Badge variant="outline" className="text-[9px]">obrigatório</Badge>}
                                  </div>
                                  <div className="text-[11px] text-slate-500 mt-0.5">{mod.descricao}</div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                    {modulosNaoSel.length > 0 && (
                      <>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Bloqueados</div>
                        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
                          {modulosNaoSel.map((mod) => (
                            <label key={mod.key}
                              className="flex items-start gap-2 border-2 rounded-lg p-3 cursor-pointer text-sm bg-white border-slate-200 hover:bg-slate-50 transition">
                              <input type="checkbox" className="mt-0.5" checked={false} onChange={() => toggleModulo(mod.key)} />
                              <div className="flex-1 min-w-0">
                                <div className="font-semibold text-slate-800">{mod.label}</div>
                                <div className="text-[11px] text-slate-500 mt-0.5">{mod.descricao}</div>
                              </div>
                            </label>
                          ))}
                        </div>
                      </>
                    )}
                  </section>

                  {/* ───── 2) ABAS DO MÓDULO PLANEJAMENTO ───── */}
                  <section className={planejamentoLiberado ? "" : "opacity-50 pointer-events-none"}>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div>
                        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                          <SlidersHorizontal className="w-4 h-4 text-indigo-600" /> 2. Abas do módulo Planejamento
                          {!planejamentoLiberado && <Badge variant="outline" className="text-[10px]">módulo desligado</Badge>}
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Abas internas mostradas ao abrir uma obra (<b>/portal/cliente/obra/...</b>). A aba <b>Visão Geral</b> é obrigatória.
                          {!planejamentoLiberado && <> Ative o módulo <b>Planejamento</b> acima para configurar as abas.</>}
                        </p>
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        <Button variant="outline" size="sm" onClick={() => setAbasSel(PORTAL_CLIENTE_ABAS.map((a) => a.key))}>Todas</Button>
                        <Button variant="outline" size="sm" onClick={() => setAbasSel([ABA_OBRIGATORIA])}>Só obrigatória</Button>
                      </div>
                    </div>
                    {/* Selecionadas (com setas — esta é a ORDEM PADRÃO no Portal do Cliente) */}
                    {abasSel.length > 0 && (
                      <>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 mb-1.5 flex items-center gap-1.5">
                          <ListOrdered className="w-3.5 h-3.5" /> Liberadas — ordem padrão na barra de abas
                        </div>
                        <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 mb-3">
                          {abasSel.map((key, idx) => {
                            const aba = PORTAL_CLIENTE_ABAS.find((a) => a.key === key);
                            if (!aba) return null;
                            const obrig = aba.key === ABA_OBRIGATORIA;
                            return (
                              <div key={aba.key} className="flex items-start gap-1.5 border border-indigo-200 bg-indigo-50 rounded-lg p-2.5 text-sm">
                                <div className="flex flex-col gap-0.5 shrink-0">
                                  <button type="button" onClick={() => moverAba(idx, -1)} disabled={idx === 0}
                                    className="p-0.5 rounded hover:bg-indigo-200 disabled:opacity-30 disabled:cursor-not-allowed" title="Mover para cima">
                                    <ChevronUp className="w-3.5 h-3.5 text-indigo-700" />
                                  </button>
                                  <button type="button" onClick={() => moverAba(idx, 1)} disabled={idx === abasSel.length - 1}
                                    className="p-0.5 rounded hover:bg-indigo-200 disabled:opacity-30 disabled:cursor-not-allowed" title="Mover para baixo">
                                    <ChevronDown className="w-3.5 h-3.5 text-indigo-700" />
                                  </button>
                                </div>
                                <span className="text-[10px] font-bold text-indigo-700 mt-0.5 w-4 shrink-0 text-right">{idx + 1}</span>
                                <input type="checkbox" className="mt-0.5" checked disabled={obrig} onChange={() => toggleAba(aba.key)} />
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-slate-800 flex items-center gap-1.5 flex-wrap">
                                    {aba.label}
                                    {obrig && <Badge variant="outline" className="text-[9px]">obrigatória</Badge>}
                                    {aba.status === "em_breve" && <Badge className="bg-amber-500 text-[9px]">em breve</Badge>}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                    {abasNaoSel.length > 0 && (
                      <>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Bloqueadas</div>
                        <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
                          {abasNaoSel.map((aba) => (
                            <label key={aba.key}
                              className="flex items-start gap-2 border rounded-lg p-2.5 cursor-pointer text-sm bg-white hover:bg-slate-50 transition">
                              <input type="checkbox" className="mt-0.5" checked={false} onChange={() => toggleAba(aba.key)} />
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-slate-800 flex items-center gap-1.5 flex-wrap">
                                  {aba.label}
                                  {aba.status === "em_breve" && <Badge className="bg-amber-500 text-[9px]">em breve</Badge>}
                                </div>
                              </div>
                            </label>
                          ))}
                        </div>
                      </>
                    )}
                    <p className="text-[10px] text-slate-400 mt-2 italic">
                      Use as setas <ChevronUp className="inline w-3 h-3" /> <ChevronDown className="inline w-3 h-3" /> para reordenar. A ordem definida aqui é o padrão que o cliente verá no Portal — ele ainda pode reordenar localmente arrastando as abas, mas o padrão (visto em qualquer dispositivo novo) é o que está aqui.
                    </p>
                  </section>

                  {/* RH&Docs / Proj./Doc. / Avaliação não têm abas internas configuráveis hoje. */}
                  <section className="border border-dashed border-slate-200 rounded-lg p-3 bg-slate-50/50">
                    <p className="text-[11px] text-slate-500">
                      Os módulos <b>RH&Docs</b>, <b>Proj./Doc. Técnicos</b> e <b>Avaliação</b> ainda não possuem sub-abas configuráveis — são liberados/bloqueados apenas no nível do módulo (acima).
                      Quando novas abas internas forem adicionadas a esses módulos, elas aparecerão aqui automaticamente.
                    </p>
                  </section>
                </div>
              </div>
            )}
            <DialogFooter
              className="gap-2 px-6 py-4 border-t bg-slate-50 shrink-0 flex-row flex-wrap"
              style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}>
              <Button variant="outline" onClick={() => setAbasTarget(null)}>Cancelar</Button>
              <Button onClick={() => abasTarget && setAbasMut.mutate({ id: abasTarget.id, companyId, abas: [...Array.from(modSel), ...Array.from(abasSel)] })}
                disabled={setAbasMut.isPending || !abasTarget} className="bg-indigo-600 hover:bg-indigo-700 gap-2">
                {setAbasMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Salvar liberações
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal: Obras liberadas por usuário (Rev. 2851) */}
        <Dialog open={!!obrasTarget} onOpenChange={(o) => { if (!o) setObrasTarget(null); }}>
          <DialogContent className="bg-white p-0 gap-0 flex flex-col max-w-2xl max-h-[85vh]">
            <DialogHeader className="px-6 py-4 border-b shrink-0">
              <DialogTitle className="flex items-center gap-2 text-lg">
                <HardHat className="w-5 h-5 text-cyan-700" />
                Obras liberadas para o usuário
              </DialogTitle>
            </DialogHeader>
            {obrasTarget && (
              <div className="flex flex-col flex-1 min-h-0 px-6 py-4 gap-4">
                <div className="bg-slate-50 rounded-lg p-3 text-sm flex flex-wrap items-center justify-between gap-2 shrink-0">
                  <div>
                    <div className="font-semibold text-slate-800">{obrasTarget.nomeResponsavel || obrasTarget.emailResponsavel}</div>
                    <div className="text-xs text-slate-500">{obrasTarget.emailResponsavel}</div>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {obrasModo === "todas" ? "Todas as obras" : `${obrasSel.length} obra(s) liberada(s)`}
                  </Badge>
                </div>

                {/* Toggle: Todas vs Selecionar */}
                <div className="grid grid-cols-2 gap-2 shrink-0">
                  <button type="button" onClick={() => setObrasModo("todas")}
                    className={`flex items-start gap-2 border-2 rounded-lg p-3 text-left text-sm transition ${obrasModo === "todas" ? "border-cyan-500 bg-cyan-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
                    <Globe2 className={`w-5 h-5 shrink-0 ${obrasModo === "todas" ? "text-cyan-700" : "text-slate-400"}`} />
                    <div>
                      <div className="font-semibold text-slate-800">Todas as obras</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">Vê todas as obras do cliente — inclusive as criadas no futuro.</div>
                    </div>
                  </button>
                  <button type="button" onClick={() => setObrasModo("custom")}
                    className={`flex items-start gap-2 border-2 rounded-lg p-3 text-left text-sm transition ${obrasModo === "custom" ? "border-cyan-500 bg-cyan-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
                    <SlidersHorizontal className={`w-5 h-5 shrink-0 ${obrasModo === "custom" ? "text-cyan-700" : "text-slate-400"}`} />
                    <div>
                      <div className="font-semibold text-slate-800">Selecionar obras</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">Escolha exatamente quais obras este usuário pode ver.</div>
                    </div>
                  </button>
                </div>

                {/* Lista de obras (modo custom) */}
                <div className={`flex-1 overflow-y-auto min-h-0 ${obrasModo === "custom" ? "" : "opacity-50 pointer-events-none"}`}>
                  {obrasDoCliente.isLoading ? (
                    <div className="flex items-center justify-center py-10 text-slate-400 text-sm gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" /> Carregando obras…
                    </div>
                  ) : (obrasDoCliente.data || []).length === 0 ? (
                    <div className="border border-dashed border-slate-200 rounded-xl p-10 text-center bg-slate-50/50">
                      <Building2 className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                      <p className="text-sm text-slate-500">Nenhuma obra vinculada a este cliente.</p>
                      <p className="text-[11px] text-slate-400 mt-1">A obra é vinculada pelo nome do cliente no cadastro da obra.</p>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[11px] text-slate-500">{(obrasDoCliente.data || []).length} obra(s) do cliente</p>
                        <div className="flex gap-1.5">
                          <Button variant="outline" size="sm" onClick={() => setObrasSel((obrasDoCliente.data || []).map((o: any) => o.id))}>Marcar todas</Button>
                          <Button variant="outline" size="sm" onClick={() => setObrasSel([])}>Limpar</Button>
                        </div>
                      </div>
                      <div className="grid sm:grid-cols-2 gap-2">
                        {(obrasDoCliente.data || []).map((o: any) => {
                          const sel = obrasSel.includes(o.id);
                          return (
                            <label key={o.id}
                              className={`flex items-start gap-2 border rounded-lg p-3 cursor-pointer text-sm transition ${sel ? "border-cyan-300 bg-cyan-50" : "bg-white hover:bg-slate-50"}`}>
                              <input type="checkbox" className="mt-0.5" checked={sel} onChange={() => toggleObra(o.id)} />
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-slate-800 truncate">{o.nome}</div>
                                <div className="text-[11px] text-slate-500 flex items-center gap-2 flex-wrap mt-0.5">
                                  {o.codigo && <span className="inline-flex items-center gap-1"><Building2 className="w-3 h-3" />{o.codigo}</span>}
                                  {(o.cidade || o.estado) && <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" />{[o.cidade, o.estado].filter(Boolean).join("/")}</span>}
                                  {o.status && <Badge variant="outline" className="text-[9px]">{o.status}</Badge>}
                                </div>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                      {obrasModo === "custom" && obrasSel.length === 0 && (
                        <p className="text-[11px] text-amber-600 mt-3 flex items-center gap-1.5">
                          <AlertCircle className="w-3.5 h-3.5" /> Nenhuma obra marcada — este usuário não verá nenhuma obra.
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
            <DialogFooter className="gap-2 px-6 py-4 border-t bg-slate-50 shrink-0 flex-row flex-wrap">
              <Button variant="outline" onClick={() => setObrasTarget(null)}>Cancelar</Button>
              <Button onClick={salvarObras} disabled={setObrasMut.isPending || !obrasTarget} className="bg-cyan-700 hover:bg-cyan-800 gap-2">
                {setObrasMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Salvar obras
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

        {/* Rev. 1574 — Editar nome/e-mail de um acesso */}
        <Dialog open={!!editTarget} onOpenChange={(o) => { if (!o) setEditTarget(null); }}>
          <DialogContent className="sm:max-w-md bg-white">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Pencil className="w-4 h-4 text-slate-700" /> Editar acesso
              </DialogTitle>
            </DialogHeader>
            {editTarget && (
              <div className="space-y-4 py-2">
                <div>
                  <Label>Nome completo *</Label>
                  <Input
                    value={editNome}
                    onChange={(e) => setEditNome(e.target.value)}
                    placeholder="Ex.: Maria Silva"
                    maxLength={120}
                    className="mt-1 h-11"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">Esse nome aparece na saudação do Portal do Cliente.</p>
                </div>
                <div>
                  <Label>E-mail *</Label>
                  <Input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    placeholder="usuario@empresa.com"
                    className="mt-1 h-11"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">Mudar o e-mail não invalida a senha atual nem reenvia comunicado.</p>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditTarget(null)} disabled={atualizarMut.isPending}>Cancelar</Button>
              <Button onClick={submitEditar} disabled={atualizarMut.isPending} className="bg-blue-600 hover:bg-blue-700">
                {atualizarMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
