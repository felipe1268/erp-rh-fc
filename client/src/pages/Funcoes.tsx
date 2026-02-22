import DashboardLayout from "@/components/DashboardLayout";
import PrintActions from "@/components/PrintActions";
import PrintHeader from "@/components/PrintHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { Plus, Search, Pencil, Trash2, Briefcase, Sparkles, FileText, Shield, ChevronDown, ChevronUp, Loader2, Users } from "lucide-react";
import FullScreenDialog from "@/components/FullScreenDialog";
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { useCompany } from "@/contexts/CompanyContext";

type FuncaoForm = { nome: string; descricao: string; ordemServico: string; cbo: string };
const emptyForm: FuncaoForm = { nome: "", descricao: "", ordemServico: "", cbo: "" };

type CboItem = { cod: string; desc: string };

function useCboData() {
  const [cboList, setCboList] = useState<CboItem[]>([]);
  useEffect(() => {
    fetch("/cbo.json")
      .then(r => r.json())
      .then((data: CboItem[]) => setCboList(data))
      .catch(() => {});
  }, []);
  return cboList;
}

function CboAutocomplete({ value, onChange, onSelect }: { value: string; onChange: (v: string) => void; onSelect: (item: CboItem) => void }) {
  const cboList = useCboData();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const s = (search || value).toLowerCase().trim();
    if (!s || s.length < 2) return [];
    return cboList.filter(c =>
      c.desc.toLowerCase().includes(s) || c.cod.includes(s)
    ).slice(0, 15);
  }, [cboList, search, value]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <Input
        value={value}
        onChange={e => { onChange(e.target.value); setSearch(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Digite para buscar na base CBO do governo..."
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {filtered.map(item => (
            <button
              key={item.cod}
              type="button"
              className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm flex items-center justify-between gap-2 border-b last:border-0"
              onClick={() => { onSelect(item); setOpen(false); setSearch(""); }}
            >
              <span className="font-medium">{item.desc}</span>
              <span className="text-xs font-mono text-muted-foreground bg-gray-100 px-1.5 py-0.5 rounded shrink-0">{item.cod}</span>
            </button>
          ))}
        </div>
      )}
      {open && search.length >= 2 && filtered.length === 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border rounded-lg shadow-lg p-3 text-sm text-muted-foreground">
          Nenhuma CBO encontrada para "{search}"
        </div>
      )}
    </div>
  );
}

export default function Funcoes() {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) : 0;
  const funcoesQ = trpc.jobFunctions.list.useQuery({ companyId }, { enabled: !!companyId });
  const funcoes = funcoesQ.data ?? [];

  const createMut = trpc.jobFunctions.create.useMutation({ onSuccess: () => { funcoesQ.refetch(); setDialogOpen(false); toast.success("Função criada com sucesso!"); } });
  const updateMut = trpc.jobFunctions.update.useMutation({ onSuccess: () => { funcoesQ.refetch(); setDialogOpen(false); toast.success("Função atualizada!"); } });
  const deleteMut = trpc.jobFunctions.delete.useMutation({ onSuccess: () => { funcoesQ.refetch(); toast.success("Função excluída!"); } });
  const generateDescMut = trpc.goldenRules.generateJobDescription.useMutation();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FuncaoForm>(emptyForm);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [viewingId, setViewingId] = useState<number | null>(null);
  const [generatingDesc, setGeneratingDesc] = useState(false);
  const [generatingOS, setGeneratingOS] = useState(false);

  const filtered = useMemo(() => {
    if (!search) return funcoes;
    const s = search.toLowerCase();
    return funcoes.filter((f: any) => f.nome?.toLowerCase().includes(s) || (f.descricao || "").toLowerCase().includes(s) || (f.cbo || "").includes(s));
  }, [funcoes, search]);

  const openNew = () => { setEditingId(null); setForm(emptyForm); setDialogOpen(true); };
  const openEdit = (fn: any) => {
    setEditingId(fn.id);
    setForm({ nome: fn.nome || "", descricao: fn.descricao || "", ordemServico: fn.ordemServico || "", cbo: fn.cbo || "" });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.nome.trim()) { toast.error("Nome da função é obrigatório"); return; }
    if (!form.descricao.trim()) { toast.error("Descrição da função é obrigatória. Use o botão IA para gerar automaticamente."); return; }
    if (editingId) {
      updateMut.mutate({ id: editingId, companyId, nome: form.nome, descricao: form.descricao, ordemServico: form.ordemServico || undefined, cbo: form.cbo || undefined });
    } else {
      createMut.mutate({ companyId, nome: form.nome, descricao: form.descricao, ordemServico: form.ordemServico || undefined, cbo: form.cbo || undefined });
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("Tem certeza que deseja excluir esta função?")) {
      deleteMut.mutate({ id, companyId });
    }
  };

  const handleGenerateDescription = async () => {
    if (!form.nome.trim()) { toast.error("Preencha o nome da função primeiro"); return; }
    setGeneratingDesc(true);
    try {
      const result = await generateDescMut.mutateAsync({
        companyId,
        nomeFuncao: form.nome,
        cbo: form.cbo || undefined,
      });
      setForm(f => ({ ...f, descricao: result.descricao, ordemServico: result.ordemServico }));
      toast.success("Descrição gerada pela IA! Revise e ajuste se necessário.");
    } catch (e: any) {
      toast.error(e.message || "Erro ao gerar descrição");
    } finally {
      setGeneratingDesc(false);
    }
  };

  const handleGenerateOS = async () => {
    if (!form.nome.trim()) { toast.error("Preencha o nome da função primeiro"); return; }
    setGeneratingOS(true);
    try {
      const result = await generateDescMut.mutateAsync({
        companyId,
        nomeFuncao: form.nome,
        cbo: form.cbo || undefined,
      });
      setForm(f => ({ ...f, ordemServico: result.ordemServico, descricao: result.descricao }));
      toast.success("Ordem de Serviço gerada pela IA! Revise e ajuste se necessário.");
    } catch (e: any) {
      toast.error(e.message || "Erro ao gerar Ordem de Serviço");
    } finally {
      setGeneratingOS(false);
    }
  };

  const viewingFn = viewingId ? funcoes.find((f: any) => f.id === viewingId) : null;

  // Buscar funcionários vinculados à função visualizada
  const employeesQ = trpc.employees.list.useQuery(
    { companyId },
    { enabled: !!companyId && !!viewingId }
  );
  const funcionariosVinculados = useMemo(() => {
    if (!viewingFn || !employeesQ.data) return [];
    return employeesQ.data.filter((e: any) => 
      e.funcao?.toUpperCase() === viewingFn.nome?.toUpperCase() && e.status === "Ativo"
    );
  }, [viewingFn, employeesQ.data]);

  // Stats
  const totalFuncoes = funcoes.length;
  const comDescricao = funcoes.filter((f: any) => f.descricao && f.descricao.trim().length > 20).length;
  const comOS = funcoes.filter((f: any) => f.ordemServico && f.ordemServico.trim().length > 20).length;
  const comCBO = funcoes.filter((f: any) => f.cbo && f.cbo.trim()).length;

  return (
    <DashboardLayout>
      <PrintHeader />
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Funções / Cargos</h1>
            <p className="text-muted-foreground text-sm">Cadastro de funções com descrição de atividades e Ordem de Serviço (NR-1)</p>
          </div>
          <div className="flex items-center gap-3">
            <PrintActions title="Funções" />
            <Button onClick={openNew} className="bg-[#1B2A4A] hover:bg-[#243660]">
              <Plus className="h-4 w-4 mr-2" /> Nova Função
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3">
          <div className="bg-white border rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-[#1B2A4A]">{totalFuncoes}</div>
            <div className="text-xs text-gray-500">Total de Funções</div>
          </div>
          <div className="bg-white border rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-green-600">{comCBO}</div>
            <div className="text-xs text-gray-500">Com CBO</div>
          </div>
          <div className="bg-white border rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-blue-600">{comDescricao}</div>
            <div className="text-xs text-gray-500">Com Descrição</div>
          </div>
          <div className="bg-white border rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-amber-600">{comOS}</div>
            <div className="text-xs text-gray-500">Com Ordem de Serviço</div>
          </div>
        </div>

        {/* Busca */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por nome, CBO ou descrição..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
          </div>
        </div>

        {/* Lista */}
        {filtered.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Briefcase className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="font-semibold text-lg">Nenhuma função encontrada</h3>
              <p className="text-muted-foreground text-sm mt-1">Cadastre a primeira função.</p>
              <Button onClick={openNew} className="mt-4 bg-[#1B2A4A] hover:bg-[#243660]">
                <Plus className="h-4 w-4 mr-2" /> Nova Função
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {filtered.map((fn: any) => {
              const isExpanded = expandedId === fn.id;
              const hasDesc = fn.descricao && fn.descricao.trim().length > 20;
              const hasOS = fn.ordemServico && fn.ordemServico.trim().length > 20;
              return (
                <Card key={fn.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setViewingId(fn.id)}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-[#1B2A4A]/10 flex items-center justify-center shrink-0">
                        <Briefcase className="h-5 w-5 text-[#1B2A4A]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-base hover:text-blue-700 transition-colors">{fn.nome}</h3>
                          {fn.cbo && <span className="text-xs text-muted-foreground font-mono bg-gray-100 px-1.5 py-0.5 rounded">CBO: {fn.cbo}</span>}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${hasDesc ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                            <FileText className="w-3 h-3" />
                            {hasDesc ? "Descrição OK" : "Sem Descrição"}
                          </span>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${hasOS ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-500"}`}>
                            <Shield className="w-3 h-3" />
                            {hasOS ? "OS NR-1 OK" : "Sem OS NR-1"}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                        <Button variant="ghost" size="sm" onClick={() => openEdit(fn)} className="text-gray-500 hover:text-blue-600">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" className="text-gray-500 hover:text-red-600" onClick={() => handleDelete(fn.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setExpandedId(isExpanded ? null : fn.id)} className="text-gray-400">
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t space-y-3">
                        {fn.descricao && (
                          <div>
                            <h4 className="text-xs font-semibold text-gray-500 uppercase mb-1">Descrição da Função</h4>
                            <p className="text-sm text-gray-700 whitespace-pre-wrap">{fn.descricao}</p>
                          </div>
                        )}
                        {fn.ordemServico && (
                          <div>
                            <h4 className="text-xs font-semibold text-amber-600 uppercase mb-1 flex items-center gap-1">
                              <Shield className="w-3 h-3" /> Ordem de Serviço (NR-1)
                            </h4>
                            <p className="text-sm text-gray-700 whitespace-pre-wrap">{fn.ordemServico}</p>
                          </div>
                        )}
                        {!fn.descricao && !fn.ordemServico && (
                          <p className="text-sm text-gray-400 italic">Nenhuma descrição ou Ordem de Serviço cadastrada. Edite a função para preencher.</p>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Dialog: Criar/Editar Função */}
      <FullScreenDialog open={dialogOpen} onClose={() => setDialogOpen(false)} title={editingId ? "Editar Função" : "Nova Função"} subtitle="Preencha os dados da função. A descrição e a Ordem de Serviço podem ser geradas pela IA." icon={<Briefcase className="h-5 w-5 text-white" />}>
        <div className="max-w-2xl mx-auto">
          <div className="space-y-5">
            {/* Nome e CBO */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Nome da Função *</Label>
                <CboAutocomplete
                  value={form.nome}
                  onChange={v => setForm(f => ({ ...f, nome: v }))}
                  onSelect={item => setForm(f => ({ ...f, nome: item.desc.toUpperCase(), cbo: item.cod }))}
                />
                <p className="text-xs text-muted-foreground mt-1">Digite para buscar na base CBO do governo (2.450 ocupações)</p>
              </div>
              <div>
                <Label>CBO (Classificação Brasileira de Ocupações)</Label>
                <Input
                  value={form.cbo}
                  readOnly
                  className="bg-gray-50 font-mono cursor-not-allowed"
                  placeholder="Preenchido automaticamente"
                />
                <p className="text-xs text-muted-foreground mt-1">Preenchido automaticamente ao selecionar a função</p>
              </div>
            </div>

            {/* Descrição da Função */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label className="flex items-center gap-1">
                  <FileText className="w-4 h-4 text-blue-600" />
                  Descrição da Função e Atividades *
                </Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleGenerateDescription}
                  disabled={generatingDesc || !form.nome.trim()}
                  className="text-blue-600 border-blue-200 hover:bg-blue-50"
                >
                  {generatingDesc ? (
                    <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Gerando...</>
                  ) : (
                    <><Sparkles className="h-3.5 w-3.5 mr-1" /> Gerar com IA</>
                  )}
                </Button>
              </div>
              <p className="text-xs text-gray-400 mb-1">
                Descreva as atividades e responsabilidades da função conforme a CBO. A IA gera automaticamente consultando as Regras de Ouro da empresa.
              </p>
              <Textarea
                value={form.descricao}
                onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                rows={8}
                placeholder="Descreva as atividades, responsabilidades e requisitos da função..."
                className={!form.descricao.trim() ? "border-red-300" : ""}
              />
              {!form.descricao.trim() && (
                <p className="text-xs text-red-500 mt-1">Campo obrigatório. Use o botão "Gerar com IA" para preenchimento automático.</p>
              )}
            </div>

            {/* Ordem de Serviço NR-1 */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label className="flex items-center gap-1">
                  <Shield className="w-4 h-4 text-amber-600" />
                  Ordem de Serviço - NR-1
                </Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleGenerateOS}
                  disabled={generatingOS || !form.nome.trim()}
                  className="text-amber-600 border-amber-200 hover:bg-amber-50"
                >
                  {generatingOS ? (
                    <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Gerando...</>
                  ) : (
                    <><Sparkles className="h-3.5 w-3.5 mr-1" /> Gerar com IA</>
                  )}
                </Button>
              </div>
              <p className="text-xs text-gray-400 mb-1">
                Conforme NR-1, a Ordem de Serviço informa ao trabalhador sobre riscos, medidas de proteção e procedimentos de segurança da função.
              </p>
              <Textarea
                value={form.ordemServico}
                onChange={e => setForm(f => ({ ...f, ordemServico: e.target.value }))}
                rows={8}
                placeholder="Riscos ocupacionais, medidas de proteção, EPIs obrigatórios, procedimentos de segurança..."
              />
            </div>

            {/* Info box */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-blue-700">
                  <p className="font-semibold">Como funciona a IA:</p>
                  <p className="mt-1">
                    Ao clicar em "Gerar com IA", o sistema consulta as <strong>Regras de Ouro</strong> cadastradas da empresa 
                    e gera o texto conforme a legislação (CBO, NRs, CLT). Você pode revisar, editar e ajustar antes de salvar.
                    A IA nunca sugere algo que quebre as regras da empresa.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={createMut.isPending || updateMut.isPending} className="bg-[#1B2A4A] hover:bg-[#243660]">
              {createMut.isPending || updateMut.isPending ? "Salvando..." : "Salvar Função"}
            </Button>
          </div>
        </div>
      </FullScreenDialog>

      {/* Dialog: Visualizar Função */}
      <FullScreenDialog
        open={!!viewingFn}
        onClose={() => setViewingId(null)}
        title={viewingFn?.nome || "Função"}
        subtitle={viewingFn?.cbo ? `CBO: ${viewingFn.cbo}` : undefined}
        icon={<Briefcase className="h-5 w-5 text-white" />}
      >
        {viewingFn && (
          <div className="max-w-3xl mx-auto space-y-6">
            {/* Descrição */}
            <div>
              <h3 className="text-sm font-semibold text-gray-500 uppercase flex items-center gap-2 mb-2">
                <FileText className="w-4 h-4 text-blue-600" />
                Descrição da Função e Atividades
              </h3>
              {viewingFn.descricao ? (
                <div className="bg-white border rounded-lg p-4 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                  {viewingFn.descricao}
                </div>
              ) : (
                <div className="bg-gray-50 border border-dashed rounded-lg p-4 text-sm text-gray-400 italic text-center">
                  Nenhuma descrição cadastrada. Edite a função para preencher.
                </div>
              )}
            </div>

            {/* Ordem de Serviço NR-1 */}
            <div>
              <h3 className="text-sm font-semibold text-amber-600 uppercase flex items-center gap-2 mb-2">
                <Shield className="w-4 h-4" />
                Ordem de Serviço - NR-1
              </h3>
              {viewingFn.ordemServico ? (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                  {viewingFn.ordemServico}
                </div>
              ) : (
                <div className="bg-gray-50 border border-dashed rounded-lg p-4 text-sm text-gray-400 italic text-center">
                  Nenhuma Ordem de Serviço cadastrada. Edite a função para preencher.
                </div>
              )}
            </div>

            {/* Funcionários Vinculados */}
            <div>
              <h3 className="text-sm font-semibold text-teal-600 uppercase flex items-center gap-2 mb-2">
                <Users className="w-4 h-4" />
                Funcionários Ativos nesta Função ({funcionariosVinculados.length})
              </h3>
              {funcionariosVinculados.length > 0 ? (
                <div className="bg-white border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-teal-50 border-b">
                        <th className="p-2 text-left font-medium text-teal-900">Nome</th>
                        <th className="p-2 text-left font-medium text-teal-900">CPF</th>
                        <th className="p-2 text-left font-medium text-teal-900">Setor</th>
                        <th className="p-2 text-left font-medium text-teal-900">Admissão</th>
                      </tr>
                    </thead>
                    <tbody>
                      {funcionariosVinculados.map((emp: any) => (
                        <tr key={emp.id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="p-2 font-medium">{emp.nomeCompleto}</td>
                          <td className="p-2 text-xs font-mono">{emp.cpf}</td>
                          <td className="p-2 text-xs">{emp.setor || "—"}</td>
                          <td className="p-2 text-xs">{emp.dataAdmissao ? new Date(emp.dataAdmissao + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="bg-gray-50 border border-dashed rounded-lg p-4 text-sm text-gray-400 italic text-center">
                  Nenhum funcionário ativo vinculado a esta função.
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button variant="outline" onClick={() => setViewingId(null)}>Fechar</Button>
              <Button onClick={() => { setViewingId(null); openEdit(viewingFn); }} className="bg-[#1B2A4A] hover:bg-[#243660]">
                <Pencil className="h-4 w-4 mr-2" /> Editar Função
              </Button>
            </div>
          </div>
        )}
      </FullScreenDialog>
    </DashboardLayout>
  );
}
