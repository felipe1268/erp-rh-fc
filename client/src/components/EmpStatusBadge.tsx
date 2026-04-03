import React from "react";

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  Desligado:   { label: "Desligado",    className: "bg-gray-100 text-gray-500 border border-gray-300" },
  Lista_Negra: { label: "Lista Negra",  className: "bg-red-100 text-red-800 border border-red-300" },
  Ferias:      { label: "Férias",       className: "bg-orange-100 text-orange-700 border border-orange-300" },
  Afastado:    { label: "Afastado",     className: "bg-blue-100 text-blue-700 border border-blue-300" },
  Licenca:     { label: "Licença",      className: "bg-yellow-100 text-yellow-700 border border-yellow-300" },
  Recluso:     { label: "Recluso",      className: "bg-slate-200 text-slate-700 border border-slate-400" },
  "Lista Negra": { label: "Lista Negra", className: "bg-red-100 text-red-800 border border-red-300" },
};

interface Props {
  status?: string | null;
  className?: string;
}

export function EmpStatusBadge({ status, className = "" }: Props) {
  if (!status || status === "Ativo") return null;
  const cfg = STATUS_CONFIG[status];
  if (!cfg) return null;
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap leading-none ${cfg.className} ${className}`}
    >
      {cfg.label}
    </span>
  );
}

interface EmpNameProps {
  nome: string;
  isDesligado?: boolean;
  className?: string;
  maxWidth?: string;
}

export function EmpNameWithStatus({ nome, isDesligado, className = "", maxWidth = "max-w-[220px]" }: EmpNameProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span className={`truncate ${maxWidth}`}>{nome}</span>
      {isDesligado && (
        <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap leading-none bg-gray-100 text-gray-500 border border-gray-300">
          Desligado
        </span>
      )}
    </span>
  );
}
