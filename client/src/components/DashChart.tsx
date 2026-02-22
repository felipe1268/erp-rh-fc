import { useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Lazy load Chart.js
let ChartJS: any = null;
const loadChartJS = async () => {
  if (ChartJS) return ChartJS;
  const mod = await import("chart.js/auto");
  ChartJS = mod.default || mod.Chart;
  return ChartJS;
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
}

const COLORS = [
  "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6",
  "#06B6D4", "#EC4899", "#14B8A6", "#F97316", "#6366F1",
  "#84CC16", "#A855F7", "#22D3EE", "#FB923C", "#4ADE80",
];

export default function DashChart({ title, type, labels, datasets, height = 280, className }: DashChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<any>(null);

  useEffect(() => {
    let mounted = true;
    loadChartJS().then((CJS) => {
      if (!mounted || !canvasRef.current) return;
      if (chartRef.current) chartRef.current.destroy();

      const isHorizontalBar = type === "horizontalBar";
      const chartType = isHorizontalBar ? "bar" : type;

      const processedDatasets = datasets.map((ds, i) => ({
        ...ds,
        backgroundColor: ds.backgroundColor || (["doughnut", "pie"].includes(type) ? COLORS : COLORS[i % COLORS.length]),
        borderColor: ds.borderColor || (["doughnut", "pie"].includes(type) ? "#fff" : COLORS[i % COLORS.length]),
        borderWidth: ds.borderWidth ?? (["doughnut", "pie"].includes(type) ? 2 : 1),
      }));

      chartRef.current = new CJS(canvasRef.current, {
        type: chartType,
        data: { labels, datasets: processedDatasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          indexAxis: isHorizontalBar ? "y" : "x",
          plugins: {
            legend: {
              display: datasets.length > 1 || ["doughnut", "pie"].includes(type),
              position: ["doughnut", "pie"].includes(type) ? "right" : "top",
              labels: { font: { size: 11 }, padding: 8 },
            },
          },
          scales: ["doughnut", "pie"].includes(type) ? {} : {
            y: { beginAtZero: true, ticks: { font: { size: 11 } } },
            x: { ticks: { font: { size: 11 }, maxRotation: 45 } },
          },
        },
      });
    });

    return () => { mounted = false; if (chartRef.current) chartRef.current.destroy(); };
  }, [type, labels, datasets, height]);

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
