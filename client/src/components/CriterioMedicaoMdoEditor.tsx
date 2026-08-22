// Rev. 5002 — Editor compartilhado do Critério de Medição de MDO.
// Usado em: Configurações › Critérios do Sistema (padrão da EMPRESA, herdado por toda
// obra nova) e Editar Obra › aba Critério de Medição (sobrescreve o padrão p/ a obra).
import { Label } from "@/components/ui/label";

// diaMedicao/prazoAprovacaoDias/diaPagamento: datas padrão da EMPRESA (Rev. 5003) —
// herdadas pelas obras novas junto com o critério; cada obra pode sobrescrever.
export type CriterioMedicaoMdo = {
  tipo: string; condicoes: string[]; descontos: string[];
  /** dia do mês em que a medição fecha (linha de corte) */
  diaMedicao?: number | null;
  /** dias ÚTEIS para aprovar a medição após o corte */
  prazoAprovacaoDias?: number | null;
  /** dias para pagar APÓS a emissão da NF */
  prazoPagamentoDias?: number | null;
};

export function parseCriterioMedicaoMdo(raw: string | null | undefined): CriterioMedicaoMdo {
  try {
    const o = JSON.parse(raw || "");
    return {
      tipo: o?.tipo || "", condicoes: Array.isArray(o?.condicoes) ? o.condicoes : [], descontos: Array.isArray(o?.descontos) ? o.descontos : [],
      diaMedicao: o?.diaMedicao ?? null, prazoAprovacaoDias: o?.prazoAprovacaoDias ?? null,
      prazoPagamentoDias: o?.prazoPagamentoDias ?? null,
    };
  } catch { return { tipo: "", condicoes: [], descontos: [], diaMedicao: null, prazoAprovacaoDias: null, prazoPagamentoDias: null }; }
}

export const CRITERIO_MEDICAO_MDO_DEFAULT = JSON.stringify({
  tipo: "avanco_fisico",
  condicoes: ["aceite_fiscalizacao", "sem_pendencia_documental", "sem_pendencia_sst", "limpeza_area"],
  descontos: ["retrabalho", "desperdicio_material", "avarias"],
  diaMedicao: 25, prazoAprovacaoDias: 5, prazoPagamentoDias: 10,
});

const TIPOS = [
  { v: "avanco_fisico", t: "Avanço Físico", d: "% executado sobre cada item do escopo/EAP contratado" },
  { v: "etapa_concluida", t: "Etapa Concluída", d: "só entra na medição serviço/etapa 100% concluído" },
  { v: "producao_unitaria", t: "Produção", d: "quantidade executada e conferida × preço unitário" },
];
const CONDS = [
  { v: "aceite_fiscalizacao", t: "Aceite formal da fiscalização/gestor da obra" },
  { v: "sem_pendencia_documental", t: "Sem pendência documental da contratada" },
  { v: "sem_pendencia_sst", t: "Sem pendências de segurança do trabalho (SST)" },
  { v: "limpeza_area", t: "Área da etapa medida limpa e desmobilizada" },
];
const DESCS = [
  { v: "retrabalho", t: "Retrabalhos e serviços recusados pela fiscalização" },
  { v: "desperdicio_material", t: "Desperdício/perda de material acima do tolerado" },
  { v: "avarias", t: "Avarias e danos causados pela equipe" },
];

export default function CriterioMedicaoMdoEditor({ value, onChange }: { value: string | null; onChange: (next: string) => void }) {
  const cm = parseCriterioMedicaoMdo(value);
  const set = (patch: Partial<CriterioMedicaoMdo>) => onChange(JSON.stringify({ ...cm, ...patch }));
  const toggle = (key: "condicoes" | "descontos", v: string) => {
    const arr = cm[key].includes(v) ? cm[key].filter(x => x !== v) : [...cm[key], v];
    set({ [key]: arr } as any);
  };
  return (
    <div className="space-y-4">
      <div>
        <Label className="text-xs font-semibold">Tipo de Medição *</Label>
        <div className="grid sm:grid-cols-3 gap-2 mt-1.5">
          {TIPOS.map(t => (
            <button key={t.v} type="button" onClick={() => set({ tipo: t.v })}
              className={`text-left rounded-lg border p-2.5 transition-colors ${cm.tipo === t.v ? "border-blue-500 bg-blue-50 ring-1 ring-blue-300" : "border-slate-200 bg-white hover:border-slate-300"}`}>
              <div className="text-xs font-semibold text-slate-800">{t.t}</div>
              <div className="text-[11px] text-muted-foreground leading-snug mt-0.5">{t.d}</div>
            </button>
          ))}
        </div>
      </div>
      <div>
        <Label className="text-xs font-semibold">Condições para liberar a medição</Label>
        <div className="space-y-1.5 mt-1.5">
          {CONDS.map(c => (
            <label key={c.v} className="flex items-start gap-2 cursor-pointer">
              <input type="checkbox" className="mt-0.5" checked={cm.condicoes.includes(c.v)} onChange={() => toggle("condicoes", c.v)} />
              <span className="text-xs text-slate-600">{c.t}</span>
            </label>
          ))}
        </div>
      </div>
      <div>
        <Label className="text-xs font-semibold">Descontos da medição</Label>
        <div className="space-y-1.5 mt-1.5">
          {DESCS.map(d => (
            <label key={d.v} className="flex items-start gap-2 cursor-pointer">
              <input type="checkbox" className="mt-0.5" checked={cm.descontos.includes(d.v)} onChange={() => toggle("descontos", d.v)} />
              <span className="text-xs text-slate-600">{d.t}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
