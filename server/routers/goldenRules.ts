import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { goldenRules, jobFunctions } from "../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import { invokeLLM } from "../_core/llm";

export const goldenRulesRouter = router({
  // Listar regras de ouro por empresa
  list: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(goldenRules)
        .where(eq(goldenRules.companyId, input.companyId))
        .orderBy(desc(goldenRules.prioridade), goldenRules.categoria);
    }),

  // Criar regra de ouro
  create: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      titulo: z.string().min(3),
      descricao: z.string().min(10),
      categoria: z.enum(['seguranca', 'qualidade', 'rh', 'operacional', 'juridico', 'financeiro', 'geral']),
      prioridade: z.enum(['critica', 'alta', 'media', 'baixa']),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('DB not available');
      const [result] = await db.insert(goldenRules).values(input);
      return { id: result.insertId };
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
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('DB not available');
      await db.delete(goldenRules).where(and(eq(goldenRules.id, input.id), eq(goldenRules.companyId, input.companyId)));
      return { success: true };
    }),

  // IA: Gerar descrição de função + Ordem de Serviço NR-1
  generateJobDescription: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      nomeFuncao: z.string(),
      cbo: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('DB not available');

      // 1. Buscar todas as Regras de Ouro ativas da empresa
      const rules = await db.select().from(goldenRules)
        .where(and(eq(goldenRules.companyId, input.companyId), eq(goldenRules.isActive, 1)));

      const regrasTexto = rules.length > 0
        ? rules.map((r: any) => `[${r.categoria.toUpperCase()} - ${r.prioridade.toUpperCase()}] ${r.titulo}: ${r.descricao}`).join('\n')
        : 'Nenhuma regra de ouro cadastrada.';

      // 2. Chamar a IA para gerar descrição + Ordem de Serviço
      const prompt = `Você é um especialista em Recursos Humanos e Segurança do Trabalho no Brasil.

FUNÇÃO: ${input.nomeFuncao}
${input.cbo ? `CBO: ${input.cbo}` : ''}
SETOR: Construção Civil

REGRAS DE OURO DA EMPRESA (INVIOLÁVEIS - nunca sugira algo que contradiga estas regras):
${regrasTexto}

Gere dois textos em português brasileiro:

1. **DESCRIÇÃO DA FUNÇÃO**: Descreva as atividades principais, responsabilidades, competências necessárias e requisitos da função conforme a Classificação Brasileira de Ocupações (CBO). Seja objetivo e completo. Inclua:
   - Atividades principais (mínimo 5)
   - Responsabilidades do cargo
   - Competências técnicas necessárias
   - Requisitos mínimos (formação, experiência)

2. **ORDEM DE SERVIÇO (NR-1)**: Conforme a Norma Regulamentadora NR-1 (Disposições Gerais e Gerenciamento de Riscos Ocupacionais), elabore a Ordem de Serviço para esta função contendo:
   - Descrição das atividades e procedimentos de trabalho
   - Riscos ocupacionais identificados (físicos, químicos, biológicos, ergonômicos, de acidentes)
   - Medidas de prevenção e controle
   - EPIs obrigatórios para a função
   - Procedimentos em caso de emergência
   - Normas Regulamentadoras aplicáveis (NR-6, NR-12, NR-18, NR-35, etc.)
   - Obrigações do trabalhador quanto à segurança

IMPORTANTE: Respeite rigorosamente todas as Regras de Ouro da empresa listadas acima. Nunca sugira procedimentos que contradigam essas regras.

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
});
