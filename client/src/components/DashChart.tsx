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
}

const COLORS = [
  "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6",
  "#06B6D4", "#EC4899", "#14B8A6", "#F97316", "#6366F1",
  "#84CC16", "#A855F7", "#22D3EE", "#FB923C", "#4ADE80",
];

export default function DashChart({ title, type, labels, datasets, height = 280, className, showPercentage = true }: DashChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<any>(null);

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

      // For pie/doughnut: show % inside large slices only
      // For bar/line/horizontalBar: NO datalabels (clean), % only in tooltip
      const datalabelsConfig = isPieOrDoughnut && showPercentage ? {
        display: function (context: any) {
          const value = context.dataset.data[context.dataIndex];
          const dataArr = context.dataset.data as number[];
          const total = dataArr.reduce((a: number, b: number) => a + b, 0);
          if (total === 0) return false;
          const pct = (value / total) * 100;
          return pct >= 5; // Only show inside slices >= 5%
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

      // Enhanced tooltip with value + % for ALL chart types
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
            if (isPieOrDoughnut) {
              return ` ${context.label}: ${value} (${pct}%)`;
            }
            return ` ${labelStr}: ${value} (${pct}%)`;
          },
        },
      };

      // For pie/doughnut: show % in legend labels
      const legendConfig = {
        display: datasets.length > 1 || isPieOrDoughnut,
        position: isPieOrDoughnut ? "right" as const : "top" as const,
        labels: {
          font: { size: 11 },
          padding: 8,
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
          plugins: {
            legend: legendConfig,
            tooltip: tooltipConfig,
            datalabels: datalabelsConfig,
          },
          scales: isPieOrDoughnut ? {} : {
            y: { beginAtZero: true, ticks: { font: { size: 11 } } },
            x: { ticks: { font: { size: 11 }, maxRotation: 45 } },
          },
        },
      });
    });

    return () => { mounted = false; if (chartRef.current) chartRef.current.destroy(); };
  }, [type, labels, datasets, height, showPercentage]);

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
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
export function DashKpi({ label, value, color = "blue", icon: Icon, sub }: {
  label: string;
  value: string | number;
  color?: string;
  icon?: any;
  sub?: string;
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
  return (
    <Card className={`border-l-4 ${borderColor}`}>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          {Icon && (
            <div className={`h-10 w-10 rounded-lg ${bgColor} flex items-center justify-center`}>
              <Icon className={`h-5 w-5 ${textColor}`} />
            </div>
          )}
          <div>
            <p className={`text-2xl font-bold ${textColor}`}>{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
            {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
