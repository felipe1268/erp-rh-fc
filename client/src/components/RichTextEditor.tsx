import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { Color } from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";
import Highlight from "@tiptap/extension-highlight";
import Placeholder from "@tiptap/extension-placeholder";
import DOMPurify from "dompurify";
import { useEffect, useRef } from "react";
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, Heading1, Heading2, Quote, Undo, Redo,
  Palette, Highlighter, RemoveFormatting,
} from "lucide-react";

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
}

const TEXT_COLORS = [
  { label: "Padrão",   color: "#0f172a" },
  { label: "Cinza",    color: "#64748b" },
  { label: "Vermelho", color: "#dc2626" },
  { label: "Laranja",  color: "#ea580c" },
  { label: "Amarelo",  color: "#ca8a04" },
  { label: "Verde",    color: "#16a34a" },
  { label: "Azul",     color: "#2563eb" },
  { label: "Índigo",   color: "#4f46e5" },
  { label: "Roxo",     color: "#9333ea" },
  { label: "Rosa",     color: "#db2777" },
];

const HIGHLIGHT_COLORS = [
  { label: "Amarelo", color: "#fef08a" },
  { label: "Verde",   color: "#bbf7d0" },
  { label: "Azul",    color: "#bfdbfe" },
  { label: "Rosa",    color: "#fbcfe8" },
  { label: "Laranja", color: "#fed7aa" },
];

// Tags conhecidas que o editor TipTap pode produzir (alinhadas com a config
// do useEditor abaixo: StarterKit + Underline + TextAlign + Color/TextStyle +
// Highlight, com heading limitado a h1-h3, sem extensão Link). Usamos uma
// lista fechada para evitar falso-positivo em textos legados que contenham
// caracteres "<" e ">" digitados pelo usuário.
const KNOWN_HTML_TAG_RE =
  /<\/?(?:p|br|div|span|strong|b|em|i|u|s|mark|h[1-3]|ul|ol|li|blockquote|hr)\b[^>]*>/i;

/** Heurística robusta para detectar se o conteúdo armazenado é HTML do editor. */
export function isHtmlContent(text: string | null | undefined): boolean {
  if (!text) return false;
  return KNOWN_HTML_TAG_RE.test(text);
}

/**
 * Converte texto plano com quebras de linha em HTML <p> para uso inicial no
 * editor. Se já vier HTML, retorna como está.
 */
export function plainTextToHtml(text: string | null | undefined): string {
  if (!text) return "";
  if (isHtmlContent(text)) return text;
  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return text
    .split(/\n/)
    .map((line) => (line.trim() === "" ? "<p></p>" : `<p>${escape(line)}</p>`))
    .join("");
}

/**
 * Sanitiza o HTML antes de renderizar com dangerouslySetInnerHTML.
 * Permite apenas tags/atributos que o editor pode produzir; remove qualquer
 * `<script>`, handlers `on*`, URLs `javascript:` etc.
 */
export function sanitizeHtml(html: string | null | undefined): string {
  if (!html) return "";
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "p", "br", "div", "span", "strong", "b", "em", "i", "u", "s", "mark",
      "h1", "h2", "h3",
      "ul", "ol", "li", "blockquote", "hr",
    ],
    ALLOWED_ATTR: ["style", "class"],
  });
}

/**
 * Remove tags HTML para gerar uma prévia em texto puro (usada na lista).
 */
export function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function ToolbarBtn({
  onClick, active, disabled, title, children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`h-8 w-8 inline-flex items-center justify-center rounded-md text-sm transition-colors disabled:opacity-30 ${
        active
          ? "bg-blue-100 text-blue-700"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      }`}
    >
      {children}
    </button>
  );
}

function ColorPicker({
  editor, type, icon, title,
}: {
  editor: Editor;
  type: "text" | "highlight";
  icon: React.ReactNode;
  title: string;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  // Fecha o dropdown ao clicar fora
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        ref.current.removeAttribute("open");
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const colors = type === "text" ? TEXT_COLORS : HIGHLIGHT_COLORS;
  const isHighlightActive = type === "highlight" && editor.isActive("highlight");

  return (
    <details ref={ref} className="relative inline-block">
      <summary
        title={title}
        className={`list-none cursor-pointer h-8 w-8 inline-flex items-center justify-center rounded-md text-sm transition-colors ${
          isHighlightActive ? "bg-blue-100 text-blue-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        }`}
      >
        {icon}
      </summary>
      <div className="absolute z-50 mt-1 left-0 bg-white border border-slate-200 rounded-lg shadow-lg p-2 grid grid-cols-5 gap-1 min-w-[180px]">
        {colors.map((c) => (
          <button
            key={c.color}
            type="button"
            title={c.label}
            onMouseDown={(e) => {
              e.preventDefault();
              if (type === "text") editor.chain().focus().setColor(c.color).run();
              else editor.chain().focus().toggleHighlight({ color: c.color }).run();
              ref.current?.removeAttribute("open");
            }}
            className="h-7 w-7 rounded border border-slate-200 hover:scale-110 transition-transform"
            style={{ backgroundColor: c.color }}
          />
        ))}
        <button
          type="button"
          title="Remover cor"
          onMouseDown={(e) => {
            e.preventDefault();
            if (type === "text") editor.chain().focus().unsetColor().run();
            else editor.chain().focus().unsetHighlight().run();
            ref.current?.removeAttribute("open");
          }}
          className="col-span-5 mt-1 text-[10px] text-slate-500 hover:text-slate-800 py-1"
        >
          Remover {type === "text" ? "cor do texto" : "destaque"}
        </button>
      </div>
    </details>
  );
}

export default function RichTextEditor({
  value, onChange, placeholder, className, minHeight = "180px",
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      Placeholder.configure({ placeholder: placeholder ?? "Digite o texto..." }),
    ],
    content: sanitizeHtml(plainTextToHtml(value)),
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none focus:outline-none px-4 py-3 prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1",
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      onChange(html === "<p></p>" ? "" : html);
    },
  });

  // Sincroniza valor externo quando muda fora do editor (ex: troca de comunicado)
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    const incoming = sanitizeHtml(plainTextToHtml(value));
    if (current !== incoming && incoming !== "<p></p>" && incoming !== "") {
      editor.commands.setContent(incoming, { emitUpdate: false });
    }
  }, [value, editor]);

  if (!editor) {
    return (
      <div
        className={`border border-slate-200 rounded-md bg-slate-50 ${className ?? ""}`}
        style={{ minHeight }}
      />
    );
  }

  return (
    <div className={`border border-slate-200 rounded-md bg-white flex flex-col overflow-hidden ${className ?? ""}`}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-slate-200 bg-slate-50/80">
        <ToolbarBtn title="Desfazer" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}>
          <Undo className="h-4 w-4" />
        </ToolbarBtn>
        <ToolbarBtn title="Refazer" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}>
          <Redo className="h-4 w-4" />
        </ToolbarBtn>

        <div className="w-px h-5 bg-slate-300 mx-1" />

        <ToolbarBtn title="Título 1" active={editor.isActive("heading", { level: 1 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
          <Heading1 className="h-4 w-4" />
        </ToolbarBtn>
        <ToolbarBtn title="Título 2" active={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          <Heading2 className="h-4 w-4" />
        </ToolbarBtn>

        <div className="w-px h-5 bg-slate-300 mx-1" />

        <ToolbarBtn title="Negrito (Ctrl+B)" active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold className="h-4 w-4" />
        </ToolbarBtn>
        <ToolbarBtn title="Itálico (Ctrl+I)" active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic className="h-4 w-4" />
        </ToolbarBtn>
        <ToolbarBtn title="Sublinhado (Ctrl+U)" active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <UnderlineIcon className="h-4 w-4" />
        </ToolbarBtn>
        <ToolbarBtn title="Tachado" active={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}>
          <Strikethrough className="h-4 w-4" />
        </ToolbarBtn>

        <div className="w-px h-5 bg-slate-300 mx-1" />

        <ColorPicker editor={editor} type="text" title="Cor do texto" icon={<Palette className="h-4 w-4" />} />
        <ColorPicker editor={editor} type="highlight" title="Destacar (marca-texto)" icon={<Highlighter className="h-4 w-4" />} />

        <div className="w-px h-5 bg-slate-300 mx-1" />

        <ToolbarBtn title="Alinhar à esquerda" active={editor.isActive({ textAlign: "left" })}
          onClick={() => editor.chain().focus().setTextAlign("left").run()}>
          <AlignLeft className="h-4 w-4" />
        </ToolbarBtn>
        <ToolbarBtn title="Centralizar" active={editor.isActive({ textAlign: "center" })}
          onClick={() => editor.chain().focus().setTextAlign("center").run()}>
          <AlignCenter className="h-4 w-4" />
        </ToolbarBtn>
        <ToolbarBtn title="Alinhar à direita" active={editor.isActive({ textAlign: "right" })}
          onClick={() => editor.chain().focus().setTextAlign("right").run()}>
          <AlignRight className="h-4 w-4" />
        </ToolbarBtn>
        <ToolbarBtn title="Justificar" active={editor.isActive({ textAlign: "justify" })}
          onClick={() => editor.chain().focus().setTextAlign("justify").run()}>
          <AlignJustify className="h-4 w-4" />
        </ToolbarBtn>

        <div className="w-px h-5 bg-slate-300 mx-1" />

        <ToolbarBtn title="Lista com marcadores" active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List className="h-4 w-4" />
        </ToolbarBtn>
        <ToolbarBtn title="Lista numerada" active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered className="h-4 w-4" />
        </ToolbarBtn>
        <ToolbarBtn title="Citação" active={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}>
          <Quote className="h-4 w-4" />
        </ToolbarBtn>

        <div className="w-px h-5 bg-slate-300 mx-1" />

        <ToolbarBtn title="Limpar formatação"
          onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}>
          <RemoveFormatting className="h-4 w-4" />
        </ToolbarBtn>
      </div>

      {/* Área editável */}
      <div className="flex-1 overflow-auto bg-white" style={{ minHeight }}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
