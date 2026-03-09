/**
 * Router de Portabilidade
 * Permite exportar dados, listar documentos S3, e ver credenciais para migração
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { ENV } from "../_core/env";
import { getDb } from "../db";
import { sql } from "drizzle-orm";

export const portabilidadeRouter = router({
  /** Retorna informações de conexão do banco de dados (somente admin_master) */
  getCredenciais: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin_master") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Apenas Admin Master pode acessar credenciais" });
    }

    // Parse DATABASE_URL para extrair componentes
    const dbUrl = ENV.databaseUrl;
    let dbInfo: any = { raw: "Não disponível" };
    
    try {
      if (dbUrl) {
        const url = new URL(dbUrl);
        dbInfo = {
          host: url.hostname,
          port: url.port || "4000",
          database: url.pathname.replace("/", ""),
          username: url.username,
          password: "***" + (url.password || "").slice(-4), // Mostra só últimos 4 chars
          ssl: url.searchParams.get("ssl") || "true",
          protocol: url.protocol.replace(":", ""),
          connectionString: dbUrl.replace(/:([^:@]+)@/, ":****@"), // Mascara senha na URL
        };
      }
    } catch {
      dbInfo = { raw: "Formato não reconhecido" };
    }

    return {
      banco: dbInfo,
      storage: {
        tipo: "S3 via Manus Forge API",
        apiUrl: ENV.forgeApiUrl ? ENV.forgeApiUrl.replace(/\/+$/, "") + "/v1/storage" : "Não configurado",
        nota: "Os arquivos são acessados via API REST com Bearer token. URLs públicas dos arquivos continuam funcionando mesmo fora do Manus.",
      },
      auth: {
        jwtSecret: ENV.cookieSecret ? "***" + ENV.cookieSecret.slice(-6) : "Não configurado",
        oauthServerUrl: ENV.oAuthServerUrl || "Não configurado",
        nota: "Para rodar fora do Manus, use login local (email/senha). O OAuth do Manus não funcionará em outro host.",
      },
      smtp: {
        host: ENV.smtpHost || "Não configurado",
        port: ENV.smtpPort || 465,
        email: ENV.smtpEmail || "Não configurado",
        password: ENV.smtpPassword ? "***" + ENV.smtpPassword.slice(-4) : "Não configurado",
      },
      variaveis: [
        { nome: "DATABASE_URL", descricao: "String de conexão MySQL/TiDB", valor: dbInfo.connectionString || "Não disponível", obrigatoria: true },
        { nome: "JWT_SECRET", descricao: "Chave para assinar cookies de sessão", valor: "Gere uma nova com: openssl rand -hex 32", obrigatoria: true },
        { nome: "SMTP_HOST", descricao: "Servidor SMTP para envio de e-mails", valor: ENV.smtpHost || "", obrigatoria: false },
        { nome: "SMTP_PORT", descricao: "Porta do servidor SMTP", valor: String(ENV.smtpPort || 465), obrigatoria: false },
        { nome: "SMTP_EMAIL", descricao: "E-mail remetente", valor: ENV.smtpEmail || "", obrigatoria: false },
        { nome: "SMTP_PASSWORD", descricao: "Senha do e-mail SMTP", valor: "Configure manualmente", obrigatoria: false },
        { nome: "VITE_APP_ID", descricao: "ID do app (pode ser qualquer string única)", valor: process.env.VITE_APP_ID || "", obrigatoria: false },
        { nome: "NODE_ENV", descricao: "Ambiente (production/development)", valor: "production", obrigatoria: true },
      ],
      instrucoes: {
        titulo: "Como migrar para Replit/Railway",
        passos: [
          "1. Clone o repositório do GitHub para o Replit",
          "2. Configure as variáveis de ambiente listadas acima no painel do Replit",
          "3. O banco de dados pode continuar sendo acessado remotamente (mantenha a DATABASE_URL atual)",
          "4. Os documentos no S3 continuam acessíveis via URLs públicas",
          "5. Para login, use o sistema de email/senha (já implementado). O OAuth do Manus não funcionará",
          "6. Execute: pnpm install && pnpm db:push && pnpm build && pnpm start",
          "7. Se quiser migrar o banco para outro provedor, use o backup JSON.gz para importar",
        ],
        avisos: [
          "O banco de dados do Manus (TiDB) é compatível com MySQL. Qualquer provedor MySQL funciona.",
          "Os arquivos no S3 do Manus continuam acessíveis enquanto o projeto existir aqui.",
          "Para migrar arquivos, baixe o backup e re-upload para outro S3 (AWS, Cloudflare R2, etc.)",
          "O sistema de login local já está implementado. Crie usuários em Configurações > Usuários.",
        ],
      },
    };
  }),

  /** Lista todos os documentos/arquivos armazenados no S3 */
  listarDocumentos: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin" && ctx.user.role !== "admin_master") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem listar documentos" });
    }

    const db = await getDb();
    if (!db) return { documentos: [], total: 0 };

    // Buscar URLs de documentos em várias tabelas
    const queries = [
      { tabela: "employee_documents", query: `SELECT id, employee_id as ref_id, file_name as nome, file_url as url, file_type as tipo, 'Documento do Colaborador' as categoria, created_at FROM employee_documents WHERE file_url IS NOT NULL AND file_url != ''` },
      { tabela: "company_documents", query: `SELECT id, company_id as ref_id, nome, url, tipo, 'Documento da Empresa' as categoria, created_at FROM company_documents WHERE url IS NOT NULL AND url != ''` },
      { tabela: "training_documents", query: `SELECT id, training_id as ref_id, file_name as nome, file_url as url, file_type as tipo, 'Documento de Treinamento' as categoria, created_at FROM training_documents WHERE file_url IS NOT NULL AND file_url != ''` },
      { tabela: "epi_assinaturas", query: `SELECT id, delivery_id as ref_id, 'Assinatura EPI' as nome, signature_url as url, 'image' as tipo, 'Assinatura de EPI' as categoria, created_at FROM epi_assinaturas WHERE signature_url IS NOT NULL AND signature_url != ''` },
      { tabela: "payroll_uploads", query: `SELECT id, company_id as ref_id, file_name as nome, file_url as url, file_type as tipo, 'Upload de Folha' as categoria, created_at FROM payroll_uploads WHERE file_url IS NOT NULL AND file_url != ''` },
      { tabela: "employees", query: `SELECT id, id as ref_id, nome_completo as nome, foto_url as url, 'image' as tipo, 'Foto do Colaborador' as categoria, created_at FROM employees WHERE foto_url IS NOT NULL AND foto_url != ''` },
      { tabela: "companies", query: `SELECT id, id as ref_id, razao_social as nome, logo_url as url, 'image' as tipo, 'Logo da Empresa' as categoria, created_at FROM companies WHERE logo_url IS NOT NULL AND logo_url != ''` },
      { tabela: "backups", query: `SELECT id, id as ref_id, CONCAT('Backup ', tipo, ' - ', iniciado_em) as nome, s3_url as url, 'backup' as tipo, 'Backup do Banco' as categoria, iniciado_em as created_at FROM backups WHERE s3_url IS NOT NULL AND s3_url != '' AND status = 'concluido'` },
    ];

    const allDocs: any[] = [];

    for (const q of queries) {
      try {
        const rows = await db.execute(sql.raw(q.query));
        const data = Array.isArray(rows) ? ((rows as unknown as any[])[0] as any[] || []) : [];
        allDocs.push(...data.map((r: any) => ({
          id: r.id,
          refId: r.ref_id,
          nome: r.nome || "Sem nome",
          url: r.url,
          tipo: r.tipo || "arquivo",
          categoria: r.categoria || q.tabela,
          criadoEm: r.created_at,
        })));
      } catch {
        // Tabela pode não existir
      }
    }

    return {
      documentos: allDocs.sort((a, b) => {
        const da = a.criadoEm ? new Date(a.criadoEm).getTime() : 0;
        const db2 = b.criadoEm ? new Date(b.criadoEm).getTime() : 0;
        return db2 - da;
      }),
      total: allDocs.length,
    };
  }),

  /** Gera arquivo .env com todas as variáveis necessárias */
  gerarEnvFile: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin_master") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Apenas Admin Master pode gerar arquivo .env" });
    }

    const lines = [
      "# ============================================================",
      "# ERP FC Engenharia - Variáveis de Ambiente",
      `# Gerado em: ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
      "# ============================================================",
      "",
      "# Banco de Dados (MySQL/TiDB)",
      `DATABASE_URL=${ENV.databaseUrl}`,
      "",
      "# Autenticação",
      `JWT_SECRET=${ENV.cookieSecret}`,
      "",
      "# SMTP (E-mail)",
      `SMTP_HOST=${ENV.smtpHost}`,
      `SMTP_PORT=${ENV.smtpPort}`,
      `SMTP_EMAIL=${ENV.smtpEmail}`,
      `SMTP_PASSWORD=${ENV.smtpPassword}`,
      "",
      "# App",
      `VITE_APP_ID=${process.env.VITE_APP_ID || "erp-fc"}`,
      `VITE_APP_TITLE=${process.env.VITE_APP_TITLE || "ERP FC Engenharia"}`,
      `NODE_ENV=production`,
      "",
      "# Storage (Manus S3 - URLs públicas continuam funcionando)",
      `BUILT_IN_FORGE_API_URL=${ENV.forgeApiUrl}`,
      `BUILT_IN_FORGE_API_KEY=${ENV.forgeApiKey}`,
      "",
      "# OAuth Manus (não funciona fora do Manus - use login local)",
      `OAUTH_SERVER_URL=${ENV.oAuthServerUrl}`,
      `VITE_OAUTH_PORTAL_URL=${process.env.VITE_OAUTH_PORTAL_URL || ""}`,
      `OWNER_OPEN_ID=${ENV.ownerOpenId}`,
      "",
    ];

    return { content: lines.join("\n") };
  }),
});
