import { useState, useMemo, useEffect } from "react";
import { HelpCircle, Search, X, ChevronRight, ArrowLeft } from "lucide-react";
import { PORTAL_CLIENTE_ARTIGOS, type HelpArticle } from "@shared/help/portalClienteHelp";

function MdRenderer({ md }: { md: string }) {
  const blocks = useMemo(() => {
    const lines = md.split("\n");
    const out: { type: string; content: any }[] = [];
    let i = 0;
    let buf: string[] = [];
    const flushP = () => {
      if (buf.length) { out.push({ type: "p", content: buf.join(" ") }); buf = []; }
    };
    while (i < lines.length) {
      const ln = lines[i];
      if (/^### /.test(ln)) { flushP(); out.push({ type: "h3", content: ln.replace(/^### /, "") }); i++; continue; }
      if (/^## /.test(ln)) { flushP(); out.push({ type: "h2", content: ln.replace(/^## /, "") }); i++; continue; }
      if (/^> /.test(ln)) { flushP(); out.push({ type: "quote", content: ln.replace(/^> /, "") }); i++; continue; }
      if (/^\| /.test(ln) && /^\|/.test(lines[i + 1] || "")) {
        flushP();
        const tbl: string[][] = [];
        while (i < lines.length && /^\|/.test(lines[i])) {
          const cells = lines[i].split("|").slice(1, -1).map((c) => c.trim());
          if (!cells.every((c) => /^-+$/.test(c) || c === "")) tbl.push(cells);
          i++;
        }
        out.push({ type: "table", content: tbl });
        continue;
      }
      if (/^\d+\. /.test(ln)) {
        flushP();
        const items: string[] = [];
        while (i < lines.length && /^\d+\. /.test(lines[i])) {
          items.push(lines[i].replace(/^\d+\. /, ""));
          i++;
        }
        out.push({ type: "ol", content: items });
        continue;
      }
      if (/^- /.test(ln)) {
        flushP();
        const items: string[] = [];
        while (i < lines.length && /^- /.test(lines[i])) {
          items.push(lines[i].replace(/^- /, ""));
          i++;
        }
        out.push({ type: "ul", content: items });
        continue;
      }
      if (ln.trim() === "") { flushP(); i++; continue; }
      buf.push(ln);
      i++;
    }
    flushP();
    return out;
  }, [md]);

  // React já escapa entidades quando usamos {text}; ainda assim aplicamos
  // sanitização defensiva removendo qualquer tag HTML antes de processar
  // os tokens de markdown (caso conteúdo venha de banco no futuro).
  const stripHtml = (s: string) => s.replace(/<\/?[^>]+(>|$)/g, "");
  const inline = (text: string) => {
    const safe = stripHtml(text);
    const parts: any[] = [];
    let rest = safe;
    let key = 0;
    const re = /(\*\*[^*]+\*\*|`[^`]+`)/;
    while (rest.length) {
      const m = rest.match(re);
      if (!m) { parts.push(rest); break; }
      const idx = m.index!;
      if (idx > 0) parts.push(rest.slice(0, idx));
      const tok = m[0];
      if (tok.startsWith("**")) parts.push(<strong key={key++} className="font-semibold text-slate-900">{tok.slice(2, -2)}</strong>);
      else if (tok.startsWith("`")) parts.push(<code key={key++} className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[12px] font-mono">{tok.slice(1, -1)}</code>);
      rest = rest.slice(idx + tok.length);
    }
    return parts;
  };

  return (
    <div className="space-y-3 text-sm text-slate-700 leading-relaxed">
      {blocks.map((b, k) => {
        if (b.type === "h2") return <h2 key={k} className="text-base font-bold text-slate-900 mt-5 first:mt-0">{b.content}</h2>;
        if (b.type === "h3") return <h3 key={k} className="text-sm font-bold text-slate-800 mt-4 first:mt-0">{b.content}</h3>;
        if (b.type === "p") return <p key={k}>{inline(b.content)}</p>;
        if (b.type === "quote") return (
          <div key={k} className="border-l-4 border-blue-300 bg-blue-50 px-3 py-2 rounded-r text-[13px] text-blue-900">
            {inline(b.content)}
          </div>
        );
        if (b.type === "ul") return (
          <ul key={k} className="list-disc pl-5 space-y-1">
            {(b.content as string[]).map((it, i) => <li key={i}>{inline(it)}</li>)}
          </ul>
        );
        if (b.type === "ol") return (
          <ol key={k} className="list-decimal pl-5 space-y-1">
            {(b.content as string[]).map((it, i) => <li key={i}>{inline(it)}</li>)}
          </ol>
        );
        if (b.type === "table") {
          const rows = b.content as string[][];
          if (!rows.length) return null;
          const [head, ...body] = rows;
          return (
            <div key={k} className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-[13px]">
                <thead className="bg-slate-50">
                  <tr>{head.map((h, i) => <th key={i} className="text-left px-3 py-2 font-semibold text-slate-700">{inline(h)}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {body.map((r, i) => (
                    <tr key={i}>
                      {r.map((c, j) => <td key={j} className="px-3 py-2 align-top text-slate-600">{inline(c)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

export function PortalHelpButton({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Central de Ajuda"
        aria-label="Abrir Ajuda"
        className={`tour-hub-ajuda inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white/90 hover:bg-white text-slate-700 hover:text-blue-700 hover:border-blue-300 transition shadow-sm h-9 px-3 text-xs font-semibold ${className}`}
      >
        <HelpCircle className="w-4 h-4" />
        <span className="hidden sm:inline">Ajuda</span>
      </button>
      {open && <PortalHelpDrawer onClose={() => setOpen(false)} />}
    </>
  );
}

function PortalHelpDrawer({ onClose }: { onClose: () => void }) {
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<HelpArticle | null>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return PORTAL_CLIENTE_ARTIGOS;
    return PORTAL_CLIENTE_ARTIGOS.filter(
      (a) =>
        a.titulo.toLowerCase().includes(q) ||
        a.resumo.toLowerCase().includes(q) ||
        a.conteudo.toLowerCase().includes(q),
    );
  }, [busca]);

  return (
    <div className="fixed inset-0 z-[200]" role="dialog" aria-modal aria-labelledby="portal-help-title">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className="absolute inset-0 sm:inset-y-0 sm:right-0 sm:left-auto sm:w-full sm:max-w-md bg-white shadow-2xl flex flex-col"
        style={{ backgroundColor: "#ffffff" }}
      >
        <header className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-2 bg-white shrink-0"
          style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}>
          <div className="flex items-center gap-2 min-w-0">
            {aberto && (
              <button
                onClick={() => setAberto(null)}
                className="p-1.5 rounded-md hover:bg-slate-100 text-slate-600"
                aria-label="Voltar"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <HelpCircle className="w-5 h-5 text-blue-600 shrink-0" />
            <h2 id="portal-help-title" className="font-bold text-slate-800 text-base truncate">
              {aberto ? `${aberto.emoji} ${aberto.titulo}` : "Central de Ajuda"}
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-slate-100 text-slate-600" aria-label="Fechar">
            <X className="w-4 h-4" />
          </button>
        </header>

        {!aberto && (
          <div className="px-5 pt-4 bg-white shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar nas dúvidas..."
                className="w-full h-10 pl-9 pr-3 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-300 outline-none text-sm"
              />
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              {filtrados.length} {filtrados.length === 1 ? "artigo" : "artigos"} · respostas rápidas para usar o portal.
            </p>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4 bg-white" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
          {!aberto ? (
            <div className="space-y-2">
              {filtrados.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setAberto(a)}
                  className="w-full text-left rounded-xl border border-slate-200 bg-white hover:border-blue-300 hover:shadow-sm transition px-4 py-3 flex items-start gap-3 group"
                >
                  <div className="text-2xl shrink-0 leading-none">{a.emoji}</div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-slate-800 text-sm group-hover:text-blue-700">{a.titulo}</div>
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{a.resumo}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500 mt-1 shrink-0" />
                </button>
              ))}
              {filtrados.length === 0 && (
                <div className="text-center py-12 text-slate-400 text-sm">
                  Nenhum artigo encontrado para <b>"{busca}"</b>.
                </div>
              )}
              <div className="pt-3 mt-3 border-t border-slate-200 text-[11px] text-slate-500">
                Não encontrou o que precisa? Fale com a FC: <b>contato@fcengenharia.com.br</b>
              </div>
            </div>
          ) : (
            <MdRenderer md={aberto.conteudo} />
          )}
        </div>
      </aside>
    </div>
  );
}
