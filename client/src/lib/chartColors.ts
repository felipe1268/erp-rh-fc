/**
 * Paleta de cores padronizada para todos os gráficos do sistema.
 * Usar estas constantes em todos os dashboards para manter consistência visual.
 */

// Cores primárias para séries de dados (usar em ordem)
export const CHART_PALETTE = [
  "#2563EB", // Azul Royal (primário)
  "#059669", // Verde Esmeralda (positivo/sucesso)
  "#D97706", // Âmbar (atenção/alerta)
  "#DC2626", // Vermelho (negativo/perigo)
  "#7C3AED", // Violeta (destaque)
  "#0891B2", // Ciano (informação)
  "#DB2777", // Rosa (feminino/destaque)
  "#4F46E5", // Índigo (secundário)
  "#0D9488", // Teal (alternativo verde)
  "#EA580C", // Laranja (alternativo alerta)
];

// Cores semânticas (usar para conceitos específicos)
export const SEMANTIC_COLORS = {
  // Status
  positivo: "#059669",     // Verde Esmeralda
  negativo: "#DC2626",     // Vermelho
  alerta: "#D97706",       // Âmbar
  neutro: "#6B7280",       // Cinza
  info: "#2563EB",         // Azul Royal

  // Financeiro
  proventos: "#059669",    // Verde
  descontos: "#DC2626",    // Vermelho
  liquido: "#2563EB",      // Azul
  fgts: "#0891B2",         // Ciano
  inss: "#7C3AED",         // Violeta

  // Gênero
  masculino: "#2563EB",    // Azul
  feminino: "#DB2777",     // Rosa
  outro: "#6B7280",        // Cinza

  // Status de funcionário
  ativo: "#059669",
  ferias: "#2563EB",
  afastado: "#D97706",
  licenca: "#7C3AED",
  desligado: "#DC2626",
  recluso: "#6B7280",
  listaNegra: "#1F2937",

  // Risco jurídico
  riscoAlto: "#DC2626",
  riscoMedio: "#D97706",
  riscoBaixo: "#059669",
  riscoRemoto: "#6B7280",

  // Dias da semana (dom=vermelho, sab=âmbar, semana=azul)
  domingo: "#DC2626",
  sabado: "#D97706",
  diaSemana: "#2563EB",
};

// Cores com transparência para preenchimento de áreas
export const CHART_FILL = {
  azul: "rgba(37, 99, 235, 0.1)",
  verde: "rgba(5, 150, 105, 0.1)",
  vermelho: "rgba(220, 38, 38, 0.1)",
  ambar: "rgba(217, 119, 6, 0.1)",
  violeta: "rgba(124, 58, 237, 0.1)",
  ciano: "rgba(8, 145, 178, 0.1)",
};

// Gerar cores para N itens (usa a paleta em ciclo)
export function getChartColors(count: number): string[] {
  return Array.from({ length: count }, (_, i) => CHART_PALETTE[i % CHART_PALETTE.length]);
}
