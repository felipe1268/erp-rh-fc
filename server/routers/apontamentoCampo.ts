// APONTAMENTO DE CAMPO — fato primário da produção diária (ronda do apontador).
// Regras de ouro:
//  • O apontamento NUNCA gera dinheiro sozinho — só a medição validada gera título.
//  • Ledger anti-duplicidade: a soma de percentual por trecho (contorno ou
//    obra+pavimento+local)+serviço não pode passar de 100% (poka-yoke no server).
//  • Resolução do contrato em cascata: 1 candidato → automático; Mapa de
//    Frentes (contrato × pavimento) desempata; senão o apontador escolhe.
import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb, getUserCompanyLinks } from "../db";
import {
  apontamentosProducao, contratoFrentes, obraPavimentos, obras,
  medicaoCampo, medicaoCampoPdfs, medicaoCampoContornos,
  terceiroContratos, terceiroContratoItens, medicaoCriterios,
} from "../../drizzle/schema";
import { and, eq, ne, inArray, sql, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { storagePut } from "../storage";

async function assertCompanyAccess(ctxUser: any, companyId: number) {
  if (!ctxUser?.id) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
  if (ctxUser.role === "admin" || ctxUser.role === "admin_master") return;
  const links = await getUserCompanyLinks(ctxUser.id);
  const allowedIds = (links as any[]).map((l: any) => l.companyId).filter((v: any) => typeof v === "number");
  if (!allowedIds.includes(companyId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
  }
}

// Normaliza texto p/ matching fuzzy serviço ↔ item de contrato.
const norm = (s: string) => (s || "")
  .toLowerCase()
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9 ]/g, " ")
  .replace(/\s+/g, " ").trim();

// Tokens relevantes (≥4 letras) do nome do serviço.
const tokens = (s: string) => norm(s).split(" ").filter(t => t.length >= 4);

// Item do contrato "cobre" o serviço se compartilha ≥1 token relevante.
function itemCobreServico(itemDescricao: string, servico: string): boolean {
  const ti = norm(itemDescricao);
  const tks = tokens(servico);
  if (!tks.length) return false;
  return tks.some(t => ti.includes(t));
}

// Candidatos de contrato p/ um serviço numa obra + resolução por frente.
async function resolverCandidatos(db: any, companyId: number, obraId: number, servico: string, pavimentoId?: number | null) {
  const contratos = await db.select({
    id: terceiroContratos.id,
    numeroContrato: terceiroContratos.numeroContrato,
    descricao: terceiroContratos.descricao,
    empresaTerceiraId: terceiroContratos.empresaTerceiraId,
    status: terceiroContratos.status,
  }).from(terceiroContratos)
    .where(and(
      eq(terceiroContratos.companyId, companyId),
      eq(terceiroContratos.obraId, obraId),
      inArray(terceiroContratos.status, ["ativo", "em_andamento", "assinado", "vigente"]),
    ));
  if (!contratos.length) return { candidatos: [], resolvido: null as any, via: "nenhum" as string };

  const ids = contratos.map((c: any) => c.id);
  const itens = await db.select({
    id: terceiroContratoItens.id,
    contratoId: terceiroContratoItens.contratoId,
    descricao: terceiroContratoItens.descricao,
    unidade: terceiroContratoItens.unidade,
  }).from(terceiroContratoItens)
    .where(and(eq(terceiroContratoItens.companyId, companyId), inArray(terceiroContratoItens.contratoId, ids)));

  // contratos cujo escopo (itens) cobre o serviço
  const porContrato = new Map<number, any[]>();
  for (const it of itens) {
    if (itemCobreServico(String(it.descricao || ""), servico)) {
      const arr = porContrato.get(it.contratoId) || [];
      arr.push(it);
      porContrato.set(it.contratoId, arr);
    }
  }
  let candidatos = contratos
    .filter((c: any) => porContrato.has(c.id))
    .map((c: any) => ({ ...c, itens: porContrato.get(c.id) }));

  // fallback: nenhum item casa → todos os contratos ativos são candidatos "fracos"
  const matchFraco = !candidatos.length;
  if (matchFraco) candidatos = contratos.map((c: any) => ({ ...c, itens: [] }));

  if (candidatos.length === 1) return { candidatos, resolvido: candidatos[0], via: matchFraco ? "unico_contrato" : "unico_servico" };

  // desempate pelo Mapa de Frentes
  if (pavimentoId) {
    const frentes = await db.select().from(contratoFrentes)
      .where(and(
        eq(contratoFrentes.companyId, companyId),
        eq(contratoFrentes.pavimentoId, pavimentoId),
        inArray(contratoFrentes.contratoId, candidatos.map((c: any) => c.id)),
      ));
    if (frentes.length === 1) {
      const win = candidatos.find((c: any) => c.id === frentes[0].contratoId);
      if (win) return { candidatos, resolvido: win, via: "frente" };
    }
  }
  return { candidatos, resolvido: null, via: "ambiguo" };
}

export const apontamentoCampoRouter = router({
  // Ronda com biblioteca da OBRA (contratoId=0): o combobox "Vincular item do
  // orçamento" precisa do orçamento da OBRA (não há contrato pra resolver).
  // Devolve o orçamento mais recente da obra (aprovado tem prioridade).
  getOrcamentoDaObra: protectedProcedure
    .input(z.object({ companyId: z.number(), obraId: z.number() }))
    .query(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = (await getDb())!;
      const rows = await db.execute(sql`
        SELECT o.id FROM orcamentos o
        JOIN obras ob ON ob.id = o."obraId" AND ob."companyId" = ${input.companyId}
        WHERE o."obraId" = ${input.obraId} AND o."companyId" = ${input.companyId}
        ORDER BY (o.status = 'aprovado') DESC, o.id DESC
        LIMIT 1
      `).then((r: any) => r.rows ?? r);
      return { orcamentoId: rows?.[0]?.id ? Number(rows[0].id) : 0 };
    }),

  // ───────────── Resumo por obra (tela inicial da ronda) ─────────────
  resumoObras: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = (await getDb())!;
      const rows = await db.execute(sql`
        WITH pav AS (
          SELECT obra_id, COUNT(*) AS pavimentos FROM obra_pavimentos
          WHERE company_id = ${input.companyId} GROUP BY obra_id
        ), amb AS (
          SELECT pv.obra_id, COUNT(*) AS ambientes
          FROM medicao_campo_contornos c
          JOIN medicao_campo_pdfs p ON p.id = c.pdf_id AND p.company_id = ${input.companyId} AND p.deleted_at IS NULL
          JOIN obra_pavimentos pv ON pv.id = p.pavimento_id AND pv.company_id = ${input.companyId}
          LEFT JOIN medicao_campo mc ON mc.id = c.medicao_campo_id
          WHERE c.company_id = ${input.companyId} AND c.deleted_at IS NULL
            AND (mc.id IS NULL OR mc.deleted_at IS NULL)
          GROUP BY pv.obra_id
        ), done AS (
          -- ambientes 100% apontados (ledger por contorno)
          SELECT pv.obra_id, COUNT(*) AS concluidos FROM (
            SELECT a.contorno_id, MIN(a.obra_id) AS obra_id
            FROM apontamentos_producao a
            WHERE a.company_id = ${input.companyId} AND a.ativo = 1
              AND a.status <> 'glosado' AND a.contorno_id IS NOT NULL
            GROUP BY a.contorno_id
            HAVING COALESCE(SUM(a.percentual),0) >= 99.99
          ) d
          JOIN medicao_campo_contornos c ON c.id = d.contorno_id AND c.deleted_at IS NULL
          JOIN medicao_campo_pdfs p ON p.id = c.pdf_id AND p.deleted_at IS NULL
          JOIN obra_pavimentos pv ON pv.id = p.pavimento_id
          LEFT JOIN medicao_campo mc ON mc.id = c.medicao_campo_id AND mc.deleted_at IS NOT NULL
          WHERE mc.id IS NULL
          GROUP BY pv.obra_id
        ), apt AS (
          SELECT obra_id,
                 COUNT(*) FILTER (WHERE data = CURRENT_DATE) AS hoje,
                 COUNT(*) AS total
          FROM apontamentos_producao
          WHERE company_id = ${input.companyId} AND ativo = 1
          GROUP BY obra_id
        ), ct AS (
          SELECT obra_id, COUNT(*) AS contratos FROM terceiro_contratos
          WHERE company_id = ${input.companyId}
            AND status IN ('ativo','em_andamento','assinado','vigente')
          GROUP BY obra_id
        )
        SELECT COALESCE(pav.obra_id, amb.obra_id, apt.obra_id, ct.obra_id) AS "obraId",
               COALESCE(pav.pavimentos,0)::int AS pavimentos,
               COALESCE(amb.ambientes,0)::int AS ambientes,
               COALESCE(apt.hoje,0)::int AS "apontamentosHoje",
               COALESCE(apt.total,0)::int AS "apontamentosTotal",
               COALESCE(done.concluidos,0)::int AS "ambientesConcluidos",
               COALESCE(ct.contratos,0)::int AS contratos
        FROM pav
        FULL JOIN amb ON amb.obra_id = pav.obra_id
        FULL JOIN apt ON apt.obra_id = COALESCE(pav.obra_id, amb.obra_id)
        FULL JOIN done ON done.obra_id = COALESCE(pav.obra_id, amb.obra_id, apt.obra_id)
        FULL JOIN ct ON ct.obra_id = COALESCE(pav.obra_id, amb.obra_id, apt.obra_id, done.obra_id)
      `).then((r: any) => r.rows ?? r);
      return rows;
    }),

  // ───────────── Dados da ronda: pavimentos + ambientes (contornos) + % já apontado ─────────────
  getRonda: protectedProcedure
    .input(z.object({ companyId: z.number(), obraId: z.number() }))
    .query(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = (await getDb())!;
      const pavimentos = await db.select({
        id: obraPavimentos.id, nome: obraPavimentos.nome,
      }).from(obraPavimentos)
        .where(and(eq(obraPavimentos.companyId, input.companyId), eq(obraPavimentos.obraId, input.obraId)));

      // contornos (ambientes) dos levantamentos da obra, via PDF → pavimento
      const contornos = pavimentos.length ? await db.execute(sql`
        SELECT c.id, c.rotulo, c.servico, c.quantidade, c.unidade, c.area, p.pavimento_id AS "pavimentoId",
               c.pdf_id AS "pdfId", c.pagina,
               c.orcamento_item_id AS "orcamentoItemId", c.item_eap_codigo AS "itemEapCodigo", c.item_descricao AS "itemDescricao"
        FROM medicao_campo_contornos c
        JOIN medicao_campo_pdfs p ON p.id = c.pdf_id AND p.deleted_at IS NULL
        LEFT JOIN medicao_campo mc ON mc.id = c.medicao_campo_id
        WHERE c.company_id = ${input.companyId}
          AND p.pavimento_id IN (${sql.join(pavimentos.map((p: any) => sql`${p.id}`), sql`, `)})
          AND c.deleted_at IS NULL
          AND (mc.id IS NULL OR mc.deleted_at IS NULL)
        ORDER BY p.pavimento_id, c.id
      `).then((r: any) => r.rows ?? r) : [];

      // ledger: % acumulado por trecho+serviço
      const acumulado = await db.execute(sql`
        SELECT contorno_id AS "contornoId", pavimento_id AS "pavimentoId",
               COALESCE(local,'') AS local, servico,
               SUM(percentual)::numeric AS pct
        FROM apontamentos_producao
        WHERE company_id = ${input.companyId} AND obra_id = ${input.obraId}
          AND ativo = 1 AND status <> 'glosado'
        GROUP BY 1,2,3,4
      `).then((r: any) => r.rows ?? r);

      // serviços do catálogo (definidos) p/ o seletor
      const servicos = await db.select({
        servico: medicaoCriterios.servico, unidade: medicaoCriterios.unidade,
      }).from(medicaoCriterios)
        .where(and(eq(medicaoCriterios.companyId, input.companyId), eq(medicaoCriterios.ativo, 1), eq(medicaoCriterios.status, "definido")))
        .orderBy(medicaoCriterios.servico);

      return { pavimentos, contornos, acumulado, servicos };
    }),

  // ───────────── Previsto de hoje (Task 156): guia do apontador ─────────────
  // LÊ o cronograma do Planejamento (nunca escreve; motor do % Previsto é
  // CONGELADO — aqui é só uma listagem de atividades ativas na data).
  // Regra: atividade folha (não grupo/marco/indireta/desabilitada) da revisão
  // mais recente do(s) projeto(s) da obra, com data_inicio <= hoje <= data_fim.
  // "Realizado" = existe apontamento HOJE na obra cujo serviço compartilha
  // ≥1 token relevante com o nome da atividade (mesmo fuzzy do resolver).
  previstoHoje: protectedProcedure
    .input(z.object({ companyId: z.number(), obraId: z.number() }))
    .query(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = (await getDb())!;

      // Data de "hoje" ÚNICA (fuso da obra/BR) usada nas DUAS pontas — janela do
      // cronograma E apontamentos do dia — pra não divergir perto da meia-noite
      // quando a sessão do banco está em UTC.
      const hojeStr = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }); // YYYY-MM-DD

      // projetos de planejamento da obra → revisão VIGENTE de cada um:
      // a mais recente APROVADA; só cai pra "qualquer" se nenhuma foi aprovada
      // (mesma convenção do Planejamento — replan em rascunho não guia o campo).
      const projetos = await db.execute(sql`
        SELECT p.id, p.nome,
               COALESCE(
                 (SELECT r.id FROM planejamento_revisoes r
                  WHERE r.projeto_id = p.id AND r.status = 'aprovada'
                  ORDER BY r.numero DESC, r.id DESC LIMIT 1),
                 (SELECT r.id FROM planejamento_revisoes r
                  WHERE r.projeto_id = p.id
                  ORDER BY r.numero DESC, r.id DESC LIMIT 1)
               ) AS "revisaoId"
        FROM planejamento_projetos p
        WHERE p.company_id = ${input.companyId} AND p.obra_id = ${input.obraId}
      `).then((r: any) => r.rows ?? r);
      const revisaoIds = projetos.map((p: any) => Number(p.revisaoId)).filter((n: number) => n > 0);
      if (!revisaoIds.length) return { temPlanejamento: false, atividades: [], forasDoPrevisto: [] };

      // Todas as atividades das revisões (ordenadas) — precisamos da hierarquia
      // completa pra descobrir o GRUPO pai (pavimento/frente) de cada folha.
      const todas = await db.execute(sql`
        SELECT a.id, a.revisao_id AS "revisaoId", a.nome, a.nivel, a.ordem,
               a.eap_codigo AS "eapCodigo", a.is_grupo AS "isGrupo",
               a.is_marco AS "isMarco", a.is_indireta AS "isIndireta", a.disabled,
               a.data_inicio AS "dataInicio", a.data_fim AS "dataFim",
               a.data_inicio_real AS "dataInicioReal", a.data_fim_real AS "dataFimReal"
        FROM planejamento_atividades a
        WHERE a.revisao_id IN (${sql.join(revisaoIds.map((i: number) => sql`${i}`), sql`, `)})
        ORDER BY a.revisao_id, a.ordem, a.eap_codigo
      `).then((r: any) => r.rows ?? r);

      // apontamentos de HOJE na obra (pra marcar o checklist como realizado)
      const aptHoje = await db.execute(sql`
        SELECT servico, SUM(percentual)::numeric AS pct, COUNT(*)::int AS qtd
        FROM apontamentos_producao
        WHERE company_id = ${input.companyId} AND obra_id = ${input.obraId}
          AND ativo = 1 AND status <> 'glosado' AND data = ${hojeStr}::date
        GROUP BY servico
      `).then((r: any) => r.rows ?? r);

      const d10 = (v: any) => (v ? String(v).slice(0, 10) : "");

      // hierarquia: pilha de grupos por nível (por revisão, na ordem do cronograma)
      const atividades: any[] = [];
      let stack: { nivel: number; nome: string }[] = [];
      let revAtual = 0;
      for (const a of todas) {
        if (Number(a.revisaoId) !== revAtual) { revAtual = Number(a.revisaoId); stack = []; }
        const nivel = Number(a.nivel || 0);
        while (stack.length && stack[stack.length - 1].nivel >= nivel) stack.pop();
        if (a.isGrupo) { stack.push({ nivel, nome: String(a.nome || "") }); continue; }
        if (a.isMarco || a.isIndireta || a.disabled) continue;
        const ini = d10(a.dataInicio), fim = d10(a.dataFim);
        if (!ini || !fim) continue;
        if (d10(a.dataFimReal)) continue;             // já concluída no cronograma
        // Janela de hoje OU atrasada (fim já passou e não concluiu — exceção
        // que merece alerta; atividades futuras ficam de fora).
        const atrasada = fim < hojeStr;
        if (ini > hojeStr) continue;
        // matching fuzzy atividade ↔ serviços apontados hoje
        const match = (aptHoje as any[]).filter((s: any) => itemCobreServico(String(a.nome || ""), String(s.servico || "")) || itemCobreServico(String(s.servico || ""), String(a.nome || "")));
        atividades.push({
          id: Number(a.id),
          nome: String(a.nome || ""),
          grupo: stack.length ? stack[stack.length - 1].nome : "",
          eapCodigo: a.eapCodigo || "",
          dataInicio: ini, dataFim: fim,
          terminaHoje: fim === hojeStr,
          comecaHoje: ini === hojeStr,
          atrasada,
          realizadoHoje: match.length > 0,
          pctHoje: match.reduce((s: number, m: any) => s + Number(m.pct || 0), 0),
        });
      }

      // serviços apontados hoje que não casam com NENHUMA atividade prevista
      const cobertos = new Set<string>();
      for (const a of atividades) {
        for (const s of aptHoje as any[]) {
          if (itemCobreServico(String(a.nome || ""), String(s.servico || "")) || itemCobreServico(String(s.servico || ""), String(a.nome || ""))) cobertos.add(String(s.servico || ""));
        }
      }
      const forasDoPrevisto = (aptHoje as any[])
        .filter((s: any) => !cobertos.has(String(s.servico || "")))
        .map((s: any) => ({ servico: String(s.servico || ""), qtd: Number(s.qtd || 0) }));

      return { temPlanejamento: true, atividades, forasDoPrevisto };
    }),

  // ───────────── Planta do pavimento (visualização read-only na ronda) ─────────────
  getPlanta: protectedProcedure
    .input(z.object({ companyId: z.number(), obraId: z.number(), pavimentoId: z.number() }))
    .query(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = (await getDb())!;
      // pavimento ∈ empresa + obra (anti-IDOR)
      const [pav] = await db.select({ id: obraPavimentos.id, nome: obraPavimentos.nome }).from(obraPavimentos)
        .where(and(eq(obraPavimentos.id, input.pavimentoId),
          eq(obraPavimentos.companyId, input.companyId), eq(obraPavimentos.obraId, input.obraId)));
      if (!pav) throw new TRPCError({ code: "BAD_REQUEST", message: "Pavimento não pertence a esta obra." });
      const pdfs = await db.execute(sql`
        SELECT id, nome, arquivo_url AS "arquivoUrl", num_paginas AS "numPaginas"
        FROM medicao_campo_pdfs
        WHERE company_id = ${input.companyId} AND pavimento_id = ${input.pavimentoId} AND deleted_at IS NULL
        ORDER BY atualizado_em DESC NULLS LAST, id DESC
      `).then((r: any) => r.rows ?? r);
      const pdfIds = pdfs.map((p: any) => Number(p.id));
      const contornos = pdfIds.length ? await db.execute(sql`
        SELECT c.id, c.pdf_id AS "pdfId", c.pagina, c.tipo, c.cor, c.rotulo, c.servico, c.geometria_json AS "geometriaJson"
        FROM medicao_campo_contornos c
        LEFT JOIN medicao_campo mc ON mc.id = c.medicao_campo_id
        WHERE c.company_id = ${input.companyId} AND c.deleted_at IS NULL
          AND (mc.id IS NULL OR mc.deleted_at IS NULL)
          AND c.pdf_id IN (${sql.join(pdfIds.map((i: number) => sql`${i}`), sql`, `)})
        ORDER BY c.id
      `).then((r: any) => r.rows ?? r) : [];
      return { pavimento: pav, pdfs, contornos };
    }),

  // ───────────── Ronda como EDITOR (Task 150): resolve qual medicao_campo
  // recebe o desenho do pavimento. Preferência: campo ABERTO (não consolidado)
  // mais recente; senão o consolidado mais recente (só-leitura no editor).
  resolverCampoDoPavimento: protectedProcedure
    .input(z.object({ companyId: z.number(), obraId: z.number(), pavimentoId: z.number() }))
    .query(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = (await getDb())!;
      // pavimento ∈ empresa + obra (anti-IDOR)
      const [pav] = await db.select({ id: obraPavimentos.id }).from(obraPavimentos)
        .where(and(eq(obraPavimentos.id, input.pavimentoId),
          eq(obraPavimentos.companyId, input.companyId), eq(obraPavimentos.obraId, input.obraId)));
      if (!pav) throw new TRPCError({ code: "BAD_REQUEST", message: "Pavimento não pertence a esta obra." });
      const rows = await db.execute(sql`
        SELECT mc.id AS "campoId", mc.contrato_id AS "contratoId", mc.origem,
               (mc.consolidado_em IS NOT NULL) AS consolidado,
               p.id AS "pdfId", mc.atualizado_em AS "atualizadoEm"
        FROM medicao_campo_pdfs p
        JOIN medicao_campo mc ON mc.id = p.medicao_campo_id AND mc.deleted_at IS NULL
          AND mc.company_id = ${input.companyId}
        WHERE p.company_id = ${input.companyId} AND p.pavimento_id = ${input.pavimentoId}
          AND p.deleted_at IS NULL
          -- Anti-IDOR / isolamento por OBRA: o CONTRATO do campo tem que
          -- pertencer à MESMA obra do pavimento tocado, nas duas origens
          -- (IDs de contrato colidem entre cliente e terceiros).
          -- Exceção: campo 'biblioteca' (plantas do cadastro da obra) já está
          -- ancorado pelo PAVIMENTO (validado acima: pavimento ∈ empresa+obra);
          -- o contrato original pode ter sido excluído sem órfãnar as plantas.
          AND (
            mc.status = 'biblioteca'
            OR
            (mc.origem = 'terceiro' AND EXISTS (
              SELECT 1 FROM terceiro_contratos tc
              WHERE tc.id = mc.contrato_id AND tc.company_id = ${input.companyId}
                AND tc.obra_id = ${input.obraId}
            ))
            OR
            (COALESCE(mc.origem,'cliente') <> 'terceiro' AND EXISTS (
              SELECT 1 FROM medicao_contratos mcc
              JOIN planejamento_projetos pp ON pp.id = mcc.projeto_id
                AND pp.company_id = ${input.companyId}
              WHERE mcc.id = mc.contrato_id AND mcc.company_id = ${input.companyId}
                AND pp.obra_id = ${input.obraId}
            ))
          )
        ORDER BY (mc.status = 'biblioteca') DESC, (mc.consolidado_em IS NULL) DESC, mc.atualizado_em DESC NULLS LAST, mc.id DESC
        LIMIT 1
      `).then((r: any) => (r.rows ?? r)[0] ?? null);
      // Planta é da OBRA: normaliza a biblioteca (re-ancora em obra_id e corta o
      // vínculo com contrato). A Ronda navega com contratoId=0 — o contrato só
      // entra no APONTAMENTO (resolvido por equipe/frente, não pela planta).
      if (rows) {
        const [mcRow] = await db.select({ status: medicaoCampo.status, obraId: medicaoCampo.obraId })
          .from(medicaoCampo).where(and(eq(medicaoCampo.id, Number(rows.campoId)), eq(medicaoCampo.companyId, input.companyId)));
        if (mcRow?.status === "biblioteca") {
          if (!mcRow.obraId || Number(rows.contratoId) !== 0 || String(rows.origem || "cliente") === "terceiro") {
            await db.update(medicaoCampo)
              // Rev. 4862 — biblioteca da obra NUNCA é 'terceiro': origem terceiro
              // com contrato 0 fazia o editor buscar itens de um contrato
              // inexistente e o combobox da EAP ficava eternamente vazio.
              .set({ obraId: input.obraId, contratoId: 0, origem: "cliente", titulo: "Plantas da obra", atualizadoEm: new Date() })
              .where(and(eq(medicaoCampo.id, Number(rows.campoId)), eq(medicaoCampo.companyId, input.companyId)));
          }
          rows.contratoId = 0;
          rows.origem = "cliente";
        }
      }
      return rows ? {
        campoId: Number(rows.campoId), contratoId: Number(rows.contratoId),
        origem: String(rows.origem || "cliente"), consolidado: !!rows.consolidado,
        pdfId: Number(rows.pdfId),
      } : null;
    }),

  // ───────────── Aprendizado de vínculo EAP (Task 150): por OBRA, o item da
  // planilha mais usado em cada categoria de serviço — a próxima sugestão já
  // vem pré-selecionada (1 toque confirma; nunca vincula sozinho).
  // CONTRATO DE IDENTIFICADOR: `servico` aqui é a CHAVE do catálogo de
  // categorias do levantamento (medicao_campo_contornos.servico), a MESMA
  // chave que o editor usa em listServicosLevantamento (s.chave) — o casamento
  // sugestão↔contorno é feito nesse domínio, não no de medicao_criterios.
  vinculosAprendidos: protectedProcedure
    .input(z.object({ companyId: z.number(), obraId: z.number() }))
    .query(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = (await getDb())!;
      const rows = await db.execute(sql`
        SELECT c.servico, c.orcamento_item_id AS "orcamentoItemId",
               COUNT(*)::int AS usos, MAX(c.id) AS "ultimoId"
        FROM medicao_campo_contornos c
        JOIN medicao_campo_pdfs p ON p.id = c.pdf_id AND p.deleted_at IS NULL
          AND p.company_id = ${input.companyId}
        JOIN obra_pavimentos pv ON pv.id = p.pavimento_id AND pv.obra_id = ${input.obraId}
          AND pv.company_id = ${input.companyId}
        WHERE c.company_id = ${input.companyId} AND c.deleted_at IS NULL
          AND c.servico IS NOT NULL AND c.orcamento_item_id IS NOT NULL
        GROUP BY c.servico, c.orcamento_item_id
        ORDER BY c.servico, COUNT(*) DESC, MAX(c.id) DESC
      `).then((r: any) => r.rows ?? r);
      return rows as { servico: string; orcamentoItemId: number; usos: number }[];
    }),

  // ───────────── Sugestão de contrato ─────────────
  resolverContrato: protectedProcedure
    .input(z.object({ companyId: z.number(), obraId: z.number(), servico: z.string(), pavimentoId: z.number().nullish() }))
    .query(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = (await getDb())!;
      return resolverCandidatos(db, input.companyId, input.obraId, input.servico, input.pavimentoId ?? null);
    }),

  // ───────────── Criar apontamento (com ledger de 100%) ─────────────
  criar: protectedProcedure
    .input(z.object({
      companyId: z.number(), obraId: z.number(),
      pavimentoId: z.number().nullish(), contornoId: z.number().nullish(),
      local: z.string().max(200).nullish(),
      servico: z.string().min(2).max(100),
      contratoId: z.number().nullish(), contratoItemId: z.number().nullish(),
      percentual: z.number().gt(0).max(100),
      quantidade: z.number().nullish(), unidade: z.string().max(10).nullish(),
      data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      observacoes: z.string().max(2000).nullish(),
      fotoUrl: z.string().max(500).nullish(),
      fotoBase64: z.string().max(12_000_000).nullish(), // foto do serviço tirada na hora (celular)
      fotoContentType: z.string().max(100).nullish(),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx.user, input.companyId);
      if (!input.contornoId && !String(input.local || "").trim()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Informe o ambiente (contorno) ou descreva o local." });
      }
      const db = (await getDb())!;

      // valida obra pertence à empresa (anti-IDOR)
      const [ob] = await db.select({ id: obras.id }).from(obras)
        .where(and(eq(obras.id, input.obraId), eq(obras.companyId, input.companyId)));
      if (!ob) throw new TRPCError({ code: "BAD_REQUEST", message: "Obra não pertence a esta empresa." });

      // valida contrato pertence à empresa/obra (anti-IDOR)
      if (input.contratoId) {
        const [ct] = await db.select({ id: terceiroContratos.id }).from(terceiroContratos)
          .where(and(eq(terceiroContratos.id, input.contratoId),
            eq(terceiroContratos.companyId, input.companyId),
            eq(terceiroContratos.obraId, input.obraId)));
        if (!ct) throw new TRPCError({ code: "BAD_REQUEST", message: "Contrato não pertence a esta obra/empresa." });
        // item do contrato deve pertencer ao próprio contrato
        if (input.contratoItemId) {
          const [it] = await db.select({ id: terceiroContratoItens.id }).from(terceiroContratoItens)
            .where(and(eq(terceiroContratoItens.id, input.contratoItemId),
              eq(terceiroContratoItens.contratoId, input.contratoId),
              eq(terceiroContratoItens.companyId, input.companyId)));
          if (!it) throw new TRPCError({ code: "BAD_REQUEST", message: "Item não pertence a este contrato." });
        }
      } else if (input.contratoItemId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Item de contrato informado sem contrato." });
      }
      // valida contorno pertence à OBRA informada (cadeia contorno → pdf → pavimento → obra)
      if (input.contornoId) {
        const co = await db.execute(sql`
          SELECT c.id, p.pavimento_id AS "pavimentoId"
          FROM medicao_campo_contornos c
          JOIN medicao_campo_pdfs p ON p.id = c.pdf_id
          JOIN obra_pavimentos pv ON pv.id = p.pavimento_id
          WHERE c.id = ${input.contornoId} AND c.company_id = ${input.companyId}
            AND pv.obra_id = ${input.obraId} AND c.deleted_at IS NULL
        `).then((r: any) => (r.rows ?? r)[0]);
        if (!co) throw new TRPCError({ code: "BAD_REQUEST", message: "Ambiente (contorno) não pertence a esta obra." });
      }
      // valida pavimento ∈ obra
      if (input.pavimentoId) {
        const [pv] = await db.select({ id: obraPavimentos.id }).from(obraPavimentos)
          .where(and(eq(obraPavimentos.id, input.pavimentoId),
            eq(obraPavimentos.companyId, input.companyId), eq(obraPavimentos.obraId, input.obraId)));
        if (!pv) throw new TRPCError({ code: "BAD_REQUEST", message: "Pavimento não pertence a esta obra." });
      }

      // Foto opcional tirada na hora — sobe pro storage antes da transação.
      let fotoUrl = input.fotoUrl || null;
      if (input.fotoBase64) {
        const buf = Buffer.from(input.fotoBase64, "base64");
        if (buf.length > 8 * 1024 * 1024) throw new TRPCError({ code: "BAD_REQUEST", message: "Foto muito grande (máx. 8 MB)." });
        // Valida pelos MAGIC BYTES (não confia no content-type do cliente) — só raster seguro.
        const isJpeg = buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
        const isPng = buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
        const isWebp = buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP";
        if (!isJpeg && !isPng && !isWebp) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "A foto deve ser JPEG, PNG ou WebP." });
        }
        const ct = isPng ? "image/png" : isWebp ? "image/webp" : "image/jpeg";
        const ext = isPng ? "png" : isWebp ? "webp" : "jpg";
        const key = `apontamento-campo/${input.companyId}/${input.obraId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const up = await storagePut(key, buf, ct);
        fotoUrl = up.url;
      }

      // Ledger anti-duplicidade dentro de transação com advisory lock por chave do
      // trecho — duas requisições simultâneas no mesmo trecho+serviço serializam,
      // então a soma nunca passa de 100% mesmo sob corrida.
      // Poucos cliques: sem contrato indicado, o server tenta resolver sozinho
      // (cascata itens → Mapa de Frentes) — uma equipe só = vai automático;
      // ambíguo = fica sem contrato (o usuário indica quando quiser).
      let contratoIdFinal: number | null = input.contratoId ?? null;
      if (contratoIdFinal == null && input.servico) {
        try {
          const res = await resolverCandidatos(db, input.companyId, input.obraId, input.servico, input.pavimentoId ?? null);
          contratoIdFinal = res.resolvido?.id ?? null;
        } catch { /* mantém null */ }
      }

      const chaveLocal = String(input.local || "").trim().toUpperCase();
      const chaveLedger = input.contornoId
        ? `apc:${input.companyId}:c${input.contornoId}:${norm(input.servico)}`
        : `apc:${input.companyId}:o${input.obraId}:p${input.pavimentoId ?? 0}:${chaveLocal}:${norm(input.servico)}`;
      return await db.transaction(async (tx: any) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(478008, hashtext(${chaveLedger}))`);
        const rows = await tx.execute(sql`
          SELECT COALESCE(SUM(percentual),0)::numeric AS pct
          FROM apontamentos_producao
          WHERE company_id = ${input.companyId} AND obra_id = ${input.obraId}
            AND servico = ${input.servico} AND ativo = 1 AND status <> 'glosado'
            AND ${input.contornoId
              ? sql`contorno_id = ${input.contornoId}`
              : sql`contorno_id IS NULL AND COALESCE(pavimento_id,0) = ${input.pavimentoId ?? 0} AND UPPER(COALESCE(local,'')) = ${chaveLocal}`}
        `).then((r: any) => r.rows ?? r);
        const jaApontado = Number(rows?.[0]?.pct || 0);
        if (jaApontado + input.percentual > 100.001) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Este trecho já tem ${jaApontado.toFixed(0)}% apontado para "${input.servico}" — só restam ${Math.max(0, 100 - jaApontado).toFixed(0)}%. Nada é pago duas vezes.`,
          });
        }
        const [row] = await tx.insert(apontamentosProducao).values({
          companyId: input.companyId, obraId: input.obraId,
          pavimentoId: input.pavimentoId ?? null, contornoId: input.contornoId ?? null,
          local: input.local || null, servico: input.servico,
          contratoId: contratoIdFinal, contratoItemId: input.contratoItemId ?? null,
          percentual: String(input.percentual), quantidade: input.quantidade != null ? String(input.quantidade) : null,
          unidade: input.unidade || "m2", data: input.data,
          observacoes: input.observacoes || null, fotoUrl,
          criadoPor: ctx.user?.name || ctx.user?.email || String(ctx.user?.id || ""),
        }).returning();
        return row;
      });
    }),

  // ───────────── Apontamento RÁPIDO (1 toque no checklist da ronda) ─────────────
  // Poka-yoke "poucos cliques": o apontador só confirma "Feito"/"Metade" no
  // cartão do ambiente; o SERVIDOR faz o trabalho pesado — deriva o serviço do
  // contorno, resolve o contrato pela cascata (itens → Mapa de Frentes), calcula
  // a quantidade e respeita o ledger de 100%. Zero digitação.
  criarRapido: protectedProcedure
    .input(z.object({
      companyId: z.number(), obraId: z.number(), contornoId: z.number(),
      modo: z.enum(["resto", "metade"]).default("resto"),
      data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = (await getDb())!;
      // contorno → pdf → pavimento → obra (anti-IDOR) + dados p/ derivar tudo
      const co = await db.execute(sql`
        SELECT c.id, c.servico, c.quantidade, c.area, c.unidade, p.pavimento_id AS "pavimentoId"
        FROM medicao_campo_contornos c
        JOIN medicao_campo_pdfs p ON p.id = c.pdf_id AND p.company_id = ${input.companyId}
        JOIN obra_pavimentos pv ON pv.id = p.pavimento_id AND pv.company_id = ${input.companyId}
        WHERE c.id = ${input.contornoId} AND c.company_id = ${input.companyId}
          AND pv.obra_id = ${input.obraId} AND c.deleted_at IS NULL
      `).then((r: any) => (r.rows ?? r)[0]);
      if (!co) throw new TRPCError({ code: "BAD_REQUEST", message: "Ambiente (contorno) não pertence a esta obra." });
      const servico = String(co.servico || "").trim();
      if (!servico) throw new TRPCError({ code: "BAD_REQUEST", message: "Este ambiente não tem serviço classificado no levantamento — use o apontamento detalhado." });

      // resolve contrato no server (cascata + frentes)
      const res = await resolverCandidatos(db, input.companyId, input.obraId, servico, co.pavimentoId ?? null);
      const contratoId = res.resolvido?.id ?? null;

      const d = input.data || new Date().toISOString().slice(0, 10);
      const chaveLedger = `apc:${input.companyId}:c${input.contornoId}:${norm(servico)}`;
      return await db.transaction(async (tx: any) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(478008, hashtext(${chaveLedger}))`);
        const rows = await tx.execute(sql`
          SELECT COALESCE(SUM(percentual),0)::numeric AS pct
          FROM apontamentos_producao
          WHERE company_id = ${input.companyId} AND obra_id = ${input.obraId}
            AND servico = ${servico} AND ativo = 1 AND status <> 'glosado'
            AND contorno_id = ${input.contornoId}
        `).then((r: any) => r.rows ?? r);
        const jaApontado = Number(rows?.[0]?.pct || 0);
        const restante = Math.max(0, 100 - jaApontado);
        if (restante <= 0.001) throw new TRPCError({ code: "BAD_REQUEST", message: "Este trecho já está 100% apontado." });
        const pct = input.modo === "metade" ? Math.min(50, restante) : restante;
        const qtdTotal = Number(co.quantidade) || Number(co.area) || null;
        const [row] = await tx.insert(apontamentosProducao).values({
          companyId: input.companyId, obraId: input.obraId,
          pavimentoId: co.pavimentoId ?? null, contornoId: input.contornoId,
          local: null, servico,
          contratoId, contratoItemId: null,
          percentual: String(pct), quantidade: qtdTotal != null ? String(qtdTotal * pct / 100) : null,
          unidade: co.unidade || "m2", data: d,
          observacoes: null, fotoUrl: null,
          criadoPor: ctx.user?.name || ctx.user?.email || String(ctx.user?.id || ""),
        }).returning();
        return { ...row, contratoResolvidoVia: res.via, semContrato: !contratoId };
      });
    }),

  // ───────────── Listar (painel do dia / período) ─────────────
  listar: protectedProcedure
    .input(z.object({
      companyId: z.number(), obraId: z.number().nullish(),
      dataIni: z.string().nullish(), dataFim: z.string().nullish(),
      contratoId: z.number().nullish(), status: z.string().nullish(),
    }))
    .query(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = (await getDb())!;
      const conds: any[] = [eq(apontamentosProducao.companyId, input.companyId), eq(apontamentosProducao.ativo, 1)];
      if (input.obraId) conds.push(eq(apontamentosProducao.obraId, input.obraId));
      if (input.contratoId) conds.push(eq(apontamentosProducao.contratoId, input.contratoId));
      if (input.status) conds.push(eq(apontamentosProducao.status, input.status));
      if (input.dataIni) conds.push(sql`${apontamentosProducao.data} >= ${input.dataIni}`);
      if (input.dataFim) conds.push(sql`${apontamentosProducao.data} <= ${input.dataFim}`);
      const rows = await db.select().from(apontamentosProducao)
        .where(and(...conds)).orderBy(desc(apontamentosProducao.data), desc(apontamentosProducao.id)).limit(500);

      // enriquecer com nomes de pavimento/contorno/contrato
      const pavIds = [...new Set(rows.map((r: any) => r.pavimentoId).filter(Boolean))] as number[];
      const ctIds = [...new Set(rows.map((r: any) => r.contratoId).filter(Boolean))] as number[];
      const coIds = [...new Set(rows.map((r: any) => r.contornoId).filter(Boolean))] as number[];
      const [pavs, cts, cos] = await Promise.all([
        pavIds.length ? db.select({ id: obraPavimentos.id, nome: obraPavimentos.nome }).from(obraPavimentos).where(inArray(obraPavimentos.id, pavIds)) : [],
        ctIds.length ? db.select({ id: terceiroContratos.id, numeroContrato: terceiroContratos.numeroContrato, descricao: terceiroContratos.descricao }).from(terceiroContratos).where(inArray(terceiroContratos.id, ctIds)) : [],
        coIds.length ? db.select({ id: medicaoCampoContornos.id, rotulo: medicaoCampoContornos.rotulo }).from(medicaoCampoContornos).where(inArray(medicaoCampoContornos.id, coIds)) : [],
      ]);
      const pavMap = Object.fromEntries((pavs as any[]).map(p => [p.id, p.nome]));
      const ctMap = Object.fromEntries((cts as any[]).map(c => [c.id, c.numeroContrato || c.descricao || `#${c.id}`]));
      const coMap = Object.fromEntries((cos as any[]).map(c => [c.id, c.rotulo]));
      return rows.map((r: any) => ({
        ...r,
        pavimentoNome: r.pavimentoId ? pavMap[r.pavimentoId] || null : null,
        contratoNome: r.contratoId ? ctMap[r.contratoId] || null : null,
        contornoRotulo: r.contornoId ? coMap[r.contornoId] || null : null,
      }));
    }),

  // ───────────── Excluir (soft; só apontado) ─────────────
  excluir: protectedProcedure
    .input(z.object({ companyId: z.number(), id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = (await getDb())!;
      const res = await db.update(apontamentosProducao)
        .set({ ativo: 0 })
        .where(and(eq(apontamentosProducao.id, input.id),
          eq(apontamentosProducao.companyId, input.companyId),
          eq(apontamentosProducao.status, "apontado"), eq(apontamentosProducao.ativo, 1)))
        .returning({ id: apontamentosProducao.id });
      if (!res.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Apontamento não encontrado ou já validado (não pode ser excluído)." });
      return { ok: true };
    }),

  // ───────────── Mapa de Frentes ─────────────
  listarFrentes: protectedProcedure
    .input(z.object({ companyId: z.number(), obraId: z.number() }))
    .query(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = (await getDb())!;
      const frentes = await db.select().from(contratoFrentes)
        .where(and(eq(contratoFrentes.companyId, input.companyId), eq(contratoFrentes.obraId, input.obraId)));
      const contratos = await db.select({
        id: terceiroContratos.id, numeroContrato: terceiroContratos.numeroContrato,
        descricao: terceiroContratos.descricao, status: terceiroContratos.status,
      }).from(terceiroContratos)
        .where(and(eq(terceiroContratos.companyId, input.companyId), eq(terceiroContratos.obraId, input.obraId),
          inArray(terceiroContratos.status, ["ativo", "em_andamento", "assinado", "vigente"])));
      return { frentes, contratos };
    }),

  alternarFrente: protectedProcedure
    .input(z.object({ companyId: z.number(), obraId: z.number(), contratoId: z.number(), pavimentoId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = (await getDb())!;
      // valida contrato ∈ empresa+obra
      const [ct] = await db.select({ id: terceiroContratos.id }).from(terceiroContratos)
        .where(and(eq(terceiroContratos.id, input.contratoId),
          eq(terceiroContratos.companyId, input.companyId), eq(terceiroContratos.obraId, input.obraId)));
      if (!ct) throw new TRPCError({ code: "BAD_REQUEST", message: "Contrato não pertence a esta obra/empresa." });
      const [pav] = await db.select({ id: obraPavimentos.id }).from(obraPavimentos)
        .where(and(eq(obraPavimentos.id, input.pavimentoId),
          eq(obraPavimentos.companyId, input.companyId), eq(obraPavimentos.obraId, input.obraId)));
      if (!pav) throw new TRPCError({ code: "BAD_REQUEST", message: "Pavimento inválido." });

      const existing = await db.select({ id: contratoFrentes.id }).from(contratoFrentes)
        .where(and(eq(contratoFrentes.contratoId, input.contratoId), eq(contratoFrentes.pavimentoId, input.pavimentoId)));
      if (existing.length) {
        await db.delete(contratoFrentes).where(eq(contratoFrentes.id, existing[0].id));
        return { ativo: false };
      }
      await db.insert(contratoFrentes).values({
        companyId: input.companyId, contratoId: input.contratoId,
        obraId: input.obraId, pavimentoId: input.pavimentoId,
        criadoPor: ctx.user?.name || ctx.user?.email || String(ctx.user?.id || ""),
      }).onConflictDoNothing();
      return { ativo: true };
    }),
});
