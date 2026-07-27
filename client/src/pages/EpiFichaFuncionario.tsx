// ============================================================================
// Rev. 4644 — FICHA DE EPI (aba lateral SST)
// Lista todos os colaboradores que já receberam EPI, com contagem de entregas
// e assinaturas; clique abre a Ficha de EPI consolidada (FichaEpiDialog),
// pronta p/ imprimir/PDF e enviar a cliente ou Ministério do Trabalho.
// ============================================================================
import { useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Input } from "@/components/ui/input";
import { Loader2, Search, ShieldCheck, FileSignature } from "lucide-react";
import PersonPhoto from "@/components/PersonPhoto";
import FichaEpiDialog from "@/components/FichaEpiDialog";
import { formatCPF } from "@/lib/formatters";

function removeAccents(s: string): string {
  return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export default function EpiFichaFuncionario() {
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery } = useCompany();
  const companyId = isConstrutoras ? 0 : (selectedCompanyId ? parseInt(selectedCompanyId, 10) : 0);
  const companyIds = getCompanyIdsForQuery();
  const queryCompanyId = isConstrutoras ? (companyIds[0] || 0) : companyId;
  const hasValidCompany = isConstrutoras ? companyIds.length > 0 : !!companyId;

  const [search, setSearch] = useState("");
  const [fichaEmpId, setFichaEmpId] = useState<number | null>(null);

  const resumoQ = trpc.epis.fichaEpiResumo.useQuery(
    { companyId: queryCompanyId, companyIds: isConstrutoras ? companyIds : undefined },
    { enabled: hasValidCompany }
  );

  const funcionarios = useMemo(() => {
    const all = (resumoQ.data?.funcionarios || []) as any[];
    const s = removeAccents(search.trim());
    if (!s) return all;
    return all.filter(f => removeAccents(f.nomeCompleto || "").includes(s) || removeAccents(f.funcao || "").includes(s) || String(f.cpf || "").replace(/\D/g, "").includes(s.replace(/\D/g, "") || "\u0000"));
  }, [resumoQ.data, search]);

  return (
    <DashboardLayout>
      <div className="p-3 sm:p-6 space-y-4 max-w-5xl mx-auto">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-[#0A1E3C]" /> Ficha de EPI
          </h1>
          <p className="text-sm text-muted-foreground">
            Ficha consolidada por colaborador — todas as entregas com assinatura digital autenticada (NR-06 / CLT), pronta p/ enviar a clientes ou ao Ministério do Trabalho.
          </p>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nome, função ou CPF..." className="pl-9" />
        </div>

        {resumoQ.isLoading ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground"><Loader2 className="animate-spin mr-2 h-5 w-5" /> Carregando...</div>
        ) : funcionarios.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10">Nenhum colaborador com entrega de EPI registrada.</p>
        ) : (
          <div className="rounded-lg border overflow-hidden bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-muted-foreground border-b">
                  <th className="px-3 py-2 text-left">Colaborador</th>
                  <th className="px-3 py-2 text-left hidden sm:table-cell">Função</th>
                  <th className="px-3 py-2 text-center">Entregas</th>
                  <th className="px-3 py-2 text-center">Assinadas</th>
                  <th className="px-3 py-2 text-center hidden sm:table-cell">Última entrega</th>
                  <th className="px-3 py-2 text-center">Ficha</th>
                </tr>
              </thead>
              <tbody>
                {funcionarios.map((f: any) => {
                  const pend = (f.total_entregas || 0) - (f.entregas_assinadas || 0);
                  return (
                    <tr key={f.id} className="border-b last:border-0 hover:bg-gray-50 cursor-pointer" onClick={() => setFichaEmpId(f.id)}>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <PersonPhoto src={f.fotoUrl} alt={f.nomeCompleto} size="sm" />
                          <div className="min-w-0">
                            <p className="font-medium text-blue-700 truncate" title={f.nomeCompleto}>{f.nomeCompleto}</p>
                            <p className="text-[11px] text-muted-foreground">{formatCPF(f.cpf)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 hidden sm:table-cell text-xs">{f.funcao || "—"}</td>
                      <td className="px-3 py-2 text-center font-semibold">{f.total_entregas}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${pend === 0 ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-800"}`}>
                          {f.entregas_assinadas}{pend > 0 ? ` / ${f.total_entregas}` : " ✓"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center hidden sm:table-cell text-xs whitespace-nowrap">
                        {f.ultima_entrega ? f.ultima_entrega.split("-").reverse().join("/") : "—"}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <button type="button" className="inline-flex items-center gap-1 text-xs text-primary hover:underline" onClick={(ev) => { ev.stopPropagation(); setFichaEmpId(f.id); }}>
                          <FileSignature className="h-3.5 w-3.5" /> Abrir
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <FichaEpiDialog
        employeeId={fichaEmpId}
        open={!!fichaEmpId}
        onClose={() => setFichaEmpId(null)}
        companyId={queryCompanyId}
        companyIds={isConstrutoras ? companyIds : undefined}
      />
    </DashboardLayout>
  );
}
