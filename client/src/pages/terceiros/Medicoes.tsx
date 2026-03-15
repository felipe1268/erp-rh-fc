import { useState } from "react";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle, XCircle, ClipboardCheck, Zap, ChevronRight } from "lucide-react";
import { toast } from "sonner";

const BRL = (v: any) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v) || 0);
const fmtDate = (d: string | null | undefined) => {
  if (!d) return "—";
  const [y, m, day] = d.slice(0, 10).split("-");
  return `${day}/${m}/${y}`;
};

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  rascunho:            { label: "Rascunho",            cls: "bg-gray-100 text-gray-600 border-gray-200" },
  aguardando_aprovacao:{ label: "Aguard. Aprovação",   cls: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  aprovada:            { label: "Aprovada",             cls: "bg-green-100 text-green-800 border-green-200" },
  paga:                { label: "Paga",                 cls: "bg-blue-100 text-blue-800 border-blue-200" },
  rejeitada:           { label: "Rejeitada",            cls: "bg-red-100 text-red-800 border-red-200" },
};

export default function Medicoes() {
  const [, navigate] = useLocation();
  const { companyId } = useCompany();
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [motivoRejeicao, setMotivoRejeicao] = useState("");
  const [rejeitandoId, setRejeitandoId] = useState<number | null>(null);

  const utils = trpc.useUtils();
  const { data: medicoes = [], isLoading } = trpc.terceiroContratos.listarMedicoes.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );

  const aprovarMut = trpc.terceiroContratos.aprovarMedicao.useMutation({
    onSuccess: () => { toast.success("Medição aprovada!"); utils.terceiroContratos.listarMedicoes.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const rejeitarMut = trpc.terceiroContratos.rejeitarMedicao.useMutation({
    onSuccess: () => { toast.success("Medição rejeitada"); setRejeitandoId(null); setMotivoRejeicao(""); utils.terceiroContratos.listarMedicoes.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const filtradas = filtroStatus === "todos" ? medicoes : medicoes.filter(m => m.status === filtroStatus);
  const aguardando = medicoes.filter(m => m.status === "aguardando_aprovacao").length;

  return (
    <DashboardLayout>
      <div className="p-5 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Medições de Terceiros</h1>
            <p className="text-sm text-gray-500">Controle e aprovação de medições por avanço físico</p>
          </div>
          {aguardando > 0 && (
            <Badge className="bg-yellow-100 text-yellow-800 border border-yellow-300 text-sm px-3 py-1">
              {aguardando} aguardando aprovação
            </Badge>
          )}
        </div>

        <div className="flex gap-3">
          <Select value={filtroStatus} onValueChange={setFiltroStatus}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os Status</SelectItem>
              <SelectItem value="aguardando_aprovacao">Aguardando Aprovação</SelectItem>
              <SelectItem value="aprovada">Aprovadas</SelectItem>
              <SelectItem value="paga">Pagas</SelectItem>
              <SelectItem value="rejeitada">Rejeitadas</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-gray-400">Carregando...</div>
        ) : filtradas.length === 0 ? (
          <div className="py-12 text-center text-gray-400">
            <ClipboardCheck className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Nenhuma medição encontrada</p>
            <p className="text-sm">As medições são geradas a partir dos contratos de terceiros</p>
            <Button variant="outline" className="mt-4" onClick={() => navigate("/terceiros/contratos")}>
              Ver Contratos
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {filtradas.map(m => {
              const st = STATUS_MAP[m.status || "rascunho"] || STATUS_MAP.rascunho;
              return (
                <div key={m.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-gray-900">Medição #{m.numero}</span>
                        <Badge className={`text-xs border ${st.cls}`}>{st.label}</Badge>
                        {m.geradoAutomaticamente && (
                          <Badge className="text-xs border bg-purple-100 text-purple-700 border-purple-200">
                            <Zap className="w-3 h-3 mr-1" />Auto
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-gray-600">
                        Período: <strong>{m.periodo}</strong> • Ref: {fmtDate(m.dataReferencia)}
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        Valor medido: <strong className="text-gray-700">{BRL(m.valorMedido)}</strong> •
                        Acumulado: <strong className="text-gray-700">{BRL(m.valorAcumulado)}</strong> •
                        {Number(m.percentualGlobal).toFixed(1)}% global
                      </div>
                      {m.motivoRejeicao && (
                        <p className="text-xs text-red-500 mt-1 bg-red-50 px-2 py-1 rounded">
                          Motivo rejeição: {m.motivoRejeicao}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button onClick={() => navigate(`/terceiros/contratos/${m.contratoId}`)} className="p-1.5 hover:bg-gray-100 rounded text-gray-400">
                        <ChevronRight className="w-4 h-4" />
                      </button>
                      {m.status === "aguardando_aprovacao" && (
                        <>
                          <Button size="sm" className="gap-1 bg-green-600 hover:bg-green-700 text-xs"
                            onClick={() => aprovarMut.mutate({ id: m.id, aprovadoPor: "Responsável" })}
                            disabled={aprovarMut.isPending}>
                            <CheckCircle className="w-3 h-3" /> Aprovar
                          </Button>
                          <Button size="sm" variant="outline" className="gap-1 text-xs text-red-600 border-red-200 hover:bg-red-50"
                            onClick={() => setRejeitandoId(m.id)}>
                            <XCircle className="w-3 h-3" /> Rejeitar
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Modal inline de rejeição */}
                  {rejeitandoId === m.id && (
                    <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                      <textarea
                        className="w-full border border-gray-200 rounded-lg p-2 text-sm resize-none"
                        rows={2}
                        placeholder="Informe o motivo da rejeição..."
                        value={motivoRejeicao}
                        onChange={e => setMotivoRejeicao(e.target.value)}
                      />
                      <div className="flex gap-2 justify-end">
                        <Button size="sm" variant="outline" onClick={() => setRejeitandoId(null)}>Cancelar</Button>
                        <Button size="sm" className="bg-red-600 hover:bg-red-700 text-xs"
                          disabled={!motivoRejeicao.trim() || rejeitarMut.isPending}
                          onClick={() => rejeitarMut.mutate({ id: m.id, motivo: motivoRejeicao })}>
                          Confirmar Rejeição
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
