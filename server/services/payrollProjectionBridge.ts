// ============================================================
// Rev. 1630 — Projeção de Folha, Benefícios, Encargos, 13º e PJ
// ----------------------------------------------------------------
// Gera lançamentos virtuais (origem *_projetado) em financial_entries
// para os próximos N meses com base no quadro ATIVO de funcionários
// e contratos PJ vigentes. Permite que os cards 7d/15d/30d/60d/90d
// e o fluxo de caixa reflitam folha + benefícios + 13º antes de
// existir fato gerador.
//
// Fundamentação:
//  - CLT Arts. 457-462 (folha), Lei 4.090/62 (13º), CF Art.7º XVII (férias 1/3)
//  - NBC TG 33 — benefícios a empregados (provisão / passivo)
//  - Brealey-Myers cap. 30 — Cash Budgeting (forecast curto prazo)
//  - APQC PCF 8.7.1 — Process Accounts Payable / Cash Forecast
//
// Salvaguardas:
//  - Idempotente por (companyId, origem_modulo, origem_id) via DELETE+INSERT
//  - Origens classificadas como Projeção no front (não pagáveis)
//  - Mês corrente é projetado SE não houver folha real consolidada
//  - Tenant isolation: tudo filtra companyId; companies.deletedAt IS NULL
//    é responsabilidade do chamador (job já filtra empresas ativas).
// ============================================================
import { getDb } from "../db";
import { sql } from "drizzle-orm";

// ─────────── Configuração de encargos / parametrização ────────
// Pacote CLT padrão (FGTS 8% + INSS patronal 20% + RAT/Terceiros ~5,8%).
// Quando houver `financial_config.encargosFolhaPercent` no futuro, ler dela.
const ENCARGOS_FOLHA_PERCENT = 33.8 / 100;
const HORAS_MES_HORISTA = 220;
const DIAS_UTEIS_PADRAO = 22;
const HORIZONTE_MESES = 12;

const PROJ_ORIGENS = [
  "folha_projetada",
  "encargos_projetado",
  "beneficio_va_projetado",
  "beneficio_vr_projetado",
  "decimo_terceiro_projetado",
  "pj_projetado",
  // Rev. 1636 — Férias e Rescisão de Aviso projetadas
  "ferias_projetada",
  "rescisao_projetada",
] as const;

// ─────────── Helpers ─────────────────────────────────────────
async function dbExecute(db: any, query: string, params: unknown[]): Promise<{ rows: any[] }> {
  // Rev. 1632 — BUGFIX CRÍTICO: o split por /\$\d+/g substituía os placeholders pela
  // ORDEM TEXTUAL, ignorando o número. Ex.: query com "$2 ... $1" recebia params[0]
  // no $2 e params[1] no $1, invertendo os valores. Isso fez getQuadroCLT/getBeneficios
  // retornarem 0 silenciosamente (companyId virava o valor de HORAS_MES_HORISTA),
  // bloqueando TODA a projeção de Folha/Encargos/VR/VA/13º. Agora respeitamos o N.
  const re = /\$(\d+)/g;
  const segments: Array<{ text: string; idx: number | null }> = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(query)) !== null) {
    segments.push({ text: query.slice(last, m.index), idx: parseInt(m[1]!, 10) - 1 });
    last = m.index + m[0].length;
  }
  segments.push({ text: query.slice(last), idx: null });

  let built: any = sql.raw(segments[0]!.text);
  for (let i = 0; i < segments.length - 1; i++) {
    const paramIdx = segments[i]!.idx!;
    const paramVal = params[paramIdx];
    const next = segments[i + 1]!.text;
    built = next ? sql`${built}${paramVal}${sql.raw(next)}` : sql`${built}${paramVal}`;
  }
  if (process.env.PAYROLL_DEBUG === "1") {
    console.log("[dbExecute] query=", query.replace(/\s+/g, " ").slice(0, 400), "params=", params);
  }
  const res = await db.execute(built);
  const rows: any[] = (res as any)?.rows ?? (Array.isArray(res) ? res : []);
  if (process.env.PAYROLL_DEBUG === "1") {
    console.log("[dbExecute] rows=", JSON.stringify(rows).slice(0, 300));
  }
  return { rows };
}

function fmtMes(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Rev. 1632 — Padrão BR para descrições (regra de ouro: nada de YYYY-MM cru no UI).
// "2026-04" → "Abr/2026"
const MESES_BR_ABREV = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
function fmtMesBR(mes: string): string {
  const [y, m] = mes.split("-");
  const idx = parseInt(m ?? "0", 10) - 1;
  if (idx < 0 || idx > 11) return mes;
  return `${MESES_BR_ABREV[idx]}/${y}`;
}

// Rev. 1632 — Parser BR robusto em SQL.
// Banco guarda valores como "9.999,99" (ponto = milhar, vírgula = decimal).
// REPLACE só da vírgula gera "9.999.99" → falha no cast ::numeric.
// Solução portátil (sem lookahead): remover TODOS os pontos primeiro, depois trocar vírgula.
function brMoneySql(col: string): string {
  return `NULLIF(REPLACE(REGEXP_REPLACE(${col}, '\\.', '', 'g'), ',', '.'), '')::numeric`;
}

function lastBusinessDayOrEarlier(year: number, month: number, day: number): string {
  // month: 1-12. Se cair sábado/domingo, recua para sexta.
  const d = new Date(Date.UTC(year, month - 1, day));
  const dow = d.getUTCDay();
  if (dow === 0) d.setUTCDate(d.getUTCDate() - 2);      // dom → sex
  else if (dow === 6) d.setUTCDate(d.getUTCDate() - 1); // sáb → sex
  return d.toISOString().slice(0, 10);
}

function competenciaPrimeiroDia(mes: string): string {
  return `${mes}-01`;
}

function num(v: any): number {
  if (v == null) return 0;
  const n = parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

// origem_id determinístico por (mes, slot). Usamos YYYYMM * 100 + slot
// para nunca colidir entre meses e nunca duplicar o mesmo slot.
function syntheticId(mes: string, slot: number): number {
  const ym = parseInt(mes.replace("-", ""), 10); // 202611
  return ym * 100 + slot;
}

// ─────────── Insert helper ───────────────────────────────────
async function insertProjEntry(db: any, e: {
  companyId: number;
  obraId?: number | null;
  contaNome: string;
  valor: number;
  competencia: string;
  vencimento: string;
  origemModulo: string;
  origemId: number;
  origemDescricao: string;
  descricao: string;
}): Promise<void> {
  await dbExecute(db,
    `INSERT INTO financial_entries
      (company_id, obra_id, conta_nome, tipo, natureza,
       valor_previsto, data_competencia, data_vencimento,
       status, origem_modulo, origem_id, origem_descricao, descricao,
       created_at, updated_at)
     VALUES ($1,$2,$3,'despesa','fixo',$4,$5,$6,'previsto',$7,$8,$9,$10,NOW(),NOW())
     ON CONFLICT DO NOTHING`,
    [
      e.companyId,
      e.obraId ?? null,
      e.contaNome,
      e.valor.toFixed(2),
      e.competencia,
      e.vencimento,
      e.origemModulo,
      e.origemId,
      e.origemDescricao,
      e.descricao,
    ]
  );
}

// ─────────── 1) Quadro CLT ativo + folha base ────────────────
async function getQuadroCLT(db: any, companyId: number): Promise<{
  count: number;
  totalSalarioBruto: number;
}> {
  // Rev. 1636 — Folha mensal regular (regime de caixa): inclui APENAS quem está
  // Ativo no mês inteiro. Funcionários em Férias têm o salário pago em rubrica
  // separada "Férias a Pagar" (CLT 145, até 2 dias antes do gozo) gerada por
  // `getFeriasProjetadas`. Funcionários em Aviso têm a Rescisão paga em rubrica
  // própria (CLT 477 §6º, até 10 dias após término) gerada por
  // `getRescisoesProjetadas`. Afastado/Licenca/Recluso = INSS paga (Lei 8.213/91).
  const { rows } = await dbExecute(db,
    `SELECT
       COUNT(*) AS qtd,
       COALESCE(SUM(
         CASE
           WHEN LOWER(COALESCE("tipoRemuneracao",'horista')) = 'mensalista'
             THEN COALESCE(${brMoneySql('"salarioBase"')}, 0)
           ELSE COALESCE(${brMoneySql('"valorHora"')}, 0) * $2
         END
         + CASE WHEN "recebeComplemento" = 1
             THEN COALESCE(${brMoneySql('"valorComplemento"')}, 0)
             ELSE 0 END
       ), 0) AS bruto
     FROM employees
     WHERE "companyId" = $1
       AND "deletedAt" IS NULL
       AND "status" = 'Ativo'
       AND ("tipoContrato" IS NULL OR "tipoContrato" <> 'PJ')
       AND COALESCE(NULLIF(TRIM("matricula"), ''), NULLIF(TRIM("codigoInterno"), '')) IS NOT NULL
       AND UPPER("nomeCompleto") NOT LIKE '%TESTE%'`,
    [companyId, HORAS_MES_HORISTA]
  );
  const r = rows[0] ?? {};
  return {
    count: parseInt(r.qtd ?? "0", 10),
    totalSalarioBruto: num(r.bruto),
  };
}

// ─────────── 2) Benefícios médios por funcionário ────────────
async function getBeneficiosMedios(db: any, companyId: number): Promise<{
  vrPorFuncMes: number; // café+lanche+janta * dias úteis
  vaPorFuncMes: number; // valor mensal do cartão
}> {
  // Rev. 1632 — usa brMoneySql para evitar falha com formato "9.999,99"
  // Rev. 3985 — considera só configs VIGENTES hoje (não mais toda config ativa histórica,
  // que agora pode coexistir com versões antigas encerradas por vigenciaFim).
  const { rows } = await dbExecute(db,
    `SELECT
       COALESCE(AVG(${brMoneySql('"cafeManhaDia"')}), 0) AS cafe,
       COALESCE(AVG(${brMoneySql('"lancheTardeDia"')}), 0) AS lanche,
       COALESCE(AVG(${brMoneySql('"jantaDia"')}), 0) AS janta,
       COALESCE(AVG(${brMoneySql('"valeAlimentacaoMes"')}), 0) AS va,
       COALESCE(AVG("diasUteisRef"), $2) AS dias
     FROM meal_benefit_configs
     WHERE "companyId" = $1 AND COALESCE("ativo", 1) = 1
       AND (vigencia_inicio IS NULL OR vigencia_inicio <= CURRENT_DATE)
       AND (vigencia_fim IS NULL OR vigencia_fim >= CURRENT_DATE)`,
    [companyId, DIAS_UTEIS_PADRAO]
  );
  const r = rows[0] ?? {};
  const dias = num(r.dias) || DIAS_UTEIS_PADRAO;
  const vrDia = num(r.cafe) + num(r.lanche) + num(r.janta);
  return {
    vrPorFuncMes: vrDia * dias,
    vaPorFuncMes: num(r.va),
  };
}

// ─────────── 3) PJs ativos no mês ────────────────────────────
async function getPJsAtivosNoMes(db: any, companyId: number, primeiroDia: string): Promise<Array<{
  id: number;
  razao: string;
  valorMensal: number;
  diaFechamento: number;
}>> {
  const { rows } = await dbExecute(db,
    // Rev. 1634 — descrição agora prioriza o nome do FUNCIONÁRIO vinculado
    // (employees.nomeCompleto), depois razão social, CNPJ e por fim "PJ #id"
    `SELECT pc.id,
            COALESCE(NULLIF(TRIM(e."nomeCompleto"), ''),
                     NULLIF(TRIM(pc."razaoSocialPrestador"), ''),
                     NULLIF(TRIM(pc."cnpjPrestador"), ''),
                     'Prestador PJ #' || pc.id) AS razao,
            COALESCE(${brMoneySql('pc."valorMensal"')}, 0) AS valor,
            COALESCE(pc."diaFechamento", 5) AS dia
     FROM pj_contracts pc
     LEFT JOIN employees e ON e.id = pc."employeeId"
     WHERE pc."companyId" = $1
       AND pc."status" IN ('ativo','vigente','assinado')
       AND pc."dataInicio" <= $2
       AND pc."dataFim"    >= $3
       AND COALESCE(${brMoneySql('pc."valorMensal"')}, 0) > 0`,
    [companyId, primeiroDia, primeiroDia]
  );
  return rows.map(r => ({
    id: parseInt(r.id, 10),
    razao: r.razao,
    valorMensal: num(r.valor),
    diaFechamento: parseInt(r.dia ?? "5", 10),
  }));
}

// ─────────── 3.b) Férias projetadas (CLT 145) ────────────────
// Lê vacation_periods agendadas/em_gozo nos próximos meses.
// Para cada uma: lança em "Férias a Pagar" com vencimento até 2 dias antes
// do início do gozo (CLT 145). Valor = valorTotal se gravado; senão calcula
// pelo salário bruto + 1/3 constitucional, pró-rata por diasGozo/30.
async function getFeriasProjetadas(db: any, companyId: number, dataIni: string, dataFim: string): Promise<Array<{
  id: number;
  employeeId: number;
  funcionarioNome: string;
  funcionarioCodigo: string;
  cargo: string;
  dataInicio: string;
  dataFim: string;
  diasGozo: number;
  valorTotal: number;
  dataPagamento: string;
  status: string;
}>> {
  const { rows } = await dbExecute(db,
    `SELECT vp.id, vp."employeeId" AS emp_id,
            COALESCE(NULLIF(TRIM(e."nomeCompleto"),''), 'Funcionário #' || vp."employeeId") AS func_nome,
            COALESCE(NULLIF(TRIM(e."codigoInterno"),''), NULLIF(TRIM(e.matricula),''), '—') AS func_codigo,
            COALESCE(NULLIF(TRIM(e.cargo),''), '—') AS cargo,
            vp."dataInicio" AS d_ini, vp."dataFim" AS d_fim,
            COALESCE(vp."diasGozo", 30) AS dias_gozo,
            COALESCE(NULLIF(TRIM(vp."valorTotal"), ''), '0')::numeric AS val_total,
            vp."dataPagamento" AS d_pgto,
            vp.status
       FROM vacation_periods vp
       LEFT JOIN employees e ON e.id = vp."employeeId"
      WHERE vp."companyId" = $1
        AND vp.status IN ('agendada','em_gozo','pendente')
        AND vp."dataInicio" IS NOT NULL
        AND vp."dataInicio" >= $2
        AND vp."dataInicio" <= $3
        AND e."deletedAt" IS NULL
      ORDER BY vp."dataInicio" ASC`,
    [companyId, dataIni, dataFim]
  );

  // Para férias sem valorTotal, calcula salário bruto + 1/3 pró-rata
  const empIdsSemValor = rows.filter(r => num(r.val_total) <= 0).map(r => parseInt(r.emp_id, 10));
  let salarioMap: Map<number, number> = new Map();
  if (empIdsSemValor.length > 0) {
    const idsStr = empIdsSemValor.join(",");
    const { rows: salRows } = await dbExecute(db,
      `SELECT id,
              CASE
                WHEN LOWER(COALESCE("tipoRemuneracao",'horista')) = 'mensalista'
                  THEN COALESCE(${brMoneySql('"salarioBase"')}, 0)
                ELSE COALESCE(${brMoneySql('"valorHora"')}, 0) * $2
              END
              + CASE WHEN "recebeComplemento" = 1
                  THEN COALESCE(${brMoneySql('"valorComplemento"')}, 0)
                  ELSE 0 END AS bruto
         FROM employees
        WHERE id IN (${idsStr || "0"}) AND "companyId" = $1`,
      [companyId, HORAS_MES_HORISTA]
    );
    salRows.forEach(r => salarioMap.set(parseInt(r.id, 10), num(r.bruto)));
  }

  return rows.map(r => {
    const empId = parseInt(r.emp_id, 10);
    const dias = parseInt(r.dias_gozo ?? "30", 10) || 30;
    let valorTotal = num(r.val_total);
    if (valorTotal <= 0) {
      const bruto = salarioMap.get(empId) ?? 0;
      // (Salário pró-rata aos dias de férias) + 1/3 constitucional
      valorTotal = (bruto * dias / 30) * (1 + 1 / 3);
    }
    // dataPagamento: se gravada, usa; senão CLT 145 → 2 dias corridos antes do início
    let dPgto = r.d_pgto ? String(r.d_pgto).slice(0, 10) : null;
    if (!dPgto) {
      const di = new Date(String(r.d_ini).slice(0, 10) + "T00:00:00Z");
      di.setUTCDate(di.getUTCDate() - 2);
      dPgto = di.toISOString().slice(0, 10);
    }
    return {
      id: parseInt(r.id, 10),
      employeeId: empId,
      funcionarioNome: r.func_nome,
      funcionarioCodigo: r.func_codigo,
      cargo: r.cargo,
      dataInicio: String(r.d_ini).slice(0, 10),
      dataFim: String(r.d_fim).slice(0, 10),
      diasGozo: dias,
      valorTotal,
      dataPagamento: dPgto,
      status: r.status,
    };
  });
}

// ─────────── 3.c) Rescisões de Aviso projetadas (CLT 477 §6º) ─
// Para cada funcionário em status='Aviso', estima a rescisão (verbas
// rescisórias = saldo + férias prop + 13º prop + multa FGTS 40%) e
// lança em "Rescisões a Pagar" com vencimento até 10 dias após o
// término do contrato (data desligamento efetiva, ou +30d se não há).
async function getRescisoesProjetadas(db: any, companyId: number): Promise<Array<{
  id: number;
  employeeId: number;
  funcionarioNome: string;
  funcionarioCodigo: string;
  cargo: string;
  dataDesligamento: string;
  dataPagamento: string;
  saldoSalario: number;
  feriasProporcionais: number;
  decimoTerceiroProp: number;
  multaFgts: number;
  valorTotal: number;
  hasDataReal: boolean;
}>> {
  const { rows } = await dbExecute(db,
    `SELECT id, "nomeCompleto" AS func_nome,
            COALESCE(NULLIF(TRIM("codigoInterno"),''), NULLIF(TRIM(matricula),''), '—') AS func_codigo,
            COALESCE(NULLIF(TRIM(cargo),''), '—') AS cargo,
            "dataDesligamentoEfetiva" AS d_desl,
            "dataAdmissao" AS d_adm,
            CASE
              WHEN LOWER(COALESCE("tipoRemuneracao",'horista')) = 'mensalista'
                THEN COALESCE(${brMoneySql('"salarioBase"')}, 0)
              ELSE COALESCE(${brMoneySql('"valorHora"')}, 0) * $2
            END
            + CASE WHEN "recebeComplemento" = 1
                THEN COALESCE(${brMoneySql('"valorComplemento"')}, 0)
                ELSE 0 END AS bruto
       FROM employees
      WHERE "companyId" = $1
        AND "deletedAt" IS NULL
        AND "status" = 'Aviso'
        AND ("tipoContrato" IS NULL OR "tipoContrato" <> 'PJ')
        AND COALESCE(NULLIF(TRIM("matricula"),''), NULLIF(TRIM("codigoInterno"),'')) IS NOT NULL
        AND UPPER("nomeCompleto") NOT LIKE '%TESTE%'
      ORDER BY "nomeCompleto" ASC`,
    [companyId, HORAS_MES_HORISTA]
  );

  const hoje = new Date();
  return rows.map(r => {
    const bruto = num(r.bruto);
    // Data de desligamento: se não cadastrada, presume fim do mês corrente + 30 dias (aviso 30d).
    let dDesl: Date;
    let hasReal = false;
    if (r.d_desl) {
      dDesl = new Date(String(r.d_desl).slice(0, 10) + "T00:00:00Z");
      hasReal = true;
    } else {
      dDesl = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() + 1, 0));
      dDesl.setUTCDate(dDesl.getUTCDate() + 30);
    }
    // Pagamento: até 10 dias corridos após término (CLT 477 §6º Lei 13.467/17)
    const dPgto = new Date(dDesl.getTime());
    dPgto.setUTCDate(dPgto.getUTCDate() + 10);

    // Cálculo simplificado das verbas rescisórias:
    //  - Saldo salário: 1 mês cheio (assume que o aviso será trabalhado integralmente)
    //  - Férias proporcionais (avos pendentes não medidos sem dataAdmissao real):
    //    estima média de 6/12 = 50% do salário + 1/3
    //  - 13º proporcional: estima 6/12 = 50% do salário
    //  - Multa FGTS: 40% sobre depósitos estimados (8% × 12 meses × salário) ≈ 38,4% do bruto
    const saldo = bruto;
    const feriasProp = (bruto * 6 / 12) * (1 + 1 / 3);
    const treze = bruto * 6 / 12;
    const multaFgts = bruto * 0.08 * 12 * 0.40;
    const total = saldo + feriasProp + treze + multaFgts;

    return {
      id: parseInt(r.id, 10),
      employeeId: parseInt(r.id, 10),
      funcionarioNome: r.func_nome,
      funcionarioCodigo: r.func_codigo,
      cargo: r.cargo,
      dataDesligamento: dDesl.toISOString().slice(0, 10),
      dataPagamento: dPgto.toISOString().slice(0, 10),
      saldoSalario: saldo,
      feriasProporcionais: feriasProp,
      decimoTerceiroProp: treze,
      multaFgts,
      valorTotal: total,
      hasDataReal: hasReal,
    };
  });
}

// ─────────── 4) Quais meses já têm folha REAL consolidada? ───
// Bulk lookup pra evitar N+1 e garantir que QUALQUER mês do horizonte
// (atual ou futuro) com folha real seja respeitado.
async function getMesesComFolhaReal(db: any, companyId: number, mesInicio: string, mesFim: string): Promise<Set<string>> {
  const { rows } = await dbExecute(db,
    `SELECT DISTINCT TO_CHAR(data_competencia, 'YYYY-MM') AS mes
     FROM financial_entries
     WHERE company_id = $1
       AND origem_modulo IN ('folha_rh','folha_clt','folha','payroll_agregado')
       AND TO_CHAR(data_competencia, 'YYYY-MM') BETWEEN $2 AND $3`,
    [companyId, mesInicio, mesFim]
  );
  return new Set(rows.map((r: any) => r.mes as string));
}

// ─────────── 5) Limpa projeções antigas da empresa ───────────
async function limparProjecoesAntigas(db: any, companyId: number): Promise<void> {
  await dbExecute(db,
    `DELETE FROM financial_entries
     WHERE company_id = $1
       AND origem_modulo = ANY($2::text[])
       AND status = 'previsto'`,
    [companyId, `{${PROJ_ORIGENS.join(",")}}`]
  );
}

// ─────────── 6) Geração principal ────────────────────────────
export async function importFolhaProjecao(companyId: number, opts?: { mesesAFrente?: number }): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const horizonte = opts?.mesesAFrente ?? HORIZONTE_MESES;
  let inseridos = 0;

  try {
    // Snapshot do quadro atual (vale para todos os meses do horizonte)
    const [quadro, beneficios] = await Promise.all([
      getQuadroCLT(db, companyId),
      getBeneficiosMedios(db, companyId),
    ]);

    // Limpa todas as projeções antigas desta empresa antes de regravar
    await limparProjecoesAntigas(db, companyId);

    if (quadro.count === 0 && quadro.totalSalarioBruto === 0) {
      // Sem CLT — ainda projeta PJs
    }

    const hoje = new Date();
    const ano0 = hoje.getFullYear();
    const mes0 = hoje.getMonth(); // 0-11
    const mesIniRef = fmtMes(new Date(Date.UTC(ano0, mes0, 1)));
    const mesFimRef = fmtMes(new Date(Date.UTC(ano0, mes0 + horizonte - 1, 1)));

    // Bulk: quais meses do horizonte já têm folha REAL consolidada?
    const mesesComFolhaReal = await getMesesComFolhaReal(db, companyId, mesIniRef, mesFimRef);

    for (let i = 0; i < horizonte; i++) {
      const ref = new Date(Date.UTC(ano0, mes0 + i, 1));
      const mes = fmtMes(ref);
      const ano = ref.getUTCFullYear();
      const mNum = ref.getUTCMonth() + 1;
      const competencia = competenciaPrimeiroDia(mes);

      // Em qualquer mês (atual ou futuro) com folha real consolidada,
      // pulamos a projeção pra evitar duplicidade no calendário e nos cards.
      const folhaJaReal = mesesComFolhaReal.has(mes);

      // ── 6.1 Folha CLT (vencimento dia 5 — recua p/ dia útil)
      if (!folhaJaReal && quadro.totalSalarioBruto > 0) {
        const vencFolha = lastBusinessDayOrEarlier(ano, mNum, 5);
        await insertProjEntry(db, {
          companyId,
          contaNome: "Folha CLT (Projeção)",
          valor: quadro.totalSalarioBruto,
          competencia,
          vencimento: vencFolha,
          origemModulo: "folha_projetada",
          origemId: syntheticId(mes, 1),
          origemDescricao: `Folha CLT projetada — ${quadro.count} funcionário(s) ativos`,
          descricao: `Folha CLT — ${quadro.count} funcionário(s) — ref. ${fmtMesBR(mes)}`,
        });
        inseridos++;

        // ── 6.2 Encargos (FGTS + INSS pat + RAT/Terceiros)
        const valEncargos = quadro.totalSalarioBruto * ENCARGOS_FOLHA_PERCENT;
        if (valEncargos > 0) {
          const vencEnc = lastBusinessDayOrEarlier(ano, mNum, 20); // GPS/FGTS dia 20
          await insertProjEntry(db, {
            companyId,
            contaNome: "Encargos sobre Folha (Projeção)",
            valor: valEncargos,
            competencia,
            vencimento: vencEnc,
            origemModulo: "encargos_projetado",
            origemId: syntheticId(mes, 2),
            origemDescricao: `FGTS 8% + INSS pat. 20% + RAT/Terc. ~5,8% sobre folha`,
            descricao: `Encargos Folha (${(ENCARGOS_FOLHA_PERCENT * 100).toFixed(1)}%) — ref. ${fmtMesBR(mes)}`,
          });
          inseridos++;
        }
      }

      // ── 6.3 VR (Vale Refeição) — café/lanche/janta × ativos
      if (!folhaJaReal && quadro.count > 0 && beneficios.vrPorFuncMes > 0) {
        const valVR = beneficios.vrPorFuncMes * quadro.count;
        const vencVR = lastBusinessDayOrEarlier(ano, mNum, 5);
        await insertProjEntry(db, {
          companyId,
          contaNome: "VALE ALIMENTAÇÃO",
          valor: valVR,
          competencia,
          vencimento: vencVR,
          origemModulo: "beneficio_vr_projetado",
          origemId: syntheticId(mes, 3),
          origemDescricao: `VR projetado — ${quadro.count} func. × R$ ${beneficios.vrPorFuncMes.toFixed(2)}/mês`,
          descricao: `Vale Refeição — ${quadro.count} funcionário(s) — ref. ${fmtMesBR(mes)}`,
        });
        inseridos++;
      }

      // ── 6.4 VA (Vale Alimentação)
      if (!folhaJaReal && quadro.count > 0 && beneficios.vaPorFuncMes > 0) {
        const valVA = beneficios.vaPorFuncMes * quadro.count;
        const vencVA = lastBusinessDayOrEarlier(ano, mNum, 5);
        await insertProjEntry(db, {
          companyId,
          contaNome: "VALE ALIMENTAÇÃO",
          valor: valVA,
          competencia,
          vencimento: vencVA,
          origemModulo: "beneficio_va_projetado",
          origemId: syntheticId(mes, 4),
          origemDescricao: `VA projetado — ${quadro.count} func. × R$ ${beneficios.vaPorFuncMes.toFixed(2)}/mês`,
          descricao: `Vale Alimentação — ${quadro.count} funcionário(s) — ref. ${fmtMesBR(mes)}`,
        });
        inseridos++;
      }

      // ── 6.5 13º Salário — 1ª parcela em NOV (até 30/11) e 2ª em DEZ (até 20/12)
      // Lei 4.090/62: 1ª parcela = 50% do bruto, sem desconto INSS
      //               2ª parcela = 50% do bruto, líquido de INSS (≈ 8% médio)
      if (quadro.totalSalarioBruto > 0) {
        if (mNum === 11) {
          const val = quadro.totalSalarioBruto * 0.5;
          const venc = lastBusinessDayOrEarlier(ano, 11, 28);
          await insertProjEntry(db, {
            companyId,
            contaNome: "13º Salário — 1ª Parcela (Projeção)",
            valor: val,
            competencia,
            vencimento: venc,
            origemModulo: "decimo_terceiro_projetado",
            origemId: syntheticId(mes, 5),
            origemDescricao: `13º 1ª parcela — Lei 4.090/62 — pagar até 30/11`,
            descricao: `13º Salário — 1ª Parcela ${ano}`,
          });
          inseridos++;
        }
        if (mNum === 12) {
          // 2ª parcela: 50% bruto - INSS (≈8% médio simplificado)
          const val = quadro.totalSalarioBruto * 0.5 * 0.92;
          const venc = lastBusinessDayOrEarlier(ano, 12, 18);
          await insertProjEntry(db, {
            companyId,
            contaNome: "13º Salário — 2ª Parcela (Projeção)",
            valor: val,
            competencia,
            vencimento: venc,
            origemModulo: "decimo_terceiro_projetado",
            origemId: syntheticId(mes, 6),
            origemDescricao: `13º 2ª parcela — Lei 4.090/62 — pagar até 20/12 (líquido INSS)`,
            descricao: `13º Salário — 2ª Parcela ${ano} (líq. INSS)`,
          });
          inseridos++;

          // Encargos sobre 13º (FGTS + INSS patronal sobre o bruto integral)
          const encargos13 = quadro.totalSalarioBruto * ENCARGOS_FOLHA_PERCENT;
          await insertProjEntry(db, {
            companyId,
            contaNome: "Encargos 13º (Projeção)",
            valor: encargos13,
            competencia,
            vencimento: lastBusinessDayOrEarlier(ano, 12, 20),
            origemModulo: "encargos_projetado",
            origemId: syntheticId(mes, 7),
            origemDescricao: `Encargos sobre 13º — FGTS + INSS pat. + RAT/Terc.`,
            descricao: `Encargos sobre 13º Salário ${ano}`,
          });
          inseridos++;
        }
      }

      // ── 6.6 Férias projetadas: lança UMA VEZ no mês corrente para todas
      // as férias com início no horizonte (não dentro do loop mensal). Saímos
      // do loop apenas no primeiro mês para evitar duplicação.
      // (Consolidamos abaixo, fora do for.)

      // ── 6.7 PJs ativos no mês
      const pjs = await getPJsAtivosNoMes(db, companyId, competencia);
      for (const pj of pjs) {
        const venc = lastBusinessDayOrEarlier(ano, mNum, pj.diaFechamento || 5);
        // origem_id único: contractId * 100 + offset_mes para não colidir
        const oid = pj.id * 1000 + ((ano % 100) * 12 + mNum);
        await insertProjEntry(db, {
          companyId,
          contaNome: "Pagamento PJ (Projeção)",
          valor: pj.valorMensal,
          competencia,
          vencimento: venc,
          origemModulo: "pj_projetado",
          origemId: oid,
          origemDescricao: `Contrato PJ #${pj.id} — ${pj.razao}`,
          descricao: `${pj.razao} — ref. ${fmtMesBR(mes)}`,
        });
        inseridos++;
      }
    }

    // ── 6.8 Férias projetadas (CLT 145) — fora do loop mensal,
    // pois cada vacation_period gera 1 lançamento próprio na sua dataPagamento.
    const dataIniHorizonte = `${ano0}-${String(mes0 + 1).padStart(2, "0")}-01`;
    const refFim = new Date(Date.UTC(ano0, mes0 + horizonte, 0));
    const dataFimHorizonte = refFim.toISOString().slice(0, 10);
    const ferias = await getFeriasProjetadas(db, companyId, dataIniHorizonte, dataFimHorizonte);
    for (const f of ferias) {
      const compMes = f.dataInicio.slice(0, 7);
      const venc = f.dataPagamento;
      await insertProjEntry(db, {
        companyId,
        contaNome: "Férias a Pagar (Projeção)",
        valor: f.valorTotal,
        competencia: competenciaPrimeiroDia(compMes),
        vencimento: venc,
        origemModulo: "ferias_projetada",
        origemId: f.id,
        origemDescricao: `Férias ${f.funcionarioNome} — ${f.diasGozo}d (${f.dataInicio.split("-").reverse().join("/")} a ${f.dataFim.split("-").reverse().join("/")}) — CLT 145`,
        descricao: `Férias — ${f.funcionarioNome} (${f.funcionarioCodigo}) — gozo ${f.dataInicio.split("-").reverse().join("/")}`,
      });
      inseridos++;
    }

    // ── 6.9 Rescisões projetadas (CLT 477 §6º Lei 13.467/17 — pgto até 10d)
    const rescisoes = await getRescisoesProjetadas(db, companyId);
    for (const r of rescisoes) {
      const compMes = r.dataDesligamento.slice(0, 7);
      await insertProjEntry(db, {
        companyId,
        contaNome: "Rescisões a Pagar (Projeção)",
        valor: r.valorTotal,
        competencia: competenciaPrimeiroDia(compMes),
        vencimento: r.dataPagamento,
        origemModulo: "rescisao_projetada",
        origemId: r.employeeId,
        origemDescricao: `Rescisão ${r.funcionarioNome} — Aviso prévio (CLT 477 §6º) — ${r.hasDataReal ? "data efetiva" : "estimada"} ${r.dataDesligamento.split("-").reverse().join("/")}`,
        descricao: `Rescisão — ${r.funcionarioNome} (${r.funcionarioCodigo}) — desligamento ${r.dataDesligamento.split("-").reverse().join("/")}`,
      });
      inseridos++;
    }
  } catch (e: any) {
    console.error(`[PayrollProjection] company=${companyId} erro:`, e?.message ?? e);
  }

  return inseridos;
}

// Roda para todas as empresas ativas (chamada pelo job)
export async function runPayrollProjectionForAllCompanies(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const { rows } = await dbExecute(db,
    `SELECT id FROM companies
     WHERE COALESCE("deletedAt", NULL) IS NULL
     ORDER BY id`,
    []
  );
  for (const r of rows) {
    const cid = parseInt(r.id, 10);
    try {
      const n = await importFolhaProjecao(cid);
      if (n > 0) console.log(`[PayrollProjection] company=${cid} → ${n} lançamentos projetados (12 meses)`);
    } catch (e: any) {
      console.error(`[PayrollProjection] company=${cid} erro:`, e?.message ?? e);
    }
  }
}

export const PAYROLL_PROJECTION_ORIGINS = PROJ_ORIGENS;
