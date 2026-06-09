// Rev. 2858 — COLETA DE CAMPO (RH) — tela interna
// Gera/gerencia links externos por obra (token + QR, sem login) para um auxiliar
// de campo coletar dados dos funcionários alocados pelo celular, e revisa a fila
// (aprova → grava na ficha do employee; rejeita).
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { usePermissions } from "@/contexts/PermissionsContext";
import { useToast } from "@/hooks/use-toast";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  ClipboardList, Link2, QrCode, Copy, Check, X, Power, Eye, Loader2,
  CheckCircle2, XCircle, Clock, ArrowRight, ImageIcon, Pencil, Trash2, AlertTriangle,
  ArrowLeft, CheckSquare, Square, RotateCcw,
} from "lucide-react";
import {
  GRUPOS_COLETA, GRUPOS_COLETA_KEYS, type GrupoColetaKey,
  CAMPOS_CUSTOM_CATALOGO, getCampoCustomMeta, type ItemCustomColeta,
} from "@shared/coletaCampos";

const FC_NAVY = "#1B2A4A";

const CAMPO_LABELS: Record<string, string> = {
  telefone: "Telefone",
  celular: "Celular / WhatsApp",
  contatoEmergencia: "Contato de emergência",
  telefoneEmergencia: "Tel. emergência",
  parentescoEmergencia: "Parentesco",
  logradouro: "Logradouro",
  numero: "Número",
  complemento: "Complemento",
  bairro: "Bairro",
  cidade: "Cidade",
  estado: "UF",
  cep: "CEP",
  tamanhoCalcado: "Calçado",
  tamanhoCamisa: "Camisa",
  tamanhoCalca: "Calça",
};

const CAMPO_ORDER = Object.keys(CAMPO_LABELS);

export default function ColetaCampo() {
  const { selectedCompanyId, companies, isConstrutoras, getCompanyIdsForQuery } = useCompany();
  const { isAdminMaster, isAdmin } = usePermissions();
  // Rev. 2901 — só Adm e Adm Master podem gerar/editar/excluir/desativar links.
  const canManage = isAdmin || isAdminMaster;
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const companyId = selectedCompanyId && !isConstrutoras ? parseInt(selectedCompanyId) : undefined;
  const queryCompanyIds = getCompanyIdsForQuery();
  const queryCompanyId = isConstrutoras ? (queryCompanyIds[0] ?? 0) : (companyId ?? 0);
  const hasValidSelection = isConstrutoras ? queryCompanyIds.length > 0 : !!companyId;
  const baseInput = useMemo(
    () => ({ companyId: queryCompanyId, companyIds: isConstrutoras ? queryCompanyIds : undefined }),
    [queryCompanyId, isConstrutoras, queryCompanyIds],
  );

  const [tab, setTab] = useState<"links" | "fila">("links");

  // ── Links ────────────────────────────────────────────────────────────────
  const obrasQ = trpc.coletaRh.obrasDisponiveis.useQuery(baseInput, { enabled: hasValidSelection });
  const sessoesQ = trpc.coletaRh.listarSessoes.useQuery(baseInput, { enabled: hasValidSelection });

  const [novaObraId, setNovaObraId] = useState<string>("");
  const [novoTitulo, setNovoTitulo] = useState<string>("");
  const [qrSessao, setQrSessao] = useState<any | null>(null);
  const [copiado, setCopiado] = useState<number | null>(null);

  // Rev. 2868 — editar / excluir link (Adm Master).
  const [editSessao, setEditSessao] = useState<any | null>(null);
  const [editTitulo, setEditTitulo] = useState("");
  const [editGrupos, setEditGrupos] = useState<Set<GrupoColetaKey>>(new Set());
  const [excluirSessaoState, setExcluirSessaoState] = useState<any | null>(null);
  const editGruposArray = useMemo(() => GRUPOS_COLETA_KEYS.filter((k) => editGrupos.has(k)), [editGrupos]);
  const abrirEdicao = (s: any) => {
    setEditSessao(s);
    setEditTitulo(s.titulo || "");
    const atuais: GrupoColetaKey[] = Array.isArray(s.grupos) && s.grupos.length > 0
      ? (s.grupos as GrupoColetaKey[])
      : [...GRUPOS_COLETA_KEYS];
    setEditGrupos(new Set(atuais));
    setEditItensCustom(Array.isArray(s.itensCustom) ? s.itensCustom : []);
  };
  const toggleEditGrupo = (k: GrupoColetaKey) =>
    setEditGrupos((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k); else n.add(k);
      return n;
    });

  // Rev. 2865 — grupos de informação que o auxiliar de campo vai coletar.
  // Default: todos marcados. A escolha vale para "Gerar link" e "Gerar todos".
  const [gruposSel, setGruposSel] = useState<Set<GrupoColetaKey>>(new Set(GRUPOS_COLETA_KEYS));
  const toggleGrupo = (k: GrupoColetaKey) =>
    setGruposSel((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k); else n.add(k);
      return n;
    });
  const gruposArray = useMemo(() => GRUPOS_COLETA_KEYS.filter((k) => gruposSel.has(k)), [gruposSel]);
  const algumGrupo = gruposArray.length > 0;

  // Rev. 2887 — itens EXTRAS definidos na hora (campo do funcionário + rótulo).
  // Valem para "Gerar link" e "Gerar todos"; persistem entre criações.
  const [itensCustom, setItensCustom] = useState<ItemCustomColeta[]>([]);
  const [editItensCustom, setEditItensCustom] = useState<ItemCustomColeta[]>([]);

  const criarM = trpc.coletaRh.criarSessao.useMutation({
    onSuccess: () => {
      toast({ title: "Link criado", description: "Link de coleta gerado com sucesso." });
      setNovaObraId(""); setNovoTitulo("");
      utils.coletaRh.listarSessoes.invalidate();
    },
    onError: (e) => toast({ title: "Erro ao criar link", description: e.message, variant: "destructive" }),
  });
  const toggleM = trpc.coletaRh.desativarSessao.useMutation({
    onSuccess: () => utils.coletaRh.listarSessoes.invalidate(),
    onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const editarM = trpc.coletaRh.editarSessao.useMutation({
    onSuccess: () => {
      toast({ title: "Link atualizado", description: "Alterações salvas com sucesso." });
      setEditSessao(null);
      utils.coletaRh.listarSessoes.invalidate();
    },
    onError: (e) => toast({ title: "Erro ao editar", description: e.message, variant: "destructive" }),
  });
  const excluirM = trpc.coletaRh.excluirSessao.useMutation({
    onSuccess: () => {
      toast({ title: "Link excluído", description: "O link de coleta foi removido." });
      setExcluirSessaoState(null);
      utils.coletaRh.listarSessoes.invalidate();
    },
    onError: (e) => toast({ title: "Erro ao excluir", description: e.message, variant: "destructive" }),
  });
  const criarTodasM = trpc.coletaRh.criarSessoesTodas.useMutation({
    onSuccess: (r) => {
      toast({
        title: "Links gerados",
        description: r.criadas > 0
          ? `${r.criadas} novo(s) link(s) criado(s)${r.reaproveitadas > 0 ? ` · ${r.reaproveitadas} já existiam` : ""} (${r.totalObras} obra(s) ativa(s)).`
          : `Todas as ${r.totalObras} obra(s) ativa(s) já tinham link.`,
      });
      utils.coletaRh.listarSessoes.invalidate();
    },
    onError: (e) => toast({ title: "Erro ao gerar links", description: e.message, variant: "destructive" }),
  });

  const linkFor = (token: string) => `${window.location.origin}/portal/coleta-rh/${token}`;
  const copiar = async (s: any) => {
    try {
      await navigator.clipboard.writeText(linkFor(s.token));
      setCopiado(s.id);
      setTimeout(() => setCopiado(null), 1500);
    } catch {
      toast({ title: "Copie manualmente", description: linkFor(s.token) });
    }
  };

  // Copia TODOS os links ativos de uma vez (obra → link), prontos p/ colar e enviar.
  const [copiouTodos, setCopiouTodos] = useState(false);
  const copiarTodos = async () => {
    const ativos = (sessoesQ.data || []).filter((s: any) => s.ativo === 1 && !s.expirada);
    if (ativos.length === 0) {
      toast({ title: "Nenhum link ativo", description: "Gere os links primeiro.", variant: "destructive" });
      return;
    }
    const texto = ativos
      .map((s: any) => `${s.obraNome || s.titulo}: ${linkFor(s.token)}`)
      .join("\n");
    try {
      await navigator.clipboard.writeText(texto);
      setCopiouTodos(true);
      setTimeout(() => setCopiouTodos(false), 1500);
      toast({ title: "Copiado", description: `${ativos.length} link(s) copiado(s) para a área de transferência.` });
    } catch {
      toast({ title: "Copie manualmente", description: texto });
    }
  };

  // ── Fila de revisão ───────────────────────────────────────────────────────
  const [statusFila, setStatusFila] = useState<"pendente" | "aprovada" | "rejeitada">("pendente");
  const respostasQ = trpc.coletaRh.listarRespostas.useQuery(
    { ...baseInput, status: statusFila },
    { enabled: hasValidSelection },
  );
  const [revisar, setRevisar] = useState<any | null>(null);
  const [motivoRej, setMotivoRej] = useState("");
  const [camposAceitos, setCamposAceitos] = useState<Set<string>>(new Set());
  const [aplicarFoto, setAplicarFoto] = useState(true);
  // Rev. 2872 — editar/excluir resposta da fila (Adm Master).
  const [editResp, setEditResp] = useState<any | null>(null);
  const [editRespDados, setEditRespDados] = useState<Record<string, string>>({});
  const [excluirRespState, setExcluirRespState] = useState<any | null>(null);
  // Rev. 2871 — seleção múltipla na fila (aprovar vários de uma vez).
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  // Reconcilia a seleção com os itens PENDENTES ainda visíveis (remove IDs
  // "fantasma" de respostas já aprovadas/rejeitadas individualmente).
  useEffect(() => {
    // Seleção múltipla vale para PENDENTES (aprovar em lote) e, p/ Adm Master,
    // para APROVADAS (cancelar aprovação em lote). Reconcilia com o status da aba.
    const selStatus = statusFila === "aprovada" ? "aprovada" : "pendente";
    const visiveis = new Set(
      (respostasQ.data || [])
        .filter((r: any) => r.status === selStatus)
        .map((r: any) => r.id),
    );
    setSelecionados((prev) => {
      let mudou = false;
      const n = new Set<number>();
      prev.forEach((id) => { if (visiveis.has(id)) n.add(id); else mudou = true; });
      return mudou ? n : prev;
    });
  }, [respostasQ.data, statusFila]);

  const aprovarM = trpc.coletaRh.aprovarResposta.useMutation({
    onSuccess: (r) => {
      toast({ title: "Aprovado", description: `${r.camposGravados.length} campo(s) gravado(s) na ficha.` });
      setRevisar(null);
      utils.coletaRh.listarRespostas.invalidate();
      utils.coletaRh.listarSessoes.invalidate();
    },
    onError: (e) => toast({ title: "Erro ao aprovar", description: e.message, variant: "destructive" }),
  });
  const rejeitarM = trpc.coletaRh.rejeitarResposta.useMutation({
    onSuccess: () => {
      toast({ title: "Rejeitado", description: "Resposta descartada." });
      setRevisar(null); setMotivoRej("");
      utils.coletaRh.listarRespostas.invalidate();
      utils.coletaRh.listarSessoes.invalidate();
    },
    onError: (e) => toast({ title: "Erro ao rejeitar", description: e.message, variant: "destructive" }),
  });
  const aprovarVariasM = trpc.coletaRh.aprovarVarias.useMutation({
    onSuccess: (r) => {
      toast({
        title: "Aprovação em lote concluída",
        description: `${r.aprovadas} aprovado(s)${r.ignoradas ? ` · ${r.ignoradas} ignorado(s)` : ""}.`,
      });
      setSelecionados(new Set());
      utils.coletaRh.listarRespostas.invalidate();
      utils.coletaRh.listarSessoes.invalidate();
    },
    onError: (e) => toast({ title: "Erro ao aprovar em lote", description: e.message, variant: "destructive" }),
  });
  // Rev. 2906 — Adm Master cancela a aprovação de VÁRIAS respostas (volta p/ Pendentes).
  const [cancelarLoteOpen, setCancelarLoteOpen] = useState(false);
  const cancelarAprovacaoVariasM = trpc.coletaRh.cancelarAprovacaoVarias.useMutation({
    onSuccess: (r) => {
      toast({
        title: "Aprovação cancelada",
        description: `${r.canceladas} voltou(aram) para Pendentes${r.ignoradas ? ` · ${r.ignoradas} ignorado(s)` : ""}.`,
      });
      setSelecionados(new Set());
      setCancelarLoteOpen(false);
      utils.coletaRh.listarRespostas.invalidate();
      utils.coletaRh.listarSessoes.invalidate();
    },
    onError: (e) => toast({ title: "Erro ao cancelar aprovação", description: e.message, variant: "destructive" }),
  });
  const editarRespM = trpc.coletaRh.editarResposta.useMutation({
    onSuccess: () => {
      toast({ title: "Resposta atualizada", description: "Os dados coletados foram corrigidos." });
      setEditResp(null); setEditRespDados({});
      utils.coletaRh.listarRespostas.invalidate();
    },
    onError: (e) => toast({ title: "Erro ao editar", description: e.message, variant: "destructive" }),
  });
  const excluirRespM = trpc.coletaRh.excluirResposta.useMutation({
    onSuccess: () => {
      toast({ title: "Resposta excluída", description: "Removida da fila de revisão." });
      setExcluirRespState(null);
      utils.coletaRh.listarRespostas.invalidate();
    },
    onError: (e) => toast({ title: "Erro ao excluir", description: e.message, variant: "destructive" }),
  });

  const abrirEditarResp = (r: any) => {
    const d: Record<string, string> = {};
    for (const k of CAMPO_ORDER) {
      const v = r.dados?.[k];
      d[k] = v == null ? "" : String(v);
    }
    // Rev. 2887 — também carrega os itens extras desta sessão.
    for (const it of (r.itensCustom || [])) {
      const v = r.dados?.[it.campo];
      d[it.campo] = v == null ? "" : String(v);
    }
    setEditRespDados(d);
    setEditResp(r);
  };

  const toggleSelecionado = (id: number) => {
    setSelecionados((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const abrirRevisao = (r: any) => {
    setRevisar(r);
    setMotivoRej("");
    setAplicarFoto(true);
    // por padrão aceita todos os campos enviados não-vazios
    const enviados = Object.keys(r.dados || {}).filter((k) => {
      const v = r.dados[k];
      return typeof v === "string" ? v.trim() !== "" : v != null;
    });
    setCamposAceitos(new Set(enviados));
  };

  const toggleCampo = (k: string) => {
    setCamposAceitos((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k); else n.add(k);
      return n;
    });
  };

  if (!hasValidSelection) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Selecione uma empresa para gerenciar a Coleta de Campo.</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-5">
      {/* Cabeçalho */}
      <div className="rounded-xl p-5 text-white shadow-sm" style={{ background: `linear-gradient(120deg, ${FC_NAVY}, #2c4470)` }}>
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-white/15 p-2 shrink-0"><ClipboardList className="h-6 w-6" /></div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold tracking-wide">Coleta de Campo — RH</h1>
            <p className="text-sm text-white/80">
              Gere um link por obra para o auxiliar coletar dados pelo celular. Tudo passa pela fila de revisão antes de gravar na ficha.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => { if (window.history.length > 1) window.history.back(); else setLocation("/"); }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 hover:bg-white/25 px-3 py-1.5 text-sm font-medium transition"
              title="Voltar"
            >
              <ArrowLeft className="h-4 w-4" /> <span className="hidden sm:inline">Voltar</span>
            </button>
            <button
              onClick={() => setLocation("/")}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 hover:bg-white/25 px-3 py-1.5 text-sm font-medium transition"
              title="Fechar"
            >
              <X className="h-4 w-4" /> <span className="hidden sm:inline">Fechar</span>
            </button>
          </div>
        </div>
      </div>

      {/* Abas */}
      <div className="flex gap-2 border-b overflow-x-auto">
        <button
          onClick={() => setTab("links")}
          className={`shrink-0 whitespace-nowrap px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${tab === "links" ? "border-[#1B2A4A] text-[#1B2A4A]" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          <Link2 className="inline h-4 w-4 mr-1" /> Links por Obra
        </button>
        <button
          onClick={() => setTab("fila")}
          className={`shrink-0 whitespace-nowrap px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${tab === "fila" ? "border-[#1B2A4A] text-[#1B2A4A]" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          <Clock className="inline h-4 w-4 mr-1" /> Fila de Revisão
        </button>
      </div>

      {tab === "links" && (
        <div className="space-y-4">
          {!canManage && (
            <div className="rounded-xl border bg-muted/40 p-4 text-sm text-muted-foreground">
              Apenas o Administrador (ou Administrador Master) pode gerar, editar ou excluir links de coleta. Você pode copiar e enviar os links já existentes.
            </div>
          )}
          {/* Gerar para todas as obras ativas de uma vez */}
          {canManage && (
          <div className="rounded-xl border bg-card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1">
              <h2 className="font-semibold">Gerar para todas as obras ativas</h2>
              <p className="text-xs text-muted-foreground">
                Cria um link para cada obra ativa de uma vez{obrasQ.data ? ` (${obrasQ.data.length} ativa(s))` : ""}. Obras que já têm link ativo são reaproveitadas. Depois é só copiar e enviar para cada responsável.
              </p>
            </div>
            <div className="flex gap-2 shrink-0 w-full sm:w-auto">
              <Button
                className="flex-1 sm:flex-none"
                disabled={criarTodasM.isPending || (obrasQ.data || []).length === 0 || !algumGrupo}
                onClick={() => criarTodasM.mutate({ ...baseInput, grupos: gruposArray, itensCustom })}
                style={{ background: FC_NAVY }}
              >
                {criarTodasM.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Link2 className="h-4 w-4 mr-1" />}
                Gerar todos
              </Button>
              <Button variant="outline" className="flex-1 sm:flex-none" onClick={copiarTodos}>
                {copiouTodos ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
                Copiar todos
              </Button>
            </div>
          </div>
          )}

          {/* Criar */}
          {canManage && (
          <div className="rounded-xl border bg-card p-4">
            <h2 className="font-semibold mb-3">Novo link de coleta</h2>
            <div className="flex flex-col md:flex-row gap-3 md:items-end">
              <div className="flex-1">
                <Label className="text-xs">Obra</Label>
                <Select value={novaObraId} onValueChange={setNovaObraId}>
                  <SelectTrigger><SelectValue placeholder="Selecione a obra" /></SelectTrigger>
                  <SelectContent>
                    {(obrasQ.data || []).map((o: any) => (
                      <SelectItem key={o.id} value={String(o.id)}>
                        {o.nome}{o.cidade ? ` — ${o.cidade}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <Label className="text-xs">Título (opcional)</Label>
                <Input value={novoTitulo} onChange={(e) => setNovoTitulo(e.target.value)} placeholder="Ex.: Coleta EPI — Outubro" />
              </div>
              <Button
                disabled={!novaObraId || criarM.isPending || !algumGrupo}
                onClick={() => criarM.mutate({ ...baseInput, obraId: parseInt(novaObraId), titulo: novoTitulo || undefined, grupos: gruposArray, itensCustom })}
                style={{ background: FC_NAVY }}
              >
                {criarM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4 mr-1" />}
                Gerar link
              </Button>
            </div>

            {/* Rev. 2865 — escolha do que será coletado (aplica a este link e ao "Gerar todos") */}
            <div className="mt-4 border-t pt-3">
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs font-medium">O que o auxiliar vai coletar?</Label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setGruposSel(new Set(GRUPOS_COLETA_KEYS))}
                    className="text-[11px] text-muted-foreground hover:text-foreground underline"
                  >
                    Marcar todos
                  </button>
                  <button
                    type="button"
                    onClick={() => setGruposSel(new Set())}
                    className="text-[11px] text-muted-foreground hover:text-foreground underline"
                  >
                    Limpar
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                {GRUPOS_COLETA.map((g) => {
                  const on = gruposSel.has(g.key);
                  return (
                    <button
                      key={g.key}
                      type="button"
                      onClick={() => toggleGrupo(g.key)}
                      title={g.descricao}
                      className={`flex flex-col items-start gap-1 rounded-lg border p-2.5 text-left transition ${on ? "border-[#1B2A4A] bg-[#1B2A4A]/5 ring-1 ring-[#1B2A4A]/30" : "border-border bg-background hover:bg-muted"}`}
                    >
                      <div className="flex items-center gap-1.5 w-full">
                        <span className="text-base leading-none">{g.emoji}</span>
                        <span className="text-sm font-medium truncate flex-1">{g.label}</span>
                        {on
                          ? <CheckCircle2 className="h-4 w-4 text-[#1B2A4A] shrink-0" />
                          : <span className="h-4 w-4 rounded-full border border-muted-foreground/40 shrink-0" />}
                      </div>
                      <span className="text-[10px] text-muted-foreground leading-tight">{g.descricao}</span>
                    </button>
                  );
                })}
              </div>
              {!algumGrupo && (
                <p className="text-[11px] text-amber-600 mt-2">Selecione ao menos um grupo para gerar o link.</p>
              )}

              {/* Rev. 2887 — itens extras definidos na hora */}
              <div className="mt-4 border-t pt-3">
                <Label className="text-xs font-medium">Itens extras (opcional)</Label>
                <p className="text-[11px] text-muted-foreground mb-2">
                  Peça outros dados ao auxiliar. Cada item grava automaticamente no campo da ficha ao aprovar.
                </p>
                <ItensCustomEditor itens={itensCustom} setItens={setItensCustom} />
              </div>
            </div>
          </div>
          )}

          {/* Lista */}
          <div className="rounded-xl border bg-card divide-y">
            {sessoesQ.isLoading && <div className="p-4 text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin mr-2" />Carregando…</div>}
            {!sessoesQ.isLoading && (sessoesQ.data || []).length === 0 && (
              <div className="p-6 text-center text-sm text-muted-foreground">Nenhum link criado ainda.</div>
            )}
            {(sessoesQ.data || []).map((s: any) => (
              <div key={s.id} className="p-4 flex flex-col md:flex-row md:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">{s.titulo}</span>
                    {/* Rev. 2902 — "Concluído" (todos os alocados coletados) tem prioridade sobre o estado do link. */}
                    {s.concluida
                      ? <Badge className="bg-blue-600">Concluído</Badge>
                      : s.ativo === 1 && !s.expirada
                        ? <Badge className="bg-emerald-600">Ativo</Badge>
                        : <Badge variant="secondary">{s.expirada ? "Expirado" : "Inativo"}</Badge>}
                    {s.pendentes > 0 && <Badge className="bg-amber-500">{s.pendentes} pendente(s)</Badge>}
                    {/* Rev. 2912 — destaca QUANTOS FALTAM coletar na obra (não só "X/Y coletado(s)"). */}
                    {!s.concluida && typeof s.totalAlocados === "number" && s.totalAlocados > 0 && (s.totalAlocados - s.coletados) > 0 && (
                      <Badge className="bg-orange-600">Faltam {s.totalAlocados - s.coletados} de {s.totalAlocados}</Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 truncate">
                    {s.obraNome} · {s.totalRespostas} envio(s)
                    {typeof s.totalAlocados === "number" && s.totalAlocados > 0
                      ? ` · ${s.coletados}/${s.totalAlocados} coletado(s)${(s.totalAlocados - s.coletados) > 0 ? ` · faltam ${s.totalAlocados - s.coletados}` : " · completo"}`
                      : ""} · criado por {s.criadoPor || "—"}
                  </div>
                  {Array.isArray(s.grupos) && s.grupos.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {GRUPOS_COLETA.filter((g) => s.grupos.includes(g.key)).map((g) => (
                        <span key={g.key} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          {g.emoji} {g.label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap shrink-0">
                  <Button size="sm" variant="outline" onClick={() => copiar(s)}>
                    {copiado === s.id ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    <span className="ml-1 hidden sm:inline">Copiar link</span>
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setQrSessao(s)}>
                    <QrCode className="h-4 w-4" /><span className="ml-1 hidden sm:inline">QR</span>
                  </Button>
                  {canManage && (
                    <>
                      <Button
                        size="sm"
                        variant={s.ativo === 1 ? "outline" : "default"}
                        onClick={() => toggleM.mutate({ ...baseInput, id: s.id, ativo: s.ativo === 1 ? 0 : 1 })}
                        style={s.ativo === 1 ? undefined : { background: FC_NAVY }}
                      >
                        <Power className="h-4 w-4" /><span className="ml-1 hidden sm:inline">{s.ativo === 1 ? "Desativar" : "Ativar"}</span>
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => abrirEdicao(s)}>
                        <Pencil className="h-4 w-4" /><span className="ml-1 hidden sm:inline">Editar</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                        onClick={() => setExcluirSessaoState(s)}
                      >
                        <Trash2 className="h-4 w-4" /><span className="ml-1 hidden sm:inline">Excluir</span>
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "fila" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(["pendente", "aprovada", "rejeitada"] as const).map((st) => (
              <button
                key={st}
                onClick={() => { setStatusFila(st); setSelecionados(new Set()); }}
                className={`px-3 py-1.5 rounded-full text-sm border transition ${statusFila === st ? "bg-[#1B2A4A] text-white border-[#1B2A4A]" : "bg-transparent text-muted-foreground hover:bg-muted"}`}
              >
                {st === "pendente" ? "Pendentes" : st === "aprovada" ? "Aprovadas" : "Rejeitadas"}
              </button>
            ))}
          </div>

          {(() => {
            const lista = respostasQ.data || [];
            // Rev. 2906 — multi-seleção: PENDENTES (aprovar em lote, qualquer revisor)
            // e APROVADAS (cancelar aprovação em lote, SÓ Adm Master).
            const modoCancelar = statusFila === "aprovada" && isAdminMaster;
            const selecionaveisLista = statusFila === "pendente"
              ? lista.filter((r: any) => r.status === "pendente")
              : modoCancelar
                ? lista.filter((r: any) => r.status === "aprovada")
                : [];
            const podeSelecionar = selecionaveisLista.length > 0;
            const todosSel = podeSelecionar && selecionaveisLista.every((r: any) => selecionados.has(r.id));
            const toggleTodos = () => {
              setSelecionados(todosSel ? new Set() : new Set(selecionaveisLista.map((r: any) => r.id)));
            };
            return (
              <>
                {podeSelecionar && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-muted/40 px-4 py-2.5">
                    <button onClick={toggleTodos} className="flex items-center gap-2 text-sm font-medium">
                      {todosSel ? <CheckSquare className="h-4 w-4 text-[#1B2A4A]" /> : <Square className="h-4 w-4 text-muted-foreground" />}
                      {todosSel ? "Desmarcar todos" : "Selecionar todos"}
                    </button>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">{selecionados.size} selecionado(s)</span>
                      {modoCancelar ? (
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={selecionados.size === 0 || cancelarAprovacaoVariasM.isPending}
                          onClick={() => setCancelarLoteOpen(true)}
                        >
                          {cancelarAprovacaoVariasM.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RotateCcw className="h-4 w-4 mr-1" />}
                          Cancelar aprovação
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-700"
                          disabled={selecionados.size === 0 || aprovarVariasM.isPending}
                          onClick={() => aprovarVariasM.mutate({ ...baseInput, ids: Array.from(selecionados) })}
                        >
                          {aprovarVariasM.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />}
                          Aprovar selecionados
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                <div className="rounded-xl border bg-card divide-y">
                  {respostasQ.isLoading && <div className="p-4 text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin mr-2" />Carregando…</div>}
                  {!respostasQ.isLoading && lista.length === 0 && (
                    <div className="p-6 text-center text-sm text-muted-foreground">Nenhuma resposta {statusFila === "pendente" ? "pendente" : statusFila + "s"}.</div>
                  )}
                  {lista.map((r: any) => {
                    const nEnviados = Object.keys(r.dados || {}).length;
                    const fotoExibir = r.fotoUrl || r.empFotoAtual;
                    const selecionavel = (statusFila === "pendente" && r.status === "pendente")
                      || (modoCancelar && r.status === "aprovada");
                    const sel = selecionados.has(r.id);
                    return (
                      <div key={r.id} className={`p-4 flex items-center gap-3 ${sel ? "bg-emerald-50/60" : ""}`}>
                        {selecionavel && (
                          <button onClick={() => toggleSelecionado(r.id)} className="shrink-0" aria-label="Selecionar">
                            {sel ? <CheckSquare className="h-5 w-5 text-emerald-600" /> : <Square className="h-5 w-5 text-muted-foreground" />}
                          </button>
                        )}
                        <div className="h-12 w-12 rounded-full bg-muted overflow-hidden shrink-0 flex items-center justify-center ring-1 ring-border">
                          {fotoExibir ? <img src={fotoExibir} alt={r.empNome || ""} className="h-full w-full object-cover" /> : <ImageIcon className="h-5 w-5 text-muted-foreground" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{r.empNome || `#${r.employeeId}`}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {r.empFuncao || "—"} · {r.obraNome} · {nEnviados} campo(s){r.fotoUrl ? " + foto" : ""}
                            {r.enviadoPor ? ` · por ${r.enviadoPor}` : ""}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {r.status === "pendente"
                            ? <Button size="sm" onClick={() => abrirRevisao(r)} style={{ background: FC_NAVY }}><Eye className="h-4 w-4 mr-1" />Revisar</Button>
                            : r.status === "aprovada"
                              ? <Badge className="bg-emerald-600"><CheckCircle2 className="h-3 w-3 mr-1" />Aprovada</Badge>
                              : <Badge variant="secondary"><XCircle className="h-3 w-3 mr-1" />Rejeitada</Badge>}
                          {isAdminMaster && (
                            <>
                              <Button size="icon" variant="ghost" className="h-8 w-8" title="Editar dados coletados" onClick={() => abrirEditarResp(r)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-8 w-8 text-red-600 hover:text-red-700" title="Excluir resposta" onClick={() => setExcluirRespState(r)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* Dialog QR */}
      <Dialog open={!!qrSessao} onOpenChange={(o) => !o && setQrSessao(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>QR Code da coleta</DialogTitle>
            <DialogDescription>{qrSessao?.titulo}</DialogDescription>
          </DialogHeader>
          {qrSessao && (
            <div className="flex flex-col items-center gap-3">
              <div className="bg-white p-3 rounded-lg border">
                <QRCodeSVG value={linkFor(qrSessao.token)} size={200} level="H" includeMargin />
              </div>
              <p className="text-xs text-muted-foreground break-all text-center">{linkFor(qrSessao.token)}</p>
              <Button variant="outline" size="sm" onClick={() => copiar(qrSessao)}>
                <Copy className="h-4 w-4 mr-1" />Copiar link
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Rev. 2868 — Dialog editar link (Adm Master) */}
      <Dialog open={!!editSessao} onOpenChange={(o) => !o && setEditSessao(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar link de coleta</DialogTitle>
            <DialogDescription>
              {editSessao?.obraNome ? `Obra: ${editSessao.obraNome}` : "Ajuste o título e o que será coletado."}
            </DialogDescription>
          </DialogHeader>
          {editSessao && (
            <div className="space-y-4">
              <div>
                <Label className="text-xs">Título</Label>
                <Input
                  value={editTitulo}
                  onChange={(e) => setEditTitulo(e.target.value)}
                  placeholder="Ex.: Coleta EPI — Outubro"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-xs font-medium">O que o auxiliar vai coletar?</Label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setEditGrupos(new Set(GRUPOS_COLETA_KEYS))}
                      className="text-[11px] text-muted-foreground hover:text-foreground underline"
                    >
                      Marcar todos
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditGrupos(new Set())}
                      className="text-[11px] text-muted-foreground hover:text-foreground underline"
                    >
                      Limpar
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {GRUPOS_COLETA.map((g) => {
                    const on = editGrupos.has(g.key);
                    return (
                      <button
                        key={g.key}
                        type="button"
                        onClick={() => toggleEditGrupo(g.key)}
                        title={g.descricao}
                        className={`flex items-center gap-1.5 rounded-lg border p-2.5 text-left transition ${on ? "border-[#1B2A4A] bg-[#1B2A4A]/5 ring-1 ring-[#1B2A4A]/30" : "border-border bg-background hover:bg-muted"}`}
                      >
                        <span className="text-base leading-none">{g.emoji}</span>
                        <span className="text-sm font-medium truncate flex-1">{g.label}</span>
                        {on
                          ? <CheckCircle2 className="h-4 w-4 text-[#1B2A4A] shrink-0" />
                          : <span className="h-4 w-4 rounded-full border border-muted-foreground/40 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
                {editGruposArray.length === 0 && (
                  <p className="text-[11px] text-amber-600 mt-2">Selecione ao menos um grupo.</p>
                )}
              </div>

              {/* Rev. 2887 — itens extras deste link */}
              <div className="border-t pt-3">
                <Label className="text-xs font-medium">Itens extras (opcional)</Label>
                <p className="text-[11px] text-muted-foreground mb-2">
                  Cada item grava automaticamente no campo da ficha ao aprovar.
                </p>
                <ItensCustomEditor itens={editItensCustom} setItens={setEditItensCustom} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditSessao(null)}>Cancelar</Button>
            <Button
              disabled={editarM.isPending || editGruposArray.length === 0}
              onClick={() => editSessao && editarM.mutate({
                ...baseInput,
                id: editSessao.id,
                titulo: editTitulo.trim() || undefined,
                grupos: editGruposArray,
                itensCustom: editItensCustom,
              })}
              style={{ background: FC_NAVY }}
            >
              {editarM.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rev. 2868 — Dialog confirmar exclusão (Adm Master) */}
      <Dialog open={!!excluirSessaoState} onOpenChange={(o) => !o && setExcluirSessaoState(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" /> Excluir link de coleta
            </DialogTitle>
            <DialogDescription>
              O link <span className="font-medium">{excluirSessaoState?.titulo}</span>
              {excluirSessaoState?.obraNome ? ` (${excluirSessaoState.obraNome})` : ""} deixará de funcionar e sairá da lista.
              {excluirSessaoState?.totalRespostas > 0
                ? ` Os ${excluirSessaoState.totalRespostas} envio(s) já recebidos permanecem na fila de revisão.`
                : ""}
              {" "}Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExcluirSessaoState(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={excluirM.isPending}
              onClick={() => excluirSessaoState && excluirM.mutate({ ...baseInput, id: excluirSessaoState.id })}
            >
              {excluirM.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Trash2 className="h-4 w-4 mr-1" />}
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog revisão */}
      <Dialog open={!!revisar} onOpenChange={(o) => !o && setRevisar(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Revisar coleta — {revisar?.empNome}</DialogTitle>
            <DialogDescription>
              Marque os campos que devem substituir o valor atual na ficha. Em branco = mantém o atual.
            </DialogDescription>
          </DialogHeader>

          {revisar && (
            <div className="space-y-4">
              {revisar.fotoUrl && (
                <div className="flex items-center gap-3 rounded-lg border p-3">
                  <img src={revisar.fotoUrl} alt="" className="h-16 w-16 rounded object-cover" />
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={aplicarFoto} onChange={(e) => setAplicarFoto(e.target.checked)} />
                    Aplicar esta foto como foto do funcionário
                  </label>
                </div>
              )}

              <div className="rounded-lg border divide-y">
                <div className="grid grid-cols-[24px_1fr_1fr] gap-2 px-3 py-2 text-xs font-medium text-muted-foreground bg-muted/50">
                  <span></span><span>Atual</span><span>Coletado</span>
                </div>
                {CAMPO_ORDER.map((k) => {
                  const novo = revisar.dados?.[k];
                  const atual = revisar.atual?.[k];
                  const temNovo = typeof novo === "string" ? novo.trim() !== "" : novo != null;
                  if (!temNovo) return null;
                  const mudou = String(atual ?? "") !== String(novo ?? "");
                  return (
                    <div key={k} className="grid grid-cols-[24px_1fr_1fr] gap-2 px-3 py-2 items-center text-sm">
                      <input type="checkbox" checked={camposAceitos.has(k)} onChange={() => toggleCampo(k)} />
                      <div className="min-w-0">
                        <div className="text-[10px] uppercase text-muted-foreground">{CAMPO_LABELS[k]}</div>
                        <div className="truncate text-muted-foreground">{atual ?? "—"}</div>
                      </div>
                      <div className={`min-w-0 flex items-center gap-1 ${mudou ? "font-medium" : ""}`}>
                        {mudou && <ArrowRight className="h-3 w-3 text-emerald-600 shrink-0" />}
                        <span className="truncate">{novo}</span>
                      </div>
                    </div>
                  );
                })}
                {/* Rev. 2887 — itens extras coletados neste link */}
                {(revisar.itensCustom || []).map((it: any) => {
                  const k = it.campo;
                  const novo = revisar.dados?.[k];
                  const atual = revisar.atual?.[k];
                  const temNovo = typeof novo === "string" ? novo.trim() !== "" : novo != null;
                  if (!temNovo) return null;
                  const mudou = String(atual ?? "") !== String(novo ?? "");
                  return (
                    <div key={`custom-${k}`} className="grid grid-cols-[24px_1fr_1fr] gap-2 px-3 py-2 items-center text-sm">
                      <input type="checkbox" checked={camposAceitos.has(k)} onChange={() => toggleCampo(k)} />
                      <div className="min-w-0">
                        <div className="text-[10px] uppercase text-muted-foreground">{it.label}</div>
                        <div className="truncate text-muted-foreground">{atual ?? "—"}</div>
                      </div>
                      <div className={`min-w-0 flex items-center gap-1 ${mudou ? "font-medium" : ""}`}>
                        {mudou && <ArrowRight className="h-3 w-3 text-emerald-600 shrink-0" />}
                        <span className="truncate">{novo}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div>
                <Label className="text-xs">Motivo (caso rejeite)</Label>
                <Textarea value={motivoRej} onChange={(e) => setMotivoRej(e.target.value)} placeholder="Opcional" rows={2} />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => revisar && rejeitarM.mutate({ ...baseInput, id: revisar.id, motivo: motivoRej || undefined })}
              disabled={rejeitarM.isPending}
            >
              <X className="h-4 w-4 mr-1" />Rejeitar
            </Button>
            <Button
              style={{ background: FC_NAVY }}
              onClick={() => revisar && aprovarM.mutate({ ...baseInput, id: revisar.id, camposAceitos: Array.from(camposAceitos), aplicarFoto })}
              disabled={aprovarM.isPending}
            >
              {aprovarM.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />}
              Aprovar e gravar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rev. 2872 — Dialog editar dados coletados (Adm Master) */}
      <Dialog open={!!editResp} onOpenChange={(o) => { if (!o) { setEditResp(null); setEditRespDados({}); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar dados coletados — {editResp?.empNome}</DialogTitle>
            <DialogDescription>
              Corrija o que o auxiliar digitou. Campos em branco ficam sem valor. Isto NÃO altera a ficha do funcionário nem o status da revisão.
            </DialogDescription>
          </DialogHeader>
          {editResp && (
            <div className="grid gap-3 sm:grid-cols-2">
              {CAMPO_ORDER.map((k) => (
                <div key={k}>
                  <Label className="text-xs">{CAMPO_LABELS[k]}</Label>
                  <Input
                    value={editRespDados[k] ?? ""}
                    onChange={(e) => setEditRespDados((prev) => ({ ...prev, [k]: e.target.value }))}
                  />
                </div>
              ))}
              {/* Rev. 2887 — itens extras deste link */}
              {(editResp.itensCustom || []).map((it: any) => (
                <div key={`custom-${it.campo}`}>
                  <Label className="text-xs">{it.label}</Label>
                  <Input
                    value={editRespDados[it.campo] ?? ""}
                    onChange={(e) => setEditRespDados((prev) => ({ ...prev, [it.campo]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditResp(null); setEditRespDados({}); }}>Cancelar</Button>
            <Button
              disabled={editarRespM.isPending}
              onClick={() => {
                if (!editResp) return;
                const dadosCustom: Record<string, string> = {};
                for (const it of (editResp.itensCustom || [])) {
                  dadosCustom[it.campo] = editRespDados[it.campo] ?? "";
                }
                editarRespM.mutate({
                  ...baseInput,
                  id: editResp.id,
                  dados: editRespDados,
                  dadosCustom: Object.keys(dadosCustom).length > 0 ? dadosCustom : undefined,
                });
              }}
              style={{ background: FC_NAVY }}
            >
              {editarRespM.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rev. 2872 — Dialog confirmar exclusão de resposta (Adm Master) */}
      <Dialog open={!!excluirRespState} onOpenChange={(o) => !o && setExcluirRespState(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" /> Excluir resposta
            </DialogTitle>
            <DialogDescription>
              A coleta de <span className="font-medium">{excluirRespState?.empNome}</span> sairá da fila de revisão.
              {" "}Isto não altera a ficha do funcionário e não pode ser desfeito.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExcluirRespState(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={excluirRespM.isPending}
              onClick={() => excluirRespState && excluirRespM.mutate({ ...baseInput, id: excluirRespState.id })}
            >
              {excluirRespM.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Trash2 className="h-4 w-4 mr-1" />}
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rev. 2906 — Confirmação: Adm Master cancela aprovação em lote (volta p/ Pendentes). */}
      <Dialog open={cancelarLoteOpen} onOpenChange={(o) => !o && setCancelarLoteOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <RotateCcw className="h-5 w-5" /> Cancelar aprovação
            </DialogTitle>
            <DialogDescription>
              <span className="font-medium">{selecionados.size}</span> resposta(s) aprovada(s) voltarão para a aba
              {" "}<span className="font-medium">Pendentes</span> para nova revisão. Os dados já gravados na ficha do
              {" "}funcionário NÃO são desfeitos.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelarLoteOpen(false)}>Voltar</Button>
            <Button
              variant="destructive"
              disabled={selecionados.size === 0 || cancelarAprovacaoVariasM.isPending}
              onClick={() => cancelarAprovacaoVariasM.mutate({ ...baseInput, ids: Array.from(selecionados) })}
            >
              {cancelarAprovacaoVariasM.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RotateCcw className="h-4 w-4 mr-1" />}
              Cancelar aprovação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Rev. 2887 — Editor de ITENS EXTRAS: cada item mapeia um campo do funcionário
// (escolhido do catálogo) para um rótulo que o auxiliar vê no celular. Na
// aprovação, o valor coletado grava AUTOMÁTICO no campo correspondente da ficha.
function ItensCustomEditor({
  itens,
  setItens,
}: {
  itens: ItemCustomColeta[];
  setItens: (v: ItemCustomColeta[]) => void;
}) {
  const usados = new Set(itens.map((i) => i.campo));
  const disponiveis = CAMPOS_CUSTOM_CATALOGO.filter((c) => !usados.has(c.campo));
  const add = (campo: string) => {
    const meta = getCampoCustomMeta(campo);
    if (!meta) return;
    setItens([...itens, { campo, label: meta.label }]);
  };
  const remove = (campo: string) => setItens(itens.filter((i) => i.campo !== campo));
  const setLabel = (campo: string, label: string) =>
    setItens(itens.map((i) => (i.campo === campo ? { ...i, label } : i)));
  return (
    <div className="space-y-2">
      {itens.length > 0 && (
        <div className="space-y-2">
          {itens.map((it) => (
            <div key={it.campo} className="flex items-center gap-2">
              <Input
                value={it.label}
                onChange={(e) => setLabel(it.campo, e.target.value)}
                placeholder={getCampoCustomMeta(it.campo)?.label}
                className="flex-1 h-9"
              />
              <Badge variant="secondary" className="shrink-0 whitespace-nowrap">
                grava em: {getCampoCustomMeta(it.campo)?.label || it.campo}
              </Badge>
              <button
                type="button"
                onClick={() => remove(it.campo)}
                className="text-muted-foreground hover:text-red-600 shrink-0"
                title="Remover item"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
      {disponiveis.length > 0 ? (
        <Select value="" onValueChange={(v) => add(v)}>
          <SelectTrigger className="h-9">
            <SelectValue placeholder="+ Adicionar item extra…" />
          </SelectTrigger>
          <SelectContent>
            {disponiveis.map((c) => (
              <SelectItem key={c.campo} value={c.campo}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <p className="text-[11px] text-muted-foreground">Todos os campos extras disponíveis já foram adicionados.</p>
      )}
    </div>
  );
}
