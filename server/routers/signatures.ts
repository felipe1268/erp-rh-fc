import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb, getCompaniesForUser } from "../db";
import { signatureSessions, signatureSigners, employees, companies, employeeDocuments } from "../../drizzle/schema";
import { eq, and, desc, sql, isNull } from "drizzle-orm";
import { resolveCompanyIds, companyFilter } from "../companyHelper";
import { TRPCError } from "@trpc/server";
import { storagePut } from "../storage";
import { randomBytes, createHash } from "crypto";

function sha256(s: string) {
  return createHash("sha256").update(s, "utf8").digest("hex");
}
function genToken() {
  return randomBytes(32).toString("hex");
}
// Rev. 2119: escape HTML defensivo — nome/cpf de signatários (especialmente
// testemunhas digitadas livremente no FCSignSendDialog) são interpolados no
// HTML do `renderFinalHtml` que vai parar tanto no preview quanto no arquivo
// final persistido no storage. Sem escape, abre stored-XSS / HTML injection.
function escapeHtml(s: string | null | undefined): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Rev. 2120: estampa a imagem da assinatura SOBRE a linha de assinatura do
// próprio documento (placeholder `<!--FCSIGN:SIG:{role}-->` inserido pelo
// `fcDocumentTemplate.ts`). Sem assinatura ainda, o placeholder fica vazio
// (preserva o espaço de 50px do slot, layout estável). Com assinatura,
// vira `<img src="data:..." />` centralizada acima da linha do nome.
// O bloco completo de auditoria (CPF/IP/hash/data) continua aparecendo no
// rodapé via `renderFinalHtml`.
// Defesa em profundidade contra `signatureDataUrl` malformado vindo de docs
// legados (assinados antes da Rev. 2120, quando a regex no `sign` era só de
// prefixo). Aceita SOMENTE o formato canônico ancorado + charset base64
// estrito — qualquer caractere fora do alfabeto vira `null` e o slot fica
// vazio em vez de interpolar HTML potencialmente injetável.
const SIG_DATA_URL_RE = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/;
function safeSignatureDataUrl(v: string | null | undefined): string | null {
  if (!v || typeof v !== "string") return null;
  if (v.length > 2_000_000) return null;
  return SIG_DATA_URL_RE.test(v) ? v : null;
}

function stampSignaturesOnSlots(
  documentHtml: string,
  signers: Array<{ role: string; signatureDataUrl: string | null; signedAt: string | null }>
): string {
  let html = documentHtml;
  for (const s of signers) {
    const placeholder = `<!--FCSIGN:SIG:${s.role}-->`;
    if (!html.includes(placeholder)) continue;
    const safeUrl = safeSignatureDataUrl(s.signatureDataUrl);
    if (safeUrl && s.signedAt) {
      const imgTag = `<img src="${safeUrl}" alt="Assinatura" style="max-height:50px;max-width:240px;display:inline-block;vertical-align:bottom" />`;
      html = html.split(placeholder).join(imgTag);
    } else {
      // Pendente OU dataUrl rejeitado pela validação — slot vazio (layout estável).
      html = html.split(placeholder).join("");
    }
  }
  return html;
}

// Rev. 2119: signers agora podem incluir `ordem` (1..n) — quando passado, o bloco
// de assinaturas é ordenado por `ordem` e signatários pendentes aparecem como
// "Aguardando assinatura" (caixa cinza) em vez de "Não assinado" (vermelho).
// Isso permite renderizar o documento parcial (preview) durante o fluxo,
// mostrando quem já assinou e quem ainda falta — sem esperar todos.
function renderFinalHtml(
  documentHtml: string,
  signers: Array<{ role: string; ordem?: number | null; nome: string; cpf: string | null; signedAt: string | null; signatureDataUrl: string | null; ip: string | null; signatureHash: string | null }>,
  opts?: { isPreview?: boolean }
) {
  const isPreview = !!opts?.isPreview;
  const roleLabel: Record<string, string> = {
    empregado: "EMPREGADO(A)",
    empregador: "EMPREGADOR (FC Engenharia)",
    testemunha_1: "Testemunha 1",
    testemunha_2: "Testemunha 2",
  };
  // Ordena por `ordem` quando disponível (fallback: mantém ordem do array)
  const ordered = [...signers].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
  const sigsHtml = ordered.map((s) => {
    const dt = s.signedAt ? new Date(s.signedAt).toLocaleString("pt-BR") : "—";
    const nomeSafe = escapeHtml(s.nome);
    const cpfSafe = escapeHtml(s.cpf);
    const roleSafe = escapeHtml(roleLabel[s.role] || s.role);
    const ipSafe = escapeHtml(s.ip);
    // Rev. 2120 (hotfix): valida formato do dataUrl no SINK também (defesa em
    // profundidade contra registros legados). `signatureHash` é hex puro do sha256.
    const safeSigUrl = safeSignatureDataUrl(s.signatureDataUrl);
    const ordemBadge = s.ordem ? `<span style="display:inline-block;background:#1B2A4A;color:#fff;font-size:8pt;padding:1px 6px;border-radius:3px;margin-right:6px;vertical-align:middle">${s.ordem}ª</span>` : "";
    if (s.signedAt && safeSigUrl) {
      return `<div style="border:1px solid #ccc;border-radius:4px;padding:12px;margin-bottom:12px;page-break-inside:avoid;background:#fff">
  <div style="font-size:10pt;color:#666;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">${ordemBadge}${roleSafe}</div>
  <div style="font-weight:bold;font-size:11pt">${nomeSafe}</div>
  ${cpfSafe ? `<div style="font-size:9pt;color:#555">CPF: ${cpfSafe}</div>` : ""}
  <img src="${safeSigUrl}" alt="Assinatura" style="max-height:80px;margin-top:6px;display:block" />
  <div style="font-size:8pt;color:#888;margin-top:6px">
    Assinado em: ${dt}${ipSafe ? ` · IP: ${ipSafe}` : ""}${s.signatureHash ? `<br/>Hash: ${s.signatureHash.substring(0, 32)}…` : ""}
  </div>
</div>`;
    }
    // Pendente — preview mostra "Aguardando", final mostra "Não assinado"
    const waitMsg = isPreview ? "⏳ Aguardando assinatura" : "Não assinado";
    const waitColor = isPreview ? "#92400e" : "#a00";
    const waitBg = isPreview ? "#fef3c7" : "#fff";
    const waitBorder = isPreview ? "#fcd34d" : "#ccc";
    return `<div style="border:1px dashed ${waitBorder};border-radius:4px;padding:12px;margin-bottom:12px;page-break-inside:avoid;background:${waitBg}">
  <div style="font-size:10pt;color:#666;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">${ordemBadge}${roleSafe}</div>
  <div style="font-weight:bold;font-size:11pt;color:#333">${nomeSafe}</div>
  ${cpfSafe ? `<div style="font-size:9pt;color:#555">CPF: ${cpfSafe}</div>` : ""}
  <div style="color:${waitColor};font-style:italic;font-size:9.5pt;margin-top:6px">${waitMsg}</div>
</div>`;
  }).join("\n");

  const headerTitle = isPreview
    ? "Assinaturas Digitais — FCSign (Em andamento)"
    : "Assinaturas Digitais — FCSign";
  const subtitle = isPreview
    ? "Documento em coleta de assinaturas — fluxo sequencial conforme ordem definida. As assinaturas concluídas têm validade jurídica nos termos da MP 2.200-2/2001."
    : "Documento assinado eletronicamente nos termos da Medida Provisória 2.200-2/2001.";

  const footer = `<div style="margin-top:40px;border-top:2px solid #1B2A4A;padding-top:16px;page-break-before:auto">
  <h3 style="color:#1B2A4A;margin:0 0 12px 0;font-size:13pt;text-transform:uppercase;letter-spacing:1px">${headerTitle}</h3>
  <p style="font-size:9pt;color:#666;margin-bottom:16px">${subtitle}</p>
  ${sigsHtml}
</div>`;

  if (documentHtml.includes("</body>")) {
    return documentHtml.replace("</body>", footer + "</body>");
  }
  return documentHtml + footer;
}

export const signaturesRouter = router({
  // Criar sessao de assinatura (chamada do contrato)
  create: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      employeeId: z.number(),
      tipo: z.string().min(1).max(50),
      documentTitle: z.string().min(1).max(255),
      documentHtml: z.string().min(1),
      signers: z.array(z.object({
        role: z.enum(["empregado", "empregador", "testemunha_1", "testemunha_2"]),
        nome: z.string().min(1).max(255),
        cpf: z.string().max(20).optional().nullable(),
        email: z.string().max(255).optional().nullable(),
      })).min(1).max(10),
      observacoes: z.string().optional().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      // ACL: garante que o funcionário pertence à empresa informada (evita cross-company)
      const [emp] = await db.select({ id: employees.id, companyId: employees.companyId }).from(employees).where(eq(employees.id, input.employeeId)).limit(1);
      if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Colaborador não encontrado." });
      if (Number(emp.companyId) !== Number(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Colaborador não pertence a esta empresa." });
      }
      // Hardening contra XSS armazenado: rejeita HTML com scripts/handlers (defense-in-depth)
      if (/<\s*script\b/i.test(input.documentHtml) || /\son\w+\s*=/i.test(input.documentHtml) || /javascript:/i.test(input.documentHtml)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Documento contém conteúdo não permitido (script/handler/javascript:)." });
      }
      // Rev. 2122 — bloqueia duplicidade: já existir sessão NÃO-cancelada
      // pro mesmo employeeId+tipo. Espelha a regra do painel
      // FCSignContratoExperienciaPanel no front, mas como autoridade final
      // server-side (evita 2 abas/clientes criarem sessões concorrentes).
      const [dup] = await db.select({ id: signatureSessions.id, status: signatureSessions.status })
        .from(signatureSessions)
        .where(and(
          eq(signatureSessions.companyId, input.companyId),
          eq(signatureSessions.employeeId, input.employeeId),
          eq(signatureSessions.tipo, input.tipo),
          sql`${signatureSessions.status} <> 'cancelado'`,
        ))
        .orderBy(desc(signatureSessions.createdAt))
        .limit(1);
      if (dup) {
        throw new TRPCError({
          code: "CONFLICT",
          message: dup.status === "completo"
            ? "Já existe um documento deste tipo assinado pra este colaborador. Apague o anterior (admin master) pra emitir um novo."
            : "Já existe uma sessão FCSign em andamento pra este documento.",
        });
      }
      const hash = sha256(input.documentHtml);
      const [session] = await db.insert(signatureSessions).values({
        companyId: input.companyId,
        employeeId: input.employeeId,
        tipo: input.tipo,
        documentTitle: input.documentTitle,
        documentHtml: input.documentHtml,
        documentHash: hash,
        status: "em_andamento",
        createdByUserId: ctx.user.id,
        createdByName: ctx.user.name ?? "Sistema",
        observacoes: input.observacoes || null,
      }).returning();

      const signersToInsert = input.signers.map((s, i) => ({
        sessionId: session.id,
        role: s.role,
        ordem: i + 1,
        nome: s.nome,
        cpf: s.cpf || null,
        email: s.email || null,
        token: genToken(),
      }));
      const createdSigners = await db.insert(signatureSigners).values(signersToInsert).returning();

      return {
        sessionId: session.id,
        documentHash: hash,
        signers: createdSigners.map((s) => ({
          id: s.id,
          role: s.role,
          nome: s.nome,
          token: s.token,
          link: `/assinar/${s.token}`,
        })),
      };
    }),

  // PUBLICO: signatario abre o link e busca os dados
  getByToken: publicProcedure
    .input(z.object({ token: z.string().length(64) }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const [signer] = await db.select().from(signatureSigners).where(eq(signatureSigners.token, input.token)).limit(1);
      if (!signer) throw new TRPCError({ code: "NOT_FOUND", message: "Link inválido ou expirado." });
      const [session] = await db.select().from(signatureSessions).where(eq(signatureSessions.id, signer.sessionId)).limit(1);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Sessão não encontrada." });
      const [emp] = await db.select({ nome: employees.nomeCompleto }).from(employees).where(eq(employees.id, session.employeeId)).limit(1);
      const [comp] = await db.select({ razaoSocial: companies.razaoSocial, cnpj: companies.cnpj }).from(companies).where(eq(companies.id, session.companyId)).limit(1);
      // Rev. 2119: agora trazemos TUDO dos signers (precisa de signatureDataUrl,
      // signedAt, ip, hash, ordem) pra montar o preview parcial com o bloco de
      // assinaturas embutido no documento — incluindo "Aguardando assinatura"
      // dos pendentes e a ordem (1ª, 2ª…) que precisa ser respeitada.
      const allSignersFull = await db.select().from(signatureSigners)
        .where(eq(signatureSigners.sessionId, session.id))
        .orderBy(signatureSigners.ordem);

      // Rev. 2120: ANTES de adicionar o footer de auditoria, estampa as
      // imagens das assinaturas SOBRE as linhas do contrato (placeholders).
      const docStamped = stampSignaturesOnSlots(
        session.documentHtml,
        allSignersFull.map((s) => ({ role: s.role, signatureDataUrl: s.signatureDataUrl, signedAt: s.signedAt }))
      );

      // HTML do documento ENRIQUECIDO com bloco de assinaturas (preview).
      // Se a sessão estiver completa, mostra como definitivo (sem "aguardando").
      const docHtmlWithSignatures = renderFinalHtml(
        docStamped,
        allSignersFull.map((s) => ({
          role: s.role,
          ordem: s.ordem,
          nome: s.nome,
          cpf: s.cpf,
          signedAt: s.signedAt,
          signatureDataUrl: s.signatureDataUrl,
          ip: s.ip,
          signatureHash: s.signatureHash,
        })),
        { isPreview: session.status !== "completo" }
      );

      // Ordem: qual o próximo signatário pendente?
      // Rev. 2119: blindagem contra sessões legadas onde TODOS signers têm
      // `ordem` nula/zero — nesses casos o fluxo é PARALELO (compat antiga):
      // qualquer pendente pode assinar a qualquer momento.
      const todosSemOrdem = allSignersFull.every((s) => !s.ordem);
      const pendentes = allSignersFull.filter((s) => !s.signedAt).sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
      const proximoSigner = pendentes[0] || null;
      // canSignNow: paralelo se legado; caso contrário, só se for o próximo da fila
      const canSignNow = todosSemOrdem
        ? !signer.signedAt
        : !!(proximoSigner && proximoSigner.id === signer.id);
      // Quem está bloqueando (só faz sentido quando há ordem sequencial)
      const aguardando = !canSignNow && !signer.signedAt && proximoSigner && !todosSemOrdem
        ? { nome: proximoSigner.nome, role: proximoSigner.role, ordem: proximoSigner.ordem }
        : null;

      return {
        signer: {
          id: signer.id, role: signer.role, ordem: signer.ordem, nome: signer.nome, cpf: signer.cpf,
          signedAt: signer.signedAt, signatureDataUrl: signer.signatureDataUrl,
        },
        session: {
          id: session.id, tipo: session.tipo, documentTitle: session.documentTitle,
          documentHtml: docHtmlWithSignatures, status: session.status, createdAt: session.createdAt,
          completedAt: session.completedAt,
        },
        employee: emp ?? null,
        company: comp ?? null,
        allSigners: allSignersFull.map((s) => ({
          id: s.id, role: s.role, ordem: s.ordem, nome: s.nome, signedAt: s.signedAt,
        })),
        canSignNow,
        aguardando,
      };
    }),

  // PUBLICO: signatario envia a assinatura
  sign: publicProcedure
    .input(z.object({
      token: z.string().length(64),
      // Rev. 2120 (hotfix code review): regex ANCORADA no fim + charset
      // base64 estrito + limite de tamanho (~1.5MB de PNG codificado).
      // Antes a regex validava só o PREFIXO, permitindo `data:image/png;base64,X"
      // onerror=...` — vetor de stored-XSS quando o valor é interpolado em
      // `<img src="${...}">` por `stampSignaturesOnSlots`/`renderFinalHtml`.
      signatureDataUrl: z
        .string()
        .max(2_000_000)
        .regex(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/),
      userAgent: z.string().max(500).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const [signer] = await db.select().from(signatureSigners).where(eq(signatureSigners.token, input.token)).limit(1);
      if (!signer) throw new TRPCError({ code: "NOT_FOUND", message: "Link inválido." });
      if (signer.signedAt) throw new TRPCError({ code: "BAD_REQUEST", message: "Este documento já foi assinado por você." });

      const [session] = await db.select().from(signatureSessions).where(eq(signatureSessions.id, signer.sessionId)).limit(1);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Sessão não encontrada." });
      if (session.status === "cancelado") throw new TRPCError({ code: "BAD_REQUEST", message: "Esta solicitação foi cancelada." });
      if (session.status === "completo") throw new TRPCError({ code: "BAD_REQUEST", message: "Documento já está completo." });

      // Rev. 2119 — VALIDA ORDEM: só permite assinar se TODOS com `ordem` menor
      // já assinaram. Garante o fluxo sequencial definido na criação da sessão
      // (ex: colaborador 1º → empregador 2º → testemunhas 3ª/4ª).
      const ordemSigners = await db.select({
        id: signatureSigners.id, nome: signatureSigners.nome, role: signatureSigners.role,
        ordem: signatureSigners.ordem, signedAt: signatureSigners.signedAt,
      }).from(signatureSigners).where(eq(signatureSigners.sessionId, session.id));
      const minhaOrdem = signer.ordem ?? 0;
      const anterioresPendentes = ordemSigners
        .filter((s) => (s.ordem ?? 0) < minhaOrdem && !s.signedAt)
        .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
      if (anterioresPendentes.length > 0) {
        const proximo = anterioresPendentes[0];
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Aguardando assinatura de ${proximo.nome} (${proximo.ordem}ª na ordem) antes da sua.`,
        });
      }

      // Captura IP do request (Express)
      const req = (ctx as any).req;
      const ip = (req?.headers?.["x-forwarded-for"]?.toString().split(",")[0].trim()) || req?.socket?.remoteAddress || req?.ip || null;

      const sigHash = sha256(input.signatureDataUrl);
      const nowIso = new Date().toISOString();
      // UPDATE condicional: só assina se ainda não estiver assinado (atômico) — previne race em retries duplos
      const updated = await db.update(signatureSigners).set({
        signedAt: nowIso,
        signatureDataUrl: input.signatureDataUrl,
        signatureHash: sigHash,
        ip,
        userAgent: input.userAgent || req?.headers?.["user-agent"] || null,
      }).where(and(eq(signatureSigners.id, signer.id), sql`${signatureSigners.signedAt} IS NULL`)).returning({ id: signatureSigners.id });
      if (updated.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Este documento já foi assinado por você." });
      }

      // Checa se todos ja assinaram
      const allSigners = await db.select().from(signatureSigners).where(eq(signatureSigners.sessionId, session.id));
      const allSigned = allSigners.every((s) => s.signedAt);

      if (allSigned) {
        // Idempotência: tenta marcar a sessão como "em finalização" atômico — se já estiver completo, outro request finalizou
        const claim = await db.update(signatureSessions).set({
          status: "completo",
          completedAt: nowIso,
        }).where(and(eq(signatureSessions.id, session.id), sql`${signatureSessions.status} <> 'completo'`)).returning({ id: signatureSessions.id });
        if (claim.length > 0) {
          // Rev. 2120: também estampa as assinaturas SOBRE as linhas do
          // documento final persistido (não só no preview).
          const stampedFinal = stampSignaturesOnSlots(
            session.documentHtml,
            allSigners.map((s) => ({ role: s.role, signatureDataUrl: s.signatureDataUrl, signedAt: s.signedAt }))
          );
          const finalHtml = renderFinalHtml(stampedFinal, allSigners.map((s) => ({
            role: s.role, ordem: s.ordem, nome: s.nome, cpf: s.cpf, signedAt: s.signedAt,
            signatureDataUrl: s.signatureDataUrl, ip: s.ip, signatureHash: s.signatureHash,
          })));

          const buf = Buffer.from(finalHtml, "utf-8");
          const fileKey = `fcsign/${session.companyId}/${session.employeeId}/sessao-${session.id}-assinado.html`;
          const { url } = await storagePut(fileKey, buf, "text/html");

          // Anexa ao RAIO-X (employeeDocuments)
          const [doc] = await db.insert(employeeDocuments).values({
            companyId: session.companyId,
            employeeId: session.employeeId,
            tipo: "contrato_trabalho",
            nome: `${session.documentTitle} (assinado)`,
            descricao: `FCSign #${session.id} · ${allSigners.length} assinaturas · hash ${session.documentHash.substring(0, 16)}…`,
            fileUrl: url,
            fileKey,
            mimeType: "text/html",
            fileSize: buf.length,
            uploadPor: "FCSign",
            uploadPorUserId: session.createdByUserId,
          }).returning();

          await db.update(signatureSessions).set({
            finalDocumentUrl: url,
            finalEmployeeDocumentId: doc.id,
          }).where(eq(signatureSessions.id, session.id));
        }
      }

      return { success: true, allSigned };
    }),

  // Listar sessoes de um colaborador
  listByEmployee: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), employeeId: z.number() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const sessions = await db.select().from(signatureSessions)
        .where(and(
          companyFilter(signatureSessions.companyId, input),
          eq(signatureSessions.employeeId, input.employeeId),
        ))
        .orderBy(desc(signatureSessions.createdAt));
      if (sessions.length === 0) return [];
      const sessionIds = sessions.map((s) => s.id);
      const allSigners = await db.select().from(signatureSigners)
        .where(sql`${signatureSigners.sessionId} = ANY(${sessionIds})`);
      return sessions.map((s) => ({
        ...s,
        signers: allSigners.filter((sg) => sg.sessionId === s.id).map((sg) => ({
          id: sg.id, role: sg.role, nome: sg.nome, cpf: sg.cpf,
          signedAt: sg.signedAt, token: sg.token,
        })),
      }));
    }),

  // Rev. 2121: lista sessões FCSign onde o usuário logado é signatário
  // pendente E está na vez dele (canSignNow). Usado pelo alerta global no
  // DashboardLayout pra notificar o user assim que ele entra no ERP.
  // Match por email do user.email (case-insensitive) vs signer.email.
  // Retorna ARRAY de { sessionId, signerId, token, documentTitle, createdAt, ordem }.
  pendingForCurrentUser: protectedProcedure
    .query(async ({ ctx }) => {
      const email = (ctx.user.email || "").trim().toLowerCase();
      if (!email) return [];
      const db = (await getDb())!;

      // ACL: restringir às empresas que o user pode ver. admin/admin_master
      // veem todas (`getCompaniesForUser` já trata). Sem isto, qualquer user
      // autenticado cujo email coincidisse com um signer receberia o token
      // de assinatura de docs fora do escopo dele (cross-tenant leak).
      const allowedCompanies = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      const allowedCompanyIds = allowedCompanies
        .map((c: any) => (typeof c === 'number' ? c : c?.id))
        .filter((v: any) => typeof v === 'number') as number[];
      if (allowedCompanyIds.length === 0) return [];

      // 1) Signers pendentes (signedAt null) do user logado, em sessões abertas
      //    e dentro das empresas autorizadas.
      const pendingSigners = await db.select({
        signerId: signatureSigners.id,
        sessionId: signatureSigners.sessionId,
        token: signatureSigners.token,
        role: signatureSigners.role,
        ordem: signatureSigners.ordem,
      })
        .from(signatureSigners)
        .innerJoin(signatureSessions, eq(signatureSessions.id, signatureSigners.sessionId))
        .where(and(
          sql`LOWER(${signatureSigners.email}) = ${email}`,
          sql`${signatureSigners.signedAt} IS NULL`,
          sql`${signatureSessions.status} IN ('pendente','em_andamento')`,
          sql`${signatureSessions.companyId} = ANY(${allowedCompanyIds})`,
        ));

      if (pendingSigners.length === 0) return [];

      // 2) Pra cada sessão, descobrir se existe outro signer pendente com
      //    ordem MENOR — se sim, ainda não é a vez do user logado. Regra
      //    ESPELHA a do procedure `sign` (linha ~321: `(s.ordem ?? 0) < minhaOrdem`)
      //    pra evitar alerta "é sua vez" enquanto o `sign` recusaria com BAD_REQUEST.
      const sessionIds = Array.from(new Set(pendingSigners.map((s) => s.sessionId)));
      const allSigners = await db.select({
        id: signatureSigners.id,
        sessionId: signatureSigners.sessionId,
        ordem: signatureSigners.ordem,
        signedAt: signatureSigners.signedAt,
      }).from(signatureSigners)
        .where(sql`${signatureSigners.sessionId} = ANY(${sessionIds})`);

      const sessions = await db.select({
        id: signatureSessions.id,
        documentTitle: signatureSessions.documentTitle,
        createdAt: signatureSessions.createdAt,
      }).from(signatureSessions)
        .where(sql`${signatureSessions.id} = ANY(${sessionIds})`);
      const sessMap = new Map(sessions.map((s) => [s.id, s]));

      const result: Array<{
        sessionId: number;
        signerId: number;
        token: string;
        ordem: number;
        documentTitle: string;
        createdAt: string;
      }> = [];

      for (const sg of pendingSigners) {
        const myOrdem = sg.ordem ?? 0;
        const blockedBy = allSigners.some((other) =>
          other.sessionId === sg.sessionId
          && other.id !== sg.signerId
          && !other.signedAt
          && (other.ordem ?? 0) < myOrdem
        );
        if (blockedBy) continue;
        const sess = sessMap.get(sg.sessionId);
        if (!sess) continue;
        result.push({
          sessionId: sg.sessionId,
          signerId: sg.signerId,
          token: sg.token,
          ordem: myOrdem,
          documentTitle: sess.documentTitle,
          createdAt: sess.createdAt,
        });
      }
      return result;
    }),

  // Rev. 2122: retorna a sessão MAIS RECENTE não-cancelada de um colaborador
  // para um `tipo` específico (ex: 'contrato_experiencia'). Usado pelo card
  // de Contrato de Experiência pra alternar entre "Enviar para Assinatura",
  // "Aguardando assinaturas" e "Documento assinado" sem permitir duplicar
  // a emissão enquanto houver sessão ativa/completa.
  getForEmployeeTipo: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      companyIds: z.array(z.number()).optional(),
      employeeId: z.number(),
      tipo: z.string().min(1).max(50),
    }))
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;
      // Rev. 2122 — ACL server-side: companyId vindo do cliente NÃO é confiável,
      // valida contra empresas permitidas do user logado (espelha pattern de
      // `pendingForCurrentUser` Rev. 2121).
      const allowed = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      const allowedIds = (allowed as any[]).map(c => typeof c === 'number' ? c : c?.id).filter((v: any) => typeof v === 'number');
      if (!allowedIds.includes(input.companyId)) return null;
      const rows = await db.select().from(signatureSessions)
        .where(and(
          companyFilter(signatureSessions.companyId, input),
          eq(signatureSessions.employeeId, input.employeeId),
          eq(signatureSessions.tipo, input.tipo),
          sql`${signatureSessions.status} <> 'cancelado'`,
        ))
        .orderBy(desc(signatureSessions.createdAt))
        .limit(1);
      if (rows.length === 0) return null;
      const s = rows[0];
      const sgn = await db.select({
        id: signatureSigners.id, role: signatureSigners.role, ordem: signatureSigners.ordem,
        nome: signatureSigners.nome, cpf: signatureSigners.cpf, email: signatureSigners.email,
        token: signatureSigners.token, signedAt: signatureSigners.signedAt,
      }).from(signatureSigners)
        .where(eq(signatureSigners.sessionId, s.id))
        .orderBy(signatureSigners.ordem);
      return { ...s, signers: sgn };
    }),

  // Rev. 2122: admin_master EXCLUSIVAMENTE pode "apagar" uma sessão FCSign
  // (pendente OU completa) pra liberar nova emissão do mesmo documento.
  // Soft-delete: marca sessão como 'cancelado' + zera deletedAt do
  // employeeDocument associado (se existir). Cumpre R-001/R-007/R-010
  // (sem DELETE físico / sem ALTER).
  adminDelete: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== 'admin_master') {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas o ADM Master pode apagar uma sessão FCSign." });
      }
      const db = (await getDb())!;
      // Rev. 2122 — ACL: confirma que master tem a empresa no escopo
      const allowed = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      const allowedIds = (allowed as any[]).map(c => typeof c === 'number' ? c : c?.id).filter((v: any) => typeof v === 'number');
      if (!allowedIds.includes(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Empresa fora do escopo do usuário." });
      }
      const [sess] = await db.select().from(signatureSessions)
        .where(and(
          companyFilter(signatureSessions.companyId, input),
          eq(signatureSessions.id, input.id),
        )).limit(1);
      if (!sess) throw new TRPCError({ code: "NOT_FOUND", message: "Sessão não encontrada." });
      const nowIso = new Date().toISOString();
      const actor = ctx.user.name || ctx.user.email || `user#${ctx.user.id}`;
      // Soft-cancel sessão
      await db.update(signatureSessions).set({
        status: "cancelado",
        cancelledAt: nowIso,
      }).where(eq(signatureSessions.id, sess.id));
      // Soft-delete employeeDocument se a sessão já tinha sido finalizada
      if (sess.finalEmployeeDocumentId) {
        await db.update(employeeDocuments).set({
          deletedAt: nowIso,
          deletedBy: actor,
        }).where(and(
          eq(employeeDocuments.id, sess.finalEmployeeDocumentId),
          isNull(employeeDocuments.deletedAt),
        ));
      }
      return { success: true };
    }),

  // Cancelar sessao
  cancel: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      // Rev. 2122 — alinha com regra explícita do user: SOMENTE ADM Master
      // pode cancelar/apagar uma sessão FCSign.
      if (ctx.user.role !== 'admin_master') {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas o ADM Master pode cancelar uma sessão FCSign." });
      }
      const db = (await getDb())!;
      const allowed = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      const allowedIds = (allowed as any[]).map(c => typeof c === 'number' ? c : c?.id).filter((v: any) => typeof v === 'number');
      if (!allowedIds.includes(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Empresa fora do escopo do usuário." });
      }
      await db.update(signatureSessions).set({
        status: "cancelado",
        cancelledAt: new Date().toISOString(),
      }).where(and(
        companyFilter(signatureSessions.companyId, input),
        eq(signatureSessions.id, input.id),
      ));
      return { success: true };
    }),
});
