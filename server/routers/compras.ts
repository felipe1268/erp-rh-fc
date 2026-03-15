import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { invokeLLM } from "../_core/llm";
import { eq, and, desc, asc, ilike, or, sql, gte, lte, inArray, isNull } from "drizzle-orm";
import {
  fornecedores, avaliacoesFornecedor, almoxarifadoItens, almoxarifadoMovimentacoes,
  almoxarifadoCategorias, almoxarifadoUnidades,
  comprasSolicitacoes, comprasSolicitacoesItens,
  comprasCotacoes, comprasCotacoesItens,
  comprasOrdens, comprasOrdensItens,
  obras,
  orcamentos, orcamentoItens,
  planejamentoProjetos, planejamentoRevisoes, planejamentoAtividades,
} from "../../drizzle/schema";

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
      companyId:          z.number(),
      obraId:             z.number().nullable().optional(),
      busca:              z.string().optional(),
      categoria:          z.string().optional(),
      apenasAbaixoMinimo: z.boolean().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();

      const conditions: any[] = [
        eq(almoxarifadoItens.companyId, input.companyId),
        eq(almoxarifadoItens.ativo, true),
      ];

      if (input.obraId === null) {
        conditions.push(sql`${almoxarifadoItens.obraId} IS NULL`);
      } else if (input.obraId !== undefined) {
        conditions.push(eq(almoxarifadoItens.obraId, input.obraId));
      }

      const rows = await db.select().from(almoxarifadoItens)
        .where(and(...conditions))
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
      companyId:             z.number(),
      obraId:                z.number().nullable().optional(),
      nome:                  z.string().min(1),
      unidade:               z.string().default("un"),
      categoria:             z.string().optional(),
      codigoInterno:         z.string().optional(),
      quantidadeAtual:       z.number().optional(),
      quantidadeMinima:      z.number().optional(),
      observacoes:           z.string().optional(),
      fotoUrl:               z.string().optional(),
      valorUnitario:         z.number().nullable().optional(),
      origem:                z.enum(["proprio", "alugado"]).optional(),
      fornecedorLocacao:     z.string().optional(),
      dataInicioLocacao:     z.string().optional(),
      dataVencimentoLocacao: z.string().optional(),
      valorLocacaoMensal:    z.number().optional(),
      diasAlertaLocacao:     z.number().optional(),
      observacoesLocacao:    z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [item] = await db.insert(almoxarifadoItens).values({
        companyId:             input.companyId,
        obraId:                input.obraId ?? null,
        nome:                  input.nome,
        unidade:               input.unidade,
        categoria:             input.categoria ?? null,
        codigoInterno:         input.codigoInterno ?? null,
        quantidadeAtual:       String(input.quantidadeAtual ?? 0),
        quantidadeMinima:      String(input.quantidadeMinima ?? 0),
        observacoes:           input.observacoes ?? null,
        fotoUrl:               input.fotoUrl ?? null,
        valorUnitario:         input.valorUnitario != null ? String(input.valorUnitario) : null,
        ativo:                 true,
        origem:                input.origem ?? "proprio",
        fornecedorLocacao:     input.fornecedorLocacao ?? null,
        dataInicioLocacao:     input.dataInicioLocacao ?? null,
        dataVencimentoLocacao: input.dataVencimentoLocacao ?? null,
        valorLocacaoMensal:    input.valorLocacaoMensal != null ? String(input.valorLocacaoMensal) : null,
        diasAlertaLocacao:     input.diasAlertaLocacao ?? 7,
        observacoesLocacao:    input.observacoesLocacao ?? null,
      } as any).returning();
      return item;
    }),

  atualizarItem: protectedProcedure
    .input(z.object({
      id:                    z.number(),
      nome:                  z.string().optional(),
      unidade:               z.string().optional(),
      categoria:             z.string().optional(),
      codigoInterno:         z.string().optional(),
      quantidadeMinima:      z.number().optional(),
      observacoes:           z.string().optional(),
      fotoUrl:               z.string().nullable().optional(),
      valorUnitario:         z.number().nullable().optional(),
      origem:                z.enum(["proprio", "alugado"]).optional(),
      fornecedorLocacao:     z.string().nullable().optional(),
      dataInicioLocacao:     z.string().nullable().optional(),
      dataVencimentoLocacao: z.string().nullable().optional(),
      valorLocacaoMensal:    z.number().nullable().optional(),
      diasAlertaLocacao:     z.number().nullable().optional(),
      observacoesLocacao:    z.string().nullable().optional(),
      quantidadeAtual:       z.number().nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { id, ...data } = input;
      const updates: any = { atualizadoEm: new Date().toISOString() };
      if (data.nome !== undefined)                 updates.nome = data.nome;
      if (data.unidade !== undefined)              updates.unidade = data.unidade;
      if (data.categoria !== undefined)            updates.categoria = data.categoria;
      if (data.codigoInterno !== undefined)        updates.codigoInterno = data.codigoInterno;
      if (data.quantidadeMinima !== undefined)     updates.quantidadeMinima = String(data.quantidadeMinima);
      if (data.observacoes !== undefined)          updates.observacoes = data.observacoes;
      if ('fotoUrl' in data)                       updates.fotoUrl = data.fotoUrl;
      if ('valorUnitario' in data)                 updates.valorUnitario = data.valorUnitario != null ? String(data.valorUnitario) : null;
      if (data.origem !== undefined)               updates.origem = data.origem;
      if ('fornecedorLocacao' in data)             updates.fornecedorLocacao = data.fornecedorLocacao;
      if ('dataInicioLocacao' in data)             updates.dataInicioLocacao = data.dataInicioLocacao;
      if ('dataVencimentoLocacao' in data)         updates.dataVencimentoLocacao = data.dataVencimentoLocacao;
      if ('valorLocacaoMensal' in data)            updates.valorLocacaoMensal = data.valorLocacaoMensal != null ? String(data.valorLocacaoMensal) : null;
      if ('diasAlertaLocacao' in data && data.diasAlertaLocacao != null) updates.diasAlertaLocacao = data.diasAlertaLocacao;
      if ('observacoesLocacao' in data)            updates.observacoesLocacao = data.observacoesLocacao;
      if (data.quantidadeAtual !== undefined && data.quantidadeAtual !== null) updates.quantidadeAtual = String(data.quantidadeAtual);
      await db.update(almoxarifadoItens).set(updates).where(eq(almoxarifadoItens.id, id));
      return { success: true };
    }),

  getItensLocadosVencendo: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const rows = await db.select().from(almoxarifadoItens)
        .where(and(
          eq(almoxarifadoItens.companyId, input.companyId),
          eq(almoxarifadoItens.ativo, true),
          eq(almoxarifadoItens.origem, "alugado"),
        ));
      const hoje = new Date();
      return rows
        .filter(i => i.dataVencimentoLocacao)
        .map(i => {
          const venc = new Date(i.dataVencimentoLocacao!);
          const diffDias = Math.ceil((venc.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
          const alertaDias = (i as any).diasAlertaLocacao ?? 7;
          return { ...i, diasParaVencimento: diffDias, alertaDias };
        })
        .filter(i => i.diasParaVencimento <= i.alertaDias)
        .sort((a, b) => a.diasParaVencimento - b.diasParaVencimento);
    }),

  devolverLocacaoItem: protectedProcedure
    .input(z.object({ id: z.number(), observacao: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const obs = input.observacao ? `\nDevolução em ${new Date().toLocaleDateString("pt-BR")}: ${input.observacao}` : `\nDevolução em ${new Date().toLocaleDateString("pt-BR")}`;
      await db.update(almoxarifadoItens).set({
        origem: "proprio",
        fornecedorLocacao: null,
        dataInicioLocacao: null,
        dataVencimentoLocacao: null,
        valorLocacaoMensal: null,
        observacoesLocacao: sql`COALESCE(observacoes_locacao, '') || ${obs}`,
        ativo: false,
        atualizadoEm: new Date().toISOString(),
      } as any).where(eq(almoxarifadoItens.id, input.id));
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
  // ALMOXARIFADO — ESTOQUE CONSOLIDADO
  // ══════════════════════════════════════════════════════════════

  listarItensConsolidado: protectedProcedure
    .input(z.object({ companyId: z.number(), busca: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const rows = await db.select().from(almoxarifadoItens)
        .where(and(eq(almoxarifadoItens.companyId, input.companyId), eq(almoxarifadoItens.ativo, true)))
        .orderBy(asc(almoxarifadoItens.nome));

      const busca = input.busca?.toLowerCase();
      const filtered = busca
        ? rows.filter(i => i.nome.toLowerCase().includes(busca) || i.categoria?.toLowerCase().includes(busca) || i.codigoInterno?.toLowerCase().includes(busca))
        : rows;

      // Group by (nome + unidade + categoria) and sum quantities
      const map = new Map<string, any>();
      for (const item of filtered) {
        const key = `${item.nome.toLowerCase()}|${item.unidade}`;
        if (!map.has(key)) {
          map.set(key, {
            nome: item.nome, unidade: item.unidade, categoria: item.categoria,
            codigoInterno: item.codigoInterno,
            quantidadeTotal: 0, valorUnitario: null,
            valorTotalEstoque: 0, almoxarifados: [],
          });
        }
        const entry = map.get(key)!;
        const qty = n(item.quantidadeAtual);
        entry.quantidadeTotal += qty;
        if (!entry.valorUnitario && item.valorUnitario) entry.valorUnitario = item.valorUnitario;
        const vu = n(entry.valorUnitario);
        if (item.obraId) {
          entry.almoxarifados.push({ tipo: "obra", obraId: item.obraId, quantidade: qty, itemId: item.id });
        } else {
          entry.almoxarifados.push({ tipo: "central", quantidade: qty, itemId: item.id });
        }
      }
      const result = Array.from(map.values()).map(e => ({
        ...e,
        valorTotalEstoque: n(e.valorUnitario) * e.quantidadeTotal,
      }));
      const totalGeral = result.reduce((s, r) => s + r.valorTotalEstoque, 0);
      return { itens: result, totalGeral };
    }),

  // ══════════════════════════════════════════════════════════════
  // ALMOXARIFADO — IA: SUGESTÃO DE PREÇO POR FOTO
  // ══════════════════════════════════════════════════════════════

  sugerirPrecoIA: protectedProcedure
    .input(z.object({
      nome: z.string(),
      unidade: z.string().optional(),
      categoria: z.string().optional(),
      fotoUrl: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const content: any[] = [];
      if (input.fotoUrl) {
        content.push({ type: "image_url", image_url: { url: input.fotoUrl, detail: "low" } });
      }
      content.push({
        type: "text",
        text: `Você é um especialista em precificação de materiais e equipamentos de construção civil no Brasil.
Com base ${input.fotoUrl ? "na imagem e " : ""}no nome do item abaixo, estime o preço médio unitário de mercado (em Reais, R$) para compra/aquisição deste item.

Item: ${input.nome}
${input.unidade ? `Unidade: ${input.unidade}` : ""}
${input.categoria ? `Categoria: ${input.categoria}` : ""}

Responda APENAS com um objeto JSON no formato:
{
  "precoSugerido": <número em reais, ex: 45.90>,
  "descricao": "<breve descrição do item identificado>",
  "justificativa": "<1-2 frases explicando a base da estimativa>",
  "confianca": "alta" | "media" | "baixa"
}`,
      });

      const result = await invokeLLM({
        messages: [{ role: "user", content }],
        maxTokens: 300,
      });

      try {
        const text = result.content ?? "";
        const match = text.match(/\{[\s\S]*\}/);
        if (!match) throw new Error("JSON não encontrado na resposta");
        return JSON.parse(match[0]);
      } catch {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "IA não retornou preço válido. Tente novamente." });
      }
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

  // Categorias distintas dos itens do almoxarifado (legado - mantido para compatibilidade)
  listarCategoriasAlmoxarifado: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const rows = await db.select().from(almoxarifadoCategorias)
        .where(eq(almoxarifadoCategorias.companyId, input.companyId))
        .orderBy(asc(almoxarifadoCategorias.ordem), asc(almoxarifadoCategorias.nome));
      return rows.map(r => r.nome);
    }),

  // ══════════════════════════════════════════════════════════════
  // CATEGORIAS DO ALMOXARIFADO (CRUD)
  // ══════════════════════════════════════════════════════════════
  listarCategorias: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      return db.select().from(almoxarifadoCategorias)
        .where(eq(almoxarifadoCategorias.companyId, input.companyId))
        .orderBy(asc(almoxarifadoCategorias.ordem), asc(almoxarifadoCategorias.nome));
    }),

  criarCategoria: protectedProcedure
    .input(z.object({ companyId: z.number(), nome: z.string().min(1, "Nome obrigatório"), ordem: z.number().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const existing = await db.select().from(almoxarifadoCategorias)
        .where(and(eq(almoxarifadoCategorias.companyId, input.companyId), eq(almoxarifadoCategorias.nome, input.nome.trim())));
      if (existing.length > 0) throw new TRPCError({ code: "CONFLICT", message: "Categoria já existe" });
      const [cat] = await db.insert(almoxarifadoCategorias).values({
        companyId: input.companyId,
        nome: input.nome.trim(),
        ordem: input.ordem ?? 0,
      }).returning();
      return cat;
    }),

  atualizarCategoria: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number(), nome: z.string().min(1), ordem: z.number().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const dup = await db.select().from(almoxarifadoCategorias)
        .where(and(
          eq(almoxarifadoCategorias.companyId, input.companyId),
          eq(almoxarifadoCategorias.nome, input.nome.trim()),
        ));
      if (dup.length > 0 && dup[0].id !== input.id) throw new TRPCError({ code: "CONFLICT", message: "Já existe uma categoria com este nome" });
      await db.update(almoxarifadoCategorias).set({ nome: input.nome.trim(), ordem: input.ordem ?? 0 })
        .where(and(eq(almoxarifadoCategorias.id, input.id), eq(almoxarifadoCategorias.companyId, input.companyId)));
      return { success: true };
    }),

  excluirCategoria: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.delete(almoxarifadoCategorias)
        .where(and(eq(almoxarifadoCategorias.id, input.id), eq(almoxarifadoCategorias.companyId, input.companyId)));
      return { success: true };
    }),

  // ══════════════════════════════════════════════════════════════
  // UNIDADES DE MEDIDA DO ALMOXARIFADO (CRUD)
  // ══════════════════════════════════════════════════════════════
  listarUnidades: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const rows = await db.select().from(almoxarifadoUnidades)
        .where(eq(almoxarifadoUnidades.companyId, input.companyId))
        .orderBy(asc(almoxarifadoUnidades.sigla));

      if (rows.length === 0) {
        const defaults = [
          { sigla: "un", descricao: "Unidade" },
          { sigla: "pç", descricao: "Peça" },
          { sigla: "cx", descricao: "Caixa" },
          { sigla: "sc", descricao: "Saco" },
          { sigla: "rolo", descricao: "Rolo" },
          { sigla: "barra", descricao: "Barra" },
          { sigla: "fardo", descricao: "Fardo" },
          { sigla: "pct", descricao: "Pacote" },
          { sigla: "m", descricao: "Metro" },
          { sigla: "m²", descricao: "Metro quadrado" },
          { sigla: "m³", descricao: "Metro cúbico" },
          { sigla: "kg", descricao: "Quilograma" },
          { sigla: "g", descricao: "Grama" },
          { sigla: "t", descricao: "Tonelada" },
          { sigla: "L", descricao: "Litro" },
          { sigla: "mL", descricao: "Mililitro" },
          { sigla: "galão", descricao: "Galão" },
          { sigla: "vb", descricao: "Verba" },
          { sigla: "gl", descricao: "Global" },
          { sigla: "kit", descricao: "Kit" },
          { sigla: "par", descricao: "Par" },
          { sigla: "dz", descricao: "Dúzia" },
        ];
        const inserted = await db.insert(almoxarifadoUnidades)
          .values(defaults.map(d => ({ companyId: input.companyId, sigla: d.sigla, descricao: d.descricao })))
          .returning();
        return inserted.sort((a, b) => a.sigla.localeCompare(b.sigla));
      }

      return rows;
    }),

  criarUnidade: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      sigla:     z.string().min(1).max(20),
      descricao: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const sigla = input.sigla.trim();
      const existing = await db.select().from(almoxarifadoUnidades)
        .where(and(eq(almoxarifadoUnidades.companyId, input.companyId), eq(almoxarifadoUnidades.sigla, sigla)));
      if (existing.length > 0) throw new TRPCError({ code: "CONFLICT", message: "Unidade já cadastrada" });
      const [row] = await db.insert(almoxarifadoUnidades).values({
        companyId: input.companyId,
        sigla,
        descricao: input.descricao?.trim() || null,
      }).returning();
      return row;
    }),

  excluirUnidade: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const emUso = await db.select({ id: almoxarifadoItens.id })
        .from(almoxarifadoItens)
        .where(and(
          eq(almoxarifadoItens.companyId, input.companyId),
          eq(almoxarifadoItens.ativo, true),
          sql`${almoxarifadoItens.unidade} = (SELECT sigla FROM almoxarifado_unidades WHERE id = ${input.id})`,
        ))
        .limit(1);
      if (emUso.length > 0) throw new TRPCError({ code: "CONFLICT", message: "Esta unidade está em uso por um ou mais itens e não pode ser excluída." });
      await db.delete(almoxarifadoUnidades)
        .where(and(eq(almoxarifadoUnidades.id, input.id), eq(almoxarifadoUnidades.companyId, input.companyId)));
      return { success: true };
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

  // ══════════════════════════════════════════════════════════════
  // SOLICITAÇÕES DE COMPRA (SC)
  // ══════════════════════════════════════════════════════════════

  listarSolicitacoes: protectedProcedure
    .input(z.object({ companyId: z.number(), status: z.string().optional(), aprovacaoStatus: z.string().optional(), busca: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const rows = await db.select().from(comprasSolicitacoes)
        .where(and(
          eq(comprasSolicitacoes.companyId, input.companyId),
          input.status ? eq(comprasSolicitacoes.status, input.status) : undefined,
          input.aprovacaoStatus ? eq(comprasSolicitacoes.aprovacaoStatus, input.aprovacaoStatus) : undefined,
        ))
        .orderBy(desc(comprasSolicitacoes.criadoEm));
      // attach item counts
      const ids = rows.map(r => r.id);
      let itensCounts: Record<number, { total: number; atendidos: number }> = {};
      if (ids.length > 0) {
        const allItens = await db.select().from(comprasSolicitacoesItens)
          .where(sql`${comprasSolicitacoesItens.solicitacaoId} = ANY(${sql.raw("ARRAY[" + ids.join(",") + "]::int[]")})`);
        allItens.forEach(it => {
          if (!itensCounts[it.solicitacaoId]) itensCounts[it.solicitacaoId] = { total: 0, atendidos: 0 };
          itensCounts[it.solicitacaoId].total++;
          if (n(it.quantidadeAtendida) >= n(it.quantidade)) itensCounts[it.solicitacaoId].atendidos++;
        });
      }
      let result = rows.map(r => ({ ...r, _itens: itensCounts[r.id] ?? { total: 0, atendidos: 0 } }));
      if (input.busca) {
        const b = input.busca.toLowerCase();
        result = result.filter(r =>
          r.numeroSc?.toLowerCase().includes(b) ||
          r.titulo?.toLowerCase().includes(b) ||
          r.departamento?.toLowerCase().includes(b) ||
          r.observacoes?.toLowerCase().includes(b)
        );
      }
      return result;
    }),

  getSolicitacao: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const [sc] = await db.select().from(comprasSolicitacoes).where(eq(comprasSolicitacoes.id, input.id));
      if (!sc) throw new TRPCError({ code: "NOT_FOUND" });
      const itens = await db.select().from(comprasSolicitacoesItens).where(eq(comprasSolicitacoesItens.solicitacaoId, input.id));
      return { ...sc, itens };
    }),

  criarSolicitacao: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      obraId: z.number().nullable().optional(),
      projetoId: z.number().nullable().optional(),
      solicitanteId: z.number().nullable().optional(),
      departamento: z.string().optional(),
      titulo: z.string().optional(),
      prioridade: z.string().optional(),
      dataNecessidade: z.string().optional(),
      observacoes: z.string().optional(),
      itens: z.array(z.object({
        descricao: z.string(),
        unidade: z.string().optional(),
        quantidade: z.number(),
        observacoes: z.string().optional(),
        orcamentoItemId: z.number().optional(),
        eapCodigo: z.string().optional(),
      })),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const count = await db.select({ c: sql<number>`count(*)` }).from(comprasSolicitacoes).where(eq(comprasSolicitacoes.companyId, input.companyId));
      const seq = (parseInt(String(count[0]?.c ?? 0)) + 1).toString().padStart(4, "0");
      const numeroSc = `SC-${new Date().getFullYear()}-${seq}`;
      const [sc] = await db.insert(comprasSolicitacoes).values({
        companyId: input.companyId,
        numeroSc,
        obraId: input.obraId ?? null,
        projetoId: input.projetoId ?? null,
        solicitanteId: input.solicitanteId ?? null,
        departamento: input.departamento,
        titulo: input.titulo,
        prioridade: input.prioridade ?? "normal",
        dataNecessidade: input.dataNecessidade,
        observacoes: input.observacoes,
        status: "pendente",
        aprovacaoStatus: "aguardando",
      }).returning();
      if (input.itens.length > 0) {
        await db.insert(comprasSolicitacoesItens).values(
          input.itens.map(it => ({
            solicitacaoId: sc.id,
            descricao: it.descricao,
            unidade: it.unidade,
            quantidade: String(it.quantidade),
            observacoes: it.observacoes,
            statusItem: "pendente",
            orcamentoItemId: it.orcamentoItemId ?? null,
            eapCodigo: it.eapCodigo ?? null,
          }))
        );
      }
      return sc;
    }),

  atualizarStatusSolicitacao: protectedProcedure
    .input(z.object({ id: z.number(), status: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.update(comprasSolicitacoes).set({ status: input.status, atualizadoEm: new Date().toISOString() }).where(eq(comprasSolicitacoes.id, input.id));
      return { ok: true };
    }),

  aprovarSolicitacao: protectedProcedure
    .input(z.object({ id: z.number(), aprovacaoStatus: z.string(), aprovadorId: z.number().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.update(comprasSolicitacoes).set({
        aprovacaoStatus: input.aprovacaoStatus,
        aprovadorId: input.aprovadorId ?? null,
        aprovadoEm: input.aprovacaoStatus !== "aguardando" ? new Date().toISOString() : null,
        atualizadoEm: new Date().toISOString(),
      }).where(eq(comprasSolicitacoes.id, input.id));
      return { ok: true };
    }),

  registrarRecebimentoItem: protectedProcedure
    .input(z.object({ itemId: z.number(), solicitacaoId: z.number(), quantidadeAtendida: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [item] = await db.select().from(comprasSolicitacoesItens).where(eq(comprasSolicitacoesItens.id, input.itemId));
      if (!item) throw new TRPCError({ code: "NOT_FOUND" });
      const qtdTotal = n(item.quantidade);
      const novaQtd = Math.min(input.quantidadeAtendida, qtdTotal);
      const novoStatus = novaQtd >= qtdTotal ? "recebido" : novaQtd > 0 ? "recebido_parcial" : "pendente";
      await db.update(comprasSolicitacoesItens).set({
        quantidadeAtendida: String(novaQtd),
        statusItem: novoStatus,
      }).where(eq(comprasSolicitacoesItens.id, input.itemId));
      // update SC status based on all items
      const allItens = await db.select().from(comprasSolicitacoesItens).where(eq(comprasSolicitacoesItens.solicitacaoId, input.solicitacaoId));
      const todoRecebido = allItens.every(it => n(it.quantidadeAtendida) >= n(it.quantidade));
      const algumRecebido = allItens.some(it => n(it.quantidadeAtendida) > 0);
      if (todoRecebido) {
        await db.update(comprasSolicitacoes).set({ status: "aprovado", atualizadoEm: new Date().toISOString() }).where(eq(comprasSolicitacoes.id, input.solicitacaoId));
      } else if (algumRecebido) {
        await db.update(comprasSolicitacoes).set({ atualizadoEm: new Date().toISOString() }).where(eq(comprasSolicitacoes.id, input.solicitacaoId));
      }
      return { ok: true, statusItem: novoStatus };
    }),

  excluirSolicitacao: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.delete(comprasSolicitacoesItens).where(eq(comprasSolicitacoesItens.solicitacaoId, input.id));
      await db.delete(comprasSolicitacoes).where(eq(comprasSolicitacoes.id, input.id));
      return { ok: true };
    }),

  // ══════════════════════════════════════════════════════════════
  // COTAÇÕES
  // ══════════════════════════════════════════════════════════════

  listarCotacoes: protectedProcedure
    .input(z.object({ companyId: z.number(), status: z.string().optional(), solicitacaoId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      return db.select().from(comprasCotacoes)
        .where(and(
          eq(comprasCotacoes.companyId, input.companyId),
          input.status ? eq(comprasCotacoes.status, input.status) : undefined,
          input.solicitacaoId ? eq(comprasCotacoes.solicitacaoId, input.solicitacaoId) : undefined,
        ))
        .orderBy(desc(comprasCotacoes.criadoEm));
    }),

  getCotacao: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const [cot] = await db.select().from(comprasCotacoes).where(eq(comprasCotacoes.id, input.id));
      if (!cot) throw new TRPCError({ code: "NOT_FOUND" });
      const itens = await db.select().from(comprasCotacoesItens).where(eq(comprasCotacoesItens.cotacaoId, input.id));
      return { ...cot, itens };
    }),

  criarCotacao: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      descricao: z.string().optional(),
      prioridade: z.string().optional(),
      obraId: z.number().nullable().optional(),
      solicitacaoId: z.number().nullable().optional(),
      fornecedorId: z.number().nullable().optional(),
      dataValidade: z.string().optional(),
      condicaoPagamento: z.string().optional(),
      prazoEntregaDias: z.number().nullable().optional(),
      observacoes: z.string().optional(),
      itens: z.array(z.object({
        solicitacaoItemId: z.number().nullable().optional(),
        descricao: z.string(),
        unidade: z.string().optional(),
        quantidade: z.number(),
        precoUnitario: z.number(),
        descontoPct: z.number().optional(),
      })),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const count = await db.select({ c: sql<number>`count(*)` }).from(comprasCotacoes).where(eq(comprasCotacoes.companyId, input.companyId));
      const seq = (parseInt(String(count[0]?.c ?? 0)) + 1).toString().padStart(4, "0");
      const numeroCotacao = `COT-${new Date().getFullYear()}-${seq}`;
      const itensMapped = input.itens.map(it => {
        const desc = it.descontoPct ?? 0;
        const total = n(it.quantidade) * n(it.precoUnitario) * (1 - desc / 100);
        return { ...it, total: total.toFixed(2) };
      });
      const totalGeral = itensMapped.reduce((s, it) => s + n(it.total), 0);
      const [cot] = await db.insert(comprasCotacoes).values({
        companyId: input.companyId,
        numeroCotacao,
        descricao: input.descricao,
        prioridade: input.prioridade ?? "normal",
        obraId: input.obraId ?? null,
        solicitacaoId: input.solicitacaoId ?? null,
        fornecedorId: input.fornecedorId ?? null,
        dataValidade: input.dataValidade,
        condicaoPagamento: input.condicaoPagamento,
        prazoEntregaDias: input.prazoEntregaDias ?? null,
        observacoes: input.observacoes,
        total: String(totalGeral.toFixed(2)),
        status: "pendente",
      }).returning();
      if (itensMapped.length > 0) {
        await db.insert(comprasCotacoesItens).values(
          itensMapped.map(it => ({
            cotacaoId: cot.id,
            solicitacaoItemId: it.solicitacaoItemId ?? null,
            descricao: it.descricao,
            unidade: it.unidade,
            quantidade: String(it.quantidade),
            precoUnitario: String(it.precoUnitario),
            descontoPct: String(it.descontoPct ?? 0),
            total: it.total,
          }))
        );
      }
      if (input.solicitacaoId) {
        await db.update(comprasSolicitacoes).set({ status: "cotacao", atualizadoEm: new Date().toISOString() }).where(eq(comprasSolicitacoes.id, input.solicitacaoId));
      }
      return cot;
    }),

  aprovarCotacao: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.update(comprasCotacoes).set({ status: "aprovada" }).where(eq(comprasCotacoes.id, input.id));
      return { ok: true };
    }),

  atualizarStatusCotacao: protectedProcedure
    .input(z.object({ id: z.number(), status: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.update(comprasCotacoes).set({ status: input.status }).where(eq(comprasCotacoes.id, input.id));
      return { ok: true };
    }),

  excluirCotacao: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.delete(comprasCotacoesItens).where(eq(comprasCotacoesItens.cotacaoId, input.id));
      await db.delete(comprasCotacoes).where(eq(comprasCotacoes.id, input.id));
      return { ok: true };
    }),

  // ══════════════════════════════════════════════════════════════
  // ORDENS DE COMPRA (OC)
  // ══════════════════════════════════════════════════════════════

  listarOrdens: protectedProcedure
    .input(z.object({ companyId: z.number(), status: z.string().optional(), busca: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const rows = await db.select().from(comprasOrdens)
        .where(and(
          eq(comprasOrdens.companyId, input.companyId),
          input.status ? eq(comprasOrdens.status, input.status) : undefined,
        ))
        .orderBy(desc(comprasOrdens.criadoEm));
      if (input.busca) {
        const b = input.busca.toLowerCase();
        return rows.filter(r => r.numeroOc?.toLowerCase().includes(b) || r.observacoes?.toLowerCase().includes(b));
      }
      return rows;
    }),

  getOrdem: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const [oc] = await db.select().from(comprasOrdens).where(eq(comprasOrdens.id, input.id));
      if (!oc) throw new TRPCError({ code: "NOT_FOUND" });
      const itens = await db.select().from(comprasOrdensItens).where(eq(comprasOrdensItens.ordemId, input.id));
      let fornecedor = null;
      if (oc.fornecedorId) {
        const [f] = await db.select({ razaoSocial: fornecedores.razaoSocial, cnpj: fornecedores.cnpj, telefone: fornecedores.telefone, email: fornecedores.email }).from(fornecedores).where(eq(fornecedores.id, oc.fornecedorId));
        fornecedor = f ?? null;
      }
      return { ...oc, itens, fornecedor };
    }),

  criarOrdemDeCotacao: protectedProcedure
    .input(z.object({ companyId: z.number(), cotacaoId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [cot] = await db.select().from(comprasCotacoes).where(eq(comprasCotacoes.id, input.cotacaoId));
      if (!cot) throw new TRPCError({ code: "NOT_FOUND", message: "Cotação não encontrada" });
      const itens = await db.select().from(comprasCotacoesItens).where(eq(comprasCotacoesItens.cotacaoId, input.cotacaoId));
      const count = await db.select({ c: sql<number>`count(*)` }).from(comprasOrdens).where(eq(comprasOrdens.companyId, input.companyId));
      const seq = (parseInt(String(count[0]?.c ?? 0)) + 1).toString().padStart(4, "0");
      const numeroOc = `OC-${new Date().getFullYear()}-${seq}`;
      const subtotal = n(cot.total);
      const [oc] = await db.insert(comprasOrdens).values({
        companyId: input.companyId,
        numeroOc,
        cotacaoId: input.cotacaoId,
        obraId: cot.obraId ?? null,
        fornecedorId: cot.fornecedorId ?? null,
        status: "pendente",
        aprovacaoStatus: "aguardando",
        subtotal: String(subtotal.toFixed(2)),
        frete: "0",
        outrasDespesas: "0",
        impostos: "0",
        desconto: "0",
        total: String(subtotal.toFixed(2)),
      }).returning();
      if (itens.length > 0) {
        await db.insert(comprasOrdensItens).values(
          itens.map(it => ({
            ordemId: oc.id,
            solicitacaoItemId: it.solicitacaoItemId ?? null,
            descricao: it.descricao,
            unidade: it.unidade,
            quantidade: String(it.quantidade),
            precoUnitario: String(it.precoUnitario),
            total: String(it.total),
          }))
        );
      }
      await db.update(comprasCotacoes).set({ status: "aprovada" }).where(eq(comprasCotacoes.id, input.cotacaoId));
      if (cot.solicitacaoId) {
        await db.update(comprasSolicitacoes).set({ status: "aprovado", atualizadoEm: new Date().toISOString() }).where(eq(comprasSolicitacoes.id, cot.solicitacaoId));
      }
      return oc;
    }),

  criarOrdemManual: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      obraId: z.number().nullable().optional(),
      fornecedorId: z.number().nullable().optional(),
      dataEntregaPrevista: z.string().optional(),
      observacoes: z.string().optional(),
      frete: z.number().optional(),
      outrasDespesas: z.number().optional(),
      impostos: z.number().optional(),
      desconto: z.number().optional(),
      itens: z.array(z.object({
        descricao: z.string(),
        unidade: z.string().optional(),
        quantidade: z.number(),
        precoUnitario: z.number(),
      })),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const count = await db.select({ c: sql<number>`count(*)` }).from(comprasOrdens).where(eq(comprasOrdens.companyId, input.companyId));
      const seq = (parseInt(String(count[0]?.c ?? 0)) + 1).toString().padStart(4, "0");
      const numeroOc = `OC-${new Date().getFullYear()}-${seq}`;
      const subtotal = input.itens.reduce((s, it) => s + n(it.quantidade) * n(it.precoUnitario), 0);
      const frete = n(input.frete);
      const outrasDespesas = n(input.outrasDespesas);
      const impostos = n(input.impostos);
      const desconto = n(input.desconto);
      const total = subtotal + frete + outrasDespesas + impostos - desconto;
      const [oc] = await db.insert(comprasOrdens).values({
        companyId: input.companyId,
        numeroOc,
        obraId: input.obraId ?? null,
        fornecedorId: input.fornecedorId ?? null,
        dataEntregaPrevista: input.dataEntregaPrevista,
        observacoes: input.observacoes,
        status: "pendente",
        aprovacaoStatus: "aguardando",
        subtotal: String(subtotal.toFixed(2)),
        frete: String(frete.toFixed(2)),
        outrasDespesas: String(outrasDespesas.toFixed(2)),
        impostos: String(impostos.toFixed(2)),
        desconto: String(desconto.toFixed(2)),
        total: String(total.toFixed(2)),
      }).returning();
      if (input.itens.length > 0) {
        await db.insert(comprasOrdensItens).values(
          input.itens.map(it => ({
            ordemId: oc.id,
            descricao: it.descricao,
            unidade: it.unidade,
            quantidade: String(it.quantidade),
            precoUnitario: String(it.precoUnitario),
            total: String((n(it.quantidade) * n(it.precoUnitario)).toFixed(2)),
          }))
        );
      }
      return oc;
    }),

  atualizarOrdem: protectedProcedure
    .input(z.object({
      id: z.number(),
      frete: z.number().optional(),
      outrasDespesas: z.number().optional(),
      impostos: z.number().optional(),
      desconto: z.number().optional(),
      dataEntregaPrevista: z.string().optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [oc] = await db.select().from(comprasOrdens).where(eq(comprasOrdens.id, input.id));
      if (!oc) throw new TRPCError({ code: "NOT_FOUND" });
      const itens = await db.select().from(comprasOrdensItens).where(eq(comprasOrdensItens.ordemId, input.id));
      const subtotal = itens.reduce((s, it) => s + n(it.total), 0);
      const frete = n(input.frete ?? oc.frete);
      const outrasDespesas = n(input.outrasDespesas ?? oc.outrasDespesas);
      const impostos = n(input.impostos ?? oc.impostos);
      const desconto = n(input.desconto ?? oc.desconto);
      const total = subtotal + frete + outrasDespesas + impostos - desconto;
      await db.update(comprasOrdens).set({
        subtotal: String(subtotal.toFixed(2)),
        frete: String(frete.toFixed(2)),
        outrasDespesas: String(outrasDespesas.toFixed(2)),
        impostos: String(impostos.toFixed(2)),
        desconto: String(desconto.toFixed(2)),
        total: String(total.toFixed(2)),
        dataEntregaPrevista: input.dataEntregaPrevista ?? oc.dataEntregaPrevista ?? undefined,
        observacoes: input.observacoes ?? oc.observacoes ?? undefined,
        atualizadoEm: new Date().toISOString(),
      }).where(eq(comprasOrdens.id, input.id));
      return { ok: true, total };
    }),

  atualizarStatusOrdem: protectedProcedure
    .input(z.object({ id: z.number(), status: z.string(), dataEntregaReal: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();

      // atualiza status da OC
      await db.update(comprasOrdens).set({
        status: input.status,
        dataEntregaReal: input.dataEntregaReal,
        atualizadoEm: new Date().toISOString(),
      }).where(eq(comprasOrdens.id, input.id));

      // ── Integração automática: OC entregue → Almoxarifado ───────────
      if (input.status === "entregue") {
        const [oc] = await db.select().from(comprasOrdens).where(eq(comprasOrdens.id, input.id));
        if (!oc) return { ok: true, almoxarifado: false };

        const itensOC = await db.select().from(comprasOrdensItens).where(eq(comprasOrdensItens.ordemId, input.id));

        // busca nome da obra
        let obraNome: string | null = null;
        if (oc.obraId) {
          const [ob] = await db.select({ nome: obras.nome }).from(obras).where(eq(obras.id, oc.obraId));
          obraNome = ob?.nome ?? null;
        }

        const usuarioNome = ctx.user?.name ?? ctx.user?.email ?? null;
        const usuarioId   = ctx.user?.id ?? null;

        for (const item of itensOC) {
          const qtd = n(item.quantidade);
          if (qtd <= 0) continue;

          // busca ou cria item no almoxarifado
          const existing = await db.select().from(almoxarifadoItens)
            .where(and(
              eq(almoxarifadoItens.companyId, oc.companyId),
              ilike(almoxarifadoItens.nome, item.descricao),
            )).limit(1);

          let almoItemId: number;
          if (existing.length > 0) {
            almoItemId = existing[0].id;
          } else {
            const [novo] = await db.insert(almoxarifadoItens).values({
              companyId: oc.companyId,
              nome: item.descricao,
              unidade: item.unidade ?? "un",
              categoria: "Compras",
              ativo: true,
            }).returning();
            almoItemId = novo.id;
          }

          // cria movimentação de entrada
          await db.insert(almoxarifadoMovimentacoes).values({
            companyId: oc.companyId,
            itemId: almoItemId,
            tipo: "entrada",
            quantidade: String(qtd),
            obraId: oc.obraId ?? null,
            obraNome: obraNome ?? null,
            motivo: `OC ${oc.numeroOc} entregue`,
            usuarioId,
            usuarioNome,
            observacoes: `Entrada automática via Ordem de Compra ${oc.numeroOc}`,
          });

          // atualiza quantidade no almoxarifado
          await db.update(almoxarifadoItens).set({
            quantidadeAtual: sql`${almoxarifadoItens.quantidadeAtual}::numeric + ${qtd}`,
            atualizadoEm: new Date().toISOString(),
          }).where(eq(almoxarifadoItens.id, almoItemId));

          // atualiza quantidadeEntregue no item da OC
          await db.update(comprasOrdensItens).set({
            quantidadeEntregue: String(qtd),
          }).where(eq(comprasOrdensItens.id, item.id));

          // atualiza quantidadeAtendida no item da SC se houver vínculo
          if (item.solicitacaoItemId) {
            const [scItem] = await db.select().from(comprasSolicitacoesItens)
              .where(eq(comprasSolicitacoesItens.id, item.solicitacaoItemId));
            if (scItem) {
              const novaAtendida = n(scItem.quantidadeAtendida) + qtd;
              const atendido = novaAtendida >= n(scItem.quantidade);
              await db.update(comprasSolicitacoesItens).set({
                quantidadeAtendida: String(novaAtendida),
                statusItem: atendido ? "atendido" : "parcial",
              }).where(eq(comprasSolicitacoesItens.id, item.solicitacaoItemId));
            }
          }
        }

        // verifica se todos os itens da SC foram atendidos → marca SC como concluída
        if (oc.cotacaoId) {
          const [cot] = await db.select({ solicitacaoId: comprasCotacoes.solicitacaoId })
            .from(comprasCotacoes).where(eq(comprasCotacoes.id, oc.cotacaoId));
          if (cot?.solicitacaoId) {
            const scItens = await db.select().from(comprasSolicitacoesItens)
              .where(eq(comprasSolicitacoesItens.solicitacaoId, cot.solicitacaoId));
            const todosAtendidos = scItens.length > 0 && scItens.every(it => it.statusItem === "atendido");
            if (todosAtendidos) {
              await db.update(comprasSolicitacoes).set({
                status: "concluida",
                atualizadoEm: new Date().toISOString(),
              }).where(eq(comprasSolicitacoes.id, cot.solicitacaoId));
            }
          }
        }

        return { ok: true, almoxarifado: true, itens: itensOC.length };
      }

      return { ok: true, almoxarifado: false };
    }),

  excluirOrdem: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.delete(comprasOrdensItens).where(eq(comprasOrdensItens.ordemId, input.id));
      await db.delete(comprasOrdens).where(eq(comprasOrdens.id, input.id));
      return { ok: true };
    }),

  // Resumo/contadores para dashboard (legado)
  resumoCompras: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const [scs, cots, ocs] = await Promise.all([
        db.select().from(comprasSolicitacoes).where(eq(comprasSolicitacoes.companyId, input.companyId)),
        db.select().from(comprasCotacoes).where(eq(comprasCotacoes.companyId, input.companyId)),
        db.select().from(comprasOrdens).where(eq(comprasOrdens.companyId, input.companyId)),
      ]);
      return {
        scPendentes: scs.filter(r => r.status === "pendente").length,
        scTotal: scs.length,
        cotPendentes: cots.filter(r => r.status === "pendente").length,
        cotTotal: cots.length,
        ocPendentes: ocs.filter(r => r.status === "pendente").length,
        ocTotal: ocs.length,
        totalOCsValor: ocs.reduce((s, r) => s + n(r.total), 0),
      };
    }),

  getDashboardCompras: protectedProcedure
    .input(z.object({ companyIds: z.array(z.number()).min(1) }))
    .query(async ({ input }) => {
      const db = await getDb();
      const today = new Date().toISOString().slice(0, 10);
      const ids = input.companyIds;

      const [scs, cots, ocs, forn, obrasRows] = await Promise.all([
        db.select().from(comprasSolicitacoes).where(inArray(comprasSolicitacoes.companyId, ids)).orderBy(desc(comprasSolicitacoes.criadoEm)),
        db.select().from(comprasCotacoes).where(inArray(comprasCotacoes.companyId, ids)).orderBy(desc(comprasCotacoes.criadoEm)),
        db.select().from(comprasOrdens).where(inArray(comprasOrdens.companyId, ids)).orderBy(desc(comprasOrdens.criadoEm)),
        db.select().from(fornecedores).where(and(inArray(fornecedores.companyId, ids), eq(fornecedores.ativo, true))),
        db.select({ id: obras.id, nome: obras.nome, codigo: obras.codigo }).from(obras).where(inArray(obras.companyId, ids)),
      ]);

      const obraMap: Record<number, string> = {};
      obrasRows.forEach(o => { obraMap[o.id] = o.codigo ? `${o.codigo} – ${o.nome}` : o.nome; });

      // KPIs
      const kpis = {
        scPendentes:      scs.filter(r => r.status === "pendente").length,
        scAguardandoAprov:scs.filter(r => r.aprovacaoStatus === "aguardando").length,
        cotPendentes:     cots.filter(r => r.status === "pendente").length,
        ocPendentes:      ocs.filter(r => r.status === "pendente").length,
        ocAprovadas:      ocs.filter(r => r.status === "aprovada").length,
        totalValorOCs:    ocs.filter(r => !["cancelada"].includes(r.status)).reduce((s, r) => s + n(r.total), 0),
        fornecedoresAtivos: forn.length,
      };

      // Alertas: OCs com entrega vencida ou hoje
      const alertasOC = ocs.filter(r =>
        r.dataEntregaPrevista &&
        r.dataEntregaPrevista <= today &&
        !["entregue", "cancelada"].includes(r.status)
      ).map(r => ({
        id: r.id, numeroOc: r.numeroOc, dataEntregaPrevista: r.dataEntregaPrevista,
        status: r.status, fornecedorId: r.fornecedorId, total: r.total,
        obraId: r.obraId,
        obraNome: r.obraId ? (obraMap[r.obraId] ?? null) : null,
        atrasado: r.dataEntregaPrevista! < today,
      }));

      // SCs aguardando aprovação
      const scsPendentesAprov = scs.filter(r => r.aprovacaoStatus === "aguardando" && r.status !== "cancelado").slice(0, 8)
        .map(r => ({ ...r, obraNome: r.obraId ? (obraMap[r.obraId] ?? null) : null }));

      // Cotações pendentes (mais antigas primeiro)
      const cotsPendentes = cots.filter(r => r.status === "pendente").slice(0, 8)
        .map(r => ({ ...r, obraNome: r.obraId ? (obraMap[r.obraId] ?? null) : null }));

      // OCs recentes (últimas 8)
      const ocsRecentes = ocs.slice(0, 8)
        .map(r => ({ ...r, obraNome: r.obraId ? (obraMap[r.obraId] ?? null) : null }));

      // SCs recentes (últimas 8)
      const scsRecentes = scs.slice(0, 8)
        .map(r => ({ ...r, obraNome: r.obraId ? (obraMap[r.obraId] ?? null) : null }));

      // Gastos por mês (últimos 6 meses) — baseado na data de criação das OCs aprovadas/entregues
      const seisM: Record<string, number> = {};
      ocs.filter(r => !["cancelada"].includes(r.status)).forEach(r => {
        const mes = r.criadoEm.slice(0, 7); // YYYY-MM
        seisM[mes] = (seisM[mes] ?? 0) + n(r.total);
      });
      const gastosMensais = Object.entries(seisM).sort(([a], [b]) => a.localeCompare(b)).slice(-6).map(([mes, valor]) => ({ mes, valor }));

      return { kpis, alertasOC, scsPendentesAprov, cotsPendentes, ocsRecentes, scsRecentes, gastosMensais, fornecedores: forn, obraMap };
    }),

  // ══════════════════════════════════════════════════════════════
  // AVALIAÇÕES DE FORNECEDORES
  // ══════════════════════════════════════════════════════════════

  avaliarFornecedor: protectedProcedure
    .input(z.object({
      fornecedorId: z.number(),
      companyId:    z.number(),
      nota:         z.number().min(1).max(5),
      comentario:   z.string().optional(),
      criadoPor:    z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.insert(avaliacoesFornecedor).values({
        fornecedorId: input.fornecedorId,
        companyId:    input.companyId,
        nota:         input.nota,
        comentario:   input.comentario ?? null,
        criadoPor:    input.criadoPor ?? null,
      });
      return { ok: true };
    }),

  listarAvaliacoesFornecedor: protectedProcedure
    .input(z.object({ fornecedorId: z.number(), companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const rows = await db
        .select()
        .from(avaliacoesFornecedor)
        .where(and(
          eq(avaliacoesFornecedor.fornecedorId, input.fornecedorId),
          eq(avaliacoesFornecedor.companyId, input.companyId),
        ))
        .orderBy(desc(avaliacoesFornecedor.criadoEm));
      return rows;
    }),

  rankingFornecedores: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const rows = await db.execute(sql`
        SELECT
          f.id,
          f.razao_social   AS "razaoSocial",
          f.nome_fantasia  AS "nomeFantasia",
          f.categorias,
          f.cidade,
          f.estado,
          COUNT(a.id)::int                        AS "totalAvaliacoes",
          ROUND(AVG(a.nota)::numeric, 1)::float   AS "mediaEstrelas"
        FROM fornecedores f
        LEFT JOIN avaliacoes_fornecedor a
          ON a.fornecedor_id = f.id AND a.company_id = ${input.companyId}
        WHERE f.company_id = ${input.companyId}
          AND f.ativo = true
        GROUP BY f.id, f.razao_social, f.nome_fantasia, f.categorias, f.cidade, f.estado
        HAVING COUNT(a.id) > 0
        ORDER BY "mediaEstrelas" DESC, "totalAvaliacoes" DESC
        LIMIT 50
      `);
      return rows as any[];
    }),

  // ══════════════════════════════════════════════════════════════
  // EAP PARA SC — retorna itens do orçamento + prazo do planejamento
  // SEM custos/metas (blind quotation até equalização)
  // ══════════════════════════════════════════════════════════════
  getEapParaObra: protectedProcedure
    .input(z.object({ obraId: z.number(), companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();

      // Orçamento mais recente da obra
      const [orc] = await db.select({
        id: orcamentos.id,
        codigo: orcamentos.codigo,
        descricao: orcamentos.descricao,
      }).from(orcamentos)
        .where(and(
          eq(orcamentos.companyId, input.companyId),
          eq(orcamentos.obraId, input.obraId),
          isNull(orcamentos.deletedAt),
        ))
        .orderBy(desc(orcamentos.createdAt))
        .limit(1);

      if (!orc) return { items: [], orcamentoId: null, projetoId: null, semOrcamento: true };

      // Itens da EAP — SEM campos de custo/meta
      const orcItems = await db.select({
        id: orcamentoItens.id,
        eapCodigo: orcamentoItens.eapCodigo,
        nivel: orcamentoItens.nivel,
        tipo: orcamentoItens.tipo,
        descricao: orcamentoItens.descricao,
        unidade: orcamentoItens.unidade,
        quantidade: orcamentoItens.quantidade,
        ordem: orcamentoItens.ordem,
      }).from(orcamentoItens)
        .where(and(
          eq(orcamentoItens.orcamentoId, orc.id),
          eq(orcamentoItens.companyId, input.companyId),
        ))
        .orderBy(asc(orcamentoItens.ordem));

      // Projeto de planejamento mais recente da obra
      const [proj] = await db.select({ id: planejamentoProjetos.id })
        .from(planejamentoProjetos)
        .where(and(
          eq(planejamentoProjetos.companyId, input.companyId),
          eq(planejamentoProjetos.obraId, input.obraId),
        ))
        .orderBy(desc(planejamentoProjetos.criadoEm))
        .limit(1);

      // Revisão mais recente → atividades com prazo
      const atividadesMap: Record<string, { dataFim: string | null; duracaoDias: number | null }> = {};
      if (proj) {
        const [rev] = await db.select({ id: planejamentoRevisoes.id })
          .from(planejamentoRevisoes)
          .where(eq(planejamentoRevisoes.projetoId, proj.id))
          .orderBy(desc(planejamentoRevisoes.id))
          .limit(1);

        if (rev) {
          const atividades = await db.select({
            eapCodigo: planejamentoAtividades.eapCodigo,
            dataFim: planejamentoAtividades.dataFim,
            duracaoDias: planejamentoAtividades.duracaoDias,
          }).from(planejamentoAtividades)
            .where(eq(planejamentoAtividades.revisaoId, rev.id));

          atividades.forEach(a => {
            if (a.eapCodigo) atividadesMap[a.eapCodigo] = { dataFim: a.dataFim, duracaoDias: a.duracaoDias };
          });
        }
      }

      const items = orcItems.map(it => ({
        ...it,
        prazoFim: atividadesMap[it.eapCodigo]?.dataFim ?? null,
        duracaoDias: atividadesMap[it.eapCodigo]?.duracaoDias ?? null,
      }));

      return { items, orcamentoId: orc.id, projetoId: proj?.id ?? null, semOrcamento: false };
    }),
});
