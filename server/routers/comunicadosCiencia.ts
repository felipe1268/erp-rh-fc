// Rev. 4542 — Link público de LEITURA/CIÊNCIA de Comunicados Internos.
// Fluxo: gestor gera 1 link por comunicado e envia no grupo do WhatsApp; o funcionário
// abre, se identifica (CPF + data de nascimento), o sistema registra a VISUALIZAÇÃO
// (comunicado_leituras) e, ao clicar em "Li e estou ciente", registra a CIÊNCIA em
// comunicado_assinaturas (tipo='ciencia_online') — assinatura eletrônica simples
// (Lei 14.063/2020): identidade verificada + ato afirmativo + trilha de auditoria (IP/UA/timestamp).
//
// Segurança (tenant guard de link público — nada de confiar em input.companyId):
// - o token resolve o comunicado; TODA validação de funcionário usa o companyId DO COMUNICADO;
// - CPF normalizado dos dois lados (regexp_replace) — banco guarda formatos mistos;
// - se o comunicado tem destinatariosJson, só esses funcionários podem registrar ciência.
import { router, publicProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import {
  comunicadosInternos, comunicadoAssinaturas, comunicadoLeituras,
  employees, companies, systemDocumentTemplates,
} from "../../drizzle/schema";
import { eq, and, sql, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export const CIENCIA_ONLINE_MARKER = "ciencia_online";

// Anti-enumeração: mensagem GENÉRICA para qualquer falha de credencial/elegibilidade
// + rate-limit em memória por token+IP (10 tentativas falhas / 15 min).
const MSG_IDENT_GENERICA =
  "Não foi possível confirmar sua identidade com os dados informados. Confira o CPF e a data de nascimento ou procure o RH.";
const _tentativas = new Map<string, { count: number; resetAt: number }>();
const RATE_MAX = 10;
const RATE_WINDOW_MS = 15 * 60 * 1000;
function checkRateLimit(key: string) {
  const now = Date.now();
  const cur = _tentativas.get(key);
  if (cur && now < cur.resetAt && cur.count >= RATE_MAX) {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Muitas tentativas. Aguarde alguns minutos e tente novamente." });
  }
  if (_tentativas.size > 5000) {
    for (const [k, v] of _tentativas) if (now >= v.resetAt) _tentativas.delete(k);
  }
}
function registrarFalha(key: string) {
  const now = Date.now();
  const cur = _tentativas.get(key);
  if (!cur || now >= cur.resetAt) _tentativas.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
  else cur.count++;
}

function getClientIp(ctx: any): string | null {
  const req = (ctx as any)?.req;
  return (
    req?.headers?.["x-forwarded-for"]?.toString().split(",")[0]?.trim()
    || req?.socket?.remoteAddress || req?.ip || null
  );
}
function getClientUa(ctx: any): string | null {
  const ua = (ctx as any)?.req?.headers?.["user-agent"];
  return ua ? String(ua).slice(0, 300) : null;
}

async function getComunicadoByToken(db: any, token: string) {
  const [row] = await db.select().from(comunicadosInternos)
    .where(and(
      eq(comunicadosInternos.leituraToken, token),
      isNull(comunicadosInternos.deletedAt),
    )).limit(1);
  if (!row) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Link inválido ou expirado. Solicite um novo link ao RH." });
  }
  return row;
}

function parseDestinatarios(destinatariosJson: string | null): number[] | null {
  if (!destinatariosJson) return null;
  try {
    const parsed = JSON.parse(destinatariosJson);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const ids = parsed
        .map((d: any) => Number(typeof d === "object" ? (d.id ?? d) : d))
        .filter((n: number) => !isNaN(n) && n > 0);
      return ids.length > 0 ? ids : null;
    }
  } catch { /* JSON inválido = sem lista */ }
  return null;
}

// Identifica o funcionário DENTRO da empresa do comunicado por CPF + data de nascimento.
async function identificarFuncionario(db: any, comunicado: any, cpf: string, dataNascimento: string) {
  const cpfLimpo = String(cpf).replace(/\D/g, "");
  if (cpfLimpo.length !== 11) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "CPF inválido. Digite os 11 dígitos." });
  }
  const rows = await db.select({
    id: employees.id,
    nomeCompleto: employees.nomeCompleto,
    status: employees.status,
    dataNascimento: employees.dataNascimento,
    cargo: employees.cargo,
    funcao: employees.funcao,
  }).from(employees).where(and(
    eq(employees.companyId, comunicado.companyId),
    sql`regexp_replace(${employees.cpf}, '[^0-9]', '', 'g') = ${cpfLimpo}`,
  ));
  const emp = rows.find((r: any) => r.status === "Ativo") || rows[0];
  // Anti-enumeração: TODA falha (CPF inexistente, inativo, sem/errada data de
  // nascimento, fora da lista de destinatários) devolve a MESMA mensagem genérica.
  const falha = () => new TRPCError({ code: "FORBIDDEN", message: MSG_IDENT_GENERICA });
  if (!emp || emp.status !== "Ativo") throw falha();
  const nascDb = emp.dataNascimento
    ? (emp.dataNascimento instanceof Date
        ? (emp.dataNascimento as Date).toISOString().slice(0, 10)
        : String(emp.dataNascimento).slice(0, 10))
    : null;
  if (!nascDb || nascDb !== dataNascimento) throw falha();
  const destinatarios = parseDestinatarios(comunicado.destinatariosJson);
  if (destinatarios && !destinatarios.includes(emp.id)) throw falha();
  return emp;
}

// Wrapper: rate-limit por token+IP e contabiliza tentativas falhas.
async function identificarComRateLimit(db: any, comunicado: any, input: { token: string; cpf: string; dataNascimento: string }, ctx: any) {
  const key = `${input.token}|${getClientIp(ctx) || "?"}`;
  checkRateLimit(key);
  try {
    return await identificarFuncionario(db, comunicado, input.cpf, input.dataNascimento);
  } catch (e) {
    if (e instanceof TRPCError && e.code === "FORBIDDEN") registrarFalha(key);
    throw e;
  }
}

export const comunicadosCienciaRouter = router({
  // Metadados públicos (SEM conteúdo) — tela de identificação.
  obterPorToken: publicProcedure
    .input(z.object({ token: z.string().min(32).max(120) }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const c = await getComunicadoByToken(db, input.token);
      const [emp] = await db.select({
        nomeFantasia: companies.nomeFantasia,
        razaoSocial: companies.razaoSocial,
        cnpj: companies.cnpj,
        logoUrl: companies.logoUrl,
        endereco: companies.endereco,
        cidade: companies.cidade,
        estado: companies.estado,
      }).from(companies).where(eq(companies.id, c.companyId));
      return {
        numero: c.numero,
        titulo: c.titulo,
        dataEmissao: c.dataEmissao,
        empresaNome: emp?.nomeFantasia || emp?.razaoSocial || "",
        empresaCnpj: emp?.cnpj || "",
        empresaLogoUrl: emp?.logoUrl || null,
        empresaEndereco: [emp?.endereco, emp?.cidade, emp?.estado].filter(Boolean).join(" - "),
      };
    }),

  // Identifica o funcionário, REGISTRA a visualização (primeiro acesso) e devolve o conteúdo.
  identificar: publicProcedure
    .input(z.object({
      token: z.string().min(32).max(120),
      cpf: z.string().min(11).max(20),
      dataNascimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data de nascimento inválida"),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const c = await getComunicadoByToken(db, input.token);
      const emp = await identificarComRateLimit(db, c, input, ctx);

      // Registra a visualização — mantém o PRIMEIRO acesso (auditoria); não sobrescreve.
      await db.insert(comunicadoLeituras).values({
        comunicadoId: c.id,
        companyId: c.companyId,
        employeeId: emp.id,
        ip: getClientIp(ctx),
        userAgent: getClientUa(ctx),
      }).onConflictDoNothing();

      const [leitura] = await db.select({ visualizadoEm: comunicadoLeituras.visualizadoEm })
        .from(comunicadoLeituras)
        .where(and(eq(comunicadoLeituras.comunicadoId, c.id), eq(comunicadoLeituras.employeeId, emp.id)));

      const [assin] = await db.select({
        assinadoEm: comunicadoAssinaturas.assinadoEm,
        tipo: comunicadoAssinaturas.tipo,
      }).from(comunicadoAssinaturas)
        .where(and(eq(comunicadoAssinaturas.comunicadoId, c.id), eq(comunicadoAssinaturas.employeeId, emp.id)));

      // Template vigente (comunicado_interno) — mesma regra do módulo interno.
      const [tpl] = await db.select({ conteudoHtml: systemDocumentTemplates.conteudoHtml })
        .from(systemDocumentTemplates)
        .where(and(
          eq(systemDocumentTemplates.tipo, "comunicado_interno"),
          eq(systemDocumentTemplates.status, "vigente"),
          isNull(systemDocumentTemplates.deletedAt),
        )).limit(1);

      return {
        funcionario: { id: emp.id, nome: emp.nomeCompleto, cargo: emp.cargo || emp.funcao || "" },
        conteudo: c.conteudo,
        documentoUrl: c.documentoUrl,
        fileName: c.fileName,
        templateVigenteHtml: tpl?.conteudoHtml || null,
        emissorNome: c.emissorNome,
        emissorCargo: c.emissorCargo,
        visualizadoEm: leitura?.visualizadoEm || null,
        jaConfirmou: !!assin,
        confirmadoEm: assin?.assinadoEm || null,
      };
    }),

  // "Li e estou ciente" — registra a assinatura eletrônica simples.
  confirmarCiencia: publicProcedure
    .input(z.object({
      token: z.string().min(32).max(120),
      cpf: z.string().min(11).max(20),
      dataNascimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data de nascimento inválida"),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const c = await getComunicadoByToken(db, input.token);
      const emp = await identificarComRateLimit(db, c, input, ctx);

      // NUNCA sobrescreve assinatura já existente (desenho ou ciência anterior).
      const inserted = await db.insert(comunicadoAssinaturas).values({
        comunicadoId: c.id,
        companyId: c.companyId,
        employeeId: emp.id,
        assinaturaBase64: CIENCIA_ONLINE_MARKER,
        tipo: "ciencia_online",
        ip: getClientIp(ctx),
        userAgent: getClientUa(ctx),
        registradoPor: `Ciência online — ${emp.nomeCompleto}`,
      }).onConflictDoNothing({
        target: [comunicadoAssinaturas.comunicadoId, comunicadoAssinaturas.employeeId],
      }).returning({ assinadoEm: comunicadoAssinaturas.assinadoEm });

      if (inserted.length === 0) {
        const [existente] = await db.select({ assinadoEm: comunicadoAssinaturas.assinadoEm })
          .from(comunicadoAssinaturas)
          .where(and(eq(comunicadoAssinaturas.comunicadoId, c.id), eq(comunicadoAssinaturas.employeeId, emp.id)));
        return { jaExistia: true, confirmadoEm: existente?.assinadoEm || null };
      }
      return { jaExistia: false, confirmadoEm: inserted[0].assinadoEm };
    }),
});
