import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const STATES_DATA: Record<string, { name: string; center: [number, number]; path: string }> = {
  AC: {
    name: "Acre",
    center: [123, 338],
    path: "M 79,310 L 93,297 L 115,293 L 140,296 L 162,304 L 178,315 L 183,328 L 172,338 L 155,345 L 133,348 L 110,342 L 90,330 Z",
  },
  AL: {
    name: "Alagoas",
    center: [566, 311],
    path: "M 548,299 L 562,295 L 576,298 L 582,308 L 578,320 L 566,325 L 553,320 L 547,309 Z",
  },
  AM: {
    name: "Amazonas",
    center: [208, 228],
    path: "M 79,155 L 100,140 L 130,128 L 165,118 L 200,114 L 235,116 L 262,124 L 285,140 L 295,160 L 302,178 L 308,200 L 312,222 L 308,245 L 300,265 L 285,278 L 268,285 L 248,290 L 228,292 L 205,290 L 183,285 L 162,275 L 145,262 L 135,248 L 132,232 L 128,216 L 118,205 L 102,198 L 88,205 L 78,218 L 72,235 L 68,255 L 70,275 L 78,295 L 79,310 L 90,330 L 110,342 L 115,355 L 110,368 L 100,378 L 85,382 L 70,378 L 58,368 L 50,353 L 47,335 L 48,315 L 53,295 L 58,275 L 62,255 L 63,235 L 65,215 L 68,195 L 72,175 L 78,163 Z",
  },
  AP: {
    name: "Amapá",
    center: [492, 105],
    path: "M 462,70 L 480,58 L 498,52 L 516,55 L 530,65 L 538,80 L 538,98 L 532,115 L 520,130 L 505,140 L 490,148 L 475,148 L 462,140 L 452,128 L 448,112 L 450,95 Z",
  },
  BA: {
    name: "Bahia",
    center: [508, 365],
    path: "M 392,268 L 415,260 L 440,255 L 465,255 L 488,260 L 508,265 L 524,272 L 538,280 L 550,292 L 558,305 L 560,318 L 556,330 L 548,342 L 542,355 L 540,370 L 542,385 L 548,398 L 550,412 L 545,425 L 535,433 L 520,438 L 504,440 L 488,438 L 472,432 L 458,422 L 448,408 L 442,392 L 440,375 L 438,358 L 432,342 L 422,330 L 410,320 L 400,308 L 392,295 Z",
  },
  CE: {
    name: "Ceará",
    center: [539, 218],
    path: "M 510,192 L 525,183 L 542,180 L 558,183 L 572,192 L 582,205 L 585,220 L 580,235 L 570,248 L 556,255 L 540,258 L 524,254 L 510,244 L 502,232 L 500,218 Z",
  },
  DF: {
    name: "Distrito Federal",
    center: [426, 408],
    path: "M 420,402 L 430,400 L 435,407 L 433,414 L 425,416 L 418,412 Z",
  },
  ES: {
    name: "Espírito Santo",
    center: [546, 458],
    path: "M 534,438 L 545,433 L 556,437 L 563,447 L 563,460 L 558,472 L 548,478 L 536,475 L 528,466 L 527,453 Z",
  },
  GO: {
    name: "Goiás",
    center: [408, 405],
    path: "M 348,342 L 368,334 L 390,328 L 412,325 L 432,328 L 448,338 L 458,352 L 462,368 L 460,385 L 454,400 L 444,412 L 430,420 L 414,424 L 398,422 L 382,415 L 368,404 L 358,390 L 350,375 L 346,358 Z",
  },
  MA: {
    name: "Maranhão",
    center: [462, 213],
    path: "M 392,172 L 412,162 L 432,156 L 452,154 L 470,158 L 485,168 L 495,182 L 500,198 L 500,215 L 496,230 L 488,242 L 476,250 L 462,255 L 448,255 L 434,250 L 420,242 L 408,230 L 400,216 L 395,200 Z",
  },
  MG: {
    name: "Minas Gerais",
    center: [482, 455],
    path: "M 400,400 L 418,392 L 438,388 L 458,390 L 475,396 L 490,405 L 504,415 L 516,428 L 524,442 L 528,456 L 527,470 L 520,482 L 508,490 L 494,494 L 478,494 L 462,490 L 448,480 L 436,468 L 426,454 L 418,440 L 408,428 Z",
  },
  MS: {
    name: "Mato Grosso do Sul",
    center: [325, 502],
    path: "M 270,452 L 292,444 L 315,440 L 338,440 L 358,445 L 372,456 L 380,470 L 382,485 L 378,500 L 370,514 L 358,524 L 342,530 L 325,532 L 308,528 L 292,518 L 280,505 L 272,490 L 268,474 Z",
  },
  MT: {
    name: "Mato Grosso",
    center: [300, 355],
    path: "M 183,285 L 205,280 L 228,278 L 248,280 L 268,285 L 285,295 L 298,308 L 308,325 L 315,342 L 318,360 L 315,378 L 308,394 L 298,406 L 285,414 L 270,418 L 252,418 L 235,412 L 220,402 L 208,388 L 200,373 L 196,356 L 194,338 L 192,320 L 188,303 Z",
  },
  PA: {
    name: "Pará",
    center: [400, 192],
    path: "M 262,124 L 290,112 L 320,105 L 352,100 L 385,98 L 415,100 L 440,108 L 462,120 L 480,135 L 492,152 L 498,170 L 500,188 L 498,205 L 492,218 L 482,228 L 470,235 L 456,240 L 440,242 L 425,240 L 410,235 L 398,226 L 388,215 L 378,202 L 366,192 L 350,185 L 332,182 L 315,183 L 300,188 L 288,197 L 280,210 L 275,225 L 270,240 L 262,252 L 252,260 L 240,265 L 228,268 L 215,268 L 202,265 L 190,258 L 180,248 L 172,235 L 168,220 L 168,205 L 172,190 L 180,178 L 190,168 L 202,158 L 215,150 L 230,144 L 245,138 L 260,132 Z",
  },
  PB: {
    name: "Paraíba",
    center: [569, 262],
    path: "M 548,253 L 560,249 L 572,250 L 582,256 L 586,265 L 582,272 L 572,276 L 560,276 L 550,270 L 546,261 Z",
  },
  PE: {
    name: "Pernambuco",
    center: [533, 280],
    path: "M 480,270 L 500,265 L 520,263 L 540,263 L 558,266 L 572,272 L 580,280 L 580,290 L 572,298 L 560,302 L 544,302 L 528,300 L 512,295 L 498,288 L 486,280 Z",
  },
  PI: {
    name: "Piauí",
    center: [490, 232],
    path: "M 440,192 L 454,180 L 470,172 L 486,170 L 500,175 L 510,186 L 514,200 L 514,215 L 510,230 L 502,242 L 490,250 L 476,254 L 462,252 L 450,244 L 440,232 L 436,218 Z",
  },
  PR: {
    name: "Paraná",
    center: [388, 584],
    path: "M 318,558 L 338,549 L 360,544 L 382,542 L 404,544 L 422,550 L 436,560 L 444,572 L 444,586 L 438,598 L 427,608 L 412,614 L 395,616 L 378,613 L 362,606 L 348,595 L 336,582 L 326,568 Z",
  },
  RJ: {
    name: "Rio de Janeiro",
    center: [506, 526],
    path: "M 473,510 L 488,504 L 505,502 L 520,506 L 532,515 L 538,527 L 535,538 L 525,546 L 512,548 L 498,545 L 485,536 L 477,524 Z",
  },
  RN: {
    name: "Rio Grande do Norte",
    center: [573, 238],
    path: "M 556,220 L 570,216 L 584,218 L 595,226 L 600,236 L 596,246 L 585,252 L 572,254 L 560,250 L 553,241 L 552,231 Z",
  },
  RO: {
    name: "Rondônia",
    center: [178, 348],
    path: "M 115,293 L 135,285 L 158,280 L 178,280 L 195,285 L 208,296 L 215,310 L 215,325 L 210,340 L 200,352 L 185,360 L 168,362 L 152,358 L 138,348 L 128,335 L 120,320 L 115,305 Z",
  },
  RR: {
    name: "Roraima",
    center: [198, 100],
    path: "M 148,62 L 165,48 L 184,40 L 205,38 L 224,42 L 240,52 L 252,66 L 258,82 L 258,100 L 252,118 L 240,132 L 224,142 L 205,148 L 185,148 L 168,140 L 155,128 L 147,112 L 145,95 Z",
  },
  RS: {
    name: "Rio Grande do Sul",
    center: [372, 670],
    path: "M 308,624 L 328,614 L 350,608 L 372,606 L 394,608 L 412,616 L 425,628 L 430,643 L 428,658 L 420,672 L 406,683 L 389,690 L 370,692 L 352,688 L 335,678 L 320,664 L 311,649 L 307,633 Z",
  },
  SC: {
    name: "Santa Catarina",
    center: [393, 626],
    path: "M 354,610 L 374,605 L 394,605 L 412,610 L 424,620 L 427,632 L 422,642 L 410,648 L 395,650 L 378,648 L 363,640 L 352,628 L 350,616 Z",
  },
  SE: {
    name: "Sergipe",
    center: [549, 315],
    path: "M 535,305 L 547,300 L 558,304 L 563,313 L 560,323 L 550,328 L 538,325 L 533,315 Z",
  },
  SP: {
    name: "São Paulo",
    center: [430, 522],
    path: "M 370,496 L 390,488 L 412,484 L 435,483 L 456,486 L 473,494 L 484,506 L 487,520 L 483,534 L 473,544 L 458,550 L 440,552 L 422,549 L 405,542 L 390,530 L 378,516 L 370,503 Z",
  },
  TO: {
    name: "Tocantins",
    center: [410, 310],
    path: "M 360,248 L 378,238 L 398,232 L 415,230 L 430,233 L 442,242 L 448,254 L 450,268 L 448,283 L 442,298 L 432,310 L 418,320 L 402,326 L 386,328 L 370,325 L 356,318 L 346,307 L 340,294 L 338,279 L 340,264 Z",
  },
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
    red:    { base: "hsl(0,60%,95%)",   active: (i: number) => `hsl(0,${50+i*40}%,${88-i*38}%)`,   hover: "hsl(0,80%,55%)",   text: "text-red-700" },
    blue:   { base: "hsl(213,60%,94%)", active: (i: number) => `hsl(213,${50+i*40}%,${88-i*38}%)`, hover: "hsl(213,80%,50%)", text: "text-blue-700" },
    green:  { base: "hsl(142,60%,94%)", active: (i: number) => `hsl(142,${50+i*40}%,${88-i*38}%)`, hover: "hsl(142,70%,38%)", text: "text-green-700" },
    purple: { base: "hsl(262,60%,95%)", active: (i: number) => `hsl(262,${50+i*40}%,${88-i*38}%)`, hover: "hsl(262,75%,52%)", text: "text-purple-700" },
  };
  const palette = colorPalettes[colorScheme];

  const getColor = (code: string) => {
    const d = dataMap.get(code);
    if (!d || d.count === 0) return palette.base;
    if (hoveredState === code) return palette.hover;
    return palette.active(d.count / maxCount);
  };

  const topStates = useMemo(
    () => [...data].filter(d => d.count > 0 && d.state.length === 2 && d.state !== "NÃ").sort((a, b) => b.count - a.count).slice(0, 8),
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
          <div className="flex-1 relative" style={{ minHeight: 340 }}>
            <svg
              viewBox="40 30 600 690"
              className="w-full h-full"
              style={{ maxHeight: 420 }}
              onMouseLeave={() => setHoveredState(null)}
            >
              {Object.entries(STATES_DATA).map(([code, state]) => {
                const d = dataMap.get(code);
                const isHovered = hoveredState === code;
                return (
                  <g key={code}>
                    <path
                      d={state.path}
                      fill={getColor(code)}
                      stroke="white"
                      strokeWidth={code === "DF" ? 0.8 : 1.5}
                      strokeLinejoin="round"
                      className="transition-all duration-150 cursor-pointer"
                      style={{ filter: isHovered ? "drop-shadow(0 2px 4px rgba(0,0,0,0.25))" : "none" }}
                      onMouseEnter={(e) => {
                        setHoveredState(code);
                        const rect = (e.target as SVGElement).closest("svg")?.getBoundingClientRect();
                        if (rect) setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top - 10 });
                      }}
                      onMouseMove={(e) => {
                        const rect = (e.target as SVGElement).closest("svg")?.getBoundingClientRect();
                        if (rect) setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top - 10 });
                      }}
                      onClick={() => onStateClick?.(code, state.name)}
                    />
                    {/* Label — skip DF (too small) */}
                    {code !== "DF" && (
                      <text
                        x={state.center[0]}
                        y={state.center[1]}
                        textAnchor="middle"
                        dominantBaseline="central"
                        className="pointer-events-none select-none"
                        style={{
                          fontSize: ["AL","SE","ES","RJ","PB","RN","DF","AP","RR","SC"].includes(code) ? 7 : 9,
                          fontWeight: d && d.count > 0 ? 700 : 400,
                          fill: d && d.count > 0 ? "#0f172a" : "#94a3b8",
                          letterSpacing: "0.02em",
                        }}
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
                className="absolute pointer-events-none bg-popover text-popover-foreground border border-border rounded-lg shadow-xl px-3 py-2 z-50 min-w-[100px]"
                style={{ left: tooltipPos.x, top: tooltipPos.y, transform: "translate(-50%, -100%)" }}
              >
                <p className="text-xs font-bold">{STATES_DATA[hoveredState]?.name || hoveredState}</p>
                <p className={`text-sm font-bold ${palette.text}`}>
                  {dataMap.get(hoveredState)?.count || 0} {dataMap.get(hoveredState)?.count === 1 ? "funcionário" : "funcionários"}
                </p>
                {dataMap.get(hoveredState)?.details && (
                  <p className="text-[10px] text-muted-foreground">{dataMap.get(hoveredState)?.details}</p>
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
                      onClick={() => onStateClick?.(s.state, STATES_DATA[s.state.toUpperCase()]?.name || s.state)}
                      onMouseEnter={() => setHoveredState(s.state.toUpperCase())}
                      onMouseLeave={() => setHoveredState(null)}
                    >
                      <span className="font-mono text-muted-foreground w-4 text-right">{i + 1}.</span>
                      <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: palette.active(intensity) }} />
                      <span className="font-medium truncate flex-1">{STATES_DATA[s.state.toUpperCase()]?.name || s.state}</span>
                      <span className={`font-bold ${palette.text}`}>{s.count}</span>
                    </div>
                  );
                })}
              </div>
              {naoInformadoCount > 0 && (
                <div className="flex items-center gap-2 text-xs px-1.5 py-1 bg-gray-100 dark:bg-gray-800 rounded mt-1">
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
