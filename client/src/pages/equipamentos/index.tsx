import DashboardLayout from "@/components/DashboardLayout";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import {
  HardHat, Package, Truck, FileText, Settings, AlertTriangle, ChevronRight,
} from "lucide-react";
import { fmtDate, fmtMoney } from "./_shared";

export default function EquipamentosHub() {
  const { selectedCompany } = useCompany();
  const companyId = Number(selectedCompany?.id) || 0;

  const proprios = trpc.equipamentos.propriosListar.useQuery({ companyId }, { enabled: !!companyId });
  const locados = trpc.equipamentos.locadosListar.useQuery({ companyId }, { enabled: !!companyId });
  const vencendo = trpc.equipamentos.locadosListar.useQuery(
    { companyId, vencendoEmDias: 30 },
    { enabled: !!companyId }
  );
  const ses = trpc.equipamentos.solicitacoesListar.useQuery({ companyId }, { enabled: !!companyId });

  const cards = [
    {
      label: "Equipamentos Próprios",
      icon: HardHat,
      color: "from-blue-500 to-blue-700",
      count: proprios.data?.length ?? 0,
      sub: `${(proprios.data || []).filter((p: any) => p.status === "em_obra").length} em obra`,
      to: "/equipamentos/proprios",
    },
    {
      label: "Equipamentos Locados",
      icon: Truck,
      color: "from-emerald-500 to-emerald-700",
      count: (locados.data || []).filter((l: any) => l.status === "em_uso").length,
      sub: `${(locados.data || []).filter((l: any) => l.status === "devolvido").length} devolvidos`,
      to: "/equipamentos/locados",
    },
    {
      label: "Solicitações (SE)",
      icon: FileText,
      color: "from-purple-500 to-purple-700",
      count: ses.data?.length ?? 0,
      sub: `${(ses.data || []).filter((s: any) => s.status === "pendente").length} pendentes`,
      to: "/equipamentos/solicitacoes",
    },
    {
      label: "Parâmetros CAPEX",
      icon: Settings,
      color: "from-slate-500 to-slate-700",
      count: "",
      sub: "Editar TMA, alçada, vida útil",
      to: "/equipamentos/parametros-capex",
    },
  ];

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Package className="h-6 w-6 text-blue-600" /> Controle de Equipamentos
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Rastreio unitário de equipamentos próprios e locados, com análise CAPEX vs OPEX.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {cards.map((c) => (
            <Link key={c.to} href={c.to}>
              <a className="block bg-white border rounded-lg shadow-sm hover:shadow-md transition cursor-pointer">
                <div className={`bg-gradient-to-br ${c.color} text-white p-4 rounded-t-lg flex items-center gap-3`}>
                  <c.icon className="h-6 w-6" />
                  <div className="font-semibold text-sm">{c.label}</div>
                </div>
                <div className="p-4">
                  <div className="text-3xl font-bold text-slate-900">{c.count}</div>
                  <div className="text-xs text-slate-500 mt-1">{c.sub}</div>
                  <div className="flex items-center justify-end mt-2 text-blue-600 text-xs font-medium">
                    Abrir <ChevronRight className="h-3 w-3" />
                  </div>
                </div>
              </a>
            </Link>
          ))}
        </div>

        <section className="bg-white border rounded-lg shadow-sm">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <h2 className="font-semibold text-slate-800 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Locações vencendo em até 30 dias
            </h2>
            <Link href="/equipamentos/locados">
              <a className="text-xs text-blue-600 hover:underline">Ver todos</a>
            </Link>
          </div>
          <div className="p-4">
            {vencendo.isLoading && <div className="text-sm text-slate-500">Carregando…</div>}
            {!vencendo.isLoading && (vencendo.data || []).length === 0 && (
              <div className="text-sm text-slate-500">Nenhuma locação vencendo no período. 👌</div>
            )}
            {(vencendo.data || []).length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-500 uppercase border-b">
                      <th className="py-2">Equipamento</th>
                      <th>Fornecedor</th>
                      <th>Início</th>
                      <th>Fim previsto</th>
                      <th className="text-right">Valor/mês</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(vencendo.data || []).map((l: any) => (
                      <tr key={l.id} className="border-b last:border-0 hover:bg-slate-50">
                        <td className="py-2">
                          <div className="font-medium text-slate-800">{l.descricao}</div>
                          <div className="text-xs text-slate-500">{l.categoria || "—"}</div>
                        </td>
                        <td className="text-slate-700">{l.fornecedorNome || "—"}</td>
                        <td className="text-slate-700">{fmtDate(l.dataInicio)}</td>
                        <td className="text-amber-700 font-medium">{fmtDate(l.dataFimPrevista)}</td>
                        <td className="text-right text-slate-700">{fmtMoney(l.valorMensal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}
