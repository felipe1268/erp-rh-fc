/**
 * Rev. 2195 — Router de Encargos Sociais sobre Folha.
 *
 * Permite à Lilian fazer upload das guias DCTFWeb (DARF unificada
 * INSS/IRRF/Terceiros) e FGTS Digital que a contabilidade terceirizada
 * envia mensalmente, conferir composição (códigos de tributo) mês a mês
 * e enviar pro financeiro pagar.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb, getUserCompanyLinks } from "../db";
import { encargosSociaisDocumentos } from "../../drizzle/schema";
import { and, desc, eq, sql, isNull } from "drizzle-orm";
import { storagePut } from "../storage";

// Rev. 2195 (architect review fix): guard de escopo multi-tenant.
// Sem isso, usuário autenticado conseguia ler/alterar documento de
// outra empresa via id direto (IDOR cross-company). Mesma regra dos
// routers compras/terceiros: admin libera; user com vínculos enforça
// membership; user sem vínculos (controle por grupo/módulo) libera.
async function assertCompanyAccess(ctxUser: any, companyId: number) {
  if (!ctxUser?.id) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
  if (ctxUser.role === "admin" || ctxUser.role === "admin_master") return;
  const links = await getUserCompanyLinks(ctxUser.id);
  const allowedIds = (links as any[]).map((l: any) => l.companyId).filter((v: any) => typeof v === "number");
  if (allowedIds.length === 0) return;
  if (!allowedIds.includes(companyId)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Sem acesso a esta empresa. (user=${ctxUser.id} req=${companyId})`,
    });
  }
}

// Carrega doc + valida escopo. Usado em getById/validar/enviarFinanceiro/desfazer/delete.
async function loadDocOrForbid(db: any, ctxUser: any, id: number) {
  const [row] = await db.select().from(encargosSociaisDocumentos)
    .where(eq(encargosSociaisDocumentos.id, id))
    .limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Documento não encontrado." });
  await assertCompanyAccess(ctxUser, (row as any).companyId);
  return row;
}

async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  const pdfParse = require("pdf-parse");
  const data = await pdfParse(buffer);
  return data.text;
}

// ============================================================
// PARSERS — DCTFWeb (DARF unificada) e FGTS Digital
// ============================================================

interface ItemEncargo {
  codigo: string;
  denominacao: string;
  principal: number;
  multa: number;
  juros: number;
  total: number;
  observacao?: string;
}

// Mapa códigos DCTFWeb conhecidos (Receita Federal)
const CODIGOS_DCTFWEB: Record<string, string> = {
  "0561": "IRRF - Rendimento do Trabalho Assalariado",
  "1082": "CP Segurados - Empregados/Avulso",
  "1099": "CP Segurados - Contribuintes Individuais",
  "1138": "CP Patronal - Empregados/Avulsos",
  "1162": "CP Patronal - Retenção Lei 9.711/98",
  "1170": "CP Terceiros - Salário Educação",
  "1176": "CP Terceiros - INCRA",
  "1181": "CP Terceiros - SENAI",
  "1184": "CP Terceiros - SESI",
  "1187": "CP Terceiros - SENAC",
  "1190": "CP Terceiros - SESC",
  "1200": "CP Terceiros - SEBRAE/APEX/ABDI",
  "1646": "CP Patronal - GILRAT/RAT Ajustado",
  "5952": "Retenção de Contribuições PJ a PJ",
};

function parseBRLNumber(s: string): number {
  if (!s) return 0;
  const cleaned = s.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

function detectCompetencia(text: string): string | null {
  // "PA:04/2026" ou "Período de Apuração ABRIL/2026" ou "Competência: 04/2026"
  const mesesNome: Record<string, string> = {
    janeiro: "01", fevereiro: "02", marco: "03", "março": "03",
    abril: "04", maio: "05", junho: "06", julho: "07",
    agosto: "08", setembro: "09", outubro: "10", novembro: "11", dezembro: "12",
  };
  const paMatch = text.match(/PA:\s*(\d{2})\/(\d{4})/);
  if (paMatch) return `${paMatch[2]}-${paMatch[1]}`;
  const compMatch = text.match(/(?:Compet[êe]ncia|Per[íi]odo\s+de\s+Apura[çc][ãa]o)[:\s]*(\d{2})\/(\d{4})/i);
  if (compMatch) return `${compMatch[2]}-${compMatch[1]}`;
  for (const [nome, num] of Object.entries(mesesNome)) {
    const re = new RegExp(`${nome}[\\s/]*(20\\d{2})`, "i");
    const m = text.match(re);
    if (m) return `${m[1]}-${num}`;
  }
  return null;
}

function detectDataVencimento(text: string): string | null {
  // "Pagar este documento até 20/05/2026" ou "Data de Vencimento 20/05/2026"
  const m = text.match(/(?:Pagar\s+este\s+documento\s+at[ée]|Data\s+de\s+Vencimento|Vencimento)\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i);
  if (m) return m[1];
  return null;
}

function detectNumeroDocumento(text: string): string | null {
  // DCTFWeb: "Número do Documento 07.16.26138.3756425-6"
  const dctfMatch = text.match(/N[úu]mero\s+do\s+Documento\s*[:\s]*([\d.-]+)/i);
  if (dctfMatch) return dctfMatch[1].trim();
  // FGTS: "Identificador 0126051838734169-4"
  const fgtsMatch = text.match(/Identificador\s*[:\s]*([\d-]+)/i);
  if (fgtsMatch) return fgtsMatch[1].trim();
  return null;
}

function parseDCTFWebPDF(text: string): { itens: ItemEncargo[]; valorTotal: number } {
  const itens: ItemEncargo[] = [];
  // Cada linha relevante começa com código de 4 dígitos seguido de denominação,
  // depois 3 valores numéricos (principal multa juros) ou 1 valor (principal).
  // Ex.: "1082 CONTR PREV DESCONTA SEGURADO-EMPREGADO/AVULSO 14.019,58 14.019,58"
  // Ex.: "1138 CONTRIB PREVIDENCIÁRIA EMPRESA/EMPREGADOR 44.147,11 44.147,11"
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Match: CCCC DENOM... VALOR (com possíveis multa/juros antes do total)
    const m = line.match(/^(\d{4})\s+(.+?)\s+([\d.,]+)(?:\s+([\d.,]+))?(?:\s+([\d.,]+))?\s+([\d.,]+)$/);
    if (m) {
      const codigo = m[1];
      const denominacao = m[2].trim();
      // Se há 4 valores: principal, multa, juros, total. Se há 2 valores: principal, total.
      const valores = [m[3], m[4], m[5], m[6]].filter(Boolean).map(parseBRLNumber);
      let principal = 0, multa = 0, juros = 0, total = 0;
      if (valores.length === 4) {
        [principal, multa, juros, total] = valores;
      } else if (valores.length === 2) {
        [principal, total] = valores;
      } else if (valores.length === 3) {
        [principal, multa, total] = valores;
      } else {
        principal = valores[0] || 0;
        total = valores[valores.length - 1] || principal;
      }
      // Validação: total deve ser positivo e código conhecido OU código com 4 dígitos válido
      if (total > 0) {
        itens.push({
          codigo,
          denominacao: CODIGOS_DCTFWEB[codigo] || denominacao,
          principal, multa, juros, total,
        });
      }
    }
  }
  // Extrai "Totais 111.915,01" ou "Valor Total do Documento 111.915,01"
  let valorTotal = 0;
  const totMatch = text.match(/(?:Totais|Valor\s+Total\s+do\s+Documento)\s*[\s\n]*([\d.,]+)/i);
  if (totMatch) valorTotal = parseBRLNumber(totMatch[1]);
  if (!valorTotal) valorTotal = itens.reduce((s, it) => s + it.total, 0);
  return { itens, valorTotal };
}

function parseFGTSDigitalPDF(text: string): { itens: ItemEncargo[]; valorTotal: number } {
  const itens: ItemEncargo[] = [];
  // FGTS Mensal e Consignado por competência
  // Ex.: "04/2026 86 17.452,78 0,00 0,00 0,00 17.452,78"
  const mensalMatch = text.match(/(\d{2}\/\d{4})\s+(\d+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)/);
  if (mensalMatch) {
    const total = parseBRLNumber(mensalMatch[7]);
    if (total > 0) {
      itens.push({
        codigo: "FGTS-MENSAL",
        denominacao: `FGTS Mensal (${mensalMatch[2]} trabalhadores)`,
        principal: parseBRLNumber(mensalMatch[3]),
        multa: 0, juros: 0, total,
      });
    }
  }
  // Consignado: "04/2026 11.794,22 0,00 11.794,22"
  const consigMatches = [...text.matchAll(/(\d{2}\/\d{4})\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)/g)];
  for (const m of consigMatches) {
    const total = parseBRLNumber(m[4]);
    const principal = parseBRLNumber(m[2]);
    // Filtrar pra evitar duplicar com Mensal (Mensal tem 7 valores, Consignado tem 3)
    if (total > 0 && principal > 0 && Math.abs(total - principal) < 100 && !itens.find(it => Math.abs(it.principal - principal) < 0.01)) {
      // Heurística: se aparece logo após "Consignado".
      // Architect Rev. 2195: usar m.index (posição real do match) em vez de
      // text.indexOf(m[0]) — indexOf retornava SEMPRE a 1ª ocorrência, errando
      // contexto em PDFs com múltiplas linhas similares.
      const idx = m.index ?? 0;
      const ctxBefore = text.substring(Math.max(0, idx - 200), idx);
      if (/Consignado/i.test(ctxBefore)) {
        itens.push({
          codigo: "FGTS-CONSIG",
          denominacao: "FGTS Consignado",
          principal, multa: 0, juros: 0, total,
        });
      }
    }
  }
  // Valor total da guia: "Total da Guia: 29.247,00" ou "Valor a recolher 29.247,00"
  let valorTotal = 0;
  const totMatch = text.match(/(?:Total\s+da\s+Guia|Valor\s+a\s+recolher)\s*:?\s*([\d.,]+)/i);
  if (totMatch) valorTotal = parseBRLNumber(totMatch[1]);
  if (!valorTotal) valorTotal = itens.reduce((s, it) => s + it.total, 0);
  return { itens, valorTotal };
}

// ============================================================
// ROUTER
// ============================================================

export const encargosSociaisRouter = router({
  upload: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      tipo: z.enum(["dctfweb", "fgts", "outro"]),
      fileName: z.string(),
      fileBase64: z.string(),
      mimeType: z.string().default("application/pdf"),
      competenciaManual: z.string().regex(/^\d{4}-\d{2}$/).optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = (await getDb())!;
      const buffer = Buffer.from(input.fileBase64, "base64");
      const text = await extractTextFromPDF(buffer);

      const competencia = input.competenciaManual || detectCompetencia(text) || new Date().toISOString().substring(0, 7);
      const dataVencimento = detectDataVencimento(text);
      const numeroDocumento = detectNumeroDocumento(text);

      let parsed: { itens: ItemEncargo[]; valorTotal: number };
      if (input.tipo === "dctfweb") parsed = parseDCTFWebPDF(text);
      else if (input.tipo === "fgts") parsed = parseFGTSDigitalPDF(text);
      else parsed = { itens: [], valorTotal: 0 };

      // Upload PDF
      const randomSuffix = Math.random().toString(36).substring(2, 10);
      const fileKey = `encargos-sociais/${input.companyId}/${competencia}/${input.tipo}-${randomSuffix}-${input.fileName}`;
      const { url } = await storagePut(fileKey, buffer, input.mimeType);

      const [inserted] = await db.insert(encargosSociaisDocumentos).values({
        companyId: input.companyId,
        competencia,
        tipo: input.tipo,
        numeroDocumento: numeroDocumento || null,
        dataVencimento: dataVencimento || null,
        valorTotal: parsed.valorTotal.toFixed(2),
        pdfUrl: url,
        pdfFileName: input.fileName,
        itensJson: JSON.stringify(parsed.itens),
        status: "importado",
        uploadedPor: ctx.user?.name || "Sistema",
        observacoes: input.observacoes || null,
      } as any).returning();

      return {
        id: Number(inserted.id),
        competencia,
        valorTotal: parsed.valorTotal,
        itensCount: parsed.itens.length,
        dataVencimento,
        numeroDocumento,
      };
    }),

  list: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      tipo: z.enum(["dctfweb", "fgts", "outro"]).optional(),
      competencia: z.string().regex(/^\d{4}-\d{2}$/).optional(),
      status: z.enum(["importado", "validado", "enviado_financeiro", "pago"]).optional(),
    }))
    .query(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = (await getDb())!;
      const conds = [
        eq(encargosSociaisDocumentos.companyId, input.companyId),
        isNull(encargosSociaisDocumentos.deletedAt),
      ];
      if (input.tipo) conds.push(eq(encargosSociaisDocumentos.tipo, input.tipo));
      if (input.competencia) conds.push(eq(encargosSociaisDocumentos.competencia, input.competencia));
      if (input.status) conds.push(eq(encargosSociaisDocumentos.status, input.status));

      const rows = await db.select().from(encargosSociaisDocumentos)
        .where(and(...conds))
        .orderBy(desc(encargosSociaisDocumentos.competencia), desc(encargosSociaisDocumentos.uploadedEm));

      return rows.map((r: any) => ({
        ...r,
        valorTotalNum: parseFloat(r.valorTotal || "0"),
      }));
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const row = await loadDocOrForbid(db, ctx.user, input.id);
      let itens: ItemEncargo[] = [];
      try { itens = JSON.parse((row as any).itensJson || "[]"); } catch {}
      return { ...(row as any), itens, valorTotalNum: parseFloat((row as any).valorTotal || "0") };
    }),

  validar: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      await loadDocOrForbid(db, ctx.user, input.id);
      await db.update(encargosSociaisDocumentos)
        .set({
          status: "validado",
          validadoPor: ctx.user?.name || "Sistema",
          validadoEm: new Date().toISOString().replace("T", " ").substring(0, 19),
          updatedAt: new Date().toISOString().replace("T", " ").substring(0, 19),
        } as any)
        .where(eq(encargosSociaisDocumentos.id, input.id));
      return { ok: true };
    }),

  enviarFinanceiro: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      await loadDocOrForbid(db, ctx.user, input.id);
      await db.update(encargosSociaisDocumentos)
        .set({
          status: "enviado_financeiro",
          enviadoFinanceiroPor: ctx.user?.name || "Sistema",
          enviadoFinanceiroEm: new Date().toISOString().replace("T", " ").substring(0, 19),
          updatedAt: new Date().toISOString().replace("T", " ").substring(0, 19),
        } as any)
        .where(eq(encargosSociaisDocumentos.id, input.id));
      return { ok: true };
    }),

  desfazer: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      await loadDocOrForbid(db, ctx.user, input.id);
      await db.update(encargosSociaisDocumentos)
        .set({
          status: "importado",
          validadoPor: null,
          validadoEm: null,
          enviadoFinanceiroPor: null,
          enviadoFinanceiroEm: null,
          updatedAt: new Date().toISOString().replace("T", " ").substring(0, 19),
        } as any)
        .where(eq(encargosSociaisDocumentos.id, input.id));
      return { ok: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      await loadDocOrForbid(db, ctx.user, input.id);
      await db.update(encargosSociaisDocumentos)
        .set({ deletedAt: new Date().toISOString().replace("T", " ").substring(0, 19) } as any)
        .where(eq(encargosSociaisDocumentos.id, input.id));
      return { ok: true };
    }),

  // Comparativo: total por mês para gráfico de evolução
  comparativoMensal: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      anoInicio: z.number().optional(),
    }))
    .query(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = (await getDb())!;
      const ano = input.anoInicio || new Date().getFullYear();
      const rows = await db.select().from(encargosSociaisDocumentos)
        .where(and(
          eq(encargosSociaisDocumentos.companyId, input.companyId),
          isNull(encargosSociaisDocumentos.deletedAt),
          sql`competencia >= ${ano + '-01'}`,
        ))
        .orderBy(encargosSociaisDocumentos.competencia);

      // Agrupa por competência
      const byMes = new Map<string, { competencia: string; dctfweb: number; fgts: number; outro: number; total: number }>();
      for (const r of rows as any[]) {
        const v = parseFloat(r.valorTotal || "0");
        const key = r.competencia;
        const cur = byMes.get(key) || { competencia: key, dctfweb: 0, fgts: 0, outro: 0, total: 0 };
        if (r.tipo === "dctfweb") cur.dctfweb += v;
        else if (r.tipo === "fgts") cur.fgts += v;
        else cur.outro += v;
        cur.total += v;
        byMes.set(key, cur);
      }
      return Array.from(byMes.values());
    }),
});
