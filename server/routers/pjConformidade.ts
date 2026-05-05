import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import * as XLSX from "xlsx";
import { storagePut } from "../storage";
import { rodarVerificacaoConformidadePJ } from "../services/pjConformidadeJobs";

// Tipos de conformidade monitorados:
// - das         : DAS-MEI mensal (vence dia 20)
// - nf          : NF de prestação de serviço mensal
// - cnd         : Certidão Negativa de Débitos do CNPJ (validade)
// - seguro_vida : Seguro de Vida (Cláusula 5.1 do contrato — validade)
// - status_cnpj : Status do CNPJ na Receita
const TIPOS_VALIDOS = ["das", "nf", "cnd", "seguro_vida", "status_cnpj"] as const;
const TIPOS_MENSAIS = new Set(["das", "nf"]);
const STATUS_VALIDOS = ["pendente", "ok", "vencido", "na"] as const;

const TIPO_LABEL: Record<string, string> = {
  das: "DAS-MEI",
  nf: "NF do mês",
  cnd: "CND CNPJ",
  seguro_vida: "Seguro de Vida",
  status_cnpj: "Status do CNPJ",
};

const STATUS_LABEL: Record<string, string> = {
  pendente: "Pendente",
  ok: "OK",
  vencido: "Vencido",
  na: "N/A",
};

// Confere que o usuário autenticado tem acesso à empresa informada.
// admin_master tem acesso a tudo; demais usuários precisam ter vínculo em user_companies.
async function assertUserCanAccessCompany(ctx: any, db: any, companyId: number) {
  const user = ctx?.user;
  if (!user?.id) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida" });
  }
  if (user.role === 'admin_master') return;
  const r: any = await db.execute(sql`
    SELECT 1 FROM user_companies
    WHERE "userId" = ${user.id} AND "companyId" = ${companyId}
    LIMIT 1
  `);
  if ((r?.rows ?? []).length === 0) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso à empresa selecionada" });
  }
}

// Garante que o employee pertence à companyId informada.
async function assertEmployeeInCompany(db: any, employeeId: number, companyId: number) {
  const r: any = await db.execute(sql`
    SELECT id, "companyId" FROM employees WHERE id = ${employeeId} AND "deletedAt" IS NULL LIMIT 1
  `);
  const row = (r?.rows ?? [])[0];
  if (!row) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Funcionário não encontrado" });
  }
  if (row.companyId !== companyId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Funcionário não pertence à empresa informada" });
  }
}

function parseDate(val: any): string | null {
  if (val === null || val === undefined || val === "") return null;
  if (typeof val === "number") {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const jsDate = new Date(excelEpoch.getTime() + val * 86400000);
    return jsDate.toISOString().slice(0, 10);
  }
  const str = String(val).trim();
  const m1 = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m1) return `${m1[3]}-${m1[2].padStart(2, "0")}-${m1[1].padStart(2, "0")}`;
  const m2 = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m2) return str.slice(0, 10);
  return null;
}

function normalizeCpf(cpf: any): string | null {
  if (!cpf) return null;
  const d = String(cpf).replace(/\D/g, "");
  if (d.length !== 11) return null;
  return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

function normalizeCompetencia(v: any): string | null {
  if (!v) return null;
  if (typeof v === "number") {
    const d = parseDate(v);
    return d ? d.slice(0, 7) : null;
  }
  const s = String(v).trim();
  const m1 = s.match(/^(\d{4})-(\d{2})$/);
  if (m1) return s;
  const m2 = s.match(/^(\d{1,2})[\/\-](\d{4})$/);
  if (m2) return `${m2[2]}-${m2[1].padStart(2, "0")}`;
  const m3 = s.match(/^(\d{4})[\/\-](\d{1,2})$/);
  if (m3) return `${m3[1]}-${m3[2].padStart(2, "0")}`;
  return null;
}

function normalizeStatus(v: any): "pendente" | "ok" | "vencido" | "na" {
  const s = String(v || "").trim().toLowerCase();
  if (s === "ok" || s === "regular" || s === "em dia") return "ok";
  if (s === "vencido" || s === "atrasado") return "vencido";
  if (s === "na" || s === "n/a" || s === "não se aplica") return "na";
  return "pendente";
}

function normalizeTipo(v: any): typeof TIPOS_VALIDOS[number] | null {
  const s = String(v || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (s === "das" || s === "dasmei" || s === "das-mei") return "das";
  if (s === "nf" || s === "notafiscal" || s === "nfse") return "nf";
  if (s === "cnd" || s === "cndcnpj" || s === "certidao") return "cnd";
  if (s === "segurovida" || s === "seguro" || s === "vida") return "seguro_vida";
  if (s === "statuscnpj" || s === "cnpj" || s === "situacaocnpj") return "status_cnpj";
  return null;
}

function competenciaAtual(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export const pjConformidadeRouter = router({
  // Lista PJs ativos com snapshot de conformidade do mês escolhido + itens vigentes (CND/Seguro/CNPJ)
  listar: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      mesReferencia: z.string().regex(/^\d{4}-\d{2}$/).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;
      await assertUserCanAccessCompany(ctx, db, input.companyId);
      const mesRef = input.mesReferencia || competenciaAtual();

      const empsRes: any = await db.execute(sql`
        SELECT DISTINCT e.id, e."nomeCompleto", e."cpf", e."funcao", e."status",
               e."tipoContrato", e."companyId"
        FROM employees e
        INNER JOIN pj_contracts pc ON pc."employeeId" = e.id
          AND pc."deletedAt" IS NULL
          AND pc."companyId" = ${input.companyId}
          AND pc."status" IN ('ativo','pendente_assinatura','suspenso')
        WHERE e."companyId" = ${input.companyId}
          AND e."deletedAt" IS NULL
          AND e."status" NOT IN ('Desligado','Lista_Negra','Inativo')
        ORDER BY e."nomeCompleto" ASC
      `);
      const emps = empsRes?.rows ?? [];
      if (emps.length === 0) return { mesReferencia: mesRef, funcionarios: [] };

      const empIds = emps.map((e: any) => e.id);

      const itensRes: any = await db.execute(sql`
        SELECT * FROM pj_conformidade
        WHERE "deletedAt" IS NULL
          AND "companyId" = ${input.companyId}
          AND "employeeId" = ANY(${empIds}::int[])
          AND (
            ("tipo" IN ('das','nf') AND "competencia" = ${mesRef})
            OR "tipo" IN ('cnd','seguro_vida','status_cnpj')
          )
        ORDER BY "createdAt" DESC
      `);
      const itens: any[] = itensRes?.rows ?? [];

      const today = new Date().toISOString().slice(0, 10);
      const funcionarios = emps.map((emp: any) => {
        const itemsEmp = itens.filter((i: any) => i.employeeId === emp.id);
        const byTipo: Record<string, any> = {};
        for (const tipo of TIPOS_VALIDOS) {
          if (TIPOS_MENSAIS.has(tipo)) {
            const it = itemsEmp.find((x: any) => x.tipo === tipo && x.competencia === mesRef);
            byTipo[tipo] = it || { tipo, competencia: mesRef, status: "pendente" };
          } else {
            const it = itemsEmp.filter((x: any) => x.tipo === tipo)[0];
            if (it && it.dataVencimento) {
              if (it.dataVencimento < today && it.status !== "na") {
                it.statusComputed = "vencido";
              } else if (it.status === "ok") {
                it.statusComputed = "ok";
              } else {
                it.statusComputed = it.status;
              }
            } else if (it) {
              it.statusComputed = it.status;
            }
            byTipo[tipo] = it || { tipo, competencia: null, status: "pendente" };
          }
        }
        const pendencias = TIPOS_VALIDOS.filter((t) => {
          const s = byTipo[t]?.statusComputed || byTipo[t]?.status;
          return s === "pendente" || s === "vencido";
        }).length;
        return { ...emp, itens: byTipo, pendencias };
      });

      return { mesReferencia: mesRef, funcionarios };
    }),

  upsert: protectedProcedure
    .input(z.object({
      id: z.number().optional(),
      companyId: z.number(),
      employeeId: z.number(),
      tipo: z.enum(TIPOS_VALIDOS),
      competencia: z.string().regex(/^\d{4}-\d{2}$/).nullable().optional(),
      status: z.enum(STATUS_VALIDOS).default("pendente"),
      dataVencimento: z.string().nullable().optional(),
      dataEnvio: z.string().nullable().optional(),
      valor: z.string().nullable().optional(),
      documentoUrl: z.string().nullable().optional(),
      arquivoNome: z.string().nullable().optional(),
      observacoes: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      await assertUserCanAccessCompany(ctx, db, input.companyId);
      await assertEmployeeInCompany(db, input.employeeId, input.companyId);

      const competencia = TIPOS_MENSAIS.has(input.tipo) ? (input.competencia || null) : null;

      let existente: any = null;
      if (competencia === null) {
        const r: any = await db.execute(sql`
          SELECT * FROM pj_conformidade
          WHERE "deletedAt" IS NULL
            AND "companyId" = ${input.companyId}
            AND "employeeId" = ${input.employeeId}
            AND "tipo" = ${input.tipo}
            AND "competencia" IS NULL
          ORDER BY "createdAt" DESC LIMIT 1
        `);
        existente = (r?.rows ?? [])[0] || null;
      } else {
        const r: any = await db.execute(sql`
          SELECT * FROM pj_conformidade
          WHERE "deletedAt" IS NULL
            AND "companyId" = ${input.companyId}
            AND "employeeId" = ${input.employeeId}
            AND "tipo" = ${input.tipo}
            AND "competencia" = ${competencia}
          ORDER BY "createdAt" DESC LIMIT 1
        `);
        existente = (r?.rows ?? [])[0] || null;
      }

      if (existente) {
        await db.execute(sql`
          UPDATE pj_conformidade SET
            "status" = ${input.status},
            "dataVencimento" = ${input.dataVencimento || null}::date,
            "dataEnvio" = ${input.dataEnvio || null}::date,
            "valor" = ${input.valor || null}::numeric,
            "documentoUrl" = ${input.documentoUrl || null},
            "arquivoNome" = ${input.arquivoNome || null},
            "observacoes" = ${input.observacoes || null},
            "updatedAt" = NOW()
          WHERE id = ${existente.id} AND "companyId" = ${input.companyId}
        `);
        return { id: existente.id, updated: true };
      }
      const r: any = await db.execute(sql`
        INSERT INTO pj_conformidade
          ("companyId","employeeId","tipo","competencia","status","dataVencimento","dataEnvio","valor","documentoUrl","arquivoNome","observacoes")
        VALUES
          (${input.companyId}, ${input.employeeId}, ${input.tipo}, ${competencia}, ${input.status},
           ${input.dataVencimento || null}::date, ${input.dataEnvio || null}::date, ${input.valor || null}::numeric,
           ${input.documentoUrl || null}, ${input.arquivoNome || null}, ${input.observacoes || null})
        RETURNING id
      `);
      const newId = (r?.rows ?? [])[0]?.id;
      return { id: newId, created: true };
    }),

  remover: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      await assertUserCanAccessCompany(ctx, db, input.companyId);
      const r: any = await db.execute(sql`
        UPDATE pj_conformidade SET "deletedAt" = NOW()
        WHERE id = ${input.id} AND "companyId" = ${input.companyId} AND "deletedAt" IS NULL
        RETURNING id
      `);
      const updated = (r?.rows ?? []).length > 0;
      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Registro não encontrado ou não pertence à empresa" });
      }
      return { ok: true };
    }),

  resumoPorEmployee: protectedProcedure
    .input(z.object({ employeeId: z.number(), companyId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;
      await assertUserCanAccessCompany(ctx, db, input.companyId);
      await assertEmployeeInCompany(db, input.employeeId, input.companyId);

      const d = new Date();
      const mesRef = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      const today = d.toISOString().slice(0, 10);

      const r: any = await db.execute(sql`
        SELECT * FROM pj_conformidade
        WHERE "deletedAt" IS NULL
          AND "companyId" = ${input.companyId}
          AND "employeeId" = ${input.employeeId}
          AND (
            ("tipo" IN ('das','nf') AND "competencia" = ${mesRef})
            OR "tipo" IN ('cnd','seguro_vida','status_cnpj')
          )
      `);
      const itens: any[] = r?.rows ?? [];
      const byTipo: Record<string, any> = {};
      for (const tipo of TIPOS_VALIDOS) {
        if (TIPOS_MENSAIS.has(tipo)) {
          byTipo[tipo] = itens.find(i => i.tipo === tipo && i.competencia === mesRef) || { tipo, competencia: mesRef, status: "pendente" };
        } else {
          const it = itens.filter(i => i.tipo === tipo).sort((a,b) => (b.createdAt > a.createdAt ? 1 : -1))[0];
          if (it && it.dataVencimento && it.dataVencimento < today && it.status !== "na") {
            it.statusComputed = "vencido";
          } else if (it) {
            it.statusComputed = it.status;
          }
          byTipo[tipo] = it || { tipo, competencia: null, status: "pendente" };
        }
      }
      const pendencias = TIPOS_VALIDOS.filter(t => {
        const s = byTipo[t]?.statusComputed || byTipo[t]?.status;
        return s === "pendente" || s === "vencido";
      }).length;
      return { mesReferencia: mesRef, itens: byTipo, pendencias };
    }),

  // ========= TEMPLATE / IMPORT / EXPORT XLSX =========

  gerarTemplate: protectedProcedure
    .input(z.object({ companyId: z.number(), mesReferencia: z.string().regex(/^\d{4}-\d{2}$/).optional() }))
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;
      await assertUserCanAccessCompany(ctx, db, input.companyId);
      const mesRef = input.mesReferencia || competenciaAtual();

      const empsRes: any = await db.execute(sql`
        SELECT DISTINCT e."nomeCompleto", e."cpf"
        FROM employees e
        INNER JOIN pj_contracts pc ON pc."employeeId" = e.id
          AND pc."deletedAt" IS NULL
          AND pc."companyId" = ${input.companyId}
          AND pc."status" IN ('ativo','pendente_assinatura','suspenso')
        WHERE e."companyId" = ${input.companyId}
          AND e."deletedAt" IS NULL
          AND e."status" NOT IN ('Desligado','Lista_Negra','Inativo')
        ORDER BY e."nomeCompleto" ASC
      `);
      const emps: any[] = empsRes?.rows ?? [];

      const headers = ["CPF*", "Nome", "Tipo*", "Competência (YYYY-MM)", "Status*", "Data Vencimento", "Data Envio", "Valor", "Link Documento", "Observações"];
      const rows: any[][] = [headers];
      for (const e of emps) {
        for (const tipo of TIPOS_VALIDOS) {
          rows.push([
            e.cpf || "",
            e.nomeCompleto || "",
            tipo,
            TIPOS_MENSAIS.has(tipo) ? mesRef : "",
            "pendente",
            "",
            "",
            "",
            "",
            "",
          ]);
        }
      }

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws["!cols"] = headers.map((h) => ({ wch: Math.max(14, h.length + 4) }));
      XLSX.utils.book_append_sheet(wb, ws, "Conformidade");

      const inst = [
        ["INSTRUÇÕES — Importação de Conformidade PJ"],
        [""],
        ["Campos obrigatórios marcados com *"],
        [""],
        ["TIPOS VÁLIDOS:"],
        ["- das         → DAS-MEI mensal (use Competência YYYY-MM)"],
        ["- nf          → NF do mês (use Competência YYYY-MM)"],
        ["- cnd         → CND CNPJ (use Data Vencimento — sem Competência)"],
        ["- seguro_vida → Seguro de Vida (use Data Vencimento — sem Competência)"],
        ["- status_cnpj → Status do CNPJ (use Data Vencimento — sem Competência)"],
        [""],
        ["STATUS VÁLIDOS:"],
        ["- pendente / ok / vencido / na"],
        [""],
        ["DATAS aceitas:"],
        ["- DD/MM/AAAA  ou  AAAA-MM-DD"],
        [""],
        ["DICA: o cabeçalho desta planilha já vem preenchido com os PJs ativos."],
        ["Apague linhas que não quiser importar e edite as que precisar."],
      ];
      const wsInst = XLSX.utils.aoa_to_sheet(inst);
      wsInst["!cols"] = [{ wch: 80 }];
      XLSX.utils.book_append_sheet(wb, wsInst, "Instruções");

      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      return {
        fileName: `conformidade-pj-template-${mesRef}.xlsx`,
        base64: Buffer.from(buf).toString("base64"),
      };
    }),

  exportarXLSX: protectedProcedure
    .input(z.object({ companyId: z.number(), mesReferencia: z.string().regex(/^\d{4}-\d{2}$/).optional() }))
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;
      await assertUserCanAccessCompany(ctx, db, input.companyId);
      const mesRef = input.mesReferencia || competenciaAtual();

      const empsRes: any = await db.execute(sql`
        SELECT DISTINCT e.id, e."nomeCompleto", e."cpf", e."funcao"
        FROM employees e
        INNER JOIN pj_contracts pc ON pc."employeeId" = e.id
          AND pc."deletedAt" IS NULL
          AND pc."companyId" = ${input.companyId}
          AND pc."status" IN ('ativo','pendente_assinatura','suspenso')
        WHERE e."companyId" = ${input.companyId}
          AND e."deletedAt" IS NULL
          AND e."status" NOT IN ('Desligado','Lista_Negra','Inativo')
        ORDER BY e."nomeCompleto" ASC
      `);
      const emps: any[] = empsRes?.rows ?? [];
      const empIds = emps.map((e) => e.id);

      let itens: any[] = [];
      if (empIds.length > 0) {
        const r: any = await db.execute(sql`
          SELECT * FROM pj_conformidade
          WHERE "deletedAt" IS NULL
            AND "companyId" = ${input.companyId}
            AND "employeeId" = ANY(${empIds}::int[])
            AND (
              ("tipo" IN ('das','nf') AND "competencia" = ${mesRef})
              OR "tipo" IN ('cnd','seguro_vida','status_cnpj')
            )
        `);
        itens = r?.rows ?? [];
      }

      const today = new Date().toISOString().slice(0, 10);
      const headers = ["PJ", "CPF", "Função", "Tipo", "Competência", "Status", "Vencimento", "Envio", "Valor", "Observações", "Link"];
      const rows: any[][] = [headers];

      for (const e of emps) {
        for (const tipo of TIPOS_VALIDOS) {
          let it: any;
          if (TIPOS_MENSAIS.has(tipo)) {
            it = itens.find((x) => x.employeeId === e.id && x.tipo === tipo && x.competencia === mesRef);
          } else {
            it = itens.filter((x) => x.employeeId === e.id && x.tipo === tipo).sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1))[0];
          }
          let status = it?.status || "pendente";
          if (it && !TIPOS_MENSAIS.has(tipo) && it.dataVencimento && it.dataVencimento < today && it.status !== "na") {
            status = "vencido";
          }
          rows.push([
            e.nomeCompleto,
            e.cpf || "",
            e.funcao || "",
            TIPO_LABEL[tipo],
            it?.competencia || (TIPOS_MENSAIS.has(tipo) ? mesRef : ""),
            STATUS_LABEL[status] || status,
            it?.dataVencimento ? String(it.dataVencimento).slice(0, 10) : "",
            it?.dataEnvio ? String(it.dataEnvio).slice(0, 10) : "",
            it?.valor || "",
            it?.observacoes || "",
            it?.documentoUrl || "",
          ]);
        }
      }

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws["!cols"] = headers.map((h) => ({ wch: Math.max(14, h.length + 4) }));
      XLSX.utils.book_append_sheet(wb, ws, `Conformidade ${mesRef}`);
      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      return {
        fileName: `conformidade-pj-${mesRef}.xlsx`,
        base64: Buffer.from(buf).toString("base64"),
      };
    }),

  importarXLSX: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      fileBase64: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      await assertUserCanAccessCompany(ctx, db, input.companyId);

      let wb: XLSX.WorkBook;
      try {
        const buf = Buffer.from(input.fileBase64, "base64");
        wb = XLSX.read(buf, { type: "buffer" });
      } catch (e: any) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Arquivo inválido: " + (e?.message || "erro de leitura") });
      }
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) throw new TRPCError({ code: "BAD_REQUEST", message: "Planilha vazia" });
      const linhas: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" });

      // Carregar funcionários da empresa para resolver CPF -> employeeId
      const empsRes: any = await db.execute(sql`
        SELECT DISTINCT e.id, e."cpf"
        FROM employees e
        INNER JOIN pj_contracts pc ON pc."employeeId" = e.id
          AND pc."deletedAt" IS NULL
          AND pc."companyId" = ${input.companyId}
        WHERE e."companyId" = ${input.companyId}
          AND e."deletedAt" IS NULL
      `);
      const cpfMap = new Map<string, number>();
      for (const e of (empsRes?.rows ?? [])) {
        const cpf = String(e.cpf || "").replace(/\D/g, "");
        if (cpf) cpfMap.set(cpf, e.id);
      }

      const erros: { linha: number; mensagem: string }[] = [];
      let inseridos = 0;
      let atualizados = 0;

      for (let i = 0; i < linhas.length; i++) {
        const row = linhas[i];
        const linhaNum = i + 2;
        try {
          const cpfRaw = row["CPF*"] || row["CPF"] || row["cpf"] || "";
          const cpfDigits = String(cpfRaw).replace(/\D/g, "");
          if (!cpfDigits) { erros.push({ linha: linhaNum, mensagem: "CPF vazio" }); continue; }
          const employeeId = cpfMap.get(cpfDigits);
          if (!employeeId) {
            erros.push({ linha: linhaNum, mensagem: `CPF ${normalizeCpf(cpfRaw) || cpfRaw} não encontrado entre PJs ativos` });
            continue;
          }
          const tipo = normalizeTipo(row["Tipo*"] || row["Tipo"] || row["tipo"]);
          if (!tipo) { erros.push({ linha: linhaNum, mensagem: "Tipo inválido" }); continue; }
          const isMensal = TIPOS_MENSAIS.has(tipo);
          const competencia = isMensal ? normalizeCompetencia(row["Competência (YYYY-MM)"] || row["Competência"] || row["competencia"]) : null;
          if (isMensal && !competencia) {
            erros.push({ linha: linhaNum, mensagem: "Competência (YYYY-MM) é obrigatória para DAS/NF" });
            continue;
          }
          const status = normalizeStatus(row["Status*"] || row["Status"] || row["status"]);
          const dataVencimento = parseDate(row["Data Vencimento"] || row["Vencimento"] || row["data_vencimento"]);
          const dataEnvio = parseDate(row["Data Envio"] || row["Envio"] || row["data_envio"]);
          const valorRaw = row["Valor"] || row["valor"] || "";
          const valor = valorRaw === "" ? null : String(valorRaw).replace(",", ".");
          const documentoUrl = String(row["Link Documento"] || row["Link"] || row["link_documento"] || "").trim() || null;
          const observacoes = String(row["Observações"] || row["observacoes"] || "").trim() || null;

          // Verifica existente
          let existente: any = null;
          if (competencia === null) {
            const r: any = await db.execute(sql`
              SELECT id FROM pj_conformidade
              WHERE "deletedAt" IS NULL AND "companyId" = ${input.companyId}
                AND "employeeId" = ${employeeId} AND "tipo" = ${tipo} AND "competencia" IS NULL
              ORDER BY "createdAt" DESC LIMIT 1
            `);
            existente = (r?.rows ?? [])[0] || null;
          } else {
            const r: any = await db.execute(sql`
              SELECT id FROM pj_conformidade
              WHERE "deletedAt" IS NULL AND "companyId" = ${input.companyId}
                AND "employeeId" = ${employeeId} AND "tipo" = ${tipo} AND "competencia" = ${competencia}
              ORDER BY "createdAt" DESC LIMIT 1
            `);
            existente = (r?.rows ?? [])[0] || null;
          }

          if (existente) {
            await db.execute(sql`
              UPDATE pj_conformidade SET
                "status" = ${status},
                "dataVencimento" = ${dataVencimento}::date,
                "dataEnvio" = ${dataEnvio}::date,
                "valor" = ${valor}::numeric,
                "documentoUrl" = ${documentoUrl},
                "observacoes" = ${observacoes},
                "updatedAt" = NOW()
              WHERE id = ${existente.id} AND "companyId" = ${input.companyId}
            `);
            atualizados++;
          } else {
            await db.execute(sql`
              INSERT INTO pj_conformidade
                ("companyId","employeeId","tipo","competencia","status","dataVencimento","dataEnvio","valor","documentoUrl","observacoes")
              VALUES
                (${input.companyId}, ${employeeId}, ${tipo}, ${competencia}, ${status},
                 ${dataVencimento}::date, ${dataEnvio}::date, ${valor}::numeric, ${documentoUrl}, ${observacoes})
            `);
            inseridos++;
          }
        } catch (e: any) {
          erros.push({ linha: linhaNum, mensagem: e?.message || "Erro desconhecido" });
        }
      }

      return { totalLinhas: linhas.length, inseridos, atualizados, erros };
    }),

  uploadArquivo: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      employeeId: z.number(),
      tipo: z.enum(TIPOS_VALIDOS),
      fileName: z.string().min(1).max(255),
      contentType: z.string().default("application/octet-stream"),
      fileBase64: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      await assertUserCanAccessCompany(ctx, db, input.companyId);
      await assertEmployeeInCompany(db, input.employeeId, input.companyId);

      const buf = Buffer.from(input.fileBase64, "base64");
      const MAX = 15 * 1024 * 1024;
      if (buf.length > MAX) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Arquivo maior que 15 MB" });
      }
      const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
      const ts = Date.now();
      const key = `pj-conformidade/${input.companyId}/${input.employeeId}/${input.tipo}/${ts}-${safeName}`;
      const result = await storagePut(key, buf, input.contentType);
      return { url: result.url, key: result.key, fileName: input.fileName };
    }),

  // ========= DASHBOARD AGREGADO =========

  dashboard: protectedProcedure
    .input(z.object({ companyId: z.number(), mesReferencia: z.string().regex(/^\d{4}-\d{2}$/).optional() }))
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;
      await assertUserCanAccessCompany(ctx, db, input.companyId);
      const mesRef = input.mesReferencia || competenciaAtual();

      const empsRes: any = await db.execute(sql`
        SELECT DISTINCT e.id, e."nomeCompleto", e."cpf", e."funcao"
        FROM employees e
        INNER JOIN pj_contracts pc ON pc."employeeId" = e.id
          AND pc."deletedAt" IS NULL
          AND pc."companyId" = ${input.companyId}
          AND pc."status" IN ('ativo','pendente_assinatura','suspenso')
        WHERE e."companyId" = ${input.companyId}
          AND e."deletedAt" IS NULL
          AND e."status" NOT IN ('Desligado','Lista_Negra','Inativo')
      `);
      const emps: any[] = empsRes?.rows ?? [];
      const empIds = emps.map((e) => e.id);

      let itens: any[] = [];
      if (empIds.length > 0) {
        const r: any = await db.execute(sql`
          SELECT * FROM pj_conformidade
          WHERE "deletedAt" IS NULL
            AND "companyId" = ${input.companyId}
            AND "employeeId" = ANY(${empIds}::int[])
            AND (
              ("tipo" IN ('das','nf') AND "competencia" = ${mesRef})
              OR "tipo" IN ('cnd','seguro_vida','status_cnpj')
            )
        `);
        itens = r?.rows ?? [];
      }

      const todayDate = new Date();
      const today = todayDate.toISOString().slice(0, 10);

      const porTipo: Record<string, { ok: number; pendente: number; vencido: number; na: number; venceEmBreve: number }> = {};
      for (const t of TIPOS_VALIDOS) porTipo[t] = { ok: 0, pendente: 0, vencido: 0, na: 0, venceEmBreve: 0 };

      const porPj: { id: number; nome: string; cpf: string; funcao: string; ok: number; pendente: number; vencido: number; venceEmBreve: number }[] = [];

      let okTotal = 0, pendenteTotal = 0, vencidoTotal = 0, naTotal = 0, venceEmBreveTotal = 0;

      for (const e of emps) {
        const empAgg = { id: e.id, nome: e.nomeCompleto, cpf: e.cpf || "", funcao: e.funcao || "", ok: 0, pendente: 0, vencido: 0, venceEmBreve: 0 };
        for (const tipo of TIPOS_VALIDOS) {
          let it: any;
          if (TIPOS_MENSAIS.has(tipo)) {
            it = itens.find((x) => x.employeeId === e.id && x.tipo === tipo && x.competencia === mesRef);
          } else {
            it = itens.filter((x) => x.employeeId === e.id && x.tipo === tipo).sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1))[0];
          }
          let status: "ok" | "pendente" | "vencido" | "na" = "pendente";
          let venceEmBreve = false;
          if (!it) {
            status = "pendente";
          } else if (it.status === "na") {
            status = "na";
          } else if (it.status === "ok") {
            status = "ok";
            if (!TIPOS_MENSAIS.has(tipo) && it.dataVencimento) {
              if (it.dataVencimento < today) status = "vencido";
              else {
                const dv = new Date(String(it.dataVencimento).slice(0, 10) + "T00:00:00Z");
                const dias = Math.round((dv.getTime() - todayDate.getTime()) / 86400000);
                if (dias <= 30) venceEmBreve = true;
              }
            }
          } else if (it.status === "vencido") {
            status = "vencido";
          } else {
            status = "pendente";
          }

          porTipo[tipo][status]++;
          if (venceEmBreve) porTipo[tipo].venceEmBreve++;

          if (status === "ok") { okTotal++; empAgg.ok++; }
          else if (status === "pendente") { pendenteTotal++; empAgg.pendente++; }
          else if (status === "vencido") { vencidoTotal++; empAgg.vencido++; }
          else if (status === "na") { naTotal++; }
          if (venceEmBreve) { venceEmBreveTotal++; empAgg.venceEmBreve++; }
        }
        porPj.push(empAgg);
      }

      const totalChecks = okTotal + pendenteTotal + vencidoTotal;
      const scoreConformidade = totalChecks === 0 ? 100 : Math.round((okTotal / totalChecks) * 1000) / 10;

      const piores = [...porPj]
        .filter((p) => p.pendente + p.vencido > 0)
        .sort((a, b) => (b.vencido * 2 + b.pendente) - (a.vencido * 2 + a.pendente))
        .slice(0, 10);

      return {
        mesReferencia: mesRef,
        totalPjs: emps.length,
        totalChecks,
        ok: okTotal,
        pendente: pendenteTotal,
        vencido: vencidoTotal,
        na: naTotal,
        venceEmBreve: venceEmBreveTotal,
        scoreConformidade,
        porTipo,
        piores,
      };
    }),

  notificarManual: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      // Apenas admin_master pode disparar manualmente notificações em massa
      const user = ctx?.user;
      if (user?.role !== 'admin_master') {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas admin master pode disparar notificações manualmente" });
      }
      const r = await rodarVerificacaoConformidadePJ({ force: true });
      return r;
    }),
});
