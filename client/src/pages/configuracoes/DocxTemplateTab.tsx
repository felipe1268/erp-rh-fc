/**
 * DocxTemplateTab.tsx — Rev. 3865
 * Aba "Template de Word" em Configurações do Sistema.
 * Configura o modelo padrão FC para documentos Word (.docx) gerados pelo sistema:
 *  - Cor principal do cabeçalho / seções
 *  - E-mail e nome do contador destinatário
 *  - Download de exemplo .docx com a config atual
 */
import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  FileText, Palette, Save, Download, RefreshCw,
  Mail, User, StickyNote, Info, CheckCircle2, Lock,
} from "lucide-react";

const COLOR_PRESETS: { label: string; hex: string; val: string }[] = [
  { label: "Azul FC (padrão)",  hex: "#1B2A4A", val: "1B2A4A" },
  { label: "Azul Royal",        hex: "#2E4DA7", val: "2E4DA7" },
  { label: "Roxo FC",           hex: "#7030A0", val: "7030A0" },
  { label: "Verde FC",          hex: "#00B050", val: "00B050" },
  { label: "Cinza Escuro",      hex: "#404040", val: "404040" },
  { label: "Marinho",           hex: "#1E3A5F", val: "1E3A5F" },
];

interface Props {
  userName?: string;
}

export default function DocxTemplateTab({ userName }: Props) {
  const { companyIdNum: companyId } = useCompany();

  const query = trpc.settings.getDocxTemplateConfig.useQuery(
    { companyId: companyId! },
    { enabled: !!companyId, staleTime: 30_000 }
  );

  const saveMutation = trpc.settings.saveDocxTemplateConfig.useMutation({
    onSuccess: () => {
      toast.success("Template Word salvo com sucesso!");
      query.refetch();
    },
    onError: (e) => toast.error(e?.message ?? "Erro ao salvar template"),
  });

  const previewMutation = trpc.settings.downloadDocxTemplateExemplo.useMutation({
    onError: (e) => toast.error(e?.message ?? "Erro ao gerar exemplo"),
  });

  const [form, setForm] = useState({
    corPrincipal:  "1B2A4A",
    emailContador: "contabil@pronustributario.com.br",
    nomeContador:  "Pronus Tributário",
    notas:         "",
  });
  const [colorInput, setColorInput] = useState("#1B2A4A");

  useEffect(() => {
    if (query.data) {
      const d = query.data;
      setForm({
        corPrincipal:  d.corPrincipal  ?? "1B2A4A",
        emailContador: d.emailContador ?? "contabil@pronustributario.com.br",
        nomeContador:  d.nomeContador  ?? "Pronus Tributário",
        notas:         d.notas         ?? "",
      });
      setColorInput("#" + (d.corPrincipal ?? "1B2A4A"));
    }
  }, [query.data]);

  const set = (k: keyof typeof form, v: string) =>
    setForm(f => ({ ...f, [k]: v }));

  const handleColorPreset = (hex: string, val: string) => {
    setColorInput(hex);
    set("corPrincipal", val);
  };

  const handleColorInput = (v: string) => {
    setColorInput(v);
    const clean = v.replace(/^#/, "");
    if (/^[0-9A-Fa-f]{6}$/.test(clean)) set("corPrincipal", clean.toUpperCase());
  };

  const handleSave = () => {
    if (!companyId) { toast.error("Selecione uma empresa antes de salvar."); return; }
    const clean = form.corPrincipal.replace(/^#/, "");
    if (!/^[0-9A-Fa-f]{6}$/.test(clean)) { toast.error("Cor inválida. Use formato hexadecimal (ex: 1B2A4A)."); return; }
    saveMutation.mutate({
      companyId,
      corPrincipal:  clean.toUpperCase(),
      emailContador: form.emailContador,
      nomeContador:  form.nomeContador,
      notas:         form.notas || undefined,
    });
  };

  const handlePreview = async () => {
    if (!companyId) { toast.error("Selecione uma empresa."); return; }
    try {
      const res = await previewMutation.mutateAsync({ companyId });
      const bytes = Uint8Array.from(atob(res.base64), c => c.charCodeAt(0));
      const blob  = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
      const url   = URL.createObjectURL(blob);
      const a     = document.createElement("a");
      a.href = url; a.download = res.filename; a.click();
      URL.revokeObjectURL(url);
      toast.success("Documento Word de exemplo baixado!");
    } catch { /* onError já tratou */ }
  };

  if (query.isLoading) {
    return (
      <div className="flex items-center gap-2 text-gray-500 py-8 justify-center">
        <RefreshCw className="w-4 h-4 animate-spin" /> Carregando configurações…
      </div>
    );
  }

  const displayColor = colorInput.startsWith("#") ? colorInput : "#" + form.corPrincipal;
  const hexColor = displayColor.replace(/^#/, "");
  const r2 = parseInt(hexColor.slice(0,2),16)/255;
  const g2 = parseInt(hexColor.slice(2,4),16)/255;
  const b2 = parseInt(hexColor.slice(4,6),16)/255;
  const lum = 0.2126*r2 + 0.7152*g2 + 0.0722*b2;
  const headerTextColor = lum > 0.45 ? "#1a1a1a" : "#ffffff";

  const updatedAt = query.data?.updatedAt
    ? new Date(query.data.updatedAt).toLocaleString("pt-BR")
    : null;

  return (
    <div className="space-y-6">
      {/* Banner informativo */}
      <div className="rounded-xl border border-blue-200 bg-blue-50/60 px-4 py-3">
        <p className="text-sm font-semibold text-blue-800 flex items-center gap-2">
          <FileText className="w-4 h-4" /> Template Padrão FC para Documentos Word (.docx)
        </p>
        <p className="text-xs text-blue-700/80 mt-0.5">
          Define o padrão visual e os dados do contador aplicados automaticamente nos documentos Word
          gerados pelo sistema (Checklist do Pacote Contabilidade, etc.).
          Clique em <strong>Baixar Exemplo</strong> para ver como o documento ficará.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Coluna esquerda — Contador + notas */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
            <Info className="w-4 h-4 text-gray-400" /> Dados do Contador
          </h3>

          <div className="space-y-1.5">
            <Label htmlFor="nome_contador" className="text-xs text-gray-600 flex items-center gap-1">
              <User className="w-3 h-3" /> Nome / Escritório de Contabilidade
            </Label>
            <Input
              id="nome_contador"
              value={form.nomeContador}
              onChange={e => set("nomeContador", e.target.value)}
              placeholder="Pronus Tributário"
              className="h-9 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email_contador" className="text-xs text-gray-600 flex items-center gap-1">
              <Mail className="w-3 h-3" /> E-mail do Contador
            </Label>
            <Input
              id="email_contador"
              type="email"
              value={form.emailContador}
              onChange={e => set("emailContador", e.target.value)}
              placeholder="contabil@escritorio.com.br"
              className="h-9 text-sm font-mono"
            />
            <p className="text-[10px] text-gray-400">
              Aparece na seção "Checklist — Enviar ao Contador" do documento.
            </p>
          </div>

          {/* Aprovado por — read-only */}
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-600 flex items-center gap-1">
              <Lock className="w-3 h-3" /> Salvo por
            </Label>
            <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-input bg-gray-50 text-sm text-gray-700">
              <Lock className="w-3 h-3 text-gray-400 shrink-0" />
              <span className="flex-1 truncate">{userName || "—"}</span>
              <span className="text-[10px] text-gray-400 shrink-0">(usuário logado)</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notas_docx" className="text-xs text-gray-600 flex items-center gap-1">
              <StickyNote className="w-3 h-3" /> Notas internas
            </Label>
            <textarea
              id="notas_docx"
              value={form.notas}
              onChange={e => set("notas", e.target.value)}
              placeholder="Observações sobre esta configuração de template Word…"
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
            />
          </div>
        </div>

        {/* Coluna direita — Cor + preview */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
            <Palette className="w-4 h-4 text-gray-400" /> Cor Principal do Documento
          </h3>
          <p className="text-xs text-gray-500 -mt-2">
            Aplicada nas faixas de seções, cabeçalho corrente e título do documento.
          </p>

          {/* Paleta de presets */}
          <div className="flex flex-wrap gap-2">
            {COLOR_PRESETS.map(({ label, hex, val }) => {
              const isActive = form.corPrincipal.toUpperCase() === val.toUpperCase();
              return (
                <button
                  key={val}
                  title={label}
                  onClick={() => handleColorPreset(hex, val)}
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
                placeholder="#1B2A4A"
                className="h-9 text-sm font-mono flex-1"
                maxLength={7}
              />
            </div>
          </div>

          {/* Mini preview do documento */}
          <div className="rounded-lg overflow-hidden border border-gray-200 text-xs">
            {/* Cabeçalho do doc */}
            <div
              className="px-4 py-2 flex items-center justify-between"
              style={{ backgroundColor: displayColor, color: headerTextColor }}
            >
              <span className="font-bold text-[11px]">FC ENGENHARIA — PACOTE CONTABILIDADE</span>
              <span className="text-[10px] opacity-80">Junho 2026</span>
            </div>
            {/* Faixa de seção */}
            <div
              className="px-4 py-1.5 font-semibold text-[11px]"
              style={{ backgroundColor: displayColor + "CC", color: headerTextColor }}
            >
              1. ESTRUTURA DO PACOTE
            </div>
            <div className="px-4 py-2 bg-white space-y-1">
              <div className="flex gap-2 text-gray-600"><span>☑</span><span>Faturas_Emitidas/ → NFS-e emitidas</span></div>
              <div className="flex gap-2 text-gray-600"><span>☑</span><span>Extratos_Bancarios/ → Extratos</span></div>
            </div>
            <div className="px-4 py-1.5 text-[10px] text-gray-400 border-t border-gray-100 bg-gray-50 flex justify-between">
              <span>Gerado automaticamente pelo ERP FC Engenharia</span>
              <span>Pág. 1 / 1</span>
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
              {saveMutation.isPending
                ? <RefreshCw className="w-4 h-4 animate-spin" />
                : <Save className="w-4 h-4" />}
              {saveMutation.isPending ? "Salvando…" : "Salvar Configurações"}
            </Button>

            <Button
              variant="outline"
              onClick={handlePreview}
              disabled={previewMutation.isPending}
              className="gap-2 text-sm h-9"
              title="Baixar documento Word de exemplo com esta configuração"
            >
              {previewMutation.isPending
                ? <RefreshCw className="w-4 h-4 animate-spin" />
                : <Download className="w-4 h-4" />}
              DOCX
            </Button>
          </div>
        </div>
      </div>

      {/* Info dos documentos que usam este template */}
      <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-4">
        <h4 className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5" /> Documentos que usam este template
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[
            { nome: "00_CHECKLIST.docx", modulo: "Contabilidade", desc: "Checklist mensal do Pacote do Contador (ZIP)" },
          ].map(doc => (
            <div key={doc.nome} className="flex items-start gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5">
              <FileText className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-gray-700">{doc.nome}</p>
                <p className="text-[10px] text-gray-500">{doc.modulo} · {doc.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
