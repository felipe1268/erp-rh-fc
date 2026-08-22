// ============================================================================
// MÓDULO TELEFONES CORPORATIVOS (Rev. 5151)
// Gestão de plano corporativo com operadora, linhas vinculadas a colaboradores
// e registro de consumo mensal (crédito, dados, armazenamento).
// Tenancy: todas as operações filtradas por companyId.
// Acesso: admin_master e admin veem tudo; 'user' vê apenas a própria linha.
// ============================================================================
import { z } from "zod";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import * as XLSX from "xlsx";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb, getCompaniesForUser } from "../db";
import { telefonesPlanos, telefonesLinhas, telefonesUso, employees } from "../../drizzle/schema";
import { storagePut, dbRetrieve } from "../storage";
import { invokeLLM } from "../_core/llm";

// ── Helpers ──────────────────────────────────────────────────────────────────

function isAdmin(role?: string | null) {
  return role === "admin_master" || role === "admin";
}

async function assertModuleEnabled(companyId: number): Promise<void> {
  const db = getDb();
  const result = await db.execute(
    sql`SELECT enabled FROM module_config WHERE "companyId" = ${companyId} AND module_key = 'telefones-corporativos' LIMIT 1`
  );
  const rows: any[] = (result as any).rows ?? (result as any[]) ?? [];
  const config = rows[0];
  if (config && Number(config.enabled) === 0) {
    throw new TRPCError({ code: "FORBIDDEN", message: "O módulo Telefones Corporativos está desabilitado para esta empresa." });
  }
}

async function assertAccess(
  ctx: { user: { id: number; role?: string | null } },
  companyId: number
): Promise<void> {
  const permitidas = await getCompaniesForUser(ctx.user.id, (ctx.user.role || "") as string);
  if (!permitidas.some((c: any) => c.id === companyId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
  }
  await assertModuleEnabled(companyId);
}

async function findEmployeeDoUsuario(db: any, ctx: any, companyId: number): Promise<number | null> {
  const [porUserId] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(and(eq(employees.userId, ctx.user.id), eq(employees.companyId, companyId), isNull(employees.deletedAt)))
    .limit(1);
  if (porUserId) return porUserId.id;
  const email = (ctx.user.email || "").trim().toLowerCase();
  if (!email) return null;
  const [porEmail] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(and(sql`LOWER(TRIM(${employees.email})) = ${email}`, eq(employees.companyId, companyId), isNull(employees.deletedAt)))
    .limit(1);
  return porEmail?.id ?? null;
}

// ── Router ───────────────────────────────────────────────────────────────────

export const telefonesCorporativosRouter = router({

  // ── Plano / contrato ──────────────────────────────────────────────────────
  plano: router({
    get: protectedProcedure
      .input(z.object({ companyId: z.number() }))
      .query(async ({ ctx, input }) => {
        await assertAccess(ctx, input.companyId);
        const db = getDb();
        const [row] = await db
          .select()
          .from(telefonesPlanos)
          .where(eq(telefonesPlanos.companyId, input.companyId))
          .orderBy(desc(telefonesPlanos.createdAt))
          .limit(1);
        if (!row) return null;
        // Usuários comuns veem apenas os dados públicos do plano (sem URL/chave do PDF).
        // Admin master e admin têm acesso completo incluindo o arquivo do contrato.
        if (!isAdmin(ctx.user.role)) {
          const { contratoUrl: _url, contratoKey: _key, ...publicRow } = row;
          return publicRow;
        }
        return row;
      }),

    upsert: protectedProcedure
      .input(z.object({
        companyId:         z.number(),
        id:                z.number().optional(),
        operadora:         z.string().optional(),
        nomePlano:         z.string().optional(),
        cnpjOperadora:     z.string().optional(),
        telefoneOperadora: z.string().optional(),
        valorMensal:       z.string().optional(),
        diaVencimento:     z.number().optional(),
        dataInicio:        z.string().optional(),
        dataFim:           z.string().optional(),
        multaRescisoria:   z.string().optional(),
        fidelidadeMeses:   z.number().optional(),
        franquiaDadosGb:   z.string().optional(),
        clausulasJson:     z.string().optional(),
        observacoes:       z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!isAdmin(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem editar o plano." });
        await assertAccess(ctx, input.companyId);
        const db = getDb();
        const vals = {
          companyId:         input.companyId,
          operadora:         input.operadora ?? null,
          nomePlano:         input.nomePlano ?? null,
          cnpjOperadora:     input.cnpjOperadora ?? null,
          telefoneOperadora: input.telefoneOperadora ?? null,
          valorMensal:       input.valorMensal ?? null,
          diaVencimento:     input.diaVencimento ?? null,
          dataInicio:        input.dataInicio ?? null,
          dataFim:           input.dataFim ?? null,
          multaRescisoria:   input.multaRescisoria ?? null,
          fidelidadeMeses:   input.fidelidadeMeses ?? null,
          franquiaDadosGb:   input.franquiaDadosGb ?? null,
          clausulasJson:     input.clausulasJson ?? null,
          observacoes:       input.observacoes ?? null,
          updatedAt:         new Date().toISOString(),
        };
        if (input.id) {
          await db.update(telefonesPlanos).set(vals).where(and(eq(telefonesPlanos.id, input.id), eq(telefonesPlanos.companyId, input.companyId)));
          return { id: input.id };
        }
        const [novo] = await db.insert(telefonesPlanos).values({ ...vals, criadoPorId: ctx.user.id, criadoPorNome: ctx.user.name || ctx.user.email || "" }).returning({ id: telefonesPlanos.id });
        return { id: novo.id };
      }),

    uploadContrato: protectedProcedure
      .input(z.object({
        companyId: z.number(),
        planoId:   z.number().optional(),
        fileName:  z.string(),
        mimeType:  z.string(),
        base64:    z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!isAdmin(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem fazer upload." });
        await assertAccess(ctx, input.companyId);

        // Validar MIME — apenas PDF aceito.
        if (!input.mimeType.includes("pdf")) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Apenas arquivos PDF são aceitos." });
        }

        const db = getDb();
        const buf = Buffer.from(input.base64, "base64");

        // Validar assinatura do PDF (%PDF-).
        if (buf.length < 5 || buf.slice(0, 5).toString("ascii") !== "%PDF-") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "O arquivo não é um PDF válido." });
        }

        // Validar tamanho (máx. 20 MB).
        if (buf.length > 20 * 1024 * 1024) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Arquivo muito grande (máx. 20 MB)." });
        }

        // Chave UUID — não-adivinhável (não exposta na URL pública; servida via endpoint autenticado).
        const { randomUUID } = await import("crypto");
        const uuid = randomUUID();
        const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
        const key = `telefones/${input.companyId}/contratos/${uuid}_${safeName}`;
        await storagePut(key, buf, "application/pdf");

        // URL interna não-pública — frontend usa o endpoint autenticado /api/download/telefones-contrato.
        const internalUrl = `/uploads/${key}`;

        if (input.planoId) {
          await db.update(telefonesPlanos)
            .set({ contratoUrl: internalUrl, contratoKey: key, contratoNome: input.fileName, updatedAt: new Date().toISOString() })
            .where(and(eq(telefonesPlanos.id, input.planoId), eq(telefonesPlanos.companyId, input.companyId)));
        } else {
          await db.insert(telefonesPlanos).values({
            companyId: input.companyId, contratoUrl: internalUrl, contratoKey: key, contratoNome: input.fileName,
            criadoPorId: ctx.user.id, criadoPorNome: ctx.user.name || "",
          });
        }
        return { key, fileName: input.fileName };
      }),

    lerComIA: protectedProcedure
      .input(z.object({ companyId: z.number(), planoId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (!isAdmin(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem usar a IA." });
        await assertAccess(ctx, input.companyId);
        const db = getDb();
        const [plano] = await db.select().from(telefonesPlanos)
          .where(and(eq(telefonesPlanos.id, input.planoId), eq(telefonesPlanos.companyId, input.companyId))).limit(1);
        if (!plano) throw new TRPCError({ code: "NOT_FOUND", message: "Plano não encontrado." });
        if (!plano.contratoUrl) throw new TRPCError({ code: "BAD_REQUEST", message: "Faça upload do contrato primeiro." });

        // 1. Recuperar o PDF do storage pelo key (não pela URL pública).
        if (!plano.contratoKey) throw new TRPCError({ code: "BAD_REQUEST", message: "Chave do arquivo não encontrada. Reenvie o contrato." });
        const stored = await dbRetrieve(plano.contratoKey);
        if (!stored) throw new TRPCError({ code: "NOT_FOUND", message: "Arquivo do contrato não encontrado no armazenamento. Reenvie o contrato." });

        // 2. Extrair texto do PDF.
        let pdfText = "";
        try {
          const pdfParse = (await import("pdf-parse")).default as any;
          const parsed = await pdfParse(stored.buffer);
          pdfText = String(parsed?.text || "").trim().slice(0, 60_000); // limitar tokens
        } catch (e) {
          console.error("[Telefones] Falha ao extrair texto do PDF:", e);
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível extrair o texto do PDF. Verifique se o arquivo é um PDF com texto (não escaneado)." });
        }

        if (pdfText.length < 50) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "O PDF não contém texto legível (pode ser um arquivo escaneado). Preencha os dados manualmente." });
        }

        // 3. Enviar texto ao LLM e extrair campos.
        const userMsg = `Analise o texto do contrato de telefonia corporativa abaixo e extraia as informações estruturadas. Se algum campo não estiver presente, use null.

Retorne APENAS um JSON válido no formato:
{
  "operadora": "nome da operadora",
  "nomePlano": "nome comercial do plano",
  "cnpjOperadora": "00.000.000/0001-00",
  "telefoneOperadora": "(00) 0000-0000",
  "valorMensal": "R$ 000,00",
  "diaVencimento": 10,
  "dataInicio": "YYYY-MM-DD",
  "dataFim": "YYYY-MM-DD",
  "multaRescisoria": "R$ 000,00 ou descrição",
  "fidelidadeMeses": 12,
  "franquiaDadosGb": "10 GB",
  "clausulas": [
    { "titulo": "título da cláusula", "texto": "texto resumido (máx 200 chars)" }
  ]
}

TEXTO DO CONTRATO:
${pdfText}`;

        let result: any = {};
        let llmOk = false;
        try {
          const resp = await invokeLLM({
            messages: [
              { role: "system", content: "Você é um assistente jurídico especializado em contratos de telecomunicações corporativas. Retorne apenas JSON válido, sem markdown, sem texto adicional." },
              { role: "user", content: userMsg },
            ],
            maxTokens: 2048,
          });
          const raw = resp.choices[0]?.message?.content;
          const text = typeof raw === "string" ? raw : Array.isArray(raw) ? raw.map((t: any) => t.text || "").join("") : "";
          const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
          const match = cleaned.match(/\{[\s\S]*\}/);
          if (match) {
            result = JSON.parse(match[0]);
            llmOk = true;
          }
        } catch (e) {
          console.error("[Telefones] IA falhou ao extrair contrato:", e);
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "A IA não conseguiu processar o contrato. Tente novamente ou preencha os dados manualmente." });
        }

        if (!llmOk || Object.keys(result).length === 0) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "A IA não retornou dados estruturados válidos. Tente novamente ou preencha manualmente." });
        }

        // 4. Persistir apenas após extração bem-sucedida.
        const upd: any = { iaExtraiu: 1, iaExtraiuEm: new Date().toISOString(), updatedAt: new Date().toISOString() };
        if (result.operadora)         upd.operadora         = result.operadora;
        if (result.nomePlano)         upd.nomePlano         = result.nomePlano;
        if (result.cnpjOperadora)     upd.cnpjOperadora     = result.cnpjOperadora;
        if (result.telefoneOperadora) upd.telefoneOperadora = result.telefoneOperadora;
        if (result.valorMensal)       upd.valorMensal       = result.valorMensal;
        if (result.diaVencimento)     upd.diaVencimento     = Number(result.diaVencimento) || null;
        if (result.dataInicio)        upd.dataInicio        = result.dataInicio;
        if (result.dataFim)           upd.dataFim           = result.dataFim;
        if (result.multaRescisoria)   upd.multaRescisoria   = result.multaRescisoria;
        if (result.fidelidadeMeses)   upd.fidelidadeMeses   = Number(result.fidelidadeMeses) || null;
        if (result.franquiaDadosGb)   upd.franquiaDadosGb   = result.franquiaDadosGb;
        if (Array.isArray(result.clausulas) && result.clausulas.length > 0) {
          upd.clausulasJson = JSON.stringify(result.clausulas);
        }

        await db.update(telefonesPlanos).set(upd).where(eq(telefonesPlanos.id, input.planoId));
        return { sucesso: true, dados: result };
      }),
  }),

  // ── Linhas ────────────────────────────────────────────────────────────────
  linhas: router({
    list: protectedProcedure
      .input(z.object({ companyId: z.number() }))
      .query(async ({ ctx, input }) => {
        await assertAccess(ctx, input.companyId);
        const db = getDb();
        const admin = isAdmin(ctx.user.role);
        if (!admin) {
          const empId = await findEmployeeDoUsuario(db, ctx, input.companyId);
          if (!empId) return [];
          return db.select().from(telefonesLinhas)
            .where(and(eq(telefonesLinhas.companyId, input.companyId), eq(telefonesLinhas.employeeId, empId), isNull(telefonesLinhas.deletedAt)))
            .orderBy(telefonesLinhas.numero);
        }
        return db.select().from(telefonesLinhas)
          .where(and(eq(telefonesLinhas.companyId, input.companyId), isNull(telefonesLinhas.deletedAt)))
          .orderBy(telefonesLinhas.numero);
      }),

    create: protectedProcedure
      .input(z.object({
        companyId:      z.number(),
        numero:         z.string().min(1),
        operadora:      z.string().optional(),
        nomePlanoLinha: z.string().optional(),
        employeeId:     z.number().optional(),
        planoId:        z.number().optional(),
        imei:           z.string().optional(),
        dataAquisicao:  z.string().optional(),
        status:         z.string().optional(),
        observacoes:    z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!isAdmin(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem cadastrar linhas." });
        await assertAccess(ctx, input.companyId);
        const db = getDb();
        let employeeNome: string | null = null;
        if (input.employeeId) {
          // Validar que o colaborador pertence à mesma empresa (anti cross-tenant).
          const [emp] = await db.select({ nome: employees.nomeCompleto }).from(employees)
            .where(and(eq(employees.id, input.employeeId), eq(employees.companyId, input.companyId), isNull(employees.deletedAt))).limit(1);
          if (!emp) throw new TRPCError({ code: "BAD_REQUEST", message: "Colaborador não encontrado nesta empresa." });
          employeeNome = emp.nome;
        }
        const [row] = await db.insert(telefonesLinhas).values({
          companyId:      input.companyId,
          planoId:        input.planoId ?? null,
          numero:         input.numero.trim(),
          operadora:      input.operadora ?? null,
          nomePlanoLinha: input.nomePlanoLinha ?? null,
          employeeId:     input.employeeId ?? null,
          employeeNome,
          imei:           input.imei ?? null,
          dataAquisicao:  input.dataAquisicao ?? null,
          status:         input.status ?? "ativa",
          observacoes:    input.observacoes ?? null,
          criadoPorId:    ctx.user.id,
          criadoPorNome:  ctx.user.name || ctx.user.email || "",
        }).returning({ id: telefonesLinhas.id });
        return { id: row.id };
      }),

    update: protectedProcedure
      .input(z.object({
        id:             z.number(),
        companyId:      z.number(),
        numero:         z.string().optional(),
        operadora:      z.string().optional(),
        nomePlanoLinha: z.string().optional(),
        employeeId:     z.number().nullable().optional(),
        planoId:        z.number().nullable().optional(),
        imei:           z.string().optional(),
        dataAquisicao:  z.string().optional(),
        status:         z.string().optional(),
        observacoes:    z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!isAdmin(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem editar linhas." });
        await assertAccess(ctx, input.companyId);
        const db = getDb();
        let employeeNome: string | null | undefined = undefined;
        if (input.employeeId !== undefined) {
          if (input.employeeId === null) {
            employeeNome = null;
          } else {
            // Validar que o colaborador pertence à mesma empresa (anti cross-tenant).
            const [emp] = await db.select({ nome: employees.nomeCompleto }).from(employees)
              .where(and(eq(employees.id, input.employeeId), eq(employees.companyId, input.companyId), isNull(employees.deletedAt))).limit(1);
            if (!emp) throw new TRPCError({ code: "BAD_REQUEST", message: "Colaborador não encontrado nesta empresa." });
            employeeNome = emp.nome;
          }
        }
        const vals: any = { updatedAt: new Date().toISOString() };
        if (input.numero !== undefined)        vals.numero         = input.numero.trim();
        if (input.operadora !== undefined)     vals.operadora      = input.operadora || null;
        if (input.nomePlanoLinha !== undefined) vals.nomePlanoLinha = input.nomePlanoLinha || null;
        if (input.employeeId !== undefined)    vals.employeeId     = input.employeeId;
        if (employeeNome !== undefined)        vals.employeeNome   = employeeNome;
        if (input.planoId !== undefined)       vals.planoId        = input.planoId;
        if (input.imei !== undefined)          vals.imei           = input.imei || null;
        if (input.dataAquisicao !== undefined) vals.dataAquisicao  = input.dataAquisicao || null;
        if (input.status !== undefined)        vals.status         = input.status;
        if (input.observacoes !== undefined)   vals.observacoes    = input.observacoes || null;
        await db.update(telefonesLinhas).set(vals)
          .where(and(eq(telefonesLinhas.id, input.id), eq(telefonesLinhas.companyId, input.companyId)));
        return { ok: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number(), companyId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (!isAdmin(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem excluir linhas." });
        await assertAccess(ctx, input.companyId);
        const db = getDb();
        await db.update(telefonesLinhas).set({ deletedAt: new Date().toISOString() })
          .where(and(eq(telefonesLinhas.id, input.id), eq(telefonesLinhas.companyId, input.companyId)));
        return { ok: true };
      }),
  }),

  // ── Uso / Consumo ─────────────────────────────────────────────────────────
  uso: router({
    list: protectedProcedure
      .input(z.object({ companyId: z.number(), competencia: z.string().optional() }))
      .query(async ({ ctx, input }) => {
        await assertAccess(ctx, input.companyId);
        const db = getDb();
        const admin = isAdmin(ctx.user.role);

        let linhasWhere = and(eq(telefonesLinhas.companyId, input.companyId), isNull(telefonesLinhas.deletedAt));
        if (!admin) {
          const empId = await findEmployeeDoUsuario(db, ctx, input.companyId);
          if (!empId) return { linhas: [], uso: [] };
          linhasWhere = and(eq(telefonesLinhas.companyId, input.companyId), eq(telefonesLinhas.employeeId, empId), isNull(telefonesLinhas.deletedAt));
        }
        const linhas = await db.select().from(telefonesLinhas).where(linhasWhere).orderBy(telefonesLinhas.numero);

        // Consumo escopo exato: só nas linhas autorizadas acima — nunca toda a empresa.
        if (linhas.length === 0) return { linhas: [], uso: [] };
        const linhaIds = linhas.map((l: any) => l.id);

        let usoWhere: any = sql`${telefonesUso.linhaId} IN (${sql.join(linhaIds.map((id: number) => sql`${id}`), sql`, `)})`;
        if (input.competencia) {
          usoWhere = and(usoWhere, eq(telefonesUso.competencia, input.competencia));
        }
        const uso = await db.select().from(telefonesUso).where(usoWhere);
        return { linhas, uso };
      }),

    lancar: protectedProcedure
      .input(z.object({
        companyId:            z.number(),
        linhaId:              z.number(),
        competencia:          z.string(),
        creditoUsado:         z.string().optional(),
        creditoTotal:         z.string().optional(),
        dadosMb:              z.string().optional(),
        dadosTotalMb:         z.string().optional(),
        armazenamentoMb:      z.string().optional(),
        armazenamentoTotalMb: z.string().optional(),
        observacoes:          z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!isAdmin(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem registrar consumo." });
        await assertAccess(ctx, input.companyId);
        const db = getDb();
        // Validar que linhaId pertence exatamente a esta empresa (anti-IDOR cross-tenant).
        const [linhaOk] = await db
          .select({ id: telefonesLinhas.id })
          .from(telefonesLinhas)
          .where(and(eq(telefonesLinhas.id, input.linhaId), eq(telefonesLinhas.companyId, input.companyId), isNull(telefonesLinhas.deletedAt)))
          .limit(1);
        if (!linhaOk) throw new TRPCError({ code: "NOT_FOUND", message: "Linha não encontrada nesta empresa." });

        await db.execute(sql`
          INSERT INTO telefones_uso (company_id, linha_id, competencia, credito_usado, credito_total, dados_mb, dados_total_mb, armazenamento_mb, armazenamento_total_mb, observacoes, lancado_por_id, lancado_por_nome, created_at, updated_at)
          VALUES (${input.companyId}, ${input.linhaId}, ${input.competencia}, ${input.creditoUsado ?? null}, ${input.creditoTotal ?? null}, ${input.dadosMb ?? null}, ${input.dadosTotalMb ?? null}, ${input.armazenamentoMb ?? null}, ${input.armazenamentoTotalMb ?? null}, ${input.observacoes ?? null}, ${ctx.user.id}, ${ctx.user.name || ctx.user.email || ""}, now(), now())
          ON CONFLICT (linha_id, competencia)
          DO UPDATE SET
            credito_usado          = EXCLUDED.credito_usado,
            credito_total          = EXCLUDED.credito_total,
            dados_mb               = EXCLUDED.dados_mb,
            dados_total_mb         = EXCLUDED.dados_total_mb,
            armazenamento_mb       = EXCLUDED.armazenamento_mb,
            armazenamento_total_mb = EXCLUDED.armazenamento_total_mb,
            observacoes            = EXCLUDED.observacoes,
            lancado_por_id         = EXCLUDED.lancado_por_id,
            lancado_por_nome       = EXCLUDED.lancado_por_nome,
            updated_at             = now()
        `);
        return { ok: true };
      }),

    // ── Importar planilha em lote (Excel / CSV) ──────────────────────────────
    // Colunas esperadas (case-insensitive, com aliases):
    //   numero | telefone | linha  →  numero da linha para match
    //   credito_usado  | creditoUsado
    //   credito_total  | creditoTotal
    //   dados_mb       | dadosMb
    //   dados_total_mb | dadosTotalMb
    // Linhas sem match retornam em naoEncontrados (não bloqueiam o import).
    // Linhas com lançamento existente são sobrescritas (upsert).
    importarPlanilha: protectedProcedure
      .input(z.object({
        companyId:  z.number(),
        competencia: z.string().regex(/^\d{4}-\d{2}$/, "Formato de competência inválido (YYYY-MM)"),
        base64:     z.string(),
        fileName:   z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!isAdmin(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem importar consumo." });
        await assertAccess(ctx, input.companyId);

        // ── Parse da planilha ─────────────────────────────────────────────────
        const buf = Buffer.from(input.base64, "base64");
        let rows: Record<string, any>[];
        try {
          const wb = XLSX.read(buf, { type: "buffer" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
        } catch {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Não foi possível ler a planilha. Verifique se o arquivo é válido (.xlsx, .xls ou .csv)." });
        }

        if (rows.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "A planilha está vazia." });

        // ── Normalizar cabeçalhos (case-insensitive + underscore/camel aliases) ─
        const normalize = (s: string) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");

        const ALIASES: Record<string, string> = {
          numero:        "numero",
          telefone:      "numero",
          linha:         "numero",
          phone:         "numero",
          number:        "numero",
          creditousado:  "creditoUsado",
          creditoused:   "creditoUsado",
          creditototal:  "creditoTotal",
          dadosmb:       "dadosMb",
          dadostotalmb:  "dadosTotalMb",
          datatotalmb:   "dadosTotalMb",
        };

        const mapRow = (raw: Record<string, any>) => {
          const mapped: Record<string, string> = {};
          for (const [k, v] of Object.entries(raw)) {
            const alias = ALIASES[normalize(k)];
            if (alias) mapped[alias] = String(v ?? "").trim();
          }
          return mapped;
        };

        // ── Carregar linhas ativas da empresa ─────────────────────────────────
        const db = getDb();
        const linhas = await db
          .select({ id: telefonesLinhas.id, numero: telefonesLinhas.numero })
          .from(telefonesLinhas)
          .where(and(eq(telefonesLinhas.companyId, input.companyId), isNull(telefonesLinhas.deletedAt)));

        // Normalizar número de telefone: manter apenas dígitos para match
        const normalizeNum = (n: string) => String(n).replace(/\D/g, "");
        const linhaMap = new Map<string, number>(); // normalized numero → id
        for (const l of linhas) {
          linhaMap.set(normalizeNum(l.numero || ""), l.id);
        }

        // ── Processar cada linha da planilha ──────────────────────────────────
        const lancadoPor = ctx.user.name || ctx.user.email || String(ctx.user.id);
        let importados = 0;
        const naoEncontrados: string[] = [];

        for (const rawRow of rows) {
          const row = mapRow(rawRow);
          const numRaw = row["numero"] ?? "";
          if (!numRaw) continue; // pular linhas sem número

          const numNorm = normalizeNum(numRaw);
          const linhaId = linhaMap.get(numNorm);

          if (!linhaId) {
            naoEncontrados.push(numRaw);
            continue;
          }

          const creditoUsado   = row["creditoUsado"]   || null;
          const creditoTotal   = row["creditoTotal"]   || null;
          const dadosMb        = row["dadosMb"]        || null;
          const dadosTotalMb   = row["dadosTotalMb"]   || null;

          await db.execute(sql`
            INSERT INTO telefones_uso (company_id, linha_id, competencia, credito_usado, credito_total, dados_mb, dados_total_mb, lancado_por_id, lancado_por_nome, created_at, updated_at)
            VALUES (${input.companyId}, ${linhaId}, ${input.competencia}, ${creditoUsado}, ${creditoTotal}, ${dadosMb}, ${dadosTotalMb}, ${ctx.user.id}, ${lancadoPor}, now(), now())
            ON CONFLICT (linha_id, competencia)
            DO UPDATE SET
              credito_usado    = EXCLUDED.credito_usado,
              credito_total    = EXCLUDED.credito_total,
              dados_mb         = EXCLUDED.dados_mb,
              dados_total_mb   = EXCLUDED.dados_total_mb,
              lancado_por_id   = EXCLUDED.lancado_por_id,
              lancado_por_nome = EXCLUDED.lancado_por_nome,
              updated_at       = now()
          `);
          importados++;
        }

        return { importados, naoEncontrados };
      }),
  }),

  // ── Employees ativos (combobox — admin apenas) ────────────────────────────
  // Restrito a admins: é usado apenas no diálogo de criação/edição de linha.
  // Usuários comuns não têm necessidade de enumerar colaboradores.
  employeesAtivos: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ ctx, input }) => {
      if (!isAdmin(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito a administradores." });
      await assertAccess(ctx, input.companyId);
      const db = getDb();
      return db
        .select({ id: employees.id, nomeCompleto: employees.nomeCompleto, funcao: employees.funcao, status: employees.status, tipoContrato: employees.tipoContrato })
        .from(employees)
        .where(and(
          eq(employees.companyId, input.companyId),
          isNull(employees.deletedAt),
          sql`${employees.status} NOT IN ('Desligado', 'Demitido', 'Rescindido')`,
        ))
        .orderBy(employees.nomeCompleto);
    }),
});
