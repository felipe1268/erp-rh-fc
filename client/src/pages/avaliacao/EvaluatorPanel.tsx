import { useState, useEffect, useMemo, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { removeAccents } from "@/lib/searchUtils";
import {
  HardHat, Building2, Users, ClipboardCheck, ChevronRight, ChevronLeft,
  Search, Check, Clock, UserCheck, UserX, CheckCircle2, AlertTriangle
} from "lucide-react";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/_core/hooks/useAuth";

const PILARES_FALLBACK = [
  {
    nome: "Postura e Disciplina",
    criterios: [
      { key: "comportamento", label: "Comportamento e Respeito", desc: "Atitude, respeito à equipe e superiores, conduta no canteiro" },
      { key: "pontualidade", label: "Pontualidade", desc: "Cumprimento dos horários de entrada, saída e intervalos" },
      { key: "assiduidade", label: "Assiduidade", desc: "Frequência ao trabalho, ausência de faltas injustificadas" },
      { key: "segurancaEpis", label: "Segurança e Uso de EPIs", desc: "Uso correto de equipamentos de proteção e normas de segurança" },
    ],
  },
  {
    nome: "Desempenho Técnico",
    criterios: [
      { key: "qualidadeAcabamento", label: "Qualidade e Acabamento", desc: "Qualidade do serviço executado, atenção aos detalhes" },
      { key: "produtividadeRitmo", label: "Produtividade e Ritmo", desc: "Volume de trabalho entregue, ritmo de execução" },
      { key: "cuidadoFerramentas", label: "Cuidado com Ferramentas", desc: "Zelo com ferramentas e equipamentos da empresa" },
      { key: "economiaMateriais", label: "Economia de Materiais", desc: "Uso consciente de materiais, evitando desperdícios" },
    ],
  },
  {
    nome: "Atitude e Crescimento",
    criterios: [
      { key: "trabalhoEquipe", label: "Trabalho em Equipe", desc: "Colaboração com colegas, espírito de equipe" },
      { key: "iniciativaProatividade", label: "Iniciativa e Proatividade", desc: "Capacidade de antecipar problemas e propor soluções" },
      { key: "disponibilidadeFlexibilidade", label: "Disponibilidade e Flexibilidade", desc: "Disposição para ajudar, flexibilidade de horários e tarefas" },
      { key: "organizacaoLimpeza", label: "Organização e Limpeza", desc: "Manutenção do local de trabalho limpo e organizado" },
    ],
  },
];

const NOTA_LABELS: Record<number, string> = { 1: "Péssimo", 2: "Ruim", 3: "Regular", 4: "Bom", 5: "Ótimo" };
const NOTA_COLORS: Record<number, string> = {
  1: "#EF4444", 2: "#F97316", 3: "#EAB308", 4: "#22C55E", 5: "#1e3a5f",
};

// Tempo de casa ("2a 4m" / "8m") e idade ("34 anos") — datas vêm como string YYYY-MM-DD
function tempoEmpresa(dataAdmissao?: string | null): string | null {
  if (!dataAdmissao) return null;
  const d = new Date(String(dataAdmissao).slice(0, 10) + "T00:00:00");
  if (isNaN(d.getTime())) return null;
  const meses = Math.max(0, Math.floor((Date.now() - d.getTime()) / (30.44 * 86400000)));
  if (meses < 12) return `${meses}m de empresa`;
  const anos = Math.floor(meses / 12);
  const resto = meses % 12;
  return `${anos}a${resto ? ` ${resto}m` : ""} de empresa`;
}
function idadeAnos(dataNascimento?: string | null): string | null {
  if (!dataNascimento) return null;
  const d = new Date(String(dataNascimento).slice(0, 10) + "T00:00:00");
  if (isNaN(d.getTime())) return null;
  const idade = Math.floor((Date.now() - d.getTime()) / (365.25 * 86400000));
  return idade > 0 && idade < 120 ? `${idade} anos` : null;
}

function RatingButton({ value, selected, onClick }: { value: number; selected: boolean; onClick: () => void }) {
  const color = NOTA_COLORS[value];
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1 transition-all duration-200" type="button">
      <div
        className="w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center text-lg font-bold transition-all duration-200 border-2"
        style={{
          backgroundColor: selected ? color : "transparent",
          borderColor: color,
          color: selected ? "#fff" : color,
          transform: selected ? "scale(1.15)" : "scale(1)",
          boxShadow: selected ? `0 4px 16px ${color}40` : "none",
        }}
      >
        {value}
      </div>
      <span className="text-[10px] font-medium" style={{ color: selected ? color : "#94A3B8" }}>
        {NOTA_LABELS[value]}
      </span>
    </button>
  );
}

export default function EvaluatorPanel() {
  const { selectedCompany } = useCompany();
  const { user } = useAuth();
  const companyId = selectedCompany?.id || 0;

  // Buscar avaliador vinculado ao usuário logado
  const evaluatorQuery = trpc.avaliacao.evaluatorAuth.getMyEvaluator.useQuery(
    { companyId },
    { enabled: !!companyId && !!user }
  );
  const evaluator = evaluatorQuery.data;

  const [step, setStep] = useState(0);
  const [employeeId, setEmployeeId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [scores, setScores] = useState<Record<string, number>>({});
  const [observacoes, setObservacoes] = useState("");
  const [showResult, setShowResult] = useState(false);
  const [showPendingOnly, setShowPendingOnly] = useState(true);
  const [aba, setAba] = useState<"fila" | "dash">("fila");

  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const criteriaQuery = trpc.avaliacao.criterios.getActiveRevision.useQuery(
    { companyId },
    { enabled: !!companyId }
  );

  const { pilares, revisionId } = useMemo(() => {
    const revData = criteriaQuery.data;
    if (revData && revData.pillars && revData.pillars.length > 0) {
      const dynamicPilares = revData.pillars.map((p: any) => ({
        nome: p.nome,
        criterios: p.criteria
          .filter((c: any) => c.ativo)
          .map((c: any) => ({
            key: c.fieldKey || c.nome.toLowerCase().replace(/\s+/g, "_"),
            label: c.nome,
            desc: c.descricao || "",
          })),
      }));
      return { pilares: dynamicPilares, revisionId: revData.id };
    }
    return { pilares: PILARES_FALLBACK, revisionId: null };
  }, [criteriaQuery.data]);

  const pendingQuery = trpc.avaliacao.evaluatorPanel.listPending.useQuery(
    { evaluatorId: evaluator?.id ?? 0, companyId },
    { enabled: !!evaluator && !!companyId }
  );
  const historyQuery = trpc.avaliacao.evaluatorPanel.listMyEvaluations.useQuery(
    { evaluatorId: evaluator?.id ?? 0, companyId },
    { enabled: !!evaluator && !!companyId }
  );

  const createEval = trpc.avaliacao.evaluatorPanel.createEvaluation.useMutation({
    onSuccess: () => {
      if (timerRef.current) clearInterval(timerRef.current);
      setShowResult(true);
      pendingQuery.refetch();
      historyQuery.refetch();
      toast.success("Avaliação registrada com sucesso!");
    },
    onError: (err: any) => toast.error(err.message),
  });

  useEffect(() => {
    if (startedAt && !showResult) {
      timerRef.current = setInterval(() => setElapsedSeconds(s => s + 1), 1000);
      return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }
  }, [startedAt, showResult]);

  const selectedEmployee = useMemo(
    () => pendingQuery.data?.find((e: any) => e.id === employeeId),
    [employeeId, pendingQuery.data]
  );

  const allCriterios = useMemo(() => pilares.flatMap((p: any) => p.criterios), [pilares]);
  const totalCriterios = allCriterios.length;
  const filledCount = allCriterios.filter((c: any) => scores[c.key] > 0).length;
  const allScoresFilled = filledCount === totalCriterios && totalCriterios > 0;
  const criterioRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Ao dar a nota, rola suavemente até o próximo critério sem nota (fluxo contínuo)
  const handleScore = (key: string, n: number) => {
    const next = { ...scores, [key]: n };
    setScores(next);
    const idx = allCriterios.findIndex((c: any) => c.key === key);
    const proximo = [...allCriterios.slice(idx + 1), ...allCriterios.slice(0, idx)].find((c: any) => !(next[c.key] > 0));
    if (proximo) {
      setTimeout(() => criterioRefs.current[proximo.key]?.scrollIntoView({ behavior: "smooth", block: "center" }), 150);
    }
  };

  const handleSelectEmployee = (id: number) => {
    setEmployeeId(id);
    setStep(1);
    setScores({});
    setObservacoes("");
    setShowResult(false);
    setStartedAt(new Date().toISOString());
    setElapsedSeconds(0);
  };

  const handleSubmit = () => {
    if (!evaluator || !employeeId) return;
    createEval.mutate({
      evaluatorId: evaluator.id,
      companyId,
      employeeId,
      obraId: evaluator.obraId || undefined,
      ...scores as any,
      observacoes,
      startedAt: startedAt || undefined,
      durationSeconds: elapsedSeconds,
      deviceType: /Mobi|Android/i.test(navigator.userAgent) ? "mobile" : "desktop",
      revisionId: revisionId || undefined,
    });
  };

  const resetForm = () => {
    setStep(0);
    setEmployeeId(null);
    setScores({});
    setObservacoes("");
    setShowResult(false);
    setStartedAt(null);
    setElapsedSeconds(0);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const filteredEmployees = useMemo(() => {
    if (!pendingQuery.data) return [];
    let list = pendingQuery.data;
    if (showPendingOnly) list = list.filter((e: any) => !e.jaAvaliado);
    if (searchTerm) {
      const term = removeAccents(searchTerm);
      list = list.filter((e: any) => removeAccents(e.nome || '').includes(term) || e.cpf?.includes(term) || removeAccents(e.funcao || '').includes(term));
    }
    // Já avaliados no mês vão pro fim da lista (na visão "Todos"), pendentes primeiro
    return [...list].sort((a: any, b: any) => Number(!!a.jaAvaliado) - Number(!!b.jaAvaliado));
  }, [pendingQuery.data, showPendingOnly, searchTerm]);

  // Se não é avaliador, mostrar mensagem
  if (evaluatorQuery.isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1e3a5f]" />
      </div>
    );
  }

  if (!evaluator) {
    return (
      <div className="max-w-2xl mx-auto mt-12 p-8 bg-amber-50 border border-amber-200 rounded-xl text-center">
        <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-amber-800 mb-2">Acesso Restrito</h2>
        <p className="text-amber-700">
          Seu usuário não está vinculado como avaliador nesta empresa.
          Entre em contato com o administrador para ser cadastrado como avaliador.
        </p>
      </div>
    );
  }

  // Resultado da avaliação
  if (showResult) {
    return (
      <div className="max-w-xl mx-auto mt-8 p-8 bg-white rounded-2xl shadow-lg border border-[#E2E8F0] text-center">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-10 h-10 text-green-600" />
        </div>
        <h2 className="text-2xl font-bold text-[#0F172A] mb-2">Avaliação Registrada!</h2>
        <p className="text-[#64748B] mb-1">Funcionário: <strong>{selectedEmployee?.nome}</strong></p>
        <p className="text-[#64748B] mb-4">Tempo: <strong>{formatTime(elapsedSeconds)}</strong></p>
        <p className="text-sm text-[#94A3B8] mb-6">
          As notas são sigilosas. Apenas o RH e a administração têm acesso aos resultados.
        </p>
        <Button onClick={resetForm} className="bg-[#1e3a5f] hover:bg-[#15294a] text-white">
          Avaliar outro funcionário
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] p-4 mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#1e3a5f] rounded-lg flex items-center justify-center">
            <ClipboardCheck className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[#0F172A]">Painel do Avaliador</h1>
            <p className="text-xs text-[#64748B]">{evaluator.nome} — {user?.name || 'Usuário'}</p>
          </div>
        </div>
        {startedAt && (
          <div className="flex items-center gap-2 text-sm text-[#64748B]">
            <Clock className="w-4 h-4" />
            <span className="font-mono">{formatTime(elapsedSeconds)}</span>
          </div>
        )}
      </div>

      {/* Progress bar (notas preenchidas) */}
      {step > 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-[#64748B]">Progresso</span>
            <span className="text-xs font-medium text-[#1e3a5f]">{filledCount} de {totalCriterios} notas</span>
          </div>
          <div className="h-2 bg-[#E2E8F0] rounded-full overflow-hidden">
            <div className="h-full bg-[#1e3a5f] rounded-full transition-all duration-300" style={{ width: `${totalCriterios ? (filledCount / totalCriterios) * 100 : 0}%` }} />
          </div>
        </div>
      )}

      {/* Abas: Avaliar × Dashboard */}
      {step === 0 && (
        <div className="flex gap-2 mb-4">
          <button onClick={() => setAba("fila")} className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${aba === "fila" ? "bg-[#1e3a5f] text-white border-[#1e3a5f]" : "bg-white text-[#64748B] border-[#E2E8F0]"}`}>
            ✍️ Avaliar
          </button>
          <button onClick={() => setAba("dash")} className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${aba === "dash" ? "bg-[#1e3a5f] text-white border-[#1e3a5f]" : "bg-white text-[#64748B] border-[#E2E8F0]"}`}>
            📊 Dashboard
          </button>
        </div>
      )}

      {/* ABA DASHBOARD */}
      {step === 0 && aba === "dash" && (() => {
        const lista: any[] = pendingQuery.data ?? [];
        const total = lista.length;
        const avaliados = lista.filter(e => e.jaAvaliado).length;
        const pendentes = total - avaliados;
        const pct = total ? Math.round((avaliados / total) * 100) : 0;
        const mesAtual = new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
        // Por obra
        const porObra = new Map<string, { total: number; feitos: number }>();
        for (const e of lista) {
          const k = e.obraNome || e.setor || "Sem obra";
          const o = porObra.get(k) ?? { total: 0, feitos: 0 };
          o.total += 1; if (e.jaAvaliado) o.feitos += 1;
          porObra.set(k, o);
        }
        const obrasOrd = [...porObra.entries()].sort((a, b) => (b[1].total - b[1].feitos) - (a[1].total - a[1].feitos));
        const situacoes = [
          { label: "🏖 De férias", n: lista.filter(e => e.statusFuncionario === "Ferias").length, cls: "bg-sky-50 text-sky-700 border-sky-200" },
          { label: "⚠ Afastados", n: lista.filter(e => e.statusFuncionario === "Afastado").length, cls: "bg-orange-50 text-orange-700 border-orange-200" },
          { label: "📋 Em aviso", n: lista.filter(e => e.statusFuncionario === "Aviso").length, cls: "bg-red-50 text-red-700 border-red-200" },
          { label: "🩺 Com atestado", n: lista.filter(e => e.atestadoAte).length, cls: "bg-amber-50 text-amber-700 border-amber-200" },
          { label: "🛡 CIPA", n: lista.filter(e => e.cipaCargo).length, cls: "bg-indigo-50 text-indigo-700 border-indigo-200" },
        ].filter(s => s.n > 0);
        const pendList = lista.filter(e => !e.jaAvaliado);
        return (
          <div className="space-y-4">
            {/* Hero de progresso do mês */}
            <div className="rounded-xl bg-gradient-to-br from-[#1e3a5f] to-[#15294a] text-white p-5 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold capitalize">Progresso de {mesAtual}</p>
                <p className="text-sm font-bold">{avaliados} de {total} · {pct}%</p>
              </div>
              <div className="h-3 bg-white/15 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-emerald-400 to-emerald-300 rounded-full transition-all" style={{ width: `${pct}%` }} />
              </div>
              <p className="text-[11px] opacity-70 mt-2">{pendentes > 0 ? `Faltam ${pendentes} avaliação(ões) este mês` : "🎉 Todos avaliados este mês!"}</p>
            </div>
            {/* KPIs */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm p-4 text-center">
                <p className="text-2xl font-extrabold text-[#0F172A]">{total}</p>
                <p className="text-[11px] text-[#64748B]">Minha equipe</p>
              </div>
              <div className="bg-white rounded-xl border border-green-200 shadow-sm p-4 text-center">
                <p className="text-2xl font-extrabold text-green-600">{avaliados}</p>
                <p className="text-[11px] text-[#64748B]">Avaliados no mês</p>
              </div>
              <div className="bg-white rounded-xl border border-amber-200 shadow-sm p-4 text-center">
                <p className="text-2xl font-extrabold text-amber-600">{pendentes}</p>
                <p className="text-[11px] text-[#64748B]">Pendentes</p>
              </div>
            </div>
            {/* Situações especiais */}
            {situacoes.length > 0 && (
              <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm p-4">
                <p className="text-sm font-bold text-[#0F172A] mb-2">Situações na equipe</p>
                <div className="flex flex-wrap gap-2">
                  {situacoes.map(s => (
                    <span key={s.label} className={`text-xs font-semibold border px-2.5 py-1 rounded-lg ${s.cls}`}>{s.label}: {s.n}</span>
                  ))}
                </div>
              </div>
            )}
            {/* Por obra */}
            {obrasOrd.length > 1 && (
              <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm p-4">
                <p className="text-sm font-bold text-[#0F172A] mb-3">Progresso por obra</p>
                <div className="space-y-2.5">
                  {obrasOrd.map(([obra, o]) => (
                    <div key={obra}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-medium text-[#0F172A] break-words">🏗 {obra}</span>
                        <span className="text-[#64748B] shrink-0 ml-2">{o.feitos}/{o.total}</span>
                      </div>
                      <div className="h-2 bg-[#E2E8F0] rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${o.feitos === o.total ? "bg-green-500" : "bg-[#1e3a5f]"}`} style={{ width: `${o.total ? (o.feitos / o.total) * 100 : 0}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* Quem falta avaliar */}
            {pendList.length > 0 && (
              <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm p-4">
                <p className="text-sm font-bold text-[#0F172A] mb-2">Falta avaliar ({pendList.length})</p>
                <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                  {pendList.map((e: any) => (
                    <button key={e.id} onClick={() => { setAba("fila"); handleSelectEmployee(e.id); }}
                      className="w-full flex items-center gap-2.5 p-2 rounded-lg border border-[#E2E8F0] hover:border-[#1e3a5f]/40 hover:bg-[#F8FAFC] text-left">
                      {e.fotoUrl ? (
                        <img src={`${e.fotoUrl}${e.fotoUrl.includes("?") ? "&" : "?"}w=128`} alt="" loading="lazy" className="w-8 h-8 rounded-full object-cover border border-[#E2E8F0]" />
                      ) : (
                        <span className="w-8 h-8 rounded-full bg-[#1e3a5f]/10 text-[#1e3a5f] flex items-center justify-center text-xs font-bold">{e.nome?.charAt(0)}</span>
                      )}
                      <span className="flex-1 min-w-0">
                        <span className="block text-xs font-medium text-[#0F172A] truncate">{e.nome}</span>
                        <span className="block text-[10px] text-[#94A3B8] truncate">{e.funcao}{e.obraNome ? ` · ${e.obraNome}` : ""}</span>
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 text-[#94A3B8] shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* STEP 0: Seleção de funcionário */}
      {step === 0 && aba === "fila" && (
        <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-[#0F172A] flex items-center gap-2">
              <Users className="w-5 h-5 text-[#1e3a5f]" />
              Selecionar Funcionário
            </h2>
            <div className="flex items-center gap-2">
              <Button
                variant={showPendingOnly ? "default" : "outline"}
                size="sm"
                onClick={() => setShowPendingOnly(true)}
                className={showPendingOnly ? "bg-[#1e3a5f] text-white" : ""}
              >
                <UserX className="w-3 h-3 mr-1" /> Pendentes
              </Button>
              <Button
                variant={!showPendingOnly ? "default" : "outline"}
                size="sm"
                onClick={() => setShowPendingOnly(false)}
                className={!showPendingOnly ? "bg-[#1e3a5f] text-white" : ""}
              >
                <Users className="w-3 h-3 mr-1" /> Todos
              </Button>
            </div>
          </div>

          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
            <input
              type="text"
              placeholder="Buscar por nome, CPF ou função..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 focus:border-[#1e3a5f]"
            />
          </div>

          {pendingQuery.isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#1e3a5f]" />
            </div>
          ) : filteredEmployees.length === 0 ? (
            <div className="text-center py-12 text-[#94A3B8]">
              <UserCheck className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p className="font-medium">Nenhum funcionário encontrado</p>
              <p className="text-xs mt-1">
                {showPendingOnly ? "Todos já foram avaliados neste período!" : "Nenhum funcionário ativo nesta empresa."}
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {filteredEmployees.map((emp: any) => (
                <button
                  key={emp.id}
                  onClick={() => !emp.jaAvaliado && handleSelectEmployee(emp.id)}
                  disabled={emp.jaAvaliado}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all text-left ${
                    emp.jaAvaliado
                      ? "bg-gray-50 border-gray-200 opacity-60 cursor-not-allowed"
                      : employeeId === emp.id
                      ? "bg-[#1e3a5f]/5 border-[#1e3a5f] ring-1 ring-[#1e3a5f]/20"
                      : "bg-white border-[#E2E8F0] hover:border-[#1e3a5f]/40 hover:bg-[#F8FAFC]"
                  }`}
                >
                  <div className="relative shrink-0">
                    {emp.fotoUrl ? (
                      <img
                        src={`${emp.fotoUrl}${emp.fotoUrl.includes("?") ? "&" : "?"}w=128`}
                        alt={emp.nome || ""}
                        loading="lazy"
                        className={`w-10 h-10 rounded-full object-cover border border-[#E2E8F0] ${emp.jaAvaliado ? "grayscale" : ""}`}
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; (e.currentTarget.nextElementSibling as HTMLElement)?.classList.remove("hidden"); }}
                      />
                    ) : null}
                    <div className={`w-10 h-10 rounded-full items-center justify-center text-sm font-bold ${emp.fotoUrl ? "hidden" : "flex"} ${
                      emp.jaAvaliado ? "bg-green-100 text-green-600" : "bg-[#1e3a5f]/10 text-[#1e3a5f]"
                    }`}>
                      {emp.nome?.charAt(0)}
                    </div>
                    {emp.jaAvaliado && (
                      <span className="absolute -bottom-0.5 -right-0.5 h-4.5 w-4.5 min-h-[18px] min-w-[18px] rounded-full bg-green-500 border-2 border-white flex items-center justify-center">
                        <Check className="w-2.5 h-2.5 text-white" strokeWidth={3.5} />
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#0F172A] truncate">{emp.nome}</p>
                    <p className="text-xs text-[#64748B] truncate">
                      {emp.funcao}{emp.obraNome ? ` — 🏗 ${emp.obraNome}` : emp.setor ? ` — ${emp.setor}` : ""}
                    </p>
                    <p className="text-[11px] text-[#94A3B8]">
                      {[tempoEmpresa(emp.dataAdmissao), idadeAnos(emp.dataNascimento)].filter(Boolean).join(" · ")}
                    </p>
                    {(emp.statusFuncionario !== "Ativo" || emp.atestadoAte || emp.cipaCargo) && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {emp.cipaCargo && (
                          <span className="text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 px-1.5 py-0.5 rounded">🛡 CIPA · {emp.cipaCargo}</span>
                        )}
                        {emp.statusFuncionario === "Ferias" && (
                          <span className="text-[10px] font-semibold bg-sky-50 text-sky-700 border border-sky-200 px-1.5 py-0.5 rounded">🏖 De férias</span>
                        )}
                        {emp.statusFuncionario === "Afastado" && (
                          <span className="text-[10px] font-semibold bg-orange-50 text-orange-700 border border-orange-200 px-1.5 py-0.5 rounded">⚠ Afastado</span>
                        )}
                        {emp.statusFuncionario === "Aviso" && (
                          <span className="text-[10px] font-semibold bg-red-50 text-red-700 border border-red-200 px-1.5 py-0.5 rounded">📋 Em aviso prévio</span>
                        )}
                        {emp.atestadoAte && (
                          <span className="text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded">
                            🩺 Atestado até {emp.atestadoAte.slice(8, 10)}/{emp.atestadoAte.slice(5, 7)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  {emp.jaAvaliado ? (
                    <span className="text-xs text-green-600 font-medium bg-green-50 px-2 py-1 rounded">Avaliado</span>
                  ) : (
                    <ChevronRight className="w-4 h-4 text-[#94A3B8]" />
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Histórico recente */}
          {historyQuery.data && historyQuery.data.length > 0 && (
            <div className="mt-6 pt-4 border-t border-[#E2E8F0]">
              <h3 className="text-sm font-semibold text-[#64748B] mb-2">Avaliações recentes</h3>
              <div className="space-y-1">
                {historyQuery.data.slice(0, 5).map((h: any) => (
                  <div key={h.id} className="flex items-center justify-between text-xs text-[#94A3B8] py-1">
                    <span>{h.employeeName} ({h.employeeFuncao})</span>
                    <span>{h.mesReferencia}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* STEP 1: Avaliação completa em tela única */}
      {step === 1 && (
        <div className="pb-28">
          {/* Cabeçalho do avaliado */}
          <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] p-4 mb-4 flex items-center justify-between sticky top-0 z-10">
            <div className="flex items-center gap-3 min-w-0">
              <HardHat className="w-5 h-5 text-[#1e3a5f] shrink-0" />
              <div className="min-w-0">
                <p className="text-sm text-[#64748B] truncate">Avaliando: <strong className="text-[#0F172A]">{selectedEmployee?.nome}</strong></p>
                <p className="text-xs text-[#94A3B8] truncate">{selectedEmployee?.funcao}</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={resetForm} className="flex items-center gap-1 shrink-0">
              <ChevronLeft className="w-4 h-4" /> Trocar
            </Button>
          </div>

          {pilares.map((pilar: any, pi: number) => (
            <div key={pi} className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] p-4 sm:p-6 mb-4">
              <h3 className="text-base font-bold text-[#1e3a5f] mb-3">{pilar.nome}</h3>
              <div className="space-y-3">
                {pilar.criterios.map((c: any) => {
                  const filled = scores[c.key] > 0;
                  return (
                    <div
                      key={c.key}
                      ref={(el) => { criterioRefs.current[c.key] = el; }}
                      className={`rounded-xl p-3 sm:p-4 border transition-colors ${filled ? "bg-white border-[#E2E8F0]" : "bg-[#F8FAFC] border-[#1e3a5f]/30"}`}
                    >
                      <div className="flex items-center justify-between mb-0.5">
                        <h4 className="text-sm font-semibold text-[#0F172A]">{c.label}</h4>
                        {filled && (
                          <span className="text-xs font-bold" style={{ color: NOTA_COLORS[scores[c.key]] }}>
                            {scores[c.key]} — {NOTA_LABELS[scores[c.key]]}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#94A3B8] mb-3">{c.desc}</p>
                      <div className="flex justify-between items-end gap-2">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <RatingButton
                            key={n}
                            value={n}
                            selected={scores[c.key] === n}
                            onClick={() => handleScore(c.key, n)}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Observações */}
          <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] p-4 sm:p-6">
            <label className="block text-sm font-medium text-[#0F172A] mb-2">Observações (opcional)</label>
            <textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Adicione comentários sobre o desempenho do funcionário..."
              className="w-full p-3 border border-[#E2E8F0] rounded-lg text-sm resize-none h-24 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 focus:border-[#1e3a5f]"
            />
          </div>

          {/* Barra fixa de confirmação */}
          <div className="fixed bottom-0 left-0 right-0 z-20 bg-white/95 backdrop-blur border-t border-[#E2E8F0] p-3 sm:p-4">
            <div className="max-w-4xl mx-auto flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-[#64748B]">{allScoresFilled ? "Tudo preenchido — pode confirmar" : `Faltam ${totalCriterios - filledCount} nota(s)`}</p>
                <div className="h-1.5 bg-[#E2E8F0] rounded-full overflow-hidden mt-1">
                  <div className="h-full bg-[#1e3a5f] rounded-full transition-all duration-300" style={{ width: `${totalCriterios ? (filledCount / totalCriterios) * 100 : 0}%` }} />
                </div>
              </div>
              <Button
                onClick={handleSubmit}
                disabled={!allScoresFilled || createEval.isPending}
                className="bg-[#1e3a5f] hover:bg-[#15294a] text-white h-12 px-6 text-base shrink-0"
              >
                {createEval.isPending ? (
                  <span className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                    Registrando...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Check className="w-5 h-5" />
                    Confirmar
                  </span>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
