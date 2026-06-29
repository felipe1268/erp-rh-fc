/**
 * ExtratoTemplateTab.tsx — Rev. 3877
 * Aba "Templates de Extrato" em Configurações.
 * Permite cadastrar instruções por banco para guiar a IA na extração de
 * transações de PDF. Cada template define:
 *   • Nome do banco
 *   • Palavras-chave de identificação automática no PDF
 *   • Prefixos de linha a ignorar (ex: "Saldo do dia")
 *   • Instruções extras para a IA
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  FileText, Plus, Pencil, Trash2, Save, X, ChevronDown, ChevronUp,
  Landmark, Search, Info, CheckCircle2, AlertCircle,
} from "lucide-react";

interface Template {
  id: number;
  companyId: number;
  bancoNome: string;
  palavrasChave: string[];
  skipPrefixes: string[];
  instrucoesIa: string;
  ativo: boolean;
  criadoEm: string;
  atualizadoEm: string;
}

const EMPTY: Omit<Template, "id" | "companyId" | "criadoEm" | "atualizadoEm"> = {
  bancoNome: "",
  palavrasChave: [],
  skipPrefixes: [],
  instrucoesIa: "",
  ativo: true,
};

// Template pré-configurado para o Santander IBPJ (Internet Banking PJ).
const PRESET_SANTANDER_IBPJ = {
  bancoNome: "Santander — Internet Banking PJ (IBPJ)",
  palavrasChave: ["Internet Banking Empresarial", "IBPJ"],
  skipPrefixes: ["Saldo do dia", "Saldo anterior", "Saldo em"],
  instrucoesIa: `Extrato do Santander Internet Banking PJ (IBPJ).
Cada linha tem: DATA (DD/MM/AAAA) + DESCRIÇÃO + VALOR.
- Débito: valor precedido de "- R$".
- Crédito: valor precedido apenas de "R$" (sem "-").
Ignore linhas que começam com "Saldo do dia", "Saldo anterior" ou similares.`,
  ativo: true,
};

// Converte array de strings para texto (uma por linha) e vice-versa.
const arrToText = (arr: string[]) => arr.join("\n");
const textToArr = (t: string) =>
  t.split("\n").map(s => s.trim()).filter(Boolean);

export default function ExtratoTemplateTab() {
  const { companyId } = useCompany();
  const utils = trpc.useUtils();

  const { data: templates = [], isLoading } = trpc.bankStatementTemplates.list.useQuery(
    { companyId },
    { enabled: !!companyId }
  );

  const createMut  = trpc.bankStatementTemplates.create.useMutation();
  const updateMut  = trpc.bankStatementTemplates.update.useMutation();
  const deleteMut  = trpc.bankStatementTemplates.delete.useMutation();

  const [editId, setEditId] = useState<number | "new" | null>(null);
  const [form, setForm]     = useState(EMPTY);
  const [kwText, setKwText] = useState("");  // palavrasChave como texto
  const [spText, setSpText] = useState("");  // skipPrefixes como texto
  const [expandId, setExpandId] = useState<number | null>(null);

  function openNew(preset?: typeof PRESET_SANTANDER_IBPJ) {
    const base = preset ?? EMPTY;
    setForm({ ...base });
    setKwText(arrToText(base.palavrasChave));
    setSpText(arrToText(base.skipPrefixes));
    setEditId("new");
  }

  function openEdit(t: Template) {
    setForm({
      bancoNome:     t.bancoNome,
      palavrasChave: t.palavrasChave,
      skipPrefixes:  t.skipPrefixes,
      instrucoesIa:  t.instrucoesIa,
      ativo:         t.ativo,
    });
    setKwText(arrToText(t.palavrasChave));
    setSpText(arrToText(t.skipPrefixes));
    setEditId(t.id);
  }

  function closeEdit() {
    setEditId(null);
    setForm(EMPTY);
    setKwText("");
    setSpText("");
  }

  async function handleSave() {
    if (!form.bancoNome.trim()) {
      toast.error("Informe o nome do banco.");
      return;
    }
    const payload = {
      companyId,
      bancoNome:     form.bancoNome.trim(),
      palavrasChave: textToArr(kwText),
      skipPrefixes:  textToArr(spText),
      instrucoesIa:  form.instrucoesIa.trim(),
      ativo:         form.ativo,
    };
    try {
      if (editId === "new") {
        await createMut.mutateAsync(payload);
        toast.success("Template criado com sucesso.");
      } else {
        await updateMut.mutateAsync({ ...payload, id: editId as number });
        toast.success("Template atualizado.");
      }
      utils.bankStatementTemplates.list.invalidate({ companyId });
      closeEdit();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao salvar template.");
    }
  }

  async function handleDelete(id: number, nome: string) {
    if (!window.confirm(`Excluir o template "${nome}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await deleteMut.mutateAsync({ id, companyId });
      toast.success("Template excluído.");
      utils.bankStatementTemplates.list.invalidate({ companyId });
      if (editId === id) closeEdit();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao excluir.");
    }
  }

  const isSaving = createMut.isPending || updateMut.isPending;

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="rounded-xl border border-sky-200 bg-sky-50/60 px-4 py-3">
        <p className="text-sm font-semibold text-sky-800 flex items-center gap-2">
          <Landmark className="w-4 h-4" /> Templates de Extrato Bancário
        </p>
        <p className="text-xs text-sky-700/80 mt-0.5">
          Configure instruções por banco para guiar a leitura automática de extratos em PDF.
          Quando nenhum parser determinístico reconhece o formato, a IA usa essas instruções.
        </p>
      </div>

      {/* Botões de ação */}
      {editId === null && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => openNew()} className="gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Novo template
          </Button>
          {templates.length === 0 && (
            <Button
              size="sm" variant="outline"
              className="gap-1.5 border-sky-300 text-sky-700 hover:bg-sky-50"
              onClick={() => openNew(PRESET_SANTANDER_IBPJ)}
            >
              <Landmark className="w-3.5 h-3.5" />
              Usar preset: Santander IBPJ
            </Button>
          )}
        </div>
      )}

      {/* Formulário de criação/edição */}
      {editId !== null && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-semibold text-gray-800 text-sm">
              {editId === "new" ? "Novo template" : "Editar template"}
            </h3>
            <button onClick={closeEdit} className="text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Nome do banco */}
          <div className="space-y-1">
            <Label className="text-xs font-medium text-gray-700">Nome do banco / layout *</Label>
            <Input
              value={form.bancoNome}
              onChange={e => setForm(f => ({ ...f, bancoNome: e.target.value }))}
              placeholder="Ex: Santander IBPJ, Itaú PJ, Bradesco Web..."
              className="text-sm"
            />
          </div>

          {/* Palavras-chave */}
          <div className="space-y-1">
            <Label className="text-xs font-medium text-gray-700 flex items-center gap-1.5">
              <Search className="w-3.5 h-3.5 text-gray-400" />
              Palavras-chave de identificação
            </Label>
            <p className="text-xs text-gray-500">Uma por linha. O sistema busca essas palavras no texto do PDF para detectar o banco automaticamente.</p>
            <textarea
              className="w-full border rounded-lg px-3 py-2 text-sm font-mono resize-y min-h-[80px] focus:outline-none focus:ring-2 focus:ring-sky-300"
              value={kwText}
              onChange={e => setKwText(e.target.value)}
              placeholder={"Internet Banking Empresarial\nIBPJ\nSantander"}
              spellCheck={false}
            />
          </div>

          {/* Prefixos a ignorar */}
          <div className="space-y-1">
            <Label className="text-xs font-medium text-gray-700 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-gray-400" />
              Prefixos de linha a ignorar
            </Label>
            <p className="text-xs text-gray-500">Linhas que começam com esses textos são puladas (saldos, cabeçalhos, rodapés). Um por linha.</p>
            <textarea
              className="w-full border rounded-lg px-3 py-2 text-sm font-mono resize-y min-h-[80px] focus:outline-none focus:ring-2 focus:ring-sky-300"
              value={spText}
              onChange={e => setSpText(e.target.value)}
              placeholder={"Saldo do dia\nSaldo anterior\nData  Histórico"}
              spellCheck={false}
            />
          </div>

          {/* Instruções para IA */}
          <div className="space-y-1">
            <Label className="text-xs font-medium text-gray-700 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-gray-400" />
              Instruções para a IA
            </Label>
            <p className="text-xs text-gray-500">Explique as particularidades do layout deste banco. A IA usa estas instruções como contexto adicional.</p>
            <textarea
              className="w-full border rounded-lg px-3 py-2 text-sm resize-y min-h-[120px] focus:outline-none focus:ring-2 focus:ring-sky-300"
              value={form.instrucoesIa}
              onChange={e => setForm(f => ({ ...f, instrucoesIa: e.target.value }))}
              placeholder="Ex: Débitos têm '- R$' antes do valor. Créditos têm 'R$' sem sinal negativo. A data aparece completa (DD/MM/AAAA) em cada linha..."
              spellCheck={false}
            />
          </div>

          {/* Ativo */}
          <div className="flex items-center gap-3">
            <Switch
              checked={form.ativo}
              onCheckedChange={v => setForm(f => ({ ...f, ativo: v }))}
            />
            <Label className="text-sm text-gray-700">Template ativo</Label>
          </div>

          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={handleSave} disabled={isSaving} className="gap-1.5">
              <Save className="w-3.5 h-3.5" />
              {isSaving ? "Salvando..." : "Salvar template"}
            </Button>
            <Button size="sm" variant="outline" onClick={closeEdit} disabled={isSaving}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {/* Lista de templates */}
      {isLoading ? (
        <p className="text-sm text-gray-500">Carregando...</p>
      ) : templates.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-6 py-8 text-center">
          <Landmark className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">Nenhum template cadastrado.</p>
          <p className="text-xs text-gray-400 mt-1">
            Crie um template para cada banco cujo extrato PDF você importa.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((t: Template) => (
            <div
              key={t.id}
              className={`rounded-xl border ${t.ativo ? "border-gray-200 bg-white" : "border-gray-100 bg-gray-50 opacity-70"} shadow-sm`}
            >
              {/* Cabeçalho do card */}
              <div className="flex items-center gap-3 px-4 py-3">
                <div className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${t.ativo ? "bg-sky-100" : "bg-gray-100"}`}>
                  <Landmark className={`w-4 h-4 ${t.ativo ? "text-sky-600" : "text-gray-400"}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{t.bancoNome}</p>
                  <p className="text-xs text-gray-500">
                    {t.palavrasChave.length} palavra(s)-chave · {t.skipPrefixes.length} prefixo(s) ignorado(s)
                    {!t.ativo && <span className="ml-2 text-amber-600 font-medium">Inativo</span>}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {t.ativo && (
                    <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
                      <CheckCircle2 className="w-3 h-3" /> Ativo
                    </span>
                  )}
                  <button
                    onClick={() => setExpandId(expandId === t.id ? null : t.id)}
                    className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                    title="Ver detalhes"
                  >
                    {expandId === t.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => openEdit(t)}
                    className="p-1.5 rounded-lg hover:bg-sky-50 text-gray-400 hover:text-sky-600"
                    title="Editar"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(t.id, t.bancoNome)}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500"
                    title="Excluir"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Detalhes expandidos */}
              {expandId === t.id && (
                <div className="border-t border-gray-100 px-4 py-3 space-y-3 bg-gray-50/50 rounded-b-xl">
                  {t.palavrasChave.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-gray-600 mb-1 flex items-center gap-1">
                        <Search className="w-3 h-3" /> Palavras-chave
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {t.palavrasChave.map((kw, i) => (
                          <span key={i} className="text-xs bg-sky-100 text-sky-700 rounded px-2 py-0.5 font-mono">{kw}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {t.skipPrefixes.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-gray-600 mb-1 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> Prefixos ignorados
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {t.skipPrefixes.map((sp, i) => (
                          <span key={i} className="text-xs bg-amber-100 text-amber-700 rounded px-2 py-0.5 font-mono">{sp}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {t.instrucoesIa && (
                    <div>
                      <p className="text-xs font-medium text-gray-600 mb-1 flex items-center gap-1">
                        <FileText className="w-3 h-3" /> Instruções para IA
                      </p>
                      <pre className="text-xs text-gray-600 whitespace-pre-wrap font-sans bg-white border border-gray-200 rounded p-2">
                        {t.instrucoesIa}
                      </pre>
                    </div>
                  )}
                  <p className="text-xs text-gray-400">
                    Atualizado em: {new Date(t.atualizadoEm).toLocaleDateString("pt-BR")}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
