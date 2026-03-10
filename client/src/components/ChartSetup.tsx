import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import ChartDataLabels from "chartjs-plugin-datalabels";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  ChartDataLabels
);

// Paleta de cores corporativa do sistema
export const CHART_COLORS = {
  blue: "#1B4F8A",
  darkBlue: "#0A192F",
  gold: "#D4A843",
  green: "#22C55E",
  red: "#EF4444",
  orange: "#F97316",
  purple: "#8B5CF6",
  cyan: "#06B6D4",
  pink: "#EC4899",
  yellow: "#EAB308",
  teal: "#14B8A6",
  indigo: "#6366F1",
  lime: "#84CC16",
  amber: "#F59E0B",
  slate: "#64748B",
};

export const CHART_PALETTE = [
  CHART_COLORS.blue,
  CHART_COLORS.gold,
  CHART_COLORS.green,
  CHART_COLORS.red,
  CHART_COLORS.orange,
  CHART_COLORS.purple,
  CHART_COLORS.cyan,
  CHART_COLORS.pink,
  CHART_COLORS.teal,
  CHART_COLORS.indigo,
  CHART_COLORS.lime,
  CHART_COLORS.amber,
  CHART_COLORS.slate,
];

export const MONTHS_PT = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

export const MONTHS_FULL_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export const defaultBarOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    datalabels: {
      display: true,
      color: "#374151",
      anchor: "end" as const,
      align: "top" as const,
      font: { size: 11, weight: "bold" as const },
      formatter: (v: number) => (v > 0 ? v : ""),
    },
  },
  scales: {
    y: {
      beginAtZero: true,
      ticks: { precision: 0, color: "#6B7280", font: { size: 11 } },
      grid: { color: "#E5E7EB" },
    },
    x: {
      ticks: { color: "#6B7280", font: { size: 11 } },
      grid: { display: false },
    },
  },
};

export const defaultDoughnutOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: "bottom" as const,
      labels: { padding: 16, usePointStyle: true, font: { size: 12 } },
    },
    datalabels: {
      display: true,
      color: "#fff",
      font: { size: 12, weight: "bold" as const },
      formatter: (v: number, ctx: any) => {
        const total = ctx.dataset.data.reduce((a: number, b: number) => a + b, 0);
        if (total === 0 || v === 0) return "";
        const pct = ((v / total) * 100).toFixed(0);
        return `${pct}%`;
      },
    },
  },
};

export const defaultHBarOptions = {
  responsive: true,
  maintainAspectRatio: false,
  indexAxis: "y" as const,
  plugins: {
    legend: { display: false },
    datalabels: {
      display: true,
      color: "#374151",
      anchor: "end" as const,
      align: "right" as const,
      font: { size: 11, weight: "bold" as const },
      formatter: (v: number) => (v > 0 ? v : ""),
    },
  },
  scales: {
    x: {
      beginAtZero: true,
      ticks: { precision: 0, color: "#6B7280", font: { size: 11 } },
      grid: { color: "#E5E7EB" },
    },
    y: {
      ticks: { color: "#374151", font: { size: 11 } },
      grid: { display: false },
    },
  },
};
