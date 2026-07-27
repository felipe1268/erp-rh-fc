// ============================================================================
// Rev. 4669 — DOCUMENTOS DO COLABORADOR (dossiê digital com assinatura)
// Motor da Fase 1: gera documentos por funcionário a partir dos templates da
// Central de Documentos ISO (tipos RH_COLAB_DOCS), com snapshot renderizado,
// assinatura digital (hash SHA-256 + IP + geo + termo) e checklist por
// funcionário. PDF via /api/download/rh-documento-pdf (downloadDossie.ts).
// ============================================================================
import { z } from "zod";
import crypto from "crypto";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb, getCompaniesForUser } from "../db";
import {
  rhDocumentos, employees, companies, systemDocumentTemplates,
  epiDeliveries, epiAssinaturas, asos, trainings, employeeDocuments,
} from "../../drizzle/schema";
import { eq, and, desc, isNull, inArray, sql, gte } from "drizzle-orm";
import { storagePut } from "../storage";
import {
  RH_COLAB_DOCS, RH_DOCS_EVENTUAIS, DOCUMENT_TEMPLATES_META, DEFAULT_CODIGOS, SEED_BODIES,
  renderTemplate, type DocumentTemplateTipo,
} from "../../shared/documentTemplates";
import { vacationPeriods } from "../../drizzle/schema";

// Rev. 4672 — geráveis: checklist (RH_COLAB_DOCS) + eventuais (férias/folha/aditivo)
const TIPOS_VALIDOS = [...RH_COLAB_DOCS.map(d => d.tipo), ...RH_DOCS_EVENTUAIS.map(d => d.tipo)];
const tipoSchema = z.enum(TIPOS_VALIDOS as [string, ...string[]]);

function fmtDateBr(v?: string | null): string {
  if (!v) return "";
  const m = String(v).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(v);
}
function fmtCpf(v?: string | null): string {
  const d = String(v || "").replace(/\D/g, "");
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : String(v || "");
}
function fmtSalario(v?: string | null): string {
  if (!v) return "";
  const n = parseFloat(String(v).replace(/\./g, "").replace(",", "."));
  if (isNaN(n)) return String(v);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

async function assertAccess(userId: number, role: string, companyId: number) {
  const allowed = new Set((await getCompaniesForUser(userId, role)).map((c: any) => c.id));
  if (!allowed.has(companyId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso à empresa informada." });
  }
}

/** Carrega o doc e valida acesso do usuário à empresa DELE (anti-IDOR). */
async function loadDocGuarded(db: any, ctx: any, docId: number) {
  const [doc] = await db.select().from(rhDocumentos)
    .where(and(eq(rhDocumentos.id, docId), isNull(rhDocumentos.deletedAt)));
  if (!doc) throw new TRPCError({ code: "NOT_FOUND", message: "Documento não encontrado." });
  await assertAccess(ctx.user.id, ctx.user.role, doc.companyId);
  return doc;
}

export const rhDocumentosRouter = router({
  // ── Modelos disponíveis (meta + se há template vigente na Central ISO) ────
  modelos: protectedProcedure.query(async () => {
    const db = (await getDb())!;
    const rows = await db.select({
      tipo: systemDocumentTemplates.tipo, status: systemDocumentTemplates.status,
      versaoAtual: systemDocumentTemplates.versaoAtual,
    }).from(systemDocumentTemplates)
      .where(and(inArray(systemDocumentTemplates.tipo, TIPOS_VALIDOS), isNull(systemDocumentTemplates.deletedAt)));
    const byTipo = new Map(rows.map((r: any) => [r.tipo, r]));
    return RH_COLAB_DOCS.map(d => {
      const meta = DOCUMENT_TEMPLATES_META.find(m => m.tipo === d.tipo)!;
      const row = byTipo.get(d.tipo);
      return {
        tipo: d.tipo,
        titulo: meta.titulo,
        descricao: meta.descricao,
        obrigatorio: d.obrigatorio,
        codigo: DEFAULT_CODIGOS[d.tipo],
        templateVigente: row?.status === "vigente",
        versao: row?.versaoAtual ?? null,
      };
    });
  }),

  // ── Gerar documento (snapshot renderizado) ────────────────────────────────
  // (motor de renderização compartilhado com `preview` — ver montarHtmlDocumento no fim do arquivo)
  gerar: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      employeeId: z.number(),
      tipo: tipoSchema,
      /** Campos específicos digitados na geração (equipamentos, prazos, jornada…) */
      extras: z.record(z.string()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      await assertAccess(ctx.user.id, ctx.user.role, input.companyId);
      const { html, meta, usaVigente, tpl, dados } = await montarHtmlDocumento(db, input);

      const [row] = await db.insert(rhDocumentos).values({
        companyId: input.companyId,
        employeeId: input.employeeId,
        tipo: input.tipo,
        // Eventuais ganham referência no título p/ distinguir no histórico
        titulo: (() => {
          const ex = input.extras || {};
          if (input.tipo === "recibo_folha" && (ex.mesRef || ex.tipoRecibo)) return `${meta.titulo} — ${[ex.tipoRecibo, ex.mesRef].filter(Boolean).join(" ")}`.slice(0, 200);
          if ((input.tipo === "solicitacao_ferias" || input.tipo === "recibo_ferias") && (ex.feriasInicio || dados.feriasInicio)) return `${meta.titulo} — ${ex.feriasInicio || dados.feriasInicio}`.slice(0, 200);
          if (input.tipo === "termo_aditivo" && ex.tipoAlteracao) return `${meta.titulo} — ${ex.tipoAlteracao}`.slice(0, 200);
          return meta.titulo;
        })(),
        codigo: usaVigente ? (tpl!.codigo || DEFAULT_CODIGOS[input.tipo as DocumentTemplateTipo]) : DEFAULT_CODIGOS[input.tipo as DocumentTemplateTipo],
        versaoTemplate: usaVigente ? tpl!.versaoAtual : null,
        conteudoHtml: html,
        status: "gerado",
        criadoPorId: ctx.user.id,
        criadoPorNome: (ctx.user as any).name || (ctx.user as any).email || null,
      }).returning({ id: rhDocumentos.id });
      return { id: row.id };
    }),

  // ── Rev. 4675 — Pré-visualização (olhinho): renderiza o documento com os
  //    dados do colaborador SEM salvar nada. Mesmo motor da geração. ─────────
  preview: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      employeeId: z.number(),
      tipo: tipoSchema,
      extras: z.record(z.string()).optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = (await getDb())!;
      await assertAccess(ctx.user.id, ctx.user.role, input.companyId);
      const { html, meta } = await montarHtmlDocumento(db, input);
      return { titulo: meta.titulo, conteudoHtml: html };
    }),
  // ── Listar documentos de um funcionário ───────────────────────────────────
  listar: protectedProcedure
    .input(z.object({ companyId: z.number(), employeeId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = (await getDb())!;
      await assertAccess(ctx.user.id, ctx.user.role, input.companyId);
      return db.select({
        id: rhDocumentos.id, tipo: rhDocumentos.tipo, titulo: rhDocumentos.titulo,
        codigo: rhDocumentos.codigo, status: rhDocumentos.status,
        assinadoEm: rhDocumentos.assinadoEm, createdAt: rhDocumentos.createdAt,
        criadoPorNome: rhDocumentos.criadoPorNome,
      }).from(rhDocumentos).where(and(
        eq(rhDocumentos.companyId, input.companyId),
        eq(rhDocumentos.employeeId, input.employeeId),
        isNull(rhDocumentos.deletedAt),
      )).orderBy(desc(rhDocumentos.createdAt));
    }),

  // ── Detalhe (preview HTML) ────────────────────────────────────────────────
  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = (await getDb())!;
      return loadDocGuarded(db, ctx, input.id);
    }),

  // ── Assinatura digital do colaborador ─────────────────────────────────────
  assinar: protectedProcedure
    .input(z.object({
      docId: z.number(),
      assinaturaBase64: z.string().min(100),
      termoAceito: z.boolean(),
      geoLocation: z.object({ lat: z.string(), lng: z.string(), accuracy: z.string() }).nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!input.termoAceito) throw new TRPCError({ code: "BAD_REQUEST", message: "É necessário aceitar o termo para assinar." });
      const db = (await getDb())!;
      const doc = await loadDocGuarded(db, ctx, input.docId);
      // Integridade de auditoria: assinatura é IMUTÁVEL. Para reassinar,
      // exclua o documento (Admin Master) e gere um novo.
      if (doc.status === "assinado") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Este documento já está assinado. Gere um novo documento para colher outra assinatura." });
      }

      const base64 = input.assinaturaBase64.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64, "base64");
      if (buffer.length > 2 * 1024 * 1024) throw new TRPCError({ code: "BAD_REQUEST", message: "Assinatura muito grande." });
      const key = `rh-doc-assinaturas/${doc.id}-${Date.now()}.png`;
      const { url } = await storagePut(key, buffer, "image/png");
      const hash = crypto.createHash("sha256").update(buffer).digest("hex");
      const ip = (ctx as any).req?.headers?.["x-forwarded-for"]?.toString().split(",")[0]?.trim()
        || (ctx as any).req?.socket?.remoteAddress || null;

      // Rev. 4673 — UPDATE condicional (atômico): evita corrida com o fluxo
      // FCSign — se o doc foi assinado por outro canal entre o load e o update,
      // NÃO sobrescreve a trilha de auditoria.
      const upd = await db.update(rhDocumentos).set({
        status: "assinado",
        assinaturaUrl: url,
        assinaturaKey: key,
        assinaturaHash: hash,
        assinadoEm: sql`now()`,
        assinaturaIp: ip,
        assinaturaGeo: input.geoLocation ? JSON.stringify(input.geoLocation) : null,
        termoAceito: 1,
        updatedAt: sql`now()`,
      }).where(and(eq(rhDocumentos.id, doc.id), sql`${rhDocumentos.status} <> 'assinado'`)).returning({ id: rhDocumentos.id });
      if (upd.length === 0) {
        throw new TRPCError({ code: "CONFLICT", message: "Este documento acabou de ser assinado por outro canal (FCSign). Recarregue a tela." });
      }
      return { ok: true, hashSha256: hash };
    }),

  // ── Excluir (soft). Documento ASSINADO não pode ser excluído (auditoria). ──
  excluir: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const doc = await loadDocGuarded(db, ctx, input.id);
      if (doc.status === "assinado" && ctx.user.role !== "admin_master") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Documento assinado não pode ser excluído (somente Admin Master)." });
      }
      await db.update(rhDocumentos).set({ deletedAt: sql`now()`, updatedAt: sql`now()` })
        .where(eq(rhDocumentos.id, input.id));
      return { ok: true };
    }),

  // ── Checklist documental do funcionário ───────────────────────────────────
  checklist: protectedProcedure
    .input(z.object({ companyId: z.number(), employeeId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = (await getDb())!;
      await assertAccess(ctx.user.id, ctx.user.role, input.companyId);
      const hoje = new Date().toISOString().slice(0, 10);
      const { companyId, employeeId } = input;

      const [docsRh, entregas, assinEpi, assinOs, asosVig, treinVig, anexos] = await Promise.all([
        db.select({ tipo: rhDocumentos.tipo, status: rhDocumentos.status, id: rhDocumentos.id, assinadoEm: rhDocumentos.assinadoEm })
          .from(rhDocumentos).where(and(
            eq(rhDocumentos.companyId, companyId), eq(rhDocumentos.employeeId, employeeId), isNull(rhDocumentos.deletedAt),
          )).orderBy(desc(rhDocumentos.createdAt)),
        db.select({ n: sql<number>`count(*)::int` }).from(epiDeliveries).where(and(
          eq(epiDeliveries.companyId, companyId), eq(epiDeliveries.employeeId, employeeId), isNull(epiDeliveries.deletedAt),
        )),
        db.select({ n: sql<number>`count(*)::int` }).from(epiAssinaturas).where(and(
          eq(epiAssinaturas.companyId, companyId), eq(epiAssinaturas.employeeId, employeeId), eq(epiAssinaturas.tipo, "entrega"),
        )),
        db.select({ n: sql<number>`count(*)::int` }).from(epiAssinaturas).where(and(
          eq(epiAssinaturas.companyId, companyId), eq(epiAssinaturas.employeeId, employeeId), eq(epiAssinaturas.tipo, "ordem_servico"),
        )),
        db.select({ n: sql<number>`count(*)::int` }).from(asos).where(and(
          eq(asos.companyId, companyId), eq(asos.employeeId, employeeId), gte(asos.dataValidade, hoje),
          isNull(asos.deletedAt),
        )),
        db.select({ n: sql<number>`count(*)::int` }).from(trainings).where(and(
          eq(trainings.companyId, companyId), eq(trainings.employeeId, employeeId),
          sql`(${trainings.dataValidade} IS NULL OR ${trainings.dataValidade} >= ${hoje})`,
          isNull(trainings.deletedAt),
        )),
        db.select({ n: sql<number>`count(*)::int` }).from(employeeDocuments).where(and(
          eq(employeeDocuments.companyId, companyId), eq(employeeDocuments.employeeId, employeeId), isNull(employeeDocuments.deletedAt),
        )),
      ]);

      // Documento mais recente de cada tipo (o gerado por último manda no status)
      const docPorTipo = new Map<string, { id: number; status: string; assinadoEm: string | null }>();
      for (const d of docsRh) if (!docPorTipo.has(d.tipo)) docPorTipo.set(d.tipo, d);

      const modelos = RH_COLAB_DOCS.map(m => {
        const meta = DOCUMENT_TEMPLATES_META.find(x => x.tipo === m.tipo)!;
        const doc = docPorTipo.get(m.tipo);
        return {
          tipo: m.tipo,
          titulo: meta.titulo,
          obrigatorio: m.obrigatorio,
          situacao: !doc ? "faltando" : doc.status === "assinado" ? "assinado" : "gerado",
          docId: doc?.id ?? null,
        };
      });

      return {
        modelos,
        sst: {
          epiEntregas: entregas[0]?.n ?? 0,
          epiAssinaturas: assinEpi[0]?.n ?? 0,
          osAssinada: (assinOs[0]?.n ?? 0) > 0,
          asoVigente: (asosVig[0]?.n ?? 0) > 0,
          treinamentosVigentes: treinVig[0]?.n ?? 0,
        },
        anexos: anexos[0]?.n ?? 0,
      };
    }),

  // ── Checklist GERAL (matriz funcionário × documento, empresa inteira) ─────
  // Rev. 4671 — Controle de Documentos: visão centralizada campo a campo.
  // Consultas em LOTE (sem N+1): 1 query por fonte, agregada por funcionário.
  checklistGeral: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const allowed = new Set((await getCompaniesForUser(ctx.user.id, ctx.user.role)).map((c: any) => c.id));
      const ids = (input.companyIds && input.companyIds.length > 0 ? input.companyIds : [input.companyId])
        .filter((id) => allowed.has(id));
      if (ids.length === 0) throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso à(s) empresa(s) informada(s)." });
      const hoje = new Date().toISOString().slice(0, 10);

      const emps = await db.select({
        id: employees.id, nomeCompleto: employees.nomeCompleto, funcao: employees.funcao,
        fotoUrl: employees.fotoUrl, companyId: employees.companyId, status: employees.status,
        cpf: employees.cpf,
      }).from(employees).where(and(
        inArray(employees.companyId, ids), isNull(employees.deletedAt),
        // Não-desligados (inclui Ativo/Aviso/Ferias/Afastado/Recluso…)
        sql`${employees.status} NOT IN ('Desligado','Lista_Negra','Inativo')`,
      )).orderBy(employees.nomeCompleto);
      const empIds = emps.map((e: any) => e.id);
      if (empIds.length === 0) return { funcionarios: [], modelos: RH_COLAB_DOCS.map(m => ({ tipo: m.tipo, titulo: DOCUMENT_TEMPLATES_META.find(x => x.tipo === m.tipo)!.titulo, obrigatorio: m.obrigatorio })) };

      const [docsRh, asosVig, treinVig, osRows, anexosRows] = await Promise.all([
        db.select({ employeeId: rhDocumentos.employeeId, tipo: rhDocumentos.tipo, status: rhDocumentos.status, id: rhDocumentos.id, createdAt: rhDocumentos.createdAt })
          .from(rhDocumentos).where(and(
            inArray(rhDocumentos.companyId, ids), inArray(rhDocumentos.employeeId, empIds), isNull(rhDocumentos.deletedAt),
          )).orderBy(desc(rhDocumentos.createdAt)),
        db.select({ employeeId: asos.employeeId, n: sql<number>`count(*)::int` }).from(asos).where(and(
          inArray(asos.companyId, ids), inArray(asos.employeeId, empIds), gte(asos.dataValidade, hoje), isNull(asos.deletedAt),
        )).groupBy(asos.employeeId),
        db.select({ employeeId: trainings.employeeId, n: sql<number>`count(*)::int` }).from(trainings).where(and(
          inArray(trainings.companyId, ids), inArray(trainings.employeeId, empIds),
          sql`(${trainings.dataValidade} IS NULL OR ${trainings.dataValidade} >= ${hoje})`, isNull(trainings.deletedAt),
        )).groupBy(trainings.employeeId),
        db.select({ employeeId: epiAssinaturas.employeeId, n: sql<number>`count(*)::int` }).from(epiAssinaturas).where(and(
          inArray(epiAssinaturas.companyId, ids), inArray(epiAssinaturas.employeeId, empIds), eq(epiAssinaturas.tipo, "ordem_servico"),
        )).groupBy(epiAssinaturas.employeeId),
        db.select({ employeeId: employeeDocuments.employeeId, n: sql<number>`count(*)::int` }).from(employeeDocuments).where(and(
          inArray(employeeDocuments.companyId, ids), inArray(employeeDocuments.employeeId, empIds), isNull(employeeDocuments.deletedAt),
        )).groupBy(employeeDocuments.employeeId),
      ]);

      // Doc mais recente por (funcionário, tipo) — a lista já vem em createdAt desc.
      const docKey = (empId: number, tipo: string) => `${empId}|${tipo}`;
      const docPorTipo = new Map<string, { id: number; status: string }>();
      for (const d of docsRh) {
        const k = docKey(d.employeeId, d.tipo);
        if (!docPorTipo.has(k)) docPorTipo.set(k, { id: d.id, status: d.status });
      }
      const toMap = (rows: any[]) => new Map(rows.map((r: any) => [r.employeeId, r.n]));
      const asoMap = toMap(asosVig), treinMap = toMap(treinVig), osMap = toMap(osRows), anexosMap = toMap(anexosRows);

      const modelosMeta = RH_COLAB_DOCS.map(m => ({
        tipo: m.tipo, titulo: DOCUMENT_TEMPLATES_META.find(x => x.tipo === m.tipo)!.titulo, obrigatorio: m.obrigatorio,
      }));

      const funcionarios = emps.map((e: any) => ({
        id: e.id, nomeCompleto: e.nomeCompleto, funcao: e.funcao, fotoUrl: e.fotoUrl, companyId: e.companyId, cpf: e.cpf,
        docs: Object.fromEntries(modelosMeta.map(m => {
          const d = docPorTipo.get(docKey(e.id, m.tipo));
          return [m.tipo, { situacao: !d ? "faltando" : d.status === "assinado" ? "assinado" : "gerado", docId: d?.id ?? null }];
        })),
        asoVigente: (asoMap.get(e.id) ?? 0) > 0,
        osAssinada: (osMap.get(e.id) ?? 0) > 0,
        treinamentosVigentes: treinMap.get(e.id) ?? 0,
        anexos: anexosMap.get(e.id) ?? 0,
      }));

      return { funcionarios, modelos: modelosMeta };
    }),
});

// ── Rev. 4675 — motor de renderização COMPARTILHADO entre `gerar` e `preview`.
//    Monta o HTML do documento com os dados do colaborador/empresa/template.
//    NÃO grava nada — quem persiste é o `gerar`.
async function montarHtmlDocumento(
  db: any,
  input: { companyId: number; employeeId: number; tipo: string; extras?: Record<string, string> },
) {
  const [emp] = await db.select().from(employees).where(and(
    eq(employees.id, input.employeeId),
    eq(employees.companyId, input.companyId),
    isNull(employees.deletedAt),
  ));
  if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Funcionário não encontrado nesta empresa." });

  const [empresa] = await db.select().from(companies).where(eq(companies.id, input.companyId));

  // Template: vigente da Central ISO > seed institucional (fallback)
  const [tpl] = await db.select().from(systemDocumentTemplates).where(and(
    eq(systemDocumentTemplates.tipo, input.tipo),
    isNull(systemDocumentTemplates.deletedAt),
  ));
  const usaVigente = !!(tpl && tpl.status === "vigente" && (tpl.conteudoHtml || "").trim());
  const corpo = usaVigente ? tpl.conteudoHtml : SEED_BODIES[input.tipo as DocumentTemplateTipo];
  const meta = DOCUMENT_TEMPLATES_META.find(m => m.tipo === input.tipo)!;

  const hoje = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const cidade = String((empresa as any)?.endereco || "").split("-").slice(-2, -1)[0]?.trim();
  const dados: Record<string, string> = {
    empNome: emp.nomeCompleto || "",
    empCpf: fmtCpf(emp.cpf),
    empRg: (emp as any).rg || "",
    empFuncao: emp.funcao || "",
    empMatricula: (emp as any).matricula || "",
    empAdmissao: fmtDateBr((emp as any).dataAdmissao),
    empSalario: fmtSalario((emp as any).salarioBase),
    empCtps: (emp as any).ctps || "",
    empPis: (emp as any).pis || "",
    empNascimento: fmtDateBr((emp as any).dataNascimento),
    empEstadoCivil: (emp as any).estadoCivil || "",
    empNomeMae: (emp as any).nomeMae || "",
    empTelefone: (emp as any).telefone || "",
    empBanco: (emp as any).bancoNome || (emp as any).banco || "",
    empAgencia: (emp as any).agencia || "",
    empConta: (emp as any).conta || "",
    empPix: (emp as any).bancoPix || "",
    empresaRazaoSocial: empresa?.razaoSocial || "",
    empresaCnpj: (empresa as any)?.cnpj || "",
    empresaEndereco: (empresa as any)?.endereco || "",
    docData: hoje,
    docLocal: cidade || "",
    docNumero: "",
  };

  // Rev. 4672 — Férias: pré-preenche da última férias programada quando
  // o usuário não informou os campos (extras têm precedência).
  if (input.tipo === "solicitacao_ferias" || input.tipo === "recibo_ferias") {
    const [vp] = await db.select().from(vacationPeriods).where(and(
      eq(vacationPeriods.companyId, input.companyId),
      eq(vacationPeriods.employeeId, input.employeeId),
      isNull(vacationPeriods.deletedAt),
      sql`${vacationPeriods.status} NOT IN ('cancelada', 'cancelado')`,
    )).orderBy(desc(vacationPeriods.id)).limit(1);
    if (vp) {
      Object.assign(dados, {
        feriasInicio: fmtDateBr((vp as any).dataInicio),
        feriasFim: fmtDateBr((vp as any).dataFim),
        feriasDias: String((vp as any).diasGozo ?? ""),
        aquisitivoInicio: fmtDateBr((vp as any).periodoAquisitivoInicio),
        aquisitivoFim: fmtDateBr((vp as any).periodoAquisitivoFim),
        abonoPecuniario: (vp as any).abonoPecuniario ? "Sim" : "Não",
        valorBruto: fmtSalario((vp as any).valorTotal),
        valorLiquido: fmtSalario((vp as any).valorLiquido),
        dataPagamento: fmtDateBr((vp as any).dataPagamento),
      });
    }
  }

  // extras digitados têm precedência sobre tudo (sanitizados contra HTML)
  for (const [k, v] of Object.entries(input.extras || {})) {
    if (/^[a-zA-Z0-9_]+$/.test(k)) dados[k] = String(v).replace(/[<>]/g, "");
  }

  // Placeholders não resolvidos viram vazio no snapshot (documento limpo)
  let html = renderTemplate(corpo, dados).replace(/\{\{\s*[a-zA-Z0-9_]+\s*\}\}/g, "");

  // Rev. 4672 — Ficha de Registro ganha a FOTO do cadastro (3x4 no topo).
  if (input.tipo === "ficha_registro" && (emp as any).fotoUrl && String((emp as any).fotoUrl).startsWith("/uploads/")) {
    const fotoSrc = String((emp as any).fotoUrl).split("?")[0];
    html = `<div style="float:right;margin:0 0 10px 14px;text-align:center">
<img src="${fotoSrc}" alt="Foto do colaborador" style="width:96px;height:128px;object-fit:cover;border:1px solid #0A1E3C;border-radius:4px"/>
<div style="font-size:7pt;color:#555;margin-top:2px">Foto do cadastro</div></div>` + html;
  }

  // ── Rev. 4678 — Moldura ISO: cabeçalho com logo + controle de revisão +
  //    rodapé LGPD em TODOS os documentos do colaborador (padrão ISO 9001).
  const codigo = usaVigente
    ? (tpl!.codigo || DEFAULT_CODIGOS[input.tipo as DocumentTemplateTipo])
    : DEFAULT_CODIGOS[input.tipo as DocumentTemplateTipo];
  const revisao = usaVigente ? (tpl!.versaoAtual ?? 1) : 1;
  // idempotência: se o template já embute a moldura (sentinela), não duplica
  if (!html.includes("<!--fc-moldura-iso-->")) html = montarMolduraIso({
    corpo: html,
    titulo: meta.titulo,
    codigo,
    revisao,
    dataEmissao: hoje,
    empresaNome: empresa?.razaoSocial || "",
    empresaCnpj: (empresa as any)?.cnpj || "",
    logoUrl: (empresa as any)?.logoUrl && String((empresa as any).logoUrl).startsWith("/uploads/")
      ? String((empresa as any).logoUrl).split("?")[0] : null,
  });

  return { html, meta, usaVigente, tpl, dados };
}

/** Escapa texto p/ interpolação segura no HTML da moldura. */
function escHtml(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Rev. 4678 — Moldura padrão ISO 9001 (controle de documentos) + LGPD.
 * Cabeçalho: logo da empresa · título · caixa de controle (código/rev/data).
 * Rodapé: aviso de documento controlado + cláusula LGPD (Lei 13.709/2018).
 * Inline styles apenas (o HTML vai pra preview, PDF via Puppeteer e FCSign).
 */
function montarMolduraIso(p: {
  corpo: string; titulo: string; codigo: string; revisao: number;
  dataEmissao: string; empresaNome: string; empresaCnpj: string; logoUrl: string | null;
}): string {
  const logo = p.logoUrl
    ? `<img src="${escHtml(p.logoUrl)}" alt="Logo" style="max-height:52px;max-width:150px;object-fit:contain"/>`
    : `<div style="font-weight:800;font-size:13pt;color:#0A1E3C;letter-spacing:.5px">${escHtml(p.empresaNome)}</div>`;
  return `<!--fc-moldura-iso-->
<table style="width:100%;border-collapse:collapse;border:1.5px solid #0A1E3C;margin-bottom:14px;font-family:Arial,Helvetica,sans-serif" role="presentation">
  <tr>
    <td style="border-right:1px solid #0A1E3C;padding:8px 12px;width:170px;text-align:center;vertical-align:middle">${logo}</td>
    <td style="border-right:1px solid #0A1E3C;padding:8px 12px;text-align:center;vertical-align:middle">
      <div style="font-size:12pt;font-weight:800;color:#0A1E3C;text-transform:uppercase;letter-spacing:.3px">${escHtml(p.titulo)}</div>
      <div style="font-size:7.5pt;color:#555;margin-top:2px">${escHtml(p.empresaNome)}${p.empresaCnpj ? " · CNPJ " + escHtml(p.empresaCnpj) : ""}</div>
    </td>
    <td style="padding:0;width:150px;vertical-align:middle">
      <table style="width:100%;border-collapse:collapse;font-size:7.5pt;color:#0A1E3C" role="presentation">
        <tr><td style="border-bottom:1px solid #0A1E3C;padding:3px 8px"><strong>Código:</strong> ${escHtml(p.codigo)}</td></tr>
        <tr><td style="border-bottom:1px solid #0A1E3C;padding:3px 8px"><strong>Revisão:</strong> ${String(p.revisao).padStart(2, "0")}</td></tr>
        <tr><td style="padding:3px 8px"><strong>Emissão:</strong> ${escHtml(p.dataEmissao)}</td></tr>
      </table>
    </td>
  </tr>
</table>
${p.corpo}
<div style="margin-top:22px;border-top:1.5px solid #0A1E3C;padding-top:8px;font-family:Arial,Helvetica,sans-serif">
  <p style="font-size:7pt;color:#555;text-align:justify;margin:0 0 4px 0"><strong>LGPD — Lei nº 13.709/2018:</strong> os dados pessoais contidos neste documento são tratados exclusivamente para o cumprimento de obrigações legais, contratuais e trabalhistas, com acesso restrito ao pessoal autorizado, pelo prazo exigido pela legislação. O titular pode exercer seus direitos (acesso, correção, eliminação) junto ao setor de Recursos Humanos da empresa.</p>
  <p style="font-size:7pt;color:#888;text-align:center;margin:0">${escHtml(p.codigo)} · Rev. ${String(p.revisao).padStart(2, "0")} · Documento controlado pelo Sistema de Gestão — cópia impressa ou digital fora do sistema é considerada NÃO CONTROLADA.</p>
</div>`;
}
