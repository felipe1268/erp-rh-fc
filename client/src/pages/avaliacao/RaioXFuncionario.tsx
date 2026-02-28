import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useCompany } from "@/contexts/CompanyContext";
import {
  ArrowLeft, User, TrendingUp, TrendingDown, Calendar, Clock, Search,
  Share2, Printer, Eye, ChevronRight
} from "lucide-react";

const PILARES = [
  {
    nome: "Postura e Disciplina", cor: "#1e3a5f",
    criterios: [
      { key: "comportamento", label: "Comportamento" },
      { key: "pontualidade", label: "Pontualidade" },
      { key: "assiduidade", label: "Assiduidade" },
      { key: "segurancaEpis", label: "Segurança/EPIs" },
    ],
  },
  {
    nome: "Desempenho Técnico", cor: "#059669",
    criterios: [
      { key: "qualidadeAcabamento", label: "Qualidade/Acabamento" },
      { key: "produtividadeRitmo", label: "Produtividade/Ritmo" },
      { key: "cuidadoFerramentas", label: "Cuidado Ferramentas" },
      { key: "economiaMateriais", label: "Economia Materiais" },
    ],
  },
  {
    nome: "Atitude e Crescimento", cor: "#D97706",
    criterios: [
      { key: "trabalhoEquipe", label: "Trabalho Equipe" },
      { key: "iniciativaProatividade", label: "Iniciativa" },
      { key: "disponibilidadeFlexibilidade", label: "Disponibilidade" },
      { key: "organizacaoLimpeza", label: "Organização/Limpeza" },
    ],
  },
];

const NOTA_COLORS: Record<number, string> = { 1: "#EF4444", 2: "#F97316", 3: "#EAB308", 4: "#22C55E", 5: "#1e3a5f" };
const REC_COLORS: Record<string, string> = {
  "SUGERIR DEMISSÃO": "bg-red-100 text-red-700",
  "ATENÇÃO - ACOMPANHAR": "bg-orange-100 text-orange-700",
  "TREINAMENTO": "bg-yellow-100 text-yellow-700",
  "PROMOÇÃO / PREMIAÇÃO": "bg-green-100 text-green-700",
};

function getMediaColor(media: number): string {
  if (media < 2) return "#EF4444";
  if (media < 3) return "#F97316";
  if (media < 4) return "#EAB308";
  if (media < 5) return "#22C55E";
  return "#1e3a5f";
}

function CriterionEvolutionChart({ evaluations, criterionKey, color }: { evaluations: any[]; criterionKey: string; color: string }) {
  const values = evaluations.map((ev: any) => (ev[criterionKey] as number) || 0);
  if (values.length < 2) return null;
  const width = 180; const height = 44; const padding = 4;
  const stepX = (width - padding * 2) / (values.length - 1);
  const points = values.map((v, i) => ({ x: padding + i * stepX, y: height - padding - ((v - 1) / 4) * (height - padding * 2) }));
  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  return (
    <svg width={width} height={height} className="shrink-0">
      {[1, 2, 3, 4, 5].map(v => {
        const y = height - padding - ((v - 1) / 4) * (height - padding * 2);
        return <line key={v} x1={padding} y1={y} x2={width - padding} y2={y} stroke="#E2E8F0" strokeWidth="0.5" />;
      })}
      <path d={pathD} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="3.5" fill="white" stroke={color} strokeWidth="1.5" />
          <text x={p.x} y={p.y - 7} textAnchor="middle" fontSize="8" fontWeight="bold" fill={color}>{values[i]}</text>
        </g>
      ))}
    </svg>
  );
}

function EvolutionTable({ evaluations }: { evaluations: any[] }) {
  const periods = evaluations.map((ev: any) => ev.mesReferencia || new Date(ev.createdAt).toLocaleDateString("pt-BR"));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b-2 border-[#E2E8F0]">
            <th className="text-left py-3 px-2 text-xs text-[#64748B] font-semibold sticky left-0 bg-white z-10 min-w-[160px]">Critério</th>
            {periods.map((p, i) => (
              <th key={i} className="text-center py-3 px-2 text-xs text-[#64748B] font-semibold min-w-[70px]">
                <div className="flex flex-col items-center gap-0.5"><Calendar className="w-3 h-3" /><span>{p}</span></div>
              </th>
            ))}
            <th className="text-center py-3 px-2 text-xs text-[#64748B] font-semibold min-w-[90px]">Evolução</th>
          </tr>
        </thead>
        <tbody>
          {PILARES.map((pilar) => (
            <>{/* Fragment key handled by React */}
              <tr key={`header-${pilar.nome}`}>
                <td colSpan={periods.length + 2} className="pt-4 pb-1 px-2">
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: pilar.cor }}>{pilar.nome}</span>
                </td>
              </tr>
              {pilar.criterios.map((c) => {
                const values = evaluations.map((ev: any) => (ev[c.key] as number) || 0);
                const first = values[0]; const last = values[values.length - 1]; const diff = last - first;
                return (
                  <tr key={c.key} className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC]">
                    <td className="py-2 px-2 text-xs text-[#475569] font-medium sticky left-0 bg-white z-10">{c.label}</td>
                    {values.map((v, i) => {
                      const prev = i > 0 ? values[i - 1] : v; const change = v - prev;
                      return (
                        <td key={i} className="py-2 px-2 text-center">
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: NOTA_COLORS[v] || "#94A3B8" }}>{v}</span>
                            {i > 0 && change !== 0 && (
                              <span className="text-[10px] font-semibold" style={{ color: change > 0 ? "#22C55E" : "#EF4444" }}>{change > 0 ? "+" : ""}{change}</span>
                            )}
                          </div>
                        </td>
                      );
                    })}
                    <td className="py-2 px-2">
                      <div className="flex items-center justify-center gap-1">
                        {evaluations.length >= 2 ? (
                          <>
                            <CriterionEvolutionChart evaluations={evaluations} criterionKey={c.key} color={pilar.cor} />
                            {diff !== 0 && (
                              <span className="text-xs font-bold" style={{ color: diff > 0 ? "#22C55E" : "#EF4444" }}>
                                {diff > 0 ? "+" : ""}{diff}
                              </span>
                            )}
                          </>
                        ) : <span className="text-[10px] text-[#94A3B8]">1 aval.</span>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </>
          ))}
          <tr className="border-t-2 border-[#E2E8F0] bg-[#F8FAFC]">
            <td className="py-3 px-2 text-xs font-bold text-[#0F172A] sticky left-0 bg-[#F8FAFC] z-10">Média Geral</td>
            {evaluations.map((ev: any, i: number) => {
              const media = Number(ev.mediaGeral);
              return <td key={i} className="py-3 px-2 text-center"><span className="text-base font-bold" style={{ color: getMediaColor(media) }}>{media.toFixed(1)}</span></td>;
            })}
            <td className="py-3 px-2 text-center">
              {evaluations.length >= 2 && (() => {
                const diff = Number(evaluations[evaluations.length - 1].mediaGeral) - Number(evaluations[0].mediaGeral);
                return <span className="text-xs font-bold" style={{ color: diff > 0 ? "#22C55E" : "#EF4444" }}>{diff > 0 ? "↑" : "↓"} {Math.abs(diff).toFixed(1)}</span>;
              })()}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ─── Raio-X Detail View ───
function RaioXDetail({ employeeId, onBack }: { employeeId: number; onBack: () => void }) {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId) : 0;
  const raioX = trpc.avaliacao.raioX.getByEmployee.useQuery({ employeeId, companyId }, { enabled: !!companyId });

  if (raioX.isLoading) return <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1e3a5f]" /></div>;
  if (!raioX.data?.employee) return <div className="text-center py-12 text-[#94A3B8]"><User className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>Funcionário não encontrado.</p><Button variant="outline" onClick={onBack} className="mt-4"><ArrowLeft className="w-4 h-4 mr-2" /> Voltar</Button></div>;

  const { employee, avaliacoes, mediasGerais } = raioX.data;
  const latestEval = avaliacoes.length > 0 ? avaliacoes[avaliacoes.length - 1] : null;
  const prevEval = avaliacoes.length > 1 ? avaliacoes[avaliacoes.length - 2] : null;
  const mediaGeral = latestEval ? Number(latestEval.mediaGeral) : 0;

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack}><ArrowLeft className="w-5 h-5" /></Button>
          <h1 className="text-xl font-bold text-[#0F172A]">Raio-X do Funcionário</h1>
        </div>
        {avaliacoes.length > 0 && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="w-4 h-4 mr-1" /> Imprimir</Button>
            <Button variant="outline" size="sm" className="text-green-600 hover:text-green-700 hover:bg-green-50" onClick={() => {
              const msg = `📋 *Raio-X - FC Engenharia*\n\n👤 ${(employee as any).nomeCompleto}\n💼 ${(employee as any).funcao}\n📊 Média: ${mediaGeral.toFixed(1)}\n🏷️ ${latestEval?.recomendacao || ""}\n📈 ${avaliacoes.length} avaliação(ões)`;
              window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
            }}><Share2 className="w-4 h-4 mr-1" /> WhatsApp</Button>
          </div>
        )}
      </div>

      {/* Employee Info */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-6">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-[#1e3a5f] flex items-center justify-center text-white font-bold text-2xl">
                {(employee as any).nomeCompleto?.charAt(0) || "?"}
              </div>
              <div>
                <h2 className="text-xl font-bold text-[#0F172A]">{(employee as any).nomeCompleto}</h2>
                <p className="text-sm text-[#64748B]">{(employee as any).funcao} | {(employee as any).setor || "Sem setor"}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="secondary" className={(employee as any).status === "ativo" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>
                    {(employee as any).status}
                  </Badge>
                  <span className="text-xs text-[#94A3B8]">{avaliacoes.length} avaliação(ões)</span>
                </div>
              </div>
            </div>
            {latestEval && (
              <div className="text-right">
                <p className="text-xs text-[#94A3B8]">Média Atual</p>
                <p className="text-4xl font-bold" style={{ color: getMediaColor(mediaGeral) }}>{mediaGeral.toFixed(1)}</p>
                <Badge className={REC_COLORS[latestEval.recomendacao || ""] || "bg-gray-100 text-gray-700"}>{latestEval.recomendacao}</Badge>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {avaliacoes.length === 0 ? (
        <div className="text-center py-12 text-[#94A3B8]"><User className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>Nenhuma avaliação registrada.</p></div>
      ) : (
        <>
          {/* Pillar Summary Cards */}
          {latestEval && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {PILARES.map((pilar, i) => {
                const mediaKey = i === 0 ? "mediaPilar1" : i === 1 ? "mediaPilar2" : "mediaPilar3";
                const media = Number((latestEval as any)[mediaKey]);
                const prevMedia = prevEval ? Number((prevEval as any)[mediaKey]) : null;
                const diff = prevMedia !== null ? media - prevMedia : 0;
                return (
                  <Card key={pilar.nome} className="border-0 shadow-sm">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: pilar.cor }}>{pilar.nome}</span>
                        {diff !== 0 && (
                          <span className="flex items-center gap-0.5 text-xs font-bold" style={{ color: diff > 0 ? "#22C55E" : "#EF4444" }}>
                            {diff > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            {diff > 0 ? "+" : ""}{diff.toFixed(1)}
                          </span>
                        )}
                      </div>
                      <p className="text-3xl font-bold" style={{ color: pilar.cor }}>{media.toFixed(1)}</p>
                      <div className="mt-2 space-y-1">
                        {pilar.criterios.map(c => {
                          const val = (latestEval as any)[c.key] || 0;
                          return (
                            <div key={c.key} className="flex items-center gap-2">
                              <span className="text-[10px] text-[#94A3B8] w-28 truncate">{c.label}</span>
                              <div className="flex-1 h-1.5 bg-[#F1F5F9] rounded-full overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${(val / 5) * 100}%`, backgroundColor: pilar.cor }} />
                              </div>
                              <span className="text-[10px] font-bold w-4 text-right" style={{ color: pilar.cor }}>{val}</span>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Evolution Table */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2"><TrendingUp className="w-4 h-4 text-[#1e3a5f]" /> Evolução Item a Item</CardTitle>
                <span className="text-xs text-[#94A3B8]">{avaliacoes.length} avaliação(ões)</span>
              </div>
            </CardHeader>
            <CardContent><EvolutionTable evaluations={avaliacoes} /></CardContent>
          </Card>

          {/* History */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><Calendar className="w-4 h-4 text-[#1e3a5f]" /> Histórico de Avaliações</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {[...avaliacoes].reverse().map((ev: any) => {
                  const media = Number(ev.mediaGeral);
                  return (
                    <div key={ev.id} className="flex items-center justify-between p-3 rounded-lg bg-[#F8FAFC] hover:bg-[#F1F5F9] transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{ backgroundColor: getMediaColor(media) }}>
                          {media.toFixed(1)}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-[#0F172A]">{ev.mesReferencia || new Date(ev.createdAt).toLocaleDateString("pt-BR")}</p>
                          <div className="flex items-center gap-2 text-xs text-[#94A3B8]">
                            <span>por {ev.evaluatorName || "Admin"}</span>
                            {ev.durationSeconds && <span className="flex items-center gap-0.5"><Clock className="w-3 h-3" />{Math.floor(ev.durationSeconds / 60)}min</span>}
                          </div>
                        </div>
                      </div>
                      <Badge className={REC_COLORS[ev.recomendacao || ""] || "bg-gray-100 text-gray-700"} variant="secondary">{ev.recomendacao}</Badge>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ─── Employee List for Raio-X ───
export default function RaioXFuncionario() {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId) : 0;
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const ranking = trpc.avaliacao.dashboard.employeeRanking.useQuery({ companyId, limit: 200 }, { enabled: !!companyId });

  if (selectedEmployeeId) {
    return <RaioXDetail employeeId={selectedEmployeeId} onBack={() => setSelectedEmployeeId(null)} />;
  }

  const filtered = useMemo(() => {
    if (!ranking.data) return [];
    if (!searchTerm) return ranking.data;
    const term = searchTerm.toLowerCase();
    return ranking.data.filter((e: any) => e.employeeName?.toLowerCase().includes(term) || e.employeeFuncao?.toLowerCase().includes(term) || e.employeeSetor?.toLowerCase().includes(term));
  }, [ranking.data, searchTerm]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-[#0F172A]">Raio-X dos Funcionários</h2>
        <span className="text-xs text-[#94A3B8]">{filtered.length} funcionários avaliados</span>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
        <Input placeholder="Buscar por nome, função ou setor..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
      </div>

      {ranking.isLoading ? (
        <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1e3a5f]" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-[#94A3B8]"><User className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>Nenhum funcionário avaliado ainda.</p></div>
      ) : (
        <div className="space-y-2">
          {filtered.map((emp: any, idx: number) => {
            const media = Number(emp.mediaGeral);
            return (
              <button key={emp.employeeId} onClick={() => setSelectedEmployeeId(emp.employeeId)}
                className="w-full flex items-center gap-3 p-3 rounded-lg border border-[#E2E8F0] bg-white hover:bg-[#F8FAFC] hover:border-[#1e3a5f]/30 transition-all text-left">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-[#64748B] bg-[#F1F5F9]">{idx + 1}</div>
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{ backgroundColor: getMediaColor(media) }}>
                  {media.toFixed(1)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#0F172A] truncate">{emp.employeeName}</p>
                  <p className="text-xs text-[#64748B]">{emp.employeeFuncao} — {emp.employeeSetor || "Sem setor"}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={REC_COLORS[emp.recomendacao || ""] || "bg-gray-100 text-gray-700"} variant="secondary">{emp.recomendacao}</Badge>
                  <span className="text-xs text-[#94A3B8]">{emp.totalAvaliacoes} aval.</span>
                  <ChevronRight className="w-4 h-4 text-[#94A3B8]" />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
