import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  GraduationCap, User, Video, CheckCircle, XCircle, ArrowRight, ArrowLeft,
  Loader2, ShieldCheck, RefreshCw, Award, AlertTriangle, Download, Sparkles, BookOpen, Clock, Eye,
} from "lucide-react";
import { generateCertificadoIntegracaoSstPdf } from "@/lib/certificadoIntegracaoSstPdf";

function formatCPF(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export default function IntegracaoPublica() {
  const params = useParams<{ token: string }>();
  const token = params?.token || "";
  // Rev. 2043 — se vier ?cpf= na URL (RH iniciou pelo botão "Iniciar agora"),
  // pula a tela de identificação e auto-busca dados.
  const urlSearch = typeof window !== "undefined" ? window.location.search : "";
  const urlCpf = (() => {
    try { return new URLSearchParams(urlSearch).get("cpf")?.replace(/\D/g, "") || ""; }
    catch { return ""; }
  })();
  const autoStart = urlCpf.length === 11;
  const [step, setStep] = useState<"cpf" | "boasvindas" | "modulos" | "quiz" | "resultado">(autoStart ? "boasvindas" : "cpf");
  const [cpf, setCpf] = useState(autoStart ? formatCPF(urlCpf) : "");
  const [data, setData] = useState<any>(null);
  const [currentModulo, setCurrentModulo] = useState(0);
  const [videoWatched, setVideoWatched] = useState<Set<number>>(new Set());
  const [respostas, setRespostas] = useState<Record<number, number>>({});
  const [resultado, setResultado] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);

  const buscarQuery = trpc.integracaoSST.buscarPorCpf.useQuery(
    { token, cpf: cpf.replace(/\D/g, "") },
    { enabled: false }
  );

  const submeterMutation = trpc.integracaoSST.submeterQuestionario.useMutation();

  // Rev. 2043 — auto-busca quando RH passou o CPF na URL.
  // Em caso de "ja_aprovado", cai naturalmente na tela de resultado.
  // Em caso de "sem_config", volta pro step "cpf" pra mostrar o erro inline.
  const autoTriggered = useRef(false);
  useEffect(() => {
    if (!autoStart || autoTriggered.current || !token) return;
    autoTriggered.current = true;
    (async () => {
      try {
        const result = await buscarQuery.refetch();
        if (!result.data) return;
        setData(result.data);
        if (result.data.status === "ja_aprovado") {
          setResultado({ aprovado: true, nota: Number(result.data.registro.nota || 0), jaAprovado: true });
          setStep("resultado");
        } else if (result.data.status === "sem_config") {
          setStep("cpf");
          toast.error("Nenhuma configuração de integração encontrada para esta empresa.");
        }
        // status "pronto" → permanece em "boasvindas" (já é o estado inicial)
      } catch (err: any) {
        setStep("cpf");
        toast.error(err?.message || "Não foi possível carregar a integração — digite o CPF novamente.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, autoStart]);

  const handleBuscarCpf = async () => {
    if (cpf.replace(/\D/g, "").length < 11) { toast.error("CPF deve ter 11 dígitos"); return; }
    try {
      const result = await buscarQuery.refetch();
      if (result.data) {
        setData(result.data);
        if (result.data.status === "ja_aprovado") {
          setResultado({ aprovado: true, nota: Number(result.data.registro.nota || 0), jaAprovado: true });
          setStep("resultado");
        } else if (result.data.status === "sem_config") {
          toast.error("Nenhuma configuração de integração encontrada para esta empresa.");
        } else {
          // Rev. 2038 — passa por tela de Boas-vindas antes dos vídeos.
          setStep("boasvindas");
        }
      }
    } catch (err: any) {
      toast.error(err?.message || "Erro ao buscar dados");
    }
  };

  const handleSubmit = async () => {
    const allPerguntas = data.modulos.flatMap((m: any) => m.perguntas || []);
    const missing = allPerguntas.filter((p: any) => !respostas[p.id]);
    if (missing.length > 0) { toast.error(`Responda todas as ${allPerguntas.length} perguntas antes de enviar`); return; }

    setSubmitting(true);
    try {
      const resp = await submeterMutation.mutateAsync({
        token,
        cpf: cpf.replace(/\D/g, ""),
        respostas: allPerguntas.map((p: any) => ({ perguntaId: p.id, alternativaId: respostas[p.id] })),
      });
      setResultado(resp);
      setStep("resultado");
    } catch (err: any) {
      toast.error(err?.message || "Erro ao enviar questionário");
    } finally {
      setSubmitting(false);
    }
  };

  const markVideoWatched = (moduloId: number) => {
    setVideoWatched(prev => new Set(prev).add(moduloId));
  };

  const allVideosWatched = data?.modulos?.every((m: any) => !m.videoUrl || videoWatched.has(m.id)) ?? false;
  const totalPerguntas = data?.modulos?.reduce((acc: number, m: any) => acc + (m.perguntas?.length || 0), 0) || 0;
  const respondidas = Object.keys(respostas).length;

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white">
      <div className="max-w-3xl mx-auto p-4 md:p-8">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-full mb-4">
            <ShieldCheck className="h-5 w-5" />
            <span className="font-semibold">Integração de Segurança</span>
          </div>
          {data?.registro?.employeeNome && step !== "cpf" && (
            <p className="text-sm text-muted-foreground">Colaborador: <strong>{data.registro.employeeNome}</strong></p>
          )}
        </div>

        <div className="flex items-center justify-center gap-2 mb-6">
          {["cpf", "boasvindas", "modulos", "quiz", "resultado"].map((s, i) => {
            const stepsOrder = ["cpf", "boasvindas", "modulos", "quiz", "resultado"];
            const currentIdx = stepsOrder.indexOf(step);
            return (
              <div key={s} className="flex items-center gap-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${step === s ? "bg-emerald-600 text-white" : i < currentIdx ? "bg-emerald-200 text-emerald-800" : "bg-gray-200 text-gray-500"}`}>
                  {i + 1}
                </div>
                {i < 4 && <div className={`w-6 h-0.5 ${i < currentIdx ? "bg-emerald-400" : "bg-gray-200"}`} />}
              </div>
            );
          })}
        </div>

        {step === "cpf" && (
          <Card className="max-w-md mx-auto">
            <CardHeader className="text-center">
              <User className="h-12 w-12 mx-auto text-emerald-600 mb-2" />
              <CardTitle>Identificação</CardTitle>
              <p className="text-sm text-muted-foreground">Digite seu CPF para iniciar a integração de segurança</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                value={cpf}
                onChange={e => setCpf(formatCPF(e.target.value))}
                placeholder="000.000.000-00"
                maxLength={14}
                className="text-center text-lg"
                onKeyDown={e => e.key === "Enter" && handleBuscarCpf()}
              />
              <Button className="w-full bg-emerald-600 hover:bg-emerald-700" onClick={handleBuscarCpf} disabled={buscarQuery.isFetching}>
                {buscarQuery.isFetching ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ArrowRight className="h-4 w-4 mr-2" />}
                Iniciar
              </Button>
            </CardContent>
          </Card>
        )}

        {step === "boasvindas" && data && (
          <Card className="max-w-2xl mx-auto overflow-hidden">
            <div className="bg-gradient-to-br from-emerald-600 to-teal-700 text-white p-6 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-white/20 rounded-full mb-3 backdrop-blur-sm">
                <Sparkles className="h-8 w-8" />
              </div>
              <h2 className="text-2xl font-bold mb-1">Bem-vindo(a){data?.registro?.employeeNome ? `, ${data.registro.employeeNome.split(" ")[0]}` : ""}!</h2>
              <p className="text-emerald-50 text-sm">Integração de Segurança do Trabalho</p>
            </div>
            <CardContent className="p-6 space-y-5">
              <p className="text-sm text-gray-700 leading-relaxed">
                Esta é a sua <strong>Integração de Segurança</strong>, um treinamento obrigatório para todos os colaboradores antes de iniciar as atividades. Aqui você vai conhecer as regras de segurança, os riscos da nossa operação e como se proteger no dia a dia da obra.
              </p>

              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 space-y-3">
                <h3 className="font-semibold text-emerald-800 text-sm flex items-center gap-2">
                  <BookOpen className="h-4 w-4" /> Como funciona
                </h3>
                <div className="space-y-2.5 text-sm text-emerald-900">
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-600 text-white font-bold text-xs flex items-center justify-center">1</div>
                    <div><strong>Assista aos vídeos</strong> de treinamento com atenção. Cada vídeo aborda um tema essencial de segurança.</div>
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-600 text-white font-bold text-xs flex items-center justify-center">2</div>
                    <div><strong>Responda ao questionário</strong> ao final, com base no conteúdo dos vídeos.</div>
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-600 text-white font-bold text-xs flex items-center justify-center">3</div>
                    <div><strong>Tire seu certificado de aprovação</strong>, com validade de {data?.config?.validadeMeses || 24} meses.</div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-center">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <Video className="h-5 w-5 mx-auto text-blue-600 mb-1" />
                  <p className="text-xs text-blue-700 font-medium">Vídeos</p>
                  <p className="text-lg font-bold text-blue-800">{data?.modulos?.filter((m: any) => m.videoUrl).length || 0}</p>
                </div>
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                  <GraduationCap className="h-5 w-5 mx-auto text-purple-600 mb-1" />
                  <p className="text-xs text-purple-700 font-medium">Perguntas</p>
                  <p className="text-lg font-bold text-purple-800">{totalPerguntas}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
                <Clock className="h-4 w-4 flex-shrink-0" />
                <span>Reserve um tempo tranquilo — você precisa de <strong>{data?.config?.notaMinima || 70}%</strong> de acertos para ser aprovado.</span>
              </div>

              <Button
                className="w-full bg-emerald-600 hover:bg-emerald-700 h-12 text-base font-semibold"
                onClick={() => setStep("modulos")}
              >
                Começar Treinamento <ArrowRight className="h-5 w-5 ml-2" />
              </Button>
            </CardContent>
          </Card>
        )}

        {step === "modulos" && data && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Video className="h-5 w-5 text-blue-500" />Módulos de Treinamento</CardTitle>
                <p className="text-sm text-muted-foreground">Assista todos os vídeos antes de realizar o questionário</p>
              </CardHeader>
              <CardContent className="space-y-4">
                {data.modulos?.map((mod: any, idx: number) => (
                  <div key={mod.id} className={`border rounded-lg p-4 ${currentModulo === idx ? "border-emerald-500 bg-emerald-50/30" : ""}`}>
                    <div className="flex items-center justify-between mb-2 cursor-pointer" onClick={() => setCurrentModulo(idx)}>
                      <div className="flex items-center gap-2">
                        <Badge variant={videoWatched.has(mod.id) ? "default" : "outline"} className={videoWatched.has(mod.id) ? "bg-emerald-600" : ""}>
                          {videoWatched.has(mod.id) ? <CheckCircle className="h-3 w-3 mr-1" /> : null}
                          {idx + 1}
                        </Badge>
                        <span className="font-medium">{mod.titulo}</span>
                      </div>
                      {mod.duracaoMinutos && <span className="text-xs text-muted-foreground">{mod.duracaoMinutos} min</span>}
                    </div>
                    {mod.descricao && <p className="text-sm text-muted-foreground mb-2">{mod.descricao}</p>}
                    {currentModulo === idx && mod.videoUrl && (
                      <div className="mt-2">
                        <VideoPlayer url={mod.videoUrl} onComplete={() => markVideoWatched(mod.id)} />
                      </div>
                    )}
                    {currentModulo === idx && !mod.videoUrl && (
                      <div className="mt-2 p-4 bg-muted rounded text-center text-sm text-muted-foreground">
                        <p>Módulo sem vídeo. Leia as instruções e prossiga.</p>
                        <Button size="sm" variant="outline" className="mt-2" onClick={() => markVideoWatched(mod.id)}>Marcar como concluído</Button>
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
            <div className="flex justify-end">
              <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={!allVideosWatched} onClick={() => setStep("quiz")}>
                Ir para o Questionário <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
            {!allVideosWatched && <p className="text-sm text-orange-600 text-right flex items-center justify-end gap-1"><AlertTriangle className="h-4 w-4" />Assista todos os vídeos para liberar o questionário</p>}
          </div>
        )}

        {step === "quiz" && data && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle className="flex items-center gap-2"><GraduationCap className="h-5 w-5 text-emerald-600" />Questionário</CardTitle>
                  <Badge variant="outline">{respondidas}/{totalPerguntas} respondidas</Badge>
                </div>
                <p className="text-sm text-muted-foreground">Nota mínima: {data.config?.notaMinima || 70}%</p>
                <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                  <div className="bg-emerald-500 rounded-full h-2 transition-all" style={{ width: `${totalPerguntas > 0 ? (respondidas / totalPerguntas) * 100 : 0}%` }} />
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {data.modulos?.map((mod: any) => (
                  <div key={mod.id}>
                    {data.modulos.length > 1 && <h4 className="font-medium text-sm text-muted-foreground mb-3 border-b pb-1">{mod.titulo}</h4>}
                    {mod.perguntas?.map((p: any, pi: number) => (
                      <div key={p.id} className="mb-4 border rounded-lg p-4">
                        <p className="font-medium text-sm mb-3">{pi + 1}. {p.texto}</p>
                        <div className="space-y-2">
                          {p.alternativas?.map((a: any) => (
                            <label key={a.id} className={`flex items-center gap-3 p-2 rounded-lg border cursor-pointer transition-colors ${respostas[p.id] === a.id ? "border-emerald-500 bg-emerald-50" : "hover:bg-gray-50"}`}>
                              <input type="radio" name={`q_${p.id}`} checked={respostas[p.id] === a.id}
                                onChange={() => setRespostas(prev => ({ ...prev, [p.id]: a.id }))}
                                className="accent-emerald-600" />
                              <span className="text-sm">{a.texto}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </CardContent>
            </Card>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep("modulos")}><ArrowLeft className="h-4 w-4 mr-2" />Voltar aos Vídeos</Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={respondidas < totalPerguntas || submitting} onClick={handleSubmit}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                Enviar Respostas
              </Button>
            </div>
          </div>
        )}

        {step === "resultado" && resultado && (
          <Card className="max-w-md mx-auto text-center">
            <CardContent className="pt-8 pb-6 space-y-4">
              {resultado.aprovado || resultado.jaAprovado ? (
                <>
                  <div className="w-20 h-20 mx-auto bg-emerald-100 rounded-full flex items-center justify-center">
                    <Award className="h-10 w-10 text-emerald-600" />
                  </div>
                  <h2 className="text-2xl font-bold text-emerald-700">Aprovado!</h2>
                  {resultado.jaAprovado ? (
                    <p className="text-muted-foreground">Sua integração já havia sido aprovada anteriormente.</p>
                  ) : (
                    <>
                      <p className="text-muted-foreground">Parabéns! Você foi aprovado na integração de segurança.</p>
                      <div className="flex justify-center gap-4 text-sm">
                        <div className="text-center">
                          <p className="text-2xl font-bold text-emerald-700">{resultado.nota}%</p>
                          <p className="text-muted-foreground">Nota</p>
                        </div>
                        <div className="text-center">
                          <p className="text-2xl font-bold">{resultado.acertos}/{resultado.totalPerguntas}</p>
                          <p className="text-muted-foreground">Acertos</p>
                        </div>
                      </div>
                    </>
                  )}
                  <div className="bg-emerald-50 p-3 rounded-lg space-y-2">
                    <p className="text-sm text-emerald-700">Sua pontuação foi registrada no Raio-X do colaborador.</p>
                    {resultado.dataValidade && (
                      <p className="text-xs text-emerald-700/80">
                        Válido até <strong>{new Date(resultado.dataValidade).toLocaleDateString("pt-BR")}</strong>
                      </p>
                    )}
                  </div>
                  {(() => {
                    const reg = data?.registro || {};
                    const certParams = {
                      registroId: resultado.registroId ?? reg.id ?? 0,
                      employeeNome: resultado.employeeNome ?? reg.employeeNome ?? "",
                      employeeCpf: resultado.employeeCpf ?? reg.employeeCpf ?? cpf,
                      employeeFuncao: resultado.employeeFuncao ?? reg.employeeFuncao ?? null,
                      obraNome: resultado.obraNome ?? reg.obraNome ?? null,
                      configNome: data?.config?.titulo ?? null,
                      dataRealizacao: resultado.dataRealizacao ?? reg.dataRealizacao ?? null,
                      dataValidade: resultado.dataValidade ?? reg.dataValidade ?? null,
                      nota: Number(resultado.nota || 0),
                      notaMinima: Number(resultado.notaMinima ?? data?.config?.notaMinima ?? 70),
                      acertos: resultado.acertos ?? null,
                      totalPerguntas: resultado.totalPerguntas ?? null,
                      tentativa: resultado.tentativa ?? null,
                    };
                    return (
                      <div className="space-y-2">
                        <Button
                          variant="outline"
                          className="w-full border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                          onClick={async () => {
                            // Abre janela SINCRONAMENTE antes do await (defesa contra pop-up blocker — Rev. 2039 lição)
                            const winRef = window.open("about:blank", "_blank");
                            try {
                              await generateCertificadoIntegracaoSstPdf({ ...certParams, mode: "preview", winRef });
                            } catch (e: any) {
                              try { winRef?.close(); } catch {}
                              toast.error(e?.message || "Erro ao gerar certificado");
                            }
                          }}
                        >
                          <Eye className="h-4 w-4 mr-2" /> Visualizar / Imprimir Certificado
                        </Button>
                        <Button
                          className="w-full bg-emerald-600 hover:bg-emerald-700"
                          onClick={async () => {
                            try {
                              await generateCertificadoIntegracaoSstPdf(certParams);
                            } catch (e: any) {
                              toast.error(e?.message || "Erro ao gerar certificado");
                            }
                          }}
                        >
                          <Download className="h-4 w-4 mr-2" /> Baixar Certificado em PDF
                        </Button>
                      </div>
                    );
                  })()}
                </>
              ) : (
                <>
                  <div className="w-20 h-20 mx-auto bg-red-100 rounded-full flex items-center justify-center">
                    <XCircle className="h-10 w-10 text-red-500" />
                  </div>
                  <h2 className="text-2xl font-bold text-red-600">Não Aprovado</h2>
                  <p className="text-muted-foreground">Infelizmente sua nota não atingiu o mínimo necessário.</p>
                  <div className="flex justify-center gap-4 text-sm">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-red-600">{resultado.nota}%</p>
                      <p className="text-muted-foreground">Sua Nota</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold">{resultado.notaMinima}%</p>
                      <p className="text-muted-foreground">Mínimo</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold">{resultado.acertos}/{resultado.totalPerguntas}</p>
                      <p className="text-muted-foreground">Acertos</p>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">Revise os vídeos e tente novamente. Procure o TST responsável.</p>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function VideoPlayer({ url, onComplete }: { url: string; onComplete: () => void }) {
  const [completed, setCompleted] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [videoLoading, setVideoLoading] = useState(true);
  const [videoSlow, setVideoSlow] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slowRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getYoutubeId = (u: string) => {
    const match = u.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]+)/);
    return match?.[1] || null;
  };

  const ytId = getYoutubeId(url);

  useEffect(() => {
    setVideoError(false);
    setVideoLoading(true);
    setVideoSlow(false);
    timerRef.current = setTimeout(() => {
      setCompleted(true);
      onComplete();
    }, 30000);
    // Rev. 2920 — fallback temporal: se em 12s ainda não carregou (sem onError),
    // some o overlay "Carregando…" e oferece "Abrir em nova aba" (anti-overlay-eterno).
    slowRef.current = setTimeout(() => { setVideoLoading(false); setVideoSlow(true); }, 12000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (slowRef.current) clearTimeout(slowRef.current);
    };
  }, [url]);

  const handleManualComplete = useCallback(() => {
    setCompleted(true);
    onComplete();
    if (timerRef.current) clearTimeout(timerRef.current);
  }, [onComplete]);

  if (ytId) {
    return (
      <div>
        <div className="aspect-video w-full max-w-3xl mx-auto rounded-lg overflow-hidden bg-black">
          <iframe src={`https://www.youtube.com/embed/${ytId}?rel=0`} className="w-full h-full block" allowFullScreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" />
        </div>
        <div className="flex items-center justify-center mt-2">
          {completed ? (
            <Badge className="bg-emerald-600"><CheckCircle className="h-3 w-3 mr-1" />Vídeo assistido</Badge>
          ) : (
            <Button size="sm" variant="outline" onClick={handleManualComplete}>Marcar como assistido</Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Rev. 2920 — vídeo SEM aspect-video rígido: usa proporção natural, sempre CENTRALIZADO
          (flex center) e com altura limitada; sem mais "buraco preto" por descasamento de proporção.
          Estados de carregando/erro garantem que, se o player inline falhar, o vídeo continua acessível. */}
      <div className="w-full max-w-3xl mx-auto rounded-lg overflow-hidden bg-black flex items-center justify-center relative" style={{ minHeight: 240 }}>
        {videoError ? (
          <div className="text-center text-white/90 px-6 py-10 text-sm">
            <p className="mb-1 font-medium">Não foi possível exibir o vídeo aqui.</p>
            <p className="mb-3 text-white/60">A conexão pode estar instável ou o arquivo é grande.</p>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 underline text-blue-300 hover:text-blue-200"
            >
              <Video className="h-4 w-4" /> Abrir o vídeo em nova aba
            </a>
          </div>
        ) : (
          <>
            {videoLoading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center text-white/70 text-sm pointer-events-none">
                Carregando vídeo…
              </div>
            )}
            <video
              key={url}
              src={url}
              controls
              playsInline
              preload="metadata"
              className="w-full max-h-[70vh] object-contain bg-black"
              onLoadedMetadata={() => { if (slowRef.current) clearTimeout(slowRef.current); setVideoLoading(false); setVideoSlow(false); }}
              onCanPlay={() => { if (slowRef.current) clearTimeout(slowRef.current); setVideoLoading(false); setVideoSlow(false); }}
              onEnded={handleManualComplete}
              onError={() => { if (slowRef.current) clearTimeout(slowRef.current); setVideoLoading(false); setVideoError(true); }}
            />
          </>
        )}
      </div>
      {videoSlow && !videoError && (
        <p className="text-xs text-muted-foreground text-center mt-1">
          Está demorando para carregar?{" "}
          <a href={url} target="_blank" rel="noreferrer" className="underline text-blue-600 hover:text-blue-700">Abrir o vídeo em nova aba</a>
        </p>
      )}
      <div className="flex items-center justify-center mt-2">
        {!completed && <Button size="sm" variant="outline" onClick={handleManualComplete}>Marcar como assistido</Button>}
        {completed && <Badge className="bg-emerald-600"><CheckCircle className="h-3 w-3 mr-1" />Vídeo assistido</Badge>}
      </div>
    </div>
  );
}
