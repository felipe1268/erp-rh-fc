// Rev. 2858 — COLETA DE CAMPO (RH)
// ---------------------------------------------------------------------------
// Link externo por obra (token + QR, SEM login) para um auxiliar de campo
// coletar/atualizar dados dos funcionários alocados pelo celular. Toda resposta
// entra numa FILA DE REVISÃO (status "pendente") e SÓ grava na ficha do
// employee (via updateEmployee, whitelist em server/db.ts) depois que o RH
// aprovar. Também acessível por tela interna no ERP.
//
// LGPD: o link público NÃO devolve dados pessoais já existentes. Só nome, função
// e foto (miniatura) para o auxiliar IDENTIFICAR a pessoa. A coleta é "do zero".
//
// ZERO ALTER/DROP/DELETE. employees JÁ tem todas as colunas-alvo.
import crypto from "crypto";
import { z } from "zod";
import { and, eq, desc, inArray, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc";
import { getDb, updateEmployee, getUserCompanyLinks } from "../db";
import {
  coletaRhSessoes,
  coletaRhRespostas,
  obras,
  obraFuncionarios,
  employees,
} from "../../drizzle/schema";
import { resolveCompanyIds } from "../companyHelper";
import { storagePut } from "../storage";
import {
  resolverGruposColeta,
  serializeGruposColeta,
  camposHabilitados,
  camposFaltantesColeta,
  serializeItensCustom,
  parseItensCustom,
  sanitizeItensCustom,
  CAMPOS_CUSTOM_KEYS,
} from "../../shared/coletaCampos";

/**
 * Guarda de acesso por empresa (anti-IDOR) para os endpoints INTERNOS.
 * Mesma regra do `_assertFinanceiroCompanyAccess`/`_assertCompanyAccess`:
 *  - admin/admin_master liberam (acesso global);
 *  - usuário COM vínculos em `user_companies` enforça membership em TODAS as
 *    empresas solicitadas;
 *  - usuário SEM vínculos (config global por grupo/módulo) libera.
 * Sem isso, `protectedProcedure` só garante autenticação e o cliente poderia
 * forjar companyId/companyIds de outra empresa.
 */
async function assertColetaCompanyAccess(ctxUser: any, companyIds: number[]) {
  if (!ctxUser?.id) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
  if (ctxUser.role === "admin" || ctxUser.role === "admin_master") return;
  const links = await getUserCompanyLinks(ctxUser.id);
  const allowed = (links as any[]).map((l: any) => l.companyId).filter((v: any) => typeof v === "number");
  if (allowed.length === 0) return; // sem vínculos = config global libera
  for (const id of companyIds) {
    if (!allowed.includes(id)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
    }
  }
}

/**
 * Rev. 2868 — guarda de PRIVILÉGIO para editar/excluir um link de coleta.
 * Só admin/admin_master. Operações destrutivas/de reconfiguração de link ficam
 * restritas, independentemente do acesso de empresa (que já é checado à parte).
 */
function assertColetaAdmin(ctxUser: any) {
  if (ctxUser?.role !== "admin" && ctxUser?.role !== "admin_master") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Apenas o administrador pode editar ou excluir links de coleta." });
  }
}

/**
 * Rev. 2872 — guarda de PRIVILÉGIO ESTRITO (só `admin_master`). Editar/excluir
 * uma RESPOSTA da fila é ação exclusiva do Adm Master, espelhando a UI (botões
 * só p/ `isAdminMaster`). NÃO reaproveita `assertColetaAdmin` (que libera `admin`
 * também), pois isso seria desvio de privilégio frente ao requisito.
 */
function assertColetaAdminMaster(ctxUser: any) {
  if (ctxUser?.role !== "admin_master") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Apenas o Administrador Master pode editar ou excluir respostas da fila." });
  }
}

// Campos que o auxiliar de campo pode coletar. Whitelist espelha colunas que
// JÁ existem em employees e que updateEmployee aceita.
const CAMPOS_COLETA = [
  "telefone",
  "celular",
  "contatoEmergencia",
  "telefoneEmergencia",
  "parentescoEmergencia",
  "logradouro",
  "numero",
  "complemento",
  "bairro",
  "cidade",
  "estado",
  "cep",
  "tamanhoCalcado",
  "tamanhoCamisa",
  "tamanhoCalca",
] as const;

const dadosColetaSchema = z.object({
  telefone: z.string().optional(),
  celular: z.string().optional(),
  contatoEmergencia: z.string().optional(),
  telefoneEmergencia: z.string().optional(),
  parentescoEmergencia: z.string().optional(),
  logradouro: z.string().optional(),
  numero: z.string().optional(),
  complemento: z.string().optional(),
  bairro: z.string().optional(),
  cidade: z.string().optional(),
  estado: z.string().optional(),
  cep: z.string().optional(),
  tamanhoCalcado: z.string().optional(),
  tamanhoCamisa: z.string().optional(),
  tamanhoCalca: z.string().optional(),
}).strip();

// Rev. 2887 — itens EXTRAS por link: cada item aponta p/ um campo de employees
// (catálogo em shared/coletaCampos.ts). label é o rótulo que o auxiliar vê.
const itensCustomInputSchema = z
  .array(z.object({ campo: z.string(), label: z.string().optional() }))
  .optional();

// Valores dos campos custom enviados pelo auxiliar (chave = campo de employees).
const dadosCustomSchema = z.record(z.string()).optional();

function gerarToken(): string {
  return crypto.randomBytes(24).toString("hex"); // 48 chars hex
}

function sessaoExpirada(expiraEm: string | null): boolean {
  if (!expiraEm) return false;
  const t = new Date(expiraEm).getTime();
  return isFinite(t) && t < Date.now();
}

export const coletaRhRouter = router({
  // =========================================================================
  // INTERNO (ERP, protegido) — gestão de links + fila de revisão
  // =========================================================================

  // Lista obras ativas da empresa para escolher ao criar um link.
  obrasDisponiveis: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const companyIds = resolveCompanyIds(input);
      await assertColetaCompanyAccess(ctx.user, companyIds);
      const rows = await db
        .select({ id: obras.id, nome: obras.nome, codigo: obras.codigo, cidade: obras.cidade })
        .from(obras)
        .where(and(
          inArray(obras.companyId, companyIds),
          eq(obras.isActive, 1),
          isNull(obras.deletedAt),
          eq(obras.status, "Em_Andamento"),
        ))
        .orderBy(obras.nome);
      return rows;
    }),

  // Cria (ou retorna o já-existente ativo) link de coleta para uma obra.
  criarSessao: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      companyIds: z.array(z.number()).optional(),
      obraId: z.number(),
      titulo: z.string().optional(),
      expiraEm: z.string().optional(),
      // Rev. 2865 — grupos a coletar (foto/epi/contato/emergencia/endereco).
      // Ausente/todos = null (= todos). Ver shared/coletaCampos.ts.
      grupos: z.array(z.string()).optional(),
      // Rev. 2887 — itens EXTRAS por link (campo de employees + label).
      itensCustom: itensCustomInputSchema,
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const companyIds = resolveCompanyIds(input);
      await assertColetaCompanyAccess(ctx.user, companyIds);
      assertColetaAdmin(ctx.user);

      // Confere que a obra pertence à(s) empresa(s) do usuário.
      const [obra] = await db
        .select({ id: obras.id, companyId: obras.companyId, nome: obras.nome })
        .from(obras)
        .where(and(eq(obras.id, input.obraId), inArray(obras.companyId, companyIds)))
        .limit(1);
      if (!obra) throw new Error("Obra não encontrada ou sem acesso.");

      const token = gerarToken();
      const [novo] = await db
        .insert(coletaRhSessoes)
        .values({
          companyId: obra.companyId,
          obraId: obra.id,
          token,
          titulo: input.titulo?.trim() || `Coleta — ${obra.nome}`,
          ativo: 1,
          camposJson: serializeGruposColeta(input.grupos),
          itensCustomJson: serializeItensCustom(input.itensCustom),
          criadoPor: ctx.user?.name ?? null,
          criadoPorId: ctx.user?.id ?? null,
          expiraEm: input.expiraEm || null,
        })
        .returning({ id: coletaRhSessoes.id, token: coletaRhSessoes.token });
      return { id: novo.id, token: novo.token };
    }),

  // Gera links de coleta para TODAS as obras ativas de uma vez. Idempotente:
  // obra que JÁ tem um link ativo (e não expirado) é reaproveitada (não duplica).
  criarSessoesTodas: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      companyIds: z.array(z.number()).optional(),
      expiraEm: z.string().optional(),
      // Rev. 2865 — grupos a coletar aplicados a TODOS os links gerados.
      grupos: z.array(z.string()).optional(),
      // Rev. 2887 — itens EXTRAS aplicados a TODOS os links gerados.
      itensCustom: itensCustomInputSchema,
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const companyIds = resolveCompanyIds(input);
      await assertColetaCompanyAccess(ctx.user, companyIds);
      assertColetaAdmin(ctx.user);
      const camposJson = serializeGruposColeta(input.grupos);
      const itensCustomJson = serializeItensCustom(input.itensCustom);

      // Obras ativas (mesmo filtro canônico de obrasDisponiveis).
      const obrasAtivas = await db
        .select({ id: obras.id, companyId: obras.companyId, nome: obras.nome })
        .from(obras)
        .where(and(
          inArray(obras.companyId, companyIds),
          eq(obras.isActive, 1),
          isNull(obras.deletedAt),
          eq(obras.status, "Em_Andamento"),
        ))
        .orderBy(obras.nome);

      // Links ativos existentes (para não duplicar).
      const ativas = await db
        .select({ id: coletaRhSessoes.id, obraId: coletaRhSessoes.obraId, token: coletaRhSessoes.token, expiraEm: coletaRhSessoes.expiraEm })
        .from(coletaRhSessoes)
        .where(and(
          inArray(coletaRhSessoes.companyId, companyIds),
          eq(coletaRhSessoes.ativo, 1),
          isNull(coletaRhSessoes.deletedAt),
        ));
      const ativaPorObra = new Map<number, { id: number; token: string }>();
      for (const s of ativas) {
        if (!sessaoExpirada(s.expiraEm)) ativaPorObra.set(s.obraId, { id: s.id, token: s.token });
      }

      let criadas = 0;
      let reaproveitadas = 0;
      for (const obra of obrasAtivas) {
        const existente = ativaPorObra.get(obra.id);
        if (existente) {
          // Reaproveita o link ativo, mas alinha os grupos coletados à seleção atual.
          await db
            .update(coletaRhSessoes)
            .set({ camposJson, itensCustomJson })
            .where(eq(coletaRhSessoes.id, existente.id));
          reaproveitadas++;
          continue;
        }
        const token = gerarToken();
        await db
          .insert(coletaRhSessoes)
          .values({
            companyId: obra.companyId,
            obraId: obra.id,
            token,
            titulo: `Coleta — ${obra.nome}`,
            ativo: 1,
            camposJson,
            itensCustomJson,
            criadoPor: ctx.user?.name ?? null,
            criadoPorId: ctx.user?.id ?? null,
            expiraEm: input.expiraEm || null,
          });
        criadas++;
      }
      return { criadas, reaproveitadas, totalObras: obrasAtivas.length };
    }),

  // Lista links da empresa, com contagem de respostas pendentes por link.
  listarSessoes: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const companyIds = resolveCompanyIds(input);
      await assertColetaCompanyAccess(ctx.user, companyIds);
      const sessoes = await db
        .select({
          id: coletaRhSessoes.id,
          obraId: coletaRhSessoes.obraId,
          obraNome: obras.nome,
          token: coletaRhSessoes.token,
          titulo: coletaRhSessoes.titulo,
          ativo: coletaRhSessoes.ativo,
          camposJson: coletaRhSessoes.camposJson,
          itensCustomJson: coletaRhSessoes.itensCustomJson,
          criadoPor: coletaRhSessoes.criadoPor,
          expiraEm: coletaRhSessoes.expiraEm,
          createdAt: coletaRhSessoes.createdAt,
        })
        .from(coletaRhSessoes)
        .leftJoin(obras, eq(coletaRhSessoes.obraId, obras.id))
        .where(and(
          inArray(coletaRhSessoes.companyId, companyIds),
          isNull(coletaRhSessoes.deletedAt),
        ))
        .orderBy(desc(coletaRhSessoes.createdAt));

      // Contagem de pendentes por sessão (ignora respostas soft-deletadas).
      const respostas = await db
        .select({
          sessaoId: coletaRhRespostas.sessaoId,
          employeeId: coletaRhRespostas.employeeId,
          status: coletaRhRespostas.status,
        })
        .from(coletaRhRespostas)
        .where(and(
          inArray(coletaRhRespostas.companyId, companyIds),
          isNull(coletaRhRespostas.deletedAt),
        ));
      const pendPorSessao = new Map<number, number>();
      const totalPorSessao = new Map<number, number>();
      // Rev. 2902 — funcionários DISTINTOS já coletados por sessão (pendente OU
      // aprovada; rejeitada não conta, pois precisa recoletar). Espelha o
      // `jaEnviado` de dadosSessao.
      const coletadosPorSessao = new Map<number, Set<number>>();
      for (const r of respostas) {
        totalPorSessao.set(r.sessaoId, (totalPorSessao.get(r.sessaoId) ?? 0) + 1);
        if (r.status === "pendente") pendPorSessao.set(r.sessaoId, (pendPorSessao.get(r.sessaoId) ?? 0) + 1);
        if (r.status === "pendente" || r.status === "aprovada") {
          if (!coletadosPorSessao.has(r.sessaoId)) coletadosPorSessao.set(r.sessaoId, new Set());
          coletadosPorSessao.get(r.sessaoId)!.add(r.employeeId);
        }
      }

      // Rev. 2902 — total de funcionários ATIVOS alocados por obra (universo a
      // coletar). Conclusão = todos eles já têm resposta pendente/aprovada.
      const obraIds = Array.from(new Set(sessoes.map((s) => s.obraId)));
      const totalAlocadosPorObra = new Map<number, number>();
      // Rev. 2902 — conjunto de funcionários ATIVOS alocados por obra. Serve tanto
      // para o total (universo a coletar) quanto para INTERSECTAR com os coletados:
      // resposta de quem não está mais ativo-alocado NÃO conta p/ a conclusão.
      const alocadosPorObra = new Map<number, Set<number>>();
      if (obraIds.length > 0) {
        const alocs = await db
          .select({ obraId: obraFuncionarios.obraId, employeeId: obraFuncionarios.employeeId })
          .from(obraFuncionarios)
          .innerJoin(employees, eq(obraFuncionarios.employeeId, employees.id))
          .where(and(
            inArray(obraFuncionarios.obraId, obraIds),
            eq(obraFuncionarios.isActive, 1),
            eq(employees.status, "Ativo"),
          ));
        for (const a of alocs) {
          if (!alocadosPorObra.has(a.obraId)) alocadosPorObra.set(a.obraId, new Set());
          alocadosPorObra.get(a.obraId)!.add(a.employeeId);
        }
        for (const [obraId, set] of alocadosPorObra) totalAlocadosPorObra.set(obraId, set.size);
      }

      return sessoes.map((s) => {
        const { camposJson, itensCustomJson, ...rest } = s;
        const totalAlocados = totalAlocadosPorObra.get(s.obraId) ?? 0;
        // Rev. 2902 — coletados = funcionários DISTINTOS com resposta pendente/aprovada
        // QUE TAMBÉM estão no conjunto de ativos-alocados (interseção).
        const alocadosSet = alocadosPorObra.get(s.obraId);
        const coletadosSet = coletadosPorSessao.get(s.id);
        const coletados = (coletadosSet && alocadosSet)
          ? Array.from(coletadosSet).filter((id) => alocadosSet.has(id)).length
          : 0;
        return {
          ...rest,
          grupos: resolverGruposColeta(camposJson),
          itensCustom: parseItensCustom(itensCustomJson),
          expirada: sessaoExpirada(s.expiraEm),
          totalRespostas: totalPorSessao.get(s.id) ?? 0,
          pendentes: pendPorSessao.get(s.id) ?? 0,
          // Rev. 2902 — progresso + conclusão da coleta.
          totalAlocados,
          coletados,
          concluida: totalAlocados > 0 && coletados >= totalAlocados,
        };
      });
    }),

  // Rev. 2913 — funcionários ATIVOS alocados na obra da sessão, marcando quem JÁ
  // foi coletado (resposta pendente/aprovada) e quem AINDA FALTA. Espelha a mesma
  // regra de `listarSessoes` (universo = ativos-alocados; coletado = pendente OU
  // aprovada). Permite ao RH clicar numa obra e ver NOMINALMENTE quem falta.
  listarFaltantesSessao: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), sessaoId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const companyIds = resolveCompanyIds(input);
      await assertColetaCompanyAccess(ctx.user, companyIds);

      // Valida a sessão e o tenant; resolve a obra-alvo.
      const [sessao] = await db
        .select({
          id: coletaRhSessoes.id,
          obraId: coletaRhSessoes.obraId,
          obraNome: obras.nome,
        })
        .from(coletaRhSessoes)
        .leftJoin(obras, eq(coletaRhSessoes.obraId, obras.id))
        .where(and(
          eq(coletaRhSessoes.id, input.sessaoId),
          inArray(coletaRhSessoes.companyId, companyIds),
          isNull(coletaRhSessoes.deletedAt),
        ))
        .limit(1);
      if (!sessao) throw new TRPCError({ code: "NOT_FOUND", message: "Sessão não encontrada." });

      // Funcionários ATIVOS alocados na obra (universo a coletar).
      const alocados = await db
        .select({
          employeeId: obraFuncionarios.employeeId,
          nome: employees.nomeCompleto,
          funcao: employees.funcao,
          funcaoNaObra: obraFuncionarios.funcaoNaObra,
        })
        .from(obraFuncionarios)
        .innerJoin(employees, eq(obraFuncionarios.employeeId, employees.id))
        .where(and(
          eq(obraFuncionarios.obraId, sessao.obraId),
          inArray(obraFuncionarios.companyId, companyIds),
          eq(obraFuncionarios.isActive, 1),
          eq(employees.status, "Ativo"),
        ));

      // Coletados (pendente OU aprovada) nesta sessão.
      const respostas = await db
        .select({
          employeeId: coletaRhRespostas.employeeId,
          status: coletaRhRespostas.status,
        })
        .from(coletaRhRespostas)
        .where(and(
          eq(coletaRhRespostas.sessaoId, input.sessaoId),
          inArray(coletaRhRespostas.companyId, companyIds),
          isNull(coletaRhRespostas.deletedAt),
        ));
      const coletadosSet = new Set<number>();
      for (const r of respostas) {
        if (r.status === "pendente" || r.status === "aprovada") coletadosSet.add(r.employeeId);
      }

      // Dedup por employeeId (um funcionário pode ter +1 vínculo na mesma obra).
      const vistos = new Set<number>();
      const funcionarios: Array<{ employeeId: number; nome: string; funcao: string | null; coletado: boolean }> = [];
      for (const a of alocados) {
        if (vistos.has(a.employeeId)) continue;
        vistos.add(a.employeeId);
        funcionarios.push({
          employeeId: a.employeeId,
          nome: a.nome,
          funcao: a.funcaoNaObra || a.funcao || null,
          coletado: coletadosSet.has(a.employeeId),
        });
      }
      // Faltantes primeiro, depois por nome.
      funcionarios.sort((x, y) => {
        if (x.coletado !== y.coletado) return x.coletado ? 1 : -1;
        return (x.nome || "").localeCompare(y.nome || "", "pt-BR");
      });

      const coletados = funcionarios.filter((f) => f.coletado).length;
      return {
        obraNome: sessao.obraNome ?? null,
        total: funcionarios.length,
        coletados,
        faltantes: funcionarios.length - coletados,
        funcionarios,
      };
    }),

  desativarSessao: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), id: z.number(), ativo: z.number().optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const companyIds = resolveCompanyIds(input);
      await assertColetaCompanyAccess(ctx.user, companyIds);
      assertColetaAdmin(ctx.user);
      await db
        .update(coletaRhSessoes)
        .set({ ativo: input.ativo === 1 ? 1 : 0 })
        .where(and(
          eq(coletaRhSessoes.id, input.id),
          inArray(coletaRhSessoes.companyId, companyIds),
          isNull(coletaRhSessoes.deletedAt),
        ));
      return { ok: true };
    }),

  // Rev. 2868 — EDITAR um link de coleta (Adm Master). Permite trocar o título
  // e/ou os grupos que o auxiliar vai coletar. A obra/token permanecem fixos
  // (não recriam o link nem invalidam o que já foi enviado).
  editarSessao: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      companyIds: z.array(z.number()).optional(),
      id: z.number(),
      titulo: z.string().optional(),
      grupos: z.array(z.string()).optional(),
      itensCustom: itensCustomInputSchema,
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const companyIds = resolveCompanyIds(input);
      await assertColetaCompanyAccess(ctx.user, companyIds);
      assertColetaAdmin(ctx.user);

      const [sessao] = await db
        .select({ id: coletaRhSessoes.id })
        .from(coletaRhSessoes)
        .where(and(
          eq(coletaRhSessoes.id, input.id),
          inArray(coletaRhSessoes.companyId, companyIds),
          isNull(coletaRhSessoes.deletedAt),
        ))
        .limit(1);
      if (!sessao) throw new TRPCError({ code: "NOT_FOUND", message: "Link não encontrado ou sem acesso." });

      const patch: Record<string, any> = {};
      if (input.titulo !== undefined) {
        const t = input.titulo.trim();
        if (t) patch.titulo = t;
      }
      if (input.grupos !== undefined) {
        patch.camposJson = serializeGruposColeta(input.grupos);
      }
      if (input.itensCustom !== undefined) {
        patch.itensCustomJson = serializeItensCustom(input.itensCustom);
      }
      if (Object.keys(patch).length === 0) return { ok: true };

      await db
        .update(coletaRhSessoes)
        .set(patch)
        .where(and(eq(coletaRhSessoes.id, input.id), inArray(coletaRhSessoes.companyId, companyIds)));
      return { ok: true };
    }),

  // Rev. 2868 — EXCLUIR um link de coleta (Adm Master). SOFT-DELETE: marca
  // deleted_at (NUNCA DELETE físico — R-001/R-007/R-010). Some das listagens e
  // invalida o link público; respostas já enviadas permanecem na base.
  excluirSessao: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      companyIds: z.array(z.number()).optional(),
      id: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const companyIds = resolveCompanyIds(input);
      await assertColetaCompanyAccess(ctx.user, companyIds);
      assertColetaAdmin(ctx.user);

      const [sessao] = await db
        .select({ id: coletaRhSessoes.id })
        .from(coletaRhSessoes)
        .where(and(
          eq(coletaRhSessoes.id, input.id),
          inArray(coletaRhSessoes.companyId, companyIds),
          isNull(coletaRhSessoes.deletedAt),
        ))
        .limit(1);
      if (!sessao) throw new TRPCError({ code: "NOT_FOUND", message: "Link não encontrado ou sem acesso." });

      await db
        .update(coletaRhSessoes)
        .set({ ativo: 0, deletedAt: new Date().toISOString() })
        .where(and(eq(coletaRhSessoes.id, input.id), inArray(coletaRhSessoes.companyId, companyIds)));
      return { ok: true };
    }),

  // Fila de revisão: respostas (por status) com nome/função atual do funcionário
  // e os VALORES ATUAIS dos campos coletados (para o RH comparar antes de aprovar).
  listarRespostas: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      companyIds: z.array(z.number()).optional(),
      status: z.enum(["pendente", "aprovada", "rejeitada"]).optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const companyIds = resolveCompanyIds(input);
      await assertColetaCompanyAccess(ctx.user, companyIds);
      const conds = [
        inArray(coletaRhRespostas.companyId, companyIds),
        isNull(coletaRhRespostas.deletedAt),
      ];
      if (input.status) conds.push(eq(coletaRhRespostas.status, input.status));

      const respostas = await db
        .select({
          id: coletaRhRespostas.id,
          sessaoId: coletaRhRespostas.sessaoId,
          obraId: coletaRhRespostas.obraId,
          obraNome: obras.nome,
          employeeId: coletaRhRespostas.employeeId,
          empNome: employees.nomeCompleto,
          empFuncao: employees.funcao,
          empFotoAtual: employees.fotoUrl,
          status: coletaRhRespostas.status,
          dadosJson: coletaRhRespostas.dadosJson,
          fotoUrl: coletaRhRespostas.fotoUrl,
          enviadoPor: coletaRhRespostas.enviadoPor,
          createdAt: coletaRhRespostas.createdAt,
          revisadoPor: coletaRhRespostas.revisadoPor,
          revisadoEm: coletaRhRespostas.revisadoEm,
          motivoRejeicao: coletaRhRespostas.motivoRejeicao,
          // Rev. 2887 — itens custom definidos no link (p/ rótulos na fila).
          sessaoItensCustomJson: coletaRhSessoes.itensCustomJson,
        })
        .from(coletaRhRespostas)
        .leftJoin(employees, eq(coletaRhRespostas.employeeId, employees.id))
        .leftJoin(obras, eq(coletaRhRespostas.obraId, obras.id))
        .leftJoin(coletaRhSessoes, eq(coletaRhRespostas.sessaoId, coletaRhSessoes.id))
        .where(and(...conds))
        .orderBy(desc(coletaRhRespostas.createdAt));

      // Buscar valores ATUAIS dos campos coletados, por funcionário, para o diff.
      // Rev. 2887 — inclui os campos do catálogo custom (qualquer item extra).
      const empIds = Array.from(new Set(respostas.map((r) => r.employeeId)));
      const atuaisMap = new Map<number, Record<string, any>>();
      if (empIds.length > 0) {
        const atuais = await db
          .select()
          .from(employees)
          .where(inArray(employees.id, empIds));
        for (const e of atuais) {
          const rec: Record<string, any> = {};
          for (const c of CAMPOS_COLETA) rec[c] = (e as any)[c] ?? null;
          for (const c of CAMPOS_CUSTOM_KEYS) rec[c] = (e as any)[c] ?? null;
          atuaisMap.set(e.id, rec);
        }
      }

      return respostas.map((r) => {
        const { sessaoItensCustomJson, ...rest } = r;
        let dados: Record<string, any> = {};
        try { dados = JSON.parse(r.dadosJson || "{}"); } catch { dados = {}; }
        return {
          ...rest,
          dados,
          atual: atuaisMap.get(r.employeeId) ?? {},
          itensCustom: parseItensCustom(sessaoItensCustomJson),
        };
      });
    }),

  // Aprova a resposta: grava os campos coletados na ficha do employee.
  aprovarResposta: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      companyIds: z.array(z.number()).optional(),
      id: z.number(),
      // RH pode desmarcar campos antes de gravar (default: grava todos enviados).
      camposAceitos: z.array(z.string()).optional(),
      aplicarFoto: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const companyIds = resolveCompanyIds(input);
      await assertColetaCompanyAccess(ctx.user, companyIds);

      const [resp] = await db
        .select()
        .from(coletaRhRespostas)
        .where(and(eq(coletaRhRespostas.id, input.id), inArray(coletaRhRespostas.companyId, companyIds)))
        .limit(1);
      if (!resp) throw new Error("Resposta não encontrada ou sem acesso.");
      if (resp.status !== "pendente") throw new Error("Esta resposta já foi revisada.");

      let dados: Record<string, any> = {};
      try { dados = JSON.parse(resp.dadosJson || "{}"); } catch { dados = {}; }

      // Monta o payload só com campos whitelisted e não-vazios.
      const aceitos = input.camposAceitos;
      const payload: Record<string, any> = {};
      // Rev. 2887 — grava campos dos 5 grupos + itens EXTRAS (catálogo custom).
      for (const c of [...CAMPOS_COLETA, ...CAMPOS_CUSTOM_KEYS]) {
        if (aceitos && !aceitos.includes(c)) continue;
        const v = dados[c];
        if (v === undefined || v === null) continue;
        if (typeof v === "string" && v.trim() === "") continue;
        payload[c] = v;
      }
      // Foto coletada → fotoUrl (default: aplica se houver).
      if (resp.fotoUrl && input.aplicarFoto !== false) {
        payload.fotoUrl = resp.fotoUrl;
      }

      if (Object.keys(payload).length > 0) {
        await updateEmployee(resp.employeeId, resp.companyId, payload, {
          name: ctx.user?.name ?? undefined,
          id: ctx.user?.id ?? undefined,
        });
      }

      await db
        .update(coletaRhRespostas)
        .set({
          status: "aprovada",
          revisadoPor: ctx.user?.name ?? null,
          revisadoPorId: ctx.user?.id ?? null,
          revisadoEm: new Date().toISOString(),
        })
        .where(eq(coletaRhRespostas.id, resp.id));

      return { ok: true, camposGravados: Object.keys(payload) };
    }),

  // Rev. 2871 — Aprova VÁRIAS respostas pendentes de uma vez (seleção múltipla).
  // Aplica o comportamento padrão: grava TODOS os campos enviados não-vazios +
  // a foto coletada (quando houver). Idempotente por item (pula já revisadas).
  aprovarVarias: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      companyIds: z.array(z.number()).optional(),
      ids: z.array(z.number()).min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const companyIds = resolveCompanyIds(input);
      await assertColetaCompanyAccess(ctx.user, companyIds);

      const respostas = await db
        .select()
        .from(coletaRhRespostas)
        .where(and(
          inArray(coletaRhRespostas.id, input.ids),
          inArray(coletaRhRespostas.companyId, companyIds),
        ));

      let aprovadas = 0;
      let ignoradas = 0;
      for (const resp of respostas) {
        if (resp.status !== "pendente") { ignoradas++; continue; }

        let dados: Record<string, any> = {};
        try { dados = JSON.parse(resp.dadosJson || "{}"); } catch { dados = {}; }

        const payload: Record<string, any> = {};
        // Rev. 2887 — grava campos dos 5 grupos + itens EXTRAS (catálogo custom).
        for (const c of [...CAMPOS_COLETA, ...CAMPOS_CUSTOM_KEYS]) {
          const v = dados[c];
          if (v === undefined || v === null) continue;
          if (typeof v === "string" && v.trim() === "") continue;
          payload[c] = v;
        }
        if (resp.fotoUrl) payload.fotoUrl = resp.fotoUrl;

        if (Object.keys(payload).length > 0) {
          await updateEmployee(resp.employeeId, resp.companyId, payload, {
            name: ctx.user?.name ?? undefined,
            id: ctx.user?.id ?? undefined,
          });
        }

        await db
          .update(coletaRhRespostas)
          .set({
            status: "aprovada",
            revisadoPor: ctx.user?.name ?? null,
            revisadoPorId: ctx.user?.id ?? null,
            revisadoEm: new Date().toISOString(),
          })
          .where(eq(coletaRhRespostas.id, resp.id));
        aprovadas++;
      }

      return { ok: true, aprovadas, ignoradas };
    }),

  // Rev. 2906 — Adm Master CANCELA a aprovação de VÁRIAS respostas de uma vez:
  // volta o status de "aprovada" → "pendente" (a resposta retorna à fila de
  // revisão para nova conferência). NÃO desfaz os dados já gravados na ficha do
  // funcionário — operação não-destrutiva (só UPDATE de status). Idempotente por
  // item (pula respostas que não estão "aprovada").
  cancelarAprovacaoVarias: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      companyIds: z.array(z.number()).optional(),
      ids: z.array(z.number()).min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      assertColetaAdminMaster(ctx.user);
      const db = (await getDb())!;
      const companyIds = resolveCompanyIds(input);
      await assertColetaCompanyAccess(ctx.user, companyIds);

      const respostas = await db
        .select({ id: coletaRhRespostas.id, status: coletaRhRespostas.status })
        .from(coletaRhRespostas)
        .where(and(
          inArray(coletaRhRespostas.id, input.ids),
          inArray(coletaRhRespostas.companyId, companyIds),
        ));

      let canceladas = 0;
      for (const resp of respostas) {
        if (resp.status !== "aprovada") continue;
        await db
          .update(coletaRhRespostas)
          .set({
            status: "pendente",
            revisadoPor: null,
            revisadoPorId: null,
            revisadoEm: null,
            motivoRejeicao: null,
          })
          .where(eq(coletaRhRespostas.id, resp.id));
        canceladas++;
      }
      // `ignoradas` cobre TUDO que foi pedido mas não cancelado: status ≠ aprovada,
      // IDs inexistentes ou fora da empresa (deduplica os ids de entrada).
      const ignoradas = new Set(input.ids).size - canceladas;
      return { ok: true, canceladas, ignoradas };
    }),

  rejeitarResposta: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      companyIds: z.array(z.number()).optional(),
      id: z.number(),
      motivo: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const companyIds = resolveCompanyIds(input);
      await assertColetaCompanyAccess(ctx.user, companyIds);
      const [resp] = await db
        .select({ id: coletaRhRespostas.id, status: coletaRhRespostas.status })
        .from(coletaRhRespostas)
        .where(and(eq(coletaRhRespostas.id, input.id), inArray(coletaRhRespostas.companyId, companyIds)))
        .limit(1);
      if (!resp) throw new Error("Resposta não encontrada ou sem acesso.");
      if (resp.status !== "pendente") throw new Error("Esta resposta já foi revisada.");

      await db
        .update(coletaRhRespostas)
        .set({
          status: "rejeitada",
          motivoRejeicao: input.motivo?.trim() || null,
          revisadoPor: ctx.user?.name ?? null,
          revisadoPorId: ctx.user?.id ?? null,
          revisadoEm: new Date().toISOString(),
        })
        .where(eq(coletaRhRespostas.id, resp.id));
      return { ok: true };
    }),

  // Rev. 2872 — Adm edita os DADOS COLETADOS de uma resposta (corrigir o que o
  // auxiliar digitou). NÃO toca na ficha do employee nem no status; só corrige o
  // registro coletado. Funciona em qualquer status (pendente/aprovada/rejeitada).
  editarResposta: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      companyIds: z.array(z.number()).optional(),
      id: z.number(),
      dados: dadosColetaSchema,
      // Rev. 2887 — correção dos itens EXTRAS (chave = campo de employees).
      dadosCustom: dadosCustomSchema,
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const companyIds = resolveCompanyIds(input);
      await assertColetaCompanyAccess(ctx.user, companyIds);
      assertColetaAdminMaster(ctx.user);

      const [resp] = await db
        .select()
        .from(coletaRhRespostas)
        .where(and(
          eq(coletaRhRespostas.id, input.id),
          inArray(coletaRhRespostas.companyId, companyIds),
          isNull(coletaRhRespostas.deletedAt),
        ))
        .limit(1);
      if (!resp) throw new Error("Resposta não encontrada ou sem acesso.");

      // Mescla: preserva chaves fora da whitelist (ex.: marcadores) e sobrescreve
      // os campos editados com texto limpo (vazio = remove o campo coletado).
      let dados: Record<string, any> = {};
      try { dados = JSON.parse(resp.dadosJson || "{}"); } catch { dados = {}; }
      for (const c of CAMPOS_COLETA) {
        const v = (input.dados as Record<string, any>)[c];
        if (v === undefined) continue;
        const t = typeof v === "string" ? v.trim() : v;
        if (t === "" || t === null) delete dados[c];
        else dados[c] = t;
      }
      // Rev. 2887 — mesma lógica para os itens EXTRAS (só campos do catálogo).
      if (input.dadosCustom) {
        for (const c of CAMPOS_CUSTOM_KEYS) {
          const v = (input.dadosCustom as Record<string, any>)[c];
          if (v === undefined) continue;
          const t = typeof v === "string" ? v.trim() : v;
          if (t === "" || t === null) delete dados[c];
          else dados[c] = t;
        }
      }

      await db
        .update(coletaRhRespostas)
        .set({ dadosJson: JSON.stringify(dados) })
        .where(eq(coletaRhRespostas.id, resp.id));
      return { ok: true };
    }),

  // Rev. 2872 — Adm exclui uma resposta da fila (SOFT-DELETE: deleted_at).
  // R-001/R-007/R-010: jamais DELETE físico. Some de listarRespostas.
  excluirResposta: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      companyIds: z.array(z.number()).optional(),
      id: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const companyIds = resolveCompanyIds(input);
      await assertColetaCompanyAccess(ctx.user, companyIds);
      assertColetaAdminMaster(ctx.user);

      const [resp] = await db
        .select({ id: coletaRhRespostas.id })
        .from(coletaRhRespostas)
        .where(and(
          eq(coletaRhRespostas.id, input.id),
          inArray(coletaRhRespostas.companyId, companyIds),
          isNull(coletaRhRespostas.deletedAt),
        ))
        .limit(1);
      if (!resp) throw new Error("Resposta não encontrada ou sem acesso.");

      await db
        .update(coletaRhRespostas)
        .set({ deletedAt: new Date().toISOString() })
        .where(eq(coletaRhRespostas.id, resp.id));
      return { ok: true };
    }),

  // =========================================================================
  // PÚBLICO (link externo por token, SEM login)
  // =========================================================================

  // Dados mínimos da sessão + lista de funcionários alocados (LGPD: só
  // nome/função/foto p/ identificar; nada de telefone/endereço pré-preenchido).
  dadosSessao: publicProcedure
    .input(z.object({ token: z.string().min(8) }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const [sessao] = await db
        .select()
        .from(coletaRhSessoes)
        .where(eq(coletaRhSessoes.token, input.token))
        .limit(1);
      if (!sessao || sessao.ativo !== 1 || sessao.deletedAt || sessaoExpirada(sessao.expiraEm)) {
        return { valido: false as const };
      }

      const [obra] = await db
        .select({ id: obras.id, nome: obras.nome, cidade: obras.cidade, codigo: obras.codigo })
        .from(obras)
        .where(eq(obras.id, sessao.obraId))
        .limit(1);

      // Funcionários ATIVOS alocados na obra.
      const alocados = await db
        .select({
          id: employees.id,
          nome: employees.nomeCompleto,
          funcao: employees.funcao,
          foto: employees.fotoUrl,
        })
        .from(obraFuncionarios)
        .innerJoin(employees, eq(obraFuncionarios.employeeId, employees.id))
        .where(and(
          eq(obraFuncionarios.obraId, sessao.obraId),
          eq(obraFuncionarios.isActive, 1),
          eq(employees.status, "Ativo"),
        ))
        .orderBy(employees.nomeCompleto);

      // Marca quem já foi enviado nesta sessão (pendente ou aprovada).
      const respostas = await db
        .select({ employeeId: coletaRhRespostas.employeeId, status: coletaRhRespostas.status })
        .from(coletaRhRespostas)
        .where(and(
          eq(coletaRhRespostas.sessaoId, sessao.id),
          isNull(coletaRhRespostas.deletedAt),
        ));
      const statusPorEmp = new Map<number, string>();
      for (const r of respostas) {
        // pendente/aprovada têm prioridade sobre rejeitada
        const prev = statusPorEmp.get(r.employeeId);
        if (!prev || prev === "rejeitada") statusPorEmp.set(r.employeeId, r.status);
      }

      return {
        valido: true as const,
        titulo: sessao.titulo,
        grupos: resolverGruposColeta(sessao.camposJson),
        itensCustom: parseItensCustom(sessao.itensCustomJson),
        obra: obra ? { nome: obra.nome, cidade: obra.cidade, codigo: obra.codigo } : null,
        funcionarios: alocados.map((a) => ({
          id: a.id,
          nome: a.nome,
          funcao: a.funcao || null,
          foto: a.foto || null,
          jaEnviado: statusPorEmp.get(a.id) ?? null,
        })),
      };
    }),

  // Envia uma resposta de coleta (entra na fila de revisão como "pendente").
  enviarResposta: publicProcedure
    .input(z.object({
      token: z.string().min(8),
      employeeId: z.number(),
      enviadoPor: z.string().optional(),
      dados: dadosColetaSchema,
      // Rev. 2887 — valores dos itens EXTRAS (chave = campo de employees).
      dadosCustom: dadosCustomSchema,
      fotoBase64: z.string().optional(),
      fotoContentType: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const [sessao] = await db
        .select()
        .from(coletaRhSessoes)
        .where(eq(coletaRhSessoes.token, input.token))
        .limit(1);
      if (!sessao || sessao.ativo !== 1 || sessao.deletedAt || sessaoExpirada(sessao.expiraEm)) {
        throw new Error("Link de coleta inválido ou expirado.");
      }

      // Confere que o funcionário está realmente alocado na obra da sessão E ainda
      // ATIVO (Rev. 2902 — alinha o write com a lista pública de `dadosSessao`, que
      // só mostra `employees.status='Ativo'`; impede registrar resposta de desligado).
      const [aloc] = await db
        .select({ id: obraFuncionarios.id })
        .from(obraFuncionarios)
        .innerJoin(employees, eq(obraFuncionarios.employeeId, employees.id))
        .where(and(
          eq(obraFuncionarios.obraId, sessao.obraId),
          eq(obraFuncionarios.employeeId, input.employeeId),
          eq(obraFuncionarios.isActive, 1),
          eq(employees.status, "Ativo"),
        ))
        .limit(1);
      if (!aloc) throw new Error("Funcionário não está alocado nesta obra.");

      // Rev. 2865 — só aceita campos dos GRUPOS habilitados nesta sessão.
      const grupos = resolverGruposColeta(sessao.camposJson);
      const permitidos = camposHabilitados(grupos);
      const fotoPermitida = grupos.includes("foto");

      // Sanitiza os dados (só whitelist + grupo habilitado, sem strings vazias).
      const dados: Record<string, any> = {};
      for (const c of CAMPOS_COLETA) {
        if (!permitidos.has(c)) continue;
        const v = (input.dados as any)[c];
        if (typeof v === "string" && v.trim() !== "") dados[c] = v.trim();
      }

      // Rev. 2887 — itens EXTRAS: só aceita campos definidos NESTA sessão (e do
      // catálogo). Chave = campo de employees, gravado direto em dados_json.
      const itensCustom = parseItensCustom(sessao.itensCustomJson);
      const camposCustomPermitidos = new Set(itensCustom.map((it) => it.campo));
      if (input.dadosCustom) {
        for (const c of Object.keys(input.dadosCustom)) {
          if (!camposCustomPermitidos.has(c)) continue;
          const v = (input.dadosCustom as any)[c];
          if (typeof v === "string" && v.trim() !== "") dados[c] = v.trim();
        }
      }

      // Upload da foto (se houver E o grupo "foto" estiver habilitado).
      let fotoUrl: string | null = null;
      if (input.fotoBase64 && fotoPermitida) {
        try {
          const b64 = input.fotoBase64.replace(/^data:[^;]+;base64,/, "");
          const buf = Buffer.from(b64, "base64");
          if (buf.length > 0 && buf.length <= 8 * 1024 * 1024) {
            const key = `coleta-rh/${sessao.id}/${input.employeeId}-${Date.now()}.jpg`;
            const up = await storagePut(key, buf, input.fotoContentType || "image/jpeg");
            fotoUrl = up.url;
          }
        } catch (e: any) {
          console.error("[coletaRh.enviarResposta] falha upload foto:", e?.message || e);
        }
      }

      // Rev. 2903 — só aceita a coleta quando TODOS os dados solicitados estão
      // preenchidos (mesma regra do botão "Enviar" do front; fonte única em
      // shared/coletaCampos.ts). `dados` já tem os campos fixos + custom mesclados.
      const faltando = camposFaltantesColeta({
        grupos,
        itensCustom,
        dados,
        temFoto: !!fotoUrl,
      });
      if (faltando.length > 0) {
        throw new Error("Preencha TODOS os dados solicitados antes de enviar.");
      }

      await db.insert(coletaRhRespostas).values({
        companyId: sessao.companyId,
        sessaoId: sessao.id,
        obraId: sessao.obraId,
        employeeId: input.employeeId,
        status: "pendente",
        dadosJson: JSON.stringify(dados),
        fotoUrl,
        enviadoPor: input.enviadoPor?.trim() || null,
      });

      // Rev. 2902 — FECHA a coleta automaticamente quando TODOS os funcionários
      // ATIVOS alocados na obra já têm resposta (pendente/aprovada). Best-effort:
      // qualquer falha de contagem NÃO bloqueia o envio que acabou de gravar.
      try {
        const alocados = await db
          .select({ employeeId: obraFuncionarios.employeeId })
          .from(obraFuncionarios)
          .innerJoin(employees, eq(obraFuncionarios.employeeId, employees.id))
          .where(and(
            eq(obraFuncionarios.obraId, sessao.obraId),
            eq(obraFuncionarios.isActive, 1),
            eq(employees.status, "Ativo"),
          ));
        const alocadosSet = new Set(alocados.map((a) => a.employeeId));
        const totalAlocados = alocadosSet.size;
        if (totalAlocados > 0) {
          const respColetadas = await db
            .select({ employeeId: coletaRhRespostas.employeeId })
            .from(coletaRhRespostas)
            .where(and(
              eq(coletaRhRespostas.sessaoId, sessao.id),
              isNull(coletaRhRespostas.deletedAt),
              inArray(coletaRhRespostas.status, ["pendente", "aprovada"]),
            ));
          // Rev. 2902 — só conta coletados que AINDA são ativos-alocados (interseção);
          // resposta de quem saiu da obra/foi desligado não fecha o link sozinho.
          const coletadosSet = new Set<number>();
          for (const r of respColetadas) {
            if (alocadosSet.has(r.employeeId)) coletadosSet.add(r.employeeId);
          }
          const coletados = coletadosSet.size;
          if (coletados >= totalAlocados) {
            await db
              .update(coletaRhSessoes)
              .set({ ativo: 0 })
              .where(eq(coletaRhSessoes.id, sessao.id));
          }
        }
      } catch (e: any) {
        console.error("[coletaRh.enviarResposta] auto-conclusão falhou:", e?.message || e);
      }

      return { ok: true };
    }),
});
