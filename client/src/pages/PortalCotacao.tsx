import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, Package, CheckCircle2, Loader2, Send, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { TIPOS_PAGAMENTO } from "../../../shared/paymentConditions";

const TIPOS_PAGAMENTO = [
  { value: "a_vista", label: "À Vista" },
  { value: "30ddl", label: "30 DDL" },
  { value: "30_60", label: "30/60 DDL" },
  { value: "30_60_90", label: "30/60/90 DDL" },
  { value: "entrada_parcelas", label: "Entrada + Parcelas" },
  { value: "personalizado", label: "Personalizado" },
] as const;

export default function PortalCotacao() {
  const params = useParams<{ token: string }>();
  const token = params.token || "";

  const [valorUnit, setValorUnit] = useState("");
  const [valorFrete, setValorFrete] = useState("0");
  const [freteTipo, setFreteTipo] = useState("cif");
  const [transportadora, setTransportadora] = useState("");
  const [prazo, setPrazo] = useState("");
  const [condicao, setCondicao] = useState("");
  const [tipoPag, setTipoPag] = useState("");
  const [numParcelas, setNumParcelas] = useState("");
  const [obs, setObs] = useState("");
  const [enviado, setEnviado] = useState(false);

  const { data, isLoading, isError, error } = trpc.purchase.verificarTokenPortal.useQuery(
    { token },
    { enabled: !!token, retry: false }
  );

  const submeterMut = trpc.purchase.submeterPropostaPortal.useMutation({
    onSuccess: () => {
      setEnviado(true);
      toast.success("Proposta enviada com sucesso!");
    },
    onError: (e) => toast.error(`Erro ao enviar proposta: ${e.message}`),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-blue-500 mx-auto mb-4" />
          <p className="text-gray-600">Verificando token...</p>
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
            <h2 className="text-xl font-bold text-gray-900 mb-2">Link Inválido</h2>
            <p className="text-gray-500">
              {(error as any)?.message?.includes("expirado")
                ? "Este link de cotação expirou. Solicite um novo link ao comprador."
                : "O link informado é inválido ou já foi utilizado."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (enviado || data.token.respondedAt) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="pt-8 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">Proposta Enviada!</h2>
            <p className="text-gray-500">
              Sua proposta foi registrada com sucesso. O comprador irá analisá-la e entrará em contato.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { cotacao, solicitacao, itens, token: tok } = data;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg">
            <Building2 className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h1 className="font-bold text-gray-900">Portal de Cotação</h1>
            <p className="text-sm text-gray-500">FC Engenharia Civil — Cotação #{cotacao?.id}</p>
          </div>
          <Badge className="ml-auto bg-blue-100 text-blue-700">Prazo: {cotacao?.validadeAte || "—"}</Badge>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Itens Solicitados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Unidade</TableHead>
                  <TableHead>Quantidade</TableHead>
                  <TableHead>Observações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itens.length > 0 ? itens.map((item: any) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.insumoNome}</TableCell>
                    <TableCell>{item.unidade}</TableCell>
                    <TableCell>{Number(item.quantidadeAComprar || item.quantidade).toLocaleString("pt-BR")}</TableCell>
                    <TableCell className="text-gray-500">{item.observacoes || "—"}</TableCell>
                  </TableRow>
                )) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-gray-500 py-4">
                      Itens não especificados — entre em contato com o comprador.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" />
              Sua Proposta
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Valor Unitário (R$) *</Label>
                <Input type="number" step="0.01" min="0" placeholder="0,00"
                  value={valorUnit} onChange={e => setValorUnit(e.target.value)} />
              </div>
              <div>
                <Label>Tipo de Frete</Label>
                <select value={freteTipo} onChange={e => setFreteTipo(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="cif">CIF (frete incluso)</option>
                  <option value="fob">FOB (frete por conta do comprador)</option>
                </select>
              </div>
              <div>
                <Label>Valor do Frete (R$)</Label>
                <Input type="number" step="0.01" min="0" placeholder="0,00"
                  value={valorFrete} onChange={e => setValorFrete(e.target.value)} />
              </div>
              <div>
                <Label>Transportadora</Label>
                <Input placeholder="Nome da transportadora"
                  value={transportadora} onChange={e => setTransportadora(e.target.value)} />
              </div>
              <div>
                <Label>Prazo de Entrega (dias)</Label>
                <Input type="number" min="1" placeholder="Ex: 7"
                  value={prazo} onChange={e => setPrazo(e.target.value)} />
              </div>
              <div>
                <Label>Condição de Pagamento</Label>
                <select value={tipoPag} onChange={e => {
                  const val = e.target.value;
                  setTipoPag(val);
                  const info = TIPOS_PAGAMENTO.find(t => t.value === val);
                  if (info) setCondicao(info.label);
                  else setCondicao("");
                }}
                  className="w-full h-10 border border-gray-300 rounded-md px-3 bg-white text-gray-900">
                  <option value="">Selecione...</option>
                  {TIPOS_PAGAMENTO.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              {condicao === "entrada_parcelas" && (
                <div>
                  <Label>Nº de Parcelas</Label>
                  <Input type="number" min="2" max="36" placeholder="Ex: 3"
                    value={numParcelas} onChange={e => setNumParcelas(e.target.value)} />
                </div>
              )}
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea placeholder="Informações adicionais sobre a proposta..."
                value={obs} onChange={e => setObs(e.target.value)} rows={3} />
            </div>

            {valorUnit && (
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-sm text-blue-600">
                  {freteTipo === "fob" ? "Total (itens + frete FOB):" : "Total (frete CIF incluso no preço):"}
                </p>
                <p className="text-2xl font-bold text-blue-800">
                  R$ {(Number(valorUnit) + (freteTipo === "fob" ? Number(valorFrete) : 0)).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </p>
                {freteTipo === "cif" && Number(valorFrete) > 0 && (
                  <p className="text-xs text-blue-500 mt-1">Frete informado: R$ {Number(valorFrete).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} (já incluso no preço)</p>
                )}
              </div>
            )}

            <Button className="w-full bg-blue-600 hover:bg-blue-700 h-12 text-base"
              disabled={!valorUnit || submeterMut.isPending}
              onClick={() => submeterMut.mutate({
                token, valorUnitario: Number(valorUnit), valorFrete: Number(valorFrete),
                freteTipo, transportadora: transportadora || undefined,
                prazoEntregaDias: prazo ? parseInt(prazo) : undefined,
                condicaoPagamento: condicao, tipoPagamento: tipoPag || undefined,
                numeroParcelas: numParcelas ? parseInt(numParcelas) : undefined,
                observacoes: obs,
              })}>
              {submeterMut.isPending ? (
                <><Loader2 className="h-5 w-5 animate-spin mr-2" />Enviando...</>
              ) : (
                <><Send className="h-5 w-5 mr-2" />Enviar Proposta</>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
