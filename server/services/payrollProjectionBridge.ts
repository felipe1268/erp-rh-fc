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
] as const;

// ─────────── Helpers ─────────────────────────────────────────
async function dbExecute(db: any, query: string, params: unknown[]): Promise<{ rows: any[] }> {
  const parts = query.split(/\$\d+/g);
  let built: any = sql.raw(parts[0] ?? "");
  for (let i = 1; i < parts.length; i++) {
    const paramVal = params[i - 1];
    const tail = parts[i] ?? "";
    built = tail ? sql`${built}${paramVal}${sql.raw(tail)}` : sql`${built}${paramVal}`;
  }
  const res = await db.execute(built);
  const rows: any[] = (res as any)?.rows ?? (Array.isArray(res) ? res : []);
  return { rows };
}

function fmtMes(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
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
  // status considerado "ativo para folha": Ativo, Ferias, Afastado, Licenca
  // Salário bruto: mensalista usa salarioBase; horista usa valorHora * 220h.
  // Inclui complemento fixo se recebeComplemento=1.
  const { rows } = await dbExecute(db,
    `SELECT
       COUNT(*) AS qtd,
       COALESCE(SUM(
         CASE
           WHEN LOWER(COALESCE("tipoRemuneracao",'horista')) = 'mensalista'
             THEN COALESCE(NULLIF(REPLACE("salarioBase", ',', '.'), '')::numeric, 0)
           ELSE COALESCE(NULLIF(REPLACE("valorHora", ',', '.'), '')::numeric, 0) * $2
         END
         + CASE WHEN "recebeComplemento" = 1
             THEN COALESCE(NULLIF(REPLACE("valorComplemento", ',', '.'), '')::numeric, 0)
             ELSE 0 END
       ), 0) AS bruto
     FROM employees
     WHERE "companyId" = $1
       AND "status" IN ('Ativo','Ferias','Afastado','Licenca')
       AND ("tipoContrato" IS NULL OR "tipoContrato" <> 'PJ')`,
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
  const { rows } = await dbExecute(db,
    `SELECT
       COALESCE(AVG(NULLIF(REPLACE("cafeManhaDia", ',', '.'), '')::numeric), 0) AS cafe,
       COALESCE(AVG(NULLIF(REPLACE("lancheTardeDia", ',', '.'), '')::numeric), 0) AS lanche,
       COALESCE(AVG(NULLIF(REPLACE("jantaDia", ',', '.'), '')::numeric), 0) AS janta,
       COALESCE(AVG(NULLIF(REPLACE("valeAlimentacaoMes", ',', '.'), '')::numeric), 0) AS va,
       COALESCE(AVG("diasUteisRef"), $2) AS dias
     FROM meal_benefit_configs
     WHERE "companyId" = $1 AND COALESCE("ativo", 1) = 1`,
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
    `SELECT id,
            COALESCE("razaoSocialPrestador", 'Prestador PJ') AS razao,
            COALESCE(NULLIF(REPLACE("valorMensal", ',', '.'), '')::numeric, 0) AS valor,
            COALESCE("diaFechamento", 5) AS dia
     FROM pj_contracts
     WHERE "companyId" = $1
       AND "status" IN ('ativo','vigente','assinado')
       AND "dataInicio" <= $2
       AND "dataFim"    >= $3
       AND COALESCE(NULLIF(REPLACE("valorMensal", ',', '.'), '')::numeric, 0) > 0`,
    [companyId, primeiroDia, primeiroDia]
  );
  return rows.map(r => ({
    id: parseInt(r.id, 10),
    razao: r.razao,
    valorMensal: num(r.valor),
    diaFechamento: parseInt(r.dia ?? "5", 10),
  }));
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
          descricao: `Folha CLT (Projeção) ${mes} — ${quadro.count} func.`,
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
            descricao: `Encargos Folha (Projeção) ${mes} — ${(ENCARGOS_FOLHA_PERCENT * 100).toFixed(1)}%`,
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
          contaNome: "Vale Refeição (Projeção)",
          valor: valVR,
          competencia,
          vencimento: vencVR,
          origemModulo: "beneficio_vr_projetado",
          origemId: syntheticId(mes, 3),
          origemDescricao: `VR projetado — ${quadro.count} func. × R$ ${beneficios.vrPorFuncMes.toFixed(2)}/mês`,
          descricao: `Vale Refeição (Projeção) ${mes}`,
        });
        inseridos++;
      }

      // ── 6.4 VA (Vale Alimentação)
      if (!folhaJaReal && quadro.count > 0 && beneficios.vaPorFuncMes > 0) {
        const valVA = beneficios.vaPorFuncMes * quadro.count;
        const vencVA = lastBusinessDayOrEarlier(ano, mNum, 5);
        await insertProjEntry(db, {
          companyId,
          contaNome: "Vale Alimentação (Projeção)",
          valor: valVA,
          competencia,
          vencimento: vencVA,
          origemModulo: "beneficio_va_projetado",
          origemId: syntheticId(mes, 4),
          origemDescricao: `VA projetado — ${quadro.count} func. × R$ ${beneficios.vaPorFuncMes.toFixed(2)}/mês`,
          descricao: `Vale Alimentação (Projeção) ${mes}`,
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
            descricao: `13º Salário 1ª Parcela ${ano} (Projeção)`,
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
            descricao: `13º Salário 2ª Parcela ${ano} (Projeção)`,
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
            descricao: `Encargos 13º ${ano} (Projeção)`,
          });
          inseridos++;
        }
      }

      // ── 6.6 PJs ativos no mês
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
          descricao: `PJ (Projeção) ${mes} — ${pj.razao}`,
        });
        inseridos++;
      }
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
