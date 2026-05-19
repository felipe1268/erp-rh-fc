/**
 * Rev. 2141 — Aba "Templates de Documentos" em Configurações.
 *
 * UI 3 colunas:
 *  [esquerda] Lista dos 7 tipos de template
 *  [centro]   Editor WYSIWYG (TipTap) + toolbar + comentário + ações
 *  [direita]  Sidebar de placeholders clicáveis + histórico de revisões
 *
 * Cada Salvar cria uma nova Rev. (1, 2, ...) com autor/data/comentário.
 * Possível restaurar qualquer versão antiga (vira nova Rev. atual).
 */

import { useState, useRef, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  FileSignature, ShieldCheck, Megaphone, AlertTriangle, BellRing,
  UserX, Hammer, Save, History, RotateCcw, Eye, FileText, Search, Info, Loader2,
} from "lucide-react";
import RichTextEditor, { type RichTextEditorHandle } from "@/components/RichTextEditor";
import {
  DOCUMENT_TEMPLATES_META,
  renderTemplate,
  type DocumentTemplateTipo,
  type PlaceholderDef,
} from "@shared/documentTemplates";

const ICON_MAP: Record<string, any> = {
  FileSignature, ShieldCheck, Megaphone, AlertTriangle, BellRing, UserX, Hammer,
};

function formatDataHora(iso?: string | null) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return "—"; }
}

export default function TemplatesDocsTab() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "admin_master";

  const [tipoSelecionado, setTipoSelecionado] = useState<DocumentTemplateTipo>("contrato_experiencia");
  const [conteudoEditado, setConteudoEditado] = useState("");
  const [comentario, setComentario] = useState("");
  const [versaoVisualizada, setVersaoVisualizada] = useState<number | undefined>(undefined);
  const [mostrarHistorico, setMostrarHistorico] = useState(false);
  const [mostrarPreview, setMostrarPreview] = useState(false);
  const editorRef = useRef<RichTextEditorHandle>(null);

  const utils = trpc.useUtils();
  const listAllQuery = trpc.systemDocumentTemplates.listAll.useQuery();
  const getQuery = trpc.systemDocumentTemplates.get.useQuery(
    { tipo: tipoSelecionado, versao: versaoVisualizada },
    { enabled: !!tipoSelecionado }
  );
  const versionsQuery = trpc.systemDocumentTemplates.listVersions.useQuery(
    { tipo: tipoSelecionado },
    { enabled: !!tipoSelecionado && mostrarHistorico }
  );

  const meta = useMemo(
    () => DOCUMENT_TEMPLATES_META.find(m => m.tipo === tipoSelecionado)!,
    [tipoSelecionado]
  );

  // Quando muda tipo / versão / dados do servidor → recarrega editor
  useEffect(() => {
    if (getQuery.data) {
      setConteudoEditado(getQuery.data.conteudoHtml || "");
    }
  }, [getQuery.data]);

  // Quando muda o tipo, reseta versão visualizada e comentário
  useEffect(() => {
    setVersaoVisualizada(undefined);
    setComentario("");
  }, [tipoSelecionado]);

  const saveMut = trpc.systemDocumentTemplates.save.useMutation({
    onSuccess: (res) => {
      if ((res as any).semMudanca) {
        toast.info("Nada para salvar — o conteúdo é igual ao da versão atual.");
        return;
      }
      toast.success(`Template salvo como Rev. ${res.versao}.`);
      setComentario("");
      setVersaoVisualizada(undefined);
      utils.systemDocumentTemplates.listAll.invalidate();
      utils.systemDocumentTemplates.get.invalidate({ tipo: tipoSelecionado });
      utils.systemDocumentTemplates.listVersions.invalidate({ tipo: tipoSelecionado });
    },
    onError: (e) => toast.error(e.message || "Falha ao salvar template."),
  });

  const restoreMut = trpc.systemDocumentTemplates.restoreVersion.useMutation({
    onSuccess: (res) => {
      toast.success(`Versão restaurada como Rev. ${res.novaVersao}.`);
      setVersaoVisualizada(undefined);
      utils.systemDocumentTemplates.listAll.invalidate();
      utils.systemDocumentTemplates.get.invalidate({ tipo: tipoSelecionado });
      utils.systemDocumentTemplates.listVersions.invalidate({ tipo: tipoSelecionado });
    },
    onError: (e) => toast.error(e.message || "Falha ao restaurar versão."),
  });

  // Preview com dados de exemplo
  const previewHtml = useMemo(() => {
    if (!conteudoEditado) return "";
    const dadosExemplo: Record<string, string> = {};
    meta.placeholders.forEach(p => { dadosExemplo[p.chave] = p.exemplo; });
    return renderTemplate(conteudoEditado, dadosExemplo);
  }, [conteudoEditado, meta]);

  // Agrupa placeholders por grupo
  const placeholdersPorGrupo = useMemo(() => {
    const map = new Map<string, PlaceholderDef[]>();
    meta.placeholders.forEach(p => {
      const arr = map.get(p.grupo) ?? [];
      arr.push(p);
      map.set(p.grupo, arr);
    });
    return Array.from(map.entries());
  }, [meta]);

  const insertPlaceholder = (chave: string) => {
    editorRef.current?.insertText(`{{${chave}}}`);
  };

  const handleSalvar = () => {
    if (!conteudoEditado || conteudoEditado === "<p></p>") {
      toast.error("Conteúdo não pode ser vazio.");
      return;
    }
    saveMut.mutate({ tipo: tipoSelecionado, conteudoHtml: conteudoEditado, comentario: comentario || undefined });
  };

  const handleRestaurar = (versao: number) => {
    if (!confirm(`Restaurar Rev. ${versao} como versão atual? Isso vai criar uma nova revisão (Rev. ${(getQuery.data?.template?.versaoAtual ?? 0) + 1}) idêntica à Rev. ${versao}.`)) return;
    restoreMut.mutate({ tipo: tipoSelecionado, versao });
  };

  const visualizandoVersaoAntiga = versaoVisualizada != null && getQuery.data?.template?.versaoAtual && versaoVisualizada !== getQuery.data.template.versaoAtual;

  if (!isAdmin) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 text-amber-800">
        <AlertTriangle className="w-6 h-6 mb-2" />
        Apenas administradores podem gerenciar templates de documentos.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border rounded-lg p-4">
        <div className="flex items-start gap-3">
          <FileText className="w-6 h-6 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-gray-800">Templates de Documentos Institucionais</h2>
            <p className="text-sm text-gray-600 mt-1">
              Edite aqui os textos dos documentos oficiais FC sem precisar mexer no código. Cada alteração gera uma nova revisão (Rev. 1, 2, 3...) com autor/data e é possível restaurar qualquer versão antiga.
              Use placeholders como <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">{`{{empNome}}`}</code> para campos dinâmicos.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* COLUNA ESQUERDA — Lista de tipos */}
        <div className="col-span-12 md:col-span-3">
          <div className="bg-white border rounded-lg overflow-hidden">
            <div className="px-3 py-2 bg-gray-50 border-b text-xs font-semibold text-gray-600 uppercase">
              Documentos
            </div>
            <div className="divide-y">
              {(listAllQuery.data ?? DOCUMENT_TEMPLATES_META).map((row: any) => {
                const Icon = ICON_MAP[row.icone] || FileText;
                const isAtivo = row.tipo === tipoSelecionado;
                const existe = (row as any).existe ?? false;
                const versaoAtual = (row as any).versaoAtual ?? 0;
                return (
                  <button
                    key={row.tipo}
                    onClick={() => setTipoSelecionado(row.tipo as DocumentTemplateTipo)}
                    className={`w-full text-left px-3 py-2.5 hover:bg-gray-50 transition-colors flex items-start gap-2 ${isAtivo ? "bg-blue-50 border-l-4 border-blue-600" : "border-l-4 border-transparent"}`}
                  >
                    <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${isAtivo ? "text-blue-700" : "text-gray-500"}`} />
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-medium ${isAtivo ? "text-blue-900" : "text-gray-800"}`}>{row.titulo}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {existe ? `Rev. ${versaoAtual}` : <span className="italic text-amber-600">Não criado</span>}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* COLUNA CENTRO — Editor */}
        <div className="col-span-12 md:col-span-6">
          <div className="bg-white border rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-base font-semibold text-gray-800">{meta.titulo}</h3>
                <p className="text-xs text-gray-500">{meta.descricao}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setMostrarHistorico(v => !v)}>
                  <History className="w-4 h-4 mr-1" />
                  Histórico
                </Button>
                <Button variant="outline" size="sm" onClick={() => setMostrarPreview(v => !v)}>
                  <Eye className="w-4 h-4 mr-1" />
                  {mostrarPreview ? "Editor" : "Preview"}
                </Button>
              </div>
            </div>

            {visualizandoVersaoAntiga && (
              <div className="mb-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Info className="w-4 h-4" />
                  Visualizando <strong>Rev. {versaoVisualizada}</strong> (somente leitura). Atual é Rev. {getQuery.data?.template?.versaoAtual}.
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="outline" onClick={() => setVersaoVisualizada(undefined)}>Voltar à atual</Button>
                  <Button size="sm" onClick={() => handleRestaurar(versaoVisualizada!)} disabled={restoreMut.isPending}>
                    <RotateCcw className="w-3.5 h-3.5 mr-1" /> Restaurar esta
                  </Button>
                </div>
              </div>
            )}

            {getQuery.isLoading ? (
              <div className="h-96 flex items-center justify-center text-gray-400">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando...
              </div>
            ) : mostrarPreview ? (
              <div className="border rounded-lg bg-white p-6 prose prose-sm max-w-none min-h-[420px]" dangerouslySetInnerHTML={{ __html: previewHtml || "<p class='text-gray-400'>Sem conteúdo.</p>" }} />
            ) : (
              <RichTextEditor
                ref={editorRef}
                value={conteudoEditado}
                onChange={setConteudoEditado}
                readOnly={!!visualizandoVersaoAntiga}
                minHeight={420}
              />
            )}

            {!visualizandoVersaoAntiga && !mostrarPreview && (
              <div className="mt-3 space-y-2">
                <label className="text-xs font-medium text-gray-700">Comentário desta revisão (opcional)</label>
                <Input
                  value={comentario}
                  onChange={(e) => setComentario(e.target.value)}
                  placeholder="Ex: Ajuste da cláusula 3ª conforme parecer jurídico"
                  maxLength={500}
                />
                <div className="flex items-center justify-between">
                  <div className="text-xs text-gray-500">
                    {getQuery.data?.template ? (
                      <>Rev. atual: <strong>{getQuery.data.template.versaoAtual}</strong> · Atualizado em {formatDataHora(getQuery.data.template.updatedAt)} por {getQuery.data.template.atualizadoPorNome || "—"}</>
                    ) : (
                      <span className="italic">Template ainda não foi criado — ao salvar, será criada a Rev. 1.</span>
                    )}
                  </div>
                  <Button onClick={handleSalvar} disabled={saveMut.isPending}>
                    {saveMut.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
                    Salvar Nova Revisão
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* COLUNA DIREITA — Placeholders + Histórico */}
        <div className="col-span-12 md:col-span-3 space-y-4">
          <div className="bg-white border rounded-lg overflow-hidden">
            <div className="px-3 py-2 bg-gray-50 border-b text-xs font-semibold text-gray-600 uppercase flex items-center gap-1">
              <Search className="w-3.5 h-3.5" /> Placeholders disponíveis
            </div>
            <div className="p-2 max-h-[480px] overflow-y-auto">
              {placeholdersPorGrupo.map(([grupo, items]) => (
                <div key={grupo} className="mb-3">
                  <div className="text-[10px] font-bold text-gray-500 uppercase mb-1 px-1">{grupo}</div>
                  <div className="space-y-1">
                    {items.map(ph => (
                      <button
                        key={ph.chave}
                        onClick={() => insertPlaceholder(ph.chave)}
                        title={`Inserir {{${ph.chave}}} no cursor — Ex: ${ph.exemplo}`}
                        disabled={!!visualizandoVersaoAntiga || mostrarPreview}
                        className="w-full text-left px-2 py-1.5 rounded hover:bg-blue-50 hover:text-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed group"
                      >
                        <div className="text-xs font-medium text-gray-800 group-hover:text-blue-700 truncate">{ph.rotulo}</div>
                        <div className="text-[10px] text-gray-500 font-mono truncate">{`{{${ph.chave}}}`}</div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {mostrarHistorico && (
            <div className="bg-white border rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-gray-50 border-b text-xs font-semibold text-gray-600 uppercase flex items-center gap-1">
                <History className="w-3.5 h-3.5" /> Histórico de revisões
              </div>
              <div className="max-h-[360px] overflow-y-auto divide-y">
                {versionsQuery.isLoading ? (
                  <div className="p-3 text-xs text-gray-400">Carregando...</div>
                ) : (versionsQuery.data ?? []).length === 0 ? (
                  <div className="p-3 text-xs text-gray-400 italic">Sem versões salvas.</div>
                ) : (
                  (versionsQuery.data ?? []).map((v: any) => (
                    <button
                      key={v.id}
                      onClick={() => setVersaoVisualizada(v.versao)}
                      className={`w-full text-left p-2.5 hover:bg-gray-50 transition-colors ${versaoVisualizada === v.versao ? "bg-blue-50" : ""}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-gray-800">Rev. {v.versao}</span>
                        {v.ehAtual && <span className="text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded font-medium">ATUAL</span>}
                      </div>
                      <div className="text-[10px] text-gray-500 mt-0.5">{formatDataHora(v.createdAt)} · {v.criadoPorNome || "—"}</div>
                      {v.comentario && <div className="text-[11px] text-gray-600 mt-1 italic line-clamp-2">{v.comentario}</div>}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
