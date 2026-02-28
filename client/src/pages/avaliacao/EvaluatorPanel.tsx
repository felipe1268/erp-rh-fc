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

  const totalSteps = pilares.length + 2;
  const observacoesStep = pilares.length + 1;

  const pendingQuery = trpc.avaliacao.evaluatorPanel.listPending.useQuery(
    { evaluatorId: evaluator?.id || 0, companyId },
    { enabled: !!evaluator?.id && !!companyId }
  );
  const historyQuery = trpc.avaliacao.evaluatorPanel.listMyEvaluations.useQuery(
    { evaluatorId: evaluator?.id || 0, companyId },
    { enabled: !!evaluator?.id && !!companyId }
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

  const allScoresFilled = pilares.every((p: any) => p.criterios.every((c: any) => scores[c.key] > 0));

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

  const canAdvance = () => {
    if (step === 0) return employeeId !== null;
    if (step >= 1 && step <= pilares.length) {
      const pilar = pilares[step - 1];
      return pilar.criterios.every((c: any) => scores[c.key] > 0);
    }
    return true;
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
    return list;
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

      {/* Progress bar */}
      {step > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-[#64748B]">Progresso</span>
            <span className="text-xs font-medium text-[#1e3a5f]">{Math.round((step / (totalSteps - 1)) * 100)}%</span>
          </div>
          <div className="h-2 bg-[#E2E8F0] rounded-full overflow-hidden">
            <div className="h-full bg-[#1e3a5f] rounded-full transition-all duration-500" style={{ width: `${(step / (totalSteps - 1)) * 100}%` }} />
          </div>
        </div>
      )}

      {/* STEP 0: Seleção de funcionário */}
      {step === 0 && (
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
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${
                    emp.jaAvaliado ? "bg-green-100 text-green-600" : "bg-[#1e3a5f]/10 text-[#1e3a5f]"
                  }`}>
                    {emp.jaAvaliado ? <Check className="w-4 h-4" /> : emp.nome?.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#0F172A] truncate">{emp.nome}</p>
                    <p className="text-xs text-[#64748B]">{emp.funcao} — {emp.setor || "Sem setor"}</p>
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

      {/* STEPS 1-N: Avaliação por pilar */}
      {step >= 1 && step <= pilares.length && (
        <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] p-6">
          <div className="flex items-center gap-3 mb-4 pb-3 border-b border-[#E2E8F0]">
            <HardHat className="w-5 h-5 text-[#1e3a5f]" />
            <div>
              <p className="text-sm text-[#64748B]">Avaliando: <strong className="text-[#0F172A]">{selectedEmployee?.nome}</strong></p>
              <p className="text-xs text-[#94A3B8]">{selectedEmployee?.funcao}</p>
            </div>
          </div>

          <h3 className="text-lg font-bold text-[#1e3a5f] mb-1">{pilares[step - 1].nome}</h3>
          <p className="text-sm text-[#64748B] mb-6">Pilar {step} de {pilares.length} — Avalie cada critério de 1 a 5</p>

          <div className="space-y-5">
            {pilares[step - 1].criterios.map((c: any) => (
              <div key={c.key} className="bg-[#F8FAFC] rounded-xl p-4 border border-[#E2E8F0]">
                <h4 className="text-sm font-semibold text-[#0F172A] mb-0.5">{c.label}</h4>
                <p className="text-xs text-[#94A3B8] mb-3">{c.desc}</p>
                <div className="flex justify-between items-end gap-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <RatingButton
                      key={n}
                      value={n}
                      selected={scores[c.key] === n}
                      onClick={() => setScores({ ...scores, [c.key]: n })}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* STEP N+1: Observações + Submit */}
      {step === observacoesStep && (
        <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] p-6">
          <h3 className="text-lg font-bold text-[#1e3a5f] mb-4">Observações e Confirmação</h3>

          <div className="mb-6">
            <label className="block text-sm font-medium text-[#0F172A] mb-2">Observações (opcional)</label>
            <textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Adicione comentários sobre o desempenho do funcionário..."
              className="w-full p-3 border border-[#E2E8F0] rounded-lg text-sm resize-none h-24 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 focus:border-[#1e3a5f]"
            />
          </div>

          {/* Resumo das notas */}
          <div className="bg-[#F8FAFC] rounded-xl p-4 border border-[#E2E8F0] mb-6">
            <h4 className="text-sm font-semibold text-[#0F172A] mb-3">Resumo das Notas</h4>
            {pilares.map((pilar: any, i: number) => (
              <div key={i} className="mb-3 last:mb-0">
                <p className="text-xs font-medium text-[#1e3a5f] mb-1">{pilar.nome}</p>
                <div className="grid grid-cols-2 gap-1">
                  {pilar.criterios.map((c: any) => (
                    <div key={c.key} className="flex items-center justify-between text-xs">
                      <span className="text-[#64748B] truncate mr-2">{c.label}</span>
                      <span className="font-bold" style={{ color: NOTA_COLORS[scores[c.key]] }}>
                        {scores[c.key]}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <Button
            onClick={handleSubmit}
            disabled={!allScoresFilled || createEval.isPending}
            className="w-full bg-[#1e3a5f] hover:bg-[#15294a] text-white h-12 text-base"
          >
            {createEval.isPending ? (
              <span className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                Registrando...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Check className="w-5 h-5" />
                Confirmar Avaliação
              </span>
            )}
          </Button>
        </div>
      )}

      {/* Navigation buttons */}
      {step > 0 && !showResult && (
        <div className="flex items-center justify-between mt-4">
          <Button
            variant="outline"
            onClick={() => step === 1 ? resetForm() : setStep(step - 1)}
            className="flex items-center gap-1"
          >
            <ChevronLeft className="w-4 h-4" />
            {step === 1 ? "Voltar à lista" : "Anterior"}
          </Button>
          {step < observacoesStep && (
            <Button
              onClick={() => setStep(step + 1)}
              disabled={!canAdvance()}
              className="bg-[#1e3a5f] hover:bg-[#15294a] text-white flex items-center gap-1"
            >
              Próximo
              <ChevronRight className="w-4 h-4" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
