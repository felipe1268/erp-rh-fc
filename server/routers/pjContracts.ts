import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { pjContracts, pjPayments, employees, companies } from "../../drizzle/schema";
import { eq, and, sql, isNull, desc, asc, lte, gte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { storagePut } from "../storage";

// Modelo de contrato PJ padrão
const MODELO_CONTRATO_PJ = `CONTRATO DE PRESTAÇÃO DE SERVIÇOS

Pelo presente instrumento particular, as partes abaixo qualificadas:

CONTRATANTE: [EMPRESA_RAZAO_SOCIAL], inscrita no CNPJ sob o nº [EMPRESA_CNPJ], com sede em [EMPRESA_ENDERECO], [EMPRESA_CIDADE]/[EMPRESA_ESTADO], CEP [EMPRESA_CEP], neste ato representada por seu representante legal.

CONTRATADA: [PRESTADOR_RAZAO_SOCIAL], inscrita no CNPJ sob o nº [PRESTADOR_CNPJ], com sede em [PRESTADOR_ENDERECO], neste ato representada por [PRESTADOR_NOME], portador(a) do CPF nº [PRESTADOR_CPF] e RG nº [PRESTADOR_RG].

Têm entre si justo e contratado o seguinte:

CLÁUSULA 1ª – DO OBJETO
A CONTRATADA prestará serviços de [OBJETO_CONTRATO] à CONTRATANTE, conforme especificações e condições estabelecidas neste instrumento.

CLÁUSULA 2ª – DO PRAZO
O presente contrato terá vigência de [DATA_INICIO] a [DATA_FIM], podendo ser renovado mediante acordo entre as partes, por meio de termo aditivo.

CLÁUSULA 3ª – DO VALOR E FORMA DE PAGAMENTO
3.1. Pelo serviço prestado, a CONTRATANTE pagará à CONTRATADA o valor mensal de R$ [VALOR_MENSAL] ([VALOR_EXTENSO]).
3.2. O pagamento será realizado da seguinte forma:
   a) [PERCENTUAL_ADIANTAMENTO]% ([VALOR_ADIANTAMENTO]) a título de adiantamento, até o dia [DIA_ADIANTAMENTO] de cada mês;
   b) [PERCENTUAL_FECHAMENTO]% ([VALOR_FECHAMENTO]) referente ao fechamento, até o dia [DIA_FECHAMENTO] do mês subsequente.
3.3. Eventuais bonificações serão pagas junto ao fechamento mensal, mediante aprovação prévia.

CLÁUSULA 4ª – DAS OBRIGAÇÕES DA CONTRATADA
4.1. Executar os serviços com qualidade, zelo e dentro dos prazos estabelecidos.
4.2. Manter regularidade fiscal e tributária durante toda a vigência do contrato.
4.3. Emitir Nota Fiscal de Serviço correspondente ao valor mensal contratado.
4.4. Responsabilizar-se por todos os encargos trabalhistas, previdenciários e fiscais de seus empregados ou prepostos.

CLÁUSULA 5ª – DAS OBRIGAÇÕES DA CONTRATANTE
5.1. Efetuar os pagamentos nas datas e condições estabelecidas.
5.2. Fornecer as informações e condições necessárias para a execução dos serviços.
5.3. Comunicar à CONTRATADA, com antecedência, qualquer alteração nas condições de prestação dos serviços.

CLÁUSULA 6ª – DA RESCISÃO
6.1. O presente contrato poderá ser rescindido por qualquer das partes, mediante comunicação por escrito com antecedência mínima de 30 (trinta) dias.
6.2. A rescisão imediata poderá ocorrer em caso de descumprimento de qualquer cláusula contratual.

CLÁUSULA 7ª – DA CONFIDENCIALIDADE
A CONTRATADA compromete-se a manter sigilo sobre todas as informações, dados e documentos a que tiver acesso em razão da prestação dos serviços, durante e após a vigência deste contrato.

CLÁUSULA 8ª – DO FORO
Fica eleito o foro da Comarca de [EMPRESA_CIDADE]/[EMPRESA_ESTADO] para dirimir quaisquer dúvidas oriundas deste contrato.

E, por estarem assim justas e contratadas, as partes firmam o presente instrumento em 2 (duas) vias de igual teor e forma, na presença de 2 (duas) testemunhas.

[EMPRESA_CIDADE], [DATA_ASSINATURA].


_______________________________
CONTRATANTE: [EMPRESA_RAZAO_SOCIAL]
CNPJ: [EMPRESA_CNPJ]


_______________________________
CONTRATADA: [PRESTADOR_RAZAO_SOCIAL]
CNPJ: [PRESTADOR_CNPJ]


_______________________________
Testemunha 1
Nome:
CPF:


_______________________________
Testemunha 2
Nome:
CPF:`;

export const pjContractsRouter = router({
  // ============================================================
  // CONTRATOS
  // ============================================================
  contratos: router({
    list: protectedProcedure
      .input(z.object({ companyId: z.number(), status: z.string().optional(), employeeId: z.number().optional() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const conditions = [
          eq(pjContracts.companyId, input.companyId),
          isNull(pjContracts.deletedAt),
        ];
        if (input.status) conditions.push(eq(pjContracts.status, input.status as any));
        if (input.employeeId) conditions.push(eq(pjContracts.employeeId, input.employeeId));
        
        const rows = await db.select({
          id: pjContracts.id,
          companyId: pjContracts.companyId,
          employeeId: pjContracts.employeeId,
          numeroContrato: pjContracts.numeroContrato,
          cnpjPrestador: pjContracts.cnpjPrestador,
          razaoSocialPrestador: pjContracts.razaoSocialPrestador,
          objetoContrato: pjContracts.objetoContrato,
          dataInicio: pjContracts.dataInicio,
          dataFim: pjContracts.dataFim,
          renovacaoAutomatica: pjContracts.renovacaoAutomatica,
          valorMensal: pjContracts.valorMensal,
          percentualAdiantamento: pjContracts.percentualAdiantamento,
          percentualFechamento: pjContracts.percentualFechamento,
          diaAdiantamento: pjContracts.diaAdiantamento,
          diaFechamento: pjContracts.diaFechamento,
          contratoAssinadoUrl: pjContracts.contratoAssinadoUrl,
          tipoAssinatura: pjContracts.tipoAssinatura,
          status: pjContracts.status,
          alertaVencimentoEnviado: pjContracts.alertaVencimentoEnviado,
          observacoes: pjContracts.observacoes,
          createdAt: pjContracts.createdAt,
          employeeName: employees.nomeCompleto,
          employeeCpf: employees.cpf,
          employeeCargo: employees.cargo,
        })
        .from(pjContracts)
        .innerJoin(employees, eq(pjContracts.employeeId, employees.id))
        .where(and(...conditions))
        .orderBy(desc(pjContracts.createdAt));
        
        return rows;
      }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const [row] = await db.select({
          id: pjContracts.id,
          companyId: pjContracts.companyId,
          employeeId: pjContracts.employeeId,
          numeroContrato: pjContracts.numeroContrato,
          cnpjPrestador: pjContracts.cnpjPrestador,
          razaoSocialPrestador: pjContracts.razaoSocialPrestador,
          objetoContrato: pjContracts.objetoContrato,
          dataInicio: pjContracts.dataInicio,
          dataFim: pjContracts.dataFim,
          renovacaoAutomatica: pjContracts.renovacaoAutomatica,
          valorMensal: pjContracts.valorMensal,
          percentualAdiantamento: pjContracts.percentualAdiantamento,
          percentualFechamento: pjContracts.percentualFechamento,
          diaAdiantamento: pjContracts.diaAdiantamento,
          diaFechamento: pjContracts.diaFechamento,
          modeloContratoUrl: pjContracts.modeloContratoUrl,
          contratoAssinadoUrl: pjContracts.contratoAssinadoUrl,
          tipoAssinatura: pjContracts.tipoAssinatura,
          status: pjContracts.status,
          contratoAnteriorId: pjContracts.contratoAnteriorId,
          observacoes: pjContracts.observacoes,
          createdAt: pjContracts.createdAt,
          employeeName: employees.nomeCompleto,
          employeeCpf: employees.cpf,
          employeeCargo: employees.cargo,
          employeeEmail: employees.email,
          // Dados da empresa contratante
          companyRazaoSocial: companies.razaoSocial,
          companyCnpj: companies.cnpj,
          companyEndereco: companies.endereco,
          companyCidade: companies.cidade,
          companyEstado: companies.estado,
          companyLogoUrl: companies.logoUrl,
          companyNomeFantasia: companies.nomeFantasia,
          companyTelefone: companies.telefone,
          companyEmail: companies.email,
          companySite: companies.site,
        })
        .from(pjContracts)
        .innerJoin(employees, eq(pjContracts.employeeId, employees.id))
        .innerJoin(companies, eq(pjContracts.companyId, companies.id))
        .where(eq(pjContracts.id, input.id));
        return row || null;
      }),

    /** Alertas de contratos vencendo nos próximos 30 dias */
    alertas: protectedProcedure
      .input(z.object({ companyId: z.number() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const hoje = new Date().toISOString().split("T")[0];
        const em30dias = new Date();
        em30dias.setDate(em30dias.getDate() + 30);
        const em30diasStr = em30dias.toISOString().split("T")[0];
        
        // Contratos vencendo nos próximos 30 dias
        const vencendo = await db.select({
          id: pjContracts.id,
          employeeId: pjContracts.employeeId,
          dataFim: pjContracts.dataFim,
          status: pjContracts.status,
          valorMensal: pjContracts.valorMensal,
          employeeName: employees.nomeCompleto,
        })
        .from(pjContracts)
        .innerJoin(employees, eq(pjContracts.employeeId, employees.id))
        .where(and(
          eq(pjContracts.companyId, input.companyId),
          isNull(pjContracts.deletedAt),
          eq(pjContracts.status, 'ativo'),
          sql`${pjContracts.dataFim} BETWEEN ${hoje} AND ${em30diasStr}`,
        ));
        
        // Contratos já vencidos
        const vencidos = await db.select({
          id: pjContracts.id,
          employeeId: pjContracts.employeeId,
          dataFim: pjContracts.dataFim,
          status: pjContracts.status,
          employeeName: employees.nomeCompleto,
        })
        .from(pjContracts)
        .innerJoin(employees, eq(pjContracts.employeeId, employees.id))
        .where(and(
          eq(pjContracts.companyId, input.companyId),
          isNull(pjContracts.deletedAt),
          eq(pjContracts.status, 'ativo'),
          sql`${pjContracts.dataFim} < ${hoje}`,
        ));
        
        // Sem contrato ativo (PJs sem contrato)
        const pjsSemContrato = await db.select({
          id: employees.id,
          nome: employees.nomeCompleto,
          cargo: employees.cargo,
        })
        .from(employees)
        .where(and(
          eq(employees.companyId, input.companyId),
          eq(employees.tipoContrato, 'PJ'),
          eq(employees.status, 'Ativo'),
          isNull(employees.deletedAt),
          sql`${employees.id} NOT IN (SELECT employee_id FROM pj_contracts WHERE company_id = ${input.companyId} AND status = 'ativo' AND deleted_at IS NULL)`,
        ));
        
        return { vencendo, vencidos, pjsSemContrato };
      }),

    /** Gerar texto do contrato preenchido */
    gerarTexto: protectedProcedure
      .input(z.object({ contractId: z.number() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const [contrato] = await db.select()
          .from(pjContracts)
          .where(eq(pjContracts.id, input.contractId));
        if (!contrato) throw new TRPCError({ code: "NOT_FOUND" });
        
        const [emp] = await db.select().from(employees).where(eq(employees.id, contrato.employeeId));
        const [empresa] = await db.select().from(companies).where(eq(companies.id, contrato.companyId));
        
        if (!emp || !empresa) throw new TRPCError({ code: "NOT_FOUND" });
        
        const valorMensal = parseFloat(contrato.valorMensal || "0");
        const percAdiant = contrato.percentualAdiantamento || 40;
        const percFech = contrato.percentualFechamento || 60;
        
        let texto = MODELO_CONTRATO_PJ;
        texto = texto.replace(/\[EMPRESA_RAZAO_SOCIAL\]/g, empresa.razaoSocial || '');
        texto = texto.replace(/\[EMPRESA_CNPJ\]/g, empresa.cnpj || '');
        texto = texto.replace(/\[EMPRESA_ENDERECO\]/g, empresa.endereco || '');
        texto = texto.replace(/\[EMPRESA_CIDADE\]/g, empresa.cidade || '');
        texto = texto.replace(/\[EMPRESA_ESTADO\]/g, empresa.estado || '');
        texto = texto.replace(/\[EMPRESA_CEP\]/g, empresa.cep || '');
        texto = texto.replace(/\[PRESTADOR_NOME\]/g, emp.nomeCompleto || '');
        texto = texto.replace(/\[PRESTADOR_CPF\]/g, emp.cpf || '');
        texto = texto.replace(/\[PRESTADOR_RG\]/g, emp.rg || '');
        texto = texto.replace(/\[PRESTADOR_RAZAO_SOCIAL\]/g, contrato.razaoSocialPrestador || emp.nomeCompleto || '');
        texto = texto.replace(/\[PRESTADOR_CNPJ\]/g, contrato.cnpjPrestador || '');
        texto = texto.replace(/\[PRESTADOR_ENDERECO\]/g, emp.logradouro || '');
        texto = texto.replace(/\[OBJETO_CONTRATO\]/g, contrato.objetoContrato || '');
        texto = texto.replace(/\[DATA_INICIO\]/g, contrato.dataInicio || '');
        texto = texto.replace(/\[DATA_FIM\]/g, contrato.dataFim || '');
        texto = texto.replace(/\[VALOR_MENSAL\]/g, valorMensal.toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
        texto = texto.replace(/\[VALOR_EXTENSO\]/g, ''); // TODO: extenso
        texto = texto.replace(/\[PERCENTUAL_ADIANTAMENTO\]/g, String(percAdiant));
        texto = texto.replace(/\[VALOR_ADIANTAMENTO\]/g, (valorMensal * percAdiant / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
        texto = texto.replace(/\[PERCENTUAL_FECHAMENTO\]/g, String(percFech));
        texto = texto.replace(/\[VALOR_FECHAMENTO\]/g, (valorMensal * percFech / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
        texto = texto.replace(/\[DIA_ADIANTAMENTO\]/g, String(contrato.diaAdiantamento || 15));
        texto = texto.replace(/\[DIA_FECHAMENTO\]/g, String(contrato.diaFechamento || 5));
        texto = texto.replace(/\[DATA_ASSINATURA\]/g, new Date().toLocaleDateString('pt-BR'));
        
        return { texto };
      }),

    create: protectedProcedure
      .input(z.object({
        companyId: z.number(),
        employeeId: z.number(),
        cnpjPrestador: z.string().optional(),
        razaoSocialPrestador: z.string().optional(),
        objetoContrato: z.string().optional(),
        dataInicio: z.string(),
        dataFim: z.string(),
        renovacaoAutomatica: z.number().default(0),
        valorMensal: z.string(),
        percentualAdiantamento: z.number().default(40),
        percentualFechamento: z.number().default(60),
        diaAdiantamento: z.number().default(15),
        diaFechamento: z.number().default(5),
        observacoes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        
        // Gerar número do contrato
        const ano = new Date().getFullYear();
        const [countResult] = await db.select({ total: sql<number>`COUNT(*)` })
          .from(pjContracts)
          .where(eq(pjContracts.companyId, input.companyId));
        const numero = `PJ-${ano}-${String((countResult?.total || 0) + 1).padStart(4, '0')}`;
        
        const [result] = await db.insert(pjContracts).values({
          companyId: input.companyId,
          employeeId: input.employeeId,
          numeroContrato: numero,
          cnpjPrestador: input.cnpjPrestador || null,
          razaoSocialPrestador: input.razaoSocialPrestador || null,
          objetoContrato: input.objetoContrato || null,
          dataInicio: input.dataInicio,
          dataFim: input.dataFim,
          renovacaoAutomatica: input.renovacaoAutomatica,
          valorMensal: input.valorMensal,
          percentualAdiantamento: input.percentualAdiantamento,
          percentualFechamento: input.percentualFechamento,
          diaAdiantamento: input.diaAdiantamento,
          diaFechamento: input.diaFechamento,
          status: 'pendente_assinatura',
          criadoPor: ctx.user.name ?? 'Sistema',
          criadoPorUserId: ctx.user.id,
          observacoes: input.observacoes || null,
        });
        
        return { success: true, id: result.insertId, numeroContrato: numero };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        cnpjPrestador: z.string().optional(),
        razaoSocialPrestador: z.string().optional(),
        objetoContrato: z.string().optional(),
        dataInicio: z.string().optional(),
        dataFim: z.string().optional(),
        renovacaoAutomatica: z.number().optional(),
        valorMensal: z.string().optional(),
        percentualAdiantamento: z.number().optional(),
        percentualFechamento: z.number().optional(),
        diaAdiantamento: z.number().optional(),
        diaFechamento: z.number().optional(),
        tipoAssinatura: z.string().optional(),
        status: z.string().optional(),
        observacoes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        const { id, ...rest } = input;
        const updateData: any = {};
        Object.entries(rest).forEach(([k, v]) => { if (v !== undefined) updateData[k] = v; });
        await db.update(pjContracts).set(updateData).where(eq(pjContracts.id, id));
        return { success: true };
      }),

    /** Upload contrato assinado */
    uploadContrato: protectedProcedure
      .input(z.object({ id: z.number(), fileBase64: z.string(), fileName: z.string() }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        const buffer = Buffer.from(input.fileBase64, 'base64');
        const ext = input.fileName.split('.').pop() || 'pdf';
        const key = `contratos-pj/${input.id}-${Date.now()}.${ext}`;
        const { url } = await storagePut(key, buffer, ext === 'pdf' ? 'application/pdf' : 'application/octet-stream');
        
        await db.update(pjContracts).set({
          contratoAssinadoUrl: url,
          tipoAssinatura: 'manual' as any,
          status: 'ativo' as any,
        }).where(eq(pjContracts.id, input.id));
        
        return { success: true, url };
      }),

    /** Renovar contrato */
    renovar: protectedProcedure
      .input(z.object({
        id: z.number(),
        novaDataInicio: z.string(),
        novaDataFim: z.string(),
        novoValorMensal: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        const [contratoAnterior] = await db.select().from(pjContracts).where(eq(pjContracts.id, input.id));
        if (!contratoAnterior) throw new TRPCError({ code: "NOT_FOUND" });
        
        // Marcar contrato anterior como renovado
        await db.update(pjContracts).set({ status: 'renovado' as any }).where(eq(pjContracts.id, input.id));
        
        // Criar novo contrato
        const ano = new Date().getFullYear();
        const [countResult] = await db.select({ total: sql<number>`COUNT(*)` })
          .from(pjContracts)
          .where(eq(pjContracts.companyId, contratoAnterior.companyId));
        const numero = `PJ-${ano}-${String((countResult?.total || 0) + 1).padStart(4, '0')}`;
        
        const [result] = await db.insert(pjContracts).values({
          companyId: contratoAnterior.companyId,
          employeeId: contratoAnterior.employeeId,
          numeroContrato: numero,
          cnpjPrestador: contratoAnterior.cnpjPrestador,
          razaoSocialPrestador: contratoAnterior.razaoSocialPrestador,
          objetoContrato: contratoAnterior.objetoContrato,
          dataInicio: input.novaDataInicio,
          dataFim: input.novaDataFim,
          renovacaoAutomatica: contratoAnterior.renovacaoAutomatica,
          valorMensal: input.novoValorMensal || contratoAnterior.valorMensal,
          percentualAdiantamento: contratoAnterior.percentualAdiantamento,
          percentualFechamento: contratoAnterior.percentualFechamento,
          diaAdiantamento: contratoAnterior.diaAdiantamento,
          diaFechamento: contratoAnterior.diaFechamento,
          status: 'pendente_assinatura',
          contratoAnteriorId: input.id,
          criadoPor: ctx.user.name ?? 'Sistema',
          criadoPorUserId: ctx.user.id,
        });
        
        return { success: true, novoContratoId: result.insertId, numero };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        await db.update(pjContracts).set({
          deletedAt: sql`NOW()`,
          deletedBy: ctx.user.name ?? 'Sistema',
          deletedByUserId: ctx.user.id,
        } as any).where(eq(pjContracts.id, input.id));
        return { success: true };
      }),
  }),

  // ============================================================
  // PAGAMENTOS PJ
  // ============================================================
  pagamentos: router({
    list: protectedProcedure
      .input(z.object({ companyId: z.number(), mesReferencia: z.string().optional(), contractId: z.number().optional() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const conditions = [eq(pjPayments.companyId, input.companyId)];
        if (input.mesReferencia) conditions.push(eq(pjPayments.mesReferencia, input.mesReferencia));
        if (input.contractId) conditions.push(eq(pjPayments.contractId, input.contractId));
        
        const rows = await db.select({
          id: pjPayments.id,
          contractId: pjPayments.contractId,
          companyId: pjPayments.companyId,
          employeeId: pjPayments.employeeId,
          mesReferencia: pjPayments.mesReferencia,
          tipo: pjPayments.tipo,
          valor: pjPayments.valor,
          descricao: pjPayments.descricao,
          dataPagamento: pjPayments.dataPagamento,
          status: pjPayments.status,
          comprovanteUrl: pjPayments.comprovanteUrl,
          observacoes: pjPayments.observacoes,
          createdAt: pjPayments.createdAt,
          employeeName: employees.nomeCompleto,
        })
        .from(pjPayments)
        .innerJoin(employees, eq(pjPayments.employeeId, employees.id))
        .where(and(...conditions))
        .orderBy(desc(pjPayments.createdAt));
        
        return rows;
      }),

    /** Gerar lançamentos mensais para todos os PJs ativos */
    gerarMensal: protectedProcedure
      .input(z.object({ companyId: z.number(), mesReferencia: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        
        // Buscar contratos ativos
        const contratosAtivos = await db.select()
          .from(pjContracts)
          .where(and(
            eq(pjContracts.companyId, input.companyId),
            eq(pjContracts.status, 'ativo'),
            isNull(pjContracts.deletedAt),
          ));
        
        let criados = 0;
        for (const contrato of contratosAtivos) {
          const valorMensal = parseFloat(contrato.valorMensal || "0");
          const percAdiant = contrato.percentualAdiantamento || 40;
          const percFech = contrato.percentualFechamento || 60;
          
          // Verificar se já existe lançamento para este mês
          const [existente] = await db.select({ total: sql<number>`COUNT(*)` })
            .from(pjPayments)
            .where(and(
              eq(pjPayments.contractId, contrato.id),
              eq(pjPayments.mesReferencia, input.mesReferencia),
            ));
          
          if ((existente?.total || 0) > 0) continue;
          
          // Criar adiantamento
          await db.insert(pjPayments).values({
            contractId: contrato.id,
            companyId: input.companyId,
            employeeId: contrato.employeeId,
            mesReferencia: input.mesReferencia,
            tipo: 'adiantamento',
            valor: (valorMensal * percAdiant / 100).toFixed(2),
            descricao: `Adiantamento ${percAdiant}% - ${input.mesReferencia}`,
            status: 'pendente',
            criadoPor: ctx.user.name ?? 'Sistema',
          });
          
          // Criar fechamento
          await db.insert(pjPayments).values({
            contractId: contrato.id,
            companyId: input.companyId,
            employeeId: contrato.employeeId,
            mesReferencia: input.mesReferencia,
            tipo: 'fechamento',
            valor: (valorMensal * percFech / 100).toFixed(2),
            descricao: `Fechamento ${percFech}% - ${input.mesReferencia}`,
            status: 'pendente',
            criadoPor: ctx.user.name ?? 'Sistema',
          });
          
          criados++;
        }
        
        return { success: true, contratosProcessados: criados };
      }),

    create: protectedProcedure
      .input(z.object({
        contractId: z.number(),
        companyId: z.number(),
        employeeId: z.number(),
        mesReferencia: z.string(),
        tipo: z.enum(['adiantamento','fechamento','bonificacao']),
        valor: z.string(),
        descricao: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        await db.insert(pjPayments).values({
          ...input,
          descricao: input.descricao || null,
          status: 'pendente',
          criadoPor: ctx.user.name ?? 'Sistema',
        });
        return { success: true };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        valor: z.string().optional(),
        descricao: z.string().optional(),
        dataPagamento: z.string().optional(),
        status: z.string().optional(),
        observacoes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        const { id, ...rest } = input;
        const updateData: any = {};
        Object.entries(rest).forEach(([k, v]) => { if (v !== undefined) updateData[k] = v; });
        await db.update(pjPayments).set(updateData).where(eq(pjPayments.id, id));
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        await db.delete(pjPayments).where(eq(pjPayments.id, input.id));
        return { success: true };
      }),
  }),

  /** Relatório consolidado PJ para exportação PDF (retorna HTML formatado) */
  relatorioPJ: protectedProcedure
    .input(z.object({ companyId: z.number(), mesReferencia: z.string() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      
      // Buscar todos os pagamentos do mês
      const pagamentos = await db.select({
        id: pjPayments.id,
        contractId: pjPayments.contractId,
        employeeId: pjPayments.employeeId,
        mesReferencia: pjPayments.mesReferencia,
        tipo: pjPayments.tipo,
        valor: pjPayments.valor,
        descricao: pjPayments.descricao,
        dataPagamento: pjPayments.dataPagamento,
        status: pjPayments.status,
        employeeName: employees.nomeCompleto,
        employeeCpf: employees.cpf,
      })
      .from(pjPayments)
      .innerJoin(employees, eq(pjPayments.employeeId, employees.id))
      .where(and(
        eq(pjPayments.companyId, input.companyId),
        eq(pjPayments.mesReferencia, input.mesReferencia),
      ))
      .orderBy(sql`${employees.nomeCompleto} ASC, ${pjPayments.tipo} ASC`);

      // Buscar contratos ativos
      const contratos = await db.select({
        id: pjContracts.id,
        employeeId: pjContracts.employeeId,
        cnpj: pjContracts.cnpjPrestador,
        razaoSocial: pjContracts.razaoSocialPrestador,
        valorMensal: pjContracts.valorMensal,
        percentualAdiantamento: pjContracts.percentualAdiantamento,
        percentualFechamento: pjContracts.percentualFechamento,
        employeeName: employees.nomeCompleto,
      })
      .from(pjContracts)
      .innerJoin(employees, eq(pjContracts.employeeId, employees.id))
      .where(and(
        eq(pjContracts.companyId, input.companyId),
        isNull(pjContracts.deletedAt),
      ));

      // Agrupar por prestador
      const porPrestador: Record<number, {
        nome: string;
        cpf: string;
        cnpj: string;
        razaoSocial: string;
        valorMensal: string;
        pagamentos: typeof pagamentos;
        totalAdiantamento: number;
        totalFechamento: number;
        totalBonificacao: number;
        totalGeral: number;
      }> = {};

      for (const p of pagamentos) {
        if (!porPrestador[p.employeeId]) {
          const contrato = contratos.find(c => c.employeeId === p.employeeId);
          porPrestador[p.employeeId] = {
            nome: p.employeeName || 'Prestador',
            cpf: p.employeeCpf || '',
            cnpj: contrato?.cnpj || '-',
            razaoSocial: contrato?.razaoSocial || '-',
            valorMensal: contrato?.valorMensal || '0',
            pagamentos: [],
            totalAdiantamento: 0,
            totalFechamento: 0,
            totalBonificacao: 0,
            totalGeral: 0,
          };
        }
        const prest = porPrestador[p.employeeId];
        prest.pagamentos.push(p);
        const val = parseFloat(p.valor || '0');
        if (p.tipo === 'adiantamento') prest.totalAdiantamento += val;
        else if (p.tipo === 'fechamento') prest.totalFechamento += val;
        else prest.totalBonificacao += val;
        prest.totalGeral += val;
      }

      // Totais gerais
      const totalGeral = Object.values(porPrestador).reduce((s, p) => s + p.totalGeral, 0);
      const totalAdiantamento = Object.values(porPrestador).reduce((s, p) => s + p.totalAdiantamento, 0);
      const totalFechamento = Object.values(porPrestador).reduce((s, p) => s + p.totalFechamento, 0);
      const totalBonificacao = Object.values(porPrestador).reduce((s, p) => s + p.totalBonificacao, 0);

      return {
        mesReferencia: input.mesReferencia,
        prestadores: Object.values(porPrestador),
        totais: {
          geral: totalGeral,
          adiantamento: totalAdiantamento,
          fechamento: totalFechamento,
          bonificacao: totalBonificacao,
          qtdPrestadores: Object.keys(porPrestador).length,
          qtdLancamentos: pagamentos.length,
        },
      };
    }),

  /** Modelo de contrato */
  modeloContrato: protectedProcedure.query(() => {
    return { modelo: MODELO_CONTRATO_PJ };
  }),
});
