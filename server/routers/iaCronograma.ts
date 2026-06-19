import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import { assertAiModuleEnabled } from "../_core/aiConfig";
import { getDb, getObraFuncionarios } from "../db";
import {
  iaCronogramaConhecimento,
  iaCronogramaChat,
  iaCronogramaAlertas,
  iaCronogramaCenarios,
  iaCronogramaMonitoramento,
  planejamentoAtividades,
  planejamentoRevisoes,
  planejamentoProjetos,
  planejamentoAvancos,
  planejamentoAnalisesEfetivo,
  lobConfig,
  orcamentos,
  jobFunctions,
  obras,
  vacationPeriods,
} from "../../drizzle/schema";
import { eq, and, or, ilike, desc, sql, isNull, inArray } from "drizzle-orm";

// Rev. 2700 — Acesso à Análise de Efetivo (IA) ALINHADO À PORTA DE ENTRADA do
// módulo Planejamento. A tela onde a função vive (`/planejamento/:id`) é aberta
// por `getProjetoById` (e alimentada por `listarAtividades`, `listarAvancos`
// etc.), procedures `protectedProcedure` que NÃO restringem por `user_companies`
// — no ERP, o acesso ao módulo é gateado pelo GRUPO + alocação por obra (como
// em `listarProjetos`), não pela "empresa-casa".
//
// O guard da Rev. 2698 ainda enforçava `user_companies`: usuários SEM vínculo já
// tinham acesso GLOBAL por aqui, mas engenheiros COM vínculo a uma empresa
// DIFERENTE da empresa do projeto (ex.: vínculo na "casa", projeto cadastrado em
// "FC ENGENHARIA PROJETO") tomavam "Sem acesso a esta empresa" — deixando a
// função "liberada só para o usuário master". A enforce era, portanto,
// INCONSISTENTE (bloqueava só uma fatia dos usuários) e mais restritiva que a
// própria abertura do projeto.
//
// Agora: qualquer SESSÃO VÁLIDA que chega à tela (gateada no client/sidebar como
// o resto das `protectedProcedure` do módulo) pode rodar a análise. A isolação
// por empresa é mantida pelo filtro `(projetoId + companyId)` nas queries de
// dados (`coletarEfetivoCronograma` e as procedures de leitura/escrita de
// análise), que retornam vazio / "não encontrado" quando o companyId não casa
// com o projeto — impedindo mistura de dados entre empresas.
async function assertCompanyAccessIa(
  ctx: { user: { id: number; role?: string | null } },
  _companyId: number,
) {
  if (!ctx.user?.id) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
}

// Rev. 2805 — companyId REAL do projeto, p/ o gate liga/desliga da IA do módulo
// "planejamento". Resolve pela linha do projeto (não pelo `ctx.user.companyId`,
// que fica vazio p/ admin-master que alterna empresa pela UI) para que o toggle
// enforce corretamente em todos os usuários.
async function companyIdDoProjeto(projetoId: number): Promise<number | null> {
  try {
    const db = await getDb();
    if (!db) return null;
    const [row] = await db
      .select({ companyId: planejamentoProjetos.companyId })
      .from(planejamentoProjetos)
      .where(eq(planejamentoProjetos.id, projetoId))
      .limit(1);
    return (row?.companyId as number | undefined) ?? null;
  } catch {
    return null;
  }
}

// ── WMO weather codes severity ────────────────────────────────────────────
function wmoSeverity(code: number, chuva: number, probChuva: number, vento: number): { tipo: string; sev: string; msg: string } | null {
  if (code >= 95) return { tipo: "tempestade", sev: "critica", msg: `Tempestade prevista (cód ${code}) — paralisar içamentos, andaimes e trabalhos em altura` };
  if (chuva > 20 || code >= 80) return { tipo: "chuva_forte", sev: "alta", msg: `Chuva forte prevista (${chuva.toFixed(0)}mm) — impacto em concretagem, armação, escavação e atividades externas` };
  if (chuva > 8 || probChuva > 75) return { tipo: "chuva", sev: "media", msg: `Chuva moderada/probabilidade alta (${chuva.toFixed(0)}mm, ${probChuva}%) — planejar alternativas internas` };
  if (vento > 50) return { tipo: "vento_forte", sev: "alta", msg: `Ventos muito fortes (${vento.toFixed(0)} km/h) — suspender içamentos, guindaste e andaimes` };
  if (vento > 30) return { tipo: "vento", sev: "media", msg: `Ventos fortes (${vento.toFixed(0)} km/h) — atenção com guindaste e estruturas temporárias` };
  if (probChuva > 55) return { tipo: "chuva_provavel", sev: "baixa", msg: `Probabilidade de chuva (${probChuva}%) — ter plano B com atividades internas` };
  return null;
}

// ── Reparo de JSON truncado da IA ─────────────────────────────────────────
// Quando o LLM estoura o limite de tokens, o JSON volta cortado no meio de um
// array/objeto (ex.: "... at position 9887"). Este helper é um mini-parser
// recursivo-descendente que percorre a string e registra o ÚLTIMO ponto seguro
// — a posição logo após um VALOR completo (string de valor, número, literal ou
// container fechado), nunca após uma chave ou ':' nem no meio de um token —
// junto dos containers abertos nesse ponto. Ao detectar truncamento, trunca no
// último ponto seguro, remove a vírgula pendente e fecha os containers. Retorna
// o JSON reparado, ou null se o JSON estava completo (nada a reparar) ou se não
// há nada aproveitável. Nunca produz token incompleto (nunca corrompe).
function repararJsonTruncado(s: string): string | null {
  const n = s.length;
  let i = 0;
  const openers: ("}" | "]")[] = []; // closers pendentes, na ordem de abertura
  let lastSafe = -1;
  let lastSafeClosers = "";
  const TRUNC = Symbol("trunc");

  const isWs = (c: string) => c === " " || c === "\t" || c === "\n" || c === "\r";
  const skipWs = () => { while (i < n && isWs(s[i])) i++; };
  const markSafe = (pos: number) => { lastSafe = pos; lastSafeClosers = [...openers].reverse().join(""); };
  const fail = (): never => { throw TRUNC; };

  // String: assume s[i] === '"'. Retorna índice após a aspa de fechamento ou -1.
  const consumeString = (): number => {
    let j = i + 1;
    while (j < n) {
      const c = s[j];
      if (c === "\\") { j += 2; continue; }
      if (c === '"') return j + 1;
      j++;
    }
    return -1; // sem fechamento → truncado
  };
  // Número: só é "completo" se for um token válido E seguido por delimitador
  // (não pelo fim do buffer — aí pode estar cortado, ex.: "12" de "1234").
  const consumeNumber = (): number => {
    let j = i;
    while (j < n && /[0-9eE+.\-]/.test(s[j])) j++;
    if (j >= n) return -1; // chegou ao fim → ambíguo/truncado
    const tok = s.slice(i, j);
    return /^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?$/.test(tok) ? j : -1;
  };
  const consumeLiteral = (): number => {
    for (const lit of ["true", "false", "null"]) if (s.startsWith(lit, i)) return i + lit.length;
    return -1;
  };

  const parseValue = (): void => {
    skipWs();
    if (i >= n) fail();
    const c = s[i];
    if (c === '"') { const e = consumeString(); if (e < 0) fail(); i = e; markSafe(i); return; }
    if (c === "{") { parseObject(); return; }
    if (c === "[") { parseArray(); return; }
    if (c === "-" || (c >= "0" && c <= "9")) { const e = consumeNumber(); if (e < 0) fail(); i = e; markSafe(i); return; }
    const e = consumeLiteral(); if (e < 0) fail(); i = e; markSafe(i);
  };

  function parseObject(): void {
    i++; openers.push("}"); markSafe(i);          // objeto vazio já é fechável
    skipWs(); if (i >= n) fail();
    if (s[i] === "}") { i++; openers.pop(); markSafe(i); return; }
    while (true) {
      skipWs(); if (i >= n) fail();
      if (s[i] !== '"') fail();                   // esperava chave
      const e = consumeString(); if (e < 0) fail(); i = e; // chave: NÃO marca seguro
      skipWs(); if (i >= n || s[i] !== ":") fail(); i++;
      parseValue();                               // valor: marca seguro
      skipWs(); if (i >= n) fail();
      if (s[i] === ",") { i++; continue; }
      if (s[i] === "}") { i++; openers.pop(); markSafe(i); return; }
      fail();
    }
  }

  function parseArray(): void {
    i++; openers.push("]"); markSafe(i);          // array vazio já é fechável
    skipWs(); if (i >= n) fail();
    if (s[i] === "]") { i++; openers.pop(); markSafe(i); return; }
    while (true) {
      parseValue();                               // elemento: marca seguro
      skipWs(); if (i >= n) fail();
      if (s[i] === ",") { i++; continue; }
      if (s[i] === "]") { i++; openers.pop(); markSafe(i); return; }
      fail();
    }
  }

  try {
    parseValue();
    return null; // parse completo → não estava truncado, nada a reparar
  } catch (e) {
    if (e !== TRUNC) throw e;
    if (lastSafe < 0) return null;
    const head = s.slice(0, lastSafe).replace(/,\s*$/, "");
    return head + lastSafeClosers;
  }
}

// ── Extrai JSON da resposta da IA (com reparo de truncamento) ──────────────
// Centraliza o parse usado por `analisarEfetivo` e `simularEfetivo`: limpa
// cercas markdown, recorta do 1º "{" ao último "}" e, se o JSON vier cortado
// por estouro de tokens, tenta reparar com `repararJsonTruncado` (resultado
// PARCIAL + aviso suave). Lança se nem o reparo for aproveitável.
function extrairJsonIa(raw: string): { parsed: any; erroIa: string | null } {
  const cleaned = (raw || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  const jsonStr = firstBrace >= 0 && lastBrace > firstBrace ? cleaned.slice(firstBrace, lastBrace + 1) : cleaned;
  try {
    return { parsed: JSON.parse(jsonStr), erroIa: null };
  } catch (parseErr) {
    const reparado = repararJsonTruncado(firstBrace >= 0 ? cleaned.slice(firstBrace) : cleaned);
    if (reparado) {
      return {
        parsed: JSON.parse(reparado),
        erroIa: "A resposta foi gerada de forma parcial (a IA atingiu o limite de tamanho da resposta). Alguns itens podem estar incompletos — gere novamente se precisar do detalhamento completo.",
      };
    }
    throw parseErr;
  }
}

// ── Datas SEMPRE no padrão brasileiro ──────────────────────────────────────
// `isoParaBR` converte UMA string ISO ("YYYY-MM-DD", com ou sem hora) em
// "DD/MM/AAAA". `brDatasTexto` troca TODAS as ocorrências de datas ISO dentro
// de um texto livre (ex.: respostas da IA que ecoam a data crua). `brDatasDeep`
// percorre recursivamente o JSON da IA aplicando a conversão em toda string —
// garante que nenhuma data ISO vaze para a tela. Tudo aditivo e iOS-safe (não
// usa `new Date` na exibição, só regex de string).
function isoParaBR(s: any): string {
  const str = String(s ?? "").slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(s ?? "");
}
function brDatasTexto(s: string): string {
  // Captura datas ISO isoladas no meio do texto (com limites de palavra),
  // ignorando a parte de hora se houver. Ex.: "entrega em 2026-12-10" → "10/12/2026".
  return s.replace(/(?<![\d])(\d{4})-(\d{2})-(\d{2})(?:[T ]\d{2}:\d{2}(?::\d{2})?)?(?![\d])/g,
    (_full, y, mo, d) => `${d}/${mo}/${y}`);
}
function brDatasDeep<T>(obj: T): T {
  if (typeof obj === "string") return brDatasTexto(obj) as unknown as T;
  if (Array.isArray(obj)) return obj.map((v) => brDatasDeep(v)) as unknown as T;
  if (obj && typeof obj === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(obj as any)) out[k] = brDatasDeep(v);
    return out;
  }
  return obj;
}

// ── Coleta efetivo da obra × cronograma (compartilhado) ────────────────────
// Lê projeto+obra, escolhe a revisão (baseline > aprovada > última), agrega o
// efetivo atual por função/categoria MO/vínculo/status e separa as atividades
// folha em andamento + próximas 8 semanas (56d). SOMENTE LEITURA. Reusado por
// `analisarEfetivo`, `efetivoAtual` e `simularEfetivo`. A validação de tenancy
// fica na procedure (este helper assume o companyId já autorizado).
async function coletarEfetivoCronograma(db: any, projetoId: number, companyId: number) {
  // 1. Projeto + obra vinculada (escopado à empresa)
  const [projeto] = await db.select({
    id:     planejamentoProjetos.id,
    nome:   planejamentoProjetos.nome,
    obraId: planejamentoProjetos.obraId,
  }).from(planejamentoProjetos)
    .where(and(
      eq(planejamentoProjetos.id, projetoId),
      eq(planejamentoProjetos.companyId, companyId),
    ))
    .limit(1);
  if (!projeto) throw new Error("Projeto de planejamento não encontrado.");
  if (!projeto.obraId) throw new Error("Este cronograma não está vinculado a uma obra. Vincule a obra ao projeto para analisar o efetivo.");

  const [obra] = await db.select({ nome: obras.nome })
    .from(obras).where(eq(obras.id, projeto.obraId)).limit(1);

  // 2. Revisão a analisar: baseline > última aprovada > última
  const revisoes = await db.select({
    id:         planejamentoRevisoes.id,
    numero:     planejamentoRevisoes.numero,
    status:     planejamentoRevisoes.status,
    isBaseline: planejamentoRevisoes.isBaseline,
  }).from(planejamentoRevisoes)
    .where(eq(planejamentoRevisoes.projetoId, projeto.id))
    .orderBy(desc(planejamentoRevisoes.numero));
  const revisao = revisoes.find((r: any) => r.isBaseline)
    ?? revisoes.find((r: any) => r.status === "aprovada")
    ?? revisoes[0];
  if (!revisao) throw new Error("Nenhuma revisão de cronograma encontrada para este projeto. Importe o cronograma primeiro.");

  // 3. Efetivo atual da obra → agrega por função/cargo
  const allocs = await getObraFuncionarios(projeto.obraId);
  const jfs = await db.select({ nome: jobFunctions.nome, categoriaMO: jobFunctions.categoriaMO })
    .from(jobFunctions).where(eq(jobFunctions.companyId, companyId));
  const norm = (s: string) => (s || "").trim().toUpperCase();
  const catMap = new Map<string, string>();
  for (const jf of jfs) if (jf.nome) catMap.set(norm(jf.nome), jf.categoriaMO || "");
  const catLabel = (c: string) =>
    c === "direto" ? "Direto"
    : c === "indireta_obra" ? "Indireto (obra)"
    : c === "escritorio_central" ? "Indireto (escritório)"
    : "—";

  type CargoAgg = { cargo: string; categoria: string; total: number; ativos: number; indisponiveis: number; clt: number; terceiro: number; feriasHorizonte: number };
  const porCargoMap = new Map<string, CargoAgg>();
  // empId → dados básicos do alocado (p/ cruzar com férias na seção 4b).
  const empInfoById = new Map<number, { nome: string; cargo: string; categoria: string }>();
  // ids dos funcionários ATIVOS hoje (p/ abater só quem conta no efetivo disponível).
  const ativosIds = new Set<number>();
  let totalEfetivo = 0, totalAtivos = 0, totalIndisponiveis = 0;
  for (const a of allocs as any[]) {
    const emp: any = a.employee;
    if (!emp) continue;
    totalEfetivo++;
    const cargoNome = String(emp.funcao || emp.cargo || "Sem função").trim();
    const key = norm(cargoNome);
    if (!porCargoMap.has(key)) {
      porCargoMap.set(key, { cargo: cargoNome, categoria: catLabel(catMap.get(key) || ""), total: 0, ativos: 0, indisponiveis: 0, clt: 0, terceiro: 0, feriasHorizonte: 0 });
    }
    const g = porCargoMap.get(key)!;
    g.total++;
    if (emp.status === "Ativo") { g.ativos++; totalAtivos++; if (emp.id != null) ativosIds.add(emp.id); }
    else { g.indisponiveis++; totalIndisponiveis++; }
    const vinc = String(emp.tipoContrato || "").toUpperCase();
    if (vinc.includes("CLT")) g.clt++;
    else if (vinc) g.terceiro++;
    if (emp.id != null && !empInfoById.has(emp.id)) {
      empInfoById.set(emp.id, {
        nome: String(emp.nomeCompleto || emp.nome || "Funcionário").trim(),
        cargo: cargoNome,
        categoria: catLabel(catMap.get(key) || ""),
      });
    }
  }
  const porCargo = Array.from(porCargoMap.values()).sort((a, b) => b.total - a.total);

  // 4. Atividades folha — em andamento + próximas 8 semanas (56 dias)
  const ativsRaw = await db.select({
    nome:             planejamentoAtividades.nome,
    eapCodigo:        planejamentoAtividades.eapCodigo,
    dataInicio:       planejamentoAtividades.dataInicio,
    dataFim:          planejamentoAtividades.dataFim,
    pesoFinanceiro:   planejamentoAtividades.pesoFinanceiro,
    recursoPrincipal: planejamentoAtividades.recursoPrincipal,
    isGrupo:          planejamentoAtividades.isGrupo,
    isMarco:          planejamentoAtividades.isMarco,
  }).from(planejamentoAtividades).where(eq(planejamentoAtividades.revisaoId, revisao.id));

  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const horizonte = new Date(hoje); horizonte.setDate(horizonte.getDate() + 56);
  const parseDt = (s: any): Date | null => {
    if (!s) return null;
    const d = new Date(String(s).slice(0, 10) + "T00:00:00");
    return isNaN(d.getTime()) ? null : d;
  };
  const peso = (a: any) => parseFloat(a.pesoFinanceiro || "0") || 0;
  const emAndamento: any[] = [];
  const proximas: any[] = [];
  for (const a of ativsRaw as any[]) {
    if (a.isGrupo || a.isMarco) continue;
    const ini = parseDt(a.dataInicio), fim = parseDt(a.dataFim);
    if (!ini || !fim) continue;
    if (ini <= hoje && fim >= hoje) emAndamento.push(a);
    else if (ini > hoje && ini <= horizonte) proximas.push(a);
  }
  emAndamento.sort((a, b) => peso(b) - peso(a));
  proximas.sort((a, b) => peso(b) - peso(a));

  // Rev. 2593: anota cada atividade com o PAVIMENTO inferido (nome + EAP) e monta
  // a lista ordenada de pavimentos detectados (base → topo) p/ a IA desenhar a
  // Linha de Balanço e o Plano por Pavimento sobre as unidades REAIS da obra.
  const pavOrdem = new Map<string, number>();
  for (const a of [...emAndamento, ...proximas]) {
    const p = detectarPavimento(`${a.nome ?? ""} ${a.eapCodigo ?? ""}`);
    (a as any).__pav = p ? p.label : null;
    if (p && !pavOrdem.has(p.label)) pavOrdem.set(p.label, p.ordem);
  }
  const pavimentosDetectados = Array.from(pavOrdem.entries())
    .sort((x, y) => x[1] - y[1])
    .map(([label]) => label);
  const pavimentosTxt = pavimentosDetectados.length === 0
    ? "  (Não foi possível inferir pavimentos a partir dos nomes/EAP das atividades — trate a obra como uma frente única ou use blocos/eixos.)"
    : pavimentosDetectados.map((p, i) => `  ${i + 1}. ${p}`).join("\n");

  const fmtAtiv = (a: any) =>
    `  - [${a.eapCodigo ?? "?"}] ${a.nome} (${isoParaBR(a.dataInicio)} → ${isoParaBR(a.dataFim)}) | Peso ${peso(a).toFixed(2)}%${(a as any).__pav ? ` | Pavimento: ${(a as any).__pav}` : ""}${a.recursoPrincipal ? ` | Recurso: ${a.recursoPrincipal}` : ""}`;

  // 4b. Férias dos alocados (RH › Férias) × impacto no efetivo/prazo. Cruza os
  // funcionários alocados com `vacation_periods`, lista os períodos de gozo ainda
  // relevantes (fim >= hoje) com a ORDEM do parcelamento (1º/2º/3º período).
  // REGRA DE NEGÓCIO (definida pelo usuário): 2º período é INADIÁVEL — o
  // funcionário SAI de férias; 1º período PODE ser remanejado/negociado SE a
  // função for imprescindível pra manter o prazo. SOMENTE LEITURA.
  type FeriasPeriodo = {
    empId: number; nome: string; cargo: string; categoria: string; ordem: number;
    inicio: Date; fim: Date; dias: number; status: string;
    bucket: "em_gozo" | "proximas" | "futuro"; impactaProximas: boolean;
    inadiavel: boolean; motivoInadiavel: string;
  };
  const fmtDBR = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  const feriasPeriodos: FeriasPeriodo[] = [];
  const empIdsAlloc = Array.from(empInfoById.keys());
  if (empIdsAlloc.length > 0) {
    const vps = await db.select({
      employeeId:     vacationPeriods.employeeId,
      dataInicio:     vacationPeriods.dataInicio,
      dataFim:        vacationPeriods.dataFim,
      periodo2Inicio: vacationPeriods.periodo2Inicio,
      periodo2Fim:    vacationPeriods.periodo2Fim,
      periodo3Inicio: vacationPeriods.periodo3Inicio,
      periodo3Fim:    vacationPeriods.periodo3Fim,
      status:         vacationPeriods.status,
      concessivoFim:  vacationPeriods.periodoConcessivoFim,
      vencida:        vacationPeriods.vencida,
    }).from(vacationPeriods).where(and(
      eq(vacationPeriods.companyId, companyId),
      inArray(vacationPeriods.employeeId, empIdsAlloc),
      sql`${vacationPeriods.status} IN ('pendente','agendada','em_gozo')`,
      isNull(vacationPeriods.deletedAt),
    ));
    const diffDias = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
    for (const v of vps as any[]) {
      const info = empInfoById.get(v.employeeId);
      if (!info) continue;
      // Situação legal da FÉRIA (vale pra todas as frações da mesma linha):
      // prazo concessivo (deadline legal pra gozar) e flag de vencida.
      const concFim = parseDt(v.concessivoFim);
      const statusVencida = String(v.status || "").toLowerCase() === "vencida" || Number(v.vencida) === 1;
      const pares: Array<[number, any, any]> = [
        [1, v.dataInicio, v.dataFim],
        [2, v.periodo2Inicio, v.periodo2Fim],
        [3, v.periodo3Inicio, v.periodo3Fim],
      ];
      for (const [ordem, ini, fim] of pares) {
        const di = parseDt(ini), df = parseDt(fim);
        if (!di || !df) continue;
        if (df < hoje) continue; // período já encerrado — irrelevante
        const emGozo = di <= hoje && df >= hoje;
        const prox = di > hoje && di <= horizonte;
        // Classificação INADIÁVEL × REMANEJÁVEL — ROBUSTA, não depende só da ordem:
        // um 1º período também é INADIÁVEL quando a lei obriga o gozo (já vencida
        // ou prazo concessivo vencendo) ou quando já está em gozo. Margem de 45
        // dias entre o fim do gozo e o concessivo = "sem folga legal pra adiar".
        const diasAteVencer = concFim ? Math.round((concFim.getTime() - df.getTime()) / 86400000) : null;
        const concExpirado = concFim != null && concFim < hoje;       // prazo legal JÁ passou
        const vencendo = diasAteVencer != null && diasAteVencer >= 0 && diasAteVencer <= 45; // a ≤45d de estourar
        let inadiavel = false, motivoInadiavel = "";
        if (ordem >= 2) { inadiavel = true; motivoInadiavel = `${ordem}º período — saldo final por lei`; }
        else if (emGozo) { inadiavel = true; motivoInadiavel = "já em gozo (não interromper)"; }
        else if (statusVencida || concExpirado) { inadiavel = true; motivoInadiavel = `férias VENCIDAS${concFim ? ` — prazo concessivo expirou em ${fmtDBR(concFim)}` : ""} — gozo obrigatório (passivo em dobro)`; }
        else if (vencendo) { inadiavel = true; motivoInadiavel = `prazo concessivo vence ${concFim ? fmtDBR(concFim) : "em breve"} — sem folga p/ adiar`; }
        feriasPeriodos.push({
          empId: v.employeeId, nome: info.nome, cargo: info.cargo, categoria: info.categoria, ordem,
          inicio: di, fim: df, dias: diffDias(di, df), status: v.status,
          bucket: emGozo ? "em_gozo" : prox ? "proximas" : "futuro",
          impactaProximas: emGozo || prox,
          inadiavel, motivoInadiavel,
        });
      }
    }
    feriasPeriodos.sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
  }
  const bucketLabel = (b: string) => b === "em_gozo" ? "EM GOZO AGORA" : b === "proximas" ? "PRÓXIMAS 8 SEMANAS" : "FUTURO";

  // 4c. Abatimento DETERMINÍSTICO de férias no horizonte (próximas 8 semanas):
  // conta, por função, os funcionários ATIVOS hoje que ENTRAM de férias INADIÁVEIS
  // dentro do horizonte (bucket "proximas"). Quem já está em gozo agora já saiu de
  // "ativos" (status ≠ "Ativo"), então NÃO entra aqui — evita dupla contagem.
  // O 1º período REMANEJÁVEL não abate (pode ser negociado se a função for imprescindível).
  const feriasHorizPorCargo = new Map<string, Set<number>>();
  for (const f of feriasPeriodos) {
    if (f.bucket !== "proximas" || !f.inadiavel) continue;
    if (!ativosIds.has(f.empId)) continue;
    const ck = norm(f.cargo);
    if (!feriasHorizPorCargo.has(ck)) feriasHorizPorCargo.set(ck, new Set());
    feriasHorizPorCargo.get(ck)!.add(f.empId);
  }
  for (const [ck, set] of feriasHorizPorCargo) {
    const g = porCargoMap.get(ck);
    if (g) g.feriasHorizonte = set.size;
  }

  // 5. Blocos textuais para os prompts
  const efetivoTxt = porCargo.length === 0
    ? "(Nenhum funcionário alocado nesta obra atualmente.)"
    : porCargo.map(c =>
        `  - ${c.cargo} [${c.categoria}]: ${c.total} (ativos: ${c.ativos}, indisponíveis: ${c.indisponiveis}, CLT: ${c.clt}, terceiro: ${c.terceiro})`
      ).join("\n");
  const emAndTxt = emAndamento.length === 0
    ? "  (Nenhuma atividade em andamento na data de hoje.)"
    : emAndamento.slice(0, 50).map(fmtAtiv).join("\n") + (emAndamento.length > 50 ? `\n  ... e mais ${emAndamento.length - 50} atividades em andamento.` : "");
  const proxTxt = proximas.length === 0
    ? "  (Nenhuma atividade iniciando nas próximas 8 semanas.)"
    : proximas.slice(0, 50).map(fmtAtiv).join("\n") + (proximas.length > 50 ? `\n  ... e mais ${proximas.length - 50} atividades nas próximas semanas.` : "");

  const feriasTxt = feriasPeriodos.length === 0
    ? "  (Nenhuma férias agendada/em gozo para os funcionários alocados nesta obra.)"
    : feriasPeriodos.slice(0, 40).map(f =>
        `  - ${f.nome} [${f.cargo} · ${f.categoria}] — ${f.ordem}º período | ${f.inadiavel ? `INADIÁVEL (${f.motivoInadiavel})` : "REMANEJÁVEL se imprescindível"} | ${fmtDBR(f.inicio)} → ${fmtDBR(f.fim)} (${f.dias}d) | ${bucketLabel(f.bucket)} | status: ${f.status}`
      ).join("\n") + (feriasPeriodos.length > 40 ? `\n  ... e mais ${feriasPeriodos.length - 40} períodos de férias.` : "");

  // Resumo: pessoas distintas de férias por função no horizonte (próximas 8 sem
  // + em gozo). É o impacto direto na disponibilidade do efetivo.
  const ausentesPorCargo = new Map<string, Set<number>>();
  for (const f of feriasPeriodos) {
    if (!f.impactaProximas) continue;
    if (!ausentesPorCargo.has(f.cargo)) ausentesPorCargo.set(f.cargo, new Set());
    ausentesPorCargo.get(f.cargo)!.add(f.empId);
  }
  const feriasResumoTxt = ausentesPorCargo.size === 0
    ? "  (Nenhum impacto de férias previsto no horizonte das próximas 8 semanas.)"
    : Array.from(ausentesPorCargo.entries()).sort((a, b) => b[1].size - a[1].size)
        .map(([cargo, set]) => `  - ${cargo}: ${set.size} pessoa(s) de férias no horizonte`).join("\n");
  const totalFeriasHorizonte = Array.from(ausentesPorCargo.values()).reduce((acc, s) => acc + s.size, 0);

  return {
    projeto, obra, revisao, porCargo,
    totalEfetivo, totalAtivos, totalIndisponiveis,
    emAndamento, proximas, hoje,
    efetivoTxt, emAndTxt, proxTxt,
    feriasPeriodos, feriasTxt, feriasResumoTxt, totalFeriasHorizonte,
    pavimentosDetectados, pavimentosTxt,
  };
}

// Persiste uma análise de Efetivo × IA (diagnóstico ou simulação) p/ consulta
// futura. BEST-EFFORT: nunca derruba a resposta principal — erros (ex.: tabela
// ausente em algum ambiente) são apenas logados. `resultado` guarda o retorno
// completo da procedure p/ reabrir o detalhe no histórico. SOMENTE INSERT.
async function salvarAnaliseEfetivo(
  db: any,
  rec: {
    projetoId: number; companyId: number; tipo: "diagnostico" | "simulacao";
    veredito: string | null; titulo: string | null; obra: string | null;
    revisaoNumero: number | null; resultado: any; erroIa: string | null;
    criadoPor: string | null;
  },
): Promise<number | null> {
  try {
    const [row] = await db.insert(planejamentoAnalisesEfetivo).values({
      projetoId:     rec.projetoId,
      companyId:     rec.companyId,
      tipo:          rec.tipo,
      // Rev. 2592: `veredito` é varchar(40). A IA às vezes devolve uma frase
      // longa (ex.: o `diagnostico` do analisarEfetivo) → INSERT estourava
      // "value too long for type character varying(40)" e o catch best-effort
      // engolia o erro → NADA salvava no Histórico. Truncar a 40 (como
      // titulo/obra). Code-only, ZERO schema/ALTER/DROP/DELETE.
      veredito:      (rec.veredito ?? "").slice(0, 40) || null,
      titulo:        (rec.titulo ?? "").slice(0, 400) || null,
      obra:          (rec.obra ?? "").slice(0, 300) || null,
      revisaoNumero: rec.revisaoNumero ?? null,
      resultado:     rec.resultado ?? {},
      contexto:      {},
      erroIa:        rec.erroIa ?? null,
      criadoPor:     rec.criadoPor ?? null,
    }).returning({ id: planejamentoAnalisesEfetivo.id });
    return row?.id ?? null;
  } catch (err: any) {
    console.error("[salvarAnaliseEfetivo] falha ao persistir (ignorado):", err?.message ?? err);
    return null;
  }
}

// ── Detect if activity is weather-sensitive ───────────────────────────────
const ATIVIDADES_EXTERNAS = [
  "concreto", "concretagem", "concret", "escav", "fundaç", "fundacao",
  "estaca", "armação", "armacao", "aço", "estrutura", "iça", "içamento",
  "anda", "andaime", "cobert", "telhad", "paviment", "demoli",
  "terraplan", "drenag", "esgoto", "agua", "saneam", "viaduto",
  "pontes", "ponte", "alvenari", "reboc", "chapisco", "emboco",
  "impermeabil", "pintura extern", "moviment", "aterro",
];

function isAtividadeExterna(nome: string): boolean {
  const n = nome.toLowerCase();
  return ATIVIDADES_EXTERNAS.some(k => n.includes(k));
}

// ── Detecta o PAVIMENTO/unidade repetitiva a partir do nome/EAP da atividade ──
// Rev. 2593: a Linha de Balanço e o Plano por Pavimento precisam saber em QUE
// pavimento cada atividade acontece. Como o cronograma não tem uma coluna de
// pavimento, inferimos do texto (nome + código EAP). Retorna um rótulo
// normalizado e uma `ordem` numérica para ordenar de baixo (subsolo) para cima
// (cobertura). iOS-safe (sem new Date / lookbehind).
function detectarPavimento(texto: string): { label: string; ordem: number } | null {
  const t = (texto || "").toLowerCase();
  // Subsolo (com ou sem número): subsolo, 2º subsolo, subsolo 1
  let m = t.match(/(\d+)\s*[ºo°]?\s*subsolo/) || t.match(/subsolo\s*(\d+)/);
  if (m) { const n = parseInt(m[1], 10) || 1; return { label: `${n}º Subsolo`, ordem: -100 - n }; }
  if (/\bsubsolo\b/.test(t)) return { label: "Subsolo", ordem: -100 };
  if (/\bembasamento\b|\bfunda(ç|c)(ã|a)o\b|\bbaldrame\b/.test(t)) return { label: "Embasamento", ordem: -50 };
  if (/\bt(é|e)rreo\b|pavimento\s+t(é|e)rreo|\bpav\.?\s*t(é|e)rreo/.test(t)) return { label: "Térreo", ordem: 0 };
  if (/\bmezanino\b/.test(t)) return { label: "Mezanino", ordem: 1 };
  // Pavimento/andar numerado: "pavimento 6", "pav 6", "6º pavimento", "6° andar", "6 pav"
  m = t.match(/pavimento\s*(\d+)/) || t.match(/\bpav\.?\s*(\d+)/) || t.match(/(\d+)\s*[ºo°]\s*(?:pav|pavimento|andar)/) || t.match(/(\d+)\s*[ºo°]?\s*andar/);
  if (m) { const n = parseInt(m[1], 10); if (!isNaN(n)) return { label: `Pav. ${n}`, ordem: n + 10 }; }
  if (/casa\s+de\s+m(á|a)quinas|\bcasa\s+m(á|a)q/.test(t)) return { label: "Casa de Máquinas", ordem: 9300 };
  if (/\bbarrilete\b/.test(t)) return { label: "Barrilete", ordem: 9200 };
  if (/reservat(ó|o)rio\s+superior|\bbarril(é|e)te\b/.test(t)) return { label: "Reservatório", ordem: 9100 };
  if (/\b(á|a)tico\b/.test(t)) return { label: "Ático", ordem: 9050 };
  if (/\bcobertura\b/.test(t)) return { label: "Cobertura", ordem: 9000 };
  return null;
}

// Rev. 2596 — A fonte ÚNICA dos NOMES e da NUMERAÇÃO dos pavimentos é o ERP
// (`pavimentosDetectados`, extraídos do cronograma real). A IA costuma parafrasear
// os rótulos ("Pav. 6" → "Pavimento 6") ou inventar "Pavimento 1..N", o que fazia
// a Linha de Balanço mostrar nome/numeração ERRADOS. Aqui forçamos o eixo do
// gráfico a usar os nomes REAIS do cronograma e realinhamos as diagonais por NOME
// (match normalizado/por número), com fallback por índice.
function normalizarChavePav(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove acentos (iOS-safe)
    .replace(/pavimento/g, "pav")
    .replace(/andar/g, "pav")
    .replace(/(\d)\s*[ºo°]/g, "$1") // ordinal após dígito (6º/6o/6°) → 6 (NÃO remove "o" comum)
    .replace(/[º°.\-_/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function indicePavPorNome(nome: string, pavList: string[]): number {
  const alvo = normalizarChavePav(nome);
  if (!alvo) return -1;
  // 1) match normalizado exato
  let i = pavList.findIndex(p => normalizarChavePav(p) === alvo);
  if (i >= 0) return i;
  // 2) match por número (ex.: "pavimento 6" ~ "pav 6")
  const nAlvo = (alvo.match(/(\d+)/) || [])[1];
  if (nAlvo) {
    i = pavList.findIndex(p => {
      const k = normalizarChavePav(p);
      const np = (k.match(/(\d+)/) || [])[1];
      return np === nAlvo && /pav/.test(k);
    });
    if (i >= 0) return i;
  }
  // 3) contains (um contém o outro)
  i = pavList.findIndex(p => { const k = normalizarChavePav(p); return k.includes(alvo) || alvo.includes(k); });
  return i;
}
// Reescreve `linhaBalancoPavimentos` para usar os pavimentos REAIS do cronograma.
function forcarPavimentosReais(parsed: any, pavimentosDetectados: string[]): void {
  if (!parsed || typeof parsed !== "object" || !Array.isArray(pavimentosDetectados) || pavimentosDetectados.length === 0) return;
  const lob = parsed?.planoAtaque?.linhaBalancoPavimentos;
  if (!lob || typeof lob !== "object") return;
  const iaPavs: string[] = Array.isArray(lob.pavimentos) ? lob.pavimentos.map((p: any) => String(p ?? "")) : [];
  const pavList = [...pavimentosDetectados];
  const ativs = Array.isArray(lob.atividades) ? lob.atividades : [];
  const clamp = (idx: number) => Math.max(0, Math.min(pavList.length - 1, idx));
  for (const a of ativs) {
    if (!a || typeof a !== "object") continue;
    const oldIni = Math.round(Number(a.pavInicio)) || 1;
    const oldFim = Math.round(Number(a.pavFim)) || oldIni;
    const nomeIni = String(a.pavInicioNome ?? iaPavs[oldIni - 1] ?? "").trim();
    const nomeFim = String(a.pavFimNome ?? iaPavs[oldFim - 1] ?? "").trim();
    let pi = indicePavPorNome(nomeIni, pavList);
    let pf = indicePavPorNome(nomeFim, pavList);
    if (pi < 0) pi = clamp(oldIni - 1);
    if (pf < 0) pf = clamp(oldFim - 1);
    a.pavInicio = pi + 1;
    a.pavFim = pf + 1;
  }
  lob.pavimentos = pavList;
}

// ── Build AI system prompt ────────────────────────────────────────────────
function buildSystemPrompt(conhecimentos: any[]): string {
  const baseKnowledge = conhecimentos.length > 0
    ? `\n\n## Base de Conhecimento Acumulada (${conhecimentos.length} registros confirmados):\n` +
      conhecimentos.slice(0, 15).map(k =>
        `- **${k.palavrasChave}**: Equip: ${JSON.stringify(k.recursosEquipamentos)} | Efetivo: ${JSON.stringify(k.recursosEfetivo)}`
      ).join("\n")
    : "";

  return `Você é o **JULINHO — Assistente IA de Gestão de Obras** da FC Engenharia.

Você é um especialista sênior em gestão de projetos de construção civil brasileira, com profundo conhecimento em:
- Planejamento e controle de obras (PMBOK, Last Planner System)
- Método do Caminho Crítico (CPM) e análise de impactos em prazos
- Análise de avanço físico e financeiro
- Gestão de recursos (equipamentos, efetivo, materiais)
- Impacto climático em atividades de construção
- Normas brasileiras (NBR, NRs) aplicáveis à construção
- Estratégias de recuperação de prazo e planos de ataque
- Estimativa de recursos por tipo de atividade

## Sua Missão:
1. **Análise contínua**: Identificar riscos, desvios e oportunidades no cronograma
2. **Planos de ataque**: Sugerir estratégias concretas e executáveis para recuperar prazo
3. **Gestão de recursos**: Estimar equipamentos e efetivo necessário por atividade
4. **Impacto climático**: Vincular previsão do tempo às atividades da semana e gerar alertas
5. **Simulação de cenários**: Analisar impacto de diferentes decisões no prazo final
6. **Aprendizado**: Registrar boas práticas para aplicar em futuros projetos

## Regras de Comportamento:
- Responda SEMPRE em português brasileiro
- Seja direto, técnico e objetivo — você está falando com engenheiros e gestores
- Quando sugerir recursos, seja específico (ex: "1 caminhão betoneira 8m³", "6 armadores + 2 serventes")
- Cite % de impacto quando possível (ex: "pode atrasar 3 dias na atividade crítica X")
- Use emojis de forma profissional para facilitar leitura (⚠️ alerta, ✅ ok, 🔴 crítico, 🟡 atenção)
- Estruture respostas com headers quando forem longas
- Para planos de ataque, apresente sempre em formato: Ação → Impacto → Prazo para executar${baseKnowledge}`;
}

export const iaCronogramaRouter = router({

  // ── Chat com contexto completo do cronograma ──────────────────────────
  chat: protectedProcedure
    .input(z.object({
      projetoId:  z.number(),
      sessaoId:   z.string(),
      mensagem:   z.string(),
      tipo:       z.enum(["chat", "cenario", "recursos"]).default("chat"),
      contexto:   z.object({
        atividadesSemana: z.array(z.any()).optional(),
        clima:            z.any().optional(),
        alertasAtivos:    z.number().optional(),
        atividadesAtrasadas: z.array(z.any()).optional(),
      }).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertAiModuleEnabled(await companyIdDoProjeto(input.projetoId), "planejamento");
      const db = await getDb();
      const companyId = (ctx.user as any).companyId;

      const [projeto, revisoes, conhecimentos] = await Promise.all([
        db.select().from(planejamentoProjetos).where(eq(planejamentoProjetos.id, input.projetoId)).limit(1),
        db.select().from(planejamentoRevisoes)
          .where(eq(planejamentoRevisoes.projetoId, input.projetoId))
          .orderBy(desc(planejamentoRevisoes.numero))
          .limit(1),
        db.select().from(iaCronogramaConhecimento)
          .where(or(isNull(iaCronogramaConhecimento.companyId), eq(iaCronogramaConhecimento.companyId, companyId)))
          .orderBy(desc(iaCronogramaConhecimento.confirmacoes))
          .limit(30),
      ]);

      const proj = projeto[0];
      const rev = revisoes[0];

      let atividades: any[] = [];
      if (rev) {
        atividades = await db.select().from(planejamentoAtividades)
          .where(eq(planejamentoAtividades.revisaoId, rev.id))
          .orderBy(planejamentoAtividades.ordem)
          .limit(200);
      }

      const hoje = new Date();
      const semanaIni = new Date(hoje); semanaIni.setDate(hoje.getDate() - hoje.getDay() + 1);
      const semanaFim = new Date(semanaIni); semanaFim.setDate(semanaIni.getDate() + 6);
      const toDate = (d: Date) => d.toISOString().split("T")[0];

      const atividadesSemana = atividades.filter(a => a.dataInicio && a.dataFim &&
        a.dataFim >= toDate(semanaIni) && a.dataInicio <= toDate(semanaFim) && !a.isGrupo
      );
      const atrasadas = atividades.filter(a => a.dataFim && a.dataFim < toDate(hoje) && !a.isGrupo);

      const historicoDb = await db.select().from(iaCronogramaChat)
        .where(and(eq(iaCronogramaChat.projetoId, input.projetoId), eq(iaCronogramaChat.sessaoId, input.sessaoId)))
        .orderBy(iaCronogramaChat.criadoEm)
        .limit(20);

      const clima = input.contexto?.clima;
      const climaTexto = clima ? `
Previsão do tempo (próximos 7 dias):
${(clima.diasUteis ?? []).map((d: any) => `  - ${d.dt}: chuva ${d.chuva}mm, prob ${d.probChuva}%, vento ${d.vento}km/h`).join("\n")}` : "Clima não disponível.";

      const contextoProjeto = `
# Contexto do Projeto
**Projeto**: ${proj?.nome ?? "Desconhecido"} | **Local**: ${proj?.local ?? "N/A"}
**Período**: ${proj?.dataInicio ?? "?"} → ${proj?.dataTerminoContratual ?? "?"}
**Revisão ativa**: Rev. ${rev?.numero ?? "?"} | Total de atividades: ${atividades.length}
**Atividades na semana atual** (${toDate(semanaIni)} a ${toDate(semanaFim)}): ${atividadesSemana.length} atividades
**Atividades potencialmente atrasadas**: ${atrasadas.length}
${atividadesSemana.length > 0 ? `
Atividades desta semana:
${atividadesSemana.slice(0, 20).map(a => `  - [${a.eapCodigo ?? ""}] ${a.nome} | ${a.dataInicio}→${a.dataFim} | ${a.recursoPrincipal ?? "sem recurso"}`).join("\n")}` : ""}
${atrasadas.length > 0 ? `
Atividades atrasadas (amostra):
${atrasadas.slice(0, 10).map(a => `  - [${a.eapCodigo ?? ""}] ${a.nome} | prazo: ${a.dataFim}`).join("\n")}` : ""}

${climaTexto}`;

      const systemPrompt = buildSystemPrompt(conhecimentos);
      const mensagemComContexto = `${contextoProjeto}

---
**Pergunta do gestor:** ${input.mensagem}`;
      const messagesForLLM = [
        { role: "system" as const, content: systemPrompt },
        ...historicoDb.map(m => ({ role: m.role as "user" | "assistant", content: m.conteudo })),
        { role: "user" as const, content: mensagemComContexto },
      ];

      let resposta: string;
      try {
        const result = await invokeLLM({ messages: messagesForLLM, maxTokens: 2500 });
        const rawContent = result.choices?.[0]?.message?.content;
        resposta = typeof rawContent === "string" ? rawContent : "Não foi possível processar. Tente novamente.";
      } catch (err: any) {
        const isNoKey = err?.message?.includes("not configured");
        resposta = isNoKey
          ? "⚠️ **JULINHO offline** — Chave de API de IA não configurada. Acesse as configurações do projeto e defina a variável `OPENAI_API_KEY` para ativar o assistente."
          : `⚠️ **Erro ao contatar IA** — ${err?.message ?? "Erro desconhecido"}. Tente novamente em instantes.`;
        // Save to chat but return friendly message
        await db.insert(iaCronogramaChat).values([
          { projetoId: input.projetoId, companyId, sessaoId: input.sessaoId, role: "user",      conteudo: input.mensagem, tipo: input.tipo },
          { projetoId: input.projetoId, companyId, sessaoId: input.sessaoId, role: "assistant", conteudo: resposta,       tipo: input.tipo },
        ]);
        return { resposta, sessaoId: input.sessaoId, erro: true };
      }

      await db.insert(iaCronogramaChat).values([
        { projetoId: input.projetoId, companyId, sessaoId: input.sessaoId, role: "user",      conteudo: input.mensagem, tipo: input.tipo },
        { projetoId: input.projetoId, companyId, sessaoId: input.sessaoId, role: "assistant", conteudo: resposta,       tipo: input.tipo },
      ]);

      return { resposta, sessaoId: input.sessaoId };
    }),

  // ── Recuperar histórico do chat ────────────────────────────────────────
  historico: protectedProcedure
    .input(z.object({ projetoId: z.number(), sessaoId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      return db.select().from(iaCronogramaChat)
        .where(and(eq(iaCronogramaChat.projetoId, input.projetoId), eq(iaCronogramaChat.sessaoId, input.sessaoId)))
        .orderBy(iaCronogramaChat.criadoEm);
    }),

  // ── Limpar histórico da sessão ─────────────────────────────────────────
  limparHistorico: protectedProcedure
    .input(z.object({ projetoId: z.number(), sessaoId: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.delete(iaCronogramaChat)
        .where(and(eq(iaCronogramaChat.projetoId, input.projetoId), eq(iaCronogramaChat.sessaoId, input.sessaoId)));
      return { ok: true };
    }),

  // ── Gerar alertas clima × atividades ─────────────────────────────────
  gerarAlertasClima: protectedProcedure
    .input(z.object({
      projetoId: z.number(),
      clima: z.object({
        diasUteis: z.array(z.object({
          dt: z.string(),
          code: z.number(),
          chuva: z.number(),
          probChuva: z.number(),
          vento: z.number(),
        })),
      }),
    }))
    .mutation(async ({ input }) => {
      await assertAiModuleEnabled(await companyIdDoProjeto(input.projetoId), "planejamento");
      const db = await getDb();
      const rev = await db.select().from(planejamentoRevisoes)
        .where(eq(planejamentoRevisoes.projetoId, input.projetoId))
        .orderBy(desc(planejamentoRevisoes.numero))
        .limit(1);
      if (!rev[0]) return { alertas: [], gerados: 0 };

      const atividades = await db.select().from(planejamentoAtividades)
        .where(eq(planejamentoAtividades.revisaoId, rev[0].id));

      const novosAlertas: any[] = [];

      for (const dia of input.clima.diasUteis) {
        const sev = wmoSeverity(dia.code, dia.chuva, dia.probChuva, dia.vento);
        if (!sev) continue;

        const atvsNoDia = atividades.filter(a =>
          !a.isGrupo && a.dataInicio && a.dataFim &&
          a.dataFim >= dia.dt && a.dataInicio <= dia.dt &&
          isAtividadeExterna(a.nome)
        );

        if (atvsNoDia.length > 0) {
          for (const atv of atvsNoDia.slice(0, 5)) {
            const jaExiste = await db.select({ id: iaCronogramaAlertas.id }).from(iaCronogramaAlertas)
              .where(and(
                eq(iaCronogramaAlertas.projetoId, input.projetoId),
                eq(iaCronogramaAlertas.atividadeId, atv.id),
                eq(iaCronogramaAlertas.dataAlerta, dia.dt),
                eq(iaCronogramaAlertas.tipoAlerta, sev.tipo),
              )).limit(1);
            if (jaExiste.length > 0) continue;

            novosAlertas.push({
              projetoId:     input.projetoId,
              atividadeId:   atv.id,
              nomeAtividade: atv.nome,
              dataAlerta:    dia.dt,
              tipoAlerta:    sev.tipo,
              severidade:    sev.sev,
              descricao:     `${sev.msg} — Atividade "${atv.nome}" está programada para ${dia.dt}.`,
            });
          }
        } else if (sev.sev === "critica" || sev.sev === "alta") {
          const jaExiste = await db.select({ id: iaCronogramaAlertas.id }).from(iaCronogramaAlertas)
            .where(and(
              eq(iaCronogramaAlertas.projetoId, input.projetoId),
              eq(iaCronogramaAlertas.dataAlerta, dia.dt),
              eq(iaCronogramaAlertas.tipoAlerta, sev.tipo),
              isNull(iaCronogramaAlertas.atividadeId),
            )).limit(1);
          if (jaExiste.length === 0) {
            novosAlertas.push({
              projetoId:  input.projetoId,
              dataAlerta: dia.dt,
              tipoAlerta: sev.tipo,
              severidade: sev.sev,
              descricao:  `${sev.msg} — Verifique as atividades externas do dia.`,
            });
          }
        }
      }

      if (novosAlertas.length > 0) {
        await db.insert(iaCronogramaAlertas).values(novosAlertas);
      }

      return { alertas: novosAlertas, gerados: novosAlertas.length };
    }),

  // ── Listar alertas ────────────────────────────────────────────────────
  listarAlertas: protectedProcedure
    .input(z.object({ projetoId: z.number(), somenteAtivos: z.boolean().default(true) }))
    .query(async ({ input }) => {
      const db = await getDb();
      const conds = [eq(iaCronogramaAlertas.projetoId, input.projetoId)];
      if (input.somenteAtivos) conds.push(eq(iaCronogramaAlertas.reconhecido, false));
      return db.select().from(iaCronogramaAlertas)
        .where(and(...conds))
        .orderBy(desc(iaCronogramaAlertas.geradoEm))
        .limit(50);
    }),

  // ── Reconhecer alerta ─────────────────────────────────────────────────
  reconhecerAlerta: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.update(iaCronogramaAlertas)
        .set({ reconhecido: true })
        .where(eq(iaCronogramaAlertas.id, input.id));
      return { ok: true };
    }),

  reconhecerTodosAlertas: protectedProcedure
    .input(z.object({ projetoId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.update(iaCronogramaAlertas)
        .set({ reconhecido: true })
        .where(and(eq(iaCronogramaAlertas.projetoId, input.projetoId), eq(iaCronogramaAlertas.reconhecido, false)));
      return { ok: true };
    }),

  // ── Simular cenário ───────────────────────────────────────────────────
  simularCenario: protectedProcedure
    .input(z.object({
      projetoId:   z.number(),
      titulo:      z.string(),
      descricao:   z.string(),
      tipoCenario: z.string().optional(),
      parametros:  z.record(z.string(), z.any()).optional(),
      mensagem:    z.string(),
      sessaoId:    z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertAiModuleEnabled(await companyIdDoProjeto(input.projetoId), "planejamento");
      const db = await getDb();
      const companyId = (ctx.user as any).companyId;

      const [projeto, revisoes, conhecimentos] = await Promise.all([
        db.select().from(planejamentoProjetos).where(eq(planejamentoProjetos.id, input.projetoId)).limit(1),
        db.select().from(planejamentoRevisoes)
          .where(eq(planejamentoRevisoes.projetoId, input.projetoId))
          .orderBy(desc(planejamentoRevisoes.numero))
          .limit(1),
        db.select().from(iaCronogramaConhecimento)
          .where(or(isNull(iaCronogramaConhecimento.companyId), eq(iaCronogramaConhecimento.companyId, companyId)))
          .orderBy(desc(iaCronogramaConhecimento.confirmacoes)).limit(20),
      ]);

      const proj = projeto[0];
      const rev = revisoes[0];

      let atividades: any[] = [];
      if (rev) {
        atividades = await db.select().from(planejamentoAtividades)
          .where(eq(planejamentoAtividades.revisaoId, rev.id)).limit(200);
      }

      const hoje = new Date().toISOString().split("T")[0];
      const atrasadas = atividades.filter(a => a.dataFim && a.dataFim < hoje && !a.isGrupo);

      const historicoCenario = await db.select().from(iaCronogramaChat)
        .where(and(eq(iaCronogramaChat.projetoId, input.projetoId), eq(iaCronogramaChat.sessaoId, input.sessaoId)))
        .orderBy(iaCronogramaChat.criadoEm).limit(15);

      // Extrair dados financeiros dos parâmetros, se enviados
      const p = input.parametros ?? {} as Record<string, any>;
      const valorContrato     = p["valorContrato"]      ? Number(p["valorContrato"])      : 0;
      const custoTotal        = p["custoTotal"]         ? Number(p["custoTotal"])         : 0;
      const margemPerc        = valorContrato > 0 && custoTotal > 0
        ? +((valorContrato - custoTotal) / valorContrato * 100).toFixed(1)
        : p["margemPercAtual"] ? Number(p["margemPercAtual"]) : null;
      const faturamentoMes    = p["faturamentoMesPrev"] ? Number(p["faturamentoMesPrev"]) : 0;
      const custoExtraEstimado = p["custoExtraEstimado"] ? Number(p["custoExtraEstimado"]) : 0;
      const diasAtrasoAtual   = p["diasAtrasoAtual"]    ? Number(p["diasAtrasoAtual"])    : 0;
      const spiAtual          = p["spiAtual"]           ? Number(p["spiAtual"])           : null;
      const avancoDesvio      = p["avancoDesvio"]       ? Number(p["avancoDesvio"])       : 0;

      const contextFinanceiro = valorContrato > 0 ? `
## Contexto Financeiro da Obra:
- Valor do Contrato (Venda): R$ ${valorContrato.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
- Custo Orçado Total: R$ ${custoTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
- Margem Bruta Prevista: ${margemPerc !== null ? margemPerc + "%" : "não informada"}
- Faturamento Previsto do Mês: R$ ${faturamentoMes.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
- Custo Extra Estimado do Cenário: R$ ${custoExtraEstimado.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
- Desvio Físico Acumulado: ${avancoDesvio.toFixed(1)}pp
- SPI Atual: ${spiAtual !== null ? spiAtual.toFixed(2) : "não informado"}
- Dias de atraso acumulado: ${diasAtrasoAtual} dias` : "";

      const hoje2 = new Date().toLocaleDateString("pt-BR");
      const systemPrompt = `Você é o JULINHO — Motor de Decisão Estratégica de Obras da FC Engenharia.
Analise a solicitação do gestor e retorne EXCLUSIVAMENTE um objeto JSON válido. NENHUM texto fora do JSON.

Estrutura obrigatória:
{
  "diagnostico": {
    "criticidade": "baixo|medio|alto|critico",
    "resumo": "2-3 frases descrevendo a situação atual com os dados reais",
    "causaRaiz": "causa principal do desvio ou problema identificado",
    "alertaPrincipal": "o que acontece concretamente se nenhuma ação for tomada"
  },
  "cenarios": [
    {
      "id": "A",
      "nome": "nome curto do cenário A",
      "abordagem": "descrição técnica em 1-2 frases de como funciona esta abordagem",
      "diasImpacto": 0,
      "custoAdicional": 0,
      "novaMargemPerc": 0.0,
      "prazoResultante": "Nova data estimada de término: DD/MM/AAAA",
      "impactoCaixa": "texto curto sobre efeito no fluxo de caixa das próximas medições",
      "riscos": "principal risco desta abordagem em 1 frase",
      "viabilidade": "alta|media|baixa",
      "pro": "maior vantagem desta opção em 1 frase",
      "contra": "maior desvantagem em 1 frase"
    },
    { "id": "B", "nome": "...", "abordagem": "...", "diasImpacto": 0, "custoAdicional": 0, "novaMargemPerc": 0.0, "prazoResultante": "...", "impactoCaixa": "...", "riscos": "...", "viabilidade": "alta|media|baixa", "pro": "...", "contra": "..." },
    { "id": "C", "nome": "...", "abordagem": "...", "diasImpacto": 0, "custoAdicional": 0, "novaMargemPerc": 0.0, "prazoResultante": "...", "impactoCaixa": "...", "riscos": "...", "viabilidade": "alta|media|baixa", "pro": "...", "contra": "..." }
  ],
  "recomendado": "A|B|C",
  "justificativa": "por que o cenário recomendado é o melhor para esta situação específica em 2-3 frases técnicas",
  "acoesImediatas": [
    "Ação concreta 1 — executar ESTA SEMANA com responsável e prazo",
    "Ação concreta 2",
    "Ação concreta 3",
    "Ação concreta 4"
  ],
  "indicadores": [
    "KPI 1: métrica a monitorar semanalmente e meta esperada",
    "KPI 2",
    "KPI 3"
  ]
}

Base de conhecimento disponível: ${conhecimentos.slice(0, 10).map(k => k.palavrasChave).join(", ") || "não configurada"}
Data de análise: ${hoje2}
Seja técnico, preciso com os números e realista. Não use valores fictícios — baseie-se nos dados fornecidos.`;

      const contextoProjeto = `DADOS DO PROJETO:
Projeto: ${proj?.nome ?? "não informado"}
Local: ${proj?.local ?? "não informado"}
Término contratual: ${proj?.dataTerminoContratual ?? "não informado"}
Atividades: total=${atividades.length} | atrasadas=${atrasadas.length}
${contextFinanceiro}

SOLICITAÇÃO:
Tipo: ${input.titulo}
Descrição: ${input.mensagem}`;

      const messagesForLLM = [
        { role: "system" as const, content: systemPrompt },
        { role: "user" as const, content: contextoProjeto },
      ];

      let resposta: string;
      try {
        const result = await invokeLLM({ messages: messagesForLLM, maxTokens: 4000, response_format: { type: "json_object" } });
        const rawContent = result.choices?.[0]?.message?.content;
        resposta = typeof rawContent === "string" ? rawContent : JSON.stringify({ diagnostico: { criticidade: "medio", resumo: "Não foi possível gerar análise.", causaRaiz: "—", alertaPrincipal: "—" }, cenarios: [], recomendado: null, justificativa: "—", acoesImediatas: [], indicadores: [] });
      } catch (err: any) {
        const isNoKey = err?.message?.includes("not configured");
        resposta = isNoKey
          ? "⚠️ **JULINHO offline** — Chave de API de IA não configurada. Defina `OPENAI_API_KEY` nas secrets do projeto para ativar o simulador."
          : `⚠️ **Erro ao contatar IA** — ${err?.message ?? "Erro desconhecido"}. Tente novamente.`;
      }

      const [cenario] = await db.insert(iaCronogramaCenarios).values({
        projetoId:   input.projetoId,
        companyId,
        titulo:      input.titulo,
        descricao:   input.descricao || input.mensagem.slice(0, 200),
        tipoCenario: input.tipoCenario ?? "outro",
        parametros:  input.parametros ?? {},
        resultadoIA: resposta,
        criadoPor:   (ctx.user as any).name ?? "Usuário",
      }).returning();

      await db.insert(iaCronogramaChat).values([
        { projetoId: input.projetoId, companyId, sessaoId: input.sessaoId, role: "user",      conteudo: `📊 **Cenário: ${input.titulo}**\n\n${input.mensagem}`, tipo: "cenario" },
        { projetoId: input.projetoId, companyId, sessaoId: input.sessaoId, role: "assistant", conteudo: resposta, tipo: "cenario" },
      ]);

      return { resposta, cenarioId: cenario.id };
    }),

  // ── Listar cenários salvos ────────────────────────────────────────────
  listarCenarios: protectedProcedure
    .input(z.object({ projetoId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      return db.select().from(iaCronogramaCenarios)
        .where(eq(iaCronogramaCenarios.projetoId, input.projetoId))
        .orderBy(desc(iaCronogramaCenarios.criadoEm))
        .limit(20);
    }),

  // ── Aprovar cenário ────────────────────────────────────────────────────
  aprovarCenario: protectedProcedure
    .input(z.object({
      cenarioId:           z.number(),
      planoAcao:           z.string().optional(),
      atividadesAfetadas:  z.array(z.object({ id: z.number(), nome: z.string(), aceleracao: z.string().optional() })).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      await db.update(iaCronogramaCenarios)
        .set({
          status:             "aprovado",
          aprovadoEm:         new Date(),
          aprovadoPor:        (ctx.user as any).name ?? "Usuário",
          planoAcao:          input.planoAcao ?? null,
          atividadesAfetadas: input.atividadesAfetadas ?? [],
        })
        .where(eq(iaCronogramaCenarios.id, input.cenarioId));
      return { ok: true };
    }),

  // ── Registrar monitoramento semanal do plano ───────────────────────────
  registrarMonitoramento: protectedProcedure
    .input(z.object({
      cenarioId:       z.number(),
      projetoId:       z.number(),
      semana:          z.string(),
      avancoReal:      z.number().optional(),
      spiFim:          z.number().optional(),
      custoRealizado:  z.number().optional(),
      observacao:      z.string().optional(),
      status:          z.enum(["no_prazo", "atrasado", "adiantado", "critico"]).default("no_prazo"),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const companyId = (ctx.user as any).companyId;
      await db.insert(iaCronogramaMonitoramento).values({
        cenarioId:      input.cenarioId,
        projetoId:      input.projetoId,
        companyId,
        semana:         input.semana,
        avancoReal:     input.avancoReal?.toString(),
        spiFim:         input.spiFim?.toString(),
        custoRealizado: input.custoRealizado?.toString(),
        observacao:     input.observacao,
        status:         input.status,
        registradoPor:  (ctx.user as any).name ?? "Usuário",
      });
      return { ok: true };
    }),

  // ── Listar monitoramento de um cenário ────────────────────────────────
  listarMonitoramento: protectedProcedure
    .input(z.object({ cenarioId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      return db.select().from(iaCronogramaMonitoramento)
        .where(eq(iaCronogramaMonitoramento.cenarioId, input.cenarioId))
        .orderBy(desc(iaCronogramaMonitoramento.semana))
        .limit(20);
    }),

  // ── Sugerir recursos para atividades da semana ───────────────────────
  sugerirRecursos: protectedProcedure
    .input(z.object({
      projetoId:       z.number(),
      atividades:      z.array(z.object({ id: z.number(), nome: z.string(), dataInicio: z.string().optional(), dataFim: z.string().optional() })),
      tipoObra:        z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertAiModuleEnabled(await companyIdDoProjeto(input.projetoId), "planejamento");
      const db = await getDb();
      const companyId = (ctx.user as any).companyId;

      const conhecimentos = await db.select().from(iaCronogramaConhecimento)
        .where(or(isNull(iaCronogramaConhecimento.companyId), eq(iaCronogramaConhecimento.companyId, companyId)))
        .orderBy(desc(iaCronogramaConhecimento.confirmacoes))
        .limit(50);

      const nomesAtividades = input.atividades.map(a => `- ${a.nome}`).join("\n");
      const baseTexto = conhecimentos.length > 0
        ? `\n\nBase de conhecimento disponível:\n${conhecimentos.slice(0, 15).map(k => `  ${k.palavrasChave}: ${JSON.stringify(k.recursosEquipamentos)}`).join("\n")}`
        : "";

      const prompt = `Você é um especialista em gestão de obras. Para cada atividade abaixo, sugira os recursos necessários (equipamentos e efetivo).
Tipo de obra: ${input.tipoObra ?? "construção civil"}${baseTexto}

Atividades da semana:
${nomesAtividades}

Responda com um JSON no formato:
{
  "sugestoes": [
    {
      "atividade": "nome da atividade",
      "equipamentos": ["equipamento 1", "equipamento 2"],
      "efetivo": ["cargo/qtd", "cargo/qtd"],
      "observacao": "observação breve"
    }
  ]
}`;

      let sugestoes: any[] = [];
      try {
        const result = await invokeLLM({
          messages: [{ role: "user", content: prompt }],
          maxTokens: 1200,
          responseFormat: { type: "json_object" },
        });
        const rawContent = result.choices?.[0]?.message?.content;
        try {
          const parsed = JSON.parse(typeof rawContent === "string" ? rawContent : "{}");
          sugestoes = parsed.sugestoes ?? [];
        } catch { sugestoes = []; }
      } catch { sugestoes = []; }

      for (const sug of sugestoes) {
        const jaExiste = await db.select({ id: iaCronogramaConhecimento.id }).from(iaCronogramaConhecimento)
          .where(and(
            ilike(iaCronogramaConhecimento.palavrasChave, `%${sug.atividade.slice(0, 30)}%`),
            or(isNull(iaCronogramaConhecimento.companyId), eq(iaCronogramaConhecimento.companyId, companyId)),
          )).limit(1);

        if (jaExiste.length === 0) {
          await db.insert(iaCronogramaConhecimento).values({
            companyId,
            palavrasChave:        sug.atividade,
            tipoAtividade:        input.tipoObra ?? "geral",
            recursosEquipamentos: sug.equipamentos ?? [],
            recursosEfetivo:      sug.efetivo ?? [],
            fonte:                "ia",
          });
        }
      }

      return { sugestoes };
    }),

  // ── Base de conhecimento ──────────────────────────────────────────────
  listarConhecimento: protectedProcedure
    .input(z.object({ companyId: z.number().optional(), global: z.boolean().default(false) }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      const cId = input.companyId ?? (ctx.user as any).companyId;
      return db.select().from(iaCronogramaConhecimento)
        .where(input.global
          ? undefined
          : or(isNull(iaCronogramaConhecimento.companyId), eq(iaCronogramaConhecimento.companyId, cId))
        )
        .orderBy(desc(iaCronogramaConhecimento.confirmacoes))
        .limit(100);
    }),

  confirmarConhecimento: protectedProcedure
    .input(z.object({ id: z.number(), aceitar: z.boolean() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (input.aceitar) {
        await db.update(iaCronogramaConhecimento)
          .set({ confirmacoes: sql`${iaCronogramaConhecimento.confirmacoes} + 1`, atualizadoEm: new Date() })
          .where(eq(iaCronogramaConhecimento.id, input.id));
      } else {
        await db.update(iaCronogramaConhecimento)
          .set({ rejeicoes: sql`${iaCronogramaConhecimento.rejeicoes} + 1`, atualizadoEm: new Date() })
          .where(eq(iaCronogramaConhecimento.id, input.id));
      }
      return { ok: true };
    }),

  atualizarConhecimento: protectedProcedure
    .input(z.object({
      id:                   z.number(),
      palavrasChave:        z.string().optional(),
      recursosEquipamentos: z.array(z.string()).optional(),
      recursosEfetivo:      z.array(z.string()).optional(),
      contextoObra:         z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { id, ...upd } = input;
      await db.update(iaCronogramaConhecimento)
        .set({ ...upd, atualizadoEm: new Date() })
        .where(eq(iaCronogramaConhecimento.id, id));
      return { ok: true };
    }),

  excluirConhecimento: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.delete(iaCronogramaConhecimento).where(eq(iaCronogramaConhecimento.id, input.id));
      return { ok: true };
    }),

  // ── Análise de Desvio de Prazo ────────────────────────────────────────────
  analisarDesvio: protectedProcedure
    .input(z.object({
      projetoId:       z.number(),
      nomeObra:        z.string(),
      semana:          z.string(),
      desvioFisico:    z.number(),     // pp (negativo = atrasado)
      avancoPrevisto:  z.number(),     // %
      avancoRealizado: z.number(),     // %
      spi:             z.number(),
      dataTermino:     z.string().nullable().optional(),
      atividadesAtrasadas: z.array(z.object({
        nome:       z.string(),
        eapCodigo:  z.string().optional(),
        desvio:     z.number(),
        previsto:   z.number(),
        realizado:  z.number(),
      })).optional(),
    }))
    .mutation(async ({ input }) => {
      await assertAiModuleEnabled(await companyIdDoProjeto(input.projetoId), "planejamento");
      const db = await getDb();

      const [conhecimentos, projetoRows] = await Promise.all([
        db.select()
          .from(iaCronogramaConhecimento)
          .where(or(eq(iaCronogramaConhecimento.companyId, 0), isNull(iaCronogramaConhecimento.companyId)))
          .limit(10),
        db.select().from(planejamentoProjetos).where(eq(planejamentoProjetos.id, input.projetoId)).limit(1),
      ]);

      const proj = projetoRows[0];
      const valorContrato = proj?.valorContrato ? Number(proj.valorContrato) : 0;
      const orcId = proj?.orcamentoId;

      let custoTotal = 0;
      let custoMdo = 0;
      let custoMat = 0;
      let tempoObraMeses = 0;
      if (orcId) {
        const orcRows = await db.select().from(orcamentos).where(eq(orcamentos.id, orcId)).limit(1);
        const orc = orcRows[0];
        if (orc) {
          custoTotal = orc.totalCusto ? Number(orc.totalCusto) : 0;
          custoMdo   = orc.totalMdo ? Number(orc.totalMdo) : 0;
          custoMat   = orc.totalMateriais ? Number(orc.totalMateriais) : 0;
          tempoObraMeses = orc.tempoObraMeses ?? 0;
        }
      }

      const custoMensal = tempoObraMeses > 0 && custoTotal > 0 ? custoTotal / tempoObraMeses : 0;
      const custoMdoMensal = tempoObraMeses > 0 && custoMdo > 0 ? custoMdo / tempoObraMeses : 0;

      const systemPrompt = buildSystemPrompt(conhecimentos);

      const diasAtraso = input.dataTermino
        ? (() => {
            const termino = new Date(input.dataTermino + "T12:00:00");
            const hoje = new Date(input.semana + "T12:00:00");
            const diasRestantes = Math.max(0, Math.round((termino.getTime() - hoje.getTime()) / 86400000));
            return Math.round(Math.abs(input.desvioFisico) / 100 * diasRestantes);
          })()
        : null;

      const atrasadasTxt = (input.atividadesAtrasadas ?? [])
        .slice(0, 8)
        .map(a => `  - ${a.eapCodigo ? `[${a.eapCodigo}] ` : ""}${a.nome}: Prev=${a.previsto.toFixed(1)}%, Real=${a.realizado.toFixed(1)}%, Desvio=${a.desvio.toFixed(1)}pp`)
        .join("\n") || "  (não informadas)";

      const fmtR$ = (v: number) => v > 0 ? `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "não disponível";

      const temFinanceiro = valorContrato > 0 || custoTotal > 0 || tempoObraMeses > 0;
      const contextoFinanceiro = temFinanceiro ? `
**Dados financeiros da obra:**
${valorContrato > 0 ? `- Valor do Contrato: **${fmtR$(valorContrato)}**` : ""}
${custoTotal > 0 ? `- Custo Orçado Total: **${fmtR$(custoTotal)}**` : ""}
${custoMdo > 0 && custoTotal > 0 ? `- Custo Mão de Obra Orçado: **${fmtR$(custoMdo)}** (${(custoMdo/custoTotal*100).toFixed(0)}% do custo total)` : custoMdo > 0 ? `- Custo Mão de Obra Orçado: **${fmtR$(custoMdo)}**` : ""}
${custoMat > 0 ? `- Custo Materiais Orçado: **${fmtR$(custoMat)}**` : ""}
${tempoObraMeses > 0 ? `- Prazo da Obra: **${tempoObraMeses} meses**` : ""}
${custoMensal > 0 ? `- Custo Médio Mensal: **${fmtR$(custoMensal)}**` : ""}
${custoMdoMensal > 0 ? `- Custo MDO Mensal Médio: **${fmtR$(custoMdoMensal)}** (base para HE: +50% hora normal, +100% dom/fer)` : ""}
IMPORTANTE: Use APENAS os dados financeiros acima para estimar custos. Se algum dado não estiver disponível, declare "estimativa não disponível por falta de dados financeiros" — NÃO invente valores.
` : `
IMPORTANTE: Dados financeiros da obra não disponíveis no sistema. Forneça estimativas conceituais com ranges (ex: "entre R$ X e R$ Y") baseadas em benchmarks de mercado para obras similares. Deixe claro que são estimativas de mercado, não dados reais do projeto.
`;

      const userPrompt = `## ALERTA DE DESVIO DE PRAZO — OBRA: ${input.nomeObra}

**Data de referência:** ${new Date(input.semana + "T12:00:00").toLocaleDateString("pt-BR")}

**Indicadores da semana:**
- Avanço Previsto Acumulado: **${input.avancoPrevisto.toFixed(1)}%**
- Avanço Realizado Acumulado: **${input.avancoRealizado.toFixed(1)}%**
- Desvio Físico: **${input.desvioFisico.toFixed(1)} pp** (ATRASADO)
- SPI: **${input.spi.toFixed(2)}** ${input.spi < 0.85 ? "🔴 CRÍTICO" : input.spi < 0.95 ? "🟡 ATENÇÃO" : "🟠 MONITORAR"}
${diasAtraso !== null ? `- Impacto estimado: **~${diasAtraso} dias de atraso** no prazo contratual` : ""}
${contextoFinanceiro}
**Atividades com maior desvio negativo:**
${atrasadasTxt}

---

Faça uma análise técnica detalhada deste desvio de prazo. Para CADA cenário/plano de ação, ESTIME valores financeiros em R$ com base nos dados da obra acima. Use regras trabalhistas brasileiras para horas extras (CLT: +50% hora normal dias úteis, +100% domingos/feriados).

Responda EXATAMENTE neste formato:

## ⚠️ Diagnóstico do Desvio
(2-3 parágrafos: causas prováveis, impacto no prazo, medições e faturamento. Quantifique o prejuízo financeiro se nada for feito — ex: "cada semana de atraso representa ~R$ X de faturamento não realizado")

## 📋 Plano de Ação 1 — [Nome: ex. "Aceleração com Horas Extras"]
**Ações:** (3-4 ações concretas)
**Impacto esperado:** (recuperar X% em Y semanas)
**Recursos adicionais:** (equipe, equipamentos)
**💰 Custo estimado do cenário: R$ XX.XXX,XX** (detalhe: X funcionários × Y horas extras/semana × Z semanas × R$ W/hora = total. Se envolver contratação, incluir custo de mobilização)
**Prazo de recuperação:** X semanas

## 📋 Plano de Ação 2 — [Nome: ex. "Reforço de Equipe"]
**Ações:** (3-4 ações concretas)
**Impacto esperado:** (recuperar X% em Y semanas)
**Recursos adicionais:** (equipe, equipamentos)
**💰 Custo estimado do cenário: R$ XX.XXX,XX** (detalhe o cálculo)
**Prazo de recuperação:** X semanas

## 📋 Plano de Ação 3 — [Nome: ex. "Revisão de Sequência Construtiva"]
**Ações:** (3-4 ações concretas)
**Impacto esperado:** (recuperar X% em Y semanas)
**Recursos adicionais:** (equipe, equipamentos)
**💰 Custo estimado do cenário: R$ XX.XXX,XX** (detalhe o cálculo)
**Prazo de recuperação:** X semanas

## 📊 Comparativo Custo × Benefício

| Cenário | Custo Adicional | Prazo Recuperação | Eficiência (R$/sem. recuperada) | Risco |
|---------|----------------|-------------------|-------------------------------|-------|
| Plano 1 | R$ ... | X sem | R$ .../sem | Baixo/Médio/Alto |
| Plano 2 | R$ ... | X sem | R$ .../sem | Baixo/Médio/Alto |
| Plano 3 | R$ ... | X sem | R$ .../sem | Baixo/Médio/Alto |

## 🎯 Recomendação do JULINHO
(1-2 parágrafos: qual plano é a melhor relação custo×benefício e por quê. Se a combinação de planos for ideal, recomende. Inclua o ROI: "investir R$ X para evitar atraso de Y semanas que custaria R$ Z em multas/faturamento perdido")`;

      let analise: string;
      try {
        const result = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user",   content: userPrompt },
          ],
          maxTokens: 3500,
        });
        const raw = result.choices?.[0]?.message?.content;
        analise = typeof raw === "string" ? raw : "Não foi possível gerar análise no momento.";
      } catch (err: any) {
        const isNoKey = err?.message?.includes("not configured");
        analise = isNoKey
          ? "⚠️ **JULINHO offline** — API de IA não configurada. Configure `OPENAI_API_KEY` nas secrets para ativar a análise de desvio."
          : `⚠️ **Erro ao contatar IA** — ${err?.message ?? "Erro desconhecido"}.`;
      }

      try {
        await db.update(planejamentoProjetos)
          .set({
            ultimaAnaliseJulinho: analise,
            analiseJulinhoData: new Date(),
            analiseJulinhoSemana: input.semana,
          })
          .where(eq(planejamentoProjetos.id, input.projetoId));
      } catch (saveErr: any) {
        console.warn(`[JULINHO] Falha ao salvar análise: ${saveErr?.message}`);
      }

      return { analise };
    }),

  // ══════════════════════════════════════════════════════════════════════
  // LINHA DE BALANÇOS — endpoints
  // ══════════════════════════════════════════════════════════════════════

  getLobData: protectedProcedure
    .input(z.object({ projetoId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();

      const [revisao] = await db
        .select()
        .from(planejamentoRevisoes)
        .where(eq(planejamentoRevisoes.projetoId, input.projetoId))
        .orderBy(desc(planejamentoRevisoes.id))
        .limit(1);

      if (!revisao) return { revisaoId: null, pavimentos: [], disciplinas: [], linhas: [], config: null };

      const revisaoId = revisao.id;

      const PAVIMENTO_KEYWORDS = ["PAVIMENTO", "ANDAR", "TÉRREO", "TERREO", "COBERTURA", "SUBSOLO", "PAVTO"];
      const pavimentos = await db
        .select()
        .from(planejamentoAtividades)
        .where(
          and(
            eq(planejamentoAtividades.projetoId, input.projetoId),
            eq(planejamentoAtividades.revisaoId, revisaoId),
            eq(planejamentoAtividades.nivel, 1),
            eq(planejamentoAtividades.isGrupo, true),
            or(...PAVIMENTO_KEYWORDS.map(k => ilike(planejamentoAtividades.nome, `%${k}%`)))
          )
        )
        .orderBy(planejamentoAtividades.ordem);

      if (pavimentos.length === 0) return { revisaoId, pavimentos: [], disciplinas: [], linhas: [], config: null };

      const allN2: {
        pavimentoId: number; pavimentoNome: string; pavimentoOrdem: number;
        disciplinaId: number; disciplinaNome: string; disciplinaOrdem: number;
        eapCodigo: string | null; dataInicio: string | null; dataFim: string | null;
        percentualRealizado: number;
      }[] = [];

      for (const pav of pavimentos) {
        const n2s = await db
          .select()
          .from(planejamentoAtividades)
          .where(
            and(
              eq(planejamentoAtividades.revisaoId, revisaoId),
              eq(planejamentoAtividades.nivel, 2),
              sql`${planejamentoAtividades.eapCodigo} LIKE ${pav.eapCodigo + ".%"}`
            )
          )
          .orderBy(planejamentoAtividades.ordem);

        for (const n2 of n2s) {
          const [avancoRow] = await db
            .select({ pct: sql<number>`COALESCE(MAX(CAST(percentual_acumulado AS FLOAT)), 0)` })
            .from(planejamentoAvancos)
            .where(
              and(
                eq(planejamentoAvancos.revisaoId, revisaoId),
                sql`atividade_id IN (
                  SELECT id FROM planejamento_atividades
                  WHERE revisao_id = ${revisaoId}
                  AND eap_codigo LIKE ${n2.eapCodigo + "%"}
                )`
              )
            );

          allN2.push({
            pavimentoId: pav.id,
            pavimentoNome: pav.nome.replace(/:$/, "").trim(),
            pavimentoOrdem: pav.ordem ?? 0,
            disciplinaId: n2.id,
            disciplinaNome: n2.nome.replace(/:$/, "").trim(),
            disciplinaOrdem: n2.ordem ?? 0,
            eapCodigo: n2.eapCodigo,
            dataInicio: n2.dataInicio,
            dataFim: n2.dataFim,
            percentualRealizado: avancoRow?.pct ?? 0,
          });
        }
      }

      const disciplinas = [...new Set(allN2.map(r => r.disciplinaNome))];

      const [config] = await db
        .select()
        .from(lobConfig)
        .where(eq(lobConfig.projetoId, input.projetoId))
        .limit(1);

      return {
        revisaoId,
        pavimentos: pavimentos.map(p => ({
          id: p.id,
          nome: p.nome.replace(/:$/, "").trim(),
          ordem: p.ordem ?? 0,
          dataInicio: p.dataInicio,
          dataFim: p.dataFim,
        })),
        disciplinas,
        linhas: allN2,
        config: config ?? null,
      };
    }),

  saveLobConfig: protectedProcedure
    .input(z.object({
      projetoId: z.number(),
      bufferMinimoDias: z.number().default(5),
      ritmoAlvoPavsSemana: z.number().default(1.0),
      pavimentosExcluidos: z.array(z.string()).default([]),
      disciplinasConfig: z.array(z.object({
        nome: z.string(),
        cor: z.string(),
        visivel: z.boolean(),
        ordem: z.number(),
      })).default([]),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const existing = await db
        .select({ id: lobConfig.id })
        .from(lobConfig)
        .where(eq(lobConfig.projetoId, input.projetoId))
        .limit(1);

      if (existing.length > 0) {
        await db.update(lobConfig).set({
          bufferMinimoDias: input.bufferMinimoDias,
          ritmoAlvoPavsSemana: String(input.ritmoAlvoPavsSemana),
          pavimentosExcluidos: input.pavimentosExcluidos as any,
          disciplinasConfig: input.disciplinasConfig as any,
          atualizadoEm: new Date(),
        }).where(eq(lobConfig.projetoId, input.projetoId));
      } else {
        await db.insert(lobConfig).values({
          projetoId: input.projetoId,
          bufferMinimoDias: input.bufferMinimoDias,
          ritmoAlvoPavsSemana: String(input.ritmoAlvoPavsSemana),
          pavimentosExcluidos: input.pavimentosExcluidos as any,
          disciplinasConfig: input.disciplinasConfig as any,
        });
      }
      return { ok: true };
    }),

  analisarLOB: protectedProcedure
    .input(z.object({
      projetoId: z.number(),
      nomeProjeto: z.string(),
      numPavimentos: z.number(),
      numDisciplinas: z.number(),
      bufferMinimoDias: z.number(),
      colisoes: z.array(z.object({
        disciplina1: z.string(),
        disciplina2: z.string(),
        pavimento: z.string(),
        diasGap: z.number(),
      })),
      ritmoPorDisciplina: z.array(z.object({
        disciplina: z.string(),
        ritmoPlaneadoPavsSemana: z.number(),
        ritmoRealizadoPavsSemana: z.number(),
        desvioPercent: z.number(),
      })),
      disciplinaMaisAtrasada: z.string().optional(),
      disciplinaMaisAdiantada: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      await assertAiModuleEnabled(await companyIdDoProjeto(input.projetoId), "planejamento");
      const systemPrompt = `Você é JULINHO, IA especialista em gestão de obras verticais e Linha de Balanços (LOB).
Analise os dados LOB desta obra e forneça diagnóstico técnico preciso sobre colisões entre frentes, desvios de ritmo e risco ao prazo.
Seja específico, técnico e prático. Use linguagem direta de engenharia de obras.`;

      // Mostrar apenas top 5 colisões mais críticas (menor gap = maior risco)
      const colisoesSorted = [...input.colisoes].sort((a, b) => a.diasGap - b.diasGap);
      const colisoesPrincipais = colisoesSorted.slice(0, 5);
      const colisoesText = input.colisoes.length === 0
        ? "Nenhuma colisão detectada — todas as frentes dentro do buffer mínimo."
        : [
            ...colisoesPrincipais.map(c =>
              `- ${c.disciplina1} → ${c.disciplina2} no ${c.pavimento} (gap: ${c.diasGap}d | mínimo: ${input.bufferMinimoDias}d)`
            ),
            input.colisoes.length > 5 ? `... e mais ${input.colisoes.length - 5} colisões adicionais` : ""
          ].filter(Boolean).join("\n");

      // Top 3 disciplinas com maior desvio negativo
      const ritmoSorted = [...input.ritmoPorDisciplina].sort((a, b) => a.desvioPercent - b.desvioPercent);
      const ritmoTop = ritmoSorted.slice(0, 4);
      const ritmoText = ritmoTop.map(r =>
        `- ${r.disciplina}: plan ${r.ritmoPlaneadoPavsSemana.toFixed(2)} pavs/sem | real ${r.ritmoRealizadoPavsSemana.toFixed(2)} pavs/sem | desvio ${r.desvioPercent > 0 ? "+" : ""}${r.desvioPercent.toFixed(0)}%`
      ).join("\n");

      const userPrompt = `# Análise LOB — ${input.nomeProjeto}

**Configuração:** ${input.numPavimentos} pavimentos | ${input.numDisciplinas} disciplinas | buffer mínimo ${input.bufferMinimoDias} dias
**Total de colisões detectadas:** ${input.colisoes.length}
${input.disciplinaMaisAtrasada ? `**Disciplina mais atrasada:** ${input.disciplinaMaisAtrasada}` : ""}
${input.disciplinaMaisAdiantada ? `**Disciplina mais adiantada:** ${input.disciplinaMaisAdiantada}` : ""}

**Top ${colisoesPrincipais.length} colisões críticas (menor gap):**
${colisoesText}

**Ritmo das principais disciplinas (maior desvio):**
${ritmoText}

---
Responda EXATAMENTE neste formato (seja conciso e direto):

## 🏗️ Diagnóstico LOB
(1 parágrafo: situação geral — crítico/controlado, principais riscos ao prazo)

## 🎯 3 Ações Prioritárias para Resolver
1. **[DISCIPLINA]** — (ação específica: o quê, quem, quando, resultado esperado)
2. **[DISCIPLINA]** — (ação específica: o quê, quem, quando, resultado esperado)
3. **[DISCIPLINA]** — (ação específica: o quê, quem, quando, resultado esperado)

## ⚡ Colisões Críticas
(as 3 mais graves com impacto no prazo — seja específico)

## 📈 Desvios de Ritmo
(as 2 disciplinas com maior atraso: causa provável e consequência)

## ✅ Recomendação Final do JULINHO
(1 frase: o que precisa acontecer ESTA SEMANA para estabilizar a Linha de Balanços)`;

      let analise: string;
      try {
        const result = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user",   content: userPrompt },
          ],
          maxTokens: 3000,
        });
        const raw = result.choices?.[0]?.message?.content;
        analise = typeof raw === "string" ? raw : "Não foi possível gerar análise LOB no momento.";
      } catch (err: any) {
        const isNoKey = err?.message?.includes("not configured");
        analise = isNoKey
          ? "⚠️ **JULINHO offline** — API de IA não configurada. Configure `OPENAI_API_KEY` nas secrets para ativar a análise LOB."
          : `⚠️ **Erro ao contatar IA** — ${err?.message ?? "Erro desconhecido"}.`;
      }

      return { analise };
    }),

  // ── Análise de Efetivo × Cronograma (IA) ─────────────────────────────────
  // Cruza o EFETIVO atual alocado na obra (agregado por função/cargo, vínculo,
  // categoria MO e status) com as ATIVIDADES do cronograma em andamento e das
  // próximas 8 semanas, e pede à IA um diagnóstico de dimensionamento de equipe
  // (contratar / reduzir / manter) por cargo, indicadores, riscos e
  // recomendações. SOMENTE LEITURA — não grava nada (R-001/R-007/R-010).
  analisarEfetivo: protectedProcedure
    .input(z.object({ projetoId: z.number(), companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco de dados indisponível.");

      // Tenancy/autorização (mesmo padrão de `planejamento.list`): aceita o
      // companyId do input — Admin Master alterna empresa pela UI e seu
      // `ctx.user.companyId` pode estar vazio — mas VALIDA o acesso: admin/
      // admin_master livre; demais só a própria empresa (evita IDOR cross-company).
      const companyId = input.companyId;
      await assertCompanyAccessIa(ctx, companyId);
      await assertAiModuleEnabled(companyId, "planejamento");

      const {
        projeto, obra, revisao, porCargo,
        totalEfetivo, totalAtivos, totalIndisponiveis,
        emAndamento, proximas, hoje,
        efetivoTxt, emAndTxt, proxTxt,
        feriasTxt, feriasResumoTxt, totalFeriasHorizonte,
      } = await coletarEfetivoCronograma(db, input.projetoId, companyId);

      const systemPrompt = `Você é JULINHO, engenheiro sênior de planejamento e gestão de mão de obra de obras da FC Engenharia (construção civil pesada brasileira). Sua especialidade é DIMENSIONAMENTO DE EQUIPE: cruzar o EFETIVO atual alocado numa obra com as ATIVIDADES do cronograma (em andamento e das próximas semanas) e dizer, com precisão técnica, se a equipe está SUBdimensionada (precisa contratar), SUPERdimensionada (pode reduzir) ou EQUILIBRADA — analisando POR FUNÇÃO/CARGO.

Considere: o histograma típico de mão de obra por tipo de serviço (mobilização, fundação/estrutura, alvenaria, instalações, acabamento, etc.), a produtividade usual de cada função, o peso financeiro de cada frente (frentes pesadas exigem mais gente), o vínculo (CLT vs terceiro) e quantos estão indisponíveis (férias/aviso/afastado). Seja realista e conservador: só recomende contratar quando houver evidência clara de gargalo, e só reduzir quando houver folga evidente.

## FÉRIAS — REGRA OBRIGATÓRIA (impacto no prazo)
Você RECEBE a lista de férias agendadas/em gozo dos alocados, com a ORDEM do parcelamento (1º/2º/3º período) e as datas. SEMPRE leve as férias em conta no efetivo DISPONÍVEL: quem está de férias no período de uma atividade NÃO conta como mão de obra naquela frente. Para cada férias que impacta o prazo aplique esta regra de negócio da FC:
- **2º (ou 3º) período = INADIÁVEL**: por lei já é o saldo final; o funcionário SAI de férias na data marcada — NÃO sugira adiar/remanejar. Planeje a obra CONTANDO com a ausência dele (repor com outro, antecipar a frente, terceirizar, redistribuir).
- **1º período = NEGOCIÁVEL**: SE a função for IMPRESCINDÍVEL para manter o prazo daquela frente, sugira remanejar/reagendar o 1º período (ou trocar por quem não é gargalo). Se a função NÃO for crítica, deixe o funcionário sair normalmente.
- **MARCAÇÃO LEGAL DO ERP (PRIORITÁRIA) — RESPEITE SEMPRE:** cada férias já vem rotulada na lista como INADIÁVEL ou REMANEJÁVEL. Quando o ERP marcar INADIÁVEL — INCLUSIVE um 1º período por "férias VENCIDAS" ou "prazo concessivo vence ..." — a lei OBRIGA o gozo na data marcada (adiar gera férias EM DOBRO e passivo trabalhista): JAMAIS sugira remanejar/adiar; planeje a obra repondo/antecipando/terceirizando/redistribuindo. Só trate como negociável o 1º período EXPLICITAMENTE marcado REMANEJÁVEL. No campo "inadiavel" do JSON, copie SEMPRE a marcação do ERP — e no campo "motivoInadiavel" COPIE o motivo que está entre parênteses na lista (ex.: "prazo concessivo vence 15/07/2026 — sem folga p/ adiar"), para que o usuário entenda POR QUE aquele período (mesmo 1º) é inadiável.
O OBJETIVO É SEMPRE manter o PRAZO FINAL e a obra em andamento — toda análise deve dizer como absorver as férias sem estourar a data de entrega.

Responda SEMPRE em português brasileiro, técnico, direto e específico. TODAS as datas SEMPRE no padrão brasileiro DD/MM/AAAA (jamais ISO/AAAA-MM-DD). Responda APENAS com JSON válido no formato pedido, sem nenhum texto fora do JSON.`;

      const userPrompt = `# Análise de Efetivo × Cronograma
**Obra:** ${obra?.nome ?? "—"}
**Projeto:** ${projeto.nome ?? "—"} (Revisão ${revisao.numero ?? "?"})
**Data de referência:** ${isoParaBR(hoje.toISOString())}

## EFETIVO ATUAL ALOCADO (total: ${totalEfetivo} | ativos: ${totalAtivos} | indisponíveis: ${totalIndisponiveis})
${efetivoTxt}

## ATIVIDADES EM ANDAMENTO HOJE (${emAndamento.length})
${emAndTxt}

## ATIVIDADES DAS PRÓXIMAS 8 SEMANAS (${proximas.length})
${proxTxt}

## FÉRIAS DOS ALOCADOS (impacto no prazo — ${totalFeriasHorizonte} pessoa(s) ausente(s) no horizonte)
### Resumo por função (no horizonte)
${feriasResumoTxt}
### Detalhe dos períodos
${feriasTxt}

---
Com base no cruzamento acima, retorne um JSON EXATAMENTE nesta estrutura (sem comentários, sem markdown):
{
  "diagnostico": "equilibrado" | "contratar" | "reduzir" | "misto",
  "tituloDiagnostico": "string curta (ex: 'Efetivo compatível, com reforço pontual em armação')",
  "resumoExecutivo": "string — 2 a 4 frases com a leitura geral da situação",
  "indicadores": [
    { "label": "string curto", "valor": "string (ex: '+6 pessoas', '92%', 'Adequado')", "status": "ok" | "alerta" | "critico", "descricao": "string — 1 frase explicando" }
  ],
  "porCargo": [
    { "cargo": "string", "categoria": "string", "atual": number, "recomendado": number, "delta": number, "acao": "contratar" | "reduzir" | "manter", "justificativa": "string — por que, ligado às atividades" }
  ],
  "atividadesCriticas": [
    { "atividade": "string", "periodo": "string", "necessidade": "string — que mão de obra essa frente exige" }
  ],
  "impactoFerias": {
    "resumo": "string — leitura geral do impacto das férias no prazo (ou 'Sem férias no horizonte que impactem o prazo')",
    "itens": [
      { "funcionario": "string", "cargo": "string", "periodo": "1º" | "2º" | "3º", "datas": "string DD/MM/AAAA → DD/MM/AAAA", "inadiavel": boolean, "motivoInadiavel": "string — COPIE o motivo entre parênteses da marcação INADIÁVEL do ERP (ex.: 'prazo concessivo vence 15/07/2026 — sem folga p/ adiar', 'férias VENCIDAS', '2º período — saldo final por lei'). Vazio se for REMANEJÁVEL", "impacto": "string — em que frente/atividade do cronograma essa ausência pesa", "acao": "string — o que fazer para MANTER O PRAZO: 2º/3º período é inadiável (repor/antecipar/terceirizar/redistribuir); 1º período só remaneje se a função for imprescindível" }
    ]
  },
  "riscos": [ "string" ],
  "recomendacoes": [ "string — ações práticas e priorizadas" ],
  "referenciaPrincipal": {
    "autor": "string — autor(es)/instituição MAIS RENOMADO(A) DO MUNDO neste assunto",
    "obra": "string — título da obra/norma/princípio consagrado",
    "ano": "string — ano (ou período) da publicação, se souber",
    "porque": "string — por que é A referência mais renomada do mundo em dimensionamento de mão de obra na construção E como ela fundamenta ESTE diagnóstico específico"
  },
  "referencias": [
    { "fonte": "string — outra literatura/princípio de apoio", "aplicacao": "string — como se aplica a este caso" }
  ]
}

Regras: inclua em "porCargo" TODAS as funções listadas no efetivo (mesmo as que ficam "manter", com delta 0); "delta" = recomendado - atual (negativo = reduzir). Em "indicadores" gere de 3 a 5 cards. SEMPRE preencha "referenciaPrincipal" citando a referência/autor MAIS RENOMADO(A) mundialmente sobre dimensionamento de mão de obra na construção (ex.: PMBOK/PMI para nivelamento de recursos, TCPO para rendimentos, Construction Industry Institute para produtividade/overmanning, Koskela/Ballard para Lean/Last Planner) e explique por que é a mais consagrada no tema — escolha a que melhor se aplica a ESTE caso. Gere ainda de 2 a 3 "referencias" de apoio. Seja específico e quantitativo.`;

      let parsed: any = null;
      let erroIa: string | null = null;
      try {
        const result = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user",   content: userPrompt },
          ],
          maxTokens: 8000,
          response_format: { type: "json_object" },
          // Rev. 2592 — Diagnóstico volta ao caminho rápido (Gemini 2.5 Flash). O
          // Claude não-streaming estourava o timeout do proxy/iOS no iPad → o
          // diagnóstico "dava erro" e, como a persistência só ocorre com `parsed`,
          // nada era salvo no Histórico. Gemini responde dentro do timeout e
          // aguenta o teto de tokens (Claude segue como fallback no invokeLLM).
          fast: true,
        });
        const content = result.choices?.[0]?.message?.content;
        const raw = typeof content === "string"
          ? content
          : Array.isArray(content) ? ((content[0] as any)?.text ?? "") : "";
        const r = extrairJsonIa(raw);
        parsed = r.parsed ? brDatasDeep(r.parsed) : r.parsed;
        erroIa = r.erroIa;
      } catch (err: any) {
        erroIa = err?.message?.includes("Nenhuma chave")
          ? "Nenhuma chave de IA configurada. Configure ANTHROPIC_API_KEY ou GOOGLE_API_KEY nas secrets para usar a análise."
          : `Não foi possível gerar a análise de IA: ${err?.message ?? "erro desconhecido"}.`;
      }

      const resultado = {
        obra:    obra?.nome ?? "",
        projeto: projeto.nome ?? "",
        revisao: revisao.numero ?? null,
        geradoEm: new Date().toISOString(),
        efetivoResumo: {
          total: totalEfetivo,
          ativos: totalAtivos,
          indisponiveis: totalIndisponiveis,
          cargos: porCargo.length,
        },
        atividadesResumo: {
          emAndamento: emAndamento.length,
          proximas: proximas.length,
        },
        porCargoAtual: porCargo,
        analise: parsed,
        erroIa,
      };

      // Persiste a análise p/ consulta futura (só quando a IA produziu resultado).
      let analiseId: number | null = null;
      if (parsed) {
        analiseId = await salvarAnaliseEfetivo(db, {
          projetoId: input.projetoId,
          companyId,
          tipo: "diagnostico",
          veredito: parsed?.diagnostico ?? null,
          titulo: parsed?.tituloDiagnostico ?? null,
          obra: obra?.nome ?? null,
          revisaoNumero: revisao.numero ?? null,
          resultado,
          erroIa,
          criadoPor: (ctx.user as any).name ?? null,
        });
      }

      return { ...resultado, analiseId };
    }),

  // ── Efetivo atual (somente leitura, sem IA) — alimenta o Simulador ──────────
  efetivoAtual: protectedProcedure
    .input(z.object({ projetoId: z.number(), companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco de dados indisponível.");
      const companyId = input.companyId;
      await assertCompanyAccessIa(ctx, companyId);
      await assertAiModuleEnabled(companyId, "planejamento");
      const {
        projeto, obra, revisao, porCargo,
        totalEfetivo, totalAtivos, totalIndisponiveis,
        emAndamento, proximas,
      } = await coletarEfetivoCronograma(db, input.projetoId, companyId);
      return {
        obra: obra?.nome ?? "",
        projeto: projeto.nome ?? "",
        revisao: revisao.numero ?? null,
        efetivoResumo: { total: totalEfetivo, ativos: totalAtivos, indisponiveis: totalIndisponiveis, cargos: porCargo.length },
        atividadesResumo: { emAndamento: emAndamento.length, proximas: proximas.length },
        porCargoAtual: porCargo,
      };
    }),

  // ── Simulador de efetivo — previsão de impacto pela IA (literatura) ─────────
  // Recebe ajustes (+/-) por função, monta o cenário simulado e pede à IA a
  // projeção de impacto (prazo/produtividade/custo/qualidade) fundamentada nas
  // melhores literaturas de gestão da construção. SOMENTE LEITURA + IA.
  simularEfetivo: protectedProcedure
    .input(z.object({
      projetoId: z.number(),
      companyId: z.number(),
      ajustes: z.array(z.object({ cargo: z.string(), delta: z.number().int() })).min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco de dados indisponível.");
      const companyId = input.companyId;
      await assertCompanyAccessIa(ctx, companyId);
      await assertAiModuleEnabled(companyId, "planejamento");
      const {
        projeto, obra, revisao, porCargo,
        totalEfetivo, totalAtivos, totalIndisponiveis,
        emAndamento, proximas, hoje,
        efetivoTxt, emAndTxt, proxTxt,
        feriasTxt, feriasResumoTxt, totalFeriasHorizonte,
        pavimentosDetectados, pavimentosTxt,
      } = await coletarEfetivoCronograma(db, input.projetoId, companyId);

      // Aplica os ajustes simulados por cargo (clamp em 0). Cargos não presentes
      // no efetivo mas pedidos nos ajustes (contratação de função nova) entram.
      const norm = (s: string) => (s || "").trim().toUpperCase();
      // Descarta ajustes inválidos (cargo vazio ou delta 0) — defensivo contra
      // payloads de clientes customizados.
      const ajustesValidos = input.ajustes.filter((a) => a.cargo.trim().length > 0 && a.delta !== 0);
      if (ajustesValidos.length === 0) throw new Error("Informe ao menos um ajuste de efetivo válido para simular.");
      const cenarioMap = new Map<string, { cargo: string; categoria: string; atual: number; delta: number }>();
      for (const c of porCargo) cenarioMap.set(norm(c.cargo), { cargo: c.cargo, categoria: c.categoria, atual: c.total, delta: 0 });
      for (const aj of ajustesValidos) {
        const key = norm(aj.cargo);
        const cur = cenarioMap.get(key);
        if (cur) cur.delta += aj.delta;
        else cenarioMap.set(key, { cargo: aj.cargo.trim(), categoria: "—", atual: 0, delta: aj.delta });
      }
      const cenario = Array.from(cenarioMap.values()).map(c => {
        const simulado = Math.max(0, c.atual + c.delta);
        return { cargo: c.cargo, categoria: c.categoria, atual: c.atual, simulado, delta: simulado - c.atual };
      });
      const totalAtualCen = cenario.reduce((s, c) => s + c.atual, 0);
      const totalSimulado = cenario.reduce((s, c) => s + c.simulado, 0);
      const deltaTotal = totalSimulado - totalAtualCen;

      const cenarioTxt = cenario.map(c =>
        `  - ${c.cargo} [${c.categoria}]: ${c.atual} → ${c.simulado} (${c.delta > 0 ? "+" : ""}${c.delta})`
      ).join("\n");

      const systemPrompt = `Você é JULINHO, engenheiro sênior de planejamento e gestão de produção de obras da FC Engenharia (construção civil pesada brasileira), especialista em DIMENSIONAMENTO DE MÃO DE OBRA e em PREVISÃO DE IMPACTO de cenários de efetivo.

O usuário está SIMULANDO uma mudança no efetivo da obra (reduzir e/ou aumentar pessoas por função) e quer que você PROJETE os impactos dessa decisão sobre PRAZO, PRODUTIVIDADE, CUSTO e QUALIDADE/SEGURANÇA — fundamentando o raciocínio nas MELHORES LITERATURAS MUNDIAIS de gestão da construção, entre elas:
- Lei de Brooks (Brooks's Law): adicionar gente a uma frente já atrasada nem sempre acelera — há custo de integração e curva de aprendizado.
- Curva de aprendizado (learning curve) da mão de obra recém-alocada.
- Histograma de mão de obra e nivelamento de recursos (resource leveling — PMBOK/PMI).
- Linha de Balanço (Line of Balance / LOB) e ritmo de produção (takt) em serviços repetitivos.
- Rendimentos da TCPO e composição de cuadrillas (relação pedreiro/servente).
- Estudos do Construction Industry Institute (CII) sobre overmanning, congestionamento de frentes (trade stacking) e perda de produtividade por superlotação.
- Efeito da fadiga / horas extras prolongadas sobre a produtividade.
- Fluxo de produção da Lean Construction (Lei de Little, redução de WIP).

MISSÃO ESPECIAL — PLANO DE ATAQUE (quando o efetivo é REDUZIDO ou se mantém com menos gente do que o ideal): pense como um ESTRATEGISTA MILITAR planejando uma campanha. O cenário ideal é ter efetivo de sobra "no campo de batalha", mas quando NÃO há, é preciso VENCER A GUERRA COM O QUE SE TEM — mantendo o prazo mesmo com a equipe enxuta. Para isso, monte um PLANO DE ATAQUE DETALHADO E SEQUENCIADO, combinando o melhor de TRÊS corpos de conhecimento:
- ESTRATÉGIA DE GUERRA: Sun Tzu (A Arte da Guerra — conhecer o terreno, concentração de força no ponto decisivo, vencer antes de lutar); Clausewitz (centro de gravidade / Schwerpunkt — focar o esforço onde decide a campanha); doutrina de manobra (massa e economia de forças); ciclo OODA de John Boyd (observar-orientar-decidir-agir mais rápido que o problema); o princípio de que "amadores discutem tática, profissionais discutem logística".
- RESOLUÇÃO DE PROBLEMAS / RESTRIÇÕES: Teoria das Restrições de Goldratt ("A Meta"/Corrente Crítica — identificar e explorar o gargalo, subordinar tudo a ele, elevá-lo); pensamento por primeiros princípios; TRIZ (inovação sistemática p/ contornar restrições com automação/tecnologia); 5 Porquês p/ causa-raiz.
- PLANEJAMENTO DE PRODUÇÃO: Linha de Balanço (LOB) e takt para reequilibrar o RITMO das frentes; Last Planner / lookahead; fast-tracking e crashing seletivos; pré-fabricação, kits e mecanização para reduzir homem-hora por unidade.

No plano de ataque, BUSQUE CENÁRIOS NÃO ÓBVIOS — combinações de sequenciamento, processo construtivo, automação e logística que um engenheiro NÃO enxergaria na correria do dia a dia. Cada manobra deve ter ação concreta, como executar, impacto no prazo e o ajuste correspondente na Linha de Balanço.

FÉRIAS — REGRA OBRIGATÓRIA NO PLANO: você recebe a lista de férias agendadas/em gozo dos alocados, com a ORDEM do parcelamento (1º/2º/3º período). Quem está de férias no período de uma frente NÃO conta como efetivo disponível ali — subtraia essas ausências do cenário simulado. Aplique a regra de negócio da FC: o 2º (ou 3º) período é INADIÁVEL (o funcionário SAI na data; planeje a obra repondo/antecipando/terceirizando/redistribuindo); o 1º período só deve ser remanejado/reagendado SE a função for IMPRESCINDÍVEL para manter o prazo daquela frente. ATENÇÃO — MARCAÇÃO LEGAL PRIORITÁRIA: cada férias já vem rotulada como INADIÁVEL ou REMANEJÁVEL pelo ERP; RESPEITE essa marcação. Um 1º período rotulado INADIÁVEL por "férias VENCIDAS" ou "prazo concessivo vence ..." NÃO pode ser adiado (a lei obriga o gozo; adiar gera férias em dobro e passivo) — planeje repondo/antecipando/terceirizando, copie a marcação no campo "inadiavel" do JSON e copie o motivo (entre parênteses na lista) no campo "motivoInadiavel" para o usuário entender POR QUE é inadiável. O plano de ataque deve absorver as férias e ainda assim MANTER O PRAZO FINAL.

Seja realista, quantitativo e conservador. Aponte EXPLICITAMENTE quando o cenário simulado tende a NÃO entregar o ganho esperado (ex.: superlotação de uma frente, gargalo deslocado para outra função, função-restrição não ajustada, contratação que só rende após curva de aprendizado). TODAS as datas SEMPRE no padrão brasileiro DD/MM/AAAA (jamais ISO/AAAA-MM-DD). Responda SEMPRE em português brasileiro e APENAS com JSON válido no formato pedido, sem nenhum texto fora do JSON.`;

      const userPrompt = `# Simulação de Cenário de Efetivo
**Obra:** ${obra?.nome ?? "—"}
**Projeto:** ${projeto.nome ?? "—"} (Revisão ${revisao.numero ?? "?"})
**Data de referência:** ${isoParaBR(hoje.toISOString())}

## EFETIVO ATUAL ALOCADO (total: ${totalEfetivo} | ativos: ${totalAtivos} | indisponíveis: ${totalIndisponiveis})
${efetivoTxt}

## CENÁRIO SIMULADO PELO USUÁRIO (efetivo total ${totalAtualCen} → ${totalSimulado} | Δ ${deltaTotal > 0 ? "+" : ""}${deltaTotal})
${cenarioTxt}

## ATIVIDADES EM ANDAMENTO HOJE (${emAndamento.length})
${emAndTxt}

## ATIVIDADES DAS PRÓXIMAS 8 SEMANAS (${proximas.length})
${proxTxt}

## FÉRIAS DOS ALOCADOS (impacto no prazo — ${totalFeriasHorizonte} pessoa(s) ausente(s) no horizonte)
### Resumo por função (no horizonte)
${feriasResumoTxt}
### Detalhe dos períodos
${feriasTxt}

## PAVIMENTOS / UNIDADES REPETITIVAS DETECTADAS (${pavimentosDetectados.length}) — base → topo
${pavimentosTxt}

---
Projete o impacto do CENÁRIO SIMULADO frente às atividades acima e retorne um JSON EXATAMENTE nesta estrutura (sem comentários, sem markdown):
{
  "veredito": "favoravel" | "neutro" | "arriscado",
  "tituloCenario": "string curta resumindo o cenário e seu efeito principal",
  "resumoExecutivo": "string — 2 a 4 frases: o que acontece com a obra ao aplicar este efetivo",
  "impactos": {
    "prazo":              { "status": "positivo" | "neutro" | "negativo", "estimativa": "string (ex: '-2 a -3 semanas', 'sem ganho real', '+1 semana')", "texto": "1 a 2 frases" },
    "produtividade":      { "status": "positivo" | "neutro" | "negativo", "texto": "1 a 2 frases" },
    "custo":              { "status": "positivo" | "neutro" | "negativo", "estimativa": "string (ex: 'reduz custo de MO', '+ custo mensal de equipe')", "texto": "1 a 2 frases" },
    "qualidadeSeguranca": { "status": "positivo" | "neutro" | "negativo", "texto": "1 a 2 frases" }
  },
  "indicadores": [
    { "label": "string curto", "valor": "string", "status": "ok" | "alerta" | "critico", "descricao": "1 frase" }
  ],
  "porCargo": [
    { "cargo": "string", "atual": number, "simulado": number, "delta": number, "efeito": "string — efeito prático deste ajuste nesta função" }
  ],
  "riscos": [ "string" ],
  "recomendacoes": [ "string — ações práticas para o cenário dar certo" ],
  "planoAtaque": {
    "missao": "string — o objetivo da campanha em 1 frase (ex.: 'Manter a entrega de DD/MM mesmo com o efetivo reduzido para N pessoas')",
    "vereditoPrazo": "mantem" | "risco_parcial" | "inviavel_sem_acao",
    "centroDeGravidade": "string — a função/frente DECISIVA (gargalo / centro de gravidade) onde concentrar o esforço, e por quê",
    "principioGuia": "string — princípio central que orienta o plano (ex.: Teoria das Restrições: explorar o gargalo / concentração de forças de Sun Tzu)",
    "frentesCriticas": [ { "frente": "string — atividade/frente crítica", "porque": "string", "acao": "string — manobra imediata" } ],
    "alocacaoFrentes": [
      { "frente": "string — nome da frente/serviço (ex.: 'Estrutura — Torre A', 'Revestimento interno — Pav. 3-6')", "local": "string — onde fisicamente (pavimento/eixo/bloco/trecho)", "objetivo": "string — meta concreta desta frente no período (o que precisa estar pronto)", "equipe": [ { "cargo": "string", "qtd": number, "papel": "string — o que essa função faz NESTA frente" } ], "totalPessoas": number, "ritmo": "string — takt/meta de produção (ex.: '1 pavimento/semana', '40 m²/dia')", "duracao": "string — janela da frente (ex.: 'D-0 a D+14' ou 'Sem 1 a 3')", "dependeDe": "string — frente/pré-requisito que precisa terminar antes (ou '—')", "risco": "string — principal risco desta alocação e como mitigar" }
    ],
    "manobras": [
      { "ordem": number, "fase": "string — janela temporal (ex.: 'D-0 a D+7 — Mobilização')", "titulo": "string curto", "tipo": "sequenciamento" | "processo_construtivo" | "automacao" | "logistica" | "recurso" | "contingencia", "acao": "string — o que fazer", "comoExecutar": "string — passos práticos no campo", "impactoPrazo": "string — ex.: 'recupera ~1,5 semana'", "linhaBalanco": "string — como ajusta o takt/ritmo/sequência de frentes na LOB", "fundamento": "string — literatura que embasa (Goldratt, Sun Tzu, Lean/LOB, TCPO, TRIZ...)" }
    ],
    "processosConstrutivos": [ { "atual": "string — método atual", "proposto": "string — método melhor (pré-fab, kit, mecanização)", "ganho": "string — homem-hora/prazo economizado" } ],
    "automacoes": [ { "item": "string — automação/tecnologia", "aplicacao": "string — onde aplicar na obra", "ganho": "string — efeito no efetivo/prazo" } ],
    "cenariosNaoObvios": [ "string — insight/combinação que um engenheiro NÃO veria no dia a dia" ],
    "absorcaoFerias": [ { "funcionario": "string", "cargo": "string", "periodo": "1º" | "2º" | "3º", "datas": "string DD/MM/AAAA → DD/MM/AAAA", "inadiavel": boolean, "motivoInadiavel": "string — COPIE o motivo entre parênteses da marcação INADIÁVEL do ERP (ex.: 'prazo concessivo vence 15/07/2026 — sem folga p/ adiar', 'férias VENCIDAS', '2º período — saldo final por lei'). Vazio se for REMANEJÁVEL", "acao": "string — como absorver a ausência mantendo o prazo: 2º/3º período é inadiável (repor/antecipar/terceirizar/redistribuir); 1º período só remaneje se a função for imprescindível" } ],
    "linhaBalancoPlano": "string — o novo plano de ritmo: takt proposto, nº de frentes simultâneas e a nova sequência para manter o prazo com a equipe enxuta",
    "planoTatico": [
      { "atividade": "string — nome EXATO de uma atividade do cronograma (use as ATIVIDADES EM ANDAMENTO e das PRÓXIMAS SEMANAS listadas acima)", "frente": "string — frente/local físico (pavimento/bloco/eixo/trecho)", "periodo": "string — janela em datas BR (DD/MM/AAAA → DD/MM/AAAA)", "equipe": [ { "cargo": "string", "qtd": number } ], "totalPessoas": number, "meta": "string — o que precisa ficar pronto / quanto produzir no período", "ritmo": "string — takt/produção (ex.: '40 m²/dia', '1 pav/sem')", "comoFazer": "string — passo a passo SIMPLES e didático, em linguagem de canteiro, de como a equipe executa", "porQue": "string — por que alocar assim, em 1 frase clara", "checagem": "string — como o responsável confere no fim do dia/semana se está no ritmo", "assertividade": number, "baseAssertividade": "string — em que estatística/rendimento (TCPO, histórico, folga de prazo) esse % se baseia" }
    ],
    "linhaBalanco": {
      "unidade": "string — unidade repetitiva da obra (ex.: 'pavimento', 'bloco', 'trecho', 'eixo')",
      "inicioRef": "string — data BR (DD/MM/AAAA) correspondente à Semana 1 do gráfico",
      "horizonteSemanas": number,
      "atividades": [
        { "atividade": "string — atividade/serviço", "inicioSemana": number, "fimSemana": number, "ritmo": "string — ritmo de produção (ex.: '1 pav/sem')", "equipe": "string — resumo curto da equipe (ex.: '4 PED + 8 SERV')" }
      ],
      "leitura": "string — explicação DIDÁTICA de como ler este gráfico de Linha de Balanço para quem nunca viu"
    },
    "linhaBalancoPavimentos": {
      "unidade": "string — nome da unidade repetitiva (ex.: 'Pavimento')",
      "inicioRef": "string — data BR (DD/MM/AAAA) correspondente à Semana 1",
      "horizonteSemanas": number,
      "pavimentos": [ "string — TODOS os pavimentos/unidades, ORDENADOS da base para o topo (use a lista PAVIMENTOS DETECTADAS acima)" ],
      "atividades": [
        { "atividade": "string — serviço repetitivo (ex.: 'Chapisco', 'Emboço', 'Revestimento cerâmico')", "equipe": "string — resumo curto da quadrilha (ex.: '1 PED + 2 SERV')", "ritmo": "string — ritmo (ex.: '1 pav/sem')", "pavInicioNome": "string — NOME EXATO do pavimento de INÍCIO, copiado LITERALMENTE de PAVIMENTOS DETECTADAS (ex.: 'Térreo', 'Pav. 6', 'Cobertura') — NÃO parafraseie nem renumere", "pavFimNome": "string — NOME EXATO do pavimento de TÉRMINO, copiado LITERALMENTE de PAVIMENTOS DETECTADAS", "pavInicio": number, "pavFim": number, "semanaInicio": number, "semanaFim": number, "assertividade": number }
      ],
      "leitura": "string — como ler a Linha de Balanço por pavimento: cada linha diagonal é uma equipe subindo (ou descendo) os pavimentos ao longo do tempo; linhas paralelas = fluxo saudável; linhas que se cruzam = colisão/gargalo"
    },
    "realocacaoEquipes": [
      { "equipe": "string — nome da quadrilha/equipe (ex.: 'Equipe de Revestimento A')", "composicao": [ { "cargo": "string", "qtd": number } ], "totalPessoas": number, "movimentos": [ { "ordem": number, "pavimento": "string — onde alocar", "atividade": "string — o que fará ali", "janela": "string — datas BR (DD/MM/AAAA → DD/MM/AAAA)", "duracao": "string — quanto tempo fica (ex.: '2 semanas')", "meta": "string — o que entrega antes de realocar" } ], "assertividade": number, "baseEstatistica": "string — em que rendimento/estatística se baseia a previsão de tempo desta equipe" }
    ],
    "assertividadeGlobal": {
      "percentual": number,
      "classe": "alta" | "media" | "baixa",
      "base": "string — em que estatísticas o % se apoia (rendimentos TCPO, folga/buffer do cronograma, viabilidade do paralelismo, impacto de férias, histórico de obras similares)",
      "fatores": [ { "fator": "string", "impacto": "positivo" | "negativo", "peso": "string — alto/médio/baixo + 1 frase" } ]
    },
    "guiaEstagiario": [
      { "passo": number, "titulo": "string curto", "oQueFazer": "string — instrução clara e direta", "comoConferir": "string — como saber que o passo deu certo" }
    ],
    "kpisAcompanhamento": [ { "kpi": "string", "meta": "string", "frequencia": "string (ex.: 'semanal no lookahead')" } ],
    "condicoesDeVitoria": [ "string — condições objetivas para considerar a campanha vencida (prazo mantido)" ],
    "sePiorar": [ "string — plano de contingência se o cenário degradar (ponto de não retorno + gatilho de ação)" ]
  },
  "referenciaPrincipal": {
    "autor": "string — autor(es)/instituição MAIS RENOMADO(A) DO MUNDO sobre o efeito principal deste cenário",
    "obra": "string — título da obra/princípio consagrado (ex: 'The Mythical Man-Month', 'CII RS252-1')",
    "ano": "string — ano (ou período) da publicação, se souber",
    "porque": "string — por que é A referência mais renomada do mundo sobre o efeito central deste cenário E como ela fundamenta esta previsão"
  },
  "referencias": [
    { "fonte": "string — nome da literatura/princípio (ex: 'Lei de Brooks', 'CII — overmanning')", "aplicacao": "string — como se aplica a ESTE cenário" }
  ]
}

Regras: em "porCargo" inclua TODAS as funções do cenário usando os números do CENÁRIO SIMULADO fornecido (atual → simulado). Gere de 3 a 5 "indicadores". SEMPRE preencha "referenciaPrincipal" com a referência/autor MAIS RENOMADO(A) do mundo sobre o efeito central deste cenário (ex.: Frederick Brooks — Lei de Brooks p/ contratações tardias; CII p/ overmanning/trade stacking; Mosaic/PMI p/ aceleração; Koskela/Ballard p/ Lean/fluxo) e explique por que é a mais consagrada no tema. Gere ainda de 2 a 4 "referencias" de apoio citando literaturas REAIS. Seja específico e quantitativo; se a Lei de Brooks, superlotação (overmanning) ou gargalo deslocado se aplicarem, diga claramente.

PLANO DE ATAQUE (campo "planoAtaque", OBRIGATÓRIO): ${deltaTotal < 0 ? `ESTE CENÁRIO É UMA REDUÇÃO DE EFETIVO (Δ ${deltaTotal}). Trate como uma CAMPANHA a ser vencida com menos gente: monte um plano de ataque COMPLETO e AGRESSIVO para MANTER O PRAZO ORIGINAL mesmo com a equipe reduzida.` : `Mesmo neste cenário (Δ ${deltaTotal > 0 ? "+" : ""}${deltaTotal}), entregue um plano de ataque para EXECUTAR o efetivo da forma mais eficiente possível e proteger o prazo.`} Preencha TODOS os campos do "planoAtaque". Gere de 4 a 7 "manobras" SEQUENCIADAS por "ordem" e por "fase" (linha do tempo da campanha), cada uma com ação concreta, comoExecutar prático, impactoPrazo e o ajuste na Linha de Balanço. Identifique o "centroDeGravidade" (a função/frente-gargalo decisiva) e concentre o esforço nela (Teoria das Restrições + Sun Tzu). Em "processosConstrutivos" e "automacoes" proponha de 2 a 4 itens REAIS e aplicáveis a obra de construção civil pesada (pré-fabricação, kits, formas industrializadas, mecanização, drones/medição, apps de campo etc.). Em "cenariosNaoObvios" traga de 2 a 4 insights que um engenheiro NÃO veria na correria do dia a dia. "linhaBalancoPlano" deve descrever o novo takt, nº de frentes simultâneas e a nova sequência. Seja específico, quantitativo e executável no canteiro — nada genérico.

MESA DE GUERRA — "alocacaoFrentes" (OBRIGATÓRIO e DETALHADO): este é o coração do plano — distribua FISICAMENTE as pessoas do CENÁRIO SIMULADO nas frentes de trabalho, como um comandante posicionando tropas no terreno. Gere de 3 a 6 frentes cobrindo as atividades em andamento e as das próximas semanas. Para CADA frente, monte a "equipe" listando função + quantidade + papel (o que cada função faz ali), respeitando as cuadrillas/relações de produção da TCPO (ex.: proporção pedreiro/servente) e SEM estourar o total de cada função no cenário simulado — a soma das quantidades de uma mesma função em todas as frentes NÃO pode exceder o efetivo simulado daquela função. Desconte quem está de FÉRIAS no período da frente. Calcule "totalPessoas" por frente, defina "ritmo" (takt/meta de produção), "duracao" (janela), "dependeDe" (sequenciamento entre frentes) e "risco". Seja DIDÁTICO: explique o porquê de cada alocação em linguagem clara para o engenheiro entender de bate-pronto. O conjunto das frentes deve formar um plano coerente que MANTÉM O PRAZO FINAL com a equipe disponível.

PLANO TÁTICO POR ATIVIDADE — "planoTatico" (OBRIGATÓRIO): desça da frente para a ATIVIDADE do cronograma. Para as ATIVIDADES EM ANDAMENTO e das PRÓXIMAS SEMANAS listadas acima (use os NOMES EXATOS), aloque a equipe do CENÁRIO SIMULADO (cargo + qtd), respeitando as cuadrillas da TCPO e SEM estourar o efetivo de cada função quando atividades acontecem em paralelo. Em cada item informe período em datas BR, meta, ritmo/takt, um "comoFazer" PASSO A PASSO e SIMPLES (linguagem de canteiro, sem jargão) e uma "checagem" diária/semanal. Gere de 4 a 8 itens, do mais crítico/imediato para o mais distante.

LINHA DE BALANÇO — "linhaBalanco" (OBRIGATÓRIO — o ERP vai DESENHAR o gráfico a partir destes dados): defina "unidade" repetitiva, "inicioRef" (data BR da Semana 1), "horizonteSemanas" (cobrindo o horizonte das atividades) e, em "atividades", para CADA serviço relevante o "inicioSemana"/"fimSemana" (inteiros 1-based dentro do horizonte), o "ritmo" e a "equipe" resumida. As janelas devem refletir o sequenciamento e o takt do plano (serviços em paralelo se sobrepõem no tempo; serviços dependentes começam depois). Em "leitura", explique o gráfico para um leigo.

LINHA DE BALANÇO POR PAVIMENTO — "linhaBalancoPavimentos" (OBRIGATÓRIO — DINÂMICA, o ERP DESENHA o gráfico real de LOB): este é o gráfico que o usuário pediu. Use a lista PAVIMENTOS DETECTADAS acima — preencha "pavimentos" copiando LITERALMENTE TODOS os nomes de lá, ORDENADOS da base para o topo, SEM parafrasear, renumerar ou abreviar (ex.: se vier "Térreo", "Pav. 6", "Cobertura", use EXATAMENTE essas strings — NÃO escreva "Pavimento 1", "Pavimento 2"...). Só se a lista vier vazia infira de 3 a 8 unidades plausíveis a partir das atividades. Para CADA serviço repetitivo (chapisco, emboço, contrapiso, revestimento, gesso, pintura, etc.) crie uma linha em "atividades" informando "pavInicioNome"/"pavFimNome" (o NOME EXATO do pavimento, copiado da lista) E "pavInicio"/"pavFim" (1-based, índices na lista de pavimentos, base→topo) e "semanaInicio"/"semanaFim" (1-based no horizonte) — isso traça a DIAGONAL da equipe subindo os pavimentos ao longo do tempo, com a inclinação refletindo o "ritmo" (1 pav/sem = diagonal de 1 pavimento por semana). Respeite o sequenciamento construtivo (um serviço só começa num pavimento depois do anterior) e EVITE colisões (duas equipes não ocupam o mesmo pavimento na mesma semana, salvo se compatíveis). Atribua "assertividade" (0-100) por linha. "leitura" deve explicar o gráfico ao engenheiro.

REALOCAÇÃO DE EQUIPES — "realocacaoEquipes" (OBRIGATÓRIO — onde alocar a MDO, por quanto tempo, e DEPOIS realocar): para CADA quadrilha-chave (3 a 6 equipes), liste a "composicao" (cargo + qtd, do CENÁRIO SIMULADO, sem estourar o efetivo), o "totalPessoas" e a sequência de "movimentos" ORDENADA: em cada movimento diga o "pavimento" (ou frente) onde a equipe entra, a "atividade", a "janela" em datas BR, a "duracao" e a "meta" que a equipe entrega ANTES de ser realocada para o próximo pavimento. Encadeie os movimentos como um fluxo de takt (a equipe termina o pav N e sobe para o N+1). Dê "assertividade" (0-100) e "baseEstatistica" por equipe.

ASSERTIVIDADE — "assertividadeGlobal" + campos "assertividade" por item (OBRIGATÓRIO, BASEADO EM ESTATÍSTICA): atribua a CADA item de "planoTatico", a cada linha de "linhaBalancoPavimentos" e a cada equipe de "realocacaoEquipes" um % de assertividade (0-100) com sua base ("baseAssertividade"/"baseEstatistica"). Em "assertividadeGlobal" dê o "percentual" consolidado, a "classe" (alta ≥80 / media 60-79 / baixa <60), a "base" (rendimentos TCPO, folga/buffer do cronograma, viabilidade do paralelismo, impacto das férias, histórico de obras similares) e de 2 a 5 "fatores" (positivos/negativos com peso). Seja honesto: paralelismo agressivo, equipe enxuta ou muitas férias DERRUBAM a assertividade.

GUIA DO ESTAGIÁRIO — "guiaEstagiario" (OBRIGATÓRIO e DIDÁTICO): um roteiro NUMERADO de 5 a 8 passos tão claro que um ESTAGIÁRIO consiga conduzir a análise e tocar o plano sozinho — o que olhar, o que fazer, em que ordem, e como conferir se cada passo deu certo. Linguagem simples, direta, sem jargão.

DIDÁTICA GERAL (obrigatória em TODA a resposta): escreva para ser fácil de entender — frases curtas, linguagem de obra, evite jargão; quando um termo técnico for inevitável, explique-o em poucas palavras. O objetivo é que qualquer pessoa da equipe, até um estagiário, leia e saiba exatamente o que fazer.`;

      let parsed: any = null;
      let erroIa: string | null = null;
      try {
        const result = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user",   content: userPrompt },
          ],
          // Rev. 2590 — o usuário pediu "sem limite de informação" (a resposta
          // vinha truncada — "atingiu o limite de tamanho"). Teto de tokens alto
          // p/ o plano sair completo (plano tático + linha de balanço + guia).
          // Rev. 2592 — o Claude não-streaming usado pela 2590 estourava o timeout
          // do proxy/iOS no iPad → a simulação "dava erro" e, como a persistência
          // só ocorre com `parsed`, NADA era salvo no Histórico. Voltamos ao
          // caminho rápido (Gemini 2.5 Flash): responde dentro do timeout E aguenta
          // os 16000 tokens, então o plano sai completo sem travar (Claude segue
          // como fallback dentro do invokeLLM).
          maxTokens: 16000,
          response_format: { type: "json_object" },
          fast: true,
        });
        const content = result.choices?.[0]?.message?.content;
        const raw = typeof content === "string"
          ? content
          : Array.isArray(content) ? ((content[0] as any)?.text ?? "") : "";
        const r = extrairJsonIa(raw);
        parsed = r.parsed ? brDatasDeep(r.parsed) : r.parsed;
        // Rev. 2596 — força o eixo da Linha de Balanço a usar os NOMES REAIS do
        // cronograma (pavimentosDetectados), realinhando as diagonais por nome.
        forcarPavimentosReais(parsed, pavimentosDetectados);
        erroIa = r.erroIa;
      } catch (err: any) {
        erroIa = err?.message?.includes("Nenhuma chave")
          ? "Nenhuma chave de IA configurada. Configure ANTHROPIC_API_KEY ou GOOGLE_API_KEY nas secrets para usar a simulação."
          : `Não foi possível gerar a simulação de IA: ${err?.message ?? "erro desconhecido"}.`;
      }

      const resultado = {
        obra:    obra?.nome ?? "",
        projeto: projeto.nome ?? "",
        revisao: revisao.numero ?? null,
        geradoEm: new Date().toISOString(),
        efetivoResumo: { total: totalEfetivo, ativos: totalAtivos, indisponiveis: totalIndisponiveis },
        atividadesResumo: { emAndamento: emAndamento.length, proximas: proximas.length },
        cenario: { porCargo: cenario, totalAtual: totalAtualCen, totalSimulado, deltaTotal },
        previsao: parsed,
        erroIa,
      };

      // Persiste a simulação p/ consulta futura (só quando a IA produziu resultado).
      let analiseId: number | null = null;
      if (parsed) {
        const titulo = parsed?.tituloCenario
          ?? `Cenário ${totalAtualCen} → ${totalSimulado} (${deltaTotal > 0 ? "+" : ""}${deltaTotal})`;
        analiseId = await salvarAnaliseEfetivo(db, {
          projetoId: input.projetoId,
          companyId,
          tipo: "simulacao",
          veredito: parsed?.veredito ?? null,
          titulo,
          obra: obra?.nome ?? null,
          revisaoNumero: revisao.numero ?? null,
          resultado,
          erroIa,
          criadoPor: (ctx.user as any).name ?? null,
        });
      }

      return { ...resultado, analiseId };
    }),

  // ── Histórico de análises de Efetivo × IA (diagnósticos + simulações) ───────
  listarAnalisesEfetivo: protectedProcedure
    .input(z.object({ projetoId: z.number(), companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco de dados indisponível.");
      const companyId = input.companyId;
      await assertCompanyAccessIa(ctx, companyId);
      await assertAiModuleEnabled(companyId, "planejamento");
      try {
        const rows = await db
          .select({
            id: planejamentoAnalisesEfetivo.id,
            tipo: planejamentoAnalisesEfetivo.tipo,
            veredito: planejamentoAnalisesEfetivo.veredito,
            titulo: planejamentoAnalisesEfetivo.titulo,
            obra: planejamentoAnalisesEfetivo.obra,
            revisaoNumero: planejamentoAnalisesEfetivo.revisaoNumero,
            criadoPor: planejamentoAnalisesEfetivo.criadoPor,
            criadoEm: planejamentoAnalisesEfetivo.criadoEm,
          })
          .from(planejamentoAnalisesEfetivo)
          .where(and(
            eq(planejamentoAnalisesEfetivo.projetoId, input.projetoId),
            eq(planejamentoAnalisesEfetivo.companyId, companyId),
          ))
          .orderBy(desc(planejamentoAnalisesEfetivo.criadoEm))
          .limit(100);
        return rows;
      } catch (err: any) {
        console.error("[listarAnalisesEfetivo] falha (retornando vazio):", err?.message ?? err);
        return [];
      }
    }),

  // Detalhe de uma análise salva (reabre o resultado completo no histórico).
  getAnaliseEfetivo: protectedProcedure
    // Rev. 2700 — `projetoId` agora é obrigatório no escopo: o `id` da análise é
    // sequencial/adivinhável, então filtrar SÓ por `(id, companyId)` permitia
    // abrir a análise de OUTRO projeto da mesma empresa chutando o id. Filtra
    // por `(id, projetoId, companyId)`, alinhado a `listarAnalisesEfetivo` /
    // `ultimaAnaliseEfetivo` (que já escopam por projeto).
    .input(z.object({ id: z.number(), projetoId: z.number(), companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco de dados indisponível.");
      const companyId = input.companyId;
      // Só o admin_master cruza empresas; demais ficam presos à empresa pedida.
      const isAdminMaster = ctx.user.role === "admin_master";
      await assertCompanyAccessIa(ctx, companyId);
      // Anti-IDOR: além do `id`, prende a leitura ao `projetoId` (sempre) e à
      // empresa pedida (exceto admin_master), tudo NA QUERY, sem depender de
      // checagem pós-leitura.
      const conds = [
        eq(planejamentoAnalisesEfetivo.id, input.id),
        eq(planejamentoAnalisesEfetivo.projetoId, input.projetoId),
      ];
      if (!isAdminMaster) conds.push(eq(planejamentoAnalisesEfetivo.companyId, Number(companyId)));
      const [row] = await db
        .select()
        .from(planejamentoAnalisesEfetivo)
        .where(and(...conds))
        .limit(1);
      if (!row) throw new Error("Análise não encontrada.");
      // Datas SEMPRE em BR — converte também análises ANTIGAS salvas em ISO.
      return { ...row, resultado: brDatasDeep((row as any).resultado) };
    }),

  // Última análise salva de um tipo (diagnostico|simulacao) — usada para
  // RESTAURAR o resultado na aba ao reabrir a tela (antes a análise se perdia ao
  // sair, pois ficava só no state local). SOMENTE LEITURA; retorna null se não há.
  ultimaAnaliseEfetivo: protectedProcedure
    .input(z.object({
      projetoId: z.number(),
      companyId: z.number(),
      tipo: z.enum(["diagnostico", "simulacao"]),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco de dados indisponível.");
      const companyId = input.companyId;
      await assertCompanyAccessIa(ctx, companyId);
      await assertAiModuleEnabled(companyId, "planejamento");
      try {
        const [row] = await db
          .select()
          .from(planejamentoAnalisesEfetivo)
          .where(and(
            eq(planejamentoAnalisesEfetivo.projetoId, input.projetoId),
            eq(planejamentoAnalisesEfetivo.companyId, companyId),
            eq(planejamentoAnalisesEfetivo.tipo, input.tipo),
          ))
          .orderBy(desc(planejamentoAnalisesEfetivo.criadoEm))
          .limit(1);
        if (!row) return null;
        return {
          id: (row as any).id,
          criadoEm: (row as any).criadoEm,
          criadoPor: (row as any).criadoPor ?? null,
          resultado: brDatasDeep((row as any).resultado),
        };
      } catch (err: any) {
        console.error("[ultimaAnaliseEfetivo] falha (retornando null):", err?.message ?? err);
        return null;
      }
    }),

  // ── Pergunte à IA — Q&A em linguagem natural sobre o efetivo × cronograma ──
  // Legenda interativa da aba "Efetivo × IA": o engenheiro tira dúvidas e a IA
  // responde DIDÁTICO usando SOMENTE os dados desta obra (efetivo + cronograma).
  // SOMENTE LEITURA (reusa coletarEfetivoCronograma); não persiste nada.
  perguntarEfetivo: protectedProcedure
    .input(z.object({
      projetoId: z.number(),
      companyId: z.number(),
      pergunta:  z.string().trim().min(2).max(800),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco de dados indisponível.");
      const companyId = input.companyId;
      await assertCompanyAccessIa(ctx, companyId);
      await assertAiModuleEnabled(companyId, "planejamento");

      const {
        projeto, obra, revisao,
        totalEfetivo, totalAtivos, totalIndisponiveis,
        emAndamento, proximas, hoje,
        efetivoTxt, emAndTxt, proxTxt,
        feriasTxt, feriasResumoTxt, totalFeriasHorizonte,
      } = await coletarEfetivoCronograma(db, input.projetoId, companyId);

      const systemPrompt = `Você é JULINHO, engenheiro sênior de planejamento e gestão de mão de obra da FC Engenharia (construção civil pesada brasileira). O usuário está olhando a tela "Efetivo × Cronograma (IA)" e tem uma DÚVIDA. Responda de forma DIRETA, DIDÁTICA e curta (no máximo ~6 frases, ou uma lista curta), em português brasileiro, usando SOMENTE os dados do contexto desta obra (efetivo atual, cronograma e férias dos alocados). Se a pergunta pedir algo que não está nos dados, diga claramente que essa informação não está disponível nesta tela. NÃO invente números: cite apenas valores presentes no contexto. Sobre FÉRIAS, aplique a regra da FC: o 2º/3º período é INADIÁVEL (o funcionário sai na data; planeje repondo/antecipando/terceirizando/redistribuindo) e o 1º período só se remaneja se a função for IMPRESCINDÍVEL para o prazo; o objetivo é sempre MANTER O PRAZO FINAL. Quando fizer sentido, fundamente em literatura consagrada (PMBOK/PMI, TCPO, CII/overmanning, Lei de Brooks, Koskela/Ballard/Lean), mas sem encher de jargão. TODAS as datas SEMPRE no padrão brasileiro DD/MM/AAAA (jamais ISO/AAAA-MM-DD). Não use markdown pesado; texto limpo.`;

      const userPrompt = `# Contexto da obra
**Obra:** ${obra?.nome ?? "—"} | **Projeto:** ${projeto.nome ?? "—"} (Revisão ${revisao.numero ?? "?"})
**Data de referência:** ${isoParaBR(hoje.toISOString())}

## EFETIVO ATUAL ALOCADO (total: ${totalEfetivo} | ativos: ${totalAtivos} | indisponíveis: ${totalIndisponiveis})
${efetivoTxt}

## ATIVIDADES EM ANDAMENTO HOJE (${emAndamento.length})
${emAndTxt}

## ATIVIDADES DAS PRÓXIMAS 8 SEMANAS (${proximas.length})
${proxTxt}

## FÉRIAS DOS ALOCADOS (impacto no prazo — ${totalFeriasHorizonte} pessoa(s) ausente(s) no horizonte)
### Resumo por função (no horizonte)
${feriasResumoTxt}
### Detalhe dos períodos
${feriasTxt}

---
DÚVIDA DO USUÁRIO: ${input.pergunta}`;

      let resposta = "";
      let erroIa: string | null = null;
      try {
        const result = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user",   content: userPrompt },
          ],
          maxTokens: 1000,
          // Caminho rápido (Gemini 2.5 Flash): evita o timeout do proxy/iOS que
          // derrubava as perguntas no iPad/Safari (resposta crua "did not match…").
          fast: true,
        });
        const content = result.choices?.[0]?.message?.content;
        resposta = brDatasTexto((typeof content === "string"
          ? content
          : Array.isArray(content) ? ((content[0] as any)?.text ?? "") : "").trim());
      } catch (err: any) {
        erroIa = err?.message?.includes("Nenhuma chave")
          ? "Nenhuma chave de IA configurada. Configure ANTHROPIC_API_KEY ou GOOGLE_API_KEY nas secrets para usar o assistente."
          : `Não foi possível responder agora: ${err?.message ?? "erro desconhecido"}.`;
      }
      if (!resposta && !erroIa) erroIa = "A IA não retornou resposta. Tente reformular a pergunta.";

      // Auditoria/Telemetria: registra a pergunta do usuário (e a resposta) em
      // `ia_modulo_conversas` (mesma tabela do chat dos módulos) para aparecer na
      // tela "Telemetria & Analytics › Analytics da IA". Best-effort: nunca
      // derruba a resposta. Só grava quando houve resposta efetiva.
      if (resposta) {
        try {
          await db.execute(sql`
            INSERT INTO ia_modulo_conversas (
              company_id, user_id, user_name, modulo, pergunta, resposta, projeto_id
            ) VALUES (
              ${companyId},
              ${(ctx.user as any)?.id ?? 0},
              ${(ctx.user as any)?.name ?? ""},
              ${"planejamento"},
              ${input.pergunta},
              ${resposta},
              ${input.projetoId}
            )
          `);
        } catch (e) {
          console.warn("[perguntarEfetivo] Erro ao salvar auditoria/telemetria:", e);
        }
      }

      return {
        resposta,
        erroIa,
        obra: obra?.nome ?? "",
        revisao: revisao.numero ?? null,
        geradoEm: new Date().toISOString(),
      };
    }),

  // ── Programação Semanal — Alertas IA das próximas semanas ────────────────
  alertasSemana: protectedProcedure
    .input(z.object({
      projetoId:    z.number(),
      nomeProjeto:  z.string(),
      semanas: z.array(z.object({
        numero:   z.number(),
        ini:      z.string(),
        fim:      z.string(),
        atividades: z.array(z.object({
          eapCodigo:         z.string().nullish(),
          nome:              z.string(),
          dataInicio:        z.string().nullish(),
          dataFim:           z.string().nullish(),
          recursoPrincipal:  z.string().nullish(),
          avancoPrevisto:    z.number().nullish(),
          avancoReal:        z.number().nullish(),
          atrasada:          z.boolean().nullish(),
        })),
        insumos: z.array(z.object({
          descricao: z.string(),
          unidade:   z.string().nullish(),
          quantidade: z.string().nullish(),
          tipo:      z.string().nullish(),
        })).optional(),
      })),
    }))
    .mutation(async ({ input }) => {
      await assertAiModuleEnabled(await companyIdDoProjeto(input.projetoId), "planejamento");
      const semanasTexto = input.semanas.map(s => {
        const atv = s.atividades.map(a => {
          const status = a.atrasada ? " [ATRASADA]" : "";
          const avs = a.avancoPrevisto !== undefined
            ? ` | Previsto: ${a.avancoPrevisto.toFixed(1)}% | Real: ${(a.avancoReal ?? 0).toFixed(1)}%`
            : "";
          return `  - [${a.eapCodigo ?? "?"}] ${a.nome}${status} (${a.dataInicio ?? "?"} → ${a.dataFim ?? "?"})${avs}${a.recursoPrincipal ? ` | Recurso: ${a.recursoPrincipal}` : ""}`;
        }).join("\n");
        const ins = (s.insumos ?? []).slice(0, 20).map(i =>
          `  • ${i.descricao}${i.quantidade ? ` — ${i.quantidade} ${i.unidade ?? ""}` : ""}${i.tipo ? ` [${i.tipo}]` : ""}`
        ).join("\n");
        return `### SEMANA ${s.numero} (${s.ini} a ${s.fim})\nAtividades:\n${atv || "  (nenhuma)"}\n${ins ? `Insumos previstos:\n${ins}` : ""}`;
      }).join("\n\n");

      const systemPrompt = `Você é o JULINHO, engenheiro sênior de planejamento de obras da FC Engenharia. Analise a programação das próximas semanas e forneça alertas práticos e objetivos sobre: mobilização de recursos, riscos de atraso, sugestões de frentes alternativas e revisão de prazo. Use tom técnico e direto. Responda APENAS com JSON válido no formato especificado.`;

      const userPrompt = `Projeto: ${input.nomeProjeto}

${semanasTexto}

Retorne um JSON com esta estrutura exata:
{
  "resumo": "string — síntese executiva do período (2-3 frases)",
  "alertas": [
    {
      "tipo": "recurso" | "atraso" | "alternativa" | "revisao",
      "severidade": "alta" | "media" | "baixa",
      "semana": numero_da_semana,
      "titulo": "string curto",
      "descricao": "string detalhada com recomendação prática"
    }
  ],
  "mobilizacao": [
    {
      "semana": numero,
      "itens": ["string — recurso ou material a mobilizar"]
    }
  ],
  "frentesAlternativas": [
    {
      "semana": numero,
      "sugestao": "string — frente alternativa com justificativa"
    }
  ],
  "previsaoImpacto": "string — impacto estimado no prazo geral caso os alertas não sejam atendidos"
}`;

      let resultado: any = null;
      try {
        const result = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user",   content: userPrompt },
          ],
          maxTokens: 2500,
        });
        const raw = result.choices?.[0]?.message?.content ?? "";
        const match = raw.match(/\{[\s\S]*\}/);
        if (match) resultado = JSON.parse(match[0]);
      } catch (err: any) {
        resultado = {
          resumo: "IA indisponível no momento.",
          alertas: [],
          mobilizacao: [],
          frentesAlternativas: [],
          previsaoImpacto: "",
        };
      }

      return resultado ?? {
        resumo: "Sem dados suficientes para análise.",
        alertas: [],
        mobilizacao: [],
        frentesAlternativas: [],
        previsaoImpacto: "",
      };
    }),

  // ── Efetivo × IA — VISÃO GERAL DE TODAS AS OBRAS (Rev. 3294) ───────────────
  // Cruza o efetivo atual por função de TODAS as obras ativas da empresa
  // SELECIONADA com o cronograma das próximas 8 semanas e sugere remanejamento de
  // equipe SÓ entre obras PRÓXIMAS (mesma cidade/estado — `obras` não tem lat/long).
  // O histograma (efetivo atual por função) é DETERMINÍSTICO (vem do banco); a IA é
  // a camada que recomenda o efetivo-alvo e prioriza transferências. UMA chamada de
  // IA consolidada (evita estourar a quota do free-tier). A proximidade é garantida
  // NO SERVIDOR: qualquer transferência sugerida entre cidades diferentes é
  // descartada, mesmo que a IA a proponha. Persiste em `planejamento_analises_efetivo`
  // (projetoId=0, tipo="global") p/ recuperação após queda de conexão (iPad/Safari).
  efetivoGlobal: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco de dados indisponível.");
      const companyId = input.companyId;
      await assertCompanyAccessIa(ctx, companyId);
      await assertAiModuleEnabled(companyId, "planejamento");

      const normTxt = (s: any) => String(s ?? "").trim().toUpperCase();
      const cidadeKey = (cidade: any, estado: any) =>
        `${normTxt(cidade) || "—"}|${normTxt(estado) || "—"}`;

      // 1. Projetos ativos da empresa COM obra vinculada + localização da obra.
      const projetosRaw = await db.select({
        id:       planejamentoProjetos.id,
        nome:     planejamentoProjetos.nome,
        obraId:   planejamentoProjetos.obraId,
        status:   planejamentoProjetos.status,
        obraNome: obras.nome,
        cidade:   obras.cidade,
        estado:   obras.estado,
        obraAtiva: obras.isActive,
      }).from(planejamentoProjetos)
        .leftJoin(obras, eq(planejamentoProjetos.obraId, obras.id))
        .where(eq(planejamentoProjetos.companyId, companyId))
        .orderBy(desc(planejamentoProjetos.id));

      const ativos = (projetosRaw as any[]).filter((p) => {
        if (!p.obraId) return false;
        if (Number(p.obraAtiva) !== 1) return false;
        const st = String(p.status || "").toLowerCase();
        if (st.includes("conclu") || st.includes("suspen")) return false;
        return true;
      });

      // 2. Coleta o efetivo×cronograma de cada obra (dedupe por obraId; cap 40 obras).
      type ObraEfetivo = {
        obraId: number; projetoId: number; obra: string; cidade: string; estado: string;
        grupoProximidade: string;
        totalEfetivo: number; totalAtivos: number; totalIndisponiveis: number;
        emAndamento: number; proximas: number;
        porCargo: { cargo: string; categoria: string; total: number; ativos: number; indisponiveis: number; feriasHorizonte: number }[];
        proximasTopo: string[];
        frentesConcluindo: string[];
      };
      const obrasData: ObraEfetivo[] = [];
      const obrasVistas = new Set<number>();
      const obrasIgnoradas: { obra: string; motivo: string }[] = [];
      // Helpers de data p/ as frentes que CONCLUEM no horizonte (= quando a equipe
      // se libera p/ realocar). Horizonte = 56 dias (mesmo das próximas 8 semanas).
      const hojeG = new Date(); hojeG.setHours(0, 0, 0, 0);
      const horizG = new Date(hojeG); horizG.setDate(horizG.getDate() + 56);
      const parseDtG = (s: any): Date | null => {
        if (!s) return null;
        const d = new Date(String(s).slice(0, 10) + "T00:00:00");
        return isNaN(d.getTime()) ? null : d;
      };
      for (const p of ativos) {
        if (obrasVistas.has(p.obraId)) continue;
        if (obrasData.length >= 40) break;
        obrasVistas.add(p.obraId);
        try {
          const c = await coletarEfetivoCronograma(db, p.id, companyId);
          obrasData.push({
            obraId: p.obraId,
            projetoId: p.id,
            obra: p.obraNome || c.obra?.nome || `Obra ${p.obraId}`,
            cidade: String(p.cidade || "").trim(),
            estado: String(p.estado || "").trim(),
            grupoProximidade: cidadeKey(p.cidade, p.estado),
            totalEfetivo: c.totalEfetivo,
            totalAtivos: c.totalAtivos,
            totalIndisponiveis: c.totalIndisponiveis,
            emAndamento: (c.emAndamento || []).length,
            proximas: (c.proximas || []).length,
            porCargo: (c.porCargo || []).map((g: any) => ({
              cargo: g.cargo, categoria: g.categoria,
              total: g.total, ativos: g.ativos, indisponiveis: g.indisponiveis,
              feriasHorizonte: Number(g.feriasHorizonte) || 0,
            })),
            proximasTopo: (c.proximas || []).slice(0, 4).map((a: any) =>
              `${a.nome}${a.recursoPrincipal ? ` (recurso: ${a.recursoPrincipal})` : ""}`),
            // Frentes que CONCLUEM dentro do horizonte (libera a equipe = quando
            // SOBRA mão de obra). Em andamento + próximas com dataFim ≤ 56 dias,
            // ordenadas pela data de término (a mais próxima primeiro).
            frentesConcluindo: [...(c.emAndamento || []), ...(c.proximas || [])]
              .filter((a: any) => { const f = parseDtG(a.dataFim); return f != null && f >= hojeG && f <= horizG; })
              .sort((a: any, b: any) => (parseDtG(a.dataFim)!.getTime()) - (parseDtG(b.dataFim)!.getTime()))
              .slice(0, 6)
              .map((a: any) => `${a.nome} — conclui ${isoParaBR(a.dataFim)}${a.recursoPrincipal ? ` (recurso: ${a.recursoPrincipal})` : ""}`),
          });
        } catch (err: any) {
          obrasIgnoradas.push({ obra: p.obraNome || `Obra ${p.obraId}`, motivo: String(err?.message ?? "sem cronograma/efetivo") });
        }
      }

      // 3. Histograma DETERMINÍSTICO: soma do efetivo atual por função (todas as obras).
      const histMap = new Map<string, { cargo: string; categoria: string; atualTotal: number; ativos: number; feriasHorizonte: number; obras: { obra: string; cidade: string; total: number }[] }>();
      for (const o of obrasData) {
        for (const g of o.porCargo) {
          const k = normTxt(g.cargo);
          if (!histMap.has(k)) histMap.set(k, { cargo: g.cargo, categoria: g.categoria, atualTotal: 0, ativos: 0, feriasHorizonte: 0, obras: [] });
          const h = histMap.get(k)!;
          h.atualTotal += g.total;
          h.ativos += g.ativos;
          h.feriasHorizonte += (g.feriasHorizonte || 0);
          h.obras.push({ obra: o.obra, cidade: o.cidade, total: g.total });
        }
      }

      // 4. Grupos de proximidade (mesma cidade/estado) com 2+ obras = candidatos a remanejamento.
      const grupos = new Map<string, ObraEfetivo[]>();
      for (const o of obrasData) {
        if (!grupos.has(o.grupoProximidade)) grupos.set(o.grupoProximidade, []);
        grupos.get(o.grupoProximidade)!.push(o);
      }
      const gruposComTroca = Array.from(grupos.entries()).filter(([, arr]) => arr.length >= 2);

      // 5. Monta o contexto multi-obra p/ a IA (compacto, p/ caber no free-tier).
      const obrasTxt = obrasData.map((o, i) => {
        const cargosTxt = o.porCargo.length
          ? o.porCargo.map((g) => `      • ${g.cargo} [${g.categoria}]: ${g.total} (ativos ${g.ativos}, indisp. ${g.indisponiveis}${g.feriasHorizonte ? `, entram de FÉRIAS inadiáveis nas próx. 8 sem: ${g.feriasHorizonte} → disponível no horizonte ${Math.max(0, g.ativos - g.feriasHorizonte)}` : ""})`).join("\n")
          : "      • (sem efetivo alocado)";
        const proxTxt = o.proximasTopo.length ? o.proximasTopo.map((a) => `      - ${a}`).join("\n") : "      - (nenhuma)";
        const concluiTxt = o.frentesConcluindo.length ? o.frentesConcluindo.map((a) => `      - ${a}`).join("\n") : "      - (nenhuma frente concluindo no horizonte)";
        return `  ${i + 1}. OBRA: ${o.obra} | Cidade: ${o.cidade || "—"}/${o.estado || "—"} | Grupo de proximidade: ${o.grupoProximidade}
     Efetivo total ${o.totalEfetivo} (ativos ${o.totalAtivos}, indisponíveis ${o.totalIndisponiveis}) | Atividades hoje: ${o.emAndamento} | Próximas 8 sem.: ${o.proximas}
     Efetivo por função:
${cargosTxt}
     Principais frentes que iniciam nas próximas semanas:
${proxTxt}
     Frentes que CONCLUEM no horizonte (liberam equipe → quando SOBRA mão de obra):
${concluiTxt}`;
      }).join("\n\n");

      const gruposTxt = gruposComTroca.length
        ? gruposComTroca.map(([k, arr]) => `  - ${k}: ${arr.map((o) => o.obra).join(" / ")}`).join("\n")
        : "  (Nenhum grupo com 2+ obras na mesma cidade/estado — NÃO há remanejamento possível entre obras próximas; deixe \"transferencias\" vazio.)";

      const systemPrompt = `Você é JULINHO, engenheiro sênior de planejamento e gestão de mão de obra da FC Engenharia (construção civil pesada). Aqui você faz a VISÃO GERAL DE TODAS AS OBRAS ATIVAS DE UMA EMPRESA ao mesmo tempo: cruza o efetivo atual de cada obra com o cronograma das próximas 8 semanas e identifica ONDE SOBRA gente (função terminando a frente) e ONDE FALTA (frente entrando sem efetivo), para sugerir REMANEJAMENTO de equipe entre obras.

ESTIMATIVA DE DATA DE SOBRA: para CADA função em que houver sobra, ESTIME EM QUE DATA a mão de obra ficará disponível para realocar. A sobra surge quando uma FRENTE/ATIVIDADE CONCLUI (a equipe daquela frente se libera). Use a lista "Frentes que CONCLUEM no horizonte" de cada obra (cada uma traz a data de término e, quando há, o recurso/função) para inferir a data. Se várias frentes da mesma função concluem em datas diferentes, use a data em que a sobra efetivamente se materializa (a frente cuja conclusão libera a quantidade indicada). Toda data DD/MM/AAAA dentro do horizonte das próximas 8 semanas.

PLANO DE AÇÃO POR EQUIPE (realocar × aviso prévio): para CADA sobra de equipe, decida e recomende UMA ação clara, com a DATA IDEAL para agir:
- "realocar": há OUTRA obra do MESMO grupo de proximidade (mesma cidade/estado) com FALTA da mesma função no horizonte. A "dataIdeal" é a data em que a equipe se libera na origem (quando a frente conclui). Informe a obra de destino.
- "aviso_previo": a obra está CONCLUINDO (fim de obra / sem mais frentes que demandem aquela função) e NÃO há obra próxima que absorva a equipe. Nesse caso o ideal é PROVIDENCIAR O AVISO PRÉVIO. Como o aviso prévio legal dura ~30 dias, a "dataIdeal" para INICIAR o aviso deve ser ~30 dias ANTES da data em que a frente/obra conclui e a equipe deixa de ter trabalho (para que o aviso termine junto com o fim do serviço). Nunca proponha aviso prévio quando há realocação possível.
- "manter": efetivo equilibrado / não há sobra real — não inclua no plano.
NÃO invente fim de obra: só recomende "aviso_previo" quando houver evidência (frente/obra concluindo no horizonte e ausência de demanda próxima).

REGRA DURA DE PROXIMIDADE: só sugira mover equipe entre obras do MESMO grupo de proximidade (mesma cidade/estado) — a empresa não remaneja gente entre cidades diferentes. Use SOMENTE os grupos com 2+ obras listados. Se não houver nenhum grupo com 2+ obras, retorne "transferencias": [].

Seja realista e conservador: só sugira mover quando houver EVIDÊNCIA de sobra numa obra (frente concluindo / função superdimensionada) E falta na outra (frente entrando). A quantidade deve ser pequena e plausível. Responda em português brasileiro, técnico e direto. Responda APENAS com JSON válido, sem texto fora do JSON. Datas SEMPRE DD/MM/AAAA.`;

      const userPrompt = `# Visão Geral — Efetivo × Cronograma de TODAS as obras
**Empresa (id):** ${companyId}
**Data de referência:** ${isoParaBR(new Date().toISOString())}
**Obras ativas analisadas:** ${obrasData.length}

## OBRAS
${obrasTxt || "  (Nenhuma obra ativa com cronograma importado.)"}

## GRUPOS DE PROXIMIDADE (remanejamento SÓ dentro destes)
${gruposTxt}

---
Retorne um JSON EXATAMENTE nesta estrutura (sem markdown, sem comentários):
{
  "resumoExecutivo": "string — 2 a 4 frases com a leitura geral (onde sobra, onde falta, principais oportunidades de remanejamento)",
  "histograma": [
    { "cargo": "string", "categoria": "string", "atualTotal": number, "recomendadoTotal": number, "delta": number, "leitura": "string — 1 frase por função" }
  ],
  "previsaoDisponibilidade": [
    { "cargo": "string", "obra": "string (nome EXATO da obra onde a sobra surge)", "dataEstimada": "DD/MM/AAAA — quando a mão de obra fica livre", "quantidade": number, "motivo": "string — qual frente concluindo libera a equipe", "sugestao": "string — para onde realocar (obra/frente) ou ação" }
  ],
  "planoEquipe": [
    { "cargo": "string", "obra": "string (nome EXATO da obra onde a equipe sobra)", "quantidade": number, "acao": "realocar | aviso_previo", "dataIdeal": "DD/MM/AAAA — quando agir (realocar: quando a equipe se libera; aviso_previo: ~30 dias antes do fim do serviço)", "destino": "string — obra de destino se acao=realocar, vazio se aviso_previo", "motivo": "string — por que esta ação (frente/obra concluindo, com ou sem demanda próxima)" }
  ],
  "transferencias": [
    { "cargo": "string", "deObra": "string (nome EXATO de uma obra da lista)", "paraObra": "string (nome EXATO de OUTRA obra do MESMO grupo de proximidade)", "cidade": "string", "quantidade": number, "dataDisponivel": "DD/MM/AAAA — data estimada em que a equipe se libera na origem (vazio se imediato)", "motivo": "string — por que sobra na origem e falta no destino", "impacto": "string — efeito no prazo das duas obras" }
  ],
  "riscos": [ "string" ],
  "recomendacoes": [ "string — ações práticas e priorizadas" ]
}

Regras: em "histograma" inclua TODAS as funções que aparecem no efetivo das obras; "delta" = recomendadoTotal - atualTotal (negativo = sobra/reduzir). Em "previsaoDisponibilidade" inclua UM item por função+obra em que há sobra (delta negativo / frente concluindo), com a DATA ESTIMADA em que a equipe se libera — derive a data das "Frentes que CONCLUEM no horizonte"; se não houver frente concluindo que justifique a sobra, NÃO invente data (omita o item). Considere que parte do efetivo ENTRA DE FÉRIAS INADIÁVEIS nas próximas 8 semanas (quando indicado na função como "entram de FÉRIAS ... → disponível no horizonte N"): a disponibilidade REAL no horizonte é o "disponível no horizonte", menor que o efetivo atual — leve isso em conta ao apontar falta de equipe e ao priorizar transferências. Em "transferencias", "deObra" e "paraObra" devem ser nomes EXATOS de obras do MESMO grupo de proximidade; jamais misture cidades; "dataDisponivel" = quando a equipe da origem se libera (use as frentes concluindo). Em "planoEquipe" inclua UM item por equipe que SOBRA, com a ação clara ("realocar" quando há obra próxima com falta da mesma função; "aviso_previo" quando a obra conclui e NÃO há obra próxima que absorva — neste caso "dataIdeal" ~30 dias antes do fim do serviço) e a "dataIdeal" para agir; "obra" e "destino" devem ser nomes EXATOS de obras da lista; não inclua ação "manter". Seja específico e quantitativo.`;

      let parsed: any = null;
      let erroIa: string | null = null;
      try {
        const result = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user",   content: userPrompt },
          ],
          maxTokens: 8000,
          response_format: { type: "json_object" },
          fast: true,
        });
        const content = result.choices?.[0]?.message?.content;
        const raw = typeof content === "string"
          ? content
          : Array.isArray(content) ? ((content[0] as any)?.text ?? "") : "";
        const r = extrairJsonIa(raw);
        parsed = r.parsed ? brDatasDeep(r.parsed) : r.parsed;
        erroIa = r.erroIa;
      } catch (err: any) {
        erroIa = err?.message?.includes("Nenhuma chave")
          ? "Nenhuma chave de IA configurada. Configure ANTHROPIC_API_KEY ou GOOGLE_API_KEY nas secrets para usar a análise."
          : `Não foi possível gerar a análise de IA: ${err?.message ?? "erro desconhecido"}.`;
      }

      // 6. Histograma final = DETERMINÍSTICO (atual) + recomendado da IA (quando houver).
      const recoMap = new Map<string, { recomendadoTotal: number; leitura: string }>();
      if (parsed && Array.isArray(parsed.histograma)) {
        for (const h of parsed.histograma) {
          recoMap.set(normTxt(h?.cargo), {
            recomendadoTotal: Number.isFinite(Number(h?.recomendadoTotal)) ? Math.max(0, Math.round(Number(h.recomendadoTotal))) : 0,
            leitura: String(h?.leitura ?? ""),
          });
        }
      }
      const histograma = Array.from(histMap.values())
        .sort((a, b) => b.atualTotal - a.atualTotal)
        .map((h) => {
          const reco = recoMap.get(normTxt(h.cargo));
          const recomendadoTotal = reco ? reco.recomendadoTotal : h.atualTotal;
          const disponivelHorizonte = Math.max(0, h.ativos - h.feriasHorizonte);
          return {
            cargo: h.cargo,
            categoria: h.categoria,
            atualTotal: h.atualTotal,
            ativos: h.ativos,
            feriasHorizonte: h.feriasHorizonte,
            disponivelHorizonte,
            recomendadoTotal,
            delta: recomendadoTotal - h.atualTotal,
            leitura: reco?.leitura ?? "",
            obras: h.obras,
          };
        });

      // 7. Transferências: FILTRO DURO de proximidade no servidor (mesma cidade/estado).
      const obraInfo = new Map<string, { cidade: string; estado: string }>();
      for (const o of obrasData) obraInfo.set(normTxt(o.obra), { cidade: o.cidade, estado: o.estado });
      const transferencias: any[] = [];
      if (parsed && Array.isArray(parsed.transferencias)) {
        for (const t of parsed.transferencias) {
          const de = obraInfo.get(normTxt(t?.deObra));
          const para = obraInfo.get(normTxt(t?.paraObra));
          const qtd = Math.min(999, Math.max(0, Math.round(Number(t?.quantidade) || 0)));
          if (!de || !para) continue;                                   // obra inexistente → descarta
          if (normTxt(t?.deObra) === normTxt(t?.paraObra)) continue;    // mesma obra → descarta
          if (cidadeKey(de.cidade, de.estado) !== cidadeKey(para.cidade, para.estado)) continue; // cidades ≠ → DESCARTA
          if (qtd <= 0) continue;
          transferencias.push({
            cargo: String(t?.cargo ?? "").slice(0, 120),
            deObra: String(t?.deObra ?? ""),
            paraObra: String(t?.paraObra ?? ""),
            cidade: `${de.cidade || "—"}/${de.estado || "—"}`,
            quantidade: qtd,
            dataDisponivel: String(t?.dataDisponivel ?? "").trim().slice(0, 40) || null,
            motivo: String(t?.motivo ?? "").slice(0, 600),
            impacto: String(t?.impacto ?? "").slice(0, 600),
          });
        }
      }

      // 7b. Previsão de disponibilidade: QUANDO (data) cada função sobra p/ realocar.
      // Só aceita itens cuja obra existe na lista analisada (evita alucinação).
      const previsaoDisponibilidade: any[] = [];
      if (parsed && Array.isArray(parsed.previsaoDisponibilidade)) {
        for (const d of parsed.previsaoDisponibilidade) {
          if (!obraInfo.has(normTxt(d?.obra))) continue;            // obra inexistente → descarta
          const qtd = Math.min(999, Math.max(0, Math.round(Number(d?.quantidade) || 0)));
          const cargo = String(d?.cargo ?? "").trim().slice(0, 120);
          const dataEstimada = String(d?.dataEstimada ?? "").trim().slice(0, 40);
          if (!cargo || !dataEstimada) continue;                   // sem função ou sem data → descarta
          previsaoDisponibilidade.push({
            cargo,
            obra: String(d?.obra ?? "").trim().slice(0, 300),
            dataEstimada,
            quantidade: qtd > 0 ? qtd : null,
            motivo: String(d?.motivo ?? "").trim().slice(0, 600),
            sugestao: String(d?.sugestao ?? "").trim().slice(0, 600),
          });
        }
      }

      // 7c. Plano de ação por equipe: REALOCAR (obra próxima com falta) × AVISO PRÉVIO
      // (fim de obra sem demanda próxima). Só aceita obra/destino existentes; "acao" enum.
      const planoEquipe: any[] = [];
      if (parsed && Array.isArray(parsed.planoEquipe)) {
        for (const p of parsed.planoEquipe) {
          if (!obraInfo.has(normTxt(p?.obra))) continue;           // obra inexistente → descarta
          const cargo = String(p?.cargo ?? "").trim().slice(0, 120);
          const dataIdeal = String(p?.dataIdeal ?? "").trim().slice(0, 40);
          let acao = String(p?.acao ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
          if (acao !== "realocar" && acao !== "aviso_previo") continue; // ação inválida → descarta
          if (!cargo) continue;
          const qtd = Math.min(999, Math.max(0, Math.round(Number(p?.quantidade) || 0)));
          // destino só vale se for outra obra existente E ação=realocar
          const destinoRaw = String(p?.destino ?? "").trim();
          const destino = (acao === "realocar" && destinoRaw && obraInfo.has(normTxt(destinoRaw)) && normTxt(destinoRaw) !== normTxt(p?.obra))
            ? destinoRaw.slice(0, 300) : null;
          if (acao === "realocar" && !destino) continue;          // realocar sem destino válido → descarta
          planoEquipe.push({
            cargo,
            obra: String(p?.obra ?? "").trim().slice(0, 300),
            quantidade: qtd > 0 ? qtd : null,
            acao,
            dataIdeal: dataIdeal || null,
            destino,
            motivo: String(p?.motivo ?? "").trim().slice(0, 600),
          });
        }
      }

      const resultado = {
        geradoEm: new Date().toISOString(),
        companyId,
        totalObras: obrasData.length,
        obrasIgnoradas,
        gruposProximidade: gruposComTroca.map(([k, arr]) => ({ grupo: k, obras: arr.map((o) => o.obra) })),
        resumoTotais: {
          efetivoTotal: obrasData.reduce((s, o) => s + o.totalEfetivo, 0),
          ativos: obrasData.reduce((s, o) => s + o.totalAtivos, 0),
          indisponiveis: obrasData.reduce((s, o) => s + o.totalIndisponiveis, 0),
          feriasHorizonte: Array.from(histMap.values()).reduce((s, h) => s + h.feriasHorizonte, 0),
          funcoes: histograma.length,
        },
        obras: obrasData.map((o) => ({
          obra: o.obra, cidade: o.cidade, estado: o.estado,
          totalEfetivo: o.totalEfetivo, totalAtivos: o.totalAtivos, totalIndisponiveis: o.totalIndisponiveis,
          emAndamento: o.emAndamento, proximas: o.proximas,
        })),
        histograma,
        transferencias,
        previsaoDisponibilidade,
        planoEquipe,
        resumoExecutivo: ((): string | null => {
          const s = String(parsed?.resumoExecutivo ?? "").trim();
          return s ? s.slice(0, 2000) : null;
        })(),
        riscos: (Array.isArray(parsed?.riscos) ? parsed.riscos : [])
          .map((r: any) => String(r ?? "").trim().slice(0, 600))
          .filter(Boolean)
          .slice(0, 20),
        recomendacoes: (Array.isArray(parsed?.recomendacoes) ? parsed.recomendacoes : [])
          .map((r: any) => String(r ?? "").trim().slice(0, 600))
          .filter(Boolean)
          .slice(0, 20),
        erroIa,
      };

      // 8. Persiste (best-effort) p/ recuperação após queda — projetoId=0, tipo="global".
      try {
        await db.insert(planejamentoAnalisesEfetivo).values({
          projetoId: 0,
          companyId,
          tipo: "global",
          veredito: null,
          titulo: `Efetivo × IA — ${obrasData.length} obra(s)`.slice(0, 400),
          obra: null,
          revisaoNumero: null,
          resultado,
          contexto: {},
          erroIa,
          criadoPor: ((ctx.user as any).name ?? null),
        });
      } catch (err: any) {
        console.error("[efetivoGlobal] falha ao persistir (ignorado):", err?.message ?? err);
      }

      return resultado;
    }),

  // Última visão geral global salva — restaura o resultado ao reabrir / após queda.
  ultimaEfetivoGlobal: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco de dados indisponível.");
      const companyId = input.companyId;
      await assertCompanyAccessIa(ctx, companyId);
      await assertAiModuleEnabled(companyId, "planejamento");
      try {
        const [row] = await db
          .select()
          .from(planejamentoAnalisesEfetivo)
          .where(and(
            eq(planejamentoAnalisesEfetivo.projetoId, 0),
            eq(planejamentoAnalisesEfetivo.companyId, companyId),
            eq(planejamentoAnalisesEfetivo.tipo, "global"),
          ))
          .orderBy(desc(planejamentoAnalisesEfetivo.criadoEm))
          .limit(1);
        if (!row) return null;
        return {
          id: (row as any).id,
          criadoEm: (row as any).criadoEm,
          criadoPor: (row as any).criadoPor ?? null,
          resultado: brDatasDeep((row as any).resultado),
        };
      } catch (err: any) {
        console.error("[ultimaEfetivoGlobal] falha (retornando null):", err?.message ?? err);
        return null;
      }
    }),
});
