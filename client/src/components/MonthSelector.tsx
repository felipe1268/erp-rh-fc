import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

interface MonthSelectorProps {
  /** Formato "YYYY-MM" */
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export default function MonthSelector({ value, onChange, className }: MonthSelectorProps) {
  const [yearStr, monthStr] = value.split("-");
  const year = parseInt(yearStr);
  const month = parseInt(monthStr); // 1-12

  const goBack = () => {
    if (month === 1) {
      onChange(`${year - 1}-12`);
    } else {
      onChange(`${year}-${String(month - 1).padStart(2, "0")}`);
    }
  };

  const goForward = () => {
    if (month === 12) {
      onChange(`${year + 1}-01`);
    } else {
      onChange(`${year}-${String(month + 1).padStart(2, "0")}`);
    }
  };

  const goToday = () => {
    const now = new Date();
    onChange(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  };

  const mesNome = MESES[month - 1] || "???";

  return (
    <div className={`flex items-center gap-1 ${className || ""}`}>
      <Button variant="ghost" size="icon" onClick={goBack} className="h-8 w-8" title="Mês anterior">
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <button
        onClick={goToday}
        className="text-sm font-semibold px-3 py-1 rounded hover:bg-muted transition-colors min-w-[140px] text-center"
        title="Ir para mês atual"
      >
        {mesNome} {year}
      </button>
      <Button variant="ghost" size="icon" onClick={goForward} className="h-8 w-8" title="Próximo mês">
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
