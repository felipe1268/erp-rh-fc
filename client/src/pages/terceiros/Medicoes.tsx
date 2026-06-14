import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle, XCircle, ClipboardCheck, Zap, ChevronLeft, ChevronRight, AlertTriangle, ShieldCheck, UserCheck, Crown, FileSignature, Building2, Ruler } from "lucide-react";
import { toast } from "sonner";

const BRL = (v: any) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v) || 0);
const fmtDate = (d: string | null | undefined) => {
  if (!d) return "—";
  const [y, m, day] = d.slice(0, 10).split("-");
  return `${day}/${m}/${y}`;
};

// Rev. 3103 — nome amigável da medição ("MED-01") + período em formato BR (MM/AAAA).
const medLabel = (numero: any) => `MED-${String(numero ?? 0).padStart(2, "0")}`;

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MESES_LONGO = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

// Extrai {ano, mes} de uma medição: usa `periodo` ("YYYY-MM") e, na falta, `dataReferencia`.
const periodoDe = (m: any): { ano: number; mes: number } | null => {
  const valido = (ano: number, mes: number) =>
    Number.isFinite(ano) && ano > 1900 && Number.isFinite(mes) && mes >= 1 && mes <= 12
      ? { ano, mes }
      : null;
  const p = String(m?.periodo ?? "").match(/(\d{4})-(\d{1,2})/);
  if (p) {
    const r = valido(parseInt(p[1], 10), parseInt(p[2], 10));
    if (r) return r;
  }
  const ref = String(m?.dataReferencia ?? "").slice(0, 10).split("-");
  if (ref.length >= 2 && ref[0] && ref[1]) return valido(parseInt(ref[0], 10), parseInt(ref[1], 10));
  return null;
};

// Período em formato BR (MM/AAAA); cai para o valor cru se não der pra interpretar.
const fmtPeriodo = (m: any): string => {
  const p = periodoDe(m);
  if (p) return `${String(p.mes).padStart(2, "0")}/${p.ano}`;
  const raw = String(m?.periodo ?? "").trim();
  return raw || "—";
};

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  rascunho:            { label: "Rascunho",            cls: "bg-gray-100 text-gray-600 border-gray-200" },
  aguardando_aprovacao:{ label: "Aguard. Aprovação",   cls: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  aprovada:            { label: "Aprovada",             cls: "bg-green-100 text-green-800 border-green-200" },
  paga:                { label: "Paga",                 cls: "bg-blue-100 text-blue-800 border-blue-200" },
  rejeitada:           { label: "Rejeitada",            cls: "bg-red-100 text-red-800 border-red-200" },
};

export default function Medicoes() {
  const [, navigate] = useLocation();
  const { companyId } = useCompany();
  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mesSel, setMesSel] = useState(hoje.getMonth() + 1);
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [motivoRejeicao, setMotivoRejeicao] = useState("");
  const [rejeitandoId, setRejeitandoId] = useState<number | null>(null);

  const utils = trpc.useUtils();
  const { data: medicoes = [], isLoading } = trpc.terceiroContratos.listarMedicoes.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );
  // Painel de Controle das Medições (Rev. 3078): liga/desliga o fluxo de 3 níveis por empresa.
  const { data: medCfg } = trpc.medicaoConfig.getConfig.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );
  const tresNiveis = medCfg?.aprovacaoTresNiveis ?? true;

  // Rev. 3084 — Contratos ATIVOS com assinatura concluída, prontos para medição mensal.
  const { data: contratosParaMedir = [], isLoading: loadingContratos } =
    trpc.terceiroContratos.listarContratosParaMedicao.useQuery(
      { companyId },
      { enabled: companyId > 0 }
    );

  const invalidate = () => utils.terceiroContratos.listarMedicoes.invalidate();

  const aprovarMut = trpc.terceiroContratos.aprovarMedicao.useMutation({
    onSuccess: () => { toast.success("Medição aprovada!"); invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const aprovarGestorMut = trpc.terceiroContratos.aprovarNivelGestor.useMutation({
    onSuccess: () => { toast.success("Aprovado pelo Gestor da Obra. Aguardando Sócio Adm."); invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const aprovarSocioMut = trpc.terceiroContratos.aprovarNivelSocio.useMutation({
    onSuccess: () => { toast.success("Liberado pelo Sócio Adm — enviado ao financeiro (a pagar)."); invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const rejeitarMut = trpc.terceiroContratos.rejeitarMedicao.useMutation({
    onSuccess: () => { toast.success("Medição rejeitada"); setRejeitandoId(null); setMotivoRejeicao(""); invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const anyPending = aprovarMut.isPending || aprovarGestorMut.isPending || aprovarSocioMut.isPending || rejeitarMut.isPending;

  // Status de cada mês do ano selecionado (para os "dots" da legenda):
  //  - "consolidado" (verde) = mês tem medição aprovada/paga
  //  - "lancamento"  (azul)  = mês tem medição, mas nenhuma consolidada
  //  - undefined     (cinza) = sem dados no mês
  const mesesStatus = useMemo(() => {
    const map: Record<number, "consolidado" | "lancamento"> = {};
    for (const m of medicoes) {
      const pp = periodoDe(m);
      if (!pp || pp.ano !== ano) continue;
      const consolidado = m.status === "aprovada" || m.status === "paga";
      if (consolidado) map[pp.mes] = "consolidado";
      else if (map[pp.mes] !== "consolidado") map[pp.mes] = "lancamento";
    }
    return map;
  }, [medicoes, ano]);

  // Lista filtrada pelo mês/ano selecionado + filtro de status.
  const filtradas = useMemo(() => medicoes.filter(m => {
    const pp = periodoDe(m);
    if (!pp || pp.ano !== ano || pp.mes !== mesSel) return false;
    if (filtroStatus !== "todos" && m.status !== filtroStatus) return false;
    return true;
  }), [medicoes, ano, mesSel, filtroStatus]);

  const aguardando = medicoes.filter(m => m.status === "aguardando_aprovacao").length;
  const comDivergencia = medicoes.filter(m => m.alertaDivergencia && m.status === "aguardando_aprovacao").length;

  return (
    <DashboardLayout>
      <div className="p-5 space-y-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Medições de Terceiros</h1>
            <p className="text-sm text-gray-500">Controle e aprovação (a pagar) — levantamento de campo, FD do período e {tresNiveis ? "aprovação em 3 níveis" : "aprovação direta"}</p>
          </div>
          <div className="flex items-center gap-2">
            {comDivergencia > 0 && (
              <Badge className="bg-orange-100 text-orange-800 border border-orange-300 text-sm px-3 py-1">
                <AlertTriangle className="w-3.5 h-3.5 mr-1" />{comDivergencia} com divergência
              </Badge>
            )}
            {aguardando > 0 && (
              <Badge className="bg-yellow-100 text-yellow-800 border border-yellow-300 text-sm px-3 py-1">
                {aguardando} aguardando aprovação
              </Badge>
            )}
          </div>
        </div>

        {/* Rev. 3084 — Contratos ATIVOS prontos para medição (só após assinaturas concluídas). */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <FileSignature className="w-4 h-4 text-orange-600" />
            <h2 className="text-sm font-semibold text-gray-800">Contratos ativos para medir</h2>
            <Badge className="bg-orange-50 text-orange-700 border border-orange-200 text-xs">{contratosParaMedir.length}</Badge>
          </div>
          {loadingContratos ? (
            <div className="py-6 text-center text-gray-400 text-sm">Carregando contratos...</div>
          ) : contratosParaMedir.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 py-6 px-4 text-center">
              <FileSignature className="w-7 h-7 mx-auto mb-2 text-gray-300" />
              <p className="text-sm text-gray-500">Nenhum contrato pronto para medição.</p>
              <p className="text-xs text-gray-400">Os contratos aparecem aqui somente após a finalização das assinaturas.</p>
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {contratosParaMedir.map((c: any) => (
                <button
                  key={c.id}
                  onClick={() => navigate(`/terceiros/contratos/${c.id}?tab=medicoes`)}
                  className="text-left bg-white rounded-xl border border-gray-200 p-3 shadow-sm hover:border-orange-300 hover:shadow-md transition-all"
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-semibold text-gray-900 text-sm truncate">{c.numero || `Contrato #${c.id}`}</span>
                    <Badge className="bg-green-100 text-green-700 border border-green-200 text-[10px]">Assinado</Badge>
                  </div>
                  <p className="text-xs text-gray-600 line-clamp-2 mb-2">{c.descricao}</p>
                  <div className="flex items-center gap-1.5 text-[11px] text-gray-500 mb-2">
                    <Building2 className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">{c.empresaNome}</span>
                    {c.obraNome && <><span className="text-gray-300">•</span><span className="truncate">{c.obraNome}</span></>}
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-gray-500">Medido: <strong className="text-gray-800">{Number(c.percentualMedido).toFixed(1)}%</strong></span>
                    <span className="inline-flex items-center gap-1 text-orange-700 font-medium">
                      <Ruler className="w-3 h-3" /> Medir <ChevronRight className="w-3 h-3" />
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                    <div className="h-full bg-orange-400 rounded-full" style={{ width: `${Math.min(Number(c.percentualMedido) || 0, 100)}%` }} />
                  </div>
                  <div className="mt-1 text-[10px] text-gray-400">
                    Saldo a medir: <strong className="text-gray-600">{BRL(c.saldoAMedir)}</strong> de {BRL(c.valorTotal)}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 pt-1">
          <ClipboardCheck className="w-4 h-4 text-gray-500" />
          <h2 className="text-sm font-semibold text-gray-800">Medições registradas</h2>
        </div>

        {/* Navegação Ano + Meses (organiza as medições por mês/ano) */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <div className="flex items-center gap-2">
              <button onClick={() => setAno(a => a - 1)} className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800" title="Ano anterior">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-base font-bold text-gray-800 min-w-[3.5rem] text-center">{ano}</span>
              <button onClick={() => setAno(a => a + 1)} className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800" title="Próximo ano">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center gap-4 text-xs text-gray-500">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />Com lançamento</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />Consolidado</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-300 inline-block" />Sem dados</span>
            </div>
          </div>
          <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
            {MESES.map((m, i) => {
              const num = i + 1;
              const status = mesesStatus[num];
              const isSelected = mesSel === num;
              return (
                <button
                  key={m}
                  onClick={() => setMesSel(num)}
                  className={`relative flex flex-col items-center gap-1 py-2 rounded-lg border text-xs font-medium transition-all
                    ${isSelected
                      ? "border-blue-500 bg-blue-50 text-blue-700 shadow-sm"
                      : "border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50"
                    }`}
                >
                  <span>{m}</span>
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    status === "consolidado" ? "bg-green-500" :
                    status === "lancamento" ? "bg-blue-500" :
                    "bg-gray-300"
                  }`} />
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <Select value={filtroStatus} onValueChange={setFiltroStatus}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os Status</SelectItem>
              <SelectItem value="aguardando_aprovacao">Aguardando Aprovação</SelectItem>
              <SelectItem value="aprovada">Aprovadas</SelectItem>
              <SelectItem value="paga">Pagas</SelectItem>
              <SelectItem value="rejeitada">Rejeitadas</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-gray-500">
            {MESES_LONGO[mesSel - 1]} {ano} — {filtradas.length} medição(ões)
          </span>
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-gray-400">Carregando...</div>
        ) : filtradas.length === 0 ? (
          <div className="py-12 text-center text-gray-400">
            <ClipboardCheck className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Nenhuma medição em {MESES_LONGO[mesSel - 1]} {ano}</p>
            <p className="text-sm">Selecione outro mês/ano acima ou crie a medição a partir do contrato de terceiros</p>
            <Button variant="outline" className="mt-4" onClick={() => navigate("/terceiros/contratos")}>
              Ver Contratos
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {filtradas.map(m => {
              const st = STATUS_MAP[m.status || "rascunho"] || STATUS_MAP.rascunho;
              const nivel = Number(m.nivelAprovacao) || 0;
              const fdAbatido = Number(m.fdTotalAbatido) || 0;
              const liquido = (Number(m.valorMedido) || 0) - fdAbatido;
              const aguardandoAprov = m.status === "aguardando_aprovacao";
              return (
                <div key={m.id}
                  className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm cursor-pointer hover:border-blue-300 hover:shadow-md transition-all"
                  onClick={() => navigate(`/terceiros/contratos/${m.contratoId}?medicao=${m.id}`)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-semibold text-gray-900">{medLabel(m.numero)}</span>
                        <Badge className={`text-xs border ${st.cls}`}>{st.label}</Badge>
                        {m.geradoAutomaticamente && (
                          <Badge className="text-xs border bg-purple-100 text-purple-700 border-purple-200">
                            <Zap className="w-3 h-3 mr-1" />Auto
                          </Badge>
                        )}
                        {m.alertaDivergencia && (
                          <Badge className="text-xs border bg-orange-100 text-orange-800 border-orange-300">
                            <AlertTriangle className="w-3 h-3 mr-1" />Divergência {m.percentualDivergencia != null ? `${Number(m.percentualDivergencia).toFixed(1)}%` : ""}
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-gray-600">
                        Período: <strong>{fmtPeriodo(m)}</strong> • Ref: {fmtDate(m.dataReferencia)}
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        Medido: <strong className="text-gray-700">{BRL(m.valorMedido)}</strong>
                        {fdAbatido > 0 && (
                          <> • FD abatido: <strong className="text-orange-600">−{BRL(fdAbatido)}</strong> • Líquido a pagar: <strong className="text-gray-900">{BRL(liquido)}</strong></>
                        )}
                        {" "}• Acumulado: <strong className="text-gray-700">{BRL(m.valorAcumulado)}</strong> • {Number(m.percentualGlobal).toFixed(1)}% global
                      </div>

                      {/* Strip visual dos 3 níveis (quando o fluxo de 3 níveis está ativo) */}
                      {tresNiveis && (aguardandoAprov || m.status === "aprovada" || m.status === "paga") && (
                        <div className="flex items-center gap-1.5 mt-2 text-[11px]">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border bg-blue-50 text-blue-700 border-blue-200">
                            <ClipboardCheck className="w-3 h-3" /> Medido
                          </span>
                          <ChevronRight className="w-3 h-3 text-gray-300" />
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border ${nivel >= 1 ? "bg-green-50 text-green-700 border-green-200" : "bg-gray-50 text-gray-400 border-gray-200"}`}>
                            <UserCheck className="w-3 h-3" /> Gestor {nivel >= 1 ? "✓" : ""}
                          </span>
                          <ChevronRight className="w-3 h-3 text-gray-300" />
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border ${nivel >= 2 ? "bg-green-50 text-green-700 border-green-200" : "bg-gray-50 text-gray-400 border-gray-200"}`}>
                            <Crown className="w-3 h-3" /> Sócio Adm {nivel >= 2 ? "✓" : ""}
                          </span>
                        </div>
                      )}

                      {m.motivoRejeicao && (
                        <p className="text-xs text-red-500 mt-1 bg-red-50 px-2 py-1 rounded">
                          Motivo rejeição: {m.motivoRejeicao}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                      {aguardandoAprov && (
                        <>
                          {tresNiveis ? (
                            nivel < 1 ? (
                              <Button size="sm" className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-xs"
                                onClick={() => aprovarGestorMut.mutate({ id: m.id, companyId, aprovadoPor: "Gestor da Obra" })}
                                disabled={anyPending}>
                                <UserCheck className="w-3 h-3" /> Aprovar (Gestor)
                              </Button>
                            ) : (
                              <Button size="sm" className="gap-1 bg-indigo-600 hover:bg-indigo-700 text-xs"
                                onClick={() => aprovarSocioMut.mutate({ id: m.id, companyId, aprovadoPor: "Sócio Adm" })}
                                disabled={anyPending}>
                                <ShieldCheck className="w-3 h-3" /> Liberar (Sócio Adm)
                              </Button>
                            )
                          ) : (
                            <Button size="sm" className="gap-1 bg-green-600 hover:bg-green-700 text-xs"
                              onClick={() => aprovarMut.mutate({ id: m.id, companyId, aprovadoPor: "Responsável" })}
                              disabled={anyPending}>
                              <CheckCircle className="w-3 h-3" /> Aprovar
                            </Button>
                          )}
                          <Button size="sm" variant="outline" className="gap-1 text-xs text-red-600 border-red-200 hover:bg-red-50"
                            onClick={() => setRejeitandoId(m.id)}>
                            <XCircle className="w-3 h-3" /> Rejeitar
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Modal inline de rejeição */}
                  {rejeitandoId === m.id && (
                    <div className="mt-3 pt-3 border-t border-gray-100 space-y-2" onClick={(e) => e.stopPropagation()}>
                      <textarea
                        className="w-full border border-gray-200 rounded-lg p-2 text-sm resize-none"
                        rows={2}
                        placeholder="Informe o motivo da rejeição..."
                        value={motivoRejeicao}
                        onChange={e => setMotivoRejeicao(e.target.value)}
                      />
                      <div className="flex gap-2 justify-end">
                        <Button size="sm" variant="outline" onClick={() => setRejeitandoId(null)}>Cancelar</Button>
                        <Button size="sm" className="bg-red-600 hover:bg-red-700 text-xs"
                          disabled={!motivoRejeicao.trim() || rejeitarMut.isPending}
                          onClick={() => rejeitarMut.mutate({ id: m.id, companyId, motivo: motivoRejeicao })}>
                          Confirmar Rejeição
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
