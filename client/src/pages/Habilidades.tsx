import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import {
  Plus, Search, Pencil, Trash2, Wrench, Users, Filter,
  ChevronDown, ChevronUp, Loader2, Award, Star, UserCheck,
  X, Check, AlertTriangle,
} from "lucide-react";
import FullScreenDialog from "@/components/FullScreenDialog";
import { useState, useMemo, useEffect } from "react";
import { toast } from "sonner";
import { useCompany } from "@/contexts/CompanyContext";
import { removeAccents } from "@/lib/searchUtils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

// ─── Types ──────────────────────────────────────────────────────
type SkillForm = {
  nome: string;
  categoria: string;
  descricao: string;
};
const emptySkillForm: SkillForm = { nome: "", categoria: "", descricao: "" };

type EmployeeSkillForm = {
  employeeId: number;
  skillId: number;
  nivel: "Basico" | "Intermediario" | "Avancado";
  tempoExperiencia: string;
  observacao: string;
};

const nivelLabels: Record<string, string> = {
  Basico: "Básico",
  Intermediario: "Intermediário",
  Avancado: "Avançado",
};

const nivelColors: Record<string, string> = {
  Basico: "bg-blue-100 text-blue-800",
  Intermediario: "bg-amber-100 text-amber-800",
  Avancado: "bg-green-100 text-green-800",
};

// ─── Main Component ─────────────────────────────────────────────
export default function Habilidades() {
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery, selectedCompany } = useCompany();
  const companyId = isConstrutoras ? 0 : Number(selectedCompanyId);
  const companyIds = getCompanyIdsForQuery();

  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<SkillForm>(emptySkillForm);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState<any>(null);
  const [showEmployeesDialog, setShowEmployeesDialog] = useState(false);
  const [viewSkill, setViewSkill] = useState<any>(null);

  // ─── Queries ────────────────────────────────────────────────
  const skillsQuery = trpc.skills.list.useQuery(
    { companyId, companyIds },
    { enabled: !!companyId || companyIds.length > 0 }
  );
  const categoriesQuery = trpc.skills.categories.useQuery(
    { companyId, companyIds },
    { enabled: !!companyId || companyIds.length > 0 }
  );
  const globalSummary = trpc.skills.skillSummaryGlobal.useQuery(
    { companyId, companyIds },
    { enabled: !!companyId || companyIds.length > 0 }
  );

  const utils = trpc.useUtils();

  // ─── Mutations ──────────────────────────────────────────────
  const createMut = trpc.skills.create.useMutation({
    onSuccess: () => {
      toast.success("Habilidade criada com sucesso!");
      utils.skills.list.invalidate();
      utils.skills.categories.invalidate();
      setShowForm(false);
      setForm(emptySkillForm);
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMut = trpc.skills.update.useMutation({
    onSuccess: () => {
      toast.success("Habilidade atualizada!");
      utils.skills.list.invalidate();
      utils.skills.categories.invalidate();
      setShowForm(false);
      setForm(emptySkillForm);
      setEditingId(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMut = trpc.skills.delete.useMutation({
    onSuccess: () => {
      toast.success("Habilidade excluída!");
      utils.skills.list.invalidate();
      utils.skills.skillSummaryGlobal.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  // ─── Filtered data ─────────────────────────────────────────
  const skills = skillsQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];

  const filtered = useMemo(() => {
    let list = skills;
    if (catFilter && catFilter !== "all") {
      list = list.filter((s: any) => s.categoria === catFilter);
    }
    if (search.trim()) {
      const q = removeAccents(search.toLowerCase());
      list = list.filter((s: any) =>
        removeAccents(s.nome || "").toLowerCase().includes(q) ||
        removeAccents(s.categoria || "").toLowerCase().includes(q) ||
        removeAccents(s.descricao || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [skills, catFilter, search]);

  // Group by category
  const grouped = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const s of filtered) {
      const cat = s.categoria || "Sem Categoria";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(s);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  // Summary stats
  const summaryData = globalSummary.data ?? [];
  const totalSkills = skills.length;
  const totalAssignments = Array.isArray(summaryData)
    ? summaryData.reduce((acc: number, r: any) => acc + Number(r.qtd || 0), 0)
    : 0;
  const uniqueCategories = categories.length;

  // ─── Handlers ───────────────────────────────────────────────
  function handleSave() {
    if (!form.nome.trim()) {
      toast.error("Nome da habilidade é obrigatório");
      return;
    }
    const targetCompanyId = isConstrutoras ? companyIds[0] : companyId;
    if (editingId) {
      updateMut.mutate({ id: editingId, ...form });
    } else {
      createMut.mutate({ companyId: targetCompanyId, ...form });
    }
  }

  function handleEdit(skill: any) {
    setEditingId(skill.id);
    setForm({
      nome: skill.nome || "",
      categoria: skill.categoria || "",
      descricao: skill.descricao || "",
    });
    setShowForm(true);
  }

  function handleDelete(id: number) {
    if (confirm("Excluir esta habilidade? Todas as atribuições de funcionários serão removidas.")) {
      deleteMut.mutate({ id });
    }
  }

  function handleViewEmployees(skill: any) {
    setViewSkill(skill);
    setShowEmployeesDialog(true);
  }

  function handleAssign(skill: any) {
    setSelectedSkill(skill);
    setShowAssignDialog(true);
  }

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Wrench className="h-6 w-6 text-blue-600" />
              Cadastro de Habilidades
            </h1>
            <p className="text-muted-foreground mt-1">
              Gerencie as habilidades e competências dos colaboradores
            </p>
          </div>
          <Button onClick={() => { setForm(emptySkillForm); setEditingId(null); setShowForm(true); }}>
            <Plus className="h-4 w-4 mr-2" /> Nova Habilidade
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Wrench className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total de Habilidades</p>
                <p className="text-2xl font-bold">{totalSkills}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <UserCheck className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Atribuições Ativas</p>
                <p className="text-2xl font-bold">{totalAssignments}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Filter className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Categorias</p>
                <p className="text-2xl font-bold">{uniqueCategories}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search & Filter */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar habilidade..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={catFilter} onValueChange={setCatFilter}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as Categorias</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Skills List */}
        {skillsQuery.isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Wrench className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium">Nenhuma habilidade encontrada</h3>
              <p className="text-muted-foreground mt-1">
                {skills.length === 0
                  ? "Comece cadastrando a primeira habilidade"
                  : "Tente ajustar os filtros de busca"}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {grouped.map(([cat, items]) => (
              <div key={cat}>
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Award className="h-4 w-4" />
                  {cat}
                  <Badge variant="secondary" className="ml-1">{items.length}</Badge>
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {items.map((skill: any) => {
                    // Count from summary
                    const skillSummary = Array.isArray(summaryData)
                      ? summaryData.filter((r: any) => Number(r.skillId) === skill.id)
                      : [];
                    const totalEmp = skillSummary.reduce((a: number, r: any) => a + Number(r.qtd || 0), 0);
                    return (
                      <Card key={skill.id} className="hover:shadow-md transition-shadow">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <h3 className="font-semibold text-base truncate">{skill.nome}</h3>
                              {skill.descricao && (
                                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{skill.descricao}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-1 ml-2 shrink-0">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleViewEmployees(skill)}
                                title="Ver funcionários"
                              >
                                <Users className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleAssign(skill)}
                                title="Atribuir a funcionário"
                              >
                                <Plus className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleEdit(skill)}
                                title="Editar"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-red-500 hover:text-red-700"
                                onClick={() => handleDelete(skill.id)}
                                title="Excluir"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                          {/* Employee count badges */}
                          <div className="flex items-center gap-2 mt-3 pt-3 border-t">
                            <Users className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">{totalEmp} funcionário{totalEmp !== 1 ? "s" : ""}</span>
                            {skillSummary.length > 0 && (
                              <div className="flex gap-1 ml-auto">
                                {skillSummary.map((r: any) => (
                                  <Badge key={r.nivel} className={`text-xs ${nivelColors[r.nivel] || ""}`}>
                                    {Number(r.qtd)} {nivelLabels[r.nivel] || r.nivel}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── Create/Edit Skill Dialog ──────────────────────────── */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Habilidade" : "Nova Habilidade"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome *</Label>
              <Input
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="Ex: Pintura, Impermeabilização, Solda..."
              />
            </div>
            <div>
              <Label>Categoria</Label>
              <Input
                value={form.categoria}
                onChange={(e) => setForm({ ...form, categoria: e.target.value })}
                placeholder="Ex: Acabamento, Estrutural, Elétrica..."
                list="cat-suggestions"
              />
              <datalist id="cat-suggestions">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea
                value={form.descricao}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                placeholder="Descrição detalhada da habilidade..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button
              onClick={handleSave}
              disabled={createMut.isPending || updateMut.isPending}
            >
              {(createMut.isPending || updateMut.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingId ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Assign Skill to Employee Dialog ───────────────────── */}
      {showAssignDialog && selectedSkill && (
        <AssignSkillDialog
          skill={selectedSkill}
          companyId={isConstrutoras ? companyIds[0] : companyId}
          companyIds={companyIds}
          onClose={() => { setShowAssignDialog(false); setSelectedSkill(null); }}
        />
      )}

      {/* ─── View Employees with Skill Dialog ──────────────────── */}
      {showEmployeesDialog && viewSkill && (
        <SkillEmployeesDialog
          skill={viewSkill}
          companyId={companyId}
          companyIds={companyIds}
          onClose={() => { setShowEmployeesDialog(false); setViewSkill(null); }}
        />
      )}
    </DashboardLayout>
  );
}

// ─── Assign Skill Dialog ──────────────────────────────────────────
function AssignSkillDialog({
  skill,
  companyId,
  companyIds,
  onClose,
}: {
  skill: any;
  companyId: number;
  companyIds: number[];
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [selectedEmp, setSelectedEmp] = useState<any>(null);
  const [nivel, setNivel] = useState<"Basico" | "Intermediario" | "Avancado">("Basico");
  const [tempoExperiencia, setTempoExperiencia] = useState("");
  const [observacao, setObservacao] = useState("");

  const utils = trpc.useUtils();

  // Get employees for this company
  const employeesQuery = trpc.employees.list.useQuery(
    { companyId, companyIds },
    { enabled: !!companyId || companyIds.length > 0 }
  );

  // Get employees who already have this skill
  const existingQuery = trpc.skills.searchBySkill.useQuery(
    { companyId, companyIds, skillId: skill.id },
    { enabled: !!skill.id }
  );

  const assignMut = trpc.skills.assignSkill.useMutation({
    onSuccess: () => {
      toast.success(`Habilidade "${skill.nome}" atribuída com sucesso!`);
      utils.skills.searchBySkill.invalidate();
      utils.skills.skillSummaryGlobal.invalidate();
      utils.skills.employeeSkills.invalidate();
      setSelectedEmp(null);
      setNivel("Basico");
      setTempoExperiencia("");
      setObservacao("");
    },
    onError: (e) => toast.error(e.message),
  });

  const existingEmpIds = new Set(
    (existingQuery.data ?? []).map((r: any) => r.employeeId)
  );

  const employees = (employeesQuery.data ?? []).filter(
    (e: any) => !["Desligado", "Lista_Negra"].includes(e.status)
  );

  const filteredEmps = useMemo(() => {
    if (!search.trim()) return employees.slice(0, 20);
    const q = removeAccents(search.toLowerCase());
    return employees
      .filter((e: any) =>
        removeAccents(e.nomeCompleto || "").toLowerCase().includes(q) ||
        removeAccents(e.funcao || "").toLowerCase().includes(q)
      )
      .slice(0, 20);
  }, [employees, search]);

  function handleAssign() {
    if (!selectedEmp) return;
    assignMut.mutate({
      employeeId: selectedEmp.id,
      skillId: skill.id,
      companyId: selectedEmp.companyId || companyId,
      nivel,
      tempoExperiencia: tempoExperiencia || undefined,
      observacao: observacao || undefined,
    });
  }

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Atribuir: {skill.nome}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Employee Search */}
          <div>
            <Label>Funcionário *</Label>
            {selectedEmp ? (
              <div className="flex items-center gap-2 p-2 border rounded-lg bg-blue-50">
                <UserCheck className="h-4 w-4 text-blue-600" />
                <span className="font-medium">{selectedEmp.nomeCompleto}</span>
                <span className="text-sm text-muted-foreground">({selectedEmp.funcao})</span>
                <Button variant="ghost" size="icon" className="h-6 w-6 ml-auto" onClick={() => setSelectedEmp(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar funcionário por nome ou função..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <div className="mt-2 max-h-48 overflow-y-auto border rounded-lg">
                  {filteredEmps.length === 0 ? (
                    <p className="p-3 text-sm text-muted-foreground text-center">Nenhum funcionário encontrado</p>
                  ) : (
                    filteredEmps.map((emp: any) => {
                      const alreadyHas = existingEmpIds.has(emp.id);
                      return (
                        <button
                          key={emp.id}
                          disabled={alreadyHas}
                          className={`w-full text-left px-3 py-2 text-sm border-b last:border-0 flex items-center justify-between gap-2 ${
                            alreadyHas
                              ? "opacity-50 cursor-not-allowed bg-gray-50"
                              : "hover:bg-blue-50 cursor-pointer"
                          }`}
                          onClick={() => !alreadyHas && setSelectedEmp(emp)}
                        >
                          <div>
                            <span className="font-medium">{emp.nomeCompleto}</span>
                            <span className="text-muted-foreground ml-2">({emp.funcao})</span>
                          </div>
                          {alreadyHas && (
                            <Badge variant="secondary" className="text-xs">Já possui</Badge>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </>
            )}
          </div>

          {/* Nivel */}
          <div>
            <Label>Nível de Proficiência</Label>
            <Select value={nivel} onValueChange={(v) => setNivel(v as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Basico">Básico</SelectItem>
                <SelectItem value="Intermediario">Intermediário</SelectItem>
                <SelectItem value="Avancado">Avançado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Tempo de Experiência */}
          <div>
            <Label>Tempo de Experiência</Label>
            <Input
              value={tempoExperiencia}
              onChange={(e) => setTempoExperiencia(e.target.value)}
              placeholder="Ex: 5 anos, 2 anos e 6 meses..."
            />
          </div>

          {/* Observação */}
          <div>
            <Label>Observação</Label>
            <Textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Observações sobre a habilidade do funcionário..."
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={handleAssign}
            disabled={!selectedEmp || assignMut.isPending}
          >
            {assignMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Atribuir Habilidade
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── View Employees with Skill Dialog ─────────────────────────────
function SkillEmployeesDialog({
  skill,
  companyId,
  companyIds,
  onClose,
}: {
  skill: any;
  companyId: number;
  companyIds: number[];
  onClose: () => void;
}) {
  const utils = trpc.useUtils();

  const employeesQuery = trpc.skills.searchBySkill.useQuery(
    { companyId, companyIds, skillId: skill.id },
    { enabled: !!skill.id }
  );

  const removeMut = trpc.skills.removeEmployeeSkill.useMutation({
    onSuccess: () => {
      toast.success("Habilidade removida do funcionário");
      utils.skills.searchBySkill.invalidate();
      utils.skills.skillSummaryGlobal.invalidate();
      utils.skills.employeeSkills.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const employees = employeesQuery.data ?? [];

  return (
    <FullScreenDialog
      open
      onClose={onClose}
      title={`Funcionários com: ${skill.nome}`}
      subtitle={`${skill.categoria || "Sem categoria"} • ${employees.length} funcionário${employees.length !== 1 ? "s" : ""}`}
      icon={<Users className="h-6 w-6" />}
      headerColor="bg-gradient-to-r from-blue-700 to-blue-500"
    >
      <div className="p-4 md:p-6">
        {employeesQuery.isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : employees.length === 0 ? (
          <div className="text-center py-12">
            <Users className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium">Nenhum funcionário com esta habilidade</h3>
            <p className="text-muted-foreground mt-1">Atribua esta habilidade a funcionários pelo botão +</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left p-3 font-semibold">Funcionário</th>
                  <th className="text-left p-3 font-semibold">Função</th>
                  <th className="text-left p-3 font-semibold">Nível</th>
                  <th className="text-left p-3 font-semibold">Experiência</th>
                  <th className="text-left p-3 font-semibold">Status</th>
                  <th className="text-center p-3 font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((emp: any, idx: number) => (
                  <tr key={idx} className="border-b hover:bg-gray-50">
                    <td className="p-3 font-medium">{emp.empNome}</td>
                    <td className="p-3 text-muted-foreground">{emp.empFuncao}</td>
                    <td className="p-3">
                      <Badge className={nivelColors[emp.nivel] || ""}>
                        {nivelLabels[emp.nivel] || emp.nivel}
                      </Badge>
                    </td>
                    <td className="p-3 text-muted-foreground">{emp.tempoExperiencia || "—"}</td>
                    <td className="p-3">
                      <Badge variant="outline">{emp.empStatus}</Badge>
                    </td>
                    <td className="p-3 text-center">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-500 hover:text-red-700"
                        onClick={() => {
                          if (confirm("Remover esta habilidade do funcionário?")) {
                            // We need the employee_skill id - search by skill returns employeeId, not the assignment id
                            // For now, we'll use a workaround
                            toast.info("Use a tela do perfil do funcionário para remover habilidades individuais");
                          }
                        }}
                        title="Remover"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </FullScreenDialog>
  );
}
