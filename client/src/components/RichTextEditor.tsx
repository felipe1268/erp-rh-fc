/**
 * Rev. 2141 — Editor WYSIWYG (TipTap) para a aba Templates de Documentos.
 *
 * Toolbar com formatação básica (negrito, itálico, sublinhado, listas,
 * títulos, alinhamento, undo/redo). Expõe método `insertText` para que o
 * componente pai consiga inserir placeholders no cursor a partir da
 * sidebar de placeholders clicáveis.
 */

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import DOMPurify from "dompurify";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Placeholder from "@tiptap/extension-placeholder";
import { useEffect, useImperativeHandle, forwardRef } from "react";
import {
  Bold, Italic, Underline as UnderlineIcon, List, ListOrdered,
  Heading1, Heading2, Heading3, AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Undo2, Redo2, Quote, Pilcrow, Minus,
} from "lucide-react";

export type RichTextEditorHandle = {
  insertText: (text: string) => void;
  getHTML: () => string;
  focus: () => void;
};

type Props = {
  value: string;
  onChange: (html: string) => void;
  readOnly?: boolean;
  minHeight?: number;
  /** Tipografia mais larga/confortável para leitura (fonte maior, espaçamento). */
  readable?: boolean;
};

function ToolbarButton({
  active, disabled, onClick, title, children,
}: { active?: boolean; disabled?: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`p-1.5 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
        active ? "bg-blue-100 text-blue-700" : "text-gray-600 hover:bg-gray-100"
      }`}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <div className="w-px bg-gray-200 mx-1 self-stretch" />;
}

const RichTextEditor = forwardRef<RichTextEditorHandle, Props>(function RichTextEditor(
  { value, onChange, readOnly, minHeight = 420, readable = false }, ref
) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Placeholder.configure({ placeholder: "Comece a digitar o template ou cole o HTML existente..." }),
    ],
    content: value || "",
    editable: !readOnly,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    immediatelyRender: false,
  });

  // Sincroniza quando value externo muda (ex: trocar de versão / tipo)
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (value !== current) {
      editor.commands.setContent(value || "", { emitUpdate: false });
    }
  }, [value, editor]);

  // Atualiza editable quando readOnly muda
  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!readOnly);
  }, [readOnly, editor]);

  useImperativeHandle(ref, () => ({
    insertText: (text: string) => {
      if (!editor) return;
      editor.chain().focus().insertContent(text).run();
    },
    getHTML: () => editor?.getHTML() ?? "",
    focus: () => editor?.commands.focus(),
  }), [editor]);

  if (!editor) {
    return <div className="border rounded-lg p-4 text-sm text-gray-400">Carregando editor...</div>;
  }

  return (
    <div className="border rounded-lg bg-white">
      {!readOnly && (
        <div className="flex items-center flex-wrap gap-0.5 px-2 py-1.5 border-b bg-gray-50 sticky top-0 z-10 rounded-t-lg">
          <ToolbarButton title="Desfazer (Ctrl+Z)" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}>
            <Undo2 className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton title="Refazer (Ctrl+Shift+Z)" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}>
            <Redo2 className="w-4 h-4" />
          </ToolbarButton>
          <Sep />
          <ToolbarButton title="Parágrafo" active={editor.isActive("paragraph")} onClick={() => editor.chain().focus().setParagraph().run()}>
            <Pilcrow className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton title="Título 1" active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
            <Heading1 className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton title="Título 2" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
            <Heading2 className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton title="Título 3" active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
            <Heading3 className="w-4 h-4" />
          </ToolbarButton>
          <Sep />
          <ToolbarButton title="Negrito (Ctrl+B)" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
            <Bold className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton title="Itálico (Ctrl+I)" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
            <Italic className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton title="Sublinhado (Ctrl+U)" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}>
            <UnderlineIcon className="w-4 h-4" />
          </ToolbarButton>
          <Sep />
          <ToolbarButton title="Lista" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
            <List className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton title="Lista numerada" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
            <ListOrdered className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton title="Citação" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
            <Quote className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton title="Divisor" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
            <Minus className="w-4 h-4" />
          </ToolbarButton>
          <Sep />
          <ToolbarButton title="Esquerda" active={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()}>
            <AlignLeft className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton title="Centro" active={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()}>
            <AlignCenter className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton title="Direita" active={editor.isActive({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()}>
            <AlignRight className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton title="Justificado" active={editor.isActive({ textAlign: "justify" })} onClick={() => editor.chain().focus().setTextAlign("justify").run()}>
            <AlignJustify className="w-4 h-4" />
          </ToolbarButton>
        </div>
      )}
      <EditorContent
        editor={editor}
        className={`prose ${readable ? "prose-base leading-relaxed [&_.ProseMirror]:leading-relaxed [&_.ProseMirror>*]:max-w-[820px] [&_.ProseMirror>*]:mx-auto px-6 py-5" : "prose-sm p-4"} max-w-none focus:outline-none [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[var(--min-h)] [&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_.ProseMirror_p.is-editor-empty:first-child::before]:text-gray-400 [&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left [&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none [&_.ProseMirror_p.is-editor-empty:first-child::before]:h-0`}
        style={{ ["--min-h" as any]: `${minHeight}px` }}
      />
    </div>
  );
});


// Rev. 2154 — Helpers exportados para uso em listas/visualizações de
// conteúdo rich-text (ComunicadosInternos etc.). Mantidos aqui pra
// ficarem ao lado do editor que produz o HTML.

/** Detecta se a string contém HTML estruturado (tags) em vez de texto puro. */
export function isHtmlContent(s: string | null | undefined): boolean {
  if (!s) return false;
  return /<\/?[a-z][\s\S]*?>/i.test(s);
}

/** Remove todas as tags HTML e devolve só o texto plano (entidades decodificadas). */
export function stripHtml(s: string | null | undefined): string {
  if (!s) return "";
  if (typeof document === "undefined") {
    return s.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  }
  const tmp = document.createElement("div");
  tmp.innerHTML = s;
  return (tmp.textContent || tmp.innerText || "").replace(/\s+/g, " ").trim();
}

/** Sanitiza HTML via DOMPurify com a configuração padrão usada no app. */
export function sanitizeHtml(s: string | null | undefined): string {
  if (!s) return "";
  return DOMPurify.sanitize(s, {
    ALLOWED_TAGS: [
      "p","br","strong","em","u","s","b","i","span","div",
      "ul","ol","li","blockquote","pre","code",
      "h1","h2","h3","h4","h5","h6","hr",
      "a","img","table","thead","tbody","tr","td","th",
    ],
    ALLOWED_ATTR: ["href","target","rel","src","alt","title","style","class","colspan","rowspan"],
  });
}

export default RichTextEditor;
