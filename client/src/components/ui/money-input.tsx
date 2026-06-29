import { Input } from "@/components/ui/input";
import { useState, useEffect } from "react";

/** Converte qualquer representação de número BR ("1.000,50" ou "1000.50") para number. */
function toNumber(v: string | number | null | undefined): number {
  if (v == null || v === "" || v === "-") return 0;
  if (typeof v === "number") return v;
  const s = String(v).trim();
  // Já é numérico puro (ex: "1000.5" vindo do state interno)
  if (/^-?\d+(\.\d+)?$/.test(s)) return parseFloat(s);
  const isNeg = s.startsWith("-");
  const clean = s.replace(/-/g, "").replace(/\./g, "").replace(",", ".");
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : isNeg ? -num : num;
}

/**
 * Adiciona ponto de milhar na parte inteira sem depender de toLocaleString
 * (que pode cair em "en-US" no iOS Safari e usar vírgula como separador).
 *   "1000"   → "1.000"
 *   "100000" → "100.000"
 */
function addDots(intStr: string): string {
  return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Formata número para exibição BR com decimais fixos, ex: -100000 → "-100.000,00". */
function fmtBRL(v: string | number | null | undefined, decimals = 2): string {
  const num = toNumber(v);
  if (num === 0) return "";
  const isNeg = num < 0;
  const abs = Math.abs(num);
  const [intPart, decPart] = abs.toFixed(decimals).split(".");
  return (isNeg ? "-" : "") + addDots(intPart) + "," + decPart;
}

/**
 * Formata ao vivo enquanto o usuário digita.
 * Retorna o display (com pontos de milhar) e o valor numérico interno (string "1000.5").
 */
function fmtLive(raw: string, allowNegative: boolean): { display: string; numeric: string } {
  const isNeg = allowNegative && raw.startsWith("-");
  // Remove tudo que não é dígito nem vírgula
  const stripped = raw.replace(/[^\d,]/g, "");

  if (!stripped) {
    return { display: isNeg ? "-" : "", numeric: "0" };
  }

  // Separa parte inteira de decimais (usa primeira vírgula apenas)
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

  const fmtInt = intStr === "" ? "0" : addDots(intStr);
  let display = (isNeg ? "-" : "") + fmtInt;
  if (decStr !== null) display += "," + decStr;

  // Valor interno sem formatação (ponto decimal, sem pontos de milhar)
  const numericStr =
    (isNeg ? "-" : "") + (intStr || "0") + (decStr != null ? "." + decStr : "");
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
  /** Permite valores negativos (ex: saldo inicial). */
  allowNegative?: boolean;
  /** Colore vermelho quando negativo, verde quando positivo. */
  colorize?: boolean;
}) {
  const [display, setDisplay] = useState(fmtBRL(value, decimals));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDisplay(fmtBRL(value, decimals));
  }, [value, focused, decimals]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { display: d, numeric } = fmtLive(e.target.value, allowNegative);
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
    // Zera display apenas se o valor for exatamente 0
    if (toNumber(display) === 0) setDisplay("");
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
