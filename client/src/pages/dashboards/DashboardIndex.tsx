import { Link } from "wouter";
import {
  Users, AlertTriangle, GraduationCap, HardHat, ShieldAlert,
  ClipboardCheck, ListChecks, TriangleAlert, Flame, AlertOctagon,
} from "lucide-react";

const dashboards = [
  { path: "/dashboards/colaboradores", title: "Colaboradores", desc: "Quadro de pessoal, status, setores, funções e pirâmide etária", icon: Users, color: "text-blue-500 bg-blue-50" },
  { path: "/dashboards/pendentes", title: "Pendências", desc: "ASOs, treinamentos, auditorias, extintores e hidrantes vencidos", icon: AlertTriangle, color: "text-amber-500 bg-amber-50" },
  { path: "/dashboards/treinamentos", title: "Treinamentos", desc: "Treinamentos realizados, vencidos por norma e evolução mensal", icon: GraduationCap, color: "text-purple-500 bg-purple-50" },
  { path: "/dashboards/epi", title: "EPI", desc: "Estoque, movimentação mensal e top EPIs entregues", icon: HardHat, color: "text-orange-500 bg-orange-50" },
  { path: "/dashboards/acidentes", title: "Acidentes", desc: "Total, afastamentos, meta de dias sem acidente e gravidade", icon: ShieldAlert, color: "text-red-500 bg-red-50" },
  { path: "/dashboards/auditorias", title: "Auditorias", desc: "Status, não conformidades, tipos e desvios", icon: ClipboardCheck, color: "text-teal-500 bg-teal-50" },
  { path: "/dashboards/5w2h", title: "5W2H", desc: "Planos de ação: status, prioridades e evolução mensal", icon: ListChecks, color: "text-indigo-500 bg-indigo-50" },
  { path: "/dashboards/riscos", title: "Riscos", desc: "Riscos ambientais por tipo, grau e setor", icon: TriangleAlert, color: "text-yellow-500 bg-yellow-50" },
  { path: "/dashboards/extintores-hidrantes", title: "Extintores e Hidrantes", desc: "Status, validade e tipos dos equipamentos de combate a incêndio", icon: Flame, color: "text-red-500 bg-red-50" },
  { path: "/dashboards/desvios", title: "Desvios", desc: "Status, tipos, setores e taxa de resolução", icon: AlertOctagon, color: "text-orange-500 bg-orange-50" },
];

export default function DashboardIndex() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboards Interativos</h1>
        <p className="text-muted-foreground mt-1">Selecione um dashboard para visualizar os indicadores da empresa.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {dashboards.map(d => {
          const Icon = d.icon;
          const [textColor, bgColor] = d.color.split(" ");
          return (
            <Link key={d.path} href={d.path}>
              <div className="bg-card rounded-lg border border-border p-5 cursor-pointer hover:shadow-md transition-shadow group">
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${bgColor}`}>
                    <Icon className={`h-5 w-5 ${textColor}`} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold group-hover:text-blue-600 transition-colors">{d.title}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{d.desc}</p>
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
