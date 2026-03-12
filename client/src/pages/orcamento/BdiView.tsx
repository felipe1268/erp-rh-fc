import React, { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Lock, UploadCloud, Percent, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";

function fmt(v: string | number | null | undefined) {
  return parseFloat(String(v || "0"));
}
function brl(v: string | number | null | undefined) {
  return fmt(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function pct(v: string | number | null | undefined, casas = 4) {
  const n = fmt(v);
  return n !== 0 ? (n * 100).toFixed(casas) + "%" : "—";
}
function num(v: string | number | null | undefined, casas = 2) {
  const n = fmt(v);
  return n !== 0 ? n.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas }) : "—";
}

const TH = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <th className={`px-3 py-2 text-left text-xs font-bold uppercase tracking-wide whitespace-nowrap ${className}`}>
    {children}
  </th>
);
const TD = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <td className={`px-3 py-2 text-sm ${className}`}>{children}</td>
);

// ─────────────────────────────────────────────────────────────
// ABA BDI (principal) — somente leitura, layout fiel à planilha
// ─────────────────────────────────────────────────────────────

// Define a aparência de cada grupo de linhas
type GrupoStyle = {
  headerBg: string; headerText: string; headerBorder: string;
  rowBg: string; rowBgAlt: string; codColor: string;
};

// Estilo comum de cabeçalho para todos os grupos (fundo escuro, texto branco em negrito)
const HDR_BG   = "bg-slate-700";
const HDR_TEXT = "text-white";
const HDR_BRD  = "border-t-2 border-slate-500";

const GRUPO_STYLES: Record<string, GrupoStyle> = {
  CD:  { headerBg: HDR_BG, headerText: HDR_TEXT, headerBorder: HDR_BRD,
         rowBg: "bg-white", rowBgAlt: "bg-slate-50", codColor: "text-slate-600" },
  CI:  { headerBg: HDR_BG, headerText: HDR_TEXT, headerBorder: HDR_BRD,
         rowBg: "bg-white", rowBgAlt: "bg-blue-50/30", codColor: "text-blue-600" },
  DI:  { headerBg: HDR_BG, headerText: HDR_TEXT, headerBorder: HDR_BRD,
         rowBg: "bg-white", rowBgAlt: "bg-yellow-50/30", codColor: "text-amber-700" },
  B:   { headerBg: HDR_BG, headerText: HDR_TEXT, headerBorder: HDR_BRD,
         rowBg: "bg-white", rowBgAlt: "bg-green-50/30", codColor: "text-green-700" },
  J:   { headerBg: HDR_BG, headerText: HDR_TEXT, headerBorder: HDR_BRD,
         rowBg: "bg-white", rowBgAlt: "bg-slate-50", codColor: "text-slate-600" },
  V:   { headerBg: HDR_BG, headerText: HDR_TEXT, headerBorder: HDR_BRD,
         rowBg: "bg-white", rowBgAlt: "bg-slate-50", codColor: "text-slate-500" },
  PV:  { headerBg: HDR_BG, headerText: HDR_TEXT, headerBorder: HDR_BRD,
         rowBg: "bg-yellow-50", rowBgAlt: "bg-yellow-100/50", codColor: "text-amber-700" },
  PVN: { headerBg: HDR_BG, headerText: HDR_TEXT, headerBorder: HDR_BRD,
         rowBg: "bg-yellow-50", rowBgAlt: "bg-yellow-50", codColor: "text-amber-700" },
  L:   { headerBg: HDR_BG, headerText: HDR_TEXT, headerBorder: HDR_BRD,
         rowBg: "bg-white", rowBgAlt: "bg-teal-50/20", codColor: "text-teal-700" },
};

// Apenas esses códigos exatos são cabeçalhos de grupo (com sub-itens)
const HEADER_CODES = new Set(["CD","CI","DI","B","L","J","JF"]);

function getGrupoKey(codigo: string): string {
  if (codigo === "PVN") return "PVN";
  if (codigo.startsWith("PV")) return "PV";
  const prefix = codigo.split("-")[0].toUpperCase();
  // V1, V2... → grupo "V"
  if (prefix.match(/^V\d*$/)) return "V";
  return prefix;
}

function isGroupHeader(codigo: string): boolean {
  return HEADER_CODES.has(codigo.toUpperCase());
}

function pct2(v: string | number | null | undefined) {
  const n = fmt(v);
  if (n === 0) return "—";
  return (n * 100).toFixed(2) + "%";
}

// Filtra apenas códigos BDI válidos — descarta lixo de importações antigas.
// B-03 e B-05 são excluídos (dados errados de import antigo — L-01..L-04 existem corretamente).
// PV aceita espaços: "PV - 2" e "PV-2" são equivalentes.
// Sub-códigos (CD-02.1, CI-01.1, CI-01.2) são permitidos.
const VALID_BDI = /^(CD-\d{2}(\.\d+)?|CI-\d{2}(\.\d+)?|DI-\d{2}|B-0[124]|L-\d{2}|V\d{1,2}|PV\s*-\s*[23]|PVN|JF?|CD\s*\+.*|CD|CI|DI|B|L)$/;

// Códigos cujo % é digitado diretamente nesta aba (células azuis/verdes do Excel BDI)
// Os demais têm valor agregado das abas complementares e são somente leitura aqui.
const EDITABLE_PCT = new Set([
  "DI-08", "DI-09", "DI-10",          // Risco, Seguro, Comissionamento
  "V2", "V4", "V8",                    // BDI curva ABC, BDI FD, Desconto NF
  "B-01",                              // Lucro Bruto Arbitrário
  "L-01", "L-02", "L-03", "L-04",     // Lucros
]);

function AbaBdi({ linhas }: { linhas: any[] }) {
  // Remove linhas inválidas (dados de importação antiga com lixo do Excel)
  const linhasValidas = linhas.filter((l: any) => VALID_BDI.test(String(l.codigo || "").trim()));

  // Controle de grupos colapsados — inicia com todos expandidos
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  // Edições em andamento: id → valor string do input
  const [edits, setEdits] = useState<Record<number, string>>({});

  const updateMut = trpc.orcamento.updateBdiLinha.useMutation({
    onSuccess: () => toast.success("Salvo!"),
    onError:   e  => toast.error(e.message || "Erro ao salvar"),
  });

  function toggleGrupo(key: string) {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function handleBlur(l: any) {
    const raw  = edits[l.id];
    if (raw === undefined) return;
    const val  = parseFloat(raw.replace(",", "."));
    if (isNaN(val)) { setEdits(p => { const n = {...p}; delete n[l.id]; return n; }); return; }
    // persiste como fração decimal (Excel usa 0.05 para 5%)
    updateMut.mutate({ id: l.id, percentual: val / 100 });
    setEdits(p => { const n = {...p}; delete n[l.id]; return n; });
  }

  // Encontra BDI total (B-02)
  const bdiLinha = linhasValidas.find((l: any) => l.codigo === "B-02");
  const bdiTotal  = bdiLinha ? fmt(bdiLinha.percentual) : 0;

  // Detecta linha de soma (ex: "CD + CI =")
  const isSumRow = (cod: string) => /CD\s*\+/.test(cod);

  // Rastreia o grupo atual enquanto iteramos (para saber se linhas estão colapsadas)
  let currentGroupKey = "";

  return (
    <div className="space-y-0 text-sm">
      {/* Legenda */}
      <div className="flex items-center gap-4 mb-3 text-xs flex-wrap">
        <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded px-2.5 py-1.5">
          <span className="inline-block w-3 h-3 rounded-sm bg-blue-500" />
          <span className="text-blue-800 font-medium">Campo editável diretamente nesta aba</span>
        </div>
        <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5">
          <Lock className="h-3 w-3 text-slate-400" />
          <span className="text-slate-600">Valor agregado das abas complementares</span>
        </div>
        <span className="text-slate-400">• Clique no cabeçalho do grupo para expandir/fechar</span>
      </div>

      <Card className="overflow-hidden border-slate-300">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse" style={{ borderSpacing: 0 }}>
              <colgroup>
                <col style={{ width: "80px" }}  />
                <col style={{ minWidth: "300px" }} />
                <col style={{ width: "90px" }}  />
                <col style={{ width: "130px" }} />
              </colgroup>
              <thead>
                <tr className="bg-slate-700 text-white text-xs">
                  <th className="px-3 py-2 text-center font-bold uppercase tracking-wide border-r border-slate-600">Cód.</th>
                  <th className="px-3 py-2 text-left font-bold uppercase tracking-wide border-r border-slate-600">Descrição</th>
                  <th className="px-3 py-2 text-right font-bold uppercase tracking-wide border-r border-slate-600">%</th>
                  <th className="px-3 py-2 text-right font-bold uppercase tracking-wide">Valor R$</th>
                </tr>
              </thead>
              <tbody>
                {linhasValidas.map((l: any, idx: number) => {
                  const key    = getGrupoKey(l.codigo);
                  const g      = GRUPO_STYLES[key] ?? GRUPO_STYLES["CD"];
                  const header = isGroupHeader(l.codigo);
                  const sumRow = isSumRow(l.codigo);
                  const isBdi  = l.codigo === "B-02";
                  const isPV2  = /^PV\s*-\s*[23]$/.test(l.codigo);
                  const hasVal = fmt(l.valorAbsoluto) !== 0;
                  const hasPct = fmt(l.percentual) !== 0;

                  // ── Linha de soma (ex: CD + CI = ...) — sempre visível
                  if (sumRow) {
                    currentGroupKey = "";
                    return (
                      <tr key={l.id ?? idx} className="bg-slate-200 border-t-2 border-b-2 border-slate-400">
                        <td colSpan={2} className="px-4 py-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider">{l.descricao}</td>
                        <td className="px-3 py-1.5 text-right text-xs font-bold font-mono text-slate-700"></td>
                        <td className="px-3 py-1.5 text-right font-bold font-mono text-slate-900 border-l border-slate-200" style={hasVal ? { backgroundColor: "#F7F797" } : {}}>
                          {hasVal ? brl(l.valorAbsoluto) : "—"}
                        </td>
                      </tr>
                    );
                  }

                  // ── Cabeçalho de grupo (CD, CI, DI, B, L, JF, V, PV...) — clicável
                  if (header) {
                    currentGroupKey = key;
                    // "B" é apenas agrupador interno — não exibir linha de cabeçalho
                    if (l.codigo === "B") return null;
                    const isCollapsed = collapsed.has(key);
                    return (
                      <tr
                        key={l.id ?? idx}
                        className={`${g.headerBg} ${g.headerBorder} cursor-pointer select-none hover:brightness-95 transition-all`}
                        onClick={() => toggleGrupo(key)}
                      >
                        <td className={`px-3 py-2 font-bold font-mono text-xs text-center ${g.headerText} border-r border-slate-500`}>
                          <div className="flex items-center justify-center gap-1">
                            {isCollapsed
                              ? <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                              : <ChevronDown  className="h-3.5 w-3.5 shrink-0" />}
                            {l.codigo}
                          </div>
                        </td>
                        <td className={`px-3 py-2 font-bold uppercase tracking-wide text-sm ${g.headerText} border-r border-slate-500`}>
                          {l.descricao}
                        </td>
                        <td className={`px-3 py-2 text-right font-bold font-mono text-sm ${g.headerText} border-r border-slate-500`}>
                          {hasPct ? pct2(l.percentual) : ""}
                        </td>
                        <td className="px-3 py-2 text-right font-bold font-mono text-sm text-slate-900">
                        </td>
                      </tr>
                    );
                  }

                  // ── Linhas filhas — ocultas se o grupo estiver colapsado
                  if (!isBdi && !isPV2 && currentGroupKey && collapsed.has(currentGroupKey)) {
                    return null;
                  }

                  // ── B-02 (BDI) — linha normal, sem destaque especial
                  if (isBdi) {
                    const isEven = idx % 2 === 0;
                    return (
                      <tr key={l.id ?? idx} className={`border-b border-slate-100 ${isEven ? "bg-white" : "bg-slate-50"}`}>
                        <td className={`px-3 py-1.5 font-mono text-xs text-center font-medium ${g.codColor} border-r border-slate-100`}>
                          {l.codigo}
                        </td>
                        <td className="px-3 py-1.5 font-semibold text-slate-700 border-r border-slate-100">
                          {l.descricao}
                        </td>
                        <td className="px-3 py-1.5 text-right font-bold font-mono text-xs text-slate-700 border-r border-slate-100">
                          {hasPct ? pct2(l.percentual) : "—"}
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono text-xs text-slate-700">
                          {hasVal ? brl(l.valorAbsoluto) : "—"}
                        </td>
                      </tr>
                    );
                  }

                  // ── PV-2 / PV-3 — linhas totais com fator multiplicativo, sempre visíveis
                  if (isPV2) {
                    return (
                      <tr key={l.id ?? idx} className="border-b border-yellow-300 bg-yellow-50">
                        <td className="px-3 py-2 font-bold font-mono text-xs text-center text-amber-700 border-r border-yellow-200">
                          {l.codigo}
                        </td>
                        <td className="px-3 py-2 font-bold text-amber-900 border-r border-yellow-200">
                          {l.descricao}
                        </td>
                        <td className="px-3 py-2 text-right font-bold font-mono text-amber-800 border-r border-yellow-200">
                          {hasPct ? pct2(l.percentual) : ""}
                        </td>
                        <td className="px-3 py-2 text-right font-bold font-mono text-slate-900" style={hasVal ? { backgroundColor: "#F7F797" } : {}}>
                          {hasVal ? brl(l.valorAbsoluto) : "—"}
                        </td>
                      </tr>
                    );
                  }

                  // ── Linha normal de sub-item
                  const isEven   = idx % 2 === 0;
                  const isEdit   = EDITABLE_PCT.has(l.codigo);
                  const editVal  = edits[l.id];
                  // Valor exibido no input (usa edição pendente ou valor do banco convertido para %)
                  const inputVal = editVal !== undefined
                    ? editVal
                    : fmt(l.percentual) !== 0 ? (fmt(l.percentual) * 100).toFixed(2) : "";

                  return (
                    <tr key={l.id ?? idx} className={`border-b border-slate-100 ${isEven ? g.rowBg : g.rowBgAlt} hover:bg-blue-50/20 transition-colors`}>
                      <td className={`px-3 py-1.5 font-mono text-xs text-center font-medium ${g.codColor} border-r border-slate-100`}>
                        {l.codigo}
                      </td>
                      <td className="px-3 py-1.5 text-slate-700 border-r border-slate-100">
                        {l.descricao}
                      </td>

                      {/* Coluna % — editável (azul) ou somente leitura */}
                      {isEdit ? (
                        <td className="py-0.5 px-1 border-r border-blue-200 bg-blue-50">
                          <div className="flex items-center gap-0.5">
                            <input
                              type="number"
                              step="0.01"
                              value={inputVal}
                              onChange={e => setEdits(p => ({ ...p, [l.id]: e.target.value }))}
                              onBlur={() => handleBlur(l)}
                              onKeyDown={e => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
                              className="w-full text-right text-xs font-semibold font-mono text-blue-700 bg-transparent border-0 outline-none focus:ring-1 focus:ring-blue-400 rounded px-1 py-0.5 h-6"
                            />
                            <span className="text-xs text-blue-500 shrink-0">%</span>
                          </div>
                        </td>
                      ) : (
                        <td className="px-3 py-1.5 text-right font-mono text-xs text-slate-600 border-r border-slate-100">
                          {hasPct ? pct2(l.percentual) : "—"}
                        </td>
                      )}

                      <td className="px-3 py-1.5 text-right font-mono text-xs text-slate-700">
                        {hasVal ? brl(l.valorAbsoluto) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Rodapé com BDI total */}
          {bdiTotal > 0 && (
            <div className="flex items-center justify-end gap-4 px-4 py-3 bg-slate-50 border-t border-slate-200">
              <span className="text-xs text-muted-foreground">BDI Total (B-02):</span>
              <span className="text-2xl font-bold text-blue-700 font-mono">{(bdiTotal * 100).toFixed(2)}%</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ── Helpers de formatação de data ────────────────────────────
function isoToBr(iso: string | null | undefined) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
function addMonths(iso: string | null | undefined, months: number): string | null {
  if (!iso) return null;
  const d = new Date(iso + "T00:00:00");
  d.setMonth(d.getMonth() + months);
  return d.toISOString().substring(0, 10);
}
function brDateToIso(br: string): string | null {
  const [d, m, y] = br.split("/");
  if (!d || !m || !y) return null;
  return `${y.length === 2 ? "20" + y : y}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`;
}

// ── Mini input editável para parâmetros ───────────────────────
function ParamInput({
  value, onSave, type = "number", width = "w-20", red = false, placeholder = "0",
  step = "0.01", suffix = "",
}: {
  value: string | number | null | undefined;
  onSave: (v: string) => void;
  type?: "number" | "text" | "date";
  width?: string;
  red?: boolean;
  placeholder?: string;
  step?: string;
  suffix?: string;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const display = value !== null && value !== undefined && String(value) !== "" ? String(value) : "";
  const textColor = red ? "text-red-600 font-semibold" : "text-slate-800";
  const baseClass = `${width} h-5 text-center text-xs font-mono rounded px-1`;
  if (editing) {
    return (
      <input
        autoFocus
        type={type}
        step={step}
        value={draft}
        placeholder={placeholder}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => { setEditing(false); if (draft !== "") onSave(draft); }}
        onKeyDown={e => { if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur(); }}
        className={`${baseClass} bg-blue-50 border border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-500`}
      />
    );
  }
  return (
    <span
      onClick={() => { setDraft(display); setEditing(true); }}
      className={`${baseClass} inline-flex items-center justify-center bg-blue-50 border border-blue-200 cursor-pointer hover:border-blue-400 transition-colors ${textColor}`}
      title="Clique para editar"
    >
      {display
        ? <>{display}{suffix ? <span className="text-slate-400 ml-0.5">{suffix}</span> : null}</>
        : <span className="text-slate-300">—</span>}
    </span>
  );
}

// ABA INDIRETOS — quadro de mão de obra indireta por seção CI
// ─────────────────────────────────────────────────────────────
function AbaIndiretos({ linhas, orcamentoId, refetchLinhas }: { linhas: any[]; orcamentoId: number; refetchLinhas?: () => void }) {
  const [edits, setEdits] = useState<Record<number, Record<string, string>>>({});
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const { data: params, refetch: refetchParams } = trpc.orcamento.getBdiOrcamentoParams.useQuery(
    { orcamentoId },
    { enabled: orcamentoId > 0 }
  );

  const recalcular = trpc.orcamento.recalcularBdiCI01.useMutation({
    onSuccess: (r) => {
      toast.success(`${(r as any).updated} linhas CI-01 recalculadas`);
      refetchLinhas?.();
    },
    onError: e => toast.error(e.message || "Erro ao recalcular"),
  });

  const updateParams = trpc.orcamento.updateBdiOrcamentoParams.useMutation({
    onSuccess: () => { refetchParams(); refetchLinhas?.(); },
    onError: e => toast.error(e.message || "Erro ao salvar parâmetro"),
  });

  const saveParam = (field: string, raw: string) => {
    const isNumField = !["dataInicio","dissidioData","nrAmbulatorio","nrTecSeg","nrEngSeg"].includes(field);
    const val = isNumField ? parseFloat(raw.replace(",", ".")) : raw;
    if (isNumField && isNaN(val as number)) return;
    updateParams.mutate({ orcamentoId, [field]: val } as any);
  };

  const prazoMeses = fmt(params?.tempoObraMeses);
  const eventoAtraso = fmt(params?.eventual_atraso_meses);
  const mesesObra = prazoMeses + eventoAtraso;
  const dataFim = addMonths(params?.data_inicio, mesesObra);

  const updateMut = trpc.orcamento.updateBdiIndiretosLinha.useMutation({
    onSuccess: () => refetchLinhas?.(),
    onError: e => toast.error(e.message || "Erro ao salvar"),
  });

  const handleBlur = (id: number, field: string, raw: string) => {
    const parsed = parseFloat(raw.replace(",", "."));
    if (isNaN(parsed)) return;
    // TX Transferência: user enters percentage (ex: 10), saved as fraction (0.10)
    const value = field === "txTransferencia" ? parsed / 100 : parsed;
    updateMut.mutate({ id, [field]: value } as any);
    setEdits(p => { const c = { ...p }; if (c[id]) delete c[id][field]; return c; });
  };

  const setEdit = (id: number, field: string, val: string) =>
    setEdits(p => ({ ...p, [id]: { ...(p[id] ?? {}), [field]: val } }));

  const getEdit = (id: number, field: string, fallback: any) =>
    edits[id]?.[field] ?? String(fmt(fallback) !== 0 ? fmt(fallback) : "");

  const totalGeral = linhas.filter(l => !l.isHeader).reduce((s, l) => s + fmt(l.totalObra), 0);

  // Reagrupa linhas: cada header CI-XX seguido imediatamente pelas suas sub-linhas.
  // (No banco, os headers CI-02..CI-07 ficam juntos antes das sub-linhas; reagrupamos aqui.)
  const groupedLinhas = useMemo(() => {
    const noSecao = linhas.filter(l => !l.secao && !l.isHeader);
    const headers  = linhas.filter(l => l.isHeader);
    const result: any[] = [...noSecao];
    for (const hdr of headers) {
      result.push(hdr);
      result.push(...linhas.filter(l => !l.isHeader && l.secao === hdr.secao));
    }
    return result;
  }, [linhas]);

  // Editable number input — compact, with optional currency display
  const Inp = ({ id, field, val, w = "w-20", money = false }: { id: number; field: string; val: any; w?: string; money?: boolean }) => {
    const [focused, setFocused] = React.useState(false);
    const rawEdit = edits[id]?.[field];
    const numVal  = fmt(val);
    // While focused: show raw edit or plain number; while blurred: show currency if money=true
    const displayVal = focused
      ? (rawEdit !== undefined ? rawEdit : (numVal !== 0 ? String(numVal) : ""))
      : (rawEdit !== undefined
          ? (money ? fmt(rawEdit.replace(",", ".")).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : rawEdit)
          : (numVal !== 0 ? (money ? numVal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(numVal)) : ""));
    return (
      <input
        type={focused ? "number" : "text"}
        step="0.01"
        value={displayVal}
        placeholder={money ? "0,00" : "0"}
        onChange={e => setEdit(id, field, e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); handleBlur(id, field, edits[id]?.[field] ?? ""); }}
        onKeyDown={e => { if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur(); }}
        className={`${w} h-5 text-right text-xs font-mono bg-blue-50 border border-blue-200 rounded px-1 focus:outline-none focus:ring-1 focus:ring-blue-400`}
      />
    );
  };

  // 14 colunas: chevron | cod | descrição | modalidade | tipo | qtd | meses | salário | bônus | TX.Transf | 13°+férias | val/h | total/mês | total/obra
  const COLS = 14;

  // ── helpers de formatação para os quadros ──────────────────
  const fmtPct = (v: any, d = 0) => {
    const n = fmt(v) * 100;
    return n === 0 ? "0%" : n.toFixed(d) + "%";
  };
  const fmtN = (v: any, d = 2) => {
    const n = fmt(v);
    return n === 0 ? "0" : n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
  };

  return (
    <Card className="overflow-hidden border-slate-200">
      <CardContent className="p-0">

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* QUADRO 01 — MÃO DE OBRA                                       */}
        {/* ══════════════════════════════════════════════════════════════ */}
        <div className="border-b-2 border-slate-400">
          {/* Cabeçalho do quadro */}
          <div className="bg-slate-200 px-3 py-1 border-b border-slate-300">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">QUADRO 01 — MÃO DE OBRA</span>
          </div>

          <div className="flex flex-wrap gap-0 text-xs" style={{ minWidth: 1100 }}>
            {/* ── Bloco A: Dados da obra ──────────────────────────────── */}
            <div className="border-r border-slate-300 px-3 py-2" style={{ minWidth: 220 }}>
              <table className="w-full text-xs border-collapse">
                <tbody>
                  <tr>
                    <td className="pr-2 py-0.5 text-right text-slate-600 whitespace-nowrap">Data de início =</td>
                    <td className="py-0.5 text-center">
                      <ParamInput value={isoToBr(params?.data_inicio)} red
                        onSave={v => saveParam("dataInicio", brDateToIso(v) ?? v)}
                        type="text" width="w-24" placeholder="DD/MM/AAAA" />
                    </td>
                  </tr>
                  <tr>
                    <td className="pr-2 py-0.5 text-right text-slate-600 whitespace-nowrap">Prazo de obra =</td>
                    <td className="py-0.5 text-center">
                      <ParamInput value={fmtN(params?.tempoObraMeses, 0)} width="w-16"
                        onSave={v => saveParam("tempoObraMeses", v)} placeholder="0" step="1" />
                      <span className="ml-1 text-slate-500">meses</span>
                    </td>
                  </tr>
                  <tr>
                    <td className="pr-2 py-0.5 text-right text-slate-600 whitespace-nowrap">Eventual atraso =</td>
                    <td className="py-0.5 text-center">
                      <ParamInput value={fmtN(params?.eventual_atraso_meses, 0)} width="w-16"
                        onSave={v => saveParam("eventualAtrasoMeses", v)} placeholder="0" step="1" />
                      <span className="ml-1 text-slate-500">meses</span>
                    </td>
                  </tr>
                  <tr>
                    <td className="pr-2 py-0.5 text-right text-slate-600 whitespace-nowrap">Meses da obra =</td>
                    <td className="py-0.5 text-center">
                      <span className="w-16 inline-block text-center font-mono font-semibold text-red-600">{mesesObra.toFixed(0)}</span>
                      <span className="ml-1 text-slate-500">meses</span>
                    </td>
                  </tr>
                  <tr>
                    <td className="pr-2 py-0.5 text-right text-slate-600 whitespace-nowrap">Dissídio coletivo =</td>
                    <td className="py-0.5 text-center flex items-center gap-1">
                      <ParamInput value={(fmt(params?.dissidio_pct) * 100).toFixed(2) + "%"} red width="w-16"
                        onSave={v => saveParam("dissidioPct", String(parseFloat(v) / 100))} placeholder="0%" />
                      <ParamInput value={isoToBr(params?.dissidio_data)} width="w-24"
                        onSave={v => saveParam("dissidioData", brDateToIso(v) ?? v)}
                        type="text" placeholder="DD/MM/AAAA" />
                    </td>
                  </tr>
                  <tr>
                    <td className="pr-2 py-0.5 text-right text-slate-600 whitespace-nowrap">Data de fim =</td>
                    <td className="py-0.5 text-center">
                      <span className="font-mono font-semibold text-red-600">{isoToBr(dataFim)}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* ── Bloco B: Hora extra + MDO local ─────────────────────── */}
            <div className="border-r border-slate-300 px-3 py-2" style={{ minWidth: 230 }}>
              <table className="w-full text-xs border-collapse">
                <tbody>
                  {[
                    ["Hora extra dias úteis =", "horaExtraUteisPct", params?.hora_extra_uteis_pct, true],
                    ["Hora extra sábados =",    "horaExtraSabadosPct", params?.hora_extra_sabados_pct, true],
                    ["Hora extra domingos =",   "horaExtraDomingosPct", params?.hora_extra_domingos_pct, true],
                    ["Adicional noturno =",     "adicionalNoturnoPct", params?.adicional_noturno_pct, true],
                    ["Incidência do dissídio =","incidenciaDissidioMeses", params?.incidencia_dissidio_meses, false],
                    ["% de MDO Local (h) =",   "mdoLocalPct", params?.mdo_local_pct, true],
                  ].map(([label, field, val, isPct]: any[]) => (
                    <tr key={field}>
                      <td className="pr-2 py-0.5 text-right text-slate-600 whitespace-nowrap">{label}</td>
                      <td className="py-0.5">
                        <ParamInput
                          value={isPct ? (fmt(val) * 100).toFixed(0) + "%" : fmtN(val, 0)}
                          red={false} width="w-16"
                          onSave={v => saveParam(field, isPct ? String(parseFloat(v) / 100) : v)}
                          placeholder="0" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ── Bloco C: Dias trabalhados ────────────────────────────── */}
            <div className="border-r border-slate-300 px-3 py-2" style={{ minWidth: 230 }}>
              <table className="w-full text-xs border-collapse">
                <tbody>
                  {[
                    ["D. úteis trabalhados/mês =",  "diasUteisMes",         params?.dias_uteis_mes,         false],
                    ["Horas trab. sábados/mês =",   "horasTrabSabadosMes",  params?.horas_trab_sabados_mes,  false],
                    ["D. úteis trab. noturno/mês =","diasUteisNoturnaMes",  params?.dias_uteis_noturno_mes,  false],
                    ["Dom trab. noturno/mês =",      "domTrabNoturnaMes",    params?.dom_trab_noturno_mes,    false],
                  ].map(([label, field, val]: any[]) => (
                    <tr key={field}>
                      <td className="pr-2 py-0.5 text-right text-slate-600 whitespace-nowrap">{label}</td>
                      <td className="py-0.5">
                        <ParamInput value={fmtN(val, 0)} width="w-14"
                          onSave={v => saveParam(field, v)} placeholder="0" step="1" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ── Bloco D: % Presença MDO ─────────────────────────────── */}
            <div className="border-r border-slate-300 px-3 py-2" style={{ minWidth: 200 }}>
              <div className="text-xs font-semibold text-slate-600 mb-1 text-center">% presença MDO p/ horas extras</div>
              <table className="w-full text-xs border-collapse">
                <tbody>
                  {[
                    ["Em dias úteis diurno =",   "presencaMdoUteisDPct", params?.presenca_mdo_uteis_d_pct],
                    ["Em sábados diurno =",       "presencaMdoSabDPct",  params?.presenca_mdo_sab_d_pct],
                    ["Em domingos diurno =",      "presencaMdoDomDPct",  params?.presenca_mdo_dom_d_pct],
                    ["Em dias úteis noturno =",   "presencaMdoUteisNPct",params?.presenca_mdo_uteis_n_pct],
                    ["Em sábados noturno =",      "presencaMdoSabNPct",  params?.presenca_mdo_sab_n_pct],
                    ["Em domingos noturno =",     "presencaMdoDomNPct",  params?.presenca_mdo_dom_n_pct],
                  ].map(([label, field, val]: any[]) => (
                    <tr key={field}>
                      <td className="pr-2 py-0.5 text-right text-slate-600 whitespace-nowrap">{label}</td>
                      <td className="py-0.5">
                        <ParamInput
                          value={(fmt(val) * 100).toFixed(0) + "%"} width="w-14"
                          onSave={v => saveParam(field, String(parseFloat(v) / 100))}
                          placeholder="0%" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ── Bloco E: Parâmetros NR ──────────────────────────────── */}
            <div className="px-3 py-2" style={{ minWidth: 220 }}>
              <div className="text-xs font-semibold text-slate-600 mb-1 text-center">Parâmetros Mín (NR-18 e NR-4)</div>
              <table className="w-full text-xs border-collapse">
                <tbody>
                  {[
                    ["Média homens/mês =",       "nrMediaHomens",   params?.nr_media_homens_mes, false],
                    ["Qtd mín Bacia e mic =",    "nrQtdBacia",      params?.nr_qtd_bacia,        false],
                    ["Qtd máximo =",             "nrQtdMaximo",     params?.nr_qtd_maximo,       false],
                  ].map(([label, field, val]: any[]) => (
                    <tr key={field}>
                      <td className="pr-2 py-0.5 text-right text-slate-600 whitespace-nowrap">{label}</td>
                      <td className="py-0.5">
                        <ParamInput value={fmtN(val)} width="w-16"
                          onSave={v => saveParam(field, v)} placeholder="0" />
                      </td>
                    </tr>
                  ))}
                  {[
                    ["Necessário Ambulatório =", "nrAmbulatorio", params?.nr_ambulatorio],
                    ["Necessário Téc. Seg. =",   "nrTecSeg",      params?.nr_tec_seg],
                    ["Necessário Eng. Seg. =",   "nrEngSeg",      params?.nr_eng_seg],
                  ].map(([label, field, val]: any[]) => (
                    <tr key={field}>
                      <td className="pr-2 py-0.5 text-right text-slate-600 whitespace-nowrap">{label}</td>
                      <td className="py-0.5">
                        <ParamInput value={val ?? "—"} width="w-20" type="text"
                          onSave={v => saveParam(field, v)} placeholder="SIM/NÃO"
                          red={String(val).toUpperCase() === "SIM"} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* QUADRO 02 — GERAL · Valor base conforme CCT                   */}
        {/* ══════════════════════════════════════════════════════════════ */}
        <div className="border-b-2 border-slate-400">
          <div className="bg-slate-200 px-3 py-1 border-b border-slate-300">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              QUADRO 02 — GERAL · Valor base conforme Convenção Coletiva de Trabalho (CCT)
            </span>
          </div>

          <div className="flex flex-wrap gap-0 text-xs" style={{ minWidth: 1100 }}>
            {/* ── Alimentação ─────────────────────────────────────────── */}
            <div className="border-r border-slate-300 px-3 py-2" style={{ minWidth: 180 }}>
              <table className="w-full text-xs border-collapse">
                <tbody>
                  {[
                    ["Café da manhã",   "q2CafeManha",  params?.q2_cafe_manha,  true],
                    ["Almoço",          "q2Almoco",     params?.q2_almoco,      true],
                    ["Lanche da tarde", "q2LanchePct",  params?.q2_lanche_pct,  false],
                    ["Jantar (alojados)","q2JantarValor",params?.q2_jantar_valor,true],
                    ["Cestas básicas",  "q2CestasPct",  params?.q2_cestas_pct,  false],
                    ["Ref. para Coord.","q2RefCoord",   params?.q2_ref_coord,   true],
                  ].map(([label, field, val, isMoney]: any[]) => (
                    <tr key={field}>
                      <td className="pr-2 py-0.5 text-right text-slate-600 whitespace-nowrap">{label} =</td>
                      <td className="py-0.5 text-center">
                        <ParamInput
                          value={isMoney ? brl(val).replace("R$\u00a0","R$ ") : fmtPct(val)}
                          width="w-20"
                          onSave={v => saveParam(field, isMoney ? v : String(parseFloat(v) / 100))}
                          placeholder={isMoney ? "R$ 0,00" : "0%"} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ── Casa X Hotel ────────────────────────────────────────── */}
            <div className="border-r border-slate-300 px-3 py-2" style={{ minWidth: 220 }}>
              <div className="text-xs font-semibold text-slate-600 mb-1 text-center">Casa X Hotel</div>
              <table className="w-full text-xs border-collapse">
                <tbody>
                  <tr>
                    <td className="pr-2 py-0.5 text-right text-slate-600 whitespace-nowrap">Capacidade de casa (pessoas) =</td>
                    <td className="py-0.5 text-center">
                      <ParamInput value={String(params?.q2_cap_casa ?? 6)} width="w-12"
                        onSave={v => saveParam("q2CapCasa", v)} step="1" placeholder="0" />
                    </td>
                  </tr>
                  <tr>
                    <td className="pr-2 py-0.5 text-right text-slate-600 whitespace-nowrap">Tarifa Municipal (dia) =</td>
                    <td className="py-0.5 text-center">
                      <ParamInput value={brl(params?.q2_tarifa_mun)} width="w-20" red
                        onSave={v => saveParam("q2TarifaMun", v)} placeholder="R$ 0,00" />
                    </td>
                  </tr>
                  <tr>
                    <td className="pr-2 py-0.5 text-right text-slate-600 whitespace-nowrap">% incidência =</td>
                    <td className="py-0.5 text-center">
                      <ParamInput value={fmtPct(params?.q2_tarifa_mun_pct)} width="w-14"
                        onSave={v => saveParam("q2TarifaMunPct", String(parseFloat(v) / 100))} placeholder="0%" />
                    </td>
                  </tr>
                  <tr>
                    <td className="pr-2 py-0.5 text-right text-slate-600 whitespace-nowrap">Tarifa Interurbano (dia) =</td>
                    <td className="py-0.5 text-center">
                      <ParamInput value={brl(params?.q2_tarifa_interbano)} width="w-20" red
                        onSave={v => saveParam("q2TarifaInterbano", v)} placeholder="R$ 0,00" />
                    </td>
                  </tr>
                  <tr>
                    <td className="pr-2 py-0.5 text-right text-slate-600 whitespace-nowrap">% incidência =</td>
                    <td className="py-0.5 text-center">
                      <ParamInput value={fmtPct(params?.q2_tarifa_inter_pct)} width="w-14"
                        onSave={v => saveParam("q2TarifaInterPct", String(parseFloat(v) / 100))} placeholder="0%" />
                    </td>
                  </tr>
                  <tr>
                    <td className="pr-2 py-0.5 text-right text-slate-600 whitespace-nowrap">Tarifa média =</td>
                    <td className="py-0.5 text-center font-mono text-slate-700">
                      {fmtN((fmt(params?.q2_tarifa_mun) * fmt(params?.q2_tarifa_mun_pct) + fmt(params?.q2_tarifa_interbano) * fmt(params?.q2_tarifa_inter_pct)))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* ── Comparativo Transporte ───────────────────────────────── */}
            <div className="border-r border-slate-300 px-3 py-2" style={{ minWidth: 340 }}>
              <div className="text-xs font-semibold text-slate-600 mb-1 text-center">Comparativo Transporte Público × Próprio</div>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="px-1 py-0.5 text-left text-slate-600 font-semibold">Cargo</th>
                    <th className="px-1 py-0.5 text-center text-slate-600 font-semibold">Transp. Público</th>
                    <th className="px-1 py-0.5 text-center text-slate-600 font-semibold">Transp. Próprio</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["Produção",    "q2TranspPubProd",  params?.q2_transp_pub_prod,  "q2TranspPropProd",  params?.q2_transp_prop_prod],
                    ["Supervisão",  "q2TranspPubSup",   params?.q2_transp_pub_sup,   "q2TranspPropSup",   params?.q2_transp_prop_sup],
                    ["Coordenação", "q2TranspPubCoord", params?.q2_transp_pub_coord, "q2TranspPropCoord", params?.q2_transp_prop_coord],
                  ].map(([label, fPub, vPub, fProp, vProp]: any[]) => (
                    <tr key={label}>
                      <td className="px-1 py-0.5 text-slate-600">{label}</td>
                      <td className="px-1 py-0.5 text-center">
                        <ParamInput value={fmtN(vPub)} width="w-16"
                          onSave={v => saveParam(fPub, v)} placeholder="0" />
                      </td>
                      <td className="px-1 py-0.5 text-center">
                        <ParamInput value={fmtN(vProp)} width="w-16"
                          onSave={v => saveParam(fProp, v)} placeholder="0" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ── MDO alojada ─────────────────────────────────────────── */}
            <div className="px-3 py-2" style={{ minWidth: 300 }}>
              <div className="text-xs font-semibold text-slate-600 mb-1 text-center">MDO alojada</div>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="px-1 py-0.5 text-left text-slate-600 font-semibold">Cargo</th>
                    <th className="px-1 py-0.5 text-center text-slate-600 font-semibold">% Aloj.</th>
                    <th className="px-1 py-0.5 text-center text-slate-600 font-semibold">Alojado</th>
                    <th className="px-1 py-0.5 text-center text-slate-600 font-semibold">Não Alojado</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["Produção",    "q2MdoAlojProd",  params?.q2_mdo_aloj_prod,  "q2AlojProd",  params?.q2_aloj_prod,  "q2NalojProd",  params?.q2_naloj_prod],
                    ["Supervisão",  "q2MdoAlojSup",   params?.q2_mdo_aloj_sup,   "q2AlojSup",   params?.q2_aloj_sup,   "q2NalojSup",   params?.q2_naloj_sup],
                    ["Coordenação", "q2MdoAlojCoord", params?.q2_mdo_aloj_coord, "q2AlojCoord", params?.q2_aloj_coord, "q2NalojCoord", params?.q2_naloj_coord],
                  ].map(([label, fPct, vPct, fAloj, vAloj, fNAloj, vNAloj]: any[]) => (
                    <tr key={label}>
                      <td className="px-1 py-0.5 text-slate-600">{label}</td>
                      <td className="px-1 py-0.5 text-center">
                        <ParamInput value={fmtPct(vPct)} width="w-12"
                          onSave={v => saveParam(fPct, String(parseFloat(v) / 100))} placeholder="0%" />
                      </td>
                      <td className="px-1 py-0.5 text-center">
                        <ParamInput value={String(vAloj ?? 0)} width="w-12" step="1"
                          onSave={v => saveParam(fAloj, v)} placeholder="0" />
                      </td>
                      <td className="px-1 py-0.5 text-center">
                        <ParamInput value={String(vNAloj ?? 0)} width="w-12" step="1"
                          onSave={v => saveParam(fNAloj, v)} placeholder="0" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Grand total banner */}
        <div className="flex items-center justify-between px-4 py-1.5 bg-slate-100 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Total Geral de Custos Indiretos</span>
            <button
              onClick={() => recalcular.mutate({ orcamentoId })}
              disabled={recalcular.isLoading}
              className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold bg-amber-500 hover:bg-amber-600 text-white rounded transition-colors disabled:opacity-60"
              title="Recalcula CLT/PJ usando os parâmetros atuais (dissídio, prazo, TX transferência)"
            >
              {recalcular.isLoading ? "..." : "⟳ Recalcular CI-01"}
            </button>
          </div>
          <span className="font-bold font-mono text-sm text-slate-900" style={{ backgroundColor: "#F7F797", padding: "2px 8px", borderRadius: 3 }}>
            {brl(totalGeral)}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs" style={{ minWidth: 1100 }}>
            <thead>
              <tr className="bg-slate-700 text-white uppercase sticky top-0 z-10">
                <th className="w-7 px-1 py-1.5 border-r border-slate-600"></th>
                <th className="px-2 py-1.5 text-left font-bold tracking-wide whitespace-nowrap border-r border-slate-600 w-14">Cód.</th>
                <th className="px-2 py-1.5 text-left font-bold tracking-wide whitespace-nowrap border-r border-slate-600" style={{ minWidth: 220 }}>Cargo / Função</th>
                <th className="px-2 py-1.5 text-left font-bold tracking-wide whitespace-nowrap border-r border-slate-600 w-24">Equipe</th>
                <th className="px-2 py-1.5 text-center font-bold tracking-wide whitespace-nowrap border-r border-slate-600 w-20">Tipo</th>
                <th className="px-2 py-1.5 text-right font-bold tracking-wide whitespace-nowrap border-r border-slate-600 w-16">Qtd</th>
                <th className="px-2 py-1.5 text-right font-bold tracking-wide whitespace-nowrap border-r border-slate-600 w-12">Meses</th>
                <th className="px-2 py-1.5 text-right font-bold tracking-wide whitespace-nowrap border-r border-slate-600 w-28">Salário Base</th>
                <th className="px-2 py-1.5 text-right font-bold tracking-wide whitespace-nowrap border-r border-slate-600 w-24">Bônus Mensal</th>
                <th className="px-2 py-1.5 text-right font-bold tracking-wide whitespace-nowrap border-r border-slate-600 w-20" title="Taxa de Transferência de Base">TX.Transf %</th>
                <th className="px-2 py-1.5 text-right font-bold tracking-wide whitespace-nowrap border-r border-slate-600 w-28" title="CLT: incluso nos encargos | PJ: 13°+Férias proporcionais">13°+Férias</th>
                <th className="px-2 py-1.5 text-right font-bold tracking-wide whitespace-nowrap border-r border-slate-600 w-20">Valor/h</th>
                <th className="px-2 py-1.5 text-right font-bold tracking-wide whitespace-nowrap border-r border-slate-600 w-28">Total/Mês</th>
                <th className="px-2 py-1.5 text-right font-bold tracking-wide whitespace-nowrap w-28 border-l border-slate-600">Total/Obra</th>
              </tr>
            </thead>
            <tbody>
              {groupedLinhas.map((l: any, idx: number) => {
                const secKey   = l.secao ?? l.codigo;
                const isCIPlus = l.secao && l.secao !== 'CI-01'; // CI-02..CI-07

                // ── Cabeçalho de seção principal (CI-01..CI-07) ─────────────────
                if (l.isHeader && String(l.codigo).match(/^CI-\d+$/)) {
                  const open  = !collapsed.has(secKey);
                  const secTotal = linhas.filter(x => !x.isHeader && (x.secao === secKey || x.secao === l.codigo))
                                         .reduce((s, x) => s + fmt(x.totalObra), 0);
                  return (
                    <tr key={l.id ?? idx}
                      className="bg-slate-700 text-white cursor-pointer select-none border-t-2 border-slate-500 hover:bg-slate-600 transition-colors"
                      onClick={() => setCollapsed(p => { const n = new Set(p); n.has(secKey) ? n.delete(secKey) : n.add(secKey); return n; })}>
                      <td className="px-1 py-1.5 text-center border-r border-slate-500">
                        {open ? <ChevronDown className="h-3.5 w-3.5 inline" /> : <ChevronRight className="h-3.5 w-3.5 inline" />}
                      </td>
                      <td className="px-2 py-1.5 font-bold font-mono text-xs border-r border-slate-500">{l.codigo}</td>
                      <td colSpan={10} className="px-2 py-1.5 font-bold text-xs uppercase tracking-wider border-r border-slate-500">
                        {l.descricao}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono font-bold text-xs border-r border-slate-500">
                        {secTotal > 0 ? brl(secTotal) : ""}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono font-bold text-xs text-slate-900" style={{ backgroundColor: secTotal > 0 ? "#F7F797" : "transparent" }}>
                        {secTotal > 0 ? brl(secTotal) : ""}
                      </td>
                    </tr>
                  );
                }

                // Ocultar se seção colapsada
                if (l.secao && collapsed.has(l.secao)) return null;

                // ── Sub-cabeçalho de grupo CI-02+ (ex: "08.01 Refeição - Produção") ──
                if (l.isHeader && isCIPlus) {
                  const subTotal = linhas.filter(x => !x.isHeader && x.secao === l.secao && x.codigo.startsWith(l.codigo + '.'))
                                         .reduce((s, x) => s + fmt(x.totalObra), 0);
                  return (
                    <tr key={l.id ?? idx} className="border-t border-slate-200 bg-slate-100">
                      <td className="border-r border-slate-200"></td>
                      <td className="px-2 py-1 font-mono text-xs text-slate-600 border-r border-slate-200 whitespace-nowrap">{l.codigo}</td>
                      <td colSpan={9} className="px-2 py-1 font-semibold text-xs text-slate-700 uppercase tracking-wide border-r border-slate-200">
                        {l.descricao}
                      </td>
                      <td colSpan={3} className="px-2 py-1 text-right font-mono text-xs font-semibold text-slate-600 border-r border-slate-200">
                        {subTotal > 0 ? brl(subTotal) : ""}
                      </td>
                    </tr>
                  );
                }

                // ── Sub-cabeçalho de grupo dentro de CI-01 (ex: "REFEIÇÕES:", "TRANSPORTES:")
                if (l.tipoContrato === 'SUBHDR') {
                  return (
                    <tr key={l.id ?? idx} className="border-t border-slate-300 bg-amber-50">
                      <td className="border-r border-slate-200"></td>
                      <td className="px-2 py-1 font-mono text-xs text-amber-700 border-r border-slate-200 whitespace-nowrap">{l.codigo}</td>
                      <td colSpan={COLS - 2} className="px-2 py-1 font-bold text-xs text-amber-800 uppercase tracking-wide">
                        {l.descricao}
                      </td>
                    </tr>
                  );
                }

                const isEven   = idx % 2 === 0;
                const hasTotal = fmt(l.totalObra) !== 0;
                const hasMes   = fmt(l.totalMes) !== 0;
                const isCLT    = String(l.tipoContrato ?? '').toLowerCase() === 'clt';
                const isPJ     = String(l.tipoContrato ?? '').toLowerCase() === 'contrato';

                // ── CI-02+ linha de dado (Refeições, Transporte, Equip. etc.) ─────
                if (isCIPlus) {
                  const totalLinha = fmt(l.totalLinha) !== 0 ? l.totalLinha : l.totalObra;
                  const pct = fmt(l.pctIncidencia);
                  const hasDeltaT = l.deltaT !== null && l.deltaT !== undefined && String(l.deltaT) !== '';
                  return (
                    <tr key={l.id ?? idx} className={`border-b border-slate-100 hover:bg-blue-50/30 transition-colors text-xs ${isEven ? "bg-white" : "bg-slate-50/60"}`}>
                      <td className="border-r border-slate-100"></td>
                      {/* Código */}
                      <td className="px-2 py-1 font-mono text-slate-400 border-r border-slate-100 whitespace-nowrap">{l.codigo}</td>
                      {/* Descrição */}
                      <td className="px-2 py-1 text-slate-700 border-r border-slate-100">{l.descricao}</td>
                      {/* Unidade */}
                      <td className="px-2 py-1 text-center text-slate-500 border-r border-slate-100 whitespace-nowrap">{l.unidade || "—"}</td>
                      {/* (vazio — tipo) */}
                      <td className="border-r border-slate-100"></td>
                      {/* Quantidade — editável */}
                      <td className="px-1 py-0.5 text-right border-r border-slate-100">
                        <Inp id={l.id} field="quantidade" val={l.quantidade} w="w-14" />
                      </td>
                      {/* Meses (tempo N) */}
                      <td className="px-2 py-1 text-right font-mono text-slate-600 border-r border-slate-100">
                        {fmt(l.mesesObra) !== 0 ? num(l.mesesObra, 0) : "—"}
                      </td>
                      {/* Vida Útil (K) — editável */}
                      <td className="px-1 py-0.5 text-right border-r border-slate-100">
                        <Inp id={l.id} field="vidaUtil" val={l.vidaUtil} w="w-16" />
                      </td>
                      {/* ΔT em obra (L) — editável */}
                      <td className="px-1 py-0.5 text-right border-r border-slate-100">
                        {hasDeltaT
                          ? <Inp id={l.id} field="deltaT" val={l.deltaT} w="w-14" />
                          : <span className="text-slate-300 font-mono">N/A</span>}
                      </td>
                      {/* % Incidência (M) — calculado ou editável */}
                      <td className="px-2 py-1 text-right font-mono text-slate-600 border-r border-slate-100">
                        {(pct * 100).toFixed(0)}%
                      </td>
                      {/* (vazio — 13°+Férias) */}
                      <td className="border-r border-slate-100"></td>
                      {/* Valor Unitário (O) — editável */}
                      <td className="px-1 py-0.5 text-right border-r border-slate-100">
                        <Inp id={l.id} field="valorUnit" val={l.valorUnit} w="w-24" money />
                      </td>
                      {/* (vazio — Total/Mês) */}
                      <td className="border-r border-slate-100"></td>
                      {/* Total (P) — calculado */}
                      <td className="px-2 py-1 text-right font-mono font-semibold text-slate-700 border-l border-slate-100">
                        {fmt(totalLinha) !== 0 ? brl(totalLinha) : "—"}
                      </td>
                    </tr>
                  );
                }

                // ── CI-01 linha de funcionário ───────────────────────────────────
                return (
                  <tr key={l.id ?? idx} className={`border-b border-slate-100 hover:bg-blue-50/30 transition-colors ${isEven ? "bg-white" : "bg-slate-50/60"}`}>
                    <td className="border-r border-slate-100"></td>
                    <td className="px-2 py-1 font-mono text-xs text-slate-500 border-r border-slate-100 whitespace-nowrap">{l.codigo}</td>
                    <td className="px-2 py-1 text-slate-700 border-r border-slate-100">{l.descricao}</td>
                    {/* Equipe (Produção/Supervisão/Coordenação) */}
                    <td className="px-2 py-1 text-xs text-slate-500 border-r border-slate-100 whitespace-nowrap">{l.modalidade}</td>
                    {/* Tipo contrato — select CLT / PJ com mesmo estilo dos inputs */}
                    <td className="px-1 py-0.5 text-center border-r border-slate-100 whitespace-nowrap">
                      {(isCLT || isPJ) ? (
                        <select
                          value={l.tipoContrato}
                          onChange={e => {
                            const novo = e.target.value;
                            updateMut.mutate({ id: l.id, tipoContrato: novo } as any);
                          }}
                          className={`w-16 h-5 text-xs font-bold font-mono rounded px-1 border cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-400 ${
                            isCLT
                              ? "bg-blue-50 border-blue-200 text-green-700"
                              : "bg-blue-50 border-blue-200 text-blue-700"
                          }`}
                        >
                          <option value="CLT">CLT</option>
                          <option value="Contrato">PJ</option>
                        </select>
                      ) : (
                        <span className="text-slate-400 text-xs">{l.tipoContrato || "—"}</span>
                      )}
                    </td>
                    {/* Qtd — editável */}
                    <td className="px-1 py-0.5 text-right border-r border-slate-100">
                      <Inp id={l.id} field="quantidade" val={l.quantidade} w="w-14" />
                    </td>
                    {/* Meses — read-only (vem dos params) */}
                    <td className="px-2 py-1 text-right font-mono text-slate-600 border-r border-slate-100">
                      {fmt(l.mesesObra) !== 0 ? num(l.mesesObra, 0) : "—"}
                    </td>
                    {/* Salário Base — editável, formato moeda */}
                    <td className="px-1 py-0.5 text-right border-r border-slate-100">
                      <Inp id={l.id} field="salarioBase" val={l.salarioBase} w="w-28" money />
                    </td>
                    {/* Bônus Mensal — editável, formato moeda */}
                    <td className="px-1 py-0.5 text-right border-r border-slate-100">
                      <Inp id={l.id} field="bonusMensal" val={l.bonusMensal} w="w-24" money />
                    </td>
                    {/* TX Transferência — editável em %, somente linhas CLT/PJ */}
                    <td className="px-1 py-0.5 text-right border-r border-slate-100">
                      {(isCLT || isPJ) ? (
                        <Inp id={l.id} field="txTransferencia" val={fmt(l.txTransferencia) * 100} w="w-16" />
                      ) : <span className="text-slate-300 text-xs">—</span>}
                    </td>
                    {/* 13°+Férias — CLT: "nos encargos" | PJ: valor calculado */}
                    <td className={`px-2 py-1 text-right font-mono border-r border-slate-100 ${isCLT ? "text-slate-400" : "text-slate-700"}`}>
                      {isCLT
                        ? <span className="text-[10px] text-slate-400 italic" title="CLT: 13° e férias já inclusos nos encargos sociais (112,69%)">nos encargos</span>
                        : (fmt(l.decimoTerceiroFerias) !== 0 ? brl(l.decimoTerceiroFerias) : "—")}
                    </td>
                    {/* Valor/h — calculado, read-only */}
                    <td className="px-2 py-1 text-right font-mono text-slate-500 border-r border-slate-100">
                      {fmt(l.valorHora) !== 0 ? num(l.valorHora, 4) : "—"}
                    </td>
                    {/* Total/Mês — calculado, read-only */}
                    <td className="px-2 py-1 text-right font-mono text-slate-700 border-r border-slate-100">
                      {hasMes ? brl(l.totalMes) : "—"}
                    </td>
                    {/* Total/Obra */}
                    <td className="px-2 py-1 text-right font-mono font-semibold text-slate-700 border-l border-slate-100">
                      {hasTotal ? brl(l.totalObra) : "—"}
                    </td>
                  </tr>
                );
              })}

              {/* Linha de total geral */}
              <tr className="bg-slate-200 border-t-2 border-slate-400">
                <td colSpan={COLS - 1} className="px-3 py-1.5 text-right text-xs font-bold text-slate-700 uppercase">TOTAL GERAL</td>
                <td className="px-2 py-1.5 text-right font-mono font-bold text-xs text-slate-900" style={{ backgroundColor: "#F7F797" }}>
                  {brl(totalGeral)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// ABA F.D. — Faturamento Direto (materiais — apenas insumos da curva ABC)
// Regra: apenas materiais. MDO e serviços não entram automaticamente.
// ─────────────────────────────────────────────────────────────
function AbaFd({ linhas, orcamentoId }: { linhas: any[]; orcamentoId: number }) {
  const [edits, setEdits] = useState<Record<number, Record<string, string>>>({});

  const updateMut = trpc.orcamento.updateBdiFdLinha.useMutation({
    onError: e => toast.error(e.message || "Erro ao salvar"),
  });

  const handleBlur = (id: number, field: string, raw: string) => {
    const v = parseFloat(raw.replace(",", "."));
    if (isNaN(v)) return;
    updateMut.mutate({ id, [field]: v } as any);
    setEdits(p => { const c = { ...p }; if (c[id]) delete c[id][field]; return c; });
  };

  const setEdit  = (id: number, field: string, val: string) =>
    setEdits(p => ({ ...p, [id]: { ...(p[id] ?? {}), [field]: val } }));
  const getEdit  = (id: number, field: string, fallback: any) =>
    edits[id]?.[field] ?? String(fmt(fallback) !== 0 ? fmt(fallback) : "");

  const totalFD = linhas.reduce((s, l) => s + fmt(l.total), 0);
  const inpCls  = "h-5 text-right text-xs font-mono bg-blue-50 border border-blue-200 rounded px-1 focus:outline-none focus:ring-1 focus:ring-blue-400";

  return (
    <Card>
      <CardContent className="p-0">
        {/* Banner total */}
        <div className="flex items-center justify-between px-4 py-1.5 bg-slate-100 border-b border-slate-200">
          <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
            Total F.D. — Faturamento Direto (materiais curva ABC)
          </span>
          <span className="font-bold font-mono text-sm text-slate-900"
            style={{ backgroundColor: "#F7F797", padding: "2px 8px", borderRadius: 3 }}>
            {brl(totalFD)}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs" style={{ minWidth: 900 }}>
            <thead>
              <tr className="bg-slate-700 text-white uppercase sticky top-0 z-10">
                <th className="px-2 py-1.5 text-left font-bold tracking-wide whitespace-nowrap border-r border-slate-600 w-28">Cód. Insumo</th>
                <th className="px-2 py-1.5 text-left font-bold tracking-wide whitespace-nowrap border-r border-slate-600" style={{ minWidth: 280 }}>Descrição</th>
                <th className="px-2 py-1.5 text-center font-bold tracking-wide whitespace-nowrap border-r border-slate-600 w-14">Un</th>
                <th className="px-2 py-1.5 text-right font-bold tracking-wide whitespace-nowrap border-r border-slate-600 w-28">Qtd Orçada</th>
                <th className="px-2 py-1.5 text-right font-bold tracking-wide whitespace-nowrap border-r border-slate-600 w-32">Preço Unit</th>
                <th className="px-2 py-1.5 text-right font-bold tracking-wide whitespace-nowrap border-r border-slate-600 w-36">Total R$</th>
                <th className="px-2 py-1.5 text-left font-bold tracking-wide whitespace-nowrap w-40">Fornecedor</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l: any, idx: number) => (
                <tr key={l.id ?? idx}
                  className={`border-b border-slate-100 hover:bg-blue-50/30 transition-colors ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/60"}`}>
                  <td className="px-2 py-1 font-mono text-slate-500 border-r border-slate-100 whitespace-nowrap">{l.codigoInsumo}</td>
                  <td className="px-2 py-1 text-slate-700 border-r border-slate-100">{l.descricao}</td>
                  <td className="px-2 py-1 text-center text-slate-500 border-r border-slate-100">{l.unidade}</td>
                  <td className="px-1 py-0.5 text-right border-r border-slate-100">
                    <input className={`${inpCls} w-28`}
                      value={getEdit(l.id, "qtdOrcada", l.qtdOrcada)} placeholder="0"
                      onChange={e => setEdit(l.id, "qtdOrcada", e.target.value)}
                      onBlur={() => handleBlur(l.id, "qtdOrcada", edits[l.id]?.qtdOrcada ?? "")}
                      onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
                  </td>
                  <td className="px-1 py-0.5 text-right border-r border-slate-100">
                    <input className={`${inpCls} w-32`}
                      value={getEdit(l.id, "precoUnit", l.precoUnit)} placeholder="0"
                      onChange={e => setEdit(l.id, "precoUnit", e.target.value)}
                      onBlur={() => handleBlur(l.id, "precoUnit", edits[l.id]?.precoUnit ?? "")}
                      onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
                  </td>
                  <td className="px-2 py-1 text-right font-mono font-semibold text-slate-700 border-r border-slate-100">{brl(l.total)}</td>
                  <td className="px-2 py-1 text-slate-500 truncate max-w-[160px]">{l.fornecedor}</td>
                </tr>
              ))}
              <tr className="bg-slate-200 border-t-2 border-slate-400">
                <td colSpan={5} className="px-3 py-1.5 text-right text-xs font-bold text-slate-700 uppercase">TOTAL F.D.</td>
                <td className="px-2 py-1.5 text-right font-mono font-bold text-xs text-slate-900" style={{ backgroundColor: "#F7F797" }}>{brl(totalFD)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// ABA ADM CENTRAL
// ─────────────────────────────────────────────────────────────
function AbaAdmCentral({ linhas, orcamentoId }: { linhas: any[]; orcamentoId: number }) {
  const [edits, setEdits] = useState<Record<number, Record<string, string>>>({});

  const updateMut = trpc.orcamento.updateBdiAdmCentralLinha.useMutation({
    onError: e => toast.error(e.message || "Erro ao salvar"),
  });

  const handleBlur = (id: number, field: string, raw: string) => {
    const v = parseFloat(raw.replace(",", "."));
    if (isNaN(v)) return;
    updateMut.mutate({ id, [field]: v } as any);
    setEdits(p => { const c = { ...p }; if (c[id]) delete c[id][field]; return c; });
  };

  const setEdit = (id: number, field: string, val: string) =>
    setEdits(p => ({ ...p, [id]: { ...(p[id] ?? {}), [field]: val } }));
  const getEdit = (id: number, field: string, fallback: any) =>
    edits[id]?.[field] ?? String(fmt(fallback) !== 0 ? fmt(fallback) : "");

  const totalAdm = linhas.filter(l => !l.isHeader).reduce((s, l) => s + fmt(l.total), 0);
  const inpCls   = "h-5 text-right text-xs font-mono bg-blue-50 border border-blue-200 rounded px-1 focus:outline-none focus:ring-1 focus:ring-blue-400";

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-center justify-between px-4 py-1.5 bg-slate-100 border-b border-slate-200">
          <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Administração Central</span>
          <span className="font-bold font-mono text-sm text-slate-900"
            style={{ backgroundColor: "#F7F797", padding: "2px 8px", borderRadius: 3 }}>
            {brl(totalAdm)}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs" style={{ minWidth: 800 }}>
            <thead>
              <tr className="bg-slate-700 text-white uppercase sticky top-0 z-10">
                <th className="px-2 py-1.5 text-left font-bold tracking-wide border-r border-slate-600 w-20">Código</th>
                <th className="px-2 py-1.5 text-left font-bold tracking-wide border-r border-slate-600" style={{ minWidth: 240 }}>Descrição</th>
                <th className="px-2 py-1.5 text-right font-bold tracking-wide border-r border-slate-600 w-24">Tempo (Obra)</th>
                <th className="px-2 py-1.5 text-right font-bold tracking-wide border-r border-slate-600 w-28">Base</th>
                <th className="px-2 py-1.5 text-right font-bold tracking-wide border-r border-slate-600 w-24">Encargos</th>
                <th className="px-2 py-1.5 text-right font-bold tracking-wide border-r border-slate-600 w-28">Benefícios</th>
                <th className="px-2 py-1.5 text-right font-bold tracking-wide w-32">Total</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l: any, idx: number) => {
                if (l.isHeader) return (
                  <tr key={l.id ?? idx} className="bg-slate-700 text-white border-t-2 border-slate-500">
                    <td className="px-2 py-1 font-bold font-mono text-xs border-r border-slate-600">{l.codigo}</td>
                    <td colSpan={6} className="px-2 py-1 font-bold text-xs uppercase tracking-wider">{l.descricao}</td>
                  </tr>
                );
                return (
                  <tr key={l.id ?? idx} className={`border-b border-slate-100 hover:bg-blue-50/30 transition-colors ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/60"}`}>
                    <td className="px-2 py-1 font-mono text-slate-400 border-r border-slate-100 whitespace-nowrap">{l.codigo}</td>
                    <td className="px-2 py-1 text-slate-700 border-r border-slate-100">{l.descricao}</td>
                    <td className="px-2 py-1 text-right font-mono text-slate-600 border-r border-slate-100">{num(l.tempoObra)}</td>
                    <td className="px-1 py-0.5 text-right border-r border-slate-100">
                      <input className={`${inpCls} w-28`} value={getEdit(l.id, "base", l.base)} placeholder="0"
                        onChange={e => setEdit(l.id, "base", e.target.value)}
                        onBlur={() => handleBlur(l.id, "base", edits[l.id]?.base ?? "")}
                        onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
                    </td>
                    <td className="px-1 py-0.5 text-right border-r border-slate-100">
                      <input className={`${inpCls} w-24`} value={getEdit(l.id, "encargos", l.encargos)} placeholder="0"
                        onChange={e => setEdit(l.id, "encargos", e.target.value)}
                        onBlur={() => handleBlur(l.id, "encargos", edits[l.id]?.encargos ?? "")}
                        onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
                    </td>
                    <td className="px-1 py-0.5 text-right border-r border-slate-100">
                      <input className={`${inpCls} w-28`} value={getEdit(l.id, "beneficios", l.beneficios)} placeholder="0"
                        onChange={e => setEdit(l.id, "beneficios", e.target.value)}
                        onBlur={() => handleBlur(l.id, "beneficios", edits[l.id]?.beneficios ?? "")}
                        onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
                    </td>
                    <td className="px-2 py-1 text-right font-mono font-semibold text-slate-700">{brl(l.total)}</td>
                  </tr>
                );
              })}
              <tr className="bg-slate-200 border-t-2 border-slate-400">
                <td colSpan={6} className="px-3 py-1.5 text-right text-xs font-bold text-slate-700 uppercase">TOTAL ADM CENTRAL</td>
                <td className="px-2 py-1.5 text-right font-mono font-bold text-xs text-slate-900" style={{ backgroundColor: "#F7F797" }}>{brl(totalAdm)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// ABA DESPESAS FINANCEIRAS
// ─────────────────────────────────────────────────────────────
function AbaDespesasFinanceiras({ linhas, orcamentoId }: { linhas: any[]; orcamentoId: number }) {
  const [edits, setEdits] = useState<Record<number, string>>({});

  const updateMut = trpc.orcamento.updateBdiDespesasFinanceirasLinha.useMutation({
    onError: e => toast.error(e.message || "Erro ao salvar"),
  });

  const handleBlur = (id: number, raw: string) => {
    const v = parseFloat(raw.replace(",", "."));
    if (isNaN(v)) return;
    updateMut.mutate({ id, valor: v });
    setEdits(p => { const c = { ...p }; delete c[id]; return c; });
  };

  const inpCls = "h-5 text-right text-xs font-mono bg-blue-50 border border-blue-200 rounded px-1 focus:outline-none focus:ring-1 focus:ring-blue-400";

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-center px-4 py-1.5 bg-slate-100 border-b border-slate-200">
          <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Despesas Financeiras</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs" style={{ minWidth: 640 }}>
            <thead>
              <tr className="bg-slate-700 text-white uppercase sticky top-0 z-10">
                <th className="px-2 py-1.5 text-left font-bold tracking-wide border-r border-slate-600 w-20">Código</th>
                <th className="px-2 py-1.5 text-left font-bold tracking-wide border-r border-slate-600">Descrição</th>
                <th className="px-2 py-1.5 text-right font-bold tracking-wide border-r border-slate-600 w-40">Valor</th>
                <th className="px-2 py-1.5 text-left font-bold tracking-wide w-24">Unidade</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l: any, idx: number) => (
                <tr key={l.id ?? idx} className={`border-b border-slate-100 hover:bg-blue-50/30 transition-colors ${
                  l.isHeader ? "bg-slate-700 text-white" : idx % 2 === 0 ? "bg-white" : "bg-slate-50/60"}`}>
                  <td className={`px-2 py-1 font-mono border-r border-slate-${l.isHeader ? '600' : '100'} whitespace-nowrap ${l.isHeader ? "text-white" : "text-slate-400"}`}>{l.codigo}</td>
                  <td className={`px-2 py-1 border-r border-slate-${l.isHeader ? '600' : '100'} ${l.isHeader ? "font-bold text-white uppercase tracking-wide" : "text-slate-700"}`}>{l.descricao}</td>
                  <td className={`px-1 py-0.5 text-right border-r border-slate-${l.isHeader ? '600' : '100'}`}>
                    {l.isHeader
                      ? <span className="font-mono text-white font-bold px-2">{num(l.valor, 6)}</span>
                      : <input className={`${inpCls} w-36`}
                          value={edits[l.id] ?? (fmt(l.valor) !== 0 ? String(fmt(l.valor)) : "")} placeholder="0"
                          onChange={e => setEdits(p => ({ ...p, [l.id]: e.target.value }))}
                          onBlur={() => handleBlur(l.id, edits[l.id] ?? "")}
                          onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />}
                  </td>
                  <td className={`px-2 py-1 ${l.isHeader ? "text-slate-300" : "text-slate-500"}`}>{l.unidade}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// ABA TRIBUTOS FISCAIS
// ─────────────────────────────────────────────────────────────
function AbaTributos({ linhas, orcamentoId }: { linhas: any[]; orcamentoId: number }) {
  const [edits, setEdits] = useState<Record<number, string>>({});

  const updateMut = trpc.orcamento.updateBdiTributosLinha.useMutation({
    onError: e => toast.error(e.message || "Erro ao salvar"),
  });

  const handleBlur = (id: number, raw: string) => {
    const v = parseFloat(raw.replace(",", ".")) / 100;
    if (isNaN(v)) return;
    updateMut.mutate({ id, aliquota: v });
    setEdits(p => { const c = { ...p }; delete c[id]; return c; });
  };

  const totalAliq = linhas.filter(l => !l.isHeader && l.codigo !== 'Σ').reduce((s, l) => s + fmt(l.aliquota), 0);
  const inpCls    = "h-5 text-right text-xs font-mono bg-blue-50 border border-blue-200 rounded px-1 focus:outline-none focus:ring-1 focus:ring-blue-400";

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-center justify-between px-4 py-1.5 bg-slate-100 border-b border-slate-200">
          <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Tributos Fiscais</span>
          <span className="font-bold font-mono text-sm text-slate-900"
            style={{ backgroundColor: "#F7F797", padding: "2px 8px", borderRadius: 3 }}>
            {(totalAliq * 100).toFixed(4)}%
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs" style={{ minWidth: 680 }}>
            <thead>
              <tr className="bg-slate-700 text-white uppercase sticky top-0 z-10">
                <th className="px-2 py-1.5 text-left font-bold tracking-wide border-r border-slate-600 w-20">Código</th>
                <th className="px-2 py-1.5 text-left font-bold tracking-wide border-r border-slate-600">Descrição</th>
                <th className="px-2 py-1.5 text-left font-bold tracking-wide border-r border-slate-600 w-40">Base Cálculo</th>
                <th className="px-2 py-1.5 text-right font-bold tracking-wide border-r border-slate-600 w-32">Alíquota (%)</th>
                <th className="px-2 py-1.5 text-right font-bold tracking-wide w-32">Valor Calc.</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l: any, idx: number) => {
                if (l.isHeader) return (
                  <tr key={l.id ?? idx} className="bg-slate-700 text-white border-t-2 border-slate-500">
                    <td className="px-2 py-1 font-bold font-mono border-r border-slate-600">{l.codigo}</td>
                    <td colSpan={2} className="px-2 py-1 font-bold uppercase tracking-wider border-r border-slate-600">{l.descricao}</td>
                    <td className="px-2 py-1 text-right font-bold font-mono border-r border-slate-600">{pct(l.aliquota)}</td>
                    <td></td>
                  </tr>
                );
                return (
                  <tr key={l.id ?? idx} className={`border-b border-slate-100 hover:bg-blue-50/30 transition-colors ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/60"}`}>
                    <td className="px-2 py-1 font-mono text-slate-400 border-r border-slate-100 whitespace-nowrap">{l.codigo}</td>
                    <td className="px-2 py-1 text-slate-700 border-r border-slate-100">{l.descricao}</td>
                    <td className="px-2 py-1 text-slate-500 border-r border-slate-100">{l.baseCalculo}</td>
                    <td className="px-1 py-0.5 text-right border-r border-slate-100">
                      <input className={`${inpCls} w-28`}
                        value={edits[l.id] ?? (fmt(l.aliquota) !== 0 ? (fmt(l.aliquota) * 100).toFixed(4) : "")} placeholder="0.0000"
                        onChange={e => setEdits(p => ({ ...p, [l.id]: e.target.value }))}
                        onBlur={() => handleBlur(l.id, edits[l.id] ?? "")}
                        onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
                    </td>
                    <td className="px-2 py-1 text-right font-mono text-slate-700">{fmt(l.valorCalculado) !== 0 ? brl(l.valorCalculado) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// ABA TAXA DE COMERCIALIZAÇÃO
// ─────────────────────────────────────────────────────────────
function AbaTaxaComercializacao({ linhas, orcamentoId }: { linhas: any[]; orcamentoId: number }) {
  const [edits, setEdits] = useState<Record<number, string>>({});

  const updateMut = trpc.orcamento.updateBdiTaxaComercializacaoLinha.useMutation({
    onError: e => toast.error(e.message || "Erro ao salvar"),
  });

  const handleBlur = (id: number, raw: string) => {
    const v = parseFloat(raw.replace(",", ".")) / 100;
    if (isNaN(v)) return;
    updateMut.mutate({ id, percentual: v });
    setEdits(p => { const c = { ...p }; delete c[id]; return c; });
  };

  const inpCls = "h-5 text-right text-xs font-mono bg-blue-50 border border-blue-200 rounded px-1 focus:outline-none focus:ring-1 focus:ring-blue-400";

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-center px-4 py-1.5 bg-slate-100 border-b border-slate-200">
          <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Taxa de Comercialização</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs" style={{ minWidth: 580 }}>
            <thead>
              <tr className="bg-slate-700 text-white uppercase sticky top-0 z-10">
                <th className="px-2 py-1.5 text-left font-bold tracking-wide border-r border-slate-600 w-20">Código</th>
                <th className="px-2 py-1.5 text-left font-bold tracking-wide border-r border-slate-600">Descrição</th>
                <th className="px-2 py-1.5 text-right font-bold tracking-wide border-r border-slate-600 w-32">% Taxa</th>
                <th className="px-2 py-1.5 text-right font-bold tracking-wide w-36">Valor R$</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l: any, idx: number) => (
                <tr key={l.id ?? idx} className={`border-b border-slate-100 hover:bg-blue-50/30 transition-colors ${
                  l.isHeader ? "bg-slate-700 text-white" : idx % 2 === 0 ? "bg-white" : "bg-slate-50/60"}`}>
                  <td className={`px-2 py-1 font-mono border-r border-slate-${l.isHeader ? '600' : '100'} whitespace-nowrap ${l.isHeader ? "text-white" : "text-slate-400"}`}>{l.codigo}</td>
                  <td className={`px-2 py-1 border-r border-slate-${l.isHeader ? '600' : '100'} ${l.isHeader ? "font-bold uppercase tracking-wider text-white" : "text-slate-700"}`}>{l.descricao}</td>
                  <td className={`px-1 py-0.5 text-right border-r border-slate-${l.isHeader ? '600' : '100'}`}>
                    {l.isHeader
                      ? <span className="font-mono text-white font-bold px-2">{pct(l.percentual)}</span>
                      : <input className={`${inpCls} w-28`}
                          value={edits[l.id] ?? (fmt(l.percentual) !== 0 ? (fmt(l.percentual) * 100).toFixed(4) : "")} placeholder="0.0000"
                          onChange={e => setEdits(p => ({ ...p, [l.id]: e.target.value }))}
                          onBlur={() => handleBlur(l.id, edits[l.id] ?? "")}
                          onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />}
                  </td>
                  <td className={`px-2 py-1 text-right font-mono ${l.isHeader ? "text-white font-bold" : "text-slate-700"}`}>{fmt(l.valor) !== 0 ? brl(l.valor) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────
const BDI_TABS = [
  { key: "bdi",         label: "BDI",                    readonly: true  },
  { key: "indiretos",   label: "Indiretos",              readonly: false },
  { key: "fd",          label: "F.D.",                   readonly: false },
  { key: "adm",         label: "Adm Central",            readonly: false },
  { key: "despFinanc",  label: "Despesas Financeiras",   readonly: false },
  { key: "tributos",    label: "Tributos Fiscais",       readonly: false },
  { key: "taxaComercializacao", label: "Taxa de Comercialização", readonly: false },
] as const;

type BdiTabKey = typeof BDI_TABS[number]["key"];

interface BdiViewProps {
  orcamentoId: number;
  bdiPct: number;
  aplicarBdiMutation: any;
  onImportarBdi: () => void;
}

export default function BdiView({ orcamentoId, bdiPct, aplicarBdiMutation, onImportarBdi }: BdiViewProps) {
  const [activeTab, setActiveTab] = useState<BdiTabKey>("bdi");

  const { data, isLoading, refetch } = trpc.orcamento.getBdiDetalhes.useQuery(
    { orcamentoId },
    { enabled: orcamentoId > 0, staleTime: 30_000 }
  );

  const det = data as any;
  const bdiValidas = (det?.bdi ?? []).filter((l: any) => VALID_BDI.test(String(l.codigo || "").trim()));
  const hasBdi = bdiValidas.length > 0;
  const counts: Record<string, number> = {
    bdi:                bdiValidas.length,
    indiretos:          det?.indiretos?.length ?? 0,
    fd:                 det?.fd?.length ?? 0,
    adm:                det?.adm?.length ?? 0,
    despFinanc:         det?.despFinanc?.length ?? 0,
    tributos:           det?.tributos?.length ?? 0,
    taxaComercializacao: det?.taxaComercializacao?.length ?? 0,
  };

  if (isLoading) return (
    <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" /> Carregando dados BDI...
    </div>
  );

  if (!hasBdi) return (
    <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
      <div className="rounded-full bg-blue-50 p-6">
        <Percent className="h-10 w-10 text-blue-400" />
      </div>
      <div>
        <p className="font-semibold text-lg text-slate-700">Nenhuma planilha BDI importada</p>
        <p className="text-sm text-muted-foreground mt-1 max-w-md">
          Faça upload da planilha BDI para visualizar e editar as abas:
          BDI (resumo), Indiretos, F.D., Adm Central, Despesas Financeiras, Tributos Fiscais, Taxa de Comercialização.
        </p>
      </div>
      <Button className="gap-2 bg-blue-600 hover:bg-blue-700 text-white" onClick={onImportarBdi}>
        <UploadCloud className="h-4 w-4" /> Importar Planilha BDI
      </Button>
    </div>
  );

  return (
    <div>
      {/* Barra de sub-abas */}
      <div className="flex flex-wrap items-end gap-0 border-b mb-4">
        {BDI_TABS.map(tab => {
          const count = counts[tab.key] ?? 0;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-t-md border-b-2 transition-all ${
                isActive
                  ? "border-blue-600 text-blue-700 bg-blue-50"
                  : "border-transparent text-muted-foreground hover:text-blue-600 hover:bg-blue-50/50"
              }`}
            >
              {tab.label}
              {tab.readonly && <Lock className="h-3 w-3 opacity-50" />}
              {count > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                  isActive ? "bg-blue-600 text-white" : "bg-muted text-muted-foreground"
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}

        {/* Ações no canto direito */}
        <div className="ml-auto flex items-center gap-2 pb-1">
          {bdiPct > 0 && (
            <span className="text-sm text-muted-foreground">
              BDI total: <strong className="text-blue-700">{(bdiPct * 100).toFixed(2)}%</strong>
            </span>
          )}
          <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={onImportarBdi}>
            <UploadCloud className="h-3.5 w-3.5" /> Importar BDI
          </Button>
          {bdiPct > 0 && (
            <Button
              size="sm"
              className="gap-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white"
              disabled={aplicarBdiMutation.isPending}
              onClick={() => aplicarBdiMutation.mutate({ orcamentoId, bdiPercentual: bdiPct })}
            >
              {aplicarBdiMutation.isPending
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Percent className="h-3.5 w-3.5" />}
              Aplicar BDI ao Orçamento
            </Button>
          )}
        </div>
      </div>

      {/* Conteúdo da aba ativa */}
      {activeTab === "bdi" && <AbaBdi linhas={bdiValidas} />}
      {activeTab === "indiretos" && counts.indiretos > 0 && <AbaIndiretos linhas={det?.indiretos ?? []} orcamentoId={orcamentoId} refetchLinhas={refetch} />}
      {activeTab === "fd"        && counts.fd        > 0 && <AbaFd linhas={det?.fd ?? []} orcamentoId={orcamentoId} />}
      {activeTab === "adm"       && counts.adm       > 0 && <AbaAdmCentral linhas={det?.adm ?? []} orcamentoId={orcamentoId} />}
      {activeTab === "despFinanc" && counts.despFinanc > 0 && <AbaDespesasFinanceiras linhas={det?.despFinanc ?? []} orcamentoId={orcamentoId} />}
      {activeTab === "tributos"  && counts.tributos  > 0 && <AbaTributos linhas={det?.tributos ?? []} orcamentoId={orcamentoId} />}
      {activeTab === "taxaComercializacao" && counts.taxaComercializacao > 0 && <AbaTaxaComercializacao linhas={det?.taxaComercializacao ?? []} orcamentoId={orcamentoId} />}

      {/* Aba vazia (sem dados importados) */}
      {counts[activeTab] === 0 && activeTab !== "bdi" && (
        <div className="flex flex-col items-center py-16 gap-3 text-muted-foreground">
          <Percent className="h-8 w-8 opacity-30" />
          <p className="text-sm">Nenhum dado importado para esta aba. Reimporte a planilha BDI completa.</p>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={onImportarBdi}>
            <UploadCloud className="h-3.5 w-3.5" /> Importar BDI
          </Button>
        </div>
      )}
    </div>
  );
}
