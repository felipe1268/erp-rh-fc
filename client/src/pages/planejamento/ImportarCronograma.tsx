import React, { useCallback, useRef, useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Upload, FileText, X, CheckCircle2, AlertTriangle, Loader2,
  Link2, ChevronDown, ChevronRight, Info,
} from "lucide-react";

const n = (v: any) => parseFloat(v || "0") || 0;

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface TarefaImportada {
  wbs:       string;
  nome:      string;
  nivel:     number;
  inicio:    string;
  fim:       string;
  durDias:   number;
  pred:      string;
  recurso:   string;
  isGrupo:   boolean;
  // pós-vinculação
  eapCodigo: string;
  pesoFin:   number;
}

// ── Utilitários de parse ──────────────────────────────────────────────────────
function parseDuration(dur: string): number {
  if (!dur) return 0;
  // ISO PT240H0M0S  ou  P10DT0H0M0S
  const h = dur.match(/(\d+)H/);
  const d = dur.match(/(\d+)D/);
  const hours = h ? parseInt(h[1]) : 0;
  const days  = d ? parseInt(d[1]) : 0;
  return days + Math.ceil(hours / 8);
}

function fmtDate(raw: string): string {
  if (!raw) return "";
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
}

// ── Parser MS Project XML ─────────────────────────────────────────────────────
function parseMSProjectXML(text: string): TarefaImportada[] {
  const doc  = new DOMParser().parseFromString(text, "text/xml");
  const err  = doc.querySelector("parsererror");
  if (err) throw new Error("XML inválido");

  const taskEls = Array.from(doc.querySelectorAll("Task"));
  const result: TarefaImportada[] = [];

  for (const task of taskEls) {
    const uid   = task.querySelector("UID")?.textContent ?? "";
    const name  = task.querySelector("Name")?.textContent?.trim() ?? "";
    const wbs   = task.querySelector("WBS")?.textContent?.trim() ?? "";
    const level = parseInt(task.querySelector("OutlineLevel")?.textContent ?? "0");
    const start = fmtDate(task.querySelector("Start")?.textContent ?? "");
    const fin   = fmtDate(task.querySelector("Finish")?.textContent ?? "");
    const durRaw= task.querySelector("Duration")?.textContent ?? "";
    const summ  = task.querySelector("Summary")?.textContent === "1";
    const pred  = task.querySelector("PredecessorLink UID")?.textContent ?? "";
    const res   = task.querySelector("Assignment ResourceUID")?.textContent ?? "";

    // Pula a tarefa de nível 0 (cabeçalho do projeto)
    if (uid === "0" || name === "" || level === 0) continue;

    result.push({
      wbs, nome: name, nivel: level, inicio: start, fim: fin,
      durDias: parseDuration(durRaw), pred, recurso: res,
      isGrupo: summ, eapCodigo: wbs, pesoFin: 0,
    });
  }
  return result;
}

// ── Parser Excel (MS Project → Excel export) ──────────────────────────────────
async function parseMSProjectXLSX(buffer: ArrayBuffer): Promise<TarefaImportada[]> {
  const xlsxMod = await import("xlsx");
  const XLSX = xlsxMod.default ?? xlsxMod;
  const wb = XLSX.read(buffer, { type: "array" });

  // Tenta pegar a primeira planilha
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<any>(ws, { defval: "" });

  if (!rows.length) throw new Error("Planilha vazia");

  // Detecta as colunas automaticamente (MS Project exporta com nomes em inglês ou português)
  const KEYS_NOME = ["Name", "Task Name", "Atividade", "Nome", "Tarefa"];
  const KEYS_WBS  = ["WBS", "EAP", "Código", "Code"];
  const KEYS_INI  = ["Start", "Data de Início", "Início", "Inicio"];
  const KEYS_FIM  = ["Finish", "Data de Término", "Fim", "Término", "Termino"];
  const KEYS_DUR  = ["Duration", "Duração", "Duracao"];
  const KEYS_PRED = ["Predecessors", "Predecessoras", "Predecessores"];
  const KEYS_REC  = ["Resource Names", "Recursos", "Recurso"];

  function findKey(keys: string[], row: any) {
    const headers = Object.keys(row);
    for (const k of keys) for (const h of headers) {
      if (h.toLowerCase().includes(k.toLowerCase())) return h;
    }
    return null;
  }

  const firstRow = rows[0];
  const kNome = findKey(KEYS_NOME, firstRow);
  const kWbs  = findKey(KEYS_WBS,  firstRow);
  const kIni  = findKey(KEYS_INI,  firstRow);
  const kFim  = findKey(KEYS_FIM,  firstRow);
  const kDur  = findKey(KEYS_DUR,  firstRow);
  const kPred = findKey(KEYS_PRED, firstRow);
  const kRec  = findKey(KEYS_REC,  firstRow);

  if (!kNome) throw new Error("Coluna de nome da tarefa não encontrada");

  return rows
    .filter((r: any) => r[kNome!]?.toString().trim())
    .map((r: any, i: number) => {
      const wbs   = kWbs ? r[kWbs]?.toString().trim() : String(i + 1);
      const nome  = r[kNome!]?.toString().trim() ?? "";
      const ini   = kIni ? fmtDate(r[kIni]?.toString()) : "";
      const fim   = kFim ? fmtDate(r[kFim]?.toString()) : "";
      const durRaw= kDur ? r[kDur]?.toString() : "";
      const durDias = durRaw ? parseDuration(durRaw) || parseInt(durRaw) || 0 : 0;
      const pred  = kPred ? r[kPred]?.toString().trim() : "";
      const rec   = kRec  ? r[kRec]?.toString().trim()  : "";
      const level = wbs ? wbs.split(".").length : 1;
      const isGrupo = false;

      return { wbs, nome, nivel: level, inicio: ini, fim, durDias, pred, recurso: rec, isGrupo, eapCodigo: wbs, pesoFin: 0 };
    });
}

// ── Componente principal ──────────────────────────────────────────────────────
interface Props {
  projetoId:    number;
  revisaoAtiva: any;
  orcamentoId?: number | null;
  utils:        any;
  onImportado?: () => void;
}

export default function ImportarCronograma({ projetoId, revisaoAtiva, orcamentoId, utils, onImportado }: Props) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"upload" | "preview" | "vinculo">("upload");
  const [tarefas, setTarefas] = useState<TarefaImportada[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [arquivo, setArquivo] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Busca itens do orçamento para vinculação automática
  const { data: orcItens = [] } = trpc.orcamento.getItens.useQuery(
    { orcamentoId: orcamentoId ?? 0 },
    { enabled: !!orcamentoId && open }
  );

  const eapMap = useMemo(() => {
    const map: Record<string, any> = {};
    (orcItens as any[]).forEach((it: any) => {
      if (it.eapCodigo) map[it.eapCodigo] = it;
    });
    return map;
  }, [orcItens]);

  const totalVenda = useMemo(() =>
    (orcItens as any[]).reduce((s: number, it: any) => s + n(it.vendaTotal), 0),
  [orcItens]);

  const salvarMutation = trpc.planejamento.salvarAtividades.useMutation({
    onSuccess: () => {
      utils.planejamento.listarAtividades.invalidate();
      setOpen(false);
      resetState();
      onImportado?.();
    },
  });

  function resetState() {
    setStep("upload");
    setTarefas([]);
    setErro(null);
    setArquivo("");
  }

  // ── Vinculação automática com EAP do orçamento ────────────────────────────
  function vincularComOrcamento(lista: TarefaImportada[]): TarefaImportada[] {
    if (!orcamentoId || !Object.keys(eapMap).length) return lista;

    return lista.map(t => {
      const item = eapMap[t.wbs] ?? eapMap[t.eapCodigo];
      if (item && totalVenda > 0) {
        return { ...t, eapCodigo: item.eapCodigo, pesoFin: +(n(item.vendaTotal) / totalVenda * 100).toFixed(3) };
      }
      return t;
    });
  }

  // ── Leitura do arquivo ────────────────────────────────────────────────────
  async function handleFile(file: File) {
    setCarregando(true);
    setErro(null);
    setArquivo(file.name);
    try {
      let parsed: TarefaImportada[];
      const ext = file.name.split(".").pop()?.toLowerCase();

      if (ext === "xml") {
        const text = await file.text();
        parsed = parseMSProjectXML(text);
      } else if (ext === "xlsx" || ext === "xls" || ext === "xlsm") {
        const buf = await file.arrayBuffer();
        parsed = await parseMSProjectXLSX(buf);
      } else {
        throw new Error("Formato não suportado. Use .xml (MS Project) ou .xlsx");
      }

      if (!parsed.length) throw new Error("Nenhuma tarefa encontrada no arquivo");

      const vinculados = vincularComOrcamento(parsed);
      setTarefas(vinculados);
      setStep("preview");
    } catch (e: any) {
      setErro(e.message ?? "Erro ao processar arquivo");
    } finally {
      setCarregando(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function updateTarefa(idx: number, field: keyof TarefaImportada, value: any) {
    setTarefas(t => t.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  }

  // Recalcula pesos automaticamente distribuindo 100% pelas folhas
  function redistribuirPesos() {
    const folhas = tarefas.filter(t => !t.isGrupo);
    if (!folhas.length) return;
    const pesoUnitario = +(100 / folhas.length).toFixed(3);
    let folhaIdx = 0;
    setTarefas(t => t.map(item =>
      item.isGrupo ? item : { ...item, pesoFin: folhaIdx++ === folhas.length - 1
        ? +(100 - pesoUnitario * (folhas.length - 1)).toFixed(3) : pesoUnitario }
    ));
  }

  function confirmarImportacao() {
    if (!revisaoAtiva) return;
    const atividades = tarefas.map((t, i) => ({
      eapCodigo:           t.eapCodigo || t.wbs,
      nome:                t.nome,
      nivel:               t.nivel,
      dataInicio:          t.inicio || undefined,
      dataFim:             t.fim || undefined,
      duracaoDias:         t.durDias,
      predecessora:        t.pred || undefined,
      pesoFinanceiro:      t.pesoFin,
      recursoPrincipal:    t.recurso || undefined,
      isGrupo:             t.isGrupo,
      ordem:               i,
    }));
    salvarMutation.mutate({ revisaoId: revisaoAtiva.id, projetoId, atividades });
  }

  const totalPeso = tarefas.reduce((s, t) => s + (t.isGrupo ? 0 : t.pesoFin), 0);
  const pesoOk    = Math.abs(totalPeso - 100) < 0.1 || tarefas.every(t => t.pesoFin === 0);
  const vinculados = tarefas.filter(t => eapMap[t.eapCodigo]).length;

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
        onClick={() => { setOpen(true); resetState(); }}
      >
        <Upload className="h-3.5 w-3.5" />
        Importar MS Project
      </Button>

      <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) resetState(); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-4 w-4 text-emerald-600" />
              Importar Cronograma — MS Project
            </DialogTitle>
          </DialogHeader>

          {/* ── Step 1: Upload ── */}
          {step === "upload" && (
            <div className="space-y-4 mt-2">
              <div className="text-xs text-slate-500 bg-slate-50 rounded-lg p-3 space-y-1">
                <p className="font-medium text-slate-700">Como exportar do MS Project:</p>
                <p>• <strong>XML</strong>: Arquivo → Salvar Como → <em>XML do Project (*.xml)</em></p>
                <p>• <strong>Excel</strong>: Arquivo → Salvar Como → <em>Pasta de Trabalho do Excel (*.xlsx)</em></p>
                <p>As atividades serão vinculadas automaticamente à EAP do orçamento (se disponível).</p>
              </div>

              <div
                className="border-2 border-dashed border-slate-300 rounded-xl p-10 text-center cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/30 transition-all"
                onDragOver={e => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
              >
                {carregando ? (
                  <div className="flex flex-col items-center gap-2 text-slate-500">
                    <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
                    <p className="text-sm">Processando arquivo...</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-slate-500">
                    <Upload className="h-8 w-8 text-slate-300" />
                    <p className="text-sm font-medium">Arraste o arquivo aqui ou clique para selecionar</p>
                    <p className="text-xs text-slate-400">Aceita: .xml (MS Project XML) · .xlsx · .xls</p>
                  </div>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".xml,.xlsx,.xls,.xlsm"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
              />

              {erro && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {erro}
                </div>
              )}
            </div>
          )}

          {/* ── Step 2: Preview + Edição ── */}
          {step === "preview" && (
            <div className="space-y-3 mt-1">
              {/* Cabeçalho de info */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <FileText className="h-3.5 w-3.5" /> {arquivo}
                  </span>
                  <span className="bg-slate-100 rounded-full px-2 py-0.5 font-medium">
                    {tarefas.length} tarefas
                  </span>
                  {orcamentoId && (
                    <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${vinculados > 0 ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                      <Link2 className="h-3 w-3" />
                      {vinculados}/{tarefas.length} vinculadas ao orçamento
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" className="text-xs gap-1" onClick={redistribuirPesos}>
                    Distribuir pesos (100%)
                  </Button>
                  <Button size="sm" variant="outline" className="text-xs" onClick={() => setStep("upload")}>
                    Trocar arquivo
                  </Button>
                </div>
              </div>

              {/* Aviso de peso */}
              {!pesoOk && (
                <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  Soma dos pesos financeiros: <strong>{totalPeso.toFixed(1)}%</strong> — deve totalizar 100% para Curva S financeira correta.
                </div>
              )}

              {/* Tabela */}
              <div className="rounded-xl border border-slate-100 shadow-sm overflow-x-auto max-h-[48vh] overflow-y-auto">
                <table className="w-full text-[11px]">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-slate-700 text-white">
                      <th className="py-2 px-2 text-left w-28">EAP / WBS</th>
                      <th className="py-2 px-2 text-left">Nome da Atividade</th>
                      <th className="py-2 px-2 text-center w-7">Grupo</th>
                      <th className="py-2 px-2 text-left w-24">Início</th>
                      <th className="py-2 px-2 text-left w-24">Fim</th>
                      <th className="py-2 px-2 text-right w-14">Dias</th>
                      <th className="py-2 px-2 text-right w-16">Peso%</th>
                      <th className="py-2 px-2 text-left w-28">Recurso</th>
                      {orcamentoId && <th className="py-2 px-2 text-center w-8">EAP</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {tarefas.map((t, idx) => {
                      const indent = (t.nivel - 1) * 12;
                      const vinculado = !!eapMap[t.eapCodigo];
                      return (
                        <tr key={idx} className={`border-b border-slate-50 ${t.isGrupo ? "bg-slate-50 font-semibold" : "bg-white hover:bg-blue-50/30"}`}>
                          <td className="px-2 py-1">
                            <Input
                              value={t.eapCodigo}
                              onChange={e => updateTarefa(idx, "eapCodigo", e.target.value)}
                              className="h-6 text-[11px] px-1 py-0 min-w-0 w-full"
                            />
                          </td>
                          <td className="px-2 py-1">
                            <div style={{ paddingLeft: indent }}>
                              <span className="text-slate-800">{t.nome}</span>
                            </div>
                          </td>
                          <td className="px-2 py-1 text-center">
                            <input
                              type="checkbox"
                              checked={t.isGrupo}
                              onChange={e => updateTarefa(idx, "isGrupo", e.target.checked)}
                              className="h-3 w-3 accent-blue-600"
                            />
                          </td>
                          <td className="px-2 py-1">
                            <Input
                              type="date"
                              value={t.inicio}
                              onChange={e => updateTarefa(idx, "inicio", e.target.value)}
                              className="h-6 text-[11px] px-1 py-0 w-full"
                            />
                          </td>
                          <td className="px-2 py-1">
                            <Input
                              type="date"
                              value={t.fim}
                              onChange={e => updateTarefa(idx, "fim", e.target.value)}
                              className="h-6 text-[11px] px-1 py-0 w-full"
                            />
                          </td>
                          <td className="px-2 py-1 text-right text-slate-600">{t.durDias}d</td>
                          <td className="px-2 py-1">
                            {t.isGrupo ? (
                              <span className="text-[10px] text-slate-400 block text-right">—</span>
                            ) : (
                              <Input
                                type="number"
                                min={0} max={100} step={0.001}
                                value={t.pesoFin}
                                onChange={e => updateTarefa(idx, "pesoFin", parseFloat(e.target.value) || 0)}
                                className={`h-6 text-[11px] px-1 py-0 w-full text-right ${t.pesoFin > 0 ? "text-emerald-700" : "text-slate-400"}`}
                              />
                            )}
                          </td>
                          <td className="px-2 py-1 text-slate-500 truncate max-w-[100px]">{t.recurso}</td>
                          {orcamentoId && (
                            <td className="px-2 py-1 text-center">
                              {vinculado
                                ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mx-auto" />
                                : <span className="text-[10px] text-slate-300">—</span>}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Rodapé */}
              <div className="text-[10px] text-slate-400 flex items-start gap-1">
                <Info className="h-3 w-3 shrink-0 mt-0.5" />
                <span>
                  Edite os códigos EAP para bater com o orçamento. O Peso% define a participação financeira de cada atividade na Curva S.
                  Grupos marcados não somam no peso.
                </span>
              </div>

              <div className="flex gap-2 justify-end pt-1 border-t border-slate-100">
                <Button variant="outline" size="sm" onClick={() => { setOpen(false); resetState(); }}>Cancelar</Button>
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 gap-1.5"
                  disabled={salvarMutation.isPending}
                  onClick={confirmarImportacao}
                >
                  {salvarMutation.isPending
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <CheckCircle2 className="h-3.5 w-3.5" />}
                  Importar {tarefas.length} atividades
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
