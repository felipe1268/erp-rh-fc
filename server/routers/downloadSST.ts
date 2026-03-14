import type { Express, Request, Response } from "express";
import archiver from "archiver";
import { getDb } from "../db";
import { asos, trainings } from "../../drizzle/schema";
import { eq, isNull, and } from "drizzle-orm";
import { sdk } from "../_core/sdk";

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9.\-_áéíóúãõâêîôûàèìòùçÁÉÍÓÚÃÕÂÊÎÔÛÀÈÌÒÙÇ ]/g, "_").trim();
}

function getExtFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const ext = pathname.split(".").pop()?.toLowerCase() || "bin";
    return ["pdf", "jpg", "jpeg", "png", "webp", "docx", "doc", "xlsx", "xls"].includes(ext) ? ext : "bin";
  } catch {
    return "bin";
  }
}

export function registerDownloadSSTRoute(app: Express) {
  app.get("/api/download/sst/:employeeId", async (req: Request, res: Response) => {
    try {
      let user;
      try {
        user = await sdk.authenticateRequest(req);
      } catch {
        res.status(401).json({ error: "Não autenticado" });
        return;
      }

      const employeeId = parseInt(req.params.employeeId);
      if (isNaN(employeeId)) {
        res.status(400).json({ error: "ID inválido" });
        return;
      }

      const db = await getDb();

      const empAsos = await db.select({
        id: asos.id,
        tipo: asos.tipo,
        dataExame: asos.dataExame,
        documentoUrl: asos.documentoUrl,
      }).from(asos).where(and(eq(asos.employeeId, employeeId), isNull(asos.deletedAt)));

      const empTreinamentos = await db.select({
        id: trainings.id,
        nome: trainings.nome,
        norma: trainings.norma,
        dataRealizacao: trainings.dataRealizacao,
        certificadoUrl: trainings.certificadoUrl,
      }).from(trainings).where(and(eq(trainings.employeeId, employeeId), isNull(trainings.deletedAt)));

      const files: Array<{ url: string; filename: string; folder: string }> = [];

      empAsos.forEach((a) => {
        if (a.documentoUrl) {
          const ext = getExtFromUrl(a.documentoUrl);
          const data = a.dataExame ? String(a.dataExame).slice(0, 10) : "sem-data";
          const tipo = sanitizeFilename(a.tipo || "ASO");
          files.push({ url: a.documentoUrl, filename: `${tipo}_${data}.${ext}`, folder: "ASOs" });
        }
      });

      empTreinamentos.forEach((t) => {
        if (t.certificadoUrl) {
          const ext = getExtFromUrl(t.certificadoUrl);
          const data = t.dataRealizacao ? String(t.dataRealizacao).slice(0, 10) : "sem-data";
          const nome = sanitizeFilename(t.nome || "Treinamento");
          const norma = sanitizeFilename(t.norma || "");
          files.push({ url: t.certificadoUrl, filename: `${nome}${norma ? "_" + norma : ""}_${data}.${ext}`, folder: "Treinamentos" });
        }
      });

      if (files.length === 0) {
        res.status(404).json({ error: "Nenhum arquivo encontrado para este funcionário" });
        return;
      }

      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="SST_Funcionario_${employeeId}.zip"`);

      const archive = archiver("zip", { zlib: { level: 6 } });
      archive.on("error", (err) => {
        console.error("[DownloadSST] Erro ao criar ZIP:", err);
        if (!res.headersSent) res.status(500).json({ error: "Erro ao gerar ZIP" });
      });
      archive.pipe(res);

      for (const file of files) {
        try {
          const response = await fetch(file.url);
          if (!response.ok) {
            console.warn(`[DownloadSST] Falha ao baixar: ${file.url} (${response.status})`);
            continue;
          }
          const buffer = Buffer.from(await response.arrayBuffer());
          archive.append(buffer, { name: `${file.folder}/${file.filename}` });
        } catch (e) {
          console.warn(`[DownloadSST] Erro ao baixar arquivo: ${file.url}`, e);
        }
      }

      await archive.finalize();
    } catch (err) {
      console.error("[DownloadSST] Erro geral:", err);
      if (!res.headersSent) res.status(500).json({ error: "Erro interno" });
    }
  });
}
