import type { Express, Request, Response } from "express";
import archiver from "archiver";
import { getDb } from "../db";
import { asos, atestados, trainings, warnings, employees, userCompanies } from "../../drizzle/schema";
import { eq, isNull, and, inArray } from "drizzle-orm";
import { sdk } from "../_core/sdk";
import { dbRetrieve } from "../storage";

function sanitize(name: string): string {
  return (name || "")
    .replace(/[/\\:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function extFromUrl(url: string): string {
  try {
    const p = url.split("?")[0];
    const ext = p.split(".").pop()?.toLowerCase() || "bin";
    return ["pdf", "jpg", "jpeg", "png", "webp"].includes(ext) ? ext : "pdf";
  } catch {
    return "pdf";
  }
}

async function fetchFileBuffer(url: string): Promise<Buffer | null> {
  const urlStr = (url || "").trim();
  if (!urlStr) return null;

  // Tenta DB primeiro (chave extraída de /uploads/...)
  const match = urlStr.match(/\/uploads\/(.+)$/);
  if (match) {
    try {
      const result = await dbRetrieve(match[1]);
      if (result) return result.buffer;
    } catch { /* cai no fallback */ }
  }

  // Fallback: fetch HTTP
  try {
    const res = await fetch(urlStr);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

export function registerDownloadDossieRoute(app: Express) {
  // GET /api/download/dossie-zip?companyId=123&employeeIds=[1,2,3]
  app.get("/api/download/dossie-zip", async (req: Request, res: Response) => {
    try {
      let user: { id: number; role: string };
      try {
        const authUser = await sdk.authenticateRequest(req);
        user = { id: (authUser as any).id, role: (authUser as any).role };
      } catch {
        res.status(401).json({ error: "Não autenticado" });
        return;
      }

      const companyId = parseInt(String(req.query.companyId || ""));
      if (isNaN(companyId)) { res.status(400).json({ error: "companyId inválido" }); return; }

      let empIds: number[];
      try {
        empIds = JSON.parse(String(req.query.employeeIds || "[]"));
        if (!Array.isArray(empIds) || empIds.length === 0) throw new Error("vazio");
        empIds = empIds.map(Number).filter(n => !isNaN(n));
      } catch {
        res.status(400).json({ error: "employeeIds inválido" });
        return;
      }

      const db = await getDb();

      // Guard multi-tenant
      if (user.role !== "admin_master" && user.role !== "admin") {
        const [uc] = await db
          .select()
          .from(userCompanies)
          .where(and(eq(userCompanies.userId, user.id), eq(userCompanies.companyId, companyId)))
          .limit(1);
        if (!uc) { res.status(403).json({ error: "Sem permissão" }); return; }
      }

      // Valida que os funcionários pertencem à empresa
      const empRows = await db
        .select({ id: employees.id, nomeCompleto: employees.nomeCompleto })
        .from(employees)
        .where(and(eq(employees.companyId, companyId), inArray(employees.id, empIds), isNull(employees.deletedAt)));

      if (empRows.length === 0) { res.status(404).json({ error: "Nenhum funcionário encontrado" }); return; }

      const validIds = empRows.map(e => e.id);

      // Busca todos os documentos em paralelo
      const [asoRows, treinRows, atesRows, advRows] = await Promise.all([
        db.select({ id: asos.id, employeeId: asos.employeeId, tipo: asos.tipo, dataExame: asos.dataExame, documentoUrl: asos.documentoUrl })
          .from(asos).where(and(inArray(asos.employeeId, validIds), isNull(asos.deletedAt))),
        db.select({ id: trainings.id, employeeId: trainings.employeeId, nome: trainings.nome, norma: trainings.norma, dataRealizacao: trainings.dataRealizacao, certificadoUrl: trainings.certificadoUrl })
          .from(trainings).where(and(inArray(trainings.employeeId, validIds), isNull(trainings.deletedAt))),
        db.select({ id: atestados.id, employeeId: atestados.employeeId, tipo: atestados.tipo, dataEmissao: atestados.dataEmissao, documentoUrl: atestados.documentoUrl })
          .from(atestados).where(and(inArray(atestados.employeeId, validIds), isNull(atestados.deletedAt))),
        db.select({ id: warnings.id, employeeId: warnings.employeeId, tipoAdvertencia: warnings.tipoAdvertencia, dataOcorrencia: warnings.dataOcorrencia, documentoUrl: warnings.documentoUrl })
          .from(warnings).where(and(inArray(warnings.employeeId, validIds), isNull(warnings.deletedAt))),
      ]);

      // Monta lista de arquivos com path organizado
      const files: Array<{ url: string; path: string }> = [];

      for (const emp of empRows) {
        const nome = sanitize(emp.nomeCompleto || `Funcionario_${emp.id}`);

        asoRows
          .filter(a => a.employeeId === emp.id && a.documentoUrl?.trim())
          .forEach((a) => {
            const ext = extFromUrl(a.documentoUrl!);
            const data = String(a.dataExame || "").slice(0, 10) || "sem-data";
            const tipo = sanitize(a.tipo || "ASO");
            files.push({ url: a.documentoUrl!, path: `${nome}/ASO/${tipo}_${data}.${ext}` });
          });

        treinRows
          .filter(t => t.employeeId === emp.id && t.certificadoUrl?.trim())
          .forEach((t) => {
            const ext = extFromUrl(t.certificadoUrl!);
            const data = String(t.dataRealizacao || "").slice(0, 10) || "sem-data";
            const nm = sanitize(t.norma || t.nome || "Treinamento");
            files.push({ url: t.certificadoUrl!, path: `${nome}/Treinamentos/${nm}_${data}.${ext}` });
          });

        atesRows
          .filter(a => a.employeeId === emp.id && a.documentoUrl?.trim())
          .forEach((a) => {
            const ext = extFromUrl(a.documentoUrl!);
            const data = String(a.dataEmissao || "").slice(0, 10) || "sem-data";
            const tp = sanitize(a.tipo || "Atestado");
            files.push({ url: a.documentoUrl!, path: `${nome}/Atestados/${tp}_${data}.${ext}` });
          });

        advRows
          .filter(a => a.employeeId === emp.id && a.documentoUrl?.trim())
          .forEach((a) => {
            const ext = extFromUrl(a.documentoUrl!);
            const data = String(a.dataOcorrencia || "").slice(0, 10) || "sem-data";
            const tp = sanitize(a.tipoAdvertencia || "Advertencia");
            files.push({ url: a.documentoUrl!, path: `${nome}/Advertencias/${tp}_${data}.${ext}` });
          });
      }

      if (files.length === 0) {
        res.status(404).json({ error: "Nenhum arquivo encontrado para os funcionários selecionados. Anexe documentos primeiro." });
        return;
      }

      const ts = new Date().toISOString().slice(0, 10);
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="Dossie_${ts}.zip"`);

      const archive = archiver("zip", { zlib: { level: 6 } });
      archive.on("error", (err) => {
        console.error("[DownloadDossie] Erro ZIP:", err);
        if (!res.headersSent) res.status(500).json({ error: "Erro ao gerar ZIP" });
      });
      archive.pipe(res);

      // Dedup paths para evitar conflito de nomes dentro do ZIP
      const seenPaths = new Map<string, number>();
      for (const file of files) {
        let finalPath = file.path;
        const count = seenPaths.get(file.path) || 0;
        if (count > 0) {
          const dot = file.path.lastIndexOf(".");
          finalPath = dot >= 0
            ? `${file.path.slice(0, dot)}_${count}${file.path.slice(dot)}`
            : `${file.path}_${count}`;
        }
        seenPaths.set(file.path, count + 1);

        try {
          const buf = await fetchFileBuffer(file.url);
          if (buf) {
            archive.append(buf, { name: finalPath });
          } else {
            console.warn(`[DownloadDossie] Arquivo não encontrado: ${file.url}`);
          }
        } catch (e) {
          console.warn(`[DownloadDossie] Erro ao buscar ${file.url}:`, e);
        }
      }

      await archive.finalize();
    } catch (err) {
      console.error("[DownloadDossie] Erro geral:", err);
      if (!res.headersSent) res.status(500).json({ error: "Erro interno" });
    }
  });
}
