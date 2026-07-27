import type { Express, Request, Response } from "express";
import archiver from "archiver";
import { getDb, getCompaniesForUser } from "../db";
import { asos, trainings, employees, userCompanies, employeeIntegrations, employeeDocuments } from "../../drizzle/schema";
import { eq, isNull, and, inArray, notInArray } from "drizzle-orm";
import { sdk } from "../_core/sdk";
import { dbRetrieve } from "../storage";
import { gerarFichasEpiPdfLote } from "../services/fichaEpiPdf";

const TIPO_DOC_LABEL: Record<string, string> = {
  rg: "RG", cnh: "CNH", ctps: "CTPS", comprovante_residencia: "Comprovante de Residencia",
  certidao_nascimento: "Certidao de Nascimento", titulo_eleitor: "Titulo de Eleitor",
  reservista: "Reservista", pis: "PIS", foto_3x4: "Foto 3x4",
  diploma: "Diploma", certificado: "Certificado", outros: "Outros",
};

// Rev. 4665 — subpastas dentro de 001 - DOCUMENTOS PESSOAIS por tipo do documento
const SUBPASTA_IDENTIFICACAO = new Set([
  "rg", "cnh", "cpf", "ctps", "certidao_nascimento", "titulo_eleitor",
  "reservista", "pis", "foto_3x4",
]);
const SUBPASTA_REGISTRO = new Set([
  "comprovante_residencia", "diploma", "certificado",
]);
function subpastaDoc(tipo: string | null): string {
  const t = String(tipo || "").toLowerCase();
  if (SUBPASTA_IDENTIFICACAO.has(t)) return "Identificação";
  if (SUBPASTA_REGISTRO.has(t)) return "Registro";
  return "Outros";
}

// Rev. 4665 — OS (Ordem de Serviço / NR-01) sai de Treinamentos e vai p/ 001
function isOrdemServico(t: { norma: string | null; nome: string | null }): boolean {
  const norma = String(t.norma || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (norma === "NR01" || norma === "NR1") return true;
  const nome = String(t.nome || "").toLowerCase();
  return nome.includes("ordem de servi");
}

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

  // Rev. 4658 — SSRF guard: URL vinda do banco (gravável pelo cliente) NUNCA
  // vai p/ fetch genérico (memória comprovante-fetch-ssrf). Só resolve chave
  // interna /uploads/<key> (relativa OU absoluta) via dbRetrieve.
  const match = urlStr.match(/^(?:https?:\/\/[^/]+)?\/uploads\/([^?#]+)/);
  if (!match) return null;
  try {
    const result = await dbRetrieve(decodeURIComponent(match[1]));
    return result ? result.buffer : null;
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
      // Rev. 4615/4616 — o ZIP é o pacote de INTEGRAÇÃO pro cliente: ASO,
      // treinamentos, integrações e documentos pessoais. Documentos INTERNOS
      // (atestado, advertência, contrato/rescisão) NÃO entram.
      const DOCS_INTERNOS = ["atestado_medico", "termo_rescisao", "contrato_trabalho"];
      const [asoRowsAll, treinRowsAll, intRows, docRows] = await Promise.all([
        db.select({ id: asos.id, employeeId: asos.employeeId, tipo: asos.tipo, dataExame: asos.dataExame, documentoUrl: asos.documentoUrl })
          .from(asos).where(and(inArray(asos.employeeId, validIds), isNull(asos.deletedAt))),
        db.select({ id: trainings.id, employeeId: trainings.employeeId, nome: trainings.nome, norma: trainings.norma, dataRealizacao: trainings.dataRealizacao, dataValidade: trainings.dataValidade, certificadoUrl: trainings.certificadoUrl })
          .from(trainings).where(and(inArray(trainings.employeeId, validIds), isNull(trainings.deletedAt))),
        db.select({ id: employeeIntegrations.id, employeeId: employeeIntegrations.employeeId, tipo: employeeIntegrations.tipo, clienteNome: employeeIntegrations.clienteNome, dataRealizacao: employeeIntegrations.dataRealizacao, evidencia: employeeIntegrations.evidencia })
          .from(employeeIntegrations).where(and(inArray(employeeIntegrations.employeeId, validIds), eq(employeeIntegrations.companyId, companyId))),
        db.select({ id: employeeDocuments.id, employeeId: employeeDocuments.employeeId, tipo: employeeDocuments.tipo, nome: employeeDocuments.nome, fileUrl: employeeDocuments.fileUrl, createdAt: employeeDocuments.createdAt })
          .from(employeeDocuments).where(and(
            inArray(employeeDocuments.employeeId, validIds),
            eq(employeeDocuments.companyId, companyId),
            isNull(employeeDocuments.deletedAt),
            notInArray(employeeDocuments.tipo, DOCS_INTERNOS),
          )),
      ]);

      // Rev. 4613 — o ZIP que vai pro CLIENTE leva SÓ a versão ATUAL de cada
      // documento: ASO mais recente por tipo e treinamento mais recente por
      // norma. Revisões antigas ficam de fora (documentação desnecessária).
      const treinKey = (t: { norma: string | null; nome: string | null }) =>
        String(t.norma || t.nome || "").toUpperCase().replace(/[^A-Z0-9]/g, "") || "SEM_TIPO";

      const asoRows: typeof asoRowsAll = [];
      {
        const porEmpTipo = new Map<string, typeof asoRowsAll[0]>();
        for (const a of asoRowsAll) {
          const k = `${a.employeeId}|${String(a.tipo || "").toUpperCase().trim()}`;
          const atual = porEmpTipo.get(k);
          if (!atual || String(a.dataExame || "") > String(atual.dataExame || "")) porEmpTipo.set(k, a);
        }
        asoRows.push(...porEmpTipo.values());
      }

      const treinRows: typeof treinRowsAll = [];
      {
        const porEmpNorma = new Map<string, typeof treinRowsAll[0]>();
        for (const t of treinRowsAll) {
          const k = `${t.employeeId}|${treinKey(t)}`;
          const atual = porEmpNorma.get(k);
          const melhor = !atual
            || String(t.dataValidade || "") > String(atual.dataValidade || "")
            || (String(t.dataValidade || "") === String(atual.dataValidade || "") && String(t.dataRealizacao || "") > String(atual.dataRealizacao || ""));
          if (melhor) porEmpNorma.set(k, t);
        }
        treinRows.push(...porEmpNorma.values());
      }

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
            files.push({ url: a.documentoUrl!, path: `${nome}/002 - ASO/${tipo}_${data}.${ext}` });
          });

        treinRows
          .filter(t => t.employeeId === emp.id && t.certificadoUrl?.trim())
          .forEach((t) => {
            const ext = extFromUrl(t.certificadoUrl!);
            const data = String(t.dataRealizacao || "").slice(0, 10) || "sem-data";
            const nm = sanitize(t.norma || t.nome || "Treinamento");
            // Rev. 4665 — OS (NR-01) vai p/ 001/OS, não p/ Treinamentos
            const pasta = isOrdemServico(t)
              ? `001 - DOCUMENTOS PESSOAIS/OS - Ordem de Serviço`
              : `003 - TREINAMENTOS`;
            files.push({ url: t.certificadoUrl!, path: `${nome}/${pasta}/${nm}_${data}.${ext}` });
          });

        intRows
          .filter(i => i.employeeId === emp.id && typeof i.evidencia === "string" && /^\/uploads\//.test(i.evidencia.trim()))
          .forEach((i) => {
            const url = i.evidencia!.trim();
            const ext = extFromUrl(url);
            const data = String(i.dataRealizacao || "").slice(0, 10) || "sem-data";
            // Rev. 4665 — separa integração FC (interna) da integração do cliente
            const sub = i.tipo === "interna" ? "Integração FC" : "Integração Cliente";
            const tp = sanitize(i.clienteNome || (i.tipo === "interna" ? "FC" : "Integracao"));
            files.push({ url, path: `${nome}/004 - INTEGRAÇÕES/${sub}/${tp}_${data}.${ext}` });
          });

        docRows
          .filter(d => d.employeeId === emp.id && d.fileUrl?.trim())
          .forEach((d) => {
            const ext = extFromUrl(d.fileUrl!);
            const tp = sanitize(TIPO_DOC_LABEL[d.tipo] || d.tipo || "Documento");
            const nm = sanitize(d.nome || tp);
            // Rev. 4665 — subpasta por tipo (Identificação / Registro / Outros)
            files.push({ url: d.fileUrl!, path: `${nome}/001 - DOCUMENTOS PESSOAIS/${subpastaDoc(d.tipo)}/${tp}_${nm}.${ext}` });
          });
      }

      if (files.length === 0) {
        // Rev. 4649 — funcionário pode não ter anexos mas ter entregas de EPI
        // (a Ficha de EPI digital é gerada na hora, depois do pipe)
        const { epiDeliveries } = await import("../../drizzle/schema");
        const [temEpi] = await db.select({ id: epiDeliveries.id }).from(epiDeliveries)
          .where(and(eq(epiDeliveries.companyId, companyId), inArray(epiDeliveries.employeeId, validIds), isNull(epiDeliveries.deletedAt)))
          .limit(1);
        if (!temEpi) {
          res.status(404).json({ error: "Nenhum arquivo encontrado para os funcionários selecionados. Anexe documentos primeiro." });
          return;
        }
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

      // Rev. 4649 — Ficha de EPI DIGITAL gerada na hora (assinaturas online,
      // NR-06/CLT) entra no ZIP de cada funcionário com entregas de EPI.
      // A ficha ANTIGA (upload em Documentos, ex. "Controle de EPI - X.pdf")
      // é MANTIDA. Gerada APÓS o pipe (headers já enviados, ZIP streamando)
      // e anexada ficha a ficha — nada acumula em RAM.
      const nomePorId = new Map(empRows.map(e => [e.id, sanitize(e.nomeCompleto || `Funcionario_${e.id}`)]));
      try {
        // Rev. 4658 — escopo do fallback de foto = empresas acessíveis ao user
        const fotoScope = (await getCompaniesForUser(user.id, user.role)).map((c: any) => c.id);
        await gerarFichasEpiPdfLote(companyId, validIds, (empId, buf) => {
          archive.append(buf, { name: `${nomePorId.get(empId)}/005 - EPI/Ficha_de_EPI_Digital.pdf` });
        }, fotoScope);
      } catch (e) {
        console.warn("[DownloadDossie] Falha ao gerar Fichas de EPI digitais:", e);
      }

      await archive.finalize();
    } catch (err) {
      console.error("[DownloadDossie] Erro geral:", err);
      if (!res.headersSent) res.status(500).json({ error: "Erro interno" });
    }
  });
}
