import { ChevronLeft, ChevronRight } from "lucide-react";

const MESES_SHORT = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

interface PeriodSelectorCardProps {
  ano: number;
  mes: number;
  onAno: (a: number) => void;
  onMes: (m: number) => void;
  /** Nó opcional renderizado à direita do cabeçalho (botões de ação, legend, etc.) */
  actions?: React.ReactNode;
  className?: string;
}

export default function PeriodSelectorCard({
  ano, mes, onAno, onMes, actions, className,
}: PeriodSelectorCardProps) {
  return (
    <div className={`rounded-2xl border border-slate-200 shadow-sm bg-white overflow-hidden ${className ?? ""}`}>
      <div className="px-4 py-3 flex items-center gap-2 border-b border-slate-100">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onAno(ano - 1)}
            className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors"
            aria-label="Ano anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-base font-bold text-gray-800 min-w-[3.5rem] text-center">{ano}</span>
          <button
            type="button"
            onClick={() => onAno(ano + 1)}
            className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors"
            aria-label="Próximo ano"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        {actions && (
          <div className="flex-1 flex items-center justify-end gap-1.5">{actions}</div>
        )}
      </div>
      <div className="px-4 py-3 grid grid-cols-6 sm:grid-cols-12 gap-1.5">
        {MESES_SHORT.map((m, i) => {
          const numMes = i + 1;
          const isSelected = mes === numMes;
          return (
            <button
              key={m}
              type="button"
              onClick={() => onMes(numMes)}
              className={`flex items-center justify-center py-2 rounded-xl text-xs font-medium transition-all
                ${isSelected
                  ? "border-2 border-slate-800 bg-slate-50 text-slate-800 font-semibold shadow-sm"
                  : "border border-slate-200 bg-white text-slate-500 hover:border-slate-400 hover:bg-slate-50"
                }`}
            >
              {m}
            </button>
          );
        })}
      </div>
    </div>
  );
}
