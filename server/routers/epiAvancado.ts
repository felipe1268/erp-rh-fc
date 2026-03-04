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
} from "../../drizzle/schema";
import { eq, and, desc, sql, isNull, gte, lte, inArray } from "drizzle-orm";
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
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const kits = await db.select().from(epiKits)
        .where(eq(epiKits.companyId, input.companyId))
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
    .input(z.object({
      companyId: z.number(),
      nome: z.string(),
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
      });
      const kitId = result.insertId;

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
    .input(z.object({ companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      
      // Check if already seeded
      const existing = await db.select().from(epiKits).where(eq(epiKits.companyId, input.companyId));
      if (existing.length > 0) return { message: "Kits já configurados", created: 0 };

      let created = 0;
      
      // Kit Básico (para todas as funções)
      const [basicResult] = await db.insert(epiKits).values({
        companyId: input.companyId,
        nome: "Kit Básico Obra",
        funcao: "Geral",
        descricao: "Kit padrão para todos os funcionários de obra (NR-6)",
      });
      await db.insert(epiKitItems).values(
        DEFAULT_KIT_BASICO.map(item => ({
          kitId: basicResult.insertId,
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
        });
        const allItems = [...DEFAULT_KIT_BASICO, ...config.itensExtras.map(e => ({ ...e, obrigatorio: 1 }))];
        await db.insert(epiKitItems).values(
          allItems.map(item => ({
            kitId: result.insertId,
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
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      return db.select().from(epiCoresCapacete)
        .where(eq(epiCoresCapacete.companyId, input.companyId))
        .orderBy(epiCoresCapacete.cor);
    }),

  coresCapaceteUpsert: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      cores: z.array(z.object({
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
      await db.delete(epiCoresCapacete).where(eq(epiCoresCapacete.companyId, input.companyId));
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
    .input(z.object({ companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const existing = await db.select().from(epiCoresCapacete).where(eq(epiCoresCapacete.companyId, input.companyId));
      if (existing.length > 0) return { message: "Cores já configuradas", created: 0 };
      
      await db.insert(epiCoresCapacete).values(
        DEFAULT_CORES_CAPACETE.map(c => ({ companyId: input.companyId, ...c }))
      );
      return { message: `${DEFAULT_CORES_CAPACETE.length} cores configuradas`, created: DEFAULT_CORES_CAPACETE.length };
    }),

  // Determinar cor do capacete pela função
  corCapacetePorFuncao: protectedProcedure
    .input(z.object({ companyId: z.number(), funcao: z.string() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const cores = await db.select().from(epiCoresCapacete)
        .where(eq(epiCoresCapacete.companyId, input.companyId));
      
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
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      return db.select().from(epiVidaUtil)
        .where(eq(epiVidaUtil.companyId, input.companyId))
        .orderBy(epiVidaUtil.nomeEpi);
    }),

  vidaUtilUpsert: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      items: z.array(z.object({
        id: z.number().optional(),
        nomeEpi: z.string(),
        categoriaEpi: z.string().optional(),
        vidaUtilMeses: z.number().min(1),
        observacoes: z.string().optional(),
      })),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await db.delete(epiVidaUtil).where(eq(epiVidaUtil.companyId, input.companyId));
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
    .input(z.object({ companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const existing = await db.select().from(epiVidaUtil).where(eq(epiVidaUtil.companyId, input.companyId));
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
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      return db.select().from(epiTreinamentosVinculados)
        .where(eq(epiTreinamentosVinculados.companyId, input.companyId))
        .orderBy(epiTreinamentosVinculados.nomeEpi);
    }),

  treinamentosVinculadosUpsert: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      items: z.array(z.object({
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
      await db.delete(epiTreinamentosVinculados).where(eq(epiTreinamentosVinculados.companyId, input.companyId));
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
    .input(z.object({ companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const existing = await db.select().from(epiTreinamentosVinculados).where(eq(epiTreinamentosVinculados.companyId, input.companyId));
      if (existing.length > 0) return { message: "Treinamentos já configurados", created: 0 };
      
      await db.insert(epiTreinamentosVinculados).values(
        DEFAULT_TREINAMENTOS_VINCULADOS.map(t => ({ companyId: input.companyId, ...t }))
      );
      return { message: `${DEFAULT_TREINAMENTOS_VINCULADOS.length} vínculos criados`, created: DEFAULT_TREINAMENTOS_VINCULADOS.length };
    }),

  // Verificar treinamentos do funcionário antes da entrega
  verificarTreinamentosFuncionario: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      employeeId: z.number(),
      nomeEpi: z.string(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      // Get required trainings for this EPI
      const vinculos = await db.select().from(epiTreinamentosVinculados)
        .where(and(
          eq(epiTreinamentosVinculados.companyId, input.companyId),
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
    .input(z.object({
      companyId: z.number(),
      employeeId: z.number(),
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
            .where(and(eq(epiKits.companyId, input.companyId), eq(epiKits.ativo, 1)));
          
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
        });

        await db.insert(epiChecklistItems).values(
          kitItems.map(item => ({
            checklistId: result.insertId,
            nomeEpi: item.nomeEpi,
            categoria: item.categoria,
            quantidade: item.quantidade,
            epiId: item.epiId || null,
          }))
        );

        return { id: result.insertId, kitUsado: kitToUse?.nome || "Kit Básico", totalItens: kitItems.length };
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
        });

        if (entregas.length > 0) {
          await db.insert(epiChecklistItems).values(
            entregas.map(e => ({
              checklistId: result.insertId,
              nomeEpi: e.nomeEpi || "EPI",
              categoria: (e.categoria || "EPI") as "EPI" | "Uniforme" | "Calcado",
              quantidade: e.quantidade,
              epiId: e.epiId,
            }))
          );
        }

        return { id: result.insertId, totalItens: entregas.length };
      }
    }),

  checklistList: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      employeeId: z.number().optional(),
      tipo: z.enum(["contratacao", "devolucao"]).optional(),
      status: z.enum(["pendente", "parcial", "concluido", "cancelado"]).optional(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const conds: any[] = [eq(epiChecklists.companyId, input.companyId)];
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
        .where(and(eq(epiChecklists.id, input.checklistId), eq(epiChecklists.companyId, input.companyId)));
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
    .input(z.object({
      companyId: z.number(),
      deliveryId: z.number().optional(),
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
    .input(z.object({
      companyId: z.number(),
      diasAntecedencia: z.number().default(30),
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
          eq(epiDeliveries.companyId, input.companyId),
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
    .input(z.object({ companyId: z.number() }))
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
        .where(eq(epiEstoqueMinimo.companyId, input.companyId))
        .orderBy(epis.nome);
    }),

  estoqueMinUpsert: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      epiId: z.number(),
      obraId: z.number().optional(),
      quantidadeMinima: z.number().min(1),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const conds: any[] = [
        eq(epiEstoqueMinimo.companyId, input.companyId),
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
    .input(z.object({ companyId: z.number() }))
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
        .where(eq(epiEstoqueMinimo.companyId, input.companyId));

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
    .input(z.object({ companyId: z.number(), obraId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      
      // Get all kits
      const kits = await db.select().from(epiKits)
        .where(and(eq(epiKits.companyId, input.companyId), eq(epiKits.ativo, 1)));
      
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
          .where(and(eq(epiEstoqueObra.companyId, input.companyId), eq(epiEstoqueObra.obraId, input.obraId)));
        
        for (const e of estoqueObra) {
          if (e.nomeEpi) estoque[e.nomeEpi.toLowerCase()] = (estoque[e.nomeEpi.toLowerCase()] || 0) + e.quantidade;
        }
      } else {
        const allEpis = await db.select({ nome: epis.nome, quantidadeEstoque: epis.quantidadeEstoque })
          .from(epis).where(eq(epis.companyId, input.companyId));
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
    .input(z.object({
      companyId: z.number(),
      tipo: z.enum(["funcionario", "obra", "mensal"]),
      employeeId: z.number().optional(),
      obraId: z.number().optional(),
      dataInicio: z.string().optional(),
      dataFim: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      
      const conds: any[] = [
        eq(epiDeliveries.companyId, input.companyId),
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
        obraAtualId: employees.obraAtualId,
      })
        .from(epiDeliveries)
        .leftJoin(epis, eq(epiDeliveries.epiId, epis.id))
        .leftJoin(employees, eq(epiDeliveries.employeeId, employees.id))
        .where(and(...conds))
        .orderBy(desc(epiDeliveries.dataEntrega));

      // Get obra names
      const obraIds = Array.from(new Set(entregas.map(e => e.obraId || e.obraAtualId).filter(Boolean))) as number[];
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
          const obraKey = String(e.obraId || e.obraAtualId || 0);
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
    .input(z.object({ companyId: z.number() }))
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
        .where(and(eq(obras.companyId, input.companyId), eq(obras.isActive, 1)));

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
        .where(eq(epiEstoqueObra.companyId, input.companyId));

      // Get central stock
      const estoqueCentral = await db.select({
        id: epis.id,
        nome: epis.nome,
        quantidadeEstoque: epis.quantidadeEstoque,
      }).from(epis).where(eq(epis.companyId, input.companyId));

      // Get minimum stock configs
      const minimos = await db.select().from(epiEstoqueMinimo)
        .where(eq(epiEstoqueMinimo.companyId, input.companyId));

      // Get active employees per obra
      const funcPorObra = await db.select({
        obraAtualId: employees.obraAtualId,
        total: sql<number>`COUNT(*)`,
      })
        .from(employees)
        .where(and(eq(employees.companyId, input.companyId), eq(employees.status, "Ativo"), isNull(employees.deletedAt)))
        .groupBy(employees.obraAtualId);

      // Build context for LLM
      const obraInfo = allObras.map(o => {
        const estoque = estoqueObras.filter(e => e.obraId === o.id);
        const funcs = funcPorObra.find(f => f.obraAtualId === o.id);
        const mins = minimos.filter(m => m.obraId === o.id);
        return {
          id: o.id,
          nome: o.nome,
          cep: o.cep,
          cidade: o.cidade,
          estado: o.estado,
          status: o.status,
          funcionarios: funcs?.total || 0,
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
        });

        return { id: result.insertId, analise: parsed };
      } catch (err: any) {
        return { id: 0, analise: null, erro: err.message || "Erro ao analisar estoque" };
      }
    }),

  // Get latest AI analysis
  ultimaAnaliseIA: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const [latest] = await db.select().from(epiAiAnalises)
        .where(eq(epiAiAnalises.companyId, input.companyId))
        .orderBy(desc(epiAiAnalises.createdAt))
        .limit(1);
      return latest || null;
    }),

  // List all AI analyses
  analisesIAList: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      return db.select().from(epiAiAnalises)
        .where(eq(epiAiAnalises.companyId, input.companyId))
        .orderBy(desc(epiAiAnalises.createdAt))
        .limit(20);
    }),

  // Seed all defaults at once
  seedAllDefaults: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const results: string[] = [];

      // Kits
      const existingKits = await db.select().from(epiKits).where(eq(epiKits.companyId, input.companyId));
      if (existingKits.length === 0) {
        // Create basic kit
        const [basicResult] = await db.insert(epiKits).values({
          companyId: input.companyId, nome: "Kit Básico Obra", funcao: "Geral",
          descricao: "Kit padrão para todos os funcionários de obra (NR-6)",
        });
        await db.insert(epiKitItems).values(DEFAULT_KIT_BASICO.map(item => ({ kitId: basicResult.insertId, ...item })));
        
        for (const [funcao, config] of Object.entries(DEFAULT_KITS_POR_FUNCAO)) {
          const [result] = await db.insert(epiKits).values({
            companyId: input.companyId, nome: config.nome, funcao,
            descricao: `Kit específico para ${funcao}`,
          });
          const allItems = [...DEFAULT_KIT_BASICO, ...config.itensExtras.map(e => ({ ...e, obrigatorio: 1 }))];
          await db.insert(epiKitItems).values(allItems.map(item => ({ kitId: result.insertId, ...item })));
        }
        results.push("6 kits criados");
      }

      // Cores
      const existingCores = await db.select().from(epiCoresCapacete).where(eq(epiCoresCapacete.companyId, input.companyId));
      if (existingCores.length === 0) {
        await db.insert(epiCoresCapacete).values(DEFAULT_CORES_CAPACETE.map(c => ({ companyId: input.companyId, ...c })));
        results.push("7 cores de capacete configuradas");
      }

      // Vida útil
      const existingVida = await db.select().from(epiVidaUtil).where(eq(epiVidaUtil.companyId, input.companyId));
      if (existingVida.length === 0) {
        await db.insert(epiVidaUtil).values(DEFAULT_VIDA_UTIL.map(v => ({ companyId: input.companyId, ...v })));
        results.push("9 configurações de vida útil criadas");
      }

      // Treinamentos vinculados
      const existingTreino = await db.select().from(epiTreinamentosVinculados).where(eq(epiTreinamentosVinculados.companyId, input.companyId));
      if (existingTreino.length === 0) {
        await db.insert(epiTreinamentosVinculados).values(DEFAULT_TREINAMENTOS_VINCULADOS.map(t => ({ companyId: input.companyId, ...t })));
        results.push("7 vínculos de treinamento criados");
      }

      return { message: results.length > 0 ? results.join("; ") : "Tudo já estava configurado", results };
    }),
});
