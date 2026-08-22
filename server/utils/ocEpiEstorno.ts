export type ImportacaoEpiParaEstorno = {
  epiId: number;
  obraId: number | null;
  quantidade: number | string;
  recebidoEm: Date | string;
};

export type MovimentoEpiParaEstorno = {
  epiId: number;
  obraId: number | null;
  quantidade: number;
  recebidoEm: Date | string;
};

/**
 * Consolida as importações pelo saldo que será estornado.
 *
 * Uma OC pode ter duas ou mais linhas apontando para o mesmo EPI e destino.
 * O saldo é agregado antes da reversão para que o primeiro débito não seja
 * interpretado como movimentação posterior da própria OC.
 */
export function agruparImportacoesEpiParaEstorno(
  importacoes: ImportacaoEpiParaEstorno[]
): MovimentoEpiParaEstorno[] {
  const porDestino = new Map<string, MovimentoEpiParaEstorno>();

  for (const importacao of importacoes) {
    const key = `${importacao.epiId}:${importacao.obraId ?? "central"}`;
    const existente = porDestino.get(key);

    if (existente) {
      existente.quantidade += Number(importacao.quantidade);
      continue;
    }

    porDestino.set(key, {
      epiId: importacao.epiId,
      obraId: importacao.obraId,
      quantidade: Number(importacao.quantidade),
      recebidoEm: importacao.recebidoEm,
    });
  }

  return Array.from(porDestino.values());
}
