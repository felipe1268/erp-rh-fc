import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb, createAuditLog, encerrarContratosPjDoFuncionario, userCanSeeAvisoStatus, getCompaniesForUser } from "../db";
import { terminationNotices, vacationPeriods, employees, companies, obras, obraFuncionarios, hePeriods, hePeriodEmployees, pontoDescontosResumo, employeeTerminationChecklist, comboDemissaoSimulacoes, cipaMembers, cipaElections, dissidios, gestorSubstituicaoSolicitacoes } from "../../drizzle/schema";
import { eq, and, sql, isNull, lte, gte, desc, asc, inArray } from "drizzle-orm";
import { resolveCompanyIds, companyFilter } from "../companyHelper";
import { TRPCError } from "@trpc/server";
import { logStatusChange } from "../lib/employeeStatusHelper";
import {
  parseBRL,
  calcularAnosServico,
  calcularMesesServico,
  calcularMeses13o,
  calcularDiasAvisoTotal,
  calcularDiasAviso,
  calcularDiasExtrasAviso,
  calcularDataFim,
  calcularDataInicioAviso,
  calcularMesesFeriasProporcionais,
  calcularFeriasVencidas,
  calcularRescisaoCompleta,
  calcularRescisaoComplementar,
  calcularIndenizacaoEstabilidade,
  calcularDescontosRescisao,
  type DescontosRescisaoContext,
  type DescontosRescisaoResult,
} from "../utils/rescisaoCalc";
import { getIncluirMultaFgts, carregarMultaFgtsPorEmpresa } from "../utils/rescisaoMultaCfg";
import { corrigirPontoFuncionario } from "../utils/pontoCorrecaoAuto";
import { storagePut } from "../storage";
import { bancoHorasSaldo } from "../../drizzle/schema";
import { resolveMealBenefitConfig } from "../services/mealBenefitResolver";

/**
 * Rev. 4557 — Fluxo RH → Financeiro: quando o Financeiro dá a baixa TOTAL do
 * lançamento de rescisão no Contas a Pagar (origem_modulo='aviso_previo'),
 * este helper conclui o aviso e desliga o funcionário automaticamente.
 *
 * Regras:
 * - Registra a baixa da rescisão no aviso (valor = estimado, por = Financeiro).
 * - Se a checklist de desligamento tiver item OBRIGATÓRIO pendente, o aviso é
 *   concluído (pagamento aconteceu de fato) mas o funcionário NÃO é desligado —
 *   fica registrado em observações para o RH resolver a checklist e desligar
 *   manualmente pelo cadastro.
 * - Nunca sobrescreve funcionário já Desligado/Lista_Negra.
 */
export async function concluirAvisoPorBaixaFinanceira(opts: {
  avisoId: number;
  companyId: number;
  dataPagamento: string; // YYYY-MM-DD
  userName: string;
  userId?: number;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const [aviso] = await db.select().from(terminationNotices).where(and(
    eq(terminationNotices.id, opts.avisoId),
    eq(terminationNotices.companyId, opts.companyId),
    isNull(terminationNotices.deletedAt),
  ));
  if (!aviso || aviso.status === 'concluido' || aviso.status === 'cancelado') return;

  // Rev. 4689 — o aviso pode ter DOIS lançamentos no Contas a Pagar (rescisão +
  // multa FGTS). Só conclui quando TODOS os lançamentos ativos estiverem pagos.
  try {
    const ids = [(aviso as any).financeiroEntryId, (aviso as any).financeiroFgtsEntryId]
      .filter((v: any) => Number(v) > 0).map(Number);
    if (ids.length > 0) {
      const pend: any = await db.execute(sql`
        SELECT id FROM financial_entries
        WHERE id IN (${sql.join(ids.map(i => sql`${i}`), sql`, `)})
          AND status NOT IN ('cancelado', 'pago', 'recebido')
        LIMIT 1
      `);
      const pendRow = (Array.isArray(pend) ? pend[0] : pend?.rows?.[0]) as any;
      if (pendRow) return; // ainda há lançamento em aberto (ex.: FGTS não pago)
    }
  } catch (e: any) {
    // Fail-safe: se não conseguimos VERIFICAR as pendências, NÃO concluímos
    // (concluir com título em aberto desligaria o funcionário indevidamente).
    console.error(`[concluirAvisoPorBaixaFinanceira] aviso #${opts.avisoId}: falha ao verificar lançamentos pendentes — conclusão adiada:`, e?.message ?? e);
    return;
  }

  const hoje = opts.dataPagamento;
  const porLabel = `Financeiro (${opts.userName})`;

  // Checklist de desligamento — item obrigatório pendente bloqueia SÓ o desligamento.
  let checklistPendentes: string[] = [];
  try {
    const itens = await db.select().from(employeeTerminationChecklist).where(and(
      eq(employeeTerminationChecklist.companyId, aviso.companyId),
      eq(employeeTerminationChecklist.employeeId, aviso.employeeId),
    ));
    checklistPendentes = itens.filter(i => i.obrigatorio === 1 && i.concluido === 0).map(i => i.label as string);
  } catch { /* sem checklist = sem bloqueio */ }

  const obsAppend = `\n[Baixa pelo Financeiro em ${hoje} por ${opts.userName}]: rescisão quitada no Contas a Pagar (lançamento #${(aviso as any).financeiroEntryId ?? '?'}).`
    + (checklistPendentes.length > 0
      ? ` ATENÇÃO: funcionário NÃO foi desligado automaticamente — checklist obrigatória pendente: ${checklistPendentes.join(', ')}.`
      : '');

  await db.update(terminationNotices).set({
    status: 'concluido',
    dataConclusao: hoje,
    dataBaixa: hoje,
    baixaRescisaoValor: (aviso as any).baixaRescisaoValor ?? aviso.valorEstimadoTotal ?? '0',
    baixaRescisaoData: (aviso as any).baixaRescisaoData ?? hoje,
    baixaRescisaoPor: (aviso as any).baixaRescisaoPor ?? porLabel,
    observacoes: (aviso.observacoes || '') + obsAppend,
    updatedAt: sql`NOW()`,
  } as any).where(eq(terminationNotices.id, aviso.id));

  // Desligamento automático (se checklist ok e funcionário ainda ativo).
  if (checklistPendentes.length === 0 && aviso.employeeId) {
    const [empAntes] = await db.select({ status: employees.status, nomeCompleto: employees.nomeCompleto })
      .from(employees).where(eq(employees.id, aviso.employeeId));
    if (empAntes && empAntes.status !== 'Desligado' && empAntes.status !== 'Lista_Negra' && empAntes.status !== 'Inativo') {
      // Rev. 4686 — categorias específicas p/ justa causa e rescisão indireta.
      const _t = String(aviso.tipo || '');
      const categoria = _t === 'justa_causa' ? 'demissao_justa_causa'
        : _t === 'rescisao_indireta' ? 'rescisao_indireta'
        : _t === 'acordo_mutuo' ? 'acordo_mutuo'
        : _t.startsWith('empregador') ? 'demissao_sem_justa_causa' : 'pedido_demissao';
      await db.update(employees).set({
        status: 'Desligado',
        categoriaDesligamento: categoria,
        motivoDesligamento: `Rescisão paga pelo Financeiro (aviso prévio #${aviso.id})`,
        dataDesligamentoEfetiva: hoje,
        desligadoPor: porLabel,
        desligadoUserId: opts.userId ?? null,
      } as any).where(eq(employees.id, aviso.employeeId));
      await logStatusChange({
        db, companyId: aviso.companyId, employeeId: aviso.employeeId,
        nomeCompleto: empAntes.nomeCompleto, statusAnterior: empAntes.status || 'Desconhecido',
        statusNovo: 'Desligado', alteradoPor: porLabel,
        alteradoPorUserId: opts.userId, motivo: `Baixa da rescisão no Contas a Pagar (aviso #${aviso.id})`,
        origemModulo: 'financeiro.registrarBaixa',
      });
      try {
        const [aloc] = await db.select({ id: obraFuncionarios.id }).from(obraFuncionarios)
          .where(and(eq(obraFuncionarios.employeeId, aviso.employeeId), eq(obraFuncionarios.isActive, 1)));
        if (aloc) {
          await db.update(obraFuncionarios)
            .set({ isActive: 0, dataDesligamento: hoje } as any)
            .where(eq(obraFuncionarios.id, aloc.id));
        }
      } catch (e) { console.error('[baixaFinanceira] Erro ao desalocar obra:', e); }
      try {
        await encerrarContratosPjDoFuncionario(
          aviso.employeeId,
          `Desligamento via baixa financeira do aviso prévio #${aviso.id}`,
          porLabel,
        );
      } catch (e) { console.error('[baixaFinanceira] Erro ao encerrar contratos PJ:', e); }
      await createAuditLog({
        userId: opts.userId ?? 0,
        userName: porLabel,
        action: 'DESLIGAR_FUNCIONARIO',
        module: 'aviso_previo',
        entityType: 'employee',
        entityId: aviso.employeeId,
        details: `Funcionário desligado automaticamente após baixa da rescisão no Contas a Pagar (aviso #${aviso.id}).`,
      });
    }
  }
}

/**
 * Rev. 4711 — Férias agendada → título automático no Contas a Pagar.
 *
 * Regras (mesmo padrão do Aviso Prévio ↔ Financeiro):
 * - Chamado quando a férias passa a agendada/em_gozo ou tem valores/datas alterados.
 * - Valor = valorLiquido (se calculado) senão valorTotal. Sem valor > 0 = não gera.
 * - Vencimento = dataPagamento (senão dataInicio − 2 dias, art. 145 CLT).
 * - Dedup: vínculo vacation_periods.financeiro_entry_id + índice único parcial
 *   uq_fin_entries_ferias (origem_modulo='ferias' AND status<>'cancelado').
 * - Se já existe título 'a_pagar', SINCRONIZA valor/vencimento (não duplica).
 * - Título com baixa/pago é intocável (não sobrescreve nem cancela).
 * - Never-throw: falha aqui não pode derrubar o fluxo de RH (loga e segue).
 */
export async function sincronizarFinanceiroFerias(periodoId: number, userName: string): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    const [p] = await db.select().from(vacationPeriods).where(eq(vacationPeriods.id, periodoId));
    if (!p || p.deletedAt) return;
    if (!['agendada', 'em_gozo', 'concluida'].includes(p.status) || !p.dataInicio) return;

    // BR-aware: valores gravados ora "3068.97" ora "3.068,97" (varchar-br-decimal-cast)
    const parse = (v: any) => {
      let s = String(v ?? '').trim();
      if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
      const n = parseFloat(s);
      return isFinite(n) ? n : 0;
    };
    const valor = parse((p as any).valorLiquido) > 0 ? parse((p as any).valorLiquido) : parse(p.valorTotal);
    if (valor <= 0) return; // sem cálculo salvo ainda — gera quando o RH salvar os valores

    let venc = p.dataPagamento as string | null;
    if (!venc) {
      const dt = new Date(p.dataInicio + 'T12:00:00');
      dt.setDate(dt.getDate() - 2);
      venc = dt.toISOString().split('T')[0];
    }

    const [emp] = await db.select({ nome: employees.nomeCompleto }).from(employees).where(eq(employees.id, p.employeeId));
    const nome = emp?.nome ?? `Funcionário #${p.employeeId}`;
    const fmtBr = (d: string | null) => d ? d.split('-').reverse().join('/') : '';
    const desc = `Férias — ${nome} (${fmtBr(p.dataInicio)} a ${fmtBr(p.dataFim)})`;

    // Obra atual (se alocado) para centro de custo
    let obraId: number | null = null; let obraNome: string | null = null;
    try {
      const [aloc] = await db.select({ obraId: obraFuncionarios.obraId, obraNome: obras.nome })
        .from(obraFuncionarios)
        .leftJoin(obras, eq(obras.id, obraFuncionarios.obraId))
        .where(and(eq(obraFuncionarios.employeeId, p.employeeId), eq(obraFuncionarios.isActive, 1)))
        .orderBy(desc2Ferias()).limit(1);
      if (aloc) { obraId = aloc.obraId; obraNome = aloc.obraNome ?? null; }
    } catch { /* sem obra = lançamento sem centro de custo */ }

    // Título ativo já existente? (vínculo OU varredura por origem — cobre vínculo perdido)
    const existRes: any = await db.execute(sql`
      SELECT id, status FROM financial_entries
      WHERE origem_modulo = 'ferias' AND origem_id = ${p.id} AND company_id = ${p.companyId} AND status <> 'cancelado'
      ORDER BY id DESC LIMIT 1
    `);
    const exist = (Array.isArray(existRes) ? existRes[0] : existRes?.rows?.[0]) as any;

    if (exist?.id) {
      if (exist.status === 'a_pagar') {
        await db.execute(sql`
          UPDATE financial_entries
          SET valor_previsto = ${valor.toFixed(2)}, data_vencimento = ${venc},
              data_competencia = ${p.dataInicio}, descricao = ${desc}, origem_descricao = ${desc},
              obra_id = COALESCE(obra_id, ${obraId}), obra_nome = COALESCE(obra_nome, ${obraNome}),
              updated_at = NOW()
          WHERE id = ${exist.id} AND company_id = ${p.companyId} AND status = 'a_pagar'
        `);
      }
      if (!(p as any).financeiroEntryId) {
        await db.update(vacationPeriods).set({ financeiroEntryId: Number(exist.id) } as any).where(eq(vacationPeriods.id, p.id));
      }
      return;
    }

    const res: any = await db.execute(sql`
      INSERT INTO financial_entries (
        company_id, obra_id, obra_nome, conta_nome, tipo, natureza,
        valor_previsto, data_competencia, data_vencimento, status,
        origem_modulo, origem_id, origem_descricao, descricao, created_at, updated_at
      ) VALUES (
        ${p.companyId}, ${obraId}, ${obraNome}, ${'FÉRIAS - MÃO DE OBRA'}, 'despesa', 'variavel',
        ${valor.toFixed(2)}, ${p.dataInicio}, ${venc}, 'a_pagar',
        'ferias', ${p.id}, ${desc}, ${desc}, NOW(), NOW()
      )
      ON CONFLICT DO NOTHING
      RETURNING id
    `);
    const newId = Number((Array.isArray(res) ? res[0] : res?.rows?.[0])?.id) || null;
    if (newId) {
      await db.update(vacationPeriods).set({ financeiroEntryId: newId } as any).where(eq(vacationPeriods.id, p.id));
      console.log(`[FeriasFinanceiro] Férias #${p.id} (${nome}): título #${newId} de R$ ${valor.toFixed(2)} gerado no Contas a Pagar (venc. ${venc}) por ${userName}.`);
    }
  } catch (e: any) {
    console.error(`[FeriasFinanceiro] Falha ao gerar/sincronizar título da férias #${periodoId}:`, e?.message ?? e);
  }
}
// desc() de drizzle já está importado como `desc`; alias p/ evitar sombra em escopo local
function desc2Ferias() { return desc(obraFuncionarios.id); }

/**
 * Rev. 4711 — Cancela o título do Contas a Pagar vinculado à férias quando o
 * agendamento é cancelado ou o período é excluído. Só cancela título 'a_pagar';
 * título com baixa ativa é intocável (fica para o Financeiro resolver).
 */
export async function cancelarFinanceiroFerias(periodoId: number, motivo: string): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    // Defesa em profundidade (anti-IDOR): amarra o cancelamento ao tenant do período
    const [per] = await db.select({ companyId: vacationPeriods.companyId }).from(vacationPeriods).where(eq(vacationPeriods.id, periodoId));
    if (!per) return;
    const res: any = await db.execute(sql`
      UPDATE financial_entries
      SET status = 'cancelado', observacoes = CONCAT(COALESCE(observacoes,''), ${'\n[Cancelado automaticamente: ' + motivo + ']'}), updated_at = NOW()
      WHERE origem_modulo = 'ferias' AND origem_id = ${periodoId} AND company_id = ${per.companyId} AND status = 'a_pagar'
      RETURNING id
    `);
    const rows = Array.isArray(res) ? res : (res?.rows ?? []);
    if (rows.length) console.log(`[FeriasFinanceiro] Férias #${periodoId}: título(s) ${rows.map((r: any) => '#' + r.id).join(', ')} cancelado(s) — ${motivo}.`);
    await db.update(vacationPeriods).set({ financeiroEntryId: null } as any).where(eq(vacationPeriods.id, periodoId));
  } catch (e: any) {
    console.error(`[FeriasFinanceiro] Falha ao cancelar título da férias #${periodoId}:`, e?.message ?? e);
  }
}

/**
 * Rev. 3977 — Lê o saldo (em minutos) do Banco de Horas do empregado, usado para
 * compor o acerto rescisório (provento se positivo, desconto se negativo). Sem
 * linha na tabela = saldo 0 (empregado nunca usou banco de horas).
 */
async function getSaldoBancoHorasParaRescisao(db: any, employeeId: number): Promise<number> {
  const [row] = await db.select({ saldoMinutos: bancoHorasSaldo.saldoMinutos })
    .from(bancoHorasSaldo)
    .where(eq(bancoHorasSaldo.employeeId, employeeId));
  return row?.saldoMinutos || 0;
}

/**
 * Constrói o contexto de descontos da rescisão para um único empregado.
 *
 * Lê do banco (filtros já alinhados com o engine de folha):
 * - Pensão alimentícia + dependentes + sindical: cadastro do empregado
 * - Salário mínimo: system_criteria
 * - Faltas/atrasos: timecard_daily do mês de competência
 * - Convênios: lancamentos_parceiros aprovados no mês
 * - EPIs: epi_discount_alerts aprovados no mês
 * - Vales: payroll_advances calculados no mês
 * - Outros: payroll_adjustments tipo='outros' aprovados no mês
 *
 * `mesRescisao` no formato YYYY-MM (mês de competência da rescisão).
 */
async function buildDescontosContextRescisao(
  db: any,
  emp: any,
  mesRescisao: string,
): Promise<DescontosRescisaoContext> {
  const ctx: DescontosRescisaoContext = {
    numDependentes: Number(emp?.numDependentes || 0),
    contribuicaoSindical: parseBRL(emp?.contribuicaoSindical),
    pensaoConfig: emp?.pensaoAlimenticia
      ? {
          ativa: true,
          tipo: (emp.pensaoTipo as any) || "valor_fixo",
          valor: parseBRL(emp.pensaoValor),
          percentual: parseFloat(String(emp.pensaoPercentual || "0").replace(",", ".")) || 0,
          base: (emp.pensaoBase as any) || "bruto",
        }
      : null,
    salarioMinimo: 0,
    faltasAtrasosValor: 0,
    conveniosValor: 0,
    episValor: 0,
    valesValor: 0,
    outrosDescontosValor: 0,
  };

  // Salário mínimo vigente
  try {
    const r = ((await db.execute(sql`
      SELECT valor FROM system_criteria
      WHERE "companyId" = ${emp.companyId} AND chave = 'salario_minimo_vigente'
      LIMIT 1
    `)) as any).rows || [];
    ctx.salarioMinimo = parseBRL(r[0]?.valor) || 1621;
  } catch {
    ctx.salarioMinimo = 1621;
  }

  // Faltas + Atrasos do mês (timecard_daily)
  try {
    const r = ((await db.execute(sql`
      SELECT COALESCE(SUM(CAST("valorDesconto" AS DECIMAL(15,2))), 0) AS total
      FROM timecard_daily
      WHERE "employeeId" = ${emp.id}
        AND "companyId" = ${emp.companyId}
        AND "mesCompetencia" = ${mesRescisao}
        AND "statusDia" = 'registrado'
        AND ("isFalta" = 1 OR "isAtraso" = 1)
    `)) as any).rows || [];
    ctx.faltasAtrasosValor = parseFloat(String(r[0]?.total || "0")) || 0;
  } catch { /* fallback 0 */ }

  // Convênios aprovados
  try {
    const r = ((await db.execute(sql`
      SELECT COALESCE(SUM(CAST(valor AS DECIMAL(15,2))), 0) AS total
      FROM lancamentos_parceiros
      WHERE "employeeId" = ${emp.id}
        AND "companyId" = ${emp.companyId}
        AND competencia_desconto = ${mesRescisao}
        AND status = 'aprovado'
    `)) as any).rows || [];
    ctx.conveniosValor = parseFloat(String(r[0]?.total || "0")) || 0;
  } catch { /* fallback 0 */ }

  // EPIs aprovados
  try {
    const r = ((await db.execute(sql`
      SELECT COALESCE(SUM(CAST(valor_total AS DECIMAL(15,2))), 0) AS total
      FROM epi_discount_alerts
      WHERE "employeeId" = ${emp.id}
        AND "companyId" = ${emp.companyId}
        AND mes_referencia = ${mesRescisao}
        AND status = 'aprovado'
    `)) as any).rows || [];
    ctx.episValor = parseFloat(String(r[0]?.total || "0")) || 0;
  } catch { /* fallback 0 */ }

  // Vales/adiantamentos
  try {
    const r = ((await db.execute(sql`
      SELECT COALESCE(SUM(CAST("valorTotalVale" AS DECIMAL(15,2))), 0) AS total
      FROM payroll_advances
      WHERE "employeeId" = ${emp.id}
        AND "companyId" = ${emp.companyId}
        AND "mesReferencia" = ${mesRescisao}
        AND status = 'calculado'
    `)) as any).rows || [];
    ctx.valesValor = parseFloat(String(r[0]?.total || "0")) || 0;
  } catch { /* fallback 0 */ }

  // Outros ajustes aprovados pelo RH
  try {
    const r = ((await db.execute(sql`
      SELECT COALESCE(SUM(CAST("valorDesconto" AS DECIMAL(15,2))), 0) AS total
      FROM payroll_adjustments
      WHERE "employeeId" = ${emp.id}
        AND "companyId" = ${emp.companyId}
        AND "mesDesconto" = ${mesRescisao}
        AND tipo = 'outros'
        AND "aprovadoRh" = true
        AND status IN ('pendente','aplicado')
    `)) as any).rows || [];
    ctx.outrosDescontosValor = parseFloat(String(r[0]?.total || "0")) || 0;
  } catch { /* fallback 0 */ }

  return ctx;
}

/** Conta domingos em um mês (ano, mês 1-12) */
function contarDomingos(ano: number, mes: number): number {
  let count = 0;
  const dt = new Date(ano, mes - 1, 1);
  while (dt.getMonth() === mes - 1) {
    if (dt.getDay() === 0) count++;
    dt.setDate(dt.getDate() + 1);
  }
  return count;
}

/**
 * Conta quantos dias dentro do mês da data de saída o colaborador esteve em
 * férias (vacation_periods em status agendada/em_gozo/concluida) — usado
 * para descontar do "saldo de salário" da rescisão. Dias em férias são pagos
 * como férias/1-3, não como saldo de salário.
 */
export async function diasFeriasNoMesDaSaida(
  db: any,
  employeeId: number,
  dataSaida: string, // YYYY-MM-DD
): Promise<number> {
  if (!dataSaida || dataSaida.length < 10) return 0;
  const ano = parseInt(dataSaida.slice(0, 4));
  const mes = parseInt(dataSaida.slice(5, 7));
  if (!ano || !mes) return 0;
  const ini = `${dataSaida.slice(0, 7)}-01`;
  const fim = `${dataSaida.slice(0, 7)}-${String(new Date(ano, mes, 0).getDate()).padStart(2, "0")}`;
  const rows = await db.select({
    dataInicio: vacationPeriods.dataInicio,
    dataFim: vacationPeriods.dataFim,
  }).from(vacationPeriods).where(and(
    eq(vacationPeriods.employeeId, employeeId),
    isNull(vacationPeriods.deletedAt),
    sql`${vacationPeriods.dataInicio} IS NOT NULL AND ${vacationPeriods.dataFim} IS NOT NULL`,
    sql`${vacationPeriods.status} IN ('agendada','em_gozo','concluida')`,
    // Intersecção: inicio <= fim_mes AND fim >= ini_mes
    sql`${vacationPeriods.dataInicio} <= ${fim} AND ${vacationPeriods.dataFim} >= ${ini}`,
  ));
  const dias = new Set<string>();
  const saidaNum = parseInt(dataSaida.slice(8, 10));
  for (const r of rows) {
    const di = new Date(r.dataInicio + "T00:00:00");
    const df = new Date(r.dataFim + "T00:00:00");
    const d = new Date(di);
    while (d <= df) {
      if (d.getFullYear() === ano && d.getMonth() + 1 === mes) {
        const dia = d.getDate();
        // Só conta dias até a saída (inclusive). Dias após saída não entram no mês.
        if (dia <= saidaNum) dias.add(d.toISOString().slice(0, 10));
      }
      d.setDate(d.getDate() + 1);
    }
  }
  return dias.size;
}

/** Dias totais em um mês */
function diasNoMes(ano: number, mes: number): number {
  return new Date(ano, mes, 0).getDate();
}

/**
 * Art. 130 CLT — Redução de férias por faltas injustificadas no período aquisitivo
 * Até 5 faltas: 30 dias | 6-14: 24 dias | 15-23: 18 dias | 24-32: 12 dias | >32: 0 (perde direito)
 */
function calcDiasFeriasPorFaltas(faltas: number): number {
  if (faltas <= 5) return 30;
  if (faltas <= 14) return 24;
  if (faltas <= 23) return 18;
  if (faltas <= 32) return 12;
  return 0;
}

/** Calcula período aquisitivo de férias */
function calcularPeriodosFerias(dataAdmissao: string) {
  const admissao = new Date(dataAdmissao + 'T00:00:00');
  const hoje = new Date();
  const periodos = [];
  const limiteAntigoStr = `${hoje.getFullYear() - 2}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
  
  let inicioAquisitivo = new Date(admissao);
  while (inicioAquisitivo < hoje) {
    const fimAquisitivo = new Date(inicioAquisitivo);
    fimAquisitivo.setFullYear(fimAquisitivo.getFullYear() + 1);
    fimAquisitivo.setDate(fimAquisitivo.getDate() - 1);
    
    const fimConcessivo = new Date(fimAquisitivo);
    fimConcessivo.setFullYear(fimConcessivo.getFullYear() + 1);
    
    const vencida = hoje > fimConcessivo;
    const fimConcessivoStr = fimConcessivo.toISOString().split("T")[0];
    const antigoPreSistema = fimConcessivoStr < limiteAntigoStr;
    
    periodos.push({
      inicio: inicioAquisitivo.toISOString().split("T")[0],
      fim: fimAquisitivo.toISOString().split("T")[0],
      fimConcessivo: fimConcessivo.toISOString().split("T")[0],
      vencida,
      antigoPreSistema,
      adquirido: fimAquisitivo <= hoje,
    });
    
    inicioAquisitivo = new Date(fimAquisitivo);
    inicioAquisitivo.setDate(inicioAquisitivo.getDate() + 1);
  }
  
  return periodos;
}

// ============================================================================
// FÉRIAS VENCIDAS — SALDO DE DIAS (Rev. — corrige gozo PARCIAL)
// ----------------------------------------------------------------------------
// As contagens antigas tratavam férias vencidas como PERÍODOS INTEIROS e excluíam
// qualquer período `concluida`/`em_gozo`. Resultado: um período aquisitivo COMPLETO
// em que o funcionário gozou só uma parte (ex.: 5 de 30 dias, status='concluida')
// tinha os 25 dias restantes IGNORADOS na rescisão.
//
// Agora o saldo é por DIA. Para CADA período aquisitivo já COMPLETO até a data de
// corte (`periodoAquisitivoFim` < corte), não cancelado e não excluído:
//   • concluida / em_gozo → saldo = 30 − diasGozo − (abono ? 10 : 0)
//   • pendente / agendada / vencida → 30 (nada gozado), salvo se JÁ pago antes do
//     corte (dataPagamento ≤ corte → quitado antecipadamente → 0).
// `periodosVencidos` (contagem p/ exibição) = nº de períodos com saldo > 0.
// `diasVencidos` (dinheiro) = soma dos saldos. Idêntico ao modelo antigo quando
// todos os períodos em aberto têm 30 dias cheios.
// ============================================================================
const DIAS_DIREITO_FERIAS = 30;

function vpVal(r: any, name: string): any {
  return r[name] ?? r[name.toLowerCase()];
}

/** Saldo de DIAS de férias vencidas de UM período aquisitivo, dada a data de corte
 *  (YYYY-MM-DD = término do aviso). Retorna 0 quando o período não está vencido,
 *  está cancelado/excluído, já foi quitado, ou já foi 100% gozado/vendido. */
function saldoDiasVencidoPeriodo(r: any, corte: string): number {
  const pafRaw = vpVal(r, 'periodoAquisitivoFim');
  if (!pafRaw) return 0;
  const paf = String(pafRaw).slice(0, 10);
  if (paf >= corte) return 0; // período aquisitivo ainda não completo até o aviso
  const status = String(vpVal(r, 'status') || '');
  if (status === 'cancelada') return 0;
  if (vpVal(r, 'deletedAt')) return 0;
  const abonoDias = Number(vpVal(r, 'abonoPecuniario')) === 1 ? 10 : 0;
  const gozou = status === 'concluida' || status === 'em_gozo';
  if (!gozou) {
    // Nada gozado: período inteiro devido, salvo se pago antecipadamente.
    const dpagRaw = vpVal(r, 'dataPagamento');
    const dpag = dpagRaw ? String(dpagRaw).slice(0, 10) : null;
    if (dpag && dpag <= corte) return 0;
    const saldoPend = DIAS_DIREITO_FERIAS - abonoDias;
    return saldoPend > 0 ? saldoPend : 0;
  }
  const diasGozados = Number(vpVal(r, 'diasGozo')) || 0;
  const saldo = DIAS_DIREITO_FERIAS - diasGozados - abonoDias;
  return saldo > 0 ? saldo : 0;
}

interface FeriasVencidasSaldo {
  periodosVencidos: number | undefined;
  diasVencidos: number | undefined;
  detalhes: Array<{ periodoAquisitivoInicio: string; periodoAquisitivoFim: string; periodoConcessivoFim: string; saldoDias: number }>;
}

/** Fonte ÚNICA do saldo de férias vencidas de um funcionário até a data de corte.
 *  Em caso de falha de query, retorna {undefined, undefined} → o calc cai no
 *  fallback matemático (mesma semântica do try/catch antigo). */
async function getFeriasVencidasSaldo(db: any, employeeId: number, corte: string): Promise<FeriasVencidasSaldo> {
  try {
    const rows = ((await db.execute(sql`
      SELECT "periodoAquisitivoInicio", "periodoAquisitivoFim", "periodoConcessivoFim",
             "diasGozo", "abonoPecuniario", status, "dataPagamento", "deletedAt"
      FROM vacation_periods
      WHERE "employeeId" = ${employeeId}
        AND "periodoAquisitivoFim" IS NOT NULL
        AND "periodoAquisitivoFim" < ${corte}
        AND status != 'cancelada'
        AND "deletedAt" IS NULL
      ORDER BY "periodoAquisitivoFim" ASC
    `)) as any).rows || [];
    let diasVencidos = 0;
    let periodosVencidos = 0;
    const detalhes: FeriasVencidasSaldo['detalhes'] = [];
    for (const r of rows) {
      const saldo = saldoDiasVencidoPeriodo(r, corte);
      if (saldo > 0) {
        diasVencidos += saldo;
        periodosVencidos += 1;
        detalhes.push({
          periodoAquisitivoInicio: String(vpVal(r, 'periodoAquisitivoInicio') || '').slice(0, 10),
          periodoAquisitivoFim: String(vpVal(r, 'periodoAquisitivoFim') || '').slice(0, 10),
          periodoConcessivoFim: String(vpVal(r, 'periodoConcessivoFim') || '').slice(0, 10),
          saldoDias: saldo,
        });
      }
    }
    return { periodosVencidos, diasVencidos, detalhes };
  } catch {
    return { periodosVencidos: undefined, diasVencidos: undefined, detalhes: [] };
  }
}

/**
 * Helper: monta a previsão de rescisão complementar para o funcionário se ele
 * tiver complemento salarial ("por fora") cadastrado. Retorna null caso contrário.
 *
 * Usa APENAS o valor do complemento como base — não soma com o salário base de
 * registro. Não calcula FGTS/multa/VR/médias. Mesma janela temporal da oficial.
 */
function buildPrevisaoComplementar(emp: any, params: {
  dataAdmissao: string;
  dataDesligamento: string;
  dataFimAviso: string;
  tipo: string;
  diasTrabalhadosMes: number;
  periodosVencidosOverride?: number;
  diasVencidosOverride?: number;
}) {
  if (!emp || !emp.recebeComplemento) return null;
  const valorComplemento = parseBRL(emp.valorComplemento);
  if (!valorComplemento || valorComplemento <= 0) return null;
  return calcularRescisaoComplementar({ valorComplemento, ...params });
}

/**
 * Rev. 2960 — Núcleo REUTILIZÁVEL de criação de aviso prévio. Extraído da
 * mutation `avisoPrevio.create` SEM nenhuma mudança de comportamento (mesmo
 * cálculo, mesma checklist de 8 itens, mesma mudança de status p/ 'Aviso',
 * mesma correção de ponto fire-and-forget). Usado tanto pela criação
 * individual quanto pela geração EM LOTE do "Combo de Demissões".
 *
 * Lança TRPCError CONFLICT quando o colaborador já tem aviso 'em_andamento' —
 * o caller em lote intercepta esse código p/ PULAR o funcionário (não aborta o
 * lote inteiro).
 */
/** Rev. 4679 — formata valor gravado com ponto decimal (toFixed) em BRL. */
function fmtBRLDoc(v?: string | number | null): string {
  if (v === null || v === undefined || v === "") return "";
  const n = Number(v);
  return isNaN(n) ? String(v) : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export async function criarAvisoPrevioInterno(
  db: any,
  emp: any,
  params: {
    companyId: number;
    companyIds?: number[];
    tipo: 'empregador_trabalhado' | 'empregador_indenizado' | 'empregado_trabalhado' | 'empregado_indenizado' | 'justa_causa' | 'rescisao_indireta' | 'acordo_mutuo';
    dataInicio: string;
    dataDesligamento?: string;
    reducaoJornada?: '2h_dia' | '7_dias_corridos' | 'nenhuma';
    observacoes?: string;
    vrDiario?: number;
    diasTrabalhados?: number;
    descontarAvisoNaoCumprido?: boolean;
    /** Rev. 4686 — enquadramento legal (inciso do Art. 482 ou 483 CLT) para
     * justa_causa / rescisao_indireta. Lastro documental p/ eventual ação. */
    motivoLegal?: string;
    motivoDescricao?: string;
  },
  user: { id?: number | null; name?: string | null },
) {
  // Bloquear duplicidade: já existe aviso em andamento para este colaborador?
  const [existente] = await db.select({ id: terminationNotices.id })
    .from(terminationNotices)
    .where(and(
      companyFilter(terminationNotices.companyId, { companyId: params.companyId, companyIds: params.companyIds }),
      eq(terminationNotices.employeeId, emp.id),
      eq(terminationNotices.status, 'em_andamento'),
      isNull(terminationNotices.deletedAt),
    ))
    .limit(1);
  if (existente) {
    throw new TRPCError({ code: "CONFLICT", message: "Este colaborador já possui um aviso prévio em andamento. Conclua ou cancele o aviso existente antes de criar um novo." });
  }

  // Rev. 4686 — poka-yoke CIPA (Súmula 379 TST): cipeiro com estabilidade
  // vigente NÃO pode ser dispensado pelo empregador sem justa causa. Bloqueia
  // os tipos empregador_* quando há estabilidade ativa; justa_causa é a única
  // dispensa patronal permitida (pedido do empregado e rescisão indireta são
  // iniciativa do trabalhador — liberados).
  // Rev. 4686 — poka-yoke server-side: justa causa e rescisão indireta exigem
  // enquadramento legal (inciso + descrição do fato) — lastro documental.
  if (params.tipo === 'justa_causa' || params.tipo === 'rescisao_indireta') {
    if (!params.motivoLegal || !(params.motivoDescricao || '').trim()) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: params.tipo === 'justa_causa'
        ? 'Justa causa exige o inciso do Art. 482 CLT e a descrição do fato.'
        : 'Rescisão indireta exige a alínea do Art. 483 CLT e a descrição do fato.' });
    }
  }

  if (params.tipo.startsWith('empregador')) {
    try {
      const hoje = new Date().toISOString().split('T')[0];
      const cipaRows = await db.select({
        fimEstabilidade: cipaMembers.fimEstabilidade,
        mandatoFim: cipaMembers.mandatoFim,
      }).from(cipaMembers)
        .innerJoin(cipaElections, eq(cipaElections.id, cipaMembers.eleicaoId))
        .where(and(
          eq(cipaMembers.employeeId, emp.id),
          sql`${cipaMembers.statusMembro} != 'Encerrado'`,
          sql`${cipaElections.statusEleicao} != 'Encerrado'`,
        ));
      const estavel = cipaRows.some(r => {
        const fim = r.fimEstabilidade || r.mandatoFim || null;
        return fim && fim >= hoje;
      });
      if (estavel) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Este colaborador é cipeiro com estabilidade provisória vigente (CLT Art. 165 / Súmula 379 TST) — dispensa pelo empregador só é permitida por JUSTA CAUSA. Use o tipo "Justa Causa (Art. 482)" ou aguarde o fim da estabilidade.' });
      }
    } catch (e) {
      if (e instanceof TRPCError) throw e;
      console.error('[AvisoPrevio] Falha ao checar estabilidade CIPA (não-bloqueante):', e);
    }
  }

  const dataAdmissao = emp.dataAdmissao || new Date().toISOString().split("T")[0];
  const dataDesligamento = params.dataDesligamento || params.dataInicio;
  // Justa causa = desligamento IMEDIATO (sem período de aviso), mesmas datas
  // do empregado_indenizado (dataFim = data do desligamento, 0 dias de aviso).
  const isEmpregadoInd = params.tipo === 'empregado_indenizado' || params.tipo === 'justa_causa';
  const dataInicioAviso = isEmpregadoInd ? dataDesligamento : calcularDataInicioAviso(params.dataInicio);
  const anosServico = calcularAnosServico(dataAdmissao, dataDesligamento);
  const diasAviso = isEmpregadoInd ? 0 : calcularDiasAviso(anosServico, params.tipo);
  const salarioBase = parseBRL(emp.salarioBase);
  const dataFim = isEmpregadoInd ? dataDesligamento : calcularDataFim(dataInicioAviso, diasAviso);

  const dtFimAviso = new Date(dataFim + 'T00:00:00');
  const diasFeriasMesSaidaCreate = await diasFeriasNoMesDaSaida(db, emp.id, dataFim);
  const diasTrabalhadosMes = params.diasTrabalhados ?? Math.max(0, dtFimAviso.getDate() - diasFeriasMesSaidaCreate);

  // Saldo real de férias vencidas do banco (por DIA — reflete gozo parcial)
  const saldoVencCreate = await getFeriasVencidasSaldo(db, emp.id, dataFim);

  const incluirMultaFgtsCreate = await getIncluirMultaFgts(db, params.companyId);
  const saldoBhCreate = await getSaldoBancoHorasParaRescisao(db, emp.id);
  const previsao = calcularRescisaoCompleta({
    salarioBase,
    dataAdmissao,
    dataDesligamento,
    saldoBancoHorasMinutos: saldoBhCreate,
    valorHoraBancoHoras: parseBRL(emp.valorHora),
    dataFimAviso: dataFim, // TÉRMINO do aviso para férias, 13º, FGTS
    tipo: params.tipo,
    vrDiario: params.vrDiario ?? 0,
    diasTrabalhadosMes,
    periodosVencidosOverride: saldoVencCreate.periodosVencidos,
    diasVencidosOverride: saldoVencCreate.diasVencidos,
    descontarAvisoNaoCumprido: params.descontarAvisoNaoCumprido,
    incluirMultaFgts: incluirMultaFgtsCreate,
  });

  // Rescisão complementar (uso interno) — só para quem tem complemento.
  const previsaoComplementarCreate = buildPrevisaoComplementar(emp, {
    dataAdmissao,
    dataDesligamento,
    dataFimAviso: dataFim,
    tipo: params.tipo,
    diasTrabalhadosMes,
    periodosVencidosOverride: saldoVencCreate.periodosVencidos,
    diasVencidosOverride: saldoVencCreate.diasVencidos,
  });

  const [result] = await db.insert(terminationNotices).values({
    descontarAvisoNaoCumprido: params.descontarAvisoNaoCumprido ? 1 : 0,
    companyId: params.companyId,
    employeeId: emp.id,
    tipo: params.tipo,
    dataInicio: dataInicioAviso,
    dataFim,
    diasAviso,
    anosServico,
    reducaoJornada: params.reducaoJornada ?? 'nenhuma',
    salarioBase: salarioBase.toFixed(2),
    previsaoRescisao: JSON.stringify(previsao),
    previsaoRescisaoComplementar: previsaoComplementarCreate ? JSON.stringify(previsaoComplementarCreate) : null,
    valorEstimadoTotal: previsao.total,
    // Justa causa não tem período de aviso: nasce direto em "Aguardando Baixa".
    status: params.tipo === 'justa_causa' ? 'aguardando_pagamento' : 'em_andamento',
    motivoLegal: params.motivoLegal || null,
    motivoDescricao: params.motivoDescricao || null,
    observacoes: params.observacoes || null,
    criadoPor: user.name ?? 'Sistema',
    criadoPorUserId: user.id ?? null,
  }).returning();

  // Auto-iniciar checklist de desligamento + status Aviso
  try {
    const existingChecklist = await db.select({ id: employeeTerminationChecklist.id })
      .from(employeeTerminationChecklist)
      .where(and(eq(employeeTerminationChecklist.companyId, params.companyId), eq(employeeTerminationChecklist.employeeId, emp.id)))
      .limit(1);
    if (existingChecklist.length === 0) {
      const defaultItems = [
        { item: "exame_demissional", label: "Exame Demissional", obrigatorio: 1 },
        { item: "devolucao_epis", label: "Devolução de EPIs", obrigatorio: 1 },
        { item: "devolucao_ferramentas", label: "Devolução de Ferramentas / Patrimônio", obrigatorio: 0 },
        { item: "acerto_ponto", label: "Acerto de Ponto / Banco de Horas", obrigatorio: 1 },
        { item: "trct", label: "Termo de Rescisão (TRCT)", obrigatorio: 1 },
        { item: "entrega_chaves_cracha", label: "Entrega de Chaves / Crachá", obrigatorio: 0 },
        { item: "quitacao_debitos", label: "Quitação de Débitos / Cobranças Pendentes", obrigatorio: 0 },
        { item: "documentacao_seguro", label: "Documentação do Seguro", obrigatorio: 0 },
      ];
      for (const it of defaultItems) {
        await db.insert(employeeTerminationChecklist).values({
          companyId: params.companyId,
          employeeId: emp.id,
          item: it.item,
          label: it.label,
          obrigatorio: it.obrigatorio,
          concluido: 0,
        });
      }
    }
    await db.update(employees).set({ status: 'Aviso' } as any)
      .where(eq(employees.id, emp.id));
  } catch (e) { console.error('[AvisoPrevio] Erro ao criar checklist:', e); }

  // Corrige automaticamente registros de ponto já lançados no período
  corrigirPontoFuncionario(params.companyId, emp.id).catch(() => {});

  // Rev. 4679 — poka-yoke: criou o aviso → documento de Aviso Prévio nasce
  // automaticamente no dossiê p/ colher o "CIENTE" (pad ou FCSign).
  (async () => {
    const { gerarRhDocumentoAutomatico, fmtDateBrDoc } = await import("./rhDocumentos");
    await gerarRhDocumentoAutomatico({
      companyId: params.companyId, employeeId: emp.id, tipo: "aviso_previo",
      refTitulo: fmtDateBrDoc(dataInicioAviso),
      extras: {
        modalidade: params.tipo.replace(/_/g, " ").toUpperCase(),
        dataAviso: fmtDateBrDoc(dataInicioAviso),
        dataDesligamento: fmtDateBrDoc(dataFim),
        diasAviso: String(diasAviso),
      },
      criadoPorId: user.id, criadoPorNome: user.name,
    });
  })().catch((e) => console.warn("[AvisoPrevioDocAuto]", e));

  return { success: true, id: result.id, diasAviso, dataFim, previsao };
}

export const avisoPrevioFeriasRouter = router({
  // ============================================================
  // AVISO PRÉVIO
  // ============================================================
  avisoPrevio: router({
    list: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), status: z.string().optional() }))
      .query(async ({ input, ctx }) => {
        // Rev. 2208 — sigilo Aviso Prévio: usuários sem o flag verStatusAviso
        // (e que não são Admin Master) recebem lista vazia. Cobre RaioXPage,
        // RaioXFuncionario (banner vermelho EM AVISO PRÉVIO), módulo /aviso-previo
        // e qualquer outro consumidor da procedure.
        const canSeeAviso = await userCanSeeAvisoStatus(ctx.user.id, ctx.user.role);
        if (!canSeeAviso) return [] as any[];
        const db = (await getDb())!;

        // Auto: when notice period ends, move to 'aguardando_pagamento' (NOT 'concluido').
        // 'concluido' is only set by explicit user action ("Dar Baixa") after payment review.
        // SKIP avisos that were manually reverted (revertidoManualmente = 1)
        const today = new Date().toISOString().split('T')[0];
        await db.update(terminationNotices)
          .set({ status: 'aguardando_pagamento', updatedAt: sql`NOW()` })
          .where(and(
            companyFilter(terminationNotices.companyId, input),
            eq(terminationNotices.status, 'em_andamento'),
            isNull(terminationNotices.deletedAt),
            sql`${terminationNotices.dataFim} IS NOT NULL AND ${terminationNotices.dataFim} < ${today}`,
            sql`(${terminationNotices.revertidoManualmente} = 0 OR ${terminationNotices.revertidoManualmente} IS NULL)`
          ));

        const conditions = [
          companyFilter(terminationNotices.companyId, input),
          isNull(terminationNotices.deletedAt),
        ];
        if (input.status) conditions.push(eq(terminationNotices.status, input.status as any));
        
        const rows = await db.select({
          id: terminationNotices.id,
          companyId: terminationNotices.companyId,
          employeeId: terminationNotices.employeeId,
          tipo: terminationNotices.tipo,
          dataInicio: terminationNotices.dataInicio,
          dataFim: terminationNotices.dataFim,
          diasAviso: terminationNotices.diasAviso,
          anosServico: terminationNotices.anosServico,
          reducaoJornada: terminationNotices.reducaoJornada,
          salarioBase: terminationNotices.salarioBase,
          previsaoRescisao: terminationNotices.previsaoRescisao,
          valorEstimadoTotal: terminationNotices.valorEstimadoTotal,
          status: terminationNotices.status,
          dataConclusao: terminationNotices.dataConclusao,
          observacoes: terminationNotices.observacoes,
          criadoPor: terminationNotices.criadoPor,
          createdAt: terminationNotices.createdAt,
          fgtsReal: terminationNotices.fgtsReal,
          fgtsEditadoManualmente: terminationNotices.fgtsEditadoManualmente,
          fgtsEditadoEm: terminationNotices.fgtsEditadoEm,
          fgtsEditadoPor: terminationNotices.fgtsEditadoPor,
          descontosAcerto: terminationNotices.descontosAcerto,
          descontosAcertoDesc: terminationNotices.descontosAcertoDesc,
          acrescimosAcerto: terminationNotices.acrescimosAcerto,
          acrescimosAcertoDesc: terminationNotices.acrescimosAcertoDesc,
          novoEmpregoAtivo: terminationNotices.novoEmpregoAtivo,
          descontarAvisoNaoCumprido: terminationNotices.descontarAvisoNaoCumprido,
          novoEmpregoComunicadoEm: terminationNotices.novoEmpregoComunicadoEm,
          novoEmpregoCartaUrl: terminationNotices.novoEmpregoCartaUrl,
          avisoAssinadoUrl: terminationNotices.avisoAssinadoUrl,
          avisoAssinadoEnviadoEm: terminationNotices.avisoAssinadoEnviadoEm,
          enviadoFinanceiroEm: terminationNotices.enviadoFinanceiroEm,
          enviadoFinanceiroPor: terminationNotices.enviadoFinanceiroPor,
          financeiroEntryId: terminationNotices.financeiroEntryId,
          financeiroFgtsEntryId: terminationNotices.financeiroFgtsEntryId,
          baixaRescisaoValor: terminationNotices.baixaRescisaoValor,
          baixaRescisaoData: terminationNotices.baixaRescisaoData,
          baixaRescisaoPor: terminationNotices.baixaRescisaoPor,
          baixaRescisaoObs: terminationNotices.baixaRescisaoObs,
          baixaFgtsValor: terminationNotices.baixaFgtsValor,
          baixaFgtsData: terminationNotices.baixaFgtsData,
          baixaFgtsPor: terminationNotices.baixaFgtsPor,
          baixaFgtsObs: terminationNotices.baixaFgtsObs,
          baixaComplementarValor: terminationNotices.baixaComplementarValor,
          baixaComplementarData: terminationNotices.baixaComplementarData,
          baixaComplementarPor: terminationNotices.baixaComplementarPor,
          baixaComplementarObs: terminationNotices.baixaComplementarObs,
          previsaoDissidioComplementar: terminationNotices.previsaoDissidioComplementar,
          baixaDissidioValor: terminationNotices.baixaDissidioValor,
          baixaDissidioData: terminationNotices.baixaDissidioData,
          baixaDissidioPor: terminationNotices.baixaDissidioPor,
          baixaDissidioObs: terminationNotices.baixaDissidioObs,
          motivoCancelamento: terminationNotices.motivoCancelamento,
          canceladoPorNome: sql<string>`"termination_notices"."canceladoPorNome"`.as("canceladoPorNome"),
          canceladoPorId: sql<number>`"termination_notices"."canceladoPorId"`.as("canceladoPorId"),
          dataCancelamento: sql<string>`"termination_notices"."dataCancelamento"`.as("dataCancelamento"),
          employeeName: employees.nomeCompleto,
          employeeCpf: employees.cpf,
          employeeCargo: employees.cargo,
          employeeFotoUrl: employees.fotoUrl,
        })
        .from(terminationNotices)
        .leftJoin(employees, eq(terminationNotices.employeeId, employees.id))
        .where(and(...conditions))
        .orderBy(desc(terminationNotices.createdAt));
        
        // Batch: buscar todos os funcionários e contagens de férias de uma vez (evita N+1)
        const empIds = [...new Set(rows.map(r => r.employeeId))];
        const empMap = new Map<number, any>();
        if (empIds.length > 0) {
          const emps = await db.select().from(employees).where(inArray(employees.id, empIds));
          for (const e of emps) empMap.set(e.id, e);
        }

        // Batch: SALDO de férias vencidas (por DIA — reflete gozo parcial) por
        // (employeeId, dataFim). Busca TODAS as linhas dos funcionários de uma vez
        // e calcula o saldo em JS via a MESMA função usada nos demais caminhos
        // (`saldoDiasVencidoPeriodo`), evitando duplicar a regra em SQL.
        const vpDiasMap = new Map<string, number>();      // key → saldo de dias
        const vpPeriodosMap = new Map<string, number>();  // key → nº de períodos com saldo > 0
        if (empIds.length > 0) {
          try {
            const vpAll = ((await db.execute(sql`
              SELECT "employeeId", "periodoAquisitivoFim", "diasGozo", "abonoPecuniario",
                     status, "dataPagamento", "deletedAt"
              FROM vacation_periods
              WHERE "employeeId" IN (${sql.join(empIds.map(id => sql`${id}`), sql`, `)})
                AND "periodoAquisitivoFim" IS NOT NULL
                AND status != 'cancelada'
                AND "deletedAt" IS NULL
            `)) as any).rows || [];
            // Agrupa por employeeId p/ não varrer tudo a cada par
            const vpPorEmp = new Map<number, any[]>();
            for (const vp of vpAll) {
              const eid = Number(vpVal(vp, 'employeeId'));
              if (!vpPorEmp.has(eid)) vpPorEmp.set(eid, []);
              vpPorEmp.get(eid)!.push(vp);
            }
            for (const r of rows) {
              if (!r.dataFim) continue;
              const key = `${r.employeeId}|${r.dataFim}`;
              if (vpDiasMap.has(key)) continue;
              const corte = String(r.dataFim).slice(0, 10);
              let dias = 0, periodos = 0;
              for (const vp of (vpPorEmp.get(r.employeeId) || [])) {
                const s = saldoDiasVencidoPeriodo(vp, corte);
                if (s > 0) { dias += s; periodos += 1; }
              }
              vpDiasMap.set(key, dias);
              vpPeriodosMap.set(key, periodos);
            }
          } catch { /* fallback — uses stored value */ }
        }

        const multaMapList = await carregarMultaFgtsPorEmpresa(db, [...empMap.values()].map((e: any) => e.companyId));
        const results = [];
        for (const r of rows) {
          let valorRecalculado = r.valorEstimadoTotal;
          try {
            const emp = empMap.get(r.employeeId);
            if (emp && r.dataFim) {
              const dataAdmissao = emp.dataAdmissao || new Date().toISOString().split('T')[0];
              const salarioBase = parseBRL(emp.salarioBase);
              const dtFimAviso = new Date(r.dataFim + 'T00:00:00');
              const diasFeriasMesSaidaList = await diasFeriasNoMesDaSaida(db, r.employeeId, r.dataFim);
              const diasTrabalhadosMes = Math.max(0, dtFimAviso.getDate() - diasFeriasMesSaidaList);

              const vkey = `${r.employeeId}|${r.dataFim}`;
              const periodosVencidosRealList = vpPeriodosMap.has(vkey) ? vpPeriodosMap.get(vkey)! : undefined;
              const diasVencidosRealList = vpDiasMap.has(vkey) ? vpDiasMap.get(vkey)! : undefined;

              const saldoBhList = await getSaldoBancoHorasParaRescisao(db, r.employeeId);
              const previsao = calcularRescisaoCompleta({
                salarioBase,
                dataAdmissao,
                dataDesligamento: r.dataInicio,
                dataFimAviso: r.dataFim,
                saldoBancoHorasMinutos: saldoBhList,
                valorHoraBancoHoras: parseBRL(emp.valorHora),
                tipo: r.tipo,
                vrDiario: 0,
                diasTrabalhadosMes,
                periodosVencidosOverride: periodosVencidosRealList,
                diasVencidosOverride: diasVencidosRealList,
                descontarAvisoNaoCumprido: !!(r as any).descontarAvisoNaoCumprido,
                incluirMultaFgts: multaMapList.get(Number(emp.companyId)) ?? true,
              });
              valorRecalculado = previsao.total;
            }
          } catch (e) {
            // Se falhar o recálculo, mantém o valor armazenado
          }
          let dataLimitePagamento: string | null = null;
          let dataDiaTrabalhado: string | null = null;
          if (r.dataFim) {
            const dtFim = new Date(r.dataFim + 'T00:00:00');
            dtFim.setDate(dtFim.getDate() + 10);
            dataLimitePagamento = dtFim.toISOString().split('T')[0];
          }
          if (r.dataInicio) {
            const dtInicio = new Date(r.dataInicio + 'T00:00:00');
            dtInicio.setDate(dtInicio.getDate() - 1);
            dataDiaTrabalhado = dtInicio.toISOString().split('T')[0];
          }
          results.push({
            ...r,
            valorEstimadoTotal: valorRecalculado,
            dataLimitePagamento,
            dataDiaTrabalhado,
            employeeName: r.employeeName || 'Funcionário excluído',
            employeeCpf: r.employeeCpf || '-',
            employeeCargo: r.employeeCargo || '-',
            employeeFotoUrl: r.employeeFotoUrl || null,
          });
        }
        return results;
      }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const [row] = await db.select()
          .from(terminationNotices)
          .where(eq(terminationNotices.id, input.id));
        if (!row) return null;
        
        // Recalcular previsão em tempo real (não usar JSON armazenado que pode estar desatualizado)
        try {
          const [emp] = await db.select().from(employees).where(eq(employees.id, row.employeeId));
          if (emp) {
            const dataAdmissao = emp.dataAdmissao || new Date().toISOString().split('T')[0];
            const salarioBase = parseBRL(emp.salarioBase);
            const dataFim = row.dataFim;
            
            const dtFimAviso = new Date(dataFim + 'T00:00:00');
            const diasFeriasMesSaidaById = await diasFeriasNoMesDaSaida(db, row.employeeId, dataFim);
            const diasTrabalhadosMes = Math.max(0, dtFimAviso.getDate() - diasFeriasMesSaidaById);
            
            let diasTrabMes = diasTrabalhadosMes;
            let dataFimParaCalculo = dataFim;

            // Súmula 276 TST: Novo emprego durante aviso prévio trabalhado
            // Recalcula saldo de salário até a data da comunicação
            if (row.novoEmpregoAtivo && row.novoEmpregoComunicadoEm) {
              const dtComun = new Date(row.novoEmpregoComunicadoEm + 'T00:00:00');
              const diasFeriasMesComun = await diasFeriasNoMesDaSaida(db, row.employeeId, row.novoEmpregoComunicadoEm);
              diasTrabMes = Math.max(0, dtComun.getDate() - diasFeriasMesComun); // dias no mês até a comunicação
              dataFimParaCalculo = row.novoEmpregoComunicadoEm;
            }

            // Saldo real de férias vencidas do banco (por DIA — reflete gozo parcial)
            const saldoVencById = await getFeriasVencidasSaldo(db, row.employeeId, dataFimParaCalculo);
            const periodosVencidosRealById = saldoVencById.periodosVencidos;

            const incluirMultaFgtsById = await getIncluirMultaFgts(db, emp.companyId);
            const saldoBhById = await getSaldoBancoHorasParaRescisao(db, row.employeeId);
            const previsao = calcularRescisaoCompleta({
              salarioBase,
              dataAdmissao,
              dataDesligamento: row.dataInicio,
              dataFimAviso: dataFimParaCalculo,
              saldoBancoHorasMinutos: saldoBhById,
              valorHoraBancoHoras: parseBRL(emp.valorHora),
              tipo: row.tipo,
              vrDiario: 0,
              diasTrabalhadosMes: diasTrabMes,
              periodosVencidosOverride: periodosVencidosRealById,
              diasVencidosOverride: saldoVencById.diasVencidos,
              mediaInsalubridade: parseFloat(String((row as any).mediaInsalubridade || '0').replace(',', '.')) || 0,
              mediaHorasExtras: parseFloat(String((row as any).mediaHorasExtras || '0').replace(',', '.')) || 0,
              descontarAvisoNaoCumprido: !!(row as any).descontarAvisoNaoCumprido,
              incluirMultaFgts: incluirMultaFgtsById,
            });

            // Súmula 276: zerar aviso prévio indenizado e recalcular data limite
            if (row.novoEmpregoAtivo && row.novoEmpregoComunicadoEm) {
              const multaSalario = parseFloat(previsao.salarioDia) * parseFloat(previsao.diasExtrasAviso.toString());
              previsao.avisoPrevioIndenizado = '0.00';
              const totalSemAviso = parseFloat(previsao.total) - multaSalario;
              previsao.total = Math.max(0, totalSemAviso).toFixed(2);
              // Data limite = comunicação + 10 dias corridos (Art. 477 §6º CLT)
              const dtLimite = new Date(row.novoEmpregoComunicadoEm + 'T00:00:00');
              dtLimite.setDate(dtLimite.getDate() + 10);
              previsao.dataLimitePagamento = dtLimite.toISOString().split('T')[0];
              previsao.novoEmpregoAplicado = true;
            }

            // FGTS Real: recalcular multa 40% com saldo real informado
            let fgtsRealValor: number | null = null;
            if (row.fgtsReal) {
              fgtsRealValor = parseFloat(row.fgtsReal.replace(',', '.'));
              if (incluirMultaFgtsById && !isNaN(fgtsRealValor) && (row.tipo.includes('empregador') || row.tipo === 'rescisao_indireta' || row.tipo === 'acordo_mutuo')) {
                // Acordo mútuo (Art. 484-A §1º): metade da multa → 20%.
                const multaReal = fgtsRealValor * (row.tipo === 'acordo_mutuo' ? 0.2 : 0.4);
                const multaAntiga = parseFloat(previsao.multaFGTS);
                previsao.multaFGTS = multaReal.toFixed(2);
                previsao.fgtsRealUsado = fgtsRealValor.toFixed(2);
                // Ajustar total: remover multa estimada e adicionar multa real
                previsao.total = (parseFloat(previsao.total) - multaAntiga + multaReal).toFixed(2);
              }
            }

            // Descontos legais e da folha (INSS, IRRF, pensão, sindical, faltas, convênios, EPIs, vales, outros)
            const mesRescisaoView = (dataFimParaCalculo || row.dataFim || '').substring(0, 7);
            let descontosLegaisView: DescontosRescisaoResult | null = null;
            try {
              const descontosCtx = await buildDescontosContextRescisao(db, emp, mesRescisaoView);
              descontosLegaisView = calcularDescontosRescisao(previsao, descontosCtx);
            } catch (e) { /* fallback: previsão sem bloco de descontos */ }

            // Rescisão complementar (uso interno) — só para quem tem complemento.
            const previsaoComplementarById = buildPrevisaoComplementar(emp, {
              dataAdmissao,
              dataDesligamento: row.dataInicio,
              dataFimAviso: dataFimParaCalculo,
              tipo: row.tipo,
              diasTrabalhadosMes: diasTrabMes,
              periodosVencidosOverride: periodosVencidosRealById,
              diasVencidosOverride: saldoVencById.diasVencidos,
            });

            // Retornar com previsão recalculada (incluir dataAdmissao para cálculo de tempo de serviço no frontend)
            return {
              ...row,
              employeeName: emp.nomeCompleto || 'Funcionário',
              employeeCpf: emp.cpf || '-',
              employeeCargo: emp.cargo || emp.funcao || '-',
              // Rev.1804: campos extras para gerar Documento de Aviso a partir do detalhe (após salvar)
              employeeCtps: emp.ctps || '',
              employeeSerieCtps: emp.serieCtps || '',
              employeeDataAdmissao: emp.dataAdmissao || '',
              // Rev. 2725 — O "TOTAL ESTIMADO DA RESCISÃO" deve refletir a previsão
              // RECALCULADA ao vivo (igual ao SUBTOTAL PROVENTOS e ao endpoint `list`),
              // e NÃO a coluna persistida `row.valorEstimadoTotal`, que fica defasada
              // quando salário/férias mudam depois da criação do aviso.
              valorEstimadoTotal: previsao.total,
              previsaoRescisao: JSON.stringify({ ...previsao, ...(descontosLegaisView || {}), dataAdmissao }),
              previsaoRescisaoComplementar: previsaoComplementarById ? JSON.stringify(previsaoComplementarById) : null,
            };
          }
        } catch (e) {
          // Se falhar o recálculo, retorna o valor armazenado
          console.error('Erro ao recalcular previsão:', e);
        }
        
        // Fallback: buscar dados do funcionário mesmo sem recálculo
        try {
          const [emp2] = await db.select().from(employees).where(eq(employees.id, row.employeeId));
          if (emp2) {
            return {
              ...row,
              employeeName: emp2.nomeCompleto || 'Funcionário',
              employeeCpf: emp2.cpf || '-',
              employeeCargo: emp2.cargo || emp2.funcao || '-',
            };
          }
        } catch {}
        return { ...row, employeeName: 'Funcionário excluído', employeeCpf: '-', employeeCargo: '-' };
      }),

    /** Calcular previsão de rescisão - CLT completa com descontos */
    calcular: protectedProcedure
      .input(z.object({
        employeeId: z.number(),
        tipo: z.string(),
        dataDesligamento: z.string(), // último dia trabalhado (obrigatório)
        diasTrabalhadosOverride: z.number().optional(),
        descontarAvisoNaoCumprido: z.boolean().optional(),
      }))
      .query(async ({ input, ctx }) => {
        const db = (await getDb())!;
        const [emp] = await db.select().from(employees).where(eq(employees.id, input.employeeId));
        if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Funcionário não encontrado" });

        // Guard de tenant: o usuário precisa ter acesso à empresa do funcionário
        // (admin/admin_master = global). Evita leitura cross-tenant via employeeId.
        const empresasUsuario = await getCompaniesForUser(ctx.user.id, ctx.user.role);
        if (emp.companyId != null && !empresasUsuario.some(c => c.id === emp.companyId)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a este funcionário" });
        }
        
        const dataAdmissao = emp.dataAdmissao || new Date().toISOString().split("T")[0];
        const dataDesligamento = input.dataDesligamento;
        const salarioBase = parseBRL(emp.salarioBase);
        const anosServico = calcularAnosServico(dataAdmissao, dataDesligamento);
        const diasAviso = calcularDiasAviso(anosServico, input.tipo);
        const diasExtras = calcularDiasExtrasAviso(anosServico);
        
        // Empregado indenizado = não cumpre aviso, sai no dia do pedido.
        // Rev. 4686 — justa causa também é saída imediata (sem aviso).
        const isEmpregadoIndenizado = input.tipo === 'empregado_indenizado' || input.tipo === 'justa_causa';
        const dataInicioAviso = calcularDataInicioAviso(dataDesligamento);
        const dataFimAviso = isEmpregadoIndenizado
          ? dataDesligamento
          : calcularDataFim(dataInicioAviso, diasAviso);
        
        // Dias trabalhados no mês da SAÍDA (desconta dias em férias dentro do mês)
        const dtFimAviso = new Date(dataFimAviso + 'T00:00:00');
        const diasFeriasMesSaida = await diasFeriasNoMesDaSaida(db, emp.id, dataFimAviso);
        const diasTrabalhadosMes = input.diasTrabalhadosOverride ?? Math.max(0, dtFimAviso.getDate() - diasFeriasMesSaida);
        
        // ============================================================
        // VR: buscar da config de benefícios da obra do funcionário
        // ============================================================
        let vrDiario = 0;
        let vrConfigNome = '';
        let vrExtra: any = {};
        // Buscar obra via alocação ativa (fora do try para uso posterior)
        const [empObraAloc] = await db.select({ obraId: obraFuncionarios.obraId }).from(obraFuncionarios).where(and(eq(obraFuncionarios.employeeId, emp.id), eq(obraFuncionarios.isActive, 1)));
        try {
          const obraId = empObraAloc?.obraId || null;
          // Rev. 3985 — resolve a config VIGENTE na data de fim do aviso (última data com direito a VR)
          const cfg = await resolveMealBenefitConfig(db, emp.companyId, obraId, dataFimAviso);
          if (cfg) {
            const cafe = parseBRL(cfg.cafeManhaDia);
            const lanche = parseBRL(cfg.lancheTardeDia);
            const vaMes = parseBRL(cfg.valeAlimentacaoMes);
            const diasUteis = cfg.diasUteisRef || 22;
            const cafeAtivo = cfg.cafeAtivo === 1 || cfg.cafeAtivo === true;
            const lancheAtivo = cfg.lancheAtivo === 1 || cfg.lancheAtivo === true;
            // Total VA iFood MENSAL = café(dia × diasUteis) + lanche(dia × diasUteis) + VA mensal
            // Cada item só entra se estiver ativo na config
            const totalVAMensal = (cafeAtivo ? cafe * diasUteis : 0) + (lancheAtivo ? lanche * diasUteis : 0) + vaMes;
            // VR proporcional na rescisão = totalMensal / 30 (divisor CLT) × dias trabalhados
            const DIVISOR_CLT_VR = 30;
            vrDiario = totalVAMensal / DIVISOR_CLT_VR; // usar divisor CLT padrão (30 dias)
            vrConfigNome = cfg.nome || 'Padrão';
            // Guardar info extra para exibição
            vrExtra = { totalVAMensal, cafeAtivo, lancheAtivo, cafeDia: cafe, lancheDia: lanche, vaMes, diasUteis };
          }
        } catch { vrDiario = 0; }
        
        // ============================================================
        // DESCONTOS: buscar pendências do funcionário
        // ============================================================
        const descontos: Array<{ descricao: string; valor: number; tipo: string; referencia?: string }> = [];
        
        // 1. Adiantamentos pendentes (aprovados mas não descontados)
        try {
          const advRows = ((await db.execute(
            sql`SELECT mesReferencia, valorAdiantamento FROM advances WHERE employeeId = ${input.employeeId} AND companyId = ${emp.companyId} AND aprovado = 'Aprovado' ORDER BY mesReferencia DESC`
          )) as any).rows || [];
          // Considerar o último adiantamento como pendente de desconto na rescisão
          if (advRows && advRows.length > 0) {
            const lastAdv = advRows[0];
            const val = parseBRL(lastAdv.valorAdiantamento);
            if (val > 0) {
              descontos.push({
                descricao: `Adiantamento (${lastAdv.mesReferencia})`,
                valor: val,
                tipo: 'adiantamento',
                referencia: lastAdv.mesReferencia,
              });
            }
          }
        } catch {}
        
        // 2. EPIs com desconto pendente
        try {
          const epiRows = ((await db.execute(
            sql`SELECT descricao, valorDesconto, createdAt FROM epi_discount_alerts WHERE employeeId = ${input.employeeId} AND companyId = ${emp.companyId} AND status = 'pendente' ORDER BY createdAt DESC`
          )) as any).rows || [];
          if (epiRows) {
            for (const epi of epiRows) {
              const val = parseBRL(epi.valorDesconto);
              if (val > 0) {
                descontos.push({
                  descricao: `EPI: ${epi.descricao || 'Desconto EPI'}`,
                  valor: val,
                  tipo: 'epi',
                });
              }
            }
          }
        } catch {}
        
        // 3. Descontos do ponto do mês atual (não fechados/abonados)
        try {
          const mesRef = dataDesligamento.substring(0, 7); // YYYY-MM
          const pontoRows = ((await db.execute(
            sql`SELECT tipo, valorTotal FROM ponto_descontos WHERE employeeId = ${input.employeeId} AND companyId = ${emp.companyId} AND mesReferencia = ${mesRef} AND status IN ('calculado','revisado') ORDER BY data ASC`
          )) as any).rows || [];
          if (pontoRows) {
            let totalPonto = 0;
            for (const p of pontoRows) {
              totalPonto += parseBRL(p.valorTotal);
            }
            if (totalPonto > 0) {
              descontos.push({
                descricao: `Descontos do Ponto (${mesRef})`,
                valor: totalPonto,
                tipo: 'ponto',
                referencia: mesRef,
              });
            }
          }
        } catch {}
        
        const totalDescontos = descontos.reduce((s, d) => s + d.valor, 0);

        // ============================================================
        // CONTAGEM REAL DE FÉRIAS VENCIDAS (banco de dados)
        // Considera apenas períodos NÃO concluídos/cancelados/em gozo
        // ============================================================
        // Rev. 2205 — trazemos as datas pra mostrar QUANDO cada período venceu
        // (Lilian: "coloca um campo de quando venceu as ferias para saber"). O
        // `periodoConcessivoFim` é a data LIMITE pro empregador conceder o gozo
        // (Art. 134 CLT). Agora o saldo é por DIA (reflete gozo parcial) e os
        // detalhes carregam `saldoDias` de cada período.
        const saldoVencSim = await getFeriasVencidasSaldo(db, input.employeeId, dataFimAviso);
        const periodosVencidosReal = saldoVencSim.periodosVencidos;
        const periodosVencidosDetalhes = saldoVencSim.detalhes;

        // ============================================================
        // CÁLCULO DAS VERBAS RESCISÓRIAS
        // ============================================================
        const incluirMultaFgtsGerar = await getIncluirMultaFgts(db, emp.companyId);
        const saldoBhGerar = await getSaldoBancoHorasParaRescisao(db, input.employeeId);
        const previsao = calcularRescisaoCompleta({
          salarioBase,
          dataAdmissao,
          dataDesligamento,
          dataFimAviso,
          saldoBancoHorasMinutos: saldoBhGerar,
          valorHoraBancoHoras: parseBRL(emp.valorHora),
          tipo: input.tipo,
          vrDiario,
          diasTrabalhadosMes,
          periodosVencidosOverride: periodosVencidosReal,
          diasVencidosOverride: saldoVencSim.diasVencidos,
          descontarAvisoNaoCumprido: input.descontarAvisoNaoCumprido,
          incluirMultaFgts: incluirMultaFgtsGerar,
        });

        // Descontos legais e da folha (INSS, IRRF, pensão, sindical, faltas, convênios, EPIs, vales, outros)
        const mesRescisao = dataFimAviso.substring(0, 7);
        const descontosCtx = await buildDescontosContextRescisao(db, emp, mesRescisao);
        const descontosLegais = calcularDescontosRescisao(previsao, descontosCtx);
        const previsaoComDescontos = { ...previsao, ...descontosLegais };

        // Total líquido inclui descontos legais + descontos avulsos legados
        const totalDescontosLegais = parseFloat(descontosLegais.totalDescontos);
        const totalLiquido = parseFloat(descontosLegais.totalLiquido) - totalDescontos;
        
        // Rescisão complementar (uso interno) — só para quem tem complemento.
        const previsaoComplementarSim = buildPrevisaoComplementar(emp, {
          dataAdmissao,
          dataDesligamento,
          dataFimAviso,
          tipo: input.tipo,
          diasTrabalhadosMes,
          periodosVencidosOverride: periodosVencidosReal,
          diasVencidosOverride: saldoVencSim.diasVencidos,
        });

        // ============================================================
        // INDENIZAÇÃO DE ESTABILIDADE — CIPEIRO (Súmula 396 TST)
        // Quando o colaborador é membro da CIPA com estabilidade provisória e
        // a dispensa é do EMPREGADOR (sem justa causa), calcula o custo da
        // indenização do período de estabilidade restante (salários + 13º +
        // férias+1/3 + FGTS) de forma SEPARADA, só para análise gerencial.
        // ============================================================
        let indenizacaoEstabilidade: any = null;
        try {
          const hoje = new Date().toISOString().split("T")[0];
          const cipaRows = await db.select({
            cargoCipa: cipaMembers.cargoCipa,
            representacao: cipaMembers.representacao,
            fimEstabilidade: cipaMembers.fimEstabilidade,
            mandatoInicio: cipaElections.mandatoInicio,
            mandatoFim: cipaElections.mandatoFim,
          })
            .from(cipaMembers)
            .innerJoin(cipaElections, eq(cipaMembers.electionId, cipaElections.id))
            .where(and(
              eq(cipaMembers.employeeId, input.employeeId),
              sql`${cipaMembers.statusMembro} != 'Encerrado'`,
              sql`${cipaElections.statusEleicao} != 'Encerrado'`,
            ));

          // Mandatos ativos (estabilidade ainda vigente hoje).
          const ativos = cipaRows
            .map(r => ({ ...r, fimEfetivo: r.fimEstabilidade || r.mandatoFim || null }))
            .filter(r => r.fimEfetivo && r.fimEfetivo >= hoje);

          // Dispensa SEM justa causa pelo EMPREGADOR → gera indenização.
          const dispensaEmpregador = input.tipo.includes('empregador');

          if (ativos.length > 0 && dispensaEmpregador) {
            // Pega a estabilidade que termina MAIS TARDE (cenário mais protetivo).
            const fimMaisLongo = ativos.reduce((max, r) =>
              (r.fimEfetivo! > max ? r.fimEfetivo! : max), ativos[0].fimEfetivo!);
            const membroFim = ativos.find(r => r.fimEfetivo === fimMaisLongo) || ativos[0];

            const calc = calcularIndenizacaoEstabilidade({
              salarioBase,
              dataDesligamento,
              fimEstabilidade: fimMaisLongo,
            });

            if (calc.aplicavel) {
              indenizacaoEstabilidade = {
                ...calc,
                cargoCipa: membroFim.cargoCipa,
                representacao: membroFim.representacao,
                mandatoInicio: membroFim.mandatoInicio,
                mandatoFim: membroFim.mandatoFim,
              };
            }
          }
        } catch { indenizacaoEstabilidade = null; }

        return {
          anosServico,
          diasAviso: isEmpregadoIndenizado ? 0 : diasAviso,
          diasExtras,
          salarioBase: salarioBase.toFixed(2),
          dataAdmissao,
          dataDesligamento,
          dataInicioAviso: isEmpregadoIndenizado ? dataDesligamento : calcularDataInicioAviso(dataDesligamento),
          dataFimAviso,
          dataFimEstimada: dataFimAviso,
          previsaoRescisao: previsaoComDescontos,
          previsaoRescisaoComplementar: previsaoComplementarSim,
          vrConfigNome,
          vrExtra,
          descontos: descontos.map(d => ({ ...d, valor: d.valor.toFixed(2) })),
          totalDescontos: totalDescontos.toFixed(2),
          totalDescontosLegais: totalDescontosLegais.toFixed(2),
          totalDescontosGeral: (totalDescontosLegais + totalDescontos).toFixed(2),
          totalLiquido: totalLiquido.toFixed(2),
          funcionario: {
            nome: emp.nomeCompleto,
            cargo: emp.cargo || (emp as any).funcao || '',
            cpf: emp.cpf,
            obraAtualId: empObraAloc?.obraId || null,
          },
          // Rev. 2205 — datas dos períodos vencidos pra exibir no preview
          periodosVencidosDetalhes,
          // Indenização de estabilidade (cipeiro — Súmula 396 TST); null quando não aplicável
          indenizacaoEstabilidade,
        };
      }),

    /** Comparativo de custos: Aviso Trabalhado vs Indenizado */
    comparativo: protectedProcedure
      .input(z.object({
        employeeId: z.number(),
        dataDesligamento: z.string(),
      }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const [emp] = await db.select().from(employees).where(eq(employees.id, input.employeeId));
        if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Funcionário não encontrado" });

        const dataAdmissao = emp.dataAdmissao || new Date().toISOString().split("T")[0];
        const salarioBase = parseBRL(emp.salarioBase);
        const anosServico = calcularAnosServico(dataAdmissao, input.dataDesligamento);

        // ============================================================
        // VR: buscar da config de benefícios da obra do funcionário
        // ============================================================
        let vrDiario = 0;
        try {
          // Buscar obra via alocação ativa
          const [empObraAloc] = await db.select({ obraId: obraFuncionarios.obraId }).from(obraFuncionarios).where(and(eq(obraFuncionarios.employeeId, emp.id), eq(obraFuncionarios.isActive, 1)));
          const obraId = empObraAloc?.obraId || null;
          // Rev. 3985 — resolve a config VIGENTE na data de desligamento informada
          const cfg = await resolveMealBenefitConfig(db, emp.companyId, obraId, input.dataDesligamento);
          if (cfg) {
            const cafe = parseBRL(cfg.cafeManhaDia);
            const lanche = parseBRL(cfg.lancheTardeDia);
            const vaMes = parseBRL(cfg.valeAlimentacaoMes);
            const diasUteis = cfg.diasUteisRef || 22;
            const cafeAtivo = cfg.cafeAtivo === 1 || cfg.cafeAtivo === true;
            const lancheAtivo = cfg.lancheAtivo === 1 || cfg.lancheAtivo === true;
            const totalVAMensal = (cafeAtivo ? cafe * diasUteis : 0) + (lancheAtivo ? lanche * diasUteis : 0) + vaMes;
            vrDiario = totalVAMensal / 30;
          }
        } catch { vrDiario = 0; }

        // ============================================================
        // DESCONTOS (compartilhados entre os dois cenários)
        // ============================================================
        const descontos: Array<{ descricao: string; valor: number; tipo: string }> = [];
        try {
          const advRows = ((await db.execute(
            sql`SELECT mesReferencia, valorAdiantamento FROM advances WHERE employeeId = ${input.employeeId} AND companyId = ${emp.companyId} AND aprovado = 'Aprovado' ORDER BY mesReferencia DESC`
          )) as any).rows || [];
          if (advRows && advRows.length > 0) {
            const val = parseBRL(advRows[0].valorAdiantamento);
            if (val > 0) descontos.push({ descricao: `Adiantamento (${advRows[0].mesReferencia})`, valor: val, tipo: 'adiantamento' });
          }
        } catch {}
        try {
          const epiRows = ((await db.execute(
            sql`SELECT descricao, valorDesconto FROM epi_discount_alerts WHERE employeeId = ${input.employeeId} AND companyId = ${emp.companyId} AND status = 'pendente'`
          )) as any).rows || [];
          if (epiRows) {
            for (const epi of epiRows) {
              const val = parseBRL(epi.valorDesconto);
              if (val > 0) descontos.push({ descricao: `EPI: ${epi.descricao || 'Desconto EPI'}`, valor: val, tipo: 'epi' });
            }
          }
        } catch {}
        const totalDescontos = descontos.reduce((s, d) => s + d.valor, 0);

        // ============================================================
        // CONTAGEM REAL DE FÉRIAS VENCIDAS (banco de dados)
        // Considera apenas períodos NÃO concluídos/cancelados/em gozo
        // ============================================================
        const saldoVencComp = await getFeriasVencidasSaldo(db, input.employeeId, input.dataDesligamento);
        const periodosVencidosRealComp = saldoVencComp.periodosVencidos;

        // ============================================================
        // CENÁRIO 1: AVISO TRABALHADO
        // ============================================================
        // Rev. 2423 — CUMPRIMENTO físico do aviso trabalhado = 30 dias FIXOS.
        // Os +3d/ano (Lei 12.506/2011) entram só como verba indenizatória
        // complementar — pagos via `calcularRescisaoCompleta` para tipo
        // 'empregador_trabalhado' (avisoIndenizado = salarioDia × diasExtras),
        // sem estender o prazo de cumprimento. Antes (Rev. 1943) usava
        // 30+3·ano também para cumprimento, gerando "36/60/90 dias trabalhados"
        // — incorreto na prática FC e em CLT Art. 487 caput + Art. 488.
        const diasAvisoTrab = 30;
        const dataInicioTrab = calcularDataInicioAviso(input.dataDesligamento);
        const dataFimTrab = calcularDataFim(dataInicioTrab, diasAvisoTrab);
        const dtFimTrab = new Date(dataFimTrab + 'T00:00:00');
        const diasFeriasMesTrab = await diasFeriasNoMesDaSaida(db, input.employeeId, dataFimTrab);
        const diasTrabMesTrab = Math.max(0, dtFimTrab.getDate() - diasFeriasMesTrab);

        const incluirMultaFgtsComp = await getIncluirMultaFgts(db, emp.companyId);
        const saldoBhComp = await getSaldoBancoHorasParaRescisao(db, input.employeeId);
        const prevTrab = calcularRescisaoCompleta({
          salarioBase, dataAdmissao, dataDesligamento: input.dataDesligamento,
          dataFimAviso: dataFimTrab, tipo: 'empregador_trabalhado',
          vrDiario, diasTrabalhadosMes: diasTrabMesTrab,
          periodosVencidosOverride: periodosVencidosRealComp,
          diasVencidosOverride: saldoVencComp.diasVencidos,
          incluirMultaFgts: incluirMultaFgtsComp,
          saldoBancoHorasMinutos: saldoBhComp,
          valorHoraBancoHoras: parseBRL(emp.valorHora),
        });
        const totalBrutoTrab = parseFloat(prevTrab.total);
        const totalLiquidoTrab = totalBrutoTrab - totalDescontos;

        // Custo total para empresa no trabalhado:
        // Verbas rescisórias + salário do período trabalhado (parcialmente no saldo)
        // + encargos patronais (INSS patronal ~28.8%, FGTS 8%) sobre o período.
        // Rev. 1943 — após aplicar Lei 12.506 nas DUAS modalidades, o trabalhado
        // cumpre 30+3·ano dias (não mais 30 fixos). Salário e encargos do período
        // são proporcionais: ex 10 anos = 60 dias = 2 salários cheios + 2× encargos.
        const fatorPeriodoTrab = diasAvisoTrab / 30;
        const custoSalarioTrab = salarioBase * fatorPeriodoTrab;
        const encargosPatronaisTrab = custoSalarioTrab * 0.368; // ~36.8% (INSS 28.8% + FGTS 8%)
        const custoTotalEmpresaTrab = totalBrutoTrab + encargosPatronaisTrab;

        // ============================================================
        // CENÁRIO 2: AVISO INDENIZADO
        // ============================================================
        const diasAvisoInd = calcularDiasAvisoTotal(anosServico);
        const dataInicioInd = calcularDataInicioAviso(input.dataDesligamento);
        const dataFimInd = calcularDataFim(dataInicioInd, diasAvisoInd);
        const dtFimInd = new Date(dataFimInd + 'T00:00:00');
        const diasFeriasMesInd = await diasFeriasNoMesDaSaida(db, input.employeeId, dataFimInd);
        const diasTrabMesInd = Math.max(0, dtFimInd.getDate() - diasFeriasMesInd);

        const prevInd = calcularRescisaoCompleta({
          salarioBase, dataAdmissao, dataDesligamento: input.dataDesligamento,
          dataFimAviso: dataFimInd, tipo: 'empregador_indenizado',
          vrDiario, diasTrabalhadosMes: diasTrabMesInd,
          periodosVencidosOverride: periodosVencidosRealComp,
          diasVencidosOverride: saldoVencComp.diasVencidos,
          incluirMultaFgts: incluirMultaFgtsComp,
          saldoBancoHorasMinutos: saldoBhComp,
          valorHoraBancoHoras: parseBRL(emp.valorHora),
        });
        const totalBrutoInd = parseFloat(prevInd.total);
        const totalLiquidoInd = totalBrutoInd - totalDescontos;

        // Custo total para empresa no indenizado:
        // Verbas rescisórias (já inclui aviso indenizado)
        // Não há encargos patronais sobre o período (funcionário não trabalha)
        const custoTotalEmpresaInd = totalBrutoInd;

        // ============================================================
        // DIFERENÇA E RECOMENDAÇÃO
        // ============================================================
        const diferencaBruta = totalBrutoInd - totalBrutoTrab;
        const diferencaCustoEmpresa = custoTotalEmpresaInd - custoTotalEmpresaTrab;
        const maisEconomico = custoTotalEmpresaInd <= custoTotalEmpresaTrab ? 'indenizado' : 'trabalhado';

        return {
          funcionario: {
            nome: emp.nomeCompleto,
            cargo: emp.cargo || (emp as any).funcao || '',
            cpf: emp.cpf,
            salarioBase: salarioBase.toFixed(2),
            dataAdmissao,
            anosServico,
            mesesServico: calcularMesesServico(dataAdmissao, input.dataDesligamento),
          },
          trabalhado: {
            tipo: 'empregador_trabalhado',
            diasAviso: diasAvisoTrab,
            diasExtras: calcularDiasExtrasAviso(anosServico),
            dataInicio: dataInicioTrab,
            dataFim: dataFimTrab,
            dataSaida: prevTrab.dataSaida,
            dataLimitePagamento: prevTrab.dataLimitePagamento,
            previsao: prevTrab,
            totalBruto: totalBrutoTrab.toFixed(2),
            totalLiquido: totalLiquidoTrab.toFixed(2),
            custoTotalEmpresa: custoTotalEmpresaTrab.toFixed(2),
            encargosPatronais: encargosPatronaisTrab.toFixed(2),
            observacao: `Funcionário cumpre 30 dias fixos (CLT Art. 487 caput + Art. 488). Os ${calcularDiasExtrasAviso(anosServico)} dias proporcionais (Lei 12.506/2011, ${anosServico} anos de casa) são pagos como aviso indenizado complementar na rescisão, sem estender o prazo de trabalho. Empresa arca com salário + encargos patronais (~36,8%) sobre os 30 dias trabalhados.`,
          },
          indenizado: {
            tipo: 'empregador_indenizado',
            diasAviso: diasAvisoInd,
            diasExtras: 0,
            dataInicio: dataInicioInd,
            dataFim: dataFimInd,
            dataSaida: prevInd.dataSaida,
            dataLimitePagamento: prevInd.dataLimitePagamento,
            previsao: prevInd,
            totalBruto: totalBrutoInd.toFixed(2),
            totalLiquido: totalLiquidoInd.toFixed(2),
            custoTotalEmpresa: custoTotalEmpresaInd.toFixed(2),
            encargosPatronais: '0.00',
            observacao: `Funcionário é dispensado imediatamente. Todo o período de aviso (${diasAvisoInd} dias) é pago como indenização. Sem encargos patronais sobre o período.`,
          },
          descontos: descontos.map(d => ({ ...d, valor: d.valor.toFixed(2) })),
          totalDescontos: totalDescontos.toFixed(2),
          analise: {
            diferencaBruta: diferencaBruta.toFixed(2),
            diferencaCustoEmpresa: diferencaCustoEmpresa.toFixed(2),
            maisEconomico,
            economiaEstimada: Math.abs(diferencaCustoEmpresa).toFixed(2),
            resumo: maisEconomico === 'indenizado'
              ? `O aviso INDENIZADO é mais econômico para a empresa, com economia estimada de R$ ${Math.abs(diferencaCustoEmpresa).toFixed(2)} considerando encargos patronais.`
              : `O aviso TRABALHADO é mais econômico para a empresa, com economia estimada de R$ ${Math.abs(diferencaCustoEmpresa).toFixed(2)}. Porém, considere que o funcionário permanece 30 dias na empresa.`,
          },
        };
      }),

    /** Buscar configuração de benefícios de alimentação (Rev. 3985 — vigente em `dataRef`, default hoje) */
    getMealBenefitConfig: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), obraId: z.number().optional(), dataRef: z.string().optional() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        try {
          const dataRef = input.dataRef || new Date().toISOString().split('T')[0];
          const cfg = await resolveMealBenefitConfig(db, input.companyId, input.obraId ?? null, dataRef);
          return cfg || null;
        } catch {
          return null;
        }
      }),

    /** Listar todas as configurações de benefícios de alimentação */
    listMealBenefitConfigs: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        try {
          // Rev. 3994 — expõe "vigenteAgora" (calculado no servidor, mesma regra do
          // resolveMealBenefitConfig) para a tela deixar claro qual config está
          // realmente valendo hoje quando há mais de uma no mesmo escopo (obra/padrão).
          const rows = ((await db.execute(
            sql`SELECT mbc.*, o.nome as "obraNome",
                  (mbc.ativo = 1
                    AND (mbc.vigencia_inicio IS NULL OR mbc.vigencia_inicio <= CURRENT_DATE)
                    AND (mbc.vigencia_fim IS NULL OR mbc.vigencia_fim >= CURRENT_DATE)) AS "vigenteAgora"
                FROM meal_benefit_configs mbc LEFT JOIN obras o ON mbc."obraId" = o.id
                WHERE mbc."companyId" IN (${sql.join(resolveCompanyIds(input).map(id => sql`${id}`), sql`,`)})
                ORDER BY mbc."obraId" IS NULL DESC, o.nome ASC, mbc.vigencia_inicio DESC NULLS LAST`
          )) as any).rows || [];
          return rows || [];
        } catch {
          return [];
        }
      }),

    /**
     * Criar/atualizar configuração de benefícios de alimentação.
     * Rev. 3985 — Vigência explícita (início/fim): ao CRIAR uma nova config
     * (sem `id`) para o mesmo escopo (companyId+obraId, incl. "Todas as Obras"),
     * qualquer config antiga em aberto (vigenciaFim NULL) desse escopo é
     * automaticamente ENCERRADA (vigenciaFim = novo início - 1 dia) — preserva
     * o histórico (nunca some, nunca ambíguo) em vez de simplesmente coexistir.
     * Edição por `id` NÃO dispara esse fechamento (é só correção da própria linha).
     */
    saveMealBenefitConfig: protectedProcedure
      .input(z.object({
        id: z.number().optional(),
        companyId: z.number(),
        obraId: z.number().nullable().optional(),
        nome: z.string(),
        cafeManhaDia: z.string(),
        lancheTardeDia: z.string(),
        valeAlimentacaoMes: z.string(),
        jantaDia: z.string(),
        totalVA_iFood: z.string(),
        diasUteisRef: z.number().default(22),
        cafeAtivo: z.boolean().default(true),
        lancheAtivo: z.boolean().default(true),
        jantaAtivo: z.boolean().default(false),
        descontoVaPercentual: z.string().default("0"),
        cafeTotalMes: z.string().optional(),
        lancheTotalMes: z.string().optional(),
        jantaTotalMes: z.string().optional(),
        vaTotalMes: z.string().optional(),
        observacoes: z.string().optional(),
        vigenciaInicio: z.string().optional(),
        vigenciaFim: z.string().optional(),
        limparVigenciaFim: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        const cafeAtivoInt = input.cafeAtivo ? 1 : 0;
        const lancheAtivoInt = input.lancheAtivo ? 1 : 0;
        const jantaAtivoInt = input.jantaAtivo ? 1 : 0;
        if (input.id) {
          // Rev. 3994 — BUGFIX: antes, editar (id presente) SEMPRE gravava
          // vigencia_fim = NULL quando o front não mandava o campo (que nunca
          // mandava, pois a tela não tinha esses inputs) — isso REABRIA
          // silenciosamente qualquer config já encerrada, recriando a
          // ambiguidade de 2 configs "vigentes" no mesmo escopo. Agora só
          // altera vigencia_fim quando explicitamente enviado (ou limpo via
          // `limparVigenciaFim: true`); caso contrário preserva o valor atual.
          await db.execute(
            sql`UPDATE meal_benefit_configs SET 
              nome = ${input.nome},
              "obraId" = ${input.obraId ?? null},
              "cafeManhaDia" = ${input.cafeManhaDia},
              "lancheTardeDia" = ${input.lancheTardeDia},
              "valeAlimentacaoMes" = ${input.valeAlimentacaoMes},
              "jantaDia" = ${input.jantaDia},
              "totalVA_iFood" = ${input.totalVA_iFood},
              "diasUteisRef" = ${input.diasUteisRef},
              "cafeAtivo" = ${cafeAtivoInt},
              "lancheAtivo" = ${lancheAtivoInt},
              "jantaAtivo" = ${jantaAtivoInt},
              "descontoVaPercentual" = ${input.descontoVaPercentual || '0'},
              cafe_total_mes = ${input.cafeTotalMes || '0'},
              lanche_total_mes = ${input.lancheTotalMes || '0'},
              janta_total_mes = ${input.jantaTotalMes || '0'},
              va_total_mes = ${input.vaTotalMes || '0'},
              observacoes = ${input.observacoes || null},
              vigencia_inicio = COALESCE(${input.vigenciaInicio ?? null}::date, vigencia_inicio),
              vigencia_fim = CASE WHEN ${input.limparVigenciaFim === true} THEN NULL ELSE COALESCE(${input.vigenciaFim ?? null}::date, vigencia_fim) END
            WHERE id = ${input.id}`
          );
          return { success: true, id: input.id };
        } else {
          const novaVigenciaInicio = input.vigenciaInicio || new Date().toISOString().split('T')[0];
          // Encerra qualquer config em aberto do MESMO escopo (empresa+obra) na véspera
          // do início da nova — preserva histórico em vez de deixar duas "ativas" juntas.
          try {
            const obraCond = input.obraId != null ? sql`"obraId" = ${input.obraId}` : sql`"obraId" IS NULL`;
            await db.execute(sql`
              UPDATE meal_benefit_configs
              SET vigencia_fim = (${novaVigenciaInicio}::date - INTERVAL '1 day')::date
              WHERE "companyId" = ${input.companyId} AND ${obraCond} AND ativo = 1
                AND vigencia_fim IS NULL
                AND (vigencia_inicio IS NULL OR vigencia_inicio < ${novaVigenciaInicio}::date)
            `);
          } catch (e) {
            console.error('[saveMealBenefitConfig] falha ao encerrar vigência anterior:', (e as any)?.message ?? e);
          }
          const result = ((await db.execute(
            sql`INSERT INTO meal_benefit_configs ("companyId", "obraId", nome, "cafeManhaDia", "lancheTardeDia", "valeAlimentacaoMes", "jantaDia", "totalVA_iFood", "diasUteisRef", "cafeAtivo", "lancheAtivo", "jantaAtivo", "descontoVaPercentual", cafe_total_mes, lanche_total_mes, janta_total_mes, va_total_mes, observacoes, vigencia_inicio, vigencia_fim)
            VALUES (${input.companyId}, ${input.obraId ?? null}, ${input.nome}, ${input.cafeManhaDia}, ${input.lancheTardeDia}, ${input.valeAlimentacaoMes}, ${input.jantaDia}, ${input.totalVA_iFood}, ${input.diasUteisRef}, ${cafeAtivoInt}, ${lancheAtivoInt}, ${jantaAtivoInt}, ${input.descontoVaPercentual || '0'}, ${input.cafeTotalMes || '0'}, ${input.lancheTotalMes || '0'}, ${input.jantaTotalMes || '0'}, ${input.vaTotalMes || '0'}, ${input.observacoes || null}, ${novaVigenciaInicio}::date, ${input.vigenciaFim ?? null}::date) RETURNING id`
          )) as any).rows || [];
          return { success: true, id: result[0]?.id };
        }
      }),

    /** Deletar configuração de benefícios de alimentação */
    deleteMealBenefitConfig: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        await db.execute(sql`DELETE FROM meal_benefit_configs WHERE id = ${input.id}`);
        return { success: true };
      }),

    /**
     * Rev. 3981 — Prévia do reajuste de benefícios (café/lanche/VA) pelo % do
     * Dissídio do ano informado (mesma data-base do reajuste salarial).
     * Não altera nada — só simula café/lanche/VA/janta com o novo valor
     * (arredondado a 2 casas) para o usuário conferir antes de aplicar.
     */
    previewReajusteBeneficios: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), ano: z.number() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const [dissidio] = await db.select().from(dissidios).where(and(
          companyFilter(dissidios.companyId, input),
          eq(dissidios.anoReferencia, input.ano),
        ));
        if (!dissidio) {
          return { dissidio: null, percentual: 0, configs: [] };
        }
        const percentual = parseFloat(dissidio.percentualReajuste) || 0;
        const rows = ((await db.execute(
          sql`SELECT mbc.*, o.nome as "obraNome" FROM meal_benefit_configs mbc LEFT JOIN obras o ON mbc."obraId" = o.id
              WHERE mbc."companyId" IN (${sql.join(resolveCompanyIds(input).map(id => sql`${id}`), sql`,`)}) AND mbc.ativo = 1
              ORDER BY mbc."obraId" IS NULL DESC, o.nome ASC`
        )) as any).rows || [];
        const aplicar = (v: any) => {
          const atual = parseBRL(v);
          const novo = atual * (1 + percentual / 100);
          return { atual: atual.toFixed(2).replace('.', ','), novo: novo.toFixed(2).replace('.', ',') };
        };
        const configs = rows.map((cfg: any) => ({
          id: cfg.id,
          nome: cfg.nome,
          obraId: cfg.obraId,
          obraNome: cfg.obraNome,
          cafeManhaDia: aplicar(cfg.cafeManhaDia),
          lancheTardeDia: aplicar(cfg.lancheTardeDia),
          valeAlimentacaoMes: aplicar(cfg.valeAlimentacaoMes),
          jantaDia: aplicar(cfg.jantaDia),
          jaReajustado: String(cfg.observacoes || '').includes(`[Reajuste dissídio ${input.ano}`),
        }));
        return {
          dissidio: { id: dissidio.id, anoReferencia: dissidio.anoReferencia, mesDataBase: dissidio.mesDataBase, status: dissidio.status, titulo: dissidio.titulo },
          percentual,
          configs,
        };
      }),

    /**
     * Rev. 3981 — Aplica o reajuste de benefícios (café/lanche/VA/janta) com o
     * % do Dissídio do ano informado, em todas as configurações ativas da(s)
     * empresa(s). Registra a marca "[Reajuste dissídio ANO: X%]" em
     * `observacoes` para rastreabilidade e para impedir duplo-reajuste
     * acidental (o preview sinaliza `jaReajustado`, mas a aplicação em si não
     * bloqueia — decisão fica com o usuário, igual ao dissídio salarial).
     *
     * Rev. 3985 — Deixou de fazer UPDATE in-place na config existente.
     * Agora ENCERRA a config vigente (vigenciaFim = véspera da data-base) e
     * INSERE uma NOVA linha com os valores reajustados e vigenciaInicio =
     * data-base do dissídio (1º do mês de `dissidio.mesDataBase`, default
     * maio). Isso preserva o histórico: quem consultar uma rescisão/período
     * anterior à data-base continua vendo os valores ANTIGOS corretos.
     */
    aplicarReajusteBeneficios: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), ano: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        const [dissidio] = await db.select().from(dissidios).where(and(
          companyFilter(dissidios.companyId, input),
          eq(dissidios.anoReferencia, input.ano),
        ));
        if (!dissidio) throw new TRPCError({ code: 'NOT_FOUND', message: `Nenhum dissídio cadastrado para o ano ${input.ano}` });
        const percentual = parseFloat(dissidio.percentualReajuste) || 0;
        if (percentual <= 0) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Percentual de reajuste do dissídio é inválido (0% ou negativo)' });

        const mesDataBase = Number((dissidio as any).mesDataBase) || 5; // maio, convenção do módulo
        const vigenciaInicioNova = `${input.ano}-${String(mesDataBase).padStart(2, '0')}-01`;

        const rows = ((await db.execute(
          sql`SELECT * FROM meal_benefit_configs WHERE "companyId" IN (${sql.join(resolveCompanyIds(input).map(id => sql`${id}`), sql`,`)}) AND ativo = 1
              AND (vigencia_fim IS NULL OR vigencia_fim >= ${vigenciaInicioNova}::date)`
        )) as any).rows || [];

        const dataHoje = new Date().toLocaleDateString('pt-BR');
        const nota = `[Reajuste dissídio ${input.ano}: +${percentual}% em ${dataHoje}]`;
        let atualizados = 0;
        for (const cfg of rows) {
          const dias = cfg.diasUteisRef || 22;
          const novoCafe = (parseBRL(cfg.cafeManhaDia) * (1 + percentual / 100)).toFixed(2).replace('.', ',');
          const novoLanche = (parseBRL(cfg.lancheTardeDia) * (1 + percentual / 100)).toFixed(2).replace('.', ',');
          const novoVa = (parseBRL(cfg.valeAlimentacaoMes) * (1 + percentual / 100)).toFixed(2).replace('.', ',');
          const novoJanta = (parseBRL(cfg.jantaDia) * (1 + percentual / 100)).toFixed(2).replace('.', ',');
          const totalVA = (parseFloat(novoCafe.replace(',', '.')) * dias) + (parseFloat(novoLanche.replace(',', '.')) * dias) + parseFloat(novoVa.replace(',', '.'));
          const novasObs = `${cfg.observacoes ? cfg.observacoes + ' ' : ''}${nota}`;

          // Encerra a config vigente na véspera da nova data-base (ZERO DELETE — só fecha o período).
          await db.execute(
            sql`UPDATE meal_benefit_configs SET vigencia_fim = (${vigenciaInicioNova}::date - INTERVAL '1 day')::date, "updatedAt" = now()
                WHERE id = ${cfg.id}`
          );
          // Cria a NOVA versão vigente a partir da data-base, com os valores reajustados.
          await db.execute(
            sql`INSERT INTO meal_benefit_configs ("companyId", "obraId", nome, "cafeManhaDia", "lancheTardeDia", "valeAlimentacaoMes", "jantaDia", "totalVA_iFood", "diasUteisRef", "cafeAtivo", "lancheAtivo", "jantaAtivo", "descontoVaPercentual", cafe_total_mes, lanche_total_mes, janta_total_mes, va_total_mes, observacoes, ativo, vigencia_inicio, vigencia_fim)
            VALUES (${cfg.companyId}, ${cfg.obraId ?? null}, ${cfg.nome}, ${novoCafe}, ${novoLanche}, ${novoVa}, ${novoJanta}, ${totalVA.toFixed(2).replace('.', ',')}, ${dias}, ${cfg.cafeAtivo}, ${cfg.lancheAtivo}, ${cfg.jantaAtivo}, ${cfg.descontoVaPercentual || '0'}, ${cfg.cafeTotalMes || '0'}, ${cfg.lancheTotalMes || '0'}, ${cfg.jantaTotalMes || '0'}, ${cfg.vaTotalMes || '0'}, ${novasObs}, 1, ${vigenciaInicioNova}::date, NULL)`
          );
          atualizados++;
        }

        try {
          await createAuditLog({
            userId: (ctx as any)?.user?.id,
            userName: (ctx as any)?.user?.name ?? 'Sistema',
            companyId: input.companyId,
            action: 'REAJUSTE_BENEFICIOS_ALIMENTACAO',
            module: 'vale_alimentacao',
            entityType: 'meal_benefit_configs',
            details: `Reajuste de ${percentual}% (Dissídio ${input.ano}) aplicado a ${atualizados} configuração(ões) de benefícios.`,
          });
        } catch { /* auditoria é best-effort */ }

        return { success: true, atualizados, percentual };
      }),

    create: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), employeeId: z.number(),
        tipo: z.enum(['empregador_trabalhado','empregador_indenizado','empregado_trabalhado','empregado_indenizado','justa_causa','rescisao_indireta','acordo_mutuo']),
        dataInicio: z.string(),
        dataDesligamento: z.string().optional(),
        reducaoJornada: z.enum(['2h_dia','7_dias_corridos','nenhuma']).default('nenhuma'),
        observacoes: z.string().optional(),
        vrDiario: z.number().optional(),
        diasTrabalhados: z.number().optional(),
        descontarAvisoNaoCumprido: z.boolean().optional(),
        motivoLegal: z.string().max(500).optional(),
        motivoDescricao: z.string().max(4000).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        const [emp] = await db.select().from(employees).where(eq(employees.id, input.employeeId));
        if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Funcionário não encontrado" });
        // Rev. 3961 — PJ e Sócios não têm vínculo CLT; rescisão não se aplica.
        const _tc = (emp.tipoContrato || "").trim();
        if (_tc === "PJ" || _tc.toLowerCase() === "socio" || _tc.toLowerCase() === "sócio") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Aviso prévio e rescisão CLT não se aplicam a contratos PJ ou Sócios." });
        }
        // Rev. 2960 — corpo extraído p/ `criarAvisoPrevioInterno` (reuso no lote).
        return criarAvisoPrevioInterno(db, emp, input, { id: ctx.user.id, name: ctx.user.name });
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        tipo: z.enum(['empregador_trabalhado','empregador_indenizado','empregado_trabalhado','empregado_indenizado','justa_causa','rescisao_indireta','acordo_mutuo']).optional(),
        dataInicio: z.string().optional(),
        dataDesligamento: z.string().optional(),
        reducaoJornada: z.enum(['2h_dia','7_dias_corridos','nenhuma']).optional(),
        status: z.enum(['em_andamento','concluido','cancelado','aguardando_pagamento']).optional(),
        dataConclusao: z.string().optional(),
        motivoCancelamento: z.string().optional(),
        novoStatusFuncionario: z.enum(['Ativo','Desligado']).optional(),
        observacoes: z.string().optional(),
        diasTrabalhados: z.number().optional(),
        recalcular: z.boolean().optional(),
        descontarAvisoNaoCumprido: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        const { id, recalcular, diasTrabalhados, dataDesligamento, novoStatusFuncionario, ...rest } = input;
        const updateData: any = {};
        Object.entries(rest).forEach(([k, v]) => { if (v !== undefined) updateData[k] = v; });

        if (input.status === "cancelado") {
          updateData.canceladoPorNome = ctx.user?.name ?? ctx.user?.email ?? "Sistema";
          updateData.canceladoPorId = ctx.user?.id ?? null;
          updateData.dataCancelamento = new Date().toISOString();

          const [aviso] = await db.select().from(terminationNotices).where(eq(terminationNotices.id, id));
          if (aviso) {
            const novoStatus = input.novoStatusFuncionario || 'Ativo';
            if (novoStatus === 'Desligado') {
              const pendentes = await db.select({ id: employeeTerminationChecklist.id })
                .from(employeeTerminationChecklist)
                .where(and(
                  eq(employeeTerminationChecklist.employeeId, aviso.employeeId),
                  eq(employeeTerminationChecklist.obrigatorio, 1),
                  eq(employeeTerminationChecklist.concluido, 0)
                ));
              if (pendentes.length > 0) {
                throw new TRPCError({ code: 'PRECONDITION_FAILED', message: `Não é possível desligar: ${pendentes.length} item(ns) obrigatório(s) pendente(s) no checklist de desligamento.` });
              }
            }
            await db.update(employees).set({ status: novoStatus } as any)
              .where(eq(employees.id, aviso.employeeId));
            if (novoStatus === 'Desligado') {
              try {
                await encerrarContratosPjDoFuncionario(
                  aviso.employeeId,
                  `Desligamento via cancelamento de aviso prévio #${id}`,
                  ctx.user?.name ?? 'Sistema',
                );
              } catch (e) { console.error('[avisoPrevio.update] Erro ao encerrar contratos PJ:', e); }
            }
          }
        }

        // Se recalcular=true, busca o aviso e o funcionário para recalcular tudo
        if (recalcular) {
          const [aviso] = await db.select().from(terminationNotices).where(eq(terminationNotices.id, id));
          if (!aviso) throw new TRPCError({ code: 'NOT_FOUND', message: 'Aviso prévio não encontrado' });
          const [emp] = await db.select().from(employees).where(eq(employees.id, aviso.employeeId));
          if (!emp) throw new TRPCError({ code: 'NOT_FOUND', message: 'Funcionário não encontrado' });

          const tipo = input.tipo || aviso.tipo;
          const isEmpInd = tipo === 'empregado_indenizado' || tipo === 'justa_causa';
          const dataDesligFinal = dataDesligamento || (input.dataInicio || aviso.dataInicio);
          const dataInicioFinal = isEmpInd
            ? dataDesligFinal
            : (input.dataInicio ? calcularDataInicioAviso(input.dataInicio) : aviso.dataInicio);
          const dataAdmissao = emp.dataAdmissao || new Date().toISOString().split('T')[0];
          const anosServico = calcularAnosServico(dataAdmissao, dataDesligFinal);
          const diasAviso = isEmpInd ? 0 : calcularDiasAviso(anosServico, tipo);
          const salarioBase = parseBRL(emp.salarioBase);
          const dataFim = isEmpInd ? dataDesligFinal : calcularDataFim(dataInicioFinal, diasAviso);
          const dtFimAviso = new Date(dataFim + 'T00:00:00');
          const diasFeriasMesSaidaUpd = await diasFeriasNoMesDaSaida(db, aviso.employeeId, dataFim);
          const diasTrabalhadosMes = diasTrabalhados ?? Math.max(0, dtFimAviso.getDate() - diasFeriasMesSaidaUpd);

          // Saldo real de férias vencidas do banco (por DIA — reflete gozo parcial)
          const saldoVencUpd = await getFeriasVencidasSaldo(db, aviso.employeeId, dataFim);
          const periodosVencidosRealUpd = saldoVencUpd.periodosVencidos;

          const descontarAvisoFlag = input.descontarAvisoNaoCumprido !== undefined
            ? input.descontarAvisoNaoCumprido
            : !!aviso.descontarAvisoNaoCumprido;
          const incluirMultaFgtsUpd = await getIncluirMultaFgts(db, emp.companyId);
          const saldoBhUpd = await getSaldoBancoHorasParaRescisao(db, aviso.employeeId);
          const previsao = calcularRescisaoCompleta({
            salarioBase,
            dataAdmissao,
            dataDesligamento: dataDesligFinal,
            dataFimAviso: dataFim, // TÉRMINO do aviso para férias, 13º, FGTS
            tipo,
            vrDiario: 0,
            diasTrabalhadosMes,
            periodosVencidosOverride: periodosVencidosRealUpd,
            diasVencidosOverride: saldoVencUpd.diasVencidos,
            descontarAvisoNaoCumprido: descontarAvisoFlag,
            saldoBancoHorasMinutos: saldoBhUpd,
            valorHoraBancoHoras: parseBRL(emp.valorHora),
            incluirMultaFgts: incluirMultaFgtsUpd,
          });

          // Rescisão complementar (uso interno) — só para quem tem complemento.
          const previsaoComplementarUpd = buildPrevisaoComplementar(emp, {
            dataAdmissao,
            dataDesligamento: dataDesligFinal,
            dataFimAviso: dataFim,
            tipo,
            diasTrabalhadosMes,
            periodosVencidosOverride: periodosVencidosRealUpd,
            diasVencidosOverride: saldoVencUpd.diasVencidos,
          });

          updateData.tipo = tipo;
          updateData.dataInicio = dataInicioFinal;
          updateData.dataFim = dataFim;
          updateData.diasAviso = diasAviso;
          updateData.anosServico = anosServico;
          updateData.salarioBase = salarioBase.toFixed(2);
          updateData.previsaoRescisao = JSON.stringify(previsao);
          updateData.previsaoRescisaoComplementar = previsaoComplementarUpd ? JSON.stringify(previsaoComplementarUpd) : null;
          updateData.valorEstimadoTotal = previsao.total;
          updateData.descontarAvisoNaoCumprido = descontarAvisoFlag ? 1 : 0;
        } else if (input.descontarAvisoNaoCumprido !== undefined) {
          updateData.descontarAvisoNaoCumprido = input.descontarAvisoNaoCumprido ? 1 : 0;
        }

        await db.update(terminationNotices).set(updateData).where(eq(terminationNotices.id, id));

        // Corrige ponto automaticamente se redução de jornada ou datas mudaram
        if (input.reducaoJornada || input.dataInicio || recalcular) {
          const [noticeFetch] = await db.select({ companyId: terminationNotices.companyId, employeeId: terminationNotices.employeeId })
            .from(terminationNotices).where(eq(terminationNotices.id, id));
          if (noticeFetch) corrigirPontoFuncionario(noticeFetch.companyId, noticeFetch.employeeId).catch(() => {});
        }
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        // Rev. 2201 — Antes do soft-delete, capturar employeeId p/ reverter status.
        // Quando o aviso foi criado (L1271) o status do funcionário virou 'Aviso';
        // ao excluir, precisamos voltar pra 'Ativo' — senão a ficha continua
        // mostrando o badge amarelo "Aviso Prévio" eternamente (bug reportado
        // por Lilian em 20/05/2026 — funcionário Robson).
        const [aviso] = await db.select({ employeeId: terminationNotices.employeeId })
          .from(terminationNotices)
          .where(and(eq(terminationNotices.id, input.id), isNull(terminationNotices.deletedAt)));
        await db.update(terminationNotices).set({
          deletedAt: sql`NOW()`,
          deletedBy: ctx.user.name ?? 'Sistema',
          deletedByUserId: ctx.user.id,
        } as any).where(eq(terminationNotices.id, input.id));
        // Reverter status APENAS se ainda for 'Aviso' (não sobrescrever
        // Desligado / Férias / Atestado etc. caso outra mutation tenha mudado).
        if (aviso?.employeeId) {
          await db.update(employees)
            .set({ status: 'Ativo' } as any)
            .where(and(eq(employees.id, aviso.employeeId), eq(employees.status, 'Aviso')));
        }
        return { success: true };
      }),

    /** Recalcular TODOS os avisos prévios em andamento de uma empresa */
    recalcularTodos: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        // Buscar todos os avisos em andamento da empresa
        const avisos = await db.select().from(terminationNotices)
          .where(and(
            companyFilter(terminationNotices.companyId, input),
            eq(terminationNotices.status, 'em_andamento'),
            isNull(terminationNotices.deletedAt),
          ));

        let recalculados = 0;
        let erros = 0;
        const multaMapRec = await carregarMultaFgtsPorEmpresa(db, avisos.map(a => a.companyId));
        for (const aviso of avisos) {
          try {
            const [emp] = await db.select().from(employees).where(eq(employees.id, aviso.employeeId));
            if (!emp) { erros++; continue; }

            const tipo = aviso.tipo;
            const isEmpIndRec = tipo === 'empregado_indenizado' || tipo === 'justa_causa';
            const dataDesligFinal = aviso.dataInicio;
            const dataInicioFinal = isEmpIndRec ? dataDesligFinal : aviso.dataInicio;
            const dataAdmissao = emp.dataAdmissao || new Date().toISOString().split('T')[0];
            const anosServico = calcularAnosServico(dataAdmissao, dataDesligFinal);
            const diasAviso = isEmpIndRec ? 0 : calcularDiasAviso(anosServico, tipo);
            const salarioBase = parseBRL(emp.salarioBase);
            const dataFim = isEmpIndRec ? dataDesligFinal : calcularDataFim(dataInicioFinal, diasAviso);

            const dtFimAviso = new Date(dataFim + 'T00:00:00');
            const diasFeriasMesRec = await diasFeriasNoMesDaSaida(db, aviso.employeeId, dataFim);
            const diasTrabalhadosMes = Math.max(0, dtFimAviso.getDate() - diasFeriasMesRec);

            // Saldo real de férias vencidas do banco (por DIA — reflete gozo parcial)
            const saldoVencRec = await getFeriasVencidasSaldo(db, aviso.employeeId, dataFim);
            const periodosVencidosRealRec = saldoVencRec.periodosVencidos;

            const saldoBhRec = await getSaldoBancoHorasParaRescisao(db, aviso.employeeId);
            const previsao = calcularRescisaoCompleta({
              salarioBase,
              dataAdmissao,
              dataDesligamento: dataDesligFinal,
              dataFimAviso: dataFim,
              tipo,
              vrDiario: 0,
              diasTrabalhadosMes,
              periodosVencidosOverride: periodosVencidosRealRec,
              diasVencidosOverride: saldoVencRec.diasVencidos,
              descontarAvisoNaoCumprido: !!(aviso as any).descontarAvisoNaoCumprido,
              incluirMultaFgts: multaMapRec.get(Number(aviso.companyId)) ?? true,
              saldoBancoHorasMinutos: saldoBhRec,
              valorHoraBancoHoras: parseBRL(emp.valorHora),
            });

            // Rescisão complementar (uso interno) — só para quem tem complemento.
            const previsaoComplementarRec = buildPrevisaoComplementar(emp, {
              dataAdmissao,
              dataDesligamento: dataDesligFinal,
              dataFimAviso: dataFim,
              tipo,
              diasTrabalhadosMes,
              periodosVencidosOverride: periodosVencidosRealRec,
              diasVencidosOverride: saldoVencRec.diasVencidos,
            });

            await db.update(terminationNotices).set({
              diasAviso,
              anosServico,
              salarioBase: salarioBase.toFixed(2),
              dataFim,
              previsaoRescisao: JSON.stringify(previsao),
              previsaoRescisaoComplementar: previsaoComplementarRec ? JSON.stringify(previsaoComplementarRec) : null,
              valorEstimadoTotal: previsao.total,
            }).where(eq(terminationNotices.id, aviso.id));

            recalculados++;
          } catch (e) {
            console.error(`Erro ao recalcular aviso ${aviso.id}:`, e);
            erros++;
          }
        }

        return { recalculados, erros, total: avisos.length };
      }),

    /** Dar baixa no aviso: confirma pagamento e marca como Concluído.
     *  Só pode ser feito pelo usuário após conferência de descontos. */
    darBaixa: protectedProcedure
      .input(z.object({
        id: z.number(),
        // Rev. 1639 — 'complementar' = baixa da rescisão complementar (uso interno).
        tipo: z.enum(['rescisao', 'fgts', 'complementar']),
        valor: z.string(),
        observacoes: z.string().optional(),
        desligarFuncionario: z.boolean().optional(),
        categoriaDesligamento: z.string().optional(),
        motivoDesligamento: z.string().optional(),
        incluirListaNegra: z.boolean().optional(),
        motivoListaNegra: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        const [aviso] = await db.select().from(terminationNotices).where(eq(terminationNotices.id, input.id));
        if (!aviso) throw new TRPCError({ code: 'NOT_FOUND', message: 'Aviso prévio não encontrado' });
        if (aviso.status !== 'aguardando_pagamento')
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Apenas avisos "Aguardando Pagamento" podem receber baixa' });

        if (input.tipo === 'rescisao' && (aviso as any).baixaRescisaoData)
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'A baixa da rescisão já foi registrada.' });
        if (input.tipo === 'fgts' && (aviso as any).baixaFgtsData)
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'A baixa do FGTS já foi registrada.' });
        if (input.tipo === 'complementar' && (aviso as any).baixaComplementarData)
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'A baixa da rescisão complementar já foi registrada.' });

        const isPedidoDemissao = aviso.tipo === 'empregado_trabalhado' || aviso.tipo === 'empregado_indenizado';
        // Rev. 4686 — justa causa não tem multa FGTS (depósitos ficam na conta);
        // a etapa "FGTS" da baixa não se aplica, como no pedido de demissão.
        const fgtsNaoAplica = isPedidoDemissao || aviso.tipo === 'justa_causa';
        if (input.tipo === 'fgts' && fgtsNaoAplica)
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Multa FGTS não se aplica a pedido de demissão.' });

        // Rev. 1719 — Complementar pode ser registrado SEMPRE (mesmo sem previsão pré-calculada).
        // Antes (Rev. 1639) só era permitido se previsaoRescisaoComplementar.total > 0,
        // mas pagamentos "por fora" não passam pelo cálculo prévio e ainda assim precisam
        // ser registrados. `temComplementar` (com previsão) segue sendo usado apenas para
        // gate de conclusão automática do processo (deveConcluir abaixo).
        let temComplementar = false;
        try {
          const pc = (aviso as any).previsaoRescisaoComplementar
            ? JSON.parse((aviso as any).previsaoRescisaoComplementar)
            : null;
          temComplementar = pc && parseFloat(String(pc.total ?? '0')) > 0;
        } catch { temComplementar = false; }

        const valorNum = parseFloat(input.valor);
        if (isNaN(valorNum) || valorNum < 0)
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Valor inválido. Informe um valor numérico positivo.' });

        if (input.desligarFuncionario) {
          if (!input.categoriaDesligamento?.trim())
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'A categoria do desligamento é obrigatória.' });
          if (input.incluirListaNegra && !input.motivoListaNegra?.trim())
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'O motivo da inclusão na blacklist é obrigatório.' });
        }

        // Rev. 1639 — Conclusão do processo agora considera as 3 baixas
        // (rescisão oficial, multa FGTS quando aplicável, e complementar
        // quando aplicável). A baixa atual é considerada como já feita.
        const rescisaoOk = input.tipo === 'rescisao' || !!(aviso as any).baixaRescisaoData;
        const fgtsOk     = fgtsNaoAplica || input.tipo === 'fgts' || !!(aviso as any).baixaFgtsData;
        const complOk    = !temComplementar || input.tipo === 'complementar' || !!(aviso as any).baixaComplementarData;
        const deveConcluir = rescisaoOk && fgtsOk && complOk;

        if (deveConcluir && input.desligarFuncionario && aviso.employeeId) {
          const checklistItems = await db.select().from(employeeTerminationChecklist)
            .where(and(eq(employeeTerminationChecklist.companyId, aviso.companyId), eq(employeeTerminationChecklist.employeeId, aviso.employeeId)));
          if (checklistItems.length > 0) {
            const pendentes = checklistItems.filter(i => i.obrigatorio === 1 && i.concluido === 0);
            if (pendentes.length > 0) {
              throw new TRPCError({ code: 'BAD_REQUEST', message: `Não é possível desligar: ${pendentes.length} item(ns) obrigatório(s) pendente(s) na checklist de desligamento: ${pendentes.map(p => p.label).join(', ')}` });
            }
          }
        }

        const hoje = new Date().toISOString().split('T')[0];
        const tipoLabel = input.tipo === 'rescisao'
          ? 'Rescisão'
          : input.tipo === 'fgts'
            ? 'Multa FGTS'
            : 'Rescisão Complementar';
        const obsAppend = input.observacoes
          ? `\n[Baixa ${tipoLabel} em ${hoje} por ${ctx.user.name}]: ${input.observacoes}`
          : '';
        const obsNovo = (aviso.observacoes || '') + obsAppend || null;

        const updateData: any = { observacoes: obsNovo, updatedAt: sql`NOW()` };
        if (input.tipo === 'rescisao') {
          updateData.baixaRescisaoValor = input.valor;
          updateData.baixaRescisaoData = hoje;
          updateData.baixaRescisaoPor = ctx.user.name ?? 'Sistema';
          updateData.baixaRescisaoObs = input.observacoes || null;
        } else if (input.tipo === 'fgts') {
          updateData.baixaFgtsValor = input.valor;
          updateData.baixaFgtsData = hoje;
          updateData.baixaFgtsPor = ctx.user.name ?? 'Sistema';
          updateData.baixaFgtsObs = input.observacoes || null;
        } else {
          updateData.baixaComplementarValor = input.valor;
          updateData.baixaComplementarData = hoje;
          updateData.baixaComplementarPor = ctx.user.name ?? 'Sistema';
          updateData.baixaComplementarObs = input.observacoes || null;
        }

        if (deveConcluir) {
          updateData.status = 'concluido';
          updateData.dataConclusao = hoje;
          updateData.dataBaixa = hoje;
        }

        await db.update(terminationNotices).set(updateData).where(eq(terminationNotices.id, input.id));

        let desligouFuncionario = false;
        if (deveConcluir && input.desligarFuncionario && aviso.employeeId) {
          const novoStatus = input.incluirListaNegra ? 'Lista_Negra' : 'Desligado';
          const empUpdate: any = {
            status: novoStatus,
            categoriaDesligamento: input.categoriaDesligamento,
            motivoDesligamento: input.motivoDesligamento || null,
            dataDesligamentoEfetiva: hoje,
            desligadoPor: ctx.user.name ?? 'Sistema',
            desligadoUserId: ctx.user.id,
          };
          if (input.incluirListaNegra) {
            empUpdate.listaNegra = 1;
            empUpdate.motivoListaNegra = input.motivoListaNegra;
            empUpdate.listaNegraPor = ctx.user.name ?? 'Sistema';
            empUpdate.listaNegraUserId = ctx.user.id;
            empUpdate.dataListaNegra = hoje;
          }
          const [empAntes] = await db.select({ status: employees.status, nomeCompleto: employees.nomeCompleto })
            .from(employees).where(eq(employees.id, aviso.employeeId));
          await db.update(employees).set(empUpdate).where(eq(employees.id, aviso.employeeId));
          await logStatusChange({
            db, companyId: aviso.companyId, employeeId: aviso.employeeId,
            nomeCompleto: empAntes?.nomeCompleto, statusAnterior: empAntes?.status || 'Desconhecido',
            statusNovo: novoStatus, alteradoPor: ctx.user.name ?? 'Sistema',
            alteradoPorUserId: ctx.user.id, motivo: input.motivoDesligamento || 'Baixa de aviso prévio',
            origemModulo: 'avisoPrevio.darBaixa',
          });

          try {
            const [aloc] = await db.select({ id: obraFuncionarios.id })
              .from(obraFuncionarios)
              .where(and(eq(obraFuncionarios.employeeId, aviso.employeeId), eq(obraFuncionarios.isActive, 1)));
            if (aloc) {
              await db.update(obraFuncionarios)
                .set({ isActive: 0, dataDesligamento: hoje } as any)
                .where(eq(obraFuncionarios.id, aloc.id));
            }
          } catch (e) { console.error('[darBaixa] Erro ao desalocar obra:', e); }

          try {
            await encerrarContratosPjDoFuncionario(
              aviso.employeeId,
              `Desligamento via aviso prévio #${input.id}`,
              ctx.user.name ?? 'Sistema',
            );
          } catch (e) { console.error('[darBaixa] Erro ao encerrar contratos PJ:', e); }

          desligouFuncionario = true;
          await createAuditLog({
            userId: ctx.user.id,
            userName: ctx.user.name ?? 'Sistema',
            action: 'DESLIGAR_FUNCIONARIO',
            module: 'aviso_previo',
            entityType: 'employee',
            entityId: aviso.employeeId,
            details: `Funcionário desligado via "Dar Baixa" do aviso prévio #${input.id}. Status: ${novoStatus}. Categoria: ${input.categoriaDesligamento}${input.incluirListaNegra ? '. Incluído na Blacklist.' : ''}`,
          });

          // Rev. 4479 — Verifica se o funcionário desligado era Gestor Financeiro ou Gestor RH.
          // Se sim, limpa o campo na empresa e auto-encerra substituições ativas para aquele gestor.
          try {
            const [co] = await db.select({
              id: companies.id,
              gestorFinanceiroId: companies.gestorFinanceiroId,
              gestorRhId: (companies as any).gestorRhId,
            }).from(companies).where(eq(companies.id, aviso.companyId)).limit(1);

            const papeis: string[] = [];
            if (co) {
              const upd: Record<string, any> = {};
              if (co.gestorFinanceiroId === aviso.employeeId) {
                upd.gestorFinanceiroId = null;
                upd.gestorFinanceiroNome = null;
                papeis.push("Gestor Financeiro");
              }
              if ((co as any).gestorRhId === aviso.employeeId) {
                upd.gestorRhId = null;
                upd.gestorRhNome = null;
                papeis.push("Gestor RH");
              }
              if (Object.keys(upd).length > 0) {
                await db.update(companies).set(upd).where(eq(companies.id, aviso.companyId));
                // Encerra substituições ativas para este gestor
                await db.update(gestorSubstituicaoSolicitacoes)
                  .set({ status: "encerrado" } as any)
                  .where(and(
                    eq(gestorSubstituicaoSolicitacoes.companyId, aviso.companyId),
                    eq(gestorSubstituicaoSolicitacoes.status, "aprovado"),
                    eq(gestorSubstituicaoSolicitacoes.gestorOriginalId, aviso.employeeId),
                  ));
                console.warn(`[darBaixa] Funcionário ${aviso.employeeId} desligado era ${papeis.join(" e ")}. Gestor removido da empresa ${aviso.companyId}.`);
              }
            }
          } catch (e) {
            console.error('[darBaixa] Erro ao verificar gestor de contrato:', e);
          }
        }

        await createAuditLog({
          userId: ctx.user.id,
          userName: ctx.user.name ?? 'Sistema',
          action: 'DAR_BAIXA_AVISO_PREVIO',
          module: 'aviso_previo',
          entityType: 'terminationNotices',
          entityId: input.id,
          details: `Baixa ${tipoLabel} (R$ ${input.valor}) por ${ctx.user.name} em ${hoje}.${deveConcluir ? ' Processo concluído.' : ' Aguardando baixa complementar.'}${desligouFuncionario ? ` Funcionário desligado.` : ''}`,
        });

        return { success: true, desligouFuncionario, concluido: deveConcluir };
      }),

    editarBaixa: protectedProcedure
      .input(z.object({
        id: z.number(),
        // Rev. 1639 — inclui 'complementar'.
        tipo: z.enum(['rescisao', 'fgts', 'complementar']),
        valor: z.string(),
        observacoes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master')
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas o ADM Master pode editar baixas.' });
        const valorNum = parseFloat(input.valor);
        if (isNaN(valorNum) || valorNum < 0)
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Valor inválido.' });
        const db = (await getDb())!;
        const [aviso] = await db.select().from(terminationNotices).where(eq(terminationNotices.id, input.id));
        if (!aviso) throw new TRPCError({ code: 'NOT_FOUND', message: 'Aviso prévio não encontrado' });
        if (input.tipo === 'rescisao' && !(aviso as any).baixaRescisaoData)
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Não há baixa de rescisão registrada para editar.' });
        if (input.tipo === 'fgts' && !(aviso as any).baixaFgtsData)
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Não há baixa de FGTS registrada para editar.' });
        if (input.tipo === 'complementar' && !(aviso as any).baixaComplementarData)
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Não há baixa da rescisão complementar registrada para editar.' });

        const hoje = new Date().toISOString().split('T')[0];
        const tipoLabel = input.tipo === 'rescisao'
          ? 'Rescisão'
          : input.tipo === 'fgts'
            ? 'Multa FGTS'
            : 'Rescisão Complementar';
        const updateData: any = { updatedAt: sql`NOW()` };
        const valorAnterior = input.tipo === 'rescisao'
          ? (aviso as any).baixaRescisaoValor
          : input.tipo === 'fgts'
            ? (aviso as any).baixaFgtsValor
            : (aviso as any).baixaComplementarValor;
        if (input.tipo === 'rescisao') {
          updateData.baixaRescisaoValor = input.valor;
          updateData.baixaRescisaoObs = input.observacoes || (aviso as any).baixaRescisaoObs;
        } else if (input.tipo === 'fgts') {
          updateData.baixaFgtsValor = input.valor;
          updateData.baixaFgtsObs = input.observacoes || (aviso as any).baixaFgtsObs;
        } else {
          updateData.baixaComplementarValor = input.valor;
          updateData.baixaComplementarObs = input.observacoes || (aviso as any).baixaComplementarObs;
        }
        const obsAppend = `\n[EDIÇÃO ${tipoLabel}] por ${ctx.user.name} em ${hoje}: R$ ${valorAnterior} → R$ ${input.valor}${input.observacoes ? '. Motivo: ' + input.observacoes : ''}`;
        updateData.observacoes = (aviso.observacoes || '') + obsAppend;

        await db.update(terminationNotices).set(updateData).where(eq(terminationNotices.id, input.id));
        await createAuditLog({
          userId: ctx.user.id,
          userName: ctx.user.name ?? 'Sistema',
          action: 'EDITAR_BAIXA_AVISO_PREVIO',
          module: 'aviso_previo',
          entityType: 'terminationNotices',
          entityId: input.id,
          details: `Baixa ${tipoLabel} editada: R$ ${valorAnterior} → R$ ${input.valor} por ${ctx.user.name}.${input.observacoes ? ' Motivo: ' + input.observacoes : ''}`,
        });
        return { success: true };
      }),

    estornarBaixa: protectedProcedure
      .input(z.object({
        id: z.number(),
        // Rev. 1639 — inclui 'complementar'.
        tipo: z.enum(['rescisao', 'fgts', 'complementar']),
        motivo: z.string().min(1, 'Motivo é obrigatório'),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master')
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas o ADM Master pode estornar baixas.' });
        const db = (await getDb())!;
        const [aviso] = await db.select().from(terminationNotices).where(eq(terminationNotices.id, input.id));
        if (!aviso) throw new TRPCError({ code: 'NOT_FOUND', message: 'Aviso prévio não encontrado' });
        if (input.tipo === 'rescisao' && !(aviso as any).baixaRescisaoData)
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Não há baixa de rescisão para estornar.' });
        if (input.tipo === 'fgts' && !(aviso as any).baixaFgtsData)
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Não há baixa de FGTS para estornar.' });
        if (input.tipo === 'complementar' && !(aviso as any).baixaComplementarData)
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Não há baixa da rescisão complementar para estornar.' });

        const hoje = new Date().toISOString().split('T')[0];
        const tipoLabel = input.tipo === 'rescisao'
          ? 'Rescisão'
          : input.tipo === 'fgts'
            ? 'Multa FGTS'
            : 'Rescisão Complementar';
        const valorEstornado = input.tipo === 'rescisao'
          ? (aviso as any).baixaRescisaoValor
          : input.tipo === 'fgts'
            ? (aviso as any).baixaFgtsValor
            : (aviso as any).baixaComplementarValor;

        const updateData: any = { updatedAt: sql`NOW()` };
        if (input.tipo === 'rescisao') {
          updateData.baixaRescisaoValor = null;
          updateData.baixaRescisaoData = null;
          updateData.baixaRescisaoPor = null;
          updateData.baixaRescisaoObs = null;
        } else if (input.tipo === 'fgts') {
          updateData.baixaFgtsValor = null;
          updateData.baixaFgtsData = null;
          updateData.baixaFgtsPor = null;
          updateData.baixaFgtsObs = null;
        } else {
          updateData.baixaComplementarValor = null;
          updateData.baixaComplementarData = null;
          updateData.baixaComplementarPor = null;
          updateData.baixaComplementarObs = null;
        }

        if (aviso.status === 'concluido') {
          updateData.status = 'aguardando_pagamento';
          updateData.dataConclusao = null;
          updateData.dataBaixa = null;
        }

        const obsAppend = `\n[ESTORNO ${tipoLabel}] por ${ctx.user.name} em ${hoje}: R$ ${valorEstornado} estornado. Motivo: ${input.motivo}`;
        updateData.observacoes = (aviso.observacoes || '') + obsAppend;

        await db.update(terminationNotices).set(updateData).where(eq(terminationNotices.id, input.id));
        await createAuditLog({
          userId: ctx.user.id,
          userName: ctx.user.name ?? 'Sistema',
          action: 'ESTORNAR_BAIXA_AVISO_PREVIO',
          module: 'aviso_previo',
          entityType: 'terminationNotices',
          entityId: input.id,
          details: `Baixa ${tipoLabel} estornada (R$ ${valorEstornado}) por ${ctx.user.name}. Motivo: ${input.motivo}. ${aviso.status === 'concluido' ? 'Status revertido para Aguardando Pagamento.' : ''}`,
        });
        return { success: true, reabriu: aviso.status === 'concluido' };
      }),

    /** Reverter status de Aguardando Pagamento ou Concluído de volta para Em Andamento */
    revertConcluido: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        const [aviso] = await db.select().from(terminationNotices).where(eq(terminationNotices.id, input.id));
        if (!aviso) throw new TRPCError({ code: 'NOT_FOUND', message: 'Aviso prévio não encontrado' });
        // Rev. 4689 — tenant guard (IDOR): reverter cancela lançamentos no
        // Financeiro; só quem tem acesso à empresa do aviso pode fazê-lo.
        const empresasRevert = await getCompaniesForUser(ctx.user.id, ctx.user.role);
        if (!empresasRevert.some(c => c.id === aviso.companyId))
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem acesso a esta empresa' });
        if (aviso.status !== 'concluido' && aviso.status !== 'aguardando_pagamento')
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Apenas avisos Concluídos ou Aguardando Pagamento podem ser revertidos' });

        // Se o aviso foi enviado ao Contas a Pagar e o lançamento ainda está EM
        // ABERTO (a_pagar), cancela o lançamento e desfaz o vínculo — evita
        // pagável órfão no Financeiro. Lançamento já pago/parcial NÃO é tocado.
        let obsExtra = '';
        // Rev. 4689 — pode haver DOIS lançamentos vinculados (rescisão + multa
        // FGTS). Valida os dois ANTES de cancelar qualquer um (atomicidade da
        // regra: se um deles já foi pago, nada é cancelado).
        const idsVinculados = [
          { id: (aviso as any).financeiroEntryId as number | null, label: 'rescisão' },
          { id: (aviso as any).financeiroFgtsEntryId as number | null, label: 'multa FGTS' },
        ].filter(v => Number(v.id) > 0);
        const feRows: { id: number; label: string; status: string }[] = [];
        for (const v of idsVinculados) {
          const fe: any = await db.execute(sql`
            SELECT id, status FROM financial_entries WHERE id = ${v.id} AND company_id = ${aviso.companyId}
          `);
          const feRow = (Array.isArray(fe) ? fe[0] : fe?.rows?.[0]) as any;
          if (feRow) feRows.push({ id: feRow.id, label: v.label, status: feRow.status });
        }
        const pago = feRows.find(r => r.status !== 'a_pagar' && r.status !== 'cancelado');
        if (pago)
          throw new TRPCError({ code: 'BAD_REQUEST', message: `Não é possível reverter: o lançamento #${pago.id} (${pago.label}) no Contas a Pagar já tem pagamento registrado (status ${pago.status}). Estorne a baixa no Financeiro primeiro.` });
        for (const r of feRows.filter(r => r.status === 'a_pagar')) {
          await db.execute(sql`
            UPDATE financial_entries SET status = 'cancelado', updated_at = NOW()
            WHERE id = ${r.id} AND status = 'a_pagar' AND company_id = ${aviso.companyId}
          `);
          obsExtra += `\n[Reversão em ${new Date().toISOString().split('T')[0]} por ${ctx.user.name}]: lançamento #${r.id} (${r.label}) do Contas a Pagar foi CANCELADO automaticamente.`;
        }

        await db.update(terminationNotices).set({
          status: 'em_andamento',
          dataConclusao: null,
          dataBaixa: null,
          enviadoFinanceiroEm: null,
          enviadoFinanceiroPor: null,
          financeiroEntryId: null,
          financeiroFgtsEntryId: null,
          ...(obsExtra ? { observacoes: (aviso.observacoes || '') + obsExtra } : {}),
          revertidoManualmente: 1,
          baixaRescisaoValor: null,
          baixaRescisaoData: null,
          baixaRescisaoPor: null,
          baixaRescisaoObs: null,
          baixaFgtsValor: null,
          baixaFgtsData: null,
          baixaFgtsPor: null,
          baixaFgtsObs: null,
          baixaComplementarValor: null,
          baixaComplementarData: null,
          baixaComplementarPor: null,
          baixaComplementarObs: null,
          updatedAt: sql`NOW()`,
        } as any).where(eq(terminationNotices.id, input.id));
        
        await createAuditLog({
          userId: ctx.user.id,
          userName: ctx.user.name ?? 'Sistema',
          action: 'REVERT_AVISO_PREVIO',
          module: 'aviso_previo',
          entityType: 'terminationNotices',
          entityId: input.id,
          details: `Status revertido de ${aviso.status} para Em Andamento por ${ctx.user.name}`,
        });
        
        return { success: true };
      }),

    /** Reverter TODOS os avisos Concluídos para Aguardando Baixa de uma empresa */
    revertAllConcluidos: protectedProcedure
      .input(z.object({ companyId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        const result = await db.update(terminationNotices).set({
          status: 'aguardando_pagamento',
          dataConclusao: null,
          dataBaixa: null,
          baixaRescisaoValor: null,
          baixaRescisaoData: null,
          baixaRescisaoPor: null,
          baixaRescisaoObs: null,
          baixaFgtsValor: null,
          baixaFgtsData: null,
          baixaFgtsPor: null,
          baixaFgtsObs: null,
          baixaComplementarValor: null,
          baixaComplementarData: null,
          baixaComplementarPor: null,
          baixaComplementarObs: null,
          updatedAt: sql`NOW()`,
        } as any).where(and(
          eq(terminationNotices.companyId, input.companyId),
          eq(terminationNotices.status, 'concluido'),
          isNull(terminationNotices.deletedAt),
          // Rev. 4556 — só reativa quem realmente NÃO tem baixa registrada.
          // Antes revertia (e APAGAVA a baixa de) TODOS os concluídos.
          isNull(terminationNotices.dataBaixa),
          isNull(terminationNotices.baixaRescisaoData),
        ));
        await createAuditLog({
          userId: ctx.user.id,
          userName: ctx.user.name ?? 'Sistema',
          action: 'REVERT_ALL_CONCLUIDOS',
          module: 'aviso_previo',
          entityType: 'terminationNotices',
          entityId: input.companyId,
          details: `Todos os avisos concluídos revertidos para Aguardando Baixa por ${ctx.user.name}`,
        });
        return { success: true };
      }),

    /**
     * Rev. 4557 — RH valida o aviso e ENVIA a rescisão para o Contas a Pagar.
     * O Financeiro dá a baixa lá; quando quitar, o aviso conclui e o funcionário
     * é desligado automaticamente (ver concluirAvisoPorBaixaFinanceira).
     */
    enviarParaFinanceiro: protectedProcedure
      // Rev. 4687 — `valor` opcional: RH pode ajustar o valor da rescisão antes
      // de lançar no Contas a Pagar (a previsão do sistema é só sugestão).
      // Rev. 4689 — gera TAMBÉM o lançamento da multa FGTS (separado), quando o
      // tipo do aviso a gera (empregador_*, rescisão indireta, acordo mútuo).
      // `valorFgts` opcional permite ajustar a multa antes do envio.
      .input(z.object({ id: z.number(), valor: z.string().optional(), valorFgts: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        const [aviso] = await db.select().from(terminationNotices).where(and(
          eq(terminationNotices.id, input.id),
          isNull(terminationNotices.deletedAt),
        ));
        if (!aviso) throw new TRPCError({ code: 'NOT_FOUND', message: 'Aviso prévio não encontrado' });
        // Rev. 4685 — bug: faltava o `role` e comparava OBJETOS com número
        // (`includes(companyId)` em array de empresas), então TODO usuário
        // (inclusive admin) caía em "Sem acesso a esta empresa".
        const empresasDoUser = await getCompaniesForUser(ctx.user.id, ctx.user.role);
        if (!empresasDoUser.some(c => c.id === aviso.companyId))
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem acesso a esta empresa' });
        if (aviso.status !== 'aguardando_pagamento')
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Só é possível enviar ao Financeiro avisos em "Aguardando Baixa".' });
        // Bloqueia dupla via de pagamento: se o RH já registrou baixa manual
        // (mesmo parcial), o valor não pode ir também pro Contas a Pagar.
        if ((aviso as any).baixaRescisaoData || (aviso as any).dataBaixa)
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Este aviso já tem baixa manual registrada — não é possível enviar ao Financeiro (risco de pagamento em duplicidade).' });

        // Valor: usa o editado pelo RH se veio; senão, a previsão do sistema.
        // Aceita formato BR ("5.035,16") e US ("5035.16").
        // Parser estrito (rejeita lixo tipo "123abc" e ambiguidade de milhar):
        // - "5.035,16" / "5035,16"  → BR (vírgula decimal)
        // - "5,035.16" / "5035.16"  → US (ponto decimal)
        // - "1.234" (só grupos de 3 sem decimal) → milhar BR = 1234
        // - "R$ " prefixo e espaços tolerados; qualquer outro formato = erro.
        const parseValor = (raw: string): number | null => {
          const t = raw.trim().replace(/^R\$\s*/i, '').replace(/\s+/g, '');
          if (/^\d{1,3}(\.\d{3})*,\d{1,2}$/.test(t) || /^\d+,\d{1,2}$/.test(t))
            return parseFloat(t.replace(/\./g, '').replace(',', '.'));           // BR decimal
          if (/^\d{1,3}(\.\d{3})+$/.test(t)) return parseFloat(t.replace(/\./g, '')); // milhar BR sem decimal
          if (/^\d{1,3}(,\d{3})*(\.\d{1,2})?$/.test(t) || /^\d+(\.\d{1,2})?$/.test(t))
            return parseFloat(t.replace(/,/g, ''));                              // US
          if (/^\d+$/.test(t)) return parseFloat(t);                             // inteiro puro
          return null; // formato não reconhecido
        };
        let valorEditado: number | null = null;
        if (input.valor?.trim()) {
          valorEditado = parseValor(input.valor);
          if (valorEditado === null || !isFinite(valorEditado) || valorEditado <= 0)
            throw new TRPCError({ code: 'BAD_REQUEST', message: `Valor informado inválido ("${input.valor.trim()}"). Use o formato 5.035,16 ou 5035,16.` });
        }
        // Rev. 4689 — Multa FGTS: lançamento SEPARADO no Contas a Pagar.
        // Só se aplica quando o tipo gera multa (justa causa e pedido de
        // demissão NÃO geram). Base: multaFGTS da previsão salva; se o RH
        // informou o saldo REAL do FGTS, recalcula (40% — ou 20% no acordo).
        const tipoAviso = String(aviso.tipo || '');
        const fgtsAplica = tipoAviso.startsWith('empregador') || tipoAviso === 'rescisao_indireta' || tipoAviso === 'acordo_mutuo';
        let multaJson = 0;      // multa embutida no total salvo (valorEstimadoTotal)
        let multaPrevista = 0;  // multa sugerida p/ o lançamento (ajustada pelo FGTS real)
        if (fgtsAplica) {
          try {
            const prevJson = aviso.previsaoRescisao ? JSON.parse(aviso.previsaoRescisao) : null;
            multaJson = parseFloat(String(prevJson?.multaFGTS ?? '0').replace(',', '.')) || 0;
          } catch { multaJson = 0; }
          multaPrevista = multaJson;
          const fgtsRealRaw = (aviso as any).fgtsReal ? parseFloat(String((aviso as any).fgtsReal).replace(',', '.')) : NaN;
          // multaJson > 0 = critério "aplicar multa FGTS" estava LIGADO no cálculo;
          // com saldo real informado, a multa real substitui a estimada.
          if (multaJson > 0 && isFinite(fgtsRealRaw) && fgtsRealRaw > 0)
            multaPrevista = fgtsRealRaw * (tipoAviso === 'acordo_mutuo' ? 0.2 : 0.4);
        }

        // Previsão da RESCISÃO = total salvo MENOS a multa FGTS embutida nele
        // (a multa agora vai em lançamento próprio — sem isso, dupla contagem).
        const totalSalvo = parseFloat(String(aviso.valorEstimadoTotal ?? '0').replace(',', '.'));
        const valorPrevisto = isFinite(totalSalvo) ? Math.max(0, totalSalvo - multaJson) : NaN;
        const valor = valorEditado ?? valorPrevisto;
        if (!isFinite(valor) || valor <= 0)
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Valor estimado da rescisão inválido — recalcule o aviso antes de enviar.' });
        // Marca como "editado" sempre que o RH mandou valor e ele difere da
        // previsão — ou quando a previsão nem era válida (rastreabilidade).
        const valorFoiEditado = valorEditado !== null &&
          (!isFinite(valorPrevisto) || Math.abs(valorEditado - valorPrevisto) >= 0.005);
        const previsaoTxt = isFinite(valorPrevisto) ? `R$ ${valorPrevisto.toFixed(2)}` : 'indisponível';
        let valorFgtsEditado: number | null = null;
        if (input.valorFgts?.trim()) {
          if (!fgtsAplica)
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'Multa FGTS não se aplica a este tipo de desligamento.' });
          valorFgtsEditado = parseValor(input.valorFgts);
          if (valorFgtsEditado === null || !isFinite(valorFgtsEditado) || valorFgtsEditado <= 0)
            throw new TRPCError({ code: 'BAD_REQUEST', message: `Valor da multa FGTS inválido ("${input.valorFgts.trim()}"). Use o formato 5.035,16 ou 5035,16.` });
        }
        const valorFgts = valorFgtsEditado ?? multaPrevista;
        const gerarFgts = fgtsAplica && isFinite(valorFgts) && valorFgts > 0;
        const fgtsFoiEditado = valorFgtsEditado !== null && Math.abs(valorFgtsEditado - multaPrevista) >= 0.005;

        const [emp] = await db.select({ nome: employees.nomeCompleto }).from(employees)
          .where(eq(employees.id, aviso.employeeId));
        const nome = emp?.nome ?? `Funcionário #${aviso.employeeId}`;

        // Obra atual (se alocado) para centro de custo.
        let obraId: number | null = null;
        let obraNome: string | null = null;
        try {
          const [aloc] = await db.select({ obraId: obraFuncionarios.obraId, obraNome: obras.nome })
            .from(obraFuncionarios)
            .leftJoin(obras, eq(obras.id, obraFuncionarios.obraId))
            .where(and(eq(obraFuncionarios.employeeId, aviso.employeeId), eq(obraFuncionarios.isActive, 1)))
            .orderBy(desc(obraFuncionarios.id)).limit(1);
          if (aloc) { obraId = aloc.obraId; obraNome = aloc.obraNome ?? null; }
        } catch { /* sem obra = lançamento sem centro de custo */ }

        // Vencimento: dataFim + 10 dias (prazo legal do art. 477 CLT).
        const venc = new Date(aviso.dataFim + 'T12:00:00');
        venc.setDate(venc.getDate() + 10);
        const vencStr = venc.toISOString().split('T')[0];

        const descricao = `Rescisão — ${nome} (Aviso Prévio #${aviso.id})`;

        // Transação + advisory lock por aviso: serializa cliques concorrentes e
        // garante que INSERT no Contas a Pagar + link no aviso são atômicos.
        const entryId = await db.transaction(async (tx) => {
          await tx.execute(sql`SELECT pg_advisory_xact_lock(477001, ${aviso.id})`);

          // Re-check dentro do lock (estado pode ter mudado entre a leitura e o lock).
          const cur: any = await tx.execute(sql`
            SELECT status, financeiro_entry_id AS "financeiroEntryId",
                   baixa_rescisao_data AS "baixaRescisaoData", "dataBaixa"
            FROM termination_notices WHERE id = ${aviso.id}
          `);
          const row = (Array.isArray(cur) ? cur[0] : cur?.rows?.[0]) as any;
          if (!row || row.status !== 'aguardando_pagamento')
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'O aviso mudou de status — recarregue a tela.' });
          if (row.baixaRescisaoData || row.dataBaixa)
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'Este aviso já tem baixa manual registrada — não é possível enviar ao Financeiro.' });

          // Já enviado antes? Só permite reenvio se o lançamento vinculado foi
          // CANCELADO no Financeiro (ou não existe mais).
          if (row.financeiroEntryId) {
            const fe: any = await tx.execute(sql`
              SELECT id, status FROM financial_entries WHERE id = ${Number(row.financeiroEntryId)}
            `);
            const feRow = (Array.isArray(fe) ? fe[0] : fe?.rows?.[0]) as any;
            if (feRow && feRow.status !== 'cancelado')
              throw new TRPCError({ code: 'BAD_REQUEST', message: 'Este aviso já foi enviado ao Contas a Pagar (lançamento ativo).' });
            // lançamento cancelado/inexistente → limpa o link e reenvia
          }

          // Guarda extra contra duplicidade: nenhum lançamento ATIVO do módulo
          // aviso_previo (rescisão OU multa FGTS) pode existir para este aviso.
          const dup: any = await tx.execute(sql`
            SELECT id FROM financial_entries
            WHERE origem_modulo IN ('aviso_previo', 'aviso_previo_fgts') AND origem_id = ${aviso.id}
              AND status <> 'cancelado' AND company_id = ${aviso.companyId}
            LIMIT 1
          `);
          const dupRow = (Array.isArray(dup) ? dup[0] : dup?.rows?.[0]) as any;
          if (dupRow)
            throw new TRPCError({ code: 'BAD_REQUEST', message: `Já existe lançamento ativo no Contas a Pagar para este aviso (#${dupRow.id}).` });

          const res: any = await tx.execute(sql`
            INSERT INTO financial_entries (
              company_id, obra_id, obra_nome, conta_nome, tipo, natureza,
              valor_previsto, data_competencia, data_vencimento, status,
              origem_modulo, origem_id, origem_descricao, descricao, created_at, updated_at
            ) VALUES (
              ${aviso.companyId}, ${obraId}, ${obraNome}, ${'RESCISÃO - MÃO DE OBRA'}, 'despesa', 'variavel',
              ${valor.toFixed(2)}, ${aviso.dataFim}, ${vencStr}, 'a_pagar',
              'aviso_previo', ${aviso.id}, ${descricao}, ${descricao}, NOW(), NOW()
            ) RETURNING id
          `);
          const newId = Number((Array.isArray(res) ? res[0] : res?.rows?.[0])?.id);

          // Rev. 4689 — Lançamento SEPARADO da multa FGTS (quando aplicável).
          let fgtsId: number | null = null;
          if (gerarFgts) {
            const descFgts = `Multa FGTS — ${nome} (Aviso Prévio #${aviso.id})`;
            const resFgts: any = await tx.execute(sql`
              INSERT INTO financial_entries (
                company_id, obra_id, obra_nome, conta_nome, tipo, natureza,
                valor_previsto, data_competencia, data_vencimento, status,
                origem_modulo, origem_id, origem_descricao, descricao, created_at, updated_at
              ) VALUES (
                ${aviso.companyId}, ${obraId}, ${obraNome}, ${'FGTS - MÃO DE OBRA'}, 'despesa', 'variavel',
                ${valorFgts.toFixed(2)}, ${aviso.dataFim}, ${vencStr}, 'a_pagar',
                'aviso_previo_fgts', ${aviso.id}, ${descFgts}, ${descFgts}, NOW(), NOW()
              ) RETURNING id
            `);
            fgtsId = Number((Array.isArray(resFgts) ? resFgts[0] : resFgts?.rows?.[0])?.id) || null;
          }

          await tx.update(terminationNotices).set({
            enviadoFinanceiroEm: sql`NOW()`,
            enviadoFinanceiroPor: ctx.user.name ?? 'Sistema',
            financeiroEntryId: newId || null,
            financeiroFgtsEntryId: fgtsId,
            observacoes: (aviso.observacoes || '') +
              `\n[Enviado ao Financeiro em ${new Date().toISOString().split('T')[0]} por ${ctx.user.name}]: rescisão de R$ ${valor.toFixed(2)} lançada no Contas a Pagar (#${newId}), vencimento ${vencStr}.` +
              (valorFoiEditado ? ` Valor EDITADO pelo RH (previsão do sistema: ${previsaoTxt}).` : '') +
              (fgtsId ? ` Multa FGTS de R$ ${valorFgts.toFixed(2)} lançada em separado (#${fgtsId}).${fgtsFoiEditado ? ` Valor da multa EDITADO pelo RH (previsão: R$ ${multaPrevista.toFixed(2)}).` : ''}` : ''),
            updatedAt: sql`NOW()`,
          } as any).where(eq(terminationNotices.id, aviso.id));

          return { newId, fgtsId };
        });

        await createAuditLog({
          userId: ctx.user.id,
          userName: ctx.user.name ?? 'Sistema',
          action: 'ENVIAR_RESCISAO_FINANCEIRO',
          module: 'aviso_previo',
          entityType: 'terminationNotices',
          entityId: aviso.id,
          details: `Rescisão de ${nome} (R$ ${valor.toFixed(2)}) enviada ao Contas a Pagar (lançamento #${entryId.newId}, venc. ${vencStr}).${valorFoiEditado ? ` Valor editado pelo RH (previsão: ${previsaoTxt}).` : ''}${entryId.fgtsId ? ` Multa FGTS de R$ ${valorFgts.toFixed(2)} lançada em separado (#${entryId.fgtsId}).` : ''}`,
        });
        return { success: true, entryId: entryId.newId, fgtsEntryId: entryId.fgtsId, valor: valor.toFixed(2), valorFgts: entryId.fgtsId ? valorFgts.toFixed(2) : null, vencimento: vencStr };
      }),

    /** Editar o saldo real do FGTS manualmente (Súmula 276 / correção TR) */
    editarFgtsReal: protectedProcedure
      .input(z.object({
        id: z.number(),
        fgtsReal: z.string().nullable(), // null = remover edição manual (voltar ao estimado)
      }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        const [aviso] = await db.select().from(terminationNotices).where(
          and(eq(terminationNotices.id, input.id), isNull(terminationNotices.deletedAt))
        );
        if (!aviso) throw new TRPCError({ code: 'NOT_FOUND', message: 'Aviso prévio não encontrado' });

        await db.execute(sql`
          UPDATE termination_notices SET
            "fgtsReal" = ${input.fgtsReal},
            "fgtsEditadoManualmente" = ${input.fgtsReal ? 1 : 0},
            "fgtsEditadoEm" = ${input.fgtsReal ? sql`NOW()` : null},
            "fgtsEditadoPor" = ${input.fgtsReal ? (ctx.user.name ?? 'Sistema') : null},
            "updatedAt" = NOW()
          WHERE id = ${input.id}
        `);

        await createAuditLog({
          userId: ctx.user.id,
          userName: ctx.user.name ?? 'Sistema',
          action: input.fgtsReal ? 'EDITAR_FGTS_REAL' : 'REMOVER_FGTS_REAL',
          module: 'aviso_previo',
          entityType: 'terminationNotices',
          entityId: input.id,
          details: input.fgtsReal
            ? `FGTS real editado manualmente para R$ ${input.fgtsReal} por ${ctx.user.name}`
            : `Edição manual do FGTS removida por ${ctx.user.name}`,
        });
        return { success: true };
      }),

    /** Editar campos de desconto e acréscimo do acerto */
    editarAcerto: protectedProcedure
      .input(z.object({
        id: z.number(),
        descontosAcerto: z.string().nullable(),
        descontosAcertoDesc: z.string().nullable(),
        acrescimosAcerto: z.string().nullable(),
        acrescimosAcertoDesc: z.string().nullable(),
        mediaInsalubridade: z.string().nullable().optional(),
        mediaHorasExtras: z.string().nullable().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        const [aviso] = await db.select().from(terminationNotices).where(
          and(eq(terminationNotices.id, input.id), isNull(terminationNotices.deletedAt))
        );
        if (!aviso) throw new TRPCError({ code: 'NOT_FOUND', message: 'Aviso prévio não encontrado' });

        await db.execute(sql`
          UPDATE termination_notices SET
            "descontosAcerto" = ${input.descontosAcerto},
            "descontosAcertoDesc" = ${input.descontosAcertoDesc},
            "acrescimosAcerto" = ${input.acrescimosAcerto},
            "acrescimosAcertoDesc" = ${input.acrescimosAcertoDesc},
            media_insalubridade = ${input.mediaInsalubridade || '0'},
            media_horas_extras = ${input.mediaHorasExtras || '0'},
            "updatedAt" = NOW()
          WHERE id = ${input.id}
        `);

        await createAuditLog({
          userId: ctx.user.id,
          userName: ctx.user.name ?? 'Sistema',
          action: 'EDITAR_ACERTO_RESCISAO',
          module: 'aviso_previo',
          entityType: 'terminationNotices',
          entityId: input.id,
          details: `Descontos/acréscimos do acerto atualizados por ${ctx.user.name}`,
        });
        return { success: true };
      }),

    /** Ativar/desativar cenário de novo emprego durante aviso prévio (Súmula 276 TST) */
    ativarNovoEmprego: protectedProcedure
      .input(z.object({
        id: z.number(),
        ativo: z.boolean(),
        comunicadoEm: z.string().nullable(), // data da comunicação (YYYY-MM-DD)
        cartaUrl: z.string().nullable(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        const [aviso] = await db.select().from(terminationNotices).where(
          and(eq(terminationNotices.id, input.id), isNull(terminationNotices.deletedAt))
        );
        if (!aviso) throw new TRPCError({ code: 'NOT_FOUND', message: 'Aviso prévio não encontrado' });

        await db.execute(sql`
          UPDATE termination_notices SET
            "novoEmpregoAtivo" = ${input.ativo ? 1 : 0},
            "novoEmpregoComunicadoEm" = ${input.comunicadoEm},
            "novoEmpregoCartaUrl" = ${input.cartaUrl},
            "updatedAt" = NOW()
          WHERE id = ${input.id}
        `);

        await createAuditLog({
          userId: ctx.user.id,
          userName: ctx.user.name ?? 'Sistema',
          action: input.ativo ? 'ATIVAR_NOVO_EMPREGO' : 'DESATIVAR_NOVO_EMPREGO',
          module: 'aviso_previo',
          entityType: 'terminationNotices',
          entityId: input.id,
          details: input.ativo
            ? `Novo emprego ativado — comunicado em ${input.comunicadoEm} — Súmula 276 TST — por ${ctx.user.name}`
            : `Novo emprego desativado por ${ctx.user.name}`,
        });
        return { success: true };
      }),

    /** Upload de arquivo (PDF/JPG) como carta de comprovante de novo emprego */
    uploadCartaNovoEmprego: protectedProcedure
      .input(z.object({
        id: z.number(),
        fileBase64: z.string(),
        mimeType: z.enum(['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']),
        fileName: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        const [aviso] = await db.select({ id: terminationNotices.id, companyId: terminationNotices.companyId })
          .from(terminationNotices)
          .where(and(eq(terminationNotices.id, input.id), isNull(terminationNotices.deletedAt)));
        if (!aviso) throw new TRPCError({ code: 'NOT_FOUND', message: 'Aviso prévio não encontrado' });

        const ext = input.mimeType === 'application/pdf' ? 'pdf'
          : input.mimeType === 'image/png' ? 'png' : 'jpg';
        const randomSuffix = Math.random().toString(36).substring(2, 10);
        const fileKey = `aviso-previo/${aviso.companyId}/${input.id}/carta-novo-emprego-${randomSuffix}.${ext}`;

        const buffer = Buffer.from(input.fileBase64, 'base64');
        const { url } = await storagePut(fileKey, buffer, input.mimeType);

        await db.execute(sql`
          UPDATE termination_notices SET
            "novoEmpregoCartaUrl" = ${url},
            "updatedAt" = NOW()
          WHERE id = ${input.id}
        `);

        await createAuditLog({
          userId: ctx.user.id,
          userName: ctx.user.name ?? 'Sistema',
          action: 'UPLOAD_CARTA_NOVO_EMPREGO',
          module: 'aviso_previo',
          entityType: 'terminationNotices',
          entityId: input.id,
          details: `Carta/comprovante de novo emprego enviada por ${ctx.user.name} — arquivo: ${input.fileName}`,
        });
        return { success: true, url };
      }),

    /** Rev. 1806 — Upload do AVISO ASSINADO pelo colaborador (PDF/JPG/PNG, máx 10MB) */
    uploadAvisoAssinado: protectedProcedure
      .input(z.object({
        id: z.number(),
        fileBase64: z.string(),
        mimeType: z.enum(['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']),
        fileName: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        const [aviso] = await db.select({ id: terminationNotices.id, companyId: terminationNotices.companyId })
          .from(terminationNotices)
          .where(and(eq(terminationNotices.id, input.id), isNull(terminationNotices.deletedAt)));
        if (!aviso) throw new TRPCError({ code: 'NOT_FOUND', message: 'Aviso prévio não encontrado' });

        const ext = input.mimeType === 'application/pdf' ? 'pdf'
          : input.mimeType === 'image/png' ? 'png' : 'jpg';
        const randomSuffix = Math.random().toString(36).substring(2, 10);
        const fileKey = `aviso-previo/${aviso.companyId}/${input.id}/aviso-assinado-${randomSuffix}.${ext}`;

        const buffer = Buffer.from(input.fileBase64, 'base64');
        const { url } = await storagePut(fileKey, buffer, input.mimeType);

        await db.execute(sql`
          UPDATE termination_notices SET
            "aviso_assinado_url" = ${url},
            "aviso_assinado_enviado_em" = NOW(),
            "updatedAt" = NOW()
          WHERE id = ${input.id}
        `);

        await createAuditLog({
          userId: ctx.user.id,
          userName: ctx.user.name ?? 'Sistema',
          action: 'UPLOAD_AVISO_ASSINADO',
          module: 'aviso_previo',
          entityType: 'terminationNotices',
          entityId: input.id,
          details: `Aviso assinado pelo colaborador enviado por ${ctx.user.name} — arquivo: ${input.fileName}`,
        });
        return { success: true, url };
      }),

    /** Rev. 1806 — Remover anexo do Aviso Assinado */
    removerAvisoAssinado: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        const [aviso] = await db.select().from(terminationNotices).where(
          and(eq(terminationNotices.id, input.id), isNull(terminationNotices.deletedAt))
        );
        if (!aviso) throw new TRPCError({ code: 'NOT_FOUND', message: 'Aviso prévio não encontrado' });

        await db.execute(sql`
          UPDATE termination_notices SET
            "aviso_assinado_url" = NULL,
            "aviso_assinado_enviado_em" = NULL,
            "updatedAt" = NOW()
          WHERE id = ${input.id}
        `);

        await createAuditLog({
          userId: ctx.user.id,
          userName: ctx.user.name ?? 'Sistema',
          action: 'REMOVER_AVISO_ASSINADO',
          module: 'aviso_previo',
          entityType: 'terminationNotices',
          entityId: input.id,
          details: `Anexo de aviso assinado removido por ${ctx.user.name}`,
        });
        return { success: true };
      }),

    /** Gerar dados para PDF do Aviso Prévio */
    gerarPdf: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const [aviso] = await db.select().from(terminationNotices)
          .where(and(eq(terminationNotices.id, input.id), isNull(terminationNotices.deletedAt)));
        if (!aviso) throw new TRPCError({ code: 'NOT_FOUND', message: 'Aviso prévio não encontrado' });

        const [emp] = await db.select().from(employees).where(eq(employees.id, aviso.employeeId));
        if (!emp) throw new TRPCError({ code: 'NOT_FOUND', message: 'Funcionário não encontrado' });

        const [empresa] = await db.select().from(companies).where(eq(companies.id, aviso.companyId));

        let previsao: any = {};
        try { previsao = JSON.parse(aviso.previsaoRescisao || '{}'); } catch { }

        const tipoLabels: Record<string, string> = {
          'empregador_trabalhado': 'Aviso Prévio Trabalhado (pelo Empregador)',
          'empregador_indenizado': 'Aviso Prévio Indenizado (pelo Empregador)',
          'empregado_trabalhado': 'Aviso Prévio Trabalhado (pelo Empregado)',
          'empregado_indenizado': 'Aviso Prévio Indenizado (pelo Empregado)',
          'justa_causa': 'Dispensa por Justa Causa (Art. 482 CLT)',
          'rescisao_indireta': 'Rescisão Indireta (Art. 483 CLT)',
          'acordo_mutuo': 'Rescisão por Acordo Mútuo (Art. 484-A CLT)',
        };

        const reducaoLabels: Record<string, string> = {
          '2h_dia': 'Redução de 2 horas diárias (Art. 488 CLT)',
          '7_dias_corridos': '7 dias corridos (Art. 488, parágrafo único CLT)',
          'nenhuma': 'Sem redução',
        };

        return {
          empresa: {
            nome: empresa?.razaoSocial || empresa?.nomeFantasia || '',
            cnpj: empresa?.cnpj || '',
            endereco: empresa?.endereco || '',
            cidade: empresa?.cidade || '',
            estado: empresa?.estado || '',
          },
          funcionario: {
            nome: emp.nomeCompleto,
            cpf: emp.cpf,
            cargo: emp.cargo || (emp as any).funcao || '',
            dataAdmissao: emp.dataAdmissao || '',
            ctps: (emp as any).ctps || '',
            serieCtps: (emp as any).serieCtps || '',
          },
          aviso: {
            tipo: aviso.tipo,
            tipoLabel: tipoLabels[aviso.tipo] || aviso.tipo,
            dataInicio: aviso.dataInicio,
            dataFim: aviso.dataFim,
            diasAviso: aviso.diasAviso,
            anosServico: aviso.anosServico,
            reducaoJornada: aviso.reducaoJornada,
            reducaoLabel: reducaoLabels[aviso.reducaoJornada || 'nenhuma'] || '',
            salarioBase: aviso.salarioBase,
            status: aviso.status,
            observacoes: aviso.observacoes,
          },
          previsaoRescisao: previsao,
          valorEstimadoTotal: aviso.valorEstimadoTotal,
        };
      }),

    /** Alerta 80 dias - Obras próximas do fim com funcionários alocados */
    alertaObras80Dias: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const hoje = new Date();
        const hojeStr = hoje.toISOString().split('T')[0];
        const em80dias = new Date(hoje);
        em80dias.setDate(em80dias.getDate() + 80);
        const em80diasStr = em80dias.toISOString().split('T')[0];

        const obrasAtivas = await db.select().from(obras)
          .where(and(
            companyFilter(obras.companyId, input),
            sql`${obras.deletedAt} IS NULL`,
            sql`${obras.status} IN ('Em_Andamento', 'Em Andamento')`,
            sql`${obras.dataPrevisaoFim} IS NOT NULL`,
            sql`${obras.dataPrevisaoFim} BETWEEN ${hojeStr} AND ${em80diasStr}`,
          ));

        const allEmps = await db.select().from(employees)
          .where(and(
            companyFilter(employees.companyId, input),
            sql`${employees.deletedAt} IS NULL`,
            eq(employees.status, 'Ativo'),
          ));

        // Buscar todas as alocações ativas de uma vez
        const allObraAlocs = await db.select({ employeeId: obraFuncionarios.employeeId, obraId: obraFuncionarios.obraId })
          .from(obraFuncionarios).where(and(companyFilter(obraFuncionarios.companyId, input), eq(obraFuncionarios.isActive, 1)));
        const obraEmpMap: Record<number, Set<number>> = {};
        for (const a of allObraAlocs) {
          if (!obraEmpMap[a.obraId]) obraEmpMap[a.obraId] = new Set();
          obraEmpMap[a.obraId].add(a.employeeId);
        }

        const result = obrasAtivas.map(obra => {
          const fimPrevisto = new Date(obra.dataPrevisaoFim! + 'T00:00:00');
          const diasRestantes = Math.ceil((fimPrevisto.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
          const obraEmpIds = obraEmpMap[obra.id] || new Set();
          const funcsAlocados = allEmps.filter(e => obraEmpIds.has(e.id));

          return {
            obraId: obra.id,
            obraNome: obra.nome,
            obraCodigo: obra.codigo,
            cliente: obra.cliente,
            dataPrevisaoFim: obra.dataPrevisaoFim,
            diasRestantes,
            urgencia: diasRestantes <= 30 ? 'critico' as const : diasRestantes <= 60 ? 'urgente' as const : 'atencao' as const,
            funcionarios: funcsAlocados.map(e => ({
              id: e.id,
              nome: e.nomeCompleto,
              cargo: e.cargo || (e as any).funcao || '',
              dataAdmissao: e.dataAdmissao,
              anosServico: e.dataAdmissao ? calcularAnosServico(e.dataAdmissao) : 0,
              diasAvisoPrevio: e.dataAdmissao ? calcularDiasAvisoTotal(calcularAnosServico(e.dataAdmissao)) : 30,
            })),
            totalFuncionarios: funcsAlocados.length,
          };
        }).sort((a, b) => a.diasRestantes - b.diasRestantes);

        return result;
      }),
  }),

  // ============================================================
  // COMBO DE DEMISSÕES — SIMULAÇÕES SALVAS (Rev. 2960)
  // ============================================================
  // O "Combo de Demissões" do Dashboard Aviso Prévio era volátil. Aqui ele
  // vira persistente: salvar por NOME, listar, reabrir, editar (tipo + data +
  // funcionários) e excluir (soft-delete). Botão "Gerar avisos de todos" cria
  // os avisos prévios em lote reusando `criarAvisoPrevioInterno` (mesma lógica
  // individual), PULANDO quem já tem aviso em andamento, sem abortar o lote.
  combo: router({
    salvar: protectedProcedure
      .input(z.object({
        companyId: z.number(),
        companyIds: z.array(z.number()).optional(),
        nome: z.string().min(1).max(255),
        tipo: z.enum(['empregador_trabalhado','empregador_indenizado','empregado_trabalhado','empregado_indenizado']),
        dataReferencia: z.string(),
        employeeIds: z.array(z.number()),
        snapshot: z.any().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        const nome = input.nome.trim();
        if (!nome) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe um nome para a simulação." });
        const [row] = await db.insert(comboDemissaoSimulacoes).values({
          companyId: input.companyId,
          companyIds: input.companyIds && input.companyIds.length > 0 ? JSON.stringify(input.companyIds) : null,
          nome,
          tipo: input.tipo,
          dataReferencia: input.dataReferencia,
          employeeIds: JSON.stringify(input.employeeIds || []),
          snapshotJson: input.snapshot !== undefined ? JSON.stringify(input.snapshot) : null,
          criadoPorId: ctx.user.id ?? null,
          criadoPorNome: ctx.user.name ?? ctx.user.email ?? "Sistema",
        }).returning();
        return { success: true, id: row.id };
      }),

    listar: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const rows = await db.select({
          id: comboDemissaoSimulacoes.id,
          nome: comboDemissaoSimulacoes.nome,
          tipo: comboDemissaoSimulacoes.tipo,
          dataReferencia: comboDemissaoSimulacoes.dataReferencia,
          employeeIds: comboDemissaoSimulacoes.employeeIds,
          criadoPorNome: comboDemissaoSimulacoes.criadoPorNome,
          createdAt: comboDemissaoSimulacoes.createdAt,
          updatedAt: comboDemissaoSimulacoes.updatedAt,
        }).from(comboDemissaoSimulacoes)
          .where(and(
            companyFilter(comboDemissaoSimulacoes.companyId, input),
            isNull(comboDemissaoSimulacoes.deletedAt),
          ))
          .orderBy(desc(comboDemissaoSimulacoes.updatedAt));
        return rows.map((r: any) => {
          let ids: number[] = [];
          try { ids = JSON.parse(r.employeeIds || "[]"); } catch {}
          return { ...r, employeeIds: ids, qtd: ids.length };
        });
      }),

    abrir: protectedProcedure
      .input(z.object({ id: z.number(), companyId: z.number(), companyIds: z.array(z.number()).optional() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const [row] = await db.select().from(comboDemissaoSimulacoes)
          .where(and(
            eq(comboDemissaoSimulacoes.id, input.id),
            companyFilter(comboDemissaoSimulacoes.companyId, input), // tenant guard (anti-IDOR)
            isNull(comboDemissaoSimulacoes.deletedAt),
          ));
        if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Simulação não encontrada." });
        let ids: number[] = [];
        try { ids = JSON.parse(row.employeeIds || "[]"); } catch {}
        let snapshot: any = null;
        try { snapshot = row.snapshotJson ? JSON.parse(row.snapshotJson) : null; } catch {}
        return {
          id: row.id, nome: row.nome, tipo: row.tipo, dataReferencia: row.dataReferencia,
          employeeIds: ids, snapshot, criadoPorNome: row.criadoPorNome,
          createdAt: row.createdAt, updatedAt: row.updatedAt,
        };
      }),

    atualizar: protectedProcedure
      .input(z.object({
        id: z.number(),
        companyId: z.number(),
        companyIds: z.array(z.number()).optional(),
        nome: z.string().min(1).max(255).optional(),
        tipo: z.enum(['empregador_trabalhado','empregador_indenizado','empregado_trabalhado','empregado_indenizado']).optional(),
        dataReferencia: z.string().optional(),
        employeeIds: z.array(z.number()).optional(),
        snapshot: z.any().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        // tenant guard (anti-IDOR): a simulação tem que pertencer à(s) empresa(s) do usuário
        const [existe] = await db.select({ id: comboDemissaoSimulacoes.id }).from(comboDemissaoSimulacoes)
          .where(and(
            eq(comboDemissaoSimulacoes.id, input.id),
            companyFilter(comboDemissaoSimulacoes.companyId, input),
            isNull(comboDemissaoSimulacoes.deletedAt),
          )).limit(1);
        if (!existe) throw new TRPCError({ code: "NOT_FOUND", message: "Simulação não encontrada." });
        const upd: any = { updatedAt: new Date().toISOString() };
        if (input.nome !== undefined) {
          const nome = input.nome.trim();
          if (!nome) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe um nome para a simulação." });
          upd.nome = nome;
        }
        if (input.tipo !== undefined) upd.tipo = input.tipo;
        if (input.dataReferencia !== undefined) upd.dataReferencia = input.dataReferencia;
        if (input.employeeIds !== undefined) upd.employeeIds = JSON.stringify(input.employeeIds);
        if (input.snapshot !== undefined) upd.snapshotJson = JSON.stringify(input.snapshot);
        await db.update(comboDemissaoSimulacoes).set(upd)
          .where(eq(comboDemissaoSimulacoes.id, input.id));
        return { success: true };
      }),

    excluir: protectedProcedure
      .input(z.object({ id: z.number(), companyId: z.number(), companyIds: z.array(z.number()).optional() }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        // tenant guard (anti-IDOR) + soft-delete (R-001/R-007/R-010 — nunca DELETE)
        const [existe] = await db.select({ id: comboDemissaoSimulacoes.id }).from(comboDemissaoSimulacoes)
          .where(and(
            eq(comboDemissaoSimulacoes.id, input.id),
            companyFilter(comboDemissaoSimulacoes.companyId, input),
            isNull(comboDemissaoSimulacoes.deletedAt),
          )).limit(1);
        if (!existe) throw new TRPCError({ code: "NOT_FOUND", message: "Simulação não encontrada." });
        await db.update(comboDemissaoSimulacoes).set({ deletedAt: new Date().toISOString() } as any)
          .where(eq(comboDemissaoSimulacoes.id, input.id));
        return { success: true };
      }),

    // "Gerar avisos de todos" — cria os avisos prévios em LOTE reusando a lógica
    // individual (`criarAvisoPrevioInterno`). PULA quem já tem aviso em andamento
    // (CONFLICT) e segue adiante mesmo se um falhar; retorna {criados, pulados, erros[]}.
    gerarEmLote: protectedProcedure
      .input(z.object({
        companyId: z.number(),
        companyIds: z.array(z.number()).optional(),
        tipo: z.enum(['empregador_trabalhado','empregador_indenizado','empregado_trabalhado','empregado_indenizado']),
        dataReferencia: z.string(),
        employeeIds: z.array(z.number()).min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        const companiesPermitidas = resolveCompanyIds(input);
        const criados: { employeeId: number; avisoId: number }[] = [];
        const pulados: { employeeId: number; nome?: string; motivo: string }[] = [];
        const erros: { employeeId: number; nome?: string; erro: string }[] = [];

        for (const employeeId of input.employeeIds) {
          try {
            const [emp] = await db.select().from(employees).where(eq(employees.id, employeeId));
            if (!emp) { erros.push({ employeeId, erro: "Funcionário não encontrado." }); continue; }
            // tenant guard (anti-IDOR): o funcionário tem que ser da(s) empresa(s) do escopo
            if (!companiesPermitidas.includes(Number(emp.companyId))) {
              erros.push({ employeeId, nome: emp.nomeCompleto, erro: "Funcionário fora da empresa selecionada." });
              continue;
            }
            const res = await criarAvisoPrevioInterno(db, emp, {
              companyId: Number(emp.companyId),
              companyIds: input.companyIds,
              tipo: input.tipo,
              dataInicio: input.dataReferencia,
            }, { id: ctx.user.id, name: ctx.user.name });
            criados.push({ employeeId, avisoId: res.id });
          } catch (e: any) {
            if (e instanceof TRPCError && e.code === "CONFLICT") {
              pulados.push({ employeeId, motivo: "Já possui aviso prévio em andamento." });
            } else {
              erros.push({ employeeId, erro: e?.message || "Erro ao gerar aviso." });
            }
          }
        }
        return {
          criados: criados.length,
          pulados: pulados.length,
          erros: erros.length,
          detalheCriados: criados,
          detalhePulados: pulados,
          detalheErros: erros,
        };
      }),
  }),

  // ============================================================
  // FÉRIAS
  // ============================================================
  ferias: router({
    list: protectedProcedure
      .input(z.object({ companyId: z.coerce.number(), companyIds: z.array(z.number()).optional(), status: z.string().optional(), employeeId: z.number().optional() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const conditions: any[] = [
          companyFilter(vacationPeriods.companyId, input),
          isNull(vacationPeriods.deletedAt),
          sql`${employees.status} NOT IN ('Desligado', 'Lista_Negra')`,
          isNull(employees.deletedAt),
          // Rev. 1613 — Sócios e PJ não têm direito a férias (CLT Art. 129)
          sql`(${employees.tipoContrato} IS NULL OR ${employees.tipoContrato} NOT IN ('PJ','Socio'))`,
        ];
        if (input.status) {
          if (input.status === 'vencida') {
            // Vencida = status 'vencida' OU flag vencida=1 OU (pendente com concessivo expirado)
            const hoje = new Date().toISOString().split('T')[0];
            conditions.push(sql`(${vacationPeriods.status} = 'vencida' OR ${vacationPeriods.vencida} = 1 OR (${vacationPeriods.status} = 'pendente' AND ${vacationPeriods.periodoConcessivoFim} < ${hoje}))`);
            conditions.push(sql`${vacationPeriods.status} NOT IN ('concluida', 'cancelada')`);
          } else {
            conditions.push(eq(vacationPeriods.status, input.status as any));
          }
        }
        if (input.employeeId) conditions.push(eq(vacationPeriods.employeeId, input.employeeId));
        
        const rows = await db.select({
          id: vacationPeriods.id,
          companyId: vacationPeriods.companyId,
          employeeId: vacationPeriods.employeeId,
          periodoAquisitivoInicio: vacationPeriods.periodoAquisitivoInicio,
          periodoAquisitivoFim: vacationPeriods.periodoAquisitivoFim,
          periodoConcessivoFim: vacationPeriods.periodoConcessivoFim,
          dataInicio: vacationPeriods.dataInicio,
          dataFim: vacationPeriods.dataFim,
          diasGozo: vacationPeriods.diasGozo,
          fracionamento: vacationPeriods.fracionamento,
          abonoPecuniario: vacationPeriods.abonoPecuniario,
          valorFerias: vacationPeriods.valorFerias,
          valorTercoConstitucional: vacationPeriods.valorTercoConstitucional,
          valorAbono: vacationPeriods.valorAbono,
          valorTotal: vacationPeriods.valorTotal,
          ajusteInss: vacationPeriods.ajusteInss,
          valorLiquido: vacationPeriods.valorLiquido,
          mediaHE: vacationPeriods.mediaHE,
          mediaDSRHE: vacationPeriods.mediaDSRHE,
          bonusValor: vacationPeriods.bonusValor,
          bonusDesc: vacationPeriods.bonusDesc,
          arredondamentoProvento: vacationPeriods.arredondamentoProvento,
          pensaoDesconto: vacationPeriods.pensaoDesconto,
          outrosDescontos: vacationPeriods.outrosDescontos,
          outrosDescontosDesc: vacationPeriods.outrosDescontosDesc,
          reciboUrl: vacationPeriods.reciboUrl,
          reciboNome: vacationPeriods.reciboNome,
          numeroPeriodo: vacationPeriods.numeroPeriodo,
          dataPagamento: vacationPeriods.dataPagamento,
          status: vacationPeriods.status,
          vencida: vacationPeriods.vencida,
          pagamentoEmDobro: vacationPeriods.pagamentoEmDobro,
          observacoes: vacationPeriods.observacoes,
          faltasInjustificadas: vacationPeriods.faltasInjustificadas,
          diasDireitoOriginal: vacationPeriods.diasDireitoOriginal,
          dataSugeridaInicio: vacationPeriods.dataSugeridaInicio,
          dataSugeridaFim: vacationPeriods.dataSugeridaFim,
          createdAt: vacationPeriods.createdAt,
          dataAgendamento: vacationPeriods.dataAgendamento,
          employeeName: employees.nomeCompleto,
          employeeCpf: employees.cpf,
          employeeCargo: employees.cargo,
          employeeFuncao: employees.funcao,
          employeeFotoUrl: employees.fotoUrl,
          // Rev. 4865 — obra atual (alocação ativa) p/ o lembrete de gozo
          employeeObraNome: sql<string | null>`(
            SELECT o.nome FROM obra_funcionarios ofc
            JOIN obras o ON o.id = ofc."obraId"
            WHERE ofc."employeeId" = ${employees.id} AND ofc."isActive" = 1
            ORDER BY ofc.id DESC LIMIT 1
          )`.as("employeeObraNome"),
          employeeSetor: employees.setor,
          employeeSalario: employees.salarioBase,
          // Rev. 1701 — exposição p/ tag "Direito de férias perdido por afastamento >180 dias"
          // (CLT Art. 133, IV) também na lista principal de períodos.
          employeeStatus: employees.status,
          employeeLicencaDataInicio: employees.licencaDataInicio,
          employeeLicencaTipo: employees.licencaTipo,
        })
        .from(vacationPeriods)
        .innerJoin(employees, eq(vacationPeriods.employeeId, employees.id))
        .where(and(...conditions))
        .orderBy(desc(vacationPeriods.periodoConcessivoFim));
        
        // Corrigir status/vencida dinamicamente com base na data atual
        const hojeStr = new Date().toISOString().split('T')[0];
        const rowsComStatus = rows.map(r => {
          const isPendente = r.status === 'pendente';
          const estaVencida = isPendente && r.periodoConcessivoFim && r.periodoConcessivoFim < hojeStr;
          if (estaVencida) return { ...r, vencida: 1, status: 'vencida' as any };
          return r;
        });

        // Recálculo apenas quando valores não foram definidos manualmente no banco
        const recalculated = rowsComStatus.map(r => {
          try {
            // Se o usuário já salvou valores manualmente, respeitar esses valores
            const temValorManual = r.valorFerias && parseFloat(r.valorFerias) > 0;
            if (temValorManual) return r;

            const salAtual = parseBRL(r.employeeSalario || '0');
            const diasGozo = r.diasGozo || 30;
            const abono = r.abonoPecuniario ? 1 : 0;
            const diasAbono = abono ? Math.floor(diasGozo / 3) : 0;
            const diasEfetivos = diasGozo - diasAbono;
            if (salAtual > 0) {
              const valorFerias = (salAtual / 30) * diasEfetivos;
              const terco = valorFerias / 3;
              const valorAbono = abono ? ((salAtual / 30) * diasAbono + (salAtual / 30) * diasAbono / 3) : 0;
              const pagDobro = r.pagamentoEmDobro === 1;
              const mult = pagDobro ? 2 : 1;
              const totalRecalc = (valorFerias + terco + valorAbono) * mult;
              return {
                ...r,
                valorFerias: (valorFerias * mult).toFixed(2),
                valorTercoConstitucional: (terco * mult).toFixed(2),
                valorTotal: totalRecalc.toFixed(2),
              };
            }
          } catch {}
          return r;
        });
        return recalculated;
      }),

    calendario: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), ano: z.number() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const inicioAno = `${input.ano}-01-01`;
        const fimAno = `${input.ano}-12-31`;
        
        const rows = await db.select({
          id: vacationPeriods.id,
          employeeId: vacationPeriods.employeeId,
          dataInicio: vacationPeriods.dataInicio,
          dataFim: vacationPeriods.dataFim,
          diasGozo: vacationPeriods.diasGozo,
          valorTotal: vacationPeriods.valorTotal,
          status: vacationPeriods.status,
          employeeName: employees.nomeCompleto,
          employeeCargo: employees.cargo,
          employeeSalario: employees.salarioBase,
        })
        .from(vacationPeriods)
        .innerJoin(employees, eq(vacationPeriods.employeeId, employees.id))
        .where(and(
          companyFilter(vacationPeriods.companyId, input),
          isNull(vacationPeriods.deletedAt),
          sql`${employees.status} NOT IN ('Desligado', 'Lista_Negra')`,
          isNull(employees.deletedAt),
          sql`(${vacationPeriods.dataInicio} BETWEEN ${inicioAno} AND ${fimAno} OR ${vacationPeriods.periodoConcessivoFim} BETWEEN ${inicioAno} AND ${fimAno})`,
        ))
        .orderBy(asc(vacationPeriods.dataInicio));
        
        return rows;
      }),

    alertas: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const hoje = new Date().toISOString().split("T")[0];
        const em60dias = new Date();
        em60dias.setDate(em60dias.getDate() + 60);
        const em60diasStr = em60dias.toISOString().split("T")[0];
        
        const vencidas = await db.select({
          id: vacationPeriods.id,
          employeeId: vacationPeriods.employeeId,
          periodoConcessivoFim: vacationPeriods.periodoConcessivoFim,
          status: vacationPeriods.status,
          numeroPeriodo: vacationPeriods.numeroPeriodo,
          employeeName: employees.nomeCompleto,
          employeeCargo: employees.cargo,
        })
        .from(vacationPeriods)
        .innerJoin(employees, eq(vacationPeriods.employeeId, employees.id))
        .where(and(
          companyFilter(vacationPeriods.companyId, input),
          isNull(vacationPeriods.deletedAt),
          sql`${employees.status} NOT IN ('Desligado', 'Lista_Negra')`,
          isNull(employees.deletedAt),
          eq(vacationPeriods.status, 'pendente'),
          sql`${vacationPeriods.periodoConcessivoFim} < ${hoje}`,
          // Rev. 1613 — Sócios e PJ não têm direito a férias (CLT Art. 129)
          sql`(${employees.tipoContrato} IS NULL OR ${employees.tipoContrato} NOT IN ('PJ','Socio'))`,
        ));
        
        // Prestes a vencer = todos os próximos 60 dias (1º e 2º período)
        const prestesVencer = await db.select({
          id: vacationPeriods.id,
          employeeId: vacationPeriods.employeeId,
          periodoConcessivoFim: vacationPeriods.periodoConcessivoFim,
          status: vacationPeriods.status,
          numeroPeriodo: vacationPeriods.numeroPeriodo,
          employeeName: employees.nomeCompleto,
          employeeCargo: employees.cargo,
        })
        .from(vacationPeriods)
        .innerJoin(employees, eq(vacationPeriods.employeeId, employees.id))
        .where(and(
          companyFilter(vacationPeriods.companyId, input),
          isNull(vacationPeriods.deletedAt),
          sql`${employees.status} NOT IN ('Desligado', 'Lista_Negra')`,
          isNull(employees.deletedAt),
          eq(vacationPeriods.status, 'pendente'),
          sql`${vacationPeriods.periodoConcessivoFim} BETWEEN ${hoje} AND ${em60diasStr}`,
          // Rev. 1613 — Sócios e PJ não têm direito a férias (CLT Art. 129)
          sql`(${employees.tipoContrato} IS NULL OR ${employees.tipoContrato} NOT IN ('PJ','Socio'))`,
        ));
        
        return { vencidas, prestesVencer };
      }),

    gerarPeriodos: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), employeeId: z.number() }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        const [emp] = await db.select().from(employees).where(eq(employees.id, input.employeeId));
        if (!emp || !emp.dataAdmissao) throw new TRPCError({ code: "BAD_REQUEST", message: "Funcionário sem data de admissão" });
        // Rev. 1613 — Sócios e PJ não têm direito a férias (CLT Art. 129)
        const tipoLower = (emp.tipoContrato || '').toLowerCase();
        if (tipoLower === 'pj' || tipoLower === 'socio' || tipoLower === 'sócio') {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Sócios e Prestadores de serviço (PJ) não têm direito a férias" });
        }
        
        const periodos = calcularPeriodosFerias(emp.dataAdmissao);
        
        const existentes = await db.select({ periodoAquisitivoInicio: vacationPeriods.periodoAquisitivoInicio })
          .from(vacationPeriods)
          .where(and(
            companyFilter(vacationPeriods.companyId, input),
            eq(vacationPeriods.employeeId, input.employeeId),
            isNull(vacationPeriods.deletedAt),
          ));
        
        const existentesSet = new Set(existentes.map(e => e.periodoAquisitivoInicio));
        let criados = 0;
        
        for (const p of periodos) {
          if (p.adquirido && !existentesSet.has(p.inicio)) {
            const statusPeriodo = p.antigoPreSistema ? 'concluida' : (p.vencida ? 'vencida' : 'pendente');
            await db.insert(vacationPeriods).values({
              companyId: input.companyId,
              employeeId: input.employeeId,
              periodoAquisitivoInicio: p.inicio,
              periodoAquisitivoFim: p.fim,
              periodoConcessivoFim: p.fimConcessivo,
              status: statusPeriodo,
              vencida: p.vencida ? 1 : 0,
              pagamentoEmDobro: 0,
              observacoes: p.antigoPreSistema ? 'Período anterior ao sistema — considerado como pago' : undefined,
            });
            criados++;
          }
        }
        
        return { success: true, periodosGerados: criados };
      }),

    fluxoCaixa: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), ano: z.number() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        
        const funcs = await db.select({
          id: employees.id,
          nome: employees.nomeCompleto,
          dataAdmissao: employees.dataAdmissao,
          salario: employees.salarioBase,
          cargo: employees.cargo,
          status: employees.status,
          tipoContrato: employees.tipoContrato,
        })
        .from(employees)
        .where(and(
          companyFilter(employees.companyId, input),
          eq(employees.status, 'Ativo'),
          isNull(employees.deletedAt),
          // Rev. 1613 — Sócios e PJ não têm direito a férias (CLT Art. 129)
          sql`(${employees.tipoContrato} IS NULL OR ${employees.tipoContrato} NOT IN ('PJ','Socio'))`,
        ));
        
        // Also fetch DB vacation periods to get actual status (agendada, em_gozo, etc.)
        // Rev. 1879: também projetamos `dataPagamento` p/ marcar o que JÁ FOI PAGO.
        const dbPeriods = await db.select({
          employeeId: vacationPeriods.employeeId,
          periodoAquisitivoInicio: vacationPeriods.periodoAquisitivoInicio,
          periodoAquisitivoFim: vacationPeriods.periodoAquisitivoFim,
          status: vacationPeriods.status,
          dataInicio: vacationPeriods.dataInicio,
          dataFim: vacationPeriods.dataFim,
          dataPagamento: vacationPeriods.dataPagamento,
        })
        .from(vacationPeriods)
        .where(and(
          companyFilter(vacationPeriods.companyId, input),
          isNull(vacationPeriods.deletedAt),
        ));
        // Map: employeeId -> { periodoKey -> { status, dataPagamento } }
        const dbInfoMap: Record<number, Record<string, { status: string; dataPagamento: string | null }>> = {};
        for (const dp of dbPeriods) {
          if (!dbInfoMap[dp.employeeId]) dbInfoMap[dp.employeeId] = {};
          const key = `${dp.periodoAquisitivoInicio}_${dp.periodoAquisitivoFim}`;
          dbInfoMap[dp.employeeId][key] = { status: dp.status, dataPagamento: dp.dataPagamento };
        }
        const hojeStr = new Date().toISOString().split('T')[0];

        const meses: any[] = [];
        for (let mes = 0; mes < 12; mes++) {
          const inicioMes = new Date(input.ano, mes, 1);
          const fimMes = new Date(input.ano, mes + 1, 0);
          const funcionariosNoMes: any[] = [];
          let totalMes = 0;
          
          for (const func of funcs) {
            if (!func.dataAdmissao) continue;
            if (func.tipoContrato && func.tipoContrato.toLowerCase() === 'pj') continue;
            const periodos = calcularPeriodosFerias(func.dataAdmissao);
            
            for (let pi = 0; pi < periodos.length; pi++) {
              const p = periodos[pi];
              if (!p.adquirido) continue;
              const fimConcessivo = new Date(p.fimConcessivo);
              if (fimConcessivo >= inicioMes && fimConcessivo <= new Date(input.ano, mes + 3, 0)) {
                const salario = parseBRL(func.salario);
                const tercoConstitucional = salario / 3;
                const valorFerias = salario + tercoConstitucional;
                totalMes += valorFerias;
                // Determine status: check DB first, then fallback to calculated
                const periodoKey = `${p.inicio}_${p.fim}`;
                const dbInfo = dbInfoMap[func.id]?.[periodoKey];
                const dbStatus = dbInfo?.status;
                const dataPagamento = dbInfo?.dataPagamento || null;
                let fStatus = 'prevista';
                if (dbStatus && dbStatus !== 'pendente') {
                  fStatus = dbStatus;
                } else if (p.vencida) {
                  fStatus = 'vencida';
                }
                // Rev. 1879: PAGO = status concluído ou em_gozo (financeiro já saiu)
                // OU dataPagamento gravada e <= hoje (agendada com pagto efetuado).
                // Vencida/prevista/agendada s/ dataPag no passado = A PAGAR.
                const pago = (fStatus === 'concluida' || fStatus === 'em_gozo')
                  || !!(dataPagamento && dataPagamento <= hojeStr);

                funcionariosNoMes.push({
                  id: func.id,
                  nome: func.nome,
                  cargo: func.cargo,
                  salario: func.salario,
                  salarioBase: salario.toFixed(2),
                  tercoConstitucional: tercoConstitucional.toFixed(2),
                  valorEstimado: valorFerias.toFixed(2),
                  fimConcessivo: p.fimConcessivo,
                  vencida: p.vencida,
                  status: fStatus,
                  pago,
                  dataPagamento,
                  numeroPeriodo: pi + 1,       // 1 = 1º período, 2 = 2º período, etc.
                  inicioPeriodo: p.inicio,
                  fimPeriodo: p.fim,
                });
                break;
              }
            }
          }
          
          // Separar por período: 1º (mais flexível) vs 2º+ (sem possibilidade de prorrogação)
          const func1p = funcionariosNoMes.filter(f => f.numeroPeriodo === 1);
          const func2p = funcionariosNoMes.filter(f => f.numeroPeriodo > 1);
          const total1p = func1p.reduce((s: number, f: any) => s + parseFloat(f.valorEstimado), 0);
          const total2p = func2p.reduce((s: number, f: any) => s + parseFloat(f.valorEstimado), 0);

          const totalSalarioBase = funcionariosNoMes.reduce((s, f) => s + parseFloat(f.salarioBase), 0);
          const totalTerco = funcionariosNoMes.reduce((s, f) => s + parseFloat(f.tercoConstitucional), 0);
          // Rev. 1879: agregados de pago / a pagar por mês p/ a UI marcar e somar.
          const funcPagos = funcionariosNoMes.filter(f => f.pago);
          const funcAPagar = funcionariosNoMes.filter(f => !f.pago);
          const totalPago = funcPagos.reduce((s, f) => s + parseFloat(f.valorEstimado), 0);
          const totalAPagar = funcAPagar.reduce((s, f) => s + parseFloat(f.valorEstimado), 0);
          meses.push({
            mes: mes + 1,
            nomeMes: ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'][mes],
            totalFuncionarios: funcionariosNoMes.length,
            valorTotal: totalMes.toFixed(2),
            totalSalarioBase: totalSalarioBase.toFixed(2),
            totalTercoConstitucional: totalTerco.toFixed(2),
            funcionarios: funcionariosNoMes,
            // Separação 1º vs 2º+ período
            totalPrimeiroPeriodo: total1p.toFixed(2),
            totalSegundoPeriodoMais: total2p.toFixed(2),
            qtdFuncionarios1p: func1p.length,
            qtdFuncionarios2p: func2p.length,
            // Rev. 1879: já pago vs a pagar
            totalPago: totalPago.toFixed(2),
            totalAPagar: totalAPagar.toFixed(2),
            qtdPagos: funcPagos.length,
            qtdAPagar: funcAPagar.length,
          });
        }
        
        return meses;
      }),

    create: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), employeeId: z.number(),
        periodoAquisitivoInicio: z.string(),
        periodoAquisitivoFim: z.string(),
        periodoConcessivoFim: z.string(),
        dataInicio: z.string().optional(),
        dataFim: z.string().optional(),
        diasGozo: z.number().default(30),
        fracionamento: z.number().default(1),
        periodo2Inicio: z.string().optional(),
        periodo2Fim: z.string().optional(),
        periodo3Inicio: z.string().optional(),
        periodo3Fim: z.string().optional(),
        abonoPecuniario: z.number().default(0),
        observacoes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        const [emp] = await db.select().from(employees).where(eq(employees.id, input.employeeId));
        if (!emp) throw new TRPCError({ code: "NOT_FOUND" });
        
        const salario = parseBRL(emp.salarioBase);
        const diasGozo = input.diasGozo;
        const diasAbono = input.abonoPecuniario ? Math.floor(diasGozo / 3) : 0;
        const diasEfetivos = diasGozo - diasAbono;
        
        const valorFerias = (salario / 30) * diasEfetivos;
        const terco = valorFerias / 3;
        const valorAbono = input.abonoPecuniario ? (salario / 30) * diasAbono + ((salario / 30) * diasAbono / 3) : 0;
        const total = valorFerias + terco + valorAbono;
        
        let dataPagamento: string | null = null;
        if (input.dataInicio) {
          const dt = new Date(input.dataInicio + 'T00:00:00');
          dt.setDate(dt.getDate() - 2);
          dataPagamento = dt.toISOString().split("T")[0];
        }
        
        const criadoFerias = await db.insert(vacationPeriods).values({
          companyId: input.companyId,
          employeeId: input.employeeId,
          periodoAquisitivoInicio: input.periodoAquisitivoInicio,
          periodoAquisitivoFim: input.periodoAquisitivoFim,
          periodoConcessivoFim: input.periodoConcessivoFim,
          dataInicio: input.dataInicio || null,
          dataFim: input.dataFim || null,
          diasGozo,
          fracionamento: input.fracionamento,
          periodo2Inicio: input.periodo2Inicio || null,
          periodo2Fim: input.periodo2Fim || null,
          periodo3Inicio: input.periodo3Inicio || null,
          periodo3Fim: input.periodo3Fim || null,
          abonoPecuniario: input.abonoPecuniario,
          valorFerias: valorFerias.toFixed(2),
          valorTercoConstitucional: terco.toFixed(2),
          valorAbono: valorAbono.toFixed(2),
          valorTotal: total.toFixed(2),
          dataPagamento,
          status: input.dataInicio ? 'agendada' : 'pendente',
          // Rev. 3273 — carimba a data de agendamento quando já nasce "agendada"
          dataAgendamento: input.dataInicio ? new Date().toISOString() : null,
          aprovadoPor: ctx.user.name ?? 'Sistema',
          aprovadoPorUserId: ctx.user.id,
          observacoes: input.observacoes || null,
        }).returning({ id: vacationPeriods.id });

        // Corrige ponto automaticamente se já há período de gozo definido
        if (input.dataInicio) {
          corrigirPontoFuncionario(input.companyId, input.employeeId).catch(() => {});
          // Rev. 4711 — férias já nasce agendada → gera título no Contas a Pagar
          const novoId = criadoFerias?.[0]?.id;
          if (novoId) sincronizarFinanceiroFerias(novoId, ctx.user.name ?? 'Sistema').catch(() => {});
        }

        // Rev. 4679 — poka-yoke: agendou férias → Solicitação/Aviso de Férias
        // nasce automaticamente no dossiê p/ assinatura (pad ou FCSign).
        if (input.dataInicio) {
          (async () => {
            const { gerarRhDocumentoAutomatico, fmtDateBrDoc } = await import("./rhDocumentos");
            await gerarRhDocumentoAutomatico({
              companyId: input.companyId, employeeId: input.employeeId, tipo: "solicitacao_ferias",
              refTitulo: fmtDateBrDoc(input.dataInicio),
              extras: {
                feriasInicio: fmtDateBrDoc(input.dataInicio),
                feriasFim: fmtDateBrDoc(input.dataFim),
                feriasDias: String(diasGozo),
                aquisitivoInicio: fmtDateBrDoc(input.periodoAquisitivoInicio),
                aquisitivoFim: fmtDateBrDoc(input.periodoAquisitivoFim),
                abonoPecuniario: input.abonoPecuniario ? "Sim" : "Não",
              },
              criadoPorId: ctx.user.id, criadoPorNome: ctx.user.name,
            });
          })().catch((e) => console.warn("[FeriasDocAuto] create:", e));
        }
        return { success: true };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        dataInicio: z.string().optional(),
        dataFim: z.string().optional(),
        diasGozo: z.number().optional(),
        fracionamento: z.number().optional(),
        periodo2Inicio: z.string().optional(),
        periodo2Fim: z.string().optional(),
        periodo3Inicio: z.string().optional(),
        periodo3Fim: z.string().optional(),
        abonoPecuniario: z.number().optional(),
        status: z.string().optional(),
        observacoes: z.string().optional(),
        valorFerias: z.string().optional(),
        valorTercoConstitucional: z.string().optional(),
        valorAbono: z.string().optional(),
        valorTotal: z.string().optional(),
        mediaHE: z.string().optional(),
        mediaDSRHE: z.string().optional(),
        ajusteInss: z.string().optional(),
        valorLiquido: z.string().optional(),
        bonusValor: z.string().optional(),
        bonusDesc: z.string().optional(),
        pensaoDesconto: z.string().optional(),
        outrosDescontos: z.string().optional(),
        outrosDescontosDesc: z.string().optional(),
        arredondamentoProvento: z.string().optional(),
        dataPagamento: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        const { id, ...rest } = input;
        const updateData: any = {};
        Object.entries(rest).forEach(([k, v]) => { if (v !== undefined) updateData[k] = v; });
        // Rev. 3273 — ao passar a "agendada", carimba a data de agendamento preservando a 1ª (COALESCE)
        if (updateData.status === 'agendada') updateData.dataAgendamento = sql`COALESCE("dataAgendamento", NOW())`;
        await db.update(vacationPeriods).set(updateData).where(eq(vacationPeriods.id, id));

        // Rev. 4711 — agendou ou mexeu em valores/datas → gera/sincroniza o
        // título no Contas a Pagar (never-throw, não bloqueia o RH)
        if (input.status || input.dataInicio || input.dataPagamento || input.valorTotal || input.valorLiquido) {
          sincronizarFinanceiroFerias(id, ctx.user.name ?? 'Sistema').catch(() => {});
        }

        // Busca companyId e employeeId para sincronização de status e correção de ponto
        const [periodo] = await db.select({ companyId: vacationPeriods.companyId, employeeId: vacationPeriods.employeeId })
          .from(vacationPeriods).where(eq(vacationPeriods.id, id));

        // Sincronizar status do colaborador com status de férias
        if (input.status && periodo) {
          if (input.status === 'em_gozo') {
            const [empAnt] = await db.select({ status: employees.status, nomeCompleto: employees.nomeCompleto })
              .from(employees).where(eq(employees.id, periodo.employeeId));
            if (empAnt && empAnt.status !== 'Ferias') {
              await db.update(employees).set({ status: 'Ferias' } as any)
                .where(eq(employees.id, periodo.employeeId));
              await logStatusChange({
                db, companyId: periodo.companyId, employeeId: periodo.employeeId,
                nomeCompleto: empAnt.nomeCompleto, statusAnterior: empAnt.status || 'Ativo',
                statusNovo: 'Ferias', alteradoPor: ctx.user?.name ?? 'Sistema',
                alteradoPorUserId: ctx.user?.id, motivo: 'Início de período de férias',
                origemModulo: 'ferias.atualizarStatus',
              });
            }
          } else if (input.status === 'concluida') {
            const outrasEmGozo = await db.select({ id: vacationPeriods.id })
              .from(vacationPeriods)
              .where(and(
                eq(vacationPeriods.employeeId, periodo.employeeId),
                eq(vacationPeriods.status, 'em_gozo'),
                isNull(vacationPeriods.deletedAt),
              ));
            if (outrasEmGozo.length === 0) {
              const [empAnt2] = await db.select({ status: employees.status, nomeCompleto: employees.nomeCompleto })
                .from(employees).where(eq(employees.id, periodo.employeeId));
              if (empAnt2 && empAnt2.status === 'Ferias') {
                await db.update(employees).set({ status: 'Ativo' } as any)
                  .where(and(eq(employees.id, periodo.employeeId), eq(employees.status, 'Ferias')));
                await logStatusChange({
                  db, companyId: periodo.companyId, employeeId: periodo.employeeId,
                  nomeCompleto: empAnt2.nomeCompleto, statusAnterior: 'Ferias',
                  statusNovo: 'Ativo', alteradoPor: ctx.user?.name ?? 'Sistema',
                  alteradoPorUserId: ctx.user?.id, motivo: 'Férias concluídas',
                  origemModulo: 'ferias.atualizarStatus',
                });
              }
            }
          }
        }

        // Corrige ponto automaticamente se datas ou status mudaram
        if (periodo && (input.dataInicio || input.dataFim || input.periodo2Inicio || input.periodo3Inicio || input.status)) {
          corrigirPontoFuncionario(periodo.companyId, periodo.employeeId).catch(() => {});
        }

        // Rev. 4679 — poka-yoke: agendou/iniciou gozo → Solicitação de Férias;
        // registrou pagamento/valores → Recibo de Férias. Tudo automático,
        // com dedup por período (título carrega a data de início do gozo).
        if (periodo) {
          (async () => {
            const [vp] = await db.select().from(vacationPeriods).where(eq(vacationPeriods.id, id));
            if (!vp || !(vp as any).dataInicio) return;
            const { gerarRhDocumentoAutomatico, fmtDateBrDoc } = await import("./rhDocumentos");
            const base = {
              companyId: periodo.companyId, employeeId: periodo.employeeId,
              criadoPorId: ctx.user?.id, criadoPorNome: ctx.user?.name,
            };
            const extrasFerias = {
              feriasInicio: fmtDateBrDoc((vp as any).dataInicio),
              feriasFim: fmtDateBrDoc((vp as any).dataFim),
              feriasDias: String((vp as any).diasGozo ?? ""),
              aquisitivoInicio: fmtDateBrDoc((vp as any).periodoAquisitivoInicio),
              aquisitivoFim: fmtDateBrDoc((vp as any).periodoAquisitivoFim),
              abonoPecuniario: (vp as any).abonoPecuniario ? "Sim" : "Não",
            };
            if (input.status === "agendada" || input.status === "em_gozo" || input.dataInicio) {
              await gerarRhDocumentoAutomatico({
                ...base, tipo: "solicitacao_ferias",
                refTitulo: fmtDateBrDoc((vp as any).dataInicio), extras: extrasFerias,
              });
            }
            if ((input.dataPagamento || input.valorLiquido || input.status === "concluida") && (vp as any).valorLiquido) {
              await gerarRhDocumentoAutomatico({
                ...base, tipo: "recibo_ferias",
                refTitulo: fmtDateBrDoc((vp as any).dataInicio),
                extras: {
                  ...extrasFerias,
                  // valores gravados com ponto decimal (toFixed) → formata BRL
                  valorBruto: fmtBRLDoc((vp as any).valorTotal),
                  valorLiquido: fmtBRLDoc((vp as any).valorLiquido),
                  dataPagamento: fmtDateBrDoc((vp as any).dataPagamento),
                },
              });
            }
          })().catch((e) => console.warn("[FeriasDocAuto] update:", e));
        }

        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        await db.update(vacationPeriods).set({
          deletedAt: sql`NOW()`,
          deletedBy: ctx.user.name ?? 'Sistema',
          deletedByUserId: ctx.user.id,
        } as any).where(eq(vacationPeriods.id, input.id));
        // Rev. 4711 — excluiu o período → cancela o título do Contas a Pagar (se a_pagar)
        cancelarFinanceiroFerias(input.id, `período de férias excluído por ${ctx.user.name}`).catch(() => {});
        return { success: true };
      }),

    uploadReciboFerias: protectedProcedure
      .input(z.object({
        id: z.number(),
        fileBase64: z.string(),
        mimeType: z.enum(['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']),
        fileName: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        const [periodo] = await db.select({ id: vacationPeriods.id, companyId: vacationPeriods.companyId })
          .from(vacationPeriods)
          .where(eq(vacationPeriods.id, input.id));
        if (!periodo) throw new TRPCError({ code: 'NOT_FOUND', message: 'Período de férias não encontrado' });

        const ext = input.mimeType === 'application/pdf' ? 'pdf'
          : input.mimeType === 'image/png' ? 'png' : 'jpg';
        const randomSuffix = Math.random().toString(36).substring(2, 10);
        const fileKey = `ferias/${periodo.companyId}/${input.id}/recibo-ferias-${randomSuffix}.${ext}`;

        const buffer = Buffer.from(input.fileBase64, 'base64');
        const { url } = await storagePut(fileKey, buffer, input.mimeType);

        await db.execute(sql`
          UPDATE vacation_periods SET
            recibo_url = ${url},
            recibo_nome = ${input.fileName},
            "updatedAt" = NOW()
          WHERE id = ${input.id}
        `);

        await createAuditLog({
          userId: ctx.user.id,
          userName: ctx.user.name ?? 'Sistema',
          action: 'UPLOAD_RECIBO_FERIAS',
          module: 'ferias',
          entityType: 'vacationPeriods',
          entityId: input.id,
          details: `Recibo de férias enviado por ${ctx.user.name} — arquivo: ${input.fileName}`,
        });
        return { success: true, url, nome: input.fileName };
      }),

    removeReciboFerias: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        await db.execute(sql`
          UPDATE vacation_periods SET
            recibo_url = NULL,
            recibo_nome = NULL,
            "updatedAt" = NOW()
          WHERE id = ${input.id}
        `);
        await createAuditLog({
          userId: ctx.user.id,
          userName: ctx.user.name ?? 'Sistema',
          action: 'REMOVE_RECIBO_FERIAS',
          module: 'ferias',
          entityType: 'vacationPeriods',
          entityId: input.id,
          details: `Recibo de férias removido por ${ctx.user.name}`,
        });
        return { success: true };
      }),

    // ============================================================
    // GERAR PERÍODOS PARA TODOS OS ATIVOS DE UMA VEZ
    // ============================================================
    gerarPeriodosTodos: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        const ativos = await db.select({
          id: employees.id,
          nome: employees.nomeCompleto,
          dataAdmissao: employees.dataAdmissao,
          salario: employees.salarioBase,
          tipoContrato: employees.tipoContrato,
        })
        .from(employees)
        .where(and(
          companyFilter(employees.companyId, input),
          sql`${employees.status} NOT IN ('Desligado', 'Lista_Negra')`,
          isNull(employees.deletedAt),
          // Rev. 1613 — Sócios e PJ não têm direito a férias (CLT Art. 129)
          sql`(${employees.tipoContrato} IS NULL OR ${employees.tipoContrato} NOT IN ('PJ','Socio'))`,
        ));

        let totalCriados = 0;
        let funcionariosProcessados = 0;
        let funcionariosSemAdmissao = 0;

        for (const emp of ativos) {
          // Rev. 1613 — defesa em profundidade (PJ/Sócio)
          const tc = (emp.tipoContrato || '').toLowerCase();
          if (tc === 'pj' || tc === 'socio' || tc === 'sócio') continue;
          if (!emp.dataAdmissao) {
            funcionariosSemAdmissao++;
            continue;
          }
          funcionariosProcessados++;
          const periodos = calcularPeriodosFerias(emp.dataAdmissao);
          const existentes = await db.select({ periodoAquisitivoInicio: vacationPeriods.periodoAquisitivoInicio })
            .from(vacationPeriods)
            .where(and(
              companyFilter(vacationPeriods.companyId, input),
              eq(vacationPeriods.employeeId, emp.id),
              isNull(vacationPeriods.deletedAt),
            ));
          const existentesSet = new Set(existentes.map(e => e.periodoAquisitivoInicio));
          let numPeriodo = existentes.length;

          for (const p of periodos) {
            if (p.adquirido && !existentesSet.has(p.inicio)) {
              numPeriodo++;
              const fimConcessivo = new Date(p.fimConcessivo + 'T00:00:00');
              const sugeridaInicio = new Date(fimConcessivo);
              sugeridaInicio.setDate(sugeridaInicio.getDate() - 30);
              const sugeridaFim = new Date(fimConcessivo);
              sugeridaFim.setDate(sugeridaFim.getDate() - 1);

              const statusPeriodo = p.antigoPreSistema ? 'concluida' : (p.vencida ? 'vencida' : 'pendente');
              await db.insert(vacationPeriods).values({
                companyId: input.companyId,
                employeeId: emp.id,
                periodoAquisitivoInicio: p.inicio,
                periodoAquisitivoFim: p.fim,
                periodoConcessivoFim: p.fimConcessivo,
                status: statusPeriodo,
                vencida: p.vencida ? 1 : 0,
                pagamentoEmDobro: 0,
                numeroPeriodo: numPeriodo,
                dataSugeridaInicio: sugeridaInicio.toISOString().split('T')[0],
                dataSugeridaFim: sugeridaFim.toISOString().split('T')[0],
                observacoes: p.antigoPreSistema ? 'Período anterior ao sistema — considerado como pago' : undefined,
              });
              totalCriados++;
            }
          }
        }

        return {
          success: true,
          totalCriados,
          funcionariosProcessados,
          funcionariosSemAdmissao,
          totalAtivos: ativos.length,
        };
      }),

    // ============================================================
    // CONFIRMAR FÉRIAS VENCIDAS EM LOTE ("Já foi pago")
    // ============================================================
    confirmarVencidasLote: protectedProcedure
      .input(z.object({
        ids: z.array(z.number()),
        observacao: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        let confirmados = 0;
        const employeeIdsProcessados = new Set<number>();
        for (const id of input.ids) {
          const [p] = await db.select({ employeeId: vacationPeriods.employeeId }).from(vacationPeriods).where(eq(vacationPeriods.id, id));
          await db.update(vacationPeriods).set({
            status: 'concluida',
            observacoes: input.observacao || `Férias confirmadas como pagas por ${ctx.user.name} em ${new Date().toLocaleDateString('pt-BR')}`,
            aprovadoPor: ctx.user.name ?? 'Sistema',
            aprovadoPorUserId: ctx.user.id,
          } as any).where(eq(vacationPeriods.id, id));
          if (p) employeeIdsProcessados.add(p.employeeId);
          confirmados++;
          // Rev. 4711 — confirmada como paga fora do Contas a Pagar → cancela título a_pagar (evita pagamento em dobro)
          cancelarFinanceiroFerias(id, `férias confirmadas como pagas por ${ctx.user.name} (fora do Contas a Pagar)`).catch(() => {});
        }
        for (const empId of employeeIdsProcessados) {
          const outrasEmGozo = await db.select({ id: vacationPeriods.id }).from(vacationPeriods)
            .where(and(eq(vacationPeriods.employeeId, empId), eq(vacationPeriods.status, 'em_gozo'), isNull(vacationPeriods.deletedAt)));
          if (outrasEmGozo.length === 0) {
            const [empAntLote] = await db.select({ status: employees.status, nomeCompleto: employees.nomeCompleto, companyId: employees.companyId })
              .from(employees).where(eq(employees.id, empId));
            if (empAntLote && empAntLote.status === 'Ferias') {
              await db.update(employees).set({ status: 'Ativo' } as any)
                .where(and(eq(employees.id, empId), eq(employees.status, 'Ferias')));
              await logStatusChange({
                db, companyId: empAntLote.companyId, employeeId: empId,
                nomeCompleto: empAntLote.nomeCompleto, statusAnterior: 'Ferias',
                statusNovo: 'Ativo', alteradoPor: ctx.user?.name ?? 'Sistema',
                alteradoPorUserId: ctx.user?.id, motivo: 'Férias vencidas confirmadas em lote',
                origemModulo: 'ferias.confirmarVencidasLote',
              });
            }
          }
        }
        return { success: true, confirmados };
      }),

    // ============================================================
    // CONFIRMAR TODAS AS VENCIDAS DE UM FUNCIONÁRIO
    // ============================================================
    confirmarTodasVencidasFuncionario: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), employeeId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        const vencidas = await db.select({ id: vacationPeriods.id })
          .from(vacationPeriods)
          .where(and(
            companyFilter(vacationPeriods.companyId, input),
            eq(vacationPeriods.employeeId, input.employeeId),
            sql`(${vacationPeriods.status} = 'vencida' OR (${vacationPeriods.status} = 'pendente' AND ${vacationPeriods.periodoConcessivoFim} < CURRENT_DATE))`,
            isNull(vacationPeriods.deletedAt),
          ));
        let confirmados = 0;
        for (const v of vencidas) {
          await db.update(vacationPeriods).set({
            status: 'concluida',
            observacoes: `Férias confirmadas como pagas (lote) por ${ctx.user.name} em ${new Date().toLocaleDateString('pt-BR')}`,
            aprovadoPor: ctx.user.name ?? 'Sistema',
            aprovadoPorUserId: ctx.user.id,
          } as any).where(eq(vacationPeriods.id, v.id));
          confirmados++;
          // Rev. 4711 — confirmada como paga fora do Contas a Pagar → cancela título a_pagar
          cancelarFinanceiroFerias(v.id, `férias confirmadas como pagas por ${ctx.user.name} (fora do Contas a Pagar)`).catch(() => {});
        }
        const outrasEmGozo2 = await db.select({ id: vacationPeriods.id }).from(vacationPeriods)
          .where(and(eq(vacationPeriods.employeeId, input.employeeId), eq(vacationPeriods.status, 'em_gozo'), isNull(vacationPeriods.deletedAt)));
        if (outrasEmGozo2.length === 0) {
          const [empAntSingle] = await db.select({ status: employees.status, nomeCompleto: employees.nomeCompleto, companyId: employees.companyId })
            .from(employees).where(eq(employees.id, input.employeeId));
          if (empAntSingle && empAntSingle.status === 'Ferias') {
            await db.update(employees).set({ status: 'Ativo' } as any)
              .where(and(eq(employees.id, input.employeeId), eq(employees.status, 'Ferias')));
            await logStatusChange({
              db, companyId: empAntSingle.companyId, employeeId: input.employeeId,
              nomeCompleto: empAntSingle.nomeCompleto, statusAnterior: 'Ferias',
              statusNovo: 'Ativo', alteradoPor: ctx.user?.name ?? 'Sistema',
              alteradoPorUserId: ctx.user?.id, motivo: 'Férias vencidas confirmadas individualmente',
              origemModulo: 'ferias.confirmarVencidasIndividual',
            });
          }
        }
        return { success: true, confirmados };
      }),

    // ============================================================
    // CANCELAR CONCLUSÃO DE FÉRIAS (somente ADM Master)
    // ============================================================
    cancelarConclusaoFerias: protectedProcedure
      .input(z.object({
        id: z.number(),
        motivo: z.string().min(1, 'Motivo é obrigatório'),
      }))
      .mutation(async ({ input, ctx }) => {
        // Restrito a ADM Master
        if (ctx.user.role !== 'admin_master') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas o ADM Master pode cancelar férias concluídas.' });
        }
        const db = (await getDb())!;
        const [periodo] = await db.select().from(vacationPeriods).where(eq(vacationPeriods.id, input.id));
        if (!periodo) throw new TRPCError({ code: 'NOT_FOUND', message: 'Período de férias não encontrado.' });
        if (periodo.status !== 'concluida') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Apenas férias com status Concluída podem ser canceladas.' });
        }
        // Determinar novo status: se período concessivo já venceu, volta como vencida; senão, pendente
        const hoje = new Date();
        const fimConcessivo = new Date(periodo.periodoConcessivoFim + 'T00:00:00');
        const novoStatus = fimConcessivo < hoje ? 'vencida' : 'pendente';
        const obsAnterior = periodo.observacoes || '';
        const novaObs = `[CONCLUSÃO CANCELADA] por ${ctx.user.name} em ${new Date().toLocaleDateString('pt-BR')}. Motivo: ${input.motivo}${obsAnterior ? '\n---\n' + obsAnterior : ''}`;
        await db.update(vacationPeriods).set({
          status: novoStatus,
          observacoes: novaObs,
          vencida: novoStatus === 'vencida' ? 1 : 0,
        } as any).where(eq(vacationPeriods.id, input.id));
        // Rev. 4711 — conclusão cancelada volta p/ pendente/vencida → título a_pagar não faz mais sentido
        cancelarFinanceiroFerias(input.id, `conclusão de férias cancelada por ${ctx.user.name}`).catch(() => {});
        return { success: true, novoStatus };
      }),

    // ============================================================
    // REVERTER FÉRIAS EM GOZO → AGENDADA (cancelamento / erro de preenchimento)
    // ============================================================
    reverterEmGozo: protectedProcedure
      .input(z.object({
        id: z.number(),
        motivo: z.string().min(1, 'Motivo é obrigatório'),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        const [periodo] = await db.select().from(vacationPeriods).where(eq(vacationPeriods.id, input.id));
        if (!periodo) throw new TRPCError({ code: 'NOT_FOUND', message: 'Período de férias não encontrado.' });
        if (periodo.status !== 'em_gozo') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Apenas férias com status "Em Gozo" podem ser revertidas.' });
        }

        try {
          const obsAnterior = periodo.observacoes || '';
          const novaObs = `[REVERTIDA DE EM GOZO] por ${ctx.user.name} em ${new Date().toLocaleDateString('pt-BR')}. Motivo: ${input.motivo}${obsAnterior ? '\n---\n' + obsAnterior : ''}`;
          const novoStatus = periodo.dataInicio ? 'agendada' : 'pendente';
          await db.update(vacationPeriods).set({
            status: novoStatus,
            observacoes: novaObs,
            // Rev. 3273 — ao reverter p/ agendada, mantém a data de agendamento original (ou carimba agora)
            ...(novoStatus === 'agendada' ? { dataAgendamento: (periodo as any).dataAgendamento || new Date().toISOString() } : {}),
          } as any).where(eq(vacationPeriods.id, input.id));

          try {
            const outrasEmGozo = await db.select({ id: vacationPeriods.id })
              .from(vacationPeriods)
              .where(and(
                eq(vacationPeriods.employeeId, periodo.employeeId),
                eq(vacationPeriods.status, 'em_gozo'),
                isNull(vacationPeriods.deletedAt),
              ));
            if (outrasEmGozo.length === 0) {
              const [empAnt] = await db.select({ status: employees.status, nomeCompleto: employees.nomeCompleto })
                .from(employees).where(eq(employees.id, periodo.employeeId));
              if (empAnt && empAnt.status === 'Ferias') {
                await db.update(employees).set({ status: 'Ativo' } as any)
                  .where(and(eq(employees.id, periodo.employeeId), eq(employees.status, 'Ferias')));
                await logStatusChange({
                  db, companyId: periodo.companyId, employeeId: periodo.employeeId,
                  nomeCompleto: empAnt.nomeCompleto, statusAnterior: 'Ferias',
                  statusNovo: 'Ativo', alteradoPor: ctx.user?.name ?? 'Sistema',
                  alteradoPorUserId: ctx.user?.id, motivo: `Férias revertidas de Em Gozo: ${input.motivo}`,
                  origemModulo: 'ferias.reverterEmGozo',
                });
              }
            }
          } catch (empErr) {
            console.error('[reverterEmGozo] Erro ao atualizar status do colaborador:', empErr);
          }

          await createAuditLog({
            userId: ctx.user.id,
            userName: ctx.user.name ?? 'Sistema',
            action: 'REVERTER_FERIAS_EM_GOZO',
            module: 'ferias',
            entityType: 'vacationPeriods',
            entityId: input.id,
            details: `Férias revertidas de Em Gozo para ${novoStatus}. Motivo: ${input.motivo}`,
          });

          // Rev. 4711 — agendada mantém/sincroniza o título; pendente (sem data) cancela
          if (novoStatus === 'agendada') sincronizarFinanceiroFerias(input.id, ctx.user.name ?? 'Sistema').catch(() => {});
          else cancelarFinanceiroFerias(input.id, `férias revertidas para pendente por ${ctx.user.name}`).catch(() => {});

          return { success: true, novoStatus };
        } catch (err: any) {
          console.error('[reverterEmGozo] Erro:', err);
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: err?.message || 'Erro ao reverter férias.' });
        }
      }),

    // ============================================================
    // CANCELAR AGENDAMENTO DE FÉRIAS (agendada → pendente) — Rev. 3275
    // Volta o período para "A Vencer", limpando as datas do gozo
    // (início/fim/pagamento/agendamento). Mantém valores calculados e
    // registra o cancelamento em observações + auditoria.
    // ============================================================
    cancelarAgendamento: protectedProcedure
      .input(z.object({
        id: z.number(),
        motivo: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        const [periodo] = await db.select().from(vacationPeriods).where(eq(vacationPeriods.id, input.id));
        if (!periodo) throw new TRPCError({ code: 'NOT_FOUND', message: 'Período de férias não encontrado.' });
        // Guard de tenant (anti-IDOR): o usuário precisa ter acesso à empresa do
        // período (admin/admin_master = global). Evita cancelar agendamento de outro tenant via id.
        const empresasUsuario = await getCompaniesForUser(ctx.user.id, ctx.user.role);
        if (periodo.companyId != null && !empresasUsuario.some(c => c.id === periodo.companyId)) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem acesso a este período de férias.' });
        }
        if (periodo.status !== 'agendada') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Apenas férias com status "Agendada" podem ter o agendamento cancelado.' });
        }

        try {
          const motivo = (input.motivo || '').trim();
          const obsAnterior = periodo.observacoes || '';
          const novaObs = `[AGENDAMENTO CANCELADO] por ${ctx.user.name} em ${new Date().toLocaleDateString('pt-BR')}.${motivo ? ' Motivo: ' + motivo : ''}${obsAnterior ? '\n---\n' + obsAnterior : ''}`;

          await db.update(vacationPeriods).set({
            status: 'pendente',
            dataInicio: null,
            dataFim: null,
            dataPagamento: null,
            dataAgendamento: null,
            observacoes: novaObs,
          } as any).where(eq(vacationPeriods.id, input.id));

          // Limpa eventual projeção de ponto criada pelo agendamento
          corrigirPontoFuncionario(periodo.companyId, periodo.employeeId).catch(() => {});

          // Rev. 4711 — cancela o título do Contas a Pagar (se ainda a_pagar)
          cancelarFinanceiroFerias(input.id, `agendamento de férias cancelado por ${ctx.user.name}`).catch(() => {});

          await createAuditLog({
            userId: ctx.user.id,
            userName: ctx.user.name ?? 'Sistema',
            action: 'CANCELAR_AGENDAMENTO_FERIAS',
            module: 'ferias',
            entityType: 'vacationPeriods',
            entityId: input.id,
            details: `Agendamento de férias cancelado (volta para A Vencer).${motivo ? ' Motivo: ' + motivo : ''}`,
          });

          return { success: true };
        } catch (err: any) {
          console.error('[cancelarAgendamento] Erro:', err);
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: err?.message || 'Erro ao cancelar agendamento de férias.' });
        }
      }),

    // ============================================================
    // REVERTER FÉRIAS CONCLUÍDA → EM GOZO (disponível a todos)
    // ============================================================
    reverterParaEmGozo: protectedProcedure
      .input(z.object({
        id: z.number(),
        motivo: z.string().min(1, 'Motivo é obrigatório'),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        const [periodo] = await db.select().from(vacationPeriods).where(eq(vacationPeriods.id, input.id));
        if (!periodo) throw new TRPCError({ code: 'NOT_FOUND', message: 'Período de férias não encontrado.' });
        if (periodo.status !== 'concluida') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Apenas férias com status "Concluída" podem ser revertidas para Em Gozo.' });
        }
        const obsAnterior = periodo.observacoes || '';
        const novaObs = `[REVERTIDA PARA EM GOZO] por ${ctx.user.name} em ${new Date().toLocaleDateString('pt-BR')}. Motivo: ${input.motivo}${obsAnterior ? '\n---\n' + obsAnterior : ''}`;
        await db.update(vacationPeriods).set({
          status: 'em_gozo',
          observacoes: novaObs,
        } as any).where(eq(vacationPeriods.id, input.id));
        // Rev. 4711 — voltou p/ em_gozo → garante título no Contas a Pagar (se não houver)
        sincronizarFinanceiroFerias(input.id, ctx.user.name ?? 'Sistema').catch(() => {});
        return { success: true };
      }),

    // ============================================================
    // CONSULTAR FALTAS INJUSTIFICADAS NO PERÍODO AQUISITIVO (Art. 130 CLT)
    // Retorna total de faltas e dias de férias resultantes
    // ============================================================
    consultarFaltasPeriodoAquisitivo: protectedProcedure
      .input(z.object({
        employeeId: z.number(),
        companyId: z.number(),
        companyIds: z.array(z.number()).optional(),
        periodoAquisitivoInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        periodoAquisitivoFim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const mesInicio = input.periodoAquisitivoInicio.substring(0, 7);
        const mesFim = input.periodoAquisitivoFim.substring(0, 7);

        const rows = await db.select({
          totalFaltas: pontoDescontosResumo.totalFaltasInjustificadas,
        })
        .from(pontoDescontosResumo)
        .where(and(
          companyFilter(pontoDescontosResumo.companyId, input),
          eq(pontoDescontosResumo.employeeId, input.employeeId),
          sql`${pontoDescontosResumo.mesReferencia} >= ${mesInicio}`,
          sql`${pontoDescontosResumo.mesReferencia} <= ${mesFim}`,
        ));

        const totalFaltas = rows.reduce((sum, r) => sum + (r.totalFaltas || 0), 0);
        const diasDireito = calcDiasFeriasPorFaltas(totalFaltas);

        return {
          totalFaltasInjustificadas: totalFaltas,
          diasDireito,
          perdeuDireito: diasDireito === 0,
          tabelaAplicada: totalFaltas <= 5 ? '0-5 faltas → 30 dias'
            : totalFaltas <= 14 ? '6-14 faltas → 24 dias'
            : totalFaltas <= 23 ? '15-23 faltas → 18 dias'
            : totalFaltas <= 32 ? '24-32 faltas → 12 dias'
            : 'Mais de 32 faltas → Perde o direito',
        };
      }),

    // ============================================================
    // RH DEFINE/ALTERA DATA DE FÉRIAS (com tracking de alteração)
    // Inclui: abono pecuniário (Art. 143 CLT) e redução por faltas (Art. 130 CLT)
    // ============================================================
    definirDataFerias: protectedProcedure
      .input(z.object({
        id: z.number(),
        dataInicio: z.string(),
        dataFim: z.string(),
        diasGozo: z.number().default(30),
        abonoPecuniario: z.number().default(0),
        observacoes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        const [periodo] = await db.select().from(vacationPeriods).where(eq(vacationPeriods.id, input.id));
        if (!periodo) throw new TRPCError({ code: 'NOT_FOUND', message: 'Período não encontrado' });

        const [emp] = await db.select().from(employees).where(eq(employees.id, periodo.employeeId));
        const salario = emp ? parseBRL(emp.salarioBase) : 0;

        const mesInicio = periodo.periodoAquisitivoInicio.substring(0, 7);
        const mesFim = periodo.periodoAquisitivoFim.substring(0, 7);
        const faltasRows = await db.select({
          totalFaltas: pontoDescontosResumo.totalFaltasInjustificadas,
        })
        .from(pontoDescontosResumo)
        .where(and(
          eq(pontoDescontosResumo.companyId, periodo.companyId),
          eq(pontoDescontosResumo.employeeId, periodo.employeeId),
          sql`${pontoDescontosResumo.mesReferencia} >= ${mesInicio}`,
          sql`${pontoDescontosResumo.mesReferencia} <= ${mesFim}`,
        ));
        const totalFaltas = faltasRows.reduce((sum, r) => sum + (r.totalFaltas || 0), 0);
        const diasDireito = calcDiasFeriasPorFaltas(totalFaltas);

        if (diasDireito === 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Funcionário perdeu o direito a férias neste período aquisitivo (${totalFaltas} faltas injustificadas). Art. 130 §1° CLT.`,
          });
        }

        let diasGozo = Math.min(input.diasGozo, diasDireito);
        let diasAbono = 0;
        let valorAbono = 0;

        if (input.abonoPecuniario === 1) {
          diasAbono = Math.floor(diasDireito / 3);
          diasGozo = diasDireito - diasAbono;
          valorAbono = (salario / 30) * diasAbono;
        }

        const valorFerias = (salario / 30) * diasGozo;
        const terco = (valorFerias + valorAbono) / 3;
        const total = valorFerias + terco + valorAbono;

        const dtFim = new Date(input.dataInicio + 'T00:00:00');
        dtFim.setDate(dtFim.getDate() + diasGozo - 1);

        const dtPag = new Date(input.dataInicio + 'T00:00:00');
        dtPag.setDate(dtPag.getDate() - 2);

        const foiAlterada = periodo.dataSugeridaInicio && periodo.dataSugeridaInicio !== input.dataInicio ? 1 : 0;

        await db.update(vacationPeriods).set({
          dataInicio: input.dataInicio,
          dataFim: dtFim.toISOString().split('T')[0],
          diasGozo: diasGozo,
          abonoPecuniario: input.abonoPecuniario,
          valorFerias: valorFerias.toFixed(2),
          valorTercoConstitucional: terco.toFixed(2),
          valorAbono: valorAbono > 0 ? valorAbono.toFixed(2) : null,
          valorTotal: total.toFixed(2),
          dataPagamento: dtPag.toISOString().split('T')[0],
          status: 'agendada',
          // Rev. 3273 — preserva a 1ª data de agendamento; carimba agora se ainda não houver
          dataAgendamento: (periodo as any).dataAgendamento || new Date().toISOString(),
          dataAlteradaPeloRh: foiAlterada,
          faltasInjustificadas: totalFaltas,
          diasDireitoOriginal: diasDireito,
          observacoes: input.observacoes || (foiAlterada ? `Data alterada pelo RH (${ctx.user.name}). Original: ${periodo.dataSugeridaInicio} a ${periodo.dataSugeridaFim}` : null),
          aprovadoPor: ctx.user.name ?? 'Sistema',
          aprovadoPorUserId: ctx.user.id,
        } as any).where(eq(vacationPeriods.id, input.id));

        corrigirPontoFuncionario(periodo.companyId, periodo.employeeId).catch(() => {});

        // Rev. 4711 — férias agendada pelo RH → gera/sincroniza título no Contas a Pagar
        sincronizarFinanceiroFerias(input.id, ctx.user.name ?? 'Sistema').catch(() => {});

        return {
          success: true,
          foiAlterada: !!foiAlterada,
          totalFaltas,
          diasDireito,
          diasGozo,
          diasAbono,
          abonoPecuniario: input.abonoPecuniario === 1,
        };
      }),

    // ============================================================
    // CALENDÁRIO COMPLETO (com dados sugeridos e status)
    // ============================================================
    calendarioCompleto: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), ano: z.number() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const inicioAno = `${input.ano}-01-01`;
        const fimAno = `${input.ano}-12-31`;

        // Buscar todos os períodos que têm data no ano OU concessivo no ano
        const rows = await db.select({
          id: vacationPeriods.id,
          employeeId: vacationPeriods.employeeId,
          periodoAquisitivoInicio: vacationPeriods.periodoAquisitivoInicio,
          periodoAquisitivoFim: vacationPeriods.periodoAquisitivoFim,
          periodoConcessivoFim: vacationPeriods.periodoConcessivoFim,
          dataInicio: vacationPeriods.dataInicio,
          dataFim: vacationPeriods.dataFim,
          dataSugeridaInicio: vacationPeriods.dataSugeridaInicio,
          dataSugeridaFim: vacationPeriods.dataSugeridaFim,
          dataAlteradaPeloRh: vacationPeriods.dataAlteradaPeloRh,
          numeroPeriodo: vacationPeriods.numeroPeriodo,
          diasGozo: vacationPeriods.diasGozo,
          valorTotal: vacationPeriods.valorTotal,
          status: vacationPeriods.status,
          vencida: vacationPeriods.vencida,
          observacoes: vacationPeriods.observacoes,
          employeeName: employees.nomeCompleto,
          employeeCargo: employees.cargo,
          employeeSalario: employees.salarioBase,
          employeeSetor: employees.setor,
        })
        .from(vacationPeriods)
        .innerJoin(employees, eq(vacationPeriods.employeeId, employees.id))
        .where(and(
          companyFilter(vacationPeriods.companyId, input),
          isNull(vacationPeriods.deletedAt),
          sql`${employees.status} NOT IN ('Desligado', 'Lista_Negra')`,
          isNull(employees.deletedAt),
          sql`(
            (${vacationPeriods.dataInicio} BETWEEN ${inicioAno} AND ${fimAno})
            OR (${vacationPeriods.dataSugeridaInicio} BETWEEN ${inicioAno} AND ${fimAno})
            OR (${vacationPeriods.periodoConcessivoFim} BETWEEN ${inicioAno} AND ${fimAno})
            OR (${vacationPeriods.status} IN ('pendente', 'vencida', 'agendada', 'em_gozo'))
          )`,
        ))
        .orderBy(asc(employees.nomeCompleto), asc(vacationPeriods.periodoAquisitivoInicio));

        return rows;
      }),

    // ============================================================
    // LISTAR VENCIDAS PARA CONFIRMAÇÃO
    // ============================================================
    listarVencidas: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const rows = await db.select({
          id: vacationPeriods.id,
          employeeId: vacationPeriods.employeeId,
          periodoAquisitivoInicio: vacationPeriods.periodoAquisitivoInicio,
          periodoAquisitivoFim: vacationPeriods.periodoAquisitivoFim,
          periodoConcessivoFim: vacationPeriods.periodoConcessivoFim,
          numeroPeriodo: vacationPeriods.numeroPeriodo,
          status: vacationPeriods.status,
          employeeName: employees.nomeCompleto,
          employeeCpf: employees.cpf,
          employeeCargo: employees.cargo,
          employeeFotoUrl: employees.fotoUrl,
          employeeDataAdmissao: employees.dataAdmissao,
          // Rev. 1694 — exposição p/ tag "Direito de férias perdido por afastamento >180 dias"
          // (CLT Art. 133, IV — auxílio-doença/INSS por mais de 6 meses no período aquisitivo)
          employeeStatus: employees.status,
          employeeLicencaDataInicio: employees.licencaDataInicio,
          employeeLicencaTipo: employees.licencaTipo,
        })
        .from(vacationPeriods)
        .innerJoin(employees, eq(vacationPeriods.employeeId, employees.id))
        .where(and(
          companyFilter(vacationPeriods.companyId, input),
          sql`(${vacationPeriods.status} = 'vencida' OR (${vacationPeriods.status} = 'pendente' AND ${vacationPeriods.periodoConcessivoFim} < CURRENT_DATE))`,
          isNull(vacationPeriods.deletedAt),
          sql`${employees.status} NOT IN ('Desligado', 'Lista_Negra')`,
          isNull(employees.deletedAt),
          // Rev. 1613 — Sócios e PJ não têm direito a férias (CLT Art. 129)
          sql`(${employees.tipoContrato} IS NULL OR ${employees.tipoContrato} NOT IN ('PJ','Socio'))`,
        ))
        .orderBy(asc(employees.nomeCompleto), asc(vacationPeriods.periodoAquisitivoInicio));

        // Agrupar por funcionário
        const grouped: Record<number, { employee: any; periodos: any[] }> = {};
        for (const r of rows) {
          if (!grouped[r.employeeId]) {
            // Rev. 1694 — calcula dias de afastamento contínuo a partir de
            // licencaDataInicio quando o status é Afastado/Licenca. Quando
            // ≥ 180, sinaliza perda do direito a férias do(s) período(s)
            // aquisitivo(s) sobrepostos (CLT Art. 133, IV).
            let diasAfastado: number | null = null;
            const isAfastado = r.employeeStatus === 'Afastado' || r.employeeStatus === 'Licenca' || r.employeeStatus === 'Licença';
            if (isAfastado && r.employeeLicencaDataInicio) {
              const ini = new Date(r.employeeLicencaDataInicio + 'T00:00:00');
              if (!isNaN(ini.getTime())) {
                const ms = Date.now() - ini.getTime();
                diasAfastado = Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
              }
            }
            grouped[r.employeeId] = {
              employee: {
                id: r.employeeId,
                nome: r.employeeName,
                cpf: r.employeeCpf,
                cargo: r.employeeCargo,
                fotoUrl: r.employeeFotoUrl || null,
                dataAdmissao: r.employeeDataAdmissao,
                status: r.employeeStatus,
                licencaDataInicio: r.employeeLicencaDataInicio,
                licencaTipo: r.employeeLicencaTipo,
                diasAfastado,
                perdeuFeriasPorAfastamento: diasAfastado !== null && diasAfastado >= 180,
              },
              periodos: [],
            };
          }
          grouped[r.employeeId].periodos.push({
            id: r.id,
            periodoAquisitivoInicio: r.periodoAquisitivoInicio,
            periodoAquisitivoFim: r.periodoAquisitivoFim,
            periodoConcessivoFim: r.periodoConcessivoFim,
            numeroPeriodo: r.numeroPeriodo,
          });
        }

        return Object.values(grouped);
      }),

    // ============================================================
    // MÉDIA DE HE + DSR PARA BASE DE CÁLCULO DAS FÉRIAS (Art. 142 CLT)
    // ============================================================
    mediaHEFerias: protectedProcedure
      .input(z.object({
        employeeId: z.number(),
        companyId: z.number(),
        periodoAquisitivoInicio: z.string(), // YYYY-MM-DD
        periodoAquisitivoFim: z.string(),    // YYYY-MM-DD
      }))
      .query(async ({ input }) => {
        const db = (await getDb())!;

        // Extrair mês-ano de início e fim do período aquisitivo (YYYY-MM)
        const mesInicio = input.periodoAquisitivoInicio.substring(0, 7);
        const mesFim    = input.periodoAquisitivoFim.substring(0, 7);

        // Calcular total de meses no período aquisitivo (sempre ~12, pode ser menor em período proporcional)
        const [anoI, mesI] = mesInicio.split("-").map(Number);
        const [anoF, mesF] = mesFim.split("-").map(Number);
        const mesesNoPeriodo = (anoF - anoI) * 12 + (mesF - mesI) + 1;

        // Buscar entradas de HE do funcionário dentro do período aquisitivo
        const heRows = await db
          .select({
            mesReferencia: hePeriods.mesReferencia,
            valorHEUtil:   hePeriodEmployees.valorHEUtil,
            valorHEFim:    hePeriodEmployees.valorHEFim,
            valorHETotal:  hePeriodEmployees.valorHETotal,
            salarioBruto:  hePeriodEmployees.salarioBruto,
            destinacao:    hePeriodEmployees.destinacao,
          })
          .from(hePeriodEmployees)
          .innerJoin(hePeriods, eq(hePeriodEmployees.hePeriodId, hePeriods.id))
          .where(and(
            eq(hePeriodEmployees.employeeId, input.employeeId),
            eq(hePeriodEmployees.companyId, input.companyId),
            sql`${hePeriods.mesReferencia} >= ${mesInicio}`,
            sql`${hePeriods.mesReferencia} <= ${mesFim}`,
          ))
          .orderBy(asc(hePeriods.mesReferencia));

        // Filtrar apenas "pagamento" (excluir banco de horas)
        const hePagamento = heRows.filter(r => (r.destinacao || "pagamento") === "pagamento");

        // Calcular média de HE e DSR por mês com dado disponível
        let somaHE  = 0;
        let somaDSR = 0;
        const detalhes: Array<{
          mes: string;
          valorHE: number;
          valorHEUtil: number;
          dsr: number;
          domingos: number;
          diasUteis: number;
        }> = [];

        for (const row of hePagamento) {
          const vHETotal = parseFloat(row.valorHETotal || "0");
          const vHEUtil  = parseFloat(row.valorHEUtil  || "0");

          // DSR das HE: só dias úteis geram DSR
          // DSR_HE = valorHEUtil × (domingos_do_mês / dias_úteis_do_mês)
          const [anoMes, mesMes] = row.mesReferencia.split("-").map(Number);
          const domingos  = contarDomingos(anoMes, mesMes);
          const totalDias = diasNoMes(anoMes, mesMes);
          const diasUteis = totalDias - domingos;
          const dsr = diasUteis > 0 ? vHEUtil * (domingos / diasUteis) : 0;

          somaHE  += vHETotal;
          somaDSR += dsr;

          detalhes.push({
            mes:         row.mesReferencia,
            valorHE:     vHETotal,
            valorHEUtil: vHEUtil,
            dsr:         Math.round(dsr * 100) / 100,
            domingos,
            diasUteis,
          });
        }

        const mesesComDados = hePagamento.length;
        const divisor = mesesComDados > 0 ? mesesComDados : 1;
        const mediaHE    = somaHE  / divisor;
        const mediaDSRHE = somaDSR / divisor;

        // Último salário bruto disponível no período (para referência)
        const ultimoSalario = hePagamento.length > 0
          ? parseFloat(hePagamento[hePagamento.length - 1].salarioBruto || "0")
          : 0;

        return {
          mediaHE:       Math.round(mediaHE    * 100) / 100,
          mediaDSRHE:    Math.round(mediaDSRHE * 100) / 100,
          mesesComDados,
          mesesNoPeriodo,
          dadosParciais: mesesComDados < mesesNoPeriodo,
          mesInicio,
          mesFim,
          salarioBrutoReferencia: ultimoSalario,
          detalhes,
        };
      }),

    // ============================================================
    // DETALHES COMPLETOS DE FÉRIAS DE UM FUNCIONÁRIO
    // ============================================================
    feriasDoFuncionario: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), employeeId: z.number() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        
        // Dados do funcionário
        const [emp] = await db.select({
          id: employees.id,
          nome: employees.nomeCompleto,
          cpf: employees.cpf,
          cargo: employees.cargo,
          setor: employees.setor,
          dataAdmissao: employees.dataAdmissao,
          salarioBase: employees.salarioBase,
          status: employees.status,
        })
        .from(employees)
        .where(eq(employees.id, input.employeeId));
        
        if (!emp) throw new TRPCError({ code: 'NOT_FOUND', message: 'Funcionário não encontrado' });
        
        // Períodos calculados (baseado na data de admissão)
        const periodosCalculados = emp.dataAdmissao ? calcularPeriodosFerias(emp.dataAdmissao) : [];
        
        // Períodos registrados no banco
        const periodosDb = await db.select({
          id: vacationPeriods.id,
          periodoAquisitivoInicio: vacationPeriods.periodoAquisitivoInicio,
          periodoAquisitivoFim: vacationPeriods.periodoAquisitivoFim,
          periodoConcessivoFim: vacationPeriods.periodoConcessivoFim,
          dataInicio: vacationPeriods.dataInicio,
          dataFim: vacationPeriods.dataFim,
          diasGozo: vacationPeriods.diasGozo,
          fracionamento: vacationPeriods.fracionamento,
          abonoPecuniario: vacationPeriods.abonoPecuniario,
          valorFerias: vacationPeriods.valorFerias,
          valorTercoConstitucional: vacationPeriods.valorTercoConstitucional,
          valorTotal: vacationPeriods.valorTotal,
          dataPagamento: vacationPeriods.dataPagamento,
          status: vacationPeriods.status,
          vencida: vacationPeriods.vencida,
          pagamentoEmDobro: vacationPeriods.pagamentoEmDobro,
          dataSugeridaInicio: vacationPeriods.dataSugeridaInicio,
          dataSugeridaFim: vacationPeriods.dataSugeridaFim,
          dataAlteradaPeloRh: vacationPeriods.dataAlteradaPeloRh,
          numeroPeriodo: vacationPeriods.numeroPeriodo,
          observacoes: vacationPeriods.observacoes,
          createdAt: vacationPeriods.createdAt,
        })
        .from(vacationPeriods)
        .where(and(
          companyFilter(vacationPeriods.companyId, input),
          eq(vacationPeriods.employeeId, input.employeeId),
          isNull(vacationPeriods.deletedAt),
        ))
        .orderBy(asc(vacationPeriods.periodoAquisitivoInicio));
        
        // Recalcular valores com salário atual
        const salAtual = parseBRL(emp.salarioBase || '0');
        const periodosRecalc = periodosDb.map(p => {
          const diasGozo = p.diasGozo || 30;
          const abono = p.abonoPecuniario ? 1 : 0;
          const diasAbono = abono ? Math.floor(diasGozo / 3) : 0;
          const diasEfetivos = diasGozo - diasAbono;
          if (salAtual > 0) {
            const vf = (salAtual / 30) * diasEfetivos;
            const terco = vf / 3;
            const va = abono ? ((salAtual / 30) * diasAbono + (salAtual / 30) * diasAbono / 3) : 0;
            const mult = p.pagamentoEmDobro === 1 ? 2 : 1;
            return { ...p, valorTotal: ((vf + terco + va) * mult).toFixed(2), valorFerias: (vf * mult).toFixed(2), valorTercoConstitucional: (terco * mult).toFixed(2) };
          }
          return p;
        });
        
        // Merge: períodos calculados que NÃO estão no banco
        const dbInicios = new Set(periodosDb.map(p => p.periodoAquisitivoInicio));
        const periodosNaoRegistrados = periodosCalculados
          .filter(p => p.adquirido && !dbInicios.has(p.inicio))
          .map((p, i) => ({
            id: null as number | null,
            tipo: 'nao_registrado' as const,
            periodoAquisitivoInicio: p.inicio,
            periodoAquisitivoFim: p.fim,
            periodoConcessivoFim: p.fimConcessivo,
            vencida: p.vencida,
            status: p.vencida ? 'vencida' : 'pendente',
            valorEstimado: salAtual > 0 ? (salAtual + salAtual / 3).toFixed(2) : '0.00',
          }));
        
        // Resumo
        // Vencidas: apenas períodos NÃO concluídos/cancelados que estão vencidos
        const statusFinalizados = ['concluida', 'cancelada'];
        const totalVencidas = periodosRecalc.filter(p => !statusFinalizados.includes(p.status) && (p.vencida === 1 || p.status === 'vencida')).length
          + periodosNaoRegistrados.filter(p => p.vencida).length;
        const totalRegistrados = periodosRecalc.length;
        const totalNaoRegistrados = periodosNaoRegistrados.length;
        const totalConcluidas = periodosRecalc.filter(p => p.status === 'concluida').length;
        const totalEmGozo = periodosRecalc.filter(p => p.status === 'em_gozo').length;
        // Valor estimado: apenas períodos pendentes/agendados/vencidos (não concluídos/cancelados)
        const valorTotalEstimado = periodosRecalc
          .filter(p => !statusFinalizados.includes(p.status))
          .reduce((sum, p) => sum + parseFloat(p.valorTotal || '0'), 0)
          + periodosNaoRegistrados.reduce((sum, p) => sum + parseFloat(p.valorEstimado || '0'), 0);
        
        return {
          funcionario: emp,
          periodosRegistrados: periodosRecalc,
          periodosNaoRegistrados,
          resumo: {
            totalPeriodos: totalRegistrados + totalNaoRegistrados,
            totalRegistrados,
            totalNaoRegistrados,
            totalVencidas,
            totalConcluidas,
            totalEmGozo,
            valorTotalEstimado: valorTotalEstimado.toFixed(2),
          },
        };
      }),
  }),
});

// ========================================================================
// JOB: Conclusão automática de férias quando o gozo termina
// ------------------------------------------------------------------------
// Para cada vacationPeriods com status='em_gozo' e dataFim < hoje, marca
// como 'concluida' e devolve o status do colaborador para 'Ativo' (apenas
// se não houver outra férias 'em_gozo'). Roda a cada 6h, com primeira
// execução 90s após o startup.
// ========================================================================

let feriasAutoConcludeInterval: NodeJS.Timeout | null = null;

export async function autoConcluirFeriasVencidas() {
  try {
    const db = (await getDb())!;
    const hojeStr = new Date().toISOString().slice(0, 10);

    const vencidas = await db
      .select({
        id: vacationPeriods.id,
        companyId: vacationPeriods.companyId,
        employeeId: vacationPeriods.employeeId,
        dataFim: vacationPeriods.dataFim,
      })
      .from(vacationPeriods)
      .where(and(
        eq(vacationPeriods.status, 'em_gozo'),
        sql`${vacationPeriods.dataFim} < ${hojeStr}`,
        isNull(vacationPeriods.deletedAt),
      ));

    if (vencidas.length === 0) {
      console.log("[FeriasAutoConclude] Nenhuma férias em gozo vencida — OK");
      return;
    }

    let concluidas = 0;
    let erros = 0;
    for (const v of vencidas) {
      try {
        await db.update(vacationPeriods)
          .set({ status: 'concluida' } as any)
          .where(eq(vacationPeriods.id, v.id));
        concluidas++;

        // Devolve status do funcionário para Ativo apenas se NÃO há outra
        // férias em gozo do mesmo colaborador.
        const outras = await db.select({ id: vacationPeriods.id })
          .from(vacationPeriods)
          .where(and(
            eq(vacationPeriods.employeeId, v.employeeId),
            eq(vacationPeriods.status, 'em_gozo'),
            isNull(vacationPeriods.deletedAt),
          ));
        if (outras.length === 0) {
          const [emp] = await db.select({ status: employees.status, nomeCompleto: employees.nomeCompleto })
            .from(employees).where(eq(employees.id, v.employeeId));
          if (emp && emp.status === 'Ferias') {
            await db.update(employees).set({ status: 'Ativo' } as any)
              .where(and(eq(employees.id, v.employeeId), eq(employees.status, 'Ferias')));
            await logStatusChange({
              db, companyId: v.companyId, employeeId: v.employeeId,
              nomeCompleto: emp.nomeCompleto, statusAnterior: 'Ferias',
              statusNovo: 'Ativo', alteradoPor: 'Sistema (auto)',
              alteradoPorUserId: undefined,
              motivo: `Férias concluídas automaticamente (término do gozo em ${v.dataFim})`,
              origemModulo: 'ferias.autoConclude',
            });
          }
        }
        // Corrige ponto pós-conclusão.
        corrigirPontoFuncionario(v.companyId, v.employeeId).catch(() => {});
      } catch (e) {
        erros++;
        console.error(`[FeriasAutoConclude] Erro ao concluir férias id=${v.id}:`, e);
      }
    }

    console.log(`[FeriasAutoConclude] ${concluidas}/${vencidas.length} férias concluídas automaticamente${erros > 0 ? ` (${erros} erro(s))` : ''}.`);
  } catch (e) {
    console.error("[FeriasAutoConclude] Erro no job:", e);
  }
}

export function startFeriasAutoConcludeJob() {
  if (feriasAutoConcludeInterval) clearInterval(feriasAutoConcludeInterval);
  // Verificar a cada 6 horas.
  feriasAutoConcludeInterval = setInterval(autoConcluirFeriasVencidas, 6 * 60 * 60 * 1000);
  console.log("[FeriasAutoConclude] Job de conclusão automática de férias iniciado (verifica a cada 6h)");
  // Primeira execução com delay de 90s para não competir com o startup.
  setTimeout(autoConcluirFeriasVencidas, 90_000);
}
