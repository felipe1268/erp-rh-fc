import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb, getCompaniesForUser, getUserCompanyLinks } from "../db";

/**
 * Garante que o usuário autenticado tem acesso à companyId/companyIds.
 *
 * Rev. 1702 — Reescrito para liberar usuários NÃO-admin (compras, RH,
 * financeiro, planejamento etc.) que estão em grupos com módulo Terceiros
 * habilitado mas sem vínculo explícito em `user_companies`. Antes, o helper
 * `getCompaniesForUser` aplicava um fallback "LIMIT 1" que retornava UMA
 * empresa aleatória — quase sempre diferente da que o usuário tinha
 * selecionado no seletor — e o create estourava "Sem acesso a esta empresa".
 *
 * Nova regra:
 *  - admin / admin_master → libera (mantém Rev. 1696/1697).
 *  - Usuário com vínculos em `user_companies` → enforça membership real.
 *  - Usuário SEM nenhum vínculo (configuração global, controlada por
 *    grupo/módulo) → libera. Permissão por MÓDULO já é checada na UI/menu;
 *    o acesso por empresa só faz sentido quando há restrição explícita.
 */
async function _assertCompanyAccess(ctxUser: any, input: { companyId: number; companyIds?: number[] }) {
  if (!ctxUser?.id) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });

  // Bypass para roles globais (paridade com getCompaniesForUser L197).
  if (ctxUser.role === "admin" || ctxUser.role === "admin_master") return;

  // Lê vínculos REAIS (sem o fallback LIMIT 1 do getCompaniesForUser).
  const links = await getUserCompanyLinks(ctxUser.id);
  const allowedIds = (links as any[]).map((l: any) => l.companyId).filter((v: any) => typeof v === "number");

  // Sem vínculos explícitos → considera acesso global (controlado por grupo/módulo).
  if (allowedIds.length === 0) return;

  const allowedSet = new Set<number>(allowedIds);
  if (!allowedSet.has(input.companyId)) {
    console.error("[terceiros._assertCompanyAccess] BLOQUEADO", {
      userId: ctxUser.id,
      role: ctxUser.role,
      inputCompanyId: input.companyId,
      inputCompanyIds: input.companyIds,
      allowedIds,
    });
    throw new TRPCError({ code: "FORBIDDEN", message: `Sem acesso a esta empresa. (user=${ctxUser.id} role=${ctxUser.role} req=${input.companyId} allowed=[${allowedIds.join(",")}])` });
  }
  if (input.companyIds && input.companyIds.length > 0) {
    for (const cid of input.companyIds) {
      if (!allowedSet.has(cid)) throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a uma das empresas do grupo." });
    }
  }
}
import {
  empresasTerceiras,
  funcionariosTerceiros,
  ddsParticipacoesTerceiros,
  obrigacoesMensaisTerceiros,
  alertasTerceiros,
  obras,
  warningsTerceiros,
  fornecedores,
  terceiroContratos,
  terceiroMedicoes,
  comprasOrdens,
} from "../../drizzle/schema";
import { eq, and, or, desc, sql, isNull, like, gte, lte, inArray } from "drizzle-orm";
import { resolveCompanyIds, companyFilter } from "../companyHelper";
import { upperCaseEmpresa } from "../../shared/normalizeNomeEmpresa";
import { storagePut } from "../storage";
import { invokeLLM } from "../_core/llm";

export const terceirosRouter = router({
  // ============================================================
  // EMPRESAS TERCEIRAS
  // ============================================================
  empresas: router({
    list: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        return db.select().from(empresasTerceiras)
          .where(and(companyFilter(empresasTerceiras.companyId, input), isNull(empresasTerceiras.deletedAt)))
          .orderBy(empresasTerceiras.razaoSocial);
      }),

    // Lista UNIFICADA: empresas_terceiras + fornecedores marcados como prestadores
    // de serviço (que ainda não têm registro em empresas_terceiras). Usado em
    // Advertências/Notificações para permitir notificar qualquer prestador
    // cadastrado no catálogo Compras.
    listPrestadores: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const terceiras = await db.select().from(empresasTerceiras)
          .where(and(companyFilter(empresasTerceiras.companyId, input), isNull(empresasTerceiras.deletedAt)))
          .orderBy(empresasTerceiras.razaoSocial);

        const prestadores = await db.select().from(fornecedores)
          .where(and(
            companyFilter(fornecedores.companyId, input),
            eq(fornecedores.isPrestadorServico, true),
            eq(fornecedores.ativo, true),
          ))
          .orderBy(fornecedores.razaoSocial);

        const norm = (s?: string | null) => (s || "").replace(/\D/g, "");
        const cnpjsTerceiras = new Set(terceiras.map((t: any) => norm(t.cnpj)).filter(Boolean));
        const idsTerceirasPorFornecedor = new Set(
          terceiras.map((t: any) => t.fornecedorId).filter((v: any) => v != null)
        );

        const out: Array<{
          source: "terceira" | "fornecedor";
          id: number | null;            // empresaTerceiraId (null se source=fornecedor sem terceira)
          fornecedorId: number | null;  // fornecedorId (se houver)
          razaoSocial: string;
          cnpj: string | null;
          nomeFantasia: string | null;
        }> = terceiras.map((t: any) => ({
          source: "terceira" as const,
          id: t.id,
          fornecedorId: t.fornecedorId ?? null,
          razaoSocial: t.razaoSocial,
          cnpj: t.cnpj ?? null,
          nomeFantasia: t.nomeFantasia ?? null,
        }));

        for (const f of prestadores as any[]) {
          if (idsTerceirasPorFornecedor.has(f.id)) continue;
          if (f.cnpj && cnpjsTerceiras.has(norm(f.cnpj))) continue;
          out.push({
            source: "fornecedor",
            id: null,
            fornecedorId: f.id,
            razaoSocial: f.razaoSocial,
            cnpj: f.cnpj ?? null,
            nomeFantasia: f.nomeFantasia ?? null,
          });
        }

        out.sort((a, b) => a.razaoSocial.localeCompare(b.razaoSocial, "pt-BR"));
        return out;
      }),

    // Verifica se já existe cadastro com o mesmo CNPJ/CPF (em fornecedores ou
    // empresas_terceiras) no tenant. Usado pelos formulários de Compras e
    // Terceiros para impedir duplicidade e oferecer replicação cross-módulo.
    verificarCadastroDuplicado: protectedProcedure
      .input(z.object({
        companyId: z.number(),
        companyIds: z.array(z.number()).optional(),
        cnpj: z.string().optional(),
        cpf: z.string().optional(),
        excludeFornecedorId: z.number().optional(),
        excludeEmpresaTerceiraId: z.number().optional(),
      }))
      .query(async ({ input, ctx }) => {
        await _assertCompanyAccess(ctx.user, input);
        const norm = (s?: string | null) => (s || "").replace(/\D/g, "");
        const target = norm(input.cnpj || input.cpf);
        if (!target || (target.length !== 11 && target.length !== 14)) {
          return { found: false as const };
        }
        const db = (await getDb())!;
        const forns = await db.select().from(fornecedores).where(
          companyFilter(fornecedores.companyId, input)
        );
        const fornecedorMatch = (forns as any[]).find(f =>
          norm(f.cnpj) === target && f.id !== input.excludeFornecedorId
        );
        const ters = await db.select().from(empresasTerceiras).where(and(
          companyFilter(empresasTerceiras.companyId, input),
          isNull(empresasTerceiras.deletedAt),
        ));
        const empresaTerceiraMatch = (ters as any[]).find(t =>
          norm(t.cnpj) === target && t.id !== input.excludeEmpresaTerceiraId
        );
        if (!fornecedorMatch && !empresaTerceiraMatch) return { found: false as const };
        return {
          found: true as const,
          fornecedor: fornecedorMatch || null,
          empresaTerceira: empresaTerceiraMatch || null,
        };
      }),

    // Garante que exista um registro empresas_terceiras para o fornecedorId
    // informado. Se não existir (por fornecedorId nem por CNPJ), cria a partir
    // dos dados do fornecedor. Retorna o id da empresa_terceira.
    ensureFromFornecedor: protectedProcedure
      .input(z.object({
        companyId: z.number(),
        companyIds: z.array(z.number()).optional(),
        fornecedorId: z.number(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;

        // SEGURANÇA: o fornecedor deve pertencer ao tenant atual (ou ao grupo
        // permitido via companyIds). Sem isso, um fornecedorId arbitrário de
        // outro tenant poderia ser materializado como empresa_terceira local.
        const [forn] = await db.select().from(fornecedores).where(and(
          eq(fornecedores.id, input.fornecedorId),
          companyFilter(fornecedores.companyId, input),
        ));
        if (!forn) throw new TRPCError({ code: "NOT_FOUND", message: "Fornecedor não encontrado neste tenant" });
        if (!forn.isPrestadorServico) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Este fornecedor não está marcado como Prestador de Serviço." });
        }
        if (forn.ativo === false) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Fornecedor inativo." });
        }

        const norm = (s?: string | null) => (s || "").replace(/\D/g, "");
        const cnpjN = norm(forn.cnpj);

        // Tenta achar por fornecedorId no tenant
        const [byFornId] = await db.select().from(empresasTerceiras).where(and(
          eq(empresasTerceiras.companyId, input.companyId),
          eq(empresasTerceiras.fornecedorId, input.fornecedorId),
          isNull(empresasTerceiras.deletedAt),
        ));
        if (byFornId) return { id: byFornId.id, created: false };

        // Tenta achar por CNPJ no tenant
        if (cnpjN) {
          const candidatos = await db.select().from(empresasTerceiras).where(and(
            eq(empresasTerceiras.companyId, input.companyId),
            isNull(empresasTerceiras.deletedAt),
          ));
          const match = (candidatos as any[]).find(c => norm(c.cnpj) === cnpjN);
          if (match) {
            // Só faz auto-vínculo se a terceira ainda não estiver atrelada a outro fornecedor.
            // Evita "rebind" silencioso de uma empresa terceira já vinculada.
            if (match.fornecedorId == null) {
              await db.update(empresasTerceiras)
                .set({ fornecedorId: input.fornecedorId } as any)
                .where(eq(empresasTerceiras.id, match.id));
            }
            return { id: match.id, created: false };
          }
        }

        // Mitigação best-effort de race: re-checa por fornecedorId imediatamente
        // antes do INSERT (não há constraint única no banco, mas reduz a janela).
        const [recheck] = await db.select().from(empresasTerceiras).where(and(
          eq(empresasTerceiras.companyId, input.companyId),
          eq(empresasTerceiras.fornecedorId, input.fornecedorId),
          isNull(empresasTerceiras.deletedAt),
        ));
        if (recheck) return { id: recheck.id, created: false };

        // Cria novo registro a partir do fornecedor
        const [created] = await db.insert(empresasTerceiras).values({
          companyId: input.companyId,
          razaoSocial: upperCaseEmpresa(forn.razaoSocial),
          nomeFantasia: forn.nomeFantasia ? upperCaseEmpresa(forn.nomeFantasia) : undefined,
          cnpj: forn.cnpj || "",
          inscricaoEstadual: forn.inscricaoEstadual ?? undefined,
          inscricaoMunicipal: forn.inscricaoMunicipal ?? undefined,
          cep: forn.cep ?? undefined,
          logradouro: forn.endereco ?? undefined,
          numero: forn.numero ?? undefined,
          complemento: forn.complemento ?? undefined,
          bairro: forn.bairro ?? undefined,
          cidade: forn.cidade ?? undefined,
          estado: forn.estado ?? undefined,
          telefone: forn.telefone ?? undefined,
          email: forn.email ?? undefined,
          responsavelNome: forn.contatoNome ?? forn.representanteLegal ?? undefined,
          banco: forn.banco ?? undefined,
          agencia: forn.agencia ?? undefined,
          conta: forn.conta ?? undefined,
          fornecedorId: input.fornecedorId,
          createdBy: ctx.user?.name || "Sistema (auto-vínculo Fornecedor→Terceira)",
        } as any).returning({ id: empresasTerceiras.id });

        return { id: created.id, created: true };
      }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const [row] = await db.select().from(empresasTerceiras).where(eq(empresasTerceiras.id, input.id));
        return row || null;
      }),

    // Rev. 2830 — Raio-X 360° da empresa terceira: agrega contratos (com valores
    // e split MDO/material via FD), funcionários + conformidade de ASO, documentos
    // da empresa (PGR/PCMSO/Alvará/Seguro) e FD de material da obra/fornecedor.
    raioX: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const db = (await getDb())!;
        const [emp] = await db.select().from(empresasTerceiras).where(eq(empresasTerceiras.id, input.id));
        if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Empresa terceira não encontrada." });
        await _assertCompanyAccess(ctx.user, { companyId: (emp as any).companyId });

        const num = (v: any) => parseFloat(String(v ?? 0)) || 0;
        const hoje = new Date();
        const empAny = emp as any;

        // --- Contratos da empresa ---
        const contratos = await db.select().from(terceiroContratos)
          .where(and(
            eq(terceiroContratos.empresaTerceiraId, input.id),
            eq(terceiroContratos.companyId, empAny.companyId),
          ))
          .orderBy(desc(terceiroContratos.id));

        // Obras envolvidas (nomes)
        const obraIds = Array.from(new Set(
          (contratos as any[]).map(c => c.obraId).filter((v: any) => typeof v === "number")
        ));
        let obrasMap: Record<number, string> = {};
        if (obraIds.length > 0) {
          const obrasRows = await db.select({ id: obras.id, nome: obras.nome }).from(obras).where(inArray(obras.id, obraIds));
          obrasMap = Object.fromEntries((obrasRows as any[]).map(o => [o.id, o.nome]));
        }

        // --- FD de material (OCs FD do fornecedor nas obras dos contratos) ---
        // Precedência do vínculo EXPLÍCITO (Rev. 2830): OCs com contrato_id são atribuídas
        // DIRETO ao contrato; OCs sem contrato_id caem no rateio por obra. Isso evita dupla
        // contagem quando vários contratos compartilham o mesmo par obra+fornecedor.
        const fornecedorId = empAny.fornecedorId ?? null;
        const contratoIds = (contratos as any[]).map(c => c.id);
        let fdTotalGeral = 0;
        const fdPorObraUnbound: Record<number, number> = {};
        const fdPorContratoExplicito: Record<number, number> = {};
        if (fornecedorId && obraIds.length > 0) {
          const ocs = await db.select({
            obraId: comprasOrdens.obraId,
            contratoId: comprasOrdens.contratoId,
            total: comprasOrdens.total,
            fdValor: comprasOrdens.fdValor,
            modalidadeFd: comprasOrdens.modalidadeFd,
            status: comprasOrdens.status,
          }).from(comprasOrdens).where(and(
            eq(comprasOrdens.companyId, empAny.companyId),
            eq(comprasOrdens.fornecedorId, fornecedorId),
            inArray(comprasOrdens.obraId, obraIds),
          ));
          for (const oc of ocs as any[]) {
            const isFd = (oc.modalidadeFd && oc.modalidadeFd !== "normal") || num(oc.fdValor) > 0;
            if (!isFd) continue;
            if (oc.status === "cancelada" || oc.status === "rascunho") continue;
            const valor = num(oc.fdValor) > 0 ? num(oc.fdValor) : num(oc.total);
            if (valor <= 0) continue;
            fdTotalGeral += valor;
            if (typeof oc.contratoId === "number" && contratoIds.includes(oc.contratoId)) {
              fdPorContratoExplicito[oc.contratoId] = (fdPorContratoExplicito[oc.contratoId] || 0) + valor;
            } else if (oc.contratoId == null && typeof oc.obraId === "number") {
              fdPorObraUnbound[oc.obraId] = (fdPorObraUnbound[oc.obraId] || 0) + valor;
            }
          }
        }

        // Aloca o FD "unbound" (OCs sem contrato_id) de cada obra a UM ÚNICO contrato
        // p/ evitar dupla contagem quando há 2+ contratos no mesmo par obra+fornecedor.
        // Prioriza contrato que INCLUI material; desempate determinístico pelo menor id.
        const fdUnboundDono: Record<number, number> = {};
        for (const obraIdStr of Object.keys(fdPorObraUnbound)) {
          const obraId = Number(obraIdStr);
          const candidatos = (contratos as any[])
            .filter(c => c.obraId === obraId && !(fdPorContratoExplicito[c.id] > 0))
            .sort((a, b) => {
              const am = (a.naturezaContrato === "material" || a.naturezaContrato === "mao_de_obra_material") ? 0 : 1;
              const bm = (b.naturezaContrato === "material" || b.naturezaContrato === "mao_de_obra_material") ? 0 : 1;
              return am !== bm ? am - bm : a.id - b.id;
            });
          if (candidatos.length > 0) fdUnboundDono[obraId] = candidatos[0].id;
        }

        const contratosEnriquecidos = (contratos as any[]).map(c => {
          const incluiMaterial = c.naturezaContrato === "material" || c.naturezaContrato === "mao_de_obra_material";
          // FD explícito (contrato_id) tem precedência; só recorre ao FD por obra de OCs
          // soltas se não houver vínculo explícito p/ este contrato E ele for o dono do unbound da obra.
          const fdExplicito = fdPorContratoExplicito[c.id] || 0;
          const ehDonoUnbound = c.obraId != null && fdUnboundDono[c.obraId] === c.id;
          const fdObra = fdExplicito > 0 ? fdExplicito : (ehDonoUnbound ? (fdPorObraUnbound[c.obraId] || 0) : 0);
          const valorTotal = num(c.valorTotal);
          const valorLiquidoMdo = incluiMaterial ? Math.max(valorTotal - fdObra, 0) : valorTotal;
          return {
            id: c.id,
            numeroContrato: c.numeroContrato,
            descricao: c.descricao,
            naturezaContrato: c.naturezaContrato || "mao_de_obra",
            status: c.status,
            obraId: c.obraId,
            obraNome: c.obraId != null ? (obrasMap[c.obraId] || null) : null,
            valorTotal,
            valorPago: num(c.valorPago),
            dataInicio: c.dataInicio,
            fdMaterialObra: incluiMaterial ? fdObra : 0,
            valorLiquidoMdo,
          };
        });

        const totalContratado = contratosEnriquecidos.reduce((s, c) => s + c.valorTotal, 0);
        const totalPago = contratosEnriquecidos.reduce((s, c) => s + c.valorPago, 0);
        const contratosAtivos = contratosEnriquecidos.filter(c => c.status === "ativo").length;

        // --- Funcionários + conformidade ASO ---
        const funcs = await db.select().from(funcionariosTerceiros).where(and(
          eq(funcionariosTerceiros.empresaTerceiraId, input.id),
          eq(funcionariosTerceiros.companyId, empAny.companyId),
          isNull(funcionariosTerceiros.deletedAt),
        )).orderBy(funcionariosTerceiros.nome);

        const isVencido = (d: any) => d ? new Date(String(d)) < hoje : false;
        const funcAtivos = (funcs as any[]).filter(f => f.status === "ativo");
        const asoVencidos = funcAtivos.filter(f => isVencido(f.asoValidade)).length;
        const asoSemData = funcAtivos.filter(f => !f.asoValidade).length;

        // --- Documentos da empresa (validades) ---
        const documentos = [
          { tipo: "PGR", url: empAny.pgrUrl, validade: empAny.pgrValidade },
          { tipo: "PCMSO", url: empAny.pcmsoUrl, validade: empAny.pcmsoValidade },
          { tipo: "Alvará", url: empAny.alvaraUrl, validade: empAny.alvaraValidade },
          { tipo: "Seguro de Vida", url: empAny.seguroVidaUrl, validade: empAny.seguroVidaValidade },
          { tipo: "Contrato Social", url: empAny.contratoSocialUrl, validade: null },
        ].map(d => ({
          ...d,
          status: !d.url ? "ausente" : (d.validade && isVencido(d.validade)) ? "vencido" : "ok",
        }));
        const docsVencidos = documentos.filter(d => d.status === "vencido").length;
        const docsAusentes = documentos.filter(d => d.status === "ausente").length;

        // --- Faturamento (medições do terceiro) — fonte real de NF/fatura com retenções ---
        // Cada medição é a "fatura" do período: bruto medido − retenções (ISS/INSS/IRRF/téc./outras/descontos) = líquido.
        let medicoes: any[] = [];
        if (contratoIds.length > 0) {
          medicoes = await db.select().from(terceiroMedicoes).where(and(
            eq(terceiroMedicoes.empresaTerceiraId, input.id),
            eq(terceiroMedicoes.companyId, empAny.companyId),
            inArray(terceiroMedicoes.contratoId, contratoIds),
          )).orderBy(desc(terceiroMedicoes.criadoEm));
        }
        const contratoNumMap: Record<number, string | null> = Object.fromEntries(
          contratosEnriquecidos.map(c => [c.id, c.numeroContrato || null])
        );
        const faturamento = (medicoes as any[]).map(m => {
          const bruto = num(m.valorMedido);
          const retencoes = num(m.retencaoISS) + num(m.retencaoINSS) + num(m.retencaoIRRF)
            + num(m.outrasRetencoes) + num(m.retencaoTecnica) + num(m.descontos);
          return {
            id: m.id,
            contratoId: m.contratoId,
            numeroContrato: contratoNumMap[m.contratoId] || null,
            numero: m.numero,
            periodo: m.periodo,
            status: m.status,
            bruto,
            retencaoISS: num(m.retencaoISS),
            retencaoINSS: num(m.retencaoINSS),
            retencaoIRRF: num(m.retencaoIRRF),
            retencaoTecnica: num(m.retencaoTecnica),
            outrasRetencoes: num(m.outrasRetencoes),
            descontos: num(m.descontos),
            retencoes,
            liquido: Math.max(bruto - retencoes, 0),
            data: m.aprovadoEm || m.criadoEm,
          };
        });
        const faturamentoResumo = {
          bruto: faturamento.reduce((s, f) => s + f.bruto, 0),
          retencoes: faturamento.reduce((s, f) => s + f.retencoes, 0),
          liquido: faturamento.reduce((s, f) => s + f.liquido, 0),
          medicoesTotal: faturamento.length,
          medicoesPagas: faturamento.filter(f => f.status === "paga").length,
        };

        // --- Movimentações (timeline) — contratos criados, medições, FD de material ---
        const movimentacoes: Array<{ tipo: string; titulo: string; descricao: string | null; valor: number | null; data: string | null; refId: number; refTipo: string }> = [];
        for (const c of contratos as any[]) {
          movimentacoes.push({
            tipo: "contrato", titulo: `Contrato ${c.numeroContrato || "#" + c.id} criado`,
            descricao: c.descricao || null, valor: num(c.valorTotal),
            data: c.criadoEm ? String(c.criadoEm) : null, refId: c.id, refTipo: "contrato",
          });
        }
        for (const f of faturamento) {
          movimentacoes.push({
            tipo: "medicao", titulo: `Medição ${f.numero ?? ""} (${f.periodo}) — ${f.status}`,
            descricao: f.numeroContrato ? `Contrato ${f.numeroContrato}` : null, valor: f.liquido,
            data: f.data ? String(f.data) : null, refId: f.contratoId, refTipo: "contrato",
          });
        }
        movimentacoes.sort((a, b) => String(b.data || "").localeCompare(String(a.data || "")));

        return {
          empresa: emp,
          resumo: {
            totalContratado,
            totalPago,
            saldo: totalContratado - totalPago,
            contratosAtivos,
            contratosTotal: contratosEnriquecidos.length,
            fdMaterialTotal: fdTotalGeral,
            funcionariosAtivos: funcAtivos.length,
            funcionariosTotal: (funcs as any[]).length,
            asoVencidos,
            asoSemData,
            docsVencidos,
            docsAusentes,
            faturamentoBruto: faturamentoResumo.bruto,
            faturamentoRetencoes: faturamentoResumo.retencoes,
            faturamentoLiquido: faturamentoResumo.liquido,
          },
          contratos: contratosEnriquecidos,
          faturamento,
          faturamentoResumo,
          movimentacoes,
          funcionarios: (funcs as any[]).map(f => ({
            id: f.id,
            nome: f.nome,
            funcao: f.funcao,
            status: f.status,
            obraNome: f.obraNome,
            asoValidade: f.asoValidade,
            asoStatus: !f.asoValidade ? "sem_data" : isVencido(f.asoValidade) ? "vencido" : "ok",
          })),
          documentos,
        };
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
        email: z.string().optional(),
        emailFinanceiro: z.string().optional(),
        responsavelNome: z.string().optional(),
        responsavelCargo: z.string().optional(),
        tipoServico: z.string().optional(),
        descricaoServico: z.string().optional(),
        banco: z.string().optional(),
        agencia: z.string().optional(),
        conta: z.string().optional(),
        tipoConta: z.enum(["corrente", "poupanca"]).optional(),
        titularConta: z.string().optional(),
        cpfCnpjTitular: z.string().optional(),
        formaPagamento: z.enum(["pix", "boleto", "transferencia", "deposito"]).optional(),
        pixChave: z.string().optional(),
        pixTipoChave: z.enum(["cpf", "cnpj", "email", "telefone", "aleatoria"]).optional(),
        observacoes: z.string().optional(),
        cicloPagamento: z.enum(["avista", "semanal", "quinzenal", "mensal", "personalizado"]).optional(),
        cicloDiaFechamento: z.number().int().min(1).max(365).optional(),
        cicloNumParcelas: z.number().int().min(1).max(24).optional(),
        cicloPrazoParcela: z.number().int().min(1).max(365).optional(),
        cicloFormaPagamento: z.enum(["cheque", "pix", "boleto", "transferencia"]).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        await _assertCompanyAccess(ctx.user, input);
        const db = (await getDb())!;
        // Anti-duplicidade no MESMO módulo (empresas_terceiras): rejeita se já
        // existir registro ativo com o mesmo CNPJ no tenant.
        const norm = (s?: string | null) => (s || "").replace(/\D/g, "");
        const cnpjN = norm(input.cnpj);
        if (cnpjN) {
          const candidatos = await db.select().from(empresasTerceiras).where(and(
            eq(empresasTerceiras.companyId, input.companyId),
            isNull(empresasTerceiras.deletedAt),
          ));
          const dup = (candidatos as any[]).find(c => norm(c.cnpj) === cnpjN);
          if (dup) {
            throw new TRPCError({
              code: "CONFLICT",
              message: `Já existe uma empresa terceira cadastrada com este CNPJ (#${dup.id} — ${dup.razaoSocial}). Não é permitido duplicar.`,
            });
          }
        }
        // Rev. 2881 — padroniza o nome em Title Case culto, independentemente de
        // como o usuário digitou (TUDO MAIÚSCULO/minúsculo/misturado).
        const [result] = await db.insert(empresasTerceiras).values({
          ...input,
          razaoSocial: upperCaseEmpresa(input.razaoSocial),
          ...(input.nomeFantasia !== undefined ? { nomeFantasia: upperCaseEmpresa(input.nomeFantasia) } : {}),
          createdBy: ctx.user?.name || "Sistema",
        }).returning({ id: empresasTerceiras.id });
        return { id: result.id };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        razaoSocial: z.string().optional(),
        nomeFantasia: z.string().optional(),
        cnpj: z.string().optional(),
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
        email: z.string().optional(),
        emailFinanceiro: z.string().optional(),
        responsavelNome: z.string().optional(),
        responsavelCargo: z.string().optional(),
        tipoServico: z.string().optional(),
        descricaoServico: z.string().optional(),
        banco: z.string().optional(),
        agencia: z.string().optional(),
        conta: z.string().optional(),
        tipoConta: z.enum(["corrente", "poupanca"]).optional(),
        titularConta: z.string().optional(),
        cpfCnpjTitular: z.string().optional(),
        formaPagamento: z.enum(["pix", "boleto", "transferencia", "deposito"]).optional(),
        pixChave: z.string().optional(),
        pixTipoChave: z.enum(["cpf", "cnpj", "email", "telefone", "aleatoria"]).optional(),
        status: z.enum(["ativa", "suspensa", "inativa"]).optional(),
        observacoes: z.string().optional(),
        cicloPagamento: z.enum(["avista", "semanal", "quinzenal", "mensal", "personalizado"]).optional(),
        cicloDiaFechamento: z.number().int().min(1).max(365).optional(),
        cicloNumParcelas: z.number().int().min(1).max(24).optional(),
        cicloPrazoParcela: z.number().int().min(1).max(365).optional(),
        cicloFormaPagamento: z.enum(["cheque", "pix", "boleto", "transferencia"]).optional(),
        // Documentos
        pgrUrl: z.string().optional(),
        pgrValidade: z.string().optional(),
        pcmsoUrl: z.string().optional(),
        pcmsoValidade: z.string().optional(),
        contratoSocialUrl: z.string().optional(),
        alvaraUrl: z.string().optional(),
        alvaraValidade: z.string().optional(),
        seguroVidaUrl: z.string().optional(),
        seguroVidaValidade: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        const { id, ...data } = input;
        // Tenant auth + anti-duplicidade no MESMO módulo (empresas_terceiras) ao editar.
        const [existing] = await db.select().from(empresasTerceiras).where(eq(empresasTerceiras.id, id));
        if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Empresa terceira não encontrada." });
        await _assertCompanyAccess(ctx.user, { companyId: (existing as any).companyId });
        const norm = (s?: string | null) => (s || "").replace(/\D/g, "");
        const novoCnpj = (data as any).cnpj !== undefined ? norm((data as any).cnpj) : norm((existing as any).cnpj);
        if (novoCnpj && novoCnpj !== norm((existing as any).cnpj)) {
          const candidatos = await db.select().from(empresasTerceiras).where(and(
            eq(empresasTerceiras.companyId, (existing as any).companyId),
            isNull(empresasTerceiras.deletedAt),
          ));
          const dup = (candidatos as any[]).find(c => c.id !== id && norm(c.cnpj) === novoCnpj);
          if (dup) {
            throw new TRPCError({
              code: "CONFLICT",
              message: `Já existe outra empresa terceira cadastrada com este CNPJ (#${dup.id} — ${dup.razaoSocial}). Não é permitido duplicar.`,
            });
          }
        }
        // Rev. 2881 — padroniza o nome em Title Case culto também na edição.
        if ((data as any).razaoSocial !== undefined) (data as any).razaoSocial = upperCaseEmpresa((data as any).razaoSocial);
        if ((data as any).nomeFantasia !== undefined) (data as any).nomeFantasia = upperCaseEmpresa((data as any).nomeFantasia);
        await db.update(empresasTerceiras).set(data as any).where(eq(empresasTerceiras.id, id));
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        const [existing] = await db.select().from(empresasTerceiras).where(eq(empresasTerceiras.id, input.id));
        if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Empresa terceira não encontrada." });
        await _assertCompanyAccess(ctx.user, { companyId: (existing as any).companyId });
        await db.update(empresasTerceiras).set({ deletedAt: new Date().toISOString() }).where(eq(empresasTerceiras.id, input.id));
        return { success: true };
      }),

    uploadDoc: protectedProcedure
      .input(z.object({
        empresaId: z.number(),
        field: z.string(),
        fileName: z.string(),
        fileBase64: z.string(),
        contentType: z.string(),
      }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        const buf = Buffer.from(input.fileBase64, "base64");
        const key = `terceiros/empresas/${input.empresaId}/${Date.now()}-${input.fileName}`;
        const { url } = await storagePut(key, buf, input.contentType);
        await db.update(empresasTerceiras).set({ [input.field]: url } as any).where(eq(empresasTerceiras.id, input.empresaId));
        return { url };
      }),

    // Dashboard stats
    stats: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const all = await db.select().from(empresasTerceiras)
          .where(and(companyFilter(empresasTerceiras.companyId, input), isNull(empresasTerceiras.deletedAt)));
        const ativas = all.filter((e: any) => e.statusTerceira === "ativa").length;
        const suspensas = all.filter((e: any) => e.statusTerceira === "suspensa").length;
        const inativas = all.filter((e: any) => e.statusTerceira === "inativa").length;
        return { total: all.length, ativas, suspensas, inativas };
      }),
  }),

  // ============================================================
  // FUNCIONÁRIOS TERCEIROS
  // ============================================================
  funcionarios: router({
    list: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), empresaTerceiraId: z.number().optional(), obraId: z.number().optional() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const conditions = [companyFilter(funcionariosTerceiros.companyId, input), isNull(funcionariosTerceiros.deletedAt)];
        if (input.empresaTerceiraId) conditions.push(eq(funcionariosTerceiros.empresaTerceiraId, input.empresaTerceiraId));
        if (input.obraId) conditions.push(eq(funcionariosTerceiros.obraId, input.obraId));
        return db.select().from(funcionariosTerceiros).where(and(...conditions)).orderBy(funcionariosTerceiros.nome);
      }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const [row] = await db.select().from(funcionariosTerceiros).where(eq(funcionariosTerceiros.id, input.id));
        return row || null;
      }),

    create: protectedProcedure
      .input(z.object({
        empresaTerceiraId: z.number(),
        companyId: z.number(),
        nome: z.string().min(1),
        cpf: z.string().optional(),
        rg: z.string().optional(),
        dataNascimento: z.string().optional(),
        funcao: z.string().optional(),
        telefone: z.string().optional(),
        email: z.string().optional(),
        // Rev. 2008 — endereço residencial
        cep: z.string().optional(),
        logradouro: z.string().optional(),
        numeroEndereco: z.string().optional(),
        complemento: z.string().optional(),
        bairro: z.string().optional(),
        cidade: z.string().optional(),
        uf: z.string().optional(),
        obraId: z.number().optional(),
        obraNome: z.string().optional(),
        // Rev. 1998 — upload de foto direto no cadastro (opcional)
        fotoBase64: z.string().optional(),
        fotoFileName: z.string().optional(),
        fotoContentType: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        const { fotoBase64, fotoFileName, fotoContentType, ...rest } = input;

        // Rev. 1998 — Gerar número interno [SIGLA_EMPRESA]-[SEQ_GLOBAL]
        // 1) buscar empresa pra extrair sigla das iniciais
        const [emp] = await db.select({
          nomeFantasia: empresasTerceiras.nomeFantasia,
          razaoSocial: empresasTerceiras.razaoSocial,
        }).from(empresasTerceiras).where(eq(empresasTerceiras.id, input.empresaTerceiraId));
        const empNome = (emp?.nomeFantasia || emp?.razaoSocial || "").toString();
        const siglaRaw = empNome
          .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          .toUpperCase()
          .replace(/[^A-Z]/g, "")
          .slice(0, 3);
        // Se nome da empresa não tem letras válidas, usa fallback "TER".
        // Se tem 1-2 letras, completa com "X" pra manter formato [3 letras]-[seq].
        const sigla = siglaRaw.length === 0 ? "TER" : siglaRaw.padEnd(3, "X");

        // 2) próximo seq GLOBAL por tenant — MAX da parte numérica após o "-"
        const seqRows = await db.execute(sql`
          SELECT COALESCE(MAX(NULLIF(regexp_replace(numero_interno, '^.*-', ''), '')::INTEGER), 0) AS max_seq
          FROM funcionarios_terceiros
          WHERE "companyId" = ${input.companyId} AND numero_interno IS NOT NULL
        `);
        const maxSeq = Number((seqRows as any).rows?.[0]?.max_seq ?? (seqRows as any)[0]?.max_seq ?? 0);
        const nextSeq = (isFinite(maxSeq) ? maxSeq : 0) + 1;
        const numeroInterno = `${sigla}-${String(nextSeq).padStart(5, "0")}`;

        // 3) upload de foto se enviada
        let fotoUrl: string | undefined;
        if (fotoBase64 && fotoFileName) {
          const buf = Buffer.from(fotoBase64, "base64");
          const safeName = fotoFileName.replace(/[^a-zA-Z0-9._-]/g, "_");
          const key = `terceiros/funcionarios/_novos/${Date.now()}-${safeName}`;
          const up = await storagePut(key, buf, fotoContentType || "image/jpeg");
          fotoUrl = up.url;
        }

        // Rev. 2495 — Padronização: nome SEMPRE em MAIÚSCULAS + trim
        // (espaços nas pontas distorcem ordenação alfabética).
        if (rest.nome) rest.nome = String(rest.nome).trim().toUpperCase();
        const values: any = { ...rest, numeroInterno };
        if (fotoUrl) values.fotoUrl = fotoUrl;
        const [result] = await db.insert(funcionariosTerceiros).values(values).returning({ id: funcionariosTerceiros.id });
        return { id: result.id, numeroInterno };
      }),

    // Rev. 2494 — Schema relaxado pra aceitar `null` (rg/email/cep etc voltam
     // como NULL do banco) + `empresaTerceiraId` adicionado (UI permitia trocar,
     // mas backend estripava silenciosamente). Bug: clicar "Atualizar" não
     // salvava nada — Zod rejeitava o payload inteiro por causa de `null`
     // em string().optional() e a mutation falhava em silêncio (faltava
     // onError no frontend). Pedido user (image_1779887735657): "TO CLICANDO
     // EM ATUALIZAR, MAS ELE NÃO ESTA SALVANDO AS ALTERAÇÕES.. PQ?".
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        empresaTerceiraId: z.number().nullish(),
        nome: z.string().nullish(),
        cpf: z.string().nullish(),
        rg: z.string().nullish(),
        dataNascimento: z.string().nullish(),
        funcao: z.string().nullish(),
        telefone: z.string().nullish(),
        email: z.string().nullish(),
        // Rev. 2008 — endereço residencial
        cep: z.string().nullish(),
        logradouro: z.string().nullish(),
        numeroEndereco: z.string().nullish(),
        complemento: z.string().nullish(),
        bairro: z.string().nullish(),
        cidade: z.string().nullish(),
        uf: z.string().nullish(),
        obraId: z.number().nullish(),
        obraNome: z.string().nullish(),
        statusAptidao: z.enum(["apto", "inapto", "pendente"]).nullish(),
        motivoInapto: z.string().nullish(),
        status: z.enum(["ativo", "inativo", "afastado"]).nullish(),
        asoUrl: z.string().nullish(),
        asoValidade: z.string().nullish(),
        treinamentoNrUrl: z.string().nullish(),
        treinamentoNrValidade: z.string().nullish(),
        certificadosUrl: z.string().nullish(),
        fotoUrl: z.string().nullish(),
      }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        const { id, ...data } = input;
        // Rev. 2495 — Padronização: nome SEMPRE em MAIÚSCULAS + trim
        // (espaços nas pontas distorcem ordenação alfabética).
        if (typeof data.nome === "string") data.nome = data.nome.trim().toUpperCase();
        // Remove chaves undefined (não sobrescreve com NULL inadvertidamente).
        const clean: any = {};
        for (const [k, v] of Object.entries(data)) if (v !== undefined) clean[k] = v;
        if (Object.keys(clean).length === 0) return { success: true };
        await db.update(funcionariosTerceiros).set(clean).where(eq(funcionariosTerceiros.id, id));
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        await db.update(funcionariosTerceiros).set({ deletedAt: new Date().toISOString() }).where(eq(funcionariosTerceiros.id, input.id));
        return { success: true };
      }),

    uploadDoc: protectedProcedure
      .input(z.object({
        funcTerceiroId: z.number(),
        field: z.string(),
        fileName: z.string(),
        fileBase64: z.string(),
        contentType: z.string(),
      }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        const buf = Buffer.from(input.fileBase64, "base64");
        const key = `terceiros/funcionarios/${input.funcTerceiroId}/${Date.now()}-${input.fileName}`;
        const { url } = await storagePut(key, buf, input.contentType);
        await db.update(funcionariosTerceiros).set({ [input.field]: url } as any).where(eq(funcionariosTerceiros.id, input.funcTerceiroId));
        return { url };
      }),

    // Rev. 2031 — adiciona documento avulso em uma categoria (não substitui campos fixos).
    addDocExtra: protectedProcedure
      .input(z.object({
        funcTerceiroId: z.number(),
        categoria: z.string().min(1),
        label: z.string().min(1).max(200),
        validade: z.string().optional().nullable(),
        fileName: z.string(),
        fileBase64: z.string(),
        contentType: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        // Rev. 2031 (hotfix) — tenant guard (IDOR): valida companyId ANTES do upload.
        const [row] = await db.select().from(funcionariosTerceiros).where(eq(funcionariosTerceiros.id, input.funcTerceiroId));
        if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Funcionário terceiro não encontrado." });
        await _assertCompanyAccess(ctx.user, { companyId: (row as any).companyId });
        const buf = Buffer.from(input.fileBase64, "base64");
        const key = `terceiros/funcionarios/${input.funcTerceiroId}/extras/${Date.now()}-${input.fileName}`;
        const { url } = await storagePut(key, buf, input.contentType);
        const current: any[] = Array.isArray((row as any)?.documentosExtras) ? (row as any).documentosExtras : [];
        const novo = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          categoria: input.categoria,
          label: input.label,
          url,
          validade: input.validade || null,
          uploadedAt: new Date().toISOString(),
        };
        await db.update(funcionariosTerceiros)
          .set({ documentosExtras: [...current, novo] as any })
          .where(eq(funcionariosTerceiros.id, input.funcTerceiroId));
        return { doc: novo };
      }),

    // Rev. 2031 — remove documento avulso.
    removeDocExtra: protectedProcedure
      .input(z.object({ funcTerceiroId: z.number(), docId: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        const [row] = await db.select().from(funcionariosTerceiros).where(eq(funcionariosTerceiros.id, input.funcTerceiroId));
        if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Funcionário terceiro não encontrado." });
        await _assertCompanyAccess(ctx.user, { companyId: (row as any).companyId });
        const current: any[] = Array.isArray((row as any)?.documentosExtras) ? (row as any).documentosExtras : [];
        const next = current.filter((d: any) => d.id !== input.docId);
        await db.update(funcionariosTerceiros)
          .set({ documentosExtras: next as any })
          .where(eq(funcionariosTerceiros.id, input.funcTerceiroId));
        return { success: true };
      }),

    // Rev. 2031 — atualiza validade de doc avulso (edição inline da data).
    updateDocExtraValidade: protectedProcedure
      .input(z.object({ funcTerceiroId: z.number(), docId: z.string(), validade: z.string().nullable() }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        const [row] = await db.select().from(funcionariosTerceiros).where(eq(funcionariosTerceiros.id, input.funcTerceiroId));
        if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Funcionário terceiro não encontrado." });
        await _assertCompanyAccess(ctx.user, { companyId: (row as any).companyId });
        const current: any[] = Array.isArray((row as any)?.documentosExtras) ? (row as any).documentosExtras : [];
        const next = current.map((d: any) => d.id === input.docId ? { ...d, validade: input.validade || null } : d);
        await db.update(funcionariosTerceiros)
          .set({ documentosExtras: next as any })
          .where(eq(funcionariosTerceiros.id, input.funcTerceiroId));
        return { success: true };
      }),

    stats: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const all = await db.select().from(funcionariosTerceiros)
          .where(and(companyFilter(funcionariosTerceiros.companyId, input), isNull(funcionariosTerceiros.deletedAt)));
        const aptos = all.filter((f: any) => f.statusAptidaoTerceiro === "apto").length;
        const inaptos = all.filter((f: any) => f.statusAptidaoTerceiro === "inapto").length;
        const pendentes = all.filter((f: any) => f.statusAptidaoTerceiro === "pendente").length;
        return { total: all.length, aptos, inaptos, pendentes };
      }),
  }),

  // ============================================================
  // Rev. 2004 — DDS (Diálogo Diário de Segurança)
  // Registra cada participação do funcionário terceiro em DDS da Construtora.
  // ============================================================
  dds: router({
    list: protectedProcedure
      .input(z.object({ companyId: z.number(), funcTerceiroId: z.number().optional() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const conditions: any[] = [eq(ddsParticipacoesTerceiros.companyId, input.companyId), isNull(ddsParticipacoesTerceiros.deletedAt)];
        if (input.funcTerceiroId) conditions.push(eq(ddsParticipacoesTerceiros.funcTerceiroId, input.funcTerceiroId));
        return db.select().from(ddsParticipacoesTerceiros).where(and(...conditions)).orderBy(desc(ddsParticipacoesTerceiros.dataDds));
      }),
    create: protectedProcedure
      .input(z.object({
        companyId: z.number(),
        funcTerceiroId: z.number(),
        dataDds: z.string(),
        tema: z.string().min(1),
        instrutor: z.string().optional(),
        obraId: z.number().optional(),
        obraNome: z.string().optional(),
        observacoes: z.string().optional(),
        listaPresencaBase64: z.string().optional(),
        listaPresencaFileName: z.string().optional(),
        listaPresencaContentType: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        const { listaPresencaBase64, listaPresencaFileName, listaPresencaContentType, ...rest } = input;
        let listaPresencaUrl: string | undefined;
        if (listaPresencaBase64 && listaPresencaFileName) {
          const buf = Buffer.from(listaPresencaBase64, "base64");
          const safeName = listaPresencaFileName.replace(/[^a-zA-Z0-9._-]/g, "_");
          const key = `terceiros/dds/${input.funcTerceiroId}/${Date.now()}-${safeName}`;
          const up = await storagePut(key, buf, listaPresencaContentType || "application/pdf");
          listaPresencaUrl = up.url;
        }
        const [row] = await db.insert(ddsParticipacoesTerceiros).values({
          ...rest,
          listaPresencaUrl,
          createdBy: (ctx as any)?.user?.email || (ctx as any)?.user?.nome || null,
        } as any).returning({ id: ddsParticipacoesTerceiros.id });
        return { id: row.id };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        await db.update(ddsParticipacoesTerceiros).set({ deletedAt: new Date().toISOString() }).where(eq(ddsParticipacoesTerceiros.id, input.id));
        return { success: true };
      }),
  }),

  // ============================================================
  // OBRIGAÇÕES MENSAIS
  // ============================================================
  obrigacoes: router({
    list: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), empresaTerceiraId: z.number().optional(), competencia: z.string().optional() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const conditions: any[] = [companyFilter(obrigacoesMensaisTerceiros.companyId, input)];
        if (input.empresaTerceiraId) conditions.push(eq(obrigacoesMensaisTerceiros.empresaTerceiraId, input.empresaTerceiraId));
        if (input.competencia) conditions.push(eq(obrigacoesMensaisTerceiros.competencia, input.competencia));
        return db.select().from(obrigacoesMensaisTerceiros).where(and(...conditions)).orderBy(desc(obrigacoesMensaisTerceiros.competencia));
      }),

    create: protectedProcedure
      .input(z.object({
        empresaTerceiraId: z.number(),
        companyId: z.number(),
        competencia: z.string(),
      }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        const [result] = await db.insert(obrigacoesMensaisTerceiros).values(input);
        return { id: result[0].id };
      }),

    updateDocStatus: protectedProcedure
      .input(z.object({
        id: z.number(),
        field: z.string(),
        status: z.enum(["pendente", "enviado", "aprovado", "rejeitado"]),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        const updateData: any = { [input.field]: input.status };
        if (input.status === "aprovado") {
          updateData.validadoPor = ctx.user?.name || "Sistema";
          updateData.validadoEm = new Date().toISOString();
        }
        await db.update(obrigacoesMensaisTerceiros).set(updateData).where(eq(obrigacoesMensaisTerceiros.id, input.id));
        // Recalculate statusGeral
        const [row] = await db.select().from(obrigacoesMensaisTerceiros).where(eq(obrigacoesMensaisTerceiros.id, input.id));
        if (row) {
          const statuses = [row.fgtsStatus, row.inssStatus, row.folhaPagamentoStatus, row.comprovantePagamentoStatus, row.gpsStatus, row.cndStatus];
          const allApproved = statuses.every((s: string) => s === "aprovado");
          const allPending = statuses.every((s: string) => s === "pendente");
          const statusGeral = allApproved ? "completo" : allPending ? "pendente" : "parcial";
          await db.update(obrigacoesMensaisTerceiros).set({ statusGeral } as any).where(eq(obrigacoesMensaisTerceiros.id, input.id));
        }
        return { success: true };
      }),

    uploadDoc: protectedProcedure
      .input(z.object({
        obrigacaoId: z.number(),
        field: z.string(),
        fileName: z.string(),
        fileBase64: z.string(),
        contentType: z.string(),
      }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        const buf = Buffer.from(input.fileBase64, "base64");
        const key = `terceiros/obrigacoes/${input.obrigacaoId}/${Date.now()}-${input.fileName}`;
        const { url } = await storagePut(key, buf, input.contentType);
        await db.update(obrigacoesMensaisTerceiros).set({ [input.field]: url } as any).where(eq(obrigacoesMensaisTerceiros.id, input.obrigacaoId));
        return { url };
      }),
  }),

  // ============================================================
  // ALERTAS
  // ============================================================
  alertas: router({
    list: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), resolvido: z.number().optional() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const conditions: any[] = [companyFilter(alertasTerceiros.companyId, input)];
        if (input.resolvido !== undefined) conditions.push(eq(alertasTerceiros.resolvido, input.resolvido));
        return db.select().from(alertasTerceiros).where(and(...conditions)).orderBy(desc(alertasTerceiros.createdAt));
      }),

    resolver: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        await db.update(alertasTerceiros).set({
          resolvido: 1,
          resolvidoEm: new Date().toISOString(),
          resolvidoPor: ctx.user?.name || "Sistema",
        }).where(eq(alertasTerceiros.id, input.id));
        return { success: true };
      }),
    enviar: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), empresaTerceiraId: z.number(),
        tipo: z.string(),
        titulo: z.string(),
        descricao: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        const [result] = await db.insert(alertasTerceiros).values({
          companyId: input.companyId,
          empresaTerceiraId: input.empresaTerceiraId,
          tipo: input.tipo as any,
          titulo: input.titulo,
          descricao: input.descricao || "",
        });
        return { success: true, id: result[0].id };
      }),
  }),
  // ============================================================
  // CONFORMIDADE / MEDIÇÃO
  // ============================================================
  conformidade: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), obraId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const empresas = await db.select().from(empresasTerceiras)
        .where(and(companyFilter(empresasTerceiras.companyId, input), isNull(empresasTerceiras.deletedAt)));
      const funcs = await db.select().from(funcionariosTerceiros)
        .where(and(companyFilter(funcionariosTerceiros.companyId, input), isNull(funcionariosTerceiros.deletedAt)));
      const now = new Date();
      const competenciaAtual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const obrigacoes = await db.select().from(obrigacoesMensaisTerceiros)
        .where(and(companyFilter(obrigacoesMensaisTerceiros.companyId, input), eq(obrigacoesMensaisTerceiros.competencia, competenciaAtual)));
      const obrasList = await db.select().from(obras)
        .where(and(companyFilter(obras.companyId, input), isNull(obras.deletedAt)));
      // Build conformidade per empresa
      const resultado = empresas.map((emp: any) => {
        const funcsDaEmpresa = funcs.filter((f: any) => f.empresaTerceiraId === emp.id);
        const obrigDaEmpresa = obrigacoes.filter((o: any) => o.empresaTerceiraId === emp.id);
        const docsEmpresa = {
          pgr: { url: emp.pgrUrl, validade: emp.pgrValidade, status: emp.pgrUrl ? (emp.pgrValidade && new Date(emp.pgrValidade) < now ? "vencido" : "ok") : "pendente" },
          pcmso: { url: emp.pcmsoUrl, validade: emp.pcmsoValidade, status: emp.pcmsoUrl ? (emp.pcmsoValidade && new Date(emp.pcmsoValidade) < now ? "vencido" : "ok") : "pendente" },
          contratoSocial: { url: emp.contratoSocialUrl, status: emp.contratoSocialUrl ? "ok" : "pendente" },
          alvara: { url: emp.alvaraUrl, validade: emp.alvaraValidade, status: emp.alvaraUrl ? (emp.alvaraValidade && new Date(emp.alvaraValidade) < now ? "vencido" : "ok") : "pendente" },
        };
        const docsOk = Object.values(docsEmpresa).filter((d: any) => d.status === "ok").length;
        const docsTotal = Object.keys(docsEmpresa).length;
        const funcsAptos = funcsDaEmpresa.filter((f: any) => f.statusAptidaoTerceiro === "apto").length;
        const obrigCompleta = obrigDaEmpresa.length > 0 && obrigDaEmpresa.every((o: any) => o.statusGeral === "completo");
        const conformeGeral = docsOk === docsTotal && funcsAptos === funcsDaEmpresa.length && obrigCompleta;
        return {
          empresa: { id: emp.id, razaoSocial: emp.razaoSocial, cnpj: emp.cnpj, status: emp.status },
          documentos: docsEmpresa,
          docsOk, docsTotal,
          funcionarios: { total: funcsDaEmpresa.length, aptos: funcsAptos },
          obrigacaoMensal: obrigDaEmpresa[0] || null,
          conformeGeral,
        };
      });
      return { empresas: resultado, obras: obrasList };
    }),

  // ============================================================
  // PAINEL / DASHBOARD
  // ============================================================
  painel: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const empresas = await db.select().from(empresasTerceiras)
        .where(and(companyFilter(empresasTerceiras.companyId, input), isNull(empresasTerceiras.deletedAt)));
      const funcs = await db.select().from(funcionariosTerceiros)
        .where(and(companyFilter(funcionariosTerceiros.companyId, input), isNull(funcionariosTerceiros.deletedAt)));
      const alertas = await db.select().from(alertasTerceiros)
        .where(and(companyFilter(alertasTerceiros.companyId, input), eq(alertasTerceiros.resolvido, 0)));

      const now = new Date();
      const competenciaAtual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const obrigacoes = await db.select().from(obrigacoesMensaisTerceiros)
        .where(and(companyFilter(obrigacoesMensaisTerceiros.companyId, input), eq(obrigacoesMensaisTerceiros.competencia, competenciaAtual)));

      return {
        empresas: {
          total: empresas.length,
          ativas: empresas.filter((e: any) => e.statusTerceira === "ativa").length,
          suspensas: empresas.filter((e: any) => e.statusTerceira === "suspensa").length,
        },
        funcionarios: {
          total: funcs.length,
          aptos: funcs.filter((f: any) => f.statusAptidaoTerceiro === "apto").length,
          inaptos: funcs.filter((f: any) => f.statusAptidaoTerceiro === "inapto").length,
          pendentes: funcs.filter((f: any) => f.statusAptidaoTerceiro === "pendente").length,
        },
        obrigacoesMes: {
          total: obrigacoes.length,
          completas: obrigacoes.filter((o: any) => o.statusGeralObrigacao === "completo").length,
          parciais: obrigacoes.filter((o: any) => o.statusGeralObrigacao === "parcial").length,
          pendentes: obrigacoes.filter((o: any) => o.statusGeralObrigacao === "pendente").length,
        },
        alertasPendentes: alertas.length,
      };
    }),
  // ============================================================
  // IA - VALIDAÇÃO DE DOCUMENTOS
  // ============================================================
  ia: router({
    validarDocumento: protectedProcedure
      .input(z.object({
        documentoUrl: z.string(),
        tipoDocumento: z.string(),
        empresaNome: z.string(),
        competencia: z.string(),
      }))
      .mutation(async ({ input }) => {
        try {
          const response = await invokeLLM({
            messages: [
              {
                role: "system",
                content: `Você é um especialista em validação de documentos trabalhistas brasileiros. Analise o documento fornecido e retorne um JSON com a seguinte estrutura:
{
  "valido": boolean,
  "tipoDetectado": string,
  "empresa": string,
  "competencia": string,
  "valor": string,
  "observacoes": string[],
  "alertas": string[],
  "confianca": number (0-100)
}
Seja rigoroso na validação. Verifique se o tipo do documento corresponde ao esperado, se a competência está correta e se os dados são consistentes.`
              },
              {
                role: "user",
                content: [
                  {
                    type: "text" as const,
                    text: `Valide este documento:\n- Tipo esperado: ${input.tipoDocumento}\n- Empresa: ${input.empresaNome}\n- Competência: ${input.competencia}\n- URL do documento: ${input.documentoUrl}\n\nAnalise e retorne o JSON de validação.`
                  }
                ]
              }
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "validacao_documento",
                strict: true,
                schema: {
                  type: "object",
                  properties: {
                    valido: { type: "boolean", description: "Se o documento é válido" },
                    tipoDetectado: { type: "string", description: "Tipo do documento detectado" },
                    empresa: { type: "string", description: "Nome da empresa no documento" },
                    competencia: { type: "string", description: "Competência do documento" },
                    valor: { type: "string", description: "Valor principal do documento" },
                    observacoes: { type: "array", items: { type: "string" }, description: "Observações sobre o documento" },
                    alertas: { type: "array", items: { type: "string" }, description: "Alertas de inconsistência" },
                    confianca: { type: "number", description: "Nível de confiança da validação (0-100)" }
                  },
                  required: ["valido", "tipoDetectado", "empresa", "competencia", "valor", "observacoes", "alertas", "confianca"],
                  additionalProperties: false
                }
              }
            }
          });
          const content = String(response.choices?.[0]?.message?.content || "{}");
          return JSON.parse(content);
        } catch (error) {
          return {
            valido: false,
            tipoDetectado: "Erro na análise",
            empresa: input.empresaNome,
            competencia: input.competencia,
            valor: "N/A",
            observacoes: ["Não foi possível analisar o documento automaticamente"],
            alertas: ["Erro na validação com IA. Verifique manualmente."],
            confianca: 0
          };
        }
      }),
  }),

  // ============================================================
  // ADVERTÊNCIAS DE FUNCIONÁRIOS TERCEIROS
  // ============================================================
  advertencias: router({
    list: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), empresaTerceiraId: z.number().optional(), funcionarioTerceiroId: z.number().optional() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const conds: any[] = [companyFilter(warningsTerceiros.companyId, input), isNull(warningsTerceiros.deletedAt)];
        if (input.empresaTerceiraId) conds.push(eq(warningsTerceiros.empresaTerceiraId, input.empresaTerceiraId));
        if (input.funcionarioTerceiroId) conds.push(eq(warningsTerceiros.funcionarioTerceiroId, input.funcionarioTerceiroId));
        return db
          .select({
            id: warningsTerceiros.id,
            companyId: warningsTerceiros.companyId,
            empresaTerceiraId: warningsTerceiros.empresaTerceiraId,
            funcionarioTerceiroId: warningsTerceiros.funcionarioTerceiroId,
            funcionarioNome: sql<string>`COALESCE(${funcionariosTerceiros.nome}, ${warningsTerceiros.funcionarioNomeManual})`,
            funcionarioCpf: sql<string>`COALESCE(${funcionariosTerceiros.cpf}, ${warningsTerceiros.funcionarioCpfManual})`,
            funcionarioFuncao: sql<string>`COALESCE(${funcionariosTerceiros.funcao}, ${warningsTerceiros.funcionarioFuncaoManual})`,
            empresaRazaoSocial: empresasTerceiras.razaoSocial,
            empresaCnpj: empresasTerceiras.cnpj,
            empresaResponsavel: empresasTerceiras.responsavelNome,
            tipoAdvertencia: warningsTerceiros.tipoAdvertencia,
            dataOcorrencia: warningsTerceiros.dataOcorrencia,
            motivo: warningsTerceiros.motivo,
            descricao: warningsTerceiros.descricao,
            testemunhas: warningsTerceiros.testemunhas,
            documentoUrl: warningsTerceiros.documentoUrl,
            sequencia: warningsTerceiros.sequencia,
            aplicadoPor: warningsTerceiros.aplicadoPor,
            diasSuspensao: warningsTerceiros.diasSuspensao,
            obraId: warningsTerceiros.obraId,
            obraNome: warningsTerceiros.obraNome,
            createdAt: warningsTerceiros.createdAt,
          })
          .from(warningsTerceiros)
          .leftJoin(funcionariosTerceiros, eq(warningsTerceiros.funcionarioTerceiroId, funcionariosTerceiros.id))
          .leftJoin(empresasTerceiras, eq(warningsTerceiros.empresaTerceiraId, empresasTerceiras.id))
          .where(and(...conds))
          .orderBy(desc(warningsTerceiros.dataOcorrencia));
      }),

    create: protectedProcedure
      .input(z.object({
        companyId: z.number(),
        empresaTerceiraId: z.number(),
        funcionarioTerceiroId: z.number().optional().nullable(),
        funcionarioNomeManual: z.string().optional(),
        funcionarioCpfManual: z.string().optional(),
        funcionarioFuncaoManual: z.string().optional(),
        tipoAdvertencia: z.enum(["Notificacao", "Advertencia", "Suspensao", "SolicitacaoSubstituicao"]),
        dataOcorrencia: z.string(),
        motivo: z.string().min(3),
        descricao: z.string().optional(),
        testemunhas: z.string().optional(),
        aplicadoPor: z.string().optional(),
        diasSuspensao: z.number().optional(),
        obraId: z.number().optional(),
        obraNome: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        if (!input.funcionarioTerceiroId && !(input.funcionarioNomeManual && input.funcionarioNomeManual.trim().length > 0)) {
          throw new Error("Informe um colaborador cadastrado ou digite o nome do colaborador.");
        }
        // SEGURANÇA: validar que empresaTerceiraId pertence ao tenant da advertência.
        const [empOk] = await db.select({ id: empresasTerceiras.id })
          .from(empresasTerceiras)
          .where(and(
            eq(empresasTerceiras.id, input.empresaTerceiraId),
            eq(empresasTerceiras.companyId, input.companyId),
            isNull(empresasTerceiras.deletedAt),
          ));
        if (!empOk) throw new TRPCError({ code: "FORBIDDEN", message: "Empresa terceira não pertence a este tenant." });
        if (input.funcionarioTerceiroId) {
          const [funcOk] = await db.select({ id: funcionariosTerceiros.id })
            .from(funcionariosTerceiros)
            .where(and(
              eq(funcionariosTerceiros.id, input.funcionarioTerceiroId),
              eq(funcionariosTerceiros.companyId, input.companyId),
              eq(funcionariosTerceiros.empresaTerceiraId, input.empresaTerceiraId),
            ));
          if (!funcOk) throw new TRPCError({ code: "FORBIDDEN", message: "Colaborador não pertence à empresa terceira informada neste tenant." });
        }
        let sequencia = 1;
        if (input.funcionarioTerceiroId) {
          const existentes = await db.select({ id: warningsTerceiros.id }).from(warningsTerceiros)
            .where(and(eq(warningsTerceiros.funcionarioTerceiroId, input.funcionarioTerceiroId), eq(warningsTerceiros.companyId, input.companyId), isNull(warningsTerceiros.deletedAt)));
          sequencia = existentes.length + 1;
        } else if (input.funcionarioNomeManual) {
          const nomeKey = input.funcionarioNomeManual.trim().toLowerCase();
          const existentes = await db.select({ nome: warningsTerceiros.funcionarioNomeManual }).from(warningsTerceiros)
            .where(and(eq(warningsTerceiros.empresaTerceiraId, input.empresaTerceiraId), eq(warningsTerceiros.companyId, input.companyId), isNull(warningsTerceiros.deletedAt)));
          sequencia = existentes.filter((e: any) => (e.nome || "").trim().toLowerCase() === nomeKey).length + 1;
        }
        const [row] = await db.insert(warningsTerceiros).values({
          companyId: input.companyId,
          empresaTerceiraId: input.empresaTerceiraId,
          funcionarioTerceiroId: input.funcionarioTerceiroId || null,
          funcionarioNomeManual: input.funcionarioTerceiroId ? null : (input.funcionarioNomeManual || null),
          funcionarioCpfManual: input.funcionarioTerceiroId ? null : (input.funcionarioCpfManual || null),
          funcionarioFuncaoManual: input.funcionarioTerceiroId ? null : (input.funcionarioFuncaoManual || null),
          tipoAdvertencia: input.tipoAdvertencia,
          dataOcorrencia: input.dataOcorrencia,
          motivo: input.motivo,
          descricao: input.descricao || null,
          testemunhas: input.testemunhas || null,
          aplicadoPor: input.aplicadoPor || ctx.user?.name || null,
          diasSuspensao: input.diasSuspensao || null,
          obraId: input.obraId || null,
          obraNome: input.obraNome || null,
          sequencia,
          createdBy: ctx.user?.name || null,
        } as any).returning({ id: warningsTerceiros.id });
        let alerta: string | null = null;
        if (sequencia >= 3) alerta = `Atenção: este colaborador já possui ${sequencia} ocorrências. Avalie solicitar substituição junto à empresa prestadora.`;
        return { success: true, id: row.id, sequencia, alerta };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        tipoAdvertencia: z.enum(["Notificacao", "Advertencia", "Suspensao", "SolicitacaoSubstituicao"]).optional(),
        dataOcorrencia: z.string().optional(),
        motivo: z.string().optional(),
        descricao: z.string().optional(),
        testemunhas: z.string().optional(),
        aplicadoPor: z.string().optional(),
        diasSuspensao: z.number().optional(),
        obraId: z.number().optional(),
        obraNome: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        const { id, ...rest } = input;
        const updateData: any = { updatedAt: sql`NOW()` };
        Object.entries(rest).forEach(([k, v]) => { if (v !== undefined) updateData[k] = v; });
        await db.update(warningsTerceiros).set(updateData).where(eq(warningsTerceiros.id, id));
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        await db.update(warningsTerceiros).set({ deletedAt: sql`NOW()` as any, deletedBy: ctx.user?.name || "Sistema" } as any).where(eq(warningsTerceiros.id, input.id));
        return { success: true };
      }),

    uploadDoc: protectedProcedure
      .input(z.object({ id: z.number(), fileBase64: z.string(), fileName: z.string() }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        const buffer = Buffer.from(input.fileBase64, "base64");
        const ext = (input.fileName.split(".").pop() || "pdf").toLowerCase();
        const key = `documentos/advertencias-terceiros/${input.id}-${Date.now()}.${ext}`;
        const { url } = await storagePut(key, buffer, ext === "pdf" ? "application/pdf" : "application/octet-stream");
        await db.update(warningsTerceiros).set({ documentoUrl: url } as any).where(eq(warningsTerceiros.id, input.id));
        return { url };
      }),
  }),
});
