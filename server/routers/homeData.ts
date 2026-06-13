import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb, userCanSeeAvisoStatus } from "../db";
import { employees, asos, warnings, processosTrabalhistas, obraSns, obras, vacationPeriods, terminationNotices, obraFuncionarios } from "../../drizzle/schema";
import { eq, and, sql, gte, lte, desc, inArray, isNull } from "drizzle-orm";
import { resolveCompanyIds, companyFilter } from "../companyHelper";
import { getCipaStatusByEmployeeIds, projectCipaFields } from "../_core/cipaStatus";
import { calcularRescisaoCompleta, parseBRL } from "../utils/rescisaoCalc";
import { diasFeriasNoMesDaSaida } from "./avisoPrevioFerias";

// O driver pg retorna colunas date como objetos Date (não strings).
// Drizzle's { mode: 'string' } não tem mapFromDriverValue, então passam como Date.
// Este helper normaliza para "YYYY-MM-DD" independente do tipo recebido.
const toDateStr = (v: any): string => {
  if (!v) return "";
  if (v instanceof Date) return v.toISOString().split("T")[0];
  return String(v).slice(0, 10);
};

export const homeDataRouter = router({
  /**
   * Dados consolidados para a Home/Dashboard principal
   * Retorna: aniversários, ASOs vencendo, alertas de férias, audiências próximas,
   * admissões/demissões recentes, advertências recentes, resumo geral
   */
  getData: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input, ctx }) => {
      // Rev. 2208 — sigilo Aviso Prévio: usuários sem o flag verStatusAviso
      // não recebem `avisosPrevios` (Painel RH zera os 3 KPIs e a seção
      // "Avisos Prévios em Andamento" simplesmente não renderiza).
      const canSeeAviso = await userCanSeeAvisoStatus(ctx.user.id, ctx.user.role);
      const db = (await getDb())!;
      const hoje = new Date();
      // Usar timezone de Brasília (GMT-3) para evitar bug de dia errado
      const brasilFormatter = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
      const brasilParts = brasilFormatter.formatToParts(hoje);
      const brasilYear = parseInt(brasilParts.find(p => p.type === 'year')!.value);
      const brasilMonth = parseInt(brasilParts.find(p => p.type === 'month')!.value);
      const brasilDay = parseInt(brasilParts.find(p => p.type === 'day')!.value);
      const hojeStr = `${brasilYear}-${String(brasilMonth).padStart(2,'0')}-${String(brasilDay).padStart(2,'0')}`;
      const mesAtual = brasilMonth; // 1-12
      const diaAtual = brasilDay;

      // ============================================================
      // 1. BUSCAR TODOS OS FUNCIONÁRIOS ATIVOS
      // ============================================================
      const allEmps = await db.select().from(employees)
        .where(and(companyFilter(employees.companyId, input), sql`${employees.deletedAt} IS NULL`));

      const ativos = allEmps.filter(e => e.status === "Ativo");
      // Rev. 1356: Excluir também Lista_Negra e Inativo dos cards de aniversariantes
      // (alinhado com filtros de db.ts que sempre tratam esses 3 como "fora")
      // Rev. 1762: Robustez — normaliza status (lowercase + sem espaço/underscore) pra
      // pegar variantes "Lista Negra"/"Lista_Negra"/"listaNegra", e respeita flag
      // listaNegra=1 mesmo que o status esteja em outro valor. Reportado: desligados
      // continuavam aparecendo nos aniversariantes porque o registro estava salvo como
      // "Lista Negra" (com espaço) e o Set só checava "Lista_Negra".
      const normStatus = (s: string | null | undefined) =>
        (s || "").toLowerCase().replace(/[\s_]+/g, "");
      const STATUS_FORA_NORM = new Set(["desligado", "listanegra", "inativo"]);
      const todosNaoDesligados = allEmps.filter(e => {
        if ((e as any).listaNegra === 1) return false;
        return !STATUS_FORA_NORM.has(normStatus(e.status));
      });

      // Rev. 1845 — excluir Reclusos e Afastados (>15 dias) da Central de Alertas
      // operacional (ASOs vencidos/vencendo, Sem ASO, Experiencia, etc.). Curto
      // afastamento (<=15d) tipicamente nao muda o status no sistema; quando o
      // status='Afastado' eh setado, o caso ja eh longo (INSS/B91/B31). Reclusos
      // tambem nao tem operacao ativa. Mantemos esses funcionarios em
      // todosNaoDesligados (KPIs / aniversariantes / quadro continuam contando)
      // — apenas a *lista de alertas acionaveis* os exclui.
      const isLongTermAfastado = (emp: any): boolean => {
        if (normStatus(emp.status) !== 'afastado') return false;
        const ini = emp.licencaDataInicio;
        if (!ini) return true; // sem data registrada => assumimos longo prazo
        const dt = new Date(toDateStr(ini) + 'T00:00:00');
        const dias = Math.floor((hoje.getTime() - dt.getTime()) / (1000 * 60 * 60 * 24));
        return dias > 15;
      };
      const isReclusoOrLongAfast = (emp: any): boolean =>
        normStatus(emp.status) === 'recluso' || isLongTermAfastado(emp);
      const alertableEmpIds = new Set(
        todosNaoDesligados.filter(e => !isReclusoOrLongAfast(e)).map(e => e.id),
      );

      // ============================================================
      // 2. ANIVERSARIANTES DO MÊS
      // ============================================================
      // Mapa de obras para nome
      const allObras = await db.select().from(obras)
        .where(companyFilter(obras.companyId, input));
      const obraMap = new Map(allObras.map(o => [o.id, o.nome]));

      // Buscar alocações ativas para mapear empId -> obraId
      const homeAlocs = await db.select({ employeeId: obraFuncionarios.employeeId, obraId: obraFuncionarios.obraId })
        .from(obraFuncionarios).where(and(companyFilter(obraFuncionarios.companyId, input), eq(obraFuncionarios.isActive, 1)));
      const homeEmpObraMap = new Map(homeAlocs.map(a => [a.employeeId, a.obraId]));

      // Rev. 2528 — User pediu: aniversariantes só dos ATIVOS (sem
       // Afastado/Recluso/Férias/Lista Negra/Desligado). Antes usava
       // `todosNaoDesligados` que ainda exibia Afastados e Reclusos.
      const aniversariantes = ativos
        .filter(e => {
          if (!e.dataNascimento) return false;
          const dn = toDateStr(e.dataNascimento);
          const parts = dn.split("-");
          if (parts.length < 3) return false;
          return parseInt(parts[1]) === mesAtual;
        })
        .map(e => {
          const parts = toDateStr(e.dataNascimento!).split("-");
          const dia = parseInt(parts[2]);
          const isHoje = dia === diaAtual;
          const jaPassou = dia < diaAtual;
          return {
            id: e.id,
            nome: e.nomeCompleto,
            funcao: e.funcao,
            status: e.status,
            fotoUrl: e.fotoUrl || null,
            obra: homeEmpObraMap.has(e.id) ? obraMap.get(homeEmpObraMap.get(e.id)!) || null : null,
            dia,
            isHoje,
            jaPassou,
          };
        })
        // Rev. 2086 — Ordem cronológica relativa ao dia atual:
        // 1º) aniversariante de HOJE, 2º) próximos do mês (dia asc),
        // 3º) já passados no fim (dia asc). Conforme o dia passa, o
        // próximo aniversariante naturalmente "sobe" para o topo.
        .sort((a, b) => {
          const ra = a.isHoje ? 0 : a.jaPassou ? 2 : 1;
          const rb = b.isHoje ? 0 : b.jaPassou ? 2 : 1;
          if (ra !== rb) return ra - rb;
          return a.dia - b.dia;
        });

      // ============================================================
      // 2B. ANIVERSÁRIOS DE EMPRESA (anos de casa)
      // ============================================================
      // Rev. 2528 — Mesma regra dos aniversariantes pessoais: só ATIVOS.
      const aniversariosEmpresa = ativos
        .filter(e => {
          if (!e.dataAdmissao) return false;
          const da = toDateStr(e.dataAdmissao);
          const parts = da.split("-");
          if (parts.length < 3) return false;
          return parseInt(parts[1]) === mesAtual;
        })
        .map(e => {
          const parts = toDateStr(e.dataAdmissao!).split("-");
          const dia = parseInt(parts[2]);
          const anoAdmissao = parseInt(parts[0]);
          const anosEmpresa = brasilYear - anoAdmissao;
          const isHoje = dia === diaAtual;
          const jaPassou = dia < diaAtual;
          return {
            id: e.id,
            nome: e.nomeCompleto,
            funcao: e.funcao,
            status: e.status,
            fotoUrl: e.fotoUrl || null,
            obra: homeEmpObraMap.has(e.id) ? obraMap.get(homeEmpObraMap.get(e.id)!) || null : null,
            dia,
            anosEmpresa,
            isHoje,
            jaPassou,
          };
        })
        .filter(e => e.anosEmpresa >= 1) // só quem tem pelo menos 1 ano
        // Rev. 2086 — Mesma regra dos aniversariantes de mês:
        // hoje primeiro, próximos no meio, já passados no fim.
        .sort((a, b) => {
          const ra = a.isHoje ? 0 : a.jaPassou ? 2 : 1;
          const rb = b.isHoje ? 0 : b.jaPassou ? 2 : 1;
          if (ra !== rb) return ra - rb;
          return a.dia - b.dia;
        });

      // ============================================================
      // 3. ASOs VENCENDO (próximos 60 dias) ou VENCIDOS
      // ============================================================
      const allAsos = await db.select().from(asos)
        .where(and(companyFilter(asos.companyId, input), isNull(asos.deletedAt)));

      const asosByEmp = new Map<number, typeof allAsos>();
      for (const aso of allAsos) {
        if (!asosByEmp.has(aso.employeeId)) asosByEmp.set(aso.employeeId, []);
        asosByEmp.get(aso.employeeId)!.push(aso);
      }

      const asoMap = new Map<number, typeof allAsos[0]>();
      for (const [empId, group] of asosByEmp) {
        group.sort((a, b) => (toDateStr(b.dataExame) || "").localeCompare(toDateStr(a.dataExame) || ""));
        asoMap.set(empId, group[0]);
      }

      const ativosIds = new Set(ativos.map(e => e.id));
      const empMap = new Map(allEmps.map(e => [e.id, e]));

      const em30dias = new Date(hoje);
      em30dias.setDate(em30dias.getDate() + 30);
      const em30diasStr = em30dias.toISOString().split("T")[0];

      const todosNaoDesligadosIds = new Set(todosNaoDesligados.map(e => e.id));

      const asosAlerta: Array<{
        employeeId: number;
        nome: string;
        funcao: string | null;
        status: string | null;
        fotoUrl: string | null;
        dataValidade: string;
        diasRestantes: number;
        vencido: boolean;
      }> = [];

      for (const [empId, aso] of Array.from(asoMap.entries())) {
        if (!todosNaoDesligadosIds.has(empId)) continue;
        if (!alertableEmpIds.has(empId)) continue; // Rev. 1845 — corta Recluso/Afastado>15d
        const emp = empMap.get(empId);
        if (!emp) continue;

        const empAsos = asosByEmp.get(empId) || [];
        const bestValidAso = empAsos.find(a => {
          const v = new Date(toDateStr(a.dataValidade!) + "T00:00:00");
          return v.getTime() >= hoje.getTime();
        });
        const referenceAso = bestValidAso || aso;

        const validadeStr = toDateStr(referenceAso.dataValidade!);
        const validade = new Date(validadeStr + "T00:00:00");
        const diffMs = validade.getTime() - hoje.getTime();
        const diasRestantes = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

        if (diasRestantes <= 30) {
          asosAlerta.push({
            employeeId: empId,
            nome: emp.nomeCompleto,
            funcao: emp.funcao,
            status: emp.status,
            fotoUrl: emp.fotoUrl || null,
            dataValidade: validadeStr,
            diasRestantes,
            vencido: diasRestantes < 0,
          });
        }
      }
      asosAlerta.sort((a, b) => a.diasRestantes - b.diasRestantes);

      // Funcionários não-desligados SEM nenhum ASO
      // Rev. 1845 — exclui Reclusos e Afastados >15 dias (alertableEmpIds)
      const semAso = todosNaoDesligados
        .filter(e => alertableEmpIds.has(e.id) && !asoMap.has(e.id))
        .map(e => ({ id: e.id, nome: e.nomeCompleto, funcao: e.funcao, status: e.status, fotoUrl: e.fotoUrl || null }));

      // ============================================================
      // 4. ALERTAS DE FÉRIAS (funcionários com mais de 11 meses sem férias)
      // ============================================================
      const feriasAlerta = ativos
        .filter(e => {
          if (!e.dataAdmissao) return false;
          const admissao = new Date(toDateStr(e.dataAdmissao) + "T00:00:00");
          const mesesTrabalhados = (hoje.getFullYear() - admissao.getFullYear()) * 12 + (hoje.getMonth() - admissao.getMonth());
          // Se tem mais de 11 meses e não está de férias
          return mesesTrabalhados >= 11 && e.status === "Ativo";
        })
        .map(e => {
          const admissao = new Date(toDateStr(e.dataAdmissao!) + "T00:00:00");
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
            fotoUrl: e.fotoUrl || null,
            obra: homeEmpObraMap.has(e.id) ? obraMap.get(homeEmpObraMap.get(e.id)!) || null : null,
            dataAdmissao: toDateStr(e.dataAdmissao!),
            mesesTrabalhados,
            periodoAquisitivo: anosCompletos + 1,
            diasParaVencer,
            urgente: diasParaVencer <= 15,
          };
        })
        .filter(e => e.diasParaVencer <= 30) // Mostrar só quem vence em até 30 dias
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
        .innerJoin(employees, eq(vacationPeriods.employeeId, employees.id))
        .where(and(
          companyFilter(vacationPeriods.companyId, input),
          sql`${vacationPeriods.deletedAt} IS NULL`,
          isNull(employees.deletedAt),
          // Rev. 1613 — Sócios e PJ não têm direito a férias (CLT Art. 129)
          sql`(${employees.tipoContrato} IS NULL OR ${employees.tipoContrato} NOT IN ('PJ','Socio'))`,
        ));

      // Férias agendadas nos próximos 60 dias
      const hoje60 = new Date(hoje);
      hoje60.setDate(hoje60.getDate() + 60);
      const hoje60Str = hoje60.toISOString().split('T')[0];

      const feriasAgendadas = allVacations
        .filter(v => {
          if (v.status !== 'agendada' || !v.dataInicio) return false;
          const di = toDateStr(v.dataInicio);
          return di >= hojeStr && di <= hoje60Str;
        })
        .map(v => {
          const emp = ativos.find(e => e.id === v.employeeId);
          const diStr = toDateStr(v.dataInicio!);
          const diasAteInicio = Math.ceil((new Date(diStr + 'T12:00:00').getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
          return {
            id: v.id,
            employeeId: v.employeeId,
            nome: emp?.nomeCompleto || 'Funcionário',
            funcao: emp?.funcao || '-',
            fotoUrl: emp?.fotoUrl || null,
            obra: homeEmpObraMap.has(v.employeeId) ? obraMap.get(homeEmpObraMap.get(v.employeeId)!) || null : null,
            dataInicio: diStr,
            dataFim: toDateStr(v.dataFim!),
            diasGozo: v.diasGozo,
            abonoPecuniario: v.abonoPecuniario,
            diasAteInicio,
            valorTotal: v.valorTotal,
          };
        })
        .sort((a, b) => a.diasAteInicio - b.diasAteInicio);

      // Férias em andamento (funcionários de férias agora)
      // Set de IDs de funcionários existentes para filtrar VPs de funcionários deletados
      const allEmpIds = new Set(allEmps.map(e => e.id));
      const feriasEmAndamento = allVacations
        .filter(v => {
          if (!allEmpIds.has(v.employeeId)) return false;
          if (v.status === 'em_gozo') return true;
          if (!v.dataInicio || !v.dataFim) return false;
          const di = toDateStr(v.dataInicio);
          const df = toDateStr(v.dataFim);
          return di <= hojeStr && df >= hojeStr && v.status !== 'cancelada';
        })
        .map(v => {
          const emp = allEmps.find(e => e.id === v.employeeId);
          const dfStr = toDateStr(v.dataFim!);
          const diasRestantes = dfStr ? Math.ceil((new Date(dfStr + 'T12:00:00').getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24)) : 0;
          return {
            id: v.id,
            employeeId: v.employeeId,
            nome: emp?.nomeCompleto || 'Funcionário',
            funcao: emp?.funcao || '-',
            fotoUrl: emp?.fotoUrl || null,
            obra: homeEmpObraMap.has(v.employeeId) ? obraMap.get(homeEmpObraMap.get(v.employeeId)!) || null : null,
            dataInicio: toDateStr(v.dataInicio!),
            dataFim: dfStr,
            diasRestantes: Math.max(0, diasRestantes),
          };
        });

      // Fluxo de caixa de férias nos próximos 3 meses
      const hoje90 = new Date(hoje);
      hoje90.setDate(hoje90.getDate() + 90);
      const hoje90Str = hoje90.toISOString().split('T')[0];
      const feriasCustoProximo = allVacations
        .filter(v => {
          if (!v.dataInicio || v.status === 'cancelada') return false;
          const di = toDateStr(v.dataInicio);
          return di >= hojeStr && di <= hoje90Str;
        })
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
        .where(companyFilter(processosTrabalhistas.companyId, input));

      const proximasAudiencias = processos
        .filter(p => {
          if (!p.dataAudiencia) return false;
          const da = toDateStr(p.dataAudiencia);
          return da >= hojeStr && !["encerrado", "arquivado"].includes(p.status);
        })
        .map(p => {
          const daStr = toDateStr(p.dataAudiencia!);
          const audiencia = new Date(daStr + "T00:00:00");
          const dias = Math.ceil((audiencia.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
          return {
            id: p.id,
            numeroProcesso: p.numeroProcesso,
            reclamante: p.reclamante,
            dataAudiencia: daStr,
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
        .filter(e => {
          if (!e.dataAdmissao) return false;
          return toDateStr(e.dataAdmissao) >= ha30diasStr;
        })
        .map(e => ({ id: e.id, nome: e.nomeCompleto, funcao: e.funcao, fotoUrl: e.fotoUrl || null, obra: homeEmpObraMap.has(e.id) ? obraMap.get(homeEmpObraMap.get(e.id)!) || null : null, data: toDateStr(e.dataAdmissao!), tipo: "admissao" as const }))
        .sort((a, b) => b.data.localeCompare(a.data));

      const demissoesRecentes = allEmps
        .filter(e => {
          if (!e.dataDemissao) return false;
          return toDateStr(e.dataDemissao) >= ha30diasStr;
        })
        .map(e => ({ id: e.id, nome: e.nomeCompleto, funcao: e.funcao, fotoUrl: e.fotoUrl || null, obra: homeEmpObraMap.has(e.id) ? obraMap.get(homeEmpObraMap.get(e.id)!) || null : null, data: toDateStr(e.dataDemissao!), tipo: "demissao" as const }))
        .sort((a, b) => b.data.localeCompare(a.data));

      const movimentacoes = [...admissoesRecentes, ...demissoesRecentes]
        .sort((a, b) => b.data.localeCompare(a.data))
        .slice(0, 10);

      // ============================================================
      // 7. ADVERTÊNCIAS RECENTES (últimos 30 dias)
      // ============================================================
      const allWarnings = await db.select().from(warnings)
        .where(and(companyFilter(warnings.companyId, input), isNull(warnings.deletedAt)));

      const advertenciasRecentes = allWarnings
        .filter(w => {
          if (!w.dataOcorrencia) return false;
          return toDateStr(w.dataOcorrencia) >= ha30diasStr;
        })
        .map(w => {
          const emp = empMap.get(w.employeeId);
          return {
            id: w.id,
            employeeId: w.employeeId,
            nome: emp?.nomeCompleto || "Desconhecido",
            empStatus: emp?.status || null,
            fotoUrl: emp?.fotoUrl || null,
            tipo: w.tipoAdvertencia,
            data: toDateStr(w.dataOcorrencia!),
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
      // Reusar allObras já carregado na seção 2 (aniversários)
      const obrasAtivas = allObras.filter(o => !o.deletedAt && (o.status === "Em_Andamento" || (o.status as string) === "Em Andamento"));

      // ============================================================
      // 9b. ALERTA 80 DIAS - OBRAS PRÓXIMAS DO FIM
      // ============================================================
      const em80dias = new Date(hoje);
      em80dias.setDate(em80dias.getDate() + 80);
      const em80diasStr = em80dias.toISOString().split('T')[0];

      const obrasProximasFim = obrasAtivas
        .filter(o => {
          if (!o.dataPrevisaoFim) return false;
          const dpf = toDateStr(o.dataPrevisaoFim);
          return dpf <= em80diasStr && dpf >= hojeStr;
        })
        .map(o => {
          const dpfStr = toDateStr(o.dataPrevisaoFim!);
          const fimPrevisto = new Date(dpfStr + 'T00:00:00');
          const diasRestantes = Math.ceil((fimPrevisto.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
          // Contar funcionários alocados nesta obra via alocações ativas
          const obraEmpCount = homeAlocs.filter(a => a.obraId === o.id).length;
          return {
            id: o.id,
            nome: o.nome,
            codigo: o.codigo,
            cliente: o.cliente,
            dataPrevisaoFim: dpfStr,
            diasRestantes,
            funcionariosAlocados: obraEmpCount,
            urgencia: diasRestantes <= 30 ? 'critico' : diasRestantes <= 60 ? 'urgente' : 'atencao',
          };
        })
        .sort((a, b) => a.diasRestantes - b.diasRestantes);

      // ============================================================
      // 10. CONTRATOS DE EXPERIÊNCIA
      // ============================================================
      const experiencias = todosNaoDesligados
        // Rev. 1845 — corta Reclusos / Afastados >15d
        .filter(e => alertableEmpIds.has(e.id) && (e as any).experienciaTipo && (e as any).experienciaStatus !== 'efetivado' && (e as any).experienciaStatus !== 'desligado_experiencia')
        .map(e => {
          const exp = e as any;
          const tipo = exp.experienciaTipo; // '30_30' ou '45_45'
          const inicioRaw = exp.experienciaInicio || e.dataAdmissao;
          if (!inicioRaw) return null;
          const inicio = toDateStr(inicioRaw);

          const dias1 = tipo === '30_30' ? 30 : 45;
          const dias2 = tipo === '30_30' ? 60 : 90;

          const dtInicio = new Date(inicio + 'T12:00:00');
          // Rev. 2500 — CLT: dia do início conta como dia 1. Contrato de 30
          // dias iniciando 04/05 termina 02/06 (não 03/06). Calendar-aware:
          // setDate respeita meses de 28/29/30/31 nativamente.
          const dtFim1 = new Date(dtInicio);
          dtFim1.setDate(dtFim1.getDate() + dias1 - 1);
          const dtFim2 = new Date(dtInicio);
          dtFim2.setDate(dtFim2.getDate() + dias2 - 1);

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
          else if (diasRestantes <= 30) urgencia = 'atencao';

          return {
            id: e.id,
            companyId: e.companyId, // Rev. 2667 — necessário p/ as ações Prorrogar/Efetivar/Desligar (modo multi-empresa)
            nome: e.nomeCompleto,
            funcao: e.funcao,
            empStatus: e.status,
            fotoUrl: e.fotoUrl || null, // Rev. 2529 — foto pra avatar no card
            obra: homeEmpObraMap.has(e.id) ? obraMap.get(homeEmpObraMap.get(e.id)!) || null : null, // Rev. 2535 — obra do funcionário
            tipo,
            inicio,
            fim1: fim1Str,
            fim2: fim2Str,
            status,
            diasRestantes,
            urgencia,
            prorrogadoEm: exp.experienciaProrrogadoEm ? toDateStr(exp.experienciaProrrogadoEm) : null,
            obs: exp.experienciaObs,
            // Rev. 3022 — pré-marcação "não renovar" (flag de intenção)
            naoRenovar: !!exp.experienciaNaoRenovar,
            naoRenovarEm: exp.experienciaNaoRenovarEm ? toDateStr(exp.experienciaNaoRenovarEm) : null,
            naoRenovarPor: exp.experienciaNaoRenovarPor || null,
          };
        })
        .filter(Boolean)
        .sort((a: any, b: any) => a.diasRestantes - b.diasRestantes);

      const experienciasVencidas = experiencias.filter((e: any) => e.urgencia === 'vencido').length;
      const experienciasUrgentes = experiencias.filter((e: any) => e.urgencia === 'urgente').length;
      const experienciasAtencao = experiencias.filter((e: any) => e.urgencia === 'atencao').length;

      // ============================================================
      // 10b. AVISOS PRÉVIOS EM ANDAMENTO + AGUARDANDO PAGAMENTO
      // ============================================================
      // Inclui 'em_andamento' (período em curso) E 'aguardando_pagamento'
      // (período encerrado mas rescisão ainda não paga — dataBaixa IS NULL).
      // Ambos representam desembolso financeiro pendente para a empresa.
      // Rev. 2208 — zera sem consultar DB se sem clearance.
      const avisosAtivos = canSeeAviso ? await db.select().from(terminationNotices)
        .where(and(
          companyFilter(terminationNotices.companyId, input),
          sql`${terminationNotices.status} IN ('em_andamento', 'aguardando_pagamento')`,
          sql`${terminationNotices.dataBaixa} IS NULL`,
          sql`${terminationNotices.deletedAt} IS NULL`,
        )) : [];

      // Rev. 2725 — Recalcular o valor estimado da rescisão AO VIVO (mesma lógica do
      // endpoint `list` e do `getById`), pois a coluna persistida `valorEstimadoTotal`
      // fica defasada quando salário/férias do funcionário mudam depois da criação do
      // aviso — o que fazia o card da home divergir do "TOTAL ESTIMADO" da ficha.
      const recomputedTotalMap = new Map<number, number>();
      if (avisosAtivos.length > 0) {
        // Batch: contagem real de férias vencidas por (employeeId, dataFim)
        const vpVencidasMap = new Map<string, number>();
        try {
          const pares = avisosAtivos
            .filter(a => a.dataFim)
            .map(a => sql`(${a.employeeId}, ${toDateStr(a.dataFim!)})`);
          if (pares.length > 0) {
            const vpCounts = ((await db.execute(sql`
              SELECT p.emp_id, p.data_fim, COUNT(vp.*)::int AS total
              FROM (VALUES ${sql.join(pares, sql`, `)}) AS p(emp_id, data_fim)
              LEFT JOIN vacation_periods vp
                ON vp."employeeId" = p.emp_id
                AND vp.status NOT IN ('concluida', 'cancelada', 'em_gozo')
                AND vp."periodoAquisitivoFim" IS NOT NULL
                AND vp."periodoAquisitivoFim" < p.data_fim::date
                AND (vp."dataPagamento" IS NULL OR vp."dataPagamento" > p.data_fim::date)
                AND vp."deletedAt" IS NULL
              GROUP BY p.emp_id, p.data_fim
            `)) as any).rows || [];
            for (const vc of vpCounts) vpVencidasMap.set(`${vc.emp_id}|${vc.data_fim}`, Number(vc.total));
          }
        } catch { /* fallback — usa valor armazenado */ }

        for (const a of avisosAtivos) {
          try {
            const emp = allEmps.find(e => e.id === a.employeeId);
            if (emp && a.dataFim) {
              const dataFimStr = toDateStr(a.dataFim);
              const dataAdmissao = emp.dataAdmissao || new Date().toISOString().split('T')[0];
              const salarioBase = parseBRL(emp.salarioBase);
              const dtFimAviso = new Date(dataFimStr + 'T00:00:00');
              const diasFeriasMes = await diasFeriasNoMesDaSaida(db, a.employeeId, dataFimStr);
              const diasTrabalhadosMes = Math.max(0, dtFimAviso.getDate() - diasFeriasMes);
              const periodosVencidos = vpVencidasMap.get(`${a.employeeId}|${dataFimStr}`) ?? 0;
              const previsao = calcularRescisaoCompleta({
                salarioBase,
                dataAdmissao,
                dataDesligamento: toDateStr(a.dataInicio!),
                dataFimAviso: dataFimStr,
                tipo: a.tipo,
                vrDiario: 0,
                diasTrabalhadosMes,
                periodosVencidosOverride: periodosVencidos,
                descontarAvisoNaoCumprido: !!(a as any).descontarAvisoNaoCumprido,
              });
              recomputedTotalMap.set(a.id, parseFloat(previsao.total));
            }
          } catch { /* mantém valor armazenado para este aviso */ }
        }
      }

      const avisosPrevios = avisosAtivos.map(a => {
        const emp = allEmps.find(e => e.id === a.employeeId);
        const dataFimStr = toDateStr(a.dataFim!);
        const dataInicioStr = toDateStr(a.dataInicio!);
        // Rev. 1764 — Último dia trabalhado:
        //   • tipo "trabalhado": funcionário cumpre o aviso, último dia = dataFim
        //   • tipo "indenizado": não cumpre o aviso, último dia = véspera do início
        //     (dia da comunicação). Se houver dataDesligamentoEfetiva no employee, prefere ela.
        const isIndenizado = (a.tipo || '').includes('indenizado');
        let ultimoDiaTrabalhadoStr: string | null = null;
        if (emp?.dataDesligamentoEfetiva) {
          ultimoDiaTrabalhadoStr = toDateStr(emp.dataDesligamentoEfetiva);
        } else if (isIndenizado) {
          const d = new Date(dataInicioStr + 'T00:00:00');
          d.setDate(d.getDate() - 1);
          ultimoDiaTrabalhadoStr = d.toISOString().slice(0, 10);
        } else if (a.reducaoJornada === '7_dias_corridos') {
          // Rev. 2563 — Redução de jornada de 7 dias corridos (Art. 488 CLT):
          // o empregado é DISPENSADO nos últimos 7 dias do aviso trabalhado,
          // então o último dia trabalhado = dataFim - 7 (calculado
          // automaticamente). A redução de 2h/dia (ou nenhuma) mantém todos os
          // dias normais → último dia = dataFim. Mesmo cálculo já usado em
          // server/db.ts, AvisoPrevio.tsx e DashAvisoPrevio.tsx.
          const d = new Date(dataFimStr + 'T00:00:00');
          d.setDate(d.getDate() - 7);
          ultimoDiaTrabalhadoStr = d.toISOString().slice(0, 10);
        } else {
          ultimoDiaTrabalhadoStr = dataFimStr;
        }
        // Rev. 1855 — `diasRestantes` mede quantos dias faltam para o funcionário
        // PARAR de trabalhar efetivamente (último dia trabalhado), não até o fim
        // contratual do aviso. Para aviso TRABALHADO os dois coincidem; para
        // INDENIZADO o último dia já passou (véspera da comunicação) → fica
        // negativo, e o badge mostra "VENCIDO!" (correto: ele já parou).
        // O fim contratual (`dataFim`) continua exposto via `dataFim`/`dataLimitePagamento`
        // para a régua financeira (prazo de baixa).
        const refDiasFim = new Date((ultimoDiaTrabalhadoStr || dataFimStr) + 'T00:00:00');
        const diasRestantes = Math.ceil((refDiasFim.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
        const aguardando = a.status === 'aguardando_pagamento';
        const baixaR = parseFloat(String((a as any).baixaRescisaoValor ?? '0')) || 0;
        const baixaF = parseFloat(String((a as any).baixaFgtsValor ?? '0')) || 0;
        const baixaC = parseFloat(String((a as any).baixaComplementarValor ?? '0')) || 0;
        const valorPago = baixaR + baixaF + baixaC;
        const valorEstimadoNum = recomputedTotalMap.get(a.id) ?? (parseFloat(String(a.valorEstimadoTotal ?? '0')) || 0);
        const saldoPendente = Math.max(0, valorEstimadoNum - valorPago);
        return {
          id: a.id,
          employeeId: a.employeeId,
          nome: emp?.nomeCompleto || 'Funcionário',
          funcao: emp?.funcao || '-',
          empStatus: emp?.status || null,
          fotoUrl: emp?.fotoUrl || null,
          tipo: a.tipo,
          dataInicio: toDateStr(a.dataInicio!),
          dataFim: dataFimStr,
          ultimoDiaTrabalhado: ultimoDiaTrabalhadoStr,
          diasRestantes,
          valorEstimado: (recomputedTotalMap.get(a.id) ?? (parseFloat(String(a.valorEstimadoTotal ?? '0')) || 0)).toFixed(2),
          valorPago: valorPago.toFixed(2),
          saldoPendente: saldoPendente.toFixed(2),
          baixaRescisaoValor: (a as any).baixaRescisaoValor || null,
          baixaFgtsValor: (a as any).baixaFgtsValor || null,
          baixaComplementarValor: (a as any).baixaComplementarValor || null,
          dataLimitePagamento: (() => {
            try {
              const prev = JSON.parse(a.previsaoRescisao || '{}');
              const raw = prev.dataLimitePagamento;
              if (!raw || typeof raw !== 'string') return null;
              const d = new Date(raw + 'T00:00:00');
              return isNaN(d.getTime()) ? null : raw;
            } catch { return null; }
          })(),
          status: a.status,
          urgencia: aguardando
            ? 'aguardando_pagamento'
            : diasRestantes <= 0 ? 'vencido' : diasRestantes <= 3 ? 'critico' : diasRestantes <= 7 ? 'urgente' : 'normal',
        };
      }).sort((a, b) => {
        // em_andamento vencendo primeiro, depois aguardando_pagamento
        if (a.urgencia === 'aguardando_pagamento' && b.urgencia !== 'aguardando_pagamento') return 1;
        if (b.urgencia === 'aguardando_pagamento' && a.urgencia !== 'aguardando_pagamento') return -1;
        return a.diasRestantes - b.diasRestantes;
      });

      // ============================================================
      // 11. STATS CONSOLIDADOS
      // ============================================================
      // Cross-reference: funcionários com férias em gozo na vacation_periods
      // mas com status != 'Ferias' na tabela employees (inconsistência de sincronização)
      const empIdsComFeriasStatus = new Set(allEmps.filter(e => e.status === 'Ferias').map(e => e.id));
      const empIdsComFeriasVP = new Set(
        feriasEmAndamento
          .filter(f => !empIdsComFeriasStatus.has(f.employeeId))
          .map(f => f.employeeId)
      );
      const totalFeriasReal = empIdsComFeriasStatus.size + empIdsComFeriasVP.size;
      // Ativos reais = ativos da tabela - os que estão de férias mas com status Ativo
      const ativosReais = ativos.filter(e => !empIdsComFeriasVP.has(e.id)).length;

      // "Na Empresa" = vínculo ativo = todos que AINDA têm conexão com a empresa
      // (exclui Desligados e Blacklist/listaNegra). Mesma régua canônica de
      // getEmployeeStats (server/db.ts) e do badge "Na Empresa" da tela Colaboradores.
      const naEmpresaCount = allEmps.filter(e =>
        e.status !== "Desligado" &&
        e.status !== "Lista_Negra" &&
        (e as any).listaNegra !== 1 &&
        (e as any).listaNegra !== true
      ).length;

      const statsConsolidados = {
        totalFuncionarios: allEmps.length,
        naEmpresa: naEmpresaCount,
        ativos: ativosReais,
        ferias: totalFeriasReal,
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
        aniversariosEmpresaHoje: aniversariosEmpresa.filter(a => a.isHoje).length,
        aniversariosEmpresaMes: aniversariosEmpresa.length,
        advertenciasRecentes: advertenciasRecentes.length,
        feriasAlerta: feriasAlerta.length,
        experienciasTotal: experiencias.length,
        experienciasVencidas,
        experienciasUrgentes,
        experienciasAtencao,
        avisosPreviosAtivos: avisosPrevios.filter(a => a.urgencia !== 'aguardando_pagamento').length,
        avisosPreviosVencendo: avisosPrevios.filter(a => a.urgencia === 'critico' || a.urgencia === 'vencido').length,
        avisosPreviosAguardando: avisosPrevios.filter(a => a.urgencia === 'aguardando_pagamento').length,
      };

      // ============================================================
      // Rev. 2478 — Status CIPA (membro ativo OU em estabilidade pós-mandato)
      // ============================================================
      // Coleta todos os employeeIds que aparecem nas listas de saída e faz
      // 1 query batched. Custo zero por linha. Quem não está na CIPA fica
      // com cipaAtivo=false, cipaEstabilidade=false, cipaFimEstabilidade=null.
      const allOutputEmpIds = new Set<number>();
      for (const a of aniversariantes) allOutputEmpIds.add((a as any).id);
      for (const a of aniversariosEmpresa) allOutputEmpIds.add((a as any).id);
      for (const a of asosAlerta) allOutputEmpIds.add(a.employeeId);
      for (const a of semAso) allOutputEmpIds.add(a.id);
      for (const f of feriasAlerta) allOutputEmpIds.add(f.id);
      for (const f of feriasEmAndamento) allOutputEmpIds.add((f as any).employeeId);
      for (const f of feriasAgendadas) allOutputEmpIds.add((f as any).employeeId);
      for (const m of movimentacoes) allOutputEmpIds.add((m as any).id);
      for (const w of advertenciasRecentes) allOutputEmpIds.add(w.employeeId);
      for (const e of experiencias) allOutputEmpIds.add((e as any).id);
      for (const a of avisosPrevios) allOutputEmpIds.add(a.employeeId);
      const cipaMap = await getCipaStatusByEmployeeIds(
        db,
        input,
        Array.from(allOutputEmpIds)
      );
      const wCipa = <T extends { id?: number; employeeId?: number }>(row: T): T => {
        const eid: number | undefined = (row as any).employeeId ?? (row as any).id;
        if (typeof eid !== "number") return row;
        return { ...row, ...projectCipaFields(cipaMap, eid) } as T;
      };

      return {
        stats: statsConsolidados,
        aniversariantes: aniversariantes.map(wCipa),
        aniversariosEmpresa: aniversariosEmpresa.map(wCipa),
        asosAlerta: asosAlerta.map(wCipa),
        semAso: semAso.map(wCipa),
        feriasAlerta: feriasAlerta.map(wCipa),
        feriasDashboard: {
          ...feriasDashboard,
          emAndamento: (feriasDashboard.emAndamento || []).map(wCipa),
          agendadas: (feriasDashboard.agendadas || []).map(wCipa),
        },
        proximasAudiencias,
        movimentacoes: movimentacoes.map(wCipa),
        advertenciasRecentes: advertenciasRecentes.map(wCipa),
        experiencias: experiencias.map((e) => (e ? wCipa(e as any) : e)),
        obrasProximasFim,
        avisosPrevios: avisosPrevios.map(wCipa),
      };
    }),

  /**
   * Aniversariantes de um mês específico (para navegação na tela cheia)
   */
  getAniversariantesMes: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      companyIds: z.array(z.number()).optional(),
      mes: z.number().min(1).max(12),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const hoje = new Date();
      const brasilFormatter = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
      const brasilParts = brasilFormatter.formatToParts(hoje);
      const brasilDay = parseInt(brasilParts.find(p => p.type === 'day')!.value);
      const brasilMonth = parseInt(brasilParts.find(p => p.type === 'month')!.value);

      const allEmps = await db.select().from(employees)
        .where(and(companyFilter(employees.companyId, input), sql`${employees.deletedAt} IS NULL`));
      // Rev. 2571 — Só monitorar quem está ATIVO no controle de aniversários.
      // Mesmo check estrito dos cards da Home (`getData`: ativos = status === "Ativo"),
      // mais a exclusão explícita de Lista Negra (flag listaNegra=1) pedida pelo
      // usuário. Resultado: tela cheia consistente com os cards, sem Desligado/
      // Lista Negra/Inativo/Afastado/Férias/Licença/Recluso.
      const todosNaoDesligados = allEmps.filter(e => {
        if ((e as any).listaNegra === 1) return false;
        return e.status === "Ativo";
      });

      const allObras = await db.select().from(obras).where(companyFilter(obras.companyId, input));
      const obraMap = new Map(allObras.map(o => [o.id, o.nome]));
      const homeAlocs = await db.select({ employeeId: obraFuncionarios.employeeId, obraId: obraFuncionarios.obraId })
        .from(obraFuncionarios).where(and(companyFilter(obraFuncionarios.companyId, input), eq(obraFuncionarios.isActive, 1)));
      const homeEmpObraMap = new Map(homeAlocs.map(a => [a.employeeId, a.obraId]));

      const isMesAtual = input.mes === brasilMonth;

      const lista = todosNaoDesligados
        .filter(e => {
          if (!e.dataNascimento) return false;
          const dn = toDateStr(e.dataNascimento);
          const parts = dn.split("-");
          if (parts.length < 3) return false;
          return parseInt(parts[1]) === input.mes;
        })
        .map(e => {
          const parts = toDateStr(e.dataNascimento!).split("-");
          const dia = parseInt(parts[2]);
          const isHoje = isMesAtual && dia === brasilDay;
          const jaPassou = isMesAtual ? dia < brasilDay : false;
          return {
            id: e.id,
            nome: e.nomeCompleto,
            funcao: e.funcao,
            status: e.status,
            fotoUrl: e.fotoUrl || null,
            obra: homeEmpObraMap.has(e.id) ? obraMap.get(homeEmpObraMap.get(e.id)!) || null : null,
            dia,
            isHoje,
            jaPassou,
          };
        })
        .sort((a, b) => a.dia - b.dia);

      // Rev. 2478 — enriquecimento CIPA também no modal full-screen
      // (Aniversariantes do Mês expandido).
      const cipaMap = await getCipaStatusByEmployeeIds(
        db,
        input,
        lista.map((e) => e.id)
      );
      return lista.map((e) => ({ ...e, ...projectCipaFields(cipaMap, e.id) }));
    }),
});
