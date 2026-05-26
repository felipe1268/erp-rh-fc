/**
 * Rev. 2478 — Badge CIPA compartilhado.
 *
 * - `ativo` → chip verde sólido "CIPA" (membro vigente).
 * - `estabilidade` → chip âmbar "CIPA · estab. DD/MM/AAAA" (ex-membro
 *    representante dos empregados ainda com imunidade pós-mandato — CF
 *    Art. 10 II 'a' ADCT + CLT Art. 165).
 * - Sem flag → não renderiza nada (componente é safe em qualquer linha).
 *
 * Compactness controlada por `size`:
 *   - "xs" — ideal pra mini-cards de Painel RH e linhas de tabela densa.
 *   - "sm" — drill-downs/modais full-screen.
 */
import { ShieldCheck } from "lucide-react";

export type CipaBadgeSize = "xs" | "sm";

export interface CipaBadgeProps {
  ativo?: boolean | null;
  estabilidade?: boolean | null;
  fim?: string | null;
  cargo?: string | null;
  size?: CipaBadgeSize;
  className?: string;
}

function fmtDataBR(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(String(iso).slice(0, 10) + "T00:00:00");
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("pt-BR");
  } catch {
    return "—";
  }
}

function fmtCargo(c: string | null | undefined): string {
  if (!c) return "Membro";
  const map: Record<string, string> = {
    Presidente: "Presidente",
    Vice_Presidente: "Vice-Presidente",
    Secretario: "Secretário",
    Membro_Titular: "Titular",
    Membro_Suplente: "Suplente",
  };
  return map[c] || c;
}

export function CipaBadge({
  ativo,
  estabilidade,
  fim,
  cargo,
  size = "xs",
  className = "",
}: CipaBadgeProps) {
  if (!ativo && !estabilidade) return null;

  const px = size === "sm" ? "px-2 py-0.5" : "px-1.5 py-0.5";
  const text = size === "sm" ? "text-[11px]" : "text-[10px]";
  const icon = size === "sm" ? "h-3 w-3" : "h-2.5 w-2.5";
  const base = `inline-flex items-center gap-1 ${px} ${text} font-semibold rounded border ${className}`;

  if (ativo) {
    return (
      <span
        className={`${base} bg-emerald-50 text-emerald-800 border-emerald-300`}
        title={`Membro ativo da CIPA${cargo ? ` · ${fmtCargo(cargo)}` : ""}${
          fim ? ` · estabilidade até ${fmtDataBR(fim)}` : ""
        }`}
      >
        <ShieldCheck className={icon} />
        CIPA
      </span>
    );
  }

  return (
    <span
      className={`${base} bg-amber-50 text-amber-800 border-amber-300`}
      title={`Ex-membro CIPA${
        cargo ? ` (${fmtCargo(cargo)})` : ""
      } em ESTABILIDADE pós-mandato até ${fmtDataBR(
        fim
      )} — proteção contra dispensa imotivada (CF Art. 10 II 'a' ADCT).`}
    >
      <ShieldCheck className={icon} />
      estab. {fmtDataBR(fim)}
    </span>
  );
}

export default CipaBadge;
