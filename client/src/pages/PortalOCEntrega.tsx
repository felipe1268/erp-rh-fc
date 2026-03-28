import { useState } from "react";
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, Truck, Package, CheckCircle2, Send } from "lucide-react";
import { toast } from "sonner";

export default function PortalOCEntrega() {
  const params = useParams<{ token: string }>();
  const token = params.token || "";

  const [transportadora, setTransportadora] = useState("");
  const [codigoRastreamento, setCodigoRastreamento] = useState("");
  const [salvo, setSalvo] = useState(false);

  const { data: oc, isLoading, isError } = trpc.purchase.verificarTokenOCPortal.useQuery(
    { token },
    { enabled: !!token, retry: false,
      onSuccess: (d: any) => {
        if (d.transportadora) setTransportadora(d.transportadora);
        if (d.codigoRastreamento) setCodigoRastreamento(d.codigoRastreamento);
      },
    }
  );

  const atualizarMut = trpc.purchase.atualizarEntregaPortalOC.useMutation({
    onSuccess: () => { toast.success("Dados de entrega atualizados!"); setSalvo(true); },
    onError: () => toast.error("Erro ao atualizar dados de entrega"),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (isError || !oc) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <Package className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">Link inválido</h2>
            <p className="text-gray-500">Este link de entrega não é válido ou a ordem não foi encontrada.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-4">
        <div className="text-center">
          <div className="inline-flex p-3 rounded-2xl bg-blue-100 mb-3">
            <Truck className="h-8 w-8 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Portal de Entrega</h1>
          <p className="text-sm text-gray-500">Informe os dados de transporte da Ordem de Compra</p>
        </div>

        <Card className="border-gray-200 shadow-lg">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg text-gray-900">OC #{oc.numero}</CardTitle>
            <div className="text-sm text-gray-500 space-y-1">
              <p>Fornecedor: <span className="font-medium text-gray-700">{oc.supplierNome}</span></p>
              {oc.obraNome && <p>Obra: <span className="font-medium text-gray-700">{oc.obraNome}</span></p>}
              <p>Valor Total: <span className="font-medium text-gray-700">
                {parseFloat(oc.valorTotal || "0").toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </span></p>
              {oc.prazoEntrega && <p>Prazo: <span className="font-medium text-gray-700">{new Date(oc.prazoEntrega + "T00:00:00").toLocaleDateString("pt-BR")}</span></p>}
              <p>Frete: <span className={`font-semibold ${oc.freteTipo === "fob" ? "text-orange-600" : "text-blue-600"}`}>
                {(oc.freteTipo ?? "cif").toUpperCase()}
              </span>
              {parseFloat(oc.valorFrete || "0") > 0 && (
                <span className="text-gray-500 ml-1">
                  ({parseFloat(oc.valorFrete).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })})
                </span>
              )}
              </p>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {salvo ? (
              <div className="text-center py-6">
                <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-3" />
                <h3 className="text-lg font-semibold text-green-700">Dados atualizados!</h3>
                <p className="text-sm text-gray-500 mt-1">As informações de entrega foram registradas com sucesso.</p>
              </div>
            ) : (
              <>
                <div>
                  <Label>Transportadora</Label>
                  <Input placeholder="Nome da transportadora ou veículo próprio"
                    value={transportadora} onChange={e => setTransportadora(e.target.value)} />
                </div>
                <div>
                  <Label>Código de Rastreamento</Label>
                  <Input placeholder="Código de rastreio da entrega" className="font-mono"
                    value={codigoRastreamento} onChange={e => setCodigoRastreamento(e.target.value)} />
                </div>

                <Button className="w-full bg-blue-600 hover:bg-blue-700 h-12 text-base"
                  disabled={(!transportadora && !codigoRastreamento) || atualizarMut.isPending}
                  onClick={() => atualizarMut.mutate({
                    token,
                    transportadora: transportadora || undefined,
                    codigoRastreamento: codigoRastreamento || undefined,
                  })}>
                  {atualizarMut.isPending ? (
                    <><Loader2 className="h-5 w-5 animate-spin mr-2" />Salvando...</>
                  ) : (
                    <><Send className="h-5 w-5 mr-2" />Enviar Dados de Entrega</>
                  )}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
