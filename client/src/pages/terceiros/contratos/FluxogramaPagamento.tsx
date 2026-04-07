interface FluxogramaPagamentoProps {
  diaMedicao?: number;
  prazoAprovacao?: number;
  prazoEmissaoNf?: number;
  prazoLiberacaoOp?: number;
  diaPagamento?: number;
  compact?: boolean;
}

const STEPS_BASE = [
  { title: "Medição Física", color: "#1B2A4A", icon: "📐" },
  { title: "Aprovação", color: "#2563eb", icon: "✅" },
  { title: "Documentação", color: "#7c3aed", icon: "📋" },
  { title: "Emissão NF", color: "#0891b2", icon: "🧾" },
  { title: "Liberação OP", color: "#059669", icon: "🔓" },
  { title: "Pagamento", color: "#d97706", icon: "💰" },
];

function buildSteps(dm: number, pa: number, pnf: number, plop: number, dp: number) {
  return [
    { ...STEPS_BASE[0], desc: `Dia ${dm} de cada mês` },
    { ...STEPS_BASE[1], desc: `Até ${pa} dias úteis` },
    { ...STEPS_BASE[2], desc: "NF + Certidões" },
    { ...STEPS_BASE[3], desc: `Até ${pnf} dias úteis` },
    { ...STEPS_BASE[4], desc: `Até ${plop} dias úteis` },
    { ...STEPS_BASE[5], desc: `Dia ${dp} mês seguinte` },
  ];
}

function clipPath(i: number, total: number, arrow: number) {
  if (i === 0) return `polygon(0 0, calc(100% - ${arrow}px) 0, 100% 50%, calc(100% - ${arrow}px) 100%, 0 100%)`;
  if (i === total - 1) return `polygon(${arrow}px 0, 100% 0, 100% 100%, 0 100%, ${arrow}px 50%)`;
  return `polygon(${arrow}px 0, calc(100% - ${arrow}px) 0, 100% 50%, calc(100% - ${arrow}px) 100%, 0 100%, ${arrow}px 50%)`;
}

export default function FluxogramaPagamento({
  diaMedicao = 25,
  prazoAprovacao = 5,
  prazoEmissaoNf = 3,
  prazoLiberacaoOp = 5,
  diaPagamento = 10,
  compact = false,
}: FluxogramaPagamentoProps) {
  const steps = buildSteps(diaMedicao, prazoAprovacao, prazoEmissaoNf, prazoLiberacaoOp, diaPagamento);
  const arrow = compact ? 10 : 12;
  const minW = compact ? "78px" : "90px";

  return (
    <div className={compact ? "my-4 py-3" : "my-6 py-4 px-2"} style={{ fontFamily: "'Segoe UI', Arial, sans-serif" }}>
      <p className={`font-bold text-gray-500 uppercase tracking-widest text-center ${compact ? "text-[10px] mb-3" : "text-[11px] mb-4"}`}>
        Fluxograma do Processo de Medição e Pagamento
      </p>
      <div className="flex items-stretch justify-center gap-0">
        {steps.map((step, i) => (
          <div
            key={i}
            className={`relative flex flex-col items-center justify-center text-white ${compact ? "px-2 py-2.5" : "px-3 py-3"}`}
            style={{
              backgroundColor: step.color,
              minWidth: minW,
              clipPath: clipPath(i, steps.length, arrow),
              marginLeft: i > 0 ? "-2px" : "0",
            }}
          >
            <span className={compact ? "text-[12px] mb-0.5" : "text-[14px] mb-0.5"}>{step.icon}</span>
            <span className={`font-bold uppercase tracking-wide leading-tight text-center ${compact ? "text-[8px]" : "text-[9px]"}`}>{step.title}</span>
            <span className={`opacity-90 leading-tight text-center mt-0.5 ${compact ? "text-[7px]" : "text-[7.5px]"}`}>{step.desc}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
