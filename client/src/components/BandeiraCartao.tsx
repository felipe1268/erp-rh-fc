import { CreditCard } from "lucide-react";

/** Normaliza o nome da bandeira: minúsculo, sem acento, sem espaços nas pontas. */
function normalizar(bandeira?: string | null): string {
  return (bandeira ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export type BandeiraKey =
  | "visa"
  | "mastercard"
  | "elo"
  | "amex"
  | "hipercard"
  | "diners"
  | "discover"
  | "generico";

/** Resolve a chave canônica da bandeira a partir do texto livre cadastrado. */
export function resolverBandeira(bandeira?: string | null): BandeiraKey {
  const b = normalizar(bandeira);
  if (!b) return "generico";
  if (b.includes("visa")) return "visa";
  if (b.includes("master")) return "mastercard";
  if (b.includes("elo")) return "elo";
  if (b.includes("amex") || b.includes("american")) return "amex";
  if (b.includes("hiper")) return "hipercard";
  if (b.includes("diners")) return "diners";
  if (b.includes("discover")) return "discover";
  return "generico";
}

/** Gradiente da faixa superior (estilo cartão) por bandeira. */
export function bandeiraGradiente(bandeira?: string | null): string {
  switch (resolverBandeira(bandeira)) {
    case "visa":
      return "bg-gradient-to-br from-blue-800 via-blue-700 to-blue-500";
    case "mastercard":
      return "bg-gradient-to-br from-slate-800 via-orange-700 to-red-600";
    case "elo":
      return "bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-700";
    case "amex":
      return "bg-gradient-to-br from-sky-700 via-sky-600 to-blue-700";
    case "hipercard":
      return "bg-gradient-to-br from-red-800 via-red-700 to-red-500";
    case "diners":
      return "bg-gradient-to-br from-slate-700 via-slate-600 to-slate-500";
    case "discover":
      return "bg-gradient-to-br from-orange-600 via-amber-600 to-amber-500";
    default:
      return "bg-gradient-to-br from-slate-700 via-slate-600 to-slate-500";
  }
}

/** Logo da bandeira (SVG inline / wordmark), pensado p/ fundo escuro. */
export function BandeiraLogo({
  bandeira,
  className = "",
}: {
  bandeira?: string | null;
  className?: string;
}) {
  const key = resolverBandeira(bandeira);

  if (key === "visa") {
    return (
      <span
        className={`font-extrabold italic tracking-tight text-white leading-none ${className}`}
        style={{ fontSize: "1.05rem", letterSpacing: "-0.02em" }}
        aria-label="Visa"
      >
        VISA
      </span>
    );
  }

  if (key === "mastercard") {
    return (
      <svg
        viewBox="0 0 40 24"
        className={`h-6 w-auto ${className}`}
        role="img"
        aria-label="Mastercard"
      >
        <circle cx="15" cy="12" r="11" fill="#EB001B" />
        <circle cx="25" cy="12" r="11" fill="#F79E1B" />
        <path
          d="M20 3.2a11 11 0 0 1 0 17.6 11 11 0 0 1 0-17.6Z"
          fill="#FF5F00"
        />
      </svg>
    );
  }

  if (key === "elo") {
    return (
      <span
        className={`inline-flex items-center gap-[3px] font-extrabold lowercase text-white leading-none ${className}`}
        style={{ fontSize: "1rem" }}
        aria-label="Elo"
      >
        elo
        <span className="inline-flex gap-[2px] ml-[1px]">
          <span className="w-[5px] h-[5px] rounded-full bg-[#FFCB05]" />
          <span className="w-[5px] h-[5px] rounded-full bg-[#EF4123]" />
          <span className="w-[5px] h-[5px] rounded-full bg-[#00A4E0]" />
        </span>
      </span>
    );
  }

  if (key === "amex") {
    return (
      <span
        className={`font-bold text-white text-[11px] tracking-wide bg-white/15 px-1.5 py-0.5 rounded ${className}`}
        aria-label="American Express"
      >
        AMEX
      </span>
    );
  }

  if (key === "hipercard") {
    return (
      <span
        className={`font-extrabold italic text-white leading-none ${className}`}
        style={{ fontSize: "0.85rem" }}
        aria-label="Hipercard"
      >
        Hipercard
      </span>
    );
  }

  if (key === "diners") {
    return (
      <span
        className={`font-bold text-white text-[10px] tracking-wide bg-white/15 px-1.5 py-0.5 rounded ${className}`}
        aria-label="Diners Club"
      >
        DINERS
      </span>
    );
  }

  if (key === "discover") {
    return (
      <span
        className={`inline-flex items-center gap-1 font-bold text-white text-[11px] leading-none ${className}`}
        aria-label="Discover"
      >
        DISCOVER
        <span className="w-[6px] h-[6px] rounded-full bg-[#FF6000]" />
      </span>
    );
  }

  return <CreditCard className={`w-5 h-5 text-white/90 ${className}`} aria-label="Cartão" />;
}

/** Chip dourado decorativo do cartão. */
export function ChipCartao({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 28 20"
      className={`h-5 w-auto ${className}`}
      role="presentation"
      aria-hidden="true"
    >
      <rect x="0.5" y="0.5" width="27" height="19" rx="3" fill="#E8C266" stroke="#C9A24B" />
      <path
        d="M9.5 0.5v19M18.5 0.5v19M0.5 7h9M18.5 7h9M0.5 13h9M18.5 13h9"
        stroke="#C9A24B"
        strokeWidth="0.8"
        fill="none"
      />
      <rect x="9.5" y="6.5" width="9" height="7" rx="1.5" fill="#D9B25A" stroke="#C9A24B" strokeWidth="0.8" />
    </svg>
  );
}
