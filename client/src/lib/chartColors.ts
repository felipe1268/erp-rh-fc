/**
 * Paleta de cores padronizada para todos os gráficos do sistema.
 * Usar estas constantes em todos os dashboards para manter consistência visual.
 *
 * REGRA DE OURO:
 * - AZUL (#3B82F6) = Admissões / Ativos / Principal
 * - VERMELHO (#EF4444) = Demissões / Desligados / Negativo
 *
 * PALETA: Tons suaves e harmoniosos, agradáveis aos olhos.
 * Inspirada em paletas profissionais com saturação moderada.
 */

// Cores primárias para séries de dados (usar em ordem) — suaves e harmoniosas
export const CHART_PALETTE = [
  "#5B8DEF", // Azul suave (principal)
  "#67C587", // Verde menta
  "#F5A962", // Pêssego dourado
  "#A78BDB", // Lavanda suave
  "#5CC5CF", // Turquesa claro
  "#F28B82", // Coral rosado
  "#7BAAF7", // Azul celeste
  "#81C995", // Verde sage
  "#F7CB73", // Amarelo mel
  "#B39DDB", // Lilás suave
  "#4DB6AC", // Teal sereno
  "#F48FB1", // Rosa claro
];

// Cores semânticas (usar para conceitos específicos)
export const SEMANTIC_COLORS = {
  // Admissões e Demissões (REGRA DO FELIPE)
  admissao: "#5B8DEF",    // Azul suave
  demissao: "#EF5350",    // Vermelho suave

  // Status geral
  positivo: "#5B8DEF",    // Azul suave
  negativo: "#EF5350",    // Vermelho suave
  alerta: "#F5A962",      // Pêssego dourado
  neutro: "#90A4AE",      // Cinza azulado
  info: "#5CC5CF",        // Turquesa claro

  // Financeiro
  proventos: "#67C587",   // Verde menta
  descontos: "#EF5350",   // Vermelho suave
  liquido: "#5B8DEF",     // Azul suave
  fgts: "#5CC5CF",        // Turquesa claro
  inss: "#A78BDB",        // Lavanda suave

  // Gênero
  masculino: "#5B8DEF",   // Azul suave
  feminino: "#F48FB1",    // Rosa claro
  outro: "#90A4AE",       // Cinza azulado

  // Status de funcionário
  ativo: "#67C587",       // Verde menta
  ferias: "#5B8DEF",      // Azul suave
  afastado: "#F5A962",    // Pêssego dourado
  licenca: "#A78BDB",     // Lavanda suave
  desligado: "#EF5350",   // Vermelho suave
  recluso: "#90A4AE",     // Cinza azulado
  listaNegra: "#546E7A",  // Cinza escuro

  // Risco jurídico
  riscoAlto: "#EF5350",   // Vermelho suave
  riscoMedio: "#F5A962",  // Pêssego dourado
  riscoBaixo: "#67C587",  // Verde menta
  riscoRemoto: "#90A4AE", // Cinza azulado

  // Dias da semana
  domingo: "#EF5350",
  sabado: "#F5A962",
  diaSemana: "#5B8DEF",
};

// Cores com transparência para preenchimento de áreas
export const CHART_FILL = {
  azul: "rgba(91, 141, 239, 0.12)",
  verde: "rgba(103, 197, 135, 0.12)",
  vermelho: "rgba(239, 83, 80, 0.12)",
  ambar: "rgba(245, 169, 98, 0.12)",
  violeta: "rgba(167, 139, 219, 0.12)",
  ciano: "rgba(92, 197, 207, 0.12)",
  rosa: "rgba(244, 143, 177, 0.12)",
  laranja: "rgba(245, 169, 98, 0.12)",
};

// Gerar cores para N itens (usa a paleta em ciclo)
export function getChartColors(count: number): string[] {
  return Array.from({ length: count }, (_, i) => CHART_PALETTE[i % CHART_PALETTE.length]);
}
