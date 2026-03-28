import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  ClipboardCheck, Loader2, CheckCircle2, XCircle, Eye, FileText,
  Calendar, Percent, Building2, X,
} from "lucide-react";
import { toast } from "sonner";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/_core/hooks/useAuth";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; label: string }> = {
    pendente: { bg: "bg-yellow-100 text-yellow-800", label: "Pendente" },
    aprovada: { bg: "bg-green-100 text-green-800", label: "Aprovada" },
    recusada: { bg: "bg-red-100 text-red-800", label: "Recusada" },
  };
  const s = map[status] || { bg: "bg-gray-100 text-gray-800", label: status };
  return <Badge className={s.bg}>{s.label}</Badge>;
}

export default function MedicoesServico() {
  const { companyId } = useCompany();
  const { user } = useAuth();
  const [filtroStatus, setFiltroStatus] = useState("pendente");
  const [detalheMedicao, setDetalheMedicao] = useState<any>(null);
  const [recusaMedicao, setRecusaMedicao] = useState<any>(null);
  const [motivoRecusa, setMotivoRecusa] = useState("");

  const { data: medicoes, isLoading, refetch } = trpc.portalServico.listarMedicoesPendentes.useQuery(
    { companyId: companyId!, status: filtroStatus || undefined },
    { enabled: !!companyId }
  );

  const aprovarMut = trpc.portalServico.aprovarMedicao.useMutation({
    onSuccess: () => {
      toast.success("Medição aprovada com sucesso!");
      setDetalheMedicao(null);
      refetch();
    },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });

  const recusarMut = trpc.portalServico.recusarMedicao.useMutation({
    onSuccess: () => {
      toast.success("Medição recusada.");
      setRecusaMedicao(null);
      setMotivoRecusa("");
      refetch();
    },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ClipboardCheck className="h-6 w-6 text-blue-600" />
            Medições de Serviço
          </h1>
          <p className="text-sm text-gray-500 mt-1">Aprovação de medições enviadas pelos prestadores de serviço</p>
        </div>
        <div className="flex gap-2">
          {["pendente", "aprovada", "recusada", ""].map(s => (
            <Button
              key={s || "all"}
              variant={filtroStatus === s ? "default" : "outline"}
              size="sm"
              onClick={() => setFiltroStatus(s)}
            >
              {s === "" ? "Todas" : s === "pendente" ? "Pendentes" : s === "aprovada" ? "Aprovadas" : "Recusadas"}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto mb-2" />
          <p className="text-gray-500">Carregando medições...</p>
        </div>
      ) : !medicoes || medicoes.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ClipboardCheck className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">Nenhuma medição {filtroStatus ? `com status "${filtroStatus}"` : ""} encontrada.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {medicoes.map((m: any) => (
            <Card key={m.id} className="hover:shadow-md transition-shadow">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <Percent className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">
                        Medição #{m.id} — {m.mesReferencia}
                      </p>
                      <div className="flex items-center gap-3 text-sm text-gray-500 mt-1">
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3 w-3" />
                          {m.contrato?.supplierNome || "—"}
                        </span>
                        <span className="flex items-center gap-1">
                          <FileText className="h-3 w-3" />
                          {m.contrato?.itemNome || `Contrato #${m.contractId}`}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {m.enviadoEm ? new Date(m.enviadoEm).toLocaleDateString("pt-BR") : "—"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-lg font-bold text-blue-600">
                        {Number(m.percentualConcluido || 0).toFixed(1)}%
                      </p>
                      {m.valorMedido && (
                        <p className="text-sm text-gray-500">
                          R$ {Number(m.valorMedido).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </p>
                      )}
                    </div>
                    <StatusBadge status={m.status} />
                    {m.status === "pendente" && (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="bg-green-600 hover:bg-green-700"
                          disabled={aprovarMut.isPending}
                          onClick={() => aprovarMut.mutate({ medicaoId: m.id })}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-1" /> Aprovar
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => { setRecusaMedicao(m); setMotivoRecusa(""); }}
                        >
                          <XCircle className="h-4 w-4 mr-1" /> Recusar
                        </Button>
                      </div>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDetalheMedicao(m)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {m.descricao && (
                  <div className="mt-3 pt-3 border-t">
                    <p className="text-sm text-gray-600">{m.descricao}</p>
                  </div>
                )}

                {m.motivoRecusa && (
                  <div className="mt-3 p-3 bg-red-50 rounded-lg border border-red-200">
                    <p className="text-sm text-red-700">
                      <strong>Motivo da recusa:</strong> {m.motivoRecusa}
                    </p>
                    {m.aprovadorNome && (
                      <p className="text-xs text-red-600 mt-1">
                        Por {m.aprovadorNome} em {m.aprovadoEm ? new Date(m.aprovadoEm).toLocaleDateString("pt-BR") : "—"}
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {detalheMedicao && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-lg mx-4">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5 text-blue-500" />
                Detalhes da Medição #{detalheMedicao.id}
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setDetalheMedicao(null)}>
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-sm text-gray-500">Mês Referência</p>
                  <p className="font-medium">{detalheMedicao.mesReferencia}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">% Concluído</p>
                  <p className="font-medium">{Number(detalheMedicao.percentualConcluido || 0).toFixed(1)}%</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Prestador</p>
                  <p className="font-medium">{detalheMedicao.contrato?.supplierNome || "—"}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Serviço</p>
                  <p className="font-medium">{detalheMedicao.contrato?.itemNome || "—"}</p>
                </div>
                {detalheMedicao.valorMedido && (
                  <div>
                    <p className="text-sm text-gray-500">Valor Medido</p>
                    <p className="font-medium">R$ {Number(detalheMedicao.valorMedido).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
                  </div>
                )}
                <div>
                  <p className="text-sm text-gray-500">Status</p>
                  <StatusBadge status={detalheMedicao.status} />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Enviado em</p>
                  <p className="font-medium">{detalheMedicao.enviadoEm ? new Date(detalheMedicao.enviadoEm).toLocaleDateString("pt-BR") : "—"}</p>
                </div>
                {detalheMedicao.aprovadorNome && (
                  <div>
                    <p className="text-sm text-gray-500">{detalheMedicao.status === "aprovada" ? "Aprovado por" : "Recusado por"}</p>
                    <p className="font-medium">{detalheMedicao.aprovadorNome}</p>
                  </div>
                )}
              </div>
              {detalheMedicao.descricao && (
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-sm font-medium text-gray-700 mb-1">Descrição</p>
                  <p className="text-sm text-gray-600 whitespace-pre-wrap">{detalheMedicao.descricao}</p>
                </div>
              )}
              {detalheMedicao.motivoRecusa && (
                <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                  <p className="text-sm text-red-700">
                    <strong>Motivo da recusa:</strong> {detalheMedicao.motivoRecusa}
                  </p>
                </div>
              )}
              {detalheMedicao.fotosUrls && Array.isArray(detalheMedicao.fotosUrls) && detalheMedicao.fotosUrls.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">Fotos ({detalheMedicao.fotosUrls.length})</p>
                  <div className="flex gap-2 flex-wrap">
                    {detalheMedicao.fotosUrls.map((url: string, i: number) => (
                      <a key={i} href={url} target="_blank" rel="noreferrer"
                        className="text-blue-600 hover:text-blue-800 text-sm underline">
                        Foto {i + 1}
                      </a>
                    ))}
                  </div>
                </div>
              )}
              {detalheMedicao.relatorioUrl && (
                <div>
                  <a href={detalheMedicao.relatorioUrl} target="_blank" rel="noreferrer"
                    className="text-blue-600 hover:text-blue-800 text-sm underline">
                    Ver Relatório
                  </a>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {recusaMedicao && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-lg mx-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <XCircle className="h-5 w-5 text-red-500" />
                Recusar Medição #{recusaMedicao.id}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-sm">
                  <strong>Mês:</strong> {recusaMedicao.mesReferencia} ·{" "}
                  <strong>Prestador:</strong> {recusaMedicao.contrato?.supplierNome || "—"} ·{" "}
                  <strong>%:</strong> {Number(recusaMedicao.percentualConcluido || 0).toFixed(1)}%
                </p>
              </div>
              <div>
                <Label>Motivo da Recusa *</Label>
                <Textarea
                  placeholder="Descreva o motivo da recusa..."
                  value={motivoRecusa}
                  onChange={e => setMotivoRecusa(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setRecusaMedicao(null)}>
                  Cancelar
                </Button>
                <Button
                  variant="destructive"
                  disabled={!motivoRecusa || recusarMut.isPending}
                  onClick={() => recusarMut.mutate({
                    medicaoId: recusaMedicao.id,
                    motivo: motivoRecusa,
                  })}
                >
                  {recusarMut.isPending ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Recusando...</>
                  ) : "Confirmar Recusa"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
