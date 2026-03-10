import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { ChevronDown } from "lucide-react";

interface TimeComboboxProps {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  className?: string;
  triggerClassName?: string;
}

export function TimeCombobox({
  value,
  onChange,
  options,
  placeholder = "-",
  className = "",
  triggerClassName = "",
}: TimeComboboxProps) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value || "");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync external value changes
  useEffect(() => {
    const display = options.find(o => o.value === value)?.label || value || "";
    setInputValue(display);
  }, [value, options]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Parse typed input to HH:MM format
  const parseTimeInput = (raw: string): string => {
    const trimmed = raw.trim();
    if (!trimmed || trimmed === "-") return "";

    // Already HH:MM format
    if (/^\d{1,2}:\d{2}$/.test(trimmed)) return trimmed;

    // Format like "1h15", "1h30", "2h", "1h"
    const hMatch = trimmed.match(/^(\d{1,2})h(\d{1,2})?$/i);
    if (hMatch) {
      const h = hMatch[1].padStart(2, "0");
      const m = (hMatch[2] || "0").padStart(2, "0");
      return `${h}:${m}`;
    }

    // Just numbers: "0730" → "07:30", "17" → "17:00"
    if (/^\d{3,4}$/.test(trimmed)) {
      const padded = trimmed.padStart(4, "0");
      return `${padded.slice(0, 2)}:${padded.slice(2)}`;
    }

    // Two digits: assume hours
    if (/^\d{1,2}$/.test(trimmed)) {
      return `${trimmed.padStart(2, "0")}:00`;
    }

    // "30 min", "30min"
    const minMatch = trimmed.match(/^(\d{1,3})\s*min/i);
    if (minMatch) {
      const totalMin = parseInt(minMatch[1]);
      const h = Math.floor(totalMin / 60).toString().padStart(2, "0");
      const m = (totalMin % 60).toString().padStart(2, "0");
      return `${h}:${m}`;
    }

    return trimmed;
  };

  const handleBlur = () => {
    // Small delay to allow click on option
    setTimeout(() => {
      if (!containerRef.current?.contains(document.activeElement)) {
        setOpen(false);
        const parsed = parseTimeInput(inputValue);
        if (parsed !== value) {
          onChange(parsed);
        }
        // Update display
        const display = options.find(o => o.value === parsed)?.label || parsed || "";
        setInputValue(display);
      }
    }, 150);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      setOpen(false);
      const parsed = parseTimeInput(inputValue);
      onChange(parsed);
      const display = options.find(o => o.value === parsed)?.label || parsed || "";
      setInputValue(display);
      inputRef.current?.blur();
    }
    if (e.key === "Escape") {
      setOpen(false);
      const display = options.find(o => o.value === value)?.label || value || "";
      setInputValue(display);
    }
  };

  const selectOption = (optValue: string) => {
    onChange(optValue === "none" ? "" : optValue);
    const opt = options.find(o => o.value === optValue);
    setInputValue(optValue === "none" ? "" : (opt?.label || optValue));
    setOpen(false);
  };

  // Filter options based on input
  const filtered = options.filter(o => {
    if (!inputValue) return true;
    const search = inputValue.toLowerCase();
    return o.label.toLowerCase().includes(search) || o.value.includes(search);
  });

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative">
        <Input
          ref={inputRef}
          type="text"
          value={inputValue}
          placeholder={placeholder}
          onChange={(e) => {
            setInputValue(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            // Select all text on focus for easy replacement
            setTimeout(() => inputRef.current?.select(), 0);
          }}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className={`h-8 text-xs pr-7 ${triggerClassName}`}
        />
        <button
          type="button"
          tabIndex={-1}
          className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground hover:text-foreground"
          onMouseDown={(e) => {
            e.preventDefault();
            setOpen(!open);
            inputRef.current?.focus();
          }}
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-md border border-border bg-popover text-popover-foreground shadow-md">
          <div
            className="px-2 py-1.5 text-xs cursor-pointer hover:bg-accent hover:text-accent-foreground"
            onMouseDown={(e) => { e.preventDefault(); selectOption("none"); }}
          >
            -
          </div>
          {filtered.filter(o => o.value !== "none").map(opt => (
            <div
              key={opt.value}
              className={`px-2 py-1.5 text-xs cursor-pointer hover:bg-accent hover:text-accent-foreground ${opt.value === value ? 'bg-accent/50 font-semibold' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); selectOption(opt.value); }}
            >
              {opt.label}
            </div>
          ))}
          {inputValue && !filtered.some(o => o.label.toLowerCase() === inputValue.toLowerCase()) && (
            <div className="px-2 py-1 text-[10px] text-muted-foreground border-t border-border">
              Pressione Enter para usar "{inputValue}"
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Pre-defined option sets
export const ENTRADA_OPTIONS = [
  { value: "none", label: "-" },
  ...["05:00","05:30","06:00","06:30","07:00","07:30","08:00","08:30","09:00","09:30","10:00","10:30","11:00","11:30","12:00","12:30","13:00","13:30","14:00"].map(h => ({ value: h, label: h })),
];

export const INTERVALO_OPTIONS = [
  { value: "none", label: "-" },
  { value: "00:15", label: "15 min" },
  { value: "00:30", label: "30 min" },
  { value: "00:45", label: "45 min" },
  { value: "01:00", label: "1 hora" },
  { value: "01:15", label: "1h15" },
  { value: "01:30", label: "1h30" },
  { value: "01:45", label: "1h45" },
  { value: "02:00", label: "2 horas" },
];

export const SAIDA_OPTIONS = [
  { value: "none", label: "-" },
  ...["11:00","11:30","12:00","12:30","13:00","13:30","14:00","14:30","15:00","15:30","16:00","16:30","17:00","17:30","18:00","18:30","19:00","19:30","20:00","20:30","21:00","22:00","23:00"].map(h => ({ value: h, label: h })),
];
