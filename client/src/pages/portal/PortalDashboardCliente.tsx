import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { proximaJanelaAvaliacao } from "../../../../shared/portalAvaliacao";
import { PERGUNTAS_CORE_DEFAULT_LABEL } from "../../../../shared/portalPerguntasCore";
import {
  Building2, LogOut, MessageSquare, Star, Send, MapPin,
  CheckCircle2, ShieldCheck, Smile, Meh, Frown, Sparkles, Users,
} from "lucide-react";

// Rev. 1550 — fmtBR robusto: aceita "YYYY-MM-DD", "YYYY-MM-DDTHH:mm:ss"
// e "YYYY-MM-DD HH:mm:ss[.ffffff]" (formato cru do Postgres). Antes
// só dividia em "T", então timestamps separados por espaço viravam
// "09 20:53:35.290665/05/2026".
const fmtBR = (s?: string | null): string => {
  if (!s) return "—";
  const datePart = s.split(/[T ]/)[0];
  const parts = datePart.split("-");
  if (parts.length !== 3) return s;
  return parts.reverse().join("/");
};
const fmtBRDateTime = (s?: string | null): string => {
  if (!s) return "—";
  const [datePart, timePartRaw] = s.split(/[T ]/);
  const dateBR = (datePart?.split("-").length === 3) ? datePart.split("-").reverse().join("/") : (datePart ?? "");
  const timeBR = timePartRaw ? timePartRaw.split(".")[0].slice(0, 5) : "";
  return timeBR ? `${dateBR} ${timeBR}` : dateBR;
};

function NotaSelector({ value, onChange, label }: { value: number | null; onChange: (n: number | null) => void; label: string }) {
  return (
    <div>
      <Label className="text-sm font-medium text-gray-700">{label}</Label>
      <div className="flex flex-wrap gap-1 mt-2">
        {Array.from({ length: 11 }).map((_, n) => {
          const sel = value === n;
          const cor = n <= 6 ? "bg-rose-500" : n <= 8 ? "bg-amber-500" : "bg-emerald-500";
          return (
            <button
              type="button"
              key={n}
              onClick={() => onChange(sel ? null : n)}
              className={`w-9 h-9 rounded-lg text-sm font-bold transition-all ${sel ? `${cor} text-white shadow-md scale-110` : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
            >
              {n}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Rev. 2965 — linha de critério COMPACTA (rótulo + 0–10 inline) p/ preenchimento
// rápido das avaliações detalhadas (gestor, encarregado, equipe, escritório).
function CriterioRow({ label, value, onChange }: { label: string; value: number | null | undefined; onChange: (n: number | null) => void }) {
  const v = value ?? null;
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 py-1.5 border-b border-dashed border-slate-100 last:border-0">
      <span className="text-sm text-slate-700 sm:w-60 shrink-0 leading-snug">{label}</span>
      <div className="flex flex-wrap gap-1">
        {Array.from({ length: 11 }).map((_, n) => {
          const sel = v === n;
          const cor = n <= 6 ? "bg-rose-500" : n <= 8 ? "bg-amber-500" : "bg-emerald-500";
          return (
            <button
              type="button"
              key={n}
              onClick={() => onChange(sel ? null : n)}
              className={`w-7 h-7 rounded-md text-xs font-bold transition-all ${sel ? `${cor} text-white shadow scale-110` : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
            >
              {n}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Critérios de avaliação POR PESSOA (gestor e encarregado usam os mesmos 6).
const CRIT_PESSOA: { key: string; label: string }[] = [
  { key: "postura", label: "Postura e reforço positivo" },
  { key: "documentos", label: "Entrega de documentos periódicos" },
  { key: "prontoAtendimento", label: "Pronto atendimento" },
  { key: "disponibilidade", label: "Disponibilidade" },
  { key: "conhecimentoTecnico", label: "Conhecimento técnico" },
  { key: "educacao", label: "Educação e cordialidade" },
];
// Critérios básicos da EQUIPE DIRETA (operacional na obra).
const CRIT_EQUIPE: { key: string; label: string }[] = [
  { key: "tecnica", label: "Qualidade técnica do serviço" },
  { key: "organizacao", label: "Organização e limpeza" },
  { key: "seguranca", label: "Segurança (EPI / procedimentos)" },
  { key: "pontualidade", label: "Pontualidade e assiduidade" },
  { key: "educacao", label: "Educação e postura" },
  { key: "comunicacao", label: "Comunicação e atendimento" },
];
// Critérios do ESCRITÓRIO CENTRAL / Backoffice (mais perguntas).
const CRIT_ESCRITORIO: { key: string; label: string }[] = [
  { key: "atendimento", label: "Atendimento administrativo" },
  { key: "documentacao", label: "Documentação e contratos" },
  { key: "faturamento", label: "Faturamento e financeiro" },
  { key: "agilidade", label: "Agilidade nas respostas" },
  { key: "comunicacao", label: "Comunicação e transparência" },
];

// Rev. 2890 — `publicToken` ativa o MODO LINK PÚBLICO: a página é aberta por um
// link aberto enviado ao cliente (sem login/credencial), focando só a avaliação.
export default function PortalDashboardCliente({ publicToken }: { publicToken?: string } = {}) {
  const [, navigate] = useLocation();
  const isPublic = !!publicToken;
  const token = publicToken || localStorage.getItem("portal_token") || "";
  const tipo = isPublic ? "cliente" : (localStorage.getItem("portal_tipo") || "");
  // Rev. 1563 — quando o cliente entra pelo card "Avaliação" do Hub
  // (?tab=avaliacao), o dashboard foca exclusivamente na avaliação:
  // tab inicial já em "avaliacao" e as outras abas (Obras / Comentários)
  // ficam ocultas. Sem o parâmetro o comportamento clássico é mantido.
  const initialTab = (() => {
    if (isPublic) return "avaliacao" as const;
    if (typeof window === "undefined") return "obras" as const;
    const t = new URLSearchParams(window.location.search).get("tab");
    return t === "avaliacao" || t === "comentarios" || t === "obras" ? (t as "obras" | "comentarios" | "avaliacao") : "obras";
  })();
  const focoAvaliacao = isPublic || initialTab === "avaliacao";
  const [tab, setTab] = useState<"obras" | "comentarios" | "avaliacao">(initialTab);

  // Rev. 2892 — link público POR OBRA: lê obraId/obraNome embutidos no payload
  // (público) do JWT p/ travar a obra da avaliação e exibi-la ao cliente.
  const linkObra = useMemo<{ id: number; nome: string | null; gestor: string | null } | null>(() => {
    if (!isPublic || !publicToken) return null;
    try {
      const part = publicToken.split(".")[1];
      if (!part) return null;
      let b64 = part.replace(/-/g, "+").replace(/_/g, "/");
      while (b64.length % 4 !== 0) b64 += "="; // normaliza padding base64url
      const json = JSON.parse(decodeURIComponent(escape(atob(b64))));
      // Rev. 2965 — gestorNome embutido no token p/ pré-preencher o gestor automaticamente.
      if (json?.obraId) return { id: Number(json.obraId), nome: json.obraNome ?? null, gestor: json.gestorNome ?? null };
    } catch { /* token malformado → avaliação geral */ }
    return null;
  }, [isPublic, publicToken]);

  // Guard (não se aplica ao link público, que é acessível sem login)
  useEffect(() => {
    if (isPublic) return;
    if (!token) { navigate("/portal/login"); return; }
    if (tipo && tipo !== "cliente") { navigate("/portal/dashboard"); }
  }, [token, tipo]);

  const tokenCheck = trpc.portalExterno.auth.verificarToken.useQuery({ token }, { enabled: !!token && !isPublic });
  useEffect(() => {
    if (!isPublic && tokenCheck.data && !tokenCheck.data.valid) {
      localStorage.clear();
      toast.error("Sessão expirada");
      navigate("/portal/login");
    }
  }, [tokenCheck.data]);

  const { data: meusDados } = trpc.portalExterno.cliente.meusDados.useQuery({ token }, { enabled: !!token && tipo === "cliente" && !isPublic });
  const { data: minhasObras = [] } = trpc.portalExterno.cliente.minhasObras.useQuery({ token }, { enabled: !!token && tipo === "cliente" && !isPublic });

  // Rev. 2892 — trava a obra do link público no estado da avaliação.
  useEffect(() => {
    if (linkObra) setAval((prev) => ({ ...prev, obraId: linkObra.id }));
  }, [linkObra]);

  // Rev. 2965 — GESTOR auto-preenchido a partir do responsável da obra:
  // - link público por obra → vem no token (linkObra.gestor);
  // - seletor logado → responsável da obra selecionada (minhasObras).
  const obraSel = useMemo(() => (minhasObras as any[]).find((o) => o.id === aval.obraId) || null, [minhasObras, aval.obraId]);
  const gestorAuto = useMemo<string | null>(
    () => (linkObra?.gestor || (obraSel?.responsavel ?? null) || null),
    [linkObra, obraSel]
  );
  useEffect(() => {
    if (gestorAuto) setAval((prev) => ({ ...prev, gestorNome: gestorAuto }));
  }, [gestorAuto]);

  // ===== Comentários =====
  const [obraFiltro, setObraFiltro] = useState<number | null>(null);
  const utils = trpc.useUtils();
  const { data: comentarios = [] } = trpc.portalExterno.cliente.listarComentarios.useQuery(
    { token, obraId: obraFiltro },
    { enabled: !!token && tipo === "cliente" && !isPublic }
  );
  const marcarLidosMut = trpc.portalExterno.cliente.marcarComentariosLidos.useMutation();
  useEffect(() => {
    if (token && tipo === "cliente" && tab === "comentarios" && comentarios.length > 0) {
      const naoLidos = (comentarios as any[]).some((c) => c.autorTipo === "fc" && !c.lidoEm);
      if (naoLidos) marcarLidosMut.mutate({ token, obraId: obraFiltro });
    }
  }, [tab, comentarios, obraFiltro]);
  const [novoMsg, setNovoMsg] = useState("");
  const criarMsg = trpc.portalExterno.cliente.criarComentario.useMutation({
    onSuccess: () => { setNovoMsg(""); utils.portalExterno.cliente.listarComentarios.invalidate(); toast.success("Mensagem enviada!"); },
    onError: (e) => toast.error(e.message),
  });

  // ===== Avaliação =====
  const [aval, setAval] = useState<{
    obraId: number | null;
    notaEquipe: number | null; notaObra: number | null; notaAtendimento: number | null;
    notaPrazo: number | null; notaQualidade: number | null;
    // Rev. 1592 — Escritório Central
    notaEscritorio: number | null; notaFaturamento: number | null;
    comentarioEscritorio: string;
    notaEmpresa: number | null; notaGestor: number | null;
    notaGeral: number | null;
    comentarioPositivo: string; comentarioMelhoria: string;
    comentarioEquipe: string; comentarioEmpresa: string; comentarioGestor: string;
    gestorNome: string;
    recomendaria: number | null;
  }>({
    obraId: null, notaEquipe: null, notaObra: null, notaAtendimento: null,
    notaPrazo: null, notaQualidade: null,
    notaEscritorio: null, notaFaturamento: null,
    comentarioEscritorio: "",
    notaEmpresa: null, notaGestor: null,
    notaGeral: null,
    comentarioPositivo: "", comentarioMelhoria: "",
    comentarioEquipe: "", comentarioEmpresa: "", comentarioGestor: "",
    gestorNome: "",
    recomendaria: null,
  });
  // Rev. 2965 — critérios detalhados (0–10) por pessoa/tema. Cada mapa usa as
  // chaves de CRIT_* acima; valor null = não respondido. Vão p/ `detalhes`.
  const [detGestor, setDetGestor] = useState<Record<string, number | null>>({});
  const [detEncarregado, setDetEncarregado] = useState<Record<string, number | null>>({});
  const [encarregadoNome, setEncarregadoNome] = useState("");
  const [detEquipe, setDetEquipe] = useState<Record<string, number | null>>({});
  const [detEscritorio, setDetEscritorio] = useState<Record<string, number | null>>({});
  const [avaliado, setAvaliado] = useState(false);
  // Rev. 1595 — Perguntas extras (personalizadas) configuradas pelo admin.
  // Rev. 1597 — Rótulos personalizados (override) das 8 perguntas core, definidos pelo Admin Master.
  const { data: labelsCoreOverride = {} } = trpc.portalExterno.cliente.listarLabelsCore.useQuery(
    { token }, { enabled: !!token && tipo === "cliente" }
  );
  // Rev. 1597 — Usa o padrão centralizado (shared/portalPerguntasCore) como
  // fallback final, ignorando o `padrao` passado in-line caso ele divirja da
  // fonte única. Assim, admin (defaults) e portal (fallback) ficam sempre
  // sincronizados e o reset-to-default funciona em todas as 8 perguntas.
  const lbl = (chave: string, _padrao: string) =>
    ((labelsCoreOverride as Record<string, string>)[chave]
      || (PERGUNTAS_CORE_DEFAULT_LABEL as Record<string, string>)[chave]
      || _padrao);

  const perguntasExtrasQ = trpc.portalExterno.cliente.listarPerguntasExtras.useQuery(
    { token }, { enabled: !!token && tipo === "cliente" }
  );
  const perguntasExtras = (perguntasExtrasQ.data || []) as any[];
  const [respostasExtras, setRespostasExtras] = useState<Record<number, { valorNumero?: number | null; valorTexto?: string }>>({});
  const setRespExtra = (perguntaId: number, patch: { valorNumero?: number | null; valorTexto?: string }) =>
    setRespostasExtras((prev) => ({ ...prev, [perguntaId]: { ...(prev[perguntaId] || {}), ...patch } }));
  // Rev. 1551 — Lembrete mensal anônimo: o backend devolve apenas se a
  // credencial deste mês já tem marcação (ano_mes), sem ligar ao
  // conteúdo da avaliação. Mostramos um modal de boas-vindas que abre
  // automaticamente assim que o portal carrega para quem ainda não
  // avaliou no mês corrente.
  const podeAvaliarQ = trpc.portalExterno.cliente.podeAvaliarEsteMes.useQuery(
    { token },
    { enabled: !!token && tipo === "cliente" }
  );
  const jaAvaliouEsteMes = !!podeAvaliarQ.data?.jaAvaliou;
  const [lembreteAberto, setLembreteAberto] = useState(false);
  const [lembreteDispensado, setLembreteDispensado] = useState(false);
  useEffect(() => {
    if (
      podeAvaliarQ.data &&
      podeAvaliarQ.data.podeAvaliar &&
      !lembreteDispensado &&
      tab !== "avaliacao"
    ) {
      setLembreteAberto(true);
    }
  }, [podeAvaliarQ.data, lembreteDispensado, tab]);
  const enviarAvalMut = trpc.portalExterno.cliente.criarAvaliacao.useMutation({
    onSuccess: () => {
      setAvaliado(true);
      toast.success("Obrigado! Sua avaliação foi enviada.");
      podeAvaliarQ.refetch();
    },
    onError: (e) => {
      toast.error(e.message);
      // Se a rejeição foi por duplicidade/concorrência, sincroniza
      // a UI com o estado real (mostra a tela "já registrada").
      podeAvaliarQ.refetch();
    },
  });
  const enviarAvaliacao = () => {
    if (aval.notaGeral === null) { toast.error("Informe pelo menos a nota geral (NPS)"); return; }
    // Rev. 1595 — valida obrigatórias das perguntas extras
    for (const p of perguntasExtras) {
      if (!p.obrigatoria) continue;
      const r = respostasExtras[p.id];
      const isNumero = p.tipo === "nota_0_10" || p.tipo === "sim_nao_talvez";
      const vazio = isNumero
        ? (r?.valorNumero === null || r?.valorNumero === undefined)
        : !(r?.valorTexto && r.valorTexto.trim().length > 0);
      if (vazio) { toast.error(`Responda: ${p.label}`); return; }
    }
    const respostasExtrasArr = perguntasExtras
      .map((p) => {
        const r = respostasExtras[p.id];
        if (!r) return null;
        const isNumero = p.tipo === "nota_0_10" || p.tipo === "sim_nao_talvez";
        if (isNumero) {
          if (r.valorNumero === null || r.valorNumero === undefined) return null;
          return { perguntaId: p.id as number, valorNumero: r.valorNumero };
        }
        const t = (r.valorTexto || "").trim();
        if (!t) return null;
        return { perguntaId: p.id as number, valorTexto: t };
      })
      .filter(Boolean) as any[];
    // Rev. 2965 — monta o detalhamento granular (só inclui critérios respondidos).
    const collect = (state: Record<string, number | null>, crits: { key: string }[]) => {
      const o: Record<string, number> = {};
      for (const c of crits) { const v = state[c.key]; if (typeof v === "number") o[c.key] = v; }
      return o;
    };
    const gObj = collect(detGestor, CRIT_PESSOA);
    const enObj = collect(detEncarregado, CRIT_PESSOA);
    const eqObj = collect(detEquipe, CRIT_EQUIPE);
    const escObj = collect(detEscritorio, CRIT_ESCRITORIO);
    const temCriterios =
      Object.keys(gObj).length + Object.keys(enObj).length +
      Object.keys(eqObj).length + Object.keys(escObj).length > 0;
    const detalhes = (temCriterios || encarregadoNome.trim())
      ? {
          gestor: { ...gObj, ...(aval.gestorNome.trim() ? { nome: aval.gestorNome.trim() } : {}) },
          encarregado: { ...enObj, ...(encarregadoNome.trim() ? { nome: encarregadoNome.trim() } : {}) },
          equipe: eqObj,
          escritorio: escObj,
        }
      : undefined;
    enviarAvalMut.mutate({
      token,
      obraId: aval.obraId,
      // notaEquipe / notaGestor / notaEscritorio / notaFaturamento são DERIVADOS no
      // backend pela média dos critérios detalhados — não enviados aqui.
      notaObra: aval.notaObra ?? undefined,
      // "Atendimento e comunicação" da equipe direta alimenta a coluna notaAtendimento.
      notaAtendimento: (detEquipe.comunicacao ?? aval.notaAtendimento) ?? undefined,
      notaPrazo: aval.notaPrazo ?? undefined,
      notaQualidade: aval.notaQualidade ?? undefined,
      notaEmpresa: aval.notaEmpresa ?? undefined,
      comentarioEscritorio: aval.comentarioEscritorio || undefined,
      notaGeral: aval.notaGeral,
      comentarioPositivo: aval.comentarioPositivo || undefined,
      comentarioMelhoria: aval.comentarioMelhoria || undefined,
      comentarioEquipe: aval.comentarioEquipe || undefined,
      comentarioEmpresa: aval.comentarioEmpresa || undefined,
      comentarioGestor: aval.comentarioGestor || undefined,
      gestorNome: aval.gestorNome || undefined,
      recomendaria: aval.recomendaria ?? undefined,
      respostasExtras: respostasExtrasArr.length ? respostasExtrasArr : undefined,
      detalhes,
    });
  };
  // Rev. 1569 — periodicidade configurável (mensal/anual)
  const periodicidade = (podeAvaliarQ.data?.periodicidade as "mensal" | "anual" | undefined) ?? "mensal";
  const labelPer = periodicidade === "anual" ? "ano" : "mês";
  const labelPerCap = periodicidade === "anual" ? "Ano" : "Mês";
  const labelUmaPor = periodicidade === "anual" ? "uma avaliação por ano" : "uma avaliação por mês";
  // Rev. 1591 — rótulo da próxima janela ("junho/2026" ou "2027")
  const proximaJanelaTxt = podeAvaliarQ.data?.anoMes
    ? proximaJanelaAvaliacao(podeAvaliarQ.data.anoMes, periodicidade)
    : "";

  const logout = () => { localStorage.clear(); navigate("/portal/login"); };

  const obrasOptions = useMemo(() => minhasObras.map((o: any) => ({ id: o.id, nome: o.nome })), [minhasObras]);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold text-slate-800 text-base leading-tight">{isPublic ? "Pesquisa de Satisfação" : "Portal do Cliente"}</h1>
              <p className="text-xs text-slate-500">{isPublic ? "Sua opinião — 100% anônima" : (meusDados?.razaoSocial ?? localStorage.getItem("portal_nome") ?? "")}</p>
            </div>
          </div>
          {!isPublic && (
            <Button variant="outline" size="sm" onClick={logout} className="gap-1.5">
              <LogOut className="w-4 h-4" /> Sair
            </Button>
          )}
        </div>
        <div className="max-w-6xl mx-auto px-4" style={isPublic ? { display: "none" } : undefined}>
          <div className="flex gap-1 -mb-px">
            {(focoAvaliacao
              ? [{ k: "avaliacao", label: "Avaliação Anônima", icon: Star }]
              : [
                  { k: "obras", label: "Minhas Obras", icon: Building2 },
                  { k: "comentarios", label: "Comentários", icon: MessageSquare },
                  // Rev. 1591 — oculta a aba Avaliação se já enviou neste período
                  ...(jaAvaliouEsteMes
                    ? []
                    : [{ k: "avaliacao", label: "Avaliação Anônima", icon: Star }]),
                ]
            ).map((t) => {
              const Icon = t.icon as any;
              const active = tab === t.k;
              return (
                <button
                  key={t.k}
                  onClick={() => setTab(t.k as any)}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${active ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}
                >
                  <Icon className="w-4 h-4" /> {t.label}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* Rev. 1551 — Modal de lembrete mensal anônimo (LGPD) */}
      {lembreteAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => { setLembreteAberto(false); setLembreteDispensado(true); }}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                <Star className="w-6 h-6 text-amber-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800">Avaliação {periodicidade === "anual" ? "anual" : "mensal"} pendente</h3>
                <p className="text-sm text-slate-500 mt-0.5">Sua opinião é essencial para a evolução da FC Engenharia.</p>
              </div>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 mb-4 flex items-start gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <p className="text-xs text-emerald-900">
                <b>100% anônima.</b> Não armazenamos sua identidade, CNPJ ou IP. Apenas registramos que você já enviou a avaliação deste {labelPer} — sem ligar isso ao conteúdo das respostas (LGPD).
              </p>
            </div>
            <p className="text-sm text-slate-700 mb-5">Leva menos de 1 minuto. Você pode preencher agora ou depois — só lembre-se: <b>{labelUmaPor}</b>.</p>
            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
              <Button variant="outline" onClick={() => { setLembreteAberto(false); setLembreteDispensado(true); }}>
                Mais tarde
              </Button>
              <Button
                onClick={() => { setLembreteAberto(false); setLembreteDispensado(true); setTab("avaliacao"); }}
                className="bg-emerald-600 hover:bg-emerald-700 gap-2"
              >
                <Sparkles className="w-4 h-4" /> Avaliar agora
              </Button>
            </div>
          </div>
        </div>
      )}

      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* TAB OBRAS */}
        {tab === "obras" && (
          <div>
            <h2 className="text-lg font-semibold text-slate-800 mb-4">Obras vinculadas a você</h2>
            {minhasObras.length === 0 ? (
              <div className="bg-white border rounded-xl p-12 text-center text-slate-400">
                <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Nenhuma obra vinculada à sua empresa no momento.</p>
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {minhasObras.map((o: any) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => navigate(`/portal/cliente/obra/${o.id}`)}
                    className="text-left bg-white border rounded-xl p-4 hover:shadow-md hover:border-blue-300 transition-all cursor-pointer"
                    title="Ver planejamento desta obra"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="font-semibold text-slate-800 text-sm leading-tight">{o.nome}</h3>
                      <Badge variant="outline" className="text-[10px]">{o.status}</Badge>
                    </div>
                    {o.codigo && <p className="text-xs text-slate-500 mb-2">{o.codigo}</p>}
                    {(o.cidade || o.estado) && (
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
                        <MapPin className="w-3.5 h-3.5" />
                        {[o.cidade, o.estado].filter(Boolean).join(" / ")}
                      </div>
                    )}
                    <div className="text-xs text-slate-500 mt-2 pt-2 border-t">
                      <p>Início: <span className="font-medium text-slate-700">{fmtBR(o.dataInicio)}</span></p>
                      <p>Previsão fim: <span className="font-medium text-slate-700">{fmtBR(o.dataPrevisaoFim)}</span></p>
                    </div>
                    <p className="text-[11px] text-blue-600 font-medium mt-2 pt-2 border-t">Ver planejamento →</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB COMENTÁRIOS */}
        {tab === "comentarios" && (
          <div className="grid lg:grid-cols-3 gap-4">
            <div className="lg:col-span-1">
              <div className="bg-white border rounded-xl p-4">
                <Label className="text-xs font-medium">Filtrar por obra</Label>
                <select
                  value={obraFiltro ?? ""}
                  onChange={(e) => setObraFiltro(e.target.value ? Number(e.target.value) : null)}
                  className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                >
                  <option value="">Todas / Geral</option>
                  {obrasOptions.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
                </select>
                <div className="mt-4 pt-4 border-t">
                  <Label className="text-xs font-medium">Nova mensagem</Label>
                  <textarea
                    value={novoMsg}
                    onChange={(e) => setNovoMsg(e.target.value)}
                    rows={4}
                    className="mt-1 w-full border rounded-md px-3 py-2 text-sm resize-none"
                    placeholder="Escreva uma mensagem para a equipe FC..."
                  />
                  <Button
                    onClick={() => criarMsg.mutate({ token, obraId: obraFiltro, mensagem: novoMsg.trim() })}
                    disabled={!novoMsg.trim() || criarMsg.isPending}
                    className="mt-2 w-full bg-blue-600 hover:bg-blue-700 gap-2"
                  >
                    <Send className="w-4 h-4" /> Enviar
                  </Button>
                </div>
              </div>
            </div>

            <div className="lg:col-span-2">
              <h2 className="text-lg font-semibold text-slate-800 mb-3">Conversa</h2>
              {comentarios.length === 0 ? (
                <div className="bg-white border rounded-xl p-12 text-center text-slate-400">
                  <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Nenhuma mensagem ainda. Escreva a primeira ao lado.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {comentarios.map((m: any) => {
                    const isCli = m.autorTipo === "cliente";
                    return (
                      <div key={m.id} className={`flex ${isCli ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 shadow-sm ${isCli ? "bg-blue-600 text-white" : "bg-white border"}`}>
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-xs font-semibold ${isCli ? "text-blue-100" : "text-slate-700"}`}>
                              {m.autorNome || (isCli ? "Você" : "FC Engenharia")}
                            </span>
                            <span className={`text-[10px] ${isCli ? "text-blue-200" : "text-slate-400"}`}>
                              {fmtBRDateTime(m.criadoEm)}
                            </span>
                          </div>
                          <p className={`text-sm whitespace-pre-wrap ${isCli ? "text-white" : "text-slate-700"}`}>{m.mensagem}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB AVALIAÇÃO */}
        {tab === "avaliacao" && (
          <div className="max-w-3xl mx-auto">
            {jaAvaliouEsteMes && !avaliado ? (
              <div className="bg-white border rounded-2xl p-12 text-center">
                <ShieldCheck className="w-20 h-20 text-emerald-500 mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-slate-800 mb-2">Avaliação deste {labelPer} já registrada</h2>
                <p className="text-slate-600 mb-2">Para preservar o anonimato (LGPD), cada usuário envia apenas <b>{labelUmaPor}</b>.</p>
                {/* Rev. 1591 — módulo desativado até a próxima janela */}
                {proximaJanelaTxt ? (
                  <p className="text-slate-500 text-sm">O módulo de Avaliação está desativado até <b>{proximaJanelaTxt}</b>, quando reabre automaticamente.</p>
                ) : (
                  <p className="text-slate-500 text-sm">Volte no próximo {labelPer} para registrar uma nova avaliação. Obrigado!</p>
                )}
                <p className="text-slate-400 text-xs mt-3">Precisa registrar uma nova agora? Solicite ao Admin Master da FC para cancelar a avaliação deste {labelPer}.</p>
              </div>
            ) : avaliado ? (
              <div className="bg-white border rounded-2xl p-12 text-center">
                <CheckCircle2 className="w-20 h-20 text-emerald-500 mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-slate-800 mb-2">Obrigado pela avaliação!</h2>
                <p className="text-slate-600 mb-6">Suas respostas foram registradas <b>de forma totalmente anônima</b> e ajudarão a FC Engenharia a melhorar continuamente.</p>
                <Button onClick={() => { setAvaliado(false); setDetGestor({}); setDetEncarregado({}); setDetEquipe({}); setDetEscritorio({}); setEncarregadoNome(""); setAval({ ...aval, notaGeral: null, notaEquipe: null, notaObra: null, notaAtendimento: null, notaPrazo: null, notaQualidade: null, notaEmpresa: null, notaGestor: null, notaEscritorio: null, notaFaturamento: null, comentarioEscritorio: "", comentarioPositivo: "", comentarioMelhoria: "", comentarioEquipe: "", comentarioEmpresa: "", comentarioGestor: "", gestorNome: gestorAuto || "", recomendaria: null, obraId: linkObra ? linkObra.id : null }); }} variant="outline">
                  Enviar nova avaliação
                </Button>
              </div>
            ) : (
              <div className="bg-white border rounded-2xl p-6 space-y-5">
                <div className="flex items-start gap-3 pb-3 border-b">
                  <ShieldCheck className="w-7 h-7 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <h2 className="font-bold text-slate-800">Avaliação 100% anônima</h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Não armazenamos sua identidade, nem CNPJ, nem IP. Sinta-se à vontade para ser sincero — suas respostas ajudam a equipe FC a evoluir.
                    </p>
                  </div>
                </div>

                {linkObra ? (
                  // Rev. 2892 — link público POR OBRA: obra travada, exibida só p/ leitura.
                  <div>
                    <Label className="text-sm font-medium">Obra avaliada</Label>
                    <div className="mt-1 w-full border rounded-md px-3 py-2 text-sm bg-slate-50 text-slate-700 font-medium">
                      {linkObra.nome ?? `Obra #${linkObra.id}`}
                    </div>
                  </div>
                ) : (
                  <div>
                    <Label className="text-sm font-medium">Sobre qual obra? <span className="text-slate-400 text-xs">(opcional)</span></Label>
                    <select
                      value={aval.obraId ?? ""}
                      onChange={(e) => setAval({ ...aval, obraId: e.target.value ? Number(e.target.value) : null })}
                      className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                    >
                      <option value="">Avaliação geral / não específica</option>
                      {obrasOptions.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
                    </select>
                  </div>
                )}

                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <NotaSelector label={lbl("notaGeral", "Nota geral (0 = péssimo · 10 = excelente) ★")} value={aval.notaGeral} onChange={(n) => setAval({ ...aval, notaGeral: n })} />
                </div>

                {/* Bloco GESTOR / RESPONSÁVEL — Rev. 2965 (nome auto + 6 critérios) */}
                <div className="border rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Star className="w-4 h-4 text-amber-600" />
                    <h3 className="font-semibold text-slate-800 text-sm">Gestor / Responsável FC pela obra</h3>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Gestor responsável</Label>
                    {gestorAuto ? (
                      <div className="mt-1 w-full border rounded-md px-3 py-2 text-sm bg-slate-50 text-slate-700 font-medium flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        {aval.gestorNome || gestorAuto}
                        <span className="text-[11px] text-slate-400 ml-auto">preenchido automaticamente</span>
                      </div>
                    ) : (
                      <Input value={aval.gestorNome} onChange={(e) => setAval({ ...aval, gestorNome: e.target.value })}
                        placeholder="Ex.: Eng. João da Silva" className="mt-1" />
                    )}
                  </div>
                  <div className="pt-1">
                    <p className="text-xs text-slate-500 mb-1.5">Avalie de 0 a 10 cada item:</p>
                    {CRIT_PESSOA.map((c) => (
                      <CriterioRow key={c.key} label={c.label} value={detGestor[c.key]}
                        onChange={(n) => setDetGestor((prev) => ({ ...prev, [c.key]: n }))} />
                    ))}
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Como o gestor pode evoluir? <span className="text-slate-400 text-xs">(opcional)</span></Label>
                    <textarea value={aval.comentarioGestor} onChange={(e) => setAval({ ...aval, comentarioGestor: e.target.value })}
                      rows={2} className="mt-1 w-full border rounded-md px-3 py-2 text-sm resize-none"
                      placeholder="Clareza, proatividade, presença em obra, decisões técnicas..." />
                  </div>
                </div>

                {/* Bloco ENCARREGADO — Rev. 2965 (nome + 6 critérios) */}
                <div className="border rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-orange-600" />
                    <h3 className="font-semibold text-slate-800 text-sm">Encarregado FC na obra</h3>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Nome do encarregado <span className="text-slate-400 text-xs">(opcional)</span></Label>
                    <Input value={encarregadoNome} onChange={(e) => setEncarregadoNome(e.target.value)}
                      placeholder="Ex.: Sr. José Carlos" className="mt-1" />
                  </div>
                  <div className="pt-1">
                    <p className="text-xs text-slate-500 mb-1.5">Avalie de 0 a 10 cada item:</p>
                    {CRIT_PESSOA.map((c) => (
                      <CriterioRow key={c.key} label={c.label} value={detEncarregado[c.key]}
                        onChange={(n) => setDetEncarregado((prev) => ({ ...prev, [c.key]: n }))} />
                    ))}
                  </div>
                </div>

                {/* Bloco EQUIPE DIRETA — Rev. 2965 (perguntas básicas) */}
                <div className="border rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-blue-600" />
                    <h3 className="font-semibold text-slate-800 text-sm">Equipe direta FC na obra</h3>
                  </div>
                  <div className="pt-1">
                    <p className="text-xs text-slate-500 mb-1.5">Avalie de 0 a 10 cada item:</p>
                    {CRIT_EQUIPE.map((c) => (
                      <CriterioRow key={c.key} label={c.label} value={detEquipe[c.key]}
                        onChange={(n) => setDetEquipe((prev) => ({ ...prev, [c.key]: n }))} />
                    ))}
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Comentário sobre a equipe <span className="text-slate-400 text-xs">(opcional)</span></Label>
                    <textarea value={aval.comentarioEquipe} onChange={(e) => setAval({ ...aval, comentarioEquipe: e.target.value })}
                      rows={2} className="mt-1 w-full border rounded-md px-3 py-2 text-sm resize-none"
                      placeholder="Postura, técnica, segurança, organização, pontualidade..." />
                  </div>
                </div>

                {/* Bloco EMPRESA */}
                <div className="border rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <h3 className="font-semibold text-slate-800 text-sm">FC Engenharia (Empresa)</h3>
                  </div>
                  <div className="grid md:grid-cols-2 gap-4">
                    <NotaSelector label={lbl("notaEmpresa", "Empresa FC (reputação, transparência, comunicação institucional)")} value={aval.notaEmpresa} onChange={(n) => setAval({ ...aval, notaEmpresa: n })} />
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Comentário sobre a Empresa <span className="text-slate-400 text-xs">(opcional)</span></Label>
                    <textarea value={aval.comentarioEmpresa} onChange={(e) => setAval({ ...aval, comentarioEmpresa: e.target.value })}
                      rows={2} className="mt-1 w-full border rounded-md px-3 py-2 text-sm resize-none"
                      placeholder="Imagem da empresa, postura institucional, processos administrativos..." />
                  </div>
                </div>

                {/* Bloco ESCRITÓRIO CENTRAL — Rev. 2965 (mais perguntas) */}
                <div className="border rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-purple-600" />
                    <h3 className="font-semibold text-slate-800 text-sm">Escritório Central / Backoffice</h3>
                  </div>
                  <div className="pt-1">
                    <p className="text-xs text-slate-500 mb-1.5">Avalie de 0 a 10 cada item:</p>
                    {CRIT_ESCRITORIO.map((c) => (
                      <CriterioRow key={c.key} label={c.label} value={detEscritorio[c.key]}
                        onChange={(n) => setDetEscritorio((prev) => ({ ...prev, [c.key]: n }))} />
                    ))}
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Comentário sobre o Escritório Central <span className="text-slate-400 text-xs">(opcional)</span></Label>
                    <textarea value={aval.comentarioEscritorio} onChange={(e) => setAval({ ...aval, comentarioEscritorio: e.target.value })}
                      rows={2} className="mt-1 w-full border rounded-md px-3 py-2 text-sm resize-none"
                      placeholder="Suporte administrativo, contratos, faturamento, agilidade nas respostas..." />
                  </div>
                </div>

                {/* Bloco OBRA */}
                <div className="border rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-indigo-600" />
                    <h3 className="font-semibold text-slate-800 text-sm">Obra / Execução</h3>
                  </div>
                  <div className="grid md:grid-cols-3 gap-4">
                    <NotaSelector label={lbl("notaObra", "Andamento da obra")} value={aval.notaObra} onChange={(n) => setAval({ ...aval, notaObra: n })} />
                    <NotaSelector label={lbl("notaPrazo", "Cumprimento de prazos")} value={aval.notaPrazo} onChange={(n) => setAval({ ...aval, notaPrazo: n })} />
                    <NotaSelector label={lbl("notaQualidade", "Qualidade do serviço entregue")} value={aval.notaQualidade} onChange={(n) => setAval({ ...aval, notaQualidade: n })} />
                  </div>
                </div>

                <div>
                  <Label className="text-sm font-medium">Você recomendaria a FC para outras empresas?</Label>
                  <div className="flex gap-2 mt-2">
                    {[
                      { v: 2, label: "Sim, com certeza", icon: Smile, cor: "bg-emerald-500" },
                      { v: 1, label: "Talvez", icon: Meh, cor: "bg-amber-500" },
                      { v: 0, label: "Não", icon: Frown, cor: "bg-rose-500" },
                    ].map((opt) => {
                      const Icon = opt.icon as any;
                      const sel = aval.recomendaria === opt.v;
                      return (
                        <button
                          key={opt.v}
                          type="button"
                          onClick={() => setAval({ ...aval, recomendaria: sel ? null : opt.v })}
                          className={`flex-1 flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all ${sel ? `${opt.cor} text-white border-transparent shadow-md` : "border-slate-200 text-slate-600 hover:border-slate-300"}`}
                        >
                          <Icon className="w-6 h-6" />
                          <span className="text-xs font-medium">{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Rev. 1592 — Pontos Fortes / Pontos Fracos (rótulos diretos) */}
                <div>
                  <Label className="text-sm font-medium flex items-center gap-1.5">
                    <Smile className="w-4 h-4 text-emerald-600" />
                    Pontos fortes — o que mais te impressionou positivamente? <span className="text-slate-400 text-xs">(opcional)</span>
                  </Label>
                  <textarea value={aval.comentarioPositivo} onChange={(e) => setAval({ ...aval, comentarioPositivo: e.target.value })}
                    rows={3} className="mt-1 w-full border rounded-md px-3 py-2 text-sm resize-none"
                    placeholder="O que está funcionando bem na obra, equipe, gestão ou no escritório central..." />
                </div>
                <div>
                  <Label className="text-sm font-medium flex items-center gap-1.5">
                    <Frown className="w-4 h-4 text-rose-600" />
                    Pontos fracos — o que precisa melhorar? <span className="text-slate-400 text-xs">(opcional)</span>
                  </Label>
                  <textarea value={aval.comentarioMelhoria} onChange={(e) => setAval({ ...aval, comentarioMelhoria: e.target.value })}
                    rows={3} className="mt-1 w-full border rounded-md px-3 py-2 text-sm resize-none"
                    placeholder="Sugestões, oportunidades de melhoria, gargalos identificados..." />
                </div>

                {/* Rev. 1595 — Perguntas extras (personalizadas) configuradas pelo admin */}
                {perguntasExtras.length > 0 && (() => {
                  const grupos = perguntasExtras.reduce((acc: Record<string, any[]>, p: any) => {
                    const sec = p.secaoTitulo || "Outras";
                    if (!acc[sec]) acc[sec] = [];
                    acc[sec].push(p);
                    return acc;
                  }, {});
                  return (
                    <div className="space-y-4">
                      {Object.entries(grupos).map(([sec, lista]: any) => (
                        <div key={sec} className="border rounded-xl p-4 space-y-3">
                          <h3 className="font-semibold text-slate-800 text-sm">{sec}</h3>
                          {lista.map((p: any) => {
                            const r = respostasExtras[p.id] || {};
                            return (
                              <div key={p.id}>
                                <Label className="text-sm font-medium">
                                  {p.label}
                                  {p.obrigatoria
                                    ? <span className="text-rose-500 ml-1">*</span>
                                    : <span className="text-slate-400 text-xs ml-1">(opcional)</span>}
                                </Label>
                                {p.ajuda && <p className="text-xs text-slate-500 mt-0.5">{p.ajuda}</p>}
                                {p.tipo === "nota_0_10" && (
                                  <div className="flex flex-wrap gap-1.5 mt-2">
                                    {Array.from({ length: 11 }, (_, i) => i).map((n) => {
                                      const sel = r.valorNumero === n;
                                      return (
                                        <button
                                          key={n}
                                          type="button"
                                          onClick={() => setRespExtra(p.id, { valorNumero: sel ? null : n })}
                                          className={`w-9 h-9 rounded-md border text-sm font-semibold transition ${sel ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:border-blue-300"}`}
                                        >
                                          {n}
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                                {p.tipo === "sim_nao_talvez" && (
                                  <div className="flex gap-2 mt-2">
                                    {[
                                      { v: 2, label: "Sim", icon: Smile, cor: "bg-emerald-500" },
                                      { v: 1, label: "Talvez", icon: Meh, cor: "bg-amber-500" },
                                      { v: 0, label: "Não", icon: Frown, cor: "bg-rose-500" },
                                    ].map((opt) => {
                                      const Icon = opt.icon as any;
                                      const sel = r.valorNumero === opt.v;
                                      return (
                                        <button
                                          key={opt.v}
                                          type="button"
                                          onClick={() => setRespExtra(p.id, { valorNumero: sel ? null : opt.v })}
                                          className={`flex-1 flex flex-col items-center gap-1 p-2.5 rounded-xl border-2 transition-all ${sel ? `${opt.cor} text-white border-transparent shadow` : "border-slate-200 text-slate-600 hover:border-slate-300"}`}
                                        >
                                          <Icon className="w-5 h-5" />
                                          <span className="text-xs font-medium">{opt.label}</span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                                {p.tipo === "texto_curto" && (
                                  <Input value={r.valorTexto || ""} maxLength={240}
                                    onChange={(e) => setRespExtra(p.id, { valorTexto: e.target.value })}
                                    placeholder={p.placeholder || ""} className="mt-1" />
                                )}
                                {p.tipo === "texto_longo" && (
                                  <textarea value={r.valorTexto || ""} rows={3}
                                    onChange={(e) => setRespExtra(p.id, { valorTexto: e.target.value })}
                                    className="mt-1 w-full border rounded-md px-3 py-2 text-sm resize-none"
                                    placeholder={p.placeholder || ""} />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  );
                })()}

                <div className="flex justify-end pt-3 border-t">
                  <Button onClick={enviarAvaliacao} disabled={enviarAvalMut.isPending || aval.notaGeral === null}
                    className="bg-emerald-600 hover:bg-emerald-700 gap-2">
                    <Sparkles className="w-4 h-4" /> {enviarAvalMut.isPending ? "Enviando..." : "Enviar avaliação anônima"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
