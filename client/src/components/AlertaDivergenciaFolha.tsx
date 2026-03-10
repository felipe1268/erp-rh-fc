import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, UserX, Briefcase, Users } from "lucide-react";

interface Props {
  mesReferencia: string;
  mesLabel: string;
  /** Variante visual: 'full' mostra card grande, 'compact' mostra banner */
  variant?: "full" | "compact";
}

export default function AlertaDivergenciaFolha({ mesReferencia, mesLabel, variant = "full" }: Props) {
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery } = useCompany();
  const companyId = (selectedCompanyId && selectedCompanyId !== 'construtoras') ? parseInt(selectedCompanyId, 10) : 0;
  const companyIds = getCompanyIdsForQuery();
  const [expanded, setExpanded] = useState(false);

  const divergencia = trpc.payrollEngine.divergenciaAtivosSemFolha.useQuery(
    { companyId, companyIds: isConstrutoras ? companyIds : undefined, mesReferencia },
    { enabled: companyId > 0 || companyIds.length > 0 }
  );

  const d = divergencia.data;
  if (!d || !d.temDivergencia) return null;

  const totalSemFolha = d.totalCltSemFolha + d.totalPjSemFolha;

  if (variant === "compact") {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 print-hidden">
        <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpanded(!expanded)}>
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <span className="text-sm font-medium text-amber-800">
              {totalSemFolha} funcionário(s) ativo(s) sem folha processada em {mesLabel}
            </span>
            <span className="text-xs text-amber-600">
              ({d.totalAtivosCLT} CLT ativos, {d.totalCltComFolha} com folha)
            </span>
          </div>
          {expanded ? <ChevronUp className="w-4 h-4 text-amber-600" /> : <ChevronDown className="w-4 h-4 text-amber-600" />}
        </div>
        {expanded && <DivergenciaDetails data={d} />}
      </div>
    );
  }

  // variant === "full"
  return (
    <div className="bg-amber-50 border border-amber-300 rounded-lg overflow-hidden print-hidden">
      <div
        className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-amber-100/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <div className="font-bold text-amber-800 text-sm flex items-center gap-2">
              Divergência Detectada: {totalSemFolha} Funcionário(s) Sem Folha
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
            <div className="text-xs text-amber-700 mt-0.5">
              O número de ativos ({d.totalAtivos}) não bate com os processados na folha ({d.totalProcessados}).
              {d.totalCltSemFolha > 0 && ` ${d.totalCltSemFolha} CLT(s) sem folha.`}
              {d.totalPjSemFolha > 0 && ` ${d.totalPjSemFolha} PJ(s) sem lançamento.`}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <div className="text-center">
            <div className="text-xs text-amber-600">Ativos</div>
            <div className="font-bold text-amber-800">{d.totalAtivos}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-amber-600">Com Folha</div>
            <div className="font-bold text-green-700">{d.totalProcessados}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-amber-600">Sem Folha</div>
            <div className="font-bold text-red-600">{totalSemFolha}</div>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-amber-200">
          <DivergenciaDetails data={d} />
        </div>
      )}
    </div>
  );
}

function DivergenciaDetails({ data }: { data: any }) {
  return (
    <div className="px-4 py-3 space-y-3">
      {/* Resumo numérico */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
        <div className="bg-white rounded px-3 py-2 border border-amber-100">
          <div className="text-muted-foreground">Total Ativos</div>
          <div className="font-bold text-base">{data.totalAtivos}</div>
        </div>
        <div className="bg-white rounded px-3 py-2 border border-amber-100">
          <div className="text-muted-foreground">CLT Ativos</div>
          <div className="font-bold text-base text-blue-700">{data.totalAtivosCLT}</div>
        </div>
        <div className="bg-white rounded px-3 py-2 border border-amber-100">
          <div className="text-muted-foreground">CLT com Folha</div>
          <div className="font-bold text-base text-green-700">{data.totalCltComFolha}</div>
        </div>
        <div className="bg-white rounded px-3 py-2 border border-amber-100">
          <div className="text-muted-foreground">CLT sem Folha</div>
          <div className="font-bold text-base text-red-600">{data.totalCltSemFolha}</div>
        </div>
        <div className="bg-white rounded px-3 py-2 border border-amber-100">
          <div className="text-muted-foreground">PJ sem Lançamento</div>
          <div className="font-bold text-base text-orange-600">{data.totalPjSemFolha}</div>
        </div>
      </div>

      {/* Lista CLT sem folha */}
      {data.cltSemFolha.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <UserX className="w-4 h-4 text-red-600" />
            <span className="text-sm font-semibold text-red-700">CLT Ativos Sem Folha Processada ({data.cltSemFolha.length})</span>
          </div>
          <div className="bg-white border border-red-100 rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-red-50">
                <tr>
                  <th className="text-left px-3 py-1.5 font-medium text-red-700">Código</th>
                  <th className="text-left px-3 py-1.5 font-medium text-red-700">Nome</th>
                  <th className="text-left px-3 py-1.5 font-medium text-red-700">Função</th>
                  <th className="text-left px-3 py-1.5 font-medium text-red-700">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.cltSemFolha.map((e: any) => (
                  <tr key={e.id} className="border-t border-red-50 hover:bg-red-50/50">
                    <td className="px-3 py-1.5 font-mono">{e.codigo}</td>
                    <td className="px-3 py-1.5 font-medium">{e.nome}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{e.funcao}</td>
                    <td className="px-3 py-1.5">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        e.status === 'Ativo' ? 'bg-green-100 text-green-700' :
                        e.status === 'Ferias' ? 'bg-blue-100 text-blue-700' :
                        e.status === 'Afastado' ? 'bg-purple-100 text-purple-700' :
                        e.status === 'Licenca' ? 'bg-teal-100 text-teal-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {e.status === 'Ferias' ? 'Férias' : e.status === 'Licenca' ? 'Licença' : e.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-red-600 mt-1 italic">
            Estes funcionários CLT estão ativos no sistema mas não possuem folha processada neste mês. Verifique se a folha foi importada/calculada corretamente.
          </p>
        </div>
      )}

      {/* Lista PJ sem folha */}
      {data.pjSemFolha.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Briefcase className="w-4 h-4 text-orange-600" />
            <span className="text-sm font-semibold text-orange-700">PJ Ativos Sem Lançamento ({data.pjSemFolha.length})</span>
          </div>
          <div className="bg-white border border-orange-100 rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-orange-50">
                <tr>
                  <th className="text-left px-3 py-1.5 font-medium text-orange-700">Código</th>
                  <th className="text-left px-3 py-1.5 font-medium text-orange-700">Nome</th>
                  <th className="text-left px-3 py-1.5 font-medium text-orange-700">Função</th>
                  <th className="text-left px-3 py-1.5 font-medium text-orange-700">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.pjSemFolha.map((e: any) => (
                  <tr key={e.id} className="border-t border-orange-50 hover:bg-orange-50/50">
                    <td className="px-3 py-1.5 font-mono">{e.codigo}</td>
                    <td className="px-3 py-1.5 font-medium">{e.nome}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{e.funcao}</td>
                    <td className="px-3 py-1.5">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700">
                        {e.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-orange-600 mt-1 italic">
            Estes profissionais PJ estão ativos mas não possuem valor lançado neste mês. Cadastre os valores para incluí-los no rateio de custos.
          </p>
        </div>
      )}
    </div>
  );
}
