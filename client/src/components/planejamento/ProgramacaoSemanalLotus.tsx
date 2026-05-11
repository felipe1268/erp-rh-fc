import React, { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, FileSpreadsheet, Printer, ChevronLeft, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Atividade {
  id: number;
  eapCodigo?: string | null;
  nome: string;
  nivel?: number | null;
  isGrupo?: boolean | null;
  dataInicio?: string | null;
  dataFim?: string | null;
  dataInicioReal?: string | null;
  dataFimReal?: string | null;
  pesoFinanceiro?: string | number | null;
}

interface Props {
  projetoId: number;
  revisaoId: number;
  companyId: number;
  nomeProjeto: string;
  nomeCliente: string;
  atividades: Atividade[];
  semanas: { numero: number; ini: Date; fim: Date }[];
  semanaIdx: number;
  onSemanaChange: (idx: number) => void;
  gerenciadoraNome?: string | null;
  gerenciadoraLogoUrl?: string | null;
  clienteLogoUrl?: string | null;
  engenheiroResponsavel?: string | null;
}

const DIAS_SEMANA = ["Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado", "Domingo"];
const DIAS_ABREV = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];
const MESES_ABREV = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function fmtBR(s?: string | null) {
  if (!s) return "—";
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}
function fmtDiaMes(d: Date) {
  return `${String(d.getDate()).padStart(2, "0")}-${MESES_ABREV[d.getMonth()]}`;
}
function dateStr(d: Date) {
  return d.toISOString().split("T")[0];
}
function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function diasDaSemana(ini: Date): Date[] {
  const arr: Date[] = [];
  const segunda = new Date(ini);
  // Recua até segunda-feira
  const diaSemana = segunda.getDay(); // 0=dom..6=sáb
  const diff = diaSemana === 0 ? -6 : 1 - diaSemana;
  segunda.setDate(segunda.getDate() + diff);
  for (let i = 0; i < 7; i++) {
    const d = new Date(segunda);
    d.setDate(segunda.getDate() + i);
    arr.push(d);
  }
  return arr;
}

/**
 * Classifica a cor de cada célula do Gantt diário por atividade × dia.
 * Cores conforme legenda LOTUS:
 *  🟦 Previsto  · 🟩 Realizado  · 🟨 Não programado executado
 *  🟧 Antecipado  · 🟥 Atrasado/Não executado
 */
function corCelula(
  dia: Date,
  prevIni: string | null | undefined,
  prevFim: string | null | undefined,
  realIni: string | null | undefined,
  realFim: string | null | undefined,
  hoje: Date,
): { previsto: boolean; cor: string | null } {
  const ds = dateStr(dia);
  const inPrev = !!(prevIni && prevFim && ds >= prevIni && ds <= prevFim);
  const inReal = !!(realIni && realFim && ds >= realIni && ds <= realFim);
  const passou = dia.getTime() <= hoje.getTime();

  // 🟧 Antecipado — realizado ANTES do previsto começar
  if (inReal && prevIni && ds < prevIni) return { previsto: false, cor: "bg-orange-400" };
  // 🟨 Não programado — realizado fora da janela prevista (ou sem previsto)
  if (inReal && !inPrev) return { previsto: false, cor: "bg-yellow-400" };
  // 🟩 Realizado conforme previsto
  if (inReal && inPrev) return { previsto: true, cor: "bg-green-500" };
  // 🟥 Atrasado — dia previsto que já passou e não houve realização
  if (inPrev && passou && !realFim) return { previsto: true, cor: "bg-red-500" };
  // 🟦 Previsto futuro
  if (inPrev) return { previsto: true, cor: "bg-blue-500" };
  return { previsto: false, cor: null };
}

export default function ProgramacaoSemanalLotus(props: Props) {
  const {
    projetoId, revisaoId, companyId, nomeProjeto, nomeCliente, atividades, semanas, semanaIdx, onSemanaChange,
    gerenciadoraNome, gerenciadoraLogoUrl, clienteLogoUrl, engenheiroResponsavel,
  } = props;

  const utils = trpc.useUtils();
  const { toast } = useToast();
  const setRealDates = trpc.planejamento.setRealDates.useMutation({
    onSuccess: async () => {
      await utils.planejamento.listarAtividades.invalidate();
    },
    onError: (e) => toast({ variant: "destructive", title: "Erro ao salvar data", description: e.message }),
  });

  const semana = semanas[semanaIdx];
  const dias = useMemo(() => semana ? diasDaSemana(semana.ini) : [], [semana]);
  const periodoStr = useMemo(() => {
    if (dias.length === 0) return "";
    const ini = dias[0];
    const fim = dias[6];
    return `${String(ini.getDate()).padStart(2, "0")}/${String(ini.getMonth() + 1).padStart(2, "0")}/${ini.getFullYear()} a ${String(fim.getDate()).padStart(2, "0")}/${String(fim.getMonth() + 1).padStart(2, "0")}/${fim.getFullYear()}`;
  }, [dias]);
  const hoje = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);

  // Filtra atividades que tocam a semana (previsto OU real dentro do range)
  const semIniStr = dias.length ? dateStr(dias[0]) : "";
  const semFimStr = dias.length ? dateStr(dias[6]) : "";
  const atividadesDaSemana = useMemo(() => {
    if (!semIniStr) return [];
    return atividades.filter((a) => {
      if (a.isGrupo) return false; // só folhas com data
      const tocaPrev = a.dataInicio && a.dataFim && !(a.dataFim < semIniStr || a.dataInicio > semFimStr);
      const tocaReal = a.dataInicioReal && a.dataFimReal && !(a.dataFimReal < semIniStr || a.dataInicioReal > semFimStr);
      return tocaPrev || tocaReal;
    });
  }, [atividades, semIniStr, semFimStr]);

  // Agrupa por EAP-pai (nivel 1 = grupo principal, nivel 2 = subgrupo)
  // Mostra cabeçalhos de grupo na ordem hierárquica.
  type LinhaGrupo = { tipo: "grupo"; eap: string; nome: string; nivel: number };
  type LinhaAtiv = { tipo: "ativ"; ativ: Atividade };
  const linhas: (LinhaGrupo | LinhaAtiv)[] = useMemo(() => {
    const result: (LinhaGrupo | LinhaAtiv)[] = [];
    const gruposEmitidos = new Set<string>();
    const eapPrefixos = (eap: string): string[] => {
      const partes = eap.split(".");
      const out: string[] = [];
      for (let i = 1; i < partes.length; i++) out.push(partes.slice(0, i).join("."));
      return out;
    };
    const grupoMap = new Map<string, Atividade>();
    atividades.forEach((a) => {
      if (a.isGrupo && a.eapCodigo) grupoMap.set(a.eapCodigo, a);
    });
    atividadesDaSemana.forEach((a) => {
      const eap = a.eapCodigo || "";
      const prefixos = eapPrefixos(eap);
      prefixos.forEach((p) => {
        if (!gruposEmitidos.has(p)) {
          const g = grupoMap.get(p);
          if (g) {
            result.push({ tipo: "grupo", eap: p, nome: g.nome, nivel: p.split(".").length });
            gruposEmitidos.add(p);
          }
        }
      });
      result.push({ tipo: "ativ", ativ: a });
    });
    return result;
  }, [atividadesDaSemana, atividades]);

  const handleSetReal = (atividadeId: number, campo: "dataInicioReal" | "dataFimReal", valor: string) => {
    setRealDates.mutate({ atividadeId, companyId, [campo]: valor || null } as any);
  };

  const handleExportExcel = async () => {
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Programação Semanal");

      // Header (3 linhas)
      ws.mergeCells("A1:O1");
      const titleCell = ws.getCell("A1");
      titleCell.value = `PROGRAMAÇÃO SEMANAL - ${nomeProjeto.toUpperCase()} - ${periodoStr}`;
      titleCell.font = { bold: true, size: 14 };
      titleCell.alignment = { horizontal: "center", vertical: "middle" };
      ws.getRow(1).height = 28;

      // Linha de cabeçalhos
      const headerRow = 3;
      ws.getRow(headerRow).values = [
        "ITEM", "TAREFA",
        "Previsto Início", "Previsto Fim",
        "Real Início", "Real Fim",
        "RESPONSÁVEL",
        ...dias.map((d, i) => `${DIAS_ABREV[i]} ${fmtDiaMes(d)}`),
        "Status",
      ];
      const hr = ws.getRow(headerRow);
      hr.font = { bold: true };
      hr.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      hr.eachCell((c) => {
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
        c.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
      });

      // Dados
      const corHex: Record<string, string> = {
        "bg-blue-500":   "FF3B82F6",
        "bg-green-500":  "FF22C55E",
        "bg-yellow-400": "FFFACC15",
        "bg-orange-400": "FFFB923C",
        "bg-red-500":    "FFEF4444",
      };
      let r = headerRow + 1;
      linhas.forEach((l) => {
        if (l.tipo === "grupo") {
          ws.getRow(r).values = [l.eap, l.nome.toUpperCase()];
          ws.getRow(r).font = { bold: true, color: { argb: "FFB91C1C" } };
          ws.getRow(r).alignment = { vertical: "middle" };
        } else {
          const a = l.ativ;
          ws.getRow(r).values = [
            a.eapCodigo, a.nome,
            fmtBR(a.dataInicio), fmtBR(a.dataFim),
            fmtBR(a.dataInicioReal), fmtBR(a.dataFimReal),
            engenheiroResponsavel || "—",
            ...dias.map(() => ""),
            a.dataFimReal ? "Realizado" : (a.dataInicio && a.dataInicio <= dateStr(hoje) && !a.dataInicioReal ? "Atrasado" : "Previsto"),
          ];
          dias.forEach((d, idx) => {
            const cor = corCelula(d, a.dataInicio, a.dataFim, a.dataInicioReal, a.dataFimReal, hoje);
            if (cor.cor) {
              const cell = ws.getCell(r, 8 + idx);
              cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: corHex[cor.cor] || "FF999999" } };
            }
          });
        }
        ws.getRow(r).eachCell({ includeEmpty: true }, (c) => {
          c.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
        });
        r++;
      });

      // Larguras
      ws.getColumn(1).width = 8;
      ws.getColumn(2).width = 50;
      [3, 4, 5, 6].forEach((i) => (ws.getColumn(i).width = 12));
      ws.getColumn(7).width = 18;
      [8, 9, 10, 11, 12, 13, 14].forEach((i) => (ws.getColumn(i).width = 9));
      ws.getColumn(15).width = 12;

      // Legenda
      r += 2;
      ws.getCell(`A${r}`).value = "LEGENDA:";
      ws.getCell(`A${r}`).font = { bold: true };
      const legenda = [
        ["Previsto", "FF3B82F6"],
        ["Realizado", "FF22C55E"],
        ["Serviço Não Programado Executado", "FFFACC15"],
        ["Serviço Executado Antecipadamente", "FFFB923C"],
        ["Atrasado / Não Executado", "FFEF4444"],
      ];
      legenda.forEach(([txt, hex], i) => {
        const row = r + 1 + i;
        ws.getCell(`A${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: hex } };
        ws.getCell(`B${row}`).value = txt;
      });

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Programacao_Semanal_${nomeProjeto.replace(/\s+/g, "_")}_${periodoStr.replace(/[\/\s]/g, "")}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Excel exportado", description: a.download });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erro ao exportar Excel", description: e.message });
    }
  };

  const handleExportPDF = () => {
    // Usa o print do navegador — o CSS @media print abaixo já está otimizado.
    window.print();
  };

  if (!semana) {
    return (
      <div className="text-center py-12 text-slate-400 text-sm">
        Nenhuma semana disponível. Importe um cronograma primeiro.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Toolbar (oculta no print) */}
      <div className="flex items-center justify-between flex-wrap gap-3 print:hidden">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => onSemanaChange(Math.max(0, semanaIdx - 1))} disabled={semanaIdx === 0}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-semibold text-slate-700">
            Semana {semana.numero} — {periodoStr}
          </span>
          <Button variant="outline" size="sm" onClick={() => onSemanaChange(Math.min(semanas.length - 1, semanaIdx + 1))} disabled={semanaIdx >= semanas.length - 1}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportExcel} disabled={setRealDates.isPending}>
            <FileSpreadsheet className="h-4 w-4 mr-1.5" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPDF}>
            <Printer className="h-4 w-4 mr-1.5" /> PDF / Imprimir
          </Button>
        </div>
      </div>

      {/* Folha imprimível (modelo LOTUS) */}
      <div id="lotus-print-area" className="bg-white border border-slate-300 rounded-md overflow-hidden print:border-0 print:rounded-none">
        {/* Cabeçalho com logos (altura fixa pra evitar que imagens grandes estiquem o container) */}
        <div className="flex items-center border-b-2 border-slate-800 h-[72px]">
          <div className="flex-1 flex items-center justify-center px-4 h-full">
            <div className="text-center">
              <div className="text-[15px] font-bold tracking-tight text-slate-900 uppercase">
                Programação Semanal — {nomeProjeto}
              </div>
              <div className="text-[12px] text-slate-700 mt-0.5">{periodoStr}</div>
              {nomeCliente && <div className="text-[11px] text-slate-500 mt-0.5">Cliente: {nomeCliente}</div>}
            </div>
          </div>
          <div className="flex items-center gap-4 px-4 h-full border-l border-slate-300 bg-slate-50">
            {gerenciadoraLogoUrl ? (
              <img src={gerenciadoraLogoUrl} alt={gerenciadoraNome || "Gerenciadora"} className="max-h-10 max-w-[110px] w-auto h-auto object-contain" />
            ) : gerenciadoraNome ? (
              <div className="text-[10px] font-semibold text-slate-600 px-2 py-1 border border-dashed border-slate-300 rounded">{gerenciadoraNome}</div>
            ) : null}
            {clienteLogoUrl && <img src={clienteLogoUrl} alt={nomeCliente} className="max-h-10 max-w-[110px] w-auto h-auto object-contain" />}
          </div>
        </div>

        {/* Tabela */}
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-400">
                <th rowSpan={2} className="border border-slate-300 px-1 py-1 text-center font-bold w-12">ITEM</th>
                <th rowSpan={2} className="border border-slate-300 px-2 py-1 text-left font-bold min-w-[280px]">TAREFA</th>
                <th colSpan={2} className="border border-slate-300 px-1 py-1 text-center font-bold">DATA</th>
                <th colSpan={2} className="border border-slate-300 px-1 py-1 text-center font-bold">Real</th>
                <th rowSpan={2} className="border border-slate-300 px-1 py-1 text-center font-bold w-28">RESPONSÁVEL</th>
                <th colSpan={7} className="border border-slate-300 px-1 py-1 text-center font-bold">PERÍODO: {periodoStr}</th>
              </tr>
              <tr className="bg-slate-50 border-b border-slate-400">
                <th className="border border-slate-300 px-1 py-1 text-center font-semibold w-16">Início</th>
                <th className="border border-slate-300 px-1 py-1 text-center font-semibold w-16">Fim</th>
                <th className="border border-slate-300 px-1 py-1 text-center font-semibold w-16">Início</th>
                <th className="border border-slate-300 px-1 py-1 text-center font-semibold w-16">Fim</th>
                {dias.map((d, i) => (
                  <th key={i} className="border border-slate-300 px-0.5 py-1 text-center font-semibold w-[60px]">
                    <div className="text-[9px]">{DIAS_ABREV[i]}</div>
                    <div className="text-[9px] text-slate-500">{fmtDiaMes(d)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.length === 0 && (
                <tr>
                  <td colSpan={14} className="text-center py-8 text-slate-400 text-xs">
                    Nenhuma atividade nesta semana.
                  </td>
                </tr>
              )}
              {linhas.map((l, i) => {
                if (l.tipo === "grupo") {
                  return (
                    <tr key={`g-${l.eap}-${i}`} className="bg-slate-50">
                      <td className="border border-slate-300 px-1 py-1 font-bold text-red-700">{l.eap}</td>
                      <td colSpan={13} className="border border-slate-300 px-2 py-1 font-bold text-red-700 uppercase">{l.nome}</td>
                    </tr>
                  );
                }
                const a = l.ativ;
                return (
                  <tr key={`a-${a.id}`} className="hover:bg-blue-50/40">
                    <td className="border border-slate-300 px-1 py-1 text-center text-slate-700">{a.eapCodigo}</td>
                    <td className="border border-slate-300 px-2 py-1 text-slate-800">{a.nome}</td>
                    <td className="border border-slate-300 px-1 py-1 text-center text-slate-700 whitespace-nowrap">
                      {a.dataInicio ? fmtBR(a.dataInicio).slice(0, 5) + "-" + fmtBR(a.dataInicio).slice(8) : "—"}
                    </td>
                    <td className="border border-slate-300 px-1 py-1 text-center text-slate-700 whitespace-nowrap">
                      {a.dataFim ? fmtBR(a.dataFim).slice(0, 5) + "-" + fmtBR(a.dataFim).slice(8) : "—"}
                    </td>
                    <td className="border border-slate-300 px-0.5 py-0.5 text-center print:px-1">
                      <Input
                        type="date"
                        value={a.dataInicioReal || ""}
                        onChange={(e) => handleSetReal(a.id, "dataInicioReal", e.target.value)}
                        className="h-6 text-[10px] px-1 border-slate-200 print:hidden"
                        disabled={setRealDates.isPending}
                      />
                      <span className="hidden print:inline text-slate-700">{fmtBR(a.dataInicioReal).slice(0, 5)}</span>
                    </td>
                    <td className="border border-slate-300 px-0.5 py-0.5 text-center print:px-1">
                      <Input
                        type="date"
                        value={a.dataFimReal || ""}
                        onChange={(e) => handleSetReal(a.id, "dataFimReal", e.target.value)}
                        className="h-6 text-[10px] px-1 border-slate-200 print:hidden"
                        disabled={setRealDates.isPending}
                      />
                      <span className="hidden print:inline text-slate-700">{fmtBR(a.dataFimReal).slice(0, 5)}</span>
                    </td>
                    <td className="border border-slate-300 px-1 py-1 text-center text-slate-700 text-[10px] uppercase">
                      {engenheiroResponsavel || "—"}
                    </td>
                    {dias.map((d, idx) => {
                      const c = corCelula(d, a.dataInicio, a.dataFim, a.dataInicioReal, a.dataFimReal, hoje);
                      return (
                        <td key={idx} className="border border-slate-300 p-0 h-6 align-middle">
                          {c.cor && <div className={`${c.cor} h-3 mx-0.5 my-1.5 rounded-sm`} />}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Legenda */}
        <div className="border-t border-slate-300 px-3 py-2 bg-white">
          <div className="text-[10px] font-bold text-slate-700 mb-1.5">LEGENDA:</div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[10px] text-slate-700">
            <div className="flex items-center gap-1.5"><div className="w-5 h-3 bg-blue-500 rounded-sm" />Previsto</div>
            <div className="flex items-center gap-1.5"><div className="w-5 h-3 bg-green-500 rounded-sm" />Realizado</div>
            <div className="flex items-center gap-1.5"><div className="w-5 h-3 bg-yellow-400 rounded-sm" />Serviço não programado executado</div>
            <div className="flex items-center gap-1.5"><div className="w-5 h-3 bg-orange-400 rounded-sm" />Serviço executado antecipadamente</div>
            <div className="flex items-center gap-1.5"><div className="w-5 h-3 bg-red-500 rounded-sm" />Atrasado / não executado</div>
          </div>
          {engenheiroResponsavel && (
            <div className="text-[10px] text-slate-500 mt-2">
              Engenheiro Responsável: <span className="font-semibold text-slate-700">{engenheiroResponsavel}</span>
            </div>
          )}
        </div>
      </div>

      {setRealDates.isPending && (
        <div className="flex items-center gap-2 text-xs text-slate-500 print:hidden">
          <Loader2 className="h-3 w-3 animate-spin" /> Salvando data...
        </div>
      )}

      <style>{`
        @media print {
          body * { visibility: hidden; }
          #lotus-print-area, #lotus-print-area * { visibility: visible; }
          #lotus-print-area { position: absolute; left: 0; top: 0; width: 100%; }
          @page { size: A3 landscape; margin: 8mm; }
        }
      `}</style>
    </div>
  );
}
