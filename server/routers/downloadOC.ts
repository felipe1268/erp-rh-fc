import type { Express, Request, Response } from "express";
import * as fs from "fs";
import * as path from "path";
import { fetchOCData, generateOCPdf } from "../services/purchaseOrderPdf";
import { storagePut } from "../storage";
import { getDb } from "../db";
import { comprasOrdens, userCompanies } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { sdk } from "../_core/sdk";

export function registerDownloadOCRoute(app: Express) {
  app.get("/api/download/oc/:id", async (req: Request, res: Response) => {
    try {
      let user: { id: number; role: string };
      try {
        const authUser = await sdk.authenticateRequest(req);
        user = { id: (authUser as Record<string, number>).id, role: (authUser as Record<string, string>).role };
      } catch {
        res.status(401).json({ error: "Não autenticado" });
        return;
      }

      const ocId = parseInt(req.params.id, 10);
      if (isNaN(ocId)) {
        res.status(400).json({ error: "ID inválido" });
        return;
      }

      const db = await getDb();
      const [ocRow] = await db.select().from(comprasOrdens).where(eq(comprasOrdens.id, ocId));
      if (!ocRow) {
        res.status(404).json({ error: "Ordem de Compra não encontrada" });
        return;
      }

      if (user.role !== "admin_master") {
        const userComps = await db
          .select()
          .from(userCompanies)
          .where(
            and(
              eq(userCompanies.userId, user.id),
              eq(userCompanies.companyId, ocRow.companyId)
            )
          );
        if (userComps.length === 0) {
          res.status(403).json({ error: "Sem permissão para acessar esta OC" });
          return;
        }
      }

      const forceRegenerate = req.query.regen === "1";
      const cachedUrl = ocRow.pdfUrl;

      if (!forceRegenerate && cachedUrl) {
        const localPath = cachedUrl.startsWith("/uploads/")
          ? path.join(process.cwd(), "server", cachedUrl)
          : null;
        if (localPath && fs.existsSync(localPath)) {
          const cachedBuffer = fs.readFileSync(localPath);
          const mode = req.query.mode;
          const disposition = mode === "view" ? "inline" : "attachment";
          const displayName = `${ocRow.numeroOc || "OC"}.pdf`;
          res.setHeader("Content-Type", "application/pdf");
          res.setHeader("Content-Disposition", `${disposition}; filename="${displayName}"`);
          res.send(cachedBuffer);
          return;
        }
      }

      const data = await fetchOCData(ocId);
      const pdfDoc = generateOCPdf(data);

      const chunks: Buffer[] = [];
      pdfDoc.on("data", (chunk: Buffer) => chunks.push(chunk));

      await new Promise<void>((resolve, reject) => {
        pdfDoc.on("end", resolve);
        pdfDoc.on("error", reject);
        pdfDoc.end();
      });

      const pdfBuffer = Buffer.concat(chunks);

      const safeNumero = (data.oc.numeroOc || String(ocId)).replace(/[^a-zA-Z0-9_-]/g, "_");
      const fileName = `oc_${safeNumero}.pdf`;
      const storageKey = `compras/oc/${fileName}`;
      const { url: pdfUrl } = await storagePut(storageKey, pdfBuffer, "application/pdf");

      await db
        .update(comprasOrdens)
        .set({ pdfUrl } as Record<string, string>)
        .where(eq(comprasOrdens.id, ocId));

      const mode = req.query.mode;
      const disposition = mode === "view" ? "inline" : "attachment";
      const displayName = `${data.oc.numeroOc || "OC"}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `${disposition}; filename="${displayName}"`);
      res.send(pdfBuffer);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao gerar PDF";
      console.error("[Download OC PDF] Erro:", err);
      const status = message.includes("não encontrada") ? 404 : 500;
      res.status(status).json({ error: message });
    }
  });
}
