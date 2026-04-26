import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { resolveCompanyIds } from "../companyHelper";

// Normaliza nome para comparação: maiúsculo, sem acento, sem espaços extras
function normalizeName(name: string): string {
  return name
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Similaridade simples por tokens (palavras em comum / total)
function nameSimilarity(a: string, b: string): number {
  const na = normalizeName(a).split(" ");
  const nb = normalizeName(b).split(" ");
  const common = na.filter(w => nb.includes(w)).length;
  return common / Math.max(na.length, nb.length);
}

// Extrai lista de segurados de texto bruto (formato do PDF do corretor)
function parseNomesBrutos(texto: string): Array<{ item: string; nome: string }> {
  const linhas = texto.split("\n").map(l => l.trim()).filter(Boolean);
  const segurados: Array<{ item: string; nome: string }> = [];
  for (const linha of linhas) {
    const match = linha.match(/^(\d{5,12})\s{2,}([A-ZÁÀÃÂÉÊÍÓÔÕÚÜÇÑ][A-Za-záàãâéêíóôõúüçñ\s]+)/);
    if (match) {
      segurados.push({ item: match[1].replace(/^0+/, ""), nome: match[2].trim() });
    } else if (/^[A-ZÁÀÃÂÉÊÍÓÔÕÚÜÇÑ]/.test(linha) && linha.length > 5) {
      segurados.push({ item: "", nome: linha });
    }
  }
  return segurados;
}

// Lógica central de cruzamento — reutilizada em importarRelatorio e processarPdfLote
async function executarCruzamento(
  db: any,
  ids: number[],
  companyId: number,
  competencia: string,
  seguradosCorretora: Array<{ item: string; nome: string }>,
  nomesBrutos: string,
  apoliceVG: string | undefined,
  apoliceAPC: string | undefined,
  importadoPor: string,
) {
  const cltAtivos = await db.execute(sql`
    SELECT id, "nomeCompleto", "cargo", "funcao", "dataAdmissao"
    FROM employees
    WHERE "companyId" = ANY(${ids}) AND status = 'Ativo'
      AND (LOWER("tipoContrato") = 'clt' OR "tipoContrato" IS NULL)
      AND "deletedAt" IS NULL
  `) as any[];

  const coberturasAtivas = await db.execute(sql`
    SELECT id, employee_id, nome_completo, item_segurador, status
    FROM seguro_vida_coberturas
    WHERE company_id = ANY(${ids}) AND status IN ('ativo','pendente_inclusao')
  `) as any[];

  const THRESHOLD = 0.60;
  const nomesSeguradosNorm = seguradosCorretora.map(s => normalizeName(s.nome));

  const resultado: {
    status: "ok" | "sem_seguro" | "pagar_indevido" | "novo" | "na_lista_sem_cadastro";
    nome: string;
    item: string;
    employeeId?: number;
    nomeHR?: string;
    similaridade?: number;
    dataAdmissao?: string;
    coberturaId?: number;
  }[] = [];

  const idxUsados = new Set<number>();

  for (const emp of (Array.isArray(cltAtivos) ? cltAtivos : []) as any[]) {
    const nNorm = normalizeName(emp.nomeCompleto);
    let melhorIdx = -1;
    let melhorSim = 0;
    nomesSeguradosNorm.forEach((sn, i) => {
      const sim = nameSimilarity(nNorm, sn);
      if (sim > melhorSim) { melhorSim = sim; melhorIdx = i; }
    });

    const cobAtual = (Array.isArray(coberturasAtivas) ? coberturasAtivas : []).find((c: any) => c.employee_id === emp.id);
    const dataAdmissao = emp.dataAdmissao ? String(emp.dataAdmissao) : undefined;
    const isNovo = dataAdmissao && (new Date().getTime() - new Date(dataAdmissao).getTime()) < 45 * 86400000;

    if (melhorSim >= THRESHOLD && melhorIdx >= 0) {
      idxUsados.add(melhorIdx);
      resultado.push({ status: "ok", nome: emp.nomeCompleto, item: seguradosCorretora[melhorIdx].item, employeeId: emp.id, nomeHR: emp.nomeCompleto, similaridade: melhorSim, dataAdmissao, coberturaId: cobAtual?.id });
    } else if (isNovo) {
      resultado.push({ status: "novo", nome: emp.nomeCompleto, item: "", employeeId: emp.id, nomeHR: emp.nomeCompleto, dataAdmissao, coberturaId: cobAtual?.id });
    } else {
      resultado.push({ status: "sem_seguro", nome: emp.nomeCompleto, item: "", employeeId: emp.id, nomeHR: emp.nomeCompleto, dataAdmissao, coberturaId: cobAtual?.id });
    }
  }

  seguradosCorretora.forEach((s, i) => {
    if (idxUsados.has(i)) return;
    resultado.push({ status: "pagar_indevido", nome: s.nome, item: s.item });
  });

  const totalOk = resultado.filter(r => r.status === "ok").length;
  const totalSemSeguro = resultado.filter(r => r.status === "sem_seguro").length;
  const totalPagarIndevido = resultado.filter(r => r.status === "pagar_indevido").length;
  const totalNovos = resultado.filter(r => r.status === "novo").length;

  await db.execute(sql`
    INSERT INTO seguro_vida_importacoes
      (company_id, competencia, total_segurados, total_ativos, total_ok,
       total_sem_seguro, total_pagar_indevido, total_novos,
       json_resultado, relatorio_nomes, importado_por)
    VALUES
      (${companyId}, ${competencia},
       ${seguradosCorretora.length}, ${(Array.isArray(cltAtivos) ? cltAtivos : []).length},
       ${totalOk}, ${totalSemSeguro}, ${totalPagarIndevido}, ${totalNovos},
       ${JSON.stringify(resultado)}, ${nomesBrutos.substring(0, 5000)},
       ${importadoPor})
  `);

  return {
    competencia,
    totalSeguradosCorretora: seguradosCorretora.length,
    totalAtivosHR: (Array.isArray(cltAtivos) ? cltAtivos : []).length,
    totalOk,
    totalSemSeguro,
    totalPagarIndevido,
    totalNovos,
    resultado,
  };
}

export const seguroVidaRouter = router({

  getResumo: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const ids = resolveCompanyIds(input);

      const [{ totalAtivos }] = await db.execute(sql`
        SELECT COUNT(*) as "totalAtivos"
        FROM seguro_vida_coberturas
        WHERE company_id = ANY(${ids}) AND status = 'ativo'
      `) as any;

      const [{ totalPendInclusao }] = await db.execute(sql`
        SELECT COUNT(*) as "totalPendInclusao"
        FROM seguro_vida_coberturas
        WHERE company_id = ANY(${ids}) AND status = 'pendente_inclusao'
      `) as any;

      const [{ totalPendCancel }] = await db.execute(sql`
        SELECT COUNT(*) as "totalPendCancel"
        FROM seguro_vida_coberturas
        WHERE company_id = ANY(${ids}) AND status = 'pendente_cancelamento'
      `) as any;

      const cltAtivos = await db.execute(sql`
        SELECT e.id, e."nomeCompleto"
        FROM employees e
        WHERE e."companyId" = ANY(${ids})
          AND e.status = 'Ativo'
          AND (e."tipoContrato" = 'CLT' OR e."tipoContrato" IS NULL)
          AND e."deletedAt" IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM seguro_vida_coberturas s
            WHERE s.employee_id = e.id AND s.status IN ('ativo','pendente_inclusao')
          )
      `) as any;

      const semSeguro = Array.isArray(cltAtivos) ? cltAtivos.length : 0;

      const [ultimaImportacao] = await db.execute(sql`
        SELECT competencia, data_importacao, total_segurados, total_sem_seguro, total_pagar_indevido
        FROM seguro_vida_importacoes
        WHERE company_id = ANY(${ids})
        ORDER BY criado_em DESC
        LIMIT 1
      `) as any;

      return {
        totalSeguradosAtivos: Number(totalAtivos) || 0,
        totalPendenteInclusao: Number(totalPendInclusao) || 0,
        totalPendenteCancelamento: Number(totalPendCancel) || 0,
        totalSemSeguro: semSeguro,
        ultimaImportacao: ultimaImportacao || null,
      };
    }),

  listarCoberturas: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), status: z.string().optional() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const ids = resolveCompanyIds(input);

      const coberturas = await db.execute(sql`
        SELECT
          s.id, s.company_id, s.employee_id, s.nome_completo, s.item_segurador,
          s.apolice_vg, s.apolice_apc, s.status, s.data_adesao, s.data_cancelamento,
          s.motivo_cancelamento, s.observacoes, s.criado_em, s.atualizado_em, s.criado_por,
          e."cargo", e."funcao", e."dataAdmissao", e."dataDemissao"
        FROM seguro_vida_coberturas s
        LEFT JOIN employees e ON e.id = s.employee_id
        WHERE s.company_id = ANY(${ids})
          ${input.status ? sql`AND s.status = ${input.status}` : sql``}
        ORDER BY s.nome_completo
      `) as any;

      return Array.isArray(coberturas) ? coberturas : [];
    }),

  listarFuncionariosComStatus: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const ids = resolveCompanyIds(input);

      const funcionarios = await db.execute(sql`
        SELECT
          e.id, e."nomeCompleto", e."cargo", e."funcao", e."dataAdmissao",
          e."tipoContrato", e.status as emp_status,
          s.id as cobertura_id, s.status as seguro_status, s.item_segurador,
          s.apolice_vg, s.data_adesao, s.data_cancelamento, s.observacoes
        FROM employees e
        LEFT JOIN seguro_vida_coberturas s ON s.employee_id = e.id AND s.status IN ('ativo','pendente_inclusao','pendente_cancelamento')
        WHERE e."companyId" = ANY(${ids})
          AND e.status = 'Ativo'
          AND (e."tipoContrato" = 'CLT' OR e."tipoContrato" IS NULL)
          AND e."deletedAt" IS NULL
        ORDER BY e."nomeCompleto"
      `) as any;

      return Array.isArray(funcionarios) ? funcionarios : [];
    }),

  getCoberturaByEmployee: protectedProcedure
    .input(z.object({ companyId: z.number(), employeeId: z.number() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;

      const [cobertura] = await db.execute(sql`
        SELECT * FROM seguro_vida_coberturas
        WHERE company_id = ${input.companyId} AND employee_id = ${input.employeeId}
        ORDER BY criado_em DESC
        LIMIT 1
      `) as any;

      return cobertura || null;
    }),

  upsertCobertura: protectedProcedure
    .input(z.object({
      companyId:   z.number(),
      employeeId:  z.number().optional(),
      nomeCompleto: z.string().min(2),
      itemSegurador: z.string().optional(),
      apoliceVG:   z.string().optional(),
      apoliceAPC:  z.string().optional(),
      status:      z.enum(["ativo", "pendente_inclusao", "pendente_cancelamento", "cancelado"]),
      dataAdesao:  z.string().optional(),
      dataCancelamento: z.string().optional(),
      motivoCancelamento: z.string().optional(),
      observacoes: z.string().optional(),
      coberturaId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const agora = new Date().toISOString();

      if (input.coberturaId) {
        await db.execute(sql`
          UPDATE seguro_vida_coberturas SET
            nome_completo = ${input.nomeCompleto},
            item_segurador = ${input.itemSegurador ?? null},
            apolice_vg = ${input.apoliceVG ?? null},
            apolice_apc = ${input.apoliceAPC ?? null},
            status = ${input.status},
            data_adesao = ${input.dataAdesao ?? null},
            data_cancelamento = ${input.dataCancelamento ?? null},
            motivo_cancelamento = ${input.motivoCancelamento ?? null},
            observacoes = ${input.observacoes ?? null},
            atualizado_em = ${agora}
          WHERE id = ${input.coberturaId} AND company_id = ${input.companyId}
        `);
      } else {
        await db.execute(sql`
          INSERT INTO seguro_vida_coberturas
            (company_id, employee_id, nome_completo, item_segurador, apolice_vg, apolice_apc,
             status, data_adesao, data_cancelamento, motivo_cancelamento, observacoes, criado_por)
          VALUES
            (${input.companyId}, ${input.employeeId ?? null}, ${input.nomeCompleto},
             ${input.itemSegurador ?? null}, ${input.apoliceVG ?? null}, ${input.apoliceAPC ?? null},
             ${input.status}, ${input.dataAdesao ?? null}, ${input.dataCancelamento ?? null},
             ${input.motivoCancelamento ?? null}, ${input.observacoes ?? null}, ${ctx.user.name ?? ""})
        `);
      }

      return { success: true };
    }),

  cancelarCobertura: protectedProcedure
    .input(z.object({
      companyId: z.number(), coberturaId: z.number(),
      motivo: z.string().optional(), dataCancelamento: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const agora = new Date().toISOString();
      const hoje = new Date().toISOString().split("T")[0];
      await db.execute(sql`
        UPDATE seguro_vida_coberturas SET
          status = 'cancelado',
          data_cancelamento = ${input.dataCancelamento ?? hoje},
          motivo_cancelamento = ${input.motivo ?? null},
          cancelado_por = ${ctx.user.name ?? ""},
          atualizado_em = ${agora}
        WHERE id = ${input.coberturaId} AND company_id = ${input.companyId}
      `);
      return { success: true };
    }),

  importarRelatorio: protectedProcedure
    .input(z.object({
      companyId:     z.number(),
      companyIds:    z.array(z.number()).optional(),
      competencia:   z.string().regex(/^\d{4}-\d{2}$/),
      nomesBrutos:   z.string().min(10),
      apoliceVG:     z.string().optional(),
      apoliceAPC:    z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const ids = resolveCompanyIds(input);

      const seguradosCorretora = parseNomesBrutos(input.nomesBrutos);
      if (seguradosCorretora.length < 5) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Não foram encontrados segurados no texto. Verifique o formato e cole novamente." });
      }

      return executarCruzamento(db, ids, input.companyId, input.competencia, seguradosCorretora, input.nomesBrutos, input.apoliceVG, input.apoliceAPC, ctx.user.name ?? "");
    }),

  // ─── NOVO: Processar PDFs em lote (base64) ──────────────────────
  processarPdfLote: protectedProcedure
    .input(z.object({
      companyId:  z.number(),
      companyIds: z.array(z.number()).optional(),
      apoliceVG:  z.string().optional(),
      apoliceAPC: z.string().optional(),
      arquivos: z.array(z.object({
        competencia: z.string().regex(/^\d{4}-\d{2}$/),
        filename:    z.string(),
        fileBase64:  z.string(),
      })).min(1).max(24),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const ids = resolveCompanyIds(input);
      const { default: pdfParse } = await import("pdf-parse");

      const resultados = [];

      for (const arq of input.arquivos) {
        try {
          const buffer = Buffer.from(arq.fileBase64, "base64");
          const parsed = await pdfParse(buffer);
          const texto = parsed.text as string;

          const segurados = parseNomesBrutos(texto);
          if (segurados.length < 2) {
            resultados.push({
              competencia: arq.competencia,
              filename: arq.filename,
              erro: "Não foram encontrados segurados no PDF. Verifique se o arquivo é o relatório correto.",
            });
            continue;
          }

          const resultado = await executarCruzamento(
            db, ids, input.companyId, arq.competencia, segurados,
            texto, input.apoliceVG, input.apoliceAPC, ctx.user.name ?? ""
          );

          resultados.push({ filename: arq.filename, ...resultado });
        } catch (err: any) {
          resultados.push({
            competencia: arq.competencia,
            filename: arq.filename,
            erro: `Erro ao ler PDF: ${err.message}`,
          });
        }
      }

      return { resultados };
    }),

  listarImportacoes: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const ids = resolveCompanyIds(input);

      const rows = await db.execute(sql`
        SELECT id, competencia, data_importacao, total_segurados, total_ativos,
               total_ok, total_sem_seguro, total_pagar_indevido, total_novos,
               importado_por, criado_em
        FROM seguro_vida_importacoes
        WHERE company_id = ANY(${ids})
        ORDER BY criado_em DESC
        LIMIT 24
      `) as any;

      return Array.isArray(rows) ? rows : [];
    }),

  getImportacao: protectedProcedure
    .input(z.object({ companyId: z.number(), importacaoId: z.number() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;

      const [row] = await db.execute(sql`
        SELECT * FROM seguro_vida_importacoes
        WHERE id = ${input.importacaoId} AND company_id = ${input.companyId}
      `) as any;

      return row || null;
    }),

  seedFromRelatorio: protectedProcedure
    .input(z.object({
      companyId:   z.number(),
      companyIds:  z.array(z.number()).optional(),
      nomesBrutos: z.string().min(10),
      apoliceVG:   z.string().optional(),
      apoliceAPC:  z.string().optional(),
      dataAdesao:  z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin_master") throw new TRPCError({ code: "FORBIDDEN", message: "Apenas Admin Master" });
      const db = (await getDb())!;
      const ids = resolveCompanyIds(input);

      const segurados = parseNomesBrutos(input.nomesBrutos);
      if (segurados.length < 2) throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum segurado encontrado no texto" });

      const cltAtivos = await db.execute(sql`
        SELECT id, "nomeCompleto" FROM employees
        WHERE "companyId" = ANY(${ids}) AND status = 'Ativo' AND "deletedAt" IS NULL
      `) as any[];

      let inseridos = 0;
      for (const s of segurados) {
        let empId: number | null = null;
        let melhorSim = 0;
        for (const emp of (Array.isArray(cltAtivos) ? cltAtivos : []) as any[]) {
          const sim = nameSimilarity(s.nome, emp.nomeCompleto);
          if (sim > melhorSim) { melhorSim = sim; if (sim >= 0.65) empId = emp.id; }
        }

        const [existe] = await db.execute(sql`
          SELECT id FROM seguro_vida_coberturas
          WHERE company_id = ${input.companyId} AND nome_completo = ${s.nome} AND status = 'ativo'
        `) as any;
        if (existe) continue;

        await db.execute(sql`
          INSERT INTO seguro_vida_coberturas
            (company_id, employee_id, nome_completo, item_segurador, apolice_vg, apolice_apc, status, data_adesao, criado_por)
          VALUES
            (${input.companyId}, ${empId}, ${s.nome}, ${s.item || null},
             ${input.apoliceVG ?? null}, ${input.apoliceAPC ?? null},
             'ativo', ${input.dataAdesao ?? null}, ${ctx.user.name ?? ""})
        `);
        inseridos++;
      }

      return { inseridos, total: segurados.length };
    }),
});
