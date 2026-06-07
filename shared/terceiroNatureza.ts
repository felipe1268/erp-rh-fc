// Rev. 2830 — Natureza do contrato de terceiro (o QUE ele cobre), distinta do
// tipoContrato (modelo de PREÇO). Material vira FD e é descontado do valor.
export type NaturezaContrato = "mao_de_obra" | "material" | "mao_de_obra_material";

export const NATUREZA_CONTRATO: Record<string, { label: string; short: string; cls: string; incluiMaterial: boolean; incluiMdo: boolean }> = {
  mao_de_obra: {
    label: "Mão de Obra",
    short: "MDO",
    cls: "bg-blue-50 text-blue-700 border-blue-200",
    incluiMaterial: false,
    incluiMdo: true,
  },
  material: {
    label: "Material",
    short: "Material",
    cls: "bg-amber-50 text-amber-700 border-amber-200",
    incluiMaterial: true,
    incluiMdo: false,
  },
  mao_de_obra_material: {
    label: "MDO + Material",
    short: "MDO+Mat",
    cls: "bg-purple-50 text-purple-700 border-purple-200",
    incluiMaterial: true,
    incluiMdo: true,
  },
};

export function naturezaInfo(n?: string | null) {
  return NATUREZA_CONTRATO[n || "mao_de_obra"] || NATUREZA_CONTRATO.mao_de_obra;
}
