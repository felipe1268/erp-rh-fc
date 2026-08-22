export const normalizarBuscaAnaliseCustos = (valor: unknown): string => {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
};

export const correspondeBuscaAnaliseCustos = (r: any, termoNormalizado: string): boolean => {
  if (!termoNormalizado) return true;
  const campos = [
    r.fornecedorNome,
    r.descricao,
    r.origemDescricao,
    r.numeroOc,
    r.numeroDocumento,
    r.documentoNumero,
    r.obraNome,
    r.obra?.nome,
    r.contaNome,
    r.centroCustoNome,
    r.__centroNome,
  ];
  return campos.some((campo) =>
    normalizarBuscaAnaliseCustos(campo).includes(termoNormalizado)
  );
};

export const filtrarLinhasAnaliseCustos = (rows: any[], busca: string): any[] => {
  const termo = normalizarBuscaAnaliseCustos(busca.trim());
  if (!termo) return rows;

  // O endpoint agrupa títulos de alguns fornecedores por ciclo de fechamento.
  // Durante a busca, usa os títulos reais para que descrição, OC e obra encontrem
  // apenas os lançamentos correspondentes, sem carregar o total inteiro do grupo.
  const linhasReais = rows.flatMap((r) =>
    r?.agrupado && Array.isArray(r.itens) && r.itens.length > 0 ? r.itens : [r]
  );
  return linhasReais.filter((r) => correspondeBuscaAnaliseCustos(r, termo));
};