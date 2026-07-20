import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, Building2, MapPin, Phone, Mail, Hash, Landmark, Tag,
  Users, Pencil, Star, KeyRound, Loader2, CheckCircle2, XCircle,
  ShieldCheck, ShieldAlert, Package, Clock, TrendingUp, Truck,
  AlertTriangle, FileText, Calendar, CreditCard, Briefcase,
  ChevronRight,
} from "lucide-react";

function formatCNPJ(v: string) {
  const d = (v || "").replace(/\D/g, "");
  if (d.length !== 14) return v;
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
}

function SituacaoBadge({ s }: { s?: string | null }) {
  if (!s) return null;
  const low = s.toLowerCase();
  if (low.includes("ativa"))  return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">ATIVA</Badge>;
  if (low.includes("baixad")) return <Badge className="bg-slate-100 text-slate-500 border-slate-200 text-xs">BAIXADA</Badge>;
  if (low.includes("inapt"))  return <Badge className="bg-red-100 text-red-700 border-red-200 text-xs">INAPTA</Badge>;
  if (low.includes("suspens")) return <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs">SUSPENSA</Badge>;
  return <Badge variant="outline" className="text-xs">{s}</Badge>;
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

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{label}</span>
      <span className="text-sm text-slate-800 break-words">{value}</span>
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100 bg-slate-50">
        <Icon className="h-4 w-4 text-slate-500" />
        <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wider">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
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
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    </DashboardLayout>
  );

  if (error || !f) return (
    <DashboardLayout>
      <div className="flex items-center justify-center min-h-[60vh] flex-col gap-3">
        <XCircle className="h-10 w-10 text-red-400" />
        <p className="text-slate-600">Fornecedor não encontrado.</p>
        <Button variant="outline" onClick={() => setLocation("/compras/fornecedores")}>
          <ArrowLeft className="h-4 w-4 mr-2" />Voltar
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

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">

        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <button onClick={() => setLocation("/compras/fornecedores")} className="hover:text-slate-600 transition-colors flex items-center gap-1">
            <ArrowLeft className="h-3 w-3" /> Fornecedores
          </button>
          <ChevronRight className="h-3 w-3" />
          <span className="text-slate-600 font-medium">{nome}</span>
        </div>

        {/* Cabeçalho */}
        <div className="bg-gradient-to-br from-slate-800 via-slate-700 to-slate-800 text-white rounded-2xl p-6 shadow-lg">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4 min-w-0">
              <div className="bg-white/10 rounded-xl p-3 shrink-0">
                <Building2 className="h-8 w-8 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl font-bold leading-tight break-words">{nome}</h1>
                {(f as any).nomeFantasia && (f as any).nomeFantasia !== (f as any).razaoSocial && (
                  <p className="text-slate-300 text-sm mt-0.5">{(f as any).razaoSocial}</p>
                )}
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  {(f as any).cnpj && (
                    <span className="font-mono text-sm bg-white/10 px-2.5 py-1 rounded-lg">
                      {formatCNPJ((f as any).cnpj)}
                    </span>
                  )}
                  <SituacaoBadge s={(f as any).situacaoReceita} />
                  {!(f as any).ativo && (
                    <Badge variant="outline" className="text-slate-300 border-slate-500">Inativo</Badge>
                  )}
                  {(f as any).ativo && (
                    <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30">Ativo</Badge>
                  )}
                </div>
                {categorias.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {categorias.map(c => (
                      <span key={c} className="bg-blue-500/20 text-blue-200 text-xs font-medium px-2.5 py-0.5 rounded-full border border-blue-400/30">{c}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-2 shrink-0">
              <Button size="sm" variant="outline" className="bg-white/10 border-white/20 text-white hover:bg-white/20 gap-1.5"
                onClick={() => setLocation(`/compras/fornecedores?editar=${id}`)}>
                <Pencil className="h-3.5 w-3.5" /> Editar
              </Button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Coluna principal */}
          <div className="lg:col-span-2 space-y-5">

            {/* Dados do CNPJ / Receita Federal */}
            {temCnpjData && (
              <Section title="Dados Receita Federal" icon={FileText}>
                <div className="grid grid-cols-2 gap-4">
                  <InfoRow label="Natureza Jurídica" value={(f as any).naturezaJuridica} />
                  <InfoRow label="Porte" value={(f as any).porte} />
                  <InfoRow label="Capital Social" value={(f as any).capitalSocial} />
                  <InfoRow label="Data de Abertura" value={(f as any).dataAbertura} />
                  <InfoRow label="Regime Tributário" value={(f as any).regimeTributario} />
                </div>
              </Section>
            )}

            {/* CNAE */}
            {temCnae && (
              <Section title="Atividades (CNAE)" icon={Briefcase}>
                <div className="space-y-3">
                  {(f as any).atividadePrincipal && (
                    <div>
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Atividade Principal</p>
                      <p className="text-sm text-slate-800 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">{(f as any).atividadePrincipal}</p>
                    </div>
                  )}
                  {(f as any).atividadesCnae && (
                    <div>
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Atividades Secundárias</p>
                      <p className="text-sm text-slate-600 whitespace-pre-wrap">{(f as any).atividadesCnae}</p>
                    </div>
                  )}
                </div>
              </Section>
            )}

            {/* Inscrições fiscais */}
            {temInscricoes && (
              <Section title="Inscrições Fiscais" icon={Hash}>
                <div className="grid grid-cols-2 gap-4">
                  <InfoRow label="Inscrição Estadual" value={(f as any).inscricaoEstadual} />
                  <InfoRow label="Inscrição Municipal" value={(f as any).inscricaoMunicipal} />
                  <InfoRow label="Regime Tributário" value={(f as any).regimeTributario} />
                </div>
              </Section>
            )}

            {/* Representante Legal */}
            {temRepresentante && (
              <Section title="Representante Legal" icon={Users}>
                <div className="grid grid-cols-2 gap-4">
                  <InfoRow label="Nome" value={(f as any).representanteLegal} />
                  <InfoRow label="CPF" value={(f as any).representanteCpf} />
                  <InfoRow label="Cargo" value={(f as any).representanteCargo} />
                </div>
              </Section>
            )}

            {/* Quadro Societário */}
            {socios.length > 0 && (
              <Section title={`Quadro Societário (${socios.length} sócio${socios.length !== 1 ? "s" : ""})`} icon={Users}>
                <div className="space-y-2">
                  {socios.map((s: any, i: number) => (
                    <div key={i} className="flex items-start gap-3 bg-slate-50 rounded-lg px-4 py-3 border border-slate-100">
                      <div className="bg-slate-200 rounded-full h-8 w-8 flex items-center justify-center shrink-0 text-xs font-bold text-slate-600">
                        {(s.nome || "?").charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-800 text-sm">{s.nome || "—"}</p>
                        {s.qualificacao && <p className="text-xs text-slate-500 mt-0.5">{s.qualificacao}</p>}
                        {s.faixaEtaria && <p className="text-xs text-slate-400">{s.faixaEtaria}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Desempenho */}
            <Section title="Desempenho" icon={TrendingUp}>
              {!score ? (
                <div className="flex items-center gap-2 py-3">
                  <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                  <span className="text-xs text-slate-400">Carregando desempenho...</span>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <ScoreStars score={score.score} size={18} />
                      <span className="text-xl font-bold text-slate-800">{score.score}/5</span>
                    </div>
                    {isRecomendado && (
                      <span className="flex items-center gap-1 text-xs font-semibold bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full border border-emerald-200">
                        <ShieldCheck className="h-3.5 w-3.5" /> Recomendado
                      </span>
                    )}
                    {isAtencao && (
                      <span className="flex items-center gap-1 text-xs font-semibold bg-red-100 text-red-700 px-3 py-1 rounded-full border border-red-200">
                        <ShieldAlert className="h-3.5 w-3.5" /> Atenção
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { icon: Package, label: "OCs Atendidas", color: "blue", value: String(score.totalOCs),
                        sub: score.totalValorOCs > 0 ? score.totalValorOCs.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "" },
                      { icon: Clock, label: "Pontualidade", color: score.taxaPontualidade >= 80 ? "emerald" : score.taxaPontualidade >= 50 ? "amber" : "red",
                        value: `${score.taxaPontualidade}%`, sub: `${score.ocsPontuais}/${score.ocsComData} no prazo` },
                      { icon: TrendingUp, label: "Competitividade", color: score.taxaCompetitividade >= 50 ? "emerald" : "amber",
                        value: `${score.taxaCompetitividade}%`, sub: `${score.cotacoesVencidas} cotação(ões) vencida(s)` },
                      { icon: Star, label: "Avaliações", color: "amber",
                        value: score.mediaAvaliacoes !== null ? String(score.mediaAvaliacoes) : "—",
                        sub: `${score.totalAvaliacoes} avaliação(ões)` },
                    ].map(({ icon: Icon, label, color, value, sub }) => (
                      <div key={label} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                        <div className="flex items-center gap-1.5 mb-2">
                          <Icon className={`h-3.5 w-3.5 text-${color}-500`} />
                          <span className="text-[10px] text-slate-400 uppercase font-medium tracking-wide">{label}</span>
                        </div>
                        <p className={`text-xl font-bold text-${color}-600`}>{value}</p>
                        {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
                      </div>
                    ))}
                  </div>

                  {score.totalDivergencias > 0 && (
                    <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 rounded-lg px-4 py-3 border border-amber-200">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      {score.totalDivergencias} recebimento(s) com divergência · {score.taxaSemDivergencia}% sem problemas
                    </div>
                  )}

                  {score.ultimasAvaliacoes && score.ultimasAvaliacoes.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[10px] text-slate-400 uppercase font-semibold tracking-wide">Últimas Avaliações</p>
                      {score.ultimasAvaliacoes.map((av: any, idx: number) => (
                        <div key={idx} className="flex items-start gap-3 bg-slate-50 rounded-lg px-4 py-3 border border-slate-100">
                          <ScoreStars score={av.nota} size={13} />
                          <div className="flex-1 min-w-0">
                            {av.comentario && <p className="text-sm text-slate-600">{av.comentario}</p>}
                            <p className="text-xs text-slate-400 mt-0.5">{new Date(av.criadoEm).toLocaleDateString("pt-BR")}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Section>

            {/* Observações */}
            {(f as any).observacoes && (
              <Section title="Observações" icon={FileText}>
                <p className="text-sm text-slate-700 whitespace-pre-wrap break-words leading-relaxed">{(f as any).observacoes}</p>
              </Section>
            )}
          </div>

          {/* Coluna lateral */}
          <div className="space-y-5">

            {/* Contato */}
            {((f as any).telefone || (f as any).email || (f as any).contatoNome) && (
              <Section title="Contato" icon={Phone}>
                <div className="space-y-3 text-sm">
                  {(f as any).telefone && (
                    <div className="flex items-center gap-2 text-slate-700">
                      <Phone className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span>{(f as any).telefone}</span>
                    </div>
                  )}
                  {(f as any).email && (
                    <div className="flex items-center gap-2 text-slate-700">
                      <Mail className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <a href={`mailto:${(f as any).email}`} className="break-all hover:text-blue-600 transition-colors">{(f as any).email}</a>
                    </div>
                  )}
                  {(f as any).contatoNome && (
                    <div className="mt-3 pt-3 border-t border-slate-100">
                      <p className="text-[10px] text-slate-400 uppercase font-semibold tracking-wide mb-1.5">Contato Comercial</p>
                      <p className="font-medium text-slate-800">{(f as any).contatoNome}</p>
                      {(f as any).contatoCelular && <p className="text-slate-500 text-xs mt-0.5">{(f as any).contatoCelular}</p>}
                      {(f as any).contatoEmail && (
                        <a href={`mailto:${(f as any).contatoEmail}`} className="text-slate-500 text-xs break-all hover:text-blue-600 transition-colors">{(f as any).contatoEmail}</a>
                      )}
                    </div>
                  )}
                </div>
              </Section>
            )}

            {/* Endereço */}
            {temEndereco && (
              <Section title="Endereço" icon={MapPin}>
                <div className="text-sm text-slate-700 space-y-1 leading-relaxed">
                  {(f as any).endereco && (
                    <p>{[(f as any).endereco, (f as any).numero, (f as any).complemento].filter(Boolean).join(", ")}</p>
                  )}
                  {(f as any).bairro && <p className="text-slate-500">{(f as any).bairro}</p>}
                  {((f as any).cidade || (f as any).estado) && (
                    <p className="text-slate-600 font-medium">{[(f as any).cidade, (f as any).estado].filter(Boolean).join(" / ")}</p>
                  )}
                  {(f as any).cep && (
                    <p className="font-mono text-xs text-slate-400 mt-1">CEP {(f as any).cep}</p>
                  )}
                </div>
              </Section>
            )}

            {/* Dados Bancários */}
            {temBancario && (
              <Section title="Dados Bancários" icon={Landmark}>
                <div className="text-sm text-slate-700 space-y-2">
                  {(f as any).banco && <p className="font-semibold">{(f as any).banco}</p>}
                  {(f as any).agencia && (
                    <p className="text-slate-500">
                      Ag. <span className="font-mono">{(f as any).agencia}</span>
                      {" "}/ Conta <span className="font-mono">{(f as any).conta}</span>
                    </p>
                  )}
                  {(f as any).pix && (
                    <div className="mt-2 pt-2 border-t border-slate-100">
                      <p className="text-[10px] text-slate-400 uppercase font-semibold tracking-wide mb-1">PIX</p>
                      <p className="font-mono text-xs text-emerald-700 bg-emerald-50 px-2 py-1 rounded break-all">{(f as any).pix}</p>
                    </div>
                  )}
                </div>
              </Section>
            )}

            {/* Classificações */}
            <Section title="Classificações" icon={Tag}>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Fornecedor</span>
                  {(f as any).isFornecedor
                    ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    : <XCircle className="h-4 w-4 text-slate-300" />}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Prestador de Serviço</span>
                  {(f as any).isPrestadorServico
                    ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    : <XCircle className="h-4 w-4 text-slate-300" />}
                </div>
              </div>
            </Section>

            {/* Datas */}
            <Section title="Registro" icon={Calendar}>
              <div className="space-y-2 text-sm">
                <InfoRow label="Cadastrado em" value={(f as any).criadoEm ? new Date((f as any).criadoEm).toLocaleDateString("pt-BR") : undefined} />
                <InfoRow label="Atualizado em" value={(f as any).atualizadoEm ? new Date((f as any).atualizadoEm).toLocaleDateString("pt-BR") : undefined} />
              </div>
            </Section>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
