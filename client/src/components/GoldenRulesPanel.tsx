import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import FullScreenDialog from "@/components/FullScreenDialog";
import { Shield, Plus, Pencil, Trash2, AlertTriangle, CheckCircle, ChevronDown, ChevronUp } from "lucide-react";

const CATEGORIAS = [
  { value: "seguranca", label: "Segurança", color: "bg-red-100 text-red-700 border-red-200" },
  { value: "qualidade", label: "Qualidade", color: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "rh", label: "Recursos Humanos", color: "bg-purple-100 text-purple-700 border-purple-200" },
  { value: "operacional", label: "Operacional", color: "bg-orange-100 text-orange-700 border-orange-200" },
  { value: "juridico", label: "Jurídico", color: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  { value: "financeiro", label: "Financeiro", color: "bg-green-100 text-green-700 border-green-200" },
  { value: "geral", label: "Geral", color: "bg-gray-100 text-gray-700 border-gray-200" },
] as const;

const PRIORIDADES = [
  { value: "critica", label: "Crítica", color: "bg-red-600 text-white", icon: "🔴" },
  { value: "alta", label: "Alta", color: "bg-orange-500 text-white", icon: "🟠" },
  { value: "media", label: "Média", color: "bg-yellow-500 text-white", icon: "🟡" },
  { value: "baixa", label: "Baixa", color: "bg-green-500 text-white", icon: "🟢" },
] as const;

type Categoria = typeof CATEGORIAS[number]["value"];
type Prioridade = typeof PRIORIDADES[number]["value"];

export default function GoldenRulesPanel() {
  const { selectedCompanyId } = useCompany();
  const companyId = Number(selectedCompanyId) || 0;

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [categoria, setCategoria] = useState<Categoria>("geral");
  const [prioridade, setPrioridade] = useState<Prioridade>("alta");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [filterCategoria, setFilterCategoria] = useState<string>("all");

  const rulesQuery = trpc.goldenRules.list.useQuery({ companyId }, { enabled: companyId > 0 });
  const createMut = trpc.goldenRules.create.useMutation({
    onSuccess: () => { rulesQuery.refetch(); resetForm(); toast.success("Regra de Ouro criada com sucesso!"); },
    onError: (e: any) => toast.error(e.message),
  });
  const updateMut = trpc.goldenRules.update.useMutation({
    onSuccess: () => { rulesQuery.refetch(); resetForm(); toast.success("Regra atualizada!"); },
    onError: (e: any) => toast.error(e.message),
  });
  const deleteMut = trpc.goldenRules.delete.useMutation({
    onSuccess: () => { rulesQuery.refetch(); toast.success("Regra removida!"); },
    onError: (e: any) => toast.error(e.message),
  });

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setTitulo("");
    setDescricao("");
    setCategoria("geral");
    setPrioridade("alta");
  };

  const handleEdit = (rule: any) => {
    setEditingId(rule.id);
    setTitulo(rule.titulo);
    setDescricao(rule.descricao);
    setCategoria(rule.categoria);
    setPrioridade(rule.prioridade);
    setShowForm(true);
  };

  const handleSave = () => {
    if (!titulo.trim() || !descricao.trim()) {
      toast.error("Título e descrição são obrigatórios");
      return;
    }
    if (editingId) {
      updateMut.mutate({ id: editingId, companyId, titulo, descricao, categoria, prioridade });
    } else {
      createMut.mutate({ companyId, titulo, descricao, categoria, prioridade });
    }
  };

  const handleToggleActive = (rule: any) => {
    updateMut.mutate({ id: rule.id, companyId, isActive: rule.isActive ? 0 : 1 });
  };

  const rules = rulesQuery.data || [];
  const filteredRules = filterCategoria === "all" ? rules : rules.filter((r: any) => r.categoria === filterCategoria);
  const activeCount = rules.filter((r: any) => r.isActive).length;
  const getCategoriaInfo = (cat: string) => CATEGORIAS.find(c => c.value === cat) || CATEGORIAS[6];
  const getPrioridadeInfo = (pri: string) => PRIORIDADES.find(p => p.value === pri) || PRIORIDADES[1];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <Shield className="w-5 h-5 text-amber-600" />
            Regras de Ouro da Empresa
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Defina as regras invioláveis da empresa. A IA sempre consultará estas regras antes de gerar qualquer sugestão, 
            garantindo que nenhuma recomendação quebre as políticas da empresa.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right text-xs text-gray-500">
            <span className="font-semibold text-amber-600">{activeCount}</span> regras ativas de <span className="font-semibold">{rules.length}</span> total
          </div>
          <Button onClick={() => { resetForm(); setShowForm(true); }} className="bg-amber-600 hover:bg-amber-700">
            <Plus className="w-4 h-4 mr-1" /> Nova Regra
          </Button>
        </div>
      </div>

      {/* Filtro por categoria */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFilterCategoria("all")}
          className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${filterCategoria === "all" ? "bg-gray-800 text-white border-gray-800" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}
        >
          Todas ({rules.length})
        </button>
        {CATEGORIAS.map(cat => {
          const count = rules.filter((r: any) => r.categoria === cat.value).length;
          if (count === 0) return null;
          return (
            <button
              key={cat.value}
              onClick={() => setFilterCategoria(cat.value)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${filterCategoria === cat.value ? cat.color + " font-bold" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}
            >
              {cat.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Lista de Regras */}
      {filteredRules.length === 0 ? (
        <Card className="border-dashed border-2 border-amber-200">
          <CardContent className="py-12 text-center">
            <Shield className="w-12 h-12 mx-auto text-amber-300 mb-3" />
            <h3 className="font-semibold text-gray-600">Nenhuma Regra de Ouro cadastrada</h3>
            <p className="text-sm text-gray-400 mt-1">
              Cadastre as regras invioláveis da empresa para que a IA sempre as respeite.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredRules.map((rule: any) => {
            const catInfo = getCategoriaInfo(rule.categoria);
            const priInfo = getPrioridadeInfo(rule.prioridade);
            const isExpanded = expandedId === rule.id;
            return (
              <Card key={rule.id} className={`transition-all ${!rule.isActive ? "opacity-50 bg-gray-50" : ""}`}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    {/* Prioridade */}
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${priInfo.color}`}>
                      {priInfo.label}
                    </span>
                    {/* Categoria */}
                    <span className={`px-2 py-0.5 rounded text-[10px] font-medium border ${catInfo.color}`}>
                      {catInfo.label}
                    </span>
                    {/* Título */}
                    <span className="font-semibold text-sm text-gray-800 flex-1">{rule.titulo}</span>
                    {/* Status */}
                    <button
                      onClick={() => handleToggleActive(rule)}
                      className={`flex items-center gap-1 text-xs px-2 py-1 rounded ${rule.isActive ? "text-green-600 hover:bg-green-50" : "text-gray-400 hover:bg-gray-100"}`}
                    >
                      {rule.isActive ? <CheckCircle className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                      {rule.isActive ? "Ativa" : "Inativa"}
                    </button>
                    {/* Ações */}
                    <button onClick={() => handleEdit(rule)} className="text-gray-400 hover:text-blue-600 p-1">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => { if (confirm("Excluir esta regra de ouro?")) deleteMut.mutate({ id: rule.id, companyId }); }}
                      className="text-gray-400 hover:text-red-600 p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    {/* Expandir */}
                    <button onClick={() => setExpandedId(isExpanded ? null : rule.id)} className="text-gray-400 hover:text-gray-600 p-1">
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t text-sm text-gray-600 whitespace-pre-wrap">
                      {rule.descricao}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialog: Criar/Editar Regra */}
      <FullScreenDialog
        open={showForm}
        onClose={resetForm}
        title={editingId ? "Editar Regra de Ouro" : "Nova Regra de Ouro"}
        subtitle="Defina uma regra inviolável que a IA sempre respeitará ao gerar sugestões"
        headerColor="bg-gradient-to-r from-amber-700 to-amber-500"
      >
        <div className="max-w-2xl mx-auto space-y-5">
          <div>
            <label className="text-sm font-medium text-gray-700">Título da Regra *</label>
            <Input
              value={titulo}
              onChange={e => setTitulo(e.target.value)}
              placeholder="Ex: Todo trabalho em altura requer NR-35"
              className="mt-1"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700">Categoria *</label>
              <select
                value={categoria}
                onChange={e => setCategoria(e.target.value as Categoria)}
                className="w-full border rounded-md px-3 py-2 text-sm mt-1"
              >
                {CATEGORIAS.map(cat => (
                  <option key={cat.value} value={cat.value}>{cat.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Prioridade *</label>
              <select
                value={prioridade}
                onChange={e => setPrioridade(e.target.value as Prioridade)}
                className="w-full border rounded-md px-3 py-2 text-sm mt-1"
              >
                {PRIORIDADES.map(pri => (
                  <option key={pri.value} value={pri.value}>{pri.icon} {pri.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700">Descrição Detalhada *</label>
            <p className="text-xs text-gray-400 mb-1">
              Descreva a regra com detalhes suficientes para que a IA compreenda e nunca a quebre.
            </p>
            <textarea
              value={descricao}
              onChange={e => setDescricao(e.target.value)}
              placeholder="Ex: Todo funcionário que realizar trabalho em altura acima de 2 metros deve possuir treinamento NR-35 válido, utilizar cinto de segurança tipo paraquedista com talabarte duplo, e ter autorização expressa do técnico de segurança da obra..."
              rows={6}
              className="w-full border rounded-md px-3 py-2 text-sm resize-none"
            />
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <Shield className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-amber-700">
                <p className="font-semibold">Como a IA usa esta regra:</p>
                <p className="mt-1">
                  Sempre que a IA gerar uma descrição de função, Ordem de Serviço (NR-1), ou qualquer outra sugestão, 
                  ela consultará todas as Regras de Ouro ativas da empresa e garantirá que nenhuma recomendação 
                  contradiga estas regras. Regras com prioridade "Crítica" têm peso máximo na análise.
                </p>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={resetForm}>Cancelar</Button>
            <Button
              onClick={handleSave}
              disabled={createMut.isPending || updateMut.isPending}
              className="bg-amber-600 hover:bg-amber-700"
            >
              {(createMut.isPending || updateMut.isPending) ? "Salvando..." : editingId ? "Atualizar Regra" : "Criar Regra"}
            </Button>
          </div>
        </div>
      </FullScreenDialog>
    </div>
  );
}
