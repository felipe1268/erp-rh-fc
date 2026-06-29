import { Input } from "@/components/ui/input";
import { useState, useEffect } from "react";

function toNumber(v: string | number | null | undefined): number {
  if (v == null || v === "" || v === "-") return 0;
  if (typeof v === "number") return v;
  const s = String(v).trim();
  if (/^-?\d+([.]\d+)?$/.test(s)) return parseFloat(s);
  const isNeg = s.startsWith("-");
  const clean = s.replace(/-/g, "").replace(/\./g, "").replace(",", ".");
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : (isNeg ? -num : num);
}

function fmtBRL(v: string | number | null | undefined, decimals = 2): string {
  const num = toNumber(v);
  if (num === 0) return "";
  return num.toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Formata enquanto o usuário digita:
 * - Aplica pontos de milhar na parte inteira em tempo real
 * - Mantém a vírgula e decimais livres enquanto foca
 * - No blur formata completamente
 */
function fmtLive(raw: string, allowNegative: boolean): { display: string; numeric: string } {
  const isNeg = allowNegative && raw.startsWith("-");
  const stripped = raw.replace(/[^\d,]/g, "");

  if (!stripped) {
    return { display: isNeg ? "-" : "", numeric: "0" };
  }

  const commaIdx = stripped.indexOf(",");
  let intStr: string;
  let decStr: string | null;

  if (commaIdx >= 0) {
    intStr = stripped.slice(0, commaIdx);
    decStr = stripped.slice(commaIdx + 1);
  } else {
    intStr = stripped;
    decStr = null;
  }

  const intNum = intStr === "" ? 0 : parseInt(intStr, 10);
  const fmtInt = intStr === "" ? "" : isNaN(intNum) ? intStr : intNum.toLocaleString("pt-BR");

  let display = (isNeg ? "-" : "") + fmtInt;
  if (decStr !== null) display += "," + decStr;

  const numericStr =
    (isNeg ? "-" : "") +
    (intStr || "0") +
    (decStr !== null ? "." + decStr : "");
  const num = parseFloat(numericStr);
  const numeric = isNaN(num) ? "0" : String(num);

  return { display, numeric };
}

export function MoneyInput({
  value,
  onChange,
  className = "",
  placeholder = "0,00",
  decimals = 2,
  allowNegative = false,
  colorize = false,
}: {
  value: string | number | null | undefined;
  onChange: (numericVal: string) => void;
  className?: string;
  placeholder?: string;
  decimals?: number;
  /** Permite valores negativos (saldo inicial, etc.) */
  allowNegative?: boolean;
  /** Colore vermelho quando negativo, verde quando positivo */
  colorize?: boolean;
}) {
  const [display, setDisplay] = useState(fmtBRL(value, decimals));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDisplay(fmtBRL(value, decimals));
  }, [value, focused, decimals]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const { display: d, numeric } = fmtLive(raw, allowNegative);
    setDisplay(d);
    onChange(numeric);
  };

  const handleBlur = () => {
    setFocused(false);
    const num = toNumber(display);
    onChange(String(num));
    setDisplay(num === 0 ? "" : fmtBRL(num, decimals));
  };

  const handleFocus = () => {
    setFocused(true);
    const num = toNumber(display);
    if (num === 0) setDisplay(allowNegative ? "" : "");
  };

  const numericVal = toNumber(display);
  const colorClass = colorize
    ? numericVal > 0
      ? "text-green-600 font-semibold"
      : numericVal < 0
      ? "text-red-500 font-semibold"
      : ""
    : "";

  return (
    <Input
      className={`${className} ${colorClass}`}
      value={display}
      onChange={handleChange}
      onBlur={handleBlur}
      onFocus={handleFocus}
      placeholder={placeholder}
      inputMode="decimal"
    />
  );
}
