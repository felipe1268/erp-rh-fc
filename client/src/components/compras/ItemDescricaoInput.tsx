import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";

interface Props {
  companyId: number;
  value: string;
  onChange: (v: string) => void;
  onBlur?: (v: string) => void;
  onSelectUnidade?: (u: string) => void;
  placeholder?: string;
  className?: string;
}

export function ItemDescricaoInput({
  companyId,
  value,
  onChange,
  onBlur,
  onSelectUnidade,
  placeholder,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [debouncedQ, setDebouncedQ] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDebouncedQ(value), 250);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [value]);

  const q = trpc.compras.getItemSugestoes.useQuery(
    { companyId, q: debouncedQ },
    {
      enabled: companyId > 0 && debouncedQ.trim().length >= 2,
      staleTime: 60_000,
      placeholderData: (prev) => prev,
    }
  );

  const sugestoes = (q.data ?? []).filter(
    (s) => s.descricao.toLowerCase() !== value.toLowerCase()
  );

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleSelect(descricao: string, unidade: string) {
    onChange(descricao);
    if (onSelectUnidade) onSelectUnidade(unidade);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <input
        className={className}
        placeholder={placeholder}
        value={value}
        autoComplete="off"
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => { if (value.trim().length >= 2) setOpen(true); }}
        onBlur={(e) => {
          if (onBlur) onBlur(e.target.value);
          setTimeout(() => setOpen(false), 150);
        }}
      />
      {open && sugestoes.length > 0 && (
        <div className="absolute z-[200] left-0 right-0 mt-0.5 bg-white border border-gray-200 rounded-lg shadow-xl max-h-52 overflow-auto">
          <div className="px-2 py-1 text-[9px] font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100">
            Já usado antes ({sugestoes.length})
          </div>
          {sugestoes.map((s, i) => (
            <button
              key={i}
              type="button"
              className="w-full px-3 py-1.5 text-left text-xs hover:bg-amber-50 flex items-center justify-between gap-2 border-b border-gray-50 last:border-0"
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(s.descricao, s.unidade);
              }}
            >
              <span className="text-gray-800 truncate">{s.descricao}</span>
              <span className="text-gray-400 shrink-0 text-[10px]">
                {s.n_ocs} OC{s.n_ocs !== 1 ? "s" : ""} · {s.unidade}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
