/**
 * Rev. 4688 — Pop-ups de alertas do dia (estilo do lembrete de férias):
 * 1. Contratos de experiência vencendo hoje (antecipa fim de semana/feriado);
 * 2. Avisos prévios no prazo final de pagamento (art. 477 — dataFim+10);
 * 3. Aniversariantes do dia (antecipa E repete no 1º dia útil posterior).
 * RH vê os 3; Financeiro vê só o de avisos (quem paga é o Financeiro).
 * Cada alerta aparece 1x por sessão por dia/empresa (sessionStorage).
 */
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  X, FileSignature, AlertTriangle, Cake, ExternalLink, Banknote,
} from "lucide-react";

function formatDate(d: string | null | undefined) {
  if (!d) return "-";
  const p = String(d).slice(0, 10).split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : String(d);
}
const fmtBRL = (v: any) => {
  const n = parseFloat(String(v ?? "").replace(",", "."));
  return isFinite(n) ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
};

type Categoria = "contratos" | "avisos" | "aniversariantes";

export default function AlertasDiaPrompt({ modulo }: { modulo: "rh" | "financeiro" }) {
  const [, setLocation] = useLocation();
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery } = useCompany();
  // Number(): selectedCompanyId pode vir de localStorage como STRING — sem a
  // coerção o servidor rejeita ("expected number, received string").
  const companyId = Number(selectedCompanyId) || 0;
  const companyIds = getCompanyIdsForQuery().map(Number).filter(n => Number.isFinite(n) && n > 0);
  const enabled = isConstrutoras ? companyIds.length > 0 : companyId > 0;

  const { data } = trpc.home.getAlertasDia.useQuery(
    { companyId, escopo: modulo, ...(isConstrutoras ? { companyIds } : {}) } as any,
    { enabled, refetchOnWindowFocus: false, staleTime: 5 * 60 * 1000 },
  );

  const categorias: Categoria[] = modulo === "rh"
    ? ["contratos", "avisos", "aniversariantes"]
    : ["avisos"];

  const { user } = useAuth();
  // Rev. 4977 — chave POR USUÁRIO: cada usuário de RH/master resolve o seu
  const skipKey = `alertasDiaSkip:${user?.id ?? "anon"}:${modulo}:${companyId}:${data?.hoje ?? ""}`;
  const getSkipped = (): Set<string> => {
    try { return new Set(JSON.parse(sessionStorage.getItem(skipKey) || "[]")); }
    catch { return new Set(); }
  };
  const addSkipped = (c: string) => {
    try {
      const s = getSkipped(); s.add(c);
      sessionStorage.setItem(skipKey, JSON.stringify(Array.from(s)));
    } catch { /* noop */ }
  };

  const [aberto, setAberto] = useState<Categoria | null>(null);

  const pendentes = useMemo(() => {
    if (!data?.diaUtil) return [] as Categoria[];
    const skipped = getSkipped();
    return categorias.filter((c) => !skipped.has(c) && ((data as any)[c]?.length ?? 0) > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, companyId, modulo]);

  useEffect(() => {
    if (aberto) return;
    const skipped = getSkipped();
    const next = pendentes.find((c) => !skipped.has(c));
    if (next) setAberto(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendentes, aberto]);

  if (!aberto || !data) return null;

  const fechar = () => { addSkipped(aberto); setAberto(null); };
  const irPara = (rota: string) => { fechar(); setLocation(rota); };

  const itens: any[] = (data as any)[aberto] || [];
  const n = itens.length;

  const cfg = {
    contratos: {
      grad: "from-amber-500 via-orange-500 to-red-500",
      icon: <FileSignature className="h-6 w-6" />,
      titulo: n === 1
        ? "1 CONTRATO DE EXPERIÊNCIA ESTÁ VENCENDO HOJE!"
        : `${n} CONTRATOS DE EXPERIÊNCIA ESTÃO VENCENDO HOJE!`,
      sub: "Deseja prorrogar, efetivar ou desligar? Decida antes do vencimento — depois do prazo o contrato vira indeterminado automaticamente.",
      rota: "/painel/rh",
      rotaLabel: "Abrir Painel RH",
      borda: "border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50/40",
    },
    avisos: {
      grad: "from-rose-600 via-red-600 to-orange-600",
      icon: <Banknote className="h-6 w-6" />,
      titulo: n === 1
        ? "1 AVISO PRÉVIO ESTÁ VENCENDO HOJE!"
        : `${n} AVISOS PRÉVIOS ESTÃO VENCENDO HOJE!`,
      sub: "Prazo final de pagamento das verbas rescisórias (art. 477 CLT — 10 dias após o término). Atraso gera multa de 1 salário por funcionário.",
      rota: modulo === "financeiro" ? "/financeiro/contas-a-pagar" : "/aviso-previo",
      rotaLabel: modulo === "financeiro" ? "Abrir Contas a Pagar" : "Abrir Aviso Prévio",
      borda: "border-rose-200 bg-gradient-to-br from-rose-50 to-red-50/40",
    },
    aniversariantes: {
      grad: "from-pink-500 via-fuchsia-500 to-purple-500",
      icon: <Cake className="h-6 w-6" />,
      titulo: n === 1
        ? `${(itens[0]?.nome || "").split(" ")[0]} ESTÁ FAZENDO ANIVERSÁRIO${itens[0]?.quando === "hoje" ? " HOJE" : ""}!`
        : `${n} ANIVERSARIANTES${itens.every((i) => i.quando === "hoje") ? " HOJE" : ""}!`,
      sub: "Não deixe passar em branco — um parabéns faz diferença!",
      rota: "/painel/rh",
      rotaLabel: "Ver aniversariantes",
      borda: "border-pink-200 bg-gradient-to-br from-pink-50 to-fuchsia-50/40",
    },
  }[aberto];

  return (
    <Dialog open onOpenChange={(o) => { if (!o) fechar(); }}>
      {/* Rev. 4977 — z-[80] acima do alerta de locações; só fecha nos botões */}
      <DialogContent className="max-w-lg p-0 overflow-hidden border-0 shadow-2xl z-[80]"
        onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <div className={`relative bg-gradient-to-br ${cfg.grad} px-6 py-5 text-white`}>
          <button
            onClick={fechar}
            className="absolute right-4 top-4 rounded-full p-1.5 text-white/80 hover:bg-white/15 hover:text-white transition"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-white/15 p-2.5 ring-4 ring-white/20">{cfg.icon}</div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold leading-tight break-words">{cfg.titulo}</h2>
              <p className="text-xs text-white/90 mt-1 leading-relaxed">{cfg.sub}</p>
            </div>
          </div>
        </div>

        <div className="px-6 py-5 bg-white max-h-[45dvh] overflow-y-auto space-y-2.5">
          {itens.map((it) => (
            <div key={`${it.id}`} className={`rounded-xl border-2 ${cfg.borda} p-3 flex items-center gap-3`}>
              {it.fotoUrl ? (
                <img src={`${it.fotoUrl}${String(it.fotoUrl).includes("?") ? "&" : "?"}w=128`} loading="lazy"
                  className="h-10 w-10 rounded-full object-cover ring-2 ring-white shadow shrink-0" alt="" />
              ) : (
                <div className="h-10 w-10 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600 shrink-0">
                  {(it.nome || "?").split(" ").filter(Boolean).slice(0, 2).map((p: string) => p[0]).join("").toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-slate-900 break-words leading-tight">{it.nome}</div>
                {it.funcao && <div className="text-[11px] text-slate-500 break-words">{it.funcao}</div>}
                {aberto === "contratos" && (
                  <div className="text-[11px] text-slate-600 mt-0.5 tabular-nums">
                    {it.tipo === "30_30" ? "30+30" : "45+45"} · {it.periodo}º período · vence em <strong className={it.venceHoje ? "text-red-600" : "text-amber-700"}>{formatDate(it.vencimento)}</strong>
                    {!it.venceHoje && <span className="text-amber-700"> (fim de semana/feriado — resolva hoje)</span>}
                  </div>
                )}
                {aberto === "avisos" && (
                  <div className="text-[11px] text-slate-600 mt-0.5 tabular-nums">
                    Prazo pgto.: <strong className={it.venceHoje ? "text-red-600" : "text-amber-700"}>{formatDate(it.prazoPagamento)}</strong>
                    {!it.venceHoje && <span className="text-amber-700"> (dia não útil — pague hoje)</span>}
                    {" · "}{fmtBRL(it.valorEstimado)}
                    {it.enviadoFinanceiro && <span className="text-blue-600"> · já no Contas a Pagar</span>}
                  </div>
                )}
                {aberto === "aniversariantes" && (
                  <div className="text-[11px] text-slate-600 mt-0.5">
                    🎂 {formatDate(it.dataNascimento).slice(0, 5)}
                    {it.quando === "antecipado" && <span className="text-pink-600"> — cai no fim de semana/feriado</span>}
                    {it.quando === "atrasado" && <span className="text-pink-600"> — foi no fim de semana/feriado</span>}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="px-6 py-4 bg-gradient-to-r from-slate-50 to-slate-100/60 border-t border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2">
          <Button variant="outline" className="h-10" onClick={fechar}>Fechar</Button>
          <Button
            className="h-10 bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 shadow-md font-semibold"
            onClick={() => irPara(cfg.rota)}
          >
            <ExternalLink className="h-4 w-4 mr-1.5" />
            {cfg.rotaLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
