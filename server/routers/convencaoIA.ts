import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { assertAiModuleEnabled } from "../_core/aiConfig";
import {
  convencaoAnalises,
  convencaoAnaliseItens,
  dissidios,
  dissidioFuncionarios,
  employees,
} from "../../drizzle/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { companyFilter } from "../companyHelper";
import { parseBRL } from "../utils/parseBRL";
import { storagePut } from "../storage";
import { invokeAnthropicVision, invokeGeminiVision } from "../_core/llm";

// ============================================================
// CONVENÇÃO COLETIVA COM IA (Rev. 2551)
// ------------------------------------------------------------
// Fluxo: upload do PDF da CCT/circular → IA extrai TODAS as mudanças
// (reajuste, piso, benefícios, adicionais, datas, sindicato, nº CCT) →
// relatório/diff revisável → aplicação em massa (salário via motor de
// dissídio + benefícios via colunas do funcionário) com auditoria por
// funcionário/campo na tabela convencao_analise_itens.
//
// Fundamentação: Art. 611/611-A/614/616 CLT, Art. 468 CLT (não-regressão).
// R-001/R-007/R-010: NUNCA ALTER/DROP/DELETE destrutivo em produção.
// ============================================================

// Campos de benefício que possuem coluna correspondente em `employees` e que
// são aplicados em massa. `salario` é tratado à parte (via motor de dissídio).
export const BENEFIT_FIELDS = [
  { key: "va", label: "Vale Alimentação", empCol: "vaValor" as const, cctKey: "valeAlimentacao" as const },
  { key: "vr", label: "Vale Refeição", empCol: "vrBeneficio" as const, cctKey: "valeRefeicao" as const },
  { key: "vt", label: "Vale Transporte", empCol: "vtValorDiario" as const, cctKey: "valeTransporte" as const },
  { key: "seguroVida", label: "Seguro de Vida", empCol: "seguroVida" as const, cctKey: "seguroVida" as const },
  { key: "auxFarmacia", label: "Auxílio Farmácia", empCol: "auxFarmaciaValor" as const, cctKey: "auxilioFarmacia" as const },
] as const;

type Extracao = {
  percentualReajuste?: string;
  pisoSalarial?: string;
  pisoSalarialAnterior?: string;
  dataBase?: string;
  mesDataBase?: number;
  vigenciaInicio?: string;
  vigenciaFim?: string;
  dataRetroativoInicio?: string;
  sindicato?: string;
  cnpjSindicato?: string;
  numeroCct?: string;
  valeAlimentacao?: string;
  valeRefeicao?: string;
  valeTransporte?: string;
  cestaBasica?: string;
  auxilioFarmacia?: string;
  seguroVida?: string;
  adicionalInsalubridade?: string;
  adicionalPericulosidade?: string;
  adicionalNoturno?: string;
  horaExtraDiurna?: string;
  horaExtraNoturna?: string;
  horaExtraDomingo?: string;
  contribuicaoAssistencial?: string;
  observacoes?: string;
};

const EXTRACT_SYSTEM_PROMPT = `Você é um especialista em direito trabalhista brasileiro (CLT) e em Convenções Coletivas de Trabalho (CCT). Analise o documento PDF de CCT/circular sindical e extraia TODAS as mudanças/valores relevantes.

REGRAS DE SAÍDA:
- Responda APENAS com um objeto JSON válido (sem markdown, sem comentários, sem texto extra).
- Para valores monetários e percentuais retorne SOMENTE o número, sem "R$", sem "%", usando ponto como separador decimal (ex.: "1800.00", "5.5").
- Para datas use o formato YYYY-MM-DD.
- "mesDataBase" é o número do mês da data-base (1-12).
- Se um campo não constar no documento, retorne string vazia "" (ou 0 para mesDataBase).`;

const EXTRACT_USER_PROMPT = `Extraia os seguintes campos desta Convenção Coletiva e retorne em JSON com EXATAMENTE estas chaves:
{
  "percentualReajuste": "", "pisoSalarial": "", "pisoSalarialAnterior": "",
  "dataBase": "", "mesDataBase": 0, "vigenciaInicio": "", "vigenciaFim": "", "dataRetroativoInicio": "",
  "sindicato": "", "cnpjSindicato": "", "numeroCct": "",
  "valeAlimentacao": "", "valeRefeicao": "", "valeTransporte": "", "cestaBasica": "", "auxilioFarmacia": "", "seguroVida": "",
  "adicionalInsalubridade": "", "adicionalPericulosidade": "", "adicionalNoturno": "",
  "horaExtraDiurna": "", "horaExtraNoturna": "", "horaExtraDomingo": "",
  "contribuicaoAssistencial": "", "observacoes": ""
}`;

const GEMINI_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    percentualReajuste: { type: "string" }, pisoSalarial: { type: "string" }, pisoSalarialAnterior: { type: "string" },
    dataBase: { type: "string" }, mesDataBase: { type: "integer" }, vigenciaInicio: { type: "string" }, vigenciaFim: { type: "string" }, dataRetroativoInicio: { type: "string" },
    sindicato: { type: "string" }, cnpjSindicato: { type: "string" }, numeroCct: { type: "string" },
    valeAlimentacao: { type: "string" }, valeRefeicao: { type: "string" }, valeTransporte: { type: "string" }, cestaBasica: { type: "string" }, auxilioFarmacia: { type: "string" }, seguroVida: { type: "string" },
    adicionalInsalubridade: { type: "string" }, adicionalPericulosidade: { type: "string" }, adicionalNoturno: { type: "string" },
    horaExtraDiurna: { type: "string" }, horaExtraNoturna: { type: "string" }, horaExtraDomingo: { type: "string" },
    contribuicaoAssistencial: { type: "string" }, observacoes: { type: "string" },
  },
} as const;

function parseJsonLoose(raw: string): Extracao {
  let txt = (raw || "").trim();
  // Remove cercas de código markdown se houver
  txt = txt.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  // Recorta do primeiro { ao último } pra tolerar texto extra
  const first = txt.indexOf("{");
  const last = txt.lastIndexOf("}");
  if (first >= 0 && last > first) txt = txt.slice(first, last + 1);
  return JSON.parse(txt) as Extracao;
}

async function extrairCctComIA(base64: string, mimeType: string): Promise<Extracao> {
  const erros: string[] = [];

  // 1) Claude (prioridade). O helper lança "Anthropic não configurado" se
  //    a chave não existir — nesse caso seguimos pro fallback Gemini.
  try {
    const out = await invokeAnthropicVision({
      prompt: EXTRACT_USER_PROMPT,
      base64,
      mimeType,
      systemPrompt: EXTRACT_SYSTEM_PROMPT,
      maxTokens: 2048,
    });
    return parseJsonLoose(out);
  } catch (e: any) {
    erros.push(`Claude: ${e?.message ?? e}`);
  }

  // 2) Gemini (fallback) — JSON mode estruturado
  if (process.env.GOOGLE_API_KEY) {
    try {
      const out = await invokeGeminiVision({
        prompt: `${EXTRACT_SYSTEM_PROMPT}\n\n${EXTRACT_USER_PROMPT}`,
        base64,
        mimeType,
        responseSchema: GEMINI_RESPONSE_SCHEMA as unknown as Record<string, unknown>,
        maxTokens: 4096,
      });
      return parseJsonLoose(out);
    } catch (e: any) {
      erros.push(`Gemini: ${e?.message ?? e}`);
    }
  }

  if (erros.length === 0) {
    throw new Error("Nenhuma IA configurada (Claude/Gemini). Configure ANTHROPIC ou GOOGLE_API_KEY.");
  }
  throw new Error(`Falha ao processar o PDF com IA. ${erros.join(" | ")}`);
}

function num(v: string | null | undefined): number {
  if (v == null || v === "") return 0;
  const n = parseBRL(String(v));
  return isNaN(n) ? 0 : n;
}

function hasValue(v: string | null | undefined): boolean {
  return v != null && String(v).trim() !== "" && num(v) > 0;
}

// Campos numéricos monetários/percentuais que devem ser normalizados após extração da IA.
// O LLM às vezes retorna "2.302,75" ou "2.302.75" mesmo com o prompt instruindo ponto decimal.
// parseBRL("2.302.75") → 230275 (bug: múltiplos pontos = milhar BR).
// Solução: parseBRL → número → toFixed(2), garantindo formato US limpo.
const NUMERIC_FIELDS: (keyof Extracao)[] = [
  "percentualReajuste", "pisoSalarial", "pisoSalarialAnterior",
  "valeAlimentacao", "valeRefeicao", "valeTransporte", "cestaBasica",
  "auxilioFarmacia", "seguroVida", "adicionalInsalubridade",
  "adicionalPericulosidade", "adicionalNoturno",
  "horaExtraDiurna", "horaExtraNoturna", "horaExtraDomingo",
  "contribuicaoAssistencial",
];

function sanitizarExtracao(e: Extracao): Extracao {
  const out = { ...e };
  for (const k of NUMERIC_FIELDS) {
    const raw = (out as any)[k];
    if (raw == null || raw === "") continue;
    const n = parseBRL(String(raw));
    if (!isNaN(n) && n > 0) {
      (out as any)[k] = n.toFixed(2);
    }
  }
  return out;
}

export const convencaoIARouter = router({
  // ── Histórico de análises por empresa (ano desc) ──────────────────────────
  listar: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      return db.select().from(convencaoAnalises)
        .where(companyFilter(convencaoAnalises.companyId, input))
        .orderBy(desc(convencaoAnalises.anoReferencia), desc(convencaoAnalises.createdAt));
    }),

  // ── Detalhe de uma análise ────────────────────────────────────────────────
  buscarPorId: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const [a] = await db.select().from(convencaoAnalises).where(eq(convencaoAnalises.id, input.id));
      if (!a) throw new TRPCError({ code: "NOT_FOUND", message: "Análise não encontrada" });
      const itens = await db.select().from(convencaoAnaliseItens)
        .where(eq(convencaoAnaliseItens.analiseId, input.id));
      const extracao: Extracao = a.extracaoRevisadaJson
        ? JSON.parse(a.extracaoRevisadaJson)
        : (a.extracaoBrutaJson ? JSON.parse(a.extracaoBrutaJson) : {});
      return { ...a, extracao, itens };
    }),

  // ── Processar PDF com IA → cria análise ───────────────────────────────────
  processarPdf: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      anoReferencia: z.number(),
      fileBase64: z.string().min(1),
      fileName: z.string().min(1),
      mimeType: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertAiModuleEnabled(input.companyId, "rh");
      const db = (await getDb())!;

      const mimeType = input.mimeType || "application/pdf";
      const buffer = Buffer.from(input.fileBase64, "base64");
      if (buffer.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Arquivo vazio" });
      // ~20MB de limite pra evitar estouro de payload na IA
      if (buffer.length > 20 * 1024 * 1024) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "PDF muito grande (máx. 20MB). Reduza o arquivo e tente novamente." });
      }

      const suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const ext = (input.fileName.split(".").pop() || "pdf").toLowerCase();
      const key = `convencao-ia/${input.companyId}/${input.anoReferencia}-${suffix}.${ext}`;
      let documentoUrl = "";
      try {
        const up = await storagePut(key, buffer, mimeType);
        documentoUrl = up.url;
      } catch (e: any) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Falha ao armazenar o documento: ${e?.message ?? e}` });
      }

      let extracao: Extracao;
      try {
        extracao = sanitizarExtracao(await extrairCctComIA(input.fileBase64, mimeType));
      } catch (e: any) {
        // Persiste a análise com status de erro (sem fallback silencioso)
        const [errRow] = await db.insert(convencaoAnalises).values({
          companyId: input.companyId,
          anoReferencia: input.anoReferencia,
          documentoUrl,
          documentoNome: input.fileName,
          status: "erro",
          erroMensagem: String(e?.message ?? e).slice(0, 1000),
          criadoPor: ctx.user.name || "Sistema",
          criadoPorUserId: (ctx.user as any).id ?? null,
        }).returning({ id: convencaoAnalises.id });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `${e?.message ?? e}`, cause: errRow?.id });
      }

      const brutoJson = JSON.stringify(extracao);
      const [row] = await db.insert(convencaoAnalises).values({
        companyId: input.companyId,
        anoReferencia: input.anoReferencia,
        documentoUrl,
        documentoNome: input.fileName,
        extracaoBrutaJson: brutoJson,
        extracaoRevisadaJson: brutoJson,
        status: "analisado",
        sindicato: extracao.sindicato || null,
        numeroCct: extracao.numeroCct || null,
        percentualReajuste: extracao.percentualReajuste || null,
        pisoSalarial: extracao.pisoSalarial || null,
        criadoPor: ctx.user.name || "Sistema",
        criadoPorUserId: (ctx.user as any).id ?? null,
      }).returning({ id: convencaoAnalises.id });

      return { success: true, id: row.id, extracao };
    }),

  // ── Salvar ajustes do relatório (revisão antes de aplicar) ────────────────
  atualizarExtracao: protectedProcedure
    .input(z.object({ id: z.number(), extracao: z.record(z.any()) }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const [a] = await db.select().from(convencaoAnalises).where(eq(convencaoAnalises.id, input.id));
      if (!a) throw new TRPCError({ code: "NOT_FOUND" });
      if (a.status === "aplicado") throw new TRPCError({ code: "BAD_REQUEST", message: "Análise já aplicada — não pode ser editada." });
      const ex = input.extracao as Extracao;
      await db.update(convencaoAnalises).set({
        extracaoRevisadaJson: JSON.stringify(ex),
        sindicato: ex.sindicato || null,
        numeroCct: ex.numeroCct || null,
        percentualReajuste: ex.percentualReajuste || null,
        pisoSalarial: ex.pisoSalarial || null,
        updatedAt: new Date().toISOString(),
      }).where(eq(convencaoAnalises.id, input.id));
      return { success: true };
    }),

  // ── Simulação por funcionário (antes/depois de salário + benefícios) ──────
  simular: protectedProcedure
    .input(z.object({ analiseId: z.number(), companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const [a] = await db.select().from(convencaoAnalises).where(eq(convencaoAnalises.id, input.analiseId));
      if (!a) throw new TRPCError({ code: "NOT_FOUND" });
      const extracao: Extracao = a.extracaoRevisadaJson
        ? JSON.parse(a.extracaoRevisadaJson)
        : (a.extracaoBrutaJson ? JSON.parse(a.extracaoBrutaJson) : {});

      const percentual = num(extracao.percentualReajuste);
      const pisoNovo = num(extracao.pisoSalarial);

      // Funcionários ativos não-PJ
      const funcs = await db.select().from(employees)
        .where(and(
          companyFilter(employees.companyId, input),
          sql`${employees.status} = 'Ativo'`,
          sql`${employees.tipoContrato} != 'PJ'`,
        ));

      // Meses retroativos (a partir da data informada na extração)
      let mesesRetro = 0;
      if (extracao.dataRetroativoInicio) {
        const inicio = new Date(extracao.dataRetroativoInicio + "T00:00:00");
        if (!isNaN(inicio.getTime())) {
          const agora = new Date();
          mesesRetro = Math.max(0, (agora.getFullYear() - inicio.getFullYear()) * 12 + (agora.getMonth() - inicio.getMonth()));
        }
      }

      // Verificar se já existe dissídio cadastrado para o ano da análise
      const [dissidioExistente] = await db.select({
        id: dissidios.id,
        anoReferencia: dissidios.anoReferencia,
        percentualReajuste: dissidios.percentualReajuste,
        status: dissidios.status,
        aplicadoPor: dissidios.aplicadoPor,
        dataAplicacao: dissidios.dataAplicacao,
      }).from(dissidios)
        .where(and(eq(dissidios.companyId, input.companyId), eq(dissidios.anoReferencia, a.anoReferencia)))
        .limit(1);

      const beneficiosCct = BENEFIT_FIELDS.map(b => ({
        key: b.key,
        label: b.label,
        valorNovo: (extracao as any)[b.cctKey] as string | undefined,
        aplicavel: hasValue((extracao as any)[b.cctKey]),
      }));

      const simulacao = funcs.map((f: any) => {
        const salarioAtual = num(f.salarioBase);
        let salarioNovo = salarioAtual;
        if (percentual > 0) salarioNovo = salarioAtual * (1 + percentual / 100);
        if (pisoNovo > 0 && salarioNovo < pisoNovo) salarioNovo = pisoNovo;
        const diferenca = salarioNovo - salarioAtual;
        const valorRetroativo = diferenca * mesesRetro;

        const beneficios = BENEFIT_FIELDS.map(b => {
          const atual = f[b.empCol] as string | null;
          const novoStr = (extracao as any)[b.cctKey] as string | undefined;
          const aplicavel = hasValue(novoStr);
          return {
            key: b.key,
            label: b.label,
            atual: atual ?? "",
            novo: aplicavel ? num(novoStr).toFixed(2) : "",
            muda: aplicavel && num(novoStr) !== num(atual),
            aplicavel,
          };
        });

        return {
          employeeId: f.id,
          nome: f.nomeCompleto,
          funcao: f.funcao,
          salarioAtual: salarioAtual.toFixed(2),
          salarioNovo: salarioNovo.toFixed(2),
          diferenca: diferenca.toFixed(2),
          mesesRetroativos: mesesRetro,
          valorRetroativo: valorRetroativo.toFixed(2),
          salarioMuda: diferenca !== 0,
          beneficios,
        };
      });

      const totalDiferencaMensal = simulacao.reduce((acc, s) => acc + parseFloat(s.diferenca), 0);
      const totalRetroativo = simulacao.reduce((acc, s) => acc + parseFloat(s.valorRetroativo), 0);

      return {
        analise: a,
        extracao,
        percentualReajuste: percentual,
        pisoNovo: pisoNovo.toFixed(2),
        mesesRetroativos: mesesRetro,
        beneficiosCct,
        simulacao,
        dissidioExistente: dissidioExistente ?? null,
        resumo: {
          totalFuncionarios: simulacao.length,
          totalDiferencaMensal: totalDiferencaMensal.toFixed(2),
          totalRetroativo: totalRetroativo.toFixed(2),
          custoTotalEstimado: (totalDiferencaMensal + totalRetroativo).toFixed(2),
        },
      };
    }),

  // ── Aplicação em massa (salário via dissídio + benefícios) ────────────────
  aplicar: protectedProcedure
    .input(z.object({
      analiseId: z.number(),
      companyId: z.number(),
      companyIds: z.array(z.number()).optional(),
      funcionariosExcluidos: z.array(z.number()).optional(),
      camposExcluidos: z.array(z.string()).optional(), // ex.: ["salario","va"]
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin_master") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas Admin Master pode aplicar a convenção." });
      }
      const db = (await getDb())!;

      const [a] = await db.select().from(convencaoAnalises).where(eq(convencaoAnalises.id, input.analiseId));
      if (!a) throw new TRPCError({ code: "NOT_FOUND" });
      if (a.status === "aplicado") throw new TRPCError({ code: "BAD_REQUEST", message: "Esta análise já foi aplicada." });
      if (a.status === "erro") throw new TRPCError({ code: "BAD_REQUEST", message: "Esta análise está em erro — reprocesse o PDF." });

      const extracao: Extracao = a.extracaoRevisadaJson
        ? JSON.parse(a.extracaoRevisadaJson)
        : (a.extracaoBrutaJson ? JSON.parse(a.extracaoBrutaJson) : {});

      const excluidos = new Set(input.funcionariosExcluidos || []);
      const camposExcluidos = new Set(input.camposExcluidos || []);
      const aplicarSalario = !camposExcluidos.has("salario");

      const percentual = num(extracao.percentualReajuste);
      const pisoNovo = num(extracao.pisoSalarial);

      // Meses retroativos
      let mesesRetro = 0;
      if (extracao.dataRetroativoInicio) {
        const inicio = new Date(extracao.dataRetroativoInicio + "T00:00:00");
        if (!isNaN(inicio.getTime())) {
          const agora = new Date();
          mesesRetro = Math.max(0, (agora.getFullYear() - inicio.getFullYear()) * 12 + (agora.getMonth() - inicio.getMonth()));
        }
      }

      // ── Dissídio do ano (cria se não existir) — salário usa o motor existente ──
      let dissidioId: number | null = a.dissidioId ?? null;
      if (aplicarSalario && percentual > 0) {
        const [dissExistente] = await db.select().from(dissidios)
          .where(and(eq(dissidios.companyId, input.companyId), eq(dissidios.anoReferencia, a.anoReferencia)));

        if (!dissExistente) {
          // Regra de não-regressão (Art. 468 CLT)
          const [anterior] = await db.select().from(dissidios)
            .where(and(
              eq(dissidios.companyId, input.companyId),
              sql`${dissidios.anoReferencia} < ${a.anoReferencia}`,
              sql`${dissidios.status} != 'cancelado'`,
            ))
            .orderBy(desc(dissidios.anoReferencia))
            .limit(1);
          if (anterior) {
            const pctAnt = parseFloat(anterior.percentualReajuste);
            if (percentual < pctAnt) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: `Percentual (${percentual}%) menor que o ano anterior (${anterior.anoReferencia}: ${pctAnt}%). Art. 468 CLT — vedada alteração lesiva.`,
              });
            }
          }
          const mesBase = extracao.mesDataBase && extracao.mesDataBase >= 1 && extracao.mesDataBase <= 12
            ? extracao.mesDataBase : 5;
          const vigInicio = extracao.vigenciaInicio || `${a.anoReferencia}-${String(mesBase).padStart(2, "0")}-01`;
          const [novoDiss] = await db.insert(dissidios).values({
            companyId: input.companyId,
            anoReferencia: a.anoReferencia,
            titulo: `Convenção Coletiva ${a.anoReferencia} (IA)`,
            sindicato: extracao.sindicato || null,
            numeroCct: extracao.numeroCct || null,
            mesDataBase: mesBase,
            dataBaseInicio: vigInicio,
            dataBaseFim: extracao.vigenciaFim || vigInicio,
            percentualReajuste: String(percentual),
            pisoSalarial: extracao.pisoSalarial || null,
            pisoSalarialAnterior: extracao.pisoSalarialAnterior || null,
            valorSeguroVida: extracao.seguroVida || null,
            contribuicaoAssistencial: extracao.contribuicaoAssistencial || null,
            retroativo: mesesRetro > 0 ? 1 : 0,
            dataRetroativoInicio: extracao.dataRetroativoInicio || null,
            status: "aplicado",
            dataAplicacao: new Date().toISOString().split("T")[0],
            aplicadoPor: ctx.user.name || "Sistema",
            criadoPor: ctx.user.name || "Sistema",
          }).returning({ id: dissidios.id });
          dissidioId = novoDiss.id;
        } else {
          dissidioId = dissExistente.id;
        }
      }

      // ── Loop de aplicação por funcionário ──
      const funcs = await db.select().from(employees)
        .where(and(
          companyFilter(employees.companyId, input),
          sql`${employees.status} = 'Ativo'`,
          sql`${employees.tipoContrato} != 'PJ'`,
        ));

      const nowIso = new Date().toISOString();
      let funcionariosAplicados = 0;
      let camposAplicados = 0;

      for (const f of funcs as any[]) {
        if (excluidos.has(f.id)) continue;
        let tocou = false;
        const empUpdate: Record<string, any> = {};

        // Salário (via dissídio)
        if (aplicarSalario && percentual > 0 && dissidioId) {
          const salarioAtual = num(f.salarioBase);
          let salarioNovo = salarioAtual * (1 + percentual / 100);
          if (pisoNovo > 0 && salarioNovo < pisoNovo) salarioNovo = pisoNovo;
          if (salarioNovo !== salarioAtual) {
            const diferenca = salarioNovo - salarioAtual;
            const valorRetroativo = diferenca * mesesRetro;
            const pctReal = salarioAtual > 0 ? ((salarioNovo - salarioAtual) / salarioAtual * 100) : 0;
            await db.insert(dissidioFuncionarios).values({
              dissidioId,
              employeeId: f.id,
              companyId: input.companyId,
              salarioAnterior: salarioAtual.toFixed(2),
              salarioNovo: salarioNovo.toFixed(2),
              percentualAplicado: pctReal.toFixed(2),
              diferencaValor: diferenca.toFixed(2),
              mesesRetroativos: mesesRetro,
              valorRetroativo: valorRetroativo.toFixed(2),
              status: "aplicado",
              aplicadoEm: nowIso,
            });
            empUpdate.salarioBase = salarioNovo.toFixed(2);
            empUpdate.valorHora = (salarioNovo / 220).toFixed(2);
            await db.insert(convencaoAnaliseItens).values({
              analiseId: input.analiseId,
              companyId: input.companyId,
              employeeId: f.id,
              campo: "salario",
              valorAnterior: salarioAtual.toFixed(2),
              valorNovo: salarioNovo.toFixed(2),
              aplicadoEm: nowIso,
            });
            camposAplicados++;
            tocou = true;
          }
        }

        // Benefícios
        for (const b of BENEFIT_FIELDS) {
          if (camposExcluidos.has(b.key)) continue;
          const novoStr = (extracao as any)[b.cctKey] as string | undefined;
          if (!hasValue(novoStr)) continue;
          const valorAtual = f[b.empCol] as string | null;
          const novoVal = num(novoStr).toFixed(2);
          if (num(valorAtual) === num(novoVal)) continue;
          empUpdate[b.empCol] = novoVal;
          await db.insert(convencaoAnaliseItens).values({
            analiseId: input.analiseId,
            companyId: input.companyId,
            employeeId: f.id,
            campo: b.key,
            valorAnterior: valorAtual ?? "",
            valorNovo: novoVal,
            aplicadoEm: nowIso,
          });
          camposAplicados++;
          tocou = true;
        }

        if (Object.keys(empUpdate).length > 0) {
          await db.update(employees).set(empUpdate).where(eq(employees.id, f.id));
        }
        if (tocou) funcionariosAplicados++;
      }

      // Marca a análise como aplicada (imutável)
      await db.update(convencaoAnalises).set({
        status: "aplicado",
        dissidioId: dissidioId ?? null,
        aplicadoPor: ctx.user.name || "Sistema",
        aplicadoEm: nowIso,
        updatedAt: nowIso,
      }).where(eq(convencaoAnalises.id, input.analiseId));

      return {
        success: true,
        funcionariosAplicados,
        camposAplicados,
        totalFuncionarios: funcs.length,
        dissidioId,
      };
    }),

  // ── Excluir análise (não aplicada) ────────────────────────────────────────
  excluir: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin_master") throw new TRPCError({ code: "FORBIDDEN" });
      const db = (await getDb())!;
      const [a] = await db.select().from(convencaoAnalises).where(eq(convencaoAnalises.id, input.id));
      if (!a) throw new TRPCError({ code: "NOT_FOUND" });
      if (a.status === "aplicado") throw new TRPCError({ code: "BAD_REQUEST", message: "Não é possível excluir uma análise já aplicada." });
      await db.delete(convencaoAnaliseItens).where(eq(convencaoAnaliseItens.analiseId, input.id));
      await db.delete(convencaoAnalises).where(eq(convencaoAnalises.id, input.id));
      return { success: true };
    }),
});
