// Rev. 2858 — COLETA DE CAMPO (RH) — tela interna
// Gera/gerencia links externos por obra (token + QR, sem login) para um auxiliar
// de campo coletar dados dos funcionários alocados pelo celular, e revisa a fila
// (aprova → grava na ficha do employee; rejeita).
import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
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
  CheckCircle2, XCircle, Clock, ArrowRight, ImageIcon,
} from "lucide-react";

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
  const { toast } = useToast();
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
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-white/15 p-2"><ClipboardList className="h-6 w-6" /></div>
          <div>
            <h1 className="text-xl font-bold tracking-wide">Coleta de Campo — RH</h1>
            <p className="text-sm text-white/80">
              Gere um link por obra para o auxiliar coletar dados pelo celular. Tudo passa pela fila de revisão antes de gravar na ficha.
            </p>
          </div>
        </div>
      </div>

      {/* Abas */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setTab("links")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${tab === "links" ? "border-[#1B2A4A] text-[#1B2A4A]" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          <Link2 className="inline h-4 w-4 mr-1" /> Links por Obra
        </button>
        <button
          onClick={() => setTab("fila")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${tab === "fila" ? "border-[#1B2A4A] text-[#1B2A4A]" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          <Clock className="inline h-4 w-4 mr-1" /> Fila de Revisão
        </button>
      </div>

      {tab === "links" && (
        <div className="space-y-4">
          {/* Criar */}
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
                disabled={!novaObraId || criarM.isPending}
                onClick={() => criarM.mutate({ ...baseInput, obraId: parseInt(novaObraId), titulo: novoTitulo || undefined })}
                style={{ background: FC_NAVY }}
              >
                {criarM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4 mr-1" />}
                Gerar link
              </Button>
            </div>
          </div>

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
                    {s.ativo === 1 && !s.expirada
                      ? <Badge className="bg-emerald-600">Ativo</Badge>
                      : <Badge variant="secondary">{s.expirada ? "Expirado" : "Inativo"}</Badge>}
                    {s.pendentes > 0 && <Badge className="bg-amber-500">{s.pendentes} pendente(s)</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 truncate">
                    {s.obraNome} · {s.totalRespostas} envio(s) · criado por {s.criadoPor || "—"}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => copiar(s)}>
                    {copiado === s.id ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    <span className="ml-1 hidden sm:inline">Copiar link</span>
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setQrSessao(s)}>
                    <QrCode className="h-4 w-4" /><span className="ml-1 hidden sm:inline">QR</span>
                  </Button>
                  <Button
                    size="sm"
                    variant={s.ativo === 1 ? "outline" : "default"}
                    onClick={() => toggleM.mutate({ ...baseInput, id: s.id, ativo: s.ativo === 1 ? 0 : 1 })}
                    style={s.ativo === 1 ? undefined : { background: FC_NAVY }}
                  >
                    <Power className="h-4 w-4" /><span className="ml-1 hidden sm:inline">{s.ativo === 1 ? "Desativar" : "Ativar"}</span>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "fila" && (
        <div className="space-y-4">
          <div className="flex gap-2">
            {(["pendente", "aprovada", "rejeitada"] as const).map((st) => (
              <button
                key={st}
                onClick={() => setStatusFila(st)}
                className={`px-3 py-1.5 rounded-full text-sm border transition ${statusFila === st ? "bg-[#1B2A4A] text-white border-[#1B2A4A]" : "bg-transparent text-muted-foreground hover:bg-muted"}`}
              >
                {st === "pendente" ? "Pendentes" : st === "aprovada" ? "Aprovadas" : "Rejeitadas"}
              </button>
            ))}
          </div>

          <div className="rounded-xl border bg-card divide-y">
            {respostasQ.isLoading && <div className="p-4 text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin mr-2" />Carregando…</div>}
            {!respostasQ.isLoading && (respostasQ.data || []).length === 0 && (
              <div className="p-6 text-center text-sm text-muted-foreground">Nenhuma resposta {statusFila === "pendente" ? "pendente" : statusFila + "s"}.</div>
            )}
            {(respostasQ.data || []).map((r: any) => {
              const nEnviados = Object.keys(r.dados || {}).length;
              return (
                <div key={r.id} className="p-4 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-muted overflow-hidden shrink-0 flex items-center justify-center">
                    {r.fotoUrl ? <img src={r.fotoUrl} alt="" className="h-full w-full object-cover" /> : <ImageIcon className="h-5 w-5 text-muted-foreground" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{r.empNome || `#${r.employeeId}`}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {r.empFuncao || "—"} · {r.obraNome} · {nEnviados} campo(s){r.fotoUrl ? " + foto" : ""}
                      {r.enviadoPor ? ` · por ${r.enviadoPor}` : ""}
                    </div>
                  </div>
                  {r.status === "pendente"
                    ? <Button size="sm" onClick={() => abrirRevisao(r)} style={{ background: FC_NAVY }}><Eye className="h-4 w-4 mr-1" />Revisar</Button>
                    : r.status === "aprovada"
                      ? <Badge className="bg-emerald-600"><CheckCircle2 className="h-3 w-3 mr-1" />Aprovada</Badge>
                      : <Badge variant="secondary"><XCircle className="h-3 w-3 mr-1" />Rejeitada</Badge>}
                </div>
              );
            })}
          </div>
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
    </div>
  );
}
