import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  FileText, Heart, CheckCircle, Loader2, AlertTriangle, Send, Star, ThumbsUp, ThumbsDown, Shield
} from "lucide-react";

const NOTA_LABELS: Record<number, { label: string; cor: string }> = {
  1: { label: "Péssimo", cor: "text-red-600" },
  2: { label: "Ruim", cor: "text-orange-600" },
  3: { label: "Regular", cor: "text-yellow-600" },
  4: { label: "Bom", cor: "text-blue-600" },
  5: { label: "Ótimo", cor: "text-green-600" },
};

// ============================================================
// PESQUISA CUSTOMIZADA PÚBLICA
// ============================================================
export function PesquisaPublicaPage() {
  const params = useParams<{ token: string }>();
  const token = params.token || "";

  const [respondentName, setRespondentName] = useState("");
  const [respondentEmail, setRespondentEmail] = useState("");
  const [respostas, setRespostas] = useState<Record<number, { nota?: number; texto?: string; valor?: string }>>({});
  const [submitted, setSubmitted] = useState(false);

  const survey = trpc.avaliacao.pesquisas.getByToken.useQuery(
    { token },
    { enabled: !!token }
  );

  const submitMutation = trpc.avaliacao.pesquisas.submitResponse.useMutation({
    onSuccess: () => {
      setSubmitted(true);
      toast.success("Resposta enviada com sucesso!");
    },
    onError: (e) => toast.error(e.message),
  });

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="py-12 text-center">
            <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-amber-500" />
            <p className="text-lg font-semibold">Link inválido</p>
            <p className="text-muted-foreground mt-2">Este link de pesquisa não é válido.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (survey.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (survey.error || !survey.data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="py-12 text-center">
            <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-red-500" />
            <p className="text-lg font-semibold">Pesquisa não encontrada</p>
            <p className="text-muted-foreground mt-2">{survey.error?.message || "A pesquisa pode ter sido encerrada ou o link é inválido."}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="py-12 text-center">
            <CheckCircle className="w-16 h-16 mx-auto mb-4 text-green-500" />
            <p className="text-2xl font-bold">Obrigado!</p>
            <p className="text-muted-foreground mt-2">Sua resposta foi registrada com sucesso.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const s = survey.data;
  const questions: any[] = s.questions || [];
  const isAnonima = s.anonimo;

  function handleSubmit() {
    const answers = questions.map((q: any) => {
      const r = respostas[q.id] || {};
      return {
        questionId: q.id,
        nota: r.nota,
        textoLivre: r.texto,
        valor: r.valor,
      };
    });

    // Validate required
    for (const q of questions) {
      if (q.obrigatoria) {
        const r = respostas[q.id];
        if (!r || (q.tipo === "nota" && !r.nota) || (q.tipo === "texto" && !r.texto) || (q.tipo === "sim_nao" && !r.valor)) {
          toast.error(`Responda a pergunta: "${q.texto}"`);
          return;
        }
      }
    }

    submitMutation.mutate({
      surveyId: s.id,
      respondentName: isAnonima ? undefined : respondentName || undefined,
      respondentEmail: isAnonima ? undefined : respondentEmail || undefined,
      answers,
    });
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <Card>
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                <FileText className="w-7 h-7 text-primary" />
              </div>
            </div>
            <CardTitle className="text-xl">{s.titulo}</CardTitle>
            {s.descricao && <CardDescription className="mt-2">{s.descricao}</CardDescription>}
            <div className="flex justify-center gap-2 mt-3">
              <Badge variant="outline">{s.tipo}</Badge>
              {isAnonima && <Badge variant="outline"><Shield className="w-3 h-3 mr-1" /> Anônima</Badge>}
              <Badge variant="outline">{questions.length} perguntas</Badge>
            </div>
          </CardHeader>
        </Card>

        {/* Identificação (se não anônima) */}
        {!isAnonima && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Identificação</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>Nome (opcional)</Label>
                <Input value={respondentName} onChange={(e) => setRespondentName(e.target.value)} placeholder="Seu nome" />
              </div>
              <div>
                <Label>E-mail (opcional)</Label>
                <Input type="email" value={respondentEmail} onChange={(e) => setRespondentEmail(e.target.value)} placeholder="seu@email.com" />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Perguntas */}
        {questions.map((q: any, i: number) => (
          <Card key={q.id}>
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <span className="text-xs font-mono text-muted-foreground bg-muted rounded-full w-6 h-6 flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                <div className="flex-1">
                  <p className="font-medium mb-3">
                    {q.texto}
                    {q.obrigatoria && <span className="text-red-500 ml-1">*</span>}
                  </p>

                  {q.tipo === "nota" && (
                    <div className="flex gap-2">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setRespostas(prev => ({ ...prev, [q.id]: { ...prev[q.id], nota: n } }))}
                          className={`flex-1 py-3 rounded-lg border-2 font-bold text-sm transition-all ${
                            respostas[q.id]?.nota === n
                              ? n <= 2 ? "bg-red-100 border-red-300 text-red-700" :
                                n === 3 ? "bg-yellow-100 border-yellow-300 text-yellow-700" :
                                "bg-green-100 border-green-300 text-green-700"
                              : "border-gray-200 text-gray-400 hover:border-gray-400"
                          }`}
                        >
                          <div className="text-lg">{n}</div>
                          <div className="text-xs font-normal">{NOTA_LABELS[n]?.label}</div>
                        </button>
                      ))}
                    </div>
                  )}

                  {q.tipo === "texto" && (
                    <Textarea
                      value={respostas[q.id]?.texto || ""}
                      onChange={(e) => setRespostas(prev => ({ ...prev, [q.id]: { ...prev[q.id], texto: e.target.value } }))}
                      placeholder="Digite sua resposta..."
                      rows={3}
                    />
                  )}

                  {q.tipo === "sim_nao" && (
                    <div className="flex gap-4">
                      <button
                        type="button"
                        onClick={() => setRespostas(prev => ({ ...prev, [q.id]: { ...prev[q.id], valor: "sim" } }))}
                        className={`flex-1 py-3 rounded-lg border-2 font-medium transition-all flex items-center justify-center gap-2 ${
                          respostas[q.id]?.valor === "sim"
                            ? "bg-green-100 border-green-300 text-green-700"
                            : "border-gray-200 text-gray-400 hover:border-gray-400"
                        }`}
                      >
                        <ThumbsUp className="w-5 h-5" /> Sim
                      </button>
                      <button
                        type="button"
                        onClick={() => setRespostas(prev => ({ ...prev, [q.id]: { ...prev[q.id], valor: "nao" } }))}
                        className={`flex-1 py-3 rounded-lg border-2 font-medium transition-all flex items-center justify-center gap-2 ${
                          respostas[q.id]?.valor === "nao"
                            ? "bg-red-100 border-red-300 text-red-700"
                            : "border-gray-200 text-gray-400 hover:border-gray-400"
                        }`}
                      >
                        <ThumbsDown className="w-5 h-5" /> Não
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {/* Submit */}
        <div className="flex justify-center pb-8">
          <Button size="lg" onClick={handleSubmit} disabled={submitMutation.isPending} className="px-8">
            {submitMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Enviando...</> : <><Send className="w-4 h-4 mr-2" /> Enviar Respostas</>}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// PESQUISA DE CLIMA PÚBLICA
// ============================================================
export function ClimaPublicoPage() {
  const params = useParams<{ token: string }>();
  const token = params.token || "";

  const [cpf, setCpf] = useState("");
  const [respostas, setRespostas] = useState<Record<number, { nota?: number; texto?: string; valor?: string }>>({});
  const [submitted, setSubmitted] = useState(false);

  const survey = trpc.avaliacao.clima.getPublicSurvey.useQuery(
    { token },
    { enabled: !!token }
  );

  const submitMutation = trpc.avaliacao.clima.submitResponse.useMutation({
    onSuccess: () => {
      setSubmitted(true);
      toast.success("Resposta enviada com sucesso!");
    },
    onError: (e) => toast.error(e.message),
  });

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="py-12 text-center">
            <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-amber-500" />
            <p className="text-lg font-semibold">Link inválido</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (survey.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (survey.error || !survey.data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="py-12 text-center">
            <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-red-500" />
            <p className="text-lg font-semibold">Pesquisa não encontrada</p>
            <p className="text-muted-foreground mt-2">{survey.error?.message || "A pesquisa pode ter sido encerrada ou o link é inválido."}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="py-12 text-center">
            <CheckCircle className="w-16 h-16 mx-auto mb-4 text-green-500" />
            <p className="text-2xl font-bold">Obrigado!</p>
            <p className="text-muted-foreground mt-2">Sua resposta foi registrada de forma anônima.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const s = survey.data;
  const questions: any[] = s.questions || [];

  // Group questions by category
  const CATEGORIA_LABELS: Record<string, { label: string; icon: any; cor: string }> = {
    empresa: { label: "Empresa", icon: FileText, cor: "text-blue-600" },
    gestor: { label: "Gestão/Liderança", icon: Star, cor: "text-purple-600" },
    ambiente: { label: "Ambiente de Trabalho", icon: Heart, cor: "text-green-600" },
    seguranca: { label: "Segurança", icon: Shield, cor: "text-amber-600" },
    crescimento: { label: "Crescimento", icon: Star, cor: "text-cyan-600" },
    recomendacao: { label: "Recomendação", icon: ThumbsUp, cor: "text-pink-600" },
  };

  const groupedQuestions = questions.reduce((acc: any, q: any) => {
    const cat = q.categoria || "empresa";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(q);
    return acc;
  }, {});

  function formatCPF(value: string) {
    const nums = value.replace(/\D/g, "").slice(0, 11);
    if (nums.length <= 3) return nums;
    if (nums.length <= 6) return `${nums.slice(0, 3)}.${nums.slice(3)}`;
    if (nums.length <= 9) return `${nums.slice(0, 3)}.${nums.slice(3, 6)}.${nums.slice(6)}`;
    return `${nums.slice(0, 3)}.${nums.slice(3, 6)}.${nums.slice(6, 9)}-${nums.slice(9)}`;
  }

  function handleSubmit() {
    if (!cpf || cpf.replace(/\D/g, "").length < 11) {
      toast.error("Informe seu CPF completo para garantir que cada pessoa responda apenas uma vez.");
      return;
    }

    const answers = questions.map((q: any) => {
      const r = respostas[q.id] || {};
      return {
        questionId: q.id,
        nota: r.nota,
        textoLivre: r.texto,
        valor: r.valor,
      };
    });

    // Validate all nota questions
    for (const q of questions) {
      if (q.tipo === "nota") {
        const r = respostas[q.id];
        if (!r || !r.nota) {
          toast.error(`Responda a pergunta: "${q.texto}"`);
          return;
        }
      }
    }

    submitMutation.mutate({
      surveyId: s.id,
      cpfHash: cpf.replace(/\D/g, ""),
      answers,
    });
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <Card>
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center">
                <Heart className="w-7 h-7 text-red-500" />
              </div>
            </div>
            <CardTitle className="text-xl">{s.titulo}</CardTitle>
            {s.descricao && <CardDescription className="mt-2">{s.descricao}</CardDescription>}
            <div className="flex justify-center gap-2 mt-3">
              <Badge variant="outline"><Shield className="w-3 h-3 mr-1" /> Anônima</Badge>
              <Badge variant="outline">{questions.length} perguntas</Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Suas respostas são completamente anônimas. O CPF é usado apenas para garantir que cada pessoa responda uma única vez.
            </p>
          </CardHeader>
        </Card>

        {/* CPF */}
        <Card>
          <CardContent className="pt-6">
            <Label className="mb-2 block">CPF (para controle de duplicidade) *</Label>
            <Input
              value={cpf}
              onChange={(e) => setCpf(formatCPF(e.target.value))}
              placeholder="000.000.000-00"
              maxLength={14}
            />
            <p className="text-xs text-muted-foreground mt-1">Seu CPF não será vinculado às respostas.</p>
          </CardContent>
        </Card>

        {/* Perguntas agrupadas por categoria */}
        {Object.entries(groupedQuestions).map(([catKey, catQuestions]: [string, any]) => {
          const cat = CATEGORIA_LABELS[catKey] || { label: catKey, icon: FileText, cor: "text-gray-600" };
          const CatIcon = cat.icon;
          return (
            <Card key={catKey}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <CatIcon className={`w-4 h-4 ${cat.cor}`} /> {cat.label}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {catQuestions.map((q: any, i: number) => (
                  <div key={q.id}>
                    <p className="font-medium text-sm mb-3">{q.texto}</p>

                    {q.tipo === "nota" && (
                      <div className="flex gap-2">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => setRespostas(prev => ({ ...prev, [q.id]: { ...prev[q.id], nota: n } }))}
                            className={`flex-1 py-2.5 rounded-lg border-2 font-bold text-sm transition-all ${
                              respostas[q.id]?.nota === n
                                ? n <= 2 ? "bg-red-100 border-red-300 text-red-700" :
                                  n === 3 ? "bg-yellow-100 border-yellow-300 text-yellow-700" :
                                  "bg-green-100 border-green-300 text-green-700"
                                : "border-gray-200 text-gray-400 hover:border-gray-400"
                            }`}
                          >
                            <div>{n}</div>
                            <div className="text-xs font-normal">{NOTA_LABELS[n]?.label}</div>
                          </button>
                        ))}
                      </div>
                    )}

                    {q.tipo === "texto" && (
                      <Textarea
                        value={respostas[q.id]?.texto || ""}
                        onChange={(e) => setRespostas(prev => ({ ...prev, [q.id]: { ...prev[q.id], texto: e.target.value } }))}
                        placeholder="Digite sua resposta..."
                        rows={2}
                      />
                    )}

                    {q.tipo === "sim_nao" && (
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => setRespostas(prev => ({ ...prev, [q.id]: { ...prev[q.id], valor: "sim" } }))}
                          className={`flex-1 py-2.5 rounded-lg border-2 font-medium transition-all flex items-center justify-center gap-2 ${
                            respostas[q.id]?.valor === "sim"
                              ? "bg-green-100 border-green-300 text-green-700"
                              : "border-gray-200 text-gray-400 hover:border-gray-400"
                          }`}
                        >
                          <ThumbsUp className="w-4 h-4" /> Sim
                        </button>
                        <button
                          type="button"
                          onClick={() => setRespostas(prev => ({ ...prev, [q.id]: { ...prev[q.id], valor: "nao" } }))}
                          className={`flex-1 py-2.5 rounded-lg border-2 font-medium transition-all flex items-center justify-center gap-2 ${
                            respostas[q.id]?.valor === "nao"
                              ? "bg-red-100 border-red-300 text-red-700"
                              : "border-gray-200 text-gray-400 hover:border-gray-400"
                          }`}
                        >
                          <ThumbsDown className="w-4 h-4" /> Não
                        </button>
                      </div>
                    )}

                    {i < catQuestions.length - 1 && <div className="border-b mt-4" />}
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })}

        {/* Submit */}
        <div className="flex justify-center pb-8">
          <Button size="lg" onClick={handleSubmit} disabled={submitMutation.isPending} className="px-8">
            {submitMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Enviando...</> : <><Send className="w-4 h-4 mr-2" /> Enviar Respostas</>}
          </Button>
        </div>
      </div>
    </div>
  );
}
