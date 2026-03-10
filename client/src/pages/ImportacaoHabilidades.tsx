import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft, Users, Wrench, Search, CheckCircle, AlertTriangle,
  UserPlus, Filter, X
} from "lucide-react";
import { Loader2 } from "lucide-react";
import { Link } from "wouter";
import { useState, useMemo } from "react";
import { toast } from "sonner";

const NIVEL_LABELS: Record<string, string> = {
  Basico: "Básico",
  Intermediario: "Intermediário",
  Avancado: "Avançado",
};

export default function ImportacaoHabilidades() {
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery } = useCompany();
  const companyId = Number(selectedCompanyId) || 0;
  const companyIds = getCompanyIdsForQuery();
  const queryInput = isConstrutoras
    ? { companyId: companyIds[0] || 0, companyIds }
    : { companyId };

  // State
  const [selectedSkillId, setSelectedSkillId] = useState<number | null>(null);
  const [nivel, setNivel] = useState<string>("Basico");
  const [tempoExperiencia, setTempoExperiencia] = useState("");
  const [observacao, setObservacao] = useState("");
  const [selectedEmployees, setSelectedEmployees] = useState<Set<number>>(new Set());
  const [searchEmp, setSearchEmp] = useState("");
  const [filterFuncao, setFilterFuncao] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [step, setStep] = useState<1 | 2 | 3>(1); // 1=select skill, 2=select employees, 3=confirm

  // Queries
  const skillsQuery = trpc.skills.list.useQuery(queryInput, {
    enabled: isConstrutoras ? companyIds.length > 0 : companyId > 0,
  });
  const employeesQuery = trpc.employees.list.useQuery(
    { ...queryInput, status: filterStatus !== "all" ? filterStatus : undefined },
    { enabled: (isConstrutoras ? companyIds.length > 0 : companyId > 0) && step >= 2 }
  );

  // Get existing assignments for selected skill
  const existingQuery = trpc.skills.searchBySkill.useQuery(
    { ...queryInput, skillId: selectedSkillId || 0 },
    { enabled: !!selectedSkillId && step >= 2 }
  );

  const utils = trpc.useUtils();

  const assignBulkMut = trpc.skills.assignBulk.useMutation({
    onSuccess: (result) => {
      toast.success(`${result.assigned} funcionário(s) atribuído(s) com sucesso!${result.skipped > 0 ? ` (${result.skipped} já possuíam)` : ''}`);
      utils.skills.searchBySkill.invalidate();
      utils.skills.skillSummaryGlobal.invalidate();
      utils.skills.list.invalidate();
      setSelectedEmployees(new Set());
      setStep(1);
      setSelectedSkillId(null);
      setNivel("Basico");
      setTempoExperiencia("");
      setObservacao("");
    },
    onError: (err) => {
      toast.error("Erro ao atribuir: " + err.message);
    },
  });

  // Derived data
  const selectedSkill = useMemo(() => {
    return (skillsQuery.data || []).find((s: any) => s.id === selectedSkillId);
  }, [skillsQuery.data, selectedSkillId]);

  const existingEmpIds = useMemo(() => {
    return new Set((existingQuery.data || []).map((e: any) => e.employeeId));
  }, [existingQuery.data]);

  const filteredEmployees = useMemo(() => {
    const emps = (employeesQuery.data || []) as any[];
    return emps.filter((e: any) => {
      // Nunca mostrar desligados ou lista negra
      if (e.status === 'Desligado' || e.status === 'Lista_Negra') return false;
      if (searchEmp) {
        const s = searchEmp.toLowerCase();
        if (!e.nomeCompleto?.toLowerCase().includes(s) && !e.funcao?.toLowerCase().includes(s)) return false;
      }
      if (filterFuncao !== "all" && e.funcao !== filterFuncao) return false;
      return true;
    });
  }, [employeesQuery.data, searchEmp, filterFuncao]);

  const funcoes = useMemo(() => {
    const set = new Set<string>();
    ((employeesQuery.data || []) as any[]).forEach((e: any) => {
      if (e.funcao) set.add(e.funcao);
    });
    return Array.from(set).sort();
  }, [employeesQuery.data]);

  const toggleEmployee = (id: number) => {
    setSelectedEmployees(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    const available = filteredEmployees.filter((e: any) => !existingEmpIds.has(e.id));
    if (available.every((e: any) => selectedEmployees.has(e.id))) {
      // Deselect all
      setSelectedEmployees(prev => {
        const next = new Set(prev);
        available.forEach((e: any) => next.delete(e.id));
        return next;
      });
    } else {
      // Select all
      setSelectedEmployees(prev => {
        const next = new Set(prev);
        available.forEach((e: any) => next.add(e.id));
        return next;
      });
    }
  };

  const handleConfirm = () => {
    if (!selectedSkillId || selectedEmployees.size === 0) return;
    const effectiveCompanyId = isConstrutoras ? (companyIds[0] || 0) : companyId;
    assignBulkMut.mutate({
      skillId: selectedSkillId,
      employeeIds: Array.from(selectedEmployees),
      companyId: effectiveCompanyId,
      nivel: nivel as any,
      tempoExperiencia: tempoExperiencia || undefined,
      observacao: observacao || undefined,
    });
  };

  // Group skills by category
  const skillsByCategory = useMemo(() => {
    const map = new Map<string, any[]>();
    ((skillsQuery.data || []) as any[]).forEach((s: any) => {
      const cat = s.categoria || "Sem Categoria";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(s);
    });
    return map;
  }, [skillsQuery.data]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/habilidades" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-4 h-4" /> Voltar às Habilidades
            </Link>
          </div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <UserPlus className="w-6 h-6" /> Atribuição em Massa de Habilidades
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Selecione uma habilidade e atribua a múltiplos funcionários de uma vez
          </p>
        </div>

        {/* Steps indicator */}
        <div className="flex items-center gap-2">
          {[
            { n: 1, label: "Selecionar Habilidade" },
            { n: 2, label: "Selecionar Funcionários" },
            { n: 3, label: "Confirmar" },
          ].map((s, i) => (
            <div key={s.n} className="flex items-center gap-2">
              {i > 0 && <div className="w-8 h-px bg-border" />}
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                step === s.n ? 'bg-primary text-primary-foreground' :
                step > s.n ? 'bg-green-100 text-green-800' : 'bg-muted text-muted-foreground'
              }`}>
                {step > s.n ? <CheckCircle className="w-4 h-4" /> : <span className="w-5 h-5 rounded-full bg-current/20 flex items-center justify-center text-xs">{s.n}</span>}
                {s.label}
              </div>
            </div>
          ))}
        </div>

        {/* Step 1: Select Skill */}
        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wrench className="w-5 h-5" /> Selecione a Habilidade
              </CardTitle>
            </CardHeader>
            <CardContent>
              {skillsQuery.isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : (skillsQuery.data || []).length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Wrench className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>Nenhuma habilidade cadastrada.</p>
                  <Link href="/habilidades">
                    <Button variant="outline" className="mt-3">Cadastrar Habilidades</Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-4">
                  {Array.from(skillsByCategory.entries()).map(([cat, catSkills]) => (
                    <div key={cat}>
                      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">{cat}</div>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                        {catSkills.map((skill: any) => (
                          <div
                            key={skill.id}
                            onClick={() => {
                              setSelectedSkillId(skill.id);
                              setStep(2);
                            }}
                            className={`border rounded-lg p-3 cursor-pointer transition-all hover:shadow-md ${
                              selectedSkillId === skill.id ? 'border-primary bg-primary/5 ring-2 ring-primary/30' : 'hover:border-primary/50'
                            }`}
                          >
                            <div className="font-medium">{skill.nome}</div>
                            {skill.descricao && (
                              <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{skill.descricao}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step 2: Select Employees */}
        {step === 2 && selectedSkill && (
          <div className="space-y-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Wrench className="w-5 h-5 text-primary" />
                    <div>
                      <div className="font-semibold">{selectedSkill.nome}</div>
                      <div className="text-xs text-muted-foreground">{selectedSkill.categoria || "Sem Categoria"}</div>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => { setStep(1); setSelectedEmployees(new Set()); }}>
                    <X className="w-4 h-4 mr-1" /> Trocar
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Level and experience settings */}
            <Card>
              <CardContent className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-sm font-medium mb-1 block">Nível de Proficiência</label>
                    <Select value={nivel} onValueChange={setNivel}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Basico">Básico</SelectItem>
                        <SelectItem value="Intermediario">Intermediário</SelectItem>
                        <SelectItem value="Avancado">Avançado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Tempo de Experiência</label>
                    <Input
                      placeholder="Ex: 3 anos, 6 meses..."
                      value={tempoExperiencia}
                      onChange={(e) => setTempoExperiencia(e.target.value)}
                      className="h-9"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Observação</label>
                    <Input
                      placeholder="Observação opcional..."
                      value={observacao}
                      onChange={(e) => setObservacao(e.target.value)}
                      className="h-9"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Employee list */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Users className="w-5 h-5" /> Selecione os Funcionários
                  </CardTitle>
                  <Badge variant="outline" className="text-sm">
                    {selectedEmployees.size} selecionado{selectedEmployees.size !== 1 ? 's' : ''}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-3 mt-3">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar por nome ou função..."
                      value={searchEmp}
                      onChange={(e) => setSearchEmp(e.target.value)}
                      className="pl-9 h-9"
                    />
                  </div>
                  <Select value={filterFuncao} onValueChange={setFilterFuncao}>
                    <SelectTrigger className="w-48 h-9">
                      <SelectValue placeholder="Filtrar por função" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas as Funções</SelectItem>
                      {funcoes.map(f => (
                        <SelectItem key={f} value={f}>{f}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" onClick={toggleAll} className="h-9">
                    Selecionar Todos
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {employeesQuery.isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : filteredEmployees.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>Nenhum funcionário encontrado.</p>
                  </div>
                ) : (
                  <div className="border rounded-lg overflow-hidden max-h-[500px] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 sticky top-0">
                        <tr>
                          <th className="w-10 px-3 py-2"></th>
                          <th className="text-left px-3 py-2">Nome</th>
                          <th className="text-left px-3 py-2">Função</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredEmployees.map((emp: any) => {
                          const alreadyHas = existingEmpIds.has(emp.id);
                          const isSelected = selectedEmployees.has(emp.id);
                          return (
                            <tr
                              key={emp.id}
                              className={`border-t transition-colors ${alreadyHas ? 'opacity-50 bg-muted/30' : 'hover:bg-muted/30 cursor-pointer select-none'}`}
                              onClick={(e) => {
                                e.preventDefault();
                                if (!alreadyHas) toggleEmployee(emp.id);
                              }}
                            >
                              <td className="px-3 py-2 text-center">
                                {alreadyHas ? (
                                  <CheckCircle className="w-4 h-4 text-green-500 mx-auto" />
                                ) : (
                                  <Checkbox
                                    checked={isSelected}
                                    onClick={(e) => e.stopPropagation()}
                                    onCheckedChange={() => toggleEmployee(emp.id)}
                                  />
                                )}
                              </td>
                              <td className="px-3 py-2">
                                <div className="font-medium">{emp.nomeCompleto}</div>
                                {alreadyHas && <span className="text-[10px] text-green-600">Já possui esta habilidade</span>}
                              </td>
                              <td className="px-3 py-2 text-muted-foreground">{emp.funcao || '-'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <Button variant="outline" onClick={() => { setStep(1); setSelectedEmployees(new Set()); }}>
                    <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
                  </Button>
                  <Button
                    onClick={() => setStep(3)}
                    disabled={selectedEmployees.size === 0}
                  >
                    Continuar ({selectedEmployees.size} selecionado{selectedEmployees.size !== 1 ? 's' : ''})
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Step 3: Confirmation */}
        {step === 3 && selectedSkill && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-600" /> Confirmar Atribuição em Massa
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border rounded-lg p-4 bg-muted/30">
                  <div className="text-sm text-muted-foreground mb-1">Habilidade</div>
                  <div className="font-semibold text-lg">{selectedSkill.nome}</div>
                  <div className="text-sm text-muted-foreground">{selectedSkill.categoria || "Sem Categoria"}</div>
                </div>
                <div className="border rounded-lg p-4 bg-muted/30">
                  <div className="text-sm text-muted-foreground mb-1">Configuração</div>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge>{NIVEL_LABELS[nivel]}</Badge>
                    {tempoExperiencia && <span className="text-sm">{tempoExperiencia}</span>}
                  </div>
                  {observacao && <div className="text-sm text-muted-foreground mt-1">{observacao}</div>}
                </div>
              </div>

              <div className="border rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Users className="w-4 h-4" />
                  <span className="font-medium">{selectedEmployees.size} funcionário(s) selecionado(s)</span>
                </div>
                <div className="flex flex-wrap gap-2 max-h-[200px] overflow-y-auto">
                  {Array.from(selectedEmployees).map(empId => {
                    const emp = (employeesQuery.data as any[] || []).find((e: any) => e.id === empId);
                    return emp ? (
                      <Badge key={empId} variant="outline" className="text-xs">
                        {emp.nomeCompleto}
                        <button
                          className="ml-1 hover:text-destructive"
                          onClick={() => toggleEmployee(empId)}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ) : null;
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t">
                <Button variant="outline" onClick={() => setStep(2)}>
                  <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
                </Button>
                <Button
                  onClick={handleConfirm}
                  disabled={assignBulkMut.isPending}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {assignBulkMut.isPending ? (
                    <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Atribuindo...</>
                  ) : (
                    <><CheckCircle className="w-4 h-4 mr-1" /> Confirmar Atribuição</>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
