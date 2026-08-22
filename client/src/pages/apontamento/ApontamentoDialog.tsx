// Task 150 — Dialog de APONTAMENTO DE PRODUÇÃO compartilhado entre:
//  • RondaTab (ApontamentoCampo) — lançamento livre / toque no ambiente;
//  • Editor de levantamento em modo Ronda (MedicaoLevantamento ?ronda=1) —
//    tocar num ambiente com a ferramenta de seleção abre este dialog.
// Regras: mesmo endpoint apontamentoCampo.criar (ledger ≤100%, lock 478008);
// o apontamento nunca gera dinheiro sozinho.
import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { MapPin, Loader2, AlertTriangle, Camera, X, Map as MapIcon, CalendarCheck } from "lucide-react";

const brQtd = (v: any) => {
  const n = Number(v);
  return isFinite(n) ? n.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "—";
};

export type NovoApontamento = {
  contornoId: number | null;
  pavimentoId: number | null;
  local?: string;
  servico: string;
  unidade: string;
  quantidadeTotal: number | null;
  rotulo?: string | null;
  percentual: number;
  data: string;
  observacoes?: string;
};

export default function ApontamentoDialog({
  companyId, obraId, novo, setNovo, servicos, jaPct, onSaved, onVerNaPlanta,
}: {
  companyId: number;
  obraId: number;
  novo: NovoApontamento;
  setNovo: (n: NovoApontamento | null) => void;
  // Catálogo p/ o seletor: [{ servico, unidade, nome? }]. `servico` é o
  // IDENTIFICADOR gravado no ledger (na Ronda = critérios de medição; no modo
  // Ronda do editor = a CHAVE da categoria do levantamento — a mesma gravada
  // em medicao_campo_contornos.servico e nos apontamentos por contorno).
  // `nome` é só exibição (fallback: o próprio identificador).
  servicos: any[];
  jaPct: number;   // % já apontado deste trecho+serviço (ledger)
  onSaved?: () => void;
  onVerNaPlanta?: () => void;
}) {
  const utils = trpc.useUtils();
  const [foto, setFoto] = useState<{ base64: string; contentType: string; preview: string } | null>(null);
  const [contratoEscolhido, setContratoEscolhido] = useState<number | null>(null);

  const resolQ = trpc.apontamentoCampo.resolverContrato.useQuery(
    { companyId, obraId, servico: novo?.servico || "", pavimentoId: novo?.pavimentoId ?? null },
    { enabled: !!novo?.servico },
  );
  const criarMut = trpc.apontamentoCampo.criar.useMutation({
    onSuccess: () => {
      toast.success("Produção apontada!");
      setNovo(null); setContratoEscolhido(null); setFoto(null);
      utils.apontamentoCampo.getRonda.invalidate({ companyId, obraId });
      utils.apontamentoCampo.previstoHoje.invalidate({ companyId, obraId });
      utils.apontamentoCampo.listar.invalidate();
      utils.apontamentoCampo.resumoObras.invalidate({ companyId });
      onSaved?.();
    },
    onError: (e: any) => toast.error(e?.message || "Erro ao apontar"),
  });

  const restante = Math.max(0, 100 - jaPct);

  // "Copiar também para" — família do serviço (ex.: chapisco → emboço, reboco):
  // irmãos derivados da MESMA base no catálogo; fallback por convenção de chave
  // quando o catálogo não traz derivaDe (Ronda por critérios). Cada cópia vira
  // um apontamento próprio (equipes/contratos podem ser diferentes — o server
  // resolve o contrato POR serviço).
  const FAMILIA_FALLBACK = ["chapisco", "emboco", "reboco"];
  const normKey = (s: string) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const familia = useMemo(() => {
    const atual = servicos.find((s: any) => s.servico === novo?.servico);
    let irmaos: any[] = [];
    if (atual?.derivaDe) {
      irmaos = servicos.filter((s: any) => s.servico !== atual.servico && s.derivaDe && s.derivaDe === atual.derivaDe);
    }
    if (irmaos.length === 0 && FAMILIA_FALLBACK.includes(normKey(novo?.servico || ""))) {
      irmaos = servicos.filter((s: any) => s.servico !== novo?.servico && FAMILIA_FALLBACK.includes(normKey(s.servico)));
    }
    return irmaos;
  }, [servicos, novo?.servico]);
  const [copiar, setCopiar] = useState<Record<string, boolean>>({});
  const [copiando, setCopiando] = useState(false);

  const candidatos: any[] = resolQ.data?.candidatos ?? [];
  const resolvido = resolQ.data?.resolvido ?? null;
  const contratoFinal = contratoEscolhido ?? resolvido?.id ?? null;

  // Selo "no cronograma de hoje": o vínculo com o Planejamento aparece AQUI, na
  // hora do apontamento (decisão do user 08/08/2026 — cronograma é contexto).
  const previstoQ = trpc.apontamentoCampo.previstoHoje.useQuery(
    { companyId, obraId },
    { enabled: !!novo?.servico, staleTime: 60_000 },
  );
  const noCronograma = useMemo(() => {
    const atvs: any[] = (previstoQ.data as any)?.atividades ?? [];
    if (!novo?.servico || !atvs.length) return null;
    const norm = (s: string) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const toks = (s: string) => norm(s).split(/[^a-z0-9]+/).filter((t) => t.length >= 4);
    const alvoDisp = servicos.find((s: any) => s.servico === novo.servico)?.nome || novo.servico;
    const meus = new Set([...toks(novo.servico), ...toks(String(alvoDisp))]);
    return atvs.find((a: any) => toks(a.nome).some((t: string) => meus.has(t))) || null;
  }, [previstoQ.data, novo?.servico, servicos]);

  return (
    <Dialog open onOpenChange={(o) => { if (!o) { setNovo(null); setContratoEscolhido(null); setFoto(null); } }}>
      <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <MapPin className="w-4 h-4 text-lime-600" /> <span className="flex-1 min-w-0 truncate">{novo.rotulo || novo.local || "Novo apontamento"}</span>
            {novo.contornoId != null && onVerNaPlanta && (
              <button type="button" className="text-[11px] font-semibold text-lime-700 flex items-center gap-1 shrink-0 mr-4"
                onClick={onVerNaPlanta}>
                <MapIcon className="w-3.5 h-3.5" /> ver na planta
              </button>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {novo.contornoId == null && (
            <div>
              <Label className="text-xs">Local (descreva o trecho)</Label>
              <Input className="h-11 rounded-xl" placeholder="Ex.: Apto 302, Fachada Norte..." value={novo.local || ""} onChange={(e) => setNovo({ ...novo, local: e.target.value })} />
            </div>
          )}
          <div>
            <Label className="text-xs">Serviço executado</Label>
            <Select value={novo.servico} onValueChange={(v) => { setContratoEscolhido(null); setCopiar({}); const sv = servicos.find((s: any) => s.servico === v); setNovo({ ...novo, servico: v, unidade: sv?.unidade || novo.unidade }); }}>
              <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Escolha o serviço" /></SelectTrigger>
              <SelectContent>
                {servicos.map((s: any) => <SelectItem key={s.servico} value={s.servico}>{s.nome ?? s.servico}</SelectItem>)}
                {/* categoria do contorno fora do catálogo → ainda assim selecionável */}
                {novo.servico && !servicos.some((s: any) => s.servico === novo.servico) && (
                  <SelectItem value={novo.servico}>{novo.servico}</SelectItem>
                )}
              </SelectContent>
            </Select>
            {noCronograma && (
              <div className="mt-1.5 flex items-start gap-1.5 rounded-lg bg-sky-50 border border-sky-200 px-2 py-1.5">
                <CalendarCheck className="w-3.5 h-3.5 text-sky-600 shrink-0 mt-0.5" />
                <span className="text-[11px] text-sky-800 min-w-0 break-words">
                  No cronograma de hoje: <b>{noCronograma.nome}</b>
                  {noCronograma.terminaHoje ? " · termina hoje" : noCronograma.atrasada ? " · atrasada" : ""}
                </span>
              </div>
            )}
            {familia.length > 0 && (
              <div className="mt-2">
                <p className="text-[11px] text-gray-500 mb-1">Copiar este lançamento também para:</p>
                <div className="flex flex-wrap gap-1.5">
                  {familia.map((f: any) => {
                    const on = !!copiar[f.servico];
                    return (
                      <button key={f.servico} type="button"
                        className={`rounded-xl border px-3 py-2 text-xs font-bold active:scale-95 ${on ? "border-lime-500 bg-lime-50 text-lime-700" : "border-slate-200 text-gray-500"}`}
                        onClick={() => setCopiar((c) => ({ ...c, [f.servico]: !c[f.servico] }))}>
                        {on ? "✓ " : ""}{f.nome ?? f.servico}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div>
            <Label className="text-xs">Quanto foi executado {jaPct > 0 && <span className="text-amber-600">(já apontado: {jaPct.toFixed(0)}%)</span>}</Label>
            <div className="grid grid-cols-4 gap-1.5 mt-1">
              {[25, 50, 75, 100].map((p) => {
                const val = Math.min(p, restante);
                return (
                  <button key={p} type="button" disabled={restante <= 0}
                    className={`rounded-xl border px-2 py-2.5 text-sm font-bold active:scale-95 ${Number(novo.percentual) === val && val > 0 ? "border-lime-500 bg-lime-50 text-lime-700" : "border-slate-200 text-gray-500"}`}
                    onClick={() => setNovo({ ...novo, percentual: val })}>{p === 100 ? "Tudo" : `${p}%`}</button>
                );
              })}
            </div>
            <div className="flex items-center gap-2 mt-1.5">
              <Input inputMode="numeric" className="h-10 w-20 text-right rounded-xl" value={String(novo.percentual ?? "")}
                onChange={(e) => setNovo({ ...novo, percentual: Math.max(0, Math.min(restante, Number(e.target.value.replace(",", ".")) || 0)) })} />
              <span className="text-xs text-gray-500">% deste trecho{novo.quantidadeTotal ? ` ≈ ${brQtd(novo.quantidadeTotal * (Number(novo.percentual) || 0) / 100)} ${novo.unidade}` : ""}</span>
            </div>
            {restante <= 0 && <p className="text-[11px] text-amber-600 mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Trecho já 100% apontado para este serviço.</p>}
          </div>

          <div>
            <Label className="text-xs">Contrato / equipe</Label>
            {resolQ.isLoading ? (
              <div className="text-xs text-gray-400 py-2"><Loader2 className="w-3.5 h-3.5 animate-spin inline mr-1" /> Buscando contratos...</div>
            ) : candidatos.length === 0 ? (
              <p className="text-[11px] text-gray-400 mt-1">Nenhum contrato ativo nesta obra — o apontamento fica sem vínculo (dá pra ligar depois).</p>
            ) : (
              <div className="flex flex-wrap gap-1.5 mt-1">
                {candidatos.map((c: any) => {
                  const ativo = contratoFinal === c.id;
                  const auto = resolvido?.id === c.id && !contratoEscolhido;
                  return (
                    <button key={c.id} type="button"
                      className={`rounded-full border px-3.5 py-2 text-[12px] font-medium active:scale-95 ${ativo ? "border-lime-500 bg-lime-100 text-lime-800" : "border-slate-200 bg-white text-gray-500"}`}
                      onClick={() => setContratoEscolhido(c.id)}>
                      {c.numeroContrato || c.descricao || `Contrato #${c.id}`}{auto && ativo ? " · automático" : ""}
                    </button>
                  );
                })}
              </div>
            )}
            {resolQ.data?.via === "frente" && <p className="text-[10px] text-lime-700 mt-1">Resolvido pelo Mapa de Frentes.</p>}
            {resolQ.data?.via === "ambiguo" && !contratoFinal && <p className="text-[10px] text-amber-600 mt-1">Mais de uma equipe faz este serviço — escolha o contrato (ou cadastre as frentes).</p>}
          </div>

          {/* Foto do serviço (câmera do celular) */}
          <div>
            <Label className="text-xs">Foto do serviço</Label>
            {foto ? (
              <div className="relative mt-1 inline-block">
                <img src={foto.preview} alt="Foto do serviço" className="h-24 rounded-xl border border-slate-200 object-cover" />
                <button type="button" className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center shadow"
                  onClick={() => setFoto(null)}><X className="w-3.5 h-3.5" /></button>
              </div>
            ) : (
              <label className="mt-1 flex items-center justify-center gap-2 h-12 rounded-xl border border-dashed border-slate-300 text-[13px] text-gray-500 font-medium cursor-pointer active:scale-[0.99]">
                <Camera className="w-4 h-4 text-lime-600" /> Tirar foto (opcional)
                <input type="file" accept="image/*" capture="environment" className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    if (f.size > 8 * 1024 * 1024) { toast.error("Foto muito grande (máx. 8 MB)."); return; }
                    const rd = new FileReader();
                    rd.onload = () => {
                      const dataUrl = String(rd.result || "");
                      const base64 = dataUrl.split(",")[1] || "";
                      setFoto({ base64, contentType: f.type || "image/jpeg", preview: dataUrl });
                    };
                    rd.readAsDataURL(f);
                    e.target.value = "";
                  }} />
              </label>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Data</Label>
              <Input type="date" className="h-11 rounded-xl" value={novo.data} onChange={(e) => setNovo({ ...novo, data: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Observação</Label>
              <Input className="h-11 rounded-xl" placeholder="opcional" value={novo.observacoes || ""} onChange={(e) => setNovo({ ...novo, observacoes: e.target.value })} />
            </div>
          </div>

          <Button className="w-full h-12 rounded-xl bg-lime-600 hover:bg-lime-700 text-white font-bold text-[15px]"
            disabled={criarMut.isPending || copiando || !novo.servico || Number(novo.percentual) <= 0 || (novo.contornoId == null && !String(novo.local || "").trim())}
            onClick={async () => {
              const pct = Math.min(Number(novo.percentual), restante);
              const base = {
                companyId, obraId,
                pavimentoId: novo.pavimentoId ?? null, contornoId: novo.contornoId ?? null,
                local: novo.local || null, servico: novo.servico,
                contratoId: contratoFinal, percentual: pct,
                quantidade: novo.quantidadeTotal ? novo.quantidadeTotal * pct / 100 : null,
                unidade: novo.unidade || "m2", data: novo.data,
                observacoes: novo.observacoes || null,
                fotoBase64: foto?.base64 || null, fotoContentType: foto?.contentType || null,
              };
              const alvos = familia.filter((f: any) => copiar[f.servico]);
              try {
                setCopiando(true);
                // cópias ANTES do principal (que fecha o dialog no onSuccess):
                // mesmo trecho/% pra cada serviço da família; contrato = o server
                // resolve POR serviço (equipes diferentes ⇒ contratos diferentes).
                for (const f of alvos) {
                  try {
                    await utils.client.apontamentoCampo.criar.mutate({
                      ...base, servico: f.servico, unidade: f.unidade || base.unidade,
                      contratoId: null, quantidade: null,
                      fotoBase64: null, fotoContentType: null,
                    } as any);
                    toast.success(`Copiado para ${f.nome ?? f.servico}`);
                  } catch (e: any) {
                    toast.error(`${f.nome ?? f.servico}: ${e?.message || "não copiou"}`);
                  }
                }
              } finally { setCopiando(false); }
              criarMut.mutate(base as any);
            }}>
            {criarMut.isPending || copiando ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null} Apontar produção{familia.filter((f: any) => copiar[f.servico]).length > 0 ? ` (+${familia.filter((f: any) => copiar[f.servico]).length})` : ""}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
