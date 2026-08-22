// Rev. — MAPA DE VÃOS DA OBRA (esquadrias marcadas sobre o DXF do pavimento).
// Cadastre tipologias (J1, P1...) com medidas e clique na planta para marcar os
// pins numerados (J1-01, J1-02...). O pin é a identidade única do vão: quando a
// medição desconta o vão, o requadro é pago UMA única vez (ledger no pin).
import { useMemo, useRef, useState } from "react";
import { useParams, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import DashboardLayout from "@/components/DashboardLayout";
import {
  ArrowLeft, Plus, Trash2, Loader2, DoorOpen, RectangleHorizontal,
  Copy, ZoomIn, ZoomOut, MousePointerClick, Lock, Box,
} from "lucide-react";
import { toast } from "sonner";
import { parseDxfPlanta, type DxfPlanta } from "@/pages/medicao/dxfPlanta";
import { useQuery } from "@tanstack/react-query";

const brNum = (v: any, d = 2) => {
  const n = Number(v);
  return isFinite(n) ? n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—";
};
const parseBr = (s: string) => {
  const v = parseFloat(String(s).replace(",", "."));
  return isFinite(v) ? v : NaN;
};

export default function ObraEsquadrias() {
  const params = useParams<{ obraId: string; pavimentoId: string }>();
  const obraId = Number(params.obraId) || 0;
  const pavimentoId = Number(params.pavimentoId) || 0;
  const { selectedCompanyId } = useCompany();
  const companyId = Number(selectedCompanyId) || 0;

  const utils = trpc.useUtils();
  const pavsQ = trpc.medicao.listarPavimentosObra.useQuery({ companyId, obraId }, { enabled: !!companyId && !!obraId });
  const pavimentos: any[] = (pavsQ.data as any[]) ?? [];
  const pav = pavimentos.find(p => p.id === pavimentoId);

  const tipsQ = trpc.medicaoCriterios.listarTipologias.useQuery({ companyId, obraId }, { enabled: !!companyId && !!obraId });
  const tipologias: any[] = (tipsQ.data as any[]) ?? [];
  const esqQ = trpc.medicaoCriterios.listarEsquadrias.useQuery({ companyId, pavimentoId }, { enabled: !!companyId && !!pavimentoId });
  const esquadrias: any[] = (esqQ.data as any[]) ?? [];

  // DXF da planta do pavimento
  const dxfQ = useQuery<DxfPlanta | null>({
    queryKey: ["esq-dxf", pav?.arquivoUrl, pav?.revisao],
    enabled: !!pav?.arquivoUrl,
    staleTime: Infinity,
    queryFn: async () => {
      // Igual ao Levantamento (Rev. 4788): DXF grande passa do cap de 8MB do
      // /uploads (resposta 206 truncada quebra o parse). Pede o sidecar
      // PRÉ-PROCESSADO ao servidor (SVG+bbox+escala prontos) e só cai no
      // parse local se o sidecar falhar.
      const key = (pav as any)?.arquivoKey
        || (String(pav.arquivoUrl).startsWith("/uploads/")
          ? decodeURIComponent(String(pav.arquivoUrl).slice("/uploads/".length).split("?")[0]) : "");
      if (key) {
        try {
          const r = await fetch("/api/upload/levantamento-planta/derivar", {
            method: "POST", credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key }),
          });
          if (r.ok) {
            const parsed = await r.json();
            if (parsed && typeof parsed.svg === "string") return parsed as DxfPlanta;
          }
        } catch { /* cai no fallback local */ }
      }
      const txt = await (await fetch(String(pav.arquivoUrl))).text();
      return parseDxfPlanta(txt);
    },
  });
  const dxf = dxfQ.data;

  const [tipoSelId, setTipoSelId] = useState<number | null>(null); // tipologia "armada" p/ marcar (fluxo rápido opcional)
  const [zoom, setZoom] = useState(1);
  const [novaTip, setNovaTip] = useState<any | null>(null);
  // Fluxo padrão "clicar e digitar": clique na planta abre este dialog com as medidas.
  const [novoVao, setNovoVao] = useState<any | null>(null);
  const [verSugestoes, setVerSugestoes] = useState(true);
  const [sugestoesDescartadas, setSugestoesDescartadas] = useState<Set<number>>(new Set());
  const [replicarOpen, setReplicarOpen] = useState(false);
  const [replicarSel, setReplicarSel] = useState<number[]>([]);
  const [pinSel, setPinSel] = useState<any | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);

  const invalidate = () => {
    utils.medicaoCriterios.listarEsquadrias.invalidate({ companyId, pavimentoId });
    utils.medicaoCriterios.listarTipologias.invalidate({ companyId, obraId });
  };
  const salvarTipMut = trpc.medicaoCriterios.salvarTipologia.useMutation({
    onSuccess: () => { toast.success("Tipologia salva!"); invalidate(); setNovaTip(null); },
    onError: (e: any) => toast.error(e.message),
  });
  const excluirTipMut = trpc.medicaoCriterios.excluirTipologia.useMutation({
    onSuccess: () => { invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });
  const criarEsqMut = trpc.medicaoCriterios.criarEsquadria.useMutation({
    onSuccess: () => invalidate(),
    onError: (e: any) => toast.error(e.message),
  });
  const excluirEsqMut = trpc.medicaoCriterios.excluirEsquadria.useMutation({
    onSuccess: () => { invalidate(); setPinSel(null); },
    onError: (e: any) => toast.error(e.message),
  });
  const replicarMut = trpc.medicaoCriterios.replicarPavimento.useMutation({
    onSuccess: (r: any) => {
      toast.success(`Replicado: ${r.criados} pins criados.${r.pulados?.length ? ` Pulados (já tinham marcação): ${r.pulados.join(", ")}` : ""}`);
      setReplicarOpen(false); setReplicarSel([]);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const marcarVaoMut = trpc.medicaoCriterios.marcarVao.useMutation({
    onSuccess: (r: any) => { toast.success(`${r.codigo} marcado!`); invalidate(); setNovoVao(null); },
    onError: (e: any) => toast.error(e.message),
  });

  const onPlantaClick = (e: React.MouseEvent) => {
    if (!boxRef.current) return;
    const rect = boxRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    // Tipologia armada = marcação em série (1 toque = 1 pin). Sem tipologia
    // armada = fluxo padrão: abre o dialog para digitar as medidas na hora.
    if (tipoSelId) {
      criarEsqMut.mutate({ companyId, obraId, pavimentoId, tipologiaId: tipoSelId, posX: +x.toFixed(6), posY: +y.toFixed(6) });
      return;
    }
    // Se o toque caiu perto de uma sugestão do projeto (≈ raio de 3% da planta),
    // aproveita a sugestão: tipo e largura já vêm preenchidos.
    const perto = sugestoes.map((s: any) => ({ s, d: Math.hypot(s.posX - x, s.posY - y) }))
      .filter((p: any) => p.d < 0.03).sort((a: any, b: any) => a.d - b.d)[0]?.s;
    if (perto) { abrirSugestao(perto); return; }
    setNovoVao({ posX: +x.toFixed(6), posY: +y.toFixed(6), tipo: "janela", largura: "", altura: "", peitoril: "1,00", sugIdx: null });
  };

  // Sugestões do DXF (arcos de porta + blocos nomeados), ocultando as já
  // atendidas por um pin próximo (< ~2% da planta) e as descartadas.
  const sugestoes = useMemo(() => {
    const all = (dxf as any)?.vaosSugeridos ?? [];
    return all.map((s: any, i: number) => ({ ...s, idx: i })).filter((s: any) => {
      if (sugestoesDescartadas.has(s.idx)) return false;
      return !esquadrias.some((e: any) => Math.hypot(Number(e.posX) - s.posX, Number(e.posY) - s.posY) < 0.02);
    });
  }, [dxf, esquadrias, sugestoesDescartadas]);

  const abrirSugestao = (s: any) => {
    setNovoVao({
      posX: s.posX, posY: s.posY, tipo: s.tipo,
      largura: s.larguraM ? String(s.larguraM).replace(".", ",") : "",
      altura: s.tipo === "porta" ? "2,10" : "",
      peitoril: "1,00", sugIdx: s.idx,
    });
  };

  const resumo = useMemo(() => {
    const porTip: Record<string, { qtd: number; area: number; tipo: string }> = {};
    for (const e of esquadrias) {
      const k = e.tipCodigo;
      porTip[k] = porTip[k] || { qtd: 0, area: 0, tipo: e.tipTipo };
      porTip[k].qtd++; porTip[k].area += e.areaVao || 0;
    }
    return porTip;
  }, [esquadrias]);
  const totalNichos = useMemo(() => esquadrias.filter((e: any) => e.tipTipo === "nicho").length, [esquadrias]);

  const aspect = dxf && dxf.w > 0 && dxf.h > 0 ? dxf.h / dxf.w : 0.7;

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/obras">
            <Button variant="ghost" size="sm" className="gap-1"><ArrowLeft className="w-4 h-4" /> Obras</Button>
          </Link>
          <div>
            <h1 className="text-lg font-bold text-gray-800">Mapa de Vãos — {pav?.nome || `Pavimento #${pavimentoId}`}</h1>
            <p className="text-xs text-gray-500">
              Toque na planta e digite as medidas — tipologia e numeração são automáticas.
              O pin controla o requadro: pago 1 única vez, em qualquer medição.
            </p>
          </div>
          {(pav?.revisao ?? 1) > 1 && <Badge variant="outline" className="text-[10px] bg-violet-50 text-violet-700 border-violet-200">REV. {pav.revisao}</Badge>}
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" variant="outline" className="gap-1" onClick={() => { setReplicarOpen(true); setReplicarSel([]); }}
              disabled={esquadrias.length === 0}>
              <Copy className="w-3.5 h-3.5" /> Replicar p/ pavimentos-tipo
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
          {/* Painel lateral: tipologias + resumo */}
          <div className="space-y-3">
            <div className="border rounded-lg p-3 bg-white">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-gray-700">Tipologias</span>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-indigo-600"
                  onClick={() => setNovaTip({ tipo: "janela", codigo: "", largura: "", altura: "", peitoril: "1,00" })}>
                  <Plus className="w-3.5 h-3.5" />
                </Button>
              </div>
              {tipsQ.isLoading ? (
                <div className="text-xs text-gray-400 py-2"><Loader2 className="w-3 h-3 animate-spin inline mr-1" />Carregando...</div>
              ) : tipologias.length === 0 ? (
                <div className="text-xs text-gray-400 py-1">Criadas automaticamente quando você marca um vão na planta (J1, P1...).</div>
              ) : (
                <div className="space-y-1.5">
                  {tipologias.map((t: any) => (
                    <div key={t.id}
                      className={`flex items-center gap-2 border rounded-md px-2 py-1.5 cursor-pointer text-sm transition-colors ${tipoSelId === t.id ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-300" : "border-slate-200 hover:bg-slate-50"}`}
                      onClick={() => setTipoSelId(tipoSelId === t.id ? null : t.id)}>
                      {t.tipo === "porta" ? <DoorOpen className="w-4 h-4 text-amber-600" /> : t.tipo === "nicho" ? <Box className="w-4 h-4 text-violet-600" /> : <RectangleHorizontal className="w-4 h-4 text-sky-600" />}
                      <span className="font-mono font-bold">{t.codigo}</span>
                      <span className="text-xs text-gray-500">
                        {t.tipo === "nicho" && !(Number(t.largura) > 0)
                          ? "nicho (un)"
                          : <>{brNum(t.largura)}×{brNum(t.altura)}{t.peitoril != null ? ` · peit. ${brNum(t.peitoril)}` : ""} m</>}
                      </span>
                      <span className="ml-auto text-[10px] text-gray-400">{t.tipo === "nicho" ? "un" : `${brNum(Number(t.largura) * Number(t.altura))} m²`}</span>
                      <button className="text-slate-300 hover:text-red-500" onClick={(e) => { e.stopPropagation(); excluirTipMut.mutate({ companyId, id: t.id }); }}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {tipoSelId && (
                <div className="mt-2 text-[11px] text-indigo-700 flex items-center gap-1 bg-indigo-50 rounded px-2 py-1">
                  <MousePointerClick className="w-3.5 h-3.5" /> Marcação em série: cada toque na planta cria 1 pin desta tipologia. Toque de novo nela para desarmar.
                </div>
              )}
            </div>

            <div className="border rounded-lg p-3 bg-white">
              <span className="text-sm font-semibold text-gray-700">Resumo do pavimento</span>
              {esquadrias.length === 0 ? (
                <div className="text-xs text-gray-400 mt-1">Nenhum vão marcado.</div>
              ) : (
                <div className="mt-2 space-y-1">
                  {Object.entries(resumo).map(([k, v]) => (
                    <div key={k} className="flex justify-between text-xs">
                      <span className="font-mono">{k} × {v.qtd}</span>
                      <span className="text-gray-500">{v.tipo === "nicho" ? `${v.qtd} un` : `${brNum(v.area)} m²`}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-xs font-semibold border-t pt-1 mt-1">
                    <span>Total: {esquadrias.length - totalNichos} vãos{totalNichos > 0 ? ` · ${totalNichos} nichos` : ""}</span>
                    <span>{brNum(esquadrias.filter((e: any) => e.tipTipo !== "nicho").reduce((s, e) => s + (e.areaVao || 0), 0))} m²</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Planta */}
          <div className="border rounded-lg bg-white overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b bg-slate-50">
              <span className="text-xs text-gray-500">Zoom</span>
              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setZoom(z => Math.max(0.5, +(z - 0.25).toFixed(2)))}><ZoomOut className="w-3.5 h-3.5" /></Button>
              <span className="text-xs font-mono w-10 text-center">{Math.round(zoom * 100)}%</span>
              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setZoom(z => Math.min(4, +(z + 0.25).toFixed(2)))}><ZoomIn className="w-3.5 h-3.5" /></Button>
              {dxf?.escalaHeuristica && <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">escala deduzida</Badge>}
              {((dxf as any)?.vaosSugeridos?.length ?? 0) > 0 && (
                <button type="button"
                  className={`ml-auto text-[11px] rounded-full border px-2 py-0.5 font-medium ${verSugestoes ? "bg-violet-50 text-violet-700 border-violet-300" : "bg-white text-gray-400 border-gray-200"}`}
                  onClick={() => setVerSugestoes(v => !v)}>
                  {verSugestoes ? `Sugestões: ${sugestoes.length}` : "Mostrar sugestões"}
                </button>
              )}
            </div>
            <div className="overflow-auto max-h-[70vh] bg-slate-100 p-3">
              {!pav?.arquivoUrl ? (
                <div className="text-sm text-gray-400 py-16 text-center">Este pavimento ainda não tem DXF. Envie o projeto em Obras → Editar → Projetos (Medição).</div>
              ) : dxfQ.isLoading ? (
                <div className="text-sm text-gray-400 py-16 text-center"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Carregando planta...</div>
              ) : !dxf?.ok ? (
                <div className="text-sm text-red-500 py-16 text-center">Erro ao ler o DXF{dxf?.erro ? `: ${dxf.erro}` : ""}.</div>
              ) : (
                <div style={{ width: `${zoom * 100}%` }}>
                  <div ref={boxRef}
                    className="relative w-full bg-white shadow cursor-crosshair"
                    style={{ paddingBottom: `${aspect * 100}%` }}
                    onClick={onPlantaClick}>
                    <div className="absolute inset-0" dangerouslySetInnerHTML={{ __html: dxf.svg }} />
                    {/* Sugestões detectadas no DXF (fantasma tracejado — toque p/ confirmar) */}
                    {verSugestoes && sugestoes.map((s: any) => (
                      <button key={`sug-${s.idx}`} type="button"
                        className={`absolute -translate-x-1/2 -translate-y-1/2 z-[5] w-4 h-4 rounded-full border border-dashed flex items-center justify-center text-[8px] font-bold bg-white/70 ${s.tipo === "porta" ? "border-amber-400 text-amber-500" : "border-sky-400 text-sky-500"}`}
                        style={{ left: `${s.posX * 100}%`, top: `${s.posY * 100}%` }}
                        onClick={(ev) => { ev.stopPropagation(); abrirSugestao(s); }}
                        title={`Sugestão: ${s.tipo}${s.larguraM ? ` ~${brNum(s.larguraM)} m` : ""} — toque para confirmar`}>
                        ?
                      </button>
                    ))}
                    {/* Pins compactos: só o código da TIPOLOGIA (J1, P2). O nº completo
                        (J1-01...) aparece ao tocar — evita poluir a planta. */}
                    {esquadrias.map((e: any) => (
                      <button key={e.id} type="button"
                        className={`absolute -translate-x-1/2 -translate-y-1/2 z-10 w-[18px] h-[18px] rounded-full flex items-center justify-center text-[8px] font-mono font-bold leading-none shadow-sm ring-1 ring-white/90 ${e.requadroPagoEm
                          ? "bg-emerald-600 text-white"
                          : e.tipTipo === "porta" ? "bg-amber-500 text-white" : e.tipTipo === "nicho" ? "bg-violet-600 text-white" : "bg-sky-600 text-white"}`}
                        style={{ left: `${Number(e.posX) * 100}%`, top: `${Number(e.posY) * 100}%` }}
                        onClick={(ev) => { ev.stopPropagation(); setPinSel(e); }}
                        title={e.tipTipo === "nicho"
                          ? `${e.codigo} — nicho${e.requadroPagoEm ? " · pago" : ""}`
                          : `${e.codigo} — ${brNum(e.largura)}×${brNum(e.altura)} m${e.requadroPagoEm ? " · requadro pago" : ""}`}>
                        {e.tipCodigo}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Dialog "clicar e digitar": marca o vão direto com as medidas */}
        {novoVao && (
          <Dialog open onOpenChange={(o) => { if (!o) setNovoVao(null); }}>
            <DialogContent className="max-w-md p-0 overflow-hidden">
              {(() => {
                const isPorta = novoVao.tipo === "porta";
                const isNicho = novoVao.tipo === "nicho";
                const Lraw = parseBr(novoVao.largura), Araw = parseBr(novoVao.altura);
                // Nicho: medidas OPCIONAIS (conta por unidade) — vazio vira 0.
                const L = isNicho && !isFinite(Lraw) ? 0 : Lraw;
                const A = isNicho && !isFinite(Araw) ? 0 : Araw;
                const medidasOk = isNicho ? (isFinite(L) && isFinite(A)) : (isFinite(L) && isFinite(A) && L > 0 && A > 0);
                const tipExist = medidasOk ? tipologias.find((t: any) => t.tipo === novoVao.tipo
                  && Math.abs(Number(t.largura) - L) < 0.005 && Math.abs(Number(t.altura) - A) < 0.005
                  && (novoVao.tipo !== "janela" || (t.peitoril == null ? !isFinite(parseBr(novoVao.peitoril)) : Math.abs(Number(t.peitoril) - parseBr(novoVao.peitoril)) < 0.005))) : null;
                const proxCodigo = (() => { const usados = new Set(tipologias.map((t: any) => String(t.codigo).toUpperCase())); const pfx = isPorta ? "P" : isNicho ? "N" : "J"; let n = 1; while (usados.has(`${pfx}${n}`)) n++; return `${pfx}${n}`; })();
                const tipsDoTipo = tipologias.filter((t: any) => t.tipo === novoVao.tipo);
                const setMedidas = (t: any) => setNovoVao({
                  ...novoVao, tipo: t.tipo,
                  largura: brNum(Number(t.largura)), altura: brNum(Number(t.altura)),
                  peitoril: t.peitoril != null ? brNum(Number(t.peitoril)) : novoVao.peitoril,
                });
                return (<>
                  {/* Cabeçalho colorido pelo tipo */}
                  <div className={`px-5 pt-5 pb-4 text-white bg-gradient-to-r ${isPorta ? "from-amber-500 to-orange-500" : isNicho ? "from-violet-500 to-purple-600" : "from-sky-500 to-indigo-500"}`}>
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2 text-white">
                        <span className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                          {isPorta ? <DoorOpen className="w-4 h-4" /> : isNicho ? <Box className="w-4 h-4" /> : <RectangleHorizontal className="w-4 h-4" />}
                        </span>
                        {isNicho ? "Marcar nicho" : "Marcar vão"}
                        {novoVao.sugIdx != null && <Badge className="bg-white/25 text-white border-0 text-[10px] font-normal">sugestão do projeto</Badge>}
                      </DialogTitle>
                    </DialogHeader>
                    <p className="text-[11px] text-white/80 mt-1.5">{isNicho ? "Nicho conta por unidade (un) — medidas são opcionais." : "Digite as medidas — tipologia e numeração saem sozinhas."}</p>
                  </div>

                  <div className="px-5 pb-5 pt-4 space-y-4">
                    {/* Tipo — segmentado */}
                    <div className="grid grid-cols-3 gap-0 rounded-xl bg-slate-100 p-1">
                      {(["janela", "porta", "nicho"] as const).map(t => (
                        <button key={t} type="button"
                          className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition-all ${novoVao.tipo === t ? "bg-white shadow text-gray-900" : "text-gray-400"}`}
                          onClick={() => setNovoVao({ ...novoVao, tipo: t, ...(t === "porta" && !novoVao.altura ? { altura: "2,10" } : {}) })}>
                          {t === "porta" ? <DoorOpen className="w-4 h-4 text-amber-600" /> : t === "nicho" ? <Box className="w-4 h-4 text-violet-600" /> : <RectangleHorizontal className="w-4 h-4 text-sky-600" />}
                          {t === "porta" ? "Porta" : t === "nicho" ? "Nicho" : "Janela"}
                        </button>
                      ))}
                    </div>

                    {/* Atalhos: tipologias já usadas na obra */}
                    {tipsDoTipo.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {tipsDoTipo.slice(0, 6).map((t: any) => (
                          <button key={t.id} type="button"
                            className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${tipExist?.id === t.id
                              ? (isPorta ? "border-amber-500 bg-amber-50 text-amber-700" : "border-sky-500 bg-sky-50 text-sky-700")
                              : "border-slate-200 bg-white text-gray-500 hover:bg-slate-50"}`}
                            onClick={() => setMedidas(t)}>
                            <span className="font-mono font-bold">{t.codigo}</span> {Number(t.largura) > 0 ? <>{brNum(Number(t.largura))}×{brNum(Number(t.altura))}</> : "un"}
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <Label className="text-[11px] text-gray-500">Largura (m){isNicho ? " — opcional" : ""}</Label>
                        <Input inputMode="decimal" autoFocus={!isNicho} className="text-right text-base font-semibold h-11 rounded-xl" value={novoVao.largura}
                          onChange={e => setNovoVao({ ...novoVao, largura: e.target.value })} placeholder={isNicho ? "0,30" : "1,20"} />
                      </div>
                      <div>
                        <Label className="text-[11px] text-gray-500">Altura (m){isNicho ? " — opcional" : ""}</Label>
                        <Input inputMode="decimal" className="text-right text-base font-semibold h-11 rounded-xl" value={novoVao.altura}
                          onChange={e => setNovoVao({ ...novoVao, altura: e.target.value })} placeholder={isPorta ? "2,10" : isNicho ? "0,60" : "1,00"} />
                      </div>
                      {novoVao.tipo === "janela" ? (
                        <div>
                          <Label className="text-[11px] text-gray-500">Peitoril (m)</Label>
                          <Input inputMode="decimal" className="text-right text-base font-semibold h-11 rounded-xl" value={novoVao.peitoril}
                            onChange={e => setNovoVao({ ...novoVao, peitoril: e.target.value })} placeholder="1,00" />
                        </div>
                      ) : (
                        // Silhueta proporcional da porta ao lado das medidas
                        <div className="flex items-end justify-center pb-0.5">
                          {medidasOk && !isNicho && L > 0 && A > 0 && (
                            <div className="border-2 border-amber-400 bg-amber-50 rounded-sm"
                              style={{ width: `${Math.min(40, Math.max(10, (L / Math.max(A, 0.1)) * 40))}px`, height: "40px" }} />
                          )}
                        </div>
                      )}
                    </div>

                    {/* Resumo do que vai acontecer */}
                    <div className={`rounded-xl border px-3 py-2.5 text-xs ${medidasOk ? (isPorta ? "bg-amber-50/60 border-amber-200 text-amber-900" : isNicho ? "bg-violet-50/60 border-violet-200 text-violet-900" : "bg-sky-50/60 border-sky-200 text-sky-900") : "bg-slate-50 border-slate-200 text-gray-400"}`}>
                      {medidasOk ? (
                        <div className="flex items-center justify-between gap-2">
                          <span>
                            {tipExist
                              ? <>Reusa <b className="font-mono">{tipExist.codigo}</b> · pin numerado automaticamente</>
                              : <>Cria a tipologia <b className="font-mono">{proxCodigo}</b> automaticamente</>}
                          </span>
                          <span className="font-bold whitespace-nowrap">{isNicho ? "1 un" : `${brNum(L * A)} m²`}</span>
                        </div>
                      ) : (
                        <>Mesmas medidas reusam a tipologia (J1, P1...) e o pin sai numerado sozinho (J1-01, J1-02...).</>
                      )}
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                      <Button variant="ghost" size="sm" className="text-gray-500" onClick={() => setNovoVao(null)}>Cancelar</Button>
                      {novoVao.sugIdx != null && (
                        <Button variant="outline" size="sm" className="text-gray-500"
                          onClick={() => { setSugestoesDescartadas(s => new Set(s).add(novoVao.sugIdx)); setNovoVao(null); }}>
                          Não é um vão
                        </Button>
                      )}
                      <Button size="sm"
                        className={`px-5 text-white ${isPorta ? "bg-amber-600 hover:bg-amber-700" : isNicho ? "bg-violet-600 hover:bg-violet-700" : "bg-sky-600 hover:bg-sky-700"}`}
                        disabled={marcarVaoMut.isPending || !medidasOk}
                        onClick={() => marcarVaoMut.mutate({
                          companyId, obraId, pavimentoId,
                          tipo: novoVao.tipo,
                          largura: L, altura: A,
                          peitoril: novoVao.tipo === "janela" && isFinite(parseBr(novoVao.peitoril)) ? parseBr(novoVao.peitoril) : null,
                          posX: novoVao.posX, posY: novoVao.posY,
                        })}>
                        {marcarVaoMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null} {isNicho ? "Marcar nicho" : "Marcar vão"}
                      </Button>
                    </div>
                  </div>
                </>);
              })()}
            </DialogContent>
          </Dialog>
        )}

        {/* Dialog nova tipologia */}
        {novaTip && (
          <Dialog open onOpenChange={(o) => { if (!o) setNovaTip(null); }}>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>Nova tipologia de esquadria</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Tipo</Label>
                    <Select value={novaTip.tipo} onValueChange={v => setNovaTip({ ...novaTip, tipo: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="janela">Janela</SelectItem>
                        <SelectItem value="porta">Porta</SelectItem>
                        <SelectItem value="nicho">Nicho (un)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Código</Label>
                    <Input value={novaTip.codigo} onChange={e => setNovaTip({ ...novaTip, codigo: e.target.value.toUpperCase() })}
                      placeholder={novaTip.tipo === "porta" ? "P1" : "J1"} className="font-mono" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">Largura (m)</Label>
                    <Input inputMode="decimal" className="text-right" value={novaTip.largura} onChange={e => setNovaTip({ ...novaTip, largura: e.target.value })} placeholder="1,20" />
                  </div>
                  <div>
                    <Label className="text-xs">Altura (m)</Label>
                    <Input inputMode="decimal" className="text-right" value={novaTip.altura} onChange={e => setNovaTip({ ...novaTip, altura: e.target.value })} placeholder="1,00" />
                  </div>
                  {novaTip.tipo === "janela" && (
                    <div>
                      <Label className="text-xs">Peitoril (m)</Label>
                      <Input inputMode="decimal" className="text-right" value={novaTip.peitoril} onChange={e => setNovaTip({ ...novaTip, peitoril: e.target.value })} placeholder="1,00" />
                    </div>
                  )}
                </div>
                {(() => {
                  const L = parseBr(novaTip.largura), A = parseBr(novaTip.altura);
                  return isFinite(L) && isFinite(A) && L > 0 && A > 0 ? (
                    <p className="text-xs text-gray-500">Área do vão: <b>{brNum(L * A)} m²</b> {L * A > 2 ? "(desconta em serviços com limite 2,00 m²)" : "(paga fechado em serviços com limite 2,00 m²)"}</p>
                  ) : null;
                })()}
                <div className="flex justify-end gap-2 pt-2 border-t">
                  <Button variant="outline" size="sm" onClick={() => setNovaTip(null)}>Cancelar</Button>
                  <Button size="sm" disabled={salvarTipMut.isPending || !novaTip.codigo.trim() || (novaTip.tipo !== "nicho" && (!(parseBr(novaTip.largura) > 0) || !(parseBr(novaTip.altura) > 0)))}
                    onClick={() => salvarTipMut.mutate({
                      companyId, obraId,
                      codigo: novaTip.codigo.trim(), tipo: novaTip.tipo,
                      largura: parseBr(novaTip.largura) > 0 ? parseBr(novaTip.largura) : 0,
                      altura: parseBr(novaTip.altura) > 0 ? parseBr(novaTip.altura) : 0,
                      peitoril: novaTip.tipo === "janela" && isFinite(parseBr(novaTip.peitoril)) ? parseBr(novaTip.peitoril) : null,
                    })}>
                    {salvarTipMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null} Salvar
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}

        {/* Dialog do pin selecionado */}
        {pinSel && (
          <Dialog open onOpenChange={(o) => { if (!o) setPinSel(null); }}>
            <DialogContent className="max-w-sm">
              <DialogHeader><DialogTitle className="font-mono">{pinSel.codigo}</DialogTitle></DialogHeader>
              <div className="space-y-2 text-sm">
                {pinSel.tipTipo === "nicho" ? (
                  <p>Nicho{pinSel.largura > 0 ? ` ${brNum(pinSel.largura)}×${brNum(pinSel.altura)} m` : ""} — <b>1 un</b></p>
                ) : (
                  <p>{pinSel.tipTipo === "porta" ? "Porta" : "Janela"} {brNum(pinSel.largura)}×{brNum(pinSel.altura)} m
                    {pinSel.peitoril != null ? ` · peitoril ${brNum(pinSel.peitoril)} m` : ""} — <b>{brNum(pinSel.areaVao)} m²</b></p>
                )}
                {pinSel.requadroPagoEm ? (
                  <div className="flex items-start gap-2 text-xs bg-emerald-50 border border-emerald-200 rounded-md p-2 text-emerald-800">
                    <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>{pinSel.tipTipo === "nicho" ? "Nicho já pago" : "Requadro já pago"} — {pinSel.requadroPagoServico || "serviço"}. Não será cobrado de novo em nenhuma outra medição.</span>
                  </div>
                ) : (
                  <p className="text-xs text-gray-500">{pinSel.tipTipo === "nicho" ? "Nicho ainda não pago em nenhuma medição." : "Requadro ainda não pago em nenhuma medição."}</p>
                )}
                <div className="flex justify-end gap-2 pt-2 border-t">
                  <Button size="sm" variant="outline" className="text-red-600 border-red-200"
                    disabled={excluirEsqMut.isPending || !!pinSel.requadroPagoEm}
                    onClick={() => excluirEsqMut.mutate({ companyId, id: pinSel.id })}>
                    <Trash2 className="w-3.5 h-3.5 mr-1" /> Excluir pin
                  </Button>
                  <Button size="sm" onClick={() => setPinSel(null)}>Fechar</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}

        {/* Dialog replicar */}
        {replicarOpen && (
          <Dialog open onOpenChange={(o) => { if (!o) setReplicarOpen(false); }}>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>Replicar marcação para pavimentos-tipo</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <p className="text-xs text-gray-500">
                  Copia todos os {esquadrias.length} pins deste pavimento para os selecionados.
                  Pavimentos que já têm marcação são pulados (para não misturar).
                </p>
                <div className="space-y-1 max-h-60 overflow-y-auto">
                  {pavimentos.filter(p => p.id !== pavimentoId).map((p: any) => (
                    <label key={p.id} className="flex items-center gap-2 text-sm border rounded-md px-2 py-1.5 cursor-pointer hover:bg-slate-50">
                      <input type="checkbox" checked={replicarSel.includes(p.id)}
                        onChange={e => setReplicarSel(s => e.target.checked ? [...s, p.id] : s.filter(x => x !== p.id))} />
                      {p.nome}
                    </label>
                  ))}
                </div>
                <div className="flex justify-end gap-2 pt-2 border-t">
                  <Button variant="outline" size="sm" onClick={() => setReplicarOpen(false)}>Cancelar</Button>
                  <Button size="sm" disabled={replicarMut.isPending || replicarSel.length === 0}
                    onClick={() => replicarMut.mutate({ companyId, obraId, dePavimentoId: pavimentoId, paraPavimentoIds: replicarSel })}>
                    {replicarMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Copy className="w-3.5 h-3.5 mr-1" />} Replicar
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </DashboardLayout>
  );
}
