/**
 * Converte valor monetário para formato brasileiro.
 * Aceita tanto formato decimal americano do DB ("2421.12")
 * quanto formato brasileiro ("2.421,12") e números puros.
 */
export function formatBRL(val: string | number | null | undefined): string {
  if (!val && val !== 0) return "R$ 0,00";
  if (typeof val === "number") return `R$ ${val.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const str = String(val).replace(/[R$\s]/g, "").trim();
  if (!str) return "R$ 0,00";
  let num: number;
  // Se contém vírgula, é formato brasileiro (ex: "2.774,20")
  if (str.includes(",")) {
    num = parseFloat(str.replace(/\./g, "").replace(",", "."));
  } else {
    // Caso contrário é formato decimal do DB (ex: "2421.12")
    num = parseFloat(str);
  }
  if (isNaN(num)) return "R$ 0,00";
  return `R$ ${num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
