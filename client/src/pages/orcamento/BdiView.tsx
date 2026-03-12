import React, { useState } from "react";
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

const GRUPO_STYLES: Record<string, GrupoStyle> = {
  CD:  { headerBg: "bg-slate-300", headerText: "text-slate-900",   headerBorder: "border-t-2 border-slate-400",
         rowBg: "bg-white", rowBgAlt: "bg-slate-50", codColor: "text-slate-600" },
  CI:  { headerBg: "bg-blue-200",  headerText: "text-blue-900",    headerBorder: "border-t-2 border-blue-400",
         rowBg: "bg-white", rowBgAlt: "bg-blue-50/30", codColor: "text-blue-600" },
  DI:  { headerBg: "bg-yellow-200",headerText: "text-amber-900",   headerBorder: "border-t-2 border-yellow-400",
         rowBg: "bg-white", rowBgAlt: "bg-yellow-50/30", codColor: "text-amber-700" },
  B:   { headerBg: "bg-green-200", headerText: "text-green-900",   headerBorder: "border-t-2 border-green-400",
         rowBg: "bg-white", rowBgAlt: "bg-green-50/30", codColor: "text-green-700" },
  J:   { headerBg: "bg-slate-200", headerText: "text-slate-800",   headerBorder: "border-t-2 border-slate-300",
         rowBg: "bg-white", rowBgAlt: "bg-slate-50", codColor: "text-slate-600" },
  V:   { headerBg: "bg-slate-100", headerText: "text-slate-700",   headerBorder: "border-t border-slate-200",
         rowBg: "bg-white", rowBgAlt: "bg-slate-50", codColor: "text-slate-500" },
  PV:  { headerBg: "bg-yellow-300",headerText: "text-slate-900",   headerBorder: "border-t-2 border-yellow-500",
         rowBg: "bg-yellow-50", rowBgAlt: "bg-yellow-100/50", codColor: "text-amber-700" },
  PVN: { headerBg: "bg-yellow-200",headerText: "text-slate-900",   headerBorder: "border-t-2 border-yellow-400",
         rowBg: "bg-yellow-50", rowBgAlt: "bg-yellow-50", codColor: "text-amber-700" },
  L:   { headerBg: "bg-teal-200",  headerText: "text-teal-900",    headerBorder: "border-t-2 border-teal-400",
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

// Filtra apenas códigos BDI válidos — descarta lixo de importações antigas
const VALID_BDI = /^(CD-\d{2}|CI-\d{2}|DI-\d{2}|B-\d{2}|L-\d{2}|V\d{1,2}|PV-\d|PVN|JF?|CD\s*\+.*|CD|CI|DI|B|L)$/;

function AbaBdi({ linhas }: { linhas: any[] }) {
  // Remove linhas inválidas (dados de importação antiga com lixo do Excel)
  const linhasValidas = linhas.filter((l: any) => VALID_BDI.test(String(l.codigo || "").trim()));

  // Encontra BDI total (B-02)
  const bdiLinha = linhasValidas.find((l: any) => l.codigo === "B-02");
  const bdiTotal  = bdiLinha ? fmt(bdiLinha.percentual) : 0;

  // Detecta linha de soma (ex: "CD + CI =")
  const isSumRow = (cod: string) => /CD\s*\+/.test(cod);

  return (
    <div className="space-y-0 text-sm">
      {/* Banner somente leitura */}
      <div className="flex items-center gap-2 mb-3 text-xs text-muted-foreground bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
        <Lock className="h-3.5 w-3.5 text-amber-600 shrink-0" />
        <span>Valores somente leitura — editável apenas na aba de origem correspondente</span>
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
                  const isPV2  = l.codigo === "PV-2" || l.codigo === "PV-3";
                  const hasVal = fmt(l.valorAbsoluto) !== 0;
                  const hasPct = fmt(l.percentual) !== 0;

                  // ── Linha de soma (ex: CD + CI = ...)
                  if (sumRow) {
                    return (
                      <tr key={l.id ?? idx} className="bg-slate-200 border-t-2 border-b-2 border-slate-400">
                        <td colSpan={2} className="px-4 py-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider">{l.descricao}</td>
                        <td className="px-3 py-1.5 text-right text-xs font-bold font-mono text-slate-700"></td>
                        <td className="px-3 py-1.5 text-right font-bold font-mono text-slate-900 bg-yellow-200 border-l border-yellow-300">
                          {hasVal ? brl(l.valorAbsoluto) : "—"}
                        </td>
                      </tr>
                    );
                  }

                  // ── Cabeçalho de grupo (CD, CI, DI, B, L, JF, V, PV...)
                  if (header) {
                    return (
                      <tr key={l.id ?? idx} className={`${g.headerBg} ${g.headerBorder}`}>
                        <td className={`px-3 py-2 font-bold font-mono text-xs text-center ${g.headerText} border-r border-slate-200`}>
                          {l.codigo}
                        </td>
                        <td className={`px-3 py-2 font-bold uppercase tracking-wide text-sm ${g.headerText} border-r border-slate-200`}>
                          {l.descricao}
                        </td>
                        <td className={`px-3 py-2 text-right font-bold font-mono text-sm ${g.headerText} border-r border-slate-200`}>
                          {hasPct ? pct2(l.percentual) : ""}
                        </td>
                        <td className="px-3 py-2 text-right font-bold font-mono text-sm text-slate-900 bg-yellow-200">
                          {hasVal ? brl(l.valorAbsoluto) : ""}
                        </td>
                      </tr>
                    );
                  }

                  // ── BDI Total (B-02) — destaque especial
                  if (isBdi) {
                    return (
                      <tr key={l.id ?? idx} className="border-b-2 border-blue-400 bg-blue-50">
                        <td className="px-3 py-2.5 font-bold font-mono text-sm text-center text-blue-700 border-r border-blue-200">
                          {l.codigo}
                        </td>
                        <td className="px-3 py-2.5 font-bold text-blue-900 text-sm border-r border-blue-200">
                          {l.descricao}
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold font-mono text-xl text-blue-700 border-r border-blue-200">
                          {pct2(l.percentual)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold font-mono text-sm text-slate-900 bg-yellow-300">
                          {hasVal ? brl(l.valorAbsoluto) : ""}
                        </td>
                      </tr>
                    );
                  }

                  // ── PV-2 / PV-3 — linhas totais com fator multiplicativo
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
                        <td className="px-3 py-2 text-right font-bold font-mono text-slate-900 bg-yellow-300">
                          {hasVal ? brl(l.valorAbsoluto) : "—"}
                        </td>
                      </tr>
                    );
                  }

                  // ── Linha normal de sub-item
                  const isEven = idx % 2 === 0;
                  return (
                    <tr key={l.id ?? idx} className={`border-b border-slate-100 ${isEven ? g.rowBg : g.rowBgAlt} hover:bg-blue-50/20 transition-colors`}>
                      <td className={`px-3 py-1.5 font-mono text-xs text-center font-medium ${g.codColor} border-r border-slate-100`}>
                        {l.codigo}
                      </td>
                      <td className="px-3 py-1.5 text-slate-700 border-r border-slate-100">
                        {l.descricao}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono text-xs text-slate-600 border-r border-slate-100">
                        {hasPct ? pct2(l.percentual) : "—"}
                      </td>
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
// ABA INDIRETOS — quadro de mão de obra indireta por seção CI
// ─────────────────────────────────────────────────────────────
function AbaIndiretos({ linhas, orcamentoId }: { linhas: any[]; orcamentoId: number }) {
  const [edits, setEdits] = useState<Record<number, Record<string, string>>>({});
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const updateMut = trpc.orcamento.updateBdiIndiretosLinha.useMutation({
    onError: e => toast.error(e.message || "Erro ao salvar"),
  });

  const handleBlur = (id: number, field: string, raw: string) => {
    const n = parseFloat(raw.replace(",", "."));
    if (isNaN(n)) return;
    updateMut.mutate({ id, [field]: n } as any);
    setEdits(p => { const c = { ...p }; if (c[id]) delete c[id][field]; return c; });
  };

  const setEdit = (id: number, field: string, val: string) => {
    setEdits(p => ({ ...p, [id]: { ...(p[id] ?? {}), [field]: val } }));
  };

  const getEdit = (id: number, field: string, fallback: any) =>
    edits[id]?.[field] ?? String(fmt(fallback) !== 0 ? fmt(fallback) : "");

  // Agrupar por seção
  const secoes: string[] = [];
  linhas.forEach(l => { if (l.isHeader && !secoes.includes(l.secao ?? l.codigo)) secoes.push(l.secao ?? l.codigo); });

  const NumCell = ({ id, field, val }: { id: number; field: string; val: any }) => (
    <Input
      className="h-6 w-28 text-right text-xs ml-auto font-mono"
      value={getEdit(id, field, val)}
      placeholder="0"
      onChange={e => setEdit(id, field, e.target.value)}
      onBlur={() => handleBlur(id, field, edits[id]?.[field] ?? "")}
      onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
    />
  );

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-blue-700 text-white text-xs uppercase sticky top-0 z-10">
                <TH className="text-white w-8"></TH>
                <TH className="text-white w-20">Seção</TH>
                <TH className="text-white w-20">Código</TH>
                <TH className="text-white min-w-[200px]">Cargo / Função</TH>
                <TH className="text-white">Modalidade</TH>
                <TH className="text-white">Tipo</TH>
                <TH className="text-white text-right w-16">Qtd</TH>
                <TH className="text-white text-right w-16">Meses</TH>
                <TH className="text-white text-right w-28">Salário Base</TH>
                <TH className="text-white text-right w-28">13º+Férias</TH>
                <TH className="text-white text-right w-24">Valor/h</TH>
                <TH className="text-white text-right w-28">Total/mês</TH>
                <TH className="text-white text-right w-32">Total/obra</TH>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l: any, idx: number) => {
                const secKey = l.secao ?? l.codigo;
                if (l.isHeader) {
                  const open = !collapsed.has(secKey);
                  const total = linhas.filter(x => !x.isHeader && x.secao === secKey).reduce((s, x) => s + fmt(x.totalObra), 0);
                  return (
                    <tr key={l.id ?? idx} className="bg-blue-600 text-white cursor-pointer select-none"
                      onClick={() => setCollapsed(p => { const n = new Set(p); n.has(secKey) ? n.delete(secKey) : n.add(secKey); return n; })}>
                      <td className="px-3 py-2 w-8">
                        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </td>
                      <td colSpan={7} className="px-3 py-2 font-bold text-sm uppercase tracking-wide">
                        {l.codigo} — {l.descricao}
                      </td>
                      <td colSpan={4} className="px-3 py-2 text-right font-mono font-bold text-sm">
                        {brl(total)}
                      </td>
                    </tr>
                  );
                }
                if (collapsed.has(l.secao ?? "")) return null;
                return (
                  <tr key={l.id ?? idx} className={`border-b hover:bg-blue-50/30 ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}`}>
                    <TD></TD>
                    <TD className="font-mono text-xs text-muted-foreground">{l.secao}</TD>
                    <TD className="font-mono text-xs">{l.codigo}</TD>
                    <TD className="font-medium">{l.descricao}</TD>
                    <TD className="text-muted-foreground text-xs">{l.modalidade}</TD>
                    <TD className="text-muted-foreground text-xs">{l.tipoContrato}</TD>
                    <TD className="text-right"><NumCell id={l.id} field="quantidade" val={l.quantidade} /></TD>
                    <TD className="text-right font-mono text-xs">{num(l.mesesObra)}</TD>
                    <TD className="text-right"><NumCell id={l.id} field="salarioBase" val={l.salarioBase} /></TD>
                    <TD className="text-right"><NumCell id={l.id} field="decimoTerceiroFerias" val={l.decimoTerceiroFerias} /></TD>
                    <TD className="text-right font-mono text-xs">{num(l.valorHora, 4)}</TD>
                    <TD className="text-right font-mono text-xs">{brl(l.totalMes)}</TD>
                    <TD className="text-right font-mono text-xs font-medium">{brl(l.totalObra)}</TD>
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
// ABA F.D. — Faturamento Direto (materiais)
// ─────────────────────────────────────────────────────────────
function AbaFd({ linhas, orcamentoId }: { linhas: any[]; orcamentoId: number }) {
  const [edits, setEdits] = useState<Record<number, Record<string, string>>>({});

  const updateMut = trpc.orcamento.updateBdiFdLinha.useMutation({
    onError: e => toast.error(e.message || "Erro ao salvar"),
  });

  const handleBlur = (id: number, field: string, raw: string) => {
    const n = parseFloat(raw.replace(",", "."));
    if (isNaN(n)) return;
    updateMut.mutate({ id, [field]: n } as any);
    setEdits(p => { const c = { ...p }; if (c[id]) delete c[id][field]; return c; });
  };

  const setEdit = (id: number, field: string, val: string) =>
    setEdits(p => ({ ...p, [id]: { ...(p[id] ?? {}), [field]: val } }));

  const getEdit = (id: number, field: string, fallback: any) =>
    edits[id]?.[field] ?? String(fmt(fallback) !== 0 ? fmt(fallback) : "");

  const totalFD = linhas.reduce((s, l) => s + fmt(l.total), 0);

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <span className="text-sm font-medium text-muted-foreground">
          Total F.D.: <strong className="text-blue-700">{brl(totalFD)}</strong>
        </span>
      </div>
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-blue-700 text-white text-xs uppercase sticky top-0">
                  <TH className="text-white w-28">Cód. Insumo</TH>
                  <TH className="text-white">Descrição</TH>
                  <TH className="text-white w-16">Un</TH>
                  <TH className="text-white text-right w-28">Qtd Orçada</TH>
                  <TH className="text-white text-right w-32">Preço Unit</TH>
                  <TH className="text-white text-right w-36">Total R$</TH>
                  <TH className="text-white w-40">Fornecedor</TH>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l: any, idx: number) => (
                  <tr key={l.id ?? idx} className={`border-b hover:bg-blue-50/30 ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}`}>
                    <TD className="font-mono text-xs">{l.codigoInsumo}</TD>
                    <TD className="font-medium">{l.descricao}</TD>
                    <TD className="text-xs text-muted-foreground">{l.unidade}</TD>
                    <TD className="text-right">
                      <Input
                        className="h-6 w-28 text-right text-xs ml-auto font-mono"
                        value={getEdit(l.id, "qtdOrcada", l.qtdOrcada)}
                        placeholder="0"
                        onChange={e => setEdit(l.id, "qtdOrcada", e.target.value)}
                        onBlur={() => handleBlur(l.id, "qtdOrcada", edits[l.id]?.qtdOrcada ?? "")}
                        onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                      />
                    </TD>
                    <TD className="text-right">
                      <Input
                        className="h-6 w-32 text-right text-xs ml-auto font-mono"
                        value={getEdit(l.id, "precoUnit", l.precoUnit)}
                        placeholder="0"
                        onChange={e => setEdit(l.id, "precoUnit", e.target.value)}
                        onBlur={() => handleBlur(l.id, "precoUnit", edits[l.id]?.precoUnit ?? "")}
                        onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                      />
                    </TD>
                    <TD className="text-right font-mono text-xs font-medium">{brl(l.total)}</TD>
                    <TD className="text-xs text-muted-foreground truncate max-w-[160px]">{l.fornecedor}</TD>
                  </tr>
                ))}
                <tr className="bg-blue-50 border-t-2 border-blue-200">
                  <TD colSpan={5} className="font-bold text-right">TOTAL</TD>
                  <TD className="text-right font-bold font-mono text-blue-700">{brl(totalFD)}</TD>
                  <TD></TD>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
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
    const n = parseFloat(raw.replace(",", "."));
    if (isNaN(n)) return;
    updateMut.mutate({ id, [field]: n } as any);
    setEdits(p => { const c = { ...p }; if (c[id]) delete c[id][field]; return c; });
  };

  const setEdit = (id: number, field: string, val: string) =>
    setEdits(p => ({ ...p, [id]: { ...(p[id] ?? {}), [field]: val } }));

  const getEdit = (id: number, field: string, fallback: any) =>
    edits[id]?.[field] ?? String(fmt(fallback) !== 0 ? fmt(fallback) : "");

  const totalAdm = linhas.filter(l => !l.isHeader).reduce((s, l) => s + fmt(l.total), 0);

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <span className="text-sm text-muted-foreground">
          Total Adm Central: <strong className="text-blue-700">{brl(totalAdm)}</strong>
        </span>
      </div>
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-blue-700 text-white text-xs uppercase sticky top-0">
                  <TH className="text-white w-20">Código</TH>
                  <TH className="text-white">Descrição</TH>
                  <TH className="text-white text-right w-24">Tempo (Obra)</TH>
                  <TH className="text-white text-right w-28">Base</TH>
                  <TH className="text-white text-right w-24">Encargos</TH>
                  <TH className="text-white text-right w-28">Benefícios</TH>
                  <TH className="text-white text-right w-32">Total</TH>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l: any, idx: number) => {
                  if (l.isHeader) return (
                    <tr key={l.id ?? idx} className="bg-slate-100 border-t-2 border-slate-300">
                      <TD className="font-bold font-mono text-xs">{l.codigo}</TD>
                      <TD colSpan={6} className="font-bold uppercase tracking-wide text-slate-700">{l.descricao}</TD>
                    </tr>
                  );
                  return (
                    <tr key={l.id ?? idx} className={`border-b hover:bg-blue-50/30 ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}`}>
                      <TD className="font-mono text-xs text-muted-foreground">{l.codigo}</TD>
                      <TD>{l.descricao}</TD>
                      <TD className="text-right font-mono text-xs">{num(l.tempoObra)}</TD>
                      <TD className="text-right">
                        <Input
                          className="h-6 w-28 text-right text-xs ml-auto font-mono"
                          value={getEdit(l.id, "base", l.base)}
                          placeholder="0"
                          onChange={e => setEdit(l.id, "base", e.target.value)}
                          onBlur={() => handleBlur(l.id, "base", edits[l.id]?.base ?? "")}
                          onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                        />
                      </TD>
                      <TD className="text-right">
                        <Input
                          className="h-6 w-24 text-right text-xs ml-auto font-mono"
                          value={getEdit(l.id, "encargos", l.encargos)}
                          placeholder="0"
                          onChange={e => setEdit(l.id, "encargos", e.target.value)}
                          onBlur={() => handleBlur(l.id, "encargos", edits[l.id]?.encargos ?? "")}
                          onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                        />
                      </TD>
                      <TD className="text-right">
                        <Input
                          className="h-6 w-28 text-right text-xs ml-auto font-mono"
                          value={getEdit(l.id, "beneficios", l.beneficios)}
                          placeholder="0"
                          onChange={e => setEdit(l.id, "beneficios", e.target.value)}
                          onBlur={() => handleBlur(l.id, "beneficios", edits[l.id]?.beneficios ?? "")}
                          onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                        />
                      </TD>
                      <TD className="text-right font-mono text-xs font-medium">{brl(l.total)}</TD>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
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
    const n = parseFloat(raw.replace(",", "."));
    if (isNaN(n)) return;
    updateMut.mutate({ id, valor: n });
    setEdits(p => { const c = { ...p }; delete c[id]; return c; });
  };

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-blue-700 text-white text-xs uppercase sticky top-0">
                <TH className="text-white w-20">Código</TH>
                <TH className="text-white">Descrição</TH>
                <TH className="text-white text-right w-36">Valor</TH>
                <TH className="text-white w-24">Unidade</TH>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l: any, idx: number) => (
                <tr key={l.id ?? idx} className={`border-b hover:bg-blue-50/30 ${l.isHeader ? "bg-slate-100 font-semibold" : idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}`}>
                  <TD className="font-mono text-xs text-muted-foreground">{l.codigo}</TD>
                  <TD>{l.descricao}</TD>
                  <TD className="text-right">
                    {l.isHeader ? (
                      <span className="font-mono text-xs">{num(l.valor, 6)}</span>
                    ) : (
                      <Input
                        className="h-6 w-36 text-right text-xs ml-auto font-mono"
                        value={edits[l.id] ?? (fmt(l.valor) !== 0 ? String(fmt(l.valor)) : "")}
                        placeholder="0"
                        onChange={e => setEdits(p => ({ ...p, [l.id]: e.target.value }))}
                        onBlur={() => handleBlur(l.id, edits[l.id] ?? "")}
                        onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                      />
                    )}
                  </TD>
                  <TD className="text-xs text-muted-foreground">{l.unidade}</TD>
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
    const n = parseFloat(raw.replace(",", ".")) / 100;
    if (isNaN(n)) return;
    updateMut.mutate({ id, aliquota: n });
    setEdits(p => { const c = { ...p }; delete c[id]; return c; });
  };

  const totalAliq = linhas.filter(l => !l.isHeader && l.codigo !== 'Σ').reduce((s, l) => s + fmt(l.aliquota), 0);

  return (
    <div className="space-y-2">
      <div className="flex justify-end text-sm text-muted-foreground">
        Total alíquota: <strong className="text-blue-700 ml-1">{(totalAliq * 100).toFixed(4)}%</strong>
      </div>
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-blue-700 text-white text-xs uppercase sticky top-0">
                  <TH className="text-white w-20">Código</TH>
                  <TH className="text-white">Descrição</TH>
                  <TH className="text-white w-40">Base Cálculo</TH>
                  <TH className="text-white text-right w-32">Alíquota (%)</TH>
                  <TH className="text-white text-right w-32">Valor Calc.</TH>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l: any, idx: number) => {
                  if (l.isHeader) return (
                    <tr key={l.id ?? idx} className="bg-blue-50 border-t-2 border-blue-200">
                      <TD className="font-bold font-mono text-xs">{l.codigo}</TD>
                      <TD colSpan={2} className="font-bold text-blue-800">{l.descricao}</TD>
                      <TD className="text-right font-bold font-mono text-blue-800">{pct(l.aliquota)}</TD>
                      <TD></TD>
                    </tr>
                  );
                  return (
                    <tr key={l.id ?? idx} className={`border-b hover:bg-blue-50/30 ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}`}>
                      <TD className="font-mono text-xs text-muted-foreground">{l.codigo}</TD>
                      <TD>{l.descricao}</TD>
                      <TD className="text-xs text-muted-foreground">{l.baseCalculo}</TD>
                      <TD className="text-right">
                        <Input
                          className="h-6 w-28 text-right text-xs ml-auto font-mono"
                          value={edits[l.id] ?? (fmt(l.aliquota) !== 0 ? (fmt(l.aliquota) * 100).toFixed(4) : "")}
                          placeholder="0.0000"
                          onChange={e => setEdits(p => ({ ...p, [l.id]: e.target.value }))}
                          onBlur={() => handleBlur(l.id, edits[l.id] ?? "")}
                          onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                        />
                      </TD>
                      <TD className="text-right font-mono text-xs">{fmt(l.valorCalculado) !== 0 ? brl(l.valorCalculado) : "—"}</TD>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
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
    const n = parseFloat(raw.replace(",", ".")) / 100;
    if (isNaN(n)) return;
    updateMut.mutate({ id, percentual: n });
    setEdits(p => { const c = { ...p }; delete c[id]; return c; });
  };

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-blue-700 text-white text-xs uppercase sticky top-0">
                <TH className="text-white w-20">Código</TH>
                <TH className="text-white">Descrição</TH>
                <TH className="text-white text-right w-32">% Taxa</TH>
                <TH className="text-white text-right w-36">Valor R$</TH>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l: any, idx: number) => (
                <tr key={l.id ?? idx} className={`border-b hover:bg-blue-50/30 ${l.isHeader ? "bg-slate-100 font-semibold" : idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}`}>
                  <TD className="font-mono text-xs text-muted-foreground">{l.codigo}</TD>
                  <TD>{l.descricao}</TD>
                  <TD className="text-right">
                    <Input
                      className="h-6 w-28 text-right text-xs ml-auto font-mono"
                      value={edits[l.id] ?? (fmt(l.percentual) !== 0 ? (fmt(l.percentual) * 100).toFixed(4) : "")}
                      placeholder="0.0000"
                      onChange={e => setEdits(p => ({ ...p, [l.id]: e.target.value }))}
                      onBlur={() => handleBlur(l.id, edits[l.id] ?? "")}
                      onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                    />
                  </TD>
                  <TD className="text-right font-mono text-xs">{fmt(l.valor) !== 0 ? brl(l.valor) : "—"}</TD>
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
      {activeTab === "indiretos" && counts.indiretos > 0 && <AbaIndiretos linhas={det?.indiretos ?? []} orcamentoId={orcamentoId} />}
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
