import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb, getUserCompanyLinks } from "../db";
import { dissidios, dissidioFuncionarios, employees, payrollPayments, vacationPeriods, terminationNotices } from "../../drizzle/schema";
import { eq, and, sql, desc, inArray, isNull } from "drizzle-orm";
import { resolveCompanyIds, companyFilter } from "../companyHelper";
import { parseBRL } from "../utils/parseBRL";
import { calcularRescisaoComplementar, calcularINSSProgressivo, calcularIRRFProgressivo } from "../utils/rescisaoCalc";

// Rev. 3978 — ENCARGOS sobre a diferença retroativa do dissídio (paga À PARTE da
// folha mensal, com guia própria).
//
// Rev. 3990 — CORREÇÃO CRÍTICA: INSS/IRRF são tabelas PROGRESSIVAS POR FAIXA — rodar
// `calcularINSSProgressivo`/`calcularIRRFProgressivo` diretamente sobre o valor ISOLADO
// da diferença (ex.: R$115,91) reinicia as faixas do zero e aplica a alíquota mais baixa
// (7,5%) a quem já está, pela folha normal, na faixa de 9%/12%/14% — subestimando o
// desconto e inflando o líquido. O correto é a ALÍQUOTA MARGINAL: o quanto de INSS/IRRF
// a MAIS seria devido se a diferença tivesse sido paga junto da verba original, ou seja
// `encargo(baseAntes + diferença) - encargo(baseAntes)`, onde `baseAntes` é o valor
// (verbas) já recebido no(s) mês(es) retroativo(s) NO SALÁRIO ANTIGO. Validado contra
// conferência manual do usuário (ANA BEATRIZ: base R$2.261,96 + diferença R$115,91 →
// INSS marginal R$10,43 [faixa 9%] vs R$8,69 do cálculo antigo isolado [faixa 7,5%]).
// - tipo 'folha' (ativos): usa `diferencaBreakdownJson.baseVerbas` (já gravado na
//   aplicação do dissídio) como base "antes" — cobre salário+HE+férias do período.
// - tipo 'rescisao_complementar' (desligados): usa `diferencaBreakdownJson.baseReferencia`
//   (salário mensal de referência do desligado, gravado na aplicação) como base "antes"
//   para saldo de salário e para o 13º (bases isoladas, mesma regra de incidência
//   separada por verba já usada por `calcularRescisaoComplementar`); aviso prévio
//   indenizado permanece ISENTO de INSS/IRRF/FGTS (Súmulas 125/136 TST). Linhas antigas
//   sem `baseReferencia` gravado (aplicadas antes desta correção) caem no fallback
//   histórico (cálculo isolado) para não zerar retroativamente valores já conferidos.
export function calcularEncargosDiferenca(r: { diferencaTipo: string | null; valorRetroativo: string | null; diferencaBreakdownJson: any }) {
  const bruto = parseBRL(r.valorRetroativo);
  if (bruto <= 0) return { inss: 0, irrf: 0, fgts: 0, liquido: 0 };
  const bk = r.diferencaBreakdownJson || {};

  if (r.diferencaTipo === 'rescisao_complementar') {
    const saldoSalario = parseBRL(bk.saldoSalario);
    const decimo = parseBRL(bk.decimoTerceiroProporcional);
    const ferias = parseBRL(bk.totalFerias) + parseBRL(bk.feriasVencidas);
    const baseReferencia = parseBRL(bk.baseReferencia);

    if (baseReferencia > 0) {
      // Método marginal: cada verba usa a MESMA base de referência (salário mensal do
      // desligado) para achar a faixa — saldo/férias entram na base de INSS+IRRF do mês;
      // 13º mantém incidência ISOLADA (própria tabela, sem redutor simplificado).
      const inssSaldo = Math.max(0, calcularINSSProgressivo(baseReferencia + saldoSalario) - calcularINSSProgressivo(baseReferencia));
      const inssDecimo = Math.max(0, calcularINSSProgressivo(baseReferencia + decimo) - calcularINSSProgressivo(baseReferencia));
      const inss = inssSaldo + inssDecimo;

      const irBaseAntes = Math.max(0, baseReferencia - calcularINSSProgressivo(baseReferencia));
      const irBaseDepoisSaldo = Math.max(0, (baseReferencia + saldoSalario + ferias) - calcularINSSProgressivo(baseReferencia + saldoSalario));
      const irrfSaldoDepois = calcularIRRFProgressivo(irBaseDepoisSaldo, baseReferencia + saldoSalario + ferias);
      const irrfSaldoAntes = calcularIRRFProgressivo(irBaseAntes, baseReferencia);
      const irrfSaldo = Math.max(0, irrfSaldoDepois - irrfSaldoAntes);
      const irrfDecimoDepois = calcularIRRFProgressivo(baseReferencia + decimo, baseReferencia + decimo, true);
      const irrfDecimoAntes = calcularIRRFProgressivo(baseReferencia, baseReferencia, true);
      const irrfDecimo = Math.max(0, irrfDecimoDepois - irrfDecimoAntes);
      const irrf = irrfSaldo + irrfDecimo;

      const fgts = (saldoSalario + decimo) * 0.08;
      const liquido = Math.max(0, bruto - inss - irrf);
      return {
        inss: Number(inss.toFixed(2)),
        irrf: Number(irrf.toFixed(2)),
        fgts: Number(fgts.toFixed(2)),
        liquido: Number(liquido.toFixed(2)),
      };
    }

    // Fallback histórico (linhas aplicadas antes da Rev. 3990, sem baseReferencia gravada).
    const inss = calcularINSSProgressivo(saldoSalario) + calcularINSSProgressivo(decimo);
    const baseIrSaldo = saldoSalario + ferias;
    const irrf = calcularIRRFProgressivo(baseIrSaldo, baseIrSaldo)
      + calcularIRRFProgressivo(decimo, decimo, true);
    const fgts = (saldoSalario + decimo) * 0.08;
    const liquido = Math.max(0, bruto - inss - irrf);
    return {
      inss: Number(inss.toFixed(2)),
      irrf: Number(irrf.toFixed(2)),
      fgts: Number(fgts.toFixed(2)),
      liquido: Number(liquido.toFixed(2)),
    };
  }

  // tipo 'folha' (padrão) — método marginal usando a base já paga no(s) mês(es)
  // retroativo(s) (salário antigo) como referência de faixa.
  const baseAntes = parseBRL(bk.baseVerbas);
  const baseDepois = baseAntes + bruto;
  const inssAntes = calcularINSSProgressivo(baseAntes);
  const inssDepois = calcularINSSProgressivo(baseDepois);
  const inss = Math.max(0, inssDepois - inssAntes);
  const irBaseAntes = Math.max(0, baseAntes - inssAntes);
  const irBaseDepois = Math.max(0, baseDepois - inssDepois);
  const irrfAntes = calcularIRRFProgressivo(irBaseAntes, baseAntes);
  const irrfDepois = calcularIRRFProgressivo(irBaseDepois, baseDepois);
  const irrf = Math.max(0, irrfDepois - irrfAntes);
  const fgts = bruto * 0.08;
  const liquido = Math.max(0, bruto - inss - irrf);
  return {
    inss: Number(inss.toFixed(2)),
    irrf: Number(irrf.toFixed(2)),
    fgts: Number(fgts.toFixed(2)),
    liquido: Number(liquido.toFixed(2)),
  };
}

// Rev. 3278 — guard de tenant: nega acesso a empresa fora do escopo do usuário.
// admin/admin_master = global; usuário com vínculos só pode tocar as suas; sem
// vínculo = legado liberado (paridade com getCompaniesForUser). Aplica em TODOS
// os companyId/companyIds resolvidos do input (evita IDOR via companyId forjado).
async function assertCompanyAccess(ctxUser: any, input: { companyId: number; companyIds?: number[] }) {
  if (!ctxUser?.id) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
  if (ctxUser.role === "admin" || ctxUser.role === "admin_master") return;
  const links = await getUserCompanyLinks(ctxUser.id);
  const allowedIds = (links as any[]).map((l: any) => l.companyId).filter((v: any) => typeof v === "number");
  if (allowedIds.length === 0) return;
  for (const cid of resolveCompanyIds(input)) {
    if (!allowedIds.includes(cid)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
    }
  }
}

// ============================================================
// Rev. 3278 — DISSÍDIO com DATA DE VIGÊNCIA retroativa.
// Lista os meses "YYYY-MM" no intervalo [fromYM .. toYMExcl), ou seja, da
// vigência (inclusive) até o mês de aplicação (exclusive). Vazio quando o
// dissídio é aplicado no mesmo mês (ou antes) da vigência — aí não há
// diferença retroativa, só o reajuste daqui pra frente.
// ============================================================
function mesesRetroativosEntre(fromYM: string, toYMExcl: string): string[] {
  const out: string[] = [];
  let [y, m] = fromYM.split('-').map(Number);
  const [ty, tm] = toYMExcl.split('-').map(Number);
  if (!y || !m || !ty || !tm) return out;
  let guard = 0;
  while ((y < ty || (y === ty && m < tm)) && guard < 240) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++; if (m > 12) { m = 1; y++; }
    guard++;
  }
  return out;
}

// ============================================================
// MÓDULO SINDICAL — Configurações de Dissídio Simplificado
// Cadastro de ano + percentual de reajuste
// Aplicação em massa para todos os CLT ativos da empresa
// Regra: percentual NUNCA pode regredir (Art. 468 CLT)
// ============================================================

export const sindicalRouter = router({
  // Listar todos os dissídios cadastrados (ano + percentual + status)
  listar: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), })).query(async ({ input }) => {
    const db = (await getDb())!;
    const result = await db.select().from(dissidios)
      .where(companyFilter(dissidios.companyId, input))
      .orderBy(desc(dissidios.anoReferencia));
    return result;
  }),

  // Cadastrar novo ano de dissídio (ano + percentual)
  cadastrar: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), anoReferencia: z.number().min(2020).max(2050),
    percentualReajuste: z.string(),
    // Rev. 3278 — DATA DE VIGÊNCIA do acordo (a partir de quando o reajuste vale).
    // Se vier no passado, gera DIFERENÇA SALARIAL retroativa ao aplicar. Default = 01/05.
    dataVigencia: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas Admin Master pode cadastrar dissídios' });
    const db = (await getDb())!;

    // Verificar duplicidade
    const [existente] = await db.select().from(dissidios)
      .where(and(
        companyFilter(dissidios.companyId, input),
        eq(dissidios.anoReferencia, input.anoReferencia),
      ));
    if (existente) throw new TRPCError({ code: 'CONFLICT', message: `Já existe dissídio cadastrado para o ano ${input.anoReferencia}` });

    // ===== REGRA CRÍTICA: NUNCA REGREDIR =====
    const percentualNovo = parseFloat(input.percentualReajuste);
    if (isNaN(percentualNovo) || percentualNovo <= 0) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Percentual de reajuste deve ser maior que zero' });
    }

    const dissidiosAnteriores = await db.select().from(dissidios)
      .where(and(
        companyFilter(dissidios.companyId, input),
        sql`${dissidios.anoReferencia} < ${input.anoReferencia}`,
        sql`${dissidios.status} != 'cancelado'`,
      ))
      .orderBy(desc(dissidios.anoReferencia))
      .limit(1);

    if (dissidiosAnteriores.length > 0) {
      const percentualAnterior = parseFloat(dissidiosAnteriores[0].percentualReajuste);
      if (percentualNovo < percentualAnterior) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Percentual não pode ser menor que o ano anterior (${dissidiosAnteriores[0].anoReferencia}: ${percentualAnterior}%). Valor informado: ${percentualNovo}%. Art. 468 CLT — Vedada alteração contratual lesiva.`,
        });
      }
    }

    const [result] = await db.insert(dissidios).values({
      companyId: input.companyId,
      anoReferencia: input.anoReferencia,
      titulo: `Dissídio Coletivo ${input.anoReferencia}`,
      percentualReajuste: input.percentualReajuste,
      mesDataBase: 5, // Maio — padrão construção civil
      dataBaseInicio: `${input.anoReferencia}-05-01`,
      dataBaseFim: `${input.anoReferencia + 1}-04-30`,
      dataVigencia: input.dataVigencia || `${input.anoReferencia}-05-01`,
      status: 'rascunho',
      criadoPor: ctx.user.name || 'Sistema',
    });
    return { success: true, id: result[0].id };
  }),

  // Aplicar dissídio — reajusta TODOS os CLT ativos da empresa (sem exclusão individual)
  aplicar: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), anoReferencia: z.number(),
  })).mutation(async ({ input, ctx }) => {
    if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas Admin Master pode aplicar dissídios' });
    await assertCompanyAccess(ctx.user, input);
    const db = (await getDb())!;

    // Buscar o dissídio do ano
    const [dissidio] = await db.select().from(dissidios)
      .where(and(
        companyFilter(dissidios.companyId, input),
        eq(dissidios.anoReferencia, input.anoReferencia),
      ));
    if (!dissidio) throw new TRPCError({ code: 'NOT_FOUND', message: `Dissídio do ano ${input.anoReferencia} não encontrado` });
    if (dissidio.status === 'aplicado') throw new TRPCError({ code: 'BAD_REQUEST', message: `Dissídio de ${input.anoReferencia} já foi aplicado` });
    if (dissidio.status === 'cancelado') throw new TRPCError({ code: 'BAD_REQUEST', message: `Dissídio de ${input.anoReferencia} foi cancelado` });

    const percentual = parseFloat(dissidio.percentualReajuste);

    // ===== Rev. 3278 — DIFERENÇA SALARIAL retroativa (vigência no passado) =====
    // Meses entre a VIGÊNCIA do acordo e o mês da APLICAÇÃO (exclusive). Esses
    // meses já foram pagos no salário ANTIGO → geram diferença a pagar.
    const hoje = new Date();
    const mesAplicacao = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
    const vigenciaStr = (dissidio.dataVigencia || dissidio.dataBaseInicio || '').slice(0, 7);
    const mesesRetro = vigenciaStr ? mesesRetroativosEntre(vigenciaStr, mesAplicacao) : [];
    // Rev. 3969 — Se vigência == mês de aplicação, a folha daquele mês pode já ter
    // sido fechada/paga com o salário ANTIGO (ex.: dissídio vigente a partir de 01/05
    // mas aplicado no sistema ainda em maio, após o fechamento da folha). Nesses casos
    // inclui o próprio mês de vigência na lista retroativa.
    if (mesesRetro.length === 0 && vigenciaStr && vigenciaStr === mesAplicacao) {
      mesesRetro.push(vigenciaStr);
    }
    // A diferença é PAGA na folha do mês de aplicação (ex.: vigência maio,
    // aplicado em junho → linha "DIFERENÇA SALARIAL (ref. maio)" na folha de junho).
    const mesPagamento = mesAplicacao;

    // Pré-carregar as VERBAS de cada mês retroativo (somente quando há retroação),
    // somando em JS via parseBRL (formatos mistos no banco). A diferença incide
    // sobre salário bruto + férias. Rev. 3992 — HE é DELIBERADAMENTE excluída: toda
    // hora extra é compensada via banco de horas (nunca paga em dinheiro), então não
    // há valor monetário de HE a reajustar retroativamente.
    const salarioMap = new Map<number, number>();
    const feriasMap = new Map<number, number>();
    if (mesesRetro.length > 0) {
      const salarioRaw = await db.select({ employeeId: payrollPayments.employeeId, v: payrollPayments.salarioBrutoMes })
        .from(payrollPayments)
        .where(and(companyFilter(payrollPayments.companyId, input), inArray(payrollPayments.mesReferencia, mesesRetro)));
      for (const r of salarioRaw) salarioMap.set(r.employeeId, (salarioMap.get(r.employeeId) || 0) + parseBRL(r.v));

      const feriasRaw = await db.select({ employeeId: vacationPeriods.employeeId, v: vacationPeriods.valorTotal })
        .from(vacationPeriods)
        .where(and(
          companyFilter(vacationPeriods.companyId, input),
          inArray(sql`to_char(${vacationPeriods.dataPagamento}, 'YYYY-MM')`, mesesRetro),
        ));
      for (const r of feriasRaw) feriasMap.set(r.employeeId, (feriasMap.get(r.employeeId) || 0) + parseBRL(r.v));
    }

    // Buscar TODOS os funcionários CLT ativos (é lei, não tem exclusão)
    const funcs = await db.select().from(employees)
      .where(and(
        companyFilter(employees.companyId, input),
        sql`${employees.status} = 'Ativo'`,
        sql`${employees.tipoContrato} != 'PJ'`,
        sql`${employees.deletedAt} IS NULL`,
      ));

    let aplicados = 0;
    let diferencasGeradas = 0;
    let totalDiferencas = 0;
    const hojeStr = new Date().toISOString();

    // Rev. 3278 — TODAS as escritas (reajuste de salário, linhas de diferença,
    // complementares e flip do status do dissídio) numa transação ÚNICA: se algo
    // falhar no meio, rollback e a retentativa começa limpa (sem duplo reajuste
    // nem linhas órfãs em dissidio_funcionarios). O guard de status acima já barra
    // re-aplicação de um dissídio JÁ 'aplicado'.
    await db.transaction(async (tx) => {
    for (const func of funcs) {
      const salarioAtual = parseBRL(func.salarioBase);
      const salarioNovo = salarioAtual * (1 + percentual / 100);
      const diferencaSalario = salarioNovo - salarioAtual;
      const percentualReal = salarioAtual > 0 ? ((salarioNovo - salarioAtual) / salarioAtual * 100) : 0;

      // Diferença RETROATIVA sobre as verbas dos meses já pagos no valor antigo.
      // Rev. 3992 — horas extras NÃO entram na base: toda HE é compensada via banco
      // de horas (nunca paga em dinheiro), então não há valor monetário de HE para
      // reajustar retroativamente. Base = salário + férias apenas.
      let valorRetroativo = 0;
      let baseVerbas = 0;
      let breakdown: any = null;
      if (mesesRetro.length > 0) {
        const baseSalarioFonte = salarioMap.get(func.id);
        const usouFallback = baseSalarioFonte == null;
        // Fallback p/ mês sem folha consolidada: salário ANTIGO × nº de meses.
        const baseSalario = usouFallback ? salarioAtual * mesesRetro.length : baseSalarioFonte!;
        const baseFerias = feriasMap.get(func.id) || 0;
        baseVerbas = baseSalario + baseFerias;
        valorRetroativo = baseVerbas * (percentual / 100);
        breakdown = {
          meses: mesesRetro,
          mesPagamento,
          salario: Number(baseSalario.toFixed(2)),
          horasExtras: 0,
          ferias: Number(baseFerias.toFixed(2)),
          baseVerbas: Number(baseVerbas.toFixed(2)),
          percentual,
          fonteSalario: usouFallback ? 'salario_base' : 'folha_consolidada',
        };
        if (valorRetroativo > 0) { diferencasGeradas++; totalDiferencas += valorRetroativo; }
      }

      // Registrar aplicação individual
      await tx.insert(dissidioFuncionarios).values({
        dissidioId: dissidio.id,
        employeeId: func.id,
        companyId: input.companyId,
        salarioAnterior: salarioAtual.toFixed(2),
        salarioNovo: salarioNovo.toFixed(2),
        percentualAplicado: percentualReal.toFixed(2),
        diferencaValor: diferencaSalario.toFixed(2),
        mesesRetroativos: mesesRetro.length,
        valorRetroativo: valorRetroativo.toFixed(2),
        diferencaMesPagamento: valorRetroativo > 0 ? mesPagamento : null,
        diferencaBaseVerbas: valorRetroativo > 0 ? baseVerbas.toFixed(2) : null,
        diferencaBreakdownJson: breakdown,
        diferencaTipo: valorRetroativo > 0 ? 'folha' : null,
        status: 'aplicado',
        aplicadoEm: hojeStr,
      });

      // Atualizar salário do funcionário
      const valorHora = (salarioNovo / 220).toFixed(2);
      await tx.update(employees).set({
        salarioBase: salarioNovo.toFixed(2),
        valorHora,
      }).where(eq(employees.id, func.id));

      aplicados++;
    }

    // ===== Rev. 3278 — DESLIGADOS no período retroativo → rescisão complementar =====
    // Funcionários que foram desligados durante os meses retroativos receberam a
    // rescisão calculada no salário ANTIGO. A diferença vira rescisão complementar
    // (recálculo das verbas rescisórias sobre o reajuste mensal), gravada em campos
    // PRÓPRIOS (previsao_dissidio_complementar) p/ NÃO colidir com o complemento
    // "por fora" (previsao_rescisao_complementar / baixa_complementar_*).
    let desligadosComplementares = 0;
    if (mesesRetro.length > 0) {
      const avisos = await tx.select().from(terminationNotices)
        .where(and(
          companyFilter(terminationNotices.companyId, input),
          inArray(sql`to_char(${terminationNotices.dataFim}, 'YYYY-MM')`, mesesRetro),
          sql`${terminationNotices.status} != 'cancelado'`,
          isNull(terminationNotices.deletedAt),
        ));

      for (const aviso of avisos) {
        const [emp] = await tx.select().from(employees).where(eq(employees.id, aviso.employeeId)).limit(1);
        if (!emp) continue;
        if ((emp.tipoContrato || '').toUpperCase() === 'PJ') continue; // PJ nunca recebe reajuste

        const salarioRescisao = parseBRL(aviso.salarioBase || emp.salarioBase);
        const valorComplemento = salarioRescisao * (percentual / 100); // reajuste MENSAL
        if (!(valorComplemento > 0)) continue;

        // diasTrabalhadosMes: ler da previsão de rescisão original; fallback = dia do desligamento.
        let diasTrabalhadosMes = aviso.dataFim ? Number(aviso.dataFim.slice(8, 10)) : 30;
        try {
          const prev = aviso.previsaoRescisao ? JSON.parse(aviso.previsaoRescisao) : null;
          if (prev && typeof prev.diasTrabalhadosMes === 'number') diasTrabalhadosMes = prev.diasTrabalhadosMes;
        } catch { /* mantém fallback */ }

        const complementar = calcularRescisaoComplementar({
          valorComplemento,
          dataAdmissao: emp.dataAdmissao || aviso.dataInicio,
          dataDesligamento: aviso.dataFim,
          dataFimAviso: aviso.dataFim,
          tipo: aviso.tipo,
          diasTrabalhadosMes,
        });
        if (!complementar) continue;

        const totalComplementar = parseBRL(complementar.total);
        // Rev. 3990 — grava a base de referência (salário mensal do desligado) para o
        // cálculo MARGINAL de INSS/IRRF em `calcularEncargosDiferenca` (ver comentário lá).
        (complementar as any).baseReferencia = Number(salarioRescisao.toFixed(2));

        await tx.insert(dissidioFuncionarios).values({
          dissidioId: dissidio.id,
          employeeId: emp.id,
          companyId: input.companyId,
          salarioAnterior: salarioRescisao.toFixed(2),
          salarioNovo: salarioRescisao.toFixed(2), // desligado: sem reajuste daqui pra frente
          percentualAplicado: percentual.toFixed(2),
          diferencaValor: valorComplemento.toFixed(2),
          mesesRetroativos: mesesRetro.length,
          valorRetroativo: totalComplementar.toFixed(2),
          diferencaMesPagamento: mesPagamento,
          diferencaBaseVerbas: valorComplemento.toFixed(2),
          diferencaBreakdownJson: complementar,
          diferencaTipo: 'rescisao_complementar',
          status: 'aplicado',
          aplicadoEm: hojeStr,
        });

        // Grava a previsão do complemento de DISSÍDIO no aviso (campo próprio).
        await tx.update(terminationNotices).set({
          previsaoDissidioComplementar: JSON.stringify(complementar),
        }).where(eq(terminationNotices.id, aviso.id));

        desligadosComplementares++;
        totalDiferencas += totalComplementar;
      }
    }

    // Marcar dissídio como aplicado
    await tx.update(dissidios).set({
      status: 'aplicado',
      dataAplicacao: new Date().toISOString().split('T')[0],
      aplicadoPor: ctx.user.name || 'Sistema',
    }).where(eq(dissidios.id, dissidio.id));
    }); // fim da transação Rev. 3278

    return {
      success: true,
      aplicados,
      totalFuncionarios: funcs.length,
      percentual,
      ano: input.anoReferencia,
      // Rev. 3278 — resumo da diferença retroativa.
      mesesRetroativos: mesesRetro,
      mesPagamento,
      diferencasGeradas,
      desligadosComplementares,
      totalDiferencas: Number(totalDiferencas.toFixed(2)),
    };
  }),

  // Rev. 3278 — RELATÓRIO de diferenças salariais retroativas geradas por um dissídio.
  // Lista SÓ as linhas com valorRetroativo > 0 (folha + rescisão complementar), com
  // nome do funcionário, mês de pagamento, base, % e o valor da diferença. Read-only.
  relatorioDiferencas: protectedProcedure.input(z.object({
    companyId: z.number(), companyIds: z.array(z.number()).optional(),
    anoReferencia: z.number().optional(),
  })).query(async ({ input, ctx }) => {
    await assertCompanyAccess(ctx.user, input);
    const db = (await getDb())!;
    const conds: any[] = [
      companyFilter(dissidioFuncionarios.companyId, input),
      sql`${dissidioFuncionarios.valorRetroativo} IS NOT NULL`,
      sql`CAST(NULLIF(${dissidioFuncionarios.valorRetroativo}, '') AS NUMERIC) > 0`,
    ];
    if (input.anoReferencia) {
      conds.push(eq(dissidios.anoReferencia, input.anoReferencia));
    }
    const rows = await db.select({
      id: dissidioFuncionarios.id,
      employeeId: dissidioFuncionarios.employeeId,
      employeeName: employees.nomeCompleto,
      employeeCargo: employees.cargo,
      anoReferencia: dissidios.anoReferencia,
      percentualAplicado: dissidioFuncionarios.percentualAplicado,
      salarioAnterior: dissidioFuncionarios.salarioAnterior,
      salarioNovo: dissidioFuncionarios.salarioNovo,
      mesesRetroativos: dissidioFuncionarios.mesesRetroativos,
      valorRetroativo: dissidioFuncionarios.valorRetroativo,
      diferencaMesPagamento: dissidioFuncionarios.diferencaMesPagamento,
      diferencaBaseVerbas: dissidioFuncionarios.diferencaBaseVerbas,
      diferencaBreakdownJson: dissidioFuncionarios.diferencaBreakdownJson,
      diferencaTipo: dissidioFuncionarios.diferencaTipo,
      status: dissidioFuncionarios.status,
    })
      .from(dissidioFuncionarios)
      .leftJoin(dissidios, eq(dissidioFuncionarios.dissidioId, dissidios.id))
      .leftJoin(employees, eq(dissidioFuncionarios.employeeId, employees.id))
      .where(and(...conds))
      .orderBy(desc(dissidios.anoReferencia), employees.nomeCompleto);

    // Rev. 3978 — encargos (INSS/IRRF/FGTS) por linha; agora paga em separado da
    // folha, então cada diferença precisa da SUA própria guia de recolhimento.
    const rowsComEncargos = rows.map((r) => {
      const enc = calcularEncargosDiferenca(r);
      return { ...r, inss: enc.inss, irrf: enc.irrf, fgts: enc.fgts, valorLiquido: enc.liquido };
    });

    const totalGeral = rowsComEncargos.reduce((s, r) => s + (parseFloat(r.valorRetroativo || '0') || 0), 0);
    const totalFolha = rowsComEncargos.filter(r => r.diferencaTipo === 'folha')
      .reduce((s, r) => s + (parseFloat(r.valorRetroativo || '0') || 0), 0);
    const totalComplementar = rowsComEncargos.filter(r => r.diferencaTipo === 'rescisao_complementar')
      .reduce((s, r) => s + (parseFloat(r.valorRetroativo || '0') || 0), 0);
    const totalInss = rowsComEncargos.reduce((s, r) => s + r.inss, 0);
    const totalIrrf = rowsComEncargos.reduce((s, r) => s + r.irrf, 0);
    const totalFgts = rowsComEncargos.reduce((s, r) => s + r.fgts, 0);
    const totalLiquido = rowsComEncargos.reduce((s, r) => s + r.valorLiquido, 0);

    return {
      rows: rowsComEncargos,
      totalGeral: Number(totalGeral.toFixed(2)),
      totalFolha: Number(totalFolha.toFixed(2)),
      totalComplementar: Number(totalComplementar.toFixed(2)),
      totalInss: Number(totalInss.toFixed(2)),
      totalIrrf: Number(totalIrrf.toFixed(2)),
      totalFgts: Number(totalFgts.toFixed(2)),
      totalLiquido: Number(totalLiquido.toFixed(2)),
      qtdFuncionarios: new Set(rowsComEncargos.map(r => r.employeeId)).size,
    };
  }),

  // Rev. 3950 — RECALCULAR diferenças retroativas para dissídio aplicado antes
  // da Rev. 3278 (quando o motor de retroação ainda não existia). Todos os campos
  // de diferença ficaram como zero/null. Este endpoint os preenche usando os dados
  // já gravados (salarioAnterior + dataBaseInicio + dataAplicacao + verbas do mês).
  recalcularDiferencas: protectedProcedure.input(z.object({
    companyId: z.number(), companyIds: z.array(z.number()).optional(),
    anoReferencia: z.number(),
  })).mutation(async ({ input, ctx }) => {
    if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas Admin Master pode recalcular diferenças' });
    await assertCompanyAccess(ctx.user, input);
    const db = (await getDb())!;

    const [dissidio] = await db.select().from(dissidios)
      .where(and(
        companyFilter(dissidios.companyId, input),
        eq(dissidios.anoReferencia, input.anoReferencia),
      ));
    if (!dissidio) throw new TRPCError({ code: 'NOT_FOUND', message: `Dissídio ${input.anoReferencia} não encontrado` });
    if (dissidio.status !== 'aplicado') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Dissídio ainda não foi aplicado' });

    const vigenciaStr = (dissidio.dataVigencia || dissidio.dataBaseInicio || '').slice(0, 7);
    const dataAplicacaoYM = (dissidio.dataAplicacao || '').slice(0, 7);
    if (!vigenciaStr || !dataAplicacaoYM) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Data de vigência ou aplicação não disponível no registro' });

    const mesesRetro = mesesRetroativosEntre(vigenciaStr, dataAplicacaoYM);
    if (mesesRetro.length === 0) {
      // Rev. 3969 — vigência no mesmo mês da aplicação: folha desse mês pode já ter
      // sido fechada com salário antigo → incluir como retroativo em vez de bloquear.
      if (vigenciaStr && vigenciaStr === dataAplicacaoYM) {
        mesesRetro.push(vigenciaStr);
      } else {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Vigência ${vigenciaStr} não é anterior ao mês de aplicação ${dataAplicacaoYM} — sem período retroativo.` });
      }
    }

    const funcsTodos = await db.select().from(dissidioFuncionarios)
      .where(and(
        eq(dissidioFuncionarios.dissidioId, dissidio.id),
        companyFilter(dissidioFuncionarios.companyId, input),
      ));
    if (funcsTodos.length === 0) throw new TRPCError({ code: 'NOT_FOUND', message: 'Nenhum registro de funcionário para este dissídio' });

    // Rev. 3991 — o guard antigo bloqueava o recálculo do DISSÍDIO INTEIRO se
    // QUALQUER funcionário já tivesse valorRetroativo > 0 — como isso é o caso
    // normal (a maioria já vem calculada certa na aplicação), o botão "Calcular/
    // Recalcular Diferenças Retroativas" ficava permanentemente sem efeito para
    // quem realmente precisava (os que zeraram por vigência==mês de aplicação,
    // Rev. 3969). Fix: pular POR FUNCIONÁRIO (só recalcula quem está com
    // valorRetroativo<=0 OU sem diferencaTipo), preservando quem já foi
    // calculado/conferido (inclusive rescisão complementar, que este endpoint
    // não sabe recompor). Não mexe em `rescisao_complementar` mesmo zerado —
    // aquele fluxo tem sua própria lógica (linha ~387) e usa `baseReferencia`.
    const funcs = funcsTodos.filter(f =>
      f.diferencaTipo !== 'rescisao_complementar' &&
      !(parseFloat(f.valorRetroativo || '0') > 0)
    );
    if (funcs.length === 0) {
      return { atualizados: 0, totalFuncionarios: funcsTodos.length, mesesRetro: [], mesPagamento: null, totalDiferencas: 0, jaCompleto: true };
    }

    const percentual = parseFloat(dissidio.percentualReajuste);
    const mesPagamento = dataAplicacaoYM;

    // Rev. 3992 — HE é DELIBERADAMENTE excluída da base: toda hora extra é
    // compensada via banco de horas (nunca paga em dinheiro), então não há valor
    // monetário de HE a reajustar retroativamente. Base = salário + férias.
    const salarioMap = new Map<number, number>();
    const feriasMap = new Map<number, number>();

    const salarioRaw = await db.select({ employeeId: payrollPayments.employeeId, v: payrollPayments.salarioBrutoMes })
      .from(payrollPayments)
      .where(and(companyFilter(payrollPayments.companyId, input), inArray(payrollPayments.mesReferencia, mesesRetro)));
    for (const r of salarioRaw) salarioMap.set(r.employeeId, (salarioMap.get(r.employeeId) || 0) + parseBRL(r.v));

    const feriasRaw = await db.select({ employeeId: vacationPeriods.employeeId, v: vacationPeriods.valorTotal })
      .from(vacationPeriods)
      .where(and(
        companyFilter(vacationPeriods.companyId, input),
        inArray(sql`to_char(${vacationPeriods.dataPagamento}, 'YYYY-MM')`, mesesRetro),
      ));
    for (const r of feriasRaw) feriasMap.set(r.employeeId, (feriasMap.get(r.employeeId) || 0) + parseBRL(r.v));

    let atualizados = 0;
    let totalDiferencas = 0;

    for (const func of funcs) {
      const salarioAnterior = parseBRL(func.salarioAnterior);
      const baseSalarioFonte = salarioMap.get(func.employeeId);
      const usouFallback = baseSalarioFonte == null;
      const baseSalario = usouFallback ? salarioAnterior * mesesRetro.length : baseSalarioFonte!;
      const baseFerias = feriasMap.get(func.employeeId) || 0;
      const baseVerbas = baseSalario + baseFerias;
      const valorRetroativo = baseVerbas * (percentual / 100);
      if (valorRetroativo <= 0) continue;
      const breakdown = {
        meses: mesesRetro,
        mesPagamento,
        salario: Number(baseSalario.toFixed(2)),
        horasExtras: 0,
        ferias: Number(baseFerias.toFixed(2)),
        baseVerbas: Number(baseVerbas.toFixed(2)),
        percentual,
        fonteSalario: usouFallback ? 'salario_base' : 'folha_consolidada',
      };
      await db.update(dissidioFuncionarios).set({
        mesesRetroativos: mesesRetro.length,
        valorRetroativo: valorRetroativo.toFixed(2),
        diferencaMesPagamento: mesPagamento,
        diferencaBaseVerbas: baseVerbas.toFixed(2),
        diferencaBreakdownJson: breakdown,
        diferencaTipo: 'folha',
      }).where(eq(dissidioFuncionarios.id, func.id));
      atualizados++;
      totalDiferencas += valorRetroativo;
    }

    return { atualizados, totalFuncionarios: funcs.length, mesesRetro, mesPagamento, totalDiferencas: Number(totalDiferencas.toFixed(2)) };
  }),

  // Excluir dissídio (apenas rascunho)
  excluir: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), anoReferencia: z.number(),
  })).mutation(async ({ input, ctx }) => {
    if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
    const db = (await getDb())!;
    const [dissidio] = await db.select().from(dissidios)
      .where(and(
        companyFilter(dissidios.companyId, input),
        eq(dissidios.anoReferencia, input.anoReferencia),
      ));
    if (!dissidio) throw new TRPCError({ code: 'NOT_FOUND' });
    if (dissidio.status === 'aplicado') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Não é possível excluir um dissídio já aplicado' });

    await db.delete(dissidioFuncionarios).where(eq(dissidioFuncionarios.dissidioId, dissidio.id));
    await db.delete(dissidios).where(eq(dissidios.id, dissidio.id));
    return { success: true };
  }),
});
