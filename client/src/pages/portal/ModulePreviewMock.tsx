import { BrainCircuit, BarChart3, PieChart, ListChecks, MousePointerClick } from "lucide-react";
import type { ModuleCard } from "./modulesData";

/**
 * Rev. 4050 — Prévia visual "conceitual" da tela de cada módulo. NÃO é um
 * screenshot real do app (o app é autenticado e multi-tenant, não daria pra
 * expor uma tela real de cliente aqui) — é uma ilustração abstrata (painéis +
 * gráfico + selo de IA) na cor do módulo, deixando claro visualmente o tipo
 * de informação que a tela mostra.
 * Rev. 4053 — extraído de `SiteVendas.tsx` pra ser reusado também na página
 * dedicada `/planos/modulos/:id` (`ModuloDetalhe.tsx`).
 */
export function ModulePreviewMock({ m }: { m: ModuleCard }) {
  return (
    <div className={`relative rounded-2xl overflow-hidden bg-gradient-to-br ${m.color} p-5 sm:p-6 aspect-[16/10]`}>
      <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "16px 16px" }} />
      <div className="relative h-full rounded-xl bg-white/95 backdrop-blur-sm shadow-xl p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded-md bg-gradient-to-br ${m.color} flex items-center justify-center`}>
              <m.icon className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="h-2 w-20 rounded-full bg-slate-200" />
          </div>
          <div className="flex items-center gap-1 text-[9px] font-semibold text-violet-600 bg-violet-50 border border-violet-200 rounded-full px-2 py-0.5">
            <BrainCircuit className="w-2.5 h-2.5" /> IA
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 flex-1">
          <div className="rounded-lg bg-slate-50 border border-slate-100 p-2 flex flex-col justify-between">
            <BarChart3 className="w-4 h-4 text-slate-300" />
            <div className="flex items-end gap-1 h-10">
              {[40, 70, 55, 90, 65].map((h, i) => (
                <div key={i} className={`w-full rounded-sm bg-gradient-to-t ${m.color} opacity-70`} style={{ height: `${h}%` }} />
              ))}
            </div>
          </div>
          <div className="rounded-lg bg-slate-50 border border-slate-100 p-2 flex flex-col items-center justify-center gap-1">
            <PieChart className="w-4 h-4 text-slate-300" />
            <div className="h-1.5 w-10 rounded-full bg-slate-200" />
            <div className="h-1.5 w-7 rounded-full bg-slate-200" />
          </div>
          <div className="rounded-lg bg-slate-50 border border-slate-100 p-2 flex flex-col gap-1.5">
            <ListChecks className="w-4 h-4 text-slate-300 mb-0.5" />
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-1.5 rounded-full bg-slate-200" style={{ width: `${90 - i * 15}%` }} />
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
          <MousePointerClick className="w-3.5 h-3.5 text-slate-300" />
          <div className="h-1.5 w-24 rounded-full bg-slate-100" />
        </div>
      </div>
    </div>
  );
}
