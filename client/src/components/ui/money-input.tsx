import { Input } from "@/components/ui/input";
import { useState, useEffect, useCallback } from "react";

function toNumber(v: string | number | null | undefined): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  const s = String(v).trim();
  if (/^\d+([.]\d+)?$/.test(s)) return parseFloat(s);
  const clean = s.replace(/\./g, "").replace(",", ".");
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

function fmtBRL(v: string | number | null | undefined, decimals = 2): string {
  const num = toNumber(v);
  if (num === 0) return "";
  return num.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function parseBRL(formatted: string): string {
  const clean = formatted.replace(/\./g, "").replace(",", ".");
  const num = parseFloat(clean);
  return isNaN(num) ? "0" : String(num);
}

export function MoneyInput({ value, onChange, className = "", placeholder = "0,00", decimals = 2 }: {
  value: string | number | null | undefined;
  onChange: (numericVal: string) => void;
  className?: string;
  placeholder?: string;
  decimals?: number;
}) {
  const [display, setDisplay] = useState(fmtBRL(value, decimals));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDisplay(fmtBRL(value, decimals));
  }, [value, focused, decimals]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^\d,]/g, "");
    setDisplay(raw);
    const numeric = parseBRL(raw);
    onChange(numeric);
  };

  const handleBlur = () => {
    setFocused(false);
    const numeric = parseBRL(display);
    onChange(numeric);
    setDisplay(fmtBRL(numeric, decimals));
  };

  const handleFocus = () => {
    setFocused(true);
    const numeric = parseBRL(display);
    if (parseFloat(numeric) === 0) setDisplay("");
  };

  return (
    <Input
      className={className}
      value={display}
      onChange={handleChange}
      onBlur={handleBlur}
      onFocus={handleFocus}
      placeholder={placeholder}
      inputMode="decimal"
    />
  );
}
