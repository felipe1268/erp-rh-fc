// Rev. 3901 — APR Análise Preliminar de Risco — router tRPC
import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { aprAnalises, aprRiscos, employees, obras, companies } from "../../drizzle/schema";
import { eq, and, desc, sql, isNull, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

function assertCompany(ctx: any, companyId: number) {
  if (ctx.user?.companyId && String(ctx.user.companyId) !== String(companyId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado." });
  }
}

async function proximoNumero(db: any, companyId: number): Promise<string> {
  const [row] = await db
    .select({ max: sql<string>`max(${aprAnalises.numero})` })
    .from(aprAnalises)
    .where(and(eq(aprAnalises.companyId, companyId), isNull(aprAnalises.deletedAt)));
  const last = row?.max;
  if (!last) return "APR-001";
  const match = last.match(/(\d+)$/);
  const next = match ? Number(match[1]) + 1 : 1;
  return `APR-${String(next).padStart(3, "0")}`;
}

const riscosInputSchema = z.array(z.object({
  id:              z.number().optional(),
  ordem:           z.number().default(0),
  etapaAtividade:  z.string().optional().nullable(),
  perigo:          z.string().optional().nullable(),
  risco:           z.string().optional().nullable(),
  tipoRisco:       z.string().optional().nullable(),
  probabilidade:   z.number().min(1).max(5).optional().nullable(),
  gravidade:       z.number().min(1).max(5).optional().nullable(),
  medidasControle: z.string().optional().nullable(),
  tipoMedida:      z.string().optional().nullable(),
  responsavelNome: z.string().optional().nullable(),
  prazo:           z.string().optional().nullable(),
  situacao:        z.string().optional().nullable(),
}));

export const aprAnalisesRouter = router({
  // ── Lista ──────────────────────────────────────────────────────────────────
  list: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      status:    z.string().optional(),
      obraId:    z.number().optional(),
      limit:     z.number().default(50),
      offset:    z.number().default(0),
    }))
    .query(async ({ input, ctx }) => {
      assertCompany(ctx, input.companyId);
      const db = (await getDb())!;
      const conds = [eq(aprAnalises.companyId, input.companyId), isNull(aprAnalises.deletedAt)];
      if (input.status) conds.push(eq(aprAnalises.status, input.status));
      if (input.obraId) conds.push(eq(aprAnalises.obraId, input.obraId));
      const rows = await db.select({
        id: aprAnalises.id, numero: aprAnalises.numero, status: aprAnalises.status,
        dataEmissao: aprAnalises.dataEmissao, atividade: aprAnalises.atividade,
        localServico: aprAnalises.localServico, obraId: aprAnalises.obraId,
        employeeId: aprAnalises.employeeId, criadoPorNome: aprAnalises.criadoPorNome,
        createdAt: aprAnalises.createdAt, equipeJson: aprAnalises.equipeJson,
        aprovadoPorNome: aprAnalises.aprovadoPorNome, aprovadoEm: aprAnalises.aprovadoEm,
      }).from(aprAnalises).where(and(...conds))
        .orderBy(desc(aprAnalises.createdAt)).limit(input.limit).offset(input.offset);

      const obraIds = [...new Set(rows.map(r => r.obraId).filter(Boolean))] as number[];
      const empIds  = [...new Set(rows.map(r => r.employeeId).filter(Boolean))] as number[];
      const obrasMap = new Map<number, string>();
      const empsMap  = new Map<number, string>();
      if (obraIds.length) {
        (await db.select({ id: obras.id, nome: obras.nome }).from(obras).where(inArray(obras.id, obraIds)))
          .forEach((o: any) => obrasMap.set(o.id, o.nome));
      }
      if (empIds.length) {
        (await db.select({ id: employees.id, nome: employees.nomeCompleto }).from(employees).where(inArray(employees.id, empIds)))
          .forEach((e: any) => empsMap.set(e.id, e.nome));
      }

      // Conta riscos por APR
      const aprIds = rows.map(r => r.id);
      const riskCounts = new Map<number, number>();
      if (aprIds.length) {
        const counts = await db.select({ aprId: aprRiscos.aprId, cnt: sql<number>`count(*)` })
          .from(aprRiscos).where(inArray(aprRiscos.aprId, aprIds)).groupBy(aprRiscos.aprId);
        counts.forEach((c: any) => riskCounts.set(c.aprId, Number(c.cnt)));
      }

      return rows.map(r => ({
        ...r,
        obraNome:        r.obraId ? (obrasMap.get(r.obraId) ?? null) : null,
        responsavelNome: r.employeeId ? (empsMap.get(r.employeeId) ?? null) : null,
        totalRiscos:     riskCounts.get(r.id) ?? 0,
        equipe: r.equipeJson ? (() => { try { return JSON.parse(r.equipeJson); } catch { return []; } })() : [],
      }));
    }),

  // ── Stats ──────────────────────────────────────────────────────────────────
  stats: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      assertCompany(ctx, input.companyId);
      const db = (await getDb())!;
      const rows = await db
        .select({ status: aprAnalises.status, cnt: sql<number>`count(*)` })
        .from(aprAnalises)
        .where(and(eq(aprAnalises.companyId, input.companyId), isNull(aprAnalises.deletedAt)))
        .groupBy(aprAnalises.status);
      const byStatus: Record<string, number> = {};
      for (const r of rows) byStatus[r.status] = Number(r.cnt);
      return {
        total:     Object.values(byStatus).reduce((a, b) => a + b, 0),
        rascunho:  byStatus["rascunho"] ?? 0,
        em_analise: byStatus["em_analise"] ?? 0,
        aprovada:  byStatus["aprovada"] ?? 0,
        concluida: byStatus["concluida"] ?? 0,
        cancelada: byStatus["cancelada"] ?? 0,
      };
    }),

  // ── Próximo número ─────────────────────────────────────────────────────────
  proximoNumero: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      assertCompany(ctx, input.companyId);
      const db = (await getDb())!;
      return { numero: await proximoNumero(db, input.companyId) };
    }),

  // ── Get by ID ─────────────────────────────────────────────────────────────
  getById: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      assertCompany(ctx, input.companyId);
      const db = (await getDb())!;
      const [apr] = await db.select().from(aprAnalises)
        .where(and(eq(aprAnalises.id, input.id), eq(aprAnalises.companyId, input.companyId), isNull(aprAnalises.deletedAt))).limit(1);
      if (!apr) throw new TRPCError({ code: "NOT_FOUND" });
      const riscos = await db.select().from(aprRiscos)
        .where(and(eq(aprRiscos.aprId, input.id), eq(aprRiscos.companyId, input.companyId)))
        .orderBy(aprRiscos.ordem);
      let obraNome: string | null = null;
      let obraClienteLogoUrl: string | null = null;
      let obraGerenciadoraLogoUrl: string | null = null;
      let obraGerenciadoraNome: string | null = null;
      let obraClienteNome: string | null = null;
      if (apr.obraId) {
        const [ob] = await db.select({
          nome: obras.nome,
          clienteLogoUrl: obras.clienteLogoUrl,
          gerenciadoraLogoUrl: obras.gerenciadoraLogoUrl,
          gerenciadoraNome: obras.gerenciadoraNome,
          cliente: obras.cliente,
        }).from(obras).where(eq(obras.id, apr.obraId)).limit(1);
        obraNome               = ob?.nome ?? null;
        obraClienteLogoUrl     = ob?.clienteLogoUrl ?? null;
        obraGerenciadoraLogoUrl = ob?.gerenciadoraLogoUrl ?? null;
        obraGerenciadoraNome   = ob?.gerenciadoraNome ?? null;
        obraClienteNome        = ob?.cliente ?? null;
      }
      let responsavelNome: string | null = null;
      if (apr.employeeId) {
        const [emp] = await db.select({ nome: employees.nomeCompleto }).from(employees).where(eq(employees.id, apr.employeeId)).limit(1);
        responsavelNome = emp?.nome ?? null;
      }
      const parseJson = (s: string | null | undefined) => { try { return JSON.parse(s ?? "[]"); } catch { return []; } };
      return {
        ...apr,
        obraNome, responsavelNome,
        obraClienteLogoUrl, obraGerenciadoraLogoUrl, obraGerenciadoraNome, obraClienteNome,
        riscos,
        equipe:              parseJson(apr.equipeJson),
        epis:                parseJson(apr.epiJson),
        assinaturasEquipe:   parseJson((apr as any).assinaturasEquipeJson),
      };
    }),

  // ── Create ─────────────────────────────────────────────────────────────────
  create: protectedProcedure
    .input(z.object({
      companyId:      z.number(),
      obraId:         z.number().optional().nullable(),
      employeeId:     z.number(),
      tipoAtividade:  z.string().optional().nullable(),
      checklistJson:  z.string().optional().nullable(),
      dataEmissao:    z.string().optional().nullable(),
      horaInicio:     z.string().optional().nullable(),
      atividade:      z.string().optional().nullable(),
      localServico:   z.string().optional().nullable(),
      equipeJson:     z.string().optional().nullable(),
      epiJson:        z.string().optional().nullable(),
      observacoes:    z.string().optional().nullable(),
      riscos:         riscosInputSchema.optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      assertCompany(ctx, input.companyId);
      const db = (await getDb())!;
      const numero = await proximoNumero(db, input.companyId);
      // Inicializa assinaturas da equipe a partir do equipeJson (sem ass ainda)
      let assinaturasEquipeJson: string | null = null;
      if (input.equipeJson) {
        try {
          const membros = JSON.parse(input.equipeJson);
          assinaturasEquipeJson = JSON.stringify(
            membros.map((m: any) => ({
              nome: typeof m === "string" ? m : (m?.nome ?? ""),
              ass: null, assinadoEm: null,
            })).filter((m: any) => m.nome)
          );
        } catch {}
      }

      const [apr] = await db.insert(aprAnalises).values({
        companyId:     input.companyId,
        obraId:        input.obraId ?? null,
        employeeId:    input.employeeId,
        numero,
        status:        "em_analise",
        tipoAtividade: input.tipoAtividade ?? null,
        checklistJson: input.checklistJson ?? null,
        dataEmissao:   input.dataEmissao ?? null,
        horaInicio:    input.horaInicio ?? null,
        atividade:     input.atividade ?? null,
        localServico:  input.localServico ?? null,
        equipeJson:    input.equipeJson ?? null,
        assinaturasEquipeJson,
        epiJson:       input.epiJson ?? null,
        observacoes:   input.observacoes ?? null,
        criadoPorId:   ctx.user.id,
        criadoPorNome: ctx.user.name ?? "Sistema",
      } as any).returning();
      if (input.riscos?.length) {
        await db.insert(aprRiscos).values(input.riscos.map((r, i) => ({
          aprId: apr.id, companyId: input.companyId, ordem: r.ordem ?? i,
          etapaAtividade: r.etapaAtividade ?? null, perigo: r.perigo ?? null,
          risco: r.risco ?? null, tipoRisco: r.tipoRisco ?? null,
          probabilidade: r.probabilidade ?? null, gravidade: r.gravidade ?? null,
          nivelRisco: (r.probabilidade && r.gravidade) ? r.probabilidade * r.gravidade : null,
          medidasControle: r.medidasControle ?? null, tipoMedida: r.tipoMedida ?? null,
          responsavelNome: r.responsavelNome ?? null, prazo: r.prazo ?? null,
          situacao: r.situacao ?? "aberta",
        })));
      }
      return apr;
    }),

  // ── Upsert riscos ─────────────────────────────────────────────────────────
  upsertRiscos: protectedProcedure
    .input(z.object({ aprId: z.number(), companyId: z.number(), riscos: riscosInputSchema }))
    .mutation(async ({ input, ctx }) => {
      assertCompany(ctx, input.companyId);
      const db = (await getDb())!;
      const [apr] = await db.select({ id: aprAnalises.id }).from(aprAnalises)
        .where(and(eq(aprAnalises.id, input.aprId), eq(aprAnalises.companyId, input.companyId), isNull(aprAnalises.deletedAt))).limit(1);
      if (!apr) throw new TRPCError({ code: "NOT_FOUND" });
      await db.delete(aprRiscos).where(and(eq(aprRiscos.aprId, input.aprId), eq(aprRiscos.companyId, input.companyId)));
      if (input.riscos.length) {
        await db.insert(aprRiscos).values(input.riscos.map((r, i) => ({
          aprId: input.aprId, companyId: input.companyId, ordem: r.ordem ?? i,
          etapaAtividade: r.etapaAtividade ?? null, perigo: r.perigo ?? null,
          risco: r.risco ?? null, tipoRisco: r.tipoRisco ?? null,
          probabilidade: r.probabilidade ?? null, gravidade: r.gravidade ?? null,
          nivelRisco: (r.probabilidade && r.gravidade) ? r.probabilidade * r.gravidade : null,
          medidasControle: r.medidasControle ?? null, tipoMedida: r.tipoMedida ?? null,
          responsavelNome: r.responsavelNome ?? null, prazo: r.prazo ?? null,
          situacao: r.situacao ?? "aberta",
        })));
      }
      return { ok: true };
    }),

  // ── Update ─────────────────────────────────────────────────────────────────
  update: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number(), data: z.record(z.string(), z.unknown()) }))
    .mutation(async ({ input, ctx }) => {
      assertCompany(ctx, input.companyId);
      const db = (await getDb())!;
      const allowed = ["obraId","employeeId","dataEmissao","horaInicio","atividade","localServico",
        "equipeJson","assinaturasEquipeJson","epiJson","observacoes","aprovadoPorNome","aprovadoPorAss","aprovadoEm","status","fcSignSessionId"];
      const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
      for (const k of allowed) { if (k in input.data) patch[k] = (input.data as any)[k]; }
      await db.update(aprAnalises).set(patch as any)
        .where(and(eq(aprAnalises.id, input.id), eq(aprAnalises.companyId, input.companyId), isNull(aprAnalises.deletedAt)));
      return { ok: true };
    }),

  // ── Aprovar ────────────────────────────────────────────────────────────────
  aprovar: protectedProcedure
    .input(z.object({
      id: z.number(), companyId: z.number(),
      aprovadoPorNome: z.string().optional().nullable(),
      aprovadoPorAss:  z.string().optional().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      assertCompany(ctx, input.companyId);
      const db = (await getDb())!;
      await db.update(aprAnalises).set({
        status: "aprovada",
        aprovadoPorNome: input.aprovadoPorNome ?? null,
        aprovadoPorAss:  input.aprovadoPorAss ?? null,
        aprovadoEm:      new Date().toISOString(),
        updatedAt:       new Date().toISOString(),
      } as any).where(and(eq(aprAnalises.id, input.id), eq(aprAnalises.companyId, input.companyId), isNull(aprAnalises.deletedAt)));
      return { ok: true };
    }),

  // ── Concluir ───────────────────────────────────────────────────────────────
  concluir: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      assertCompany(ctx, input.companyId);
      const db = (await getDb())!;
      await db.update(aprAnalises).set({ status: "concluida", updatedAt: new Date().toISOString() } as any)
        .where(and(eq(aprAnalises.id, input.id), eq(aprAnalises.companyId, input.companyId), isNull(aprAnalises.deletedAt)));
      return { ok: true };
    }),

  // ── Cancelar ───────────────────────────────────────────────────────────────
  cancelar: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      assertCompany(ctx, input.companyId);
      const db = (await getDb())!;
      await db.update(aprAnalises).set({ status: "cancelada", updatedAt: new Date().toISOString() } as any)
        .where(and(eq(aprAnalises.id, input.id), eq(aprAnalises.companyId, input.companyId), isNull(aprAnalises.deletedAt)));
      return { ok: true };
    }),

  // ── Excluir (soft) ─────────────────────────────────────────────────────────
  excluir: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      assertCompany(ctx, input.companyId);
      const db = (await getDb())!;
      await db.update(aprAnalises).set({ deletedAt: new Date().toISOString() } as any)
        .where(and(eq(aprAnalises.id, input.id), eq(aprAnalises.companyId, input.companyId)));
      return { ok: true };
    }),

  excluirBatch: protectedProcedure
    .input(z.object({ ids: z.array(z.number()).min(1), companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      assertCompany(ctx, input.companyId);
      const db = (await getDb())!;
      await db.update(aprAnalises).set({ deletedAt: new Date().toISOString() } as any)
        .where(and(inArray(aprAnalises.id, input.ids), eq(aprAnalises.companyId, input.companyId), isNull(aprAnalises.deletedAt)));
      return { ok: true, count: input.ids.length };
    }),

  // ── Gerar HTML para impressão (Rev. 3937 — layout azul FC, logos, checklist, assinaturas completas) ──
  gerarHtml: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      assertCompany(ctx, input.companyId);
      const db = (await getDb())!;
      const [apr] = await db.select().from(aprAnalises)
        .where(and(eq(aprAnalises.id, input.id), eq(aprAnalises.companyId, input.companyId), isNull(aprAnalises.deletedAt))).limit(1);
      if (!apr) throw new TRPCError({ code: "NOT_FOUND" });

      // ── Dados complementares ──────────────────────────────────────────────
      const [comp] = await db.select({ nome: companies.nomeFantasia, razao: companies.razaoSocial, logo: companies.logoUrl })
        .from(companies).where(eq(companies.id, input.companyId)).limit(1);
      const companyName = comp?.nome || comp?.razao || "FC Engenharia";
      const companyLogo = comp?.logo ?? null;

      let obraNome = "", obraClienteNome = "", obraClienteLogoUrl: string | null = null,
          obraGerenciadoraNome = "", obraGerenciadoraLogoUrl: string | null = null;
      if (apr.obraId) {
        const [ob] = await db.select({
          nome: obras.nome, cliente: obras.cliente,
          clienteLogoUrl: obras.clienteLogoUrl,
          gerenciadoraNome: obras.gerenciadoraNome,
          gerenciadoraLogoUrl: obras.gerenciadoraLogoUrl,
        }).from(obras).where(eq(obras.id, apr.obraId)).limit(1);
        obraNome              = ob?.nome ?? "";
        obraClienteNome       = ob?.cliente ?? "";
        obraClienteLogoUrl    = ob?.clienteLogoUrl ?? null;
        obraGerenciadoraNome  = ob?.gerenciadoraNome ?? "";
        obraGerenciadoraLogoUrl = ob?.gerenciadoraLogoUrl ?? null;
      }
      let responsavelNome = "";
      if (apr.employeeId) {
        const [emp] = await db.select({ nome: employees.nomeCompleto }).from(employees).where(eq(employees.id, apr.employeeId)).limit(1);
        responsavelNome = emp?.nome ?? "";
      }
      const riscos = await db.select().from(aprRiscos)
        .where(and(eq(aprRiscos.aprId, input.id), eq(aprRiscos.companyId, input.companyId)))
        .orderBy(aprRiscos.ordem);

      // ── Parsers ───────────────────────────────────────────────────────────
      const esc = (s: any) => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
      const pj = (s: any) => { try { return JSON.parse(s ?? "[]"); } catch { return []; } };
      let epis: string[] = pj(apr.epiJson);
      // equipe com assinaturas (preferencial) ou raw
      let assEquipe: Array<{ nome: string; ass: string | null; assinadoEm: string | null }> = [];
      const assRaw = pj((apr as any).assinaturasEquipeJson);
      const equipeRaw = pj(apr.equipeJson);
      if (assRaw.length > 0) {
        assEquipe = assRaw.map((m: any) => ({ nome: m?.nome ?? "", ass: m?.ass ?? null, assinadoEm: m?.assinadoEm ?? null })).filter((m: any) => m.nome);
      } else {
        assEquipe = equipeRaw.map((m: any) => ({ nome: typeof m === "string" ? m : (m?.nome ?? ""), ass: null, assinadoEm: null })).filter((m: any) => m.nome);
      }
      let checklist: Array<{ id: string; texto: string; resposta: string | null }> = pj(apr.checklistJson);

      const NIVEIS: Record<number, { label: string; bg: string; color: string }> = {};
      for (let p = 1; p <= 5; p++) for (let g = 1; g <= 5; g++) {
        const n = p * g;
        NIVEIS[n] = n <= 4 ? { label: "BAIXO",   bg: "#d1fae5", color: "#065f46" }
                  : n <= 9 ? { label: "MÉDIO",   bg: "#fef9c3", color: "#854d0e" }
                  : n <= 16? { label: "ALTO",    bg: "#ffedd5", color: "#9a3412" }
                  :           { label: "CRÍTICO", bg: "#fee2e2", color: "#991b1b" };
      }

      // ── Seção de assinaturas: equipe + responsável APR + aprovador ────────
      const sigBoxes: Array<{ nome: string; papel: string; ass: string | null; em: string | null }> = [
        ...assEquipe.map(m => ({ nome: m.nome, papel: "Membro da Equipe", ass: m.ass, em: m.assinadoEm })),
        { nome: responsavelNome || (apr.criadoPorNome ?? ""), papel: "Responsável pela APR", ass: null, em: null },
        { nome: apr.aprovadoPorNome ?? "", papel: "Aprovador SST", ass: (apr as any).aprovadoPorAss ?? null, em: (apr as any).aprovadoEm ?? null },
      ].filter(b => b.nome);

      const sigHtml = sigBoxes.map(b => `
        <div class="sig-box">
          ${b.ass
            ? `<div class="sig-img-wrap"><img src="${b.ass}" class="sig-img" alt="Assinatura" /></div>`
            : `<div class="sig-line"></div>`}
          <div class="sig-nome">${esc(b.nome)}</div>
          <div class="sig-papel">${esc(b.papel)}</div>
          ${b.em ? `<div class="sig-em">${new Date(b.em).toLocaleString("pt-BR")}</div>` : ""}
        </div>`).join("");

      // ── Checklist HTML ────────────────────────────────────────────────────
      const respLabel: Record<string, string> = { sim: "SIM", nao: "NÃO", na: "N/A" };
      const respStyle: Record<string, string> = {
        sim: "background:#d1fae5;color:#065f46",
        nao: "background:#fee2e2;color:#991b1b",
        na:  "background:#f1f5f9;color:#64748b",
      };
      const checklistHtml = checklist.length ? `
<h2>3. CHECKLIST DE VERIFICAÇÃO</h2>
<table>
  <thead><tr><th style="width:5%">#</th><th>Item de Verificação</th><th style="width:8%;text-align:center">Resposta</th></tr></thead>
  <tbody>
    ${checklist.map((c: any, i: number) => {
      const r = c.resposta ?? "na";
      const texto = c.pergunta ?? c.texto ?? "";
      return `<tr>
        <td style="text-align:center">${i+1}</td>
        <td>${esc(texto)}</td>
        <td style="text-align:center"><span class="nivel-chip" style="${respStyle[r] ?? respStyle.na}">${respLabel[r] ?? "N/A"}</span></td>
      </tr>`;
    }).join("")}
  </tbody>
</table>` : "";

      // ── Logo helpers ──────────────────────────────────────────────────────
      const logoImg = (url: string | null, alt: string, h = 36) =>
        url ? `<img src="${url}" alt="${esc(alt)}" style="height:${h}px;max-width:90px;object-fit:contain;display:block" />` : "";

      const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>APR — ${esc(apr.numero)}</title>
<style>
  @page { margin: 15mm; size: A4 portrait; }
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 8.5pt; color: #1e293b; margin: 0; }
  @media screen { body { padding: 15mm; max-width: 210mm; margin: 0 auto; } }

  /* ── Header ── */
  .hdr { display:grid; grid-template-columns:auto 1fr auto; gap:8px; align-items:center;
         background:#1e3a8a; color:white; padding:10px 14px; border-radius:4px; margin-bottom:8px; }
  .hdr-title { text-align:center; }
  .hdr-title h1 { font-size:13pt; font-weight:900; letter-spacing:.5px; margin:0 0 2px; color:white; }
  .hdr-title .sub { font-size:8pt; opacity:.85; }
  .hdr-logos { display:flex; gap:8px; align-items:center; justify-content:flex-end; }
  .hdr-logo-badge { background:white; border-radius:4px; padding:3px 6px; display:flex; flex-direction:column; align-items:center; gap:1px; }
  .hdr-logo-badge .lbl { font-size:6pt; color:#64748b; text-transform:uppercase; letter-spacing:.3px; }
  .hdr-logo-badge .nm { font-size:7pt; font-weight:bold; color:#1e293b; max-width:80px; text-align:center; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

  /* ── Sections ── */
  h2 { font-size:8.5pt; background:#1d4ed8; color:white; padding:3px 8px; margin:7px 0 4px; border-radius:2px; }
  h3 { font-size:8pt; color:#1e3a8a; margin:5px 0 3px; font-weight:bold; }

  /* ── Fields grid ── */
  .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:3px; margin-bottom:3px; }
  .grid3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:3px; margin-bottom:3px; }
  .grid4 { display:grid; grid-template-columns:1fr 1fr 1fr 1fr; gap:3px; margin-bottom:3px; }
  .field { border:1px solid #cbd5e1; padding:2px 5px; border-radius:2px; }
  .field-label { font-size:6.5pt; color:#64748b; display:block; }
  .field-value { font-size:8.5pt; font-weight:bold; }

  /* ── Table ── */
  table { width:100%; border-collapse:collapse; margin-top:3px; font-size:7.5pt; }
  th { background:#1d4ed8; color:white; padding:3px 4px; text-align:left; font-size:7pt; }
  td { border:1px solid #e2e8f0; padding:2px 4px; vertical-align:top; }
  tr:nth-child(even) td { background:#f8fafc; }
  .nivel-chip { font-weight:bold; font-size:6.5pt; padding:1px 5px; border-radius:8px; display:inline-block; white-space:nowrap; }

  /* ── EPIs ── */
  .epi-chip { background:#dbeafe; color:#1e3a8a; border:1px solid #bfdbfe; font-size:7.5pt; padding:2px 7px; border-radius:10px; display:inline-block; margin:1px; }

  /* ── Assinaturas ── */
  .sig-grid { display:grid; gap:6px; margin-top:5px; }
  .sig-grid-3 { grid-template-columns:1fr 1fr 1fr; }
  .sig-grid-2 { grid-template-columns:1fr 1fr; }
  .sig-grid-1 { grid-template-columns:1fr; }
  .sig-box { border:1px solid #bfdbfe; border-radius:4px; padding:6px; text-align:center; min-height:70px;
             background:#f0f7ff; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; }
  .sig-img-wrap { flex:1; display:flex; align-items:center; justify-content:center; width:100%; min-height:40px; }
  .sig-img { max-height:44px; max-width:100%; object-fit:contain; }
  .sig-line { border-bottom:1px solid #93c5fd; width:80%; margin:0 auto 4px; margin-top:40px; }
  .sig-nome { font-weight:bold; font-size:7.5pt; color:#1e3a8a; margin-top:2px; }
  .sig-papel { font-size:6.5pt; color:#64748b; }
  .sig-em { font-size:6pt; color:#94a3b8; }
  .sig-checked { color:#16a34a; font-size:8pt; font-weight:bold; }

  /* ── Declaração ── */
  .declaracao { background:#eff6ff; border:1px solid #bfdbfe; border-left:3px solid #1d4ed8;
                padding:6px 10px; font-size:7.5pt; color:#1e40af; border-radius:2px; margin-bottom:6px; }

  /* ── Footer ── */
  .footer { margin-top:10px; padding-top:5px; border-top:1px solid #e2e8f0;
            font-size:6.5pt; color:#94a3b8; text-align:center; }

  @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
</style>
</head>
<body>

<!-- ═══════════════ HEADER ═══════════════ -->
<div class="hdr">
  <!-- Logo FC -->
  <div class="hdr-logo-badge">
    ${logoImg(companyLogo, companyName, 32)}
    ${!companyLogo ? `<div class="nm">${esc(companyName)}</div>` : ""}
  </div>

  <!-- Título central -->
  <div class="hdr-title">
    <h1>ANÁLISE PRELIMINAR DE RISCO — APR</h1>
    <div class="sub">${esc(companyName)} &nbsp;|&nbsp; ${esc(apr.numero)} &nbsp;|&nbsp; Status: ${esc(apr.status.toUpperCase())}</div>
    ${obraClienteNome || obraGerenciadoraNome ? `<div class="sub" style="margin-top:2px;font-size:7pt">
      ${obraClienteNome ? `Cliente: ${esc(obraClienteNome)}` : ""}
      ${obraClienteNome && obraGerenciadoraNome ? " &nbsp;|&nbsp; " : ""}
      ${obraGerenciadoraNome ? `Gerenciadora: ${esc(obraGerenciadoraNome)}` : ""}
    </div>` : ""}
  </div>

  <!-- Logos cliente + gerenciadora -->
  <div class="hdr-logos">
    ${obraClienteLogoUrl || obraClienteNome ? `<div class="hdr-logo-badge">
      <div class="lbl">Cliente</div>
      ${logoImg(obraClienteLogoUrl, obraClienteNome, 28)}
      ${!obraClienteLogoUrl && obraClienteNome ? `<div class="nm">${esc(obraClienteNome)}</div>` : ""}
    </div>` : ""}
    ${obraGerenciadoraLogoUrl || obraGerenciadoraNome ? `<div class="hdr-logo-badge">
      <div class="lbl">Gerenciadora</div>
      ${logoImg(obraGerenciadoraLogoUrl, obraGerenciadoraNome, 28)}
      ${!obraGerenciadoraLogoUrl && obraGerenciadoraNome ? `<div class="nm">${esc(obraGerenciadoraNome)}</div>` : ""}
    </div>` : ""}
  </div>
</div>

<!-- ═══════════════ 1. IDENTIFICAÇÃO ═══════════════ -->
<h2>1. IDENTIFICAÇÃO</h2>
<div class="grid4">
  <div class="field"><span class="field-label">Número APR</span><span class="field-value">${esc(apr.numero)}</span></div>
  <div class="field"><span class="field-label">Data de Emissão</span><span class="field-value">${esc(apr.dataEmissao)}</span></div>
  <div class="field"><span class="field-label">Hora de Início</span><span class="field-value">${esc((apr as any).horaInicio || "—")}</span></div>
  <div class="field"><span class="field-label">Obra / Unidade</span><span class="field-value">${esc(obraNome)}</span></div>
</div>
<div class="grid2">
  <div class="field"><span class="field-label">Atividade / Serviço</span><span class="field-value">${esc(apr.atividade)}</span></div>
  <div class="field"><span class="field-label">Local do Serviço</span><span class="field-value">${esc(apr.localServico)}</span></div>
</div>
<div class="grid2">
  <div class="field"><span class="field-label">Elaborado por (Responsável APR)</span><span class="field-value">${esc(responsavelNome || (apr.criadoPorNome ?? ""))}</span></div>
  <div class="field"><span class="field-label">Equipe de Trabalho</span><span class="field-value">${assEquipe.map(m => esc(m.nome)).join(", ") || "—"}</span></div>
</div>

<!-- ═══════════════ 2. MATRIZ DE RISCOS ═══════════════ -->
<h2>2. IDENTIFICAÇÃO E AVALIAÇÃO DE RISCOS — MATRIZ P × G (NR-01)</h2>
<table>
  <thead>
    <tr>
      <th style="width:4%">#</th>
      <th style="width:13%">Etapa / Atividade</th>
      <th style="width:12%">Fonte de Perigo</th>
      <th style="width:13%">Risco</th>
      <th style="width:6%">Tipo</th>
      <th style="width:3%;text-align:center">P</th>
      <th style="width:3%;text-align:center">G</th>
      <th style="width:6%;text-align:center">Nível</th>
      <th style="width:24%">Medidas de Controle</th>
      <th style="width:6%">Tipo</th>
      <th style="width:10%">Responsável</th>
    </tr>
  </thead>
  <tbody>
    ${riscos.map((r, i) => {
      const nivel = (r.probabilidade ?? 0) * (r.gravidade ?? 0);
      const nc = nivel > 0 ? (NIVEIS[nivel] ?? { label: String(nivel), bg: "#f1f5f9", color: "#334155" }) : null;
      return `<tr>
        <td style="text-align:center">${i+1}</td>
        <td>${esc(r.etapaAtividade)}</td>
        <td>${esc(r.perigo)}</td>
        <td>${esc(r.risco)}</td>
        <td>${esc(r.tipoRisco)}</td>
        <td style="text-align:center">${r.probabilidade ?? "—"}</td>
        <td style="text-align:center">${r.gravidade ?? "—"}</td>
        <td style="text-align:center">${nc ? `<span class="nivel-chip" style="background:${nc.bg};color:${nc.color}">${nc.label}</span>` : "—"}</td>
        <td>${esc(r.medidasControle)}</td>
        <td>${esc(r.tipoMedida)}</td>
        <td>${esc(r.responsavelNome)}</td>
      </tr>`;
    }).join("")}
  </tbody>
</table>

${checklistHtml}

${epis.length ? `<h2>${checklist.length ? "4" : "3"}. EPIs / EPCs NECESSÁRIOS</h2>
<div style="margin-top:3px">${epis.map(e => `<span class="epi-chip">✓ ${esc(e)}</span>`).join(" ")}</div>` : ""}

${apr.observacoes ? `<h2>${checklist.length ? (epis.length ? "5" : "4") : (epis.length ? "4" : "3")}. OBSERVAÇÕES</h2>
<div class="field" style="padding:4px 6px;font-size:8pt">${esc(apr.observacoes)}</div>` : ""}

<!-- ═══════════════ ASSINATURAS ═══════════════ -->
<h2>DECLARAÇÃO E ASSINATURAS DOS ENVOLVIDOS</h2>
<div class="declaracao">
  Declaro que fui devidamente orientado(a) sobre os riscos e perigos inerentes à atividade descrita nesta APR, bem como sobre as medidas de controle e os EPIs/EPCs necessários para a execução segura dos serviços. Comprometo-me a cumprir integralmente as disposições desta Análise Preliminar de Risco.
</div>

<div class="sig-grid ${sigBoxes.length <= 2 ? "sig-grid-2" : sigBoxes.length === 4 ? "sig-grid-2" : "sig-grid-3"}">
  ${sigHtml}
</div>

<div class="footer">
  Documento gerado em ${new Date().toLocaleString("pt-BR")} &nbsp;|&nbsp; ${esc(companyName)} &nbsp;|&nbsp; APR ${esc(apr.numero)} &nbsp;|&nbsp; Sistema ERP &nbsp;|&nbsp; Conforme NR-01 (Portaria MTE n.º 1.419/2024)
</div>
</body>
</html>`;
      return { html };
    }),
});
