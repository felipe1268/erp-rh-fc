/**
 * XlsxTemplateTab.tsx — Rev. 3856
 * Aba "Template de Planilha" em Configurações do Sistema.
 * - "Vigente desde" automático (data do save)
 * - Botão salvar sempre habilitado
 * - Visualizador inline da planilha (mockup em tempo real)
 */
import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  FileSpreadsheet, Palette, Save, Download, RefreshCw,
  Calendar, User, StickyNote, Info, CheckCircle2, Lock, Eye,
} from "lucide-react";

// Paleta de cores predefinidas (ARGB sem prefixo FF)
const COLOR_PRESETS: { label: string; hex: string; argb: string }[] = [
  { label: "Roxo FC (padrão)",  hex: "#7030A0", argb: "7030A0" },
  { label: "Azul Escuro",       hex: "#1E3A5F", argb: "1E3A5F" },
  { label: "Verde FC",          hex: "#00B050", argb: "00B050" },
  { label: "Azul Royal",        hex: "#2E4DA7", argb: "2E4DA7" },
  { label: "Cinza Escuro",      hex: "#404040", argb: "404040" },
  { label: "Laranja",           hex: "#C55A11", argb: "C55A11" },
];

// Lista completa de relatórios XLSX gerados pelo sistema
const RELATORIOS_XLSX = [
  { nome: "Extrato Bancário",            modulo: "Contabilidade",        template: true  },
  { nome: "Extrato de Cartão de Crédito",modulo: "Contabilidade",        template: false },
  { nome: "Pacote do Contador (ZIP)",    modulo: "Contabilidade",        template: true  },
  { nome: "Custos por Obra",             modulo: "Folha de Pagamento",   template: true  },
  { nome: "Conformidade PJ",             modulo: "Controle PJ",          template: false },
  { nome: "Pagamentos PJ",               modulo: "Controle PJ",          template: false },
  { nome: "Exemplo de Template",         modulo: "Configurações",        template: true  },
];

// Colunas de exemplo para o visualizador inline
const PREVIEW_COLS = ["Funcionário", "Função", "Obra", "H. Trab.", "H. Extra", "Custo Alocado"];
const PREVIEW_ROWS = [
  ["Felipe Costa Alves", "Engenheiro Civil", "UTC - Unidade", "176", "0", "R$ 8.500,00"],
  ["Carlos Souza",       "Técnico de Seg.",  "Escritório",    "160", "8", "R$ 4.200,00"],
  ["Ana Lima",           "Administrativo",   "Escritório",    "176", "0", "R$ 3.800,00"],
  ["TOTAL", "", "", "512", "8", "R$ 16.500,00"],
];

function todayBR(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function mesAnoBR(): string {
  const d = new Date();
  return d.toLocaleString("pt-BR", { month: "long", year: "numeric" });
}

interface Props {
  userName?: string;
}

export default function XlsxTemplateTab({ userName }: Props) {
  const { companyIdNum: companyId } = useCompany();

  const query = trpc.settings.getXlsxTemplateConfig.useQuery(
    { companyId },
    { enabled: !!companyId, staleTime: 30_000 }
  );

  const saveMutation = trpc.settings.saveXlsxTemplateConfig.useMutation({
    onSuccess: () => {
      toast.success("Template de planilha salvo com sucesso!");
      query.refetch();
    },
    onError: (e) => {
      toast.error(e?.message ?? "Erro ao salvar template");
    },
  });

  const previewMutation = trpc.settings.downloadXlsxTemplateExemplo.useMutation({
    onError: (e) => toast.error(e?.message ?? "Erro ao gerar exemplo"),
  });

  const [form, setForm] = useState({
    tituloEmpresa: "FC ENGENHARIA E CONSTRUÇÃO LTDA",
    revisao:       "Rev. 01",
    corCabecalho:  "7030A0",
    notas:         "",
  });
  const [colorInput, setColorInput] = useState("#7030A0");
  const [lastApprovedBy, setLastApprovedBy] = useState<string | null>(null);
  const [savedVigentDesde, setSavedVigentDesde] = useState<string | null>(null);
  const [showVisualizador, setShowVisualizador] = useState(false);

  useEffect(() => {
    if (query.data) {
      const d = query.data;
      setForm({
        tituloEmpresa: d.tituloEmpresa ?? "FC ENGENHARIA E CONSTRUÇÃO LTDA",
        revisao:       d.revisao       ?? "Rev. 01",
        corCabecalho:  d.corCabecalho  ?? "7030A0",
        notas:         d.notas         ?? "",
      });
      setColorInput("#" + (d.corCabecalho ?? "7030A0"));
      setLastApprovedBy(d.aprovadoPor ?? d.updatedBy ?? null);
      setSavedVigentDesde(d.vigentDesde ?? null);
    }
  }, [query.data]);

  const set = (k: keyof typeof form, v: string) => {
    setForm(f => ({ ...f, [k]: v }));
  };

  const handleColorPreset = (hex: string, argb: string) => {
    setColorInput(hex);
    set("corCabecalho", argb);
  };

  const handleColorInput = (v: string) => {
    setColorInput(v);
    const clean = v.replace(/^#/, "");
    if (/^[0-9A-Fa-f]{6}$/.test(clean)) {
      set("corCabecalho", clean.toUpperCase());
    }
  };

  const handleSave = () => {
    if (!companyId) {
      toast.error("Selecione uma empresa antes de salvar.");
      return;
    }
    const clean = form.corCabecalho.replace(/^#/, "");
    if (!/^[0-9A-Fa-f]{6}$/.test(clean)) {
      toast.error("Cor inválida. Use formato hexadecimal (ex: 7030A0).");
      return;
    }
    const aprovadoPor = userName || "Sistema";
    // "Vigente desde" é sempre a data de hoje (automático)
    const vigentDesde = todayBR();
    saveMutation.mutate({
      companyId,
      tituloEmpresa: form.tituloEmpresa,
      revisao:       form.revisao,
      corCabecalho:  clean.toUpperCase(),
      aprovadoPor,
      vigentDesde,
      notas:         form.notas || undefined,
    });
  };

  const handlePreview = async () => {
    if (!companyId) { toast.error("Selecione uma empresa."); return; }
    try {
      const res = await previewMutation.mutateAsync({ companyId });
      const bytes = Uint8Array.from(atob(res.base64), c => c.charCodeAt(0));
      const blob  = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url   = URL.createObjectURL(blob);
      const a     = document.createElement("a");
      a.href = url; a.download = res.filename; a.click();
      URL.revokeObjectURL(url);
      toast.success("Planilha-exemplo baixada!");
    } catch {
      // onError da mutation já exibiu o toast
    }
  };

  if (query.isLoading) {
    return (
      <div className="flex items-center gap-2 text-gray-500 py-8 justify-center">
        <RefreshCw className="w-4 h-4 animate-spin" /> Carregando configurações…
      </div>
    );
  }

  const updatedAt = query.data?.updatedAt
    ? new Date(query.data.updatedAt).toLocaleString("pt-BR")
    : null;

  const displayColor = colorInput.startsWith("#") ? colorInput : "#" + form.corCabecalho;

  // Calcula luminância para decidir cor do texto (branco vs preto) no cabeçalho
  const hexColor = displayColor.replace(/^#/, "");
  const r = parseInt(hexColor.slice(0,2),16)/255;
  const g = parseInt(hexColor.slice(2,4),16)/255;
  const b = parseInt(hexColor.slice(4,6),16)/255;
  const lum = 0.2126*r + 0.7152*g + 0.0722*b;
  const headerTextColor = lum > 0.45 ? "#1a1a1a" : "#ffffff";

  return (
    <div className="space-y-6">
      {/* Cabeçalho da aba */}
      <div className="rounded-xl border border-green-200 bg-green-50/60 px-4 py-3">
        <p className="text-sm font-semibold text-green-800 flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4" /> Template Padrão FC para Planilhas XLSX
        </p>
        <p className="text-xs text-green-700/80 mt-0.5">
          Define o cabeçalho institucional aplicado automaticamente em todos os relatórios XLSX gerados pelo sistema.
          Clique em <strong>Visualizar</strong> para ver como a planilha ficará antes de salvar.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Coluna esquerda — Identificação */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
            <Info className="w-4 h-4 text-gray-400" /> Identificação da Empresa
          </h3>

          <div className="space-y-1.5">
            <Label htmlFor="titulo_empresa" className="text-xs text-gray-600">
              Nome da empresa (cabeçalho do relatório)
            </Label>
            <Input
              id="titulo_empresa"
              value={form.tituloEmpresa}
              onChange={e => set("tituloEmpresa", e.target.value)}
              placeholder="FC ENGENHARIA E CONSTRUÇÃO LTDA"
              className="h-9 text-sm font-semibold uppercase"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="revisao" className="text-xs text-gray-600">
                Código de revisão (ISO)
              </Label>
              <Input
                id="revisao"
                value={form.revisao}
                onChange={e => set("revisao", e.target.value)}
                placeholder="Rev. 01"
                className="h-9 text-sm font-mono"
              />
            </div>

            {/* Vigente desde — automático, só exibe */}
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-600 flex items-center gap-1">
                <Calendar className="w-3 h-3" /> Vigente desde
              </Label>
              <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-input bg-gray-50 text-sm text-gray-500">
                <Calendar className="w-3 h-3 text-gray-400 shrink-0" />
                <span className="flex-1 truncate text-xs">
                  {savedVigentDesde || <span className="text-gray-400 italic">automático ao salvar</span>}
                </span>
              </div>
            </div>
          </div>

          {/* Aprovado por — read-only */}
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-600 flex items-center gap-1">
              <User className="w-3 h-3" /> Aprovado por
            </Label>
            <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-input bg-gray-50 text-sm text-gray-700">
              <Lock className="w-3 h-3 text-gray-400 shrink-0" />
              <span className="flex-1 truncate">
                {userName || "—"}
              </span>
              <span className="text-[10px] text-gray-400 shrink-0">(usuário logado)</span>
            </div>
            {lastApprovedBy && lastApprovedBy !== (userName || "Sistema") && (
              <p className="text-[10px] text-gray-400">
                Última aprovação: {lastApprovedBy}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notas" className="text-xs text-gray-600 flex items-center gap-1">
              <StickyNote className="w-3 h-3" /> Notas internas
            </Label>
            <textarea
              id="notas"
              value={form.notas}
              onChange={e => set("notas", e.target.value)}
              placeholder="Observações sobre esta revisão do template…"
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
            />
          </div>
        </div>

        {/* Coluna direita — Cor + Preview */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
            <Palette className="w-4 h-4 text-gray-400" /> Cor do Cabeçalho de Colunas
          </h3>

          {/* Paleta de presets */}
          <div className="flex flex-wrap gap-2">
            {COLOR_PRESETS.map(({ label, hex, argb }) => {
              const isActive = form.corCabecalho.toUpperCase() === argb.toUpperCase();
              return (
                <button
                  key={argb}
                  title={label}
                  onClick={() => handleColorPreset(hex, argb)}
                  className={`relative w-10 h-10 rounded-lg border-2 transition-all ${isActive ? "border-gray-900 scale-110 shadow-md" : "border-transparent hover:border-gray-400"}`}
                  style={{ backgroundColor: hex }}
                >
                  {isActive && (
                    <CheckCircle2 className="absolute -top-1.5 -right-1.5 w-4 h-4 text-white bg-gray-900 rounded-full" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Input de cor customizada */}
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-600">Cor customizada (hex)</Label>
            <div className="flex gap-2 items-center">
              <input
                type="color"
                value={displayColor}
                onChange={e => handleColorInput(e.target.value)}
                className="h-9 w-12 rounded cursor-pointer border border-input"
              />
              <Input
                value={colorInput}
                onChange={e => handleColorInput(e.target.value)}
                placeholder="#7030A0"
                className="h-9 text-sm font-mono flex-1"
                maxLength={7}
              />
            </div>
          </div>

          {/* Mini preview da cor */}
          <div className="rounded-lg overflow-hidden border border-gray-200">
            <div
              className="px-4 py-3 text-xs font-bold flex items-center gap-2"
              style={{ backgroundColor: displayColor, color: headerTextColor }}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Funcionário · Função · Horas Trab. · Custo Alocado</span>
            </div>
            <div className="px-4 py-2 bg-white text-xs text-gray-600 border-t border-gray-100">
              <span className="font-medium">{form.tituloEmpresa || "FC ENGENHARIA"}</span> · {mesAnoBR()}
            </div>
          </div>

          {/* Status */}
          {updatedAt && (
            <p className="text-xs text-gray-400 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-green-500" />
              Última atualização: {updatedAt}
              {query.data?.updatedBy ? ` por ${query.data.updatedBy}` : ""}
            </p>
          )}

          {/* Botões */}
          <div className="flex gap-2 pt-2">
            <Button
              onClick={handleSave}
              disabled={saveMutation.isPending}
              className="flex-1 gap-2 text-sm h-9"
            >
              {saveMutation.isPending ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {saveMutation.isPending ? "Salvando…" : "Salvar Configurações"}
            </Button>

            <Button
              variant="outline"
              onClick={() => setShowVisualizador(v => !v)}
              className="gap-2 text-sm h-9"
              title="Ver como a planilha ficará com este template"
            >
              <Eye className="w-4 h-4" />
              {showVisualizador ? "Fechar" : "Visualizar"}
            </Button>

            <Button
              variant="outline"
              onClick={handlePreview}
              disabled={previewMutation.isPending}
              className="gap-2 text-sm h-9 px-3"
              title="Baixar planilha-exemplo com o template atual"
            >
              {previewMutation.isPending ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              XLSX
            </Button>
          </div>
        </div>
      </div>

      {/* ─── VISUALIZADOR INLINE ─────────────────────────────────────────── */}
      {showVisualizador && (
        <div className="rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200">
            <span className="text-xs font-semibold text-gray-600 flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5" /> Pré-visualização do Template — Relatório de Exemplo
            </span>
            <span className="text-[10px] text-gray-400">atualiza em tempo real conforme você altera as configurações</span>
          </div>

          {/* Planilha mockup */}
          <div className="overflow-x-auto bg-white">
            <table className="w-full border-collapse text-xs font-mono" style={{ minWidth: 560 }}>
              {/* Linha 1: título da empresa (merged visualmente) */}
              <tbody>
                <tr>
                  <td
                    colSpan={PREVIEW_COLS.length}
                    className="px-3 py-2 text-xs font-bold border border-gray-300 bg-gray-50"
                    style={{ letterSpacing: "0.03em" }}
                  >
                    {form.tituloEmpresa || "FC ENGENHARIA E CONSTRUÇÃO LTDA"}
                    <span className="ml-3 font-normal text-gray-500">
                      · {mesAnoBR()} · {form.revisao || "Rev. 01"}
                      {savedVigentDesde ? ` · Vigente desde ${savedVigentDesde}` : ""}
                      {userName ? ` · Aprovado por ${userName}` : ""}
                    </span>
                  </td>
                </tr>

                {/* Linha 2: cabeçalho colorido */}
                <tr>
                  {PREVIEW_COLS.map(col => (
                    <td
                      key={col}
                      className="px-3 py-2 font-bold border border-gray-400 whitespace-nowrap"
                      style={{ backgroundColor: displayColor, color: headerTextColor }}
                    >
                      {col}
                    </td>
                  ))}
                </tr>

                {/* Linhas de dados */}
                {PREVIEW_ROWS.map((row, ri) => {
                  const isTotal = row[0] === "TOTAL";
                  return (
                    <tr
                      key={ri}
                      className={isTotal ? "font-bold" : ri % 2 === 0 ? "bg-white" : "bg-gray-50"}
                      style={isTotal ? { backgroundColor: displayColor + "22" } : {}}
                    >
                      {row.map((cell, ci) => (
                        <td
                          key={ci}
                          className={`px-3 py-1.5 border border-gray-200 whitespace-nowrap ${ci >= 3 && !isTotal ? "text-right text-gray-700" : ""} ${isTotal ? "border-gray-400" : ""}`}
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  );
                })}

                {/* Rodapé com metadados */}
                <tr>
                  <td
                    colSpan={PREVIEW_COLS.length}
                    className="px-3 py-1.5 text-[10px] text-gray-400 border border-gray-200 bg-gray-50 text-right"
                  >
                    Gerado em {todayBR()} · ERP FC Engenharia
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="px-4 py-2 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
            <span className="text-[10px] text-gray-400">
              Este é um exemplo com dados fictícios. O arquivo real conterá os dados do período selecionado.
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={handlePreview}
              disabled={previewMutation.isPending}
              className="h-7 text-xs gap-1.5"
            >
              {previewMutation.isPending ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
              Baixar XLSX real
            </Button>
          </div>
        </div>
      )}

      {/* Lista de todos os relatórios XLSX do sistema */}
      <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 space-y-2">
        <p className="text-xs font-semibold text-gray-600">
          Relatórios XLSX gerados pelo sistema:
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {RELATORIOS_XLSX.map(r => (
            <div
              key={r.nome}
              className={`flex items-center gap-2 px-3 py-2 rounded-md border text-xs ${
                r.template
                  ? "bg-white border-green-200 text-gray-700"
                  : "bg-white border-gray-200 text-gray-500"
              }`}
            >
              <FileSpreadsheet className={`w-3.5 h-3.5 shrink-0 ${r.template ? "text-green-600" : "text-gray-400"}`} />
              <div className="flex-1 min-w-0">
                <span className="font-medium truncate block">{r.nome}</span>
                <span className="text-gray-400">{r.modulo}</span>
              </div>
              {r.template ? (
                <span className="shrink-0 text-[9px] font-semibold text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full">usa template</span>
              ) : (
                <span className="shrink-0 text-[9px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">padrão</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
