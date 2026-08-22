// ============================================================
// Radar de Férias — cruza férias agendadas/concessivo apertado (próximos
// 60 dias) com o efetivo por obra e alerta Admin Masters + responsável
// da obra (escopo POR OBRA: gestor só vê alertas da sua obra).
// Regras (Fase 1):
//  1. sem_substituto — função única na obra sem cobertura no período (crítico)
//  2. esvaziamento   — ≥30% do efetivo da obra de férias na mesma semana (crítico)
//  3. concessivo     — concessivo vence em ≤60 dias e gozo não agendado (atenção)
// Sugestão: 1º período → postergar (se concessivo permitir); 2º+ → treinar/
// realocar (lista candidatos da mesma função em outras obras); sem candidato
// e sem margem → contratar folguista.
// ============================================================
import { getDb, criarUserAlert } from "../db";
import { sql, and, eq, isNull, inArray } from "drizzle-orm";
import { vacationPeriods, employees, obras, obraFuncionarios, users, userCompanies } from "../../drizzle/schema";

const JANELA_DIAS = 60;
const LIMITE_SIMULTANEO = 0.3; // 30% do efetivo da obra
const MIN_EFETIVO_ESVAZIAMENTO = 3; // obra com <3 pessoas não gera alerta de esvaziamento
const DEDUP_DIAS = 15;

export type RadarRisco = {
  chave: string;
  tipoRisco: "sem_substituto" | "esvaziamento" | "concessivo";
  severidade: "critico" | "atencao";
  obraId: number | null;
  obraNome: string;
  employeeId?: number;
  employeeName?: string;
  fotoUrl?: string | null;
  funcao?: string | null;
  /** Último dia viável para INICIAR o gozo (concessivoFim − (duração − 1)) */
  dataLimiteInicio?: string | null;
  vacationPeriodId?: number;
  numeroPeriodo?: number;
  dataInicio?: string | null;
  dataFim?: string | null;
  concessivoFim?: string | null;
  titulo: string;
  detalhe: string;
  sugestao: string;
  candidatos?: { employeeId: number; nome: string; obraNome: string }[];
  envolvidos?: { employeeId: number; nome: string; dataInicio: string; dataFim: string }[];
};

function addDias(iso: string, dias: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().split("T")[0];
}
function fmtBR(iso?: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
function normFuncao(s?: string | null): string {
  return (s || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function overlap(aIni: string, aFim: string, bIni: string, bFim: string): boolean {
  return aIni <= bFim && bIni <= aFim;
}

/** Ordena os períodos EM ABERTO de cada funcionário pelo aquisitivo e devolve vpId → 1º/2º/... */
function computeOrdemAberta(vps: { id: number; employeeId: number | null; periodoAquisitivoInicio?: string | null }[]): Map<number, number> {
  const porEmp = new Map<number, { id: number; aq: string }[]>();
  for (const vp of vps) {
    if (!vp.employeeId) continue;
    if (!porEmp.has(vp.employeeId)) porEmp.set(vp.employeeId, []);
    porEmp.get(vp.employeeId)!.push({ id: vp.id, aq: vp.periodoAquisitivoInicio || "9999-12-31" });
  }
  const ordem = new Map<number, number>();
  for (const lista of porEmp.values()) {
    lista.sort((a, b) => a.aq.localeCompare(b.aq) || a.id - b.id);
    lista.forEach((vp, i) => ordem.set(vp.id, i + 1));
  }
  return ordem;
}

let radarTableReady = false;
export async function ensureRadarTable() {
  if (radarTableReady) return;
  const db = (await getDb())!;
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ferias_radar_resolucoes (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL,
      chave TEXT NOT NULL,
      decisao TEXT NOT NULL,
      observacao TEXT,
      user_id INTEGER NOT NULL,
      user_nome TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS frr_company_chave ON ferias_radar_resolucoes (company_id, chave)`);
  radarTableReady = true;
}

export async function computeRadarFerias(companyId: number): Promise<RadarRisco[]> {
  const db = (await getDb())!;
  const hoje = new Date().toISOString().split("T")[0];
  const fimJanela = addDias(hoje, JANELA_DIAS);

  // Funcionários CLT não desligados da empresa
  const emps = await db.select({
    id: employees.id,
    nome: employees.nomeCompleto,
    fotoUrl: employees.fotoUrl,
    funcao: employees.funcao,
    cargo: employees.cargo,
    status: employees.status,
  }).from(employees).where(and(
    eq(employees.companyId, companyId),
    isNull(employees.deletedAt),
    sql`${employees.status} NOT IN ('Desligado','Lista_Negra','Dispensado')`,
    sql`(${employees.tipoContrato} IS NULL OR ${employees.tipoContrato} NOT IN ('PJ','Socio'))`,
  ));
  const empById = new Map(emps.map(e => [e.id, e]));
  if (emps.length === 0) return [];

  // Alocação ativa (última por funcionário)
  const alocs = await db.select({
    employeeId: obraFuncionarios.employeeId,
    obraId: obraFuncionarios.obraId,
    id: obraFuncionarios.id,
  }).from(obraFuncionarios).where(and(
    eq(obraFuncionarios.companyId, companyId),
    eq(obraFuncionarios.isActive, 1),
  )).orderBy(obraFuncionarios.id);
  const obraDoEmp = new Map<number, number>();
  for (const a of alocs) if (a.employeeId != null && a.obraId != null) obraDoEmp.set(a.employeeId, a.obraId);

  const obraIds = [...new Set([...obraDoEmp.values()])];
  const obrasRows = obraIds.length ? await db.select({ id: obras.id, nome: obras.nome, responsavelId: obras.responsavelId })
    .from(obras).where(inArray(obras.id, obraIds)) : [];
  const obraById = new Map(obrasRows.map(o => [o.id, o]));

  // Períodos de férias relevantes (não deletados, não concluídos/cancelados)
  const vps = await db.select({
    id: vacationPeriods.id,
    employeeId: vacationPeriods.employeeId,
    dataInicio: vacationPeriods.dataInicio,
    dataFim: vacationPeriods.dataFim,
    periodo2Inicio: vacationPeriods.periodo2Inicio,
    periodo2Fim: vacationPeriods.periodo2Fim,
    periodo3Inicio: vacationPeriods.periodo3Inicio,
    periodo3Fim: vacationPeriods.periodo3Fim,
    status: vacationPeriods.status,
    numeroPeriodo: vacationPeriods.numeroPeriodo,
    periodoAquisitivoInicio: vacationPeriods.periodoAquisitivoInicio,
    periodoConcessivoFim: vacationPeriods.periodoConcessivoFim,
    diasGozo: vacationPeriods.diasGozo,
  }).from(vacationPeriods).where(and(
    eq(vacationPeriods.companyId, companyId),
    isNull(vacationPeriods.deletedAt),
    sql`${vacationPeriods.status} NOT IN ('concluida','cancelada')`,
  ));

  // Rev. 5116 — "1º/2º período" = posição do período entre os EM ABERTO do funcionário
  // (a coluna numeroPeriodo conta TODOS os períodos aquisitivos desde a admissão — ex.: 13º = 13 anos de casa)
  const ordemVp = computeOrdemAberta(vps);

  // Janelas de gozo (principal + fracionamentos) por funcionário
  type Gozo = { vpId: number; employeeId: number; ini: string; fim: string; numeroPeriodo: number; concessivoFim: string | null };
  const gozos: Gozo[] = [];
  for (const vp of vps) {
    if (!vp.employeeId || !empById.has(vp.employeeId)) continue;
    const push = (ini?: string | null, fim?: string | null) => {
      if (ini && fim && (vp.status === "agendada" || vp.status === "em_gozo")) {
        gozos.push({ vpId: vp.id, employeeId: vp.employeeId!, ini, fim, numeroPeriodo: ordemVp.get(vp.id) || 1, concessivoFim: vp.periodoConcessivoFim });
      }
    };
    push(vp.dataInicio, vp.dataFim);
    push(vp.periodo2Inicio, vp.periodo2Fim);
    push(vp.periodo3Inicio, vp.periodo3Fim);
  }
  // indisponível = de férias no intervalo, ou status não-Ativo
  const indisponivel = (empId: number, ini: string, fim: string): boolean => {
    const e = empById.get(empId);
    if (!e || e.status !== "Ativo") return true;
    return gozos.some(g => g.employeeId === empId && overlap(g.ini, g.fim, ini, fim));
  };

  const riscos: RadarRisco[] = [];

  // ── 1. Sem substituto (função única na obra) ──────────────
  // Rev. 5123 — só férias que ainda VÃO começar (ini >= hoje): quem já está
  // em gozo não gera alerta — não há mais decisão a tomar sobre a saída.
  const gozosJanela = gozos.filter(g => g.ini <= fimJanela && g.ini >= hoje);
  for (const g of gozosJanela) {
    const emp = empById.get(g.employeeId)!;
    const obraId = obraDoEmp.get(g.employeeId) ?? null;
    const obraNome = obraId ? (obraById.get(obraId)?.nome || `Obra #${obraId}`) : "Sem obra";
    if (!obraId) continue;
    const funcao = emp.funcao || emp.cargo;
    if (!funcao) continue;
    const fn = normFuncao(funcao);
    // cobertura na MESMA obra: mesma função, disponível no período
    const cobertura = emps.filter(o =>
      o.id !== emp.id && obraDoEmp.get(o.id) === obraId &&
      normFuncao(o.funcao || o.cargo) === fn && !indisponivel(o.id, g.ini, g.fim)
    );
    if (cobertura.length > 0) continue;
    // candidatos em OUTRAS obras (realocação)
    const candidatos = emps.filter(o =>
      o.id !== emp.id && normFuncao(o.funcao || o.cargo) === fn &&
      obraDoEmp.get(o.id) && obraDoEmp.get(o.id) !== obraId && !indisponivel(o.id, g.ini, g.fim)
    ).slice(0, 5).map(o => ({
      employeeId: o.id, nome: o.nome || `#${o.id}`,
      obraNome: obraById.get(obraDoEmp.get(o.id)!)?.nome || `Obra #${obraDoEmp.get(o.id)}`,
    }));
    // margem para postergar: o gozo precisa TERMINAR até o fim do concessivo,
    // então o último início viável é concessivoFim - (duração - 1). Há margem
    // se der pra empurrar o início em +30 dias e ainda caber.
    const duracaoG = Math.max(1, Math.round((new Date(g.fim + "T12:00:00Z").getTime() - new Date(g.ini + "T12:00:00Z").getTime()) / 86400000) + 1);
    const margemPostergar = !g.concessivoFim || addDias(g.ini, 30) <= addDias(g.concessivoFim, -(duracaoG - 1));
    let sugestao: string;
    if (g.numeroPeriodo <= 1 && margemPostergar) {
      sugestao = `1º período com margem no concessivo (até ${fmtBR(g.concessivoFim)}) — sugerimos POSTERGAR o gozo.`;
    } else if (candidatos.length > 0) {
      sugestao = `Sugerimos TREINAR um substituto ou REALOCAR temporariamente alguém da mesma função de outra obra (${candidatos.length} candidato(s) disponível(is)).`;
    } else {
      sugestao = `Sem margem para postergar e sem candidato interno da mesma função — sugerimos CONTRATAR FOLGUISTA para cobrir o período.`;
    }
    riscos.push({
      chave: `sem_substituto:${g.vpId}:${g.ini}`,
      tipoRisco: "sem_substituto",
      severidade: "critico",
      obraId, obraNome,
      employeeId: emp.id, employeeName: emp.nome || `#${emp.id}`, fotoUrl: emp.fotoUrl,
      funcao, vacationPeriodId: g.vpId, numeroPeriodo: g.numeroPeriodo,
      dataInicio: g.ini, dataFim: g.fim, concessivoFim: g.concessivoFim,
      dataLimiteInicio: g.concessivoFim ? addDias(g.concessivoFim, -(duracaoG - 1)) : null,
      titulo: `${obraNome}: ${emp.nome} (${funcao}) sai de férias ${fmtBR(g.ini)} sem substituto`,
      detalhe: `Único ${funcao} disponível da obra no período ${fmtBR(g.ini)} a ${fmtBR(g.fim)} (${g.numeroPeriodo}º período).`,
      sugestao, candidatos,
    });
  }

  // ── 2. Esvaziamento da obra (≥30% simultâneo) ─────────────
  const empsPorObra = new Map<number, number[]>();
  for (const [empId, obraId] of obraDoEmp) if (empById.has(empId)) {
    if (!empsPorObra.has(obraId)) empsPorObra.set(obraId, []);
    empsPorObra.get(obraId)!.push(empId);
  }
  for (const [obraId, empIds] of empsPorObra) {
    if (empIds.length < MIN_EFETIVO_ESVAZIAMENTO) continue;
    let pior: { ini: string; fim: string; fora: Gozo[] } | null = null;
    for (let s = 0; s < JANELA_DIAS; s += 7) {
      const ini = addDias(hoje, s), fim = addDias(hoje, s + 6);
      const fora = gozos.filter(g => empIds.includes(g.employeeId) && overlap(g.ini, g.fim, ini, fim));
      const unicos = new Set(fora.map(f => f.employeeId));
      if (unicos.size / empIds.length >= LIMITE_SIMULTANEO && (!pior || unicos.size > new Set(pior.fora.map(f => f.employeeId)).size)) {
        pior = { ini, fim, fora };
      }
    }
    if (!pior) continue;
    const unicos = [...new Set(pior.fora.map(f => f.employeeId))];
    const obraNome = obraById.get(obraId)?.nome || `Obra #${obraId}`;
    const pct = Math.round((unicos.length / empIds.length) * 100);
    riscos.push({
      chave: `esvaziamento:${obraId}:${pior.ini}:${unicos.sort((a, b) => a - b).join(",")}`,
      tipoRisco: "esvaziamento",
      severidade: "critico",
      obraId, obraNome,
      dataInicio: pior.ini, dataFim: pior.fim,
      titulo: `${obraNome}: ${unicos.length} de ${empIds.length} funcionários de férias na semana de ${fmtBR(pior.ini)} (${pct}%)`,
      detalhe: `Férias simultâneas acima do limite de ${Math.round(LIMITE_SIMULTANEO * 100)}% do efetivo.`,
      sugestao: `Sugerimos ESCALONAR: antecipar as férias de quem tem prazo concessivo folgado e adiar as demais, mantendo a obra em andamento.`,
      envolvidos: unicos.map(id => {
        const g = pior!.fora.find(f => f.employeeId === id)!;
        return { employeeId: id, nome: empById.get(id)?.nome || `#${id}`, dataInicio: g.ini, dataFim: g.fim };
      }),
    });
  }

  // ── 3. Concessivo apertado (gozo obrigatório em ≤60d, sem agenda) ──
  // O gozo precisa TERMINAR dentro do concessivo, então o prazo real para
  // INICIAR é concessivoFim - (diasGozo - 1) — não o fim do concessivo.
  for (const vp of vps) {
    if (vp.status !== "pendente" && vp.status !== "vencida") continue;
    if (!vp.periodoConcessivoFim) continue;
    const inicioLimite = addDias(vp.periodoConcessivoFim, -(Math.max(1, vp.diasGozo || 30) - 1));
    if (inicioLimite > fimJanela) continue;
    const emp = vp.employeeId ? empById.get(vp.employeeId) : undefined;
    if (!emp) continue;
    const obraId = obraDoEmp.get(emp.id) ?? null;
    const obraNome = obraId ? (obraById.get(obraId)?.nome || `Obra #${obraId}`) : "Sem obra";
    const vencido = inicioLimite < hoje;
    riscos.push({
      chave: `concessivo:${vp.id}`,
      tipoRisco: "concessivo",
      severidade: vencido ? "critico" : "atencao",
      obraId, obraNome,
      employeeId: emp.id, employeeName: emp.nome || `#${emp.id}`, fotoUrl: emp.fotoUrl,
      funcao: emp.funcao || emp.cargo,
      vacationPeriodId: vp.id, numeroPeriodo: ordemVp.get(vp.id) || 1,
      concessivoFim: vp.periodoConcessivoFim,
      dataLimiteInicio: inicioLimite,
      titulo: vencido
        ? `${obraNome}: férias de ${emp.nome} ESTOURADAS (início limite era ${fmtBR(inicioLimite)}) — risco de multa em dobro`
        : `${obraNome}: ${emp.nome} precisa INICIAR férias até ${fmtBR(inicioLimite)} (concessivo ${fmtBR(vp.periodoConcessivoFim)})`,
      detalhe: `Período ${ordemVp.get(vp.id) || 1}º sem gozo agendado; o gozo (${Math.max(1, vp.diasGozo || 30)} dias) precisa terminar até ${fmtBR(vp.periodoConcessivoFim)}, então o último dia para iniciar é ${fmtBR(inicioLimite)}. Postergar NÃO é opção.`,
      sugestao: `Agende o gozo imediatamente e já planeje a cobertura (substituto, realocação ou folguista).`,
    });
  }

  return riscos;
}

// ── Rev. 5115: efetivo × férias programadas por obra (próximos 60 dias) ──
export type EfetivoObraRow = {
  obraId: number;
  obraNome: string;
  efetivo: number;
  saindoFerias: number;
  saldo: number;
  saindo: { employeeId: number; nome: string; fotoUrl?: string | null; funcao?: string | null; numeroPeriodo: number; dataInicio: string; dataFim: string; dataLimiteInicio?: string | null; emGozo?: boolean }[];
};

export async function computeEfetivoObras(companyId: number): Promise<EfetivoObraRow[]> {
  const db = (await getDb())!;
  const hoje = new Date().toISOString().split("T")[0];
  const fimJanela = addDias(hoje, JANELA_DIAS);

  const emps = await db.select({
    id: employees.id, nome: employees.nomeCompleto, fotoUrl: employees.fotoUrl,
    funcao: employees.funcao, cargo: employees.cargo, status: employees.status,
  }).from(employees).where(and(
    eq(employees.companyId, companyId),
    isNull(employees.deletedAt),
    sql`${employees.status} NOT IN ('Desligado','Lista_Negra','Dispensado')`,
    sql`(${employees.tipoContrato} IS NULL OR ${employees.tipoContrato} NOT IN ('PJ','Socio'))`,
  ));
  const empById = new Map(emps.map(e => [e.id, e]));
  if (emps.length === 0) return [];

  const alocs = await db.select({ employeeId: obraFuncionarios.employeeId, obraId: obraFuncionarios.obraId, id: obraFuncionarios.id })
    .from(obraFuncionarios).where(and(eq(obraFuncionarios.companyId, companyId), eq(obraFuncionarios.isActive, 1)))
    .orderBy(obraFuncionarios.id);
  const obraDoEmp = new Map<number, number>();
  for (const a of alocs) if (a.employeeId != null && a.obraId != null && empById.has(a.employeeId)) obraDoEmp.set(a.employeeId, a.obraId);

  const obraIds = [...new Set([...obraDoEmp.values()])];
  const obrasRows = obraIds.length ? await db.select({ id: obras.id, nome: obras.nome }).from(obras).where(inArray(obras.id, obraIds)) : [];
  const obraById = new Map(obrasRows.map(o => [o.id, o.nome]));

  const vps = await db.select({
    id: vacationPeriods.id, employeeId: vacationPeriods.employeeId,
    dataInicio: vacationPeriods.dataInicio, dataFim: vacationPeriods.dataFim,
    periodo2Inicio: vacationPeriods.periodo2Inicio, periodo2Fim: vacationPeriods.periodo2Fim,
    periodo3Inicio: vacationPeriods.periodo3Inicio, periodo3Fim: vacationPeriods.periodo3Fim,
    status: vacationPeriods.status, numeroPeriodo: vacationPeriods.numeroPeriodo,
    periodoAquisitivoInicio: vacationPeriods.periodoAquisitivoInicio,
    periodoConcessivoFim: vacationPeriods.periodoConcessivoFim, diasGozo: vacationPeriods.diasGozo,
  }).from(vacationPeriods).where(and(
    eq(vacationPeriods.companyId, companyId),
    isNull(vacationPeriods.deletedAt),
    sql`${vacationPeriods.status} IN ('agendada','em_gozo')`,
  ));
  // Ordem entre os períodos EM ABERTO (1º/2º), nunca o contador histórico
  const ordemVp = computeOrdemAberta(vps);

  const rows = new Map<number, EfetivoObraRow>();
  for (const [empId, obraId] of obraDoEmp) {
    if (!rows.has(obraId)) rows.set(obraId, { obraId, obraNome: obraById.get(obraId) || `Obra #${obraId}`, efetivo: 0, saindoFerias: 0, saldo: 0, saindo: [] });
    rows.get(obraId)!.efetivo++;
  }

  const jaContado = new Set<string>();
  for (const vp of vps) {
    if (!vp.employeeId || !empById.has(vp.employeeId)) continue;
    const obraId = obraDoEmp.get(vp.employeeId);
    if (!obraId || !rows.has(obraId)) continue;
    const emp = empById.get(vp.employeeId)!;
    const durDefault = Math.max(1, vp.diasGozo || 30);
    const pushJanela = (ini?: string | null, fim?: string | null) => {
      if (!ini || !fim || ini > fimJanela || fim < hoje) return;
      const key = `${obraId}:${vp.employeeId}`;
      const row = rows.get(obraId)!;
      if (!jaContado.has(key)) { jaContado.add(key); row.saindoFerias++; }
      const dur = Math.max(1, Math.round((new Date(fim + "T12:00:00Z").getTime() - new Date(ini + "T12:00:00Z").getTime()) / 86400000) + 1) || durDefault;
      row.saindo.push({
        employeeId: emp.id, nome: emp.nome || `#${emp.id}`, fotoUrl: emp.fotoUrl,
        funcao: emp.funcao || emp.cargo, numeroPeriodo: ordemVp.get(vp.id) || 1,
        dataInicio: ini, dataFim: fim,
        dataLimiteInicio: vp.periodoConcessivoFim ? addDias(vp.periodoConcessivoFim, -(dur - 1)) : null,
        emGozo: ini <= hoje, // já saiu — não há mais o que ajustar
      });
    };
    pushJanela(vp.dataInicio, vp.dataFim);
    pushJanela(vp.periodo2Inicio, vp.periodo2Fim);
    pushJanela(vp.periodo3Inicio, vp.periodo3Fim);
  }

  const out = [...rows.values()];
  for (const r of out) {
    r.saldo = r.efetivo - r.saindoFerias;
    r.saindo.sort((a, b) => a.dataInicio.localeCompare(b.dataInicio));
  }
  out.sort((a, b) => a.saldo / Math.max(1, a.efetivo) - b.saldo / Math.max(1, b.efetivo) || b.saindoFerias - a.saindoFerias);
  return out;
}

// ── Rev. 5118: notificação de decisão registrada no Radar ─────
// Alerta in-app + e-mail p/ admins master e responsável da obra (formalização).
const DECISAO_LABEL: Record<string, string> = {
  postergar: "POSTERGAR as férias",
  antecipar: "ANTECIPAR as férias",
  treinar_substituto: "TREINAR SUBSTITUTO",
  realocar: "REALOCAR pessoal",
  folguista: "USAR FOLGUISTA",
  ciente: "CIENTE (sem ação)",
};

/** Usuários "de RH": membros de grupos ativos cujo module_access dá acesso a Férias (rh-dp), vinculados à empresa */
async function getDestinatariosRH(companyId: number): Promise<{ id: number; email: string | null; nome: string | null }[]> {
  const db = (await getDb())!;
  try {
    const grpRows: any = await db.execute(sql`SELECT id, module_access FROM user_groups WHERE ativo = 1 AND module_access IS NOT NULL`);
    const rhGroupIds: number[] = [];
    for (const g of ((grpRows.rows || grpRows) as any[])) {
      try {
        const ma = JSON.parse(g.module_access || "{}");
        const rh = ma["rh-dp"];
        if (!rh) continue;
        if (rh.level === "admin" || rh?.pages?.ferias?.view === true) rhGroupIds.push(Number(g.id));
      } catch { /* module_access inválido — ignora o grupo */ }
    }
    if (!rhGroupIds.length) return [];
    const rhRows: any = await db.execute(sql`
      SELECT DISTINCT u.id, u.email, u.name AS nome
      FROM user_group_members gm
      JOIN users u ON u.id = gm."userId"
      JOIN user_companies uc ON uc."userId" = u.id AND uc."companyId" = ${companyId}
      WHERE gm."groupId" IN (${rhGroupIds})`);
    return ((rhRows.rows || rhRows) as any[]).map(r => ({ id: Number(r.id), email: r.email, nome: r.nome }));
  } catch (e: any) {
    console.error("[FeriasRadar] destinatários RH:", e?.message || e);
    return [];
  }
}

export async function notificarDecisaoRadar(params: {
  companyId: number;
  risco: RadarRisco;
  decisao: string;
  observacao?: string | null;
  decididoPorUserId: number;
  decididoPorNome?: string | null;
}) {
  const db = (await getDb())!;
  const { companyId, risco, decisao, observacao, decididoPorUserId, decididoPorNome } = params;
  const label = DECISAO_LABEL[decisao] || decisao.toUpperCase();
  const quem = decididoPorNome || `usuário #${decididoPorUserId}`;

  // destinatários: admins master + responsável da obra (mesma regra do job diário)
  const masters = await db.select({ id: users.id, email: users.email, nome: users.name }).from(users)
    .innerJoin(userCompanies, eq(userCompanies.userId, users.id))
    .where(and(eq(userCompanies.companyId, companyId), eq(users.role, "admin_master")));
  const dest = new Map<number, { email: string | null; nome: string | null }>();
  for (const m of masters) dest.set(m.id, { email: m.email, nome: m.nome });

  // RH: membros de grupos ativos cujo module_access dá acesso a Férias (módulo rh-dp)
  for (const r of await getDestinatariosRH(companyId)) {
    if (!dest.has(r.id)) dest.set(r.id, { email: r.email, nome: r.nome });
  }
  if (risco.obraId) {
    const respRows: any = await db.execute(sql`
      SELECT u.id AS user_id, u.email, u.name AS nome
      FROM obras o
      JOIN employees e ON e.id = o."responsavelId" AND e."deletedAt" IS NULL
      JOIN users u ON LOWER(u.email) = LOWER(e.email)
      JOIN user_companies uc ON uc."userId" = u.id AND uc."companyId" = ${companyId}
      WHERE o.id = ${risco.obraId} AND o."responsavelId" IS NOT NULL AND e.email IS NOT NULL`);
    for (const r of ((respRows.rows || respRows) as any[])) dest.set(Number(r.user_id), { email: r.email, nome: r.nome });
  }
  dest.delete(decididoPorUserId); // quem decidiu não precisa ser avisado

  const titulo = `Decisão no Radar de Férias: ${label}`;
  const resumo = [
    risco.obraNome ? `Obra: ${risco.obraNome}` : null,
    risco.employeeName ? `Colaborador: ${risco.employeeName}${risco.funcao ? ` (${risco.funcao})` : ""}` : null,
    `Risco: ${risco.titulo}`,
    `Decisão: ${label} — por ${quem}`,
    observacao ? `Observação: ${observacao}` : null,
  ].filter(Boolean).join("\n");

  for (const [userId] of dest) {
    try {
      await criarUserAlert({
        userId, companyId,
        tipo: "ferias_radar_decisao",
        titulo,
        mensagem: resumo,
        linkUrl: "/ferias?tab=radar",
      });
    } catch (e: any) {
      console.error("[FeriasRadar] alerta decisão:", e?.message || e);
    }
  }

  // E-mail de formalização (best-effort; não bloqueia a mutation)
  const emails = [...dest.values()].filter(d => d.email);
  if (emails.length) {
    const esc = (s: any) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1f2937">
        <h2 style="color:#1d4ed8;margin-bottom:4px">Radar de Férias — decisão registrada</h2>
        <p style="margin-top:0;color:#6b7280;font-size:13px">Registro formal de decisão sobre risco operacional de férias.</p>
        <table style="border-collapse:collapse;width:100%;font-size:14px">
          ${risco.obraNome ? `<tr><td style="padding:6px 8px;color:#6b7280;white-space:nowrap">Obra</td><td style="padding:6px 8px;font-weight:bold">${esc(risco.obraNome)}</td></tr>` : ""}
          ${risco.employeeName ? `<tr><td style="padding:6px 8px;color:#6b7280">Colaborador</td><td style="padding:6px 8px;font-weight:bold">${esc(risco.employeeName)}${risco.funcao ? ` · ${esc(risco.funcao)}` : ""}</td></tr>` : ""}
          <tr><td style="padding:6px 8px;color:#6b7280">Risco</td><td style="padding:6px 8px">${esc(risco.titulo)}</td></tr>
          <tr><td style="padding:6px 8px;color:#6b7280">Decisão</td><td style="padding:6px 8px"><span style="background:#dbeafe;color:#1d4ed8;padding:2px 8px;border-radius:9999px;font-weight:bold">${esc(label)}</span></td></tr>
          <tr><td style="padding:6px 8px;color:#6b7280">Decidido por</td><td style="padding:6px 8px">${esc(quem)}</td></tr>
          ${observacao ? `<tr><td style="padding:6px 8px;color:#6b7280">Observação</td><td style="padding:6px 8px">${esc(observacao)}</td></tr>` : ""}
        </table>
        <p style="font-size:12px;color:#9ca3af;margin-top:16px">E-mail automático do sistema Gestão Integrada — módulo Férias (Radar). Acesse Férias → Radar para detalhes.</p>
      </div>`;
    try {
      const { sendEmailToMultiple } = await import("./smtpService");
      await sendEmailToMultiple(
        emails.map(d => ({ nome: d.nome || "", email: d.email! })),
        titulo,
        html,
        resumo,
      );
    } catch (e: any) {
      console.error("[FeriasRadar] e-mail decisão:", e?.message || e);
    }
  }
}

// ── Job diário: gera user_alerts com escopo por obra ─────────
async function runRadarAlertas() {
  const db = (await getDb())!;
  await ensureRadarTable();
  const companiesRows: any = await db.execute(sql`
    SELECT DISTINCT "companyId" AS cid FROM vacation_periods
    WHERE "deletedAt" IS NULL AND status NOT IN ('concluida','cancelada')`);
  const cids: number[] = (companiesRows.rows || companiesRows).map((r: any) => Number(r.cid)).filter((n: number) => n > 0 && n !== 999);

  for (const companyId of cids) {
    try {
      const riscos = await computeRadarFerias(companyId);
      if (riscos.length === 0) continue;
      // riscos já resolvidos não alertam
      const resRows: any = await db.execute(sql`SELECT DISTINCT chave FROM ferias_radar_resolucoes WHERE company_id = ${companyId}`);
      const resolvidas = new Set(((resRows.rows || resRows) as any[]).map(r => String(r.chave)));
      const ativos = riscos.filter(r => !resolvidas.has(r.chave));
      if (ativos.length === 0) continue;

      // destinatários: admin_masters da empresa + responsáveis das obras
      const masters = await db.select({ id: users.id }).from(users)
        .innerJoin(userCompanies, eq(userCompanies.userId, users.id))
        .where(and(eq(userCompanies.companyId, companyId), eq(users.role, "admin_master")));
      const masterIds = [...new Set(masters.map(m => m.id))];
      // Rev. 5118 — RH também recebe o alerta diário (grupos com acesso a Férias)
      for (const r of await getDestinatariosRH(companyId)) if (!masterIds.includes(r.id)) masterIds.push(r.id);

      // Responsável da obra: obras.responsavelId é EMPLOYEE id — resolver o USER
      // via e-mail (mesma regra de getEffectiveAllowedObraIds) e exigir vínculo
      // com a empresa (user_companies) para não vazar entre tenants.
      const obraIdsRisco = [...new Set(ativos.map(r => r.obraId).filter((x): x is number => !!x))];
      const respPorObra = new Map<number, number>();
      if (obraIdsRisco.length) {
        const respRows: any = await db.execute(sql`
          SELECT o.id AS obra_id, u.id AS user_id
          FROM obras o
          JOIN employees e ON e.id = o."responsavelId" AND e."deletedAt" IS NULL
          JOIN users u ON LOWER(u.email) = LOWER(e.email)
          JOIN user_companies uc ON uc."userId" = u.id AND uc."companyId" = ${companyId}
          WHERE o.id IN (${obraIdsRisco}) AND o."responsavelId" IS NOT NULL AND e.email IS NOT NULL`);
        for (const r of ((respRows.rows || respRows) as any[])) respPorObra.set(Number(r.obra_id), Number(r.user_id));
      }

      // dedup em 1 query: alertas 'ferias_radar' dos últimos 15 dias
      const todosUsers = [...new Set([...masterIds, ...respPorObra.values()])];
      const jaEnviados = new Set<string>();
      if (todosUsers.length) {
        const dupRows: any = await db.execute(sql`
          SELECT user_id, titulo FROM user_alerts
          WHERE tipo = 'ferias_radar' AND user_id IN (${todosUsers})
            AND created_at > now() - make_interval(days => ${DEDUP_DIAS})`);
        for (const r of ((dupRows.rows || dupRows) as any[])) jaEnviados.add(`${r.user_id}|${r.titulo}`);
      }

      for (const risco of ativos) {
        const destinatarios = new Set<number>(masterIds);
        if (risco.obraId && respPorObra.has(risco.obraId)) destinatarios.add(respPorObra.get(risco.obraId)!);
        for (const userId of destinatarios) {
          if (jaEnviados.has(`${userId}|${risco.titulo}`)) continue;
          jaEnviados.add(`${userId}|${risco.titulo}`);
          await criarUserAlert({
            userId, companyId,
            tipo: "ferias_radar",
            titulo: risco.titulo,
            mensagem: `${risco.detalhe}\n\n${risco.sugestao}`,
            linkUrl: "/ferias?tab=radar",
          });
        }
      }
      console.log(`[FeriasRadar] Empresa ${companyId}: ${ativos.length} risco(s) ativo(s).`);
    } catch (e: any) {
      console.error(`[FeriasRadar] Erro empresa ${companyId}:`, e?.message || e);
    }
  }
}

export function startFeriasRadarJob() {
  // primeira rodada 5 min após o boot; depois a cada 24h
  setTimeout(() => { runRadarAlertas().catch(e => console.error("[FeriasRadar] run:", e?.message || e)); }, 5 * 60 * 1000);
  setInterval(() => { runRadarAlertas().catch(e => console.error("[FeriasRadar] run:", e?.message || e)); }, 24 * 60 * 60 * 1000);
  console.log("[FeriasRadar] Job agendado (diário).");
}
