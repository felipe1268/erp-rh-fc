/**
 * Controle de Cheques (Opção A) — camada de CONTROLE/identificação.
 *
 * Importa a planilha "CONTROLE DE CHEQUES" (abas mensais JAN..DEZ) para a tabela
 * financial_cheques. Os cheques NÃO viram lançamento financeiro (evita duplicar
 * com a importação de Pagamentos, que já inclui os pagos por cheque). Servem para:
 *   1) Consulta/controle (tela com filtros).
 *   2) FONTE DE IDENTIFICAÇÃO na Conciliação Bancária — o extrato da Caixa traz a
 *      linha anônima "COMPENSACAO CHEQUE 000429"; cruzando nº + valor com este
 *      controle, descobrimos o fornecedor.
 *
 * Importador:
 *   - Lê o .xlsx (base64) com a lib xlsx; ignora a aba consolidada "Cheques" (template vazio).
 *   - Valor/Data lidos como valor REAL da célula (serial do Excel), não pelo texto.
 *   - De-para: fornecedor → fornecedores; conta corrente → company_bank_accounts.
 *   - Dedup natural: (company, numero_cheque, valor, ano_ref) → re-upload idempotente.
 *   - importarPreview = relatório dry-run (ZERO gravação); importarConfirmar = grava só NOVO.
 *
 * ZERO ALTER/DROP/DELETE (tabela via self-heal; exclusão é soft via excluido_em).
 */
import { router, protectedProcedure } from "../_core/trpc";
import { getDb, getUserCompanyLinks } from "../db";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { sql } from "drizzle-orm";
import * as XLSX from "xlsx";
import { randomUUID } from "crypto";

// ─────────────────────────── Tenant guard ───────────────────────────
async function assertCompanyAccess(ctxUser: any, companyId: number) {
  if (!ctxUser?.id) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
  if (ctxUser.role === "admin" || ctxUser.role === "admin_master") return;
  const links = await getUserCompanyLinks(ctxUser.id);
  const allowedIds = (links as any[]).map((l: any) => l.companyId).filter((v: any) => typeof v === "number");
  if (allowedIds.length === 0) return;
  if (!allowedIds.includes(companyId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
  }
}

// dbExecute liga params por ORDEM DE APARIÇÃO ($N é cosmético) — ordenar o array
// na mesma ordem em que os placeholders aparecem no texto.
async function dbExecute(db: any, query: string, params: unknown[] = []): Promise<{ rows: any[] }> {
  const parts = query.split(/\$\d+/g);
  let built: any = sql.raw(parts[0] ?? "");
  for (let i = 1; i < parts.length; i++) {
    const tail = parts[i] ?? "";
    built = tail ? sql`${built}${params[i - 1]}${sql.raw(tail)}` : sql`${built}${params[i - 1]}`;
  }
  const res = await db.execute(built);
  return { rows: (res as any)?.rows ?? (Array.isArray(res) ? res : []) };
}

// ─────────────────────────── Parsers ───────────────────────────
const MES_MAP: Record<string, number> = {
  JAN: 1, FEV: 2, MAR: 3, ABR: 4, MAI: 5, JUN: 6,
  JUL: 7, AGO: 8, SET: 9, OUT: 10, NOV: 11, DEZ: 12,
};

function parseSheetName(name: string, anoFallback: number): { mes: number | null; ano: number } {
  const up = (name || "").toUpperCase().trim();
  let mes: number | null = null;
  for (const k of Object.keys(MES_MAP)) { if (up.startsWith(k)) { mes = MES_MAP[k]; break; } }
  const ym = up.match(/(20\d{2})/);
  return { mes, ano: ym ? parseInt(ym[1], 10) : anoFallback };
}

function normTxt(s: any): string {
  return String(s ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();
}
function soDigitos(s: any): string { return String(s ?? "").replace(/[^0-9]/g, ""); }

function parseValor(v: any): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return isNaN(v) ? null : Math.round(Math.abs(v) * 100) / 100;
  let s = String(v).replace(/[R$\s]/g, "").trim();
  if (!s) return null;
  const lastComma = s.lastIndexOf(","), lastDot = s.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    if (lastDot > lastComma) s = s.replace(/,/g, "");          // US: 3,417.21
    else s = s.replace(/\./g, "").replace(",", ".");           // BR: 3.417,21
  } else if (lastComma > -1) {
    const after = s.length - lastComma - 1;
    s = after === 2 ? s.replace(",", ".") : s.replace(/,/g, "");
  }
  const n = parseFloat(s);
  return isNaN(n) ? null : Math.round(Math.abs(n) * 100) / 100;
}

function serialToISO(n: number): string | null {
  // Excel serial (epoch 1899-12-30) → ISO em UTC (determinístico).
  const dt = new Date(Math.round((n - 25569) * 86400 * 1000));
  return isNaN(dt.getTime())
    ? null
    : `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

// Monta ISO só se (yr,mo,da) for uma data de calendário REAL (rejeita 29/02 de ano
// não-bissexto, 31/04 etc.). Sem isso, datas impossíveis da planilha viram strings
// como "2025-02-29" que o Postgres recusa e derrubam o LOTE INTEIRO da importação.
function ymdToISO(yr: number, mo: number, da: number): string | null {
  if (!(mo >= 1 && mo <= 12 && da >= 1 && da <= 31)) return null;
  const dt = new Date(Date.UTC(yr, mo - 1, da));
  if (isNaN(dt.getTime()) || dt.getUTCFullYear() !== yr || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== da)
    return null;
  return `${yr}-${String(mo).padStart(2, "0")}-${String(da).padStart(2, "0")}`;
}

function parseData(v: any): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) {
    return isNaN(v.getTime())
      ? null
      : `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, "0")}-${String(v.getUTCDate()).padStart(2, "0")}`;
  }
  if (typeof v === "number") return serialToISO(v);
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    let yr = parseInt(m[3], 10); if (yr < 100) yr += 2000;
    let mo = parseInt(m[1], 10), da = parseInt(m[2], 10); // planilha é US (M/D/Y)
    if (mo > 12 && da <= 12) { const t = mo; mo = da; da = t; } // corrige se vier BR
    return ymdToISO(yr, mo, da); // null se a data não existir (ex.: 29/02/2025)
  }
  // Formato ISO em texto (YYYY-MM-DD…): validar via ymdToISO p/ não aceitar data impossível.
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return ymdToISO(parseInt(iso[1], 10), parseInt(iso[2], 10), parseInt(iso[3], 10));
  const dt = new Date(s);
  return isNaN(dt.getTime()) ? null : dt.toISOString().slice(0, 10);
}

function normStatus(obs: any, dataComp: string | null): string {
  const o = normTxt(obs);
  if (/compensad/.test(o)) return "compensado";
  if (/sustad/.test(o)) return "sustado";
  if (/cancelad/.test(o)) return "cancelado";
  if (/devolvid/.test(o)) return "devolvido";
  if (/descontar|faltam.*dia|a descontar|pendente|aguard/.test(o)) return "pendente";
  if (dataComp) return "compensado";
  return o ? "pendente" : "indefinido";
}

const STATUS_VALIDOS = ["compensado", "pendente", "sustado", "cancelado", "devolvido", "indefinido"] as const;

// Linha já normalizada da planilha.
type ChequeRow = {
  parcela: string | null; fornecedorNome: string | null; bancoCodigo: string | null;
  bancoNome: string | null; agencia: string | null; contaCorrenteRaw: string | null;
  numeroCheque: string | null; nf: string | null; valor: number | null;
  dataVencimento: string | null; dataCompensacao: string | null; status: string;
  observacao: string | null; mes: number | null; ano: number;
  // Origem na planilha (pra o usuário localizar/corrigir a linha no Excel).
  aba: string; linhaExcel: number;
};

// Aba (planilha) que o importador NÃO leu, com o motivo + quantas linhas com cara
// de cheque ela continha (pra mapear/consultar dados que ficaram de fora).
type AbaIgnorada = { nome: string; motivo: string; linhas: number };

// Faz o parsing completo do .xlsx (base64) → linhas normalizadas. Ignora abas
// que não são meses (ex.: "Cheques"/"cheques" consolidada, "RESUMO ...").
function parseWorkbook(fileBase64: string, anoFallback: number): { rows: ChequeRow[]; abasLidas: string[]; abasIgnoradas: AbaIgnorada[] } {
  const wb = XLSX.read(fileBase64, { type: "base64" });
  const rows: ChequeRow[] = [];
  const abasLidas: string[] = [];
  const abasIgnoradas: AbaIgnorada[] = [];
  // Conta linhas que "parecem cheque" (nº do cheque OU valor) — mesma heurística do
  // parser — pra avisar quando uma aba PULADA na verdade tem dados a cadastrar.
  const contarLinhasCheque = (aoa: any[][]): number => {
    let c = 0;
    for (let i = 3; i < aoa.length; i++) {
      const r = aoa[i] || [];
      const numeroCheque = r[6] != null ? String(r[6]).trim() : "";
      const valor = parseValor(r[8]);
      if (numeroCheque || valor != null) c++;
    }
    return c;
  };
  for (const sheetName of wb.SheetNames) {
    const { mes, ano } = parseSheetName(sheetName, anoFallback);
    const ws = wb.Sheets[sheetName];
    const aoa: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
    if (mes == null) {
      abasIgnoradas.push({ nome: sheetName, motivo: "Não é uma aba de mês (ex.: consolidado/resumo)", linhas: contarLinhasCheque(aoa) });
      continue;
    }
    let lidas = 0;
    for (let i = 3; i < aoa.length; i++) {
      const r = aoa[i] || [];
      const numeroCheque = r[6] != null ? String(r[6]).trim() : "";
      const valor = parseValor(r[8]);
      if (!numeroCheque && valor == null) continue; // linha vazia
      const dataCompensacao = parseData(r[10]);
      const dataVencimento = parseData(r[9]);
      // ANO AUTOMÁTICO: a verdade está na própria linha. Prioriza a data de
      // vencimento, depois a de compensação, e só então cai pro ano da aba/fallback.
      const anoDeData = (iso: string | null): number | null => {
        if (!iso) return null;
        const y = parseInt(iso.slice(0, 4), 10);
        return y >= 2000 && y <= 2100 ? y : null;
      };
      const anoLinha = anoDeData(dataVencimento) ?? anoDeData(dataCompensacao) ?? ano;
      rows.push({
        parcela: r[0] != null ? String(r[0]).trim().slice(0, 20) : null,
        fornecedorNome: r[1] != null ? String(r[1]).trim().slice(0, 255) : null,
        bancoCodigo: r[2] != null ? String(r[2]).trim().slice(0, 20) : null,
        bancoNome: r[3] != null ? String(r[3]).trim().slice(0, 120) : null,
        agencia: r[4] != null ? String(r[4]).trim().slice(0, 20) : null,
        contaCorrenteRaw: r[5] != null ? String(r[5]).trim().slice(0, 60) : null,
        numeroCheque: numeroCheque ? numeroCheque.slice(0, 30) : null,
        nf: r[7] != null ? String(r[7]).trim().slice(0, 60) : null,
        valor,
        dataVencimento,
        dataCompensacao,
        status: normStatus(r[11], dataCompensacao),
        observacao: r[11] != null ? String(r[11]).trim().slice(0, 500) : null,
        mes, ano: anoLinha,
        aba: sheetName, linhaExcel: i + 1,
      });
      lidas++;
    }
    if (lidas > 0) abasLidas.push(`${sheetName} (${lidas})`);
    else abasIgnoradas.push({ nome: sheetName, motivo: "Aba de mês sem cheques válidos", linhas: contarLinhasCheque(aoa) });
  }
  return { rows, abasLidas, abasIgnoradas };
}

// ─────────────────────────── De-para ───────────────────────────
async function carregarFornecedores(db: any, companyId: number) {
  const res = await dbExecute(db,
    `SELECT id, razao_social AS "razaoSocial", nome_fantasia AS "nomeFantasia"
       FROM fornecedores WHERE company_id=$1`, [companyId]);
  return res.rows.map((f: any) => ({
    id: f.id,
    chaves: [normTxt(f.razaoSocial), normTxt(f.nomeFantasia)].filter(Boolean),
  }));
}
function matchFornecedor(nome: string | null, lista: { id: number; chaves: string[] }[]): number | null {
  const n = normTxt(nome);
  if (!n) return null;
  for (const f of lista) if (f.chaves.includes(n)) return f.id;               // exato
  for (const f of lista) for (const c of f.chaves) {                          // contém (guard de tamanho)
    if (c.length >= 4 && (c.includes(n) || n.includes(c))) return f.id;
  }
  return null;
}

async function carregarContas(db: any, companyId: number) {
  const res = await dbExecute(db,
    `SELECT id, conta, banco, apelido FROM company_bank_accounts
       WHERE "companyId"=$1 AND ativo=1 AND "deletedAt" IS NULL`, [companyId]);
  return res.rows.map((c: any) => ({ id: c.id, digitos: soDigitos(c.conta) }));
}
function matchConta(contaRaw: string | null, lista: { id: number; digitos: string }[]): number | null {
  const d = soDigitos(contaRaw);
  if (d.length < 4) return null;
  for (const c of lista) if (c.digitos && c.digitos === d) return c.id;       // exato
  for (const c of lista) if (c.digitos && (c.digitos.includes(d) || d.includes(c.digitos))) return c.id;
  return null;
}

// Dedup natural: (company, numero_cheque, valor centavos, ano, mes). Inclui o MÊS
// para não colidir cheques DISTINTOS com mesmo nº+valor em meses diferentes (talões/
// contas diferentes); como cada cheque vive em UMA aba mensal, o re-upload segue idempotente.
async function carregarExistentes(db: any, companyId: number): Promise<Set<string>> {
  const res = await dbExecute(db,
    `SELECT numero_cheque AS n, valor AS v, ano_ref AS a, mes_ref AS m
       FROM financial_cheques WHERE company_id=$1 AND excluido_em IS NULL`, [companyId]);
  const set = new Set<string>();
  for (const r of res.rows) {
    const cents = r.v != null ? Math.round(parseFloat(r.v) * 100) : "";
    set.add(`${String(r.n ?? "").trim()}|${cents}|${r.a ?? ""}|${r.m ?? ""}`);
  }
  return set;
}
function chaveDedup(row: ChequeRow): string {
  const cents = row.valor != null ? Math.round(row.valor * 100) : "";
  return `${row.numeroCheque ?? ""}|${cents}|${row.ano}|${row.mes ?? ""}`;
}

// ─────────────────────────── Router ───────────────────────────
export const chequesRouter = router({

  // Relatório dry-run — ZERO gravação.
  importarPreview: protectedProcedure.input(z.object({
    companyId: z.number(),
    // ano agora é OPCIONAL — o ERP deriva o ano de cada linha pela própria data
    // da planilha; este valor só é fallback p/ linhas sem data nem ano na aba.
    ano: z.number().int().min(2000).max(2100).optional(),
    fileBase64: z.string().min(10),
  })).mutation(async ({ input, ctx }) => {
    await assertCompanyAccess(ctx.user, input.companyId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    let parsed;
    try { parsed = parseWorkbook(input.fileBase64, input.ano ?? new Date().getFullYear()); }
    catch (e: any) { throw new TRPCError({ code: "BAD_REQUEST", message: `Não consegui ler a planilha: ${e?.message || e}` }); }

    const [fornecedores, contas, existentes] = await Promise.all([
      carregarFornecedores(db, input.companyId),
      carregarContas(db, input.companyId),
      carregarExistentes(db, input.companyId),
    ]);

    const vistosNoArquivo = new Set<string>();
    let novos = 0, jaExistem = 0, dupNoArquivo = 0, semFornecedor = 0, semConta = 0, semValor = 0, valorTotalNovos = 0;
    const porMes: Record<string, { mes: number; novos: number; jaExistem: number; valor: number }> = {};
    // Lista COMPLETA de TODAS as linhas lidas (não só amostra) — pra o usuário VER,
    // FILTRAR e VALIDAR cada cheque (duplicados, sem conta, sem fornecedor, sem valor)
    // e localizar/corrigir a linha exata no Excel (aba + linha).
    const linhas: any[] = [];

    for (const row of parsed.rows) {
      const fornecedorId = matchFornecedor(row.fornecedorNome, fornecedores);
      const contaBancariaId = matchConta(row.contaCorrenteRaw, contas);
      const temFornecedor = !!fornecedorId;
      const temConta = !!contaBancariaId;
      const temValor = row.valor != null && row.valor > 0;
      if (!temFornecedor) semFornecedor++;
      if (!temConta) semConta++;
      if (!temValor) semValor++;
      const chave = chaveDedup(row);
      let situacao: "NOVO" | "JA_EXISTE" | "DUP_ARQUIVO";
      if (existentes.has(chave)) { situacao = "JA_EXISTE"; jaExistem++; }
      else if (vistosNoArquivo.has(chave)) { situacao = "DUP_ARQUIVO"; dupNoArquivo++; }
      else { situacao = "NOVO"; novos++; valorTotalNovos += row.valor ?? 0; vistosNoArquivo.add(chave); }

      const mk = `${row.ano}-${String(row.mes).padStart(2, "0")}`;
      if (!porMes[mk]) porMes[mk] = { mes: row.mes ?? 0, novos: 0, jaExistem: 0, valor: 0 };
      if (situacao === "NOVO") { porMes[mk].novos++; porMes[mk].valor += row.valor ?? 0; }
      else if (situacao === "JA_EXISTE") porMes[mk].jaExistem++;

      linhas.push({
        aba: row.aba, linhaExcel: row.linhaExcel, mes: row.mes, ano: row.ano,
        numeroCheque: row.numeroCheque, fornecedorNome: row.fornecedorNome,
        fornecedorIdentificado: temFornecedor, contaCorrenteRaw: row.contaCorrenteRaw,
        contaIdentificada: temConta, semValor: !temValor,
        valor: row.valor, dataVencimento: row.dataVencimento, dataCompensacao: row.dataCompensacao,
        status: row.status, situacao,
      });
    }

    return {
      resumo: {
        totalLinhas: parsed.rows.length, novos, jaExistem, dupNoArquivo,
        semFornecedor, semConta, semValor, valorTotalNovos: Math.round(valorTotalNovos * 100) / 100,
      },
      abasLidas: parsed.abasLidas,
      abasIgnoradas: parsed.abasIgnoradas,
      porMes: Object.entries(porMes).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => ({ ref: k, ...v })),
      // Compat: `amostra` segue existindo (primeiras 40) p/ clientes antigos; a UI nova usa `linhas`.
      amostra: linhas.slice(0, 40),
      linhas,
    };
  }),

  // Gravação — insere só NOVO em transação, com lote rastreável.
  importarConfirmar: protectedProcedure.input(z.object({
    companyId: z.number(),
    // ano OPCIONAL — derivado por linha da data da planilha (ver importarPreview).
    ano: z.number().int().min(2000).max(2100).optional(),
    fileBase64: z.string().min(10),
    origemArquivo: z.string().max(255).optional(),
  })).mutation(async ({ input, ctx }) => {
    await assertCompanyAccess(ctx.user, input.companyId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    let parsed;
    try { parsed = parseWorkbook(input.fileBase64, input.ano ?? new Date().getFullYear()); }
    catch (e: any) { throw new TRPCError({ code: "BAD_REQUEST", message: `Não consegui ler a planilha: ${e?.message || e}` }); }

    const [fornecedores, contas, existentes] = await Promise.all([
      carregarFornecedores(db, input.companyId),
      carregarContas(db, input.companyId),
      carregarExistentes(db, input.companyId),
    ]);

    const loteId = randomUUID();
    const origem = (input.origemArquivo || "planilha").slice(0, 255);
    const vistos = new Set<string>();
    let inseridos = 0, pulados = 0;

    await db.transaction(async (tx: any) => {
      for (const row of parsed.rows) {
        const chave = chaveDedup(row);
        if (existentes.has(chave) || vistos.has(chave)) { pulados++; continue; }
        vistos.add(chave);
        const fornecedorId = matchFornecedor(row.fornecedorNome, fornecedores);
        const contaBancariaId = matchConta(row.contaCorrenteRaw, contas);
        await dbExecute(tx,
          `INSERT INTO financial_cheques
             (company_id, conta_bancaria_id, conta_corrente_raw, banco_codigo, banco_nome,
              agencia, numero_cheque, fornecedor_nome, fornecedor_id, parcela, nf, valor,
              data_vencimento, data_compensacao, status, observacao, mes_ref, ano_ref,
              origem_arquivo, lote_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
          [
            input.companyId, contaBancariaId, row.contaCorrenteRaw, row.bancoCodigo, row.bancoNome,
            row.agencia, row.numeroCheque, row.fornecedorNome, fornecedorId, row.parcela, row.nf, row.valor,
            row.dataVencimento, row.dataCompensacao, row.status, row.observacao, row.mes, row.ano,
            origem, loteId,
          ]);
        inseridos++;
      }
    });

    return { inseridos, pulados, loteId };
  }),

  // Listagem com filtros.
  listar: protectedProcedure.input(z.object({
    companyId: z.number(),
    status: z.string().optional(),
    contaBancariaId: z.number().optional(),
    fornecedor: z.string().optional(),
    mes: z.number().int().min(1).max(12).optional(),
    ano: z.number().int().optional(),
    conciliado: z.boolean().optional(),
    busca: z.string().optional(),
    limit: z.number().int().min(1).max(2000).default(1000),
  })).query(async ({ input, ctx }) => {
    await assertCompanyAccess(ctx.user, input.companyId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const where: string[] = [`company_id=$1`, `excluido_em IS NULL`];
    const params: unknown[] = [input.companyId];
    let p = 2;
    if (input.status) { where.push(`status=$${p++}`); params.push(input.status); }
    if (input.contaBancariaId != null) { where.push(`conta_bancaria_id=$${p++}`); params.push(input.contaBancariaId); }
    if (input.mes != null) { where.push(`mes_ref=$${p++}`); params.push(input.mes); }
    if (input.ano != null) { where.push(`ano_ref=$${p++}`); params.push(input.ano); }
    if (input.conciliado != null) { where.push(`conciliado=$${p++}`); params.push(input.conciliado ? 1 : 0); }
    if (input.fornecedor) { where.push(`LOWER(fornecedor_nome) LIKE $${p++}`); params.push(`%${input.fornecedor.toLowerCase()}%`); }
    if (input.busca) {
      where.push(`(numero_cheque ILIKE $${p} OR LOWER(fornecedor_nome) LIKE $${p + 1})`);
      params.push(`%${input.busca}%`, `%${input.busca.toLowerCase()}%`); p += 2;
    }
    const res = await dbExecute(db,
      `SELECT id, company_id AS "companyId", conta_bancaria_id AS "contaBancariaId",
              conta_corrente_raw AS "contaCorrenteRaw", banco_codigo AS "bancoCodigo",
              banco_nome AS "bancoNome", agencia, numero_cheque AS "numeroCheque",
              fornecedor_nome AS "fornecedorNome", fornecedor_id AS "fornecedorId",
              obra_id AS "obraId", obra_nome AS "obraNome", parcela, nf, valor,
              data_vencimento AS "dataVencimento", data_compensacao AS "dataCompensacao",
              status, observacao, mes_ref AS "mes", ano_ref AS "ano",
              origem_arquivo AS "origemArquivo", lote_id AS "loteId",
              conciliado, data_conciliacao AS "dataConciliacao",
              created_at AS "createdAt"
         FROM financial_cheques
        WHERE ${where.join(" AND ")}
        ORDER BY ano_ref DESC, mes_ref DESC, data_vencimento DESC NULLS LAST, id DESC
        LIMIT $${p}`,
      [...params, input.limit]);
    return res.rows;
  }),

  // Cards de resumo por status (ano e mês opcionais).
  resumo: protectedProcedure.input(z.object({
    companyId: z.number(),
    ano: z.number().int().optional(),
    mes: z.number().int().min(1).max(12).optional(),
  })).query(async ({ input, ctx }) => {
    await assertCompanyAccess(ctx.user, input.companyId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    // dbExecute liga params por ORDEM DE APARIÇÃO ($N é cosmético) — manter a
    // ordem do array idêntica à ordem dos placeholders na string.
    const params: unknown[] = [input.companyId];
    let extra = "";
    let pi = 2;
    if (input.ano != null) { extra += ` AND ano_ref=$${pi++}`; params.push(input.ano); }
    if (input.mes != null) { extra += ` AND mes_ref=$${pi++}`; params.push(input.mes); }
    const res = await dbExecute(db,
      `SELECT status, COUNT(*)::int AS qtd, COALESCE(SUM(valor),0) AS total
         FROM financial_cheques
        WHERE company_id=$1 AND excluido_em IS NULL ${extra}
        GROUP BY status`, params);
    return res.rows.map((r: any) => ({ status: r.status, qtd: r.qtd, total: parseFloat(r.total) || 0 }));
  }),

  // Resumo POR MÊS do ano (para a régua de meses em chips, no mesmo padrão da
  // Conciliação Bancária): por mês retorna qtd total e qtd compensados, pra
  // pintar a bolinha de status (cinza=sem dados / verde=tudo compensado / azul=tem pendência).
  resumoMensal: protectedProcedure.input(z.object({
    companyId: z.number(),
    ano: z.number().int(),
  })).query(async ({ input, ctx }) => {
    await assertCompanyAccess(ctx.user, input.companyId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const res = await dbExecute(db,
      `SELECT mes_ref AS "mes", COUNT(*)::int AS qtd,
              COUNT(*) FILTER (WHERE status='compensado')::int AS compensados
         FROM financial_cheques
        WHERE company_id=$1 AND excluido_em IS NULL AND ano_ref=$2
        GROUP BY mes_ref`,
      [input.companyId, input.ano]);
    return res.rows.map((r: any) => ({ mes: r.mes, qtd: r.qtd, compensados: r.compensados }));
  }),

  // Edição manual (status, fornecedor, conta, obra, observação).
  atualizar: protectedProcedure.input(z.object({
    id: z.number(),
    companyId: z.number(),
    status: z.enum(STATUS_VALIDOS).optional(),
    fornecedorNome: z.string().max(255).optional(),
    fornecedorId: z.number().nullable().optional(),
    contaBancariaId: z.number().nullable().optional(),
    obraId: z.number().nullable().optional(),
    obraNome: z.string().max(255).nullable().optional(),
    dataCompensacao: z.string().nullable().optional(),
    observacao: z.string().max(500).nullable().optional(),
  })).mutation(async ({ input, ctx }) => {
    await assertCompanyAccess(ctx.user, input.companyId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const sets: string[] = []; const params: unknown[] = [];
    let p = 1;
    const add = (col: string, val: unknown) => { sets.push(`${col}=$${p++}`); params.push(val); };
    if (input.status !== undefined) add("status", input.status);
    if (input.fornecedorNome !== undefined) add("fornecedor_nome", input.fornecedorNome);
    if (input.fornecedorId !== undefined) add("fornecedor_id", input.fornecedorId);
    if (input.contaBancariaId !== undefined) add("conta_bancaria_id", input.contaBancariaId);
    if (input.obraId !== undefined) add("obra_id", input.obraId);
    if (input.obraNome !== undefined) add("obra_nome", input.obraNome);
    if (input.dataCompensacao !== undefined) add("data_compensacao", input.dataCompensacao);
    if (input.observacao !== undefined) add("observacao", input.observacao);
    if (sets.length === 0) return { ok: true, alterado: 0 };
    sets.push(`updated_at=NOW()`);
    const idP = p++, coP = p;
    const res = await dbExecute(db,
      `UPDATE financial_cheques SET ${sets.join(", ")}
        WHERE id=$${idP} AND company_id=$${coP} AND excluido_em IS NULL RETURNING id`,
      [...params, input.id, input.companyId]);
    return { ok: true, alterado: res.rows.length };
  }),

  // Exclusão (soft).
  excluir: protectedProcedure.input(z.object({
    id: z.number(), companyId: z.number(),
  })).mutation(async ({ input, ctx }) => {
    await assertCompanyAccess(ctx.user, input.companyId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const res = await dbExecute(db,
      `UPDATE financial_cheques SET excluido_em=NOW()
        WHERE id=$1 AND company_id=$2 AND excluido_em IS NULL RETURNING id`,
      [input.id, input.companyId]);
    return { ok: true, excluido: res.rows.length };
  }),

  // Reverter um lote de importação inteiro (soft).
  reverterLote: protectedProcedure.input(z.object({
    companyId: z.number(), loteId: z.string(),
  })).mutation(async ({ input, ctx }) => {
    await assertCompanyAccess(ctx.user, input.companyId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const res = await dbExecute(db,
      `UPDATE financial_cheques SET excluido_em=NOW()
        WHERE company_id=$1 AND lote_id=$2 AND excluido_em IS NULL RETURNING id`,
      [input.companyId, input.loteId]);
    return { ok: true, revertidos: res.rows.length };
  }),

  // ── PRÉVIA da limpeza (read-only): quantos cheques o MÊS/ANO tem e quantos já
  //    estão conciliados num extrato. O front usa pra mostrar o aviso vermelho e
  //    (se houver conciliados) o bloqueio ANTES de pedir a senha. mes ausente/null
  //    = ano inteiro.
  limparPreview: protectedProcedure.input(z.object({
    companyId: z.number(),
    ano: z.number().int(),
    mes: z.number().int().min(1).max(12).nullable().optional(),
  })).query(async ({ input, ctx }) => {
    await assertCompanyAccess(ctx.user, input.companyId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const params: unknown[] = [input.companyId, input.ano];
    let extra = "";
    if (input.mes != null) { extra = ` AND mes_ref=$3`; params.push(input.mes); }
    const res = await dbExecute(db,
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE conciliado=1)::int AS conciliados,
              COUNT(*) FILTER (WHERE status='compensado')::int AS compensados,
              COALESCE(SUM(valor),0) AS valor
         FROM financial_cheques
        WHERE company_id=$1 AND excluido_em IS NULL AND ano_ref=$2 ${extra}`,
      params);
    const r = res.rows[0] || {};
    const total = Number(r.total) || 0;
    const conciliados = Number(r.conciliados) || 0;
    const compensados = Number(r.compensados) || 0;
    // "Consolidado" = mesmo critério da régua de meses do front (tudo compensado).
    const consolidado = total > 0 && compensados >= total;
    return {
      total, conciliados, compensados, consolidado,
      valor: parseFloat(r.valor) || 0,
      // Bloqueia quando há cheque conciliado em extrato (quebraria a conciliação
      // já consolidada). Sinaliza o motivo pro aviso do front.
      bloqueado: conciliados > 0,
    };
  }),

  // ── LIMPAR o cadastro de cheques do MÊS ou do ANO inteiro (soft-delete).
  //    Pedido (piloto FC): botão pra limpar os registros do mês e do ano inteiro,
  //    com DUPLA confirmação + SENHA do usuário logado conferida no BACKEND +
  //    alerta vermelho no front. GUARDA DE INTEGRIDADE: se QUALQUER cheque do
  //    período já estiver CONCILIADO num extrato (conciliado=1), o ERP PROÍBE a
  //    limpeza — não pode apagar cheque que já bateu num extrato consolidado, pra
  //    não gerar erro na conciliação bancária. Exclusão é SOFT (excluido_em).
  //    mes ausente/null = ano inteiro.
  limparCadastro: protectedProcedure.input(z.object({
    companyId: z.number(),
    ano: z.number().int(),
    mes: z.number().int().min(1).max(12).nullable().optional(),
    password: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    await assertCompanyAccess(ctx.user, input.companyId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    // 1) Senha do usuário logado conferida no BACKEND (bcrypt). OAuth sem senha
    //    local é liberado pela própria credencial da sessão (mesma semântica do
    //    wipeMonthEntries / _assertMasterComSenha).
    const ures = await dbExecute(db, `SELECT password FROM users WHERE id=$1`, [ctx.user?.id]);
    const urow = ures.rows[0] as any;
    if (!urow) throw new TRPCError({ code: "UNAUTHORIZED", message: "Usuário não encontrado." });
    if (urow.password) {
      if (!input.password) throw new TRPCError({ code: "BAD_REQUEST", message: "Senha do seu login é obrigatória." });
      const bcrypt = await import("bcryptjs");
      if (!bcrypt.compareSync(input.password, urow.password)) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Senha incorreta. Operação cancelada." });
      }
    }
    // 2) GUARDA: bloqueia se houver cheque CONCILIADO no período.
    const cntParams: unknown[] = [input.companyId, input.ano];
    let cntExtra = "";
    if (input.mes != null) { cntExtra = ` AND mes_ref=$3`; cntParams.push(input.mes); }
    const cnt = await dbExecute(db,
      `SELECT COUNT(*) FILTER (WHERE conciliado=1)::int AS conciliados,
              COUNT(*)::int AS total
         FROM financial_cheques
        WHERE company_id=$1 AND excluido_em IS NULL AND ano_ref=$2 ${cntExtra}`,
      cntParams);
    const conciliados = Number(cnt.rows[0]?.conciliados) || 0;
    const total = Number(cnt.rows[0]?.total) || 0;
    if (conciliados > 0) {
      const escopo = input.mes != null ? `do mês ${input.mes}/${input.ano}` : `do ano ${input.ano}`;
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Limpeza bloqueada: ${conciliados} cheque(s) ${escopo} já foram conciliados em algum extrato (mês consolidado). Apagar geraria erro na conciliação bancária. Reverta a conciliação desses cheques antes de limpar.`,
      });
    }
    if (total === 0) return { ok: true, removidos: 0 };
    // 3) Soft-delete do período.
    const delParams: unknown[] = [input.companyId, input.ano];
    let delExtra = "";
    if (input.mes != null) { delExtra = ` AND mes_ref=$3`; delParams.push(input.mes); }
    const res = await dbExecute(db,
      `UPDATE financial_cheques SET excluido_em=NOW()
        WHERE company_id=$1 AND excluido_em IS NULL AND ano_ref=$2 ${delExtra}
        RETURNING id`,
      delParams);
    return { ok: true, removidos: res.rows.length };
  }),
});
