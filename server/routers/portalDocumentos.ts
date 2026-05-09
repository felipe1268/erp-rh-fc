// Rev. 1555 — Streaming inline (sem download direto) de documentos
// SST (ASO e Treinamentos) para o Portal do Cliente.
//
// Segurança:
// - Token JWT do portal (tipo=cliente) é validado no querystring.
// - Verifica que o funcionário do registro está alocado em alguma obra
//   do cliente daquele token (via getEquipeObra) — sem isso, devolve 403.
// - Não devolve a URL real do storage ao cliente: o backend faz fetch
//   interno e re-stream do conteúdo. O cliente nunca enxerga o S3 etc.
// - Headers: Content-Disposition: inline + nosniff + sem cache. Bloqueio
//   de download no front (iframe sandbox + #toolbar=0). Ainda assim
//   sabemos que NENHUM PDF servido pelo navegador é 100% à prova de
//   download — print/screenshot sempre funciona. O objetivo é dificultar
//   o download casual, não impedir captura.
import type { Express, Request, Response } from "express";
import jwt from "jsonwebtoken";
import * as fs from "fs";
import * as path from "path";
import { getDb, getEquipeObra } from "../db";
import { dbRetrieve } from "../storage";
import { asos, trainings, clientes, obras, gdDocumentos } from "../../drizzle/schema";
import { and, eq, ilike, isNull, or, inArray } from "drizzle-orm";

// Rev. 1565 — Resolve o conteúdo de um arquivoUrl. Para URLs locais
// ("/uploads/<key>") lê direto do disco ou do DB (uploaded_files),
// SEM fazer um HTTP roundtrip pelo próprio domínio externo — esse
// roundtrip falha em Replit dev (mTLS proxy) e gera "Erro interno".
async function resolveArquivo(arquivoUrl: string): Promise<{ buffer: Buffer; contentType?: string } | null> {
  try {
    // URLs externas (Manus Forge / outros) seguem por fetch.
    if (/^https?:\/\//i.test(arquivoUrl)) {
      const r = await fetch(arquivoUrl);
      if (!r.ok) {
        console.warn(`[PortalDoc] fetch upstream ${arquivoUrl} → ${r.status}`);
        return null;
      }
      return { buffer: Buffer.from(await r.arrayBuffer()), contentType: r.headers.get("content-type") || undefined };
    }
    // Para fontes locais aceitamos APENAS /uploads/<key> e validamos
    // contra path traversal: a chave não pode conter "..", não pode ser
    // absoluta e o caminho final tem que ficar contido em server/uploads.
    if (!arquivoUrl.startsWith("/uploads/")) {
      console.warn(`[PortalDoc] arquivoUrl rejeitada (formato inválido): ${arquivoUrl}`);
      return null;
    }
    const rawKey = arquivoUrl.slice("/uploads/".length);
    if (!rawKey || rawKey.includes("..") || rawKey.includes("\0") || path.isAbsolute(rawKey)) {
      console.warn(`[PortalDoc] arquivoUrl rejeitada (key suspeita): ${arquivoUrl}`);
      return null;
    }
    const baseDir = path.resolve(process.cwd(), "server/uploads");
    const localPath = path.resolve(baseDir, rawKey);
    if (localPath !== baseDir && !localPath.startsWith(baseDir + path.sep)) {
      console.warn(`[PortalDoc] arquivoUrl rejeitada (escape de baseDir): ${arquivoUrl}`);
      return null;
    }
    // DB primeiro (fonte autoritativa em Replit) e depois disco.
    const fromDb = await dbRetrieve(rawKey);
    if (fromDb) return { buffer: fromDb.buffer, contentType: fromDb.contentType };
    if (fs.existsSync(localPath)) return { buffer: fs.readFileSync(localPath) };
    return null;
  } catch (e: any) {
    console.error(`[PortalDoc] resolveArquivo("${arquivoUrl}") falhou:`, e?.message || e);
    return null;
  }
}

function getExtAndMime(url: string): { ext: string; mime: string } {
  let ext = "bin";
  try {
    const pathname = new URL(url).pathname;
    ext = (pathname.split(".").pop() || "bin").toLowerCase();
  } catch {
    const last = url.split(".").pop() || "bin";
    ext = last.toLowerCase().split("?")[0];
  }
  const mimeMap: Record<string, string> = {
    pdf: "application/pdf",
    jpg: "image/jpeg", jpeg: "image/jpeg",
    png: "image/png", webp: "image/webp",
    // Rev. 1561 — DWG/DXF/DWF não têm visualizador nativo no browser, mas
    // setamos o mime correto pra que o navegador faça download direto.
    dwg: "application/acad",
    dxf: "application/dxf",
    dwf: "model/vnd.dwf",
  };
  return { ext, mime: mimeMap[ext] || "application/octet-stream" };
}

export function registerPortalDocumentosRoute(app: Express) {
  app.get("/api/portal/cliente/documento/:tipo/:id", async (req: Request, res: Response) => {
    try {
      const tipo = req.params.tipo as "aso" | "treinamento";
      const recordId = parseInt(req.params.id);
      const token = String(req.query.token || "");

      if (!token) { res.status(401).send("Token ausente"); return; }
      if (!["aso", "treinamento"].includes(tipo)) { res.status(400).send("Tipo inválido"); return; }
      if (!recordId || isNaN(recordId)) { res.status(400).send("ID inválido"); return; }

      const secret = process.env.JWT_SECRET || "portal-secret";
      let decoded: any;
      try { decoded = jwt.verify(token, secret); } catch { res.status(401).send("Token inválido"); return; }
      if (decoded.tipo !== "cliente") { res.status(403).send("Acesso negado"); return; }

      const db = (await getDb())!;

      // Cliente do token
      const [c] = await db.select().from(clientes).where(eq(clientes.id, decoded.clienteId));
      if (!c) { res.status(404).send("Cliente não encontrado"); return; }
      const nomes = [c.razaoSocial, c.nomeFantasia].filter(Boolean) as string[];
      if (nomes.length === 0) { res.status(403).send("Cliente sem nome"); return; }

      // Obras do cliente nesta company
      const orConds = nomes.map((n) => ilike(obras.cliente, n));
      const obrasCliente = await db.select({ id: obras.id }).from(obras).where(and(
        eq(obras.companyId, decoded.companyId),
        isNull(obras.deletedAt),
        or(...orConds)!,
      ));
      if (obrasCliente.length === 0) { res.status(403).send("Sem obras vinculadas"); return; }

      // Funcionários alocados em qualquer das obras do cliente
      const empIdsSet = new Set<number>();
      for (const o of obrasCliente) {
        const equipe = await getEquipeObra(o.id, decoded.companyId);
        for (const e of equipe) if (e.id) empIdsSet.add(e.id);
      }
      if (empIdsSet.size === 0) { res.status(403).send("Sem funcionários vinculados"); return; }
      const empIds = Array.from(empIdsSet);

      // Busca o registro e valida que o funcionário pertence à equipe
      let docUrl: string | null = null;
      let downloadName = "documento";
      if (tipo === "aso") {
        const [row] = await db.select({
          documentoUrl: asos.documentoUrl,
          employeeId: asos.employeeId,
          tipo: asos.tipo,
          dataExame: asos.dataExame,
        }).from(asos).where(and(
          eq(asos.id, recordId),
          eq(asos.companyId, decoded.companyId),
          inArray(asos.employeeId, empIds),
          isNull(asos.deletedAt),
        ));
        if (!row) { res.status(404).send("ASO não encontrado"); return; }
        docUrl = row.documentoUrl || null;
        downloadName = `ASO_${row.tipo || ""}_${(row.dataExame || "").slice(0, 10)}`;
      } else {
        const [row] = await db.select({
          certificadoUrl: trainings.certificadoUrl,
          employeeId: trainings.employeeId,
          nome: trainings.nome,
          norma: trainings.norma,
          dataRealizacao: trainings.dataRealizacao,
        }).from(trainings).where(and(
          eq(trainings.id, recordId),
          eq(trainings.companyId, decoded.companyId),
          inArray(trainings.employeeId, empIds),
          isNull(trainings.deletedAt),
        ));
        if (!row) { res.status(404).send("Treinamento não encontrado"); return; }
        docUrl = row.certificadoUrl || null;
        downloadName = `Treinamento_${row.norma || row.nome || ""}_${(row.dataRealizacao || "").slice(0, 10)}`;
      }

      if (!docUrl) { res.status(404).send("Sem documento anexado"); return; }

      // Rev. 1565 — Lê /uploads/* direto do disco/DB (sem HTTP loop).
      const resolved = await resolveArquivo(docUrl);
      if (!resolved) {
        res.status(502).send("Falha ao buscar documento");
        return;
      }
      const buf = resolved.buffer;
      const { mime: mimeByExt } = getExtAndMime(docUrl);
      const mime = resolved.contentType || mimeByExt;

      res.setHeader("Content-Type", mime);
      res.setHeader("Content-Disposition", `inline; filename="${downloadName.replace(/[^a-zA-Z0-9._-]/g, "_")}"`);
      res.setHeader("Cache-Control", "private, no-store, no-cache, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("X-Frame-Options", "SAMEORIGIN");
      res.send(buf);
    } catch (err: any) {
      console.error("[PortalDocumentos] Erro:", err?.message || err);
      if (!res.headersSent) res.status(500).send("Erro interno");
    }
  });

  // Rev. 1561 — Streaming de Projetos / Documentos Técnicos (gd_documentos)
  // pro Portal do Cliente. Aceita ?download=1 pra forçar attachment (DWG etc.)
  // ou inline (default, pra PDF).
  app.get("/api/portal/cliente/projdoc/:id", async (req: Request, res: Response) => {
    try {
      const recordId = parseInt(req.params.id);
      const token = String(req.query.token || "");
      const forceDownload = String(req.query.download || "") === "1";

      if (!token) { res.status(401).send("Token ausente"); return; }
      if (!recordId || isNaN(recordId)) { res.status(400).send("ID inválido"); return; }

      const secret = process.env.JWT_SECRET || "portal-secret";
      let decoded: any;
      try { decoded = jwt.verify(token, secret); } catch { res.status(401).send("Token inválido"); return; }
      if (decoded.tipo !== "cliente") { res.status(403).send("Acesso negado"); return; }

      const db = (await getDb())!;

      // Cliente do token + autoriza pelas obras dele
      const [c] = await db.select().from(clientes).where(eq(clientes.id, decoded.clienteId));
      if (!c) { res.status(404).send("Cliente não encontrado"); return; }
      const nomes = [c.razaoSocial, c.nomeFantasia].filter(Boolean) as string[];
      if (nomes.length === 0) { res.status(403).send("Cliente sem nome"); return; }
      const orConds = nomes.map((n) => ilike(obras.cliente, n));
      const obrasCliente = await db.select({ id: obras.id }).from(obras).where(and(
        eq(obras.companyId, decoded.companyId),
        isNull(obras.deletedAt),
        or(...orConds)!,
      ));
      if (obrasCliente.length === 0) { res.status(403).send("Sem obras vinculadas"); return; }
      const obraIds = obrasCliente.map((o) => o.id);

      const [row] = await db.select({
        arquivoUrl: gdDocumentos.arquivoUrl,
        arquivoNome: gdDocumentos.arquivoNome,
        codigo: gdDocumentos.codigo,
        titulo: gdDocumentos.titulo,
        obraId: gdDocumentos.obraId,
      }).from(gdDocumentos).where(and(
        eq(gdDocumentos.id, recordId),
        eq(gdDocumentos.companyId, decoded.companyId),
        inArray(gdDocumentos.obraId, obraIds),
        isNull(gdDocumentos.deletedAt),
      ));
      if (!row) { res.status(404).send("Documento não encontrado"); return; }
      if (!row.arquivoUrl) { res.status(404).send("Sem arquivo anexado"); return; }

      // Rev. 1565 — Resolve sem HTTP loop pelo próprio domínio (que falha
      // em Replit dev por causa do proxy mTLS).
      const resolved = await resolveArquivo(row.arquivoUrl);
      if (!resolved) {
        res.status(502).send("Falha ao buscar documento");
        return;
      }
      const buf = resolved.buffer;
      const { ext, mime: mimeByExt } = getExtAndMime(row.arquivoUrl);
      const mime = resolved.contentType || mimeByExt;
      const filename = (row.arquivoNome || `${row.codigo || "documento"}.${ext}`).replace(/[^a-zA-Z0-9._-]/g, "_");
      // PDF e imagens podem inline; DWG/DXF/etc sempre vão como attachment
      // (não tem visualizador nativo no browser).
      const inlineSafe = ["pdf", "jpg", "jpeg", "png", "webp"].includes(ext);
      const dispo = (forceDownload || !inlineSafe) ? "attachment" : "inline";

      res.setHeader("Content-Type", mime);
      res.setHeader("Content-Disposition", `${dispo}; filename="${filename}"`);
      res.setHeader("Cache-Control", "private, no-store, no-cache, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("X-Frame-Options", "SAMEORIGIN");
      res.send(buf);
    } catch (err: any) {
      console.error("[PortalProjDoc] Erro:", err?.message || err);
      if (!res.headersSent) res.status(500).send("Erro interno");
    }
  });
}
