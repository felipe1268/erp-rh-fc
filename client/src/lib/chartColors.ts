/**
 * Paleta de cores padronizada para todos os gráficos do sistema.
 * Usar estas constantes em todos os dashboards para manter consistência visual.
 *
 * REGRA DE OURO:
 * - AZUL (#2563EB) = Admissões / Ativos / Principal
 * - VERMELHO (#DC2626) = Demissões / Desligados / Negativo
 */

// Cores primárias para séries de dados (usar em ordem) — vibrantes e variadas
export const CHART_PALETTE = [
  "#2563EB", // Azul Royal (admissões, ativos, principal)
  "#F59E0B", // Âmbar vibrante (destaque quente)
  "#8B5CF6", // Violeta intenso
  "#DC2626", // Vermelho (demissões, negativo)
  "#06B6D4", // Ciano oceano
  "#EC4899", // Rosa vibrante
  "#10B981", // Esmeralda
  "#F97316", // Laranja fogo
  "#6366F1", // Índigo profundo
  "#14B8A6", // Teal tropical
  "#A855F7", // Púrpura elétrico
  "#EAB308", // Amarelo ouro
];

// Cores semânticas (usar para conceitos específicos)
export const SEMANTIC_COLORS = {
  // Admissões e Demissões (REGRA DO FELIPE)
  admissao: "#2563EB",    // Azul Royal
  demissao: "#DC2626",    // Vermelho

  // Status geral
  positivo: "#2563EB",    // Azul (admissões = positivo)
  negativo: "#DC2626",    // Vermelho (demissões = negativo)
  alerta: "#F59E0B",      // Âmbar vibrante
  neutro: "#6B7280",      // Cinza
  info: "#06B6D4",        // Ciano oceano

  // Financeiro
  proventos: "#10B981",   // Esmeralda
  descontos: "#DC2626",   // Vermelho
  liquido: "#2563EB",     // Azul
  fgts: "#06B6D4",        // Ciano oceano
  inss: "#8B5CF6",        // Violeta intenso

  // Gênero
  masculino: "#2563EB",   // Azul
  feminino: "#EC4899",    // Rosa vibrante
  outro: "#6B7280",       // Cinza

  // Status de funcionário
  ativo: "#10B981",       // Esmeralda
  ferias: "#2563EB",      // Azul
  afastado: "#F59E0B",    // Âmbar vibrante
  licenca: "#8B5CF6",     // Violeta intenso
  desligado: "#DC2626",   // Vermelho
  recluso: "#6B7280",     // Cinza
  listaNegra: "#1F2937",  // Grafite escuro

  // Risco jurídico
  riscoAlto: "#DC2626",   // Vermelho
  riscoMedio: "#F59E0B",  // Âmbar
  riscoBaixo: "#10B981",  // Esmeralda
  riscoRemoto: "#6B7280", // Cinza

  // Dias da semana
  domingo: "#DC2626",
  sabado: "#F59E0B",
  diaSemana: "#2563EB",
};

// Cores com transparência para preenchimento de áreas
export const CHART_FILL = {
  azul: "rgba(37, 99, 235, 0.15)",
  verde: "rgba(16, 185, 129, 0.15)",
  vermelho: "rgba(220, 38, 38, 0.15)",
  ambar: "rgba(245, 158, 11, 0.15)",
  violeta: "rgba(139, 92, 246, 0.15)",
  ciano: "rgba(6, 182, 212, 0.15)",
  rosa: "rgba(236, 72, 153, 0.15)",
  laranja: "rgba(249, 115, 22, 0.15)",
};

// Gerar cores para N itens (usa a paleta em ciclo)
export function getChartColors(count: number): string[] {
  return Array.from({ length: count }, (_, i) => CHART_PALETTE[i % CHART_PALETTE.length]);
}
