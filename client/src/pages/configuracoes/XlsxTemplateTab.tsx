/**
 * XlsxTemplateTab.tsx — Rev. 3845
 * Aba "Template de Planilha" em Configurações do Sistema.
 * Permite configurar o cabeçalho padrão FC para todas as planilhas XLSX exportadas:
 *   - Título/nome da empresa
 *   - Código de revisão (ISO)
 *   - Cor do cabeçalho de colunas
 *   - Aprovado por
 *   - Vigência e notas
 *   - Download de planilha-exemplo para pré-visualização
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
  Calendar, User, StickyNote, Info, CheckCircle2,
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

export default function XlsxTemplateTab() {
  const { companyId } = useCompany();

  const query = trpc.settings.getXlsxTemplateConfig.useQuery(
    { companyId },
    { enabled: !!companyId, staleTime: 30_000 }
  );

  const saveMutation  = trpc.settings.saveXlsxTemplateConfig.useMutation();
  const previewMutation = trpc.settings.downloadXlsxTemplateExemplo.useMutation();

  const [form, setForm] = useState({
    tituloEmpresa: "FC ENGENHARIA E CONSTRUÇÃO LTDA",
    revisao:       "Rev. 01",
    corCabecalho:  "7030A0",
    aprovadoPor:   "Sistema",
    vigentDesde:   "",
    notas:         "",
  });
  const [colorInput, setColorInput] = useState("#7030A0");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (query.data) {
      const d = query.data;
      setForm({
        tituloEmpresa: d.tituloEmpresa ?? "FC ENGENHARIA E CONSTRUÇÃO LTDA",
        revisao:       d.revisao       ?? "Rev. 01",
        corCabecalho:  d.corCabecalho  ?? "7030A0",
        aprovadoPor:   d.aprovadoPor   ?? "Sistema",
        vigentDesde:   d.vigentDesde   ?? "",
        notas:         d.notas         ?? "",
      });
      setColorInput("#" + (d.corCabecalho ?? "7030A0"));
      setDirty(false);
    }
  }, [query.data]);

  const set = (k: keyof typeof form, v: string) => {
    setForm(f => ({ ...f, [k]: v }));
    setDirty(true);
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

  const handleSave = async () => {
    if (!companyId) return;
    const clean = form.corCabecalho.replace(/^#/, "");
    if (!/^[0-9A-Fa-f]{6}$/.test(clean)) {
      toast.error("Cor inválida. Use formato hexadecimal (ex: 7030A0).");
      return;
    }
    try {
      await saveMutation.mutateAsync({
        companyId,
        tituloEmpresa: form.tituloEmpresa,
        revisao:       form.revisao,
        corCabecalho:  clean.toUpperCase(),
        aprovadoPor:   form.aprovadoPor || undefined,
        vigentDesde:   form.vigentDesde || undefined,
        notas:         form.notas       || undefined,
      });
      toast.success("Template de planilha salvo com sucesso!");
      setDirty(false);
      query.refetch();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao salvar");
    }
  };

  const handlePreview = async () => {
    if (!companyId) return;
    try {
      const res = await previewMutation.mutateAsync({ companyId });
      const bytes = Uint8Array.from(atob(res.base64), c => c.charCodeAt(0));
      const blob  = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url   = URL.createObjectURL(blob);
      const a     = document.createElement("a");
      a.href = url; a.download = res.filename; a.click();
      URL.revokeObjectURL(url);
      toast.success("Planilha-exemplo baixada!");
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao gerar exemplo");
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

  return (
    <div className="space-y-6">
      {/* Cabeçalho da aba */}
      <div className="rounded-xl border border-green-200 bg-green-50/60 px-4 py-3">
        <p className="text-sm font-semibold text-green-800 flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4" /> Template Padrão FC para Planilhas XLSX
        </p>
        <p className="text-xs text-green-700/80 mt-0.5">
          Define o cabeçalho institucional aplicado automaticamente em todos os relatórios XLSX gerados pelo sistema
          (Folha de Pagamento, Custos por Obra, Extrato Bancário, etc.).
          A planilha-exemplo permite visualizar o resultado antes de aplicar.
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
              <Label htmlFor="revisao" className="text-xs text-gray-600 flex items-center gap-1">
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

            <div className="space-y-1.5">
              <Label htmlFor="vigente_desde" className="text-xs text-gray-600 flex items-center gap-1">
                <Calendar className="w-3 h-3" /> Vigente desde
              </Label>
              <Input
                id="vigente_desde"
                value={form.vigentDesde}
                onChange={e => set("vigentDesde", e.target.value)}
                placeholder="DD/MM/AAAA"
                className="h-9 text-sm"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="aprovado_por" className="text-xs text-gray-600 flex items-center gap-1">
              <User className="w-3 h-3" /> Aprovado por
            </Label>
            <Input
              id="aprovado_por"
              value={form.aprovadoPor}
              onChange={e => set("aprovadoPor", e.target.value)}
              placeholder="Nome do responsável pela aprovação"
              className="h-9 text-sm"
            />
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
                value={colorInput.startsWith("#") ? colorInput : "#" + colorInput}
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

          {/* Pré-visualização da cor */}
          <div className="rounded-lg overflow-hidden border border-gray-200">
            <div
              className="px-4 py-3 text-white text-xs font-bold flex items-center gap-2"
              style={{ backgroundColor: colorInput.startsWith("#") ? colorInput : "#" + form.corCabecalho }}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Funcionário · Função · Horas Trab. · Custo Alocado</span>
            </div>
            <div className="px-4 py-2 bg-white text-xs text-gray-600 border-t border-gray-100">
              <span className="font-medium">FC ENGENHARIA</span> · Janeiro 2026
            </div>
          </div>

          {/* Status + ações */}
          {updatedAt && (
            <p className="text-xs text-gray-400 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-green-500" />
              Última atualização: {updatedAt}
              {query.data?.updatedBy ? ` por ${query.data.updatedBy}` : ""}
            </p>
          )}

          <div className="flex gap-2 pt-2">
            <Button
              onClick={handleSave}
              disabled={!dirty || saveMutation.isPending}
              className="flex-1 gap-2 text-sm h-9"
            >
              {saveMutation.isPending ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {dirty ? "Salvar Configurações" : "Salvo"}
            </Button>

            <Button
              variant="outline"
              onClick={handlePreview}
              disabled={previewMutation.isPending}
              className="gap-2 text-sm h-9"
              title="Baixar planilha-exemplo com o template atual"
            >
              {previewMutation.isPending ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              Exemplo
            </Button>
          </div>
        </div>
      </div>

      {/* Legenda de relatórios afetados */}
      <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
        <p className="text-xs font-semibold text-gray-600 mb-2">
          Relatórios que usam este template:
        </p>
        <div className="flex flex-wrap gap-1.5">
          {[
            "Extrato Bancário (Contabilidade)",
            "Custos por Obra (Folha de Pagamento)",
            "Exemplo de Template",
          ].map(r => (
            <span key={r} className="inline-flex items-center gap-1 bg-white border border-gray-200 text-gray-600 text-xs px-2 py-0.5 rounded-full">
              <FileSpreadsheet className="w-3 h-3 text-green-600" /> {r}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
