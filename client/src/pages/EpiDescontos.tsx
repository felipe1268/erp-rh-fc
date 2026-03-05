import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  AlertTriangle, CheckCircle2, XCircle, Search, DollarSign,
  Clock, User, FileText, Loader2, Ban, Filter, ChevronDown, ChevronUp,
  ShieldAlert, Package
} from "lucide-react";

interface EpiDescontosProps {
  companyId: number;
}

const MOTIVO_LABELS: Record<string, string> = {
  mau_uso: "Mau Uso / Dano",
  perda: "Perda",
  furto: "Furto / Extravio",
};

export default function EpiDescontos({ companyId }: EpiDescontosProps) {
  const [filtroStatus, setFiltroStatus] = useState<string>("pendente");
  const [filtroSearch, setFiltroSearch] = useState("");
  const [showJustificativa, setShowJustificativa] = useState<number | null>(null);
  const [justificativaText, setJustificativaText] = useState("");
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  // Queries
  const descontosQ = trpc.epis.listDiscounts.useQuery(
    { companyId, status: filtroStatus === "todos" ? undefined : filtroStatus as any },
    { enabled: companyId > 0 }
  );

  const pendingCountQ = trpc.epis.pendingDiscountsCount.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );

  // Mutation
  const validateMut = trpc.epis.validateDiscount.useMutation({
    onSuccess: () => {
      toast.success("Desconto atualizado com sucesso!");
      descontosQ.refetch();
      pendingCountQ.refetch();
      setShowJustificativa(null);
      setJustificativaText("");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const descontos = descontosQ.data || [];

  // Filtro por busca
  const filtered = useMemo(() => {
    if (!filtroSearch.trim()) return descontos;
    const term = filtroSearch.toLowerCase();
    return descontos.filter((d: any) =>
      (d.nomeFunc || "").toLowerCase().includes(term) ||
      (d.epiNome || "").toLowerCase().includes(term) ||
      (d.mesReferencia || "").includes(term)
    );
  }, [descontos, filtroSearch]);

  // Totais
  const totais = useMemo(() => {
    const pendentes = descontos.filter((d: any) => d.status === "pendente");
    const confirmados = descontos.filter((d: any) => d.status === "confirmado");
    const cancelados = descontos.filter((d: any) => d.status === "cancelado");
    return {
      pendentes: pendentes.length,
      valorPendente: pendentes.reduce((s: number, d: any) => s + parseFloat(d.valorTotal || "0"), 0),
      confirmados: confirmados.length,
      valorConfirmado: confirmados.reduce((s: number, d: any) => s + parseFloat(d.valorTotal || "0"), 0),
      cancelados: cancelados.length,
      valorCancelado: cancelados.reduce((s: number, d: any) => s + parseFloat(d.valorTotal || "0"), 0),
    };
  }, [descontos]);

  const handleConfirmar = (id: number) => {
    if (confirm("Confirmar desconto na folha de pagamento do colaborador?")) {
      validateMut.mutate({ id, acao: "confirmado" });
    }
  };

  const handleCancelar = (id: number) => {
    setShowJustificativa(id);
    setJustificativaText("");
  };

  const submitCancelamento = (id: number) => {
    if (!justificativaText.trim()) {
      toast.error("Justificativa obrigatória para cancelar o desconto.");
      return;
    }
    validateMut.mutate({ id, acao: "cancelado", justificativa: justificativaText.trim() });
  };

  if (companyId <= 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <Ban className="w-12 h-12 mx-auto mb-3 text-gray-300" />
        <p>Selecione uma empresa para ver os descontos de EPI.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header com resumo */}
      <div className="rounded-xl border-2 border-red-100 overflow-hidden">
        <div className="px-4 sm:px-6 py-4 bg-gradient-to-r from-red-50 to-amber-50">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full flex items-center justify-center bg-red-100 shrink-0">
                <DollarSign className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Descontos de EPI — Aprovação DP</h2>
                <p className="text-sm text-gray-600">
                  Gerencie descontos por mau uso, perda ou furto de EPIs. O DP deve validar ou cancelar cada desconto antes de fechar a folha.
                </p>
              </div>
            </div>
            {pendingCountQ.data && pendingCountQ.data.count > 0 && (
              <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-100 border border-amber-300">
                <ShieldAlert className="w-5 h-5 text-amber-700" />
                <span className="text-sm font-bold text-amber-800">
                  {pendingCountQ.data.count} pendente{pendingCountQ.data.count > 1 ? "s" : ""}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Cards de resumo */}
        <div className="grid grid-cols-3 gap-0 border-t">
          <div className="p-4 text-center border-r bg-amber-50/50">
            <div className="text-2xl font-black text-amber-700">{totais.pendentes}</div>
            <div className="text-xs font-medium text-amber-600">Pendentes</div>
            <div className="text-xs text-amber-500 mt-1">
              {totais.valorPendente.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </div>
          </div>
          <div className="p-4 text-center border-r bg-green-50/50">
            <div className="text-2xl font-black text-green-700">{totais.confirmados}</div>
            <div className="text-xs font-medium text-green-600">Confirmados</div>
            <div className="text-xs text-green-500 mt-1">
              {totais.valorConfirmado.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </div>
          </div>
          <div className="p-4 text-center bg-gray-50/50">
            <div className="text-2xl font-black text-gray-500">{totais.cancelados}</div>
            <div className="text-xs font-medium text-gray-500">Cancelados</div>
            <div className="text-xs text-gray-400 mt-1">
              {totais.valorCancelado.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </div>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            value={filtroSearch}
            onChange={(e) => setFiltroSearch(e.target.value)}
            placeholder="Buscar por funcionário, EPI ou mês..."
            className="pl-9"
          />
        </div>
        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <Filter className="w-4 h-4 mr-1" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os Status</SelectItem>
            <SelectItem value="pendente">Pendentes</SelectItem>
            <SelectItem value="confirmado">Confirmados</SelectItem>
            <SelectItem value="cancelado">Cancelados</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Alerta para DP */}
      {totais.pendentes > 0 && filtroStatus !== "confirmado" && filtroStatus !== "cancelado" && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-amber-800">
              Atenção — {totais.pendentes} desconto{totais.pendentes > 1 ? "s" : ""} pendente{totais.pendentes > 1 ? "s" : ""} de validação
            </p>
            <p className="text-xs text-amber-700 mt-1">
              Estes descontos foram gerados automaticamente quando EPIs foram entregues por motivo de mau uso, perda ou furto.
              O Departamento Pessoal deve <strong>confirmar</strong> ou <strong>cancelar</strong> cada desconto antes de fechar a folha de pagamento do mês.
              Descontos confirmados serão incluídos na folha do colaborador conforme Art. 462, §1º da CLT.
            </p>
          </div>
        </div>
      )}

      {/* Tabela de descontos */}
      {descontosQ.isLoading ? (
        <div className="text-center py-12 text-gray-400">
          <Loader2 className="w-8 h-8 mx-auto animate-spin mb-3" />
          <p>Carregando descontos...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Package className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="font-medium">Nenhum desconto encontrado</p>
          <p className="text-sm mt-1">
            {filtroStatus === "pendente"
              ? "Não há descontos pendentes de validação."
              : "Nenhum registro para o filtro selecionado."}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Funcionário</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">EPI</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Motivo</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-700">Qtd</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-700">Valor Unit.</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-700">Total</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-700">Mês Ref.</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-700">Status</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-700">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d: any) => {
                  const isPendente = d.status === "pendente";
                  const isCancelado = d.status === "cancelado";
                  return (
                    <>
                      <tr
                        key={d.id}
                        className={`border-b last:border-0 hover:bg-muted/30 cursor-pointer ${
                          isPendente ? "bg-amber-50/40" : isCancelado ? "bg-gray-50/50 opacity-60" : ""
                        }`}
                        onClick={() => setExpandedRow(expandedRow === d.id ? null : d.id)}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-gray-400 shrink-0" />
                            <div>
                              <div className="font-medium text-gray-800 text-xs">{d.nomeFunc || "—"}</div>
                              <div className="text-xs text-gray-400">{d.funcaoFunc || ""}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-xs font-medium text-gray-800">{d.epiNome || "—"}</div>
                          {d.ca && <div className="text-xs text-gray-400">CA: {d.ca}</div>}
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            variant="destructive"
                            className={`text-xs ${
                              d.motivoCobranca === "furto"
                                ? "bg-purple-100 text-purple-800"
                                : d.motivoCobranca === "perda"
                                ? "bg-red-100 text-red-800"
                                : "bg-orange-100 text-orange-800"
                            }`}
                          >
                            {MOTIVO_LABELS[d.motivoCobranca] || d.motivoCobranca}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs">{d.quantidade}</td>
                        <td className="px-4 py-3 text-right font-mono text-xs">
                          {parseFloat(d.valorUnitario || "0").toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                        </td>
                        <td className={`px-4 py-3 text-right font-mono font-bold text-sm ${isCancelado ? "text-gray-400 line-through" : "text-red-600"}`}>
                          {parseFloat(d.valorTotal || "0").toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-xs font-medium bg-gray-100 px-2 py-1 rounded">{d.mesReferencia || "—"}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge
                            className={`text-xs ${
                              isPendente
                                ? "bg-amber-100 text-amber-800 border-amber-300"
                                : d.status === "confirmado"
                                ? "bg-red-100 text-red-800 border-red-300"
                                : "bg-gray-100 text-gray-600 border-gray-300"
                            }`}
                          >
                            {isPendente ? "⏳ Pendente" : d.status === "confirmado" ? "✅ Descontado" : "❌ Cancelado"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {isPendente ? (
                            <div className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-xs bg-green-50 border-green-300 text-green-700 hover:bg-green-100"
                                onClick={() => handleConfirmar(d.id)}
                                disabled={validateMut.isPending}
                              >
                                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                                Confirmar
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-xs bg-red-50 border-red-300 text-red-700 hover:bg-red-100"
                                onClick={() => handleCancelar(d.id)}
                                disabled={validateMut.isPending}
                              >
                                <XCircle className="w-3.5 h-3.5 mr-1" />
                                Cancelar
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              {d.validadoPor || "—"}
                              {d.dataValidacao && (
                                <div className="text-xs text-gray-400">
                                  {new Date(d.dataValidacao).toLocaleDateString("pt-BR")}
                                </div>
                              )}
                            </span>
                          )}
                        </td>
                      </tr>

                      {/* Linha expandida com detalhes */}
                      {expandedRow === d.id && (
                        <tr key={`${d.id}-detail`} className="bg-gray-50/80">
                          <td colSpan={9} className="px-6 py-3">
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                              <div>
                                <span className="text-gray-400 block">Data do Registro</span>
                                <span className="font-medium">{d.createdAt ? new Date(d.createdAt).toLocaleDateString("pt-BR") : "—"}</span>
                              </div>
                              <div>
                                <span className="text-gray-400 block">Validado Por</span>
                                <span className="font-medium">{d.validadoPor || "Aguardando"}</span>
                              </div>
                              <div>
                                <span className="text-gray-400 block">Data Validação</span>
                                <span className="font-medium">{d.dataValidacao ? new Date(d.dataValidacao).toLocaleDateString("pt-BR") : "—"}</span>
                              </div>
                              <div>
                                <span className="text-gray-400 block">Justificativa</span>
                                <span className="font-medium">{d.justificativa || "—"}</span>
                              </div>
                            </div>
                            {isPendente && (
                              <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                                <strong>Informação para o DP:</strong> Este desconto será incluído na folha de pagamento do mês <strong>{d.mesReferencia}</strong> do colaborador <strong>{d.nomeFunc}</strong>.
                                Conforme Art. 462, §1º da CLT, o desconto é permitido quando há dolo ou culpa comprovada do empregado.
                                Confirme para incluir na folha ou cancele com justificativa.
                              </div>
                            )}
                          </td>
                        </tr>
                      )}

                      {/* Modal de justificativa inline */}
                      {showJustificativa === d.id && (
                        <tr key={`${d.id}-justificativa`} className="bg-red-50/80">
                          <td colSpan={9} className="px-6 py-4">
                            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                              <div className="flex-1">
                                <label className="text-sm font-medium text-red-800 mb-1 block">
                                  Justificativa para cancelar o desconto (obrigatória):
                                </label>
                                <Input
                                  value={justificativaText}
                                  onChange={(e) => setJustificativaText(e.target.value)}
                                  placeholder="Ex: Comprovação de desgaste normal apresentada pelo colaborador..."
                                  className="bg-white"
                                  autoFocus
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </div>
                              <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => submitCancelamento(d.id)}
                                  disabled={validateMut.isPending || !justificativaText.trim()}
                                >
                                  {validateMut.isPending ? "Cancelando..." : "Confirmar Cancelamento"}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => { setShowJustificativa(null); setJustificativaText(""); }}
                                >
                                  Voltar
                                </Button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Rodapé com informações legais */}
          <div className="px-4 py-3 bg-blue-50 border-t flex items-start gap-2">
            <FileText className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
            <div className="text-xs text-blue-700 space-y-1">
              <p>
                <strong>Base Legal:</strong> Art. 462, §1º da CLT — O desconto de EPI é permitido quando há dolo ou culpa comprovada do empregado (mau uso, perda ou furto).
              </p>
              <p>
                <strong>Processo:</strong> O desconto é gerado automaticamente na entrega de EPI por motivo de troca (mau uso/perda/furto).
                O DP valida ou cancela. Descontos confirmados são incluídos na folha de pagamento do mês de referência.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
