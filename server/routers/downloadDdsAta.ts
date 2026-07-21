import type { Express, Request, Response } from "express";
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

function escAttr(s: string | null | undefined): string {
  return esc(s);
}

function fmtDate(val: string | null | undefined): string {
  if (!val) return "";
  const d = typeof val === "string" ? val.slice(0, 10) : "";
  if (!d || d.length < 10) return String(val);
  const [y, m, dd] = d.split("-");
  return `${dd}/${m}/${y}`;
}

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
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
          .where(
            and(
              eq(userCompanies.userId, user.id),
              eq(userCompanies.companyId, companyId)
            )
          );
        if (link.length === 0) {
          res.status(403).send("Sem permissão para acessar esta empresa");
          return;
        }
      }

      // Fetch session
      const [s] = await db
        .select({
          id: ddsSessoes.id,
          companyId: ddsSessoes.companyId,
          obraId: ddsSessoes.obraId,
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
        })
        .from(ddsSessoes)
        .where(
          and(
            eq(ddsSessoes.id, sessaoId),
            eq(ddsSessoes.companyId, companyId)
          )
        );

      if (!s) {
        res.status(404).send("Sessão não encontrada");
        return;
      }

      // Fetch company info
      const [company] = await db
        .select({
          nomeFantasia: companies.nomeFantasia,
          razaoSocial: companies.razaoSocial,
          cnpj: companies.cnpj,
          logoUrl: companies.logoUrl,
        })
        .from(companies)
        .where(eq(companies.id, companyId));

      // Fetch employees with assinaturas (large data — fine server-side)
      const funcs = await db
        .select({
          id: ddsSessaoFuncionarios.id,
          nome: ddsSessaoFuncionarios.nome,
          cpf: ddsSessaoFuncionarios.cpf,
          funcao: ddsSessaoFuncionarios.funcao,
          presente: ddsSessaoFuncionarios.presente,
          assinadoEm: ddsSessaoFuncionarios.assinadoEm,
          assinaturaImg: ddsSessaoFuncionarios.assinaturaImg,
          fotoUrl: employees.fotoUrl,
        })
        .from(ddsSessaoFuncionarios)
        .leftJoin(employees, eq(employees.id, ddsSessaoFuncionarios.employeeId))
        .where(eq(ddsSessaoFuncionarios.sessaoId, sessaoId))
        .orderBy(ddsSessaoFuncionarios.nome);

      // Fetch terceiros
      let terceiros: Array<{
        id: number;
        nome: string | null;
        cpf: string | null;
        funcao: string | null;
        fotoUrl: string | null;
      }> = [];
      try {
        terceiros = await db
          .select({
            id: ddsParticipacoesTerceiros.id,
            nome: funcionariosTerceiros.nome,
            cpf: funcionariosTerceiros.cpf,
            funcao: funcionariosTerceiros.funcao,
            fotoUrl: funcionariosTerceiros.fotoUrl,
          })
          .from(ddsParticipacoesTerceiros)
          .leftJoin(
            funcionariosTerceiros,
            eq(
              funcionariosTerceiros.id,
              ddsParticipacoesTerceiros.funcTerceiroId
            )
          )
          .where(
            and(
              eq(ddsParticipacoesTerceiros.companyId, companyId),
              eq(ddsParticipacoesTerceiros.sessaoId, sessaoId),
              isNull(ddsParticipacoesTerceiros.deletedAt)
            )
          )
          .orderBy(funcionariosTerceiros.nome);
      } catch {
        /* módulo terceiros opcional */
      }

      const nomeEmpresa =
        company?.nomeFantasia || company?.razaoSocial || "FC Engenharia";
      const cnpj = company?.cnpj || "";
      const logoUrl = company?.logoUrl || "";
      const dataEmissao = new Date().toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

      // Build participant rows (employees + terceiros)
      interface Participant {
        nome: string;
        cpf: string | null;
        funcao: string | null;
        presente: boolean | null;
        assinadoEm: string | null;
        assinaturaImg: string | null;
        fotoUrl: string | null;
        terceiro: boolean;
      }

      const participants: Participant[] = [
        ...funcs.map((f) => ({
          nome: f.nome ?? "",
          cpf: f.cpf,
          funcao: f.funcao,
          presente: f.presente,
          assinadoEm: f.assinadoEm,
          assinaturaImg: f.assinaturaImg,
          fotoUrl: f.fotoUrl,
          terceiro: false,
        })),
        ...terceiros.map((t) => ({
          nome: t.nome ?? "",
          cpf: t.cpf,
          funcao: t.funcao,
          presente: true,
          assinadoEm: null,
          assinaturaImg: null,
          fotoUrl: t.fotoUrl,
          terceiro: true,
        })),
      ];

      const photoCircle = (p: Participant) => {
        if (p.fotoUrl) {
          return `<img src="${escAttr(p.fotoUrl)}" alt="${escAttr(p.nome)}"
            style="width:48px;height:48px;border-radius:50%;object-fit:cover;border:2px solid #e2e8f0;">`;
        }
        const ini = initials(p.nome);
        const color = p.terceiro ? "#d97706" : "#1e3a5f";
        return `<div style="width:48px;height:48px;border-radius:50%;background:${color};
          color:#fff;display:flex;align-items:center;justify-content:center;
          font-weight:700;font-size:15px;flex-shrink:0;">${esc(ini)}</div>`;
      };

      const signatureCell = (p: Participant) => {
        if (p.assinaturaImg) {
          return `<div style="text-align:center;">
            <img src="${escAttr(p.assinaturaImg)}" alt="assinatura"
              style="max-height:40px;max-width:120px;object-fit:contain;">
            <div style="font-size:10px;color:#64748b;margin-top:2px;">${esc(fmtDate(p.assinadoEm))}</div>
          </div>`;
        }
        if (p.terceiro) {
          return `<span style="font-size:11px;color:#64748b;">—</span>`;
        }
        return `<span style="font-size:11px;color:#94a3b8;font-style:italic;">Não assinou</span>`;
      };

      const rows = participants
        .map(
          (p) => `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;text-align:center;width:60px;">
            ${photoCircle(p)}
          </td>
          <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;">
            <div style="font-weight:600;color:#1e293b;font-size:13px;">
              ${esc(p.nome)}
              ${p.terceiro ? `<span style="background:#fef3c7;color:#92400e;font-size:10px;padding:1px 6px;border-radius:9999px;font-weight:600;margin-left:6px;">Terc.</span>` : ""}
            </div>
          </td>
          <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:12px;color:#475569;">
            ${esc(p.cpf) || "—"}
          </td>
          <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:12px;color:#475569;">
            ${esc(p.funcao) || "—"}
          </td>
          <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;text-align:center;">
            ${
              p.presente
                ? `<span style="background:#dcfce7;color:#166534;font-size:11px;padding:2px 8px;border-radius:9999px;font-weight:600;">Sim</span>`
                : `<span style="background:#fee2e2;color:#991b1b;font-size:11px;padding:2px 8px;border-radius:9999px;font-weight:600;">Não</span>`
            }
          </td>
          <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;text-align:center;">
            ${signatureCell(p)}
          </td>
        </tr>`
        )
        .join("");

      const roteiro = s.conteudoMd
        ? `<div style="margin:24px 0;padding:16px 20px;background:#f8fafc;border-left:4px solid #1e3a5f;border-radius:0 8px 8px 0;">
          <div style="font-weight:700;color:#1e3a5f;font-size:13px;margin-bottom:10px;text-transform:uppercase;letter-spacing:.05em;">Roteiro / Conteúdo</div>
          <div style="font-size:13px;color:#334155;white-space:pre-wrap;line-height:1.6;">${esc(s.conteudoMd)}</div>
         </div>`
        : "";

      const logoHtml = logoUrl
        ? `<img src="${escAttr(logoUrl)}" alt="logo" style="max-height:56px;max-width:160px;object-fit:contain;">`
        : `<div style="font-size:18px;font-weight:800;color:#fff;">${esc(nomeEmpresa)}</div>`;

      const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Ata DDS #${sessaoId} — ${esc(nomeEmpresa)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #f1f5f9; color: #1e293b; }
    @media print {
      body { background: #fff; }
      .no-print { display: none !important; }
      @page { margin: 12mm 14mm; }
    }
  </style>
</head>
<body>
  <div style="max-width:860px;margin:0 auto;background:#fff;box-shadow:0 2px 16px rgba(0,0,0,.08);">

    <!-- Header -->
    <div style="background:#1e3a5f;padding:20px 28px;display:flex;align-items:center;justify-content:space-between;">
      <div>${logoHtml}</div>
      <div style="text-align:right;">
        <div style="color:#fff;font-size:20px;font-weight:800;letter-spacing:.02em;">ATA DE DDS</div>
        <div style="color:#93c5fd;font-size:12px;margin-top:4px;">Diálogo Diário de Segurança</div>
        ${cnpj ? `<div style="color:#93c5fd;font-size:11px;margin-top:2px;">CNPJ: ${esc(cnpj)}</div>` : ""}
      </div>
    </div>

    <!-- Info card -->
    <div style="padding:20px 28px;border-bottom:1px solid #e2e8f0;">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div>
          <div style="font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:.05em;">Tema</div>
          <div style="font-size:14px;font-weight:700;color:#1e293b;margin-top:2px;">${esc(s.tituloTema) || "—"}</div>
        </div>
        <div>
          <div style="font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:.05em;">Data / Hora</div>
          <div style="font-size:14px;font-weight:600;color:#1e293b;margin-top:2px;">${esc(fmtDate(s.data))}${s.hora ? " · " + esc(s.hora) : ""}</div>
        </div>
        ${
          s.obraNome
            ? `<div>
          <div style="font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:.05em;">Obra</div>
          <div style="font-size:13px;color:#334155;margin-top:2px;">${esc(s.obraNome)}</div>
        </div>`
            : ""
        }
        ${
          s.instrutor
            ? `<div>
          <div style="font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:.05em;">Instrutor</div>
          <div style="font-size:13px;color:#334155;margin-top:2px;">${esc(s.instrutor)}</div>
        </div>`
            : ""
        }
        ${
          s.local
            ? `<div>
          <div style="font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:.05em;">Local</div>
          <div style="font-size:13px;color:#334155;margin-top:2px;">${esc(s.local)}</div>
        </div>`
            : ""
        }
        ${
          s.categoria
            ? `<div>
          <div style="font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:.05em;">Categoria</div>
          <div style="font-size:13px;color:#334155;margin-top:2px;">${esc(s.categoria)}</div>
        </div>`
            : ""
        }
      </div>
      ${
        s.observacoes
          ? `<div style="margin-top:12px;padding:10px 14px;background:#fefce8;border-radius:6px;font-size:12px;color:#713f12;">
          <strong>Obs:</strong> ${esc(s.observacoes)}
        </div>`
          : ""
      }
    </div>

    <!-- Roteiro -->
    <div style="padding:0 28px;">${roteiro}</div>

    <!-- Participants table -->
    <div style="padding:4px 28px 28px;">
      <div style="font-size:13px;font-weight:700;color:#1e3a5f;text-transform:uppercase;letter-spacing:.05em;margin-bottom:12px;">
        Lista de Presença (${participants.length} participante${participants.length !== 1 ? "s" : ""})
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:#f8fafc;">
            <th style="padding:10px 12px;text-align:center;border-bottom:2px solid #e2e8f0;font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:.04em;width:60px;">Foto</th>
            <th style="padding:10px 12px;text-align:left;border-bottom:2px solid #e2e8f0;font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:.04em;">Nome</th>
            <th style="padding:10px 12px;text-align:left;border-bottom:2px solid #e2e8f0;font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:.04em;">CPF</th>
            <th style="padding:10px 12px;text-align:left;border-bottom:2px solid #e2e8f0;font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:.04em;">Função</th>
            <th style="padding:10px 12px;text-align:center;border-bottom:2px solid #e2e8f0;font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:.04em;">Presente</th>
            <th style="padding:10px 12px;text-align:center;border-bottom:2px solid #e2e8f0;font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:.04em;">Assinatura</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>

    <!-- Footer -->
    <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:14px 28px;display:flex;justify-content:space-between;align-items:center;">
      <div style="font-size:11px;color:#64748b;">${esc(nomeEmpresa)}</div>
      <div style="font-size:11px;color:#94a3b8;">DDS #${sessaoId} · Emitido em ${esc(dataEmissao)}</div>
    </div>

    <!-- Print button (hidden on print) -->
    <div class="no-print" style="padding:20px 28px;text-align:center;">
      <button onclick="window.print()" style="background:#1e3a5f;color:#fff;border:none;padding:10px 28px;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">
        Imprimir / Salvar PDF
      </button>
    </div>

  </div>
  <script>
    window.addEventListener('load', function() {
      setTimeout(function() { window.print(); }, 400);
    });
  </script>
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
