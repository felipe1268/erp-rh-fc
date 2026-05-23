import DashboardLayout from "@/components/DashboardLayout";
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { toast } from "sonner";
import { Settings, Save, Lock } from "lucide-react";
import { Spinner } from "./_shared";

const CATEGORIA_LABELS: Record<string, string> = {
  financeiro: "Financeiro",
  alcada: "Alçada",
  tecnico: "Técnico",
  vida_util: "Vida útil por categoria",
};

export default function ParametrosCapex() {
  const { selectedCompany } = useCompany();
  const companyId = Number(selectedCompany?.id) || 0;

  const utils = trpc.useUtils();
  const { data = [], isLoading } = trpc.equipamentos.parametrosCapexListar.useQuery(
    { companyId }, { enabled: !!companyId }
  );

  const [edits, setEdits] = useState<Record<string, string>>({});
  const atualizar = trpc.equipamentos.parametrosCapexAtualizar.useMutation({
    onSuccess: () => { utils.equipamentos.parametrosCapexListar.invalidate(); toast.success("Parâmetro atualizado."); },
    onError: (e) => toast.error(e.message),
  });

  function salvar(p: any) {
    const val = edits[p.chave];
    if (val === undefined) return;
    const num = parseFloat(val.replace(",", "."));
    if (isNaN(num)) return toast.error("Valor numérico inválido.");
    atualizar.mutate({ companyId, chave: p.chave, valorNumerico: num });
    setEdits(prev => { const c = { ...prev }; delete c[p.chave]; return c; });
  }

  const grouped = useMemo(() => {
    const g: Record<string, any[]> = {};
    for (const p of data as any[]) {
      const cat = p.categoria || "outros";
      if (!g[cat]) g[cat] = [];
      g[cat].push(p);
    }
    return g;
  }, [data]);

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Settings className="h-6 w-6 text-slate-600" /> Parâmetros CAPEX
          </h1>
          <p className="text-sm text-slate-600">
            Valores default semeados automaticamente. Ajuste TMA, alçada, vida útil etc. conforme a realidade da empresa.
          </p>
        </div>

        {isLoading ? <div className="p-8 flex justify-center"><Spinner /></div> :
          Object.keys(grouped).map(cat => (
            <section key={cat} className="bg-white border rounded-lg shadow-sm overflow-hidden">
              <div className="px-4 py-2 bg-slate-50 border-b">
                <h2 className="font-semibold text-slate-800 text-sm uppercase tracking-wide">{CATEGORIA_LABELS[cat] || cat}</h2>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500 uppercase border-b">
                    <th className="px-4 py-2">Chave</th>
                    <th className="px-4 py-2 w-48">Valor</th>
                    <th className="px-4 py-2">Descrição</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {grouped[cat].map((p: any) => {
                    const cur = edits[p.chave] ?? (p.valorNumerico != null ? String(Number(p.valorNumerico)) : "");
                    const dirty = edits[p.chave] !== undefined;
                    return (
                      <tr key={p.id} className="border-b last:border-0">
                        <td className="px-4 py-2 font-mono text-xs text-slate-700">{p.chave}</td>
                        <td className="px-4 py-2">
                          <input value={cur} disabled={p.editavel === false}
                            onChange={e => setEdits(prev => ({ ...prev, [p.chave]: e.target.value }))}
                            className="w-full px-2 py-1 border rounded text-sm font-mono disabled:bg-slate-100" />
                        </td>
                        <td className="px-4 py-2 text-xs text-slate-600">{p.descricao}</td>
                        <td className="px-4 py-2 text-right">
                          {p.editavel === false ? <Lock className="h-4 w-4 text-slate-400 inline" /> : (
                            <button onClick={() => salvar(p)} disabled={!dirty || atualizar.isPending}
                              className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded disabled:opacity-30 inline-flex items-center gap-1">
                              <Save className="h-3 w-3" /> Salvar
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          ))}
      </div>
    </DashboardLayout>
  );
}
