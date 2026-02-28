import { Link } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import {
  Users, Clock, Wallet, Timer, HardHat, Gavel, AlertTriangle, Palmtree,
} from "lucide-react";

const dashboards = [
  { path: "/dashboards/funcionarios", title: "Funcionários", desc: "Análise completa: idade, gênero, função, setor, tempo de empresa, ranking de faltas e advertências", icon: Users, color: "text-blue-500 bg-blue-50" },
  { path: "/dashboards/cartao-ponto", title: "Cartão de Ponto", desc: "Frequência, faltas, atrasos, horas trabalhadas por dia e ranking de ausências", icon: Clock, color: "text-green-500 bg-green-50" },
  { path: "/dashboards/folha-pagamento", title: "Folha de Pagamento", desc: "Custos totais, proventos, descontos, encargos, evolução mensal e top salários", icon: Wallet, color: "text-purple-500 bg-purple-50" },
  { path: "/dashboards/horas-extras", title: "Horas Extras", desc: "Ranking por pessoa, obra e setor, custo mensal, % sobre folha e evolução anual", icon: Timer, color: "text-orange-500 bg-orange-50" },
  { path: "/dashboards/epis", title: "EPIs", desc: "Estoque, entregas mensais, CAs vencidos, top EPIs e funcionários com mais entregas", icon: HardHat, color: "text-teal-500 bg-teal-50" },
  { path: "/dashboards/juridico", title: "Jurídico", desc: "Processos trabalhistas: status, risco, valores, audiências e pedidos mais comuns", icon: Gavel, color: "text-red-500 bg-red-50" },
  { path: "/dashboards/aviso-previo", title: "Aviso Prévio", desc: "Avisos prévios: tipos, custos, prazos, vencimentos, setores e composição de rescisão", icon: AlertTriangle, color: "text-amber-500 bg-amber-50" },
  { path: "/dashboards/ferias", title: "Férias", desc: "Períodos aquisitivos, concessivos, custos, vencidas, timeline mensal e fracionamento", icon: Palmtree, color: "text-green-500 bg-green-50" },
];

export default function DashboardIndex() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Dashboards Analíticos</h1>
          <p className="text-muted-foreground mt-1">Selecione um dashboard para visualizar os indicadores da empresa.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {dashboards.map(d => {
            const Icon = d.icon;
            const [textColor, bgColor] = d.color.split(" ");
            return (
              <Link key={d.path} href={d.path}>
                <div className="bg-card rounded-lg border border-border p-5 cursor-pointer hover:shadow-md transition-shadow group h-full">
                  <div className="flex items-start gap-3">
                    <div className={`p-2.5 rounded-lg ${bgColor} shrink-0`}>
                      <Icon className={`h-5 w-5 ${textColor}`} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold group-hover:text-blue-600 transition-colors">{d.title}</h3>
                      <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{d.desc}</p>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </DashboardLayout>
  );
}
