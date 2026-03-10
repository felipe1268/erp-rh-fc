import { useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Lazy load Chart.js
let ChartJS: any = null;
let ChartDataLabels: any = null;
const loadChartJS = async () => {
  if (ChartJS) return { CJS: ChartJS, DL: ChartDataLabels };
  const [mod, dlMod] = await Promise.all([
    import("chart.js/auto"),
    import("chartjs-plugin-datalabels"),
  ]);
  ChartJS = mod.default || mod.Chart;
  ChartDataLabels = dlMod.default || dlMod;
  ChartJS.register(ChartDataLabels);
  return { CJS: ChartJS, DL: ChartDataLabels };
};

type ChartType = "bar" | "doughnut" | "pie" | "line" | "horizontalBar";

export interface ChartClickInfo {
  label: string;
  datasetLabel?: string;
  datasetIndex: number;
  dataIndex: number;
  value: number;
}

interface DashChartProps {
  title: string;
  type: ChartType;
  labels: string[];
  datasets: Array<{
    label?: string;
    data: number[];
    backgroundColor?: string | string[];
    borderColor?: string | string[];
    borderWidth?: number;
    fill?: boolean;
    tension?: number;
  }>;
  height?: number;
  className?: string;
  showPercentage?: boolean;
  onChartClick?: (info: ChartClickInfo) => void;
  valueFormatter?: (value: number) => string;
}

const COLORS = [
  "#2563EB", "#F59E0B", "#8B5CF6", "#DC2626", "#06B6D4",
  "#EC4899", "#10B981", "#F97316", "#6366F1", "#14B8A6",
  "#A855F7", "#EAB308", "#0EA5E9", "#E11D48", "#059669",
];

export default function DashChart({ title, type, labels, datasets, height = 280, className, showPercentage = true, onChartClick, valueFormatter }: DashChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<any>(null);
  const onClickRef = useRef(onChartClick);
  onClickRef.current = onChartClick;

  useEffect(() => {
    let mounted = true;
    loadChartJS().then(({ CJS }) => {
      if (!mounted || !canvasRef.current) return;
      if (chartRef.current) chartRef.current.destroy();

      const isHorizontalBar = type === "horizontalBar";
      const chartType = isHorizontalBar ? "bar" : type;
      const isPieOrDoughnut = ["doughnut", "pie"].includes(type);

      const processedDatasets = datasets.map((ds, i) => ({
        ...ds,
        backgroundColor: ds.backgroundColor || (isPieOrDoughnut ? COLORS : COLORS[i % COLORS.length]),
        borderColor: ds.borderColor || (isPieOrDoughnut ? "#fff" : COLORS[i % COLORS.length]),
        borderWidth: ds.borderWidth ?? (isPieOrDoughnut ? 2 : 1),
      }));

      const datalabelsConfig = isPieOrDoughnut && showPercentage ? {
        display: function (context: any) {
          const value = context.dataset.data[context.dataIndex];
          const dataArr = context.dataset.data as number[];
          const total = dataArr.reduce((a: number, b: number) => a + b, 0);
          if (total === 0) return false;
          const pct = (value / total) * 100;
          return pct >= 5;
        },
        formatter: function (value: number, context: any) {
          const dataArr = context.dataset.data as number[];
          const total = dataArr.reduce((a: number, b: number) => a + b, 0);
          if (total === 0) return "";
          const pct = ((value / total) * 100).toFixed(1);
          return `${pct}%`;
        },
        color: "#fff",
        font: { size: 11, weight: "bold" as const },
        anchor: "center" as const,
        align: "center" as const,
        textAlign: "center" as const,
      } : { display: false as const };

      const tooltipConfig = {
        backgroundColor: "rgba(15, 23, 42, 0.92)",
        titleFont: { size: 12, weight: "bold" as const },
        bodyFont: { size: 12 },
        padding: 10,
        cornerRadius: 8,
        displayColors: true,
        boxPadding: 4,
        callbacks: {
          label: function (context: any) {
            const dataset = context.dataset;
            const value = context.parsed !== undefined
              ? (typeof context.parsed === "object" ? (isHorizontalBar ? context.parsed.x : context.parsed.y) : context.parsed)
              : context.raw;
            const dataArr = dataset.data as number[];
            const total = dataArr.reduce((a: number, b: number) => a + b, 0);
            const pct = total > 0 ? ((value / total) * 100).toFixed(1) : "0.0";
            const labelStr = dataset.label || context.label || "";
            const fmtVal = valueFormatter ? valueFormatter(value) : String(value);
            if (isPieOrDoughnut) {
              return ` ${context.label}: ${fmtVal} (${pct}%)`;
            }
            return ` ${labelStr}: ${fmtVal} (${pct}%)`;
          },
          ...(onChartClick ? {
            afterLabel: () => "🔍 Clique para ver detalhes",
          } : {}),
        },
      };

      const isMobile = window.innerWidth < 768;
      const legendConfig = {
        display: datasets.length > 1 || isPieOrDoughnut,
        position: isPieOrDoughnut ? (isMobile ? "bottom" as const : "right" as const) : "top" as const,
        labels: {
          font: { size: isMobile ? 10 : 11 },
          padding: isMobile ? 6 : 8,
          boxWidth: isMobile ? 10 : 40,
          ...(isPieOrDoughnut && showPercentage ? {
            generateLabels: function (chart: any) {
              const data = chart.data;
              if (!data.labels || !data.datasets.length) return [];
              const dataset = data.datasets[0];
              const total = (dataset.data as number[]).reduce((a: number, b: number) => a + b, 0);
              return data.labels.map((label: string, i: number) => {
                const value = dataset.data[i] as number;
                const pct = total > 0 ? ((value / total) * 100).toFixed(1) : "0.0";
                const bgColors = Array.isArray(dataset.backgroundColor) ? dataset.backgroundColor : COLORS;
                return {
                  text: `${label}: ${value} (${pct}%)`,
                  fillStyle: bgColors[i % bgColors.length],
                  strokeStyle: "#fff",
                  lineWidth: 1,
                  hidden: chart.getDatasetMeta(0).data[i]?.hidden || false,
                  index: i,
                };
              });
            },
          } : {}),
        },
      };

      chartRef.current = new CJS(canvasRef.current, {
        type: chartType,
        data: { labels, datasets: processedDatasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          indexAxis: isHorizontalBar ? "y" : "x",
          ...(onChartClick ? { 
            onHover: (event: any, elements: any[]) => {
              const canvas = event.native?.target;
              if (canvas) canvas.style.cursor = elements.length > 0 ? 'pointer' : 'default';
            },
          } : {}),
          onClick: (_event: any, elements: any[], chart: any) => {
            console.log('[DashChart] onClick fired, elements:', elements.length, 'hasCallback:', !!onClickRef.current);
            if (!onClickRef.current || elements.length === 0) return;
            const el = elements[0];
            const datasetIndex = el.datasetIndex;
            const dataIndex = el.index;
            const label = chart.data.labels[dataIndex];
            const datasetLabel = chart.data.datasets[datasetIndex]?.label;
            const value = chart.data.datasets[datasetIndex].data[dataIndex];
            onClickRef.current({
              label,
              datasetLabel,
              datasetIndex,
              dataIndex,
              value,
            });
          },
          plugins: {
            legend: legendConfig,
            tooltip: tooltipConfig,
            datalabels: datalabelsConfig,
          },
          scales: isPieOrDoughnut ? {} : {
            y: { beginAtZero: true, ticks: { font: { size: 11 }, ...(valueFormatter && !isHorizontalBar ? { callback: (v: any) => valueFormatter(v) } : {}) } },
            x: { ticks: { font: { size: 11 }, maxRotation: 45, ...(valueFormatter && isHorizontalBar ? { callback: (v: any) => valueFormatter(v) } : {}) } },
          },
        },
      });
    });

    return () => { mounted = false; if (chartRef.current) chartRef.current.destroy(); };
  }, [type, labels, datasets, height, showPercentage, valueFormatter]);

  return (
    <Card className={`${className || ''} ${onChartClick ? 'ring-1 ring-transparent hover:ring-blue-200 transition-all' : ''}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">{title}</CardTitle>
          {onChartClick ? (
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" /></svg>
              Clique para detalhes
            </span>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        <div style={{ height: `${height}px` }}>
          <canvas ref={canvasRef} />
        </div>
      </CardContent>
    </Card>
  );
}

// KPI Card for dashboards
export function DashKpi({ label, value, color = "blue", icon: Icon, sub, active }: {
  label: string;
  value: string | number;
  color?: string;
  icon?: any;
  sub?: string;
  active?: boolean;
}) {
  const colorMap: Record<string, string> = {
    blue: "text-blue-600 bg-blue-50 border-l-blue-500",
    green: "text-green-600 bg-green-50 border-l-green-500",
    red: "text-red-600 bg-red-50 border-l-red-500",
    yellow: "text-yellow-600 bg-yellow-50 border-l-yellow-500",
    orange: "text-orange-600 bg-orange-50 border-l-orange-500",
    purple: "text-purple-600 bg-purple-50 border-l-purple-500",
    teal: "text-teal-600 bg-teal-50 border-l-teal-500",
    slate: "text-slate-600 bg-slate-50 border-l-slate-500",
    indigo: "text-indigo-600 bg-indigo-50 border-l-indigo-500",
  };
  const c = colorMap[color] || colorMap.blue;
  const [textColor, bgColor, borderColor] = c.split(" ");
  const isMonetary = typeof value === 'string' && value.startsWith('R$');
  // Format numeric values with Brazilian locale (dot as thousand separator)
  const displayValue = (() => {
    if (typeof value === 'number') return value.toLocaleString('pt-BR');
    if (typeof value === 'string' && !isMonetary && /^\d+$/.test(value.trim())) return Number(value).toLocaleString('pt-BR');
    return value;
  })();
  return (
    <Card className={`border-l-4 ${borderColor} transition-all ${active ? 'ring-2 ring-offset-1 ring-blue-400 shadow-md scale-[1.02]' : 'hover:shadow-sm'}`}>
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-center gap-2 sm:gap-3">
          {Icon && (
            <div className={`h-8 w-8 sm:h-10 sm:w-10 rounded-lg ${bgColor} flex items-center justify-center shrink-0`}>
              <Icon className={`h-4 w-4 sm:h-5 sm:w-5 ${textColor}`} />
            </div>
          )}
          <div className="min-w-0">
            <p className={`${isMonetary ? 'text-base sm:text-lg md:text-2xl' : 'text-xl sm:text-2xl'} font-bold ${textColor} truncate`}>{displayValue}</p>
            <p className="text-[10px] sm:text-xs text-muted-foreground">{label}</p>
            {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
