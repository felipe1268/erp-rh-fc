import DashboardLayout from "@/components/DashboardLayout";
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import {
  ArrowDownCircle, ArrowUpCircle, Loader2, Search, Filter,
  ArrowRightLeft, Calendar, User,
} from "lucide-react";

const TIPO_LABELS: Record<string, { label: string; cor: string; icon: any }> = {
  entrada: { label: "Entrada", cor: "text-emerald-700 bg-emerald-50", icon: ArrowDownCircle },
  saida:   { label: "Saída",   cor: "text-red-700 bg-red-50",         icon: ArrowUpCircle },
  ajuste:  { label: "Ajuste",  cor: "text-blue-700 bg-blue-50",       icon: ArrowRightLeft },
};

function n(v: any) { return parseFloat(v ?? "0") || 0; }
function fmt(v: any) { return n(v).toLocaleString("pt-BR", { maximumFractionDigits: 3 }); }

export default function AlmoxarifadoMovimentacoes() {
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id ?? 0;

  const [busca, setBusca] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("todos");

  const { data: movs = [], isLoading } = trpc.warehouse.listMovements.useQuery(
    { companyId, limit: 300 },
    { enabled: !!companyId }
  );

  const lista = useMemo(() => {
    let r = movs;
    if (busca) {
      const b = busca.toLowerCase();
      r = r.filter(m =>
        (m.itemNome?.toLowerCase() ?? "").includes(b) ||
        (m.usuarioNome?.toLowerCase() ?? "").includes(b) ||
        (m.obraNome?.toLowerCase() ?? "").includes(b) ||
        (m.motivo?.toLowerCase() ?? "").includes(b)
      );
    }
    if (filtroTipo !== "todos") r = r.filter(m => m.tipo === filtroTipo);
    return r;
  }, [movs, busca, filtroTipo]);

  const resumo = useMemo(() => {
    const entradas = movs.filter(m => m.tipo === "entrada").reduce((s, m) => s + n(m.quantidade), 0);
    const saidas   = movs.filter(m => m.tipo === "saida").reduce((s, m) => s + n(m.quantidade), 0);
    return { entradas, saidas, total: movs.length };
  }, [movs]);

  return (
    <DashboardLayout>
      <div className="space-y-4 max-w-4xl mx-auto px-2">
        {/* Cabeçalho */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Movimentações</h1>
          <p className="text-sm text-gray-500 mt-1">Histórico completo de entradas e saídas</p>
        </div>

        {/* Cards de resumo */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-xl border p-3 text-center">
            <p className="text-2xl font-bold text-gray-900">{resumo.total}</p>
            <p className="text-xs text-gray-500 mt-1">Total registros</p>
          </div>
          <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-3 text-center">
            <p className="text-2xl font-bold text-emerald-700">{fmt(resumo.entradas)}</p>
            <p className="text-xs text-emerald-600 mt-1">Entradas</p>
          </div>
          <div className="bg-red-50 rounded-xl border border-red-200 p-3 text-center">
            <p className="text-2xl font-bold text-red-700">{fmt(resumo.saidas)}</p>
            <p className="text-xs text-red-600 mt-1">Saídas</p>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="search"
              className="w-full pl-9 pr-3 py-3 text-base border rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-400"
              placeholder="Buscar item, obra, usuário..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
            />
          </div>
          <select
            className="px-3 py-3 border rounded-xl text-base bg-white min-w-[110px]"
            value={filtroTipo}
            onChange={e => setFiltroTipo(e.target.value)}
          >
            <option value="todos">Todos</option>
            <option value="entrada">Entradas</option>
            <option value="saida">Saídas</option>
            <option value="ajuste">Ajustes</option>
          </select>
        </div>

        {/* Lista */}
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
          </div>
        ) : lista.length === 0 ? (
          <div className="text-center py-16">
            <ArrowRightLeft className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">Nenhuma movimentação encontrada</p>
          </div>
        ) : (
          <div className="space-y-2">
            {lista.map(mov => {
              const meta = TIPO_LABELS[mov.tipo] || TIPO_LABELS["ajuste"];
              const Icon = meta.icon;
              return (
                <div
                  key={mov.id}
                  className="bg-white rounded-xl border p-4 flex gap-3 items-start"
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${meta.cor}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900 truncate">{mov.itemNome ?? "Item"}</span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${meta.cor}`}>
                        {meta.label}
                      </span>
                    </div>
                    <p className="text-base font-bold text-gray-800 mt-0.5">
                      {mov.tipo === "entrada" ? "+" : "-"}{fmt(mov.quantidade)} {mov.unidade ?? "un"}
                    </p>
                    {(mov.motivo || mov.obraNome) && (
                      <p className="text-xs text-gray-500 mt-0.5 truncate">
                        {mov.obraNome ? `📍 ${mov.obraNome}` : ""}{mov.motivo ? ` — ${mov.motivo}` : ""}
                      </p>
                    )}
                    <div className="flex gap-3 mt-1 text-xs text-gray-400">
                      {mov.usuarioNome && (
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {mov.usuarioNome}
                        </span>
                      )}
                      {mov.criadoEm && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(mov.criadoEm).toLocaleString("pt-BR", {
                            day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
                          })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
