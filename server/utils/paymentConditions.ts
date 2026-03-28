export const TIPOS_PAGAMENTO = [
  { value: "a_vista", label: "À Vista" },
  { value: "30ddl", label: "30 DDL" },
  { value: "30_60", label: "30/60 DDL" },
  { value: "30_60_90", label: "30/60/90 DDL" },
  { value: "entrada_parcelas", label: "Entrada + Parcelas" },
  { value: "personalizado", label: "Personalizado" },
] as const;

export type TipoPagamento = typeof TIPOS_PAGAMENTO[number]["value"];

export interface Parcela {
  numero: number;
  valor: number;
  dataVencimento: string;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

export function calcularParcelas(
  tipo: TipoPagamento,
  valorTotal: number,
  dataBase: string | Date,
  numeroParcelas?: number,
  diasPersonalizado?: number[],
): Parcela[] {
  const base = typeof dataBase === "string" ? new Date(dataBase + "T00:00:00") : new Date(dataBase);
  if (isNaN(base.getTime())) {
    const hoje = new Date();
    base.setTime(hoje.getTime());
  }

  switch (tipo) {
    case "a_vista":
      return [{ numero: 1, valor: valorTotal, dataVencimento: formatDate(base) }];

    case "30ddl":
      return [{ numero: 1, valor: valorTotal, dataVencimento: formatDate(addDays(base, 30)) }];

    case "30_60": {
      const v = +(valorTotal / 2).toFixed(2);
      const resto = +(valorTotal - v).toFixed(2);
      return [
        { numero: 1, valor: v, dataVencimento: formatDate(addDays(base, 30)) },
        { numero: 2, valor: resto, dataVencimento: formatDate(addDays(base, 60)) },
      ];
    }

    case "30_60_90": {
      const v = +(valorTotal / 3).toFixed(2);
      const resto = +(valorTotal - v * 2).toFixed(2);
      return [
        { numero: 1, valor: v, dataVencimento: formatDate(addDays(base, 30)) },
        { numero: 2, valor: v, dataVencimento: formatDate(addDays(base, 60)) },
        { numero: 3, valor: resto, dataVencimento: formatDate(addDays(base, 90)) },
      ];
    }

    case "entrada_parcelas": {
      const n = Math.max(numeroParcelas ?? 2, 2);
      const entrada = +(valorTotal / n).toFixed(2);
      const parcelas: Parcela[] = [
        { numero: 1, valor: entrada, dataVencimento: formatDate(base) },
      ];
      const restante = valorTotal - entrada;
      const nRestantes = n - 1;
      const vParcela = +(restante / nRestantes).toFixed(2);
      let acumulado = entrada;
      for (let i = 0; i < nRestantes; i++) {
        const isUltima = i === nRestantes - 1;
        const valor = isUltima ? +(valorTotal - acumulado).toFixed(2) : vParcela;
        parcelas.push({
          numero: i + 2,
          valor,
          dataVencimento: formatDate(addDays(base, 30 * (i + 1))),
        });
        acumulado += valor;
      }
      return parcelas;
    }

    case "personalizado": {
      const dias = diasPersonalizado && diasPersonalizado.length > 0
        ? diasPersonalizado
        : Array.from({ length: numeroParcelas ?? 1 }, (_, i) => 30 * (i + 1));
      const n = dias.length;
      const vParcela = +(valorTotal / n).toFixed(2);
      let acumulado = 0;
      return dias.map((d, i) => {
        const isUltima = i === n - 1;
        const valor = isUltima ? +(valorTotal - acumulado).toFixed(2) : vParcela;
        acumulado += valor;
        return { numero: i + 1, valor, dataVencimento: formatDate(addDays(base, d)) };
      });
    }

    default:
      return [{ numero: 1, valor: valorTotal, dataVencimento: formatDate(base) }];
  }
}
