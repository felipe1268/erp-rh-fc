import { useState, useMemo } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useCompany } from "@/contexts/CompanyContext";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { CreditCard, CheckCircle, Clock, Upload, FileText, Store } from "lucide-react";

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

export default function PagamentosParceiros() {
  const { user } = useAuth();
  const { selectedCompanyId: selCompId } = useCompany();
  const companyId = selCompId ? parseInt(selCompId) : undefined;
  const now = new Date();
  const [ano, setAno] = useState(now.getFullYear());
  const [mes, setMes] = useState(now.getMonth() + 1);
  const competencia = `${ano}-${String(mes).padStart(2, "0")}`;

  const { data: pagamentos = [], refetch } = trpc.parceiros.pagamentos.list.useQuery(
    { companyId: companyId ?? 0 },
    { enabled: !!companyId }
  );
  const { data: parceiros = [] } = trpc.parceiros.cadastro.list.useQuery(
    { companyId: companyId ?? 0 },
    { enabled: !!companyId }
  );
  const confirmMut = trpc.parceiros.pagamentos.registrarPagamento.useMutation({ onSuccess: () => { refetch(); toast.success("Pagamento confirmado!"); } });

  const getParceiroNome = (id: number) => {
    const p = parceiros.find((p: any) => p.id === id);
    return p ? (p as any).nomeFantasia || (p as any).razaoSocial : "—";
  };

  const getParceiroInfo = (id: number) => {
    return parceiros.find((p: any) => p.id === id) as any;
  };



  return (
    <DashboardLayout>
      <div className="w-full max-w-7xl mx-auto px-4 py-6 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-amber-500 flex items-center justify-center">
            <CreditCard className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Pagamentos a Parceiros</h1>
            <p className="text-sm text-muted-foreground">{MESES[mes - 1]}/{ano}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <Select value={String(mes)} onValueChange={(v) => setMes(parseInt(v))}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>{MESES.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={String(ano)} onValueChange={(v) => setAno(parseInt(v))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>{[2024, 2025, 2026, 2027].map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        {/* List */}
        <div className="space-y-4">
          {pagamentos.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CreditCard className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Nenhum pagamento registrado para este mês</p>
              <p className="text-xs mt-1">Os pagamentos são gerados automaticamente ao aprovar lançamentos</p>
            </div>
          ) : (
            pagamentos.map((pag: any) => {
              const parceiro = getParceiroInfo(pag.parceiroConveniadoId);
              return (
                <div key={pag.id} className="bg-card rounded-xl border p-5">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Store className="h-4 w-4 text-purple-500" />
                        <h3 className="font-semibold">{getParceiroNome(pag.parceiroConveniadoId)}</h3>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${pag.statusPagamento === "pago" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                          {pag.statusPagamento === "pago" ? "Pago" : "Pendente"}
                        </span>
                      </div>
                      <div className="mt-2 space-y-1 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">Valor:</span>
                          <span className="font-bold text-lg text-emerald-600">R$ {parseFloat(pag.valorTotal || "0").toFixed(2)}</span>
                        </div>
                        {parceiro && (
                          <div className="text-xs text-muted-foreground space-y-0.5">
                            {parceiro.formaPagamento && <p>Forma: <strong>{parceiro.formaPagamento.toUpperCase()}</strong></p>}
                            {parceiro.formaPagamento === "pix" && parceiro.pixChave && <p>Chave PIX: <strong>{parceiro.pixChave}</strong> ({parceiro.pixTipoChave})</p>}
                            {parceiro.banco && <p>Banco: {parceiro.banco} | Ag: {parceiro.agencia} | CC: {parceiro.conta}</p>}
                          </div>
                        )}
                        {pag.dataPagamento && <p className="text-xs text-muted-foreground">Pago em: {new Date(pag.dataPagamento).toLocaleDateString("pt-BR")}</p>}
                        {pag.pagoPor && <p className="text-xs text-muted-foreground">Por: {pag.pagoPor}</p>}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      {pag.comprovanteUrl && (
                        <a href={pag.comprovanteUrl} target="_blank" rel="noreferrer">
                          <Button size="sm" variant="outline" className="w-full"><FileText className="h-3.5 w-3.5 mr-1" /> Ver Comprovante</Button>
                        </a>
                      )}

                      {pag.statusPagamento !== "pago" && (
                        <Button size="sm" className="bg-emerald-500 hover:bg-emerald-600 text-white w-full" onClick={() => confirmMut.mutate({ id: pag.id, dataPagamento: new Date().toISOString().split("T")[0] })}>
                          <CheckCircle className="h-3.5 w-3.5 mr-1" /> Confirmar Pagamento
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
