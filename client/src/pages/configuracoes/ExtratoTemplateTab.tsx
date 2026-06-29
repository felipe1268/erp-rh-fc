/**
 * ExtratoTemplateTab.tsx — Rev. 3882
 *
 * Aba "Templates de Extrato" em Configurações.
 * Fluxo 1 PDF: usuário sobe um PDF → IA analisa → proposta editável → salvar.
 * Fluxo lote (Rev. 3882): múltiplos PDFs → analisa sequencialmente → salva
 *   automaticamente cada um → exibe resumo (criados / erros).
 */
import { useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  FileText, Plus, Pencil, Trash2, Save, X,
  Landmark, Search,
  Info, CheckCircle2, AlertCircle, Sparkles,
  Upload, RotateCcw, Loader2, History, Eye, EyeOff,
  KeyRound, ShieldOff, Bot, ChevronRight,
} from "lucide-react";

// Paleta por banco — fallback cinza
const BANK_COLORS: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  "banco do brasil":          { bg: "bg-yellow-50",  text: "text-yellow-800",  border: "border-yellow-200", dot: "bg-yellow-400"  },
  "caixa econômica federal":  { bg: "bg-blue-50",    text: "text-blue-800",    border: "border-blue-200",   dot: "bg-blue-500"    },
  "caixa":                    { bg: "bg-blue-50",    text: "text-blue-800",    border: "border-blue-200",   dot: "bg-blue-500"    },
  "santander":                { bg: "bg-red-50",     text: "text-red-800",     border: "border-red-200",    dot: "bg-red-500"     },
  "itaú":                     { bg: "bg-orange-50",  text: "text-orange-800",  border: "border-orange-200", dot: "bg-orange-500"  },
  "itau":                     { bg: "bg-orange-50",  text: "text-orange-800",  border: "border-orange-200", dot: "bg-orange-500"  },
  "bradesco":                 { bg: "bg-red-50",     text: "text-red-800",     border: "border-red-200",    dot: "bg-red-600"     },
  "sicredi":                  { bg: "bg-green-50",   text: "text-green-800",   border: "border-green-200",  dot: "bg-green-500"   },
  "sicoob":                   { bg: "bg-teal-50",    text: "text-teal-800",    border: "border-teal-200",   dot: "bg-teal-500"    },
  "nubank":                   { bg: "bg-purple-50",  text: "text-purple-800",  border: "border-purple-200", dot: "bg-purple-500"  },
};
const DEFAULT_COLOR = { bg: "bg-slate-50", text: "text-slate-800", border: "border-slate-200", dot: "bg-slate-400" };

function bankColor(nome: string) {
  const key = nome.trim().toLowerCase();
  for (const [k, v] of Object.entries(BANK_COLORS)) {
    if (key.startsWith(k)) return v;
  }
  return DEFAULT_COLOR;
}

function splitBankLayout(nome: string): [string, string] {
  const parts = nome.split(/\s*[—–-]\s*/);
  if (parts.length > 1) return [parts[0].trim(), parts.slice(1).join(" — ").trim()];
  return [nome.trim(), ""];
}

function groupByBank(templates: Template[]): Map<string, Template[]> {
  const map = new Map<string, Template[]>();
  for (const t of templates) {
    const [banco] = splitBankLayout(t.bancoNome);
    if (!map.has(banco)) map.set(banco, []);
    map.get(banco)!.push(t);
  }
  return map;
}

// ── tipos ────────────────────────────────────────────────────────────────────

interface Template {
  id: number;
  companyId: number;
  bancoNome: string;
  palavrasChave: string[];
  skipPrefixes: string[];
  instrucoesIa: string;
  ativo: boolean;
  revisao: number;
  notasRevisao: string;
  criadoEm: string;
  atualizadoEm: string;
}

interface FormState {
  bancoNome:     string;
  palavrasChave: string[];
  skipPrefixes:  string[];
  instrucoesIa:  string;
  notasRevisao:  string;
  ativo:         boolean;
}

const EMPTY: FormState = {
  bancoNome:     "",
  palavrasChave: [],
  skipPrefixes:  [],
  instrucoesIa:  "",
  notasRevisao:  "",
  ativo:         true,
};

// ── utilitários ──────────────────────────────────────────────────────────────

const arrToText = (arr: string[]) => arr.join("\n");
const textToArr = (t: string) => t.split("\n").map(s => s.trim()).filter(Boolean);

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── componente principal ──────────────────────────────────────────────────────

export default function ExtratoTemplateTab() {
  const { companyIdNum: companyId } = useCompany();
  const utils = trpc.useUtils();

  const { data: templates = [], isLoading } = trpc.bankStatementTemplates.list.useQuery(
    { companyId },
    { enabled: !!companyId }
  );

  const createMut   = trpc.bankStatementTemplates.create.useMutation();
  const updateMut   = trpc.bankStatementTemplates.update.useMutation();
  const deleteMut   = trpc.bankStatementTemplates.delete.useMutation();
  const analisarMut = trpc.bankStatementTemplates.analisarPdf.useMutation();

  // Estado do formulário de criar/editar
  const [editId, setEditId]     = useState<number | "new" | null>(null);
  const [form, setForm]         = useState<FormState>(EMPTY);
  const [kwText, setKwText]     = useState("");
  const [spText, setSpText]     = useState("");
  const [expandId, setExpandId] = useState<number | null>(null);

  // Estado do fluxo de análise IA
  const [analyzing, setAnalyzing]     = useState(false);
  const [iaSourced, setIaSourced]     = useState(false);  // veio da IA
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Estado do fluxo em lote (Rev. 3882 / Rev. 3883)
  const [batch, setBatch] = useState<{
    total: number;
    current: number;
    nome: string;
    ok: string[];
    duplicatas: { arquivo: string; msg: string }[];
    erros: { nome: string; msg: string }[];
  } | null>(null);

  // Estado do AlertDialog de confirmação de exclusão
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; nome: string } | null>(null);

  // ── abrir formulário ────────────────────────────────────────────────────────

  function openNew(preset?: Partial<FormState>) {
    const base: FormState = { ...EMPTY, ...preset };
    setForm(base);
    setKwText(arrToText(base.palavrasChave));
    setSpText(arrToText(base.skipPrefixes));
    setEditId("new");
    setIaSourced(!!preset?.bancoNome);
  }

  function openEdit(t: Template) {
    setForm({
      bancoNome:     t.bancoNome,
      palavrasChave: t.palavrasChave,
      skipPrefixes:  t.skipPrefixes,
      instrucoesIa:  t.instrucoesIa,
      notasRevisao:  "",
      ativo:         t.ativo,
    });
    setKwText(arrToText(t.palavrasChave));
    setSpText(arrToText(t.skipPrefixes));
    setEditId(t.id);
    setIaSourced(false);
  }

  function closeEdit() {
    setEditId(null);
    setForm(EMPTY);
    setKwText("");
    setSpText("");
    setIaSourced(false);
  }

  // ── fluxo de análise IA ─────────────────────────────────────────────────────

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    // Limpar input para permitir selecionar os mesmos arquivos novamente
    (e.target as HTMLInputElement).value = "";
    if (!files.length) return;

    // Validação básica de todos os arquivos antes de começar
    for (const f of files) {
      if (!f.name.toLowerCase().endsWith(".pdf")) {
        toast.error(`"${f.name}" não é um PDF.`);
        return;
      }
      if (f.size > 30 * 1024 * 1024) {
        toast.error(`"${f.name}" é muito grande (limite: 30 MB por arquivo).`);
        return;
      }
    }

    // Arquivo único → fluxo original (abre formulário para revisão)
    if (files.length === 1) {
      setAnalyzing(true);
      try {
        const base64 = await fileToBase64(files[0]);
        const result = await analisarMut.mutateAsync({ companyId, pdfBase64: base64 });
        openNew({
          bancoNome:     result.bancoNome,
          palavrasChave: result.palavrasChave,
          skipPrefixes:  result.skipPrefixes,
          instrucoesIa:  result.instrucoesIa,
          notasRevisao:  "Gerado automaticamente por análise de IA.",
          ativo:         true,
        });
        toast.success(`Banco identificado: ${result.bancoNome}`);
      } catch (err: any) {
        toast.error(err?.message || "Erro na análise. Tente novamente.");
      } finally {
        setAnalyzing(false);
      }
      return;
    }

    // Múltiplos arquivos → modo lote: analisa + salva automaticamente cada um
    await handleBatchFiles(files);
  }

  async function handleBatchFiles(files: File[]) {
    setBatch({ total: files.length, current: 0, nome: "", ok: [], duplicatas: [], erros: [] });
    setAnalyzing(true);

    const ok: string[] = [];
    const duplicatas: { arquivo: string; msg: string }[] = [];
    const erros: { nome: string; msg: string }[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setBatch(b => b ? { ...b, current: i + 1, nome: file.name } : b);

      try {
        const base64 = await fileToBase64(file);
        const result = await analisarMut.mutateAsync({ companyId, pdfBase64: base64 });
        await createMut.mutateAsync({
          companyId,
          bancoNome:     result.bancoNome,
          palavrasChave: result.palavrasChave,
          skipPrefixes:  result.skipPrefixes,
          instrucoesIa:  result.instrucoesIa,
          notasRevisao:  "Gerado automaticamente por análise de IA (lote).",
          ativo:         true,
        });
        ok.push(result.bancoNome);
      } catch (err: any) {
        const msg: string = err?.message || "Erro desconhecido";
        // CONFLICT = duplicata detectada pelo backend → trata separado (não é erro)
        if (err?.data?.code === "CONFLICT" || msg.startsWith("Duplicata")) {
          duplicatas.push({ arquivo: file.name, msg });
        } else {
          erros.push({ nome: file.name, msg });
        }
      }

      setBatch(b => b ? { ...b, ok, duplicatas, erros } : b);
    }

    await utils.bankStatementTemplates.list.invalidate({ companyId });
    setAnalyzing(false);

    // Resumo final via toast
    const parts: string[] = [];
    if (ok.length > 0)         parts.push(`${ok.length} criado${ok.length > 1 ? "s" : ""}`);
    if (duplicatas.length > 0) parts.push(`${duplicatas.length} duplicata${duplicatas.length > 1 ? "s" : ""} ignorada${duplicatas.length > 1 ? "s" : ""}`);
    if (erros.length > 0)      parts.push(`${erros.length} erro${erros.length > 1 ? "s" : ""}`);

    if (ok.length > 0 && erros.length === 0) {
      toast.success(parts.join(", ") + ".");
    } else if (ok.length > 0) {
      toast.warning(parts.join(", ") + ".");
    } else if (duplicatas.length > 0 && erros.length === 0) {
      toast.info("Todos os arquivos já têm templates cadastrados.");
    } else {
      toast.error("Nenhum template pôde ser criado.");
    }

    // Mantém o resumo visível por 8s, depois limpa
    setTimeout(() => setBatch(null), 8000);
  }

  // ── salvar ──────────────────────────────────────────────────────────────────

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
      notasRevisao:  form.notasRevisao.trim() || undefined,
      ativo:         form.ativo,
    };
    try {
      if (editId === "new") {
        await createMut.mutateAsync(payload);
        toast.success("Template criado com sucesso.");
      } else {
        const res = await updateMut.mutateAsync({ ...payload, id: editId as number });
        toast.success(`Template atualizado. (Rev. ${(res as any)?.revisao ?? "—"})`);
      }
      utils.bankStatementTemplates.list.invalidate({ companyId });
      closeEdit();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao salvar template.");
    }
  }

  // ── excluir ─────────────────────────────────────────────────────────────────

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await deleteMut.mutateAsync({ id: deleteTarget.id, companyId });
      toast.success("Template excluído.");
      utils.bankStatementTemplates.list.invalidate({ companyId });
      if (editId === deleteTarget.id) closeEdit();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao excluir.");
    } finally {
      setDeleteTarget(null);
    }
  }

  const isSaving = createMut.isPending || updateMut.isPending;

  // ── render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Input oculto para seleção de PDF(s) — aceita múltiplos (Rev. 3882) */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        multiple
        className="hidden"
        onChange={handleFileSelected}
      />

      {/* AlertDialog de confirmação de exclusão */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir template?</AlertDialogTitle>
            <AlertDialogDescription className="break-words">
              O template <strong>"{deleteTarget?.nome}"</strong> será excluído permanentemente.
              Extratos deste banco deixarão de usar estas instruções na próxima importação.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={confirmDelete}
              disabled={deleteMut.isPending}
            >
              {deleteMut.isPending ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Cabeçalho explicativo ── */}
      <div className="rounded-xl border border-sky-200 bg-sky-50/60 px-4 py-3">
        <p className="text-sm font-semibold text-sky-800 flex items-center gap-2">
          <Landmark className="w-4 h-4" /> Templates de Extrato Bancário
        </p>
        <p className="text-xs text-sky-700/80 mt-0.5">
          Suba um PDF de extrato bancário e a IA identifica o banco automaticamente — sem mexer em código.
          Cada template configura como o sistema lê extratos daquele banco no futuro.
        </p>
      </div>

      {/* ── Botões de ação (fora do formulário) ── */}
      {editId === null && (
        <div className="flex flex-wrap gap-2">
          {/* CTA principal: análise IA (1 ou vários PDFs) */}
          <Button
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={analyzing}
            className="gap-2 bg-sky-600 hover:bg-sky-700"
            title="Selecione um ou vários PDFs de extrato bancário. 1 arquivo = revise antes de salvar. Vários arquivos = salva automaticamente cada um."
          >
            {analyzing
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Analisando...</>
              : <><Sparkles className="w-3.5 h-3.5" /> Analisar extrato(s) de novo banco</>
            }
          </Button>
          {/* Secundário: criar manualmente */}
          <Button
            size="sm" variant="outline"
            onClick={() => openNew()}
            disabled={analyzing}
            className="gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" /> Criar manualmente
          </Button>
        </div>
      )}

      {/* ── Estado de carregamento da IA ── */}
      {analyzing && (
        <div className="rounded-xl border border-sky-200 bg-white px-5 py-6 text-center space-y-3 shadow-sm">
          <div className="flex justify-center">
            <div className="relative">
              <div className="w-14 h-14 rounded-full bg-sky-100 flex items-center justify-center">
                <Sparkles className="w-7 h-7 text-sky-500" />
              </div>
              <Loader2 className="w-5 h-5 text-sky-400 animate-spin absolute -bottom-1 -right-1 bg-white rounded-full" />
            </div>
          </div>

          {/* Modo lote */}
          {batch ? (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-gray-800">
                Analisando {batch.current} de {batch.total}...
              </p>
              {/* Barra de progresso */}
              <div className="w-full bg-sky-100 rounded-full h-1.5 mx-auto max-w-xs">
                <div
                  className="bg-sky-500 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${Math.round((batch.current / batch.total) * 100)}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 truncate max-w-xs mx-auto" title={batch.nome}>
                {batch.nome}
              </p>
              {/* Resultados parciais */}
              {(batch.ok.length > 0 || batch.duplicatas.length > 0 || batch.erros.length > 0) && (
                <div className="flex justify-center gap-4 text-xs pt-1">
                  {batch.ok.length > 0 && (
                    <span className="text-green-600 font-medium">✓ {batch.ok.length} criado{batch.ok.length > 1 ? "s" : ""}</span>
                  )}
                  {batch.duplicatas.length > 0 && (
                    <span className="text-amber-600 font-medium">⊘ {batch.duplicatas.length} duplicata{batch.duplicatas.length > 1 ? "s" : ""}</span>
                  )}
                  {batch.erros.length > 0 && (
                    <span className="text-red-500 font-medium">✗ {batch.erros.length} erro{batch.erros.length > 1 ? "s" : ""}</span>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* Modo arquivo único */
            <div>
              <p className="text-sm font-semibold text-gray-800">IA identificando o banco e mapeando o formato...</p>
              <p className="text-xs text-gray-500 mt-1">
                Analisando cabeçalho, estrutura de colunas, sinalização de débito/crédito e linhas a ignorar.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Resumo do lote (após conclusão, visível por 8s) ── */}
      {!analyzing && batch && (
        <div className={`rounded-xl border px-5 py-4 shadow-sm space-y-2 ${
          batch.erros.length > 0 ? "border-red-200 bg-red-50/60"
            : batch.duplicatas.length > 0 ? "border-amber-200 bg-amber-50/60"
            : "border-green-200 bg-green-50/60"
        }`}>
          <p className={`text-sm font-semibold ${
            batch.erros.length > 0 ? "text-red-800"
              : batch.duplicatas.length > 0 ? "text-amber-800"
              : "text-green-800"
          }`}>
            Lote concluído — {batch.ok.length} criado{batch.ok.length !== 1 ? "s" : ""},
            {" "}{batch.duplicatas.length} duplicata{batch.duplicatas.length !== 1 ? "s" : ""} ignorada{batch.duplicatas.length !== 1 ? "s" : ""},
            {" "}{batch.erros.length} erro{batch.erros.length !== 1 ? "s" : ""}
          </p>
          {batch.ok.length > 0 && (
            <ul className="text-xs text-green-700 space-y-0.5">
              {batch.ok.map((nome, i) => <li key={i}>✓ {nome}</li>)}
            </ul>
          )}
          {batch.duplicatas.length > 0 && (
            <ul className="text-xs text-amber-700 space-y-0.5">
              {batch.duplicatas.map((d, i) => <li key={i} className="break-words">⊘ {d.arquivo}: {d.msg}</li>)}
            </ul>
          )}
          {batch.erros.length > 0 && (
            <ul className="text-xs text-red-600 space-y-0.5">
              {batch.erros.map((e, i) => <li key={i} className="break-words">✗ {e.nome}: {e.msg}</li>)}
            </ul>
          )}
        </div>
      )}

      {/* ── Formulário de criar/editar ── */}
      {editId !== null && !analyzing && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4 shadow-sm">
          {/* Cabeçalho do formulário */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold text-gray-800 text-sm flex items-center gap-2">
                {editId === "new" ? (
                  iaSourced
                    ? <><Sparkles className="w-4 h-4 text-sky-500" /> Proposta gerada pela IA — revise e salve</>
                    : <><Plus className="w-4 h-4" /> Novo template</>
                ) : (
                  <><Pencil className="w-4 h-4" /> Editar template</>
                )}
              </h3>
              {iaSourced && (
                <p className="text-xs text-sky-600 mt-0.5">
                  Todos os campos foram preenchidos pela IA com base no PDF. Você pode editar qualquer um antes de salvar.
                </p>
              )}
            </div>
            <button onClick={closeEdit} className="text-gray-400 hover:text-gray-600 mt-0.5 flex-shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Nome do banco */}
          <div className="space-y-1">
            <Label className="text-xs font-medium text-gray-700">
              Nome do banco / layout *
            </Label>
            <Input
              value={form.bancoNome}
              onChange={e => setForm(f => ({ ...f, bancoNome: e.target.value }))}
              placeholder="Ex: Santander — Internet Banking PJ, Caixa — Extrato Online..."
              className="text-sm"
            />
          </div>

          {/* Palavras-chave */}
          <div className="space-y-1">
            <Label className="text-xs font-medium text-gray-700 flex items-center gap-1.5">
              <Search className="w-3.5 h-3.5 text-gray-400" />
              Palavras-chave de identificação automática
            </Label>
            <p className="text-xs text-gray-500">
              Uma por linha. O sistema busca esses textos no PDF para reconhecer o banco automaticamente.
              Use termos únicos do cabeçalho — nunca número de conta ou agência.
            </p>
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
              Linhas a ignorar (prefixos)
            </Label>
            <p className="text-xs text-gray-500">
              Início exato de linhas que NÃO são transações (saldos diários, cabeçalhos, totais). Um por linha.
            </p>
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
              Instruções para a IA de extração
            </Label>
            <p className="text-xs text-gray-500">
              Como débitos e créditos são marcados, formato de data, estrutura de colunas, particularidades do banco.
              Quanto mais completo, melhor a leitura futura.
            </p>
            <textarea
              className="w-full border rounded-lg px-3 py-2 text-sm resize-y min-h-[130px] focus:outline-none focus:ring-2 focus:ring-sky-300"
              value={form.instrucoesIa}
              onChange={e => setForm(f => ({ ...f, instrucoesIa: e.target.value }))}
              placeholder="Ex: Débitos têm '- R$' antes do valor. Créditos têm 'R$' sem sinal negativo. Data aparece completa (DD/MM/AAAA)..."
              spellCheck={false}
            />
          </div>

          {/* Notas da revisão */}
          <div className="space-y-1">
            <Label className="text-xs font-medium text-gray-700 flex items-center gap-1.5">
              <History className="w-3.5 h-3.5 text-gray-400" />
              Notas desta revisão <span className="text-gray-400 font-normal">(opcional)</span>
            </Label>
            <Input
              value={form.notasRevisao}
              onChange={e => setForm(f => ({ ...f, notasRevisao: e.target.value }))}
              placeholder="Ex: Ajuste do prefixo de saldo, nova palavra-chave incluída..."
              className="text-sm"
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

          {/* Rodapé do formulário */}
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-gray-100">
            <Button size="sm" onClick={handleSave} disabled={isSaving} className="gap-1.5">
              <Save className="w-3.5 h-3.5" />
              {isSaving ? "Salvando..." : "Salvar template"}
            </Button>
            <Button size="sm" variant="outline" onClick={closeEdit} disabled={isSaving}>
              Cancelar
            </Button>
            {editId === "new" && !iaSourced && (
              <Button
                size="sm" variant="ghost"
                className="gap-1.5 ml-auto text-sky-700 hover:text-sky-800 hover:bg-sky-50"
                onClick={() => fileInputRef.current?.click()}
                disabled={isSaving}
              >
                <Sparkles className="w-3.5 h-3.5" />
                Analisar PDF em vez disso
              </Button>
            )}
            {iaSourced && (
              <Button
                size="sm" variant="ghost"
                className="gap-1.5 ml-auto text-gray-500 hover:text-gray-700"
                onClick={() => fileInputRef.current?.click()}
                disabled={isSaving}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Analisar outro PDF
              </Button>
            )}
          </div>
        </div>
      )}

      {/* ── Lista de templates ── */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500 py-6">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando templates...
        </div>
      ) : templates.length === 0 && editId === null && !analyzing ? (
        /* Estado vazio */
        <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50/60 px-6 py-14 text-center space-y-4">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-2xl bg-sky-100 border-2 border-sky-200 flex items-center justify-center">
              <Landmark className="w-7 h-7 text-sky-500" />
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-700">Nenhum banco configurado ainda</p>
            <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto leading-relaxed">
              Suba um PDF de extrato bancário. A IA detecta o banco e configura tudo automaticamente — sem código.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={analyzing}
            className="gap-2 bg-sky-600 hover:bg-sky-700"
          >
            <Sparkles className="w-3.5 h-3.5" /> Analisar extrato de novo banco
          </Button>
        </div>
      ) : (
        /* Lista agrupada por banco */
        <div className="space-y-6">
          {Array.from(groupByBank(templates as Template[])).map(([banco, items]) => {
            const color = bankColor(banco);
            return (
              <div key={banco}>
                {/* Cabeçalho do grupo */}
                <div className={`flex items-center gap-2.5 px-3 py-2 rounded-xl ${color.bg} ${color.border} border mb-3`}>
                  <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${color.dot}`} />
                  <span className={`text-sm font-bold ${color.text}`}>{banco}</span>
                  <span className={`ml-auto text-xs font-medium ${color.text} opacity-60`}>
                    {items.length} layout{items.length > 1 ? "s" : ""}
                  </span>
                </div>

                {/* Cards do grupo */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-1">
                  {items.map(t => (
                    <TemplateCard
                      key={t.id}
                      t={t}
                      banco={banco}
                      expanded={expandId === t.id}
                      onExpand={() => setExpandId(expandId === t.id ? null : t.id)}
                      onEdit={() => openEdit(t)}
                      onDelete={() => setDeleteTarget({ id: t.id, nome: t.bancoNome })}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── sub-componente: card de template ─────────────────────────────────────────

function TemplateCard({
  t, banco, expanded, onExpand, onEdit, onDelete,
}: {
  t: Template;
  banco: string;
  expanded: boolean;
  onExpand: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [, layout] = splitBankLayout(t.bancoNome);
  const rev = t.revisao ?? 1;
  const color = bankColor(banco);

  return (
    <div className={`rounded-2xl border shadow-sm overflow-hidden transition-all ${
      t.ativo ? "border-gray-200 bg-white" : "border-gray-100 bg-gray-50/80"
    } ${expanded ? "ring-2 ring-sky-300 ring-offset-0" : ""}`}>

      {/* Faixa colorida no topo */}
      <div className={`h-1 w-full ${color.dot}`} />

      {/* Corpo do card */}
      <div className="px-4 pt-3 pb-3">

        {/* Layout / variante */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-800 break-words leading-snug">
              {layout || banco}
            </p>
            {!t.ativo && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5 mt-1">
                Inativo
              </span>
            )}
          </div>
          <span className="flex-shrink-0 text-[10px] font-semibold text-gray-400 bg-gray-100 rounded-full px-2 py-0.5 mt-0.5">
            Rev.{rev}
          </span>
        </div>

        {/* Métricas */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-sky-50 text-sky-700 border border-sky-200 rounded-full px-2 py-0.5">
            <KeyRound className="w-2.5 h-2.5" />
            {t.palavrasChave.length} palavra{t.palavrasChave.length !== 1 ? "s" : ""}-chave
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5">
            <ShieldOff className="w-2.5 h-2.5" />
            {t.skipPrefixes.length} linha{t.skipPrefixes.length !== 1 ? "s" : ""} ignorada{t.skipPrefixes.length !== 1 ? "s" : ""}
          </span>
          {t.instrucoesIa && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-purple-50 text-purple-700 border border-purple-200 rounded-full px-2 py-0.5">
              <Bot className="w-2.5 h-2.5" /> IA configurada
            </span>
          )}
        </div>

        {/* Ações */}
        <div className="flex items-center gap-1.5 border-t border-gray-100 pt-3">
          <button
            onClick={onExpand}
            className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors ${
              expanded
                ? "bg-sky-100 text-sky-700 hover:bg-sky-200"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
            title={expanded ? "Fechar visualização" : "Ver configuração completa"}
          >
            {expanded ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {expanded ? "Fechar" : "Visualizar"}
          </button>

          <div className="flex-1" />

          <button
            onClick={onEdit}
            className="p-1.5 rounded-lg text-gray-400 hover:text-sky-600 hover:bg-sky-50 transition-colors"
            title="Editar template"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
            title="Excluir template"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Painel de detalhes expandido */}
      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50/60 px-4 py-4 space-y-4">

          {/* Palavras-chave */}
          <div>
            <p className="text-[11px] font-semibold text-sky-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <KeyRound className="w-3 h-3" /> Identificação automática
            </p>
            {t.palavrasChave.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {t.palavrasChave.map((kw, i) => (
                  <span key={i} className="text-xs bg-white text-sky-800 border border-sky-200 rounded-lg px-2 py-1 font-mono break-all shadow-sm">
                    {kw}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400 italic">Nenhuma palavra-chave — não será detectado automaticamente.</p>
            )}
          </div>

          {/* Skip prefixes */}
          <div>
            <p className="text-[11px] font-semibold text-amber-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <ShieldOff className="w-3 h-3" /> Linhas descartadas pelo parser
            </p>
            {t.skipPrefixes.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {t.skipPrefixes.map((sp, i) => (
                  <span key={i} className="text-xs bg-white text-amber-800 border border-amber-200 rounded-lg px-2 py-1 font-mono break-all shadow-sm">
                    {sp}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400 italic">Nenhum prefixo — todas as linhas são processadas.</p>
            )}
          </div>

          {/* Instruções IA */}
          {t.instrucoesIa && (
            <div>
              <p className="text-[11px] font-semibold text-purple-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Bot className="w-3 h-3" /> Instruções para a IA
              </p>
              <pre className="text-xs text-gray-700 whitespace-pre-wrap break-words font-sans bg-white border border-purple-100 rounded-xl p-3 shadow-sm leading-relaxed max-h-52 overflow-y-auto">
                {t.instrucoesIa}
              </pre>
            </div>
          )}

          {/* Rodapé */}
          <div className="flex items-center justify-between pt-1 border-t border-gray-200 text-[10px] text-gray-400">
            <span>Atualizado em {new Date(t.atualizadoEm).toLocaleDateString("pt-BR")}</span>
            {t.notasRevisao && <span className="truncate max-w-[60%] text-right" title={t.notasRevisao}>{t.notasRevisao}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
