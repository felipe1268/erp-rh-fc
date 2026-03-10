import DashboardLayout from "@/components/DashboardLayout";
import PrintActions from "@/components/PrintActions";
import PrintFooterLGPD from "@/components/PrintFooterLGPD";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Building2, Users, Wrench, Search, ArrowLeft, AlertTriangle,
  CheckCircle, ChevronDown, ChevronRight, Filter
} from "lucide-react";
import { Loader2 } from "lucide-react";
import { Link } from "wouter";
import { useState, useMemo } from "react";

const NIVEL_LABELS: Record<string, string> = {
  Basico: "Básico",
  Intermediario: "Intermediário",
  Avancado: "Avançado",
};

const NIVEL_COLORS: Record<string, string> = {
  Basico: "bg-blue-100 text-blue-800",
  Intermediario: "bg-yellow-100 text-yellow-800",
  Avancado: "bg-green-100 text-green-800",
};

const STATUS_COLORS: Record<string, string> = {
  Planejamento: "bg-slate-100 text-slate-700",
  Em_Andamento: "bg-blue-100 text-blue-800",
  Paralisada: "bg-yellow-100 text-yellow-800",
  Concluida: "bg-green-100 text-green-800",
  Cancelada: "bg-red-100 text-red-800",
};

export default function RelatorioHabilidadesObra() {
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery } = useCompany();
  const companyId = Number(selectedCompanyId) || 0;
  const companyIds = getCompanyIdsForQuery();
  const queryInput = isConstrutoras
    ? { companyId: companyIds[0] || 0, companyIds }
    : { companyId };

  const [search, setSearch] = useState("");
  const [selectedObra, setSelectedObra] = useState<string>("all");
  const [expandedObras, setExpandedObras] = useState<Set<number>>(new Set());

  const { data, isLoading } = trpc.skills.reportByObra.useQuery(
    { ...queryInput, ...(selectedObra !== "all" ? { obraId: Number(selectedObra) } : {}) },
    { enabled: isConstrutoras ? companyIds.length > 0 : companyId > 0 }
  );

  const toggleObra = (obraId: number) => {
    setExpandedObras(prev => {
      const next = new Set(prev);
      if (next.has(obraId)) next.delete(obraId);
      else next.add(obraId);
      return next;
    });
  };

  const expandAll = () => {
    if (data?.obras) {
      setExpandedObras(new Set(data.obras.map((o: any) => o.id)));
    }
  };

  const collapseAll = () => setExpandedObras(new Set());

  // Process data
  const processedData = useMemo(() => {
    if (!data) return [];

    const skillDetails = data.skillDetails as any[];
    const empCounts = data.employeeCounts as any[];
    const allSkills = data.allSkills as any[];

    return (data.obras as any[]).map((obra: any) => {
      const obraSkills = skillDetails.filter((s: any) => Number(s.obraId) === obra.id);
      const empCount = empCounts.find((e: any) => Number(e.obraId) === obra.id);
      const totalEmp = Number(empCount?.total || 0);

      // Group by skill
      const skillMap = new Map<number, { skillNome: string; skillCategoria: string; employees: any[] }>();
      obraSkills.forEach((s: any) => {
        const key = Number(s.skillId);
        if (!skillMap.has(key)) {
          skillMap.set(key, { skillNome: s.skillNome, skillCategoria: s.skillCategoria || "Sem Categoria", employees: [] });
        }
        skillMap.get(key)!.employees.push({
          id: s.employeeId,
          nome: s.empNome,
          funcao: s.empFuncao,
          nivel: s.nivel,
          tempoExperiencia: s.tempoExperiencia,
        });
      });

      // Gap analysis: skills that exist in the system but no one in this obra has
      const obraSkillIds = new Set(obraSkills.map((s: any) => Number(s.skillId)));
      const missingSkills = allSkills.filter((s: any) => !obraSkillIds.has(s.id));

      return {
        ...obra,
        totalEmployees: totalEmp,
        skillsAvailable: skillMap,
        missingSkills,
        totalSkillAssignments: obraSkills.length,
        uniqueSkills: skillMap.size,
      };
    }).filter((obra: any) => {
      if (!search) return true;
      const s = search.toLowerCase();
      return obra.nome.toLowerCase().includes(s);
    });
  }, [data, search]);

  if (isLoading) return (
    <DashboardLayout>
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    </DashboardLayout>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6" id="print-area">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/habilidades" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <ArrowLeft className="w-4 h-4" /> Voltar às Habilidades
              </Link>
            </div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Wrench className="w-6 h-6" /> Relatório de Habilidades por Obra
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Visualize as habilidades disponíveis e faltantes em cada obra
            </p>
          </div>
          <PrintActions title="Relatório de Habilidades por Obra" />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar obra..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={expandAll}>
              <ChevronDown className="w-4 h-4 mr-1" /> Expandir Todas
            </Button>
            <Button variant="outline" size="sm" onClick={collapseAll}>
              <ChevronRight className="w-4 h-4 mr-1" /> Recolher Todas
            </Button>
          </div>
        </div>

        {/* Summary KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="border-l-4 border-l-blue-500 bg-blue-50">
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Total de Obras</div>
              <div className="text-2xl font-bold text-blue-700">{processedData.length}</div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-green-500 bg-green-50">
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Habilidades Cadastradas</div>
              <div className="text-2xl font-bold text-green-700">{data?.allSkills?.length || 0}</div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-purple-500 bg-purple-50">
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Atribuições Ativas</div>
              <div className="text-2xl font-bold text-purple-700">
                {processedData.reduce((s: number, o: any) => s + o.totalSkillAssignments, 0)}
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-orange-500 bg-orange-50">
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Obras com Lacunas</div>
              <div className="text-2xl font-bold text-orange-700">
                {processedData.filter((o: any) => o.missingSkills.length > 0).length}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Obra Cards */}
        {processedData.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Nenhuma obra encontrada.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {processedData.map((obra: any) => {
              const isExpanded = expandedObras.has(obra.id);
              const skillEntries = Array.from(obra.skillsAvailable.entries()) as [number, any][];
              // Group by category
              const byCategory = new Map<string, typeof skillEntries>();
              skillEntries.forEach(([id, s]) => {
                const cat = s.skillCategoria || "Sem Categoria";
                if (!byCategory.has(cat)) byCategory.set(cat, []);
                byCategory.get(cat)!.push([id, s]);
              });

              return (
                <Card key={obra.id} className="overflow-hidden">
                  <div
                    className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => toggleObra(obra.id)}
                  >
                    <div className="flex items-center gap-3">
                      {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                      <div>
                        <div className="flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-muted-foreground" />
                          <span className="font-semibold">{obra.nome}</span>
                          <Badge className={`text-[10px] ${STATUS_COLORS[obra.status] || 'bg-gray-100'}`}>
                            {obra.status?.replace('_', ' ')}
                          </Badge>
                        </div>
                        <div className="text-sm text-muted-foreground mt-1 flex items-center gap-4">
                          <span className="flex items-center gap-1">
                            <Users className="w-3 h-3" /> {obra.totalEmployees} funcionários
                          </span>
                          <span className="flex items-center gap-1">
                            <Wrench className="w-3 h-3" /> {obra.uniqueSkills} habilidades
                          </span>
                          {obra.missingSkills.length > 0 && (
                            <span className="flex items-center gap-1 text-orange-600">
                              <AlertTriangle className="w-3 h-3" /> {obra.missingSkills.length} faltantes
                            </span>
                          )}
                          {obra.missingSkills.length === 0 && obra.uniqueSkills > 0 && (
                            <span className="flex items-center gap-1 text-green-600">
                              <CheckCircle className="w-3 h-3" /> Cobertura completa
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {obra.totalSkillAssignments} atribuições
                      </Badge>
                    </div>
                  </div>

                  {isExpanded && (
                    <CardContent className="border-t pt-4 space-y-4">
                      {/* Available Skills by Category */}
                      {skillEntries.length > 0 ? (
                        <>
                          <h4 className="font-semibold text-sm flex items-center gap-2">
                            <CheckCircle className="w-4 h-4 text-green-600" /> Habilidades Disponíveis
                          </h4>
                          {Array.from(byCategory.entries()).map(([cat, catSkills]) => (
                            <div key={cat} className="ml-4">
                              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                                {cat}
                              </div>
                              <div className="border rounded-lg overflow-hidden">
                                <table className="w-full text-sm">
                                  <thead className="bg-muted/50">
                                    <tr>
                                      <th className="text-left px-3 py-2">Habilidade</th>
                                      <th className="text-left px-3 py-2">Funcionário</th>
                                      <th className="text-left px-3 py-2">Função</th>
                                      <th className="text-center px-3 py-2">Nível</th>
                                      <th className="text-left px-3 py-2">Experiência</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {catSkills.flatMap(([skillId, skill]: [number, any]) =>
                                      skill.employees.map((emp: any, idx: number) => (
                                        <tr key={`${skillId}-${emp.id}`} className="border-t">
                                          {idx === 0 && (
                                            <td className="px-3 py-2 font-medium" rowSpan={skill.employees.length}>
                                              {skill.skillNome}
                                              <div className="text-xs text-muted-foreground">
                                                {skill.employees.length} pessoa{skill.employees.length > 1 ? 's' : ''}
                                              </div>
                                            </td>
                                          )}
                                          <td className="px-3 py-2">{emp.nome}</td>
                                          <td className="px-3 py-2 text-muted-foreground">{emp.funcao || '-'}</td>
                                          <td className="px-3 py-2 text-center">
                                            <Badge className={`text-[10px] ${NIVEL_COLORS[emp.nivel] || ''}`}>
                                              {NIVEL_LABELS[emp.nivel] || emp.nivel}
                                            </Badge>
                                          </td>
                                          <td className="px-3 py-2 text-muted-foreground">{emp.tempoExperiencia || '-'}</td>
                                        </tr>
                                      ))
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          ))}
                        </>
                      ) : (
                        <div className="text-center py-4 text-muted-foreground text-sm">
                          <Wrench className="w-8 h-8 mx-auto mb-2 opacity-30" />
                          Nenhuma habilidade registrada nesta obra.
                        </div>
                      )}

                      {/* Missing Skills (Gap Analysis) */}
                      {obra.missingSkills.length > 0 && (
                        <div>
                          <h4 className="font-semibold text-sm flex items-center gap-2 text-orange-700">
                            <AlertTriangle className="w-4 h-4" /> Habilidades Faltantes ({obra.missingSkills.length})
                          </h4>
                          <div className="flex flex-wrap gap-2 mt-2 ml-4">
                            {obra.missingSkills.map((s: any) => (
                              <Badge key={s.id} variant="outline" className="text-xs border-orange-300 text-orange-700 bg-orange-50">
                                {s.nome}
                                {s.categoria && <span className="text-[9px] ml-1 opacity-60">({s.categoria})</span>}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        )}

        <PrintFooterLGPD />
      </div>
    </DashboardLayout>
  );
}
