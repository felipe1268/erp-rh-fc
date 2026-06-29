/**
 * MoneyInput — modo centavos-primeiro (estilo caixa eletrônico / maquininha BR).
 *
 * Comportamento:
 *   • A vírgula e os centavos aparecem desde o primeiro dígito.
 *   • O cursor fica sempre no final — novos dígitos são sempre acrescentados à direita.
 *   • Backspace apaga o último dígito; Delete limpa tudo.
 *   • allowNegative: prefixar com "-" inverte o sinal.
 *   • colorize: texto vermelho quando negativo, verde quando positivo.
 *
 * Exemplos (decimals=2):
 *   digitar 1                → "0,01"
 *   digitar 1,0,0            → "1,00"
 *   digitar 1,0,0,0,0,0      → "1.000,00"
 *   digitar (8 dígitos)      → "100.000,00"
 */

import { Input } from "@/components/ui/input";
import { useRef, useState, useEffect, useCallback } from "react";

// ─── helpers ────────────────────────────────────────────────────────────────

/** Pontos de milhar sem depender de toLocaleString (bug iOS Safari). */
function addDots(intStr: string): string {
  return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Buffer de dígitos inteiros → string de exibição BRL. */
function digitsToDisplay(digits: string, neg: boolean, dec: number): string {
  if (!digits) return "";
  const padded = digits.padStart(dec + 1, "0");
  const intPart = padded.slice(0, padded.length - dec);
  const decPart = padded.slice(padded.length - dec);
  const prefix = neg && parseInt(digits, 10) > 0 ? "-" : "";
  return prefix + addDots(intPart) + "," + decPart;
}

/** Buffer de dígitos + sinal → valor numérico string para onChange. */
function digitsToNumeric(digits: string, neg: boolean, dec: number): string {
  if (!digits || parseInt(digits, 10) === 0) return "0";
  const n = parseInt(digits, 10);
  const val = n / Math.pow(10, dec);
  return neg ? String(-val) : String(val);
}

/** Qualquer representação de número → { digits, neg }. */
function valueToState(
  v: string | number | null | undefined,
  dec: number
): { digits: string; neg: boolean } {
  if (v == null || v === "" || v === "0" || v === 0) return { digits: "", neg: false };
  const s = String(v).trim();
  const neg = s.startsWith("-");
  const abs = s.replace(/-/g, "");
  let num: number;
  if (/^\d+(\.\d+)?$/.test(abs)) {
    num = parseFloat(abs);
  } else {
    num = parseFloat(abs.replace(/\./g, "").replace(",", "."));
  }
  if (isNaN(num) || num === 0) return { digits: "", neg: false };
  const cents = Math.round(num * Math.pow(10, dec));
  return { digits: String(cents), neg };
}

// ─── componente ─────────────────────────────────────────────────────────────

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
  allowNegative?: boolean;
  colorize?: boolean;
}) {
  const init = valueToState(value, decimals);
  const [digits, setDigits] = useState(init.digits);
  const [neg, setNeg]       = useState(init.neg);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Guarda o comprimento do buffer de dígitos ANTES do último onChange,
  // para detectar se o usuário adicionou ou removeu um dígito.
  const prevDigitsLen = useRef(init.digits.length);

  // Sincroniza state quando value muda externamente (ex: openEdit, reset)
  useEffect(() => {
    if (!focused) {
      const s = valueToState(value, decimals);
      setDigits(s.digits);
      setNeg(s.neg);
      prevDigitsLen.current = s.digits.length;
    }
  }, [value, focused, decimals]);

  // Força cursor ao final (evita inserção no meio do texto)
  const forceCursorEnd = useCallback(() => {
    if (inputRef.current) {
      const len = inputRef.current.value.length;
      inputRef.current.setSelectionRange(len, len);
    }
  }, []);

  const display = digitsToDisplay(digits, allowNegative && neg, decimals);

  // ── keydown: backspace / delete / sinal ─────────────────────────────────
  // Confiável em desktop e mobile iOS/Android para teclas especiais.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      const nd = digits.slice(0, -1);
      prevDigitsLen.current = nd.length;
      setDigits(nd);
      onChange(digitsToNumeric(nd, allowNegative && neg, decimals));
      return;
    }
    if (e.key === "Delete") {
      e.preventDefault();
      prevDigitsLen.current = 0;
      setDigits("");
      setNeg(false);
      onChange("0");
      return;
    }
    if (e.key === "-" && allowNegative && digits !== "") {
      e.preventDefault();
      const newNeg = !neg;
      setNeg(newNeg);
      onChange(digitsToNumeric(digits, newNeg, decimals));
      return;
    }
    // Para dígitos e demais teclas: deixa o browser atualizar o value e
    // captura via onChange abaixo.
    setTimeout(forceCursorEnd, 0);
  };

  // ── onChange: captura dígitos digitados (confiável em mobile) ────────────
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Extrai apenas os dígitos do novo valor do browser
    const allDigits = e.target.value.replace(/\D/g, "");

    if (allDigits.length > prevDigitsLen.current) {
      // Dígito(s) adicionado(s).
      // Como o cursor está sempre ao final, novos chars aparecem no fim da string.
      const added = allDigits.slice(prevDigitsLen.current);
      const nd = (digits + added).slice(-13); // máx 13 dígitos ≈ bilhões
      prevDigitsLen.current = nd.length;
      setDigits(nd);
      onChange(digitsToNumeric(nd, allowNegative && neg, decimals));
    } else if (allDigits.length < prevDigitsLen.current) {
      // Dígito(s) removido(s) via mobile backspace (pode não gerar keydown).
      const nd = allDigits;
      prevDigitsLen.current = nd.length;
      setDigits(nd);
      onChange(digitsToNumeric(nd, allowNegative && neg, decimals));
    }
    // Se o comprimento for igual, apenas um caractere de formatação foi tocado → ignora.

    setTimeout(forceCursorEnd, 0);
  };

  const handleFocus = () => {
    setFocused(true);
    setTimeout(forceCursorEnd, 0);
  };

  const handleBlur = () => {
    setFocused(false);
    if (!digits || parseInt(digits, 10) === 0) setNeg(false);
    onChange(digitsToNumeric(digits, allowNegative && neg, decimals));
  };

  const numericVal = parseFloat(digitsToNumeric(digits, allowNegative && neg, decimals)) || 0;
  const colorClass = colorize
    ? numericVal > 0 ? "text-green-600 font-semibold"
    : numericVal < 0 ? "text-red-500 font-semibold"
    : ""
    : "";

  return (
    <Input
      ref={inputRef}
      className={`${className} ${colorClass}`}
      value={display}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onClick={() => setTimeout(forceCursorEnd, 0)}
      placeholder={placeholder}
      inputMode="numeric"
    />
  );
}
