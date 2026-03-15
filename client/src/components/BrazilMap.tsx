import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
// @ts-ignore — react-simple-maps has no bundled types
import { ComposableMap, Geographies, Geography } from "react-simple-maps";

const GEO_URL = "/brazil-states.json";

const STATE_NAMES: Record<string, string> = {
  AC: "Acre", AL: "Alagoas", AM: "Amazonas", AP: "Amapá", BA: "Bahia",
  CE: "Ceará", DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás",
  MA: "Maranhão", MG: "Minas Gerais", MS: "Mato Grosso do Sul",
  MT: "Mato Grosso", PA: "Pará", PB: "Paraíba", PE: "Pernambuco",
  PI: "Piauí", PR: "Paraná", RJ: "Rio de Janeiro", RN: "Rio Grande do Norte",
  RO: "Rondônia", RR: "Roraima", RS: "Rio Grande do Sul",
  SC: "Santa Catarina", SE: "Sergipe", SP: "São Paulo", TO: "Tocantins",
};

interface BrazilMapProps {
  title: string;
  icon?: React.ReactNode;
  data: { state: string; count: number; details?: string }[];
  onStateClick?: (state: string, name: string) => void;
  colorScheme?: "red" | "blue" | "green" | "purple";
}

export default function BrazilMap({ title, icon, data, onStateClick, colorScheme = "blue" }: BrazilMapProps) {
  const [hoveredState, setHoveredState] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const dataMap = useMemo(() => {
    const m = new Map<string, { count: number; details?: string }>();
    for (const d of data) m.set(d.state.toUpperCase(), { count: d.count, details: d.details });
    return m;
  }, [data]);

  const maxCount = useMemo(() => Math.max(1, ...data.map(d => d.count)), [data]);

  const colorPalettes = {
    red:    { base: "#f0f4ff", active: (i: number) => `hsl(0,${50+i*40}%,${88-i*38}%)`,   hover: "hsl(0,80%,50%)",   text: "text-red-700",    legend: (i: number) => `hsl(0,${55+i*35}%,${85-i*35}%)` },
    blue:   { base: "#eef3fa", active: (i: number) => `hsl(213,${50+i*40}%,${88-i*38}%)`, hover: "hsl(213,85%,42%)", text: "text-blue-700",   legend: (i: number) => `hsl(213,${55+i*35}%,${85-i*35}%)` },
    green:  { base: "#f0faf0", active: (i: number) => `hsl(142,${50+i*40}%,${88-i*38}%)`, hover: "hsl(142,70%,32%)", text: "text-green-700",  legend: (i: number) => `hsl(142,${55+i*35}%,${85-i*35}%)` },
    purple: { base: "#f3eefa", active: (i: number) => `hsl(262,${50+i*40}%,${88-i*38}%)`, hover: "hsl(262,75%,48%)", text: "text-purple-700", legend: (i: number) => `hsl(262,${55+i*35}%,${85-i*35}%)` },
  };
  const palette = colorPalettes[colorScheme];

  const getFill = (stateCode: string) => {
    const d = dataMap.get(stateCode);
    if (!d || d.count === 0) return palette.base;
    if (hoveredState === stateCode) return palette.hover;
    return palette.active(d.count / maxCount);
  };

  const topStates = useMemo(
    () => [...data].filter(d => d.count > 0 && d.state.length === 2 && d.state !== "NÃ")
      .sort((a, b) => b.count - a.count).slice(0, 8),
    [data]
  );

  const naoInformadoCount = useMemo(
    () => data.filter(d => d.count > 0 && (d.state.length !== 2 || d.state === "NÃ")).reduce((sum, d) => sum + d.count, 0),
    [data]
  );

  const totalCount = useMemo(() => data.reduce((sum, d) => sum + d.count, 0), [data]);

  return (
    <Card className="border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Map */}
          <div className="flex-1 relative" style={{ minHeight: 300 }}>
            <ComposableMap
              projection="geoMercator"
              projectionConfig={{ center: [-54, -15], scale: 700 }}
              style={{ width: "100%", height: "100%", minHeight: 300, maxHeight: 400 }}
              onMouseLeave={() => setHoveredState(null)}
            >
                <Geographies geography={GEO_URL}>
                  {({ geographies }) =>
                    geographies.map((geo) => {
                      const code = (geo.properties.sigla || "").toUpperCase();
                      return (
                        <Geography
                          key={geo.rsmKey}
                          geography={geo}
                          fill={getFill(code)}
                          stroke="#ffffff"
                          strokeWidth={0.6}
                          style={{
                            default: { outline: "none" },
                            hover: { outline: "none", cursor: "pointer", opacity: 0.85 },
                            pressed: { outline: "none" },
                          }}
                          onMouseEnter={(e) => {
                            setHoveredState(code);
                            const rect = (e.target as SVGElement).closest("svg")?.getBoundingClientRect();
                            if (rect) setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top - 10 });
                          }}
                          onMouseMove={(e) => {
                            const rect = (e.target as SVGElement).closest("svg")?.getBoundingClientRect();
                            if (rect) setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top - 10 });
                          }}
                          onMouseLeave={() => setHoveredState(null)}
                          onClick={() => onStateClick?.(code, STATE_NAMES[code] || code)}
                        />
                      );
                    })
                  }
                </Geographies>
            </ComposableMap>

            {/* Tooltip */}
            {hoveredState && (
              <div
                className="absolute pointer-events-none bg-popover text-popover-foreground border border-border rounded-lg shadow-xl px-3 py-2 z-50 min-w-[110px]"
                style={{ left: tooltipPos.x, top: tooltipPos.y, transform: "translate(-50%, -100%)" }}
              >
                <p className="text-xs font-bold">{STATE_NAMES[hoveredState] || hoveredState}</p>
                <p className={`text-sm font-bold ${palette.text}`}>
                  {dataMap.get(hoveredState)?.count || 0}{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    {(dataMap.get(hoveredState)?.count || 0) === 1 ? "funcionário" : "funcionários"}
                  </span>
                </p>
                {dataMap.get(hoveredState)?.details && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">{dataMap.get(hoveredState)?.details}</p>
                )}
              </div>
            )}
          </div>

          {/* Legend */}
          {topStates.length > 0 && (
            <div className="lg:w-52 shrink-0">
              <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Top Estados</p>
              <div className="space-y-1.5">
                {topStates.map((s, i) => {
                  const intensity = s.count / maxCount;
                  return (
                    <div
                      key={s.state}
                      className="flex items-center gap-2 text-xs cursor-pointer hover:bg-accent/50 rounded px-1.5 py-1 transition-colors"
                      onClick={() => onStateClick?.(s.state, STATE_NAMES[s.state.toUpperCase()] || s.state)}
                      onMouseEnter={() => setHoveredState(s.state.toUpperCase())}
                      onMouseLeave={() => setHoveredState(null)}
                    >
                      <span className="font-mono text-muted-foreground w-4 text-right">{i + 1}.</span>
                      <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: palette.legend(intensity) }} />
                      <span className="font-medium truncate flex-1">{STATE_NAMES[s.state.toUpperCase()] || s.state}</span>
                      <span className={`font-bold ${palette.text}`}>{s.count}</span>
                    </div>
                  );
                })}
              </div>
              {naoInformadoCount > 0 && (
                <div className="flex items-center gap-2 text-xs px-1.5 py-1 bg-muted/50 rounded mt-1">
                  <span className="font-mono text-muted-foreground w-4 text-right">—</span>
                  <div className="w-3 h-3 rounded-sm shrink-0 bg-gray-300" />
                  <span className="font-medium truncate flex-1">Não informado</span>
                  <span className="font-bold text-gray-500">{naoInformadoCount}</span>
                </div>
              )}
              <div className="text-[10px] text-muted-foreground mt-2 text-right">Total: {totalCount}</div>
              <div className="mt-3 pt-3 border-t border-border">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground">0</span>
                  <div className="flex-1 h-2 rounded-full overflow-hidden flex">
                    {Array.from({ length: 10 }).map((_, i) => (
                      <div key={i} className="flex-1" style={{ backgroundColor: palette.legend((i + 1) / 10) }} />
                    ))}
                  </div>
                  <span className="text-[10px] text-muted-foreground">{maxCount}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
