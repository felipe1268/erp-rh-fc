import { useState } from "react";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, FileText, Search, Building2, Calendar, TrendingUp, TrendingDown, ChevronRight } from "lucide-react";

const BRL = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
const fmtDate = (d: string | null | undefined) => {
  if (!d) return "—";
  const [y, m, day] = d.slice(0, 10).split("-");
  return `${day}/${m}/${y}`;
};

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  ativo:     { label: "Ativo",     cls: "bg-green-100 text-green-800 border-green-200" },
  encerrado: { label: "Encerrado", cls: "bg-gray-100 text-gray-600 border-gray-200" },
  suspenso:  { label: "Suspenso",  cls: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  concluido: { label: "Concluído", cls: "bg-blue-100 text-blue-800 border-blue-200" },
};

export default function ContratosList() {
  const [, navigate] = useLocation();
  const { companyId } = useCompany();
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");

  const { data: contratos = [], isLoading } = trpc.terceiroContratos.listarContratos.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );

  const { data: kpis } = trpc.terceiroContratos.dashboardTerceiroContratos.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );

  const filtrados = contratos.filter(c => {
    const ok = filtroStatus === "todos" || c.status === filtroStatus;
    const b = busca.toLowerCase();
    const match = !b || c.descricao.toLowerCase().includes(b) || (c.empresaNome || "").toLowerCase().includes(b) || (c.numeroContrato || "").toLowerCase().includes(b) || (c.obraNome || "").toLowerCase().includes(b);
    return ok && match;
  });

  return (
    <DashboardLayout>
      <div className="p-5 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Contratos de Terceiros</h1>
            <p className="text-sm text-gray-500">Contratos de serviço vinculados ao planejamento da obra</p>
          </div>
          <Button onClick={() => navigate("/terceiros/contratos/novo")} className="gap-2 bg-blue-600 hover:bg-blue-700">
            <Plus className="w-4 h-4" /> Novo Contrato
          </Button>
        </div>

        {/* KPIs */}
        {kpis && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: "Contratos Ativos", value: kpis.totalContratos, sub: "", color: "bg-blue-500" },
              { label: "Total Contratado", value: BRL(kpis.valorTotalContratado), sub: "", color: "bg-indigo-500" },
              { label: "Total Pago", value: BRL(kpis.valorTotalPago), sub: `${kpis.percentualMedioExecucao?.toFixed(1) || 0}% executado`, color: "bg-green-500" },
              { label: "Medições Aguardando", value: kpis.medicoesAguardando, sub: "aprovação", color: "bg-yellow-500" },
            ].map((k, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3 shadow-sm">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${k.color}`}>
                  <TrendingUp className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 font-medium">{k.label}</p>
                  <p className="text-lg font-bold text-gray-900">{k.value}</p>
                  {k.sub && <p className="text-xs text-gray-400">{k.sub}</p>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Filtros */}
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input placeholder="Buscar por empresa, descrição ou obra..." className="pl-9" value={busca} onChange={e => setBusca(e.target.value)} />
          </div>
          <Select value={filtroStatus} onValueChange={setFiltroStatus}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="ativo">Ativos</SelectItem>
              <SelectItem value="concluido">Concluídos</SelectItem>
              <SelectItem value="suspenso">Suspensos</SelectItem>
              <SelectItem value="encerrado">Encerrados</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Lista */}
        <div className="space-y-2">
          {isLoading ? (
            <div className="py-12 text-center text-gray-400">Carregando...</div>
          ) : filtrados.length === 0 ? (
            <div className="py-12 text-center text-gray-400">
              <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Nenhum contrato encontrado</p>
              <p className="text-sm">Crie o primeiro contrato para começar</p>
            </div>
          ) : filtrados.map(c => {
            const st = STATUS_MAP[c.status || "ativo"] || STATUS_MAP.ativo;
            const pct = c.percentualPago ?? 0;
            const valOrc = Number(c.valorOrcamento ?? 0);
            const valFec = Number(c.valorTotal ?? 0);
            const variacao = valFec - valOrc;
            const variacaoPct = valOrc > 0 ? (variacao / valOrc) * 100 : 0;
            return (
              <button
                key={c.id}
                onClick={() => navigate(`/terceiros/contratos/${c.id}`)}
                className="w-full bg-white rounded-xl border border-gray-200 p-4 text-left hover:shadow-md hover:border-blue-300 transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {c.numeroContrato && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-mono">{c.numeroContrato}</span>}
                      <Badge className={`text-xs border ${st.cls}`}>{st.label}</Badge>
                      {/* Badge variação orçamento × fechado */}
                      {valOrc > 0 && (
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border font-medium ${
                          variacao > 0 ? "bg-red-50 text-red-700 border-red-200" :
                          variacao < 0 ? "bg-green-50 text-green-700 border-green-200" :
                          "bg-gray-50 text-gray-500 border-gray-200"
                        }`}>
                          {variacao > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          {variacao > 0 ? "+" : ""}{variacaoPct.toFixed(1)}% vs orçamento
                        </span>
                      )}
                    </div>
                    <p className="font-semibold text-gray-900 truncate">{c.descricao}</p>
                    <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                      <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{c.empresaNome}</span>
                      {c.obraNome && <span>📍 {c.obraNome}</span>}
                      {c.dataInicio && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{fmtDate(c.dataInicio)} → {fmtDate(c.dataTermino)}</span>}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-bold text-gray-900">{BRL(valFec)}</p>
                    {valOrc > 0 && <p className="text-xs text-gray-400">Orçado: {BRL(valOrc)}</p>}
                    <p className="text-xs text-gray-400">Pago: {BRL(Number(c.valorPago))}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0 mt-1" />
                </div>
                {/* Barra de progresso */}
                <div className="mt-3">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>Execução financeira</span>
                    <span>{pct.toFixed(1)}%</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </DashboardLayout>
  );
}
