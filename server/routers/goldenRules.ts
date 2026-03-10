import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { goldenRules, jobFunctions, companies } from "../../drizzle/schema";
import { eq, and, desc, or, isNull, sql, inArray } from "drizzle-orm";
import { resolveCompanyIds, companyFilter } from "../companyHelper";
import { invokeLLM } from "../_core/llm";

export const goldenRulesRouter = router({
  // Listar regras de ouro por empresa
  list: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(goldenRules)
        .where(companyFilter(goldenRules.companyId, input))
        .orderBy(desc(goldenRules.prioridade), goldenRules.categoria);
    }),

  // Criar regra de ouro
  create: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), titulo: z.string().min(3),
      descricao: z.string().min(10),
      categoria: z.enum(['seguranca', 'qualidade', 'rh', 'operacional', 'juridico', 'financeiro', 'geral']),
      prioridade: z.enum(['critica', 'alta', 'media', 'baixa']),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('DB not available');
      const [result] = await db.insert(goldenRules).values(input);
      return { id: result[0].id };
    }),

  // Atualizar regra de ouro
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      companyId: z.number(),
      titulo: z.string().min(3).optional(),
      descricao: z.string().min(10).optional(),
      categoria: z.enum(['seguranca', 'qualidade', 'rh', 'operacional', 'juridico', 'financeiro', 'geral']).optional(),
      prioridade: z.enum(['critica', 'alta', 'media', 'baixa']).optional(),
      isActive: z.number().min(0).max(1).optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, companyId, ...data } = input;
      const db = await getDb();
      if (!db) throw new Error('DB not available');
      await db.update(goldenRules).set(data).where(and(eq(goldenRules.id, id), eq(goldenRules.companyId, companyId)));
      return { success: true };
    }),

  // Excluir regra de ouro
  delete: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('DB not available');
      await db.update(goldenRules).set({ deletedAt: sql`NOW()`, deletedBy: ctx.user.name ?? 'Sistema', deletedByUserId: ctx.user.id } as any).where(and(eq(goldenRules.id, input.id), companyFilter(goldenRules.companyId, input)));
      return { success: true };
    }),

  // IA: Gerar descrição de função + Ordem de Serviço NR-1
  generateJobDescription: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), nomeFuncao: z.string(),
      cbo: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('DB not available');

      // 1. Buscar dados da empresa
      const [company] = await db.select().from(companies).where(eq(companies.id, input.companyId));
      const nomeEmpresa = company?.nomeFantasia || company?.razaoSocial || 'Empresa';
      const cnpjEmpresa = company?.cnpj || '';
      const dataHoje = new Date().toLocaleDateString('pt-BR');

      // 2. Buscar todas as Regras de Ouro ativas da empresa
      const rules = await db.select().from(goldenRules)
        .where(and(companyFilter(goldenRules.companyId, input), eq(goldenRules.isActive, 1)));

      const regrasTexto = rules.length > 0
        ? rules.map((r: any) => `[${r.categoria.toUpperCase()} - ${r.prioridade.toUpperCase()}] ${r.titulo}: ${r.descricao}`).join('\n')
        : 'Nenhuma regra de ouro cadastrada.';

      // 3. Chamar a IA para gerar descrição + Ordem de Serviço
      const prompt = `Você é um especialista em Recursos Humanos e Segurança do Trabalho no Brasil.

EMPRESA: ${nomeEmpresa}
CNPJ: ${cnpjEmpresa}
DATA DE EMISSÃO: ${dataHoje}
FUNÇÃO: ${input.nomeFuncao}
${input.cbo ? `CBO: ${input.cbo}` : ''}
SETOR: Construção Civil

REGRAS DE OURO DA EMPRESA (INVIOLÁVEIS - nunca sugira algo que contradiga estas regras):
${regrasTexto}

Gere dois textos em português brasileiro. IMPORTANTE: Use os dados REAIS da empresa acima (nome "${nomeEmpresa}", CNPJ "${cnpjEmpresa}", data "${dataHoje}") nos textos. NÃO use placeholders como "[Nome da Empresa]" ou "[Data]".

1. **DESCRIÇÃO DA FUNÇÃO**: Comece com "DESCRIÇÃO DA FUNÇÃO: ${input.nomeFuncao}${input.cbo ? ` CBO: ${input.cbo}` : ''}". Descreva as atividades principais, responsabilidades, competências necessárias e requisitos da função conforme a Classificação Brasileira de Ocupações (CBO). Seja objetivo e completo. Inclua:
   - Atividades principais (mínimo 5)
   - Responsabilidades do cargo
   - Competências técnicas necessárias
   - Requisitos mínimos (formação, experiência)

2. **ORDEM DE SERVIÇO (NR-1)**: Comece com "ORDEM DE SERVIÇO (NR-1) — ${input.nomeFuncao}${input.cbo ? ` CBO: ${input.cbo}` : ''}". Logo abaixo inclua: Empresa: ${nomeEmpresa}, CNPJ: ${cnpjEmpresa}, Data de Emissão: ${dataHoje}, Revisão: 00. Conforme a Norma Regulamentadora NR-1 (Disposições Gerais e Gerenciamento de Riscos Ocupacionais), elabore a Ordem de Serviço para esta função contendo:
   - Descrição das atividades e procedimentos de trabalho
   - Riscos ocupacionais identificados (físicos, químicos, biológicos, ergonômicos, de acidentes)
   - Medidas de prevenção e controle
   - EPIs obrigatórios para a função
   - Procedimentos em caso de emergência
   - Normas Regulamentadoras aplicáveis (NR-6, NR-12, NR-18, NR-35, etc.)
   - Obrigações do trabalhador quanto à segurança

IMPORTANTE: Respeite rigorosamente todas as Regras de Ouro da empresa listadas acima. Nunca sugira procedimentos que contradigam essas regras. Use SEMPRE o nome real da empresa "${nomeEmpresa}" e a data real "${dataHoje}" nos textos.

Responda EXATAMENTE no formato JSON abaixo:`;

      const response = await invokeLLM({
        messages: [
          { role: "system", content: "Você é um especialista em RH e SST brasileiro. Responda sempre em JSON válido." },
          { role: "user", content: prompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "job_description",
            strict: true,
            schema: {
              type: "object",
              properties: {
                descricao: { type: "string", description: "Descrição completa da função conforme CBO" },
                ordemServico: { type: "string", description: "Ordem de Serviço NR-1 completa" },
              },
              required: ["descricao", "ordemServico"],
              additionalProperties: false,
            },
          },
        },
      });

      const rawContent = response.choices?.[0]?.message?.content;
      if (!rawContent) throw new Error("Falha ao gerar descrição com IA");
      const content = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent);
      const parsed = JSON.parse(content);
      return {
        descricao: parsed.descricao,
        ordemServico: parsed.ordemServico,
      };
    }),

  // IA: Gerar descrição + OS em lote para todas as funções incompletas
  generateBatchJobDescriptions: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('DB not available');

      // 1. Buscar dados da empresa
      const [company] = await db.select().from(companies).where(eq(companies.id, input.companyId));
      const nomeEmpresa = company?.nomeFantasia || company?.razaoSocial || 'Empresa';
      const cnpjEmpresa = company?.cnpj || '';
      const dataHoje = new Date().toLocaleDateString('pt-BR');

      // 2. Buscar regras de ouro
      const rules = await db.select().from(goldenRules)
        .where(and(companyFilter(goldenRules.companyId, input), eq(goldenRules.isActive, 1)));
      const regrasTexto = rules.length > 0
        ? rules.map((r: any) => `[${r.categoria.toUpperCase()} - ${r.prioridade.toUpperCase()}] ${r.titulo}: ${r.descricao}`).join('\n')
        : 'Nenhuma regra de ouro cadastrada.';

      // 3. Buscar funções incompletas (sem descrição OU sem ordemServico)
      const allFunctions = await db.select().from(jobFunctions)
        .where(and(
          companyFilter(jobFunctions.companyId, input),
          eq(jobFunctions.isActive, 1)
        ));
      const incomplete = allFunctions.filter((f: any) => !f.descricao || !f.ordemServico);

      if (incomplete.length === 0) {
        return { total: 0, geradas: 0, erros: [] as string[] };
      }

      const erros: string[] = [];
      let geradas = 0;

      // 4. Processar cada função sequencialmente (para não sobrecarregar a IA)
      for (const fn of incomplete) {
        try {
          const prompt = `Você é um especialista em Recursos Humanos e Segurança do Trabalho no Brasil.

EMPRESA: ${nomeEmpresa}
CNPJ: ${cnpjEmpresa}
DATA DE EMISSÃO: ${dataHoje}
FUNÇÃO: ${fn.nome}
${fn.cbo ? `CBO: ${fn.cbo}` : ''}
SETOR: Construção Civil

REGRAS DE OURO DA EMPRESA (INVIOLÁVEIS):
${regrasTexto}

Gere dois textos em português brasileiro. Use os dados REAIS da empresa (nome "${nomeEmpresa}", CNPJ "${cnpjEmpresa}", data "${dataHoje}"). NÃO use placeholders como "[Nome da Empresa]" ou "[Data]".

1. DESCRIÇÃO DA FUNÇÃO: Comece com "DESCRIÇÃO DA FUNÇÃO: ${fn.nome}${fn.cbo ? ` CBO: ${fn.cbo}` : ''}". Descreva atividades principais, responsabilidades, competências e requisitos conforme CBO.

2. ORDEM DE SERVIÇO (NR-1): Comece com "ORDEM DE SERVIÇO (NR-1) — ${fn.nome}${fn.cbo ? ` CBO: ${fn.cbo}` : ''}". Inclua: Empresa: ${nomeEmpresa}, CNPJ: ${cnpjEmpresa}, Data de Emissão: ${dataHoje}, Revisão: 00. Elabore conforme NR-1 com riscos, EPIs, procedimentos de emergência e NRs aplicáveis.

Responda em JSON válido:`;

          const response = await invokeLLM({
            messages: [
              { role: "system", content: "Você é um especialista em RH e SST brasileiro. Responda sempre em JSON válido." },
              { role: "user", content: prompt },
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "job_description",
                strict: true,
                schema: {
                  type: "object",
                  properties: {
                    descricao: { type: "string", description: "Descrição completa da função" },
                    ordemServico: { type: "string", description: "Ordem de Serviço NR-1 completa" },
                  },
                  required: ["descricao", "ordemServico"],
                  additionalProperties: false,
                },
              },
            },
          });

          const rawContent = response.choices?.[0]?.message?.content;
          if (!rawContent) throw new Error("Resposta vazia da IA");
          const content = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent);
          const parsed = JSON.parse(content);

          // Atualizar apenas campos vazios
          const updateData: any = {};
          if (!fn.descricao && parsed.descricao) updateData.descricao = parsed.descricao;
          if (!fn.ordemServico && parsed.ordemServico) updateData.ordemServico = parsed.ordemServico;

          if (Object.keys(updateData).length > 0) {
            await db.update(jobFunctions).set(updateData).where(eq(jobFunctions.id, fn.id));
            geradas++;
          }
        } catch (err: any) {
          erros.push(`${fn.nome}: ${err.message || 'Erro desconhecido'}`);
        }
      }

      return { total: incomplete.length, geradas, erros };
    }),
});
