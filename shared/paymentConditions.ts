export const TIPOS_PAGAMENTO = [
  { value: "a_vista", label: "À Vista", parcelas: 1, diasDDL: [0] },
  { value: "7ddl", label: "7 DDL", parcelas: 1, diasDDL: [7] },
  { value: "14ddl", label: "14 DDL", parcelas: 1, diasDDL: [14] },
  { value: "21ddl", label: "21 DDL", parcelas: 1, diasDDL: [21] },
  { value: "28ddl", label: "28 DDL", parcelas: 1, diasDDL: [28] },
  { value: "30ddl", label: "30 DDL", parcelas: 1, diasDDL: [30] },
  { value: "30_60", label: "30/60 DDL", parcelas: 2, diasDDL: [30, 60] },
  { value: "30_60_90", label: "30/60/90 DDL", parcelas: 3, diasDDL: [30, 60, 90] },
  { value: "entrada_30", label: "Entrada + 30 DDL", parcelas: 2, diasDDL: [0, 30], entradaPct: 50 },
  { value: "entrada_30_60", label: "Entrada + 30/60 DDL", parcelas: 3, diasDDL: [0, 30, 60], entradaPct: 33.33 },
  { value: "medicao", label: "Medição Mensal", parcelas: 1, diasDDL: [30] },
] as const;

export type TipoPagamento = typeof TIPOS_PAGAMENTO[number]["value"];

export interface Parcela {
  numero: number;
  valor: number;
  dataVencimento: string;
  descricao: string;
}

export function getTipoPagamentoInfo(tipo: string) {
  return TIPOS_PAGAMENTO.find(t => t.value === tipo) || null;
}

export function calcularParcelas(
  tipo: string,
  valorTotal: number,
  dataBase: string,
): Parcela[] {
  const info = getTipoPagamentoInfo(tipo);
  if (!info) {
    return [{
      numero: 1,
      valor: valorTotal,
      dataVencimento: dataBase,
      descricao: "Pagamento único",
    }];
  }

  const numParcelas = info.diasDDL.length;
  const base = new Date(dataBase + "T12:00:00");

  if ("entradaPct" in info && info.entradaPct) {
    const pctEntrada = info.entradaPct / 100;
    const valorEntrada = Math.round(valorTotal * pctEntrada * 100) / 100;
    const valorRestante = valorTotal - valorEntrada;
    const numRestantes = numParcelas - 1;
    const valorParcela = numRestantes > 0
      ? Math.round((valorRestante / numRestantes) * 100) / 100
      : 0;

    return info.diasDDL.map((dias, idx) => {
      const dt = new Date(base);
      dt.setDate(dt.getDate() + dias);
      const isEntrada = idx === 0;
      let valor: number;
      if (isEntrada) {
        valor = valorEntrada;
      } else if (idx === numParcelas - 1) {
        valor = Math.round((valorTotal - valorEntrada - valorParcela * (numRestantes - 1)) * 100) / 100;
      } else {
        valor = valorParcela;
      }
      return {
        numero: idx + 1,
        valor,
        dataVencimento: dt.toISOString().split("T")[0],
        descricao: isEntrada ? "Entrada" : `Parcela ${idx}/${numRestantes}`,
      };
    });
  }

  const valorParcela = Math.round((valorTotal / numParcelas) * 100) / 100;
  return info.diasDDL.map((dias, idx) => {
    const dt = new Date(base);
    dt.setDate(dt.getDate() + dias);
    const isLast = idx === numParcelas - 1;
    const valor = isLast
      ? Math.round((valorTotal - valorParcela * (numParcelas - 1)) * 100) / 100
      : valorParcela;
    return {
      numero: idx + 1,
      valor,
      dataVencimento: dt.toISOString().split("T")[0],
      descricao: numParcelas === 1 ? "Pagamento único" : `Parcela ${idx + 1}/${numParcelas}`,
    };
  });
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}
