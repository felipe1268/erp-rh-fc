import { useLocation } from "wouter";
import { useState, useRef } from "react";
import {
  ClipboardList, AlertTriangle,
  CloudRain, ShieldCheck, ClipboardCheck,
  HardHat, FlaskConical,
} from "lucide-react";

const SUBMODULOS = [
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
    id: "ensaios",
    titulo: "Ensaios",
    subtitulo: "Ensaios Tecnológicos",
    icon: FlaskConical,
    accentFrom: "#3B82F6",
    accentTo: "#2563EB",
    path: "/operacional/ensaios",
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
];

const ORDER_KEY = "fc-operacional-order";

export default function PainelOperacional() {
  const [, setLocation] = useLocation();

  const [moduleOrder, setModuleOrder] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(ORDER_KEY) || "[]"); } catch { return []; }
  });
  const [dragActive, setDragActive] = useState<string | null>(null);
  const [dragTarget, setDragTarget] = useState<string | null>(null);
  const draggingId = useRef<string | null>(null);
  const didDrag = useRef(false);

  const sorted = moduleOrder.length === 0
    ? SUBMODULOS
    : [...SUBMODULOS].sort((a, b) => {
        const ai = moduleOrder.indexOf(a.id);
        const bi = moduleOrder.indexOf(b.id);
        if (ai === -1 && bi === -1) return 0;
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      });

  function handleDragStart(id: string) {
    draggingId.current = id;
    didDrag.current = false;
    setDragActive(id);
  }
  function handleDragOver(e: React.DragEvent, id: string) {
    e.preventDefault();
    didDrag.current = true;
    setDragTarget(id);
  }
  function handleDrop(toId: string) {
    const fromId = draggingId.current;
    if (!fromId || fromId === toId) return;
    const ids = sorted.map(m => m.id);
    const fromIdx = ids.indexOf(fromId);
    const toIdx = ids.indexOf(toId);
    const newOrder = [...ids];
    newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, fromId);
    setModuleOrder(newOrder);
    localStorage.setItem(ORDER_KEY, JSON.stringify(newOrder));
  }
  function handleDragEnd() {
    setDragActive(null);
    setDragTarget(null);
    draggingId.current = null;
    setTimeout(() => { didDrag.current = false; }, 0);
  }

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
        {sorted.map((mod) => {
          const isBeingDragged = dragActive === mod.id;
          const isDropTarget = dragTarget === mod.id && dragActive !== mod.id;
          return (
            <div
              key={mod.id}
              draggable
              onDragStart={() => handleDragStart(mod.id)}
              onDragOver={(e) => handleDragOver(e, mod.id)}
              onDrop={() => handleDrop(mod.id)}
              onDragEnd={handleDragEnd}
              onClick={() => { if (!didDrag.current) setLocation(mod.path); }}
              className="group relative flex flex-col items-center justify-center text-center rounded-2xl p-4 cursor-pointer transition-all duration-200 hover:scale-[1.04] select-none"
              style={{
                width: '155px',
                minHeight: '140px',
                background: `linear-gradient(145deg, ${mod.accentFrom}16, ${mod.accentTo}0a)`,
                border: isDropTarget
                  ? `2px solid ${mod.accentFrom}`
                  : `1.5px solid ${mod.accentFrom}38`,
                boxShadow: `0 4px 20px -6px ${mod.accentFrom}28`,
                opacity: isBeingDragged ? 0.4 : 1,
                transition: 'all 0.2s ease',
              }}
            >
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
