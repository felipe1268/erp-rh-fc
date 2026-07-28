import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { triggerFinancialSync } from "../services/financialEventTrigger";
import {
  parceirosConveniados,
  lancamentosParceiros,
  pagamentosParceiros,
  employees,
  systemCriteria,
} from "../../drizzle/schema";
import { eq, and, or, desc, sql, isNull, inArray, gte, lte } from "drizzle-orm";
import { avaliarCreditoColaborador } from "../utils/creditoConvenio";
import { resolveCompanyIds, companyFilter } from "../companyHelper";
import { storagePut } from "../storage";

// Lê o `ponto_dia_corte` configurado para a empresa (1..28). Default 15.
// Centralizado para que tela de Aprovações RH e validações de ciclo usem
// a MESMA fonte de verdade do filtro de listagem.
async function getDiaCorteParaEmpresa(db: any, companyId: number | null | undefined): Promise<number> {
  let diaCorte = 15;
  try {
    if (companyId && companyId > 0) {
      const rows = await db
        .select({ valor: systemCriteria.valor })
        .from(systemCriteria)
        .where(and(
          eq(systemCriteria.companyId, companyId),
          eq(systemCriteria.chave, "ponto_dia_corte"),
        ));
      const v = rows[0]?.valor;
      const parsed = v != null ? parseInt(String(v), 10) : NaN;
      if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 28) diaCorte = parsed;
    }
  } catch (e) {
    console.warn("[parceiros] falha ao ler ponto_dia_corte; usando default 15", e);
  }
  return diaCorte;
}

// Rev. 4695 — deriva a competência (YYYY-MM) a partir da dataCompra para um
// dado diaCorte: dia <= diaCorte → mês da compra; dia > diaCorte → mês seguinte.
// Exportado para o Dashboard Parceiros agrupar pelo MESMO ciclo da tela de
// Lançamentos (antes o dashboard agrupava por mês-calendário e divergia).
export function competenciaFromDataCompra(dataCompra: string | null | undefined, diaCorte: number): string | null {
  const [yS, mS, dS] = String(dataCompra ?? "").slice(0, 10).split("-");
  let y = Number(yS); let m = Number(mS); const d = Number(dS);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  if (d > diaCorte) { m += 1; if (m > 12) { m = 1; y += 1; } }
  return `${y}-${String(m).padStart(2, "0")}`;
}

export { getDiaCorteParaEmpresa };

// Calcula a janela do ciclo (cycleStart..cycleEnd) da competência YYYY-MM
// para um dado `diaCorte`. Retorna null quando entrada inválida.
function computeCycleRangeForCompetencia(competencia: string, diaCorte: number): { cycleStart: string; cycleEnd: string } | null {
  const [yyStr, mmStr] = String(competencia).split("-");
  const yy = Number(yyStr); const mm = Number(mmStr);
  if (!Number.isFinite(yy) || !Number.isFinite(mm)) return null;
  const prevYY = mm === 1 ? yy - 1 : yy;
  const prevMM = mm === 1 ? 12 : mm - 1;
  const startDay = diaCorte + 1;
  const cycleStart = `${prevYY}-${String(prevMM).padStart(2, "0")}-${String(startDay).padStart(2, "0")}`;
  const cycleEnd = `${yy}-${String(mm).padStart(2, "0")}-${String(diaCorte).padStart(2, "0")}`;
  return { cycleStart, cycleEnd };
}

// Sanitiza payload do parceiro: converte vírgula decimal para ponto e
// transforma strings vazias em null nos campos numéricos.
function sanitizeParceiroPayload<T extends Record<string, any>>(input: T): T {
  const out: any = { ...input };
  // Campo NUMERIC no Postgres — Drizzle envia como string
  if (out.limiteMensalPorColaborador !== undefined) {
    const v = String(out.limiteMensalPorColaborador ?? "").trim();
    if (v === "") {
      out.limiteMensalPorColaborador = null;
    } else {
      // Aceita "150,00", "1.500,00", "1500.00", "150"
      const normalized = v.includes(",")
        ? v.replace(/\./g, "").replace(",", ".")
        : v;
      const num = Number(normalized);
      out.limiteMensalPorColaborador = Number.isFinite(num) ? String(num) : null;
    }
  }
  // Inteiros opcionais que podem vir como string vazia do form
  for (const k of ["diaFechamento", "prazoPagamento", "carenciaDias", "travarDebitoAnterior"] as const) {
    if (out[k] === "" || out[k] === undefined) out[k] = null;
  }
  return out;
}

export const parceirosRouter = router({
  // ============================================================
  // PARCEIROS CONVENIADOS
  // ============================================================
  cadastro: router({
    list: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        return db.select().from(parceirosConveniados)
          .where(and(companyFilter(parceirosConveniados.companyId, input), isNull(parceirosConveniados.deletedAt)))
          .orderBy(parceirosConveniados.razaoSocial);
      }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const [row] = await db.select().from(parceirosConveniados).where(eq(parceirosConveniados.id, input.id));
        return row || null;
      }),

    create: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), razaoSocial: z.string().min(1),
        nomeFantasia: z.string().optional(),
        cnpj: z.string().min(1),
        inscricaoEstadual: z.string().optional(),
        inscricaoMunicipal: z.string().optional(),
        cep: z.string().optional(),
        logradouro: z.string().optional(),
        numero: z.string().optional(),
        complemento: z.string().optional(),
        bairro: z.string().optional(),
        cidade: z.string().optional(),
        estado: z.string().optional(),
        telefone: z.string().optional(),
        celular: z.string().optional(),
        emailPrincipal: z.string().optional(),
        emailFinanceiro: z.string().optional(),
        responsavelNome: z.string().optional(),
        responsavelCargo: z.string().optional(),
        tipoConvenio: z.enum(["farmacia", "posto_combustivel", "restaurante", "mercado", "outros"]),
        tipoConvenioOutro: z.string().optional(),
        banco: z.string().optional(),
        agencia: z.string().optional(),
        conta: z.string().optional(),
        tipoConta: z.enum(["corrente", "poupanca"]).optional(),
        titularConta: z.string().optional(),
        cpfCnpjTitular: z.string().optional(),
        formaPagamento: z.enum(["pix", "boleto", "transferencia", "deposito"]).optional(),
        pixChave: z.string().optional(),
        pixTipoChave: z.enum(["cpf", "cnpj", "email", "telefone", "aleatoria"]).optional(),
        diaFechamento: z.number().optional(),
        prazoPagamento: z.number().optional(),
        limiteMensalPorColaborador: z.string().optional(),
        carenciaDias: z.number().optional(),
        travarDebitoAnterior: z.number().optional(),
        observacoes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        const data = sanitizeParceiroPayload(input);
        const [row] = await db
          .insert(parceirosConveniados)
          .values({
            ...data,
            createdBy: ctx.user?.name || "Sistema",
          } as any)
          .returning({ id: parceirosConveniados.id });
        return { id: row.id };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        razaoSocial: z.string().nullish(),
        nomeFantasia: z.string().nullish(),
        cnpj: z.string().nullish(),
        inscricaoEstadual: z.string().nullish(),
        inscricaoMunicipal: z.string().nullish(),
        cep: z.string().nullish(),
        logradouro: z.string().nullish(),
        numero: z.string().nullish(),
        complemento: z.string().nullish(),
        bairro: z.string().nullish(),
        cidade: z.string().nullish(),
        estado: z.string().nullish(),
        telefone: z.string().nullish(),
        celular: z.string().nullish(),
        emailPrincipal: z.string().nullish(),
        emailFinanceiro: z.string().nullish(),
        responsavelNome: z.string().nullish(),
        responsavelCargo: z.string().nullish(),
        tipoConvenio: z.enum(["farmacia", "posto_combustivel", "restaurante", "mercado", "outros"]).nullish(),
        tipoConvenioOutro: z.string().nullish(),
        banco: z.string().nullish(),
        agencia: z.string().nullish(),
        conta: z.string().nullish(),
        tipoConta: z.enum(["corrente", "poupanca"]).nullish(),
        titularConta: z.string().nullish(),
        cpfCnpjTitular: z.string().nullish(),
        formaPagamento: z.enum(["pix", "boleto", "transferencia", "deposito"]).nullish(),
        pixChave: z.string().nullish(),
        pixTipoChave: z.enum(["cpf", "cnpj", "email", "telefone", "aleatoria"]).nullish(),
        diaFechamento: z.number().nullish(),
        prazoPagamento: z.number().nullish(),
        limiteMensalPorColaborador: z.union([z.string(), z.number()]).nullish(),
        carenciaDias: z.number().nullish(),
        travarDebitoAnterior: z.number().nullish(),
        status: z.enum(["ativo", "suspenso", "inativo"]).nullish(),
        observacoes: z.string().nullish(),
        contratoConvenioUrl: z.string().nullish(),
        contratoSocialUrl: z.string().nullish(),
        alvaraUrl: z.string().nullish(),
      }).passthrough())
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        const { id, ...rest } = input;
        const data = sanitizeParceiroPayload(rest);
        await db.update(parceirosConveniados).set(data as any).where(eq(parceirosConveniados.id, id));
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        await db.update(parceirosConveniados).set({ deletedAt: new Date().toISOString() }).where(eq(parceirosConveniados.id, input.id));
        return { success: true };
      }),

    uploadDoc: protectedProcedure
      .input(z.object({
        parceiroId: z.number(),
        field: z.string(),
        fileName: z.string(),
        fileBase64: z.string(),
        contentType: z.string(),
      }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        const buf = Buffer.from(input.fileBase64, "base64");
        const key = `parceiros/${input.parceiroId}/${Date.now()}-${input.fileName}`;
        const { url } = await storagePut(key, buf, input.contentType);
        await db.update(parceirosConveniados).set({ [input.field]: url } as any).where(eq(parceirosConveniados.id, input.parceiroId));
        return { url };
      }),
  }),

  // ============================================================
  // LANÇAMENTOS
  // ============================================================
  lancamentos: router({
    list: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), parceiroId: z.number().optional(),
        competencia: z.string().optional(),
        dataInicio: z.string().optional(),
        dataFim: z.string().optional(),
        status: z.enum(["pendente", "aprovado", "rejeitado"]).optional(),
      }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const conditions: any[] = [companyFilter(lancamentosParceiros.companyId, input)];
        if (input.parceiroId) conditions.push(eq(lancamentosParceiros.parceiroId, input.parceiroId));

        // Quando a tela de Aprovações RH envia `competencia`, o filtro deve ser
        // pelo CICLO DA FOLHA (dia seguinte ao corte do mês anterior até o dia
        // de corte do mês selecionado), e NÃO por igualdade do varchar
        // `competenciaDesconto`. Isso evita esconder lançamentos legados/com
        // competência nula ou divergente.
        let cycleStart: string | null = null;
        let cycleEnd: string | null = null;
        if (input.competencia && !input.dataInicio && !input.dataFim) {
          // Para evitar ambiguidade quando o request abrange múltiplas
          // empresas, usa o `companyId` primário (Aprovações RH sempre envia um).
          const diaCorte = await getDiaCorteParaEmpresa(db, input.companyId);
          const range = computeCycleRangeForCompetencia(String(input.competencia), diaCorte);
          if (range) {
            cycleStart = range.cycleStart;
            cycleEnd = range.cycleEnd;
            conditions.push(gte(lancamentosParceiros.dataCompra, cycleStart));
            conditions.push(lte(lancamentosParceiros.dataCompra, cycleEnd));
          }
        }

        if (input.dataInicio) conditions.push(gte(lancamentosParceiros.dataCompra, input.dataInicio));
        if (input.dataFim) conditions.push(lte(lancamentosParceiros.dataCompra, input.dataFim));
        if (input.status) conditions.push(eq(lancamentosParceiros.status, input.status));
        const rows = await db.select().from(lancamentosParceiros).where(and(...conditions)).orderBy(desc(lancamentosParceiros.createdAt));

        // Backfill leve: quando filtramos por ciclo, sane `competenciaDesconto`
        // dos registros em que estiver nulo/divergente. Idempotente: só
        // atualiza quando o valor calculado difere do valor gravado.
        if (input.competencia && cycleStart && cycleEnd) {
          const expected = String(input.competencia);
          const toFix = rows.filter((r: any) => (r.competenciaDesconto ?? "") !== expected);
          if (toFix.length > 0) {
            const ids = toFix.map((r: any) => r.id as number);
            try {
              await db
                .update(lancamentosParceiros)
                .set({ competenciaDesconto: expected })
                .where(inArray(lancamentosParceiros.id, ids));
              for (const r of toFix as any[]) r.competenciaDesconto = expected;
            } catch (e) {
              // não falha a leitura por causa de saneamento
              console.warn("[parceiros.lancamentos.list] backfill de competenciaDesconto falhou", e);
            }
          }
        }

        return rows;
      }),

    create: protectedProcedure
      .input(z.object({
        parceiroId: z.number().optional(),
        parceiroConveniadoId: z.number().optional(),
        companyId: z.number(),
        employeeId: z.number(),
        employeeNome: z.string().nullish(),
        dataCompra: z.string(),
        descricaoItens: z.string().nullish(),
        valor: z.union([z.string(), z.number()]),
        competenciaDesconto: z.string().nullish(),
      }).passthrough())
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        const parceiroId = input.parceiroId ?? input.parceiroConveniadoId;
        if (!parceiroId) throw new Error("Parceiro é obrigatório");

        // Sanitiza valor (aceita "129,51", "1.500,00", "129.51", 129.51)
        const rawV = String(input.valor ?? "").trim();
        const normV = rawV.includes(",")
          ? rawV.replace(/\./g, "").replace(",", ".")
          : rawV;
        const valorNum = Number(normV);
        if (!Number.isFinite(valorNum) || valorNum <= 0) {
          throw new Error("Valor inválido");
        }

        // Resolve nome do colaborador se não enviado
        let employeeNome = input.employeeNome ?? "";
        if (!employeeNome) {
          const [emp] = await db
            .select({ nome: employees.nomeCompleto })
            .from(employees)
            .where(eq(employees.id, input.employeeId));
          employeeNome = emp?.nome ?? "";
        }
        if (!employeeNome) throw new Error("Colaborador não encontrado");

        // Rev. 4707 — motor de crédito (poka-yoke) também no lançamento interno:
        // limite/carência/situação/débito anterior. Erro na avaliação = bloqueado.
        {
          const [parcRow] = await db.select().from(parceirosConveniados).where(and(
            eq(parceirosConveniados.id, parceiroId),
            eq(parceirosConveniados.companyId, input.companyId),
          )).limit(1);
          if (!parcRow) throw new Error("Parceiro não encontrado nesta empresa");
          const credito = await avaliarCreditoColaborador(db, {
            companyId: input.companyId,
            parceiro: parcRow,
            employeeId: input.employeeId,
            dataCompra: input.dataCompra,
            valorNovo: valorNum,
          });
          if (!credito.liberado) throw new Error(`Lançamento bloqueado: ${credito.motivo}`);
        }

        const [row] = await db
          .insert(lancamentosParceiros)
          .values({
            parceiroId,
            companyId: input.companyId,
            employeeId: input.employeeId,
            employeeNome,
            dataCompra: input.dataCompra,
            descricaoItens: input.descricaoItens ?? null,
            valor: String(valorNum),
            // Rev. 1216: a competência é regra de negócio do RH (ciclo de fechamento de ponto)
            // e NÃO pode ser definida pelo cliente. Sempre derivada de dataCompra:
            //   dia <= 15 → competência = mês da compra
            //   dia >= 16 → competência = mês seguinte
            competenciaDesconto: (input.dataCompra ? (() => {
              const [yS, mS, dS] = input.dataCompra.slice(0, 10).split("-");
              let y = Number(yS); let m = Number(mS); const d = Number(dS);
              if (d >= 16) { m += 1; if (m > 12) { m = 1; y += 1; } }
              return `${y}-${String(m).padStart(2, "0")}`;
            })() : null),
            lancadoPor: ctx.user?.name || "Sistema",
          } as any)
          .returning({ id: lancamentosParceiros.id });

        // Rev. 4708 — lançamento MANUAL (interno): alerta informativo para os
        // usuários master (não bloqueia nada; ciência ao logar).
        try {
          const { criarUserAlert } = await import("../db");
          const { users } = await import("../../drizzle/schema");
          const masters = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin_master"));
          const valorFmt = valorNum.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          for (const m of masters) {
            if (ctx.user?.id && m.id === ctx.user.id) continue; // quem lançou não precisa do próprio alerta
            await criarUserAlert({
              userId: m.id,
              companyId: input.companyId,
              tipo: "parceiro_lancamento_manual",
              titulo: "Lançamento manual no convênio",
              mensagem: `${ctx.user?.name || "Um usuário"} fez um lançamento MANUAL de R$ ${valorFmt} para ${employeeNome} (${input.dataCompra ? input.dataCompra.slice(0, 10).split("-").reverse().join("/") : ""}). Dá uma olhada.`,
              linkUrl: "/parceiros/lancamentos",
            });
          }
        } catch (e) {
          console.error("[parceiros.create] alerta ao master falhou (não bloqueante):", e);
        }
        return { id: row.id };
      }),

    // Retorna a janela do ciclo (cycleStart, cycleEnd) e o `diaCorte`
    // efetivo da empresa para a competência informada. Fonte de verdade
    // usada pela tela de Aprovações RH para alertar sobre lançamentos
    // cuja `dataCompra` não pertence ao ciclo selecionado.
    cicloInfo: protectedProcedure
      .input(z.object({ companyId: z.number(), competencia: z.string() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const diaCorte = await getDiaCorteParaEmpresa(db, input.companyId);
        const range = computeCycleRangeForCompetencia(input.competencia, diaCorte);
        return {
          competencia: input.competencia,
          diaCorte,
          cycleStart: range?.cycleStart ?? null,
          cycleEnd: range?.cycleEnd ?? null,
        };
      }),

    aprovar: protectedProcedure
      .input(z.object({
        id: z.number(),
        aprovado: z.boolean(),
        motivoRejeicao: z.string().optional(),
        comentarioAdmin: z.string().optional(),
        // Quando informado, o servidor valida se a `dataCompra` pertence
        // ao ciclo dessa competência (usando `ponto_dia_corte` da empresa).
        // Caso esteja fora, complementa o `comentarioAdmin` com um aviso
        // padrão — defesa em profundidade contra clientes desatualizados.
        competenciaSelecionada: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        let comentarioAdmin = input.comentarioAdmin || undefined;

        if (input.aprovado && input.competenciaSelecionada) {
          try {
            const [lanc] = await db
              .select({ dataCompra: lancamentosParceiros.dataCompra, companyId: lancamentosParceiros.companyId })
              .from(lancamentosParceiros)
              .where(eq(lancamentosParceiros.id, input.id));
            if (lanc?.dataCompra) {
              const diaCorte = await getDiaCorteParaEmpresa(db, lanc.companyId);
              const range = computeCycleRangeForCompetencia(input.competenciaSelecionada, diaCorte);
              const dataIso = String(lanc.dataCompra).slice(0, 10);
              if (range && (dataIso < range.cycleStart || dataIso > range.cycleEnd)) {
                const aviso = `Aprovação fora do ciclo: dataCompra ${dataIso} não pertence ao ciclo ${input.competenciaSelecionada} (${range.cycleStart}..${range.cycleEnd}, dia de corte ${diaCorte}).`;
                comentarioAdmin = comentarioAdmin && comentarioAdmin.includes("fora do ciclo")
                  ? comentarioAdmin
                  : (comentarioAdmin ? `${aviso} ${comentarioAdmin}` : aviso);
              }
            }
          } catch (e) {
            console.warn("[parceiros.lancamentos.aprovar] falha ao validar ciclo; prosseguindo sem aviso", e);
          }
        }

        const updateData: any = {
          status: input.aprovado ? "aprovado" : "rejeitado",
          aprovadoPor: ctx.user?.name || "Sistema",
          aprovadoEm: new Date().toISOString(),
        };
        if (!input.aprovado && input.motivoRejeicao) updateData.motivoRejeicao = input.motivoRejeicao;
        if (comentarioAdmin) updateData.comentarioAdmin = comentarioAdmin;
        // Persiste a competência escolhida pelo RH para que a query da Folha
        // (AND lp.competencia_desconto = mesReferencia) encontre o registro.
        if (input.aprovado && input.competenciaSelecionada) {
          updateData.competenciaDesconto = input.competenciaSelecionada;
        }
        await db.update(lancamentosParceiros).set(updateData).where(eq(lancamentosParceiros.id, input.id));
        return { success: true };
      }),

    cancelarAprovacao: protectedProcedure
      .input(z.object({ id: z.number(), comentario: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        await db.update(lancamentosParceiros).set({
          status: "pendente",
          aprovadoPor: null,
          aprovadoEm: null,
          motivoRejeicao: null,
          comentarioAdmin: input.comentario || null,
        }).where(eq(lancamentosParceiros.id, input.id));
        return { success: true };
      }),

    editarLancamento: protectedProcedure
      .input(z.object({
        id: z.number(),
        employeeId: z.number().optional(),
        employeeNome: z.string().optional(),
        dataCompra: z.string().optional(),
        descricaoItens: z.string().optional(),
        valor: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        const { id, ...data } = input;
        const updateData: any = {};
        if (data.employeeId) updateData.employeeId = data.employeeId;
        if (data.employeeNome) updateData.employeeNome = data.employeeNome;
        if (data.dataCompra) updateData.dataCompra = data.dataCompra;
        if (data.descricaoItens !== undefined) updateData.descricaoItens = data.descricaoItens;
        if (data.valor) updateData.valor = data.valor;
        await db.update(lancamentosParceiros).set(updateData).where(eq(lancamentosParceiros.id, id));
        return { success: true };
      }),

    excluirLancamento: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        await db.delete(lancamentosParceiros).where(eq(lancamentosParceiros.id, input.id));
        return { success: true };
      }),

    uploadComprovante: protectedProcedure
      .input(z.object({
        lancamentoId: z.number(),
        fileName: z.string(),
        fileBase64: z.string(),
        contentType: z.string(),
      }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        const buf = Buffer.from(input.fileBase64, "base64");
        const key = `parceiros/lancamentos/${input.lancamentoId}/${Date.now()}-${input.fileName}`;
        const { url } = await storagePut(key, buf, input.contentType);
        await db.update(lancamentosParceiros).set({ comprovanteUrl: url }).where(eq(lancamentosParceiros.id, input.lancamentoId));
        return { url };
      }),
  }),

  // ============================================================
  // GUIA DE DESCONTOS
  // ============================================================
  guiaDescontos: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), competencia: z.string() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      // Janela de ponto: dia 16 do mês anterior até dia 15 do mês de competência.
      const [yyStr, mmStr] = String(input.competencia).split("-");
      const yy = Number(yyStr); const mm = Number(mmStr);
      const prevYY = mm === 1 ? yy - 1 : yy;
      const prevMM = mm === 1 ? 12 : mm - 1;
      const cycleStart = `${prevYY}-${String(prevMM).padStart(2, "0")}-16`;
      const cycleEnd   = `${yy}-${String(mm).padStart(2, "0")}-15`;
      const lancamentos = await db.select().from(lancamentosParceiros)
        .where(and(
          companyFilter(lancamentosParceiros.companyId, input),
          eq(lancamentosParceiros.status, "aprovado"),
          or(
            eq(lancamentosParceiros.competenciaDesconto, input.competencia),
            and(
              gte(lancamentosParceiros.dataCompra, cycleStart),
              lte(lancamentosParceiros.dataCompra, cycleEnd),
            )!,
          )!,
        ))
        .orderBy(lancamentosParceiros.employeeNome);

      // Group by employee
      const byEmployee: Record<number, { nome: string; total: number; lancamentos: any[] }> = {};
      for (const l of lancamentos) {
        if (!byEmployee[l.employeeId]) {
          byEmployee[l.employeeId] = { nome: l.employeeNome, total: 0, lancamentos: [] };
        }
        byEmployee[l.employeeId].total += parseFloat(l.valor as string);
        byEmployee[l.employeeId].lancamentos.push(l);
      }
      return {
        competencia: input.competencia,
        totalGeral: lancamentos.reduce((sum: number, l: any) => sum + parseFloat(l.valor), 0),
        porColaborador: Object.entries(byEmployee).map(([empId, data]) => ({
          employeeId: parseInt(empId),
          ...data,
        })),
      };
    }),

  // ============================================================
  // PAGAMENTOS
  // ============================================================
  pagamentos: router({
    list: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), parceiroId: z.number().optional() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const conditions: any[] = [companyFilter(pagamentosParceiros.companyId, input)];
        if (input.parceiroId) conditions.push(eq(pagamentosParceiros.parceiroId, input.parceiroId));
        return db.select().from(pagamentosParceiros).where(and(...conditions)).orderBy(desc(pagamentosParceiros.createdAt));
      }),

    create: protectedProcedure
      .input(z.object({
        parceiroId: z.number(),
        companyId: z.number(),
        competencia: z.string(),
        valorTotal: z.string(),
      }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        const [result] = await db.insert(pagamentosParceiros).values(input as any);
        // Gatilho financeiro — pagamento a parceiro gera despesa imediatamente
        triggerFinancialSync(input.companyId, input.competencia);
        return { id: result[0].id };
      }),

    registrarPagamento: protectedProcedure
      .input(z.object({
        id: z.number(),
        dataPagamento: z.string(),
        comprovanteUrl: z.string().optional(),
        observacoes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        await db.update(pagamentosParceiros).set({
          status: "pago",
          dataPagamento: input.dataPagamento,
          comprovanteUrl: input.comprovanteUrl || null,
          observacoes: input.observacoes || null,
          pagoBy: ctx.user?.name || "Sistema",
        } as any).where(eq(pagamentosParceiros.id, input.id));
        return { success: true };
      }),
  }),

  // ============================================================
  // PAINEL / DASHBOARD
  // ============================================================
  painel: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const parceiros = await db.select().from(parceirosConveniados)
        .where(and(companyFilter(parceirosConveniados.companyId, input), isNull(parceirosConveniados.deletedAt)));

      const now = new Date();
      const yy = now.getFullYear();
      const mm = now.getMonth() + 1;
      const competenciaAtual = `${yy}-${String(mm).padStart(2, "0")}`;

      // Lê dia de corte do ponto da empresa (default 15) para calcular o
      // ciclo da folha do mês corrente. Mesma regra usada em
      // `lancamentos.list` e em Aprovações RH (task #30): janela vai do dia
      // seguinte ao corte do mês anterior até o dia de corte do mês atual.
      const diaCorte = await getDiaCorteParaEmpresa(db, input.companyId);
      const range = computeCycleRangeForCompetencia(competenciaAtual, diaCorte)!;
      const cycleStart = range.cycleStart;
      const cycleEnd = range.cycleEnd;

      // Conta por ciclo (dataCompra entre cycleStart e cycleEnd) — mesma
      // regra usada por `lancamentos.list` e na tela de Aprovações RH.
      // Assim os contadores batem com aquela tela e cobrem lançamentos
      // legados/com `competenciaDesconto` nulo ou divergente.
      const lancamentos = await db.select().from(lancamentosParceiros)
        .where(and(
          companyFilter(lancamentosParceiros.companyId, input),
          gte(lancamentosParceiros.dataCompra, cycleStart),
          lte(lancamentosParceiros.dataCompra, cycleEnd),
        ));

      const pagamentos = await db.select().from(pagamentosParceiros)
        .where(and(companyFilter(pagamentosParceiros.companyId, input), eq(pagamentosParceiros.competencia, competenciaAtual)));

      return {
        parceiros: {
          total: parceiros.length,
          ativos: parceiros.filter((p: any) => p.statusParceiro === "ativo").length,
          porTipo: {
            farmacia: parceiros.filter((p: any) => p.tipoConvenio === "farmacia").length,
            posto: parceiros.filter((p: any) => p.tipoConvenio === "posto_combustivel").length,
            restaurante: parceiros.filter((p: any) => p.tipoConvenio === "restaurante").length,
            mercado: parceiros.filter((p: any) => p.tipoConvenio === "mercado").length,
            outros: parceiros.filter((p: any) => p.tipoConvenio === "outros").length,
          },
        },
        lancamentosMes: {
          total: lancamentos.length,
          pendentes: lancamentos.filter((l: any) => l.status === "pendente").length,
          aprovados: lancamentos.filter((l: any) => l.status === "aprovado").length,
          rejeitados: lancamentos.filter((l: any) => l.status === "rejeitado").length,
          valorTotal: lancamentos.reduce((sum: number, l: any) => sum + parseFloat(l.valor || "0"), 0),
        },
        pagamentosMes: {
          total: pagamentos.length,
          pagos: pagamentos.filter((p: any) => p.status === "pago").length,
          pendentes: pagamentos.filter((p: any) => p.status === "pendente").length,
          valorTotal: pagamentos.reduce((sum: number, p: any) => sum + parseFloat(p.valorTotal || "0"), 0),
        },
      };
    }),
});
