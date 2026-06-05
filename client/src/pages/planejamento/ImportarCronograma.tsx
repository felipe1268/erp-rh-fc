import React, { useCallback, useRef, useState, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Upload, FileText, X, CheckCircle2, AlertTriangle, Loader2,
  Link2, ChevronDown, ChevronRight, Info,
} from "lucide-react";

const n = (v: any) => parseFloat(v || "0") || 0;

// ── Tipos ─────────────────────────────────────────────────────────────────────
export interface TarefaImportada {
  wbs:              string;
  // Rev. 1829 — UID nativo do MS Project (campo <UID> de cada <Task> no XML).
  // Identidade ESTÁVEL entre revisões: preservado pelo MSP em rename/move.
  // Backend usa como 1ª chave de matching (eliminou fallback por nome).
  // Vazio em arquivos XLSX (formato não traz UID) — backend cai pra eapCodigo.
  mspUid:           string;
  nome:             string;
  nivel:            number;
  inicio:           string;
  fim:              string;
  durDias:          number;
  pred:             string;
  recurso:          string;
  isGrupo:          boolean;
  isMarco:          boolean;
  // Rev. 1786 — Atividade indireta (Level of Effort): horas/recursos de apoio
  // que duram quase a obra inteira (ex.: Administração de Obra, Mob/Desmob,
  // Vigilância). NÃO compõem o caminho crítico (PMBOK §6.4.2 LoE / DCMA #6).
  // Pré-marcada por heurística no import (duração ≥90% do projeto) e
  // confirmada pelo usuário no checkbox da tabela de preview.
  isIndireta?:      boolean;
  // pós-vinculação
  eapCodigo:        string;
  pesoFin:          number;
  // progresso importado do arquivo
  percentConcluido: number;
  // Rev. 1670 — Snapshot por atividade lido direto do XML MSP:
  // previstoMsp = Texto10 (FieldID 188743750, %PREVISTO 4 casas, calculado pelo Project)
  // realizadoMsp = Texto7 (FieldID 188743747, %Reali AUX, calculado pelo Project)
  // Quando ausentes (XLSX legado, XML antigo), ficam undefined → ERP cai no
  // fallback dinâmico (cálculo JS via du(envelope ∩ até cutoff)).
  previstoMsp?:     number;
  realizadoMsp?:    number;
  // Rev. 2533 — Caminho B: BaselineStart/BaselineFinish da BASELINE 0 do MSP
  // (tag <Baseline Number="0"><Start>/<Finish>). Usado pelo server pra expandir
  // o PREVISTO semana-a-semana pela fórmula nativa do MSP
  // Int(((semana − BL_Start)/(BL_Finish − BL_Start))*100). Quando ausente
  // (atividades sem baseline salva no MSP), o ERP cai no Start/Finish vigente.
  baselineStart?:   string;
  baselineFinish?:  string;
  // Rev. 2617 — baseline COM HORA (ISO bruto do XML, ex.: "2026-06-01T07:00:00").
  // O server usa isto (não a versão date-only) p/ o motor minuto-a-minuto.
  baselineStartTs?:  string;
  baselineFinishTs?: string;
  // Rev. 2631 — TRUE só quando uma Linha de Base 0 REAL foi encontrada no XML
  // (tag <Baseline Number=0> com Start/Finish válidos, NÃO "NA"/2049). Quando
  // false, baselineStart/Ts caíram no fallback (Start/Finish vigente) e o
  // %Previsto NÃO bate com o MSP — usado pela validação pré-upload.
  baselineReal?:     boolean;
}

// ── Utilitários de parse ──────────────────────────────────────────────────────
export function parseDuration(dur: string): number {
  if (!dur) return 0;
  const h = dur.match(/(\d+)H/);
  const d = dur.match(/(\d+)D/);
  const hours = h ? parseInt(h[1]) : 0;
  const days  = d ? parseInt(d[1]) : 0;
  return days + Math.ceil(hours / 8);
}

// Converte serial do Excel para ISO (ex: 45679 → "2025-01-26")
function excelSerialToISO(serial: number): string {
  const epoch = new Date(Date.UTC(1899, 11, 30));
  const ms    = serial * 86400000;
  const date  = new Date(epoch.getTime() + ms);
  return date.toISOString().substring(0, 10);
}

// Converte qualquer representação de data → "YYYY-MM-DD" ou ""
export function fmtDate(raw: any): string {
  if (raw == null || raw === "") return "";

  // Já é um Date (cellDates: true)
  if (raw instanceof Date) {
    if (isNaN(raw.getTime())) return "";
    return raw.toISOString().substring(0, 10);
  }

  const s = String(raw).trim();

  // Serial numérico do Excel (> 1000 para evitar confundir com dias)
  if (/^\d+(\.\d+)?$/.test(s) && Number(s) > 1000) {
    return excelSerialToISO(Math.floor(Number(s)));
  }

  // YYYY-MM-DD
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // DD/MM/YYYY ou DD-MM-YYYY (formato brasileiro)
  const br = s.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;

  // MM/DD/YYYY (formato americano)
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (us) {
    const [, m, d, y] = us;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // Tenta parse nativo como último recurso
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().substring(0, 10);

  return "";
}

// Valida se uma data ISO é plausível para cronograma (entre 2000 e 2100)
function isDateOk(iso: string): boolean {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const y = parseInt(iso.substring(0, 4));
  return y >= 2000 && y <= 2100;
}

// Formata ISO → dd/mm/yyyy para exibição
function fmtBRLocal(iso: string): string {
  if (!iso) return "—";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

// ── Parser MS Project XML — calendário + StatusDate (Rev. 1642) ──────────────
// O MS Project armazena, na raiz do <Project>:
//   - <StatusDate>YYYY-MM-DDTHH:mm:ss</StatusDate>  → cutoff oficial (PMBOK/EVM)
//   - <Calendars>...</Calendars>                    → dias úteis + feriados
// Capturamos os dois pra que o ERP reproduza % PREVISTO **exatamente** como
// o MS Project (paridade 100% — regra de ouro Portal × Planejamento).
export interface CalendarioImportado {
  weekDays: boolean[];                                          // dom..sab → working?
  exceptions: Array<{ from: string; to: string; working: boolean }>;
  // Rev. 2617 — Caminho B: intervalos de trabalho POR DIA DA SEMANA em MINUTOS
  // (idx 0=dom..6=sab; cada dia = lista de [fromMin,toMin]). Permite ao motor
  // do server reproduzir a aritmética minuto-a-minuto do MSP (Sex mais curta).
  weekDayIntervals?: number[][][];
}
export function parseMSProjectCalendar(doc: Document): CalendarioImportado | null {
  const cals = Array.from(doc.querySelectorAll("Calendars > Calendar"));
  if (!cals.length) return null;
  // Heurística: prefere o calendário do projeto (CalendarUID na raiz);
  // senão o que tem IsBaseCalendar=1; senão o primeiro.
  // Rev. 1646.3 — usa querySelector simples (sem combinator `Project >`),
  // que falhava com o namespace default do XML do MSP. O primeiro
  // <CalendarUID> em ordem de documento é o da raiz <Project>. Caso
  // REVTE-CIVIL: CalendarUID=6 ("Padrão Guaratinguetá") em vez do fallback
  // UID=1 ("Padrão") — feriados diferentes, denominador correto.
  const projCalUid = doc.querySelector("CalendarUID")?.textContent?.trim();
  const cal =
    cals.find(c => c.querySelector(":scope > UID")?.textContent?.trim() === projCalUid) ||
    cals.find(c => c.querySelector(":scope > IsBaseCalendar")?.textContent?.trim() === "1") ||
    cals[0];

  // MS Project usa DayType: 1=Domingo, 2=Segunda, ..., 7=Sábado; 0=Exceção (com TimePeriod).
  const weekDays = [false, false, false, false, false, false, false]; // dom..sab
  // Rev. 2617 — intervalos de trabalho por dia (idx 0=dom..6=sab) em MINUTOS
  // desde a meia-noite, lidos de <WorkingTimes><WorkingTime><FromTime>/<ToTime>.
  const weekDayIntervals: number[][][] = [[], [], [], [], [], [], []];
  const hhmmToMin = (s: string | null | undefined): number | null => {
    const m = (s ?? "").trim().match(/^(\d{1,2}):(\d{2})/);
    if (!m) return null;
    let v = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    // MSP grava o fim do expediente noturno como "00:00:00" = fim do dia (1440).
    if (v === 0 && (s ?? "").trim().startsWith("00:")) v = 1440;
    return v;
  };
  const exceptions: Array<{ from: string; to: string; working: boolean }> = [];
  const wds = Array.from(cal.querySelectorAll(":scope > WeekDays > WeekDay"));
  for (const wd of wds) {
    const dayType = parseInt(wd.querySelector(":scope > DayType")?.textContent ?? "0");
    const working = wd.querySelector(":scope > DayWorking")?.textContent?.trim() === "1";
    if (dayType >= 1 && dayType <= 7) {
      // 1=Dom → idx 0, 7=Sab → idx 6
      weekDays[dayType - 1] = working;
      if (working) {
        const wts = Array.from(wd.querySelectorAll(":scope > WorkingTimes > WorkingTime"));
        for (const wt of wts) {
          const f = hhmmToMin(wt.querySelector(":scope > FromTime")?.textContent);
          const t = hhmmToMin(wt.querySelector(":scope > ToTime")?.textContent);
          if (f != null && t != null && t > f) weekDayIntervals[dayType - 1].push([f, t]);
        }
      }
    } else if (dayType === 0) {
      const tp = wd.querySelector(":scope > TimePeriod");
      const from = tp?.querySelector(":scope > FromDate")?.textContent?.slice(0, 10) ?? "";
      const to   = tp?.querySelector(":scope > ToDate")?.textContent?.slice(0, 10) ?? from;
      if (from) exceptions.push({ from, to: to || from, working });
    }
  }
  // Rev. 1646.4 — também lê <Exceptions><Exception> (formato moderno do MSP),
  // que armazena feriados RECORRENTES com Type=2 (anual) + Month (0-indexed)
  // + MonthDay. As entradas legacy <DayType>0</DayType> só cobrem 2025-2026
  // explicitamente; as recorrentes precisam ser EXPANDIDAS para todos os anos
  // do escopo do projeto. Sem isso, o denominador de dias úteis vem inflado
  // (caso REVTE-CIVIL: 291 em vez de 284 → 1,37% em vez de 1,41% do MSP).
  const exs = Array.from(cal.querySelectorAll(":scope > Exceptions > Exception"));
  for (const ex of exs) {
    const exWorking = ex.querySelector(":scope > DayWorking")?.textContent?.trim() === "1";
    const type = parseInt(ex.querySelector(":scope > Type")?.textContent ?? "0");
    const tp = ex.querySelector(":scope > TimePeriod");
    const fromIso = tp?.querySelector(":scope > FromDate")?.textContent?.slice(0, 10) ?? "";
    const toIso   = tp?.querySelector(":scope > ToDate")?.textContent?.slice(0, 10) ?? fromIso;
    if (!fromIso) continue;
    if (type === 2) {
      // Anual: expande de 2020 a 2050 usando Month (0-indexed) + MonthDay.
      const monthRaw = ex.querySelector(":scope > Month")?.textContent;
      const monthDay = parseInt(ex.querySelector(":scope > MonthDay")?.textContent ?? "0");
      if (monthRaw !== null && monthDay >= 1 && monthDay <= 31) {
        const month0 = parseInt(monthRaw); // 0-indexed
        for (let y = 2020; y <= 2050; y++) {
          const m = String(month0 + 1).padStart(2, "0");
          const d = String(monthDay).padStart(2, "0");
          const iso = `${y}-${m}-${d}`;
          exceptions.push({ from: iso, to: iso, working: exWorking });
        }
      } else {
        // Sem Month/MonthDay legíveis — usa só a janela explícita.
        exceptions.push({ from: fromIso, to: toIso || fromIso, working: exWorking });
      }
    } else {
      // Tipo 1 (única ocorrência) ou desconhecido — usa janela explícita.
      exceptions.push({ from: fromIso, to: toIso || fromIso, working: exWorking });
    }
  }
  // Sanidade: se nada veio marcado como working, devolve null (calendário inválido).
  if (!weekDays.some(Boolean)) return null;
  // Rev. 2617 — só envia weekDayIntervals se algum dia tiver intervalo (XML
  // completo); senão deixa undefined → server cai no motor day-granular legado.
  const temIntervalos = weekDayIntervals.some(d => d.length > 0);
  return { weekDays, exceptions, weekDayIntervals: temIntervalos ? weekDayIntervals : undefined };
}
export function parseMSProjectStatusDate(doc: Document): string | null {
  const raw = doc.querySelector("Project > StatusDate")?.textContent?.trim();
  if (!raw) return null;
  // Formato MSP: "2026-05-07T17:00:00" — pegamos só YYYY-MM-DD.
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}
/** Rev. 1643 — devolve o StatusDate **com hora** (ISO completo). MSP usa
 *  ex. "2026-05-08T08:00:00" (início do expediente da sexta) e a hora
 *  altera o % PREVISTO em ~5pp por atividade. */
export function parseMSProjectStatusDateIso(doc: Document): string | null {
  const raw = doc.querySelector("Project > StatusDate")?.textContent?.trim();
  if (!raw) return null;
  const m = raw.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/);
  return m ? m[1] : null;
}

// ── Feriados móveis nacionais (Rev. 2632 · revisado Rev. 2645) ───────────────
// Carnaval, Sexta-feira Santa e Corpus Christi dependem da PÁSCOA (não têm data
// fixa). Calculamos a Páscoa (algoritmo de Meeus/Butcher) e derivamos os móveis.
// IMPORTANTE (Rev. 2645): esta lista serve APENAS para DETECTAR ausências no
// calendário do XML e AVISAR o engenheiro — NÃO é mais injetada no cálculo. O
// calendário do MS Project é verdade absoluta para o "% Previsto" (Texto10);
// injetar móveis que o MSP não tem quebrava a paridade (caso PLN_816 R04: injetar
// Corpus Christi 04/06/2026 baixava a curva da raiz de 2/9/15/20/26 p/ 2/8/14/20/25).
function feriadosMoveisBR(year: number): Array<{ iso: string; nome: string }> {
  // Páscoa (algoritmo "Anonymous Gregorian" — Meeus/Jones/Butcher).
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=Março, 4=Abril
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  const pascoa = new Date(Date.UTC(year, month - 1, day));
  const off = (dias: number): string => {
    const dt = new Date(pascoa.getTime());
    dt.setUTCDate(dt.getUTCDate() + dias);
    return dt.toISOString().slice(0, 10);
  };
  return [
    { iso: off(-48), nome: "Carnaval (segunda-feira)" },
    { iso: off(-47), nome: "Carnaval (terça-feira)" },
    { iso: off(-2),  nome: "Sexta-feira Santa" },
    { iso: off(60),  nome: "Corpus Christi" },
  ];
}

/** Rev. 2645 — DETECTA (sem mutar) os feriados móveis nacionais (dependentes da
 *  Páscoa) que NÃO constam no calendário do XML, por ano do escopo do projeto.
 *  ANTES (Rev. 2632) o ERP INJETAVA essas datas em `cal.exceptions` — mas isso
 *  QUEBRAVA a paridade com a coluna "% PREVISTO" (Texto10) do MS Project: o MSP
 *  calcula Texto10/Número6/Número7 com o calendário DELE (que, no template LOTUS
 *  da FC, NÃO inclui Corpus Christi etc.), então injetar o feriado encurtava a
 *  curva em ~1% (validado empíricamente com os 5 XMLs reais PLN_816 R04: COM
 *  Corpus Christi a raiz dava 2/8/14/20/25; SEM, bate o Texto10 exato 2/9/15/20/26).
 *  Agora o calendário do XML é VERDADE ABSOLUTA: só REPORTAMOS as ausências como
 *  informação, sem alterar o cálculo do % Previsto. */
export function detectarFeriadosMoveisAusentes(
  cal: CalendarioImportado | null,
  anoInicio: number | null,
  anoFim: number | null,
): Array<{ iso: string; nome: string }> {
  if (!cal) return [];
  const hoje = new Date().getUTCFullYear();
  const y0 = (anoInicio != null && Number.isFinite(anoInicio)) ? anoInicio : hoje;
  const y1 = (anoFim != null && Number.isFinite(anoFim) && anoFim >= y0) ? anoFim : y0;
  // Conjunto de datas JÁ marcadas como NÃO-úteis (folga) nas exceções existentes
  // — expande intervalos from..to (normalmente from==to) para não duplicar.
  const jaFolga = new Set<string>();
  for (const ex of cal.exceptions) {
    if (ex.working) continue;
    let cur = ex.from;
    let guard = 0;
    while (cur <= ex.to && guard < 4000) {
      jaFolga.add(cur);
      const nd = new Date(cur + "T00:00:00Z");
      nd.setUTCDate(nd.getUTCDate() + 1);
      cur = nd.toISOString().slice(0, 10);
      guard++;
    }
  }
  const ausentes: Array<{ iso: string; nome: string }> = [];
  for (let y = y0; y <= y1; y++) {
    for (const fm of feriadosMoveisBR(y)) {
      if (jaFolga.has(fm.iso)) continue;
      // Só reporta se a data cai em dia que o calendário considera ÚTIL — caso
      // contrário (fim de semana já não-útil) seria inócuo e poluiria o aviso.
      const dow = new Date(fm.iso + "T00:00:00Z").getUTCDay();
      if (!cal.weekDays?.[dow]) continue;
      // Rev. 2645 — NÃO mutamos mais `cal.exceptions`: o calendário do XML é a
      // verdade absoluta para o % Previsto. Apenas registramos a ausência.
      ausentes.push(fm);
    }
  }
  return ausentes;
}

/** Versão completa: tarefas + metadados (calendário + StatusDate).
 *  Rev. 1644 — incluímos no calendarioJson os parâmetros raiz do XML do MSP
 *  (`DefaultStartTime`, `DefaultFinishTime`, `MinutesPerDay`) usados pela
 *  fórmula `ProjDateDiff` — regra de ouro: leitura plena do MS Project.
 *  Rev. 2647 — incluímos também o snapshot do "% PREVISTO" calculado pelo
 *  próprio MSP, lido SEMPRE da coluna FIXA Texto10 (FieldID 188743750) na
 *  tarefa raiz (sem alias, sem fallback Texto6/Texto11). Quando o ERP exibe
 *  esse projeto no cutoff oficial (= StatusDate do XML), usa esse número
 *  diretamente — paridade exata, sem replicar `ProjDateDiff` interno. */
// ── Validação de integridade pré-upload (Rev. 2631) ───────────────────────────
// Analisa o XML ANTES de subir. Se faltar dado ESSENCIAL pro %Previsto bater
// minuto-a-minuto com o MS Project, devolve "bloqueios" (impedem o upload).
// "avisos" não bloqueiam, mas alertam o engenheiro. A régua é a mesma do motor
// real (shared/diasUteis): precisa de Linha de Base 0 COM HORA em todas as
// folhas + calendário com jornada de trabalho (weekDayIntervals). Sem isso o
// server cai num fallback aproximado que diverge do Project.
export interface IntegridadeMSP { bloqueios: string[]; avisos: string[] }
function temHora(ts?: string): boolean {
  if (!ts) return false;
  const m = /T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(ts);
  if (!m) return false;
  // date-only exportado como T00:00:00 não conta como "hora de trabalho".
  return !(m[1] === "00" && m[2] === "00" && (m[3] ?? "00") === "00");
}
export function analisarIntegridadeMSP(
  tarefas: TarefaImportada[],
  cal: CalendarioImportado | null,
  statusDate: string | null,
): IntegridadeMSP {
  const bloqueios: string[] = [];
  const avisos: string[] = [];

  // Folhas (atividades reais) — grupos/resumos não entram no cálculo de span.
  const folhas = tarefas.filter(t => !t.isGrupo);
  const totalFolhas = folhas.length;

  // 1) Calendário com jornada de trabalho (weekDayIntervals). A régua é EXATAMENTE
  //    a do gate do motor do server (`temIntervalosUteis` em shared/diasUteis):
  //    NÃO basta "algum dia" ter intervalo — TODO dia útil (`weekDays[i]===true`)
  //    precisa de ≥1 intervalo, senão o motor minuto-a-minuto subcontaria minutos
  //    nesse dia e o server cairia no fallback day-granular (que diverge do MSP).
  //    Replicar a regra aqui evita falso "selo verde" com XML de jornada parcial.
  const temJornada = !!cal?.weekDayIntervals
    && cal.weekDayIntervals.length === 7
    && (() => {
      let algum = false;
      for (let i = 0; i < 7; i++) {
        const tem = Array.isArray(cal.weekDayIntervals![i]) && cal.weekDayIntervals![i].length > 0;
        if (cal.weekDays?.[i]) {
          if (!tem) return false;
          algum = true;
        }
      }
      return algum;
    })();
  if (!temJornada) {
    bloqueios.push(
      "O calendário do MS Project veio SEM os horários de trabalho (jornada) completos " +
      "— é preciso que TODO dia útil tenha horário definido. " +
      "Sem a jornada completa, o cálculo do % Previsto não bate com o Project. " +
      "Reexporte o XML incluindo o calendário base completo (Arquivo ▸ Salvar Como ▸ XML do Project, com o calendário do projeto)."
    );
  }

  // 2) Linha de Base (Baseline 0). NÃO exigimos baseline em TODAS as folhas:
  //    a régua da raiz (Rev. 2630) usa o ENVELOPE do projeto (min início / max
  //    término da baseline) — algumas folhas sem baseline (que caem no fallback
  //    de datas vigentes) não distorcem a curva da raiz, desde que exista uma
  //    baseline real com hora cobrindo o projeto. Validado no PLN_816 R04:
  //    62/1105 folhas sem baseline e a curva raiz ainda bate EXATO (3/6/10/14/18).
  //    Por isso: SEM baseline nenhuma → BLOQUEIA; baseline date-only → BLOQUEIA;
  //    baseline parcial (algumas folhas sem) → AVISO (não bloqueia).
  const comBaselineReal = folhas.filter(t => t.baselineReal).length;
  // Hora EXIGIDA nos DOIS lados (Start E Finish). O motor parseia ts sem hora como
  // 00:00, o que distorce o envelope/fração; basta um lado date-only para divergir
  // do MSP. `comHoraCompleta` = baseline real com hora em início E término.
  const comHoraCompleta = folhas.filter(t => t.baselineReal && temHora(t.baselineStartTs) && temHora(t.baselineFinishTs)).length;
  // baselines reais que têm hora só de um lado (ou nenhum) → date-only/mista.
  const baselineDateOnly = folhas.filter(t => t.baselineReal && !(temHora(t.baselineStartTs) && temHora(t.baselineFinishTs)));
  const semBaseline = folhas.filter(t => !t.baselineReal);
  if (totalFolhas === 0) {
    bloqueios.push("Nenhuma atividade (tarefa) foi encontrada no arquivo.");
  } else if (comBaselineReal === 0) {
    bloqueios.push(
      "Nenhuma atividade tem Linha de Base (Baseline) salva no MS Project. " +
      "Sem a Linha de Base não é possível calcular o % Previsto. " +
      "Defina a Linha de Base (Projeto ▸ Definir Linha de Base ▸ Linha de Base) e reexporte o XML."
    );
  } else if (comHoraCompleta === 0) {
    bloqueios.push(
      "A Linha de Base do MS Project veio SEM hora (somente data) no início e/ou término. " +
      "O cálculo minuto-a-minuto exige a hora dos DOIS lados (ex.: 07:00 → 16:00). " +
      "Reexporte o XML preservando as horas da Linha de Base (verifique a jornada do calendário e salve a baseline novamente)."
    );
  } else if (baselineDateOnly.length > 0) {
    const exemplos = baselineDateOnly.slice(0, 3).map(t => `"${(t.nome || "").slice(0, 32)}"`).join(", ");
    avisos.push(
      `${baselineDateOnly.length} de ${totalFolhas} atividades têm Linha de Base sem hora em um dos lados` +
      (exemplos ? ` (ex.: ${exemplos})` : "") + " — essas datas serão lidas como 00:00 e podem divergir do MSP nessas atividades. " +
      "O % Previsto da raiz continua correto se o início e o término do PROJETO tiverem hora."
    );
  }
  if (totalFolhas > 0 && comBaselineReal > 0 && comHoraCompleta > 0 && semBaseline.length > 0) {
    const exemplos = semBaseline.slice(0, 3).map(t => `"${(t.nome || "").slice(0, 32)}"`).join(", ");
    avisos.push(
      `${semBaseline.length} de ${totalFolhas} atividades estão sem Linha de Base própria` +
      (exemplos ? ` (ex.: ${exemplos})` : "") + " — elas usarão as datas vigentes como aproximação. " +
      "O % Previsto da raiz continua correto desde que o início e o término do projeto tenham Linha de Base."
    );
  }

  // ── Avisos (não bloqueiam) ──
  if (!statusDate) {
    avisos.push(
      "O arquivo não tem Data de Status (Status Date) definida. " +
      "Para o Avanço Semanal cair na semana certa, defina a Data de Status no MS Project (Projeto ▸ Informações do Projeto ▸ Data de Status)."
    );
  }
  if (!cal?.exceptions?.length) {
    avisos.push(
      "O calendário não tem feriados cadastrados (exceções). " +
      "Confira se os feriados do período estão no calendário do Project — eles afetam o cálculo do % Previsto."
    );
  }

  return { bloqueios, avisos };
}

// Rev. 2647 — FieldID ÚNICO e FIXO da coluna "% PREVISTO" do MS Project.
// Por decisão do dono (padronização): TODOS os projetos, presentes e futuros,
// leem SEMPRE esta MESMA coluna (Texto10 = 188743750), validada como verdade
// absoluta vs a coluna "% PREVISTO" da tela do Project. SEM detecção por alias
// e SEM fallback para Texto6/Texto11 — se faltar Texto10, o valor fica null e a
// tela mostra "—" (jamais "chuta" outra coluna, que dava número divergente).
const FID_PREVISTO_TEXTO10 = "188743750";

export function parseMSProjectFull(text: string): {
  tarefas:            TarefaImportada[];
  statusDate:         string | null;
  statusDateIso:      string | null;
  calendarioJson:     string | null;
  projetoStart:       string | null;
  projetoFinish:      string | null;
  previstoMspRaiz:    number | null;
  realizadoMspRaiz:   number | null;
  integridade:        IntegridadeMSP;
} {
  const doc  = new DOMParser().parseFromString(text, "text/xml");
  const err  = doc.querySelector("parsererror");
  if (err) throw new Error("XML inválido");
  const tarefas       = parseMSProjectTasksFromDoc(doc);
  const statusDate    = parseMSProjectStatusDate(doc);
  const statusDateIso = parseMSProjectStatusDateIso(doc);
  const cal           = parseMSProjectCalendar(doc);
  // Rev. 1646.2 — extrai Start/Finish da linha-resumo raiz (UID=0, OutlineLevel=0)
  // do MSP. Esses valores são a fonte oficial do "envelope" do projeto, e devem
  // ser usados como base do "%PREVISTO" da raiz no ERP/Portal (paridade Texto10).
  // Sem isso, min(folhas.dataInicio)/max(folhas.dataFim) podem inflar o total
  // (ex.: alguma folha terminando depois do root oficial → 292 ≠ 284 dias úteis).
  let projetoStart: string | null = null;
  let projetoFinish: string | null = null;
  // ──────────────────────────────────────────────────────────────────────────
  // REGRA DE OURO — Leitura de cronograma e avanço (Rev. 2427+).
  // VALE PRA TODAS AS OBRAS, presentes e futuras. NÃO ALTERAR sem aprovação.
  //
  //   • % PREVISTO  = Texto10 (FieldID 188743750) puro, lido do XML do MS Project.
  //                   FONTE ÚNICA E FIXA para TODOS os projetos (Rev. 2647). É o
  //                   "% PREVISTO" calculado pelo MSP via fórmula
  //                   Int(Num Dur(Prev)/PESO DUR(BL)*100 + 0.5) sobre a BASELINE.
  //                   Aparece na coluna "% PREVISTO" da tela do Project — paridade
  //                   exata. SEM detecção por alias e SEM fallback Texto6/Texto11:
  //                   se Texto10 faltar, o valor fica vazio (tela mostra "—"),
  //                   jamais lê outra coluna (Texto6 em templates LOTUS é lixo).
  //
  //   • % CONCLUÍDA = PercentComplete nativo do MSP. Aparece na coluna
  //                   "% concluída" da tela do Project — paridade exata.
  //                   Vale tanto pra raiz (UID=0) quanto pra cada atividade.
  //                   ZERO cálculo derivado (Texto7, AD/(AD+RD), Texto12,
  //                   PhysicalPercentComplete etc. ficaram fora — não são
  //                   o que o engenheiro vê na tela).
  //
  // Validação canônica feita no XML HOTEL DO PAPA (PLN_783_01_2026_R01 BL,
  // StatusDate 25/05/2026): raiz 79%/79%, 02 80%/75%, 02.10 75%/79%,
  // 02.19 19%/0%, 02.22 46%/23% — TODOS batendo XML × tela MSP.
  // ──────────────────────────────────────────────────────────────────────────
  let previstoMspRaiz: number | null = null;
  let realizadoMspRaiz: number | null = null;
  const taskEls = Array.from(doc.querySelectorAll("Task"));
  for (const t of taskEls) {
    const uid = t.querySelector("UID")?.textContent?.trim();
    if (uid === "0") {
      projetoStart  = t.querySelector("Start")?.textContent?.trim()?.slice(0, 10) || null;
      projetoFinish = t.querySelector("Finish")?.textContent?.trim()?.slice(0, 10) || null;
      const eaList = Array.from(t.querySelectorAll("ExtendedAttribute"));
      const valorPorFid: Record<string, number> = {};
      for (const ea of eaList) {
        const fid = ea.querySelector("FieldID")?.textContent?.trim() || "";
        const raw = ea.querySelector("Value")?.textContent?.trim() || "";
        if (!fid || !raw) continue;
        // Limpa "%" e espaços do Texto6 ("  2%") e converte vírgula decimal BR.
        const limpo = raw.replace(/%/g, "").replace(",", ".").trim();
        const num = parseFloat(limpo);
        if (Number.isFinite(num)) valorPorFid[fid] = num;
      }
      // Rev. 2647 — VERDADE ABSOLUTA = coluna "% PREVISTO" FIXA (Texto10) do MSP.
      // TODOS os projetos leem SEMPRE este mesmo FieldID. SEM alias, SEM fallback
      // Texto6/Texto11: se faltar Texto10, fica null → tela mostra "—".
      const previstoRaw = valorPorFid[FID_PREVISTO_TEXTO10] ?? null;
      previstoMspRaiz = previstoRaw != null && Number.isFinite(previstoRaw)
        ? Math.min(100, Math.max(0, previstoRaw))
        : null;
      // Rev. 2427 — REGRA DE OURO: % CONCLUÍDA = PercentComplete puro do MSP.
      // Substitui a heurística AD/(AD+RD) da Rev. 1675 — paridade absoluta
      // com a coluna "% concluída" do Project (ex.: HOTEL DO PAPA raiz = 79).
      const pcRaw = t.querySelector("PercentComplete")?.textContent?.trim() || "";
      const pcNum = parseFloat(pcRaw);
      if (Number.isFinite(pcNum)) realizadoMspRaiz = Math.min(100, Math.max(0, pcNum));
      break;
    }
  }
  // Usa querySelector simples (igual ao restante do parser que já lê StatusDate,
  // Calendars, etc. com sucesso). O combinator `Project >` falhava com namespace
  // default do MSP. querySelector retorna a primeira ocorrência em ordem de
  // documento — `<DefaultStartTime>` aparece no nó raiz `<Project>` antes de
  // qualquer ocorrência aninhada em calendários.
  const defaultStartTime  = doc.querySelector("DefaultStartTime")?.textContent?.trim() || null;
  const defaultFinishTime = doc.querySelector("DefaultFinishTime")?.textContent?.trim() || null;
  const minutesPerDayStr  = doc.querySelector("MinutesPerDay")?.textContent?.trim();
  const minutesPerDay     = minutesPerDayStr ? parseInt(minutesPerDayStr, 10) : null;
  // Rev. 2645 — O calendário do XML é VERDADE ABSOLUTA para o "% Previsto".
  // NÃO injetamos mais feriados móveis (a Rev. 2632 fazia isso e QUEBRAVA a
  // paridade com o Texto10 do MSP — caso PLN_816 R04: injetar Corpus Christi
  // 04/06 baixava a curva da raiz de 2/9/15/20/26 para 2/8/14/20/25, o ~1%
  // relatado). Apenas DETECTAMOS as ausências para um aviso informativo.
  const anoIni = projetoStart ? parseInt(projetoStart.slice(0, 4), 10)
               : statusDate ? parseInt(statusDate.slice(0, 4), 10) : null;
  const anoFim = projetoFinish ? parseInt(projetoFinish.slice(0, 4), 10) : anoIni;
  const feriadosMoveisAusentes = detectarFeriadosMoveisAusentes(cal, anoIni, anoFim);
  const calComConfig = cal ? {
    ...cal,
    defaultStartTime:  defaultStartTime  || "08:00:00",
    defaultFinishTime: defaultFinishTime || "17:00:00",
    minutesPerDay:     (Number.isFinite(minutesPerDay as number) && (minutesPerDay as number) > 0) ? minutesPerDay : 480,
    // Rev. 1646.4 — snapshot oficial do %PREVISTO calculado pelo MSP, válido
    // só no StatusDate do XML. Quando o ERP mostra esse projeto no cutoff
    // oficial (= statusDate) E o envelope do projeto continua intacto, usa
    // esse número direto — paridade exata. Senão cai no cálculo dinâmico
    // (proteção contra snapshot stale após edição manual de datas no ERP).
    previstoMspSnapshot:    previstoMspRaiz,
    statusDateSnapshot:     statusDate,
    envelopeStartSnapshot:  projetoStart,
    envelopeFinishSnapshot: projetoFinish,
    // Rev. 1675 — snapshot do %Realizado raiz (AD/(AD+RD)) com precisão MSP.
    realizadoMspSnapshot:   realizadoMspRaiz,
  } : null;
  const calendarioJson = calComConfig ? JSON.stringify(calComConfig) : null;
  // Rev. 2631 — analisa integridade ANTES de devolver (usa o `cal` cru, com
  // weekDayIntervals/exceptions, e as folhas já parseadas com baselineReal).
  const integridade = analisarIntegridadeMSP(tarefas, cal, statusDate);
  // Rev. 2645 — avisa o engenheiro quando o calendário do XML NÃO inclui feriados
  // móveis nacionais (vai PRIMEIRO na lista de avisos, em âmbar). NÃO os injeta:
  // o ERP replica EXATAMENTE o calendário do Project (= a coluna "% PREVISTO").
  if (feriadosMoveisAusentes.length) {
    const fmtBR = (iso: string) => { const [y, mo, d] = iso.split("-"); return `${d}/${mo}/${y}`; };
    integridade.avisos.unshift(
      `O calendário do MS Project não inclui ${feriadosMoveisAusentes.length} feriado(s) móvel(is) nacional(is): ` +
      feriadosMoveisAusentes.map(f => `${f.nome} (${fmtBR(f.iso)})`).join("; ") + ". " +
      "O ERP segue o calendário do Project EXATAMENTE (verdade absoluta), então essas datas foram tratadas como DIAS ÚTEIS — igual ao MS Project, " +
      "para que o \"% Previsto\" bata 100% com a coluna \"% PREVISTO\" (Texto10). " +
      "Se elas deveriam ser folga, cadastre-as no calendário do Project e reimporte o XML."
    );
  }
  return { tarefas, statusDate, statusDateIso, calendarioJson, projetoStart, projetoFinish, previstoMspRaiz, realizadoMspRaiz, integridade };
}

// ── Parser MS Project XML (compat — só tarefas) ──────────────────────────────
export function parseMSProjectXML(text: string): TarefaImportada[] {
  const doc  = new DOMParser().parseFromString(text, "text/xml");
  const err  = doc.querySelector("parsererror");
  if (err) throw new Error("XML inválido");
  return parseMSProjectTasksFromDoc(doc);
}

// Rev. 1822 — Lê SOMENTE o campo "Item" (Texto1, ExtendedAttribute
// FieldID=188743731) — o código que o engenheiro digita no MS Project.
// Sem fallback de WBS, sem invenção. User: "só quero que copie o número
// do item, não precisa inventar nada a mais". Atividades sem Item ficam
// com `eap_codigo` vazio (não casam com orçamento, ficam "Sem meta").
//
// Filhos diretos do <Task> (não `querySelectorAll`) pra evitar pegar
// Texto1 de Assignment aninhado.
function lerItemDaTask(task: Element): string {
  for (const child of Array.from(task.children)) {
    if (child.tagName !== "ExtendedAttribute") continue;
    const fid = child.querySelector("FieldID")?.textContent ?? "";
    if (fid !== "188743731") continue;
    const val = (child.querySelector("Value")?.textContent ?? "").trim();
    if (val) return val;
  }
  return "";
}

function parseMSProjectTasksFromDoc(doc: Document): TarefaImportada[] {
  const taskEls = Array.from(doc.querySelectorAll("Task"));

  // First pass: build UID → CÓDIGO map so we can resolve predecessor UIDs.
  // Rev. 1822: chave é o código resolvido (Item → fallback WBS em folhas).
  // Predecessores no MSP sempre apontam pra folhas reais (sumários não são
  // predecessores), então o fallback WBS é seguro aqui.
  const uidToWbs = new Map<string, string>();
  for (const task of taskEls) {
    let uid = "";
    for (const child of Array.from(task.children)) {
      if (child.tagName === "UID") { uid = child.textContent ?? ""; break; }
    }
    const codigo = lerItemDaTask(task);
    if (uid && codigo) uidToWbs.set(uid, codigo);
  }

  const result: TarefaImportada[] = [];

  for (const task of taskEls) {
    // UID direto da tarefa (filhos imediatos), não dos PredecessorLink/Assignment aninhados
    let uid = "";
    for (const child of Array.from(task.children)) {
      if (child.tagName === "UID") { uid = child.textContent ?? ""; break; }
    }
    const name  = task.querySelector("Name")?.textContent?.trim() ?? "";
    const level = parseInt(task.querySelector("OutlineLevel")?.textContent ?? "0");
    const start = fmtDate(task.querySelector("Start")?.textContent ?? "");
    const fin   = fmtDate(task.querySelector("Finish")?.textContent ?? "");
    const durRaw= task.querySelector("Duration")?.textContent ?? "";
    const summ  = task.querySelector("Summary")?.textContent === "1";
    // Rev. 1822 — código EAP = APENAS o campo Item do MS Project.
    // Sem fallback de WBS. Variável segue "wbs" pra minimizar diff.
    const wbs   = lerItemDaTask(task);
    const milestoneTag = task.querySelector("Milestone")?.textContent;
    const isMarco = milestoneTag === "1" || (!summ && parseDuration(durRaw) === 0 && durRaw !== "" && durRaw !== "0");
    const res   = task.querySelector("Assignment ResourceUID")?.textContent ?? "";

    // Collect ALL predecessor UIDs and convert them to WBS codes.
    // O MS Project usa <PredecessorLink><PredecessorUID>N</PredecessorUID>...</PredecessorLink>
    // (e não <UID> dentro de PredecessorLink). Aceitamos ambos por segurança.
    const predLinks = Array.from(task.querySelectorAll("PredecessorLink"));
    const predUids: string[] = [];
    for (const link of predLinks) {
      const predUid =
        link.querySelector("PredecessorUID")?.textContent ??
        link.querySelector("UID")?.textContent ??
        "";
      if (predUid) predUids.push(predUid);
    }
    const predWbs  = predUids.map(u => uidToWbs.get(u) ?? "").filter(Boolean);
    const pred     = predWbs.join(",");

    // Rev. 2427 — REGRA DE OURO (atividade): % CONCLUÍDA = PercentComplete
    // puro do MSP. Vale tanto pra `percentConcluido` (usado no editor)
    // quanto pra `realizadoMsp` (usado nos cards de avanço). Substitui a
    // cadeia Texto7 → AD/(AD+RD) da Rev. 1674.
    const pctRaw = task.querySelector("PercentComplete")?.textContent ?? "";
    const pctNum = pctRaw !== "" ? parseFloat(pctRaw) : NaN;
    const percentConcluido = Number.isFinite(pctNum) ? Math.min(100, Math.max(0, pctNum)) : 0;
    const realizadoMsp: number | undefined =
      Number.isFinite(pctNum) ? Math.min(100, Math.max(0, pctNum)) : undefined;

    // Rev. 2647 — VERDADE ABSOLUTA (atividade) = coluna "% PREVISTO" FIXA (Texto10).
    // Coleta os ExtendedAttribute da tarefa e lê SEMPRE o mesmo FieldID
    // (FID_PREVISTO_TEXTO10). SEM alias, SEM fallback Texto6/Texto11: faltou → undefined.
    const previstoVals: Record<string, number> = {};
    for (const child of Array.from(task.children)) {
      if (child.tagName !== "ExtendedAttribute") continue;
      const fid = child.querySelector("FieldID")?.textContent ?? "";
      const valRaw = (child.querySelector("Value")?.textContent ?? "").trim();
      if (!fid || !valRaw) continue;
      // Limpa "%" (vem como " 4%") e vírgula BR → ponto.
      const num = parseFloat(valRaw.replace(/%/g, "").replace(",", ".").trim());
      if (!Number.isFinite(num)) continue;
      previstoVals[fid] = Math.min(100, Math.max(0, num));
    }
    const previstoMsp: number | undefined = previstoVals[FID_PREVISTO_TEXTO10];

    // Rev. 2533 — Caminho B: lê BaselineStart/BaselineFinish da Baseline 0
    // (primária) salva no MSP. O MSP exporta como:
    //   <Baseline><Number>0</Number><Start>...</Start><Finish>...</Finish></Baseline>
    // Quando o engenheiro NÃO salvou baseline, MSP devolve "NA" ou ano 2049 —
    // tratamos como ausente. Fallback (sem baseline): usa o próprio Start/Finish
    // vigente (Project sem baseline = baseline implícita = plano corrente).
    let baselineStart: string | undefined;
    let baselineFinish: string | undefined;
    // Rev. 2617 — também guardamos o timestamp BRUTO (com hora) da baseline.
    // A hora é essencial pra paridade minuto-a-minuto: date-only dá 2/9/16/22
    // no PLN_816 R04, com hora dá o correto 2/9/15/20.
    let baselineStartTs: string | undefined;
    let baselineFinishTs: string | undefined;
    // Rev. 2631 — só é "baseline real" quando AMBOS Start e Finish da Baseline 0
    // vêm válidos (não "NA"/2049). Senão é fallback (Start/Finish vigente).
    let baselineReal = false;
    for (const child of Array.from(task.children)) {
      if (child.tagName !== "Baseline") continue;
      const num = child.querySelector("Number")?.textContent?.trim() ?? "";
      if (num !== "0") continue;
      const bs = (child.querySelector("Start")?.textContent ?? "").trim();
      const bf = (child.querySelector("Finish")?.textContent ?? "").trim();
      // MSP usa "NA" ou data 2049-12-31 quando não há baseline salva.
      const bsOk = !!bs && !bs.startsWith("2049") && bs !== "NA";
      const bfOk = !!bf && !bf.startsWith("2049") && bf !== "NA";
      if (bsOk) { baselineStart = fmtDate(bs); baselineStartTs = bs; }
      if (bfOk) { baselineFinish = fmtDate(bf); baselineFinishTs = bf; }
      baselineReal = bsOk && bfOk;
      break;
    }
    const startTs = (task.querySelector("Start")?.textContent ?? "").trim();
    const finTs   = (task.querySelector("Finish")?.textContent ?? "").trim();
    if (!baselineStart && start) baselineStart = start;
    if (!baselineFinish && fin)  baselineFinish = fin;
    if (!baselineStartTs && startTs) baselineStartTs = startTs;
    if (!baselineFinishTs && finTs)  baselineFinishTs = finTs;

    // Pula a tarefa de nível 0 (cabeçalho do projeto)
    if (uid === "0" || name === "" || level === 0) continue;

    // Rev. 1822 — Sem validação dura: se a atividade não tem Item no MSP,
    // ela entra com `eap_codigo` vazio (decisão do usuário: copiar fielmente
    // o que vem do Project, sem inventar). Atividades sem Item simplesmente
    // não vão casar com orçamento e aparecerão como "Sem meta" no LOTUS —
    // visível pro engenheiro corrigir lá no Project quando quiser.

    result.push({
      wbs, mspUid: uid, nome: name, nivel: level, inicio: start, fim: fin,
      durDias: parseDuration(durRaw), pred, recurso: res,
      isGrupo: summ, isMarco, eapCodigo: wbs, pesoFin: 0, percentConcluido,
      previstoMsp, realizadoMsp,
      baselineStart, baselineFinish,
      baselineStartTs, baselineFinishTs,
      baselineReal,
    });
  }
  return result;
}

// ── Parser Excel (MS Project → Excel export) ──────────────────────────────────
export async function parseMSProjectXLSX(buffer: ArrayBuffer): Promise<TarefaImportada[]> {
  const xlsxMod = await import("xlsx");
  const XLSX = xlsxMod.default ?? xlsxMod;
  // cellDates: true → datas vêm como objetos Date em vez de serial numérico
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });

  const ws = wb.Sheets[wb.SheetNames[0]];

  // Detecta colunas em inglês ou português (incluindo MSP-BR full)
  const KEYS_NOME = ["Name", "Task Name", "Atividade", "Nome", "Tarefa", "Descrição", "Descricao", "Nome da tarefa", "Nome da Tarefa", "Tarefas"];
  const KEYS_WBS  = ["WBS", "EAP", "Código WBS", "Code", "Codigo", "EDT", "Estrutura analítica"];
  const KEYS_INI  = ["Start", "Data de Início", "Início", "Inicio", "Data Início", "Data Inicio", "Início Real", "Início programado"];
  const KEYS_FIM  = ["Finish", "Data de Término", "Fim", "Término", "Termino", "Data Término", "Data Termino", "Conclusão", "Conclusao", "Término Real", "Término programado"];
  const KEYS_DUR  = ["Duration", "Duração", "Duracao", "Dur", "Duração restante"];
  const KEYS_PRED = ["Predecessors", "Predecessoras", "Predecessores", "Pred"];
  const KEYS_REC  = ["Resource Names", "Recursos", "Recurso", "Resource", "Nomes dos recursos", "Nome dos recursos"];
  const KEYS_SUMM  = ["Summary", "Resumo", "Grupo", "Is Summary", "Outline Level", "Nível", "Nivel", "Nível de tópicos"];
  const KEYS_MARCO = ["Milestone", "Marco", "Is Milestone", "Marcos"];
  const KEYS_PCT   = ["% Complete", "% Concluído", "% Concluido", "Percent Complete", "Percentual", "% Work Complete", "% concluída", "% concluida", "Porcentagem concluída"];

  // Rev. 2230 → 2232 — Auto-detecta linha do cabeçalho. Estratégia atual:
  //   - lê bruto como matriz;
  //   - normaliza cada célula: lowercase, trim, remove acentos;
  //   - bloqueia células contendo ":" (são linhas de título tipo
  //     "Atividade: Execução de Obra Civil");
  //   - pontua cada linha pela QUANTIDADE de CATEGORIAS distintas
  //     (Nome, WBS, Início, Fim, Duração, Pred, Rec, %) onde alguma
  //     célula casa por EQUALS ou por WORD-BOUNDARY (palavra inteira)
  //     com uma key — captura "Nome da tarefa" como Nome sem aceitar
  //     "Atividade: ..." como Nome;
  //   - promove a linha com MAIOR score (preferindo a 1ª em empate),
  //     desde que score >= 2 — exige no mínimo 2 categorias na linha.
  const raw = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: "", raw: false, blankrows: false });
  if (!raw.length) throw new Error("Planilha vazia");

  const stripAcc = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const norm = (v: any) => stripAcc((v ?? "").toString().toLowerCase().trim());

  const KEY_GROUPS = [KEYS_NOME, KEYS_WBS, KEYS_INI, KEYS_FIM, KEYS_DUR, KEYS_PRED, KEYS_REC, KEYS_PCT];
  const GROUPS_NORM = KEY_GROUPS.map(g => g.map(norm));

  function cellMatchesKey(cell: string, key: string): boolean {
    if (!cell || !key) return false;
    if (cell === key) return true;
    // word-boundary: a key tem que aparecer como palavra completa
    // (precedida/seguida de início, fim, espaço, ou pontuação leve),
    // e a célula NÃO pode ter ":" (sinal de título tipo "X: valor").
    if (cell.includes(":")) return false;
    const re = new RegExp(`(^|[\\s\\-_/])${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[\\s\\-_/])`);
    return re.test(cell);
  }

  function scoreRow(row: any[]): number {
    const cells = (row || []).map(norm).filter(Boolean);
    if (!cells.length) return 0;
    let matched = 0;
    for (const group of GROUPS_NORM) {
      const hit = cells.some(s => group.some(k => cellMatchesKey(s, k)));
      if (hit) matched++;
    }
    return matched;
  }

  let headerRowIdx = -1;
  let bestScore = 0;
  const scanLimit = Math.min(raw.length, 30);
  for (let i = 0; i < scanLimit; i++) {
    const sc = scoreRow(raw[i] || []);
    if (sc > bestScore) { bestScore = sc; headerRowIdx = i; }
  }
  if (bestScore < 2) headerRowIdx = -1;

  let rows: any[];
  if (headerRowIdx > 0) {
    // Re-parse usando a linha detectada como header
    const headerRow = (raw[headerRowIdx] || []).map((c: any, i: number) => {
      const s = (c ?? "").toString().trim();
      return s || `__col_${i}`;
    });
    rows = raw.slice(headerRowIdx + 1).map((arr: any[]) => {
      const obj: Record<string, any> = {};
      headerRow.forEach((h: string, i: number) => { obj[h] = arr[i] ?? ""; });
      return obj;
    });
  } else {
    rows = XLSX.utils.sheet_to_json<any>(ws, { defval: "", raw: false });
  }

  if (!rows.length) throw new Error("Planilha vazia");

  const headers = Object.keys(rows[0] ?? {});

  function findKey(keys: string[]): string | null {
    for (const k of keys) {
      const found = headers.find(h => h.toLowerCase().trim().includes(k.toLowerCase()));
      if (found) return found;
    }
    return null;
  }

  const kNome  = findKey(KEYS_NOME);
  const kWbs   = findKey(KEYS_WBS);
  const kIni   = findKey(KEYS_INI);
  const kFim   = findKey(KEYS_FIM);
  const kDur   = findKey(KEYS_DUR);
  const kPred  = findKey(KEYS_PRED);
  const kRec   = findKey(KEYS_REC);
  const kSumm  = findKey(KEYS_SUMM);
  const kMarco = findKey(KEYS_MARCO);
  const kPct   = findKey(KEYS_PCT);

  if (!kNome) {
    const cols = headers.slice(0, 12).join(" | ");
    // Rev. 2232 — amostra das 1ªs 5 linhas pra diagnóstico quando a
    // auto-detecção de header falha (XLSX exótico do MSP).
    const sample = raw.slice(0, 5).map((r, i) =>
      `L${i + 1}: ${(r || []).slice(0, 10).map((c: any) => (c ?? "").toString().slice(0, 20)).join(" | ")}`
    ).join(" || ");
    throw new Error(
      `Coluna de nome da tarefa não encontrada. Headers usados: ${cols}. ` +
      `Amostra das 1ªs linhas: ${sample}. ` +
      `Reexporte do MS Project com cabeçalhos visíveis (Nome/Name na 1ª linha) ou envie o XLSX pro suporte.`
    );
  }

  // ── Rev. 1797 / R-013 — EAP do Orçamento é IMUTÁVEL ─────────────────────
  // Bloqueia importação sem coluna WBS/EAP — exige numeração explícita do MSP
  // pra evitar renumeração silenciosa (1, 2, 3...) que quebra o vínculo com
  // o orçamento. Antes era fallback `String(i + 1)`, agora falha com mensagem
  // clara orientando o usuário a exportar do MSP com WBS habilitado.
  if (!kWbs) {
    const cols = headers.slice(0, 12).join(", ");
    throw new Error(
      `Planilha SEM coluna de EAP/WBS — exporte do MS Project com a coluna "WBS" habilitada para preservar a numeração do contrato (R-013). ` +
      `Colunas detectadas: ${cols}. Aceito: WBS, EAP, Código WBS, Code, Codigo.`
    );
  }

  const parsed = rows
    .filter((r: any) => r[kNome!]?.toString().trim())
    .map((r: any, i: number) => {
      const nome  = r[kNome!]?.toString().trim() ?? "";
      // R-013: kWbs já validado acima; se a célula vier vazia o item é descartado
      const wbs   = r[kWbs!]?.toString().trim() ?? "";
      if (!wbs) {
        throw new Error(
          `Linha ${i + 2}: tarefa "${nome.substring(0, 40)}" SEM código WBS/EAP. Toda atividade deve ter EAP no MSP — corrija na planilha e reenvie (R-013).`
        );
      }
      const ini   = fmtDate(kIni ? r[kIni] : "");
      const fim   = fmtDate(kFim ? r[kFim] : "");
      const durRaw= kDur ? r[kDur]?.toString() ?? "" : "";
      const durDias = parseDuration(durRaw) || parseInt(durRaw) || 0;
      const pred  = kPred ? r[kPred]?.toString().trim() ?? "" : "";
      const rec   = kRec  ? r[kRec]?.toString().trim()  ?? "" : "";
      const level = wbs.split(".").filter(Boolean).length || 1;

      // Detecta grupo: coluna Summary, ou atividade com filhos (WBS maior implica grupo no pai)
      let isGrupo = false;
      if (kSumm) {
        const sv = r[kSumm]?.toString().toLowerCase();
        isGrupo = sv === "sim" || sv === "yes" || sv === "1" || sv === "true";
      }

      // Detecta marco: coluna Milestone/Marco OU duração zero (e não é grupo)
      let isMarco = false;
      if (kMarco) {
        const mv = r[kMarco]?.toString().toLowerCase();
        isMarco = mv === "sim" || mv === "yes" || mv === "1" || mv === "true";
      }
      if (!isMarco && !isGrupo && durDias === 0 && ini && fim && ini === fim) {
        isMarco = true;
      }

      // % Concluído — pode vir como "45%", "45" ou "0.45" dependendo do export
      let percentConcluido = 0;
      if (kPct && r[kPct] != null && r[kPct] !== "") {
        const raw = r[kPct].toString().replace("%", "").trim();
        const val = parseFloat(raw) || 0;
        // MS Project Excel export armazena como decimal (0.45) ou como inteiro (45)
        percentConcluido = val <= 1 && val > 0 ? Math.round(val * 100) : Math.min(100, Math.max(0, val));
      }

      return { wbs, nome, nivel: level, inicio: ini, fim, durDias, pred, recurso: rec, isGrupo, isMarco, eapCodigo: wbs, pesoFin: 0, percentConcluido };
    });

  // Detecção automática de grupos: se há WBS filhos, o pai é grupo
  const wbsSet = new Set(parsed.map(t => t.wbs));
  parsed.forEach(t => {
    if (!t.isGrupo) {
      const hasChild = parsed.some(o => o.wbs !== t.wbs && o.wbs.startsWith(t.wbs + "."));
      if (hasChild) t.isGrupo = true;
    }
  });

  return parsed;
}

// ── Verifica problemas nas tarefas importadas ─────────────────────────────────
interface Problema { idx: number; campo: string; msg: string }
function validarTarefas(tarefas: TarefaImportada[]): Problema[] {
  const problemas: Problema[] = [];
  tarefas.forEach((t, i) => {
    if (t.isGrupo) return;
    if (!t.inicio || !isDateOk(t.inicio))
      problemas.push({ idx: i, campo: "inicio", msg: `"${t.nome.substring(0, 30)}" — data de início inválida ou ausente` });
    if (!t.fim || !isDateOk(t.fim))
      problemas.push({ idx: i, campo: "fim", msg: `"${t.nome.substring(0, 30)}" — data de término inválida ou ausente` });
    if (t.inicio && t.fim && isDateOk(t.inicio) && isDateOk(t.fim) && t.fim < t.inicio)
      problemas.push({ idx: i, campo: "fim", msg: `"${t.nome.substring(0, 30)}" — término anterior ao início (${fmtBRLocal(t.inicio)} → ${fmtBRLocal(t.fim)})` });
  });
  return problemas;
}

// ── Componente principal ──────────────────────────────────────────────────────
interface Props {
  projetoId:    number;
  revisaoAtiva: any;
  orcamentoId?: number | null;
  utils:        any;
  onImportado?: () => void;
}

const POR_PAGINA = 50;

export default function ImportarCronograma({ projetoId, revisaoAtiva, orcamentoId, utils, onImportado }: Props) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"upload" | "preview" | "vinculo">("upload");
  const [tarefas, setTarefas] = useState<TarefaImportada[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [alertas, setAlertas] = useState<Problema[]>([]);
  // Rev. 2631 — diagnóstico de integridade do XML (bloqueios + avisos).
  const [integridade, setIntegridade] = useState<IntegridadeMSP | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [arquivo, setArquivo] = useState<string>("");
  const [nivelMax, setNivelMax] = useState(5);
  const [pagina, setPagina] = useState(1);
  const fileRef = useRef<HTMLInputElement>(null);

  // Busca orçamento completo para vinculação automática
  const { data: orcData } = trpc.orcamento.getById.useQuery(
    { id: orcamentoId ?? 0 },
    { enabled: !!orcamentoId && open }
  );
  const orcItens: any[] = (orcData as any)?.itens ?? [];

  // Rev. 1648 — Detecta se já existe cronograma na revisão. Quando NÃO há
  // (primeira importação), o seletor de modo é ocultado e o import roda
  // direto como "substituir" (equivalente a inserção limpa, sem nada para
  // mesclar). O seletor só aparece em ATUALIZAÇÕES de cronograma já existente.
  const { data: atividadesExistentes } = trpc.planejamento.listarAtividades.useQuery(
    { revisaoId: revisaoAtiva?.id ?? 0 },
    { enabled: !!revisaoAtiva?.id && open },
  );
  const jaTemCronograma = ((atividadesExistentes as any[]) ?? []).length > 0;

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

  const [modoImport, setModoImport] = useState<"substituir" | "apenas_predecessora" | "mesclar">("mesclar");
  // Rev. 1648 — Quando NÃO existe cronograma ainda (primeira importação),
  // força o modo "substituir" (equivalente a inserção limpa) e oculta o
  // seletor — não faz sentido perguntar "mesclar com o quê?".
  useEffect(() => {
    if (open && atividadesExistentes !== undefined) {
      if (!jaTemCronograma && modoImport !== "substituir") setModoImport("substituir");
    }
  }, [open, jaTemCronograma, atividadesExistentes]);
  const [resultadoImport, setResultadoImport] = useState<{ atualizados: number; inseridos: number; naoEncontrados: number } | null>(null);

  // Rev. 1834 — Barra de progresso da importação com estágios.
  // O backend processa o lote inteiro numa transação só (sem streaming),
  // então o progresso real é desconhecido. Curva agora desacelera MENOS
  // (decay 0.10 vs 0.06 antigo) — chega em 95% em ~3s vs ~7s antes,
  // eliminando a sensação de "trava no 88%". Mensagem dinâmica em 3
  // estágios deixa explícito que aos ~95%+ a barra está PARADA pq o
  // backend está salvando no banco (não congelou).
  const [progressoImport, setProgressoImport] = useState(0);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [progressoTotalAtv, setProgressoTotalAtv] = useState<number | null>(null);

  function iniciarProgresso(totalAtividades?: number) {
    setProgressoImport(3);
    setProgressoTotalAtv(typeof totalAtividades === "number" ? totalAtividades : null);
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    // Tick 100ms com decay 0.10 — chega em 90% em ~2s, 95% em ~3s, 99%
    // em ~6s. Mais responsivo que a Rev. 1822 (decay 0.06) que demorava
    // ~10s pra sair de 88% → 99%, dando a falsa sensação de travamento.
    progressIntervalRef.current = setInterval(() => {
      setProgressoImport(p => (p < 99 ? p + Math.max(0.20, (99 - p) * 0.10) : p));
    }, 100);
  }
  function finalizarProgresso(sucesso: boolean) {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    setProgressoImport(sucesso ? 100 : 0);
    setProgressoTotalAtv(null);
  }
  useEffect(() => () => {
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
  }, []);
  // Mensagem por estágio (UX honesta — usuário entende que nos últimos
  // 5pp a barra está esperando o INSERT no Postgres, não congelou).
  function progressoMensagem(p: number, totalAtv: number | null): string {
    if (p < 30)  return "Lendo arquivo MS Project…";
    if (p < 75)  return totalAtv ? `Convertendo ${totalAtv} atividades…` : "Convertendo atividades…";
    if (p < 95)  return "Enviando para o servidor…";
    if (p < 100) return totalAtv && totalAtv > 300
      ? `Salvando ${totalAtv} atividades no banco — projetos grandes podem levar até 60s…`
      : "Salvando no banco — pode levar alguns segundos…";
    return "Concluído!";
  }

  const salvarMutation = trpc.planejamento.salvarAtividades.useMutation({
    onSuccess: async () => {
      utils.planejamento.listarAtividades.invalidate();
      await gravarMetadadosMSP();          // Rev. 1642
      setOpen(false);
      resetState();
      onImportado?.();
    },
  });

  const importarAvancosMutation = trpc.planejamento.importarAvancosDoArquivo.useMutation();
  // Rev. 1642 — grava StatusDate + calendário do MS Project (paridade 100%).
  const salvarMetadadosMSPMutation = trpc.planejamento.salvarMetadadosMSProject.useMutation();
  const [metadadosMSP, setMetadadosMSP] = useState<{ statusDate: string | null; statusDateIso: string | null; calendarioJson: string | null; projetoStart: string | null; projetoFinish: string | null } | null>(null);

  const importarComModoMutation = trpc.planejamento.importarComModo.useMutation({
    onSuccess: async (res: any) => {
      utils.planejamento.listarAtividades.invalidate();
      // Após mesclar/atualizar predecessora, grava também os % Concluído editados como avanço da semana
      if (revisaoAtiva) {
        const comPct = tarefas
          .filter(t => !t.isGrupo && (t.percentConcluido ?? 0) > 0)
          .map(t => ({
            // Rev. 1829 — UID MSP é a 1ª chave de matching
            mspUid: t.mspUid || undefined,
            eapCodigo: t.eapCodigo || t.wbs,
            nome: t.nome,
            percentConcluido: t.percentConcluido ?? 0,
          }));
        if (comPct.length > 0) {
          try {
            await importarAvancosMutation.mutateAsync({
              revisaoId: revisaoAtiva.id,
              projetoId,
              // Rev. 1830 — Semana de referência = StatusDate do XML (não hoje).
              // Sem isso, snapshot da SEMANA N caía na semana atual do servidor
              // e a "evolução da primeira semana" ficava em branco.
              semanaIso: metadadosMSP?.statusDate || undefined,
              atividades: comPct,
            });
          } catch (e) {
            console.error("Erro ao gravar avanços do preview:", e);
          }
        }
      }
      await gravarMetadadosMSP();          // Rev. 1642 — StatusDate + calendário
      setResultadoImport({
        atualizados:    res?.atualizados ?? 0,
        inseridos:      res?.inseridos ?? 0,
        naoEncontrados: res?.naoEncontrados ?? 0,
      });
      setTimeout(() => {
        setOpen(false);
        resetState();
        onImportado?.();
      }, 2500);
    },
  });

  function resetState() {
    setStep("upload");
    setTarefas([]);
    setErro(null);
    setAlertas([]);
    setIntegridade(null);
    setArquivo("");
    setNivelMax(5);
    setPagina(1);
    setModoImport("mesclar");
    setResultadoImport(null);
    setMetadadosMSP(null);
    finalizarProgresso(false);
  }

  // Rev. 1642 — fire-and-forget: grava StatusDate + calendário após qualquer
  // import bem-sucedido (substituir/mesclar/apenas_predecessora).
  async function gravarMetadadosMSP() {
    if (!metadadosMSP) return;
    if (!metadadosMSP.statusDate && !metadadosMSP.calendarioJson && !metadadosMSP.statusDateIso && !metadadosMSP.projetoStart && !metadadosMSP.projetoFinish) return;
    try {
      await salvarMetadadosMSPMutation.mutateAsync({
        projetoId,
        statusDate:     metadadosMSP.statusDate,
        statusDateIso:  metadadosMSP.statusDateIso,
        calendarioJson: metadadosMSP.calendarioJson,
        projetoStart:   metadadosMSP.projetoStart,
        projetoFinish:  metadadosMSP.projetoFinish,
        // Rev. 2765 — cadastro inicial (aba Cronograma): PODE (re)gerar a curva
        // "% Previsto" do MSP. É aqui — e só aqui — que o previsto é definido.
        origem:         "cadastro",
      });
      utils.planejamento.getProjetoById.invalidate();
      utils.planejamento.getDataCorte.invalidate();
    } catch (e) { console.error("[MSP metadata] Falha ao gravar:", e); }
  }

  // ── Vinculação automática com EAP do orçamento ────────────────────────────
  function vincularComOrcamento(lista: TarefaImportada[]): TarefaImportada[] {
    if (!orcamentoId || !Object.keys(eapMap).length) return lista;

    return lista.map(t => {
      const item = eapMap[t.wbs] ?? eapMap[t.eapCodigo];
      if (item && totalVenda > 0) {
        return { ...t, eapCodigo: item.eapCodigo, pesoFin: +(n(item.vendaTotal) / totalVenda * 100).toFixed(4) };
      }
      return t;
    });
  }

  // ── Leitura do arquivo ────────────────────────────────────────────────────
  async function handleFile(file: File) {
    setCarregando(true);
    setErro(null);
    setIntegridade(null);
    setArquivo(file.name);
    try {
      let parsed: TarefaImportada[];
      const ext = file.name.split(".").pop()?.toLowerCase();

      if (ext === "xml") {
        const text = await file.text();
        // Rev. 1642 — captura também StatusDate + Calendars pra paridade MS Project.
        const full = parseMSProjectFull(text);
        // Rev. 2631 — TRAVA pré-upload: se faltar dado essencial pro %Previsto
        // bater com o MSP, NÃO deixa subir. Mostra o que falta e fica no passo
        // "upload" pra reexportar o XML correto.
        setIntegridade(full.integridade);
        if (full.integridade.bloqueios.length > 0) {
          setTarefas([]);
          setMetadadosMSP(null);
          setStep("upload");
          return;   // `finally` desliga o "carregando"
        }
        parsed = full.tarefas;
        setMetadadosMSP({ statusDate: full.statusDate, statusDateIso: full.statusDateIso, calendarioJson: full.calendarioJson, projetoStart: full.projetoStart, projetoFinish: full.projetoFinish });
      } else if (ext === "xlsx" || ext === "xls" || ext === "xlsm") {
        const buf = await file.arrayBuffer();
        parsed = await parseMSProjectXLSX(buf);
      } else {
        throw new Error("Formato não suportado. Use .xml (MS Project) ou .xlsx");
      }

      if (!parsed.length) throw new Error("Nenhuma tarefa encontrada no arquivo");

      // Rev. 1786 — Heurística LoE/Indireta (PMBOK §6.4.2 / DCMA #6):
      // atividades cuja duração cobre ≥90% do projeto são tipicamente
      // overhead (Administração, Mob/Desmob, Vigilância). Pré-marca como
      // indireta pra usuário CONFIRMAR (não impõe). Sem grupos/marcos.
      const folhasParaProjeto = parsed.filter(t => !t.isGrupo && !t.isMarco && t.inicio && t.fim);
      const inicioProjMs = folhasParaProjeto
        .map(t => new Date(t.inicio + "T12:00:00").getTime())
        .filter(n => !isNaN(n))
        .reduce((a, b) => Math.min(a, b), Infinity);
      const fimProjMs = folhasParaProjeto
        .map(t => new Date(t.fim + "T12:00:00").getTime())
        .filter(n => !isNaN(n))
        .reduce((a, b) => Math.max(a, b), -Infinity);
      const duracaoProjDias = (isFinite(inicioProjMs) && isFinite(fimProjMs))
        ? Math.max(1, Math.round((fimProjMs - inicioProjMs) / 86400000) + 1)
        : 0;
      const sugeridos = parsed.map(t => {
        if (t.isGrupo || t.isMarco || !t.inicio || !t.fim || duracaoProjDias === 0) return t;
        const ini = new Date(t.inicio + "T12:00:00").getTime();
        const fim = new Date(t.fim + "T12:00:00").getTime();
        if (isNaN(ini) || isNaN(fim)) return t;
        const dur = Math.max(1, Math.round((fim - ini) / 86400000) + 1);
        const cobertura = dur / duracaoProjDias;
        return cobertura >= 0.9 ? { ...t, isIndireta: true } : t;
      });

      const vinculados = vincularComOrcamento(sugeridos);
      setTarefas(vinculados);
      setAlertas(validarTarefas(vinculados));
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
    setTarefas(prev => {
      const next = prev.map((item, i) => i === idx ? { ...item, [field]: value } : item);
      setAlertas(validarTarefas(next));
      return next;
    });
  }

  // Recalcula pesos automaticamente distribuindo 100% pelas folhas
  function redistribuirPesos() {
    const folhas = tarefas.filter(t => !t.isGrupo);
    if (!folhas.length) return;
    const pesoUnitario = +(100 / folhas.length).toFixed(4);
    let folhaIdx = 0;
    setTarefas(t => t.map(item =>
      item.isGrupo ? item : { ...item, pesoFin: folhaIdx++ === folhas.length - 1
        ? +(100 - pesoUnitario * (folhas.length - 1)).toFixed(4) : pesoUnitario }
    ));
  }

  function confirmarImportacao() {
    if (!revisaoAtiva) return;
    const atividades = tarefas.map((t, i) => ({
      eapCodigo:           t.eapCodigo || t.wbs,
      // Rev. 1829 — UID do MSP (chave única). Vazio em XLSX (formato legado).
      mspUid:              t.mspUid || undefined,
      nome:                t.nome,
      nivel:               t.nivel,
      dataInicio:          t.inicio || undefined,
      dataFim:             t.fim || undefined,
      duracaoDias:         t.durDias,
      predecessora:        t.pred || undefined,
      pesoFinanceiro:      t.pesoFin,
      recursoPrincipal:    t.recurso || undefined,
      isGrupo:             t.isGrupo,
      isMarco:             t.isMarco,
      // Rev. 1786 — flag LoE/Indireta vinda da heurística + confirmação do usuário
      isIndireta:          !!t.isIndireta,
      ordem:               i,
      percentConcluido:    t.percentConcluido ?? 0,
      // Rev. 1670 — snapshot por atividade vindo do XML MSP
      previstoMspPct:      t.previstoMsp,
      realizadoMspPct:     t.realizadoMsp,
      // Rev. 2533 — Caminho B: envia baseline pra expansão semanal no server.
      baselineStart:       t.baselineStart,
      baselineFinish:      t.baselineFinish,
      // Rev. 2617 — baseline COM HORA (paridade minuto-a-minuto).
      baselineStartTs:     t.baselineStartTs,
      baselineFinishTs:    t.baselineFinishTs,
    }));

    iniciarProgresso(tarefas.length);
    if (modoImport === "substituir") {
      // Comportamento original: apaga revisão e recria
      salvarMutation.mutate(
        // Rev. 1830 — semanaIso = StatusDate do XML (Monday calc no backend).
        { revisaoId: revisaoAtiva.id, projetoId, atividades, semanaIso: metadadosMSP?.statusDate || undefined },
        {
          onSuccess: () => finalizarProgresso(true),
          onError:   () => finalizarProgresso(false),
        },
      );
    } else {
      // Modos "mesclar" ou "apenas_predecessora": preserva ajustes locais
      importarComModoMutation.mutate({
        revisaoId: revisaoAtiva.id,
        projetoId,
        modo: modoImport,
        atividades: atividades.map(a => ({
          eapCodigo:        a.eapCodigo,
          // Rev. 1829 — UID MSP propagado também no modo mesclar
          mspUid:           a.mspUid,
          nome:             a.nome,
          nivel:            a.nivel,
          dataInicio:       a.dataInicio,
          dataFim:          a.dataFim,
          duracaoDias:      a.duracaoDias,
          predecessora:     a.predecessora,
          pesoFinanceiro:   a.pesoFinanceiro,
          recursoPrincipal: a.recursoPrincipal,
          ordem:            a.ordem,
          isGrupo:          a.isGrupo,
          isMarco:          a.isMarco,
          // Rev. 1786 — propaga sugestão LoE/Indireta também no modo mesclar (só se aplica a atividades NOVAS)
          isIndireta:       a.isIndireta,
          // Rev. 1670 — snapshot Texto10/Texto7 também no modo mesclar
          previstoMspPct:   a.previstoMspPct,
          realizadoMspPct:  a.realizadoMspPct,
          // Rev. 2533 — Caminho B: baseline propagada também no mesclar
          baselineStart:    a.baselineStart,
          baselineFinish:   a.baselineFinish,
          // Rev. 2617 — baseline COM HORA (paridade minuto-a-minuto).
          baselineStartTs:  (a as any).baselineStartTs,
          baselineFinishTs: (a as any).baselineFinishTs,
        })),
      }, {
        onSuccess: () => finalizarProgresso(true),
        onError:   () => finalizarProgresso(false),
      });
    }
  }

  const totalPeso = tarefas.reduce((s, t) => s + (t.isGrupo ? 0 : t.pesoFin), 0);
  const pesoOk    = Math.abs(totalPeso - 100) < 0.1 || tarefas.every(t => t.pesoFin === 0);
  const vinculados = tarefas.filter(t => eapMap[t.eapCodigo]).length;

  // Paginação + filtro de nível (preserva índice global)
  const tarefasFiltradasIdx = useMemo(
    () => tarefas.map((t, i) => ({ t, i })).filter(({ t }) => t.nivel <= nivelMax),
    [tarefas, nivelMax]
  );
  const totalPaginas = Math.max(1, Math.ceil(tarefasFiltradasIdx.length / POR_PAGINA));
  const tarefasPagina = useMemo(() => {
    const ini = (pagina - 1) * POR_PAGINA;
    return tarefasFiltradasIdx.slice(ini, ini + POR_PAGINA);
  }, [tarefasFiltradasIdx, pagina]);

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
        <DialogContent className="!fixed !inset-0 !translate-x-0 !translate-y-0 !max-w-none !w-screen !h-screen !rounded-none flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-4 w-4 text-emerald-600" />
              Importar Cronograma — MS Project
            </DialogTitle>
          </DialogHeader>

          {/* ── Step 1: Upload ── */}
          {step === "upload" && (
            <div className="space-y-4 mt-2 flex-1 overflow-y-auto px-1">
              <div className="text-xs text-slate-500 bg-slate-50 rounded-lg p-3 space-y-1">
                <p className="font-medium text-slate-700">Como exportar do MS Project:</p>
                <p>• <strong>XML</strong>: Arquivo → Salvar Como → <em>XML do Project (*.xml)</em></p>
                <p>• <strong>Excel</strong>: Arquivo → Salvar Como → <em>Pasta de Trabalho do Excel (*.xlsx)</em></p>
                <p>As atividades serão vinculadas automaticamente ao Item do orçamento (se disponível).</p>
                <p className="text-blue-600 font-medium mt-1">O campo <strong>% Concluído</strong> de cada tarefa será importado automaticamente e registrado como Avanço Realizado da semana atual — mantendo o sistema alinhado com o Project.</p>
                <p className="text-emerald-600 font-medium mt-1">As <strong>Predecessoras</strong> (links FS/SS/FF/SF do MS Project) serão lidas e convertidas para códigos EAP — habilitando o modo <strong>Rede de Precedências (CPM)</strong> com setas reais de dependência no Diagrama de Rede.</p>
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

              {/* Rev. 2631 — TRAVA: XML incompleto bloqueia o upload. */}
              {integridade && integridade.bloqueios.length > 0 && (
                <div className="rounded-lg border border-red-300 bg-red-50 p-3 space-y-2">
                  <p className="text-sm font-semibold text-red-700 flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    Arquivo bloqueado — está faltando informação essencial
                  </p>
                  <p className="text-xs text-red-600">
                    Para o <strong>% Previsto</strong> bater exatamente com o MS Project, o XML precisa estar completo. Corrija no Project, reexporte e tente de novo:
                  </p>
                  <ul className="space-y-1.5">
                    {integridade.bloqueios.map((b, i) => (
                      <li key={i} className="text-xs text-red-700 flex gap-1.5">
                        <span className="shrink-0">•</span><span>{b}</span>
                      </li>
                    ))}
                  </ul>
                  {integridade.avisos.length > 0 && (
                    <div className="pt-1 border-t border-red-200 space-y-1">
                      {integridade.avisos.map((a, i) => (
                        <p key={i} className="text-[11px] text-amber-700 flex gap-1.5">
                          <span className="shrink-0">⚠</span><span>{a}</span>
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Step 2: Preview + Edição ── */}
          {step === "preview" && (
            <div className="space-y-3 mt-1 flex-1 flex flex-col overflow-hidden">
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
                  {(() => {
                    const comPred = tarefas.filter(t => !t.isGrupo && t.pred && t.pred.trim() !== "").length;
                    return (
                      <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${comPred > 0 ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"}`} title="Atividades com predecessora detectada — habilita a Rede de Precedências (CPM)">
                        <Link2 className="h-3 w-3" />
                        {comPred} com predecessora
                      </span>
                    );
                  })()}
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
                  Soma dos pesos financeiros: <strong>{totalPeso.toFixed(4)}%</strong> — deve totalizar 100% para Curva S financeira correta.
                </div>
              )}

              {/* Rev. 2631 — Selo de confiança + avisos não-bloqueantes do XML */}
              {integridade && (
                <div className="space-y-2">
                  {integridade.bloqueios.length === 0 && (
                    <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                      <span>
                        <strong>% Previsto pode ser calculado conforme o MS Project</strong> — Linha de Base com hora + calendário com jornada de trabalho presentes.
                        {integridade.avisos.length > 0 && " Veja os avisos abaixo."}
                      </span>
                    </div>
                  )}
                  {integridade.avisos.length > 0 && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 space-y-1">
                      {integridade.avisos.map((a, i) => (
                        <p key={i} className="text-[11px] text-amber-700 flex gap-1.5">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0" /><span>{a}</span>
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Alertas de datas inválidas */}
              {alertas.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 space-y-1 max-h-32 overflow-y-auto">
                  <p className="text-xs font-semibold text-red-700 flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    {alertas.length} problema{alertas.length > 1 ? "s" : ""} de datas detectado{alertas.length > 1 ? "s" : ""}:
                  </p>
                  {alertas.slice(0, 8).map((a, i) => (
                    <p key={i} className="text-[10px] text-red-600">• {a.msg}</p>
                  ))}
                  {alertas.length > 8 && <p className="text-[10px] text-red-500 italic">+ {alertas.length - 8} outros</p>}
                  <p className="text-[10px] text-red-500 mt-1">Corrija as datas na tabela abaixo antes de importar.</p>
                </div>
              )}

              {/* Controles de filtro e paginação */}
              <div className="flex items-center justify-between gap-2 text-xs text-slate-600">
                <div className="flex items-center gap-2">
                  <span className="text-slate-500">Mostrar até nível:</span>
                  {[1, 2, 3, 4, 5].map(lv => (
                    <button
                      key={lv}
                      onClick={() => { setNivelMax(lv); setPagina(1); }}
                      className={`px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors ${nivelMax === lv ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                    >
                      {lv}
                    </button>
                  ))}
                  <span className="text-slate-400 ml-1">({tarefasFiltradasIdx.length} exibidas de {tarefas.length})</span>
                </div>
                {totalPaginas > 1 && (
                  <div className="flex items-center gap-1">
                    <button onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={pagina === 1}
                      className="px-2 py-0.5 rounded border border-slate-200 disabled:opacity-30 hover:bg-slate-50">‹</button>
                    <span className="px-2 text-slate-500">{pagina}/{totalPaginas}</span>
                    <button onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))} disabled={pagina === totalPaginas}
                      className="px-2 py-0.5 rounded border border-slate-200 disabled:opacity-30 hover:bg-slate-50">›</button>
                  </div>
                )}
              </div>

              {/* Tabela */}
              <div className="rounded-xl border border-slate-100 shadow-sm overflow-x-auto flex-1 overflow-y-auto">
                <table className="w-full text-[11px]">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-slate-700 text-white">
                      <th className="py-2 px-2 text-left w-28">Item / WBS</th>
                      <th className="py-2 px-2 text-left">Nome da Atividade</th>
                      <th className="py-2 px-2 text-center w-7">Grupo</th>
                      <th className="py-2 px-2 text-center w-7">Marco</th>
                      {/* Rev. 1786 — Coluna LoE/Indireta com sugestão automática (≥90% projeto) */}
                      <th className="py-2 px-2 text-center w-9" title="LoE/Indireta — atividades de apoio que NÃO compõem o caminho crítico (PMBOK §6.4.2 / DCMA #6). Pré-marcadas quando duração ≥90% do projeto.">Indir.</th>
                      <th className="py-2 px-2 text-left w-24">Início</th>
                      <th className="py-2 px-2 text-left w-24">Fim</th>
                      <th className="py-2 px-2 text-right w-14">Dias</th>
                      <th className="py-2 px-2 text-right w-16">Peso%</th>
                      <th className="py-2 px-2 text-right w-16 text-blue-200" title="% Concluído (0-100). Editável. Será gravado como avanço da semana atual.">% Conc.</th>
                      <th className="py-2 px-2 text-left w-28">Recurso</th>
                      <th className="py-2 px-2 text-left w-28">Predecessora</th>
                      {orcamentoId && <th className="py-2 px-2 text-center w-8">Item</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {tarefasPagina.map(({ t, i: idx }) => {
                      const indent = (t.nivel - 1) * 12;
                      const vinculado = !!eapMap[t.eapCodigo];
                      const temProblema = !t.isGrupo && alertas.some(a => a.idx === idx);
                      return (
                        <tr key={idx} className={`border-b border-slate-50 ${temProblema ? "bg-red-50" : t.isGrupo ? "bg-slate-50 font-semibold" : "bg-white hover:bg-blue-50/30"}`}>
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
                          <td className="px-2 py-1 text-center">
                            <input
                              type="checkbox"
                              checked={t.isMarco}
                              onChange={e => updateTarefa(idx, "isMarco", e.target.checked)}
                              className="h-3 w-3 cursor-pointer"
                              style={{accentColor:"#9333ea"}}
                            />
                          </td>
                          {/* Rev. 1786 — checkbox Indireta (LoE) — pré-marcada por heurística ≥90% projeto */}
                          <td className="px-2 py-1 text-center">
                            {t.isGrupo || t.isMarco ? (
                              <span className="text-[10px] text-slate-300">—</span>
                            ) : (
                              <input
                                type="checkbox"
                                checked={!!t.isIndireta}
                                onChange={e => updateTarefa(idx, "isIndireta", e.target.checked)}
                                className="h-3 w-3 cursor-pointer"
                                style={{accentColor:"#475569"}}
                                title={t.isIndireta ? "Pré-marcada como Indireta/LoE (duração cobre quase a obra inteira). Não entra no caminho crítico. Desmarque se for direta." : "Marque se esta atividade for de apoio (LoE) — administração, mob/desmob, vigilância. Não entra no caminho crítico."}
                              />
                            )}
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
                                min={0} max={100} step={0.0001}
                                value={t.pesoFin}
                                onChange={e => updateTarefa(idx, "pesoFin", parseFloat(e.target.value) || 0)}
                                className={`h-6 text-[11px] px-1 py-0 w-full text-right ${t.pesoFin > 0 ? "text-emerald-700" : "text-slate-400"}`}
                              />
                            )}
                          </td>
                          <td className="px-2 py-1">
                            {t.isGrupo ? (
                              <span className="text-[10px] text-slate-400 block text-right">—</span>
                            ) : (
                              <Input
                                type="number"
                                min={0} max={100} step={1}
                                value={t.percentConcluido ?? 0}
                                onChange={e => {
                                  const v = parseFloat(e.target.value);
                                  const clamped = isNaN(v) ? 0 : Math.min(100, Math.max(0, v));
                                  updateTarefa(idx, "percentConcluido", clamped);
                                }}
                                className={`h-6 text-[11px] px-1 py-0 w-full text-right ${(t.percentConcluido ?? 0) > 0 ? "text-blue-600 font-medium" : "text-slate-400"}`}
                                title="0 a 100%"
                              />
                            )}
                          </td>
                          <td className="px-2 py-1 text-slate-500 truncate max-w-[100px]">{t.recurso}</td>
                          <td className="px-2 py-1">
                            <Input
                              value={t.pred}
                              onChange={e => updateTarefa(idx, "pred", e.target.value)}
                              placeholder="ex: 2.1.1, 2.1.2"
                              className="h-6 text-[11px] px-1 py-0 w-full"
                              title="Códigos EAP (WBS) separados por vírgula"
                            />
                          </td>
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

              {/* Seletor de modo de importação — só aparece em ATUALIZAÇÕES
                  (quando já existe cronograma). Em uma primeira importação,
                  sempre traz tudo (substituir = inserção limpa). */}
              {!jaTemCronograma ? (
                <div className="border border-emerald-200 rounded-lg p-3 bg-emerald-50 text-[11px] text-emerald-800 flex items-start gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>
                    <b>Primeira importação</b> — todas as <b>{tarefas.length}</b> atividades do arquivo serão importadas.
                    O seletor de modo (mesclar/substituir/apenas predecessora) só aparece em <b>atualizações</b> de um cronograma já cadastrado.
                  </span>
                </div>
              ) : (
              <div className="border border-slate-200 rounded-lg p-3 bg-slate-50 space-y-2">
                <div className="text-[11px] font-semibold text-slate-700 uppercase tracking-wide">
                  Modo de importação
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <label className={`flex items-start gap-2 p-2 rounded border cursor-pointer transition ${modoImport === "mesclar" ? "border-emerald-500 bg-emerald-50" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                    <input
                      type="radio"
                      name="modoImport"
                      value="mesclar"
                      checked={modoImport === "mesclar"}
                      onChange={() => setModoImport("mesclar")}
                      className="mt-0.5"
                    />
                    <div className="text-[11px] leading-tight">
                      <div className="font-semibold text-slate-800">Mesclar (recomendado)</div>
                      <div className="text-slate-500">Atualiza datas, duração, peso e predecessora. <b>Preserva</b> marcos, indiretas, desativadas e ajustes manuais. Adiciona atividades novas.</div>
                    </div>
                  </label>

                  <label className={`flex items-start gap-2 p-2 rounded border cursor-pointer transition ${modoImport === "apenas_predecessora" ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                    <input
                      type="radio"
                      name="modoImport"
                      value="apenas_predecessora"
                      checked={modoImport === "apenas_predecessora"}
                      onChange={() => setModoImport("apenas_predecessora")}
                      className="mt-0.5"
                    />
                    <div className="text-[11px] leading-tight">
                      <div className="font-semibold text-slate-800">Apenas Predecessora</div>
                      <div className="text-slate-500">Não mexe em nada além do campo predecessora. Ideal para destravar a Rede de Precedências sem alterar o resto.</div>
                    </div>
                  </label>

                  <label className={`flex items-start gap-2 p-2 rounded border cursor-pointer transition ${modoImport === "substituir" ? "border-orange-500 bg-orange-50" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                    <input
                      type="radio"
                      name="modoImport"
                      value="substituir"
                      checked={modoImport === "substituir"}
                      onChange={() => setModoImport("substituir")}
                      className="mt-0.5"
                    />
                    <div className="text-[11px] leading-tight">
                      <div className="font-semibold text-slate-800">Substituir tudo</div>
                      <div className="text-slate-500 text-orange-700">Apaga as atividades atuais da revisão e recria. Perde marcos, indiretas e ajustes manuais. Use só em revisões novas.</div>
                    </div>
                  </label>
                </div>
              </div>
              )}

              {/* Rev. 1670 Fase 5 — Auditoria MSP × ERP (pré-save) */}
              {tarefas.length > 0 && !resultadoImport && (() => {
                // Mesmos filtros do `pvEvOficialAt` server (folhas contáveis):
                // !isGrupo && !isMarco && datas válidas. (`isIndireta`/`disabled`
                // só existem após persistência — aqui no XML ainda não há.)
                const folhasT = tarefas.filter(t => !t.isGrupo && !t.isMarco && !!t.inicio && !!t.fim);
                const comPrev = folhasT.filter(t => t.previstoMsp != null);
                const comReal = folhasT.filter(t => t.realizadoMsp != null);
                const somaPrevPond = comPrev.reduce((s, t) => s + ((t.previstoMsp ?? 0) * (t.pesoFin ?? 0) / 100), 0);
                const somaRealPond = comReal.reduce((s, t) => s + ((t.realizadoMsp ?? 0) * (t.pesoFin ?? 0) / 100), 0);
                const semPrev = folhasT.length - comPrev.length;
                if (comPrev.length === 0 && comReal.length === 0) {
                  return (
                    <div className="border border-slate-200 bg-slate-50 rounded p-2 text-[11px] text-slate-600">
                      <b>Auditoria MSP × ERP:</b> XML sem ExtendedAttributes Texto10/Texto7 — ERP usará cálculo dinâmico (sem snapshot).
                    </div>
                  );
                }
                return (
                  <div className="border border-blue-200 bg-blue-50 rounded p-2 text-[11px] text-slate-700 space-y-1">
                    <div className="font-semibold text-blue-900">Auditoria MSP × ERP (pré-save):</div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                      <div>Folhas com snapshot Texto10 (% Previsto):</div>
                      <div className="text-right tabular-nums"><b>{comPrev.length}</b>/{folhasT.length}{semPrev > 0 && <span className="text-amber-700"> · {semPrev} sem</span>}</div>
                      <div>Folhas com snapshot Texto7 (% Realizado):</div>
                      <div className="text-right tabular-nums"><b>{comReal.length}</b>/{folhasT.length}</div>
                      <div>Σ % Previsto MSP (ponderado):</div>
                      <div className="text-right tabular-nums"><b>{somaPrevPond.toFixed(2)}%</b></div>
                      <div>Σ % Realizado MSP (ponderado):</div>
                      <div className="text-right tabular-nums"><b>{somaRealPond.toFixed(2)}%</b></div>
                    </div>
                    <div className="text-slate-500 text-[10px] pt-1 border-t border-blue-100">
                      Após confirmar, esses valores ficam gravados por atividade e o ERP os usa quando o cutoff bate com o StatusDate do XML (paridade absoluta com MSP).
                    </div>
                  </div>
                );
              })()}

              {/* Resumo pós-import */}
              {resultadoImport && (
                <div className="border border-emerald-200 bg-emerald-50 rounded p-2 text-[11px] text-emerald-800 flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Importação concluída: <b>{resultadoImport.atualizados}</b> atualizadas, <b>{resultadoImport.inseridos}</b> novas
                  {resultadoImport.naoEncontrados > 0 && <> · <span className="text-amber-700"><b>{resultadoImport.naoEncontrados}</b> sem correspondência (ignoradas)</span></>}
                </div>
              )}

              {/* Rev. 1834 — Barra de progresso da importação com mensagem
                  por estágio. Após 95% a barra fica visualmente parada (a
                  transação Postgres está rolando) — a mensagem deixa
                  explícito que NÃO é travamento. */}
              {(salvarMutation.isPending || importarComModoMutation.isPending || progressoImport > 0) && (
                <div className="space-y-1.5 border border-emerald-200 bg-emerald-50/50 rounded p-2">
                  <div className="flex items-center justify-between text-[11px] text-emerald-800">
                    <span className="flex items-center gap-1.5 min-w-0">
                      {progressoImport >= 100
                        ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                        : <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />}
                      <b className="truncate">
                        {progressoImport >= 100
                          ? "Importação concluída"
                          : progressoMensagem(progressoImport, progressoTotalAtv ?? tarefas.length)}
                      </b>
                    </span>
                    <span className="tabular-nums font-semibold shrink-0">{Math.round(progressoImport)}%</span>
                  </div>
                  <Progress value={progressoImport} className="h-2" />
                </div>
              )}

              <div className="flex gap-2 justify-end pt-1 border-t border-slate-100">
                <Button variant="outline" size="sm" onClick={() => { setOpen(false); resetState(); }}>Cancelar</Button>
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 gap-1.5"
                  disabled={salvarMutation.isPending || importarComModoMutation.isPending}
                  onClick={confirmarImportacao}
                >
                  {(salvarMutation.isPending || importarComModoMutation.isPending)
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <CheckCircle2 className="h-3.5 w-3.5" />}
                  {!jaTemCronograma
                    ? `Importar ${tarefas.length} atividades`
                    : modoImport === "substituir"
                    ? `Substituir por ${tarefas.length} atividades`
                    : modoImport === "apenas_predecessora"
                    ? `Atualizar predecessoras (${tarefas.length})`
                    : `Mesclar ${tarefas.length} atividades`}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
