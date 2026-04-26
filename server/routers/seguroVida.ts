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

// Extrai lista de segurados do PDF do corretor.
// Estratégia em cascata: P1-P5 buscam linhas com número de item + nome.
// P6 é o fallback universal: identifica qualquer linha em MAIÚSCULAS que
// pareça nome de pessoa e deixa o cruzamento ser feito pelo nome (já existente).
type SeguradoParsed = { item: string; nome: string; valores: string[] };

// P1: formato clássico   — item (5-12 dígitos) + 2+ espaços + nome MAIÚSCULO
// P2: item CPF/longo     — 13-15 dígitos + 1+ espaço + nome
// P3: separador tab      — qualquer nº de dígitos + \t + nome
// P4: 1 espaço só        — item (3-12 dígitos) + 1 espaço + nome
// P5: colunas fundidas   — item (3-12 dígitos) colado ao nome sem espaço
const PARSE_PATTERNS: { id: string; re: RegExp }[] = [
  { id: "P1", re: /^(\d{5,12})[ \t]{2,}([A-ZÁÀÃÂÉÊÍÓÔÕÚÜÇÑ][A-Za-záàãâéêíóôõúüçñ\s]+)/ },
  { id: "P2", re: /^(\d{13,15})[ \t]+([A-ZÁÀÃÂÉÊÍÓÔÕÚÜÇÑ][A-Za-záàãâéêíóôõúüçñ\s]+)/ },
  { id: "P3", re: /^(\d{3,15})\t([A-ZÁÀÃÂÉÊÍÓÔÕÚÜÇÑ][A-Za-záàãâéêíóôõúüçñ\s]+)/ },
  { id: "P4", re: /^(\d{3,12}) ([A-ZÁÀÃÂÉÊÍÓÔÕÚÜÇÑ][A-Za-záàãâéêíóôõúüçñ\s]+)/ },
  { id: "P5", re: /^(\d{3,12})([A-ZÁÀÃÂÉÊÍÓÔÕÚÜÇÑ][A-Za-záàãâéêíóôõúüçñ\s]{3,})/ },
];

// Palavras que indicam linha de cabeçalho/rodapé — descartadas no P6
const P6_BLACKLIST = new Set([
  "SEGURO","VIDA","GRUPO","ACID","PESSOAIS","RELACAO","RELAÇÃO","ATUALIZADA",
  "SEGURADOS","SEGURADO","ESTIPULANTE","SUBESTIPULANTE","COMPETENCIA","COMPETÊNCIA",
  "COBRANCA","COBRANÇA","PREMIO","PRÊMIO","CAPITAL","SALARIO","SALÁRIO",
  "PROCESSAMENTO","ADESAO","ADESÃO","CANCELAMENTO","INCLUSAO","INCLUSÃO",
  "EXCLUSAO","EXCLUSÃO","MORTE","INVALIDEZ","ACIDENTE","VIDAS","PME","MAIS",
  "APOLICE","APÓLICE","PROPOSTA","CERTIFICADO","VIGENCIA","VIGÊNCIA","PERIODO",
  "PERÍODO","REFERENCIA","REFERÊNCIA","DATA","TIPO","CODIGO","CÓDIGO","ITEM",
  "NUMERO","NÚMERO","TOTAL","PAGINA","PÁGINA","FOLHA","BENEFICIARIO","BENEFICIÁRIO",
  "COBERTURA","RAMO","LINHA","SUB","NOME","INSCRICAO","INSCRIÇÃO","COBERTURAS",
  "VENCIMENTO","EMISSAO","EMISSÃO","CONTRATO","APOLICES","APÓLICES","RAZAO","RAZÃO",
  "SOCIAL","CNPJ","CPF","FONE","EMAIL","ENDERECO","ENDEREÇO","BAIRRO","CIDADE",
  "ESTADO","CEP","TITULAR","DEPENDENTE","PLANO","MODALIDADE","VIGENTE",
]);

// P6: extrai nomes em MAIÚSCULAS sem exigir número de item na frente.
// Cada linha é analisada; se parece nome de pessoa (2-7 palavras, sem dígitos,
// sem palavras de cabeçalho, ao menos uma palavra com 4+ chars), é aceita.
function extrairNomesP6(linhas: string[]): SeguradoParsed[] {
  const reNome = /^([A-ZÁÀÃÂÉÊÍÓÔÕÚÜÇÑ][A-ZÁÀÃÂÉÊÍÓÔÕÚÜÇÑ]{1,}(?:\s+[A-Za-záàãâéêíóôõúüçñA-ZÁÀÃÂÉÊÍÓÔÕÚÜÇÑ]{2,}){1,})/;
  const resultado: SeguradoParsed[] = [];
  let idx = 1;
  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i];
    const match = linha.match(reNome);
    if (!match) continue;
    const nomeRaw = match[1].trim();
    const palavras = nomeRaw.split(/\s+/).filter(Boolean);
    if (palavras.length < 2 || palavras.length > 7) continue;
    if (/\d/.test(nomeRaw)) continue;
    // Normaliza para comparação com blacklist (remove acentos, maiúscula)
    const norma = (s: string) => s.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (palavras.some(w => P6_BLACKLIST.has(norma(w)))) continue;
    // Exige ao menos uma palavra com 4+ chars (descarta "DE E A" isolados)
    if (!palavras.some(w => w.length >= 4)) continue;
    const valores = coletarValoresAdjacentes(linhas, i, linha);
    resultado.push({ item: String(idx++), nome: nomeRaw, valores });
  }
  return resultado;
}

// Extrai números monetários BR (1.234,56) de um texto — pode ser linha única ou concatenação de linhas
function extrairValores(texto: string): string[] {
  return [...texto.matchAll(/\d[\d.]*,\d+/g)].map(m => m[0]);
}

// Coleta até 7 valores monetários começando na linha do nome e, se insuficientes,
// continua nas próximas linhas até encontrar >= 6 valores ou esgotar 7 linhas extras.
function coletarValoresAdjacentes(linhas: string[], idxLinha: number, textoNomeLinha: string): string[] {
  let valores = extrairValores(textoNomeLinha);
  // Se já temos >= 6 valores na mesma linha, está bom
  if (valores.length >= 6) return valores.slice(0, 7);
  // Caso contrário, funde com até 7 linhas seguintes que contenham números mas não nomes
  for (let d = 1; d <= 7 && idxLinha + d < linhas.length; d++) {
    const proxLinha = linhas[idxLinha + d];
    // Para se a próxima linha parece um novo nome de pessoa (com item na frente) ou outro segurado
    if (/^\d{3,15}[\s\t]+[A-ZÁÀÃÂÉÊÍÓÔÕÚÜÇÑ]/.test(proxLinha.trim())) break;
    if (/^[A-ZÁÀÃÂÉÊÍÓÔÕÚÜÇÑ][A-ZÁÀÃÂÉÊÍÓÔÕÚÜÇÑ\s]{10,}$/.test(proxLinha.trim())) break;
    const extras = extrairValores(proxLinha);
    if (extras.length > 0) valores = [...valores, ...extras];
    if (valores.length >= 6) break;
  }
  return valores.slice(0, 7);
}

function parsarLinhasSegurados(linhas: string[]): { segurados: SeguradoParsed[]; padrao: string } {
  // Tenta P1-P5: padrões que exigem número de item na frente
  for (const { id, re } of PARSE_PATTERNS) {
    const resultado: SeguradoParsed[] = [];
    for (let i = 0; i < linhas.length; i++) {
      const linha = linhas[i];
      const match = linha.match(re);
      if (!match) continue;
      const nomeRaw = match[2].replace(/\s+\d[\d.,\s]*$/, "").trim();
      const palavras = nomeRaw.split(/\s+/).filter(Boolean);
      if (palavras.length < 2 || /\d/.test(nomeRaw)) continue;
      const valores = coletarValoresAdjacentes(linhas, i, linha);
      // Log diagnóstico para os primeiros 3 segurados
      if (resultado.length < 3) {
        const ctxLinhas = linhas.slice(Math.max(0, i-1), i+10);
        const ctx = ctxLinhas.map((l, d) => `  [${i-1+d}]${d === 1 ? ">>>" : "   "} "${l}"`).join("\n");
        console.log(`[SeguroVida] ${id} segurado#${resultado.length+1}: "${nomeRaw}"\n  valores(${valores.length})=[${valores.join(" | ")}]\n${ctx}`);
      }
      resultado.push({ item: match[1].replace(/^0+/, "") || "0", nome: nomeRaw, valores });
    }
    if (resultado.length >= 2) return { segurados: resultado, padrao: id };
  }
  // P6: fallback universal — identifica nomes em MAIÚSCULAS e cruza pelo nome
  const p6 = extrairNomesP6(linhas);
  if (p6.length >= 2) return { segurados: p6, padrao: "P6" };
  return { segurados: [], padrao: "nenhum" };
}

function parseNomesBrutos(texto: string): SeguradoParsed[] {
  const linhas = texto.split("\n").map(l => l.trim()).filter(Boolean);
  const { segurados, padrao } = parsarLinhasSegurados(linhas);
  const comValores = segurados.filter(s => s.valores.length > 0).length;
  console.log(`[SeguroVida] parseNomesBrutos: ${segurados.length} segurado(s), padrão=${padrao}, com valores=${comValores}/${segurados.length}`);
  return segurados;
}

function parseSeguradora(texto: string): string | null {
  // Busca em todo o texto (não apenas primeiros 3000 chars)
  const upper = texto.toUpperCase();
  const mapa: [string, string][] = [
    // Ordem importa: mais específico primeiro
    ["TOKIO MARINE", "Tokio Marine"],
    ["PORTO SEGURO", "Porto Seguro"],
    ["SUL AMERICA", "SulAmérica"],
    ["SULAMERICA", "SulAmérica"],
    ["ITAU SEGUROS", "Itaú Seguros"],
    ["ITAÚ SEGUROS", "Itaú Seguros"],
    ["MONGERAL AEGON", "Mongeral Aegon"],
    ["MONGERAL", "Mongeral Aegon"],
    ["ICATU HARTFORD", "Icatu Seguros"],
    ["ICATU SEGUROS", "Icatu Seguros"],
    ["ICATU", "Icatu Seguros"],
    ["BRADESCO VIDA", "Bradesco Seguros"],
    ["BRADESCO SEGUROS", "Bradesco Seguros"],
    ["BRADESCO", "Bradesco Seguros"],
    ["METLIFE", "MetLife"],
    ["PRUDENTIAL", "Prudential"],
    ["ZURICH", "Zurich"],
    ["ZUERICH", "Zurich"],
    ["ALLIANZ", "Allianz"],
    ["GENERALI", "Generali"],
    ["CHUBB", "Chubb"],
    ["AXA SEGUROS", "AXA Seguros"],
    ["LIBERTY SEGUROS", "Liberty Seguros"],
    ["LIBERTY", "Liberty Seguros"],
    ["MAPFRE", "Mapfre Seguros"],
    ["SUHAI", "Suhai Seguros"],
    ["HDI SEGUROS", "HDI Seguros"],
    ["HDI", "HDI Seguros"],
    ["SOMPO", "Sompo Seguros"],
    ["NATIONWIDE", "Nationwide Seguros"],
    ["BB SEGUROS", "BB Seguros"],
    ["BANCO DO BRASIL SEGUROS", "BB Seguros"],
    ["CAIXA SEGUROS", "Caixa Seguros"],
    ["CAPEMISA", "Capemisa"],
    ["PREVISUL", "Previsul"],
    ["SURA", "Sura Seguros"],
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
  pdfBase64?: string,
  incluirPJ?: boolean,
) {
  // Statuses considerados "ainda empregado" — Aviso, Afastado e Licença continuam pagando seguro
  const STATUS_AINDA_ATIVO = `'Ativo','Ferias','Afastado','Aviso','Licenca','Licença'`;

  const cltAtivos = rows(await db.execute(sql`
    SELECT id, "nomeCompleto", "cargo", "funcao", "dataAdmissao", status
    FROM employees
    WHERE "companyId" ${inIds(ids)}
      AND status IN ('Ativo','Ferias','Afastado','Aviso','Licenca','Licença')
      AND COALESCE("tipoContrato",'CLT') NOT IN ('PJ','Socio')
      AND "deletedAt" IS NULL
  `));

  const pjAtivos = rows(await db.execute(sql`
    SELECT id, "nomeCompleto", "tipoContrato", status
    FROM employees
    WHERE "companyId" ${inIds(ids)}
      AND status IN ('Ativo','Ferias','Afastado','Aviso','Licenca','Licença')
      AND "tipoContrato" IN ('PJ','Socio')
      AND "deletedAt" IS NULL
  `));
  const pjNormados = pjAtivos.map((p: any) => ({ ...p, _norm: normalizeName(p.nomeCompleto) }));

  // Busca APENAS funcionários realmente desligados (status Desligado ou Blacklist com data de demissão)
  const desligados = rows(await db.execute(sql`
    SELECT id, "nomeCompleto", "tipoContrato", "dataDemissao", status
    FROM employees
    WHERE "companyId" ${inIds(ids)}
      AND status IN ('Desligado','Blacklist')
      AND "dataDemissao" IS NOT NULL
      AND "deletedAt" IS NULL
    ORDER BY "dataDemissao" DESC NULLS LAST
    LIMIT 300
  `));
  const desligadosNorm = desligados.map((d: any) => ({ ...d, _norm: normalizeName(d.nomeCompleto) }));

  console.log(`[SeguroVida] executarCruzamento — ids=${JSON.stringify(ids)}, cltAtivos=${cltAtivos.length}, pjAtivos=${pjAtivos.length}, desligados=${desligados.length}`);

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
    tipoContrato?: string;
    similaridade?: number;
    dataAdmissao?: string;
    coberturaId?: number;
    valores?: string[];
    possivelPJ?: { nome: string; tipo: string };
    possivelDesligado?: { nome: string; dataDemissao: string | null; status: string };
  }[] = [];

  const idxUsados = new Set<number>();

  // Lista combinada: CLT sempre + PJ/Sócios opcionalmente
  const empsParaCruzar = incluirPJ
    ? [...cltAtivos, ...pjAtivos.map((p: any) => ({ ...p, dataAdmissao: null }))]
    : cltAtivos;

  for (const emp of empsParaCruzar) {
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
      // nome = nome exato do PDF (corretor); nomeHR = nome do sistema RH; valores = importâncias do PDF
      // Nota: não fazemos UPDATE de coberturas aqui — apenas coletamos o resultado para o usuário confirmar.
      // O UPDATE real acontece em confirmarCruzamento, evitando que múltiplos PDFs sobrescrevam dados entre si.
      resultado.push({ status: "ok", nome: matchedSeg.nome, item: matchedSeg.item, employeeId: emp.id, nomeHR: emp.nomeCompleto, tipoContrato: emp.tipoContrato, similaridade: melhorSim, dataAdmissao, coberturaId: cobAtual?.id, valores: matchedSeg.valores, seguradora: seguradora ?? null });
    } else if (isNovo) {
      // Recém-admitido: não estava no PDF ainda — sem nome do corretor
      resultado.push({ status: "novo", nome: "", item: "", employeeId: emp.id, nomeHR: emp.nomeCompleto, dataAdmissao, coberturaId: cobAtual?.id });
    } else {
      // Sem seguro: não foi encontrado no PDF — sem nome do corretor
      resultado.push({ status: "sem_seguro", nome: "", item: "", employeeId: emp.id, nomeHR: emp.nomeCompleto, dataAdmissao, coberturaId: cobAtual?.id });
    }
  }

  seguradosCorretora.forEach((s, i) => {
    if (idxUsados.has(i)) return;
    const sNorm = normalizeName(s.nome);

    // Verifica se é PJ/Sócio ativo (quando não inclui PJ no cruzamento)
    let possivelPJ: { nome: string; tipo: string } | undefined;
    if (!incluirPJ) {
      let melhorSimPJ = 0;
      for (const pj of pjNormados) {
        const sim = nameSimilarity(sNorm, pj._norm);
        if (sim > melhorSimPJ) { melhorSimPJ = sim; if (sim >= 0.65) possivelPJ = { nome: pj.nomeCompleto, tipo: pj.tipoContrato }; }
      }
    }

    // Verifica se é um funcionário desligado (demitido)
    let possivelDesligado: { nome: string; dataDemissao: string | null; status: string } | undefined;
    let melhorSimDesligado = 0;
    for (const d of desligadosNorm) {
      const sim = nameSimilarity(sNorm, d._norm);
      if (sim > melhorSimDesligado) {
        melhorSimDesligado = sim;
        if (sim >= 0.65) {
          possivelDesligado = {
            nome: d.nomeCompleto,
            dataDemissao: d.dataDemissao ? String(d.dataDemissao).split("T")[0] : null,
            status: String(d.status),
          };
        }
      }
    }

    resultado.push({ status: "pagar_indevido", nome: s.nome, item: s.item, possivelPJ, possivelDesligado });
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
       json_resultado, relatorio_nomes, importado_por, pdf_dados)
    VALUES
      (${companyId}, ${competencia},
       ${seguradosCorretora.length}, ${(Array.isArray(cltAtivos) ? cltAtivos : []).length},
       ${totalOk}, ${totalSemSeguro}, ${totalPagarIndevido}, ${totalNovos},
       ${JSON.stringify(resultado)}, ${nomesBrutos.substring(0, 5000)},
       ${importadoPor}, ${pdfBase64 ?? null})
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
          AND e.status IN ('Ativo','Ferias','Afastado','Aviso','Licenca','Licença')
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

      const premioRows = rows(await db.execute(sql`
        SELECT
          COALESCE(SUM(
            CASE WHEN premio_vg ~ '^[0-9.,]+$'
              THEN CAST(REPLACE(REPLACE(premio_vg, '.', ''), ',', '.') AS NUMERIC) ELSE 0 END
            +
            CASE WHEN premio_apc ~ '^[0-9.,]+$'
              THEN CAST(REPLACE(REPLACE(premio_apc, '.', ''), ',', '.') AS NUMERIC) ELSE 0 END
          ), 0) as total_mensal
        FROM seguro_vida_coberturas
        WHERE company_id ${inIds(ids)}
          AND status IN ('ativo','pendente_inclusao')
      `));
      const totalPremioMensal = Number(premioRows[0]?.total_mensal) || 0;

      return {
        totalSeguradosAtivos: Number(totalAtivos) || 0,
        totalPendenteInclusao: Number(totalPendInclusao) || 0,
        totalPendenteCancelamento: Number(totalPendCancel) || 0,
        totalSemSeguro: semSeguro,
        totalPremioMensal,
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
          s.premio_vg, s.premio_apc, s.seguradora, s.data_vencimento_apolice
        FROM employees e
        LEFT JOIN seguro_vida_coberturas s ON s.employee_id = e.id AND s.status IN ('ativo','pendente_inclusao','pendente_cancelamento')
        WHERE e."companyId" ${inIds(ids)}
          AND e.status IN ('Ativo','Ferias','Afastado','Aviso','Licenca','Licença')
          AND e."deletedAt" IS NULL
        ORDER BY COALESCE(e."tipoContrato",'CLT'), e."nomeCompleto"
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

  cancelarMultiplasCoberturas: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      coberturaIds: z.array(z.number()).min(1),
      motivo: z.string().optional(),
      dataCancelamento: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const hoje = new Date().toISOString().split("T")[0];
      const agora = new Date().toISOString();
      const canceladoPor = ctx.user.name ?? "";
      const dataCanc = input.dataCancelamento ?? hoje;
      const motivo = input.motivo ?? null;
      let canceladas = 0;
      for (const id of input.coberturaIds) {
        await db.execute(sql`
          UPDATE seguro_vida_coberturas SET
            status = 'cancelado',
            data_cancelamento = ${dataCanc},
            motivo_cancelamento = ${motivo},
            cancelado_por = ${canceladoPor},
            atualizado_em = ${agora}
          WHERE id = ${id} AND company_id = ${input.companyId}
            AND status NOT IN ('cancelado')
        `);
        canceladas++;
      }
      return { canceladas };
    }),

  confirmarStatusCobertura: protectedProcedure
    .input(z.object({
      companyId:    z.number(),
      coberturaId:  z.number(),
      novoStatus:   z.enum(["ativo", "cancelado"]),
      motivo:       z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const agora = new Date().toISOString();
      const hoje  = agora.split("T")[0];
      if (input.novoStatus === "ativo") {
        await db.execute(sql`
          UPDATE seguro_vida_coberturas SET
            status        = 'ativo',
            atualizado_em = ${agora}
          WHERE id = ${input.coberturaId} AND company_id = ${input.companyId}
            AND status IN ('pendente_inclusao')
        `);
      } else {
        await db.execute(sql`
          UPDATE seguro_vida_coberturas SET
            status               = 'cancelado',
            data_cancelamento    = ${hoje},
            motivo_cancelamento  = ${input.motivo ?? "Cancelamento manual"},
            cancelado_por        = ${ctx.user.name ?? ""},
            atualizado_em        = ${agora}
          WHERE id = ${input.coberturaId} AND company_id = ${input.companyId}
            AND status IN ('pendente_cancelamento')
        `);
      }
      return { ok: true };
    }),

  importarRelatorio: protectedProcedure
    .input(z.object({
      companyId:     z.number(),
      companyIds:    z.array(z.number()).optional(),
      competencia:   z.string().regex(/^\d{4}-\d{2}$/),
      nomesBrutos:   z.string().min(10),
      apoliceVG:     z.string().optional(),
      apoliceAPC:    z.string().optional(),
      incluirPJ:     z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const ids = resolveCompanyIds(input);

      const seguradosCorretora = parseNomesBrutos(input.nomesBrutos);
      if (seguradosCorretora.length < 5) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Não foram encontrados segurados no texto. Verifique o formato e cole novamente." });
      }

      return executarCruzamento(db, ids, input.companyId, input.competencia, seguradosCorretora, input.nomesBrutos, input.apoliceVG, input.apoliceAPC, ctx.user.name ?? "", undefined, undefined, input.incluirPJ);
    }),

  // ─── NOVO: Processar PDFs em lote (base64) ──────────────────────
  processarPdfLote: protectedProcedure
    .input(z.object({
      companyId:  z.number(),
      companyIds: z.array(z.number()).optional(),
      apoliceVG:  z.string().optional(),
      apoliceAPC: z.string().optional(),
      incluirPJ:  z.boolean().optional(),
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
          const { segurados: seguradosBrutos, padrao } = parsarLinhasSegurados(linhas);
          // Diagnóstico — sempre loga as primeiras 15 linhas para rastrear formato
          const primeiraLinhas = linhas.slice(0, 15).join(" | ").slice(0, 600);
          console.log(`[SeguroVida] ${arq.filename}: ${seguradosBrutos.length} segurado(s) | padrão=${padrao} | linhas[0..15]="${primeiraLinhas}"`);

          // P6 pré-filtro: quando o fallback por nome é usado, valida cada candidato
          // contra a lista real de funcionários — elimina cabeçalhos, rodapés e textos
          // que coincidentemente passaram pelo padrão de nome em MAIÚSCULAS.
          let segurados = seguradosBrutos;
          if (padrao === "P6" && seguradosBrutos.length > 0) {
            const empsNomes = rows(await db.execute(sql`
              SELECT "nomeCompleto" FROM employees
              WHERE "companyId" ${inIds(ids)}
                AND status IN ('Ativo','Ferias')
                AND COALESCE("tipoContrato",'CLT') NOT IN ('PJ','Socio')
                AND "deletedAt" IS NULL
            `));
            const empNormList = empsNomes.map((e: any) => normalizeName(e.nomeCompleto));
            segurados = seguradosBrutos.filter(s => {
              const sNorm = normalizeName(s.nome);
              return empNormList.some(en => nameSimilarity(sNorm, en) >= 0.28);
            });
            console.log(`[SeguroVida] P6 pré-filtro: ${seguradosBrutos.length} candidatos → ${segurados.length} com similaridade ≥ 0.28 vs funcionários`);
          }

          if (segurados.length < 2) {
            const trecho = linhas.slice(0, 10).join("\n");
            resultados.push({
              competencia: competenciaFinal,
              competenciaFallback: !autoDetectado,
              filename: arq.filename,
              erro: `Nenhum segurado encontrado no PDF (padrões testados: P1-P6).\n\nPrimeiras linhas extraídas:\n${trecho}\n\nVerifique se o PDF contém a relação de segurados (não apenas sumário ou capa).`,
            });
            continue;
          }

          const seguradoraDetectada = parseSeguradora(texto);

          const resultado = await executarCruzamento(
            db, ids, input.companyId, competenciaFinal, segurados,
            texto, input.apoliceVG, input.apoliceAPC, ctx.user.name ?? "",
            seguradoraDetectada ?? undefined, arq.fileBase64, input.incluirPJ
          );

          if (seguradoraDetectada) console.log(`[SeguroVida] ${arq.filename}: seguradora detectada = "${seguradoraDetectada}"`);
          resultados.push({ filename: arq.filename, autoDetectado, competenciaFallback: !autoDetectado, seguradoraDetectada, ...resultado });
        } catch (err: any) {
          console.error(`[SeguroVida] Erro inesperado em ${arq.filename}:`, err.message);
          resultados.push({ competencia: arq.competencia, competenciaFallback: true, filename: arq.filename, erro: `Erro: ${err.message}` });
        }
      }

      console.log(`[SeguroVida] processarPdfLote concluído — ${resultados.length} resultado(s)`);
      return { resultados };
    }),

  // Confirma o cruzamento: cria registros de cobertura para funcionários
  // que foram encontrados no PDF e ainda não têm cobertura ativa.
  confirmarCruzamento: protectedProcedure
    .input(z.object({
      companyId:  z.number(),
      companyIds: z.array(z.number()).optional(),
      apoliceVG:  z.string().optional(),
      apoliceAPC: z.string().optional(),
      resultado: z.array(z.object({
        status:      z.string(),
        employeeId:  z.number().optional(),
        item:        z.string().optional(),
        nome:        z.string(),
        coberturaId: z.number().optional(),
        dataAdmissao: z.string().optional(),
        valores:     z.array(z.string()).optional(),
        seguradora:  z.string().nullable().optional(),
      })),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      let criadas = 0;
      let mantidas = 0;

      // Deduplicar por coberturaId: quando múltiplos PDFs são importados juntos,
      // o mesmo funcionário pode aparecer em mais de um resultado.
      // Usamos o resultado com mais valores (maior `valores.length`).
      const deduplicados = new Map<string, typeof input.resultado[0]>();
      for (const r of input.resultado) {
        const key = r.coberturaId ? `cob:${r.coberturaId}` : `emp:${r.employeeId}:${r.status}`;
        const existente = deduplicados.get(key);
        if (!existente || (r.valores?.length ?? 0) > (existente.valores?.length ?? 0)) {
          deduplicados.set(key, r);
        }
      }
      const resultadoFinal = [...deduplicados.values()];

      for (const r of resultadoFinal) {
        if ((r.status === "ok" || r.status === "novo") && r.employeeId) {
          const v = r.valores ?? [];
          const hasInvalidezDoenca = v.length >= 7;
          const covOffset = hasInvalidezDoenca ? 1 : 0;
          const morteNatural    = v[0] ?? null;
          const morteAcidental  = v[1] ?? null;
          const invAcidente     = v[2] ?? null;
          const invDoenca       = hasInvalidezDoenca ? (v[3] ?? null) : null;
          const premioVG        = v[3 + covOffset] ?? null;
          const premioAPC       = v[4 + covOffset] ?? null;
          const seguradora      = r.seguradora ?? null;

          if (r.coberturaId) {
            // Já tem cobertura — atualiza valores se vieram do PDF
            if (v.length > 0) {
              await db.execute(sql`
                UPDATE seguro_vida_coberturas SET
                  morte_natural      = ${morteNatural},
                  morte_acidental    = ${morteAcidental},
                  invalidez_acidente = ${invAcidente},
                  invalidez_doenca   = ${invDoenca},
                  premio_vg          = ${premioVG},
                  premio_apc         = ${premioAPC},
                  seguradora         = COALESCE(${seguradora}, seguradora),
                  item_segurador     = COALESCE(${r.item || null}, item_segurador),
                  atualizado_em      = NOW()
                WHERE id = ${r.coberturaId}
              `);
            }
            mantidas++;
          } else {
            // Verifica se já existe registro ativo para não duplicar
            const existe = rows(await db.execute(sql`
              SELECT id FROM seguro_vida_coberturas
              WHERE company_id = ${input.companyId}
                AND employee_id = ${r.employeeId}
                AND status IN ('ativo','pendente_inclusao')
            `))[0] as any;
            if (!existe) {
              await db.execute(sql`
                INSERT INTO seguro_vida_coberturas
                  (company_id, employee_id, nome_completo, item_segurador,
                   apolice_vg, apolice_apc, status, data_adesao, criado_por,
                   seguradora,
                   morte_natural, morte_acidental, invalidez_acidente, invalidez_doenca,
                   premio_vg, premio_apc)
                VALUES
                  (${input.companyId}, ${r.employeeId}, ${r.nome}, ${r.item || null},
                   ${input.apoliceVG ?? null}, ${input.apoliceAPC ?? null},
                   'ativo', CURRENT_DATE, ${ctx.user.name ?? "Sistema"},
                   ${seguradora},
                   ${morteNatural}, ${morteAcidental}, ${invAcidente}, ${invDoenca},
                   ${premioVG}, ${premioAPC})
              `);
              criadas++;
            } else {
              // Registro já existe — atualiza valores se vieram do PDF
              if (v.length > 0) {
                await db.execute(sql`
                  UPDATE seguro_vida_coberturas SET
                    morte_natural      = ${morteNatural},
                    morte_acidental    = ${morteAcidental},
                    invalidez_acidente = ${invAcidente},
                    invalidez_doenca   = ${invDoenca},
                    premio_vg          = ${premioVG},
                    premio_apc         = ${premioAPC},
                    seguradora         = COALESCE(${seguradora}, seguradora),
                    item_segurador     = COALESCE(${r.item || null}, item_segurador),
                    atualizado_em      = NOW()
                  WHERE id = ${existe.id}
                `);
              }
              mantidas++;
            }
          }
        }
      }

      console.log(`[SeguroVida] confirmarCruzamento: ${criadas} criadas, ${mantidas} já existentes`);
      return { criadas, mantidas };
    }),

  listarImportacoes: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const ids = resolveCompanyIds(input);

      const importacoes = rows(await db.execute(sql`
        SELECT id, competencia, data_importacao, total_segurados, total_ativos,
               total_ok, total_sem_seguro, total_pagar_indevido, total_novos,
               importado_por, criado_em,
               (pdf_dados IS NOT NULL AND pdf_dados <> '') AS tem_pdf
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

  // Rev. 1308: retorna apenas o pdf_dados (base64) de uma importação — para download no cliente
  baixarPdf: protectedProcedure
    .input(z.object({ companyId: z.number(), importacaoId: z.number() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const row = rows(await db.execute(sql`
        SELECT pdf_dados, competencia FROM seguro_vida_importacoes
        WHERE id = ${input.importacaoId} AND company_id = ${input.companyId}
      `))[0] as any;
      if (!row?.pdf_dados) return null;
      return { pdfBase64: row.pdf_dados as string, competencia: row.competencia as string };
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

  listarInconsistencias: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const ids = resolveCompanyIds(input);

      // 1. Demitidos/inativos que ainda têm cobertura ativa
      const demitidos = rows(await db.execute(sql`
        SELECT
          s.id as cobertura_id, s.nome_completo, s.item_segurador,
          s.status as cobertura_status, s.data_adesao,
          s.apolice_vg, s.apolice_apc, s.premio_vg, s.premio_apc,
          e.id as employee_id, e."nomeCompleto" as nome_rh,
          e."cargo", e."funcao", e."tipoContrato",
          e."dataDemissao", e.status as emp_status
        FROM seguro_vida_coberturas s
        JOIN employees e ON e.id = s.employee_id
        WHERE s.company_id ${inIds(ids)}
          AND s.status IN ('ativo','pendente_inclusao')
          AND e.status IN ('Desligado','Blacklist')
          AND e."dataDemissao" IS NOT NULL
          AND e."deletedAt" IS NULL
        ORDER BY e."dataDemissao" DESC NULLS LAST, s.nome_completo
      `));

      // 2. PJs / Sócios com cobertura ativa
      const pjsComCobertura = rows(await db.execute(sql`
        SELECT
          s.id as cobertura_id, s.nome_completo, s.item_segurador,
          s.status as cobertura_status, s.data_adesao,
          s.apolice_vg, s.apolice_apc, s.premio_vg, s.premio_apc,
          e.id as employee_id, e."nomeCompleto" as nome_rh,
          e."cargo", e."funcao", e."tipoContrato"
        FROM seguro_vida_coberturas s
        JOIN employees e ON e.id = s.employee_id
        WHERE s.company_id ${inIds(ids)}
          AND s.status IN ('ativo','pendente_inclusao')
          AND e."tipoContrato" IN ('PJ','Socio')
          AND e.status IN ('Ativo','Ferias')
          AND e."deletedAt" IS NULL
        ORDER BY s.nome_completo
      `));

      // 3. Não identificados — nomes do PDF que não bateram com nenhum funcionário
      //    (status pagar_indevido nas últimas importações distintas por competência)
      const importacoesRecentes = rows(await db.execute(sql`
        SELECT DISTINCT ON (competencia)
          id, competencia, json_resultado, data_importacao, total_pagar_indevido
        FROM seguro_vida_importacoes
        WHERE company_id ${inIds(ids)}
          AND total_pagar_indevido > 0
        ORDER BY competencia DESC, criado_em DESC
        LIMIT 6
      `));

      const naoIdentificados: {
        competencia: string; nome: string; item: string; dataImportacao: string;
        possivelDesligado?: { nome: string; dataDemissao: string | null; status: string };
        possivelPJ?: { nome: string; tipo: string };
      }[] = [];
      for (const imp of importacoesRecentes) {
        let resultado: any[] = [];
        try { resultado = JSON.parse(imp.json_resultado ?? "[]"); } catch { /* skip */ }
        for (const r of resultado) {
          if (r.status === "pagar_indevido") {
            naoIdentificados.push({
              competencia: imp.competencia as string,
              nome: r.nome as string,
              item: (r.item ?? "") as string,
              dataImportacao: (imp.data_importacao ?? "") as string,
              possivelDesligado: r.possivelDesligado,
              possivelPJ: r.possivelPJ,
            });
          }
        }
      }

      return {
        demitidos,
        pjsComCobertura,
        naoIdentificados,
        totalInconsistencias: demitidos.length + pjsComCobertura.length + naoIdentificados.length,
      };
    }),
});
