import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { employees, asos, warnings, processosTrabalhistas, obraSns, obras, vacationPeriods, terminationNotices } from "../../drizzle/schema";
import { eq, and, sql, gte, lte, desc, inArray, isNull } from "drizzle-orm";

export const homeDataRouter = router({
  /**
   * Dados consolidados para a Home/Dashboard principal
   * Retorna: aniversários, ASOs vencendo, alertas de férias, audiências próximas,
   * admissões/demissões recentes, advertências recentes, resumo geral
   */
  getData: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const hoje = new Date();
      const hojeStr = hoje.toISOString().split("T")[0];
      const mesAtual = hoje.getMonth() + 1; // 1-12
      const diaAtual = hoje.getDate();

      // ============================================================
      // 1. BUSCAR TODOS OS FUNCIONÁRIOS ATIVOS
      // ============================================================
      const allEmps = await db.select().from(employees)
        .where(and(eq(employees.companyId, input.companyId), sql`${employees.deletedAt} IS NULL`));

      const ativos = allEmps.filter(e => e.status === "Ativo");
      const todosNaoDesligados = allEmps.filter(e => e.status !== "Desligado");

      // ============================================================
      // 2. ANIVERSARIANTES DO MÊS
      // ============================================================
      const aniversariantes = ativos
        .filter(e => {
          if (!e.dataNascimento) return false;
          const parts = e.dataNascimento.split("-");
          if (parts.length < 3) return false;
          return parseInt(parts[1]) === mesAtual;
        })
        .map(e => {
          const parts = e.dataNascimento!.split("-");
          const dia = parseInt(parts[2]);
          const isHoje = dia === diaAtual;
          const jaPassou = dia < diaAtual;
          return {
            id: e.id,
            nome: e.nomeCompleto,
            funcao: e.funcao,
            dia,
            isHoje,
            jaPassou,
          };
        })
        .sort((a, b) => a.dia - b.dia);

      // ============================================================
      // 3. ASOs VENCENDO (próximos 60 dias) ou VENCIDOS
      // ============================================================
      const allAsos = await db.select().from(asos)
        .where(eq(asos.companyId, input.companyId));

      // Pegar o ASO mais recente de cada funcionário ativo
      const asoMap = new Map<number, typeof allAsos[0]>();
      for (const aso of allAsos) {
        const existing = asoMap.get(aso.employeeId);
        if (!existing || aso.dataValidade > existing.dataValidade) {
          asoMap.set(aso.employeeId, aso);
        }
      }

      const ativosIds = new Set(ativos.map(e => e.id));
      const empMap = new Map(allEmps.map(e => [e.id, e]));

      const em60dias = new Date(hoje);
      em60dias.setDate(em60dias.getDate() + 60);
      const em60diasStr = em60dias.toISOString().split("T")[0];

      const asosAlerta: Array<{
        employeeId: number;
        nome: string;
        funcao: string | null;
        dataValidade: string;
        diasRestantes: number;
        vencido: boolean;
      }> = [];

      for (const [empId, aso] of Array.from(asoMap.entries())) {
        if (!ativosIds.has(empId)) continue;
        const emp = empMap.get(empId);
        if (!emp) continue;

        const validade = new Date(aso.dataValidade + "T00:00:00");
        const diffMs = validade.getTime() - hoje.getTime();
        const diasRestantes = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

        if (diasRestantes <= 60) {
          asosAlerta.push({
            employeeId: empId,
            nome: emp.nomeCompleto,
            funcao: emp.funcao,
            dataValidade: aso.dataValidade,
            diasRestantes,
            vencido: diasRestantes < 0,
          });
        }
      }
      asosAlerta.sort((a, b) => a.diasRestantes - b.diasRestantes);

      // Funcionários ativos SEM nenhum ASO
      const semAso = ativos
        .filter(e => !asoMap.has(e.id))
        .map(e => ({ id: e.id, nome: e.nomeCompleto, funcao: e.funcao }));

      // ============================================================
      // 4. ALERTAS DE FÉRIAS (funcionários com mais de 11 meses sem férias)
      // ============================================================
      const feriasAlerta = ativos
        .filter(e => {
          if (!e.dataAdmissao) return false;
          const admissao = new Date(e.dataAdmissao + "T00:00:00");
          const mesesTrabalhados = (hoje.getFullYear() - admissao.getFullYear()) * 12 + (hoje.getMonth() - admissao.getMonth());
          // Se tem mais de 11 meses e não está de férias
          return mesesTrabalhados >= 11 && e.status === "Ativo";
        })
        .map(e => {
          const admissao = new Date(e.dataAdmissao! + "T00:00:00");
          const mesesTrabalhados = (hoje.getFullYear() - admissao.getFullYear()) * 12 + (hoje.getMonth() - admissao.getMonth());
          // Calcular próximo período aquisitivo
          const anosCompletos = Math.floor(mesesTrabalhados / 12);
          const proximoVencimento = new Date(admissao);
          proximoVencimento.setFullYear(proximoVencimento.getFullYear() + anosCompletos + 1);
          const diasParaVencer = Math.ceil((proximoVencimento.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));

          return {
            id: e.id,
            nome: e.nomeCompleto,
            funcao: e.funcao,
            dataAdmissao: e.dataAdmissao,
            mesesTrabalhados,
            periodoAquisitivo: anosCompletos + 1,
            diasParaVencer,
            urgente: diasParaVencer <= 60,
          };
        })
        .filter(e => e.diasParaVencer <= 120) // Mostrar só quem vence em até 120 dias
        .sort((a, b) => a.diasParaVencer - b.diasParaVencer);

      // ============================================================
      // 4b. DASHBOARD DE FÉRIAS DETALHADO (férias agendadas/vencidas/a vencer)
      // ============================================================
      const allVacations = await db.select({
        id: vacationPeriods.id,
        employeeId: vacationPeriods.employeeId,
        dataInicio: vacationPeriods.dataInicio,
        dataFim: vacationPeriods.dataFim,
        diasGozo: vacationPeriods.diasGozo,
        status: vacationPeriods.status,
        abonoPecuniario: vacationPeriods.abonoPecuniario,
        valorTotal: vacationPeriods.valorTotal,
      }).from(vacationPeriods)
        .where(and(
          eq(vacationPeriods.companyId, input.companyId),
          sql`${vacationPeriods.deletedAt} IS NULL`,
        ));

      // Férias agendadas nos próximos 60 dias
      const hoje60 = new Date(hoje);
      hoje60.setDate(hoje60.getDate() + 60);
      const hoje60Str = hoje60.toISOString().split('T')[0];

      const feriasAgendadas = allVacations
        .filter(v => v.status === 'agendada' && v.dataInicio && v.dataInicio >= hojeStr && v.dataInicio <= hoje60Str)
        .map(v => {
          const emp = ativos.find(e => e.id === v.employeeId);
          const diasAteInicio = Math.ceil((new Date(v.dataInicio! + 'T12:00:00').getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
          return {
            id: v.id,
            employeeId: v.employeeId,
            nome: emp?.nomeCompleto || 'Funcionário',
            funcao: emp?.funcao || '-',
            dataInicio: v.dataInicio,
            dataFim: v.dataFim,
            diasGozo: v.diasGozo,
            abonoPecuniario: v.abonoPecuniario,
            diasAteInicio,
            valorTotal: v.valorTotal,
          };
        })
        .sort((a, b) => a.diasAteInicio - b.diasAteInicio);

      // Férias em andamento (funcionários de férias agora)
      const feriasEmAndamento = allVacations
        .filter(v => v.status === 'em_gozo' || (v.dataInicio && v.dataFim && v.dataInicio <= hojeStr && v.dataFim >= hojeStr && v.status !== 'cancelada'))
        .map(v => {
          const emp = allEmps.find(e => e.id === v.employeeId);
          const diasRestantes = v.dataFim ? Math.ceil((new Date(v.dataFim + 'T12:00:00').getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24)) : 0;
          return {
            id: v.id,
            employeeId: v.employeeId,
            nome: emp?.nomeCompleto || 'Funcionário',
            funcao: emp?.funcao || '-',
            dataInicio: v.dataInicio,
            dataFim: v.dataFim,
            diasRestantes: Math.max(0, diasRestantes),
          };
        });

      // Fluxo de caixa de férias nos próximos 3 meses
      const hoje90 = new Date(hoje);
      hoje90.setDate(hoje90.getDate() + 90);
      const hoje90Str = hoje90.toISOString().split('T')[0];
      const feriasCustoProximo = allVacations
        .filter(v => v.dataInicio && v.dataInicio >= hojeStr && v.dataInicio <= hoje90Str && v.status !== 'cancelada')
        .reduce((total, v) => total + (parseFloat(v.valorTotal || '0') || 0), 0);

      const feriasDashboard = {
        agendadas: feriasAgendadas,
        emAndamento: feriasEmAndamento,
        custoProximo90Dias: feriasCustoProximo,
        totalVencendo: feriasAlerta.length,
        totalUrgente: feriasAlerta.filter(f => f.urgente).length,
      };

      // ============================================================
      // 5. PRÓXIMAS AUDIÊNCIAS (Processos Trabalhistas)
      // ============================================================
      const processos = await db.select().from(processosTrabalhistas)
        .where(eq(processosTrabalhistas.companyId, input.companyId));

      const proximasAudiencias = processos
        .filter(p => p.dataAudiencia && p.dataAudiencia >= hojeStr && !["encerrado", "arquivado"].includes(p.status))
        .map(p => {
          const audiencia = new Date(p.dataAudiencia! + "T00:00:00");
          const dias = Math.ceil((audiencia.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
          return {
            id: p.id,
            numeroProcesso: p.numeroProcesso,
            reclamante: p.reclamante,
            dataAudiencia: p.dataAudiencia,
            dias,
            risco: p.risco,
            status: p.status,
          };
        })
        .sort((a, b) => a.dias - b.dias)
        .slice(0, 5);

      // ============================================================
      // 6. ADMISSÕES E DEMISSÕES RECENTES (últimos 30 dias)
      // ============================================================
      const ha30dias = new Date(hoje);
      ha30dias.setDate(ha30dias.getDate() - 30);
      const ha30diasStr = ha30dias.toISOString().split("T")[0];

      const admissoesRecentes = allEmps
        .filter(e => e.dataAdmissao && e.dataAdmissao >= ha30diasStr)
        .map(e => ({ id: e.id, nome: e.nomeCompleto, funcao: e.funcao, data: e.dataAdmissao!, tipo: "admissao" as const }))
        .sort((a, b) => b.data.localeCompare(a.data));

      const demissoesRecentes = allEmps
        .filter(e => e.dataDemissao && e.dataDemissao >= ha30diasStr)
        .map(e => ({ id: e.id, nome: e.nomeCompleto, funcao: e.funcao, data: e.dataDemissao!, tipo: "demissao" as const }))
        .sort((a, b) => b.data.localeCompare(a.data));

      const movimentacoes = [...admissoesRecentes, ...demissoesRecentes]
        .sort((a, b) => b.data.localeCompare(a.data))
        .slice(0, 10);

      // ============================================================
      // 7. ADVERTÊNCIAS RECENTES (últimos 30 dias)
      // ============================================================
      const allWarnings = await db.select().from(warnings)
        .where(and(eq(warnings.companyId, input.companyId), isNull(warnings.deletedAt)));

      const advertenciasRecentes = allWarnings
        .filter(w => w.dataOcorrencia && w.dataOcorrencia >= ha30diasStr)
        .map(w => {
          const emp = empMap.get(w.employeeId);
          return {
            id: w.id,
            employeeId: w.employeeId,
            nome: emp?.nomeCompleto || "Desconhecido",
            tipo: w.tipoAdvertencia,
            data: w.dataOcorrencia,
          };
        })
        .sort((a, b) => (b.data || "").localeCompare(a.data || ""))
        .slice(0, 5);

      // ============================================================
      // 8. RESUMO DE PROCESSOS TRABALHISTAS
      // ============================================================
      const processosAtivos = processos.filter(p => !["encerrado", "arquivado"].includes(p.status));
      const processosRiscoAlto = processosAtivos.filter(p => p.risco === "alto" || p.risco === "critico");

      // ============================================================
      // 9. OBRAS ATIVAS
      // ============================================================
      const allObras = await db.select().from(obras)
        .where(and(
          eq(obras.companyId, input.companyId),
          sql`${obras.deletedAt} IS NULL`,
        ));
      const obrasAtivas = allObras.filter(o => o.status === "Em_Andamento" || (o.status as string) === "Em Andamento");

      // ============================================================
      // 9b. ALERTA 80 DIAS - OBRAS PRÓXIMAS DO FIM
      // ============================================================
      const em80dias = new Date(hoje);
      em80dias.setDate(em80dias.getDate() + 80);
      const em80diasStr = em80dias.toISOString().split('T')[0];

      const obrasProximasFim = obrasAtivas
        .filter(o => o.dataPrevisaoFim && o.dataPrevisaoFim <= em80diasStr && o.dataPrevisaoFim >= hojeStr)
        .map(o => {
          const fimPrevisto = new Date(o.dataPrevisaoFim! + 'T00:00:00');
          const diasRestantes = Math.ceil((fimPrevisto.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
          // Contar funcionários alocados nesta obra
          const funcsAlocados = ativos.filter(e => e.obraAtualId === o.id).length;
          return {
            id: o.id,
            nome: o.nome,
            codigo: o.codigo,
            cliente: o.cliente,
            dataPrevisaoFim: o.dataPrevisaoFim,
            diasRestantes,
            funcionariosAlocados: funcsAlocados,
            urgencia: diasRestantes <= 30 ? 'critico' : diasRestantes <= 60 ? 'urgente' : 'atencao',
          };
        })
        .sort((a, b) => a.diasRestantes - b.diasRestantes);

      // ============================================================
      // 10. CONTRATOS DE EXPERIÊNCIA
      // ============================================================
      const experiencias = todosNaoDesligados
        .filter(e => (e as any).experienciaTipo && (e as any).experienciaStatus !== 'efetivado' && (e as any).experienciaStatus !== 'desligado_experiencia')
        .map(e => {
          const exp = e as any;
          const tipo = exp.experienciaTipo; // '30_30' ou '45_45'
          const inicio = exp.experienciaInicio || e.dataAdmissao;
          if (!inicio) return null;

          const dias1 = tipo === '30_30' ? 30 : 45;
          const dias2 = tipo === '30_30' ? 60 : 90;

          const dtInicio = new Date(inicio + 'T12:00:00');
          const dtFim1 = new Date(dtInicio);
          dtFim1.setDate(dtFim1.getDate() + dias1);
          const dtFim2 = new Date(dtInicio);
          dtFim2.setDate(dtFim2.getDate() + dias2);

          const fim1Str = dtFim1.toISOString().split('T')[0];
          const fim2Str = dtFim2.toISOString().split('T')[0];

          const status = exp.experienciaStatus || 'em_experiencia';
          const isProrrogado = status === 'prorrogado';

          // Calcular dias restantes
          const fimRelevante = isProrrogado ? dtFim2 : dtFim1;
          const diasRestantes = Math.ceil((fimRelevante.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));

          // Determinar urgência
          let urgencia: 'normal' | 'atencao' | 'urgente' | 'vencido' = 'normal';
          if (diasRestantes < 0) urgencia = 'vencido';
          else if (diasRestantes <= 7) urgencia = 'urgente';
          else if (diasRestantes <= 15) urgencia = 'atencao';

          return {
            id: e.id,
            nome: e.nomeCompleto,
            funcao: e.funcao,
            tipo,
            inicio,
            fim1: fim1Str,
            fim2: fim2Str,
            status,
            diasRestantes,
            urgencia,
            prorrogadoEm: exp.experienciaProrrogadoEm,
            obs: exp.experienciaObs,
          };
        })
        .filter(Boolean)
        .sort((a: any, b: any) => a.diasRestantes - b.diasRestantes);

      const experienciasVencidas = experiencias.filter((e: any) => e.urgencia === 'vencido').length;
      const experienciasUrgentes = experiencias.filter((e: any) => e.urgencia === 'urgente').length;
      const experienciasAtencao = experiencias.filter((e: any) => e.urgencia === 'atencao').length;

      // ============================================================
      // 10b. AVISOS PRÉVIOS EM ANDAMENTO
      // ============================================================
      const avisosAtivos = await db.select().from(terminationNotices)
        .where(and(
          eq(terminationNotices.companyId, input.companyId),
          eq(terminationNotices.status, 'em_andamento'),
          sql`${terminationNotices.deletedAt} IS NULL`,
        ));

      const avisosPrevios = avisosAtivos.map(a => {
        const emp = allEmps.find(e => e.id === a.employeeId);
        const dataFim = new Date(a.dataFim + 'T00:00:00');
        const diasRestantes = Math.ceil((dataFim.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
        return {
          id: a.id,
          employeeId: a.employeeId,
          nome: emp?.nomeCompleto || 'Funcionário',
          funcao: emp?.funcao || '-',
          tipo: a.tipo,
          dataInicio: a.dataInicio,
          dataFim: a.dataFim,
          diasRestantes,
          valorEstimado: a.valorEstimadoTotal,
          urgencia: diasRestantes <= 0 ? 'vencido' : diasRestantes <= 3 ? 'critico' : diasRestantes <= 7 ? 'urgente' : 'normal',
        };
      }).sort((a, b) => a.diasRestantes - b.diasRestantes);

      // ============================================================
      // 11. STATS CONSOLIDADOS
      // ============================================================
      const statsConsolidados = {
        totalFuncionarios: allEmps.length,
        ativos: ativos.length,
        ferias: allEmps.filter(e => e.status === "Ferias").length,
        afastados: allEmps.filter(e => e.status === "Afastado").length,
        licenca: allEmps.filter(e => e.status === "Licenca").length,
        desligados: allEmps.filter(e => e.status === "Desligado").length,
        obrasAtivas: obrasAtivas.length,
        obrasProximasFim: obrasProximasFim.length,
        processosAtivos: processosAtivos.length,
        processosRiscoAlto: processosRiscoAlto.length,
        asosVencidos: asosAlerta.filter(a => a.vencido).length,
        asosVencendo: asosAlerta.filter(a => !a.vencido).length,
        semAso: semAso.length,
        aniversariantesHoje: aniversariantes.filter(a => a.isHoje).length,
        aniversariantesMes: aniversariantes.length,
        advertenciasRecentes: advertenciasRecentes.length,
        feriasAlerta: feriasAlerta.length,
        experienciasTotal: experiencias.length,
        experienciasVencidas,
        experienciasUrgentes,
        experienciasAtencao,
        avisosPreviosAtivos: avisosPrevios.length,
        avisosPreviosVencendo: avisosPrevios.filter(a => a.urgencia === 'critico' || a.urgencia === 'vencido').length,
      };

      return {
        stats: statsConsolidados,
        aniversariantes,
        asosAlerta,
        semAso,
        feriasAlerta,
        feriasDashboard,
        proximasAudiencias,
        movimentacoes,
        advertenciasRecentes,
        experiencias,
        obrasProximasFim,
        avisosPrevios,
      };
    }),
});
