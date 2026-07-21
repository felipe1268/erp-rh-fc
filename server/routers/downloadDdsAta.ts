import type { Express, Request, Response } from "express";
import * as fs from "fs";
import * as path from "path";
import { getDb } from "../db";
import { sdk } from "../_core/sdk";
import {
  companies,
  userCompanies,
  ddsSessoes,
  ddsSessaoFuncionarios,
  ddsParticipacoesTerceiros,
  funcionariosTerceiros,
  employees,
} from "../../drizzle/schema";
import { eq, and, isNull } from "drizzle-orm";

function esc(s: string | null | undefined): string {
  if (!s) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmtDate(val: string | Date | null | undefined): string {
  if (!val) return "";
  const s = val instanceof Date ? val.toISOString() : String(val);
  const d = s.slice(0, 10);
  if (d.length < 10) return s;
  const [y, m, dd] = d.split("-");
  return `${dd}/${m}/${y}`;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

/** Converte qualquer URL ou path de imagem para data URL base64.
 *  Retorna null se falhar (foto não cadastrada, URL inválida, etc.)
 */
async function toBase64(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;

  // Já é data URL — retorna direto (assinaturas já estão assim)
  if (url.startsWith("data:")) return url;

  try {
    // Caminho interno /uploads/... → lê do disco
    if (url.startsWith("/uploads/") || url.startsWith("/api/upload")) {
      const localPath = path.join(process.cwd(), "server", url.split("?")[0]);
      if (fs.existsSync(localPath)) {
        const buf = fs.readFileSync(localPath);
        const ext = path.extname(localPath).toLowerCase().replace(".", "");
        const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg"
          : ext === "png" ? "image/png"
          : ext === "webp" ? "image/webp"
          : "image/jpeg";
        return `data:${mime};base64,${buf.toString("base64")}`;
      }
    }

    // URL externa — fetch com timeout de 5s
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const resp = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!resp.ok) return null;
    const contentType = resp.headers.get("content-type") || "image/jpeg";
    const mime = contentType.split(";")[0].trim();
    const buf = Buffer.from(await resp.arrayBuffer());
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

export function registerDdsAtaRoute(app: Express) {
  app.get("/api/dds-ata/:id", async (req: Request, res: Response) => {
    try {
      let user: { id: number; role: string };
      try {
        const authUser = await sdk.authenticateRequest(req);
        user = {
          id: (authUser as Record<string, number>).id,
          role: (authUser as Record<string, string>).role,
        };
      } catch {
        res.status(401).send("Não autenticado");
        return;
      }

      const sessaoId = parseInt(req.params.id, 10);
      const companyId = parseInt(req.query.companyId as string, 10);
      if (isNaN(sessaoId) || isNaN(companyId)) {
        res.status(400).send("Parâmetros inválidos");
        return;
      }

      const db = (await getDb())!;

      // Tenancy check
      if (user.role !== "admin_master") {
        const link = await db
          .select({ id: userCompanies.id })
          .from(userCompanies)
          .where(and(eq(userCompanies.userId, user.id), eq(userCompanies.companyId, companyId)));
        if (link.length === 0) {
          res.status(403).send("Sem permissão para acessar esta empresa");
          return;
        }
      }

      // Fetch session
      const [s] = await db.select({
        id: ddsSessoes.id,
        obraNome: ddsSessoes.obraNome,
        data: ddsSessoes.data,
        hora: ddsSessoes.hora,
        tituloTema: ddsSessoes.tituloTema,
        conteudoMd: ddsSessoes.conteudoMd,
        instrutor: ddsSessoes.instrutor,
        local: ddsSessoes.local,
        observacoes: ddsSessoes.observacoes,
        status: ddsSessoes.status,
        categoria: ddsSessoes.categoria,
      }).from(ddsSessoes)
        .where(and(eq(ddsSessoes.id, sessaoId), eq(ddsSessoes.companyId, companyId)));

      if (!s) { res.status(404).send("Sessão não encontrada"); return; }

      // Fetch company
      const [company] = await db.select({
        nomeFantasia: companies.nomeFantasia,
        razaoSocial: companies.razaoSocial,
        cnpj: companies.cnpj,
        logoUrl: companies.logoUrl,
      }).from(companies).where(eq(companies.id, companyId));

      // Fetch employees with signatures
      const funcs = await db.select({
        id: ddsSessaoFuncionarios.id,
        nome: ddsSessaoFuncionarios.nome,
        cpf: ddsSessaoFuncionarios.cpf,
        funcao: ddsSessaoFuncionarios.funcao,
        presente: ddsSessaoFuncionarios.presente,
        assinadoEm: ddsSessaoFuncionarios.assinadoEm,
        assinaturaImg: ddsSessaoFuncionarios.assinaturaImg,
        fotoUrl: employees.fotoUrl,
      }).from(ddsSessaoFuncionarios)
        .leftJoin(employees, eq(employees.id, ddsSessaoFuncionarios.employeeId))
        .where(eq(ddsSessaoFuncionarios.sessaoId, sessaoId))
        .orderBy(ddsSessaoFuncionarios.nome);

      // Fetch terceiros
      let terceiros: Array<{
        id: number; nome: string | null; cpf: string | null;
        funcao: string | null; fotoUrl: string | null;
      }> = [];
      try {
        terceiros = await db.select({
          id: ddsParticipacoesTerceiros.id,
          nome: funcionariosTerceiros.nome,
          cpf: funcionariosTerceiros.cpf,
          funcao: funcionariosTerceiros.funcao,
          fotoUrl: funcionariosTerceiros.fotoUrl,
        }).from(ddsParticipacoesTerceiros)
          .leftJoin(funcionariosTerceiros, eq(funcionariosTerceiros.id, ddsParticipacoesTerceiros.funcTerceiroId))
          .where(and(
            eq(ddsParticipacoesTerceiros.companyId, companyId),
            eq(ddsParticipacoesTerceiros.sessaoId, sessaoId),
            isNull(ddsParticipacoesTerceiros.deletedAt),
          ))
          .orderBy(funcionariosTerceiros.nome);
      } catch { /* módulo terceiros opcional */ }

      // ─── Converter TODAS as imagens para base64 em paralelo ──────────────────
      // Assim ficam embutidas no HTML e nunca somem na impressão
      const [logoB64, ...imgResults] = await Promise.all([
        toBase64(company?.logoUrl),
        ...funcs.map((f) => toBase64(f.fotoUrl)),
        ...terceiros.map((t) => toBase64(t.fotoUrl)),
      ]);

      const funcFotos = imgResults.slice(0, funcs.length);
      const tercFotos = imgResults.slice(funcs.length);

      // ─── Montar participantes ─────────────────────────────────────────────────
      interface Participant {
        nome: string; cpf: string | null; funcao: string | null;
        presente: boolean | null; assinadoEm: string | null;
        assinaturaImg: string | null; fotoB64: string | null;
        terceiro: boolean;
      }

      const participants: Participant[] = [
        ...funcs.map((f, i) => ({
          nome: f.nome ?? "",
          cpf: f.cpf,
          funcao: f.funcao,
          presente: f.presente as boolean | null,
          assinadoEm: f.assinadoEm,
          assinaturaImg: f.assinaturaImg,
          fotoB64: funcFotos[i] ?? null,
          terceiro: false,
        })),
        ...terceiros.map((t, i) => ({
          nome: t.nome ?? "",
          cpf: t.cpf,
          funcao: t.funcao,
          presente: true,
          assinadoEm: null,
          assinaturaImg: null,
          fotoB64: tercFotos[i] ?? null,
          terceiro: true,
        })),
      ];

      const totalPresentes = participants.filter((p) => p.presente).length;
      const totalAssinados = participants.filter((p) => !!p.assinaturaImg).length;

      const nomeEmpresa = company?.nomeFantasia || company?.razaoSocial || "FC Engenharia";
      const cnpj = company?.cnpj || "";
      const dataEmissao = new Date().toLocaleString("pt-BR", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      });

      // ─── Foto/inicial do participante ─────────────────────────────────────────
      const fotoCell = (p: Participant) => {
        if (p.fotoB64) {
          return `<img src="${p.fotoB64}" alt="${esc(p.nome)}"
            style="width:44px;height:44px;border-radius:50%;object-fit:cover;
            border:2px solid ${p.terceiro ? "#f59e0b" : "#3b82f6"};display:block;">`;
        }
        const bg = p.terceiro ? "#f59e0b" : "#1e3a5f";
        const ini = initials(p.nome) || "?";
        return `<div style="width:44px;height:44px;border-radius:50%;background:${bg};
          color:#fff;font-weight:800;font-size:14px;line-height:44px;text-align:center;
          flex-shrink:0;">${esc(ini)}</div>`;
      };

      // ─── Célula de assinatura ─────────────────────────────────────────────────
      const assCell = (p: Participant) => {
        if (p.assinaturaImg) {
          return `<div style="text-align:center;">
            <img src="${p.assinaturaImg}" alt="assinatura"
              style="max-height:38px;max-width:110px;object-fit:contain;display:block;margin:0 auto;">
            <div style="font-size:9px;color:#64748b;margin-top:2px;">${esc(fmtDate(p.assinadoEm))}</div>
          </div>`;
        }
        if (p.terceiro) return `<span style="color:#94a3b8;font-size:10px;">—</span>`;
        return `<span style="color:#cbd5e1;font-size:10px;font-style:italic;">Não assinou</span>`;
      };

      // ─── Linhas da tabela ─────────────────────────────────────────────────────
      const rows = participants.map((p, i) => {
        const bg = i % 2 === 0 ? "#ffffff" : "#f8fafc";
        const presStyle = p.presente
          ? "background:#dcfce7;color:#166534;"
          : "background:#fee2e2;color:#991b1b;";
        return `
<tr style="background:${bg};page-break-inside:avoid;">
  <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:center;width:56px;vertical-align:middle;">
    ${fotoCell(p)}
  </td>
  <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;vertical-align:middle;">
    <div style="font-weight:700;color:#0f172a;font-size:11.5px;line-height:1.3;">
      ${esc(p.nome)}
      ${p.terceiro ? `<span style="background:#fef3c7;color:#92400e;font-size:9px;padding:1px 5px;border-radius:9999px;font-weight:700;margin-left:4px;white-space:nowrap;">Terc.</span>` : ""}
    </div>
  </td>
  <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:10.5px;color:#475569;white-space:nowrap;vertical-align:middle;">${esc(p.cpf) || "—"}</td>
  <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:10.5px;color:#475569;vertical-align:middle;">${esc(p.funcao) || "—"}</td>
  <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:center;vertical-align:middle;">
    <span style="${presStyle}font-size:10px;padding:2px 8px;border-radius:9999px;font-weight:700;display:inline-block;">
      ${p.presente ? "Sim" : "Não"}
    </span>
  </td>
  <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:center;vertical-align:middle;min-width:120px;">
    ${assCell(p)}
  </td>
</tr>`;
      }).join("");

      // ─── Roteiro ──────────────────────────────────────────────────────────────
      const roteiroHtml = (s.conteudoMd ?? "").trim().length >= 10
        ? `<div style="margin:16px 0;padding:14px 18px;background:#f0f9ff;border-left:4px solid #0ea5e9;border-radius:0 8px 8px 0;page-break-inside:avoid;">
            <div style="font-size:10px;font-weight:800;color:#0369a1;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px;">Roteiro / Conteúdo da Sessão</div>
            <div style="font-size:11px;color:#1e293b;white-space:pre-wrap;line-height:1.65;">${esc(s.conteudoMd)}</div>
           </div>`
        : "";

      // ─── Logo ─────────────────────────────────────────────────────────────────
      const logoHtml = logoB64
        ? `<img src="${logoB64}" alt="logo" style="max-height:52px;max-width:150px;object-fit:contain;display:block;">`
        : `<div style="font-size:17px;font-weight:900;color:#fff;letter-spacing:.02em;">${esc(nomeEmpresa)}</div>`;

      // ─── HTML completo ────────────────────────────────────────────────────────
      const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Ata DDS #${sessaoId}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', Arial, sans-serif;
      background: #f1f5f9;
      color: #1e293b;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    @page {
      size: A4 portrait;
      margin: 10mm 12mm 12mm 12mm;
    }
    @media print {
      body { background: #fff !important; }
      .no-print { display: none !important; }
      img { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
<div style="max-width:800px;margin:0 auto;background:#fff;box-shadow:0 2px 24px rgba(0,0,0,.1);">

  <!-- HEADER -->
  <div style="background:linear-gradient(135deg,#1e3a5f 0%,#0f2744 100%);padding:18px 24px;display:flex;align-items:center;justify-content:space-between;gap:16px;">
    <div style="flex-shrink:0;">${logoHtml}</div>
    <div style="flex:1;text-align:center;">
      <div style="color:#fff;font-size:17px;font-weight:900;letter-spacing:.04em;line-height:1.2;">ATA DE DDS</div>
      <div style="color:#93c5fd;font-size:10px;font-weight:500;letter-spacing:.1em;margin-top:3px;text-transform:uppercase;">Diálogo Diário de Segurança</div>
    </div>
    <div style="text-align:right;flex-shrink:0;">
      <div style="color:#cbd5e1;font-size:9.5px;line-height:1.7;">
        ${cnpj ? `<div>CNPJ: ${esc(cnpj)}</div>` : ""}
        <div>Emitido em ${esc(dataEmissao)}</div>
        <div style="color:#7dd3fc;font-weight:600;">Sessão #${sessaoId}</div>
      </div>
    </div>
  </div>

  <!-- INFO CARD -->
  <div style="background:#f8fafc;border-bottom:3px solid #e2e8f0;padding:14px 24px;">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px 24px;">
      <div>
        <div style="font-size:9px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.08em;">Tema</div>
        <div style="font-size:13px;font-weight:800;color:#0f172a;margin-top:2px;line-height:1.3;">${esc(s.tituloTema) || "—"}</div>
      </div>
      <div>
        <div style="font-size:9px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.08em;">Data / Hora</div>
        <div style="font-size:13px;font-weight:700;color:#1e293b;margin-top:2px;">${esc(fmtDate(s.data))}${s.hora ? " &nbsp;·&nbsp; " + esc(s.hora) : ""}</div>
      </div>
      ${s.obraNome ? `<div>
        <div style="font-size:9px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.08em;">Obra / Local</div>
        <div style="font-size:12px;color:#334155;margin-top:2px;">${esc(s.obraNome)}${s.local ? " · " + esc(s.local) : ""}</div>
      </div>` : s.local ? `<div>
        <div style="font-size:9px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.08em;">Local</div>
        <div style="font-size:12px;color:#334155;margin-top:2px;">${esc(s.local)}</div>
      </div>` : ""}
      ${s.instrutor ? `<div>
        <div style="font-size:9px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.08em;">Instrutor</div>
        <div style="font-size:12px;color:#334155;margin-top:2px;">${esc(s.instrutor)}</div>
      </div>` : ""}
      ${s.categoria ? `<div>
        <div style="font-size:9px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.08em;">Categoria</div>
        <div style="font-size:12px;color:#334155;margin-top:2px;">${esc(s.categoria)}</div>
      </div>` : ""}
    </div>
    ${s.observacoes ? `<div style="margin-top:10px;padding:8px 12px;background:#fefce8;border-radius:6px;border-left:3px solid #eab308;">
      <span style="font-size:10px;font-weight:700;color:#713f12;">Observações: </span>
      <span style="font-size:10.5px;color:#78350f;">${esc(s.observacoes)}</span>
    </div>` : ""}
  </div>

  <!-- ROTEIRO -->
  ${roteiroHtml ? `<div style="padding:0 24px;">${roteiroHtml}</div>` : ""}

  <!-- LISTA DE PRESENÇA -->
  <div style="padding:16px 24px 24px;">
    <!-- Cabeçalho da seção com KPIs -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;gap:8px;">
      <div style="font-size:11px;font-weight:800;color:#1e3a5f;text-transform:uppercase;letter-spacing:.06em;border-left:4px solid #1e3a5f;padding-left:10px;">
        Lista de Presença
      </div>
      <div style="display:flex;gap:8px;">
        <span style="background:#eff6ff;color:#1d4ed8;font-size:10px;font-weight:700;padding:3px 10px;border-radius:9999px;">
          ${participants.length} colaborador${participants.length !== 1 ? "es" : ""}
        </span>
        <span style="background:#f0fdf4;color:#15803d;font-size:10px;font-weight:700;padding:3px 10px;border-radius:9999px;">
          ${totalPresentes} presente${totalPresentes !== 1 ? "s" : ""}
        </span>
        <span style="background:#faf5ff;color:#7e22ce;font-size:10px;font-weight:700;padding:3px 10px;border-radius:9999px;">
          ${totalAssinados} assinatura${totalAssinados !== 1 ? "s" : ""}
        </span>
      </div>
    </div>

    <table style="width:100%;border-collapse:collapse;font-size:11px;">
      <thead>
        <tr style="background:#1e3a5f;">
          <th style="padding:8px 10px;color:#e2e8f0;font-weight:700;font-size:9.5px;text-transform:uppercase;letter-spacing:.06em;text-align:center;width:56px;">Foto</th>
          <th style="padding:8px 10px;color:#e2e8f0;font-weight:700;font-size:9.5px;text-transform:uppercase;letter-spacing:.06em;text-align:left;">Nome</th>
          <th style="padding:8px 10px;color:#e2e8f0;font-weight:700;font-size:9.5px;text-transform:uppercase;letter-spacing:.06em;text-align:left;white-space:nowrap;">CPF</th>
          <th style="padding:8px 10px;color:#e2e8f0;font-weight:700;font-size:9.5px;text-transform:uppercase;letter-spacing:.06em;text-align:left;">Função</th>
          <th style="padding:8px 10px;color:#e2e8f0;font-weight:700;font-size:9.5px;text-transform:uppercase;letter-spacing:.06em;text-align:center;width:60px;">Presente</th>
          <th style="padding:8px 10px;color:#e2e8f0;font-weight:700;font-size:9.5px;text-transform:uppercase;letter-spacing:.06em;text-align:center;min-width:130px;">Assinatura</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>

  <!-- FOOTER -->
  <div style="background:#f8fafc;border-top:2px solid #e2e8f0;padding:12px 24px;display:flex;justify-content:space-between;align-items:center;">
    <div style="font-size:10px;color:#64748b;font-weight:600;">${esc(nomeEmpresa)}</div>
    <div style="font-size:9.5px;color:#94a3b8;">DDS #${sessaoId} &nbsp;·&nbsp; ${esc(dataEmissao)}</div>
  </div>


</div>
</body>
</html>`;

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.send(html);
    } catch (err) {
      console.error("[DdsAta] Erro ao gerar ata:", err);
      res.status(500).send("Erro interno ao gerar a ata");
    }
  });
}
