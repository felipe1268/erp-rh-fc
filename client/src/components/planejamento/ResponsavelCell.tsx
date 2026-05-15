/**
 * Rev. 1817 — Componentes compartilhados de Responsável.
 *
 * <ResponsavelCell />            : exibe o nome curto, com tooltip rico (CNPJ,
 *                                  contrato, tipo) e ícone-lápis pra abrir o
 *                                  override. Texto preto puro, sem badge
 *                                  colorido (decisão do usuário).
 *
 * <ResponsavelOverridePopover /> : popover com 3 modos
 *                                  (a) Automático (limpa override),
 *                                  (b) Texto livre (responsavelLotus),
 *                                  (c) Externa (isExterna + texto).
 *                                  Persiste via trpc.planejamento.setRealDates.
 *
 * Mantém a regra R-007 — usa um único `import` da lucide-react.
 */
import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Pencil, Building2, User2, Wrench, ExternalLink, Check, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

export type ResponsavelInfo = {
  tipo: "manual" | "externa" | "contrato_terceiro" | "fc";
  label: string;
  labelCurto: string;
  fonteRef: {
    contratoId?: number;
    contratoNumero?: string | null;
    empresaTerceiraId?: number;
    cnpj?: string | null;
  } | null;
} | null;

function fmtCnpj(c?: string | null) {
  if (!c) return null;
  const d = c.replace(/\D/g, "");
  if (d.length !== 14) return c;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

function tipoIcon(tipo: ResponsavelInfo extends null ? never : NonNullable<ResponsavelInfo>["tipo"]) {
  switch (tipo) {
    case "contrato_terceiro": return <Building2 className="h-3 w-3 shrink-0 text-slate-400" />;
    case "externa":            return <ExternalLink className="h-3 w-3 shrink-0 text-slate-400" />;
    case "manual":             return <User2 className="h-3 w-3 shrink-0 text-slate-400" />;
    case "fc":                 return <Wrench className="h-3 w-3 shrink-0 text-slate-400" />;
  }
}

function tipoLabel(tipo: NonNullable<ResponsavelInfo>["tipo"]) {
  switch (tipo) {
    case "contrato_terceiro": return "Contrato terceiro vinculado";
    case "externa":           return "Externa (override)";
    case "manual":            return "Override manual";
    case "fc":                return "Execução própria FC";
  }
}

interface CellProps {
  atividadeId: number;
  companyId: number;
  responsavel: ResponsavelInfo;
  /** Override manual atual (texto livre LOTUS). */
  responsavelLotus?: string | null;
  /** Flag externa atual. */
  isExterna?: boolean | null;
  externaResponsavel?: string | null;
  /** Callback opcional após salvar — usar para invalidar caches do tRPC. */
  onSaved?: () => void;
  /** Modo readonly (sem lápis). Usado em prints / portais. */
  readOnly?: boolean;
}

export function ResponsavelCell({
  atividadeId,
  companyId,
  responsavel,
  responsavelLotus,
  isExterna,
  externaResponsavel,
  onSaved,
  readOnly,
}: CellProps) {
  const info = responsavel ?? { tipo: "fc" as const, label: "FC ENGENHARIA", labelCurto: "FC", fonteRef: null };
  const cnpjFmt = fmtCnpj(info.fonteRef?.cnpj);
  const tooltip = [
    `${info.label}`,
    `Origem: ${tipoLabel(info.tipo)}`,
    info.fonteRef?.contratoNumero ? `Contrato: ${info.fonteRef.contratoNumero}` : null,
    cnpjFmt ? `CNPJ: ${cnpjFmt}` : null,
  ].filter(Boolean).join(" • ");

  return (
    <div className="flex items-center gap-1.5 text-slate-900" title={tooltip}>
      {tipoIcon(info.tipo)}
      <span className="truncate text-[11px] font-medium uppercase tracking-tight">
        {info.labelCurto || "FC"}
      </span>
      {!readOnly && (
        <ResponsavelOverridePopover
          atividadeId={atividadeId}
          companyId={companyId}
          responsavel={responsavel}
          responsavelLotus={responsavelLotus}
          isExterna={isExterna}
          externaResponsavel={externaResponsavel}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}

interface PopoverProps extends Omit<CellProps, "readOnly"> {}

export function ResponsavelOverridePopover({
  atividadeId,
  companyId,
  responsavel,
  responsavelLotus,
  isExterna,
  externaResponsavel,
  onSaved,
}: PopoverProps) {
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [modo, setModo] = useState<"auto" | "manual" | "externa">(() => {
    if (isExterna) return "externa";
    if (responsavelLotus) return "manual";
    return "auto";
  });
  const [textoManual, setTextoManual] = useState(responsavelLotus ?? "");
  const [textoExterna, setTextoExterna] = useState(externaResponsavel ?? "");

  const mut = trpc.planejamento.setRealDates.useMutation({
    onSuccess: () => {
      utils.planejamento.listarAtividades.invalidate();
      utils.planejamento.kpiResponsavelPorProjeto.invalidate();
      toast({ title: "Responsável atualizado", description: "A mudança aparece agora em LOTUS, FC e exportações." });
      setOpen(false);
      onSaved?.();
    },
    onError: (e) => toast({ title: "Não consegui salvar", description: e.message, variant: "destructive" }),
  });

  function aplicar() {
    const patch: any = { atividadeId, companyId };
    if (modo === "auto") {
      patch.responsavelLotus = null;
      patch.isExterna = false;
      patch.externaResponsavel = null;
    } else if (modo === "manual") {
      patch.responsavelLotus = textoManual.trim() || null;
      patch.isExterna = false;
      patch.externaResponsavel = null;
    } else {
      patch.responsavelLotus = null;
      patch.isExterna = true;
      patch.externaResponsavel = textoExterna.trim() || null;
    }
    mut.mutate(patch);
  }

  const info = responsavel ?? { tipo: "fc" as const, label: "FC ENGENHARIA", labelCurto: "FC", fonteRef: null };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Editar responsável"
          tabIndex={0}
          className="ml-1 inline-flex items-center justify-center rounded p-0.5 text-slate-300 hover:text-slate-700 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-blue-300 print:hidden"
        >
          <Pencil className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3 text-xs" align="end">
        <div className="space-y-3">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Responsável atual</div>
            <div className="text-sm font-semibold text-slate-900 mt-0.5">{info.label}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">{tipoLabel(info.tipo)}</div>
          </div>
          <div className="border-t border-slate-200 pt-2 space-y-2">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="radio"
                checked={modo === "auto"}
                onChange={() => setModo("auto")}
                className="mt-0.5"
              />
              <div>
                <div className="text-[12px] font-medium text-slate-800">Automático</div>
                <div className="text-[10px] text-slate-500">Resolve por contrato terceiro vinculado, ou cai em FC.</div>
              </div>
            </label>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="radio"
                checked={modo === "manual"}
                onChange={() => setModo("manual")}
                className="mt-0.5"
              />
              <div className="flex-1">
                <div className="text-[12px] font-medium text-slate-800">Texto livre (manual)</div>
                <Input
                  type="text"
                  value={textoManual}
                  onChange={(e) => { setTextoManual(e.target.value); setModo("manual"); }}
                  placeholder="Ex.: João Silva, Equipe A..."
                  className="mt-1 h-7 text-[11px]"
                />
              </div>
            </label>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="radio"
                checked={modo === "externa"}
                onChange={() => setModo("externa")}
                className="mt-0.5"
              />
              <div className="flex-1">
                <div className="text-[12px] font-medium text-slate-800">Externa</div>
                <Input
                  type="text"
                  value={textoExterna}
                  onChange={(e) => { setTextoExterna(e.target.value); setModo("externa"); }}
                  placeholder="Nome da empresa externa"
                  className="mt-1 h-7 text-[11px]"
                />
                <div className="text-[10px] text-slate-500 mt-0.5">Marca como atividade fora do escopo FC. Indireta no caminho crítico.</div>
              </div>
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-1 border-t border-slate-100">
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)} className="h-7 text-[11px]">
              <X className="h-3 w-3 mr-1" /> Cancelar
            </Button>
            <Button size="sm" onClick={aplicar} disabled={mut.isPending} className="h-7 text-[11px] bg-blue-600 hover:bg-blue-700">
              <Check className="h-3 w-3 mr-1" /> Aplicar
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
