// Visualizador READ-ONLY da planta do pavimento (projeto) para a ronda de campo.
// Suporta PDF (react-pdf) e DXF (sidecar pré-processado do servidor ou parse local),
// com os contornos (ambientes) por cima, destacando o trecho selecionado.
// Coordenadas: geometriaJson é normalizado 0..1 → (x*pageW, y*pageH).
import { useEffect, useMemo, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Map as MapIcon } from "lucide-react";
import { parseDxfPlanta } from "@/pages/medicao/dxfPlanta";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

type Ponto = { x: number; y: number };

export type PlantaExtra = {
  id: number; pdfId: number; pagina: number;
  pontos: Ponto[]; cor: string; rotulo?: string;
};

export default function PlantaViewer({
  companyId, obraId, pavimentoId, pavimentoNome, highlightContornoId, onClose, onEscolherContorno,
  inline, pctPorContorno, extras, desenhoPontos, onDesenharPonto, onEscolherExtra, ocultarContornos,
}: {
  companyId: number; obraId: number; pavimentoId: number; pavimentoNome?: string;
  highlightContornoId?: number | null;
  onClose?: () => void;
  /** opcional: tocar num ambiente da planta seleciona o trecho p/ apontar */
  onEscolherContorno?: (contornoId: number) => void;
  /** true = renderiza direto na página (planta É a navegação da ronda) */
  inline?: boolean;
  /** % apontado por contorno → pinta o status na planta (verde=100, âmbar=parcial) */
  pctPorContorno?: Record<number, number>;
  /** polígonos EXTRAS por cima da planta (ex.: trechos de concretagem), coords normalizadas 0..1 */
  extras?: PlantaExtra[];
  /** modo desenho: pontos em progresso (normalizados) + callback de clique na planta */
  desenhoPontos?: Ponto[];
  onDesenharPonto?: (p: Ponto, ctx: { pdfId: number; pagina: number }) => void;
  /** tocar num extra (ex.: abrir/excluir trecho) */
  onEscolherExtra?: (extraId: number) => void;
  /** esconde os contornos da medição (deixa só planta + extras) */
  ocultarContornos?: boolean;
}) {
  const q = trpc.apontamentoCampo.getPlanta.useQuery({ companyId, obraId, pavimentoId });
  const pdfs: any[] = q.data?.pdfs ?? [];
  const contornos: any[] = q.data?.contornos ?? [];

  const [pdfSel, setPdfSel] = useState<number | null>(null);
  const [pagina, setPagina] = useState<number | null>(null);
  const [pageDims, setPageDims] = useState<{ w: number; h: number } | null>(null);
  const [numPaginas, setNumPaginas] = useState(1);
  const [dxfData, setDxfData] = useState<any>(null);
  const [dxfLoading, setDxfLoading] = useState(false);

  // PDF/página iniciais: onde está o contorno destacado; senão o 1º PDF.
  const hl = contornos.find((c) => Number(c.id) === Number(highlightContornoId));
  const pdfId = pdfSel ?? (hl ? Number(hl.pdfId) : pdfs.length ? Number(pdfs[0].id) : null);
  const pag = pagina ?? (hl && Number(hl.pdfId) === pdfId ? Number(hl.pagina || 1) : 1);
  const pdf = pdfs.find((p) => Number(p.id) === pdfId);
  const isDxf = ((pdf?.arquivoUrl || "") as string).toLowerCase().split("?")[0].endsWith(".dxf");

  // DXF: pede o sidecar PRÉ-PROCESSADO ao servidor (SVG+bbox prontos);
  // fallback = baixar e parsear no aparelho (mesmo padrão do Levantamento).
  useEffect(() => {
    let cancel = false;
    if (!isDxf || !pdf?.arquivoUrl) { setDxfData(null); setDxfLoading(false); return; }
    setDxfLoading(true); setDxfData(null); setPageDims(null);
    (async () => {
      try {
        const url = String(pdf.arquivoUrl);
        const key = url.startsWith("/uploads/") ? decodeURIComponent(url.slice("/uploads/".length).split("?")[0]) : "";
        if (key) {
          try {
            const r = await fetch("/api/upload/levantamento-planta/derivar", {
              method: "POST", credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ key }),
            });
            if (r.ok) {
              const parsed = await r.json();
              if (parsed && typeof parsed.svg === "string") { if (!cancel) setDxfData(parsed); return; }
            }
          } catch { /* cai no fallback local */ }
        }
        const resp = await fetch(url, { credentials: "include" });
        const text = await resp.text();
        const parsed = parseDxfPlanta(text);
        if (!cancel) setDxfData(parsed);
      } catch {
        if (!cancel) setDxfData({ svg: "", w: 1, h: 1, ok: false });
      } finally {
        if (!cancel) setDxfLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [isDxf, pdf?.arquivoUrl]);

  useEffect(() => {
    if (isDxf && dxfData?.ok) { setPageDims({ w: dxfData.w, h: dxfData.h }); setNumPaginas(1); }
  }, [isDxf, dxfData]);

  const visiveis = useMemo(
    () => contornos.filter((c) => Number(c.pdfId) === pdfId && Number(c.pagina || 1) === pag),
    [contornos, pdfId, pag],
  );

  const larguraTela = Math.min(typeof window !== "undefined" ? window.innerWidth - 48 : 700, 860);
  const alturaDxf = pageDims && pageDims.w > 0 ? larguraTela * (pageDims.h / pageDims.w) : larguraTela;

  const extrasVisiveis = (extras || []).filter((e) => Number(e.pdfId) === pdfId && Number(e.pagina || 1) === pag);

  const overlay = pageDims && (
    <svg
      className="absolute inset-0 w-full h-full"
      viewBox={`0 0 ${pageDims.w} ${pageDims.h}`}
      preserveAspectRatio="none"
      onClick={onDesenharPonto ? (ev) => {
        const rect = (ev.currentTarget as SVGSVGElement).getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        const x = (ev.clientX - rect.left) / rect.width;
        const y = (ev.clientY - rect.top) / rect.height;
        if (x < 0 || x > 1 || y < 0 || y > 1) return;
        onDesenharPonto({ x, y }, { pdfId: Number(pdfId), pagina: pag });
      } : undefined}
      style={onDesenharPonto ? { cursor: "crosshair", pointerEvents: "all" } : undefined}
    >
      {(ocultarContornos ? [] : visiveis).map((c) => {
        let pts: Ponto[] = [];
        try { pts = JSON.parse(c.geometriaJson || "[]"); } catch { /* geometria inválida */ }
        if (!pts.length) return null;
        const destaque = Number(c.id) === Number(highlightContornoId);
        const pctC = pctPorContorno?.[Number(c.id)] ?? null;
        // status pinta a planta: verde = 100%, âmbar = parcial, azul = pendente
        const cor = destaque ? "#65a30d"
          : pctC != null && pctC >= 99.99 ? "#10b981"
          : pctC != null && pctC > 0 ? "#f59e0b"
          : (c.cor || "#3b82f6");
        const opac = pctC != null && pctC >= 99.99 ? 0.4 : pctC != null && pctC > 0 ? 0.3 : 0.12;
        const sw = pageDims.w / larguraTela; // ~1px na tela, em unidades do desenho
        if (c.tipo === "contagem") {
          return pts.map((p, i) => (
            <circle key={`${c.id}-${i}`} cx={p.x * pageDims.w} cy={p.y * pageDims.h} r={(destaque ? 8 : 5) * sw}
              fill={cor} fillOpacity={destaque ? 0.9 : 0.5} stroke={cor} strokeWidth={1.5 * sw} />
          ));
        }
        // Mesma convenção do módulo de Medição: só "area"/"volume" fecham polígono.
        const fechado = c.tipo === "area" || c.tipo === "volume";
        const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x * pageDims.w},${p.y * pageDims.h}`).join(" ") + (fechado ? " Z" : "");
        return (
          <path key={c.id} d={d}
            fill={fechado ? cor : "none"} fillOpacity={destaque ? 0.35 : opac}
            stroke={cor} strokeWidth={(destaque ? 3 : 1.5) * sw}
            style={{ cursor: onEscolherContorno ? "pointer" : "default", pointerEvents: "all" }}
            onClick={() => onEscolherContorno?.(Number(c.id))} />
        );
      })}
      {/* Trechos extras (ex.: mapa de concretagem) — sempre polígonos fechados */}
      {extrasVisiveis.map((e) => {
        const pts = e.pontos || [];
        if (pts.length < 2) return null;
        const swE = pageDims.w / larguraTela;
        const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x * pageDims.w},${p.y * pageDims.h}`).join(" ") + " Z";
        const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length * pageDims.w;
        const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length * pageDims.h;
        return (
          <g key={`ex${e.id}`}>
            <path d={d} fill={e.cor} fillOpacity={0.35} stroke={e.cor} strokeWidth={2 * swE}
              style={{ cursor: onEscolherExtra ? "pointer" : "default", pointerEvents: onDesenharPonto ? "none" : "all" }}
              onClick={onEscolherExtra ? (ev) => { ev.stopPropagation(); onEscolherExtra(Number(e.id)); } : undefined} />
            {e.rotulo && (
              <text x={cx} y={cy} textAnchor="middle" fill="#1f2937" fontWeight={700}
                fontSize={11 * swE} stroke="#ffffff" strokeWidth={2.5 * swE} paintOrder="stroke">
                {e.rotulo}
              </text>
            )}
          </g>
        );
      })}
      {/* Desenho em progresso */}
      {desenhoPontos && desenhoPontos.length > 0 && (() => {
        const swD = pageDims.w / larguraTela;
        const d = desenhoPontos.map((p, i) => `${i === 0 ? "M" : "L"}${p.x * pageDims.w},${p.y * pageDims.h}`).join(" ")
          + (desenhoPontos.length >= 3 ? " Z" : "");
        return (
          <g style={{ pointerEvents: "none" }}>
            <path d={d} fill="#f59e0b" fillOpacity={0.2} stroke="#d97706" strokeWidth={2 * swD} strokeDasharray={`${6 * swD},${4 * swD}`} />
            {desenhoPontos.map((p, i) => (
              <circle key={i} cx={p.x * pageDims.w} cy={p.y * pageDims.h} r={4 * swD} fill="#d97706" stroke="#fff" strokeWidth={1.5 * swD} />
            ))}
          </g>
        );
      })()}
    </svg>
  );

  const corpo = (
    <>
      {q.isLoading ? (
          <div className="text-center py-16 text-gray-400"><Loader2 className="w-6 h-6 animate-spin inline" /></div>
        ) : !pdf ? (
          <div className="text-center py-12 text-gray-400 text-sm">Nenhuma planta importada neste pavimento — importe o projeto no Levantamento de Campo.</div>
        ) : (
          <div className="space-y-2">
            {(pdfs.length > 1 || numPaginas > 1) && (
              <div className="flex flex-wrap gap-1.5">
                {pdfs.length > 1 && pdfs.map((p: any) => (
                  <button key={p.id} type="button"
                    className={`rounded-full border px-3 py-1.5 text-[11px] font-medium ${Number(p.id) === pdfId ? "border-lime-500 bg-lime-100 text-lime-800" : "border-slate-200 text-gray-500"}`}
                    onClick={() => { setPdfSel(Number(p.id)); setPagina(1); setPageDims(null); }}>
                    {p.nome || `Planta ${p.id}`}
                  </button>
                ))}
                {!isDxf && numPaginas > 1 && Array.from({ length: numPaginas }, (_, i) => i + 1).map((n) => (
                  <button key={`pg${n}`} type="button"
                    className={`rounded-full border px-3 py-1.5 text-[11px] ${n === pag ? "border-lime-500 bg-lime-100 text-lime-800" : "border-slate-200 text-gray-500"}`}
                    onClick={() => { setPagina(n); setPageDims(null); }}>
                    pág. {n}
                  </button>
                ))}
              </div>
            )}

            <div className="relative rounded-xl border border-slate-200 overflow-hidden bg-white" style={{ touchAction: "pan-x pan-y pinch-zoom" }}>
              {isDxf ? (
                dxfLoading ? (
                  <div className="text-center py-16 text-gray-400"><Loader2 className="w-5 h-5 animate-spin inline" /></div>
                ) : dxfData?.ok ? (
                  <div className="relative" style={{ width: larguraTela, height: alturaDxf }}>
                    <div className="absolute inset-0" dangerouslySetInnerHTML={{ __html: dxfData.svg }} />
                    {overlay}
                  </div>
                ) : (
                  <div className="text-center py-12 text-gray-400 text-xs">Não foi possível carregar a planta.</div>
                )
              ) : (
                <div className="relative">
                  <Document
                    file={pdf.arquivoUrl}
                    onLoadSuccess={(d) => setNumPaginas(d.numPages)}
                    loading={<div className="text-center py-16 text-gray-400"><Loader2 className="w-5 h-5 animate-spin inline" /></div>}
                    error={<div className="text-center py-12 text-gray-400 text-xs">Não foi possível carregar a planta.</div>}
                  >
                    <Page
                      pageNumber={pag}
                      width={larguraTela}
                      renderTextLayer={false}
                      renderAnnotationLayer={false}
                      onLoadSuccess={(pg) => setPageDims({ w: pg.width, h: pg.height })}
                    />
                  </Document>
                  {overlay}
                </div>
              )}
            </div>
            <p className="text-[10px] text-gray-400">
              {highlightContornoId ? "O trecho destacado em verde é o que você está apontando." : onEscolherContorno ? "Toque num ambiente da planta para apontar a produção dele." : ""}
            </p>
          </div>
        )}
    </>
  );

  if (inline) return corpo;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose?.(); }}>
      <DialogContent className="max-w-[95vw] md:max-w-4xl max-h-[92dvh] overflow-y-auto rounded-2xl p-3 md:p-5">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <MapIcon className="w-4 h-4 text-lime-600" /> Projeto — {pavimentoNome || "Pavimento"}
          </DialogTitle>
        </DialogHeader>
        {corpo}
      </DialogContent>
    </Dialog>
  );
}
