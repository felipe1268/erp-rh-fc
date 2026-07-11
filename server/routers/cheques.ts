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
import { invokeGeminiVision, invokeAnthropicVision } from "../_core/llm";
import { detectarParesEstorno, type ParEstorno } from "../../shared/chequeMotivos";

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

// ───────────── Dupla checagem extrato ↔ cheque (Rev. 3234) ─────────────
// Cruza cada cheque do controle com o EXTRATO BANCÁRIO já importado
// (bank_statement_lines) pra dizer se o banco REALMENTE compensou aquela folha.
// Espelha a estratégia de match da Conciliação Bancária (financial.ts, Rev. 3229),
// da mais forte p/ a mais fraca:
//   (1) nº do cheque extraído da descrição do extrato + VALOR (exige a palavra "cheque");
//   (2) fallback VALOR + DATA (== data_compensacao do cheque) QUANDO ÚNICO e a descrição
//       parece de cheque/compensação (trava p/ não casar PIX/tarifa de mesmo valor+data).
// SÓ LEITURA — esta função não grava nada.
type MatchExtrato = {
  encontrado: boolean;
  dataExtrato: string | null;
  forte: boolean;
  // Rev. 3235 — o débito que casou com este cheque foi DEPOIS estornado (cheque
  // devolvido/sustado no extrato): a compensação NÃO se concretizou.
  devolvido: boolean;
  motivoCodigo: number | null;
  motivoTexto: string | null;
};
async function montarMatcherExtrato(db: any, companyId: number): Promise<(cheque: any) => MatchExtrato> {
  const res = await dbExecute(db,
    `SELECT id, data, descricao, valor
       FROM bank_statement_lines
      WHERE company_id=$1 AND excluido_em IS NULL`,
    [companyId]);
  const cents = (v: any) => (v != null && v !== "" ? Math.round(Math.abs(Number(v)) * 100) : null);
  const dia = (v: any) => (v ? String(v).slice(0, 10) : null);
  const extrNum = (descricao: any): string | null => {
    const m = String(descricao ?? "").match(/cheque\s*n?[ºo°.]*\s*0*(\d{1,12})/i);
    if (m && m[1]) return m[1].replace(/^0+/, "") || m[1];
    return null;
  };
  const pareceCheque = (descricao: any) => /cheq|compensa/i.test(String(descricao ?? ""));
  // Rev. 3235 — antes de indexar, descobre os PARES DE ESTORNO (débito do cheque +
  // crédito de devolução do MESMO cheque). O débito estornado NÃO pode confirmar o
  // cheque (a compensação foi revertida); ele sai dos índices de match e vira um sinal
  // próprio "devolvido" com o motivo (alínea Bacen) p/ o controle exibir e analisar.
  const linhas = (res.rows as any[]);
  const pares = detectarParesEstorno(linhas.map((l) => ({
    id: l.id, valorCents: cents(l.valor), isCredito: Number(l.valor) >= 0, descricao: l.descricao, data: dia(l.data),
  })));
  const devolvidoPorDebitoId = new Map<any, ParEstorno>();
  for (const p of pares) devolvidoPorDebitoId.set(p.debitoId, p);
  // AMBOS os índices guardam LISTAS e só confirmam quando ÚNICO. Como esta procedure
  // GRAVA conciliado=1 (≠ Rev. 3229 que só exibe), o match forte nº+valor também exige
  // unicidade: se o extrato tiver 2 linhas com mesmo nº+valor (reapresentação/estorno/
  // histórico em anos diferentes), fica AMBÍGUO → "não encontrado" (entra em "a conferir",
  // jamais marca cheque errado). Isso cobre o falso-positivo e a colisão histórica.
  const byNumVal = new Map<string, any[]>();  // "num|cents" → linhas (match forte, só quando único)
  const byValData = new Map<string, any[]>(); // "cents|dia" → linhas (match fraco, só quando único)
  const devByNumVal = new Map<string, ParEstorno>();  // "num|cents" → par de estorno (débito devolvido)
  const devByValData = new Map<string, ParEstorno>(); // "cents|dia" → par de estorno (débito devolvido)
  for (const l of linhas) {
    const cts = cents(l.valor);
    if (cts == null || cts === 0) continue;
    const par = devolvidoPorDebitoId.get(l.id);
    const num = extrNum(l.descricao);
    const d = pareceCheque(l.descricao) ? dia(l.data) : null;
    if (par) {
      // Débito ESTORNADO: fora dos índices de confirmação; entra nos mapas "devolvido".
      if (num) devByNumVal.set(`${num}|${cts}`, par);
      if (d) devByValData.set(`${cts}|${d}`, par);
      continue;
    }
    if (num) { const k = `${num}|${cts}`; if (!byNumVal.has(k)) byNumVal.set(k, []); byNumVal.get(k)!.push(l); }
    if (d) { const k = `${cts}|${d}`; if (!byValData.has(k)) byValData.set(k, []); byValData.get(k)!.push(l); }
  }
  const devolvidoHit = (par: ParEstorno | undefined): MatchExtrato | null => {
    if (!par) return null;
    return { encontrado: false, dataExtrato: par.dataCredito ?? par.dataDebito ?? null, forte: false,
      devolvido: true, motivoCodigo: par.motivo?.codigo ?? null, motivoTexto: par.motivo?.motivo ?? null };
  };
  return function matchCheque(cheque: any): MatchExtrato {
    const cts = cents(cheque.valor);
    const vazio: MatchExtrato = { encontrado: false, dataExtrato: null, forte: false, devolvido: false, motivoCodigo: null, motivoTexto: null };
    if (cts == null || cts === 0) return vazio;
    const num = String(cheque.numeroCheque ?? cheque.numero_cheque ?? "").replace(/[^0-9]/g, "").replace(/^0+/, "");
    const dc = dia(cheque.dataCompensacao ?? cheque.data_compensacao);
    if (num) {
      const arr = byNumVal.get(`${num}|${cts}`);
      if (arr && arr.length === 1) return { ...vazio, encontrado: true, dataExtrato: dia(arr[0].data), forte: true };
      const dev = devolvidoHit(devByNumVal.get(`${num}|${cts}`));
      if (dev) return dev;
    }
    if (dc) {
      const arr = byValData.get(`${cts}|${dc}`);
      if (arr && arr.length === 1) return { ...vazio, encontrado: true, dataExtrato: dia(arr[0].data), forte: false };
      const dev = devolvidoHit(devByValData.get(`${cts}|${dc}`));
      if (dev) return dev;
    }
    return vazio;
  };
}
// Classifica o cheque contra o extrato: confirmado (banco compensou E controle já diz
// "compensado") × divergente (banco compensou MAS controle diz != compensado → ALERTA)
// × devolvido (Rev. 3235 — o débito foi estornado no extrato; compensação não vingou).
function classificarExtrato(status: any, m: MatchExtrato) {
  const compensado = String(status ?? "").toLowerCase() === "compensado";
  return {
    extratoEncontrado: m.encontrado,
    extratoData: m.dataExtrato,
    // Rev. 3372 — expõe a FORÇA do match (nº+valor = forte; valor+data = fraco) p/ o
    // painel de pré-confirmação separar "match forte" (auto-marcável) de "match fraco"
    // (confira antes). `forte` só faz sentido quando o cheque foi encontrado.
    extratoForte: m.encontrado && m.forte,
    extratoConfirmado: m.encontrado && compensado,
    extratoDivergente: m.encontrado && !compensado,
    extratoDevolvido: m.devolvido,
    extratoMotivoCodigo: m.motivoCodigo,
    extratoMotivoTexto: m.motivoTexto,
  };
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

// ─────────────────────────── Leitura por IA (PDF/imagem de cheque) ───────────────────────────
// O usuário pode subir VÁRIOS PDFs/imagens de cheque; a IA lê CADA um, extrai os
// cheques e o ERP deriva mês/ano da DATA do cheque. Mesmo padrão do Cartão de
// Crédito (Gemini primário + Anthropic fallback; JSON com salvage).
const PROMPT_CHEQUE = `Você é um extrator de dados de CHEQUES bancários brasileiros a partir de imagens/PDF (escaneados ou fotos).
O documento pode conter UM ou VÁRIOS cheques (uma página por cheque, vários por página, ou um comprovante/relação de cheques).
Extraia TODOS os cheques encontrados. Para CADA cheque devolva:
- numeroCheque: o número do cheque (string, só dígitos) — costuma estar no topo/canto.
- valor: valor em BRL (número, ponto decimal) — o valor do cheque.
- banco: nome do banco emissor (ex.: "Itaú", "Bradesco", "Caixa", "Santander").
- bancoCodigo: código de compensação do banco (3 dígitos), se visível.
- agencia: número da agência, se visível.
- contaCorrente: número da conta corrente, se visível.
- favorecido: nome do favorecido/beneficiário (a quem o cheque foi emitido — "Pague-se a"/"Pagar a"), se houver.
- data: data do cheque em YYYY-MM-DD (a data de emissão / "bom para" escrita no cheque). É ESSENCIAL para definir o mês/ano.
- cidade: praça/cidade de emissão, se houver.
Regras: NÃO invente valores — use null quando não conseguir ler. Valores monetários SEM separador de milhar e com ponto decimal.
Responda SOMENTE com JSON no formato: { "cheques": [ { ... } ] }`;

const SCHEMA_CHEQUE = {
  type: "object",
  properties: {
    cheques: {
      type: "array",
      items: {
        type: "object",
        properties: {
          numeroCheque: { type: "string", nullable: true },
          valor: { type: "number", nullable: true },
          banco: { type: "string", nullable: true },
          bancoCodigo: { type: "string", nullable: true },
          agencia: { type: "string", nullable: true },
          contaCorrente: { type: "string", nullable: true },
          favorecido: { type: "string", nullable: true },
          data: { type: "string", nullable: true },
          cidade: { type: "string", nullable: true },
        },
      },
    },
  },
} as const;

function salvageJson(text: string): any {
  if (!text) throw new Error("IA não retornou conteúdo.");
  try { return JSON.parse(text); } catch { /* fallback abaixo */ }
  const start = text.indexOf("{"), end = text.lastIndexOf("}");
  if (start > -1 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)); } catch { /* segue erro */ }
  }
  throw new Error("Não consegui interpretar o JSON da IA.");
}

async function lerChequesComIA(fileBase64: string, mimeType: string): Promise<any> {
  const lerAnthropic = async () => {
    const txt = await invokeAnthropicVision({
      prompt: PROMPT_CHEQUE + "\nResponda SOMENTE com JSON válido.",
      files: [{ base64: fileBase64, mimeType }],
      maxTokens: 8192,
    });
    return salvageJson(txt);
  };
  // Gemini é o caminho primário (GOOGLE_API_KEY garantida + suporta PDF/imagem + JSON mode).
  if (process.env.GOOGLE_API_KEY) {
    try {
      const txt = await invokeGeminiVision({
        prompt: PROMPT_CHEQUE,
        base64: fileBase64,
        mimeType,
        responseSchema: SCHEMA_CHEQUE as any,
        maxTokens: 8192,
        thinking: "off",
      });
      return salvageJson(txt);
    } catch (errGemini) {
      // Fallback Anthropic em falha de RUNTIME do Gemini (timeout/quota/5xx).
      // Se o Anthropic não estiver configurado, re-lança o erro original do Gemini.
      try {
        return await lerAnthropic();
      } catch {
        throw errGemini;
      }
    }
  }
  // Sem GOOGLE_API_KEY: Anthropic é o caminho único (se a integração estiver configurada).
  return await lerAnthropic();
}

function clip(s: any, n: number): string | null {
  if (s == null) return null;
  const t = String(s).trim();
  return t ? t.slice(0, n) : null;
}

// Sanitiza uma linha de cheque vinda do CLIENTE (lida por IA antes) — re-valida
// TUDO no servidor (datas reais, valor numérico, status na whitelist, ano/mês
// derivados da data) pra a UI não conseguir injetar lixo na gravação.
function sanitizeChequeRow(r: any): ChequeRow {
  const dataVencimento = parseData(r?.dataVencimento);
  const dataCompensacao = parseData(r?.dataCompensacao);
  const valor = parseValor(r?.valor);
  const anoDeData = (iso: string | null): number | null => {
    if (!iso) return null;
    const y = parseInt(iso.slice(0, 4), 10);
    return y >= 2000 && y <= 2100 ? y : null;
  };
  const ano = anoDeData(dataVencimento) ?? anoDeData(dataCompensacao)
    ?? (Number.isFinite(r?.ano) ? Math.min(2100, Math.max(2000, Math.trunc(r.ano))) : new Date().getFullYear());
  const mesFromData = dataVencimento ? parseInt(dataVencimento.slice(5, 7), 10)
    : (dataCompensacao ? parseInt(dataCompensacao.slice(5, 7), 10) : null);
  const mes = mesFromData ?? (Number.isFinite(r?.mes) && r.mes >= 1 && r.mes <= 12 ? Math.trunc(r.mes) : null);
  const statusRaw = normTxt(r?.status);
  const status = (STATUS_VALIDOS as readonly string[]).includes(statusRaw)
    ? statusRaw : normStatus(r?.status, dataCompensacao);
  const numero = clip(soDigitos(r?.numeroCheque) || r?.numeroCheque, 30);
  return {
    parcela: clip(r?.parcela, 20),
    fornecedorNome: clip(r?.fornecedorNome, 255),
    bancoCodigo: clip(r?.bancoCodigo, 20),
    bancoNome: clip(r?.bancoNome, 120),
    agencia: clip(r?.agencia, 20),
    contaCorrenteRaw: clip(r?.contaCorrenteRaw, 60),
    numeroCheque: numero,
    nf: clip(r?.nf, 60),
    valor,
    dataVencimento,
    dataCompensacao,
    status,
    observacao: clip(r?.observacao, 500),
    mes, ano,
    aba: clip(r?.aba, 120) ?? "PDF",
    linhaExcel: Number.isFinite(r?.linhaExcel) ? Math.trunc(r.linhaExcel) : 0,
  };
}

// Cheque cru da IA → ChequeRow canônico (passa pelo sanitize p/ validar tudo).
function normalizarChequeIA(raw: any, origemNome: string): ChequeRow {
  return sanitizeChequeRow({
    parcela: null,
    fornecedorNome: raw?.favorecido ?? raw?.fornecedor ?? null,
    bancoCodigo: raw?.bancoCodigo ?? null,
    bancoNome: raw?.banco ?? null,
    agencia: raw?.agencia ?? null,
    contaCorrenteRaw: raw?.contaCorrente ?? raw?.conta ?? null,
    numeroCheque: raw?.numeroCheque ?? raw?.numero ?? null,
    nf: null,
    valor: raw?.valor ?? null,
    dataVencimento: raw?.data ?? raw?.dataVencimento ?? null,
    dataCompensacao: null,
    status: "pendente",
    observacao: raw?.cidade ? `Praça: ${String(raw.cidade).trim()}` : null,
    mes: null, ano: 0,
    aba: origemNome,
    linhaExcel: 0,
  });
}

// ─────────────────────────── Relatório dry-run + gravação (compartilhados) ───────────────────────────
// Monta o relatório de prévia (resumo/porMes/linhas) a partir de linhas já
// normalizadas — usado tanto pela planilha quanto pelos PDFs lidos por IA.
function montarRelatorio(
  rows: ChequeRow[],
  fornecedores: { id: number; chaves: string[] }[],
  contas: { id: number; digitos: string }[],
  existentes: Set<string>,
) {
  const vistosNoArquivo = new Set<string>();
  let novos = 0, jaExistem = 0, dupNoArquivo = 0, semFornecedor = 0, semConta = 0, semValor = 0, valorTotalNovos = 0;
  const porMes: Record<string, { mes: number; novos: number; jaExistem: number; valor: number }> = {};
  const linhas: any[] = [];

  for (const row of rows) {
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
      totalLinhas: rows.length, novos, jaExistem, dupNoArquivo,
      semFornecedor, semConta, semValor, valorTotalNovos: Math.round(valorTotalNovos * 100) / 100,
    },
    porMes: Object.entries(porMes).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => ({ ref: k, ...v })),
    amostra: linhas.slice(0, 40),
    linhas,
  };
}

// Insere só os NOVOS (dedup natural) numa transação já aberta — compartilhado
// pela planilha e pelos PDFs.
async function inserirCheques(
  tx: any, companyId: number, rows: ChequeRow[],
  fornecedores: { id: number; chaves: string[] }[],
  contas: { id: number; digitos: string }[],
  existentes: Set<string>, origem: string, loteId: string,
): Promise<{ inseridos: number; pulados: number }> {
  const vistos = new Set<string>();
  let pulados = 0;

  // 1) Dedup + match de fornecedor/conta EM MEMÓRIA → coleta as linhas a gravar.
  const COLS = 20;
  const valoresPorLinha: unknown[][] = [];
  for (const row of rows) {
    const chave = chaveDedup(row);
    if (existentes.has(chave) || vistos.has(chave)) { pulados++; continue; }
    vistos.add(chave);
    const fornecedorId = matchFornecedor(row.fornecedorNome, fornecedores);
    const contaBancariaId = matchConta(row.contaCorrenteRaw, contas);
    valoresPorLinha.push([
      companyId, contaBancariaId, row.contaCorrenteRaw, row.bancoCodigo, row.bancoNome,
      row.agencia, row.numeroCheque, row.fornecedorNome, fornecedorId, row.parcela, row.nf, row.valor,
      row.dataVencimento, row.dataCompensacao, row.status, row.observacao, row.mes, row.ano,
      origem, loteId,
    ]);
  }

  // 2) INSERT multi-linha em CHUNKS — reduz N round-trips (ex.: 1122 → ~12) e
  //    evita o timeout que travava a gravação perto do fim. `dbExecute` liga os
  //    params por ORDEM DE APARIÇÃO, então placeholders e array seguem a mesma
  //    sequência. CHUNK*COLS fica MUITO abaixo do teto de 65535 binds do Postgres.
  const CHUNK = 100; // 100 linhas × 20 cols = 2000 binds por statement
  let inseridos = 0;
  for (let i = 0; i < valoresPorLinha.length; i += CHUNK) {
    const lote = valoresPorLinha.slice(i, i + CHUNK);
    let n = 0;
    const valuesSql = lote
      .map(() => `(${Array.from({ length: COLS }, () => `$${++n}`).join(",")})`)
      .join(",");
    await dbExecute(tx,
      `INSERT INTO financial_cheques
         (company_id, conta_bancaria_id, conta_corrente_raw, banco_codigo, banco_nome,
          agencia, numero_cheque, fornecedor_nome, fornecedor_id, parcela, nf, valor,
          data_vencimento, data_compensacao, status, observacao, mes_ref, ano_ref,
          origem_arquivo, lote_id)
       VALUES ${valuesSql}`,
      lote.flat());
    inseridos += lote.length;
  }
  return { inseridos, pulados };
}

// Schema permissivo p/ as linhas que o cliente devolve da leitura por IA — o
// servidor re-sanitiza tudo via sanitizeChequeRow (não confia no input cru).
const chequeRowInputSchema = z.object({
  parcela: z.string().nullish(),
  fornecedorNome: z.string().nullish(),
  bancoCodigo: z.string().nullish(),
  bancoNome: z.string().nullish(),
  agencia: z.string().nullish(),
  contaCorrenteRaw: z.string().nullish(),
  numeroCheque: z.string().nullish(),
  nf: z.string().nullish(),
  valor: z.number().nullish(),
  dataVencimento: z.string().nullish(),
  dataCompensacao: z.string().nullish(),
  status: z.string().nullish(),
  observacao: z.string().nullish(),
  mes: z.number().nullish(),
  ano: z.number().nullish(),
  aba: z.string().nullish(),
  linhaExcel: z.number().nullish(),
}).passthrough();

// ─────────────────────────── Router ───────────────────────────
// ─────────────────────────── Talões de cheque (Rev. 3343) ───────────────────────────
// Rastreabilidade de FOLHAS: cada talão tem nº do cheque inicial + qtd de folhas.
// Folha "usada" é DERIVADA cruzando financial_cheques.numero_cheque (nº int) por conta;
// folhas_status_json guarda só as EXCEÇÕES manuais ({"125":"perdida","130":"cancelada"}).
type FolhaStatus = "usada" | "disponivel" | "perdida" | "cancelada";

function numCheque(s: any): number | null {
  const d = soDigitos(s == null ? "" : String(s));
  return d ? parseInt(d, 10) : null;
}

// Confere que a conta pertence à empresa (anti-IDOR). Retorna a linha ou lança.
async function assertContaDaEmpresa(db: any, contaId: number, companyId: number) {
  const res = await dbExecute(db,
    `SELECT id, banco, apelido, agencia, conta FROM company_bank_accounts
       WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL LIMIT 1`, [contaId, companyId]);
  if (!res.rows[0]) throw new TRPCError({ code: "FORBIDDEN", message: "Conta bancária não pertence a esta empresa." });
  return res.rows[0];
}

// Carrega o talão + confirma acesso à empresa dele (anti-IDOR por id).
async function carregarTalaoComAcesso(db: any, talaoId: number, ctxUser: any) {
  const res = await dbExecute(db,
    `SELECT * FROM financial_cheque_taloes WHERE id=$1 AND excluido_em IS NULL LIMIT 1`, [talaoId]);
  const t = res.rows[0];
  if (!t) throw new TRPCError({ code: "NOT_FOUND", message: "Talão não encontrado." });
  await assertCompanyAccess(ctxUser, t.company_id);
  return t;
}

export const chequesRouter = router({

  // Lista talões da empresa (opcionalmente de UMA conta) + grade de folhas derivada.
  listarTaloes: protectedProcedure.input(z.object({
    companyId: z.number(),
    contaBancariaId: z.number().nullable().optional(),
  })).query(async ({ input, ctx }) => {
    await assertCompanyAccess(ctx.user, input.companyId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const filtroConta = input.contaBancariaId != null ? ` AND conta_bancaria_id=$2` : "";
    const params: any[] = input.contaBancariaId != null ? [input.companyId, input.contaBancariaId] : [input.companyId];
    const talRes = await dbExecute(db,
      `SELECT * FROM financial_cheque_taloes
         WHERE company_id=$1 AND excluido_em IS NULL${filtroConta}
         ORDER BY conta_bancaria_id ASC, numero_inicial ASC`, params);
    const taloes = talRes.rows;
    if (taloes.length === 0) return [];

    // Cheques da empresa → mapa por `${contaId}:${numInt}` p/ derivar folha "usada".
    const chqRes = await dbExecute(db,
      `SELECT conta_bancaria_id, numero_cheque, valor, fornecedor_nome,
              data_vencimento, data_compensacao, status
         FROM financial_cheques WHERE company_id=$1 AND excluido_em IS NULL`, [input.companyId]);
    const usadas = new Map<string, any>();
    for (const c of chqRes.rows) {
      const n = numCheque(c.numero_cheque);
      if (n == null || c.conta_bancaria_id == null) continue;
      const k = `${c.conta_bancaria_id}:${n}`;
      if (!usadas.has(k)) usadas.set(k, c);
    }

    return taloes.map((t: any) => {
      let exc: Record<string, string> = {};
      try { exc = t.folhas_status_json ? JSON.parse(t.folhas_status_json) : {}; } catch { exc = {}; }
      const ini = Number(t.numero_inicial);
      const fim = Number(t.numero_final);
      const folhas: any[] = [];
      const resumo = { total: 0, usadas: 0, disponiveis: 0, perdidas: 0, canceladas: 0 };
      for (let n = ini; n <= fim; n++) {
        const cheque = usadas.get(`${t.conta_bancaria_id}:${n}`);
        let status: FolhaStatus;
        if (cheque) status = "usada";
        else if (exc[String(n)] === "perdida") status = "perdida";
        else if (exc[String(n)] === "cancelada") status = "cancelada";
        else status = "disponivel";
        resumo.total++;
        if (status === "usada") resumo.usadas++;
        else if (status === "perdida") resumo.perdidas++;
        else if (status === "cancelada") resumo.canceladas++;
        else resumo.disponiveis++;
        folhas.push({
          numero: n,
          status,
          chequeValor: cheque?.valor != null ? Number(cheque.valor) : null,
          chequeFornecedor: cheque?.fornecedor_nome ?? null,
          chequeStatus: cheque?.status ?? null,
        });
      }
      return {
        id: t.id,
        contaBancariaId: t.conta_bancaria_id,
        descricao: t.descricao,
        numeroInicial: ini,
        quantidadeFolhas: Number(t.quantidade_folhas),
        numeroFinal: fim,
        status: t.status,
        observacao: t.observacao,
        criadoPor: t.created_by_name,
        criadoEm: t.created_at,
        resumo,
        folhas,
      };
    });
  }),

  criarTalao: protectedProcedure.input(z.object({
    companyId: z.number(),
    contaBancariaId: z.number(),
    descricao: z.string().max(120).nullable().optional(),
    numeroInicial: z.number().int().min(0),
    quantidadeFolhas: z.number().int().min(1).max(1000),
    observacao: z.string().max(500).nullable().optional(),
  })).mutation(async ({ input, ctx }) => {
    await assertCompanyAccess(ctx.user, input.companyId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await assertContaDaEmpresa(db, input.contaBancariaId, input.companyId);
    const numeroFinal = input.numeroInicial + input.quantidadeFolhas - 1;
    const res = await dbExecute(db,
      `INSERT INTO financial_cheque_taloes
         (company_id, conta_bancaria_id, descricao, numero_inicial, quantidade_folhas,
          numero_final, observacao, created_by_user_id, created_by_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [input.companyId, input.contaBancariaId, input.descricao ?? null, input.numeroInicial,
       input.quantidadeFolhas, numeroFinal, input.observacao ?? null, ctx.user.id, ctx.user.name ?? null]);
    // A conta passa a ter talão (aparece no seletor de "Lançar cheque").
    await dbExecute(db, `UPDATE company_bank_accounts SET "temTalao"=1 WHERE id=$1`, [input.contaBancariaId]);
    return { ok: true, id: res.rows[0]?.id };
  }),

  atualizarTalao: protectedProcedure.input(z.object({
    id: z.number(),
    descricao: z.string().max(120).nullable().optional(),
    numeroInicial: z.number().int().min(0).optional(),
    quantidadeFolhas: z.number().int().min(1).max(1000).optional(),
    status: z.enum(["ativo", "encerrado"]).optional(),
    observacao: z.string().max(500).nullable().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const t = await carregarTalaoComAcesso(db, input.id, ctx.user);
    const numeroInicial = input.numeroInicial ?? Number(t.numero_inicial);
    const quantidadeFolhas = input.quantidadeFolhas ?? Number(t.quantidade_folhas);
    const numeroFinal = numeroInicial + quantidadeFolhas - 1;
    const descricao = input.descricao !== undefined ? input.descricao : t.descricao;
    const observacao = input.observacao !== undefined ? input.observacao : t.observacao;
    const status = input.status ?? t.status;
    await dbExecute(db,
      `UPDATE financial_cheque_taloes
         SET descricao=$1, numero_inicial=$2, quantidade_folhas=$3, numero_final=$4,
             status=$5, observacao=$6, updated_at=NOW()
       WHERE id=$7`,
      [descricao ?? null, numeroInicial, quantidadeFolhas, numeroFinal, status, observacao ?? null, input.id]);
    return { ok: true };
  }),

  // Marca UMA folha como perdida/cancelada (ou de volta p/ disponível). Folha já USADA
  // (com cheque emitido) não pode virar perdida/cancelada — o cheque é a verdade.
  marcarFolha: protectedProcedure.input(z.object({
    id: z.number(),
    numeroFolha: z.number().int().min(0),
    status: z.enum(["perdida", "cancelada", "disponivel"]),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const t = await carregarTalaoComAcesso(db, input.id, ctx.user);
    const ini = Number(t.numero_inicial), fim = Number(t.numero_final);
    if (input.numeroFolha < ini || input.numeroFolha > fim) {
      throw new TRPCError({ code: "BAD_REQUEST", message: `A folha ${input.numeroFolha} está fora da faixa do talão (${ini}–${fim}).` });
    }
    if (input.status !== "disponivel") {
      // Confere se existe cheque emitido nessa folha (conta + nº) → bloqueia.
      const chq = await dbExecute(db,
        `SELECT numero_cheque FROM financial_cheques
           WHERE company_id=$1 AND conta_bancaria_id=$2 AND excluido_em IS NULL`,
        [t.company_id, t.conta_bancaria_id]);
      const usada = chq.rows.some((c: any) => numCheque(c.numero_cheque) === input.numeroFolha);
      if (usada) throw new TRPCError({ code: "CONFLICT", message: `A folha ${input.numeroFolha} já foi usada (cheque emitido) — não pode ser marcada como perdida/cancelada.` });
    }
    let exc: Record<string, string> = {};
    try { exc = t.folhas_status_json ? JSON.parse(t.folhas_status_json) : {}; } catch { exc = {}; }
    if (input.status === "disponivel") delete exc[String(input.numeroFolha)];
    else exc[String(input.numeroFolha)] = input.status;
    await dbExecute(db,
      `UPDATE financial_cheque_taloes SET folhas_status_json=$1, updated_at=NOW() WHERE id=$2`,
      [JSON.stringify(exc), input.id]);
    return { ok: true };
  }),

  excluirTalao: protectedProcedure.input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await carregarTalaoComAcesso(db, input.id, ctx.user);
      await dbExecute(db, `UPDATE financial_cheque_taloes SET excluido_em=NOW() WHERE id=$1`, [input.id]);
      return { ok: true };
    }),

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

    const relatorio = montarRelatorio(parsed.rows, fornecedores, contas, existentes);
    return {
      ...relatorio,
      abasLidas: parsed.abasLidas,
      abasIgnoradas: parsed.abasIgnoradas,
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
    let resultado = { inseridos: 0, pulados: 0 };

    await db.transaction(async (tx: any) => {
      resultado = await inserirCheques(tx, input.companyId, parsed.rows, fornecedores, contas, existentes, origem, loteId);
    });

    return { ...resultado, loteId };
  }),

  // ── PDFs lidos por IA ──────────────────────────────────────────────
  // Lê UM PDF/imagem de cheque(s) via IA e devolve as linhas normalizadas. O
  // cliente chama uma vez por arquivo (mostrando "Lendo arquivo i/n"), acumula
  // as linhas e depois roda importarPdfPreview. ZERO gravação.
  lerChequesPdf: protectedProcedure.input(z.object({
    companyId: z.number(),
    fileBase64: z.string().min(10),
    mimeType: z.string().min(3).max(120),
    fileName: z.string().max(255).optional(),
  })).mutation(async ({ input, ctx }) => {
    await assertCompanyAccess(ctx.user, input.companyId);
    let bruto: any;
    try { bruto = await lerChequesComIA(input.fileBase64, input.mimeType); }
    catch (e: any) { throw new TRPCError({ code: "BAD_REQUEST", message: `Não consegui ler o arquivo por IA: ${e?.message || e}` }); }
    const arr: any[] = Array.isArray(bruto?.cheques) ? bruto.cheques : (Array.isArray(bruto) ? bruto : []);
    const origemNome = (input.fileName || "PDF").slice(0, 120);
    const rows = arr.map((c) => normalizarChequeIA(c, origemNome));
    return { fileName: origemNome, total: rows.length, rows };
  }),

  // Relatório dry-run (mesma forma do importarPreview) a partir das linhas lidas
  // por IA. Re-sanitiza tudo no servidor. ZERO gravação.
  importarPdfPreview: protectedProcedure.input(z.object({
    companyId: z.number(),
    rows: z.array(chequeRowInputSchema).max(5000),
  })).mutation(async ({ input, ctx }) => {
    await assertCompanyAccess(ctx.user, input.companyId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const rows = input.rows.map(sanitizeChequeRow);
    const [fornecedores, contas, existentes] = await Promise.all([
      carregarFornecedores(db, input.companyId),
      carregarContas(db, input.companyId),
      carregarExistentes(db, input.companyId),
    ]);
    const relatorio = montarRelatorio(rows, fornecedores, contas, existentes);
    return { ...relatorio, abasLidas: [] as string[], abasIgnoradas: [] as AbaIgnorada[] };
  }),

  // Gravação dos cheques lidos por IA — insere só NOVO em transação. Re-sanitiza
  // tudo no servidor (não confia no input cru do cliente).
  importarPdfConfirmar: protectedProcedure.input(z.object({
    companyId: z.number(),
    rows: z.array(chequeRowInputSchema).max(5000),
    origemArquivo: z.string().max(255).optional(),
  })).mutation(async ({ input, ctx }) => {
    await assertCompanyAccess(ctx.user, input.companyId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const rows = input.rows.map(sanitizeChequeRow);
    const [fornecedores, contas, existentes] = await Promise.all([
      carregarFornecedores(db, input.companyId),
      carregarContas(db, input.companyId),
      carregarExistentes(db, input.companyId),
    ]);
    const loteId = randomUUID();
    const origem = (input.origemArquivo || "PDFs (IA)").slice(0, 255);
    let resultado = { inseridos: 0, pulados: 0 };
    await db.transaction(async (tx: any) => {
      resultado = await inserirCheques(tx, input.companyId, rows, fornecedores, contas, existentes, origem, loteId);
    });
    return { ...resultado, loteId };
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
              motivo_devolucao_codigo AS "motivoDevolucaoCodigo",
              motivo_devolucao_texto AS "motivoDevolucaoTexto",
              conta_bancaria_tentativa_id AS "contaBancariaTentativaId",
              conta_bancaria_tentativa_nome AS "contaBancariaTentativaNome",
              devolvido_em AS "devolvidoEm",
              created_at AS "createdAt"
         FROM financial_cheques
        WHERE ${where.join(" AND ")}
        ORDER BY ano_ref DESC, mes_ref DESC, data_vencimento DESC NULLS LAST, id DESC
        LIMIT $${p}`,
      [...params, input.limit]);
    // Rev. 3234 — dupla checagem: anota cada cheque com o cruzamento contra o extrato
    // bancário (confirmado × divergente). SÓ LEITURA — alimenta o alerta na tela.
    const matchCheque = await montarMatcherExtrato(db, input.companyId);
    // Rev. 4068 — motivo/conta tentativa PERSISTIDOS (ação explícita do usuário na
    // Conciliação) têm precedência sobre o computado on-the-fly (só um indício até ser
    // confirmado); status='devolvido' já persistido também dispensa o cálculo ao vivo.
    return (res.rows as any[]).map((c) => {
      const classif = classificarExtrato(c.status, matchCheque(c));
      const persistedDevolvido = c.status === "devolvido" && (c.motivoDevolucaoCodigo != null || c.devolvidoEm != null);
      return {
        ...c,
        ...classif,
        extratoDevolvido: persistedDevolvido ? true : classif.extratoDevolvido,
        extratoMotivoCodigo: persistedDevolvido ? c.motivoDevolucaoCodigo : classif.extratoMotivoCodigo,
        extratoMotivoTexto: persistedDevolvido ? c.motivoDevolucaoTexto : classif.extratoMotivoTexto,
      };
    });
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

  // ───────────── Dupla checagem extrato ↔ cheque (Rev. 3234) ─────────────
  // RESUMO da conferência do controle contra o EXTRATO BANCÁRIO importado. READ-ONLY:
  // conta confirmados (banco compensou + controle já "compensado"), divergências (banco
  // compensou MAS controle diz devolvido/sustado/pendente/etc → ALERTA p/ análise),
  // já conferidos (conciliado=1) e não encontrados. Devolve a LISTA das divergências
  // p/ o painel de análise. Não grava nada.
  verificarExtratoResumo: protectedProcedure.input(z.object({
    companyId: z.number(),
    ano: z.number().int().optional(),
    mes: z.number().int().min(1).max(12).optional(),
  })).query(async ({ input, ctx }) => {
    await assertCompanyAccess(ctx.user, input.companyId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    // dbExecute liga params por ORDEM DE APARIÇÃO — manter array na ordem dos placeholders.
    const params: unknown[] = [input.companyId];
    let extra = ""; let pi = 2;
    if (input.ano != null) { extra += ` AND ano_ref=$${pi++}`; params.push(input.ano); }
    if (input.mes != null) { extra += ` AND mes_ref=$${pi++}`; params.push(input.mes); }
    const res = await dbExecute(db,
      `SELECT id, numero_cheque AS "numeroCheque", fornecedor_nome AS "fornecedorNome",
              valor, status, data_compensacao AS "dataCompensacao",
              data_vencimento AS "dataVencimento", mes_ref AS "mes", ano_ref AS "ano",
              COALESCE(conciliado,0) AS conciliado
         FROM financial_cheques
        WHERE company_id=$1 AND excluido_em IS NULL${extra}`, params);
    const matchCheque = await montarMatcherExtrato(db, input.companyId);
    let confirmados = 0, divergencias = 0, jaConferidos = 0, naoEncontrados = 0, aConferir = 0;
    // Rev. 3242 — totais BRL p/ os cards de "extrato" no front (qtd + valor, igual aos demais).
    let valorConfirmados = 0, valorDivergencias = 0, valorJaConferidos = 0, valorAConferir = 0;
    // Rev. 3372 — separa "a conferir" por força do match: forte (nº+valor, auto-marcável)
    // × fraco (valor+data, confira antes). Painel de pré-confirmação na Conciliação usa isso.
    let aConferirForte = 0, aConferirFraco = 0, valorAConferirForte = 0, valorAConferirFraco = 0;
    const divergenciasLista: any[] = [];
    const aConferirLista: any[] = [];
    for (const c of (res.rows as any[])) {
      const cls = classificarExtrato(c.status, matchCheque(c));
      const v = Number(c.valor) || 0;
      if (cls.extratoConfirmado) {
        confirmados++; valorConfirmados += v;
        if (Number(c.conciliado) === 1) { jaConferidos++; valorJaConferidos += v; }
        else {
          aConferir++; valorAConferir += v;
          if (cls.extratoForte) { aConferirForte++; valorAConferirForte += v; }
          else { aConferirFraco++; valorAConferirFraco += v; }
          aConferirLista.push({
            id: c.id, numeroCheque: c.numeroCheque, fornecedorNome: c.fornecedorNome,
            valor: v, status: c.status, forte: cls.extratoForte,
            dataCompensacao: c.dataCompensacao, dataVencimento: c.dataVencimento,
            dataExtrato: cls.extratoData, mes: c.mes, ano: c.ano,
          });
        }
      } else if (cls.extratoDivergente) {
        divergencias++; valorDivergencias += v;
        divergenciasLista.push({
          id: c.id, numeroCheque: c.numeroCheque, fornecedorNome: c.fornecedorNome,
          valor: v, status: c.status,
          dataCompensacao: c.dataCompensacao, dataVencimento: c.dataVencimento,
          dataExtrato: cls.extratoData, mes: c.mes, ano: c.ano,
        });
      } else {
        naoEncontrados++;
      }
    }
    divergenciasLista.sort((a, b) => (b.valor - a.valor));
    // Forte primeiro (auto-marcável no topo), depois por valor desc.
    aConferirLista.sort((a, b) => (Number(b.forte) - Number(a.forte)) || (b.valor - a.valor));
    return {
      confirmados, divergencias, jaConferidos, naoEncontrados, aConferir, divergenciasLista,
      valorConfirmados, valorDivergencias, valorJaConferidos, valorAConferir,
      aConferirForte, aConferirFraco, valorAConferirForte, valorAConferirFraco, aConferirLista,
    };
  }),

  // AÇÃO EXPLÍCITA do usuário (botão "Conferir com o extrato"). Marca conciliado=1 +
  // data_conciliacao SOMENTE nos cheques que o banco confirmou compensados E cujo status
  // no controle JÁ é "compensado" (consistentes). JAMAIS toca em divergências nem muda
  // status — divergências só viram ALERTA p/ análise manual. Honra "conciliação só
  // sugestiva": nada de baixa financeira, só um selo de conferência (idempotente).
  conferirExtrato: protectedProcedure.input(z.object({
    companyId: z.number(),
    ano: z.number().int().optional(),
    mes: z.number().int().min(1).max(12).optional(),
    // Rev. 3372 — SUBSET opcional: o painel de pré-confirmação manda só os IDs que o
    // usuário deixou marcados (forte pré-selecionado + fraco escolhido a dedo). Vazio/null
    // = comportamento legado (marca TODOS os confirmados do período). NUNCA confia no id
    // cru — cada um é re-validado por `extratoConfirmado` abaixo, então um id "fabricado"
    // ou de cheque divergente jamais é marcado.
    ids: z.array(z.number().int()).optional(),
  })).mutation(async ({ input, ctx }) => {
    await assertCompanyAccess(ctx.user, input.companyId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const params: unknown[] = [input.companyId];
    let extra = ""; let pi = 2;
    if (input.ano != null) { extra += ` AND ano_ref=$${pi++}`; params.push(input.ano); }
    if (input.mes != null) { extra += ` AND mes_ref=$${pi++}`; params.push(input.mes); }
    const res = await dbExecute(db,
      `SELECT id, numero_cheque AS "numeroCheque", valor, status,
              data_compensacao AS "dataCompensacao", COALESCE(conciliado,0) AS conciliado
         FROM financial_cheques
        WHERE company_id=$1 AND excluido_em IS NULL${extra}`, params);
    const matchCheque = await montarMatcherExtrato(db, input.companyId);
    // Filtro de subset (re-validação acontece via classificarExtrato; isto é só p/ honrar
    // a deseleção do usuário). Set vazio só é restritivo quando `ids` veio explícito.
    const idSet = (input.ids && input.ids.length > 0) ? new Set(input.ids) : null;
    const alvos: { id: number; dt: string }[] = [];
    // Rev. 3247 — já conferidos mas SEM data de compensação preenchida → backfill com a
    // data em que o banco compensou (extratoData), garantindo informação correta p/ análise.
    const backfill: { id: number; dt: string }[] = [];
    let divergencias = 0, jaConferidos = 0;
    for (const c of (res.rows as any[])) {
      const cls = classificarExtrato(c.status, matchCheque(c));
      if (cls.extratoConfirmado) {
        const dt = cls.extratoData || new Date().toISOString().slice(0, 10);
        if (Number(c.conciliado) === 1) {
          jaConferidos++;
          if (!c.dataCompensacao) backfill.push({ id: c.id, dt });
          continue;
        }
        if (idSet && !idSet.has(Number(c.id))) continue; // usuário deselecionou este
        alvos.push({ id: c.id, dt });
      } else if (cls.extratoDivergente) {
        divergencias++;
      }
    }
    if (alvos.length === 0 && backfill.length === 0) return { conferidos: 0, backfilled: 0, divergencias, jaConferidos };
    // UPDATE em lote via VALUES join. dbExecute liga por ORDEM DE APARIÇÃO: os pares
    // (id,dt) aparecem PRIMEIRO no texto, company_id por ÚLTIMO → montar o flat nessa
    // ordem. Cast ::date evita o erro "date < text". COALESCE(conciliado,0)<>1 = idempotente.
    const CHUNK = 200;
    let conferidos = 0;
    for (let i = 0; i < alvos.length; i += CHUNK) {
      const lote = alvos.slice(i, i + CHUNK);
      let n = 1;
      const valuesSql = lote.map(() => `($${n++}::int, $${n++}::date)`).join(",");
      const flat: unknown[] = [];
      for (const a of lote) { flat.push(a.id, a.dt); }
      flat.push(input.companyId); // company_id = último placeholder no texto
      const upd = await dbExecute(db,
        `UPDATE financial_cheques f
            SET conciliado=1,
                data_conciliacao = COALESCE(f.data_conciliacao, v.dt),
                data_compensacao = COALESCE(f.data_compensacao, v.dt),
                updated_at = NOW()
           FROM (VALUES ${valuesSql}) AS v(id, dt)
          WHERE f.id = v.id AND f.company_id=$${n} AND COALESCE(f.conciliado,0)<>1
          RETURNING f.id`,
        flat);
      conferidos += (upd.rows?.length ?? 0);
    }
    // Backfill: já conferidos porém sem data_compensacao → preenche com a data do extrato.
    let backfilled = 0;
    for (let i = 0; i < backfill.length; i += CHUNK) {
      const lote = backfill.slice(i, i + CHUNK);
      let n = 1;
      const valuesSql = lote.map(() => `($${n++}::int, $${n++}::date)`).join(",");
      const flat: unknown[] = [];
      for (const a of lote) { flat.push(a.id, a.dt); }
      flat.push(input.companyId); // company_id = último placeholder no texto
      const upd = await dbExecute(db,
        `UPDATE financial_cheques f
            SET data_compensacao = v.dt, updated_at = NOW()
           FROM (VALUES ${valuesSql}) AS v(id, dt)
          WHERE f.id = v.id AND f.company_id=$${n} AND f.data_compensacao IS NULL
          RETURNING f.id`,
        flat);
      backfilled += (upd.rows?.length ?? 0);
    }
    return { conferidos, backfilled, divergencias, jaConferidos };
  }),

  // Rev. 3329 — LANÇAMENTO MANUAL de um único cheque (além da importação por
  // planilha/IA). Reaproveita TODA a higienização da importação: `sanitizeChequeRow`
  // valida datas reais, normaliza status na whitelist e DERIVA mês/ano da data; o
  // dedup natural (`chaveDedup`) bloqueia duplicata (mesmo nº+valor+mês+ano). Conta e
  // fornecedor: usa o id EXPLÍCITO quando enviado pela tela; senão tenta casar por
  // nome/dígitos (mesmos matchers da importação). origem_arquivo="manual". Não toca
  // conciliação/extrato (conciliado nasce 0) — só cadastra o cheque no controle.
  criarManual: protectedProcedure.input(z.object({
    companyId: z.number(),
    numeroCheque: z.string().max(30).nullable().optional(),
    valor: z.number().positive(),
    fornecedorNome: z.string().max(255).nullable().optional(),
    fornecedorId: z.number().nullable().optional(),
    bancoNome: z.string().max(120).nullable().optional(),
    bancoCodigo: z.string().max(20).nullable().optional(),
    agencia: z.string().max(20).nullable().optional(),
    contaCorrenteRaw: z.string().max(60).nullable().optional(),
    contaBancariaId: z.number().nullable().optional(),
    dataVencimento: z.string().nullable().optional(),
    dataCompensacao: z.string().nullable().optional(),
    status: z.enum(STATUS_VALIDOS).optional(),
    parcela: z.string().max(20).nullable().optional(),
    nf: z.string().max(60).nullable().optional(),
    observacao: z.string().max(500).nullable().optional(),
  })).mutation(async ({ input, ctx }) => {
    await assertCompanyAccess(ctx.user, input.companyId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    // Higieniza igual à importação (datas reais, status whitelist, mês/ano da data).
    const row = sanitizeChequeRow({
      parcela: input.parcela, fornecedorNome: input.fornecedorNome,
      bancoCodigo: input.bancoCodigo, bancoNome: input.bancoNome,
      agencia: input.agencia, contaCorrenteRaw: input.contaCorrenteRaw,
      numeroCheque: input.numeroCheque, nf: input.nf, valor: input.valor,
      dataVencimento: input.dataVencimento, dataCompensacao: input.dataCompensacao,
      status: input.status, observacao: input.observacao, aba: "Manual",
    });
    if (row.valor == null || row.valor <= 0) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Informe um valor válido para o cheque." });
    }
    // Dedup natural — bloqueia cheque idêntico já cadastrado (nº+valor+mês+ano).
    const existentes = await carregarExistentes(db, input.companyId);
    if (existentes.has(chaveDedup(row))) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "Já existe um cheque com este número, valor e mês cadastrado neste controle.",
      });
    }
    // Resolução de fornecedor/conta. Carrega as listas DA EMPRESA (mesmos matchers da
    // importação) — que também servem para VALIDAR ownership de id EXPLÍCITO (anti-IDOR:
    // um id forjado de OUTRO tenant é rejeitado em vez de persistido cegamente).
    const fornecedoresDaEmpresa = await carregarFornecedores(db, input.companyId);
    const contasDaEmpresa = await carregarContas(db, input.companyId);
    let fornecedorId: number | null = null;
    if (input.fornecedorId != null) {
      if (!fornecedoresDaEmpresa.some((f) => f.id === input.fornecedorId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Fornecedor não pertence a esta empresa." });
      }
      fornecedorId = input.fornecedorId;
    } else if (row.fornecedorNome) {
      fornecedorId = matchFornecedor(row.fornecedorNome, fornecedoresDaEmpresa);
    }
    let contaBancariaId: number | null = null;
    if (input.contaBancariaId != null) {
      if (!contasDaEmpresa.some((c) => c.id === input.contaBancariaId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Conta bancária não pertence a esta empresa." });
      }
      contaBancariaId = input.contaBancariaId;
    } else if (row.contaCorrenteRaw) {
      contaBancariaId = matchConta(row.contaCorrenteRaw, contasDaEmpresa);
    }
    const loteId = randomUUID();
    // dbExecute liga params por ORDEM DE APARIÇÃO — placeholders $1..$20 e array em sequência.
    const res = await dbExecute(db,
      `INSERT INTO financial_cheques
         (company_id, conta_bancaria_id, conta_corrente_raw, banco_codigo, banco_nome,
          agencia, numero_cheque, fornecedor_nome, fornecedor_id, parcela, nf, valor,
          data_vencimento, data_compensacao, status, observacao, mes_ref, ano_ref,
          origem_arquivo, lote_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       RETURNING id`,
      [input.companyId, contaBancariaId, row.contaCorrenteRaw, row.bancoCodigo, row.bancoNome,
       row.agencia, row.numeroCheque, row.fornecedorNome, fornecedorId, row.parcela, row.nf, row.valor,
       row.dataVencimento, row.dataCompensacao, row.status, row.observacao, row.mes, row.ano,
       "manual", loteId]);
    return { ok: true, id: res.rows[0]?.id, mes: row.mes, ano: row.ano };
  }),

  // Lançamento em LOTE (parcelado): cadastra N cheques de uma despesa de uma vez.
  // Reusa toda a higienização/dedup/ownership de `criarManual`; o cliente (tela
  // "Novo Lançamento", forma=Cheque) calcula a divisão em parcelas e manda o array
  // pronto. Aqui validamos tenant + ownership e gravamos só o que é NOVO (dedup
  // natural por nº+valor+mês+ano), todos sob o MESMO lote_id. ZERO ALTER/DROP/DELETE.
  criarManualLote: protectedProcedure.input(z.object({
    companyId: z.number(),
    fornecedorNome: z.string().max(255).nullable().optional(),
    fornecedorId: z.number().nullable().optional(),
    bancoNome: z.string().max(120).nullable().optional(),
    bancoCodigo: z.string().max(20).nullable().optional(),
    agencia: z.string().max(20).nullable().optional(),
    contaCorrenteRaw: z.string().max(60).nullable().optional(),
    contaBancariaId: z.number().nullable().optional(),
    nf: z.string().max(60).nullable().optional(),
    observacao: z.string().max(500).nullable().optional(),
    status: z.enum(STATUS_VALIDOS).optional(),
    parcelas: z.array(z.object({
      valor: z.number().positive(),
      numeroCheque: z.string().max(30).nullable().optional(),
      parcela: z.string().max(20).nullable().optional(),
      dataVencimento: z.string().nullable().optional(),
      dataCompensacao: z.string().nullable().optional(),
    })).min(1).max(120),
  })).mutation(async ({ input, ctx }) => {
    await assertCompanyAccess(ctx.user, input.companyId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    // Ownership do fornecedor/conta EXPLÍCITOS (anti-IDOR) — validado UMA vez (são
    // compartilhados por todas as parcelas); senão tenta casar por nome/dígitos.
    const fornecedoresDaEmpresa = await carregarFornecedores(db, input.companyId);
    const contasDaEmpresa = await carregarContas(db, input.companyId);
    let fornecedorId: number | null = null;
    if (input.fornecedorId != null) {
      if (!fornecedoresDaEmpresa.some((f) => f.id === input.fornecedorId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Fornecedor não pertence a esta empresa." });
      }
      fornecedorId = input.fornecedorId;
    } else if (input.fornecedorNome) {
      fornecedorId = matchFornecedor(input.fornecedorNome, fornecedoresDaEmpresa);
    }
    let contaBancariaId: number | null = null;
    if (input.contaBancariaId != null) {
      if (!contasDaEmpresa.some((c) => c.id === input.contaBancariaId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Conta bancária não pertence a esta empresa." });
      }
      contaBancariaId = input.contaBancariaId;
    } else if (input.contaCorrenteRaw) {
      contaBancariaId = matchConta(input.contaCorrenteRaw, contasDaEmpresa);
    }
    const existentes = await carregarExistentes(db, input.companyId);
    const loteId = randomUUID();
    const criados: number[] = [];
    let pulados = 0;
    let primeiroMes: number | null = null;
    let primeiroAno: number | null = null;
    for (const p of input.parcelas) {
      const row = sanitizeChequeRow({
        parcela: p.parcela, fornecedorNome: input.fornecedorNome,
        bancoCodigo: input.bancoCodigo, bancoNome: input.bancoNome,
        agencia: input.agencia, contaCorrenteRaw: input.contaCorrenteRaw,
        numeroCheque: p.numeroCheque, nf: input.nf, valor: p.valor,
        dataVencimento: p.dataVencimento, dataCompensacao: p.dataCompensacao,
        status: input.status, observacao: input.observacao, aba: "Manual",
      });
      if (row.valor == null || row.valor <= 0) { pulados++; continue; }
      const chave = chaveDedup(row);
      if (existentes.has(chave)) { pulados++; continue; }  // já existe (banco) ou repetido no próprio lote
      const res = await dbExecute(db,
        `INSERT INTO financial_cheques
           (company_id, conta_bancaria_id, conta_corrente_raw, banco_codigo, banco_nome,
            agencia, numero_cheque, fornecedor_nome, fornecedor_id, parcela, nf, valor,
            data_vencimento, data_compensacao, status, observacao, mes_ref, ano_ref,
            origem_arquivo, lote_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
         RETURNING id`,
        [input.companyId, contaBancariaId, row.contaCorrenteRaw, row.bancoCodigo, row.bancoNome,
         row.agencia, row.numeroCheque, row.fornecedorNome, fornecedorId, row.parcela, row.nf, row.valor,
         row.dataVencimento, row.dataCompensacao, row.status, row.observacao, row.mes, row.ano,
         "manual", loteId]);
      const id = res.rows[0]?.id;
      if (id) {
        criados.push(id);
        existentes.add(chave);
        if (primeiroMes == null) { primeiroMes = row.mes; primeiroAno = row.ano; }
      }
    }
    return { ok: true, criados: criados.length, pulados, mes: primeiroMes, ano: primeiroAno };
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
    // Rev. 4141 — campos adicionais para edição completa do cheque
    valor: z.number().positive().nullable().optional(),
    dataVencimento: z.string().nullable().optional(),
    numeroCheque: z.string().max(30).nullable().optional(),
    bancoNome: z.string().max(120).nullable().optional(),
    agencia: z.string().max(20).nullable().optional(),
    contaCorrenteRaw: z.string().max(60).nullable().optional(),
    nf: z.string().max(60).nullable().optional(),
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
    // Rev. 4141
    if (input.valor !== undefined && input.valor != null) add("valor", input.valor);
    if (input.dataVencimento !== undefined) add("data_vencimento", input.dataVencimento);
    if (input.numeroCheque !== undefined) add("numero_cheque", input.numeroCheque);
    if (input.bancoNome !== undefined) add("banco_nome", input.bancoNome);
    if (input.agencia !== undefined) add("agencia", input.agencia);
    if (input.contaCorrenteRaw !== undefined) add("conta_corrente_raw", input.contaCorrenteRaw);
    if (input.nf !== undefined) add("nf", input.nf);
    if (sets.length === 0) return { ok: true, alterado: 0 };
    sets.push(`updated_at=NOW()`);
    const idP = p++, coP = p;
    const res = await dbExecute(db,
      `UPDATE financial_cheques SET ${sets.join(", ")}
        WHERE id=$${idP} AND company_id=$${coP} AND excluido_em IS NULL RETURNING id`,
      [...params, input.id, input.companyId]);
    return { ok: true, alterado: res.rows.length };
  }),

  // Rev. 3245 — alteração de STATUS em LOTE (múltipla seleção na tela). Atômico:
  // um único UPDATE com `id IN (...)` filtrando por company_id + não-excluído.
  // Não toca conciliação/extrato — só o status do controle (ação explícita do user).
  atualizarStatusLote: protectedProcedure.input(z.object({
    companyId: z.number(),
    ids: z.array(z.number().int()).min(1).max(1000),
    status: z.enum(STATUS_VALIDOS),
  })).mutation(async ({ input, ctx }) => {
    await assertCompanyAccess(ctx.user, input.companyId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    // de-dup defensivo dos ids
    const ids = Array.from(new Set(input.ids));
    // dbExecute liga params por ORDEM DE APARIÇÃO: status, depois os ids, depois company.
    const idsPh = ids.map((_, i) => `$${i + 2}`).join(", ");
    const res = await dbExecute(db,
      `UPDATE financial_cheques SET status=$1, updated_at=NOW()
        WHERE id IN (${idsPh}) AND company_id=$${ids.length + 2} AND excluido_em IS NULL
        RETURNING id`,
      [input.status, ...ids, input.companyId]);
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
