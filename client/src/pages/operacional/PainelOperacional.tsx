import { useLocation } from "wouter";
import {
  ClipboardList, Blocks, AlertTriangle,
  CloudRain, ShieldCheck, ClipboardCheck,
  HardHat, Users, FileBarChart, Lock,
} from "lucide-react";

const submodulos = [
  {
    id: "rdo",
    titulo: "RDO",
    subtitulo: "Relatório Diário de Obra",
    icon: ClipboardList,
    accentFrom: "#F59E0B",
    accentTo: "#D97706",
    path: "/operacional/rdo",
  },
  {
    id: "concretagem",
    titulo: "Concretagem",
    subtitulo: "Controle de Concreto",
    icon: Blocks,
    accentFrom: "#3B82F6",
    accentTo: "#2563EB",
    path: "/operacional/concretagem",
  },
  {
    id: "nc",
    titulo: "Não Conform.",
    subtitulo: "Controle de NCs",
    icon: AlertTriangle,
    accentFrom: "#EF4444",
    accentTo: "#DC2626",
    path: "/operacional/nc",
  },
  {
    id: "checklists",
    titulo: "Checklists",
    subtitulo: "Qualidade",
    icon: ClipboardCheck,
    accentFrom: "#10B981",
    accentTo: "#059669",
    path: "/operacional/checklists",
  },
  {
    id: "liberacao",
    titulo: "Liberação",
    subtitulo: "Liberação de Serviços",
    icon: ShieldCheck,
    accentFrom: "#0EA5E9",
    accentTo: "#0284C7",
    path: "/operacional/liberacao-servicos",
  },
  {
    id: "clima",
    titulo: "Clima",
    subtitulo: "Condições Climáticas",
    icon: CloudRain,
    accentFrom: "#6366F1",
    accentTo: "#4F46E5",
    path: "/operacional/rdo",
  },
  {
    id: "efetivo",
    titulo: "Efetivo",
    subtitulo: "Mão de Obra Diária",
    icon: Users,
    accentFrom: "#8B5CF6",
    accentTo: "#7C3AED",
    path: "/operacional/efetivo",
    emBreve: true,
  },
  {
    id: "medicao-obra",
    titulo: "Medição",
    subtitulo: "Avanço Físico da Obra",
    icon: FileBarChart,
    accentFrom: "#EC4899",
    accentTo: "#DB2777",
    path: "/operacional/medicao-obra",
    emBreve: true,
  },
  {
    id: "seguranca",
    titulo: "Segurança",
    subtitulo: "Permissão de Trabalho",
    icon: Lock,
    accentFrom: "#14B8A6",
    accentTo: "#0D9488",
    path: "/operacional/seguranca",
    emBreve: true,
  },
];

export default function PainelOperacional() {
  const [, setLocation] = useLocation();

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
          <HardHat className="h-7 w-7 text-amber-500" />
          Operacional
        </h1>
        <p className="text-sm text-gray-500">Controle Operacional da Obra</p>
      </div>

      <div className="flex flex-wrap gap-4">
        {submodulos.map((mod) => {
          const emBreve = (mod as any).emBreve;
          return (
            <div
              key={mod.id}
              onClick={() => !emBreve && setLocation(mod.path)}
              className={`group relative flex flex-col items-center justify-center text-center rounded-2xl p-4 transition-all duration-200 select-none
                ${emBreve ? "cursor-default opacity-50" : "cursor-pointer hover:scale-[1.04]"}`}
              style={{
                width: '155px',
                minHeight: '140px',
                background: `linear-gradient(145deg, ${mod.accentFrom}16, ${mod.accentTo}0a)`,
                border: `1.5px solid ${mod.accentFrom}38`,
                boxShadow: `0 4px 20px -6px ${mod.accentFrom}28`,
              }}
            >
              {emBreve && (
                <span className="absolute top-2 right-2 text-[8px] font-bold uppercase tracking-wider bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-1.5 py-0.5 rounded-full">
                  Em breve
                </span>
              )}
              <div
                className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                style={{ background: `radial-gradient(ellipse at 50% 60%, ${mod.accentFrom}20 0%, transparent 70%)` }}
              />
              <div
                className="h-16 w-16 rounded-2xl flex items-center justify-center mb-3 transition-transform duration-200 group-hover:scale-110 group-hover:-translate-y-0.5"
                style={{
                  background: `linear-gradient(135deg, ${mod.accentFrom}, ${mod.accentTo})`,
                  boxShadow: `0 4px 12px -3px ${mod.accentFrom}55`,
                }}
              >
                <mod.icon className="h-8 w-8 text-white" />
              </div>
              <p className="text-sm font-extrabold leading-tight text-[#1B2A4A] dark:text-white tracking-tight w-full truncate">{mod.titulo}</p>
              <p className="text-[10.5px] text-gray-400 leading-tight mt-0.5 w-full truncate">{mod.subtitulo}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
