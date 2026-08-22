export type OrdemCompraLocacaoDestino = {
  isLocacao: boolean | null | undefined;
  tipo: string | null | undefined;
  obraId: number | null | undefined;
};

export type ResolucaoDestinoLocacao =
  | { status: "ok"; obraId: number | null; deveNormalizarFlagLocacao: boolean }
  | { status: "oc-nao-e-locacao" }
  | { status: "obra-conflitante" };

/**
 * A obra de uma locação recebida por OC é sempre determinada pela própria OC.
 * A função também mantém compatibilidade com OCs legadas, que usavam somente
 * `tipo = "locacao"` antes da existência de `isLocacao`.
 */
export function resolverDestinoRecebimentoLocacao(
  obraIdInformada: number | undefined,
  oc: OrdemCompraLocacaoDestino,
): ResolucaoDestinoLocacao {
  const ehLocacao = oc.isLocacao === true || oc.tipo === "locacao";
  if (!ehLocacao) return { status: "oc-nao-e-locacao" };

  const obraDaOc = oc.obraId ?? null;
  if (obraIdInformada != null && obraIdInformada !== obraDaOc) {
    return { status: "obra-conflitante" };
  }

  return {
    status: "ok",
    obraId: obraDaOc,
    deveNormalizarFlagLocacao: oc.isLocacao !== true,
  };
}