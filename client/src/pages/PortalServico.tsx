import { useState } from "react";
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Building2, CheckCircle2, Loader2, AlertCircle, FileText,
  Upload, ClipboardList, History, Calendar, DollarSign, Percent,
} from "lucide-react";
import { toast } from "sonner";

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pendente: "bg-yellow-100 text-yellow-800",
    aprovada: "bg-green-100 text-green-800",
    recusada: "bg-red-100 text-red-800",
  };
  const labels: Record<string, string> = {
    pendente: "Pendente",
    aprovada: "Aprovada",
    recusada: "Recusada",
  };
  return (
    <Badge className={colors[status] || "bg-gray-100 text-gray-800"}>
      {labels[status] || status}
    </Badge>
  );
}

export default function PortalServico() {
  const params = useParams<{ token: string }>();
  const token = params.token || "";
  const [activeTab, setActiveTab] = useState("contrato");

  const { data, isLoading, isError, error, refetch } = trpc.portalServico.verificarTokenServico.useQuery(
    { token },
    { enabled: !!token, retry: false }
  );

  const confirmarMut = trpc.portalServico.confirmarRecebimentoContrato.useMutation({
    onSuccess: () => { toast.success("Contrato confirmado com sucesso!"); refetch(); },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-blue-500 mx-auto mb-4" />
          <p className="text-gray-600">Verificando acesso...</p>
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="pt-8 text-center">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">Acesso Negado</h2>
            <p className="text-gray-500">
              {(error as any)?.message?.includes("expirado")
                ? "Este link expirou. Solicite um novo link à empresa."
                : "O link informado é inválido."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { contrato, medicoes, documentos } = data;
  const isConfirmed = contrato.contratoConfirmado === 1 || data.token.confirmedAt;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg">
            <Building2 className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h1 className="font-bold text-gray-900">Portal do Prestador de Serviço</h1>
            <p className="text-sm text-gray-500">FC Engenharia Civil — Contrato #{contrato.id}</p>
          </div>
          <Badge className="ml-auto bg-blue-100 text-blue-700">
            {contrato.status === "ativo" ? "Ativo" : contrato.status}
          </Badge>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-4 w-full mb-6">
            <TabsTrigger value="contrato" className="gap-1">
              <FileText className="h-4 w-4" /> Contrato
            </TabsTrigger>
            <TabsTrigger value="medicoes" className="gap-1">
              <ClipboardList className="h-4 w-4" /> Medições
            </TabsTrigger>
            <TabsTrigger value="documentos" className="gap-1">
              <Upload className="h-4 w-4" /> Documentos
            </TabsTrigger>
            <TabsTrigger value="historico" className="gap-1">
              <History className="h-4 w-4" /> Histórico
            </TabsTrigger>
          </TabsList>

          <TabsContent value="contrato">
            <ContratoTab
              contrato={contrato}
              isConfirmed={!!isConfirmed}
              onConfirm={() => confirmarMut.mutate({ token })}
              isPending={confirmarMut.isPending}
            />
          </TabsContent>

          <TabsContent value="medicoes">
            <MedicoesTab
              token={token}
              medicoes={medicoes}
              contrato={contrato}
              refetch={refetch}
            />
          </TabsContent>

          <TabsContent value="documentos">
            <DocumentosTab
              token={token}
              documentos={documentos}
              refetch={refetch}
            />
          </TabsContent>

          <TabsContent value="historico">
            <HistoricoTab token={token} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function ContratoTab({ contrato, isConfirmed, onConfirm, isPending }: {
  contrato: any; isConfirmed: boolean; onConfirm: () => void; isPending: boolean;
}) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" /> Dados do Contrato
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div>
                <p className="text-sm text-gray-500">Prestador</p>
                <p className="font-medium">{contrato.supplierNome || "—"}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Serviço</p>
                <p className="font-medium">{contrato.itemNome || "—"}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Obra</p>
                <p className="font-medium">{contrato.obraNome || "—"}</p>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">Período</p>
                  <p className="font-medium">
                    {contrato.dataInicio ? new Date(contrato.dataInicio).toLocaleDateString("pt-BR") : "—"} até{" "}
                    {contrato.dataFim ? new Date(contrato.dataFim).toLocaleDateString("pt-BR") : "—"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">Valor</p>
                  <p className="font-medium text-lg">
                    R$ {Number(contrato.valorTotal || contrato.valorUnitario || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
              <div>
                <p className="text-sm text-gray-500">Condição de Pagamento</p>
                <p className="font-medium">{contrato.condicaoPagamento || "—"}</p>
              </div>
            </div>
          </div>

          {contrato.escopo && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg">
              <p className="text-sm font-medium text-gray-700 mb-1">Escopo do Serviço</p>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{contrato.escopo}</p>
            </div>
          )}

          {contrato.observacoes && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg">
              <p className="text-sm font-medium text-gray-700 mb-1">Observações</p>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{contrato.observacoes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          {isConfirmed ? (
            <div className="flex items-center gap-3 p-4 bg-green-50 rounded-lg border border-green-200">
              <CheckCircle2 className="h-8 w-8 text-green-600 flex-shrink-0" />
              <div>
                <p className="font-medium text-green-800">Contrato Confirmado</p>
                <p className="text-sm text-green-600">
                  Você já confirmou o recebimento e aceite deste contrato.
                  {contrato.confirmadoEm && (
                    <> Data: {new Date(contrato.confirmadoEm).toLocaleDateString("pt-BR")}</>
                  )}
                </p>
              </div>
            </div>
          ) : (
            <div className="text-center space-y-4">
              <p className="text-gray-600">
                Ao clicar no botão abaixo, você confirma que recebeu e aceita os termos deste contrato de serviço.
              </p>
              <Button
                className="bg-green-600 hover:bg-green-700 h-12 px-8 text-base"
                onClick={onConfirm}
                disabled={isPending}
              >
                {isPending ? (
                  <><Loader2 className="h-5 w-5 animate-spin mr-2" /> Confirmando...</>
                ) : (
                  <><CheckCircle2 className="h-5 w-5 mr-2" /> Confirmar Recebimento do Contrato</>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MedicoesTab({ token, medicoes, contrato, refetch }: {
  token: string; medicoes: any[]; contrato: any; refetch: () => void;
}) {
  const [mesRef, setMesRef] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [pctConcluido, setPctConcluido] = useState("");
  const [valorMedido, setValorMedido] = useState("");
  const [descricao, setDescricao] = useState("");
  const [showForm, setShowForm] = useState(false);

  const enviarMut = trpc.portalServico.enviarMedicao.useMutation({
    onSuccess: () => {
      toast.success("Medição enviada com sucesso!");
      setShowForm(false);
      setPctConcluido("");
      setValorMedido("");
      setDescricao("");
      refetch();
    },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" /> Medições Mensais
          </CardTitle>
          {!showForm && (
            <Button onClick={() => setShowForm(true)} size="sm">
              Nova Medição
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {showForm && (
            <div className="space-y-4 p-4 bg-blue-50 rounded-lg border border-blue-200 mb-4">
              <h4 className="font-medium text-blue-800">Registrar Nova Medição</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Mês de Referência</Label>
                  <Input type="month" value={mesRef} onChange={e => setMesRef(e.target.value)} />
                </div>
                <div>
                  <Label>% Concluído</Label>
                  <Input
                    type="number" min="0" max="100" step="0.01" placeholder="Ex: 25"
                    value={pctConcluido} onChange={e => setPctConcluido(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Valor Medido (R$)</Label>
                  <Input
                    type="number" step="0.01" min="0" placeholder="0,00"
                    value={valorMedido} onChange={e => setValorMedido(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <Label>Descrição / Detalhamento</Label>
                <Textarea
                  placeholder="Descreva o que foi executado neste período..."
                  value={descricao} onChange={e => setDescricao(e.target.value)} rows={3}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  className="bg-blue-600 hover:bg-blue-700"
                  disabled={!pctConcluido || enviarMut.isPending}
                  onClick={() => enviarMut.mutate({
                    token,
                    mesReferencia: mesRef,
                    percentualConcluido: Number(pctConcluido),
                    valorMedido: valorMedido ? Number(valorMedido) : undefined,
                    descricao: descricao || undefined,
                  })}
                >
                  {enviarMut.isPending ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Enviando...</>
                  ) : "Enviar Medição"}
                </Button>
                <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
              </div>
            </div>
          )}

          {medicoes.length === 0 ? (
            <p className="text-center text-gray-500 py-8">Nenhuma medição registrada ainda.</p>
          ) : (
            <div className="space-y-3">
              {medicoes.map((m: any) => (
                <div key={m.id} className="p-4 border rounded-lg hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-100 rounded-lg">
                        <Percent className="h-4 w-4 text-blue-600" />
                      </div>
                      <div>
                        <p className="font-medium">
                          {m.mesReferencia} — {Number(m.percentualConcluido || 0).toFixed(1)}% concluído
                        </p>
                        {m.valorMedido && (
                          <p className="text-sm text-gray-500">
                            Valor: R$ {Number(m.valorMedido).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </p>
                        )}
                        {m.descricao && <p className="text-sm text-gray-500 mt-1">{m.descricao}</p>}
                      </div>
                    </div>
                    <div className="text-right">
                      <StatusBadge status={m.status} />
                      {m.motivoRecusa && (
                        <p className="text-xs text-red-600 mt-1">Motivo: {m.motivoRecusa}</p>
                      )}
                      <p className="text-xs text-gray-400 mt-1">
                        {m.enviadoEm ? new Date(m.enviadoEm).toLocaleDateString("pt-BR") : "—"}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DocumentosTab({ token, documentos, refetch }: {
  token: string; documentos: any[]; refetch: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [tipo, setTipo] = useState("");
  const [nome, setNome] = useState("");
  const [dataValidade, setDataValidade] = useState("");
  const [obs, setObs] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);

  const enviarMut = trpc.portalServico.enviarDocumento.useMutation({
    onSuccess: () => {
      toast.success("Documento enviado com sucesso!");
      setShowForm(false);
      setTipo("");
      setNome("");
      setDataValidade("");
      setObs("");
      setArquivo(null);
      refetch();
    },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });

  const handleSubmit = async () => {
    if (!arquivo || !tipo || !nome) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      enviarMut.mutate({
        token,
        tipo,
        nome,
        arquivoBase64: base64,
        arquivoTipo: arquivo.type,
        dataValidade: dataValidade || undefined,
        observacoes: obs || undefined,
      });
    };
    reader.readAsDataURL(arquivo);
  };

  const tiposDoc = [
    "ART", "RRT", "Seguro", "Certidão Negativa", "Comprovante de Pagamento",
    "Atestado", "Laudo Técnico", "Alvará", "Outro",
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" /> Documentação
          </CardTitle>
          {!showForm && (
            <Button onClick={() => setShowForm(true)} size="sm">
              Enviar Documento
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {showForm && (
            <div className="space-y-4 p-4 bg-blue-50 rounded-lg border border-blue-200 mb-4">
              <h4 className="font-medium text-blue-800">Enviar Documento</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Tipo de Documento *</Label>
                  <select
                    className="w-full h-10 border border-gray-300 rounded-md px-3 bg-white text-gray-900"
                    value={tipo} onChange={e => setTipo(e.target.value)}
                  >
                    <option value="">Selecione...</option>
                    {tiposDoc.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <Label>Nome do Documento *</Label>
                  <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: ART da obra XYZ" />
                </div>
                <div>
                  <Label>Data de Validade</Label>
                  <Input type="date" value={dataValidade} onChange={e => setDataValidade(e.target.value)} />
                </div>
                <div>
                  <Label>Arquivo *</Label>
                  <Input type="file" onChange={e => setArquivo(e.target.files?.[0] || null)} />
                </div>
              </div>
              <div>
                <Label>Observações</Label>
                <Textarea
                  placeholder="Informações adicionais..."
                  value={obs} onChange={e => setObs(e.target.value)} rows={2}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  className="bg-blue-600 hover:bg-blue-700"
                  disabled={!tipo || !nome || !arquivo || enviarMut.isPending}
                  onClick={handleSubmit}
                >
                  {enviarMut.isPending ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Enviando...</>
                  ) : "Enviar Documento"}
                </Button>
                <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
              </div>
            </div>
          )}

          {documentos.length === 0 ? (
            <p className="text-center text-gray-500 py-8">Nenhum documento enviado ainda.</p>
          ) : (
            <div className="space-y-3">
              {documentos.map((d: any) => (
                <div key={d.id} className="p-4 border rounded-lg hover:bg-gray-50 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <FileText className="h-4 w-4 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-medium">{d.nome}</p>
                      <p className="text-sm text-gray-500">
                        {d.tipo}
                        {d.dataValidade && <> · Validade: {new Date(d.dataValidade).toLocaleDateString("pt-BR")}</>}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    {d.arquivoUrl && (
                      <a href={d.arquivoUrl} target="_blank" rel="noreferrer"
                        className="text-blue-600 hover:text-blue-800 text-sm underline">
                        Visualizar
                      </a>
                    )}
                    <p className="text-xs text-gray-400 mt-1">
                      {d.createdAt ? new Date(d.createdAt).toLocaleDateString("pt-BR") : "—"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function HistoricoTab({ token }: { token: string }) {
  const { data, isLoading } = trpc.portalServico.historicoContratos.useQuery(
    { token },
    { enabled: !!token }
  );

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto mb-2" />
        <p className="text-gray-500">Carregando histórico...</p>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5" /> Histórico de Contratos
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!data || data.length === 0 ? (
          <p className="text-center text-gray-500 py-8">Nenhum contrato anterior encontrado.</p>
        ) : (
          <div className="space-y-4">
            {data.map((c: any) => (
              <div key={c.id} className="p-4 border rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="font-medium">{c.itemNome || `Contrato #${c.id}`}</p>
                    <p className="text-sm text-gray-500">
                      {c.obraNome && `${c.obraNome} · `}
                      {c.dataInicio ? new Date(c.dataInicio).toLocaleDateString("pt-BR") : "—"} a{" "}
                      {c.dataFim ? new Date(c.dataFim).toLocaleDateString("pt-BR") : "—"}
                    </p>
                  </div>
                  <div className="text-right">
                    <Badge className={c.status === "ativo" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}>
                      {c.status}
                    </Badge>
                    <p className="text-sm font-medium mt-1">
                      R$ {Number(c.valorTotal || c.valorUnitario || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>

                {c.medicoes && c.medicoes.length > 0 && (
                  <div className="mt-3 pt-3 border-t">
                    <p className="text-sm font-medium text-gray-700 mb-2">
                      Medições ({c.medicoes.length})
                    </p>
                    <div className="space-y-1">
                      {c.medicoes.map((m: any) => (
                        <div key={m.id} className="flex items-center justify-between text-sm">
                          <span className="text-gray-600">
                            {m.mesReferencia} — {Number(m.percentualConcluido || 0).toFixed(1)}%
                          </span>
                          <div className="flex items-center gap-2">
                            {m.valorMedido && (
                              <span className="text-gray-500">
                                R$ {Number(m.valorMedido).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                              </span>
                            )}
                            <StatusBadge status={m.status} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
