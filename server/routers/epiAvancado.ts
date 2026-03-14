import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import {
  epiKits, epiKitItems, epiCoresCapacete, epiVidaUtil,
  epiAssinaturas, epiTreinamentosVinculados, epiEstoqueMinimo,
  epiChecklists, epiChecklistItems, epiAiAnalises,
  epis, epiDeliveries, epiEstoqueObra, epiTransferencias,
  employees, obras, trainings, systemCriteria,
  epiAlertaCapacidade, epiAlertaCapacidadeLog, notificationRecipients,
  goldenRules, jobFunctions, obraFuncionarios,
} from "../../drizzle/schema";
import { sendEmail } from "../services/smtpService";
import { eq, and, desc, sql, isNull, gte, lte, inArray } from "drizzle-orm";
import { resolveCompanyIds, companyFilter } from "../companyHelper";
import { storagePut } from "../storage";
import { invokeLLM } from "../_core/llm";

// ============================================================
// SEEDS / DEFAULTS
// ============================================================

const DEFAULT_CORES_CAPACETE = [
  { cor: "Branco", hexColor: "#FFFFFF", funcoes: "Engenheiro,Encarregado,Mestre de Obras", descricao: "Engenheiros, Encarregados e Mestres de Obras" },
  { cor: "Azul", hexColor: "#2563EB", funcoes: "Servente,Eletricista,Técnico", descricao: "Serventes, Eletricistas e Técnicos" },
  { cor: "Vermelho", hexColor: "#DC2626", funcoes: "Bombeiro,Brigadista", descricao: "Bombeiros e Brigadistas" },
  { cor: "Verde", hexColor: "#16A34A", funcoes: "TST,CIPA,Meio Ambiente", descricao: "Técnicos de Segurança, CIPA e Meio Ambiente" },
  { cor: "Amarelo", hexColor: "#EAB308", funcoes: "Visitante", descricao: "Visitantes" },
  { cor: "Cinza", hexColor: "#6B7280", funcoes: "Pedreiro,Armador,Carpinteiro", descricao: "Pedreiros, Armadores e Carpinteiros" },
  { cor: "Laranja", hexColor: "#EA580C", funcoes: "Sinaleiro,Operador de Máquinas", descricao: "Sinaleiros e Operadores de Máquinas" },
];

const DEFAULT_KIT_BASICO = [
  { nomeEpi: "Capacete de Segurança", categoria: "EPI" as const, quantidade: 1, obrigatorio: 1 },
  { nomeEpi: "Protetor Auricular", categoria: "EPI" as const, quantidade: 1, obrigatorio: 1 },
  { nomeEpi: "Máscara PFF2", categoria: "EPI" as const, quantidade: 1, obrigatorio: 1 },
  { nomeEpi: "Luva de Segurança", categoria: "EPI" as const, quantidade: 1, obrigatorio: 1 },
  { nomeEpi: "Óculos de Proteção", categoria: "EPI" as const, quantidade: 1, obrigatorio: 1 },
  { nomeEpi: "Camisa Manga Longa", categoria: "Uniforme" as const, quantidade: 2, obrigatorio: 1 },
  { nomeEpi: "Calça de Brim", categoria: "Uniforme" as const, quantidade: 2, obrigatorio: 1 },
  { nomeEpi: "Botina de Segurança", categoria: "Calcado" as const, quantidade: 1, obrigatorio: 1 },
];

const DEFAULT_KITS_POR_FUNCAO: Record<string, { nome: string; itensExtras: { nomeEpi: string; categoria: "EPI" | "Uniforme" | "Calcado"; quantidade: number }[] }> = {
  "Eletricista": {
    nome: "Kit Eletricista",
    itensExtras: [
      { nomeEpi: "Luva Isolante Classe 00", categoria: "EPI", quantidade: 1 },
      { nomeEpi: "Manga Isolante", categoria: "EPI", quantidade: 1 },
      { nomeEpi: "Óculos contra Arco Elétrico", categoria: "EPI", quantidade: 1 },
    ],
  },
  "Soldador": {
    nome: "Kit Soldador",
    itensExtras: [
      { nomeEpi: "Máscara de Solda", categoria: "EPI", quantidade: 1 },
      { nomeEpi: "Avental de Raspa", categoria: "EPI", quantidade: 1 },
      { nomeEpi: "Luva de Raspa", categoria: "EPI", quantidade: 1 },
      { nomeEpi: "Perneira de Raspa", categoria: "EPI", quantidade: 1 },
    ],
  },
  "Carpinteiro": {
    nome: "Kit Carpinteiro",
    itensExtras: [
      { nomeEpi: "Luva Anticorte", categoria: "EPI", quantidade: 1 },
    ],
  },
  "Trabalho em Altura": {
    nome: "Kit Trabalho em Altura",
    itensExtras: [
      { nomeEpi: "Cinto Paraquedista", categoria: "EPI", quantidade: 1 },
      { nomeEpi: "Talabarte Duplo com ABS", categoria: "EPI", quantidade: 1 },
      { nomeEpi: "Trava-Queda", categoria: "EPI", quantidade: 1 },
    ],
  },
  "Operador de Máquinas": {
    nome: "Kit Operador de Máquinas",
    itensExtras: [
      { nomeEpi: "Protetor Auricular Tipo Concha", categoria: "EPI", quantidade: 1 },
    ],
  },
};

const DEFAULT_VIDA_UTIL = [
  { nomeEpi: "Capacete de Segurança", categoriaEpi: "EPI", vidaUtilMeses: 60 },
  { nomeEpi: "Botina de Segurança", categoriaEpi: "Calcado", vidaUtilMeses: 6 },
  { nomeEpi: "Luva de Segurança", categoriaEpi: "EPI", vidaUtilMeses: 3 },
  { nomeEpi: "Óculos de Proteção", categoriaEpi: "EPI", vidaUtilMeses: 12 },
  { nomeEpi: "Protetor Auricular", categoriaEpi: "EPI", vidaUtilMeses: 6 },
  { nomeEpi: "Máscara PFF2", categoriaEpi: "EPI", vidaUtilMeses: 1 },
  { nomeEpi: "Cinto Paraquedista", categoriaEpi: "EPI", vidaUtilMeses: 60 },
  { nomeEpi: "Camisa Manga Longa", categoriaEpi: "Uniforme", vidaUtilMeses: 6 },
  { nomeEpi: "Calça de Brim", categoriaEpi: "Uniforme", vidaUtilMeses: 6 },
];

const DEFAULT_TREINAMENTOS_VINCULADOS = [
  { nomeEpi: "Cinto Paraquedista", normaExigida: "NR-35", nomeTreinamento: "Trabalho em Altura - NR-35", obrigatorio: 1 },
  { nomeEpi: "Talabarte Duplo com ABS", normaExigida: "NR-35", nomeTreinamento: "Trabalho em Altura - NR-35", obrigatorio: 1 },
  { nomeEpi: "Trava-Queda", normaExigida: "NR-35", nomeTreinamento: "Trabalho em Altura - NR-35", obrigatorio: 1 },
  { nomeEpi: "Luva Isolante Classe 00", normaExigida: "NR-10", nomeTreinamento: "Segurança em Instalações Elétricas - NR-10", obrigatorio: 1 },
  { nomeEpi: "Manga Isolante", normaExigida: "NR-10", nomeTreinamento: "Segurança em Instalações Elétricas - NR-10", obrigatorio: 1 },
  { nomeEpi: "Máscara de Solda", normaExigida: "NR-18", nomeTreinamento: "Soldagem e Corte a Quente", obrigatorio: 1 },
  { nomeEpi: "Respirador Semifacial", normaExigida: "NR-15", nomeTreinamento: "Proteção Respiratória", obrigatorio: 1 },
];

export const epiAvancadoRouter = router({

  // ============================================================
  // KITS DE EPI POR FUNÇÃO
  // ============================================================
  kitsList: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const kits = await db.select().from(epiKits)
        .where(companyFilter(epiKits.companyId, input))
        .orderBy(epiKits.funcao);
      
      // Get items for each kit
      const kitIds = kits.map(k => k.id);
      let items: any[] = [];
      if (kitIds.length > 0) {
        items = await db.select().from(epiKitItems)
          .where(inArray(epiKitItems.kitId, kitIds))
          .orderBy(epiKitItems.nomeEpi);
      }
      
      return kits.map(kit => ({
        ...kit,
        items: items.filter(i => i.kitId === kit.id),
      }));
    }),

  kitsCreate: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), nome: z.string(),
      funcao: z.string(),
      descricao: z.string().optional(),
      items: z.array(z.object({
        nomeEpi: z.string(),
        epiId: z.number().optional(),
        categoria: z.enum(["EPI", "Uniforme", "Calcado"]).default("EPI"),
        quantidade: z.number().min(1).default(1),
        obrigatorio: z.boolean().default(true),
        observacoes: z.string().optional(),
      })),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const [result] = await db.insert(epiKits).values({
        companyId: input.companyId,
        nome: input.nome,
        funcao: input.funcao,
        descricao: input.descricao || null,
      }).returning({ id: epiKits.id });
      const kitId = result.id;

      if (input.items.length > 0) {
        await db.insert(epiKitItems).values(
          input.items.map(item => ({
            kitId,
            nomeEpi: item.nomeEpi,
            epiId: item.epiId || null,
            categoria: item.categoria,
            quantidade: item.quantidade,
            obrigatorio: item.obrigatorio ? 1 : 0,
            observacoes: item.observacoes || null,
          }))
        );
      }
      return { id: kitId };
    }),

  kitsUpdate: protectedProcedure
    .input(z.object({
      id: z.number(),
      nome: z.string().optional(),
      funcao: z.string().optional(),
      descricao: z.string().optional(),
      ativo: z.boolean().optional(),
      items: z.array(z.object({
        nomeEpi: z.string(),
        epiId: z.number().optional(),
        categoria: z.enum(["EPI", "Uniforme", "Calcado"]).default("EPI"),
        quantidade: z.number().min(1).default(1),
        obrigatorio: z.boolean().default(true),
        observacoes: z.string().optional(),
      })).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const updateData: any = {};
      if (input.nome !== undefined) updateData.nome = input.nome;
      if (input.funcao !== undefined) updateData.funcao = input.funcao;
      if (input.descricao !== undefined) updateData.descricao = input.descricao;
      if (input.ativo !== undefined) updateData.ativo = input.ativo ? 1 : 0;
      
      if (Object.keys(updateData).length > 0) {
        await db.update(epiKits).set(updateData).where(eq(epiKits.id, input.id));
      }

      if (input.items) {
        await db.delete(epiKitItems).where(eq(epiKitItems.kitId, input.id));
        if (input.items.length > 0) {
          await db.insert(epiKitItems).values(
            input.items.map(item => ({
              kitId: input.id,
              nomeEpi: item.nomeEpi,
              epiId: item.epiId || null,
              categoria: item.categoria,
              quantidade: item.quantidade,
              obrigatorio: item.obrigatorio ? 1 : 0,
              observacoes: item.observacoes || null,
            }))
          );
        }
      }
      return { success: true };
    }),

  kitsDelete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await db.delete(epiKitItems).where(eq(epiKitItems.kitId, input.id));
      await db.delete(epiKits).where(eq(epiKits.id, input.id));
      return { success: true };
    }),

  // Seed kits padrão
  kitsSeedDefaults: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      
      // Check if already seeded
      const existing = await db.select().from(epiKits).where(companyFilter(epiKits.companyId, input));
      if (existing.length > 0) return { message: "Kits já configurados", created: 0 };

      let created = 0;
      
      // Kit Básico (para todas as funções)
      const [basicResult] = await db.insert(epiKits).values({
        companyId: input.companyId,
        nome: "Kit Básico Obra",
        funcao: "Geral",
        descricao: "Kit padrão para todos os funcionários de obra (NR-6)",
      }).returning({ id: epiKits.id });
      await db.insert(epiKitItems).values(
        DEFAULT_KIT_BASICO.map(item => ({
          kitId: basicResult.id,
          nomeEpi: item.nomeEpi,
          categoria: item.categoria,
          quantidade: item.quantidade,
          obrigatorio: item.obrigatorio,
        }))
      );
      created++;

      // Kits específicos por função
      for (const [funcao, config] of Object.entries(DEFAULT_KITS_POR_FUNCAO)) {
        const [result] = await db.insert(epiKits).values({
          companyId: input.companyId,
          nome: config.nome,
          funcao,
          descricao: `Kit específico para ${funcao} - inclui kit básico + itens adicionais`,
        }).returning({ id: epiKits.id });
        const allItems = [...DEFAULT_KIT_BASICO, ...config.itensExtras.map(e => ({ ...e, obrigatorio: 1 }))];
        await db.insert(epiKitItems).values(
          allItems.map(item => ({
            kitId: result.id,
            nomeEpi: item.nomeEpi,
            categoria: item.categoria,
            quantidade: item.quantidade,
            obrigatorio: item.obrigatorio,
          }))
        );
        created++;
      }

      return { message: `${created} kits criados com sucesso`, created };
    }),

  // ============================================================
  // CORES DE CAPACETE
  // ============================================================
  coresCapaceteList: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      return db.select().from(epiCoresCapacete)
        .where(companyFilter(epiCoresCapacete.companyId, input))
        .orderBy(epiCoresCapacete.cor);
    }),

  coresCapaceteUpsert: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), cores: z.array(z.object({
        id: z.number().optional(),
        cor: z.string(),
        hexColor: z.string().optional(),
        funcoes: z.string(),
        descricao: z.string().optional(),
      })),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      // Delete existing and replace
      await db.delete(epiCoresCapacete).where(companyFilter(epiCoresCapacete.companyId, input));
      if (input.cores.length > 0) {
        await db.insert(epiCoresCapacete).values(
          input.cores.map(c => ({
            companyId: input.companyId,
            cor: c.cor,
            hexColor: c.hexColor || null,
            funcoes: c.funcoes,
            descricao: c.descricao || null,
          }))
        );
      }
      return { success: true };
    }),

  coresCapaceteSeedDefaults: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const existing = await db.select().from(epiCoresCapacete).where(companyFilter(epiCoresCapacete.companyId, input));
      if (existing.length > 0) return { message: "Cores já configuradas", created: 0 };
      
      await db.insert(epiCoresCapacete).values(
        DEFAULT_CORES_CAPACETE.map(c => ({ companyId: input.companyId, ...c }))
      );
      return { message: `${DEFAULT_CORES_CAPACETE.length} cores configuradas`, created: DEFAULT_CORES_CAPACETE.length };
    }),

  // Determinar cor do capacete pela função
  corCapacetePorFuncao: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), funcao: z.string() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const cores = await db.select().from(epiCoresCapacete)
        .where(companyFilter(epiCoresCapacete.companyId, input));
      
      const funcaoLower = input.funcao.toLowerCase();
      for (const c of cores) {
        const funcoesList = c.funcoes.split(",").map(f => f.trim().toLowerCase());
        if (funcoesList.some(f => funcaoLower.includes(f) || f.includes(funcaoLower))) {
          return { cor: c.cor, hexColor: c.hexColor };
        }
      }
      return { cor: "Azul", hexColor: "#2563EB" }; // Default
    }),

  // ============================================================
  // VIDA ÚTIL DE EPIs
  // ============================================================
  vidaUtilList: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      return db.select().from(epiVidaUtil)
        .where(companyFilter(epiVidaUtil.companyId, input))
        .orderBy(epiVidaUtil.nomeEpi);
    }),

  vidaUtilUpsert: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), items: z.array(z.object({
        id: z.number().optional(),
        nomeEpi: z.string(),
        categoriaEpi: z.string().optional(),
        vidaUtilMeses: z.number().min(1),
        observacoes: z.string().optional(),
      })),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await db.delete(epiVidaUtil).where(companyFilter(epiVidaUtil.companyId, input));
      if (input.items.length > 0) {
        await db.insert(epiVidaUtil).values(
          input.items.map(i => ({
            companyId: input.companyId,
            nomeEpi: i.nomeEpi,
            categoriaEpi: i.categoriaEpi || null,
            vidaUtilMeses: i.vidaUtilMeses,
            observacoes: i.observacoes || null,
          }))
        );
      }
      return { success: true };
    }),

  vidaUtilSeedDefaults: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const existing = await db.select().from(epiVidaUtil).where(companyFilter(epiVidaUtil.companyId, input));
      if (existing.length > 0) return { message: "Vida útil já configurada", created: 0 };
      
      await db.insert(epiVidaUtil).values(
        DEFAULT_VIDA_UTIL.map(v => ({ companyId: input.companyId, ...v }))
      );
      return { message: `${DEFAULT_VIDA_UTIL.length} configurações criadas`, created: DEFAULT_VIDA_UTIL.length };
    }),

  // ============================================================
  // TREINAMENTOS VINCULADOS A EPIs
  // ============================================================
  treinamentosVinculadosList: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      return db.select().from(epiTreinamentosVinculados)
        .where(companyFilter(epiTreinamentosVinculados.companyId, input))
        .orderBy(epiTreinamentosVinculados.nomeEpi);
    }),

  treinamentosVinculadosUpsert: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), items: z.array(z.object({
        nomeEpi: z.string(),
        categoriaEpi: z.string().optional(),
        normaExigida: z.string(),
        nomeTreinamento: z.string(),
        obrigatorio: z.boolean().default(true),
        descricao: z.string().optional(),
      })),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await db.delete(epiTreinamentosVinculados).where(companyFilter(epiTreinamentosVinculados.companyId, input));
      if (input.items.length > 0) {
        await db.insert(epiTreinamentosVinculados).values(
          input.items.map(i => ({
            companyId: input.companyId,
            nomeEpi: i.nomeEpi,
            categoriaEpi: i.categoriaEpi || null,
            normaExigida: i.normaExigida,
            nomeTreinamento: i.nomeTreinamento,
            obrigatorio: i.obrigatorio ? 1 : 0,
            descricao: i.descricao || null,
          }))
        );
      }
      return { success: true };
    }),

  treinamentosVinculadosSeedDefaults: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const existing = await db.select().from(epiTreinamentosVinculados).where(companyFilter(epiTreinamentosVinculados.companyId, input));
      if (existing.length > 0) return { message: "Treinamentos já configurados", created: 0 };
      
      await db.insert(epiTreinamentosVinculados).values(
        DEFAULT_TREINAMENTOS_VINCULADOS.map(t => ({ companyId: input.companyId, ...t }))
      );
      return { message: `${DEFAULT_TREINAMENTOS_VINCULADOS.length} vínculos criados`, created: DEFAULT_TREINAMENTOS_VINCULADOS.length };
    }),

  // Verificar treinamentos do funcionário antes da entrega
  verificarTreinamentosFuncionario: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), employeeId: z.number(),
      nomeEpi: z.string(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      // Get required trainings for this EPI
      const vinculos = await db.select().from(epiTreinamentosVinculados)
        .where(and(
          companyFilter(epiTreinamentosVinculados.companyId, input),
        ));
      
      const epiLower = input.nomeEpi.toLowerCase();
      const vinculosRelevantes = vinculos.filter(v => 
        epiLower.includes(v.nomeEpi.toLowerCase()) || v.nomeEpi.toLowerCase().includes(epiLower)
      );
      
      if (vinculosRelevantes.length === 0) {
        return { liberado: true, treinamentosExigidos: [], treinamentosFaltantes: [], mensagem: "Nenhum treinamento exigido para este EPI" };
      }

      // Get employee trainings
      const treinamentosFunc = await db.select().from(trainings)
        .where(and(
          eq(trainings.employeeId, input.employeeId),
          isNull(trainings.deletedAt),
        ));

      const hoje = new Date().toISOString().split("T")[0];
      const treinamentosFaltantes: { norma: string; nome: string; status: string }[] = [];
      
      for (const vinculo of vinculosRelevantes) {
        const treinamentoValido = treinamentosFunc.find(t => {
          const normaMatch = t.norma && t.norma.toLowerCase().includes(vinculo.normaExigida.toLowerCase());
          const nomeMatch = t.nome.toLowerCase().includes(vinculo.normaExigida.toLowerCase());
          const valido = !t.dataValidade || t.dataValidade >= hoje;
          return (normaMatch || nomeMatch) && valido;
        });
        
        if (!treinamentoValido) {
          const treinamentoVencido = treinamentosFunc.find(t => {
            const normaMatch = t.norma && t.norma.toLowerCase().includes(vinculo.normaExigida.toLowerCase());
            const nomeMatch = t.nome.toLowerCase().includes(vinculo.normaExigida.toLowerCase());
            return normaMatch || nomeMatch;
          });
          
          treinamentosFaltantes.push({
            norma: vinculo.normaExigida,
            nome: vinculo.nomeTreinamento,
            status: treinamentoVencido ? "Vencido" : "Não realizado",
          });
        }
      }

      return {
        liberado: treinamentosFaltantes.length === 0,
        treinamentosExigidos: vinculosRelevantes.map(v => ({ norma: v.normaExigida, nome: v.nomeTreinamento })),
        treinamentosFaltantes,
        mensagem: treinamentosFaltantes.length > 0
          ? `Funcionário não possui treinamento(s) válido(s): ${treinamentosFaltantes.map(t => t.norma).join(", ")}`
          : "Todos os treinamentos exigidos estão válidos",
      };
    }),

  // ============================================================
  // CHECKLISTS DE EPI (Contratação / Devolução)
  // ============================================================
  checklistGenerate: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), employeeId: z.number(),
      tipo: z.enum(["contratacao", "devolucao"]).default("contratacao"),
      kitId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      
      if (input.tipo === "contratacao") {
        // Get employee function
        const [emp] = await db.select({ funcao: employees.funcao, nomeCompleto: employees.nomeCompleto })
          .from(employees).where(eq(employees.id, input.employeeId));
        if (!emp) throw new Error("Funcionário não encontrado");

        // Find matching kit
        let kitToUse: any = null;
        let kitItems: any[] = [];

        if (input.kitId) {
          [kitToUse] = await db.select().from(epiKits).where(eq(epiKits.id, input.kitId));
          if (kitToUse) {
            kitItems = await db.select().from(epiKitItems).where(eq(epiKitItems.kitId, kitToUse.id));
          }
        }

        if (!kitToUse) {
          // Try to find by function
          const funcaoLower = (emp.funcao || "").toLowerCase();
          const allKits = await db.select().from(epiKits)
            .where(and(companyFilter(epiKits.companyId, input), eq(epiKits.ativo, 1)));
          
          kitToUse = allKits.find(k => funcaoLower.includes(k.funcao.toLowerCase()) || k.funcao.toLowerCase().includes(funcaoLower));
          if (!kitToUse) {
            kitToUse = allKits.find(k => k.funcao.toLowerCase() === "geral");
          }
          
          if (kitToUse) {
            kitItems = await db.select().from(epiKitItems).where(eq(epiKitItems.kitId, kitToUse.id));
          }
        }

        if (!kitToUse || kitItems.length === 0) {
          // Use default basic kit
          kitItems = DEFAULT_KIT_BASICO.map((item, i) => ({
            id: i,
            kitId: 0,
            nomeEpi: item.nomeEpi,
            categoria: item.categoria,
            quantidade: item.quantidade,
            obrigatorio: item.obrigatorio,
          }));
        }

        // Create checklist
        const [result] = await db.insert(epiChecklists).values({
          companyId: input.companyId,
          employeeId: input.employeeId,
          kitId: kitToUse?.id || null,
          tipo: "contratacao",
          status: "pendente",
          criadoPor: ctx.user?.name || "Sistema",
          criadoPorUserId: ctx.user?.id || null,
        }).returning({ id: epiChecklists.id });

        await db.insert(epiChecklistItems).values(
          kitItems.map(item => ({
            checklistId: result.id,
            nomeEpi: item.nomeEpi,
            categoria: item.categoria,
            quantidade: item.quantidade,
            epiId: item.epiId || null,
          }))
        );

        return { id: result.id, kitUsado: kitToUse?.nome || "Kit Básico", totalItens: kitItems.length };
      } else {
        // Devolução: generate from last deliveries
        const entregas = await db.select({
          epiId: epiDeliveries.epiId,
          nomeEpi: epis.nome,
          categoria: epis.categoria,
          quantidade: epiDeliveries.quantidade,
          dataEntrega: epiDeliveries.dataEntrega,
        })
          .from(epiDeliveries)
          .leftJoin(epis, eq(epiDeliveries.epiId, epis.id))
          .where(and(
            eq(epiDeliveries.employeeId, input.employeeId),
            isNull(epiDeliveries.deletedAt),
            isNull(epiDeliveries.dataDevolucao),
          ))
          .orderBy(desc(epiDeliveries.dataEntrega));

        const [result] = await db.insert(epiChecklists).values({
          companyId: input.companyId,
          employeeId: input.employeeId,
          tipo: "devolucao",
          status: "pendente",
          criadoPor: ctx.user?.name || "Sistema",
          criadoPorUserId: ctx.user?.id || null,
        }).returning({ id: epiChecklists.id });

        if (entregas.length > 0) {
          await db.insert(epiChecklistItems).values(
            entregas.map(e => ({
              checklistId: result.id,
              nomeEpi: e.nomeEpi || "EPI",
              categoria: (e.categoria || "EPI") as "EPI" | "Uniforme" | "Calcado",
              quantidade: e.quantidade,
              epiId: e.epiId,
            }))
          );
        }

        return { id: result.id, totalItens: entregas.length };
      }
    }),

  checklistList: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), employeeId: z.number().optional(),
      tipo: z.enum(["contratacao", "devolucao"]).optional(),
      status: z.enum(["pendente", "parcial", "concluido", "cancelado"]).optional(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const conds: any[] = [companyFilter(epiChecklists.companyId, input)];
      if (input.employeeId) conds.push(eq(epiChecklists.employeeId, input.employeeId));
      if (input.tipo) conds.push(eq(epiChecklists.tipo, input.tipo));
      if (input.status) conds.push(eq(epiChecklists.status, input.status));

      const checklists = await db.select({
        id: epiChecklists.id,
        companyId: epiChecklists.companyId,
        employeeId: epiChecklists.employeeId,
        kitId: epiChecklists.kitId,
        tipo: epiChecklists.tipo,
        status: epiChecklists.status,
        observacoes: epiChecklists.observacoes,
        criadoPor: epiChecklists.criadoPor,
        concluidoEm: epiChecklists.concluidoEm,
        createdAt: epiChecklists.createdAt,
        nomeFunc: employees.nomeCompleto,
        funcaoFunc: employees.funcao,
      })
        .from(epiChecklists)
        .leftJoin(employees, eq(epiChecklists.employeeId, employees.id))
        .where(and(...conds))
        .orderBy(desc(epiChecklists.createdAt));

      // Get items for each checklist
      const checklistIds = checklists.map(c => c.id);
      let items: any[] = [];
      if (checklistIds.length > 0) {
        items = await db.select().from(epiChecklistItems)
          .where(inArray(epiChecklistItems.checklistId, checklistIds));
      }

      return checklists.map(cl => ({
        ...cl,
        items: items.filter(i => i.checklistId === cl.id),
        totalItens: items.filter(i => i.checklistId === cl.id).length,
        itensEntregues: items.filter(i => i.checklistId === cl.id && Number(i.entregue) === 1).length,
        itensDevolvidos: items.filter(i => i.checklistId === cl.id && Number(i.devolvido) === 1).length,
      }));
    }),

  checklistUpdateItem: protectedProcedure
    .input(z.object({
      itemId: z.number(),
      checklistId: z.number(),
      entregue: z.boolean().optional(),
      devolvido: z.boolean().optional(),
      epiId: z.number().optional(),
      deliveryId: z.number().optional(),
      dataEntrega: z.string().optional(),
      dataDevolucao: z.string().optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const updateData: any = {};
      if (input.entregue !== undefined) updateData.entregue = input.entregue ? 1 : 0;
      if (input.devolvido !== undefined) updateData.devolvido = input.devolvido ? 1 : 0;
      if (input.epiId !== undefined) updateData.epiId = input.epiId;
      if (input.deliveryId !== undefined) updateData.deliveryId = input.deliveryId;
      if (input.dataEntrega !== undefined) updateData.dataEntrega = input.dataEntrega;
      if (input.dataDevolucao !== undefined) updateData.dataDevolucao = input.dataDevolucao;
      if (input.observacoes !== undefined) updateData.observacoes = input.observacoes;

      await db.update(epiChecklistItems).set(updateData).where(eq(epiChecklistItems.id, input.itemId));

      // Update checklist status
      const items = await db.select().from(epiChecklistItems)
        .where(eq(epiChecklistItems.checklistId, input.checklistId));
      
      const [checklist] = await db.select().from(epiChecklists).where(eq(epiChecklists.id, input.checklistId));
      const isEntrega = checklist?.tipo === "contratacao";
      
      const totalItems = items.length;
      const completedItems = items.filter(i => isEntrega ? Number(i.entregue) === 1 : Number(i.devolvido) === 1).length;
      
      let newStatus: "pendente" | "parcial" | "concluido" = "pendente";
      if (completedItems === totalItems) newStatus = "concluido";
      else if (completedItems > 0) newStatus = "parcial";

      await db.update(epiChecklists).set({
        status: newStatus,
        ...(newStatus === "concluido" ? { concluidoEm: sql`NOW()` } : {}),
      } as any).where(eq(epiChecklists.id, input.checklistId));

      return { success: true, status: newStatus };
    }),

  // Excluir checklist de EPI
  checklistDelete: protectedProcedure
    .input(z.object({
      checklistId: z.number(),
      companyId: z.number(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      // Verificar se o checklist pertence à empresa
      const [checklist] = await db.select().from(epiChecklists)
        .where(and(eq(epiChecklists.id, input.checklistId), companyFilter(epiChecklists.companyId, input)));
      if (!checklist) throw new TRPCError({ code: "NOT_FOUND", message: "Checklist não encontrado" });
      // Excluir itens do checklist primeiro
      await db.delete(epiChecklistItems).where(eq(epiChecklistItems.checklistId, input.checklistId));
      // Excluir o checklist
      await db.delete(epiChecklists).where(eq(epiChecklists.id, input.checklistId));
      return { success: true };
    }),

  // ============================================================
  // ASSINATURAS DIGITAIS
  // ============================================================
  salvarAssinatura: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), deliveryId: z.number().optional(),
      employeeId: z.number(),
      tipo: z.enum(["entrega", "devolucao"]),
      assinaturaBase64: z.string(),
      ipAddress: z.string().optional(),
      userAgent: z.string().optional(),
      // Campos de auditoria
      latitude: z.string().optional(),
      longitude: z.string().optional(),
      geoAccuracy: z.string().optional(),
      termoAceito: z.boolean().optional(),
      textoTermo: z.string().optional(),
      dispositivoInfo: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const crypto = await import("crypto");
      
      // Upload signature image to S3
      const buffer = Buffer.from(input.assinaturaBase64.replace(/^data:image\/\w+;base64,/, ""), "base64");
      const key = `assinaturas-epi/${input.companyId}/${input.employeeId}-${Date.now()}-${Math.random().toString(36).slice(2)}.png`;
      const { url } = await storagePut(key, buffer, "image/png");

      // Gerar hash SHA-256 da imagem da assinatura (prova de integridade)
      const hashSha256 = crypto.createHash("sha256").update(buffer).digest("hex");

      await db.insert(epiAssinaturas).values({
        companyId: input.companyId,
        deliveryId: input.deliveryId || null,
        employeeId: input.employeeId,
        tipo: input.tipo,
        assinaturaUrl: url,
        ipAddress: input.ipAddress || null,
        userAgent: input.userAgent || null,
        entregadorNome: ctx.user?.name || null,
        entregadorUserId: ctx.user?.id || null,
        // Campos de auditoria
        hashSha256,
        latitude: input.latitude || null,
        longitude: input.longitude || null,
        geoAccuracy: input.geoAccuracy || null,
        termoAceito: input.termoAceito ? 1 : 0,
        textoTermo: input.textoTermo || null,
        dispositivoInfo: input.dispositivoInfo || null,
      });

      // Also save to delivery record if deliveryId provided
      if (input.deliveryId) {
        await db.update(epiDeliveries).set({
          assinaturaUrl: url,
        } as any).where(eq(epiDeliveries.id, input.deliveryId));
      }

      return { success: true, url, hashSha256 };
    }),

  assinaturasDoFuncionario: protectedProcedure
    .input(z.object({ employeeId: z.number() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      return db.select().from(epiAssinaturas)
        .where(eq(epiAssinaturas.employeeId, input.employeeId))
        .orderBy(desc(epiAssinaturas.createdAt));
    }),

  // Relatório de auditoria de uma assinatura específica
  assinaturaAuditoria: protectedProcedure
    .input(z.object({ assinaturaId: z.number() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const [assinatura] = await db.select().from(epiAssinaturas)
        .where(eq(epiAssinaturas.id, input.assinaturaId));
      if (!assinatura) throw new TRPCError({ code: "NOT_FOUND", message: "Assinatura não encontrada" });

      // Buscar dados do funcionário
      const [emp] = await db.select({
        nome: employees.nomeCompleto,
        cpf: employees.cpf,
        funcao: employees.funcao,
        matricula: employees.matricula,
      }).from(employees).where(eq(employees.id, assinatura.employeeId));

      // Buscar dados da entrega se existir
      let entrega = null;
      if (assinatura.deliveryId) {
        const [del] = await db.select().from(epiDeliveries)
          .where(eq(epiDeliveries.id, assinatura.deliveryId));
        if (del) {
          const [epi] = await db.select({ nome: epis.nome, ca: epis.ca }).from(epis)
            .where(eq(epis.id, del.epiId));
          entrega = { ...del, epiNome: epi?.nome, epiCA: epi?.ca };
        }
      }

      return {
        assinatura,
        funcionario: emp || null,
        entrega,
        auditoria: {
          hashSha256: (assinatura as any).hashSha256 || null,
          latitude: (assinatura as any).latitude || null,
          longitude: (assinatura as any).longitude || null,
          geoAccuracy: (assinatura as any).geoAccuracy || null,
          termoAceito: (assinatura as any).termoAceito || 0,
          textoTermo: (assinatura as any).textoTermo || null,
          dispositivoInfo: (assinatura as any).dispositivoInfo || null,
          ipAddress: assinatura.ipAddress,
          userAgent: assinatura.userAgent,
          entregadorNome: assinatura.entregadorNome,
          assinadoEm: assinatura.assinadoEm,
        },
      };
    }),

  // Verificar integridade de uma assinatura (comparar hash)
  verificarIntegridade: protectedProcedure
    .input(z.object({ assinaturaId: z.number() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const crypto = await import("crypto");
      const [assinatura] = await db.select().from(epiAssinaturas)
        .where(eq(epiAssinaturas.id, input.assinaturaId));
      if (!assinatura) throw new TRPCError({ code: "NOT_FOUND", message: "Assinatura não encontrada" });

      const hashOriginal = (assinatura as any).hashSha256;
      if (!hashOriginal) return { integra: false, motivo: "Hash não registrado (assinatura anterior ao sistema de auditoria)" };

      // Baixar imagem do S3 e recalcular hash
      try {
        const response = await fetch(assinatura.assinaturaUrl);
        const buffer = Buffer.from(await response.arrayBuffer());
        const hashAtual = crypto.createHash("sha256").update(buffer).digest("hex");
        return {
          integra: hashAtual === hashOriginal,
          hashOriginal,
          hashAtual,
          motivo: hashAtual === hashOriginal ? "Assinatura íntegra — hash confere" : "ALERTA: Hash divergente — possível adulteração",
        };
      } catch {
        return { integra: false, motivo: "Erro ao verificar — imagem não acessível" };
      }
    }),

  // ============================================================
  // CONTROLE DE VALIDADE
  // ============================================================
  episProximosVencimento: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), diasAntecedencia: z.number().default(30),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const hoje = new Date();
      const limite = new Date(hoje);
      limite.setDate(limite.getDate() + input.diasAntecedencia);
      const hojeStr = hoje.toISOString().split("T")[0];
      const limiteStr = limite.toISOString().split("T")[0];

      const entregas = await db.select({
        id: epiDeliveries.id,
        epiId: epiDeliveries.epiId,
        employeeId: epiDeliveries.employeeId,
        dataEntrega: epiDeliveries.dataEntrega,
        dataValidade: epiDeliveries.dataValidade,
        nomeEpi: epis.nome,
        caEpi: epis.ca,
        nomeFunc: employees.nomeCompleto,
        funcaoFunc: employees.funcao,
      })
        .from(epiDeliveries)
        .leftJoin(epis, eq(epiDeliveries.epiId, epis.id))
        .leftJoin(employees, eq(epiDeliveries.employeeId, employees.id))
        .where(and(
          companyFilter(epiDeliveries.companyId, input),
          isNull(epiDeliveries.deletedAt),
          isNull(epiDeliveries.dataDevolucao),
          sql`${epiDeliveries.dataValidade} IS NOT NULL`,
          lte(epiDeliveries.dataValidade, limiteStr),
        ))
        .orderBy(epiDeliveries.dataValidade);

      return entregas.map(e => ({
        ...e,
        vencido: e.dataValidade ? e.dataValidade < hojeStr : false,
        diasRestantes: e.dataValidade
          ? Math.ceil((new Date(e.dataValidade).getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24))
          : null,
      }));
    }),

  // ============================================================
  // ESTOQUE MÍNIMO E ALERTAS DE REPOSIÇÃO
  // ============================================================
  estoqueMinList: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      return db.select({
        id: epiEstoqueMinimo.id,
        epiId: epiEstoqueMinimo.epiId,
        obraId: epiEstoqueMinimo.obraId,
        quantidadeMinima: epiEstoqueMinimo.quantidadeMinima,
        nomeEpi: epis.nome,
        nomeObra: obras.nome,
      })
        .from(epiEstoqueMinimo)
        .leftJoin(epis, eq(epiEstoqueMinimo.epiId, epis.id))
        .leftJoin(obras, eq(epiEstoqueMinimo.obraId, obras.id))
        .where(companyFilter(epiEstoqueMinimo.companyId, input))
        .orderBy(epis.nome);
    }),

  estoqueMinUpsert: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), epiId: z.number(),
      obraId: z.number().optional(),
      quantidadeMinima: z.number().min(1),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const conds: any[] = [
        companyFilter(epiEstoqueMinimo.companyId, input),
        eq(epiEstoqueMinimo.epiId, input.epiId),
      ];
      if (input.obraId) {
        conds.push(eq(epiEstoqueMinimo.obraId, input.obraId));
      } else {
        conds.push(sql`${epiEstoqueMinimo.obraId} IS NULL`);
      }

      const [existing] = await db.select().from(epiEstoqueMinimo).where(and(...conds));
      if (existing) {
        await db.update(epiEstoqueMinimo)
          .set({ quantidadeMinima: input.quantidadeMinima })
          .where(eq(epiEstoqueMinimo.id, existing.id));
      } else {
        await db.insert(epiEstoqueMinimo).values({
          companyId: input.companyId,
          epiId: input.epiId,
          obraId: input.obraId || null,
          quantidadeMinima: input.quantidadeMinima,
        });
      }
      return { success: true };
    }),

  // Check stock alerts (items below minimum)
  alertasEstoque: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const minimos = await db.select({
        id: epiEstoqueMinimo.id,
        epiId: epiEstoqueMinimo.epiId,
        obraId: epiEstoqueMinimo.obraId,
        quantidadeMinima: epiEstoqueMinimo.quantidadeMinima,
        nomeEpi: epis.nome,
        caEpi: epis.ca,
        estoqueCentral: epis.quantidadeEstoque,
      })
        .from(epiEstoqueMinimo)
        .leftJoin(epis, eq(epiEstoqueMinimo.epiId, epis.id))
        .where(companyFilter(epiEstoqueMinimo.companyId, input));

      const alertas: any[] = [];
      
      for (const min of minimos) {
        if (min.obraId) {
          // Check obra stock
          const [estoqueObra] = await db.select().from(epiEstoqueObra)
            .where(and(eq(epiEstoqueObra.epiId, min.epiId), eq(epiEstoqueObra.obraId, min.obraId)));
          const qtdAtual = estoqueObra?.quantidade || 0;
          
          if (qtdAtual < min.quantidadeMinima) {
            const [obra] = await db.select({ nome: obras.nome }).from(obras).where(eq(obras.id, min.obraId));
            alertas.push({
              tipo: "obra",
              epiId: min.epiId,
              nomeEpi: min.nomeEpi,
              obraId: min.obraId,
              nomeObra: obra?.nome || "Obra",
              quantidadeAtual: qtdAtual,
              quantidadeMinima: min.quantidadeMinima,
              deficit: min.quantidadeMinima - qtdAtual,
            });
          }
        } else {
          // Check central stock
          const qtdAtual = min.estoqueCentral || 0;
          if (qtdAtual < min.quantidadeMinima) {
            alertas.push({
              tipo: "central",
              epiId: min.epiId,
              nomeEpi: min.nomeEpi,
              obraId: null,
              nomeObra: "Estoque Central",
              quantidadeAtual: qtdAtual,
              quantidadeMinima: min.quantidadeMinima,
              deficit: min.quantidadeMinima - qtdAtual,
            });
          }
        }
      }

      return alertas;
    }),

  // ============================================================
  // INDICADOR DE CAPACIDADE (quantos kits completos possíveis)
  // ============================================================
  capacidadeEstoque: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), obraId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      
      // Get all kits
      const kits = await db.select().from(epiKits)
        .where(and(companyFilter(epiKits.companyId, input), eq(epiKits.ativo, 1)));
      
      if (kits.length === 0) return { kits: [], totalKitsCompletos: 0 };

      const kitIds = kits.map(k => k.id);
      const kitItems = await db.select().from(epiKitItems)
        .where(inArray(epiKitItems.kitId, kitIds));

      // Get stock
      let estoque: Record<string, number> = {};
      
      if (input.obraId) {
        const estoqueObra = await db.select({
          nomeEpi: epis.nome,
          quantidade: epiEstoqueObra.quantidade,
        })
          .from(epiEstoqueObra)
          .leftJoin(epis, eq(epiEstoqueObra.epiId, epis.id))
          .where(and(companyFilter(epiEstoqueObra.companyId, input), eq(epiEstoqueObra.obraId, input.obraId)));
        
        for (const e of estoqueObra) {
          if (e.nomeEpi) estoque[e.nomeEpi.toLowerCase()] = (estoque[e.nomeEpi.toLowerCase()] || 0) + e.quantidade;
        }
      } else {
        const allEpis = await db.select({ nome: epis.nome, quantidadeEstoque: epis.quantidadeEstoque })
          .from(epis).where(companyFilter(epis.companyId, input));
        for (const e of allEpis) {
          estoque[e.nome.toLowerCase()] = (estoque[e.nome.toLowerCase()] || 0) + (e.quantidadeEstoque || 0);
        }
      }

      const resultado = kits.map(kit => {
        const items = kitItems.filter(i => i.kitId === kit.id);
        let kitsCompletos = Infinity;
        
        const itemAnalysis = items.map(item => {
          const nomeKey = item.nomeEpi.toLowerCase();
          const disponivel = estoque[nomeKey] || 0;
          const necessario = item.quantidade;
          const kitsItem = Math.floor(disponivel / necessario);
          kitsCompletos = Math.min(kitsCompletos, kitsItem);
          
          return {
            nomeEpi: item.nomeEpi,
            quantidade: necessario,
            disponivel,
            kitsItem,
            itemLimitante: false,
          };
        });

        if (kitsCompletos === Infinity) kitsCompletos = 0;
        
        // Mark limiting items
        itemAnalysis.forEach(item => {
          if (item.kitsItem === kitsCompletos) item.itemLimitante = true;
        });

        return {
          kitId: kit.id,
          kitNome: kit.nome,
          funcao: kit.funcao,
          kitsCompletos,
          items: itemAnalysis,
        };
      });

      return {
        kits: resultado,
        totalKitsCompletos: resultado.reduce((sum, k) => sum + k.kitsCompletos, 0),
      };
    }),

  // ============================================================
  // RELATÓRIOS DE CUSTO
  // ============================================================
  relatorioCusto: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), tipo: z.enum(["funcionario", "obra", "mensal"]),
      employeeId: z.number().optional(),
      obraId: z.number().optional(),
      dataInicio: z.string().optional(),
      dataFim: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      
      const conds: any[] = [
        companyFilter(epiDeliveries.companyId, input),
        isNull(epiDeliveries.deletedAt),
      ];
      if (input.employeeId) conds.push(eq(epiDeliveries.employeeId, input.employeeId));
      if (input.dataInicio) conds.push(gte(epiDeliveries.dataEntrega, input.dataInicio));
      if (input.dataFim) conds.push(lte(epiDeliveries.dataEntrega, input.dataFim));

      const entregas = await db.select({
        id: epiDeliveries.id,
        epiId: epiDeliveries.epiId,
        employeeId: epiDeliveries.employeeId,
        quantidade: epiDeliveries.quantidade,
        dataEntrega: epiDeliveries.dataEntrega,
        valorCobrado: epiDeliveries.valorCobrado,
        obraId: epiDeliveries.obraId,
        origemEntrega: epiDeliveries.origemEntrega,
        nomeEpi: epis.nome,
        caEpi: epis.ca,
        valorProduto: epis.valorProduto,
        nomeFunc: employees.nomeCompleto,
        funcaoFunc: employees.funcao,
      })
        .from(epiDeliveries)
        .leftJoin(epis, eq(epiDeliveries.epiId, epis.id))
        .leftJoin(employees, eq(epiDeliveries.employeeId, employees.id))
        .where(and(...conds))
        .orderBy(desc(epiDeliveries.dataEntrega));

      // Buscar alocações ativas para mapear empId -> obraId
      const epiAvEmpIds = [...new Set(entregas.map(e => e.employeeId))];
      const epiAvAlocs = epiAvEmpIds.length > 0
        ? await db.select({ employeeId: obraFuncionarios.employeeId, obraId: obraFuncionarios.obraId })
            .from(obraFuncionarios).where(and(inArray(obraFuncionarios.employeeId, epiAvEmpIds), eq(obraFuncionarios.isActive, 1)))
        : [];
      const epiAvEmpObraMap = new Map(epiAvAlocs.map(a => [a.employeeId, a.obraId]));

      // Get obra names
      const obraIds = Array.from(new Set([...entregas.map(e => e.obraId).filter(Boolean), ...epiAvAlocs.map(a => a.obraId)])) as number[];
      let obraMap: Record<number, string> = {};
      if (obraIds.length > 0) {
        const obrasList = await db.select({ id: obras.id, nome: obras.nome })
          .from(obras).where(inArray(obras.id, obraIds));
        obraMap = Object.fromEntries(obrasList.map(o => [o.id, o.nome]));
      }

      const calcCusto = (e: any) => {
        const valorUnit = e.valorProduto ? parseFloat(String(e.valorProduto)) : 0;
        return valorUnit * e.quantidade;
      };

      if (input.tipo === "funcionario") {
        const porFunc: Record<number, { nome: string; funcao: string; custo: number; qtd: number; itens: any[] }> = {};
        for (const e of entregas) {
          if (!porFunc[e.employeeId]) {
            porFunc[e.employeeId] = { nome: e.nomeFunc || "", funcao: e.funcaoFunc || "", custo: 0, qtd: 0, itens: [] };
          }
          const custo = calcCusto(e);
          porFunc[e.employeeId].custo += custo;
          porFunc[e.employeeId].qtd += e.quantidade;
          porFunc[e.employeeId].itens.push({ nomeEpi: e.nomeEpi, quantidade: e.quantidade, custo, data: e.dataEntrega });
        }
        return { tipo: "funcionario", dados: Object.entries(porFunc).map(([id, d]) => ({ employeeId: Number(id), ...d })).sort((a, b) => b.custo - a.custo) };
      }

      if (input.tipo === "obra") {
        const porObra: Record<string, { nome: string; custo: number; qtd: number; itens: any[] }> = {};
        for (const e of entregas) {
          const obraKey = String(e.obraId || epiAvEmpObraMap.get(e.employeeId) || 0);
          const obraNome = obraMap[Number(obraKey)] || "Sem Obra";
          if (!porObra[obraKey]) {
            porObra[obraKey] = { nome: obraNome, custo: 0, qtd: 0, itens: [] };
          }
          const custo = calcCusto(e);
          porObra[obraKey].custo += custo;
          porObra[obraKey].qtd += e.quantidade;
          porObra[obraKey].itens.push({ nomeEpi: e.nomeEpi, quantidade: e.quantidade, custo, data: e.dataEntrega, funcionario: e.nomeFunc });
        }
        return { tipo: "obra", dados: Object.entries(porObra).map(([id, d]) => ({ obraId: Number(id), ...d })).sort((a, b) => b.custo - a.custo) };
      }

      // Mensal
      const porMes: Record<string, { custo: number; qtd: number; entregas: number }> = {};
      for (const e of entregas) {
        const mes = e.dataEntrega?.substring(0, 7) || "N/A";
        if (!porMes[mes]) porMes[mes] = { custo: 0, qtd: 0, entregas: 0 };
        porMes[mes].custo += calcCusto(e);
        porMes[mes].qtd += e.quantidade;
        porMes[mes].entregas++;
      }
      return { tipo: "mensal", dados: Object.entries(porMes).map(([mes, d]) => ({ mes, ...d })).sort((a, b) => a.mes.localeCompare(b.mes)) };
    }),

  // ============================================================
  // IA - ANÁLISE DE ESTOQUE E SUGESTÕES DE TRANSFERÊNCIA
  // ============================================================
  analisarEstoqueIA: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      
      // Get all obras with CEP
      const allObras = await db.select({
        id: obras.id,
        nome: obras.nome,
        cep: obras.cep,
        cidade: obras.cidade,
        estado: obras.estado,
        status: obras.status,
      }).from(obras)
        .where(and(companyFilter(obras.companyId, input), eq(obras.isActive, 1)));

      // Get stock per obra
      const estoqueObras = await db.select({
        obraId: epiEstoqueObra.obraId,
        epiId: epiEstoqueObra.epiId,
        quantidade: epiEstoqueObra.quantidade,
        nomeEpi: epis.nome,
        caEpi: epis.ca,
      })
        .from(epiEstoqueObra)
        .leftJoin(epis, eq(epiEstoqueObra.epiId, epis.id))
        .where(companyFilter(epiEstoqueObra.companyId, input));

      // Get central stock
      const estoqueCentral = await db.select({
        id: epis.id,
        nome: epis.nome,
        quantidadeEstoque: epis.quantidadeEstoque,
      }).from(epis).where(companyFilter(epis.companyId, input));

      // Get minimum stock configs
      const minimos = await db.select().from(epiEstoqueMinimo)
        .where(companyFilter(epiEstoqueMinimo.companyId, input));

      // Get active employees per obra
      // Contar funcionários por obra via obra_funcionarios
      const funcAlocs = await db.select({
        obraId: obraFuncionarios.obraId,
        total: sql<number>`COUNT(*)`,
      })
        .from(obraFuncionarios)
        .where(and(companyFilter(obraFuncionarios.companyId, input), eq(obraFuncionarios.isActive, 1)))
        .groupBy(obraFuncionarios.obraId);
      const funcPorObraMap = new Map(funcAlocs.map(f => [f.obraId, f.total]));

      // Build context for LLM
      const obraInfo = allObras.map(o => {
        const estoque = estoqueObras.filter(e => e.obraId === o.id);
        const funcsCount = funcPorObraMap.get(o.id) || 0;
        const mins = minimos.filter(m => m.obraId === o.id);
        return {
          id: o.id,
          nome: o.nome,
          cep: o.cep,
          cidade: o.cidade,
          estado: o.estado,
          status: o.status,
          funcionarios: funcsCount,
          estoque: estoque.map(e => ({
            epi: e.nomeEpi,
            quantidade: e.quantidade,
            minimo: mins.find(m => m.epiId === e.epiId)?.quantidadeMinima || 0,
          })),
        };
      });

      const centralInfo = estoqueCentral.filter(e => (e.quantidadeEstoque || 0) > 0).map(e => ({
        epi: e.nome,
        quantidade: e.quantidadeEstoque,
        minimo: minimos.find(m => m.epiId === e.id && !m.obraId)?.quantidadeMinima || 0,
      }));

      const prompt = `Você é um especialista em gestão de EPIs para construção civil no Brasil.

Analise o estoque de EPIs das obras e do estoque central da empresa e sugira transferências otimizadas.

DADOS:

Estoque Central:
${JSON.stringify(centralInfo, null, 2)}

Obras e seus estoques:
${JSON.stringify(obraInfo, null, 2)}

REGRAS:
1. Identifique obras com excesso de EPIs e obras com falta
2. Considere a proximidade geográfica (CEP) para sugerir transferências entre obras próximas
3. Priorize transferências que resolvam itens abaixo do estoque mínimo
4. Considere o número de funcionários de cada obra para dimensionar a necessidade
5. Sugira também envios do estoque central quando necessário
6. Se não houver problemas, diga que o estoque está equilibrado

Responda em português brasileiro, de forma objetiva e profissional.
Forneça sugestões concretas com quantidades específicas.`;

      try {
        const response = await invokeLLM({
          messages: [
            { role: "system", content: "Você é um assistente especializado em gestão de EPIs e logística para construção civil brasileira." },
            { role: "user", content: prompt },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "epi_analysis",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  resumo: { type: "string", description: "Resumo geral da situação do estoque" },
                  alertas: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        tipo: { type: "string", description: "critico, atencao, ou info" },
                        mensagem: { type: "string" },
                      },
                      required: ["tipo", "mensagem"],
                      additionalProperties: false,
                    },
                  },
                  sugestoes: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        acao: { type: "string", description: "transferir, comprar, ou redistribuir" },
                        epi: { type: "string" },
                        quantidade: { type: "number" },
                        origem: { type: "string" },
                        destino: { type: "string" },
                        justificativa: { type: "string" },
                        prioridade: { type: "string", description: "alta, media, ou baixa" },
                      },
                      required: ["acao", "epi", "quantidade", "origem", "destino", "justificativa", "prioridade"],
                      additionalProperties: false,
                    },
                  },
                  indicadores: {
                    type: "object",
                    properties: {
                      obrasComFalta: { type: "number" },
                      obrasComExcesso: { type: "number" },
                      itensAbaixoMinimo: { type: "number" },
                      sugestoesGeradas: { type: "number" },
                    },
                    required: ["obrasComFalta", "obrasComExcesso", "itensAbaixoMinimo", "sugestoesGeradas"],
                    additionalProperties: false,
                  },
                },
                required: ["resumo", "alertas", "sugestoes", "indicadores"],
                additionalProperties: false,
              },
            },
          },
        });

        const content = String(response.choices?.[0]?.message?.content || '');
        const parsed = content ? JSON.parse(content) : null;

        // Save analysis
        const [result] = await db.insert(epiAiAnalises).values({
          companyId: input.companyId,
          tipo: "manual",
          resultado: parsed?.resumo || "Análise concluída",
          sugestoes: parsed || null,
        }).returning({ id: epiAiAnalises.id });

        return { id: result.id, analise: parsed };
      } catch (err: any) {
        return { id: 0, analise: null, erro: err.message || "Erro ao analisar estoque" };
      }
    }),

  // Get latest AI analysis
  ultimaAnaliseIA: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const [latest] = await db.select().from(epiAiAnalises)
        .where(companyFilter(epiAiAnalises.companyId, input))
        .orderBy(desc(epiAiAnalises.createdAt))
        .limit(1);
      return latest || null;
    }),

  // List all AI analyses
  analisesIAList: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      return db.select().from(epiAiAnalises)
        .where(companyFilter(epiAiAnalises.companyId, input))
        .orderBy(desc(epiAiAnalises.createdAt))
        .limit(20);
    }),

  // Seed all defaults at once
  seedAllDefaults: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const results: string[] = [];

      // Kits
      const existingKits = await db.select().from(epiKits).where(companyFilter(epiKits.companyId, input));
      if (existingKits.length === 0) {
        // Create basic kit
        const [basicResult] = await db.insert(epiKits).values({
          companyId: input.companyId, nome: "Kit Básico Obra", funcao: "Geral",
          descricao: "Kit padrão para todos os funcionários de obra (NR-6)",
        }).returning({ id: epiKits.id });
        await db.insert(epiKitItems).values(DEFAULT_KIT_BASICO.map(item => ({ kitId: basicResult.id, ...item })));
        
        for (const [funcao, config] of Object.entries(DEFAULT_KITS_POR_FUNCAO)) {
          const [result] = await db.insert(epiKits).values({
            companyId: input.companyId, nome: config.nome, funcao,
            descricao: `Kit específico para ${funcao}`,
          }).returning({ id: epiKits.id });
          const allItems = [...DEFAULT_KIT_BASICO, ...config.itensExtras.map(e => ({ ...e, obrigatorio: 1 }))];
          await db.insert(epiKitItems).values(allItems.map(item => ({ kitId: result.id, ...item })));
        }
        results.push("6 kits criados");
      }

      // Cores
      const existingCores = await db.select().from(epiCoresCapacete).where(companyFilter(epiCoresCapacete.companyId, input));
      if (existingCores.length === 0) {
        await db.insert(epiCoresCapacete).values(DEFAULT_CORES_CAPACETE.map(c => ({ companyId: input.companyId, ...c })));
        results.push("7 cores de capacete configuradas");
      }

      // Vida útil
      const existingVida = await db.select().from(epiVidaUtil).where(companyFilter(epiVidaUtil.companyId, input));
      if (existingVida.length === 0) {
        await db.insert(epiVidaUtil).values(DEFAULT_VIDA_UTIL.map(v => ({ companyId: input.companyId, ...v })));
        results.push("9 configurações de vida útil criadas");
      }

      // Treinamentos vinculados
      const existingTreino = await db.select().from(epiTreinamentosVinculados).where(companyFilter(epiTreinamentosVinculados.companyId, input));
      if (existingTreino.length === 0) {
        await db.insert(epiTreinamentosVinculados).values(DEFAULT_TREINAMENTOS_VINCULADOS.map(t => ({ companyId: input.companyId, ...t })));
        results.push("7 vínculos de treinamento criados");
      }

      return { message: results.length > 0 ? results.join("; ") : "Tudo já estava configurado", results };
    }),

  // ============================================================
  // INDICADOR DE CAPACIDADE DE CONTRATAÇÃO
  // ============================================================

  // Configurar kit básico de contratação (lista editável)
  kitBasicoContratacao: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      // Buscar kit "Básico" ou "Kit Básico" da empresa
      const kits = await db.select().from(epiKits)
        .where(and(
          companyFilter(epiKits.companyId, input),
          eq(epiKits.ativo, 1),
        ));
      // Procurar kit com nome contendo "básico" ou "basico" ou "contratação"
      let kitBasico = kits.find(k => 
        k.nome.toLowerCase().includes('básico') || 
        k.nome.toLowerCase().includes('basico') || 
        k.nome.toLowerCase().includes('contratação') ||
        k.nome.toLowerCase().includes('contratacao')
      );
      // Se não encontrar, pegar o primeiro kit ativo
      if (!kitBasico && kits.length > 0) kitBasico = kits[0];
      if (!kitBasico) return { kit: null, itens: [] };

      const itens = await db.select().from(epiKitItems)
        .where(eq(epiKitItems.kitId, kitBasico.id));
      return { kit: kitBasico, itens };
    }),

  // Salvar/Criar kit básico de contratação
  salvarKitBasicoContratacao: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), itens: z.array(z.object({
        epiId: z.number().nullable(),
        nomeEpi: z.string(),
        categoria: z.enum(['EPI', 'Uniforme', 'Calcado']),
        quantidade: z.number().min(1),
        obrigatorio: z.number().default(1),
      })),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      // Buscar ou criar kit básico
      const existingKits = await db.select().from(epiKits)
        .where(and(
          companyFilter(epiKits.companyId, input),
          eq(epiKits.ativo, 1),
        ));
      let kitBasico = existingKits.find(k => 
        k.nome.toLowerCase().includes('básico') || 
        k.nome.toLowerCase().includes('basico') || 
        k.nome.toLowerCase().includes('contratação') ||
        k.nome.toLowerCase().includes('contratacao')
      );

      let kitId: number;
      if (kitBasico) {
        kitId = kitBasico.id;
        // Limpar itens antigos
        await db.delete(epiKitItems).where(eq(epiKitItems.kitId, kitId));
      } else {
        // Criar novo kit
        const [result] = await db.insert(epiKits).values({
          companyId: input.companyId,
          nome: 'Kit Básico de Contratação',
          funcao: 'Geral',
          descricao: 'Kit padrão de EPIs necessários para equipar um novo funcionário',
          ativo: 1,
        }).returning({ id: epiKits.id });
        kitId = result.id;
      }

      // Inserir novos itens
      if (input.itens.length > 0) {
        await db.insert(epiKitItems).values(
          input.itens.map(item => ({
            kitId,
            epiId: item.epiId,
            nomeEpi: item.nomeEpi,
            categoria: item.categoria,
            quantidade: item.quantidade,
            obrigatorio: item.obrigatorio,
          }))
        );
      }

      return { kitId, totalItens: input.itens.length };
    }),

  // Calcular capacidade de contratação
  capacidadeContratacao: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), obraId: z.number().optional(), // Se informado, calcula só para essa obra
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;

      // 1. Buscar kit básico de contratação
      const kits = await db.select().from(epiKits)
        .where(and(
          companyFilter(epiKits.companyId, input),
          eq(epiKits.ativo, 1),
        ));
      let kitBasico = kits.find(k => 
        k.nome.toLowerCase().includes('básico') || 
        k.nome.toLowerCase().includes('basico') || 
        k.nome.toLowerCase().includes('contratação') ||
        k.nome.toLowerCase().includes('contratacao')
      );
      if (!kitBasico && kits.length > 0) kitBasico = kits[0];
      if (!kitBasico) {
        return {
          capacidade: 0,
          kitConfigurado: false,
          mensagem: 'Nenhum kit básico de contratação configurado. Configure na aba Config.',
          detalhes: [],
          gargalo: null,
        };
      }

      // 2. Buscar itens do kit
      const itensKit = await db.select().from(epiKitItems)
        .where(eq(epiKitItems.kitId, kitBasico.id));
      if (itensKit.length === 0) {
        return {
          capacidade: 0,
          kitConfigurado: true,
          mensagem: 'Kit básico está vazio. Adicione itens na aba Config.',
          detalhes: [],
          gargalo: null,
        };
      }

      // 3. Buscar todos os EPIs da empresa com estoque
      const todosEpis = await db.select({
        id: epis.id,
        nome: epis.nome,
        categoria: epis.categoria,
        estoqueCentral: epis.quantidadeEstoque,
      }).from(epis).where(companyFilter(epis.companyId, input));

      // 4. Buscar estoque por obra (se filtro de obra ou total)
      let estoqueObras: { epiId: number; obraId: number; quantidade: number | null; nomeObra: string | null }[] = [];
      if (input.obraId) {
        estoqueObras = await db.select({
          epiId: epiEstoqueObra.epiId,
          obraId: epiEstoqueObra.obraId,
          quantidade: epiEstoqueObra.quantidade,
          nomeObra: obras.nome,
        }).from(epiEstoqueObra)
          .leftJoin(obras, eq(epiEstoqueObra.obraId, obras.id))
          .where(and(
            companyFilter(epiEstoqueObra.companyId, input),
            eq(epiEstoqueObra.obraId, input.obraId),
          ));
      } else {
        estoqueObras = await db.select({
          epiId: epiEstoqueObra.epiId,
          obraId: epiEstoqueObra.obraId,
          quantidade: epiEstoqueObra.quantidade,
          nomeObra: obras.nome,
        }).from(epiEstoqueObra)
          .leftJoin(obras, eq(epiEstoqueObra.obraId, obras.id))
          .where(companyFilter(epiEstoqueObra.companyId, input));
      }

      // 5. Para cada item do kit, calcular quantos funcionários podem ser equipados
      // IMPORTANTE: Somar estoque de TODOS os EPIs que fazem match (mesmo tipo, tamanhos diferentes)
      
      // Mapa de palavras-chave para matching inteligente por tipo de EPI
      const MATCHING_KEYWORDS: Record<string, { must: string[]; mustNot?: string[]; category?: string }> = {
        'Capacete de Segurança': { must: ['capacete'], mustNot: ['protetor facial', 'protetor auditivo'] },
        'Protetor Auricular': { must: ['protetor auditivo', 'protetor auricular', 'plug', 'inserção', 'concha'], mustNot: ['facial', 'capacete'] },
        'Máscara PFF2': { must: ['pff2', 'pff-2', 'respirador', 'semifacial filtrante'], mustNot: ['solda'] },
        'Luva de Segurança': { must: ['luva'], mustNot: ['isolante', 'manga'] },
        'Óculos de Proteção': { must: ['óculos', 'oculos'], mustNot: ['solda', 'arco'] },
        'Camisa Manga Longa': { must: ['camisa'], category: 'Uniforme' },
        'Calça de Brim': { must: ['calça'], category: 'Uniforme', mustNot: ['calçado', 'calcado'] },
        'Botina de Segurança': { must: ['botina'], category: 'Calcado' },
      };

      const detalhes = itensKit.map(itemKit => {
        let matchedEpis: typeof todosEpis = [];
        let estoqueTotal = 0;
        let estoqueCentral = 0;
        let estoqueObra = 0;
        let primaryMatch: typeof todosEpis[0] | null = null;

        // 1. Se tem epiId direto, usar apenas esse
        if (itemKit.epiId) {
          const epi = todosEpis.find(e => e.id === itemKit.epiId);
          if (epi) matchedEpis = [epi];
        }

        // 2. Matching inteligente por palavras-chave
        if (matchedEpis.length === 0) {
          const keywords = MATCHING_KEYWORDS[itemKit.nomeEpi];
          if (keywords) {
            matchedEpis = todosEpis.filter(epi => {
              const nomeLower = epi.nome.toLowerCase();
              // Deve conter pelo menos uma das palavras obrigatórias
              const hasMust = keywords.must.some(kw => nomeLower.includes(kw));
              if (!hasMust) return false;
              // Não deve conter palavras de exclusão
              if (keywords.mustNot && keywords.mustNot.some(kw => nomeLower.includes(kw))) return false;
              // Se tem filtro de categoria, aplicar
              if (keywords.category && epi.categoria !== keywords.category) return false;
              return true;
            });
          }
        }

        // 3. Fallback: match por nome parcial (todas as palavras > 3 chars)
        if (matchedEpis.length === 0) {
          const palavras = itemKit.nomeEpi.toLowerCase().split(' ').filter(p => p.length > 3);
          if (palavras.length > 0) {
            matchedEpis = todosEpis.filter(epi => {
              const nomeLower = epi.nome.toLowerCase();
              // Deve conter TODAS as palavras significativas (mais restritivo)
              return palavras.every(p => nomeLower.includes(p));
            });
          }
          // Se não encontrou com todas, tentar com pelo menos 2
          if (matchedEpis.length === 0 && palavras.length >= 2) {
            matchedEpis = todosEpis.filter(epi => {
              const nomeLower = epi.nome.toLowerCase();
              const matches = palavras.filter(p => nomeLower.includes(p));
              return matches.length >= 2;
            });
          }
          // Último recurso: qualquer palavra
          if (matchedEpis.length === 0) {
            matchedEpis = todosEpis.filter(epi => {
              const nomeLower = epi.nome.toLowerCase();
              return palavras.some(p => nomeLower.includes(p));
            });
          }
        }

        // 4. Somar estoque de TODOS os EPIs que fizeram match
        for (const epi of matchedEpis) {
          estoqueCentral += epi.estoqueCentral || 0;
          const obrasEstoque = estoqueObras.filter(eo => eo.epiId === epi.id);
          estoqueObra += obrasEstoque.reduce((sum, eo) => sum + (eo.quantidade || 0), 0);
        }
        // Se filtro por obra, usar APENAS estoque da obra (não somar central)
        // Se estoque geral (sem filtro), somar central + todas as obras
        estoqueTotal = input.obraId ? estoqueObra : (estoqueCentral + estoqueObra);
        primaryMatch = matchedEpis.length > 0 ? matchedEpis[0] : null;

        const qtdNecessaria = itemKit.quantidade;
        const capacidadeItem = qtdNecessaria > 0 ? Math.floor(estoqueTotal / qtdNecessaria) : 0;

        return {
          nomeEpi: itemKit.nomeEpi,
          categoria: itemKit.categoria,
          epiId: primaryMatch?.id || null,
          epiNomeCatalogo: primaryMatch?.nome || null,
          qtdNecessariaPorPessoa: qtdNecessaria,
          obrigatorio: itemKit.obrigatorio,
          estoqueCentral,
          estoqueObra,
          estoqueTotal,
          capacidade: capacidadeItem,
          encontradoNoCatalogo: matchedEpis.length > 0,
          qtdEpisMatch: matchedEpis.length,
        };
      });

      // 6. Capacidade geral = menor capacidade entre os itens OBRIGATÓRIOS
      const itensObrigatorios = detalhes.filter(d => d.obrigatorio === 1);
      const capacidadeGeral = itensObrigatorios.length > 0
        ? Math.min(...itensObrigatorios.map(d => d.capacidade))
        : 0;

      // 7. Identificar gargalo (item com menor capacidade)
      const gargalo = itensObrigatorios.length > 0
        ? itensObrigatorios.reduce((min, d) => d.capacidade < min.capacidade ? d : min)
        : null;

      // 8. Classificar nível
      let nivel: 'critico' | 'baixo' | 'medio' | 'bom' | 'otimo';
      if (capacidadeGeral === 0) nivel = 'critico';
      else if (capacidadeGeral <= 3) nivel = 'baixo';
      else if (capacidadeGeral <= 10) nivel = 'medio';
      else if (capacidadeGeral <= 25) nivel = 'bom';
      else nivel = 'otimo';

      return {
        capacidade: capacidadeGeral,
        kitConfigurado: true,
        kitNome: kitBasico.nome,
        nivel,
        mensagem: capacidadeGeral === 0
          ? 'Estoque insuficiente para novas contratações. Compra urgente necessária!'
          : `Com o estoque atual, você consegue equipar ${capacidadeGeral} novo${capacidadeGeral > 1 ? 's' : ''} funcionário${capacidadeGeral > 1 ? 's' : ''}.`,
        detalhes,
        gargalo: gargalo ? {
          nomeEpi: gargalo.nomeEpi,
          estoqueTotal: gargalo.estoqueTotal,
          capacidade: gargalo.capacidade,
          mensagem: `Item limitante: ${gargalo.nomeEpi} (estoque: ${gargalo.estoqueTotal}, capacidade: ${gargalo.capacidade})`,
        } : null,
        totalItensKit: itensKit.length,
        itensObrigatorios: itensObrigatorios.length,
      };
    }),

  // Capacidade por obra (resumo de todas as obras)
  capacidadePorObra: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;

      // Buscar todas as obras ativas
      const obrasAtivas = await db.select({ id: obras.id, nome: obras.nome })
        .from(obras)
        .where(and(companyFilter(obras.companyId, input), eq(obras.isActive, 1)));

      // Buscar kit básico
      const kits = await db.select().from(epiKits)
        .where(and(companyFilter(epiKits.companyId, input), eq(epiKits.ativo, 1)));
      let kitBasico = kits.find(k => 
        k.nome.toLowerCase().includes('básico') || k.nome.toLowerCase().includes('basico') || 
        k.nome.toLowerCase().includes('contratação') || k.nome.toLowerCase().includes('contratacao')
      );
      if (!kitBasico && kits.length > 0) kitBasico = kits[0];
      if (!kitBasico) return { obras: [], kitConfigurado: false };

      const itensKit = await db.select().from(epiKitItems)
        .where(eq(epiKitItems.kitId, kitBasico.id));
      if (itensKit.length === 0) return { obras: [], kitConfigurado: true };

      // Para cada obra, calcular capacidade
      const resultados = await Promise.all(obrasAtivas.map(async (obra) => {
        const estoqueObra = await db.select({
          epiId: epiEstoqueObra.epiId,
          quantidade: epiEstoqueObra.quantidade,
        }).from(epiEstoqueObra)
          .where(and(
            companyFilter(epiEstoqueObra.companyId, input),
            eq(epiEstoqueObra.obraId, obra.id),
          ));

        const todosEpis = await db.select({ id: epis.id, nome: epis.nome })
          .from(epis).where(companyFilter(epis.companyId, input));

        // Matching inteligente por tipo de EPI (mesma lógica de capacidadeContratacao)
        const MATCHING_KEYWORDS_OBRA: Record<string, { must: string[]; mustNot?: string[]; category?: string }> = {
          'Capacete de Segurança': { must: ['capacete'], mustNot: ['protetor facial', 'protetor auditivo'] },
          'Protetor Auricular': { must: ['protetor auditivo', 'protetor auricular', 'plug', 'inserção', 'concha'], mustNot: ['facial', 'capacete'] },
          'Máscara PFF2': { must: ['pff2', 'pff-2', 'respirador', 'semifacial filtrante'], mustNot: ['solda'] },
          'Luva de Segurança': { must: ['luva'], mustNot: ['isolante', 'manga'] },
          'Óculos de Proteção': { must: ['óculos', 'oculos'], mustNot: ['solda', 'arco'] },
          'Camisa Manga Longa': { must: ['camisa'], category: 'Uniforme' },
          'Calça de Brim': { must: ['calça'], category: 'Uniforme', mustNot: ['calçado', 'calcado'] },
          'Botina de Segurança': { must: ['botina'], category: 'Calcado' },
        };

        const capacidades = itensKit.filter(i => i.obrigatorio === 1).map(itemKit => {
          let matchedIds: number[] = [];
          
          // 1. epiId direto
          if (itemKit.epiId) {
            const epi = todosEpis.find(e => e.id === itemKit.epiId);
            if (epi) matchedIds = [epi.id];
          }
          
          // 2. Matching inteligente
          if (matchedIds.length === 0) {
            const keywords = MATCHING_KEYWORDS_OBRA[itemKit.nomeEpi];
            if (keywords) {
              matchedIds = todosEpis.filter(epi => {
                const nomeLower = epi.nome.toLowerCase();
                const hasMust = keywords.must.some(kw => nomeLower.includes(kw));
                if (!hasMust) return false;
                if (keywords.mustNot && keywords.mustNot.some(kw => nomeLower.includes(kw))) return false;
                return true;
              }).map(e => e.id);
            }
          }
          
          // 3. Fallback nome parcial
          if (matchedIds.length === 0) {
            const palavras = itemKit.nomeEpi.toLowerCase().split(' ').filter(p => p.length > 3);
            matchedIds = todosEpis.filter(epi => {
              const nomeLower = epi.nome.toLowerCase();
              return palavras.some(p => nomeLower.includes(p));
            }).map(e => e.id);
          }
          
          // Somar estoque de TODOS os EPIs que fizeram match
          const estoque = matchedIds.reduce((sum, epiId) => {
            return sum + (estoqueObra.find(eo => eo.epiId === epiId)?.quantidade || 0);
          }, 0);
          return itemKit.quantidade > 0 ? Math.floor(estoque / itemKit.quantidade) : 0;
        });

        const capacidade = capacidades.length > 0 ? Math.min(...capacidades) : 0;
        return { obraId: obra.id, obraNome: obra.nome, capacidade };
      }));

      return { obras: resultados, kitConfigurado: true };
    }),

  // Auto-seed kit básico de contratação se não existir
  autoSeedKitBasico: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      // Verificar se já existe kit
      const existingKits = await db.select().from(epiKits)
        .where(and(companyFilter(epiKits.companyId, input), eq(epiKits.ativo, 1)));
      if (existingKits.length > 0) {
        return { created: false, message: 'Kit já existe' };
      }
      // Criar kit básico
      const [result] = await db.insert(epiKits).values({
        companyId: input.companyId,
        nome: 'Kit Básico Contratação',
        funcao: 'Geral',
        descricao: 'Kit padrão de EPIs para contratação de novos funcionários (NR-6)',
      }).returning({ id: epiKits.id });
      // Inserir itens padrão
      await db.insert(epiKitItems).values(
        DEFAULT_KIT_BASICO.map(item => ({ kitId: result.id, ...item }))
      );
      return { created: true, kitId: result.id, message: `Kit básico criado com ${DEFAULT_KIT_BASICO.length} itens` };
    }),

  // ============================================================
  // ALERTA AUTOMÁTICO DE CAPACIDADE DE CONTRATAÇÃO
  // ============================================================

  // Buscar configuração de alerta
  getAlertaCapacidade: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const [config] = await db.select().from(epiAlertaCapacidade)
        .where(companyFilter(epiAlertaCapacidade.companyId, input));
      return config || null;
    }),

  // Salvar configuração de alerta
  salvarAlertaCapacidade: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), limiar: z.number().min(1).max(100),
      ativo: z.number().min(0).max(1),
      emailDestinatarios: z.string().optional(), // JSON array
      intervaloMinHoras: z.number().min(1).max(168).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const [existing] = await db.select().from(epiAlertaCapacidade)
        .where(companyFilter(epiAlertaCapacidade.companyId, input));
      
      if (existing) {
        await db.update(epiAlertaCapacidade)
          .set({
            limiar: input.limiar,
            ativo: input.ativo,
            emailDestinatarios: input.emailDestinatarios || null,
            intervaloMinHoras: input.intervaloMinHoras || 24,
          })
          .where(eq(epiAlertaCapacidade.id, existing.id));
        return { id: existing.id, updated: true };
      } else {
        const [result] = await db.insert(epiAlertaCapacidade).values({
          companyId: input.companyId,
          limiar: input.limiar,
          ativo: input.ativo,
          emailDestinatarios: input.emailDestinatarios || null,
          intervaloMinHoras: input.intervaloMinHoras || 24,
        }).returning({ id: epiAlertaCapacidade.id });
        return { id: result.id, updated: false };
      }
    }),

  // Buscar logs de alertas enviados
  getAlertaCapacidadeLogs: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), limit: z.number().optional() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      return db.select().from(epiAlertaCapacidadeLog)
        .where(companyFilter(epiAlertaCapacidadeLog.companyId, input))
        .orderBy(desc(epiAlertaCapacidadeLog.enviadoEm))
        .limit(input.limit || 20);
    }),

  // Verificar e disparar alerta de capacidade (chamado manualmente ou por cron)
  verificarAlertaCapacidade: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), forcar: z.boolean().optional() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      
      // 1. Buscar configuração
      const [config] = await db.select().from(epiAlertaCapacidade)
        .where(and(
          companyFilter(epiAlertaCapacidade.companyId, input),
          eq(epiAlertaCapacidade.ativo, 1),
        ));
      
      if (!config) {
        return { disparado: false, motivo: 'Alerta não configurado ou desativado' };
      }

      // 2. Verificar intervalo mínimo (a menos que forçado)
      if (!input.forcar && config.ultimoAlertaEm) {
        const ultimoAlerta = new Date(config.ultimoAlertaEm);
        const agora = new Date();
        const horasDesdeUltimo = (agora.getTime() - ultimoAlerta.getTime()) / (1000 * 60 * 60);
        if (horasDesdeUltimo < (config.intervaloMinHoras || 24)) {
          return { 
            disparado: false, 
            motivo: `Último alerta enviado há ${Math.round(horasDesdeUltimo)}h. Mínimo: ${config.intervaloMinHoras}h.` 
          };
        }
      }

      // 3. Calcular capacidade atual
      const kits = await db.select().from(epiKits)
        .where(and(companyFilter(epiKits.companyId, input), eq(epiKits.ativo, 1)));
      let kitBasico = kits.find(k => 
        k.nome.toLowerCase().includes('básico') || k.nome.toLowerCase().includes('basico') || 
        k.nome.toLowerCase().includes('contratação') || k.nome.toLowerCase().includes('contratacao')
      );
      if (!kitBasico && kits.length > 0) kitBasico = kits[0];
      if (!kitBasico) {
        return { disparado: false, motivo: 'Nenhum kit básico configurado' };
      }

      const itensKit = await db.select().from(epiKitItems)
        .where(eq(epiKitItems.kitId, kitBasico.id));
      if (itensKit.length === 0) {
        return { disparado: false, motivo: 'Kit básico sem itens' };
      }

      const todosEpis = await db.select({
        id: epis.id, nome: epis.nome, quantidadeEstoque: epis.quantidadeEstoque,
      }).from(epis).where(companyFilter(epis.companyId, input));

      const estoqueObras = await db.select({
        epiId: epiEstoqueObra.epiId,
        total: sql<number>`SUM(${epiEstoqueObra.quantidade})`,
      }).from(epiEstoqueObra)
        .where(companyFilter(epiEstoqueObra.companyId, input))
        .groupBy(epiEstoqueObra.epiId);

      const detalhes = itensKit.filter(i => i.obrigatorio === 1).map(itemKit => {
        let epiMatch = itemKit.epiId
          ? todosEpis.find(e => e.id === itemKit.epiId)
          : todosEpis.find(e => e.nome.toLowerCase().includes(itemKit.nomeEpi.toLowerCase().split(' ')[0]));
        
        const estoqueCentral = epiMatch?.quantidadeEstoque || 0;
        const estoqueObraTotal = epiMatch ? (estoqueObras.find(eo => eo.epiId === epiMatch!.id)?.total || 0) : 0;
        const estoqueTotal = estoqueCentral + estoqueObraTotal;
        const capacidade = itemKit.quantidade > 0 ? Math.floor(estoqueTotal / itemKit.quantidade) : 0;
        return { nomeEpi: itemKit.nomeEpi, estoqueTotal, capacidade };
      });

      const capacidadeGeral = detalhes.length > 0 ? Math.min(...detalhes.map(d => d.capacidade)) : 0;
      const gargalo = detalhes.length > 0 ? detalhes.reduce((min, d) => d.capacidade < min.capacidade ? d : min) : null;

      // 4. Verificar se está abaixo do limiar
      if (capacidadeGeral >= config.limiar) {
        // Atualizar última capacidade
        await db.update(epiAlertaCapacidade)
          .set({ ultimaCapacidade: capacidadeGeral })
          .where(eq(epiAlertaCapacidade.id, config.id));
        return { 
          disparado: false, 
          motivo: `Capacidade (${capacidadeGeral}) está acima do limiar (${config.limiar})`,
          capacidade: capacidadeGeral,
        };
      }

      // 5. DISPARAR ALERTA! Buscar destinatários
      const recipients = await db.select().from(notificationRecipients)
        .where(and(
          companyFilter(notificationRecipients.companyId, input),
          eq(notificationRecipients.ativo, 1),
        ));

      // Adicionar emails extras da configuração
      let todosEmails: { nome: string; email: string }[] = recipients.map(r => ({ nome: r.nome, email: r.email }));
      if (config.emailDestinatarios) {
        try {
          const extras: string[] = JSON.parse(config.emailDestinatarios);
          for (const email of extras) {
            if (email && !todosEmails.find(e => e.email === email)) {
              todosEmails.push({ nome: email.split('@')[0], email });
            }
          }
        } catch {}
      }

      if (todosEmails.length === 0) {
        return { disparado: false, motivo: 'Nenhum destinatário configurado' };
      }

      // 6. Gerar e-mail de alerta
      const nivelTexto = capacidadeGeral === 0 ? 'CRÍTICO' : capacidadeGeral <= 3 ? 'BAIXO' : 'ATENÇÃO';
      const corNivel = capacidadeGeral === 0 ? '#DC2626' : capacidadeGeral <= 3 ? '#EA580C' : '#EAB308';
      
      const assunto = `⚠️ ALERTA EPI: Capacidade de Contratação ${nivelTexto} — ${capacidadeGeral} funcionário${capacidadeGeral !== 1 ? 's' : ''}`;
      
      const textoPlain = [
        `ALERTA DE CAPACIDADE DE CONTRATAÇÃO`,
        ``,
        `Nível: ${nivelTexto}`,
        `Capacidade atual: ${capacidadeGeral} funcionário${capacidadeGeral !== 1 ? 's' : ''}`,
        `Limiar configurado: ${config.limiar}`,
        ``,
        gargalo ? `Item gargalo: ${gargalo.nomeEpi} (estoque: ${gargalo.estoqueTotal})` : '',
        ``,
        `Detalhes:`,
        ...detalhes.map(d => `  • ${d.nomeEpi}: estoque ${d.estoqueTotal} → capacidade ${d.capacidade}`),
        ``,
        `Providência necessária: Reposição urgente de estoque de EPIs.`,
        ``,
        `Este alerta foi gerado automaticamente pelo Sistema de Gestão Integrada.`,
      ].filter(Boolean).join('\n');

      const htmlEmail = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:20px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
<tr><td style="background:${corNivel};padding:20px 30px;text-align:center;">
  <h1 style="color:#fff;margin:0;font-size:22px;">⚠️ ALERTA DE CAPACIDADE</h1>
  <p style="color:rgba(255,255,255,0.9);margin:8px 0 0;font-size:14px;">Estoque de EPIs abaixo do limiar</p>
</td></tr>
<tr><td style="padding:30px;">
  <div style="text-align:center;margin-bottom:20px;">
    <div style="font-size:64px;font-weight:900;color:${corNivel};">${capacidadeGeral}</div>
    <div style="font-size:14px;color:#666;">funcionário${capacidadeGeral !== 1 ? 's' : ''} podem ser equipados</div>
    <div style="display:inline-block;margin-top:8px;padding:4px 16px;border-radius:20px;background:${corNivel}20;color:${corNivel};font-weight:700;font-size:13px;">${nivelTexto}</div>
  </div>
  ${gargalo ? `<div style="background:#FEF3C7;border:1px solid #F59E0B;border-radius:8px;padding:12px 16px;margin-bottom:16px;">
    <strong style="color:#92400E;">🔒 Item Gargalo:</strong> <span style="color:#78350F;">${gargalo.nomeEpi} (estoque: ${gargalo.estoqueTotal})</span>
  </div>` : ''}
  <table width="100%" cellpadding="8" cellspacing="0" style="border-collapse:collapse;font-size:13px;">
    <tr style="background:#F3F4F6;"><th style="text-align:left;padding:8px;border-bottom:2px solid #E5E7EB;">Item</th><th style="text-align:center;padding:8px;border-bottom:2px solid #E5E7EB;">Estoque</th><th style="text-align:center;padding:8px;border-bottom:2px solid #E5E7EB;">Capacidade</th></tr>
    ${detalhes.map(d => `<tr><td style="padding:8px;border-bottom:1px solid #E5E7EB;">${d.nomeEpi}</td><td style="text-align:center;padding:8px;border-bottom:1px solid #E5E7EB;">${d.estoqueTotal}</td><td style="text-align:center;padding:8px;border-bottom:1px solid #E5E7EB;font-weight:700;color:${d.capacidade === 0 ? '#DC2626' : d.capacidade <= 3 ? '#EA580C' : '#16A34A'};">${d.capacidade}</td></tr>`).join('')}
  </table>
  <div style="margin-top:20px;padding:12px 16px;background:#FEE2E2;border-radius:8px;border-left:4px solid #DC2626;">
    <strong style="color:#991B1B;">Ação Necessária:</strong> <span style="color:#7F1D1D;">Reposição urgente de estoque de EPIs para manter a capacidade de contratação.</span>
  </div>
</td></tr>
<tr><td style="background:#F7FAFC;padding:15px 30px;text-align:center;border-top:1px solid #E2E8F0;">
  <p style="color:#718096;font-size:11px;margin:0;">Limiar configurado: ${config.limiar} funcionários | Alerta automático — ERP Gestão Integrada</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;

      // 7. Enviar emails
      let enviados = 0;
      let erros = 0;
      const destinatariosEnviados: string[] = [];

      for (const dest of todosEmails) {
        try {
          const result = await sendEmail({
            to: dest.email,
            subject: assunto,
            html: htmlEmail,
            text: textoPlain,
          });
          if (result.success) {
            enviados++;
            destinatariosEnviados.push(dest.email);
          } else {
            erros++;
          }
        } catch {
          erros++;
        }
        // Delay entre envios
        if (todosEmails.length > 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      // 8. Registrar log
      await db.insert(epiAlertaCapacidadeLog).values({
        companyId: input.companyId,
        capacidade: capacidadeGeral,
        limiar: config.limiar,
        gargaloItem: gargalo?.nomeEpi || null,
        gargaloEstoque: gargalo?.estoqueTotal || null,
        destinatariosEnviados: JSON.stringify(destinatariosEnviados),
        emailsEnviados: enviados,
        emailsErros: erros,
      });

      // 9. Atualizar config
      await db.update(epiAlertaCapacidade)
        .set({
          ultimoAlertaEm: sql`NOW()`,
          ultimaCapacidade: capacidadeGeral,
        })
        .where(eq(epiAlertaCapacidade.id, config.id));

      return {
        disparado: true,
        capacidade: capacidadeGeral,
        limiar: config.limiar,
        gargalo: gargalo?.nomeEpi,
        enviados,
        erros,
        destinatarios: destinatariosEnviados,
      };
    }),

  // ============================================================
  // IA: SUGESTÕES INTELIGENTES PARA CONFIGURAÇÃO DE EPIs
  // ============================================================

  // Helper interno para buscar regras de ouro e funções da empresa
  // (não é rota, é usado internamente pelas rotas de IA abaixo)

  iaSugerirKitsPorFuncao: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), funcao: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;

      // Buscar funções da empresa
      const funcoes = await db.select({ nome: jobFunctions.nome, descricao: jobFunctions.descricao, cbo: jobFunctions.cbo })
        .from(jobFunctions)
        .where(and(companyFilter(jobFunctions.companyId, input), eq(jobFunctions.isActive, 1), isNull(jobFunctions.deletedAt)));

      // Buscar regras de ouro
      const rules = await db.select({ titulo: goldenRules.titulo, descricao: goldenRules.descricao, categoria: goldenRules.categoria })
        .from(goldenRules)
        .where(and(companyFilter(goldenRules.companyId, input), eq(goldenRules.isActive, 1), sql`${goldenRules.deletedAt} IS NULL`));
      const regrasTexto = rules.length > 0
        ? rules.map(r => `[${(r.categoria || '').toUpperCase()}] ${r.titulo}: ${r.descricao}`).join('\n')
        : 'Nenhuma regra de ouro cadastrada.';

      // Buscar EPIs existentes no catálogo
      const episCatalogo = await db.select({ nome: epis.nome, categoria: epis.categoria })
        .from(epis)
        .where(companyFilter(epis.companyId, input));
      const episUnicos = [...new Set(episCatalogo.map(e => `${e.nome} (${e.categoria || 'EPI'})`))].slice(0, 50);

      // Buscar kits já existentes
      const kitsExistentes = await db.select({ nome: epiKits.nome, funcao: epiKits.funcao })
        .from(epiKits)
        .where(and(companyFilter(epiKits.companyId, input), eq(epiKits.ativo, 1)));

      const funcoesAlvo = input.funcao
        ? [input.funcao]
        : funcoes.filter(f => !kitsExistentes.some(k => k.funcao.toLowerCase() === f.nome.toLowerCase())).map(f => f.nome).slice(0, 10);

      if (funcoesAlvo.length === 0 && !input.funcao) {
        // Se todas as funções já têm kit, sugerir para funções comuns da construção civil
        funcoesAlvo.push('Pedreiro', 'Servente', 'Eletricista', 'Encanador', 'Carpinteiro');
      }

      const prompt = `Você é um especialista em Segurança do Trabalho para construção civil brasileira.

Funções da empresa: ${funcoes.map(f => f.nome + (f.cbo ? ` (CBO: ${f.cbo})` : '')).join(', ') || 'Não cadastradas'}
EPIs disponíveis no catálogo: ${episUnicos.join(', ') || 'Catálogo vazio'}
Kits já existentes: ${kitsExistentes.map(k => `${k.nome} (${k.funcao})`).join(', ') || 'Nenhum'}

Regras de Ouro da empresa:
${regrasTexto}

Gere kits de EPI para as seguintes funções: ${funcoesAlvo.join(', ')}

Para cada função, liste os EPIs necessários conforme NR-6, NR-18 e boas práticas.
Use preferencialmente os nomes dos EPIs que já existem no catálogo da empresa.
Cada item deve ter: nomeEpi, categoria (EPI, Uniforme ou Calcado), quantidade por pessoa e se é obrigatório.`;

      const response = await invokeLLM({
        messages: [
          { role: "system", content: "Você é um especialista em SST para construção civil brasileira. Responda APENAS com JSON válido." },
          { role: "user", content: prompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "kits_sugestao",
            strict: true,
            schema: {
              type: "object",
              properties: {
                kits: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      nome: { type: "string", description: "Nome do kit, ex: Kit Eletricista" },
                      funcao: { type: "string", description: "Nome da função" },
                      descricao: { type: "string", description: "Breve descrição do kit" },
                      items: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            nomeEpi: { type: "string" },
                            categoria: { type: "string", description: "EPI, Uniforme ou Calcado" },
                            quantidade: { type: "number" },
                            obrigatorio: { type: "boolean" },
                          },
                          required: ["nomeEpi", "categoria", "quantidade", "obrigatorio"],
                          additionalProperties: false,
                        },
                      },
                    },
                    required: ["nome", "funcao", "descricao", "items"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["kits"],
              additionalProperties: false,
            },
          },
        },
      });

      const content = response.choices?.[0]?.message?.content;
      if (!content) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro ao gerar sugestões de kits" });
      return JSON.parse(content);
    }),

  iaSugerirCoresCapacete: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;

      const funcoes = await db.select({ nome: jobFunctions.nome })
        .from(jobFunctions)
        .where(and(companyFilter(jobFunctions.companyId, input), eq(jobFunctions.isActive, 1), isNull(jobFunctions.deletedAt)));

      const rules = await db.select({ titulo: goldenRules.titulo, descricao: goldenRules.descricao, categoria: goldenRules.categoria })
        .from(goldenRules)
        .where(and(companyFilter(goldenRules.companyId, input), eq(goldenRules.isActive, 1), sql`${goldenRules.deletedAt} IS NULL`));
      const regrasTexto = rules.length > 0
        ? rules.map(r => `[${(r.categoria || '').toUpperCase()}] ${r.titulo}: ${r.descricao}`).join('\n')
        : 'Nenhuma regra de ouro cadastrada.';

      const coresExistentes = await db.select().from(epiCoresCapacete)
        .where(companyFilter(epiCoresCapacete.companyId, input));

      const prompt = `Você é um especialista em Segurança do Trabalho para construção civil brasileira.

Funções da empresa: ${funcoes.map(f => f.nome).join(', ') || 'Não cadastradas'}
Cores já configuradas: ${coresExistentes.map(c => `${c.cor} → ${c.funcoes}`).join(', ') || 'Nenhuma'}

Regras de Ouro da empresa:
${regrasTexto}

Gere uma tabela de cores de capacete por função/hierarquia conforme padrão NR-18 e boas práticas da construção civil brasileira.
Inclua a cor, o código hexadecimal, as funções que usam aquela cor, e uma breve descrição.
Considere as funções reais da empresa e o padrão: Branco (engenheiros/mestres), Azul (eletricistas), Vermelho (bombeiros/socorristas), Amarelo (visitantes), Verde (CIPA/segurança), Cinza (pedreiros/serventes), Laranja (sinaleiros), Marrom (carpinteiros).`;

      const response = await invokeLLM({
        messages: [
          { role: "system", content: "Você é um especialista em SST para construção civil brasileira. Responda APENAS com JSON válido." },
          { role: "user", content: prompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "cores_sugestao",
            strict: true,
            schema: {
              type: "object",
              properties: {
                cores: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      cor: { type: "string", description: "Nome da cor" },
                      hexColor: { type: "string", description: "Código hexadecimal da cor, ex: #FFFFFF" },
                      funcoes: { type: "string", description: "Funções separadas por vírgula" },
                      descricao: { type: "string", description: "Breve descrição/justificativa" },
                    },
                    required: ["cor", "hexColor", "funcoes", "descricao"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["cores"],
              additionalProperties: false,
            },
          },
        },
      });

      const content = response.choices?.[0]?.message?.content;
      if (!content) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro ao gerar sugestões de cores" });
      return JSON.parse(content);
    }),

  iaSugerirVidaUtil: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;

      // Buscar EPIs do catálogo
      const episCatalogo = await db.select({ nome: epis.nome, categoria: epis.categoria })
        .from(epis)
        .where(companyFilter(epis.companyId, input));
      const episUnicos = [...new Map(episCatalogo.map(e => [e.nome.toLowerCase().trim(), e])).values()].slice(0, 50);

      const rules = await db.select({ titulo: goldenRules.titulo, descricao: goldenRules.descricao, categoria: goldenRules.categoria })
        .from(goldenRules)
        .where(and(companyFilter(goldenRules.companyId, input), eq(goldenRules.isActive, 1), sql`${goldenRules.deletedAt} IS NULL`));
      const regrasTexto = rules.length > 0
        ? rules.map(r => `[${(r.categoria || '').toUpperCase()}] ${r.titulo}: ${r.descricao}`).join('\n')
        : 'Nenhuma regra de ouro cadastrada.';

      const vidaExistente = await db.select().from(epiVidaUtil)
        .where(companyFilter(epiVidaUtil.companyId, input));

      const prompt = `Você é um especialista em Segurança do Trabalho para construção civil brasileira.

EPIs no catálogo da empresa:
${episUnicos.map(e => `- ${e.nome} (${e.categoria || 'EPI'})`).join('\n') || 'Catálogo vazio'}

Vida útil já configurada: ${vidaExistente.map(v => `${v.nomeEpi}: ${v.vidaUtilMeses} meses`).join(', ') || 'Nenhuma'}

Regras de Ouro da empresa:
${regrasTexto}

Gere uma tabela de vida útil recomendada para cada tipo de EPI.
Baseie-se nas normas NR-6, recomendações dos fabricantes e boas práticas.
Use os nomes dos EPIs que existem no catálogo da empresa.
Inclua: nome do EPI, categoria, vida útil em meses e observações.`;

      const response = await invokeLLM({
        messages: [
          { role: "system", content: "Você é um especialista em SST para construção civil brasileira. Responda APENAS com JSON válido." },
          { role: "user", content: prompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "vida_util_sugestao",
            strict: true,
            schema: {
              type: "object",
              properties: {
                items: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      nomeEpi: { type: "string" },
                      categoriaEpi: { type: "string", description: "EPI, Uniforme ou Calcado" },
                      vidaUtilMeses: { type: "number", description: "Vida útil em meses" },
                      observacoes: { type: "string", description: "Observações sobre a vida útil" },
                    },
                    required: ["nomeEpi", "categoriaEpi", "vidaUtilMeses", "observacoes"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["items"],
              additionalProperties: false,
            },
          },
        },
      });

      const content = response.choices?.[0]?.message?.content;
      if (!content) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro ao gerar sugestões de vida útil" });
      return JSON.parse(content);
    }),

  iaSugerirTreinamentos: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;

      // Buscar EPIs do catálogo
      const episCatalogo = await db.select({ nome: epis.nome, categoria: epis.categoria })
        .from(epis)
        .where(companyFilter(epis.companyId, input));
      const episUnicos = [...new Map(episCatalogo.map(e => [e.nome.toLowerCase().trim(), e])).values()].slice(0, 50);

      const funcoes = await db.select({ nome: jobFunctions.nome })
        .from(jobFunctions)
        .where(and(companyFilter(jobFunctions.companyId, input), eq(jobFunctions.isActive, 1), isNull(jobFunctions.deletedAt)));

      const rules = await db.select({ titulo: goldenRules.titulo, descricao: goldenRules.descricao, categoria: goldenRules.categoria })
        .from(goldenRules)
        .where(and(companyFilter(goldenRules.companyId, input), eq(goldenRules.isActive, 1), sql`${goldenRules.deletedAt} IS NULL`));
      const regrasTexto = rules.length > 0
        ? rules.map(r => `[${(r.categoria || '').toUpperCase()}] ${r.titulo}: ${r.descricao}`).join('\n')
        : 'Nenhuma regra de ouro cadastrada.';

      const treinExistentes = await db.select().from(epiTreinamentosVinculados)
        .where(companyFilter(epiTreinamentosVinculados.companyId, input));

      const prompt = `Você é um especialista em Segurança do Trabalho para construção civil brasileira.

EPIs no catálogo da empresa:
${episUnicos.map(e => `- ${e.nome} (${e.categoria || 'EPI'})`).join('\n') || 'Catálogo vazio'}

Funções da empresa: ${funcoes.map(f => f.nome).join(', ') || 'Não cadastradas'}

Treinamentos já vinculados: ${treinExistentes.map(t => `${t.nomeEpi} → ${t.nomeTreinamento} (${t.normaExigida})`).join(', ') || 'Nenhum'}

Regras de Ouro da empresa:
${regrasTexto}

Gere uma lista de treinamentos obrigatórios vinculados aos EPIs conforme NR-6, NR-18, NR-35, NR-10, NR-33 e demais normas aplicáveis.
Para cada item, informe: nome do EPI, norma exigida (NR-XX), nome do treinamento e se é obrigatório.
Foque nos EPIs que existem no catálogo da empresa e que realmente exigem treinamento para uso seguro.`;

      const response = await invokeLLM({
        messages: [
          { role: "system", content: "Você é um especialista em SST para construção civil brasileira. Responda APENAS com JSON válido." },
          { role: "user", content: prompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "treinamentos_sugestao",
            strict: true,
            schema: {
              type: "object",
              properties: {
                items: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      nomeEpi: { type: "string" },
                      normaExigida: { type: "string", description: "Ex: NR-35" },
                      nomeTreinamento: { type: "string" },
                      obrigatorio: { type: "boolean" },
                    },
                    required: ["nomeEpi", "normaExigida", "nomeTreinamento", "obrigatorio"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["items"],
              additionalProperties: false,
            },
          },
        },
      });

      const content = response.choices?.[0]?.message?.content;
      if (!content) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro ao gerar sugestões de treinamentos" });
      return JSON.parse(content);
    }),
});
