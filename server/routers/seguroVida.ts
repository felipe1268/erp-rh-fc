import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { sql, SQL } from "drizzle-orm";
import { resolveCompanyIds } from "../companyHelper";

// Helper: gera cláusula SQL de filtro por IDs de empresa compatível com Drizzle
// Drizzle não converte arrays JS para arrays PostgreSQL em ANY() — usa IN() parametrizado
function inIds(ids: number[]): SQL {
  if (ids.length === 1) return sql`= ${ids[0]}`;
  return sql`IN (${sql.join(ids.map(id => sql`${id}`), sql`, `)})`;
}

// Helper: extrai array de linhas do resultado de db.execute()
// Drizzle com node-postgres pode retornar QueryResult { rows: [] } ou array direto
function rows(result: any): any[] {
  if (Array.isArray(result)) return result;
  if (result?.rows && Array.isArray(result.rows)) return result.rows;
  return [];
}

// Stopwords ignoradas na comparação de nomes (conectores e artigos)
const NAME_STOPWORDS = new Set(["DE", "DA", "DO", "DOS", "DAS", "E", "A", "O", "EM", "NO", "NA"]);

// Normaliza nome: maiúsculo, sem acento, sem caracteres especiais, sem espaços duplos
function normalizeName(name: string): string {
  return name
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Distância de Levenshtein entre dois tokens — permite detectar variações ortográficas
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = temp;
    }
  }
  return dp[n];
}

// Verifica se dois tokens de nome são equivalentes (inclui tolerância a erros ortográficos)
function tokenMatch(ta: string, tb: string): boolean {
  if (ta === tb) return true;
  const maxLen = Math.max(ta.length, tb.length);
  if (maxLen <= 3) return false; // palavras curtas exigem match exato
  const dist = levenshtein(ta, tb);
  return dist <= Math.floor(maxLen * 0.25); // até 25% de diferença
}

// Similaridade de nomes com filtragem de stopwords e tolerância ortográfica.
// Retorna valor entre 0 e 1.
function nameSimilarity(a: string, b: string): number {
  const tokensA = normalizeName(a).split(" ").filter(w => w.length >= 3 && !NAME_STOPWORDS.has(w));
  const tokensB = normalizeName(b).split(" ").filter(w => w.length >= 3 && !NAME_STOPWORDS.has(w));
  if (!tokensA.length || !tokensB.length) return 0;

  let matched = 0;
  const usedB = new Set<number>();
  for (const ta of tokensA) {
    for (let j = 0; j < tokensB.length; j++) {
      if (!usedB.has(j) && tokenMatch(ta, tokensB[j])) {
        matched++;
        usedB.add(j);
        break;
      }
    }
  }

  // Score estrito: intersecção / maior lista (evita falsos positivos)
  const scoreStrict = matched / Math.max(tokensA.length, tokensB.length);
  // Score de cobertura: intersecção / menor lista (detecta nomes que são subconjunto)
  const scoreCoverage = matched / Math.min(tokensA.length, tokensB.length);

  // Se a menor lista está totalmente contida na maior → match forte
  if (scoreCoverage >= 1.0) return 1.0;
  // Média ponderada favorecendo o score estrito
  return scoreStrict * 0.6 + scoreCoverage * 0.4;
}

// Detecta competência (YYYY-MM) a partir do texto extraído do PDF
function detectarCompetenciaDoPdf(texto: string): string | null {
  const t = texto.toUpperCase();

  const MESES: Record<string, string> = {
    JANEIRO: "01", FEVEREIRO: "02", MARCO: "03", MARCO_ACC: "03",
    ABRIL: "04", MAIO: "05", JUNHO: "06",
    JULHO: "07", AGOSTO: "08", SETEMBRO: "09",
    OUTUBRO: "10", NOVEMBRO: "11", DEZEMBRO: "12",
  };

  // Remove acentos do texto para facilitar busca de meses
  const tSemAcento = t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // 1) "COMPETENCIA MM/YYYY" ou "REFERENCIA MM/YYYY" — ex: "Competência: 04/2026"
  {
    const m = tSemAcento.match(/(?:COMPETENCIA|REFERENCIA|PERIODO|VIGENCIA)[^0-9]{0,20}(\d{2})[\/\-](\d{4})/);
    if (m) {
      const mes = m[1].padStart(2, "0");
      const ano = m[2];
      if (Number(mes) >= 1 && Number(mes) <= 12 && Number(ano) >= 2020) return `${ano}-${mes}`;
    }
  }

  // 2) Nome do mês + ano — ex: "ABRIL/2026" ou "ABRIL DE 2026" ou "ABRIL 2026"
  {
    const nomesStr = Object.keys(MESES).join("|");
    const rx = new RegExp(`(${nomesStr})\\s*(?:DE\\s*)?(20\\d{2})`, "g");
    const rx2 = new RegExp(`(20\\d{2})\\s*[-/]?\\s*(${nomesStr})`, "g");
    let m: RegExpExecArray | null;
    while ((m = rx.exec(tSemAcento)) !== null) {
      const mesNome = m[1].replace("MARCO", "MARÇO");
      const mes = MESES[m[1]] ?? MESES[mesNome];
      const ano = m[2];
      if (mes && Number(ano) >= 2020) return `${ano}-${mes}`;
    }
    while ((m = rx2.exec(tSemAcento)) !== null) {
      const mes = MESES[m[2]];
      const ano = m[1];
      if (mes && Number(ano) >= 2020) return `${ano}-${mes}`;
    }
  }

  // 3) "MM/YYYY" isolado (sem prefixo) — ex: "04/2026"
  {
    const matches = [...tSemAcento.matchAll(/\b(\d{2})\/(20\d{2})\b/g)];
    for (const m of matches) {
      const mes = m[1];
      const ano = m[2];
      if (Number(mes) >= 1 && Number(mes) <= 12 && Number(ano) >= 2020) return `${ano}-${mes}`;
    }
  }

  return null;
}

// Extrai lista de segurados do texto extraído de PDF do corretor.
// O formato esperado é: <número-item> <espaços> <NOME COMPLETO> [valores monetários]
// Exemplo: "00000000784       ACACIO LESCURA DE CAMARGO    28.290,38 ..."
//
// Linhas com número de item seguido do nome do segurado.
// Padrões em cascata — tenta do mais estrito ao mais permissivo.
type SeguradoParsed = { item: string; nome: string; valores: string[] };

// P1: formato clássico   — item (5-12 dígitos) + 2+ espaços + nome MAIÚSCULO
// P2: item CPF/longo     — 13-15 dígitos + 1+ espaço + nome
// P3: separador tab      — qualquer nº de dígitos + \t + nome
// P4: 1 espaço só        — item (3-12 dígitos) + 1 espaço + nome (arquivos _ATL Bradesco)
// P5: colunas fundidas   — item (3-12 dígitos) imediatamente seguido de nome sem espaço
const PARSE_PATTERNS: { id: string; re: RegExp }[] = [
  { id: "P1", re: /^(\d{5,12})[ \t]{2,}([A-ZÁÀÃÂÉÊÍÓÔÕÚÜÇÑ][A-Za-záàãâéêíóôõúüçñ\s]+)/ },
  { id: "P2", re: /^(\d{13,15})[ \t]+([A-ZÁÀÃÂÉÊÍÓÔÕÚÜÇÑ][A-Za-záàãâéêíóôõúüçñ\s]+)/ },
  { id: "P3", re: /^(\d{3,15})\t([A-ZÁÀÃÂÉÊÍÓÔÕÚÜÇÑ][A-Za-záàãâéêíóôõúüçñ\s]+)/ },
  { id: "P4", re: /^(\d{3,12}) ([A-ZÁÀÃÂÉÊÍÓÔÕÚÜÇÑ][A-Za-záàãâéêíóôõúüçñ\s]+)/ },
  { id: "P5", re: /^(\d{3,12})([A-ZÁÀÃÂÉÊÍÓÔÕÚÜÇÑ][A-Za-záàãâéêíóôõúüçñ\s]{3,})/ },
];

function parsarLinhasSegurados(linhas: string[]): { segurados: SeguradoParsed[]; padrao: string } {
  for (const { id, re } of PARSE_PATTERNS) {
    const resultado: SeguradoParsed[] = [];
    for (const linha of linhas) {
      const match = linha.match(re);
      if (!match) continue;
      const nomeRaw = match[2].replace(/\s+\d[\d.,\s]*$/, "").trim();
      const palavras = nomeRaw.split(/\s+/).filter(Boolean);
      if (palavras.length < 2 || /\d/.test(nomeRaw)) continue;
      const valores = [...linha.matchAll(/\d[\d.]*,\d+/g)].map(m => m[0]).slice(0, 7);
      resultado.push({ item: match[1].replace(/^0+/, "") || "0", nome: nomeRaw, valores });
    }
    if (resultado.length >= 2) return { segurados: resultado, padrao: id };
  }
  return { segurados: [], padrao: "nenhum" };
}

function parseNomesBrutos(texto: string): SeguradoParsed[] {
  const linhas = texto.split("\n").map(l => l.trim()).filter(Boolean);
  const { segurados } = parsarLinhasSegurados(linhas);
  return segurados;
}

function parseSeguradora(texto: string): string | null {
  const upper = texto.slice(0, 3000).toUpperCase();
  const mapa: [string, string][] = [
    ["BRADESCO", "Bradesco Seguros"],
    ["METLIFE", "MetLife"],
    ["PORTO SEGURO", "Porto Seguro"],
    ["SULAMERICA", "SulAmérica"],
    ["SUL AMERICA", "SulAmérica"],
    ["ITAU SEGUROS", "Itaú Seguros"],
    ["ZURICH", "Zurich"],
    ["ALLIANZ", "Allianz"],
    ["GENERALI", "Generali"],
    ["ICATU", "Icatu Seguros"],
    ["MONGERAL", "Mongeral Aegon"],
    ["TOKIO MARINE", "Tokio Marine"],
    ["CHUBB", "Chubb"],
    ["AXA", "AXA Seguros"],
    ["PRUDENTIAL", "Prudential"],
  ];
  for (const [pattern, name] of mapa) {
    if (upper.includes(pattern)) return name;
  }
  return null;
}

// Lógica central de cruzamento — reutilizada em importarRelatorio e processarPdfLote
async function executarCruzamento(
  db: any,
  ids: number[],
  companyId: number,
  competencia: string,
  seguradosCorretora: SeguradoParsed[],
  nomesBrutos: string,
  apoliceVG: string | undefined,
  apoliceAPC: string | undefined,
  importadoPor: string,
  seguradora?: string,
) {
  const cltAtivos = rows(await db.execute(sql`
    SELECT id, "nomeCompleto", "cargo", "funcao", "dataAdmissao"
    FROM employees
    WHERE "companyId" ${inIds(ids)}
      AND status IN ('Ativo','Ferias')
      AND COALESCE("tipoContrato",'CLT') NOT IN ('PJ','Socio')
      AND "deletedAt" IS NULL
  `));
  console.log(`[SeguroVida] executarCruzamento — ids=${JSON.stringify(ids)}, cltAtivos=${cltAtivos.length}`);

  const coberturasAtivas = rows(await db.execute(sql`
    SELECT id, employee_id, nome_completo, item_segurador, status
    FROM seguro_vida_coberturas
    WHERE company_id ${inIds(ids)} AND status IN ('ativo','pendente_inclusao')
  `));

  const THRESHOLD = 0.55; // algoritmo melhorado (stopwords + Levenshtein) permite threshold menor
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

  for (const emp of cltAtivos) {
    const nNorm = normalizeName(emp.nomeCompleto);
    let melhorIdx = -1;
    let melhorSim = 0;
    nomesSeguradosNorm.forEach((sn, i) => {
      const sim = nameSimilarity(nNorm, sn);
      if (sim > melhorSim) { melhorSim = sim; melhorIdx = i; }
    });

    const cobAtual = coberturasAtivas.find((c: any) => c.employee_id === emp.id);
    const dataAdmissao = emp.dataAdmissao ? String(emp.dataAdmissao) : undefined;
    const isNovo = dataAdmissao && (new Date().getTime() - new Date(dataAdmissao).getTime()) < 45 * 86400000;

    if (melhorSim >= THRESHOLD && melhorIdx >= 0) {
      idxUsados.add(melhorIdx);
      const matchedSeg = seguradosCorretora[melhorIdx];
      resultado.push({ status: "ok", nome: emp.nomeCompleto, item: matchedSeg.item, employeeId: emp.id, nomeHR: emp.nomeCompleto, similaridade: melhorSim, dataAdmissao, coberturaId: cobAtual?.id });
      // Persiste valores do PDF na cobertura já existente
      if (cobAtual?.id && matchedSeg.valores.length > 0) {
        const v = matchedSeg.valores;
        const hasInvalidezDoenca = v.length >= 7;
        const covOffset = hasInvalidezDoenca ? 1 : 0;
        await db.execute(sql`
          UPDATE seguro_vida_coberturas SET
            morte_natural       = ${v[0] ?? null},
            morte_acidental     = ${v[1] ?? null},
            invalidez_acidente  = ${v[2] ?? null},
            invalidez_doenca    = ${hasInvalidezDoenca ? (v[3] ?? null) : null},
            premio_vg           = ${v[3 + covOffset] ?? null},
            premio_apc          = ${v[4 + covOffset] ?? null},
            seguradora          = COALESCE(seguradora, ${seguradora ?? null}),
            atualizado_em       = NOW()
          WHERE id = ${cobAtual.id}
        `);
      }
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
  // Log das 3 maiores similaridades para diagnóstico
  const matchesDebug = resultado
    .filter(r => r.status === "ok" && r.similaridade)
    .sort((a, b) => (b.similaridade ?? 0) - (a.similaridade ?? 0))
    .slice(0, 3)
    .map(r => `${r.nomeHR}(${(r.similaridade! * 100).toFixed(0)}%)`);
  console.log(`[SeguroVida] cruzamento ${competencia}: ok=${totalOk}, semSeguro=${totalSemSeguro}, pagar=${totalPagarIndevido}, novo=${totalNovos}, exemplos=${matchesDebug.join(", ") || "nenhum"}`);
  if (totalSemSeguro > 0) {
    const semSeguroNomes = resultado.filter(r => r.status === "sem_seguro").slice(0, 5).map(r => r.nome);
    console.log(`[SeguroVida] sem seguro (primeiros): ${semSeguroNomes.join(", ")}`);
  }

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

      const resumoAtivos = rows(await db.execute(sql`
        SELECT COUNT(*) as "totalAtivos"
        FROM seguro_vida_coberturas
        WHERE company_id ${inIds(ids)} AND status = 'ativo'
      `));
      const totalAtivos = resumoAtivos[0]?.totalAtivos ?? 0;

      const resumoPendInclusao = rows(await db.execute(sql`
        SELECT COUNT(*) as "totalPendInclusao"
        FROM seguro_vida_coberturas
        WHERE company_id ${inIds(ids)} AND status = 'pendente_inclusao'
      `));
      const totalPendInclusao = resumoPendInclusao[0]?.totalPendInclusao ?? 0;

      const resumoPendCancel = rows(await db.execute(sql`
        SELECT COUNT(*) as "totalPendCancel"
        FROM seguro_vida_coberturas
        WHERE company_id ${inIds(ids)} AND status = 'pendente_cancelamento'
      `));
      const totalPendCancel = resumoPendCancel[0]?.totalPendCancel ?? 0;

      const cltAtivos = rows(await db.execute(sql`
        SELECT e.id, e."nomeCompleto"
        FROM employees e
        WHERE e."companyId" ${inIds(ids)}
          AND e.status IN ('Ativo','Ferias')
          AND COALESCE(e."tipoContrato",'CLT') NOT IN ('PJ','Socio')
          AND e."deletedAt" IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM seguro_vida_coberturas s
            WHERE s.employee_id = e.id AND s.status IN ('ativo','pendente_inclusao')
          )
      `));

      const semSeguro = cltAtivos.length;

      const ultimaImportacaoRows = rows(await db.execute(sql`
        SELECT competencia, data_importacao, total_segurados, total_sem_seguro, total_pagar_indevido
        FROM seguro_vida_importacoes
        WHERE company_id ${inIds(ids)}
        ORDER BY criado_em DESC
        LIMIT 1
      `));
      const ultimaImportacao = ultimaImportacaoRows[0] ?? null;

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

      const coberturas = rows(await db.execute(sql`
        SELECT
          s.id, s.company_id, s.employee_id, s.nome_completo, s.item_segurador,
          s.apolice_vg, s.apolice_apc, s.status, s.data_adesao, s.data_cancelamento,
          s.motivo_cancelamento, s.observacoes, s.criado_em, s.atualizado_em, s.criado_por,
          e."cargo", e."funcao", e."dataAdmissao", e."dataDemissao"
        FROM seguro_vida_coberturas s
        LEFT JOIN employees e ON e.id = s.employee_id
        WHERE s.company_id ${inIds(ids)}
          ${input.status ? sql`AND s.status = ${input.status}` : sql``}
        ORDER BY s.nome_completo
      `));

      return coberturas;
    }),

  listarFuncionariosComStatus: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const ids = resolveCompanyIds(input);

      const funcionarios = rows(await db.execute(sql`
        SELECT
          e.id, e."nomeCompleto", e."cargo", e."funcao", e."dataAdmissao",
          e."tipoContrato", e.status as emp_status,
          s.id as cobertura_id, s.status as seguro_status, s.item_segurador,
          s.apolice_vg, s.apolice_apc, s.data_adesao, s.data_cancelamento, s.observacoes,
          s.morte_natural, s.morte_acidental, s.invalidez_acidente, s.invalidez_doenca,
          s.premio_vg, s.premio_apc, s.seguradora
        FROM employees e
        LEFT JOIN seguro_vida_coberturas s ON s.employee_id = e.id AND s.status IN ('ativo','pendente_inclusao','pendente_cancelamento')
        WHERE e."companyId" ${inIds(ids)}
          AND e.status IN ('Ativo','Ferias')
          AND COALESCE(e."tipoContrato",'CLT') NOT IN ('PJ','Socio')
          AND e."deletedAt" IS NULL
        ORDER BY e."nomeCompleto"
      `));

      return funcionarios;
    }),

  getCoberturaByEmployee: protectedProcedure
    .input(z.object({ companyId: z.number(), employeeId: z.number() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;

      const cobertura = rows(await db.execute(sql`
        SELECT * FROM seguro_vida_coberturas
        WHERE company_id = ${input.companyId} AND employee_id = ${input.employeeId}
        ORDER BY criado_em DESC
        LIMIT 1
      `))[0];

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
      console.log(`[SeguroVida] processarPdfLote — ${input.arquivos.length} arquivo(s)`);
      const db = (await getDb())!;
      const ids = resolveCompanyIds(input);

      // Carrega pdf-parse de forma compatível com ESM
      let pdfParse: any;
      try {
        const mod = await import("pdf-parse");
        pdfParse = mod.default || mod;
      } catch (e: any) {
        console.error("[SeguroVida] pdf-parse não disponível:", e.message);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Módulo de leitura de PDF não disponível. Contate o suporte." });
      }

      const resultados: any[] = [];

      for (const arq of input.arquivos) {
        console.log(`[SeguroVida] Processando ${arq.filename} (${Math.round(arq.fileBase64.length * 0.75 / 1024)} KB)`);
        try {
          const buffer = Buffer.from(arq.fileBase64, "base64");
          if (buffer.length < 100) {
            resultados.push({ competencia: arq.competencia, filename: arq.filename, erro: "Arquivo inválido ou muito pequeno." });
            continue;
          }

          let pdfData: any;
          try {
            pdfData = await pdfParse(buffer);
          } catch (pdfErr: any) {
            console.error(`[SeguroVida] Erro ao ler ${arq.filename}:`, pdfErr.message);
            resultados.push({ competencia: arq.competencia, filename: arq.filename, erro: `Erro ao ler PDF: ${pdfErr.message}` });
            continue;
          }

          const texto = (pdfData?.text as string) ?? "";
          console.log(`[SeguroVida] ${arq.filename}: ${texto.length} chars extraídos`);

          if (!texto || texto.length < 20) {
            resultados.push({ competencia: arq.competencia, filename: arq.filename, erro: "PDF não contém texto legível. Pode ser escaneado/imagem." });
            continue;
          }

          // Detecta competência do próprio conteúdo do PDF
          const detectedComp = detectarCompetenciaDoPdf(texto);
          const competenciaFinal = detectedComp ?? arq.competencia;
          const autoDetectado = !!detectedComp;
          console.log(`[SeguroVida] ${arq.filename}: competência ${autoDetectado ? "detectada" : "fallback"} = ${competenciaFinal}`);

          const linhas = texto.split("\n").map((l: string) => l.trim()).filter(Boolean);
          const { segurados, padrao } = parsarLinhasSegurados(linhas);
          // Diagnóstico — sempre loga as primeiras 15 linhas para rastrear formato
          const primeiraLinhas = linhas.slice(0, 15).join(" | ").slice(0, 600);
          console.log(`[SeguroVida] ${arq.filename}: ${segurados.length} segurado(s) | padrão=${padrao} | linhas[0..15]="${primeiraLinhas}"`);

          if (segurados.length < 2) {
            const trecho = linhas.slice(0, 10).join("\n");
            resultados.push({
              competencia: competenciaFinal,
              competenciaFallback: !autoDetectado,
              filename: arq.filename,
              erro: `Nenhum segurado encontrado no PDF (padrões testados: P1-P5).\n\nPrimeiras linhas extraídas:\n${trecho}\n\nVerifique se o PDF contém a relação de segurados (não apenas sumário ou capa).`,
            });
            continue;
          }

          const seguradoraDetectada = parseSeguradora(texto);

          const resultado = await executarCruzamento(
            db, ids, input.companyId, competenciaFinal, segurados,
            texto, input.apoliceVG, input.apoliceAPC, ctx.user.name ?? "",
            seguradoraDetectada ?? undefined
          );

          resultados.push({ filename: arq.filename, autoDetectado, competenciaFallback: !autoDetectado, ...resultado });
        } catch (err: any) {
          console.error(`[SeguroVida] Erro inesperado em ${arq.filename}:`, err.message);
          resultados.push({ competencia: arq.competencia, competenciaFallback: true, filename: arq.filename, erro: `Erro: ${err.message}` });
        }
      }

      console.log(`[SeguroVida] processarPdfLote concluído — ${resultados.length} resultado(s)`);
      return { resultados };
    }),

  listarImportacoes: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const ids = resolveCompanyIds(input);

      const importacoes = rows(await db.execute(sql`
        SELECT id, competencia, data_importacao, total_segurados, total_ativos,
               total_ok, total_sem_seguro, total_pagar_indevido, total_novos,
               importado_por, criado_em
        FROM seguro_vida_importacoes
        WHERE company_id ${inIds(ids)}
        ORDER BY criado_em DESC
        LIMIT 24
      `));

      return importacoes;
    }),

  getImportacao: protectedProcedure
    .input(z.object({ companyId: z.number(), importacaoId: z.number() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;

      const row = rows(await db.execute(sql`
        SELECT * FROM seguro_vida_importacoes
        WHERE id = ${input.importacaoId} AND company_id = ${input.companyId}
      `))[0];

      return row || null;
    }),

  deletarImportacao: protectedProcedure
    .input(z.object({ companyId: z.number(), importacaoId: z.number() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await db.execute(sql`
        DELETE FROM seguro_vida_importacoes
        WHERE id = ${input.importacaoId} AND company_id = ${input.companyId}
      `);
      return { ok: true };
    }),

  deletarImportacoes: protectedProcedure
    .input(z.object({ companyId: z.number(), importacaoIds: z.array(z.number()).min(1).max(200) }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      for (const id of input.importacaoIds) {
        await db.execute(sql`
          DELETE FROM seguro_vida_importacoes
          WHERE id = ${id} AND company_id = ${input.companyId}
        `);
      }
      return { removidos: input.importacaoIds.length };
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

      const cltAtivos = rows(await db.execute(sql`
        SELECT id, "nomeCompleto" FROM employees
        WHERE "companyId" ${inIds(ids)} AND status = 'Ativo' AND "deletedAt" IS NULL
      `));

      let inseridos = 0;
      for (const s of segurados) {
        let empId: number | null = null;
        let melhorSim = 0;
        for (const emp of cltAtivos) {
          const sim = nameSimilarity(s.nome, emp.nomeCompleto);
          if (sim > melhorSim) { melhorSim = sim; if (sim >= 0.65) empId = emp.id; }
        }

        const existe = rows(await db.execute(sql`
          SELECT id FROM seguro_vida_coberturas
          WHERE company_id = ${input.companyId} AND nome_completo = ${s.nome} AND status = 'ativo'
        `))[0];
        if (existe) continue;

        const v = s.valores;
        const hasInvalidezDoenca = v.length >= 7;
        const covOffset = hasInvalidezDoenca ? 1 : 0;
        await db.execute(sql`
          INSERT INTO seguro_vida_coberturas
            (company_id, employee_id, nome_completo, item_segurador, apolice_vg, apolice_apc, status, data_adesao, criado_por,
             morte_natural, morte_acidental, invalidez_acidente, invalidez_doenca, premio_vg, premio_apc)
          VALUES
            (${input.companyId}, ${empId}, ${s.nome}, ${s.item || null},
             ${input.apoliceVG ?? null}, ${input.apoliceAPC ?? null},
             'ativo', ${input.dataAdesao ?? null}, ${ctx.user.name ?? ""},
             ${v[0] ?? null}, ${v[1] ?? null}, ${v[2] ?? null},
             ${hasInvalidezDoenca ? (v[3] ?? null) : null},
             ${v[3 + covOffset] ?? null}, ${v[4 + covOffset] ?? null})
        `);
        inseridos++;
      }

      return { inseridos, total: segurados.length };
    }),
});
