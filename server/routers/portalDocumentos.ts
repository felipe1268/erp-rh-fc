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
import { getDb, getEquipeObra } from "../db";
import { asos, trainings, clientes, obras } from "../../drizzle/schema";
import { and, eq, ilike, isNull, or, inArray } from "drizzle-orm";

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

      // Resolve URL: se for relativa (/uploads/...), monta absoluta usando o
      // próprio host. Senão usa a URL como está.
      const absUrl = docUrl.startsWith("http")
        ? docUrl
        : `${req.protocol}://${req.get("host")}${docUrl.startsWith("/") ? "" : "/"}${docUrl}`;

      const upstream = await fetch(absUrl);
      if (!upstream.ok) {
        console.warn(`[PortalDoc] Upstream falhou: ${absUrl} → ${upstream.status}`);
        res.status(502).send("Falha ao buscar documento");
        return;
      }
      const buf = Buffer.from(await upstream.arrayBuffer());
      const { mime } = getExtAndMime(docUrl);

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
}
