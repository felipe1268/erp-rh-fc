import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, Building2, MapPin, Phone, Mail, Hash, Landmark, Tag,
  Users, Pencil, Star, Loader2, CheckCircle2, XCircle,
  ShieldCheck, ShieldAlert, Package, Clock, TrendingUp,
  AlertTriangle, FileText, Calendar, Briefcase, Award,
  ChevronRight, Sparkles, Timer,
} from "lucide-react";

function formatCNPJ(v: string) {
  const d = (v || "").replace(/\D/g, "");
  if (d.length !== 14) return v;
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
}

function formatCapitalSocial(v: string | number | null | undefined): string {
  if (!v) return "";
  const num = typeof v === "number" ? v : parseFloat(String(v).replace(/\./g, "").replace(",", "."));
  if (isNaN(num)) return String(v);
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
}

function calcIdadeEmpresa(dataAbertura: string | null | undefined): { anos: number; texto: string } | null {
  if (!dataAbertura) return null;
  const abertura = new Date(dataAbertura + (dataAbertura.length === 10 ? "T00:00:00" : ""));
  if (isNaN(abertura.getTime())) return null;
  const hoje = new Date();
  let anos = hoje.getFullYear() - abertura.getFullYear();
  const mesesPassados = hoje.getMonth() - abertura.getMonth();
  if (mesesPassados < 0 || (mesesPassados === 0 && hoje.getDate() < abertura.getDate())) anos--;
  if (anos < 0) return null;
  if (anos === 0) {
    const meses = Math.max(0, (hoje.getFullYear() - abertura.getFullYear()) * 12 + hoje.getMonth() - abertura.getMonth());
    return { anos: 0, texto: `${meses} ${meses === 1 ? "mês" : "meses"} no mercado` };
  }
  return { anos, texto: `${anos} ${anos === 1 ? "ano" : "anos"} no mercado` };
}

function formatDataBR(d: string | null | undefined) {
  if (!d) return "";
  const parts = d.slice(0, 10).split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return d;
}

function SituacaoBadge({ s }: { s?: string | null }) {
  if (!s) return null;
  const low = s.toLowerCase();
  if (low.includes("ativa"))   return <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-400/30 text-xs font-semibold">ATIVA</Badge>;
  if (low.includes("baixad"))  return <Badge className="bg-slate-400/20 text-slate-300 border-slate-400/30 text-xs font-semibold">BAIXADA</Badge>;
  if (low.includes("inapt"))   return <Badge className="bg-red-500/20 text-red-300 border-red-400/30 text-xs font-semibold">INAPTA</Badge>;
  if (low.includes("suspens")) return <Badge className="bg-amber-500/20 text-amber-300 border-amber-400/30 text-xs font-semibold">SUSPENSA</Badge>;
  return <Badge variant="outline" className="text-xs text-slate-300 border-slate-500">{s}</Badge>;
}

function ScoreStars({ score, size = 14 }: { score: number; size?: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1,2,3,4,5].map(i => (
        <Star key={i} style={{ width: size, height: size }}
          className={i <= Math.round(score) ? "text-amber-400 fill-amber-400" : "text-slate-200 fill-slate-200"} />
      ))}
    </div>
  );
}

function InfoChip({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</span>
      <span className={`text-sm text-slate-800 break-words leading-tight ${mono ? "font-mono" : "font-medium"}`}>{value}</span>
    </div>
  );
}

function RegimeBadge({ value }: { value?: string | null }) {
  if (!value) return null;
  const v = value.toLowerCase();
  let cls = "bg-slate-100 text-slate-700 border-slate-200";
  if (v.includes("simples")) cls = "bg-emerald-100 text-emerald-800 border-emerald-200";
  else if (v.includes("mei"))    cls = "bg-teal-100 text-teal-800 border-teal-200";
  else if (v.includes("presumido")) cls = "bg-purple-100 text-purple-800 border-purple-200";
  else if (v.includes("real"))   cls = "bg-blue-100 text-blue-800 border-blue-200";
  else if (v.includes("arbitr")) cls = "bg-amber-100 text-amber-800 border-amber-200";
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Regime Tributário</span>
      <span className={`inline-flex items-center self-start px-3 py-1 rounded-full border text-xs font-extrabold uppercase tracking-widest ${cls}`}>
        {value}
      </span>
    </div>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-2xl border border-slate-100 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

function CardHeader({ icon: Icon, title, accent }: { icon: any; title: string; accent?: string }) {
  return (
    <div className={`flex items-center gap-2.5 px-5 py-3.5 border-b border-slate-100 ${accent || "bg-slate-50/80"} rounded-t-2xl`}>
      <Icon className="h-4 w-4 text-slate-500" />
      <h3 className="text-xs font-bold text-slate-600 uppercase tracking-widest">{title}</h3>
    </div>
  );
}

export default function FornecedorFicha() {
  const { companyId } = useCompany();
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const id = Number(params.id);

  const { data: f, isLoading, error } = trpc.compras.getFornecedor.useQuery(
    { id },
    { enabled: !!id && id > 0 }
  );

  const { data: score } = trpc.compras.scoreFornecedor.useQuery(
    { fornecedorId: id, companyId },
    { enabled: !!id && id > 0 && companyId > 0 }
  );

  if (isLoading) return (
    <DashboardLayout>
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-slate-300" />
      </div>
    </DashboardLayout>
  );

  if (error || !f) return (
    <DashboardLayout>
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <XCircle className="h-12 w-12 text-red-300" />
        <p className="text-slate-500 text-sm">Fornecedor não encontrado.</p>
        <Button variant="outline" size="sm" onClick={() => setLocation("/compras/fornecedores")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
        </Button>
      </div>
    </DashboardLayout>
  );

  const nome = (f as any).nomeFantasia || (f as any).razaoSocial;
  const socios: any[] = Array.isArray((f as any).socios) ? (f as any).socios : [];
  const categorias: string[] = Array.isArray((f as any).categorias) ? (f as any).categorias : [];
  const temEndereco = (f as any).endereco || (f as any).cidade;
  const temBancario = (f as any).banco || (f as any).pix || (f as any).agencia;
  const temCnpjData = (f as any).naturezaJuridica || (f as any).porte || (f as any).dataAbertura || (f as any).capitalSocial;
  const temCnae = (f as any).atividadePrincipal || (f as any).atividadesCnae;
  const temInscricoes = (f as any).inscricaoEstadual || (f as any).inscricaoMunicipal || (f as any).regimeTributario;
  const temRepresentante = (f as any).representanteLegal;
  const isRecomendado = score && score.score >= 4.0 && score.totalOCs >= 1;
  const isAtencao = score && score.score > 0 && score.score < 2.5 && score.totalOCs >= 1;
  const idade = calcIdadeEmpresa((f as any).dataAbertura);
  const capitalFormatado = formatCapitalSocial((f as any).capitalSocial);

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">

        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <button
            onClick={() => setLocation("/compras/fornecedores")}
            className="hover:text-slate-600 transition-colors flex items-center gap-1 font-medium"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Fornecedores
          </button>
          <ChevronRight className="h-3 w-3 text-slate-300" />
          <span className="text-slate-600 font-semibold truncate max-w-[200px]">{nome}</span>
        </div>

        {/* ─── HERO HEADER ─── */}
        <div className="relative bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white rounded-2xl p-6 shadow-xl overflow-hidden">
          {/* Decoração de fundo */}
          <div className="absolute inset-0 opacity-10">
            <div className="absolute -top-8 -right-8 w-48 h-48 rounded-full bg-blue-400 blur-3xl" />
            <div className="absolute -bottom-8 -left-8 w-48 h-48 rounded-full bg-indigo-400 blur-3xl" />
          </div>

          <div className="relative flex items-start justify-between gap-4">
            <div className="flex items-start gap-4 min-w-0">
              {/* Ícone */}
              <div className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-2xl p-3.5 shrink-0">
                <Building2 className="h-9 w-9 text-white" />
              </div>

              {/* Info principal */}
              <div className="min-w-0">
                <h1 className="text-2xl font-extrabold leading-tight break-words tracking-tight">{nome}</h1>
                {(f as any).nomeFantasia && (f as any).nomeFantasia !== (f as any).razaoSocial && (
                  <p className="text-slate-300 text-sm mt-0.5 font-medium">{(f as any).razaoSocial}</p>
                )}

                {/* Badges */}
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  {(f as any).cnpj && (
                    <span className="font-mono text-xs bg-white/10 border border-white/10 px-3 py-1 rounded-full tracking-wider">
                      {formatCNPJ((f as any).cnpj)}
                    </span>
                  )}
                  <SituacaoBadge s={(f as any).situacaoReceita} />
                  {!(f as any).ativo && (
                    <Badge variant="outline" className="text-slate-400 border-slate-600 text-xs">Inativo</Badge>
                  )}
                  {(f as any).ativo && (
                    <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-400/30 text-xs font-semibold">Ativo</Badge>
                  )}
                  {categorias.map(c => (
                    <span key={c} className="bg-blue-500/20 text-blue-200 text-xs font-medium px-2.5 py-0.5 rounded-full border border-blue-400/20">{c}</span>
                  ))}
                </div>

                {/* Tempo no mercado — destaque */}
                {idade && (
                  <div className="mt-4 inline-flex items-center gap-2 bg-white/10 border border-white/10 backdrop-blur-sm rounded-xl px-4 py-2.5">
                    <div className="bg-amber-400/20 rounded-lg p-1.5">
                      <Timer className="h-4 w-4 text-amber-300" />
                    </div>
                    <div>
                      <p className="text-amber-200 text-[10px] font-semibold uppercase tracking-widest leading-none mb-0.5">Tempo no mercado</p>
                      <p className="text-white font-bold text-base leading-tight">{idade.texto}</p>
                    </div>
                    {idade.anos >= 10 && (
                      <div className="ml-1">
                        <Sparkles className="h-4 w-4 text-amber-400" />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Ação */}
            <div className="shrink-0">
              <Button
                size="sm"
                variant="outline"
                className="bg-white/10 border-white/20 text-white hover:bg-white/20 gap-1.5 h-9"
                onClick={() => setLocation(`/compras/fornecedores?editar=${id}`)}
              >
                <Pencil className="h-3.5 w-3.5" /> Editar
              </Button>
            </div>
          </div>
        </div>

        {/* ─── BODY GRID ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* ── Coluna principal (2/3) ── */}
          <div className="lg:col-span-2 space-y-5">

            {/* Dados Receita Federal */}
            {temCnpjData && (
              <Card>
                <CardHeader icon={FileText} title="Dados Receita Federal" />
                <div className="p-5 grid grid-cols-2 gap-x-8 gap-y-5">
                  <InfoChip label="Natureza Jurídica" value={(f as any).naturezaJuridica} />
                  <InfoChip label="Porte" value={(f as any).porte} />

                  {/* Capital Social — formatado em R$ */}
                  {(f as any).capitalSocial && (
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Capital Social</span>
                      <span className="text-lg font-bold text-slate-800">{capitalFormatado}</span>
                    </div>
                  )}

                  {/* Data de Abertura */}
                  {(f as any).dataAbertura && (
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Data de Abertura</span>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-slate-800">{formatDataBR((f as any).dataAbertura)}</span>
                        {idade && (
                          <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 text-xs font-bold px-2 py-0.5 rounded-full">
                            <Timer className="h-3 w-3" />
                            {idade.texto}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  <RegimeBadge value={(f as any).regimeTributario} />
                </div>
              </Card>
            )}

            {/* CNAE */}
            {temCnae && (
              <Card>
                <CardHeader icon={Briefcase} title="Atividades (CNAE)" />
                <div className="p-5 space-y-4">
                  {(f as any).atividadePrincipal && (
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Atividade Principal</p>
                      <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
                        <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                        <p className="text-sm font-medium text-blue-900 leading-relaxed">{(f as any).atividadePrincipal}</p>
                      </div>
                    </div>
                  )}
                  {(f as any).atividadesCnae && (
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Atividades Secundárias</p>
                      <div className="space-y-1.5">
                        {String((f as any).atividadesCnae).split(";").map((a, i) => a.trim()).filter(Boolean).map((a, i) => (
                          <div key={i} className="flex items-start gap-2.5 px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors">
                            <div className="w-1.5 h-1.5 rounded-full bg-slate-300 mt-2 shrink-0" />
                            <p className="text-sm text-slate-600 leading-relaxed">{a}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            )}

            {/* Inscrições Fiscais */}
            {temInscricoes && (
              <Card>
                <CardHeader icon={Hash} title="Inscrições Fiscais" />
                <div className="p-5 grid grid-cols-2 gap-x-8 gap-y-5">
                  <InfoChip label="Inscrição Estadual" value={(f as any).inscricaoEstadual} mono />
                  <InfoChip label="Inscrição Municipal" value={(f as any).inscricaoMunicipal} mono />
                  <RegimeBadge value={(f as any).regimeTributario} />
                </div>
              </Card>
            )}

            {/* Representante Legal */}
            {temRepresentante && (
              <Card>
                <CardHeader icon={Users} title="Representante Legal" />
                <div className="p-5">
                  <div className="flex items-center gap-4 bg-slate-50 rounded-xl px-4 py-3.5 border border-slate-100">
                    <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-white font-bold text-sm shrink-0">
                      {((f as any).representanteLegal || "?").charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-800">{(f as any).representanteLegal}</p>
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-0.5">
                        {(f as any).representanteCargo && <p className="text-xs text-slate-500">{(f as any).representanteCargo}</p>}
                        {(f as any).representanteCpf && <p className="text-xs text-slate-400 font-mono">{(f as any).representanteCpf}</p>}
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {/* Quadro Societário */}
            {socios.length > 0 && (
              <Card>
                <CardHeader icon={Users} title={`Quadro Societário · ${socios.length} sócio${socios.length !== 1 ? "s" : ""}`} />
                <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {socios.map((s: any, i: number) => (
                    <div key={i} className="flex items-center gap-3 bg-slate-50 hover:bg-slate-100/70 transition-colors rounded-xl px-4 py-3 border border-slate-100">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-700 to-slate-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
                        {(s.nome || "?").charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-800 text-sm leading-tight truncate">{s.nome || "—"}</p>
                        {s.qualificacao && <p className="text-xs text-slate-500 mt-0.5 leading-tight">{s.qualificacao}</p>}
                        {s.faixaEtaria && <p className="text-[10px] text-slate-400 mt-0.5">{s.faixaEtaria}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Desempenho */}
            <Card>
              <CardHeader icon={TrendingUp} title="Desempenho" />
              <div className="p-5">
                {!score ? (
                  <div className="flex items-center gap-2 py-4">
                    <Loader2 className="h-4 w-4 animate-spin text-slate-300" />
                    <span className="text-sm text-slate-400">Carregando métricas...</span>
                  </div>
                ) : (
                  <div className="space-y-5">
                    {/* Score geral */}
                    <div className="flex items-center gap-4 p-4 rounded-xl bg-slate-50 border border-slate-100">
                      <div className="text-center shrink-0">
                        <p className="text-3xl font-extrabold text-slate-800 leading-none">{score.score}</p>
                        <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-widest mt-1">de 5</p>
                      </div>
                      <div className="w-px h-10 bg-slate-200 shrink-0" />
                      <div className="flex flex-col gap-1.5">
                        <ScoreStars score={score.score} size={20} />
                        <div className="flex flex-wrap gap-1.5">
                          {isRecomendado && (
                            <span className="flex items-center gap-1 text-[11px] font-bold bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full border border-emerald-200">
                              <ShieldCheck className="h-3 w-3" /> Recomendado
                            </span>
                          )}
                          {isAtencao && (
                            <span className="flex items-center gap-1 text-[11px] font-bold bg-red-100 text-red-700 px-2.5 py-1 rounded-full border border-red-200">
                              <ShieldAlert className="h-3 w-3" /> Atenção
                            </span>
                          )}
                          {score.totalOCs === 0 && (
                            <span className="text-[11px] text-slate-400 italic">Sem histórico ainda</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Métricas */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[
                        {
                          icon: Package, label: "OCs Atendidas",
                          value: String(score.totalOCs),
                          sub: score.totalValorOCs > 0 ? score.totalValorOCs.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }) : "—",
                          color: "blue",
                        },
                        {
                          icon: Clock, label: "Pontualidade",
                          value: `${score.taxaPontualidade}%`,
                          sub: `${score.ocsPontuais}/${score.ocsComData} no prazo`,
                          color: score.taxaPontualidade >= 80 ? "emerald" : score.taxaPontualidade >= 50 ? "amber" : "red",
                        },
                        {
                          icon: TrendingUp, label: "Competitividade",
                          value: `${score.taxaCompetitividade}%`,
                          sub: `${score.cotacoesVencidas} cotação(ões) vencida(s)`,
                          color: score.taxaCompetitividade >= 50 ? "emerald" : "amber",
                        },
                        {
                          icon: Award, label: "Avaliação",
                          value: score.mediaAvaliacoes !== null ? String(score.mediaAvaliacoes) : "—",
                          sub: `${score.totalAvaliacoes} avaliação(ões)`,
                          color: "amber",
                        },
                      ].map(({ icon: Icon, label, value, sub, color }) => (
                        <div key={label} className={`rounded-xl p-4 border bg-${color}-50 border-${color}-100`}>
                          <div className="flex items-center gap-1.5 mb-3">
                            <Icon className={`h-3.5 w-3.5 text-${color}-500`} />
                            <span className={`text-[10px] text-${color}-600 uppercase font-bold tracking-widest`}>{label}</span>
                          </div>
                          <p className={`text-2xl font-extrabold text-${color}-700 leading-none`}>{value}</p>
                          {sub && <p className={`text-[11px] text-${color}-500 mt-1.5 leading-tight`}>{sub}</p>}
                        </div>
                      ))}
                    </div>

                    {/* Divergências */}
                    {score.totalDivergencias > 0 && (
                      <div className="flex items-center gap-3 bg-amber-50 rounded-xl px-4 py-3 border border-amber-200">
                        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                        <p className="text-sm text-amber-700">
                          <span className="font-bold">{score.totalDivergencias}</span> recebimento(s) com divergência ·{" "}
                          <span className="font-semibold">{score.taxaSemDivergencia}%</span> sem problemas
                        </p>
                      </div>
                    )}

                    {/* Últimas Avaliações */}
                    {score.ultimasAvaliacoes && score.ultimasAvaliacoes.length > 0 && (
                      <div>
                        <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mb-3">Últimas Avaliações</p>
                        <div className="space-y-2">
                          {score.ultimasAvaliacoes.map((av: any, idx: number) => (
                            <div key={idx} className="flex items-start gap-3 bg-slate-50 rounded-xl px-4 py-3 border border-slate-100">
                              <ScoreStars score={av.nota} size={13} />
                              <div className="flex-1 min-w-0">
                                {av.comentario && <p className="text-sm text-slate-600 leading-relaxed">{av.comentario}</p>}
                                <p className="text-[11px] text-slate-400 mt-0.5">{new Date(av.criadoEm).toLocaleDateString("pt-BR")}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Card>

            {/* Observações */}
            {(f as any).observacoes && (
              <Card>
                <CardHeader icon={FileText} title="Observações" />
                <div className="p-5">
                  <p className="text-sm text-slate-600 whitespace-pre-wrap break-words leading-relaxed">{(f as any).observacoes}</p>
                </div>
              </Card>
            )}
          </div>

          {/* ── Coluna lateral (1/3) ── */}
          <div className="space-y-4">

            {/* Contato */}
            {((f as any).telefone || (f as any).email || (f as any).contatoNome) && (
              <Card>
                <CardHeader icon={Phone} title="Contato" />
                <div className="p-4 space-y-3">
                  {(f as any).telefone && (
                    <div className="flex items-center gap-2.5 text-sm text-slate-700">
                      <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                        <Phone className="h-3.5 w-3.5 text-slate-500" />
                      </div>
                      <span className="font-medium">{(f as any).telefone}</span>
                    </div>
                  )}
                  {(f as any).email && (
                    <div className="flex items-center gap-2.5 text-sm">
                      <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                        <Mail className="h-3.5 w-3.5 text-slate-500" />
                      </div>
                      <a href={`mailto:${(f as any).email}`} className="text-blue-600 hover:underline break-all font-medium">{(f as any).email}</a>
                    </div>
                  )}
                  {(f as any).contatoNome && (
                    <div className="mt-1 pt-3 border-t border-slate-100">
                      <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mb-2">Contato Comercial</p>
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center shrink-0 text-indigo-700 font-bold text-xs">
                          {((f as any).contatoNome || "?").charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-800 text-sm leading-tight">{(f as any).contatoNome}</p>
                          {(f as any).contatoCelular && <p className="text-xs text-slate-500 mt-0.5">{(f as any).contatoCelular}</p>}
                          {(f as any).contatoEmail && (
                            <a href={`mailto:${(f as any).contatoEmail}`} className="text-xs text-blue-500 hover:underline break-all">{(f as any).contatoEmail}</a>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            )}

            {/* Endereço */}
            {temEndereco && (
              <Card>
                <CardHeader icon={MapPin} title="Endereço" />
                <div className="p-4">
                  <div className="text-sm text-slate-600 space-y-1 leading-relaxed">
                    {(f as any).endereco && (
                      <p className="font-medium text-slate-800">
                        {[(f as any).endereco, (f as any).numero, (f as any).complemento].filter(Boolean).join(", ")}
                      </p>
                    )}
                    {(f as any).bairro && <p>{(f as any).bairro}</p>}
                    {((f as any).cidade || (f as any).estado) && (
                      <p className="font-semibold text-slate-700">{[(f as any).cidade, (f as any).estado].filter(Boolean).join(" / ")}</p>
                    )}
                    {(f as any).cep && (
                      <p className="font-mono text-xs text-slate-400 mt-1.5 bg-slate-50 inline-block px-2 py-0.5 rounded">
                        CEP {(f as any).cep}
                      </p>
                    )}
                  </div>
                </div>
              </Card>
            )}

            {/* Dados Bancários */}
            {temBancario && (
              <Card>
                <CardHeader icon={Landmark} title="Dados Bancários" />
                <div className="p-4 space-y-3 text-sm">
                  {(f as any).banco && (
                    <p className="font-bold text-slate-800">{(f as any).banco}</p>
                  )}
                  {(f as any).agencia && (
                    <div className="flex gap-3 text-slate-500">
                      <div>
                        <p className="text-[10px] uppercase font-bold text-slate-400 tracking-widest">Agência</p>
                        <p className="font-mono font-semibold text-slate-700">{(f as any).agencia}</p>
                      </div>
                      {(f as any).conta && (
                        <>
                          <div className="w-px bg-slate-100" />
                          <div>
                            <p className="text-[10px] uppercase font-bold text-slate-400 tracking-widest">Conta</p>
                            <p className="font-mono font-semibold text-slate-700">{(f as any).conta}</p>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                  {(f as any).pix && (
                    <div className="mt-1 pt-2 border-t border-slate-100">
                      <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mb-1.5">Chave PIX</p>
                      <p className="font-mono text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 px-3 py-2 rounded-xl break-all leading-relaxed">
                        {(f as any).pix}
                      </p>
                    </div>
                  )}
                </div>
              </Card>
            )}

            {/* Classificações */}
            <Card>
              <CardHeader icon={Tag} title="Classificações" />
              <div className="p-4 space-y-2">
                {[
                  { label: "Fornecedor", value: (f as any).isFornecedor },
                  { label: "Prestador de Serviço", value: (f as any).isPrestadorServico },
                ].map(({ label, value }) => (
                  <div key={label} className={`flex items-center justify-between px-3 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
                    value ? "bg-emerald-50 border-emerald-100 text-emerald-800" : "bg-slate-50 border-slate-100 text-slate-400"
                  }`}>
                    <span>{label}</span>
                    {value ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-slate-300" />}
                  </div>
                ))}
              </div>
            </Card>

            {/* Registro */}
            <Card>
              <CardHeader icon={Calendar} title="Registro" />
              <div className="p-4 space-y-3">
                {(f as any).criadoEm && (
                  <div>
                    <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Cadastrado em</p>
                    <p className="text-sm font-semibold text-slate-700 mt-0.5">{new Date((f as any).criadoEm).toLocaleDateString("pt-BR")}</p>
                  </div>
                )}
                {(f as any).atualizadoEm && (
                  <div>
                    <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Atualizado em</p>
                    <p className="text-sm font-semibold text-slate-700 mt-0.5">{new Date((f as any).atualizadoEm).toLocaleDateString("pt-BR")}</p>
                  </div>
                )}
                <div>
                  <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">ID do sistema</p>
                  <p className="text-sm font-mono text-slate-400 mt-0.5">#{id}</p>
                </div>
              </div>
            </Card>

          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
