import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Save, Building2, Search, CheckSquare, Square, ChevronDown, X } from "lucide-react";
import { toast } from "sonner";

// ─── Combobox pesquisável genérico ────────────────────────────────────────────
function Combobox({
  placeholder, value, onChange, items, labelKey, searchPlaceholder,
}: {
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  items: any[];
  labelKey: (item: any) => string;
  searchPlaceholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = items.find(i => String(i.id) === value);
  const filtered = items.filter(i =>
    labelKey(i).toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => { setOpen(o => !o); setSearch(""); }}
        className="w-full flex items-center justify-between border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white hover:border-gray-300 transition-colors text-left"
      >
        <span className={selected ? "text-gray-900" : "text-gray-400"}>
          {selected ? labelKey(selected) : placeholder}
        </span>
        <div className="flex items-center gap-1">
          {value && (
            <span
              role="button"
              tabIndex={0}
              onClick={e => { e.stopPropagation(); onChange(""); setOpen(false); }}
              onKeyDown={e => e.key === "Enter" && onChange("")}
              className="p-0.5 hover:text-red-500 text-gray-400"
            >
              <X className="w-3 h-3" />
            </span>
          )}
          <ChevronDown className="w-4 h-4 text-gray-400" />
        </div>
      </button>

      {open && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg">
          <div className="p-2 border-b border-gray-100">
            <div className="flex items-center gap-2 bg-gray-50 rounded-md px-2">
              <Search className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
              <input
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={searchPlaceholder || "Buscar..."}
                className="w-full py-1.5 text-sm bg-transparent outline-none text-gray-700 placeholder:text-gray-400"
              />
            </div>
          </div>
          <div className="max-h-52 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-3">Nenhum resultado</p>
            ) : filtered.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => { onChange(String(item.id)); setOpen(false); setSearch(""); }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 hover:text-blue-700 transition-colors ${String(item.id) === value ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-700"}`}
              >
                {labelKey(item)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── MultiSelect de atividades ─────────────────────────────────────────────────
function AtividadesSelect({
  atividades, selected, onToggle,
}: {
  atividades: any[];
  selected: number[];
  onToggle: (id: number) => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = atividades.filter(a =>
    !a.isGrupo && (
      (a.nome || "").toLowerCase().includes(search.toLowerCase()) ||
      (a.eapCodigo || "").toLowerCase().includes(search.toLowerCase())
    )
  );

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-100">
        <Search className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Filtrar atividade..."
          className="w-full text-sm bg-transparent outline-none text-gray-700 placeholder:text-gray-400"
        />
        {selected.length > 0 && (
          <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full flex-shrink-0">
            {selected.length} selecionada{selected.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>
      <div className="max-h-56 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">
            {search ? "Nenhuma atividade encontrada" : "Sem atividades disponíveis"}
          </p>
        ) : filtered.map(a => {
          const isSelected = selected.includes(a.id);
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => onToggle(a.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left border-b border-gray-50 hover:bg-blue-50 transition-colors ${isSelected ? "bg-blue-50" : ""}`}
            >
              {isSelected ? (
                <CheckSquare className="w-4 h-4 text-blue-600 flex-shrink-0" />
              ) : (
                <Square className="w-4 h-4 text-gray-300 flex-shrink-0" />
              )}
              <span className={`flex-1 ${isSelected ? "text-blue-700 font-medium" : "text-gray-700"}`}>
                {a.eapCodigo && <span className="text-gray-400 font-mono mr-1.5">{a.eapCodigo}</span>}
                {a.nome}
              </span>
              {a.unidade && (
                <span className="text-xs text-gray-400 flex-shrink-0">{a.unidade}</span>
              )}
            </button>
          );
        })}
      </div>
      {filtered.length > 0 && (
        <div className="px-3 py-1.5 bg-gray-50 border-t border-gray-100 flex gap-2">
          <button
            type="button"
            onClick={() => filtered.forEach(a => { if (!selected.includes(a.id)) onToggle(a.id); })}
            className="text-xs text-blue-600 hover:underline"
          >Selecionar todos</button>
          <span className="text-xs text-gray-300">|</span>
          <button
            type="button"
            onClick={() => filtered.forEach(a => { if (selected.includes(a.id)) onToggle(a.id); })}
            className="text-xs text-gray-500 hover:underline"
          >Limpar</button>
        </div>
      )}
    </div>
  );
}

// ─── ContratoNovo ──────────────────────────────────────────────────────────────
export default function ContratoNovo() {
  const [, navigate] = useLocation();
  const { companyId } = useCompany();

  const [form, setForm] = useState({
    empresaTerceiraId: "",
    obraId: "",
    descricao: "",
    tipoContrato: "empreitada_global",
    dataInicio: "",
    dataTermino: "",
    observacoes: "",
  });
  const [selectedProjetoId, setSelectedProjetoId] = useState<number | null>(null);
  const [selectedAtividades, setSelectedAtividades] = useState<number[]>([]);

  const { data: empresas = [] } = trpc.terceiros.empresas.list.useQuery(
    { companyId: companyId ?? 0 },
    { enabled: (companyId ?? 0) > 0 }
  );

  const { data: obrasAll = [] } = trpc.obras.listActive.useQuery(
    { companyId: companyId ?? 0 },
    { enabled: (companyId ?? 0) > 0 }
  );

  const { data: projetos = [] } = trpc.planejamento.listarProjetos.useQuery(
    { companyId: companyId ?? 0 },
    { enabled: (companyId ?? 0) > 0 }
  );

  const { data: atividades = [] } = trpc.terceiroContratos.listarAtividadesProjeto.useQuery(
    { projetoId: selectedProjetoId! },
    { enabled: !!selectedProjetoId }
  );

  // listActive já retorna apenas obras ativas (isActive=1) — sem filtro adicional
  const obrasAtivas = obrasAll as any[];

  // Auto-detecta projeto quando obra muda
  useEffect(() => {
    if (form.obraId) {
      const projeto = (projetos as any[]).find(p => String(p.obraId) === form.obraId);
      setSelectedProjetoId(projeto?.id ?? null);
    } else {
      setSelectedProjetoId(null);
    }
    setSelectedAtividades([]);
  }, [form.obraId, projetos]);

  const importarMut = trpc.terceiroContratos.importarAtividadesPlanejamento.useMutation({
    onSuccess: () => toast.success("Atividades do planejamento vinculadas!"),
    onError: (e) => toast.error(`Erro ao importar atividades: ${e.message}`),
  });

  const criarMutation = trpc.terceiroContratos.criarContrato.useMutation({
    onSuccess: (c) => {
      toast.success(`Contrato ${c.numeroContrato} criado com sucesso!`);
      if (selectedAtividades.length > 0 && selectedProjetoId) {
        importarMut.mutate({
          contratoId: c.id,
          companyId: companyId ?? 0,
          projetoId: selectedProjetoId,
          atividadeIds: selectedAtividades,
        });
      }
      navigate(`/terceiros/contratos/${c.id}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const set = (k: string) => (v: string) => setForm(f => ({ ...f, [k]: v }));
  const setInput = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const toggleAtividade = (id: number) =>
    setSelectedAtividades(prev => prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]);

  const handleSalvar = () => {
    if (!form.empresaTerceiraId) return toast.error("Selecione a empresa terceira");
    if (!form.descricao.trim()) return toast.error("Informe a descrição do contrato");
    const obraObj = (obrasAll as any[]).find(o => String(o.id) === form.obraId);
    criarMutation.mutate({
      companyId: companyId ?? 0,
      empresaTerceiraId: parseInt(form.empresaTerceiraId),
      obraId: form.obraId ? parseInt(form.obraId) : undefined,
      obraNome: obraObj?.nome,
      descricao: form.descricao,
      tipoContrato: form.tipoContrato,
      planejamentoProjetoId: selectedProjetoId ?? undefined,
      dataInicio: form.dataInicio || undefined,
      dataTermino: form.dataTermino || undefined,
      observacoes: form.observacoes || undefined,
    });
  };

  const isLoading = criarMutation.isPending || importarMut.isPending;

  return (
    <DashboardLayout>
      <div className="p-5 max-w-2xl mx-auto space-y-6">
        {/* Cabeçalho */}
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/terceiros/contratos")} className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Novo Contrato de Serviço</h1>
            <p className="text-sm text-gray-500">O número e o valor são gerados automaticamente após salvar</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          <div className="flex items-center gap-2 text-blue-700 font-semibold text-sm border-b border-gray-100 pb-3">
            <Building2 className="w-4 h-4" /> Dados do Contrato
          </div>

          <div className="grid grid-cols-2 gap-4">

            {/* Empresa Terceira */}
            <div className="col-span-2">
              <Label className="mb-1 block">Empresa Terceira *</Label>
              <Combobox
                placeholder="Busque ou selecione a empresa..."
                value={form.empresaTerceiraId}
                onChange={set("empresaTerceiraId")}
                items={empresas as any[]}
                labelKey={e => `${e.nomeFantasia || e.razaoSocial}${e.cnpj ? ` — ${e.cnpj}` : ""}`}
                searchPlaceholder="Digite nome, fantasia ou CNPJ..."
              />
              {(empresas as any[]).length === 0 && (
                <p className="text-xs text-amber-600 mt-1">Nenhuma empresa terceira cadastrada. Cadastre primeiro em Empresas Terceiras.</p>
              )}
            </div>

            {/* Descrição */}
            <div className="col-span-2">
              <Label className="mb-1 block">Descrição do Serviço *</Label>
              <Input
                placeholder="Ex: Execução de instalação elétrica geral — Bloco A"
                value={form.descricao}
                onChange={setInput("descricao")}
              />
            </div>

            {/* Tipo de Contrato */}
            <div className="col-span-2">
              <Label className="mb-1 block">Tipo de Contrato</Label>
              <Select value={form.tipoContrato} onValueChange={set("tipoContrato")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="empreitada_global">Empreitada Global</SelectItem>
                  <SelectItem value="preco_unitario">Preço Unitário</SelectItem>
                  <SelectItem value="misto">Misto</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Obra */}
            <div className="col-span-2">
              <Label className="mb-1 block">Obra</Label>
              <Combobox
                placeholder="Busque ou selecione a obra..."
                value={form.obraId}
                onChange={set("obraId")}
                items={obrasAtivas}
                labelKey={o => `${o.codigo ? o.codigo + " — " : ""}${o.nome}`}
                searchPlaceholder="Digite código ou nome da obra..."
              />
              {obrasAtivas.length === 0 && (
                <p className="text-xs text-amber-600 mt-1">Nenhuma obra ativa encontrada no sistema.</p>
              )}
            </div>

            {/* Atividades do Planejamento */}
            {form.obraId && (
              <div className="col-span-2">
                {!selectedProjetoId ? (
                  <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-700">
                    Nenhum planejamento encontrado para esta obra. Você pode vincular atividades depois, na tela do contrato.
                  </div>
                ) : (
                  <>
                    <Label className="mb-1 block">
                      Atividades do Planejamento
                      <span className="text-gray-400 font-normal ml-1">(selecione as que fazem parte do contrato)</span>
                    </Label>
                    {atividades.length === 0 ? (
                      <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 text-xs text-gray-500">
                        Planejamento encontrado, mas sem atividades cadastradas.
                      </div>
                    ) : (
                      <AtividadesSelect
                        atividades={atividades as any[]}
                        selected={selectedAtividades}
                        onToggle={toggleAtividade}
                      />
                    )}
                  </>
                )}
              </div>
            )}

            {/* Datas */}
            <div>
              <Label className="mb-1 block">Data Início</Label>
              <Input type="date" value={form.dataInicio} onChange={setInput("dataInicio")} />
            </div>
            <div>
              <Label className="mb-1 block">Data Término</Label>
              <Input type="date" value={form.dataTermino} onChange={setInput("dataTermino")} />
            </div>

            {/* Observações */}
            <div className="col-span-2">
              <Label className="mb-1 block">Observações</Label>
              <Textarea
                rows={3}
                placeholder="Condições especiais, retenções, FD, etc."
                value={form.observacoes}
                onChange={setInput("observacoes")}
              />
            </div>
          </div>

          <div className="pt-2 bg-blue-50 rounded-lg p-3 text-xs text-blue-700">
            <strong>Nº e valor gerados automaticamente:</strong> O número do contrato (CT-{new Date().getFullYear()}-XXX) será gerado ao salvar. O valor total é calculado automaticamente conforme você preencher os valores nos itens após criar o contrato.
          </div>
        </div>

        <div className="flex gap-3 justify-end">
          <Button variant="outline" onClick={() => navigate("/terceiros/contratos")}>Cancelar</Button>
          <Button
            onClick={handleSalvar}
            disabled={isLoading}
            className="gap-2 bg-blue-600 hover:bg-blue-700"
          >
            <Save className="w-4 h-4" />
            {isLoading ? "Salvando..." : "Criar Contrato"}
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}
