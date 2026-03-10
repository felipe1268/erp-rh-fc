import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// SVG path data for Brazilian states (simplified but recognizable)
const STATES: Record<string, { path: string; name: string; center: [number, number] }> = {
  AC: { name: "Acre", center: [110, 310], path: "M80,290 L140,290 L140,330 L80,330 Z" },
  AL: { name: "Alagoas", center: [640, 310], path: "M625,300 L655,300 L655,320 L625,320 Z" },
  AM: { name: "Amazonas", center: [200, 210], path: "M100,150 L300,150 L300,280 L100,280 Z" },
  AP: { name: "Amapá", center: [340, 120], path: "M315,80 L365,80 L365,160 L315,160 Z" },
  BA: { name: "Bahia", center: [570, 340], path: "M500,260 L640,260 L640,420 L500,420 Z" },
  CE: { name: "Ceará", center: [600, 230], path: "M570,200 L630,200 L630,260 L570,260 Z" },
  DF: { name: "Distrito Federal", center: [470, 380], path: "M460,370 L480,370 L480,390 L460,390 Z" },
  ES: { name: "Espírito Santo", center: [560, 440], path: "M540,420 L580,420 L580,460 L540,460 Z" },
  GO: { name: "Goiás", center: [440, 390], path: "M400,340 L480,340 L480,440 L400,440 Z" },
  MA: { name: "Maranhão", center: [480, 210], path: "M440,160 L520,160 L520,260 L440,260 Z" },
  MG: { name: "Minas Gerais", center: [500, 430], path: "M430,380 L570,380 L570,480 L430,480 Z" },
  MS: { name: "Mato Grosso do Sul", center: [350, 450], path: "M300,400 L400,400 L400,500 L300,500 Z" },
  MT: { name: "Mato Grosso", center: [320, 330], path: "M250,260 L400,260 L400,400 L250,400 Z" },
  PA: { name: "Pará", center: [350, 200], path: "M250,120 L440,120 L440,280 L250,280 Z" },
  PB: { name: "Paraíba", center: [630, 260], path: "M600,250 L660,250 L660,270 L600,270 Z" },
  PE: { name: "Pernambuco", center: [620, 280], path: "M575,270 L660,270 L660,300 L575,300 Z" },
  PI: { name: "Piauí", center: [530, 250], path: "M500,190 L560,190 L560,310 L500,310 Z" },
  PR: { name: "Paraná", center: [400, 510], path: "M350,480 L450,480 L450,540 L350,540 Z" },
  RJ: { name: "Rio de Janeiro", center: [520, 480], path: "M490,465 L555,465 L555,500 L490,500 Z" },
  RN: { name: "Rio Grande do Norte", center: [625, 240], path: "M600,225 L650,225 L650,250 L600,250 Z" },
  RO: { name: "Rondônia", center: [190, 330], path: "M150,290 L230,290 L230,370 L150,370 Z" },
  RR: { name: "Roraima", center: [195, 130], path: "M160,70 L230,70 L230,150 L160,150 Z" },
  RS: { name: "Rio Grande do Sul", center: [380, 570], path: "M330,540 L430,540 L430,620 L330,620 Z" },
  SC: { name: "Santa Catarina", center: [400, 545], path: "M360,530 L440,530 L440,560 L360,560 Z" },
  SE: { name: "Sergipe", center: [640, 325], path: "M625,315 L655,315 L655,340 L625,340 Z" },
  SP: { name: "São Paulo", center: [440, 480], path: "M390,450 L530,450 L530,510 L390,510 Z" },
  TO: { name: "Tocantins", center: [440, 290], path: "M420,220 L480,220 L480,340 L420,340 Z" },
};

// Better SVG paths for a more realistic Brazil map
const BRAZIL_PATHS: Record<string, string> = {
  AC: "M62,297 L62,274 L100,274 L100,297 L88,310 L62,310 Z",
  AL: "M610,296 L625,288 L632,296 L625,310 L610,306 Z",
  AM: "M100,140 L100,274 L62,274 L62,250 L80,230 L80,200 L100,180 L140,160 L200,140 L260,140 L300,160 L300,200 L260,240 L200,260 L160,274 L100,274 L100,140 Z",
  AP: "M310,60 L340,40 L360,60 L360,120 L340,140 L310,120 Z",
  BA: "M500,250 L540,240 L580,250 L620,270 L625,288 L610,296 L625,310 L630,340 L620,380 L580,400 L540,400 L500,380 L490,340 L490,300 Z",
  CE: "M560,200 L600,190 L620,210 L620,250 L580,260 L560,240 Z",
  DF: "M460,370 L475,365 L480,375 L470,385 L458,380 Z",
  ES: "M540,410 L560,400 L570,420 L560,445 L540,440 Z",
  GO: "M400,340 L460,330 L490,340 L490,300 L500,380 L480,410 L460,420 L420,420 L400,400 Z",
  MA: "M440,160 L480,150 L520,170 L540,200 L540,240 L500,250 L480,230 L460,240 L440,220 Z",
  MG: "M430,380 L460,370 L480,375 L490,340 L500,380 L540,400 L560,400 L570,420 L560,445 L540,460 L500,470 L460,460 L430,440 Z",
  MS: "M300,400 L340,380 L400,400 L420,420 L400,480 L360,500 L320,490 L300,460 Z",
  MT: "M200,260 L260,240 L300,260 L340,280 L400,300 L400,340 L340,380 L300,400 L260,380 L220,340 L200,300 Z",
  PA: "M260,120 L310,120 L340,140 L360,160 L440,160 L440,220 L460,240 L480,230 L500,250 L490,300 L400,300 L340,280 L300,260 L260,240 L200,260 L160,240 L160,200 L200,180 L220,160 Z",
  PB: "M600,258 L630,250 L640,260 L620,270 L600,268 Z",
  PE: "M570,270 L600,258 L600,268 L620,270 L640,280 L640,296 L625,288 L610,296 L580,290 Z",
  PI: "M500,200 L540,200 L560,240 L580,260 L540,270 L500,250 L490,230 Z",
  PR: "M340,480 L400,480 L440,470 L460,490 L440,510 L400,520 L360,510 L340,500 Z",
  RJ: "M490,460 L540,460 L555,475 L540,490 L500,490 L490,480 Z",
  RN: "M600,230 L630,220 L645,235 L630,250 L600,258 Z",
  RO: "M140,280 L200,260 L200,300 L220,340 L200,360 L160,360 L140,330 Z",
  RR: "M160,60 L200,40 L230,60 L230,120 L200,140 L160,140 L140,120 L140,80 Z",
  RS: "M320,520 L360,510 L400,520 L420,540 L400,580 L360,600 L320,580 L310,550 Z",
  SC: "M360,510 L400,500 L440,510 L440,530 L400,540 L360,530 Z",
  SE: "M620,300 L635,296 L640,310 L630,318 L620,310 Z",
  SP: "M400,450 L460,440 L500,450 L540,460 L540,490 L500,500 L460,490 L440,470 L400,480 Z",
  TO: "M440,220 L480,230 L490,230 L500,250 L500,300 L490,340 L460,330 L440,300 L430,260 Z",
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
    red: { base: "hsl(0, 70%, 95%)", active: (intensity: number) => `hsl(0, ${50 + intensity * 40}%, ${85 - intensity * 35}%)`, hover: "hsl(0, 80%, 60%)", text: "text-red-700" },
    blue: { base: "hsl(210, 70%, 95%)", active: (intensity: number) => `hsl(210, ${50 + intensity * 40}%, ${85 - intensity * 35}%)`, hover: "hsl(210, 80%, 55%)", text: "text-blue-700" },
    green: { base: "hsl(140, 70%, 95%)", active: (intensity: number) => `hsl(140, ${50 + intensity * 40}%, ${85 - intensity * 35}%)`, hover: "hsl(140, 80%, 40%)", text: "text-green-700" },
    purple: { base: "hsl(270, 70%, 95%)", active: (intensity: number) => `hsl(270, ${50 + intensity * 40}%, ${85 - intensity * 35}%)`, hover: "hsl(270, 80%, 55%)", text: "text-purple-700" },
  };
  const palette = colorPalettes[colorScheme];

  const getColor = (stateCode: string) => {
    const d = dataMap.get(stateCode);
    if (!d || d.count === 0) return palette.base;
    if (hoveredState === stateCode) return palette.hover;
    return palette.active(d.count / maxCount);
  };

  // Top states list (only valid state codes)
  const topStates = useMemo(() => {
    return [...data].filter(d => d.count > 0 && d.state.length === 2 && d.state !== 'NÃ').sort((a, b) => b.count - a.count).slice(0, 8);
  }, [data]);

  // "Não informado" count (entries that are not valid state codes)
  const naoInformadoCount = useMemo(() => {
    return data.filter(d => d.count > 0 && (d.state.length !== 2 || d.state === 'NÃ')).reduce((sum, d) => sum + d.count, 0);
  }, [data]);

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
          <div className="flex-1 relative" style={{ minHeight: 320 }}>
            <svg
              viewBox="40 30 630 600"
              className="w-full h-full"
              style={{ maxHeight: 400 }}
              onMouseLeave={() => setHoveredState(null)}
            >
              {Object.entries(BRAZIL_PATHS).map(([code, path]) => {
                const stateInfo = STATES[code];
                const d = dataMap.get(code);
                return (
                  <g key={code}>
                    <path
                      d={path}
                      fill={getColor(code)}
                      stroke="white"
                      strokeWidth={1.5}
                      className="transition-all duration-200 cursor-pointer"
                      onMouseEnter={(e) => {
                        setHoveredState(code);
                        const rect = (e.target as SVGElement).closest("svg")?.getBoundingClientRect();
                        if (rect) {
                          setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top - 10 });
                        }
                      }}
                      onMouseMove={(e) => {
                        const rect = (e.target as SVGElement).closest("svg")?.getBoundingClientRect();
                        if (rect) {
                          setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top - 10 });
                        }
                      }}
                      onClick={() => onStateClick?.(code, stateInfo?.name || code)}
                    />
                    {/* State label */}
                    {stateInfo && (
                      <text
                        x={stateInfo.center[0]}
                        y={stateInfo.center[1]}
                        textAnchor="middle"
                        dominantBaseline="central"
                        className="pointer-events-none select-none"
                        style={{ fontSize: code === "DF" ? 7 : 9, fontWeight: d && d.count > 0 ? 700 : 400, fill: d && d.count > 0 ? "#1e293b" : "#94a3b8" }}
                      >
                        {code}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
            {/* Tooltip */}
            {hoveredState && (
              <div
                className="absolute pointer-events-none bg-popover text-popover-foreground border border-border rounded-lg shadow-lg px-3 py-2 z-50"
                style={{ left: tooltipPos.x, top: tooltipPos.y, transform: "translate(-50%, -100%)" }}
              >
                <p className="text-xs font-bold">{STATES[hoveredState]?.name || hoveredState}</p>
                <p className={`text-sm font-bold ${palette.text}`}>
                  {dataMap.get(hoveredState)?.count || 0}
                </p>
                {dataMap.get(hoveredState)?.details && (
                  <p className="text-[10px] text-muted-foreground">{dataMap.get(hoveredState)?.details}</p>
                )}
              </div>
            )}
          </div>
          {/* Legend / Top states */}
          {topStates.length > 0 && (
            <div className="lg:w-48 shrink-0">
              <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Top Estados</p>
              <div className="space-y-1.5">
                {topStates.map((s, i) => {
                  const intensity = s.count / maxCount;
                  return (
                    <div
                      key={s.state}
                      className="flex items-center gap-2 text-xs cursor-pointer hover:bg-accent/50 rounded px-1.5 py-1 transition-colors"
                      onClick={() => onStateClick?.(s.state, STATES[s.state.toUpperCase()]?.name || s.state)}
                      onMouseEnter={() => setHoveredState(s.state.toUpperCase())}
                      onMouseLeave={() => setHoveredState(null)}
                    >
                      <span className="font-mono text-muted-foreground w-4 text-right">{i + 1}.</span>
                      <div
                        className="w-3 h-3 rounded-sm shrink-0"
                        style={{ backgroundColor: palette.active(intensity) }}
                      />
                      <span className="font-medium truncate flex-1">{STATES[s.state.toUpperCase()]?.name || s.state}</span>
                      <span className={`font-bold ${palette.text}`}>{s.count}</span>
                    </div>
                  );
                })}
              </div>
              {naoInformadoCount > 0 && (
                <div className="flex items-center gap-2 text-xs px-1.5 py-1 bg-gray-100 rounded mt-1">
                  <span className="font-mono text-muted-foreground w-4 text-right">—</span>
                  <div className="w-3 h-3 rounded-sm shrink-0 bg-gray-300" />
                  <span className="font-medium truncate flex-1">Não informado</span>
                  <span className="font-bold text-gray-500">{naoInformadoCount}</span>
                </div>
              )}
              <div className="text-[10px] text-muted-foreground mt-2 text-right">Total: {totalCount}</div>
              {/* Color scale */}
              <div className="mt-2 pt-3 border-t border-border">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-muted-foreground">0</span>
                  <div className="flex-1 h-2 rounded-full overflow-hidden flex">
                    {Array.from({ length: 10 }).map((_, i) => (
                      <div key={i} className="flex-1" style={{ backgroundColor: palette.active((i + 1) / 10) }} />
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
