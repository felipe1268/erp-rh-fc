// ============================================================================
// GET /api/download/telefones-contrato?companyId=N&planoId=N
// Endpoint autenticado para download do PDF de contrato de telefonia.
// Verifica admin + acesso à empresa antes de servir o arquivo.
// ============================================================================
import type { Express, Request, Response } from "express";
import { eq, and } from "drizzle-orm";
import { sdk } from "../_core/sdk";
import { getDb, getCompaniesForUser } from "../db";
import { dbRetrieve } from "../storage";
import { telefonesPlanos } from "../../drizzle/schema";

export function registerDownloadTelefonesContratoRoute(app: Express) {
  app.get("/api/download/telefones-contrato", async (req: Request, res: Response) => {
    try {
      // 1. Autenticação
      let user: { id: number; role: string };
      try {
        const authUser = await sdk.authenticateRequest(req);
        user = { id: (authUser as any).id, role: (authUser as any).role };
      } catch {
        res.status(401).json({ error: "Não autenticado" });
        return;
      }

      // 2. Apenas admins podem baixar o contrato
      if (user.role !== "admin_master" && user.role !== "admin") {
        res.status(403).json({ error: "Acesso restrito a administradores." });
        return;
      }

      const companyId = parseInt(String(req.query.companyId || ""));
      const planoId   = parseInt(String(req.query.planoId || ""));
      if (isNaN(companyId) || isNaN(planoId)) {
        res.status(400).json({ error: "Parâmetros inválidos." });
        return;
      }

      // 3. Verificar que o usuário tem acesso a esta empresa
      const companiesDoUser = await getCompaniesForUser(user.id, user.role);
      if (!companiesDoUser.some((c: any) => c.id === companyId)) {
        res.status(403).json({ error: "Sem acesso a esta empresa." });
        return;
      }

      // 4. Carregar o plano e verificar tenant
      const db = getDb();
      const [plano] = await db
        .select({
          id:          telefonesPlanos.id,
          companyId:   telefonesPlanos.companyId,
          contratoKey: telefonesPlanos.contratoKey,
          contratoNome:telefonesPlanos.contratoNome,
        })
        .from(telefonesPlanos)
        .where(and(eq(telefonesPlanos.id, planoId), eq(telefonesPlanos.companyId, companyId)))
        .limit(1);

      if (!plano) {
        res.status(404).json({ error: "Plano não encontrado." });
        return;
      }
      if (!plano.contratoKey) {
        res.status(404).json({ error: "Contrato não anexado." });
        return;
      }

      // 5. Recuperar o arquivo do storage
      const stored = await dbRetrieve(plano.contratoKey);
      if (!stored) {
        res.status(404).json({ error: "Arquivo não encontrado no armazenamento." });
        return;
      }

      // 6. Servir o PDF
      const fileName = plano.contratoNome || "contrato.pdf";
      res.setHeader("Content-Type", stored.contentType || "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(fileName)}"`);
      res.setHeader("Cache-Control", "private, no-store");
      res.send(stored.buffer);
    } catch (err: any) {
      console.error("[Telefones] Erro ao servir contrato:", err);
      res.status(500).json({ error: "Erro interno ao servir o contrato." });
    }
  });
}
