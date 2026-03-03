import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { processosTrabalhistas, processosAndamentos, employees, processoAnalises, processoAprendizado, goldenRules } from "../../drizzle/schema";
import { eq, and, sql, desc, inArray } from "drizzle-orm";
import { storagePut } from "../storage";
import { invokeLLM } from "../_core/llm";

// Helper: inferir tipo de andamento a partir do nome da movimentação
function inferirTipoAndamento(nome: string): 'audiencia' | 'despacho' | 'sentenca' | 'recurso' | 'pericia' | 'acordo' | 'pagamento' | 'citacao' | 'intimacao' | 'peticao' | 'outros' {
  const n = nome.toLowerCase();
  if (n.includes('audiência')) return 'audiencia';
  if (n.includes('sentença') || n.includes('procedência') || n.includes('improcedência') || n.includes('julgamento')) return 'sentenca';
  if (n.includes('recurso') || n.includes('agravo') || n.includes('embargos')) return 'recurso';
  if (n.includes('perícia') || n.includes('perito')) return 'pericia';
  if (n.includes('acordo') || n.includes('conciliação')) return 'acordo';
  if (n.includes('pagamento') || n.includes('depósito')) return 'pagamento';
  if (n.includes('citação')) return 'citacao';
  if (n.includes('intimação')) return 'intimacao';
  if (n.includes('petição')) return 'peticao';
  if (n.includes('despacho') || n.includes('ato ordinátório')) return 'despacho';
  return 'outros';
}

export const processosTrabRouter = router({
  // ============================================================
  // LISTAR PROCESSOS
  // ============================================================
  listar: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      status: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      let query = db.select().from(processosTrabalhistas)
        .where(eq(processosTrabalhistas.companyId, input.companyId));

      const processos = await query;

      // Filtrar por status se fornecido
      let filtered = processos;
      if (input.status && input.status !== "all") {
        filtered = processos.filter(p => p.status === input.status);
      }

      // Enriquecer com dados do funcionário
      const empIds = Array.from(new Set(filtered.filter(p => p.employeeId).map(p => p.employeeId)));
      let empMap = new Map<number, any>();
      if (empIds.length > 0) {
        const emps = await db.select().from(employees).where(inArray(employees.id, empIds));
        empMap = new Map(emps.map(e => [e.id, e]));
      }

      return filtered.map(p => ({
        ...p,
        employee: empMap.get(p.employeeId) || null,
        pedidos: typeof p.pedidos === "string" ? JSON.parse(p.pedidos) : (p.pedidos || []),
      })).sort((a, b) => {
        // Ordenar: em_andamento primeiro, encerrado por último
        const statusOrder: Record<string, number> = {
          em_andamento: 0, aguardando_audiencia: 1, aguardando_pericia: 2,
          recurso: 3, execucao: 4, sentenca: 5, acordo: 6, arquivado: 7, encerrado: 8,
        };
        return (statusOrder[a.status] ?? 5) - (statusOrder[b.status] ?? 5);
      });
    }),

  // ============================================================
  // OBTER PROCESSO POR ID (com andamentos)
  // ============================================================
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const [processo] = await db.select().from(processosTrabalhistas)
        .where(eq(processosTrabalhistas.id, input.id));
      if (!processo) throw new TRPCError({ code: "NOT_FOUND", message: "Processo não encontrado" });

      // Buscar funcionário
      const [emp] = await db.select().from(employees)
        .where(eq(employees.id, processo.employeeId));

      // Buscar andamentos
      const andamentos = await db.select().from(processosAndamentos)
        .where(eq(processosAndamentos.processoId, input.id))
        .orderBy(desc(processosAndamentos.data));

      return {
        ...processo,
        pedidos: typeof processo.pedidos === "string" ? JSON.parse(processo.pedidos) : (processo.pedidos || []),
        employee: emp || null,
        andamentos,
      };
    }),

  // ============================================================
  // CRIAR PROCESSO
  // ============================================================
  criar: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      employeeId: z.number(),
      numeroProcesso: z.string().min(1),
      vara: z.string().optional(),
      comarca: z.string().optional(),
      tribunal: z.string().optional(),
      justica: z.enum(['trabalho','federal','estadual','outros']).default('trabalho'),
      tipoAcao: z.enum(['reclamatoria', 'indenizatoria', 'rescisao_indireta', 'acidente_trabalho', 'doenca_ocupacional', 'assedio', 'execucao_fiscal', 'mandado_seguranca', 'acao_civil_publica', 'outros']).default('reclamatoria'),
      reclamante: z.string().min(1),
      advogadoReclamante: z.string().optional(),
      advogadoEmpresa: z.string().optional(),
      valorCausa: z.string().optional(),
      dataDistribuicao: z.string().optional(),
      dataDesligamento: z.string().optional(),
      dataCitacao: z.string().optional(),
      dataAudiencia: z.string().optional(),
      status: z.enum(['em_andamento', 'aguardando_audiencia', 'aguardando_pericia', 'acordo', 'sentenca', 'recurso', 'execucao', 'arquivado', 'encerrado']).default('em_andamento'),
      fase: z.enum(['conhecimento', 'instrucao', 'decisoria', 'recursal', 'execucao', 'encerrado']).default('conhecimento'),
      risco: z.enum(['baixo', 'medio', 'alto', 'critico']).default('medio'),
      pedidos: z.array(z.string()).optional(),
      clienteCnpj: z.string().optional(),
      clienteRazaoSocial: z.string().optional(),
      clienteNomeFantasia: z.string().optional(),
      observacoes: z.string().optional(),
      criadoPor: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      // Sanitize: convert empty strings to null/undefined for date and optional fields
      const emptyToNull = (v: string | undefined) => (v && v.trim() !== '' ? v : null);
      const result = await db.insert(processosTrabalhistas).values({
        companyId: input.companyId,
        employeeId: input.employeeId,
        numeroProcesso: input.numeroProcesso,
        vara: emptyToNull(input.vara),
        comarca: emptyToNull(input.comarca),
        tribunal: emptyToNull(input.tribunal),
        justica: input.justica,
        tipoAcao: input.tipoAcao,
        reclamante: input.reclamante,
        advogadoReclamante: emptyToNull(input.advogadoReclamante),
        advogadoEmpresa: emptyToNull(input.advogadoEmpresa),
        valorCausa: emptyToNull(input.valorCausa),
        dataDistribuicao: emptyToNull(input.dataDistribuicao),
        dataDesligamento: emptyToNull(input.dataDesligamento),
        dataCitacao: emptyToNull(input.dataCitacao),
        dataAudiencia: emptyToNull(input.dataAudiencia),
        status: input.status,
        fase: input.fase,
        risco: input.risco,
        pedidos: input.pedidos ? JSON.stringify(input.pedidos) : null,
        clienteCnpj: emptyToNull(input.clienteCnpj),
        clienteRazaoSocial: emptyToNull(input.clienteRazaoSocial),
        clienteNomeFantasia: emptyToNull(input.clienteNomeFantasia),
        observacoes: emptyToNull(input.observacoes),
        criadoPor: emptyToNull(input.criadoPor),
      });
      return { id: result[0].insertId };
    }),

  // ============================================================
  // ATUALIZAR PROCESSO
  // ============================================================
  atualizar: protectedProcedure
    .input(z.object({
      id: z.number(),
      numeroProcesso: z.string().optional(),
      vara: z.string().optional(),
      comarca: z.string().optional(),
      tribunal: z.string().optional(),
      justica: z.enum(['trabalho','federal','estadual','outros']).optional(),
      tipoAcao: z.enum(['reclamatoria', 'indenizatoria', 'rescisao_indireta', 'acidente_trabalho', 'doenca_ocupacional', 'assedio', 'execucao_fiscal', 'mandado_seguranca', 'acao_civil_publica', 'outros']).optional(),
      advogadoReclamante: z.string().optional(),
      advogadoEmpresa: z.string().optional(),
      valorCausa: z.string().optional(),
      valorCondenacao: z.string().optional(),
      valorAcordo: z.string().optional(),
      valorPago: z.string().optional(),
      dataDistribuicao: z.string().nullable().optional(),
      dataDesligamento: z.string().nullable().optional(),
      dataCitacao: z.string().nullable().optional(),
      dataAudiencia: z.string().nullable().optional(),
      dataEncerramento: z.string().nullable().optional(),
      status: z.enum(['em_andamento', 'aguardando_audiencia', 'aguardando_pericia', 'acordo', 'sentenca', 'recurso', 'execucao', 'arquivado', 'encerrado']).optional(),
      fase: z.enum(['conhecimento', 'instrucao', 'decisoria', 'recursal', 'execucao', 'encerrado']).optional(),
      risco: z.enum(['baixo', 'medio', 'alto', 'critico']).optional(),
      pedidos: z.array(z.string()).optional(),
      clienteCnpj: z.string().nullable().optional(),
      clienteRazaoSocial: z.string().nullable().optional(),
      clienteNomeFantasia: z.string().nullable().optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, pedidos, ...data } = input;
      const db = (await getDb())!;
      const updateData: any = { ...data };
      if (pedidos !== undefined) updateData.pedidos = JSON.stringify(pedidos);
      await db.update(processosTrabalhistas).set(updateData)
        .where(eq(processosTrabalhistas.id, id));
      return { success: true };
    }),

  // ============================================================
  // EXCLUIR PROCESSO
  // ============================================================
  excluir: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      // Soft delete: marca deletedAt em vez de remover permanentemente
      await db.update(processosTrabalhistas).set({
        deletedAt: sql`NOW()`,
        deletedBy: ctx.user.name ?? 'Sistema',
        deletedByUserId: ctx.user.id,
      } as any).where(eq(processosTrabalhistas.id, input.id));
      return { success: true };
    }),

  // ============================================================
  // EXCLUIR EM LOTE
  // ============================================================
  excluirLote: protectedProcedure
    .input(z.object({ ids: z.array(z.number()).min(1) }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      await db.update(processosTrabalhistas).set({
        deletedAt: sql`NOW()`,
        deletedBy: ctx.user.name ?? 'Sistema',
        deletedByUserId: ctx.user.id,
      } as any).where(inArray(processosTrabalhistas.id, input.ids));
      return { success: true, count: input.ids.length };
    }),

  // ============================================================
  // ANDAMENTOS
  // ============================================================
  listarAndamentos: protectedProcedure
    .input(z.object({ processoId: z.number() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      return db.select().from(processosAndamentos)
        .where(eq(processosAndamentos.processoId, input.processoId))
        .orderBy(desc(processosAndamentos.data));
    }),

  criarAndamento: protectedProcedure
    .input(z.object({
      processoId: z.number(),
      data: z.string(),
      tipo: z.enum(['audiencia', 'despacho', 'sentenca', 'recurso', 'pericia', 'acordo', 'pagamento', 'citacao', 'intimacao', 'peticao', 'outros']).default('outros'),
      descricao: z.string().min(1),
      resultado: z.string().optional(),
      documentoUrl: z.string().optional(),
      documentoNome: z.string().optional(),
      criadoPor: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const result = await db.insert(processosAndamentos).values(input);
      return { id: result[0].insertId };
    }),

  excluirAndamento: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await db.delete(processosAndamentos).where(eq(processosAndamentos.id, input.id));
      return { success: true };
    }),

  // ============================================================
  // ESTATÍSTICAS
  // ============================================================
  estatisticas: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const processos = await db.select().from(processosTrabalhistas)
        .where(eq(processosTrabalhistas.companyId, input.companyId));

      const total = processos.length;
      const emAndamento = processos.filter(p => !['encerrado', 'arquivado'].includes(p.status)).length;
      const encerrados = processos.filter(p => ['encerrado', 'arquivado'].includes(p.status)).length;

      const parseBRL = (val: string | null) => {
        if (!val) return 0;
        const clean = val.replace(/R\$\s*/g, "").trim();
        if (clean.includes(",")) {
          return parseFloat(clean.replace(/\./g, "").replace(",", ".")) || 0;
        }
        return parseFloat(clean) || 0;
      };

      const totalValorCausa = processos.reduce((s, p) => s + parseBRL(p.valorCausa), 0);
      const totalValorPago = processos.reduce((s, p) => s + parseBRL(p.valorPago), 0);

      const porRisco = {
        baixo: processos.filter(p => p.risco === 'baixo' && !['encerrado', 'arquivado'].includes(p.status)).length,
        medio: processos.filter(p => p.risco === 'medio' && !['encerrado', 'arquivado'].includes(p.status)).length,
        alto: processos.filter(p => p.risco === 'alto' && !['encerrado', 'arquivado'].includes(p.status)).length,
        critico: processos.filter(p => p.risco === 'critico' && !['encerrado', 'arquivado'].includes(p.status)).length,
      };

      const porStatus: Record<string, number> = {};
      for (const p of processos) {
        porStatus[p.status] = (porStatus[p.status] || 0) + 1;
      }

      // Próximas audiências
      const hoje = new Date().toISOString().split('T')[0];
      const proximasAudiencias = processos
        .filter(p => p.dataAudiencia && p.dataAudiencia >= hoje && !['encerrado', 'arquivado'].includes(p.status))
        .sort((a, b) => (a.dataAudiencia || "").localeCompare(b.dataAudiencia || ""))
        .slice(0, 5);

      return {
        total, emAndamento, encerrados,
        totalValorCausa, totalValorPago,
        porRisco, porStatus,
        proximasAudiencias,
      };
    }),

  // ============================================================
  // BUSCAR FUNCIONÁRIOS DESLIGADOS (para vincular ao processo)
  // ============================================================
  funcionariosDesligados: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const desligados = await db.select({
        id: employees.id,
        nomeCompleto: employees.nomeCompleto,
        cpf: employees.cpf,
        funcao: employees.funcao,
        dataDemissao: employees.dataDemissao,
        status: employees.status,
      }).from(employees)
        .where(and(
          eq(employees.companyId, input.companyId),
          eq(employees.status, 'Desligado'),
          sql`${employees.deletedAt} IS NULL`,
        ));
      return desligados;
    }),

  // ============================================================
  // DATAJUD: CONSULTAR PROCESSO POR NÚMERO
  // ============================================================
  datajudConsultar: protectedProcedure
    .input(z.object({ processoId: z.number() }))
    .mutation(async ({ input }) => {
      const { buscarPorNumero, inferirSituacao, calcularRisco, getUltimasMovimentacoes, parseDatajudDate } = await import("../datajud");
      const db = (await getDb())!;
      
      const [processo] = await db.select().from(processosTrabalhistas)
        .where(eq(processosTrabalhistas.id, input.processoId));
      if (!processo) throw new TRPCError({ code: "NOT_FOUND", message: "Processo não encontrado" });

      const resultado = await buscarPorNumero(processo.numeroProcesso);
      if (!resultado) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Processo não encontrado no DataJud. Verifique o número do processo." });
      }

      // Inferir situação e risco
      const situacao = inferirSituacao(resultado.movimentos);
      const risco = calcularRisco(processo.valorCausa, resultado.assuntos, resultado.movimentos);
      const ultimasMovs = getUltimasMovimentacoes(resultado.movimentos, 50);
      const dataAjuiz = parseDatajudDate(resultado.dataAjuizamento);

      // Detectar novas movimentações
      const { detectarNovasMovimentacoes } = await import("../datajud");
      const movsAntigas = processo.datajudMovimentos ? 
        (typeof processo.datajudMovimentos === 'string' ? JSON.parse(processo.datajudMovimentos) : processo.datajudMovimentos) : [];
      const novasMovs = detectarNovasMovimentacoes(movsAntigas, resultado.movimentos);

      // Atualizar processo com dados do DataJud
      const updateData: any = {
        datajudId: resultado.id,
        datajudUltimaConsulta: sql`NOW()`,
        datajudUltimaAtualizacao: resultado.dataHoraUltimaAtualizacao,
        datajudGrau: resultado.grau,
        datajudClasse: resultado.classe?.nome,
        datajudAssuntos: JSON.stringify(resultado.assuntos),
        datajudOrgaoJulgador: resultado.orgaoJulgador?.nome,
        datajudSistema: resultado.sistema?.nome,
        datajudFormato: resultado.formato?.nome,
        datajudMovimentos: JSON.stringify(ultimasMovs),
        datajudTotalMovimentos: resultado.movimentos.length,
        // Atualizar campos do processo
        tribunal: resultado.tribunal || processo.tribunal,
        vara: resultado.orgaoJulgador?.nome || processo.vara,
        status: situacao.status as any,
        fase: situacao.fase as any,
        risco: risco,
      };

      // Atualizar data de distribuição se não preenchida
      if (!processo.dataDistribuicao && dataAjuiz) {
        updateData.dataDistribuicao = dataAjuiz;
      }

      await db.update(processosTrabalhistas).set(updateData)
        .where(eq(processosTrabalhistas.id, input.processoId));

      // Inserir novas movimentações como andamentos (apenas as mais recentes e relevantes)
      const movsParaAndamento = novasMovs
        .filter(m => {
          const nome = m.nome.toLowerCase();
          return nome.includes('audiência') || nome.includes('sentença') || nome.includes('procedência') || 
                 nome.includes('improcedência') || nome.includes('acordo') || nome.includes('recurso') ||
                 nome.includes('perícia') || nome.includes('citação') || nome.includes('intimação') ||
                 nome.includes('distribuição') || nome.includes('penhora') || nome.includes('execução') ||
                 nome.includes('baixa') || nome.includes('arquiv') || nome.includes('julgamento');
        })
        .slice(0, 20);

      for (const mov of movsParaAndamento) {
        const dataStr = mov.dataHora ? mov.dataHora.substring(0, 10) : new Date().toISOString().substring(0, 10);
        // Verificar se já existe esse andamento
        const existente = await db.select().from(processosAndamentos)
          .where(and(
            eq(processosAndamentos.processoId, input.processoId),
            eq(processosAndamentos.data, dataStr),
            eq(processosAndamentos.descricao, `[DataJud] ${mov.nome}`),
          ));
        if (existente.length === 0) {
          await db.insert(processosAndamentos).values({
            processoId: input.processoId,
            data: dataStr,
            tipo: inferirTipoAndamento(mov.nome),
            descricao: `[DataJud] ${mov.nome}`,
            resultado: mov.complementosTabelados?.map(c => c.nome).join(', ') || null,
            criadoPor: 'DataJud API',
          });
        }
      }

      return {
        success: true,
        datajud: {
          id: resultado.id,
          classe: resultado.classe,
          tribunal: resultado.tribunal,
          grau: resultado.grau,
          orgaoJulgador: resultado.orgaoJulgador,
          assuntos: resultado.assuntos,
          dataAjuizamento: dataAjuiz,
          totalMovimentos: resultado.movimentos.length,
          novasMovimentacoes: novasMovs.length,
          situacaoInferida: situacao,
          riscoCalculado: risco,
        },
      };
    }),

  // ============================================================
  // DATAJUD: CONSULTAR TODOS OS PROCESSOS DA EMPRESA
  // ============================================================
  datajudConsultarTodos: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .mutation(async ({ input }) => {
      const { buscarPorNumero, inferirSituacao, calcularRisco, getUltimasMovimentacoes, parseDatajudDate, detectarNovasMovimentacoes } = await import("../datajud");
      const db = (await getDb())!;
      
      const processos = await db.select().from(processosTrabalhistas)
        .where(and(
          eq(processosTrabalhistas.companyId, input.companyId),
          sql`${processosTrabalhistas.deletedAt} IS NULL`,
        ));

      let atualizados = 0;
      let erros = 0;
      let novasMovsTotal = 0;
      const resultados: Array<{
        id: number;
        numero: string;
        reclamante: string;
        status: string;
        novasMovs: number;
        mudancas: Array<{ campo: string; label: string; antes: string | null; depois: string | null }>;
        semMudanca: boolean;
      }> = [];

      // Helper: comparar campos e gerar changelog
      const FIELD_LABELS: Record<string, string> = {
        status: 'Status',
        fase: 'Fase',
        risco: 'Risco',
        tribunal: 'Tribunal',
        vara: 'Vara',
        datajudGrau: 'Grau/Instância',
        datajudClasse: 'Classe Processual',
        datajudOrgaoJulgador: 'Órgão Julgador',
        datajudSistema: 'Sistema',
        datajudFormato: 'Formato',
        datajudTotalMovimentos: 'Total Movimentações',
        dataDistribuicao: 'Data Distribuição',
      };
      function gerarChangelog(antes: any, depois: any): Array<{ campo: string; label: string; antes: string | null; depois: string | null }> {
        const mudancas: Array<{ campo: string; label: string; antes: string | null; depois: string | null }> = [];
        for (const [campo, label] of Object.entries(FIELD_LABELS)) {
          const valAntes = antes[campo] != null ? String(antes[campo]) : null;
          const valDepois = depois[campo] != null ? String(depois[campo]) : null;
          if (valAntes !== valDepois) {
            mudancas.push({ campo, label, antes: valAntes, depois: valDepois });
          }
        }
        return mudancas;
      }

      for (const processo of processos) {
        try {
          const resultado = await buscarPorNumero(processo.numeroProcesso);
          if (!resultado) {
            erros++;
            continue;
          }

          const situacao = inferirSituacao(resultado.movimentos);
          const risco = calcularRisco(processo.valorCausa, resultado.assuntos, resultado.movimentos);
          const ultimasMovs = getUltimasMovimentacoes(resultado.movimentos, 50);
          const dataAjuiz = parseDatajudDate(resultado.dataAjuizamento);

          const movsAntigas = processo.datajudMovimentos ?
            (typeof processo.datajudMovimentos === 'string' ? JSON.parse(processo.datajudMovimentos) : processo.datajudMovimentos) : [];
          const novasMovs = detectarNovasMovimentacoes(movsAntigas, resultado.movimentos);

          const updateData: any = {
            datajudId: resultado.id,
            datajudUltimaConsulta: sql`NOW()`,
            datajudUltimaAtualizacao: resultado.dataHoraUltimaAtualizacao,
            datajudGrau: resultado.grau,
            datajudClasse: resultado.classe?.nome,
            datajudAssuntos: JSON.stringify(resultado.assuntos),
            datajudOrgaoJulgador: resultado.orgaoJulgador?.nome,
            datajudSistema: resultado.sistema?.nome,
            datajudFormato: resultado.formato?.nome,
            datajudMovimentos: JSON.stringify(ultimasMovs),
            datajudTotalMovimentos: resultado.movimentos.length,
            tribunal: resultado.tribunal || processo.tribunal,
            vara: resultado.orgaoJulgador?.nome || processo.vara,
            status: situacao.status as any,
            fase: situacao.fase as any,
            risco: risco,
          };

          if (!processo.dataDistribuicao && dataAjuiz) {
            updateData.dataDistribuicao = dataAjuiz;
          }

          await db.update(processosTrabalhistas).set(updateData)
            .where(eq(processosTrabalhistas.id, processo.id));

          // Gerar changelog comparando antes vs depois
          const dadosDepois: any = {
            status: situacao.status,
            fase: situacao.fase,
            risco: risco,
            tribunal: resultado.tribunal || processo.tribunal,
            vara: resultado.orgaoJulgador?.nome || processo.vara,
            datajudGrau: resultado.grau,
            datajudClasse: resultado.classe?.nome,
            datajudOrgaoJulgador: resultado.orgaoJulgador?.nome,
            datajudSistema: resultado.sistema?.nome,
            datajudFormato: resultado.formato?.nome,
            datajudTotalMovimentos: resultado.movimentos.length,
            dataDistribuicao: (!processo.dataDistribuicao && dataAjuiz) ? dataAjuiz : processo.dataDistribuicao,
          };
          const dadosAntes: any = {
            status: processo.status,
            fase: processo.fase,
            risco: processo.risco,
            tribunal: processo.tribunal,
            vara: processo.vara,
            datajudGrau: processo.datajudGrau,
            datajudClasse: processo.datajudClasse,
            datajudOrgaoJulgador: processo.datajudOrgaoJulgador,
            datajudSistema: processo.datajudSistema,
            datajudFormato: processo.datajudFormato,
            datajudTotalMovimentos: processo.datajudTotalMovimentos,
            dataDistribuicao: processo.dataDistribuicao,
          };
          const mudancas = gerarChangelog(dadosAntes, dadosDepois);

          atualizados++;
          novasMovsTotal += novasMovs.length;
          resultados.push({
            id: processo.id,
            numero: processo.numeroProcesso,
            reclamante: processo.reclamante || '',
            status: situacao.status,
            novasMovs: novasMovs.length,
            mudancas,
            semMudanca: mudancas.length === 0 && novasMovs.length === 0,
          });

          // Rate limit: esperar 500ms entre consultas
          await new Promise(r => setTimeout(r, 500));
        } catch (e) {
          console.error(`Erro ao consultar DataJud para processo ${processo.numeroProcesso}:`, e);
          erros++;
        }
      }

      return { total: processos.length, atualizados, erros, novasMovsTotal, resultados };
    }),

  // ============================================================
  // DATAJUD: BUSCAR NOVOS PROCESSOS POR NOME DE FUNCIONÁRIOS
  // ============================================================
  datajudBuscarNovos: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      trtRegiao: z.number().min(1).max(24).default(6),
    }))
    .mutation(async ({ input }) => {
      const { buscarPorNumero } = await import("../datajud");
      const db = (await getDb())!;

      // Buscar todos os funcionários (ativos e desligados) para cruzamento
      const todosEmps = await db.select({
        id: employees.id,
        nomeCompleto: employees.nomeCompleto,
        cpf: employees.cpf,
        status: employees.status,
        funcao: employees.funcao,
      }).from(employees)
        .where(and(
          eq(employees.companyId, input.companyId),
          sql`${employees.deletedAt} IS NULL`,
        ));

      // Nota: A API pública do DataJud não permite busca por CNPJ ou nome de parte
      // (dados de partes são protegidos por sigilo)
      // Retornamos informação sobre a limitação
      return {
        mensagem: "A API pública do DataJud não permite busca por CNPJ ou nome de parte (dados protegidos por sigilo). " +
          "Para detectar novos processos, cadastre o número do processo manualmente ou use a consulta individual por número. " +
          "Os dados serão preenchidos automaticamente após o cadastro.",
        totalFuncionarios: todosEmps.length,
        sugestao: "Configure alertas com seu advogado para receber notificações de novos processos.",
      };
    }),

  // ============================================================
  // DATAJUD: MOVIMENTAÇÕES DE UM PROCESSO
  // ============================================================
  datajudMovimentacoes: protectedProcedure
    .input(z.object({ processoId: z.number() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const [processo] = await db.select().from(processosTrabalhistas)
        .where(eq(processosTrabalhistas.id, input.processoId));
      if (!processo) throw new TRPCError({ code: "NOT_FOUND" });

      const movimentos = processo.datajudMovimentos ?
        (typeof processo.datajudMovimentos === 'string' ? JSON.parse(processo.datajudMovimentos) : processo.datajudMovimentos) : [];

      return {
        movimentos,
        totalMovimentos: processo.datajudTotalMovimentos || 0,
        ultimaConsulta: processo.datajudUltimaConsulta,
        ultimaAtualizacao: processo.datajudUltimaAtualizacao,
        orgaoJulgador: processo.datajudOrgaoJulgador,
        classe: processo.datajudClasse,
        assuntos: processo.datajudAssuntos ?
          (typeof processo.datajudAssuntos === 'string' ? JSON.parse(processo.datajudAssuntos) : processo.datajudAssuntos) : [],
        grau: processo.datajudGrau,
        sistema: processo.datajudSistema,
        formato: processo.datajudFormato,
      };
    }),

  // ============================================================
  // DATAJUD: MARCAR NA BLACKLIST AUTOMATICAMENTE
  // ============================================================
  datajudBlacklist: protectedProcedure
    .input(z.object({
      processoId: z.number(),
      employeeId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      
      // Verificar se o funcionário já está na blacklist
      const [emp] = await db.select().from(employees)
        .where(eq(employees.id, input.employeeId));
      if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Funcionário não encontrado" });

      if (emp.listaNegra === 1) {
        return { success: true, message: "Funcionário já está na Lista Negra" };
      }

      // Buscar dados do processo
      const [processo] = await db.select().from(processosTrabalhistas)
        .where(eq(processosTrabalhistas.id, input.processoId));

      await db.update(employees).set({
        listaNegra: 1,
        listaNegraPor: ctx.user.name || 'DataJud Auto',
        listaNegraUserId: ctx.user.id,
      } as any).where(eq(employees.id, input.employeeId));

      return {
        success: true,
        message: `${emp.nomeCompleto} adicionado à Lista Negra (Processo ${processo?.numeroProcesso || 'N/A'})`,
      };
    }),

  // ============================================================
  // IA JURÍDICA - ANÁLISE INTELIGENTE DO PROCESSO
  // ============================================================
  analisarIA: protectedProcedure
    .input(z.object({ processoId: z.number(), companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const startTime = Date.now();

      // Buscar processo completo
      const [processo] = await db.select().from(processosTrabalhistas)
        .where(eq(processosTrabalhistas.id, input.processoId));
      if (!processo) throw new TRPCError({ code: "NOT_FOUND", message: "Processo não encontrado" });

      // Buscar funcionário
      const [emp] = await db.select().from(employees)
        .where(eq(employees.id, processo.employeeId));

      // Buscar andamentos
      const andamentos = await db.select().from(processosAndamentos)
        .where(eq(processosAndamentos.processoId, input.processoId))
        .orderBy(desc(processosAndamentos.data));

      // Buscar regras de ouro da empresa (categoria jurídico)
      const regras = await db.select().from(goldenRules)
        .where(and(
          eq(goldenRules.companyId, input.companyId),
          eq(goldenRules.isActive, 1)
        ));
      const regrasJuridicas = regras.filter(r => r.categoria === 'juridico' || r.categoria === 'geral');

      // Buscar análises anteriores de processos similares (banco de aprendizado)
      const historico = await db.select().from(processoAprendizado)
        .where(eq(processoAprendizado.companyId, input.companyId));

      // Parsear dados
      let assuntos: any[] = [];
      try { assuntos = typeof processo.datajudAssuntos === 'string' ? JSON.parse(processo.datajudAssuntos) : (processo.datajudAssuntos || []); } catch { assuntos = []; }
      let pedidos: string[] = [];
      try { pedidos = typeof processo.pedidos === 'string' ? JSON.parse(processo.pedidos) : (processo.pedidos || []); } catch { pedidos = []; }
      let movimentos: any[] = [];
      try { movimentos = typeof processo.datajudMovimentos === 'string' ? JSON.parse(processo.datajudMovimentos) : (processo.datajudMovimentos || []); } catch { movimentos = []; }

      // Montar contexto completo para a IA
      const contextoProcesso = `
## DADOS DO PROCESSO TRABALHISTA
- Número: ${processo.numeroProcesso}
- Tipo: ${processo.tipoAcao || 'Reclamatória Trabalhista'}
- Status atual: ${processo.status}
- Fase: ${processo.fase}
- Risco classificado: ${processo.risco}
- Vara: ${processo.vara || 'N/I'}
- Comarca: ${processo.comarca || 'N/I'}
- Tribunal: ${processo.tribunal || 'N/I'}
- Valor da Causa: ${processo.valorCausa || 'Não informado'}
- Data Distribuição: ${processo.dataDistribuicao || 'N/I'}
- Data Desligamento: ${processo.dataDesligamento || 'N/I'}
- Data Citação: ${processo.dataCitacao || 'N/I'}
- Próxima Audiência: ${processo.dataAudiencia || 'N/I'}

## PARTES
- Reclamante: ${processo.reclamante}
- Funcionário vinculado: ${emp?.nomeCompleto || 'N/I'} (Cargo: ${emp?.cargo || 'N/I'})
- Advogado Reclamante: ${processo.advogadoReclamante || 'N/I'}
- Advogado Empresa: ${processo.advogadoEmpresa || 'N/I'}

## CLASSE E ASSUNTOS (DataJud)
- Classe: ${processo.datajudClasse || 'N/I'}
- Assuntos: ${assuntos.map((a: any) => a.nome || a).join(', ') || 'N/I'}

## PEDIDOS DO RECLAMANTE
${pedidos.length > 0 ? pedidos.map((p, i) => `${i+1}. ${p}`).join('\n') : 'Não informados'}

## MOVIMENTAÇÕES DO DATAJUD (${processo.datajudTotalMovimentos || movimentos.length} total)
${movimentos.slice(0, 30).map((m: any) => `- ${m.dataHora?.split('T')[0] || ''}: ${m.nome || ''} ${m.complementosTabelados?.map((c: any) => c.nome || c.descricao || '').join(', ') || ''}`).join('\n')}

## ANDAMENTOS REGISTRADOS NO SISTEMA (${andamentos.length})
${andamentos.slice(0, 15).map(a => `- ${a.data}: [${a.tipo}] ${a.descricao}`).join('\n')}

## OBSERVAÇÕES
${processo.observacoes || 'Nenhuma'}

## CLIENTE/TOMADOR
${processo.clienteRazaoSocial ? `Razão Social: ${processo.clienteRazaoSocial}, CNPJ: ${processo.clienteCnpj || 'N/I'}` : 'Não informado'}
`;

      const contextoHistorico = historico.length > 0 ? `
## HISTÓRICO DE PROCESSOS ANTERIORES DA EMPRESA (${historico.length} casos)
${historico.slice(0, 10).map(h => `- Tipo: ${h.tipoProcesso}, Resultado: ${h.resultadoFinal || 'Em andamento'}, Valor Condenação: ${h.valorFinalCondenacao || 'N/I'}, Valor Acordo: ${h.valorFinalAcordo || 'N/I'}, Duração: ${h.duracaoMeses || 'N/I'} meses, Lição: ${h.licaoAprendida || 'N/I'}`).join('\n')}
` : '';

      const contextoRegras = regrasJuridicas.length > 0 ? `
## REGRAS DE OURO DA EMPRESA
${regrasJuridicas.map(r => `- [${r.prioridade?.toUpperCase()}] ${r.titulo}: ${r.descricao}`).join('\n')}
` : '';

      const prompt = `Você é um consultor jurídico especialista em Direito do Trabalho brasileiro. Analise o processo trabalhista abaixo e forneça uma análise completa e estratégica para orientar a tomada de decisão da empresa.

${contextoProcesso}
${contextoHistorico}
${contextoRegras}

Com base em TODOS os dados acima, forneça a análise em formato JSON conforme o schema solicitado. Seja específico, prático e baseie-se em jurisprudência real do TST e TRTs. Considere a CLT, súmulas e OJs do TST.

IMPORTANTE:
- Para cada pedido do reclamante, estime o valor individual que o advogado está pleiteando
- O campo valorCausaEstimado DEVE ser a SOMA de todos os valorEstimado de pedidosAnalisados (soma de todos os pedidos do reclamante)
- O valorEstimadoRisco (risco de condenação) pode ser diferente do valorCausaEstimado - é o valor que a empresa realmente pode ser condenada a pagar considerando probabilidades
- Calcule probabilidades realistas baseadas nos dados disponíveis
- Sugira valores de acordo baseados na jurisprudência
- Cite jurisprudência REAL e relevante (súmulas, OJs do TST)
- Considere o histórico de processos anteriores da empresa se disponível
- Forneça recomendações práticas e acionáveis`;

      const response = await invokeLLM({
        messages: [
          { role: "system", content: "Você é um consultor jurídico trabalhista brasileiro experiente. Responda SEMPRE em JSON válido conforme o schema solicitado." },
          { role: "user", content: prompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "analise_juridica",
            strict: true,
            schema: {
              type: "object",
              properties: {
                resumoExecutivo: { type: "string", description: "Resumo executivo do caso em 3-5 parágrafos" },
                valorEstimadoRisco: { type: "number", description: "Valor estimado de condenação em reais" },
                valorEstimadoAcordo: { type: "number", description: "Valor sugerido para acordo em reais" },
                valorCausaEstimado: { type: "number", description: "Soma total de todos os valores dos pedidos do reclamante (deve ser igual à soma dos valorEstimado em pedidosAnalisados)" },
                probabilidadeCondenacao: { type: "integer", description: "Probabilidade de condenação 0-100" },
                probabilidadeAcordo: { type: "integer", description: "Probabilidade de acordo 0-100" },
                probabilidadeArquivamento: { type: "integer", description: "Probabilidade de arquivamento 0-100" },
                pontosFortes: { type: "array", items: { type: "object", properties: { titulo: { type: "string" }, descricao: { type: "string" } }, required: ["titulo", "descricao"], additionalProperties: false }, description: "Pontos fortes da defesa da empresa" },
                pontosFracos: { type: "array", items: { type: "object", properties: { titulo: { type: "string" }, descricao: { type: "string" } }, required: ["titulo", "descricao"], additionalProperties: false }, description: "Pontos fracos / riscos para a empresa" },
                caminhosPositivos: { type: "array", items: { type: "object", properties: { caminho: { type: "string" }, descricao: { type: "string" }, probabilidade: { type: "integer" }, impactoFinanceiro: { type: "string" } }, required: ["caminho", "descricao", "probabilidade", "impactoFinanceiro"], additionalProperties: false }, description: "Caminhos estratégicos possíveis" },
                jurisprudencia: { type: "array", items: { type: "object", properties: { referencia: { type: "string" }, ementa: { type: "string" }, relevancia: { type: "string" } }, required: ["referencia", "ementa", "relevancia"], additionalProperties: false }, description: "Jurisprudência relevante" },
                recomendacaoEstrategica: { type: "string", description: "Recomendação estratégica final detalhada" },
                insights: { type: "array", items: { type: "object", properties: { titulo: { type: "string" }, descricao: { type: "string" }, prioridade: { type: "string" } }, required: ["titulo", "descricao", "prioridade"], additionalProperties: false }, description: "Insights adicionais para tomada de decisão" },
                pedidosAnalisados: { type: "array", items: { type: "object", properties: { pedido: { type: "string" }, valorEstimado: { type: "number" }, fundamentacao: { type: "string" } }, required: ["pedido", "valorEstimado", "fundamentacao"], additionalProperties: false }, description: "Análise de cada pedido com valor estimado" }
              },
              required: ["resumoExecutivo", "valorEstimadoRisco", "valorEstimadoAcordo", "valorCausaEstimado", "probabilidadeCondenacao", "probabilidadeAcordo", "probabilidadeArquivamento", "pontosFortes", "pontosFracos", "caminhosPositivos", "jurisprudencia", "recomendacaoEstrategica", "insights", "pedidosAnalisados"],
              additionalProperties: false
            }
          }
        }
      });

      const content = response.choices[0]?.message?.content;
      let analise: any;
      try {
        analise = typeof content === 'string' ? JSON.parse(content) : content;
      } catch {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro ao processar resposta da IA" });
      }

      const tempoMs = Date.now() - startTime;

      // Contar versão
      const existentes = await db.select({ id: processoAnalises.id }).from(processoAnalises)
        .where(eq(processoAnalises.processoId, input.processoId));
      const versao = existentes.length + 1;

      // Salvar análise no banco
      await db.insert(processoAnalises).values({
        companyId: input.companyId,
        processoId: input.processoId,
        resumoExecutivo: analise.resumoExecutivo,
        valorEstimadoRisco: String(analise.valorEstimadoRisco),
        valorEstimadoAcordo: String(analise.valorEstimadoAcordo),
        probabilidadeCondenacao: analise.probabilidadeCondenacao,
        probabilidadeAcordo: analise.probabilidadeAcordo,
        probabilidadeArquivamento: analise.probabilidadeArquivamento,
        pontosFortes: analise.pontosFortes,
        pontosFracos: analise.pontosFracos,
        caminhosPositivos: analise.caminhosPositivos,
        jurisprudenciaRelevante: analise.jurisprudencia,
        recomendacaoEstrategica: analise.recomendacaoEstrategica,
        insightsAdicionais: analise.insights,
        valorCausaExtraido: String(analise.valorCausaEstimado),
        pedidosExtraidos: analise.pedidosAnalisados,
        modeloIA: response.model || 'default',
        promptUsado: prompt.substring(0, 5000),
        respostaCompleta: typeof content === 'string' ? content.substring(0, 10000) : JSON.stringify(content).substring(0, 10000),
        tempoAnaliseMs: tempoMs,
        versaoAnalise: versao,
        criadoPor: ctx.user.name || 'Sistema',
        criadoPorUserId: ctx.user.id,
      } as any);

      // Calcular valor da causa como soma dos pedidos analisados (mais conservador)
      let valorCausaCalculado = analise.valorCausaEstimado;
      if (analise.pedidosAnalisados && analise.pedidosAnalisados.length > 0) {
        const somaPedidos = analise.pedidosAnalisados.reduce((acc: number, p: any) => acc + (p.valorEstimado || 0), 0);
        if (somaPedidos > 0) {
          valorCausaCalculado = somaPedidos;
        }
      }

      // Sempre atualizar o valor da causa com a soma dos pedidos (abordagem conservadora)
      if (valorCausaCalculado > 0) {
        await db.update(processosTrabalhistas).set({
          valorCausa: String(valorCausaCalculado),
        }).where(eq(processosTrabalhistas.id, input.processoId));
      }

      return {
        ...analise,
        valorCausaCalculado,
        versao,
        tempoMs,
        modelo: response.model,
      };
    }),

  // ============================================================
  // BUSCAR ÚLTIMA ANÁLISE IA DO PROCESSO
  // ============================================================
  getAnaliseIA: protectedProcedure
    .input(z.object({ processoId: z.number() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const analises = await db.select().from(processoAnalises)
        .where(eq(processoAnalises.processoId, input.processoId))
        .orderBy(desc(processoAnalises.id));
      if (analises.length === 0) return null;
      const a = analises[0];
      // Parse JSON fields
      const parseJson = (v: any) => { try { return typeof v === 'string' ? JSON.parse(v) : (v || []); } catch { return []; } };
      return {
        ...a,
        pontosFortes: parseJson(a.pontosFortes),
        pontosFracos: parseJson(a.pontosFracos),
        caminhosPositivos: parseJson(a.caminhosPositivos),
        jurisprudenciaRelevante: parseJson(a.jurisprudenciaRelevante),
        insightsAdicionais: parseJson(a.insightsAdicionais),
        pedidosExtraidos: parseJson(a.pedidosExtraidos),
        totalAnalises: analises.length,
      };
    }),

  // ============================================================
  // HISTÓRICO DE ANÁLISES IA
  // ============================================================
  listarAnalisesIA: protectedProcedure
    .input(z.object({ processoId: z.number() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      return db.select({
        id: processoAnalises.id,
        versaoAnalise: processoAnalises.versaoAnalise,
        resumoExecutivo: processoAnalises.resumoExecutivo,
        valorEstimadoRisco: processoAnalises.valorEstimadoRisco,
        probabilidadeCondenacao: processoAnalises.probabilidadeCondenacao,
        tempoAnaliseMs: processoAnalises.tempoAnaliseMs,
        criadoPor: processoAnalises.criadoPor,
        createdAt: processoAnalises.createdAt,
      }).from(processoAnalises)
        .where(eq(processoAnalises.processoId, input.processoId))
        .orderBy(desc(processoAnalises.id));
    }),

  // ============================================================
  // SALVAR RESULTADO REAL (para banco de aprendizado)
  // ============================================================
  salvarAprendizado: protectedProcedure
    .input(z.object({
      processoId: z.number(),
      companyId: z.number(),
      resultadoFinal: z.enum(['condenacao_total', 'condenacao_parcial', 'acordo', 'improcedente', 'arquivado', 'desistencia']),
      valorFinalCondenacao: z.string().optional(),
      valorFinalAcordo: z.string().optional(),
      estrategiaAdotada: z.string().optional(),
      resultadoEstrategia: z.string().optional(),
      licaoAprendida: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const [processo] = await db.select().from(processosTrabalhistas)
        .where(eq(processosTrabalhistas.id, input.processoId));
      if (!processo) throw new TRPCError({ code: "NOT_FOUND" });

      let assuntos: any[] = [];
      try { assuntos = typeof processo.datajudAssuntos === 'string' ? JSON.parse(processo.datajudAssuntos) : (processo.datajudAssuntos || []); } catch {}
      let pedidos: any[] = [];
      try { pedidos = typeof processo.pedidos === 'string' ? JSON.parse(processo.pedidos) : (processo.pedidos || []); } catch {}

      // Calcular duração
      let duracaoMeses: number | undefined;
      if (processo.dataDistribuicao) {
        const inicio = new Date(processo.dataDistribuicao);
        const fim = new Date();
        duracaoMeses = Math.round((fim.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24 * 30));
      }

      await db.insert(processoAprendizado).values({
        companyId: input.companyId,
        tipoProcesso: processo.tipoAcao || 'reclamatoria',
        assuntos: assuntos,
        pedidos: pedidos,
        riscoInicial: processo.risco,
        valorCausa: processo.valorCausa || '0',
        resultadoFinal: input.resultadoFinal,
        valorFinalCondenacao: input.valorFinalCondenacao || '0',
        valorFinalAcordo: input.valorFinalAcordo || '0',
        duracaoMeses,
        estrategiaAdotada: input.estrategiaAdotada,
        resultadoEstrategia: input.resultadoEstrategia,
        licaoAprendida: input.licaoAprendida,
        processoId: input.processoId,
      } as any);

      return { success: true, message: "Aprendizado salvo com sucesso" };
    }),

  // ============================================================
  // GERAR LINK PARA O TRIBUNAL
  // ============================================================
  getLinkTribunal: protectedProcedure
    .input(z.object({ processoId: z.number() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const [processo] = await db.select().from(processosTrabalhistas)
        .where(eq(processosTrabalhistas.id, input.processoId));
      if (!processo) return null;

      const num = processo.numeroProcesso;
      // Extrair tribunal do número do processo (posição 14-15 no formato NNNNNNN-DD.AAAA.J.TT.OOOO)
      const parts = num.match(/(\d{7})-(\d{2})\.(\d{4})\.(\d)\.(\d{2})\.(\d{4})/);
      const tribunal = parts ? parts[5] : processo.tribunal?.replace('TRT', '') || '';

      const links: { nome: string; url: string; descricao: string }[] = [];

      // PJe Consulta Pública
      links.push({
        nome: 'PJe - Consulta Processual',
        url: `https://pje.trt${tribunal}.jus.br/consultaprocessual/detalhe-processo/${num}`,
        descricao: 'Acesse o processo completo no PJe do tribunal'
      });

      // DataJud Consulta
      links.push({
        nome: 'DataJud - CNJ',
        url: `https://datajud-wiki.cnj.jus.br/`,
        descricao: 'Portal de dados abertos do Poder Judiciário'
      });

      // Consulta unificada
      links.push({
        nome: 'Consulta Unificada TST',
        url: `https://consultaprocessual.tst.jus.br/consultaProcessual/consultaTstNumUnica.do?consulta=Consultar&conscsjt=&numeroTst=&digitoTst=&anoTst=&orgaoTst=&tribunalTst=&workerTst=&numUnica=${num.replace(/[^0-9]/g, '')}`,
        descricao: 'Consulta unificada no TST'
      });

      return { links, tribunal: `TRT${tribunal}`, sistema: processo.datajudSistema || 'PJe' };
    }),

  // ============================================================
  // RE-ANALISAR TODOS OS PROCESSOS (BATCH)
  // ============================================================
  reAnalisarTodos: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;

      // Buscar todos os processos ativos da empresa
      const todosProcessos = await db.select({ id: processosTrabalhistas.id })
        .from(processosTrabalhistas)
        .where(and(
          eq(processosTrabalhistas.companyId, input.companyId),
          sql`${processosTrabalhistas.status} != 'arquivado'`
        ));

      if (todosProcessos.length === 0) {
        return { total: 0, sucesso: 0, erros: 0, detalhes: [] as any[] };
      }

      const detalhes: { processoId: number; status: string; valorCausa?: string; erro?: string }[] = [];
      let sucesso = 0;
      let erros = 0;

      // Processar sequencialmente para não sobrecarregar a API
      for (const proc of todosProcessos) {
        try {
          // Buscar processo completo
          const [processo] = await db.select().from(processosTrabalhistas)
            .where(eq(processosTrabalhistas.id, proc.id));
          if (!processo) continue;

          // Buscar funcionário
          const [emp] = await db.select().from(employees)
            .where(eq(employees.id, processo.employeeId));

          // Buscar andamentos
          const andamentos = await db.select().from(processosAndamentos)
            .where(eq(processosAndamentos.processoId, proc.id))
            .orderBy(desc(processosAndamentos.data));

          // Buscar regras de ouro
          const regras = await db.select().from(goldenRules)
            .where(and(
              eq(goldenRules.companyId, input.companyId),
              eq(goldenRules.isActive, 1)
            ));
          const regrasJuridicas = regras.filter(r => r.categoria === 'juridico' || r.categoria === 'geral');

          // Buscar histórico
          const historico = await db.select().from(processoAprendizado)
            .where(eq(processoAprendizado.companyId, input.companyId));

          // Parsear dados
          let assuntos: any[] = [];
          try { assuntos = typeof processo.datajudAssuntos === 'string' ? JSON.parse(processo.datajudAssuntos) : (processo.datajudAssuntos || []); } catch { assuntos = []; }
          let pedidos: string[] = [];
          try { pedidos = typeof processo.pedidos === 'string' ? JSON.parse(processo.pedidos) : (processo.pedidos || []); } catch { pedidos = []; }
          let movimentos: any[] = [];
          try { movimentos = typeof processo.datajudMovimentos === 'string' ? JSON.parse(processo.datajudMovimentos) : (processo.datajudMovimentos || []); } catch { movimentos = []; }

          const contextoProcesso = `
## DADOS DO PROCESSO TRABALHISTA
- Número: ${processo.numeroProcesso}
- Tipo: ${processo.tipoAcao || 'Reclamatória Trabalhista'}
- Status atual: ${processo.status}
- Fase: ${processo.fase}
- Risco classificado: ${processo.risco}
- Vara: ${processo.vara || 'N/I'}
- Comarca: ${processo.comarca || 'N/I'}
- Tribunal: ${processo.tribunal || 'N/I'}
- Valor da Causa: ${processo.valorCausa || 'Não informado'}
- Data Distribuição: ${processo.dataDistribuicao || 'N/I'}
- Data Desligamento: ${processo.dataDesligamento || 'N/I'}
- Data Citação: ${processo.dataCitacao || 'N/I'}
- Próxima Audiência: ${processo.dataAudiencia || 'N/I'}

## PARTES
- Reclamante: ${processo.reclamante}
- Funcionário vinculado: ${emp?.nomeCompleto || 'N/I'} (Cargo: ${emp?.cargo || 'N/I'})
- Advogado Reclamante: ${processo.advogadoReclamante || 'N/I'}
- Advogado Empresa: ${processo.advogadoEmpresa || 'N/I'}

## CLASSE E ASSUNTOS (DataJud)
- Classe: ${processo.datajudClasse || 'N/I'}
- Assuntos: ${assuntos.map((a: any) => a.nome || a).join(', ') || 'N/I'}

## PEDIDOS DO RECLAMANTE
${pedidos.length > 0 ? pedidos.map((p, i) => `${i+1}. ${p}`).join('\n') : 'Não informados'}

## MOVIMENTAÇÕES DO DATAJUD (${processo.datajudTotalMovimentos || movimentos.length} total)
${movimentos.slice(0, 30).map((m: any) => `- ${m.dataHora?.split('T')[0] || ''}: ${m.nome || ''} ${m.complementosTabelados?.map((c: any) => c.nome || c.descricao || '').join(', ') || ''}`).join('\n')}

## ANDAMENTOS REGISTRADOS NO SISTEMA (${andamentos.length})
${andamentos.slice(0, 15).map(a => `- ${a.data}: [${a.tipo}] ${a.descricao}`).join('\n')}

## OBSERVAÇÕES
${processo.observacoes || 'Nenhuma'}

## CLIENTE/TOMADOR
${processo.clienteRazaoSocial ? `Razão Social: ${processo.clienteRazaoSocial}, CNPJ: ${processo.clienteCnpj || 'N/I'}` : 'Não informado'}
`;

          const contextoHistorico = historico.length > 0 ? `
## HISTÓRICO DE PROCESSOS ANTERIORES DA EMPRESA (${historico.length} casos)
${historico.slice(0, 10).map(h => `- Tipo: ${h.tipoProcesso}, Resultado: ${h.resultadoFinal || 'Em andamento'}, Valor Condenação: ${h.valorFinalCondenacao || 'N/I'}, Valor Acordo: ${h.valorFinalAcordo || 'N/I'}, Duração: ${h.duracaoMeses || 'N/I'} meses, Lição: ${h.licaoAprendida || 'N/I'}`).join('\n')}
` : '';

          const contextoRegras = regrasJuridicas.length > 0 ? `
## REGRAS DE OURO DA EMPRESA
${regrasJuridicas.map(r => `- [${r.prioridade?.toUpperCase()}] ${r.titulo}: ${r.descricao}`).join('\n')}
` : '';

          const prompt = `Você é um consultor jurídico especialista em Direito do Trabalho brasileiro. Analise o processo trabalhista abaixo e forneça uma análise completa e estratégica para orientar a tomada de decisão da empresa.

${contextoProcesso}
${contextoHistorico}
${contextoRegras}

Com base em TODOS os dados acima, forneça a análise em formato JSON conforme o schema solicitado. Seja específico, prático e baseie-se em jurisprudência real do TST e TRTs. Considere a CLT, súmulas e OJs do TST.

IMPORTANTE:
- Para cada pedido do reclamante, estime o valor individual que o advogado está pleiteando
- O campo valorCausaEstimado DEVE ser a SOMA de todos os valorEstimado de pedidosAnalisados (soma de todos os pedidos do reclamante)
- O valorEstimadoRisco (risco de condenação) pode ser diferente do valorCausaEstimado - é o valor que a empresa realmente pode ser condenada a pagar considerando probabilidades
- Calcule probabilidades realistas baseadas nos dados disponíveis
- Sugira valores de acordo baseados na jurisprudência
- Cite jurisprudência REAL e relevante (súmulas, OJs do TST)
- Considere o histórico de processos anteriores da empresa se disponível
- Forneça recomendações práticas e acionáveis`;

          const response = await invokeLLM({
            messages: [
              { role: "system", content: "Você é um consultor jurídico trabalhista brasileiro experiente. Responda SEMPRE em JSON válido conforme o schema solicitado." },
              { role: "user", content: prompt },
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "analise_juridica",
                strict: true,
                schema: {
                  type: "object",
                  properties: {
                    resumoExecutivo: { type: "string", description: "Resumo executivo do caso em 3-5 parágrafos" },
                    valorEstimadoRisco: { type: "number", description: "Valor estimado de condenação em reais" },
                    valorEstimadoAcordo: { type: "number", description: "Valor sugerido para acordo em reais" },
                    valorCausaEstimado: { type: "number", description: "Soma total de todos os valores dos pedidos do reclamante (deve ser igual à soma dos valorEstimado em pedidosAnalisados)" },
                    probabilidadeCondenacao: { type: "integer", description: "Probabilidade de condenação 0-100" },
                    probabilidadeAcordo: { type: "integer", description: "Probabilidade de acordo 0-100" },
                    probabilidadeArquivamento: { type: "integer", description: "Probabilidade de arquivamento 0-100" },
                    pontosFortes: { type: "array", items: { type: "object", properties: { titulo: { type: "string" }, descricao: { type: "string" } }, required: ["titulo", "descricao"], additionalProperties: false }, description: "Pontos fortes da defesa da empresa" },
                    pontosFracos: { type: "array", items: { type: "object", properties: { titulo: { type: "string" }, descricao: { type: "string" } }, required: ["titulo", "descricao"], additionalProperties: false }, description: "Pontos fracos / riscos para a empresa" },
                    caminhosPositivos: { type: "array", items: { type: "object", properties: { caminho: { type: "string" }, descricao: { type: "string" }, probabilidade: { type: "integer" }, impactoFinanceiro: { type: "string" } }, required: ["caminho", "descricao", "probabilidade", "impactoFinanceiro"], additionalProperties: false }, description: "Caminhos estratégicos possíveis" },
                    jurisprudencia: { type: "array", items: { type: "object", properties: { referencia: { type: "string" }, ementa: { type: "string" }, relevancia: { type: "string" } }, required: ["referencia", "ementa", "relevancia"], additionalProperties: false }, description: "Jurisprudência relevante" },
                    recomendacaoEstrategica: { type: "string", description: "Recomendação estratégica final detalhada" },
                    insights: { type: "array", items: { type: "object", properties: { titulo: { type: "string" }, descricao: { type: "string" }, prioridade: { type: "string" } }, required: ["titulo", "descricao", "prioridade"], additionalProperties: false }, description: "Insights adicionais para tomada de decisão" },
                    pedidosAnalisados: { type: "array", items: { type: "object", properties: { pedido: { type: "string" }, valorEstimado: { type: "number" }, fundamentacao: { type: "string" } }, required: ["pedido", "valorEstimado", "fundamentacao"], additionalProperties: false }, description: "Análise de cada pedido com valor estimado" }
                  },
                  required: ["resumoExecutivo", "valorEstimadoRisco", "valorEstimadoAcordo", "valorCausaEstimado", "probabilidadeCondenacao", "probabilidadeAcordo", "probabilidadeArquivamento", "pontosFortes", "pontosFracos", "caminhosPositivos", "jurisprudencia", "recomendacaoEstrategica", "insights", "pedidosAnalisados"],
                  additionalProperties: false
                }
              }
            }
          });

          const content = response.choices[0]?.message?.content;
          let analise: any;
          try {
            analise = typeof content === 'string' ? JSON.parse(content) : content;
          } catch {
            detalhes.push({ processoId: proc.id, status: 'erro', erro: 'Erro ao processar resposta da IA' });
            erros++;
            continue;
          }

          const tempoMs = Date.now() - Date.now();

          // Contar versão
          const existentes = await db.select({ id: processoAnalises.id }).from(processoAnalises)
            .where(eq(processoAnalises.processoId, proc.id));
          const versao = existentes.length + 1;

          // Salvar análise
          await db.insert(processoAnalises).values({
            companyId: input.companyId,
            processoId: proc.id,
            resumoExecutivo: analise.resumoExecutivo,
            valorEstimadoRisco: String(analise.valorEstimadoRisco),
            valorEstimadoAcordo: String(analise.valorEstimadoAcordo),
            probabilidadeCondenacao: analise.probabilidadeCondenacao,
            probabilidadeAcordo: analise.probabilidadeAcordo,
            probabilidadeArquivamento: analise.probabilidadeArquivamento,
            pontosFortes: analise.pontosFortes,
            pontosFracos: analise.pontosFracos,
            caminhosPositivos: analise.caminhosPositivos,
            jurisprudenciaRelevante: analise.jurisprudencia,
            recomendacaoEstrategica: analise.recomendacaoEstrategica,
            insightsAdicionais: analise.insights,
            valorCausaExtraido: String(analise.valorCausaEstimado),
            pedidosExtraidos: analise.pedidosAnalisados,
            modeloIA: response.model || 'default',
            promptUsado: prompt.substring(0, 5000),
            respostaCompleta: typeof content === 'string' ? content.substring(0, 10000) : JSON.stringify(content).substring(0, 10000),
            tempoAnaliseMs: tempoMs,
            versaoAnalise: versao,
            criadoPor: ctx.user.name || 'Sistema',
            criadoPorUserId: ctx.user.id,
          } as any);

          // Calcular valor da causa como soma dos pedidos (conservador)
          let valorCausaCalculado = analise.valorCausaEstimado;
          if (analise.pedidosAnalisados && analise.pedidosAnalisados.length > 0) {
            const somaPedidos = analise.pedidosAnalisados.reduce((acc: number, p: any) => acc + (p.valorEstimado || 0), 0);
            if (somaPedidos > 0) {
              valorCausaCalculado = somaPedidos;
            }
          }

          // Sempre atualizar valor da causa
          if (valorCausaCalculado > 0) {
            await db.update(processosTrabalhistas).set({
              valorCausa: String(valorCausaCalculado),
            }).where(eq(processosTrabalhistas.id, proc.id));
          }

          detalhes.push({ processoId: proc.id, status: 'sucesso', valorCausa: String(valorCausaCalculado) });
          sucesso++;
        } catch (e: any) {
          detalhes.push({ processoId: proc.id, status: 'erro', erro: e.message || 'Erro desconhecido' });
          erros++;
        }
      }

      return { total: todosProcessos.length, sucesso, erros, detalhes };
    }),
});
