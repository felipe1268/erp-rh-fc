/**
 * XlsxTemplateTab.tsx — Rev. 3847
 * Aba "Template de Planilha" em Configurações do Sistema.
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
  Calendar, User, StickyNote, Info, CheckCircle2, Lock,
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

interface Props {
  userName?: string;
}

export default function XlsxTemplateTab({ userName }: Props) {
  const { companyId } = useCompany();

  const query = trpc.settings.getXlsxTemplateConfig.useQuery(
    { companyId },
    { enabled: !!companyId, staleTime: 30_000 }
  );

  const saveMutation = trpc.settings.saveXlsxTemplateConfig.useMutation({
    onSuccess: () => {
      toast.success("Template de planilha salvo com sucesso!");
      setDirty(false);
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
    vigentDesde:   "",
    notas:         "",
  });
  const [colorInput, setColorInput] = useState("#7030A0");
  const [dirty, setDirty] = useState(false);
  const [lastApprovedBy, setLastApprovedBy] = useState<string | null>(null);

  useEffect(() => {
    if (query.data) {
      const d = query.data;
      setForm({
        tituloEmpresa: d.tituloEmpresa ?? "FC ENGENHARIA E CONSTRUÇÃO LTDA",
        revisao:       d.revisao       ?? "Rev. 01",
        corCabecalho:  d.corCabecalho  ?? "7030A0",
        vigentDesde:   d.vigentDesde   ?? "",
        notas:         d.notas         ?? "",
      });
      setColorInput("#" + (d.corCabecalho ?? "7030A0"));
      setLastApprovedBy(d.aprovadoPor ?? d.updatedBy ?? null);
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
    // "Aprovado por" é sempre o usuário logado
    const aprovadoPor = userName || "Sistema";
    saveMutation.mutate({
      companyId,
      tituloEmpresa: form.tituloEmpresa,
      revisao:       form.revisao,
      corCabecalho:  clean.toUpperCase(),
      aprovadoPor,
      vigentDesde:   form.vigentDesde || undefined,
      notas:         form.notas       || undefined,
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

  return (
    <div className="space-y-6">
      {/* Cabeçalho da aba */}
      <div className="rounded-xl border border-green-200 bg-green-50/60 px-4 py-3">
        <p className="text-sm font-semibold text-green-800 flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4" /> Template Padrão FC para Planilhas XLSX
        </p>
        <p className="text-xs text-green-700/80 mt-0.5">
          Define o cabeçalho institucional aplicado automaticamente em todos os relatórios XLSX gerados pelo sistema.
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

          {/* Aprovado por — read-only, preenchido automaticamente */}
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

          {/* Pré-visualização da cor */}
          <div className="rounded-lg overflow-hidden border border-gray-200">
            <div
              className="px-4 py-3 text-white text-xs font-bold flex items-center gap-2"
              style={{ backgroundColor: displayColor }}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Funcionário · Função · Horas Trab. · Custo Alocado</span>
            </div>
            <div className="px-4 py-2 bg-white text-xs text-gray-600 border-t border-gray-100">
              <span className="font-medium">{form.tituloEmpresa || "FC ENGENHARIA"}</span> · Janeiro 2026
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
              {saveMutation.isPending ? "Salvando…" : dirty ? "Salvar Configurações" : "Salvo ✓"}
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
