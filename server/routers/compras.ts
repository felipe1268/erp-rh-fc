import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { eq, and, desc, asc, ilike, or, sql } from "drizzle-orm";
import { fornecedores, almoxarifadoItens, almoxarifadoMovimentacoes } from "../../drizzle/schema";

const n = (v: any) => parseFloat(v ?? "0") || 0;

export const comprasRouter = router({

  // ══════════════════════════════════════════════════════════════
  // FORNECEDORES
  // ══════════════════════════════════════════════════════════════

  listarFornecedores: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      busca:     z.string().optional(),
      categoria: z.string().optional(),
      ativo:     z.boolean().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      const rows = await db.select().from(fornecedores)
        .where(and(
          eq(fornecedores.companyId, input.companyId),
          input.ativo !== undefined ? eq(fornecedores.ativo, input.ativo) : undefined,
        ))
        .orderBy(asc(fornecedores.razaoSocial));

      let result = rows;
      if (input.busca) {
        const b = input.busca.toLowerCase();
        result = result.filter(f =>
          f.razaoSocial?.toLowerCase().includes(b) ||
          f.nomeFantasia?.toLowerCase().includes(b) ||
          f.cnpj?.includes(b) ||
          f.cidade?.toLowerCase().includes(b)
        );
      }
      if (input.categoria) {
        result = result.filter(f =>
          Array.isArray(f.categorias) && (f.categorias as string[]).includes(input.categoria!)
        );
      }
      return result;
    }),

  getFornecedor: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const [f] = await db.select().from(fornecedores).where(eq(fornecedores.id, input.id));
      if (!f) throw new TRPCError({ code: "NOT_FOUND", message: "Fornecedor não encontrado" });
      return f;
    }),

  criarFornecedor: protectedProcedure
    .input(z.object({
      companyId:       z.number(),
      cnpj:            z.string().optional(),
      razaoSocial:     z.string().min(1),
      nomeFantasia:    z.string().optional(),
      situacaoReceita: z.string().optional(),
      endereco:        z.string().optional(),
      numero:          z.string().optional(),
      complemento:     z.string().optional(),
      bairro:          z.string().optional(),
      cidade:          z.string().optional(),
      estado:          z.string().optional(),
      cep:             z.string().optional(),
      telefone:        z.string().optional(),
      email:           z.string().optional(),
      contatoNome:     z.string().optional(),
      contatoCelular:  z.string().optional(),
      contatoEmail:    z.string().optional(),
      banco:           z.string().optional(),
      agencia:         z.string().optional(),
      conta:           z.string().optional(),
      pix:             z.string().optional(),
      categorias:      z.array(z.string()).optional(),
      observacoes:     z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [f] = await db.insert(fornecedores).values({
        companyId:       input.companyId,
        cnpj:            input.cnpj ?? null,
        razaoSocial:     input.razaoSocial,
        nomeFantasia:    input.nomeFantasia ?? null,
        situacaoReceita: input.situacaoReceita ?? null,
        endereco:        input.endereco ?? null,
        numero:          input.numero ?? null,
        complemento:     input.complemento ?? null,
        bairro:          input.bairro ?? null,
        cidade:          input.cidade ?? null,
        estado:          input.estado ?? null,
        cep:             input.cep ?? null,
        telefone:        input.telefone ?? null,
        email:           input.email ?? null,
        contatoNome:     input.contatoNome ?? null,
        contatoCelular:  input.contatoCelular ?? null,
        contatoEmail:    input.contatoEmail ?? null,
        banco:           input.banco ?? null,
        agencia:         input.agencia ?? null,
        conta:           input.conta ?? null,
        pix:             input.pix ?? null,
        categorias:      input.categorias ?? [],
        observacoes:     input.observacoes ?? null,
        ativo:           true,
      }).returning();
      return f;
    }),

  atualizarFornecedor: protectedProcedure
    .input(z.object({
      id:              z.number(),
      razaoSocial:     z.string().min(1).optional(),
      nomeFantasia:    z.string().optional(),
      situacaoReceita: z.string().optional(),
      endereco:        z.string().optional(),
      numero:          z.string().optional(),
      complemento:     z.string().optional(),
      bairro:          z.string().optional(),
      cidade:          z.string().optional(),
      estado:          z.string().optional(),
      cep:             z.string().optional(),
      telefone:        z.string().optional(),
      email:           z.string().optional(),
      contatoNome:     z.string().optional(),
      contatoCelular:  z.string().optional(),
      contatoEmail:    z.string().optional(),
      banco:           z.string().optional(),
      agencia:         z.string().optional(),
      conta:           z.string().optional(),
      pix:             z.string().optional(),
      categorias:      z.array(z.string()).optional(),
      observacoes:     z.string().optional(),
      ativo:           z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { id, ...data } = input;
      await db.update(fornecedores)
        .set({ ...data, atualizadoEm: new Date().toISOString() })
        .where(eq(fornecedores.id, id));
      return { success: true };
    }),

  excluirFornecedor: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.update(fornecedores)
        .set({ ativo: false, atualizadoEm: new Date().toISOString() })
        .where(eq(fornecedores.id, input.id));
      return { success: true };
    }),

  // Busca dados do CNPJ via BrasilAPI (proxy server-side evita CORS)
  buscarCNPJ: protectedProcedure
    .input(z.object({ cnpj: z.string() }))
    .query(async ({ input }) => {
      const cnpjLimpo = input.cnpj.replace(/\D/g, "");
      if (cnpjLimpo.length !== 14) throw new TRPCError({ code: "BAD_REQUEST", message: "CNPJ inválido" });
      try {
        const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpjLimpo}`);
        if (!res.ok) throw new TRPCError({ code: "NOT_FOUND", message: "CNPJ não encontrado na Receita Federal" });
        const data = await res.json() as any;
        return {
          cnpj:            cnpjLimpo,
          razaoSocial:     data.razao_social ?? "",
          nomeFantasia:    data.nome_fantasia ?? "",
          situacaoReceita: data.descricao_situacao_cadastral ?? "",
          situacaoCodigo:  data.codigo_situacao_cadastral ?? 0,
          endereco:        data.logradouro ? `${data.tipo_logradouro ?? ""} ${data.logradouro}`.trim() : "",
          numero:          data.numero ?? "",
          complemento:     data.complemento ?? "",
          bairro:          data.bairro ?? "",
          cidade:          data.municipio ?? "",
          estado:          data.uf ?? "",
          cep:             data.cep ?? "",
          telefone:        data.ddd_telefone_1 ?? "",
          email:           data.email ?? "",
        };
      } catch (e: any) {
        if (e instanceof TRPCError) throw e;
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro ao consultar a Receita Federal" });
      }
    }),

  // ══════════════════════════════════════════════════════════════
  // ALMOXARIFADO — ITENS
  // ══════════════════════════════════════════════════════════════

  listarItens: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      busca:     z.string().optional(),
      categoria: z.string().optional(),
      apenasAbaixoMinimo: z.boolean().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      const rows = await db.select().from(almoxarifadoItens)
        .where(and(
          eq(almoxarifadoItens.companyId, input.companyId),
          eq(almoxarifadoItens.ativo, true),
        ))
        .orderBy(asc(almoxarifadoItens.nome));

      let result = rows;
      if (input.busca) {
        const b = input.busca.toLowerCase();
        result = result.filter(i =>
          i.nome.toLowerCase().includes(b) ||
          i.codigoInterno?.toLowerCase().includes(b) ||
          i.categoria?.toLowerCase().includes(b)
        );
      }
      if (input.categoria) {
        result = result.filter(i => i.categoria === input.categoria);
      }
      if (input.apenasAbaixoMinimo) {
        result = result.filter(i => n(i.quantidadeAtual) < n(i.quantidadeMinima));
      }
      return result;
    }),

  criarItem: protectedProcedure
    .input(z.object({
      companyId:        z.number(),
      nome:             z.string().min(1),
      unidade:          z.string().default("un"),
      categoria:        z.string().optional(),
      codigoInterno:    z.string().optional(),
      quantidadeAtual:  z.number().optional(),
      quantidadeMinima: z.number().optional(),
      observacoes:      z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [item] = await db.insert(almoxarifadoItens).values({
        companyId:        input.companyId,
        nome:             input.nome,
        unidade:          input.unidade,
        categoria:        input.categoria ?? null,
        codigoInterno:    input.codigoInterno ?? null,
        quantidadeAtual:  String(input.quantidadeAtual ?? 0),
        quantidadeMinima: String(input.quantidadeMinima ?? 0),
        observacoes:      input.observacoes ?? null,
        ativo:            true,
      }).returning();
      return item;
    }),

  atualizarItem: protectedProcedure
    .input(z.object({
      id:               z.number(),
      nome:             z.string().optional(),
      unidade:          z.string().optional(),
      categoria:        z.string().optional(),
      codigoInterno:    z.string().optional(),
      quantidadeMinima: z.number().optional(),
      observacoes:      z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { id, ...data } = input;
      const updates: any = { atualizadoEm: new Date().toISOString() };
      if (data.nome !== undefined)             updates.nome = data.nome;
      if (data.unidade !== undefined)          updates.unidade = data.unidade;
      if (data.categoria !== undefined)        updates.categoria = data.categoria;
      if (data.codigoInterno !== undefined)    updates.codigoInterno = data.codigoInterno;
      if (data.quantidadeMinima !== undefined) updates.quantidadeMinima = String(data.quantidadeMinima);
      if (data.observacoes !== undefined)      updates.observacoes = data.observacoes;
      await db.update(almoxarifadoItens).set(updates).where(eq(almoxarifadoItens.id, id));
      return { success: true };
    }),

  excluirItem: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.update(almoxarifadoItens)
        .set({ ativo: false, atualizadoEm: new Date().toISOString() })
        .where(eq(almoxarifadoItens.id, input.id));
      return { success: true };
    }),

  // ══════════════════════════════════════════════════════════════
  // ALMOXARIFADO — MOVIMENTAÇÕES
  // ══════════════════════════════════════════════════════════════

  registrarMovimento: protectedProcedure
    .input(z.object({
      companyId:   z.number(),
      itemId:      z.number(),
      tipo:        z.enum(["entrada", "saida", "ajuste"]),
      quantidade:  z.number().positive(),
      obraId:      z.number().optional(),
      obraNome:    z.string().optional(),
      motivo:      z.string().optional(),
      usuarioId:   z.number().optional(),
      usuarioNome: z.string().optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();

      // Verifica saldo disponível para saída
      if (input.tipo === "saida") {
        const [item] = await db.select().from(almoxarifadoItens)
          .where(eq(almoxarifadoItens.id, input.itemId));
        if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Item não encontrado" });
        if (n(item.quantidadeAtual) < input.quantidade) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Saldo insuficiente. Disponível: ${n(item.quantidadeAtual)} ${item.unidade}`,
          });
        }
      }

      // Registra movimentação
      await db.insert(almoxarifadoMovimentacoes).values({
        companyId:   input.companyId,
        itemId:      input.itemId,
        tipo:        input.tipo,
        quantidade:  String(input.quantidade),
        obraId:      input.obraId ?? null,
        obraNome:    input.obraNome ?? null,
        motivo:      input.motivo ?? null,
        usuarioId:   input.usuarioId ?? null,
        usuarioNome: input.usuarioNome ?? null,
        observacoes: input.observacoes ?? null,
      });

      // Atualiza saldo do item
      const delta = input.tipo === "entrada" ? input.quantidade : -input.quantidade;
      await db.update(almoxarifadoItens)
        .set({
          quantidadeAtual: sql`GREATEST(0, ${almoxarifadoItens.quantidadeAtual}::numeric + ${delta})`,
          atualizadoEm: new Date().toISOString(),
        })
        .where(eq(almoxarifadoItens.id, input.itemId));

      return { success: true };
    }),

  listarMovimentos: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      itemId:    z.number().optional(),
      limite:    z.number().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      return db.select().from(almoxarifadoMovimentacoes)
        .where(and(
          eq(almoxarifadoMovimentacoes.companyId, input.companyId),
          input.itemId ? eq(almoxarifadoMovimentacoes.itemId, input.itemId) : undefined,
        ))
        .orderBy(desc(almoxarifadoMovimentacoes.criadoEm))
        .limit(input.limite ?? 200);
    }),

  // Categorias distintas dos itens do almoxarifado
  listarCategoriasAlmoxarifado: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const rows = await db.selectDistinct({ categoria: almoxarifadoItens.categoria })
        .from(almoxarifadoItens)
        .where(and(
          eq(almoxarifadoItens.companyId, input.companyId),
          eq(almoxarifadoItens.ativo, true),
        ))
        .orderBy(asc(almoxarifadoItens.categoria));
      return rows.map(r => r.categoria).filter(Boolean) as string[];
    }),

  // Categorias distintas dos fornecedores
  listarCategoriasFornecedores: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const rows = await db.select({ categorias: fornecedores.categorias })
        .from(fornecedores)
        .where(and(
          eq(fornecedores.companyId, input.companyId),
          eq(fornecedores.ativo, true),
        ));
      const set = new Set<string>();
      rows.forEach(r => {
        if (Array.isArray(r.categorias)) (r.categorias as string[]).forEach(c => set.add(c));
      });
      return Array.from(set).sort();
    }),
});
