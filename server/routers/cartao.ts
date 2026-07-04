/**
 * Controle de Cartão de Crédito — camada de CONTROLE/identificação.
 *
 * Mesma filosofia do Controle de Cheques: CADASTRO/CONTROLE, NÃO vira lançamento
 * financeiro (evita duplicar com a importação de Pagamentos). Serve para:
 *   1) Cadastro de cartões (banco, bandeira, final 4, titular PF/PJ, fechamento,
 *      vencimento, limite) — alerta quando um cartão PESSOAL (PF) é usado pela
 *      empresa (sugerir regularização).
 *   2) Importar faturas (PDF) lidas por IA (Gemini), em duas camadas:
 *      - Cabeçalho da fatura (total = nº que vai p/ Conciliação Bancária).
 *      - Itens (compras classificáveis por obra/centro de custo/categoria;
 *        encargos/IOF/anuidade sugeridos como custo "Administrativo/Financeiro").
 *   3) FONTE p/ a Conciliação Bancária (extrato traz 1 linha = total da fatura no
 *      vencimento; itens ficam como "raio-x" do custo por obra/CC por baixo).
 *
 * Importador IA:
 *   - importarPreview = roda a IA no PDF e devolve o JSON estruturado (ZERO
 *     gravação). importarConfirmar = grava a partir do JSON do preview (NÃO
 *     re-roda a IA — é caro/não-determinístico).
 *   - Uma fatura/PDF pode conter VÁRIOS cartões (caso Caixa) → o parser devolve
 *     uma fatura por cartão; cada uma casa com o cadastro pelo final de 4 dígitos.
 *
 * ZERO ALTER/DROP/DELETE (tabelas via self-heal; exclusão é soft via excluido_em).
 */
import { router, protectedProcedure } from "../_core/trpc";
import { getDb, getUserCompanyLinks } from "../db";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { assertAiModuleEnabled } from "../_core/aiConfig";
import { invokeGeminiVision, invokeAnthropicVision } from "../_core/llm";

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

// ─────────────────────────── Helpers ───────────────────────────
function normTxt(s: any): string {
  return String(s ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();
}
function soDigitos(s: any): string { return String(s ?? "").replace(/[^0-9]/g, ""); }

function parseValor(v: any): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return isNaN(v) ? null : Math.round(v * 100) / 100;
  let s = String(v).replace(/[R$\s]/g, "").trim();
  if (!s) return null;
  const neg = /^-/.test(s) || /-$/.test(s);
  s = s.replace(/-/g, "");
  const lastComma = s.lastIndexOf(","), lastDot = s.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    if (lastDot > lastComma) s = s.replace(/,/g, "");          // US: 3,417.21
    else s = s.replace(/\./g, "").replace(",", ".");           // BR: 3.417,21
  } else if (lastComma > -1) {
    const after = s.length - lastComma - 1;
    s = after === 2 ? s.replace(",", ".") : s.replace(/,/g, "");
  }
  const n = parseFloat(s);
  if (isNaN(n)) return null;
  const r = Math.round(n * 100) / 100;
  return neg ? -r : r;
}

// Monta ISO só se (yr,mo,da) for uma data REAL (rejeita 29/02 não-bissexto etc.).
function ymdToISO(yr: number, mo: number, da: number): string | null {
  if (!(mo >= 1 && mo <= 12 && da >= 1 && da <= 31)) return null;
  const dt = new Date(Date.UTC(yr, mo - 1, da));
  if (isNaN(dt.getTime()) || dt.getUTCFullYear() !== yr || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== da)
    return null;
  return `${yr}-${String(mo).padStart(2, "0")}-${String(da).padStart(2, "0")}`;
}

// Normaliza data de item da fatura. Aceita ISO (YYYY-MM-DD) e BR (DD/MM[/AAAA]).
// Datas SEM ANO (ex.: "12/03") inferem o ano da data de FECHAMENTO da fatura:
// se o mês do item > mês do fechamento, é do ano anterior (compra de dez na
// fatura de jan).
function normItemDate(raw: any, fechamentoISO: string | null): string | null {
  if (raw == null || raw === "") return null;
  const s = String(raw).trim();
  // ISO
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return ymdToISO(parseInt(iso[1], 10), parseInt(iso[2], 10), parseInt(iso[3], 10));
  // BR com ano
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (br) {
    let yr = parseInt(br[3], 10); if (yr < 100) yr += 2000;
    return ymdToISO(yr, parseInt(br[2], 10), parseInt(br[1], 10));
  }
  // BR sem ano (DD/MM) — inferir do fechamento.
  const sem = s.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (sem) {
    const da = parseInt(sem[1], 10), mo = parseInt(sem[2], 10);
    let yr = fechamentoISO ? parseInt(fechamentoISO.slice(0, 4), 10) : new Date().getFullYear();
    const moFech = fechamentoISO ? parseInt(fechamentoISO.slice(5, 7), 10) : mo;
    if (mo > moFech) yr -= 1; // item de mês posterior ao fechamento = ano anterior
    return ymdToISO(yr, mo, da);
  }
  return null;
}

const TIPOS_ITEM = ["compra", "credito", "encargo"] as const;
const STATUS_CLASSIF = ["sugerido", "confirmado", "ignorado"] as const;

// Status do CARTÃO (situação cadastral). "ativo" é o padrão; "cancelado"/"inativo"
// tiram o cartão de operação (ativo=0 → some do de-para da IA e fica esmaecido).
const STATUS_CARTAO = ["ativo", "bloqueado", "renegociado", "cancelado", "inativo"] as const;
type StatusCartao = (typeof STATUS_CARTAO)[number];
function ativoDeStatus(s: StatusCartao | undefined | null): number {
  return s === "cancelado" || s === "inativo" ? 0 : 1;
}

// Rev. 4019 — escopo do cartão: 'fc' entra na sugestão automática de melhor
// cartão em Cotação/OC; 'local' (obra/pessoal/terceiro) NUNCA entra.
const ESCOPO_CARTAO = ["fc", "local"] as const;

// Dado dia de fechamento/vencimento e uma data de referência (hoje), calcula quantos
// dias de "float" uma compra feita HOJE tem até o vencimento da fatura em que ela cai.
// Mesma convenção de aproximação (mês=30 dias no gap fechamento→vencimento) usada em
// calcMelhorDataCompra (FinanceiroCartaoCredito.tsx) — não reinventar a fórmula.
function diasFloatSeComprarHoje(diaFechamento: number, diaVencimento: number, hoje: Date): number {
  const diaHoje = hoje.getUTCDate();
  // Próximo fechamento (hoje incluso): se ainda não fechou este mês, fecha este mês;
  // senão, fecha no mês seguinte.
  const fechaEsteMs = diaHoje <= diaFechamento;
  const fechamento = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() + (fechaEsteMs ? 0 : 1), Math.min(diaFechamento, 28)));
  const gap = diaVencimento > diaFechamento ? diaVencimento - diaFechamento : diaVencimento + 30 - diaFechamento;
  const vencimento = new Date(fechamento.getTime() + gap * 86400000);
  return Math.round((vencimento.getTime() - hoje.getTime()) / 86400000);
}

// ─────────────────────────── De-para (p/ sugestão da IA) ───────────────────────────
async function carregarCartoes(db: any, companyId: number) {
  const res = await dbExecute(db,
    `SELECT id, final4, titular, banco, bandeira FROM financial_cartoes
       WHERE company_id=$1 AND excluido_em IS NULL AND ativo=1`, [companyId]);
  return res.rows.map((c: any) => ({ id: c.id, final4: soDigitos(c.final4), titular: normTxt(c.titular) }));
}
function matchCartao(final4: any, lista: { id: number; final4: string }[]): number | null {
  const d = soDigitos(final4).slice(-4);
  if (d.length < 4) return null;
  for (const c of lista) if (c.final4 && c.final4.slice(-4) === d) return c.id;
  return null;
}

async function carregarCentrosCusto(db: any, companyId: number) {
  const res = await dbExecute(db,
    `SELECT id, nome FROM financial_cost_centers WHERE company_id=$1 AND ativo=1`, [companyId]);
  return res.rows.map((c: any) => ({ id: c.id, nome: c.nome, chave: normTxt(c.nome) }));
}
// Centro de custo "Administrativo/Financeiro" p/ encargos (IOF, anuidade, juros).
function matchCCAdministrativo(lista: { id: number; nome: string; chave: string }[]): { id: number; nome: string } | null {
  for (const c of lista) if (/administrativ/.test(c.chave) || /financeir/.test(c.chave)) return { id: c.id, nome: c.nome };
  return null;
}

// ─────────────────────────── IA: ler fatura (PDF) ───────────────────────────
const PROMPT_FATURA = `Você é um extrator de dados de FATURAS DE CARTÃO DE CRÉDITO brasileiras (PDF).
Extraia TODAS as faturas contidas no documento. Um PDF pode conter VÁRIOS cartões
(cada cartão = uma fatura separada). Para cada fatura devolva:
- cartaoFinal4: os 4 últimos dígitos do cartão (string), se houver.
- cartaoTitular: nome do titular impresso, se houver.
- banco: nome do banco emissor (ex.: "Santander", "Caixa").
- bandeira: bandeira (ex.: "Mastercard", "Visa").
- vencimento: data de vencimento da fatura em YYYY-MM-DD.
- diaVencimento: dia do mês de vencimento da fatura (número inteiro 1-31, ex.: 12). Extraia SEMPRE que houver qualquer menção de vencimento, mesmo que seja só o dia.
- fechamento: data de fechamento da fatura em YYYY-MM-DD (se houver).
- diaFechamento: dia do mês de fechamento da fatura (número inteiro 1-31, ex.: 28). Extraia SEMPRE que houver qualquer menção de fechamento/corte, mesmo que seja só o dia (ex.: "fecha dia 28", "corte: 28", "melhor dia de compra: 29 (fecha: 28)").
- limiteTotalCartao: limite TOTAL do cartão em BRL (número), se aparecer explicitamente na fatura (ex.: "Limite total R$ 20.000,00" ou "Limite do cartão"). Use null se não encontrar.
- total: valor TOTAL da fatura (número, ponto decimal).
- totalCompras: soma das compras do período (número), se houver.
- faturaAnterior: saldo da fatura anterior (número), se houver.
- pagamentos: total de pagamentos/créditos do período (número negativo ou positivo), se houver.
- itens: lista de lançamentos, cada um com:
   - data: data do lançamento (YYYY-MM-DD; se só houver dia/mês use DD/MM).
   - descricao: descrição do estabelecimento/lançamento.
   - cidade: cidade/UF se houver.
   - valor: valor em BRL (número; positivo p/ compra, negativo p/ crédito/pagamento).
   - moeda: moeda original (ex.: "USD") se for compra internacional; senão "BRL".
   - valorOrigem: valor na moeda original se internacional, senão igual a valor.
   - cotacao: cotação aplicada se internacional, senão null.
   - parcelaAtual / parcelaTotal: números da parcela (ex.: "PARC 02/10" => 2 e 10), senão null.
   - tipo: classifique cada item em:
       "compra"  = aquisição de bem/serviço (apropriável a obra/centro de custo).
       "credito" = pagamento da fatura, estorno, crédito, desconto (NÃO apropriável).
       "encargo" = IOF, anuidade, juros, multa, tarifa, seguro (custo administrativo/financeiro).
Responda SOMENTE com JSON. Não invente valores: use null quando não souber.
Valores monetários SEM separador de milhar e com ponto decimal.`;

const SCHEMA_FATURA = {
  type: "object",
  properties: {
    faturas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          cartaoFinal4: { type: "string", nullable: true },
          cartaoTitular: { type: "string", nullable: true },
          banco: { type: "string", nullable: true },
          bandeira: { type: "string", nullable: true },
          vencimento: { type: "string", nullable: true },
          diaVencimento: { type: "number", nullable: true },
          fechamento: { type: "string", nullable: true },
          diaFechamento: { type: "number", nullable: true },
          limiteTotalCartao: { type: "number", nullable: true },
          total: { type: "number", nullable: true },
          totalCompras: { type: "number", nullable: true },
          faturaAnterior: { type: "number", nullable: true },
          pagamentos: { type: "number", nullable: true },
          itens: {
            type: "array",
            items: {
              type: "object",
              properties: {
                data: { type: "string", nullable: true },
                descricao: { type: "string", nullable: true },
                cidade: { type: "string", nullable: true },
                valor: { type: "number", nullable: true },
                moeda: { type: "string", nullable: true },
                valorOrigem: { type: "number", nullable: true },
                cotacao: { type: "number", nullable: true },
                parcelaAtual: { type: "integer", nullable: true },
                parcelaTotal: { type: "integer", nullable: true },
                tipo: { type: "string", nullable: true },
              },
            },
          },
        },
      },
    },
  },
} as const;

function salvageJson(text: string): any {
  if (!text) throw new Error("IA não retornou conteúdo.");
  try { return JSON.parse(text); } catch { /* fallback abaixo */ }
  // Salvage: pega o 1º objeto {...} balanceado no texto (caso venha cercado de prosa/markdown).
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start > -1 && end > start) {
    const slice = text.slice(start, end + 1);
    try { return JSON.parse(slice); } catch { /* segue erro */ }
  }
  throw new Error("Não consegui interpretar o JSON da IA.");
}

async function lerFaturaComIA(fileBase64: string, mimeType: string): Promise<any> {
  // Gemini é o caminho primário (GOOGLE_API_KEY garantida + suporta PDF + JSON mode).
  // Rev. 3306 — quando o Gemini falha (tipicamente 429 RESOURCE_EXHAUSTED do
  // free-tier, mesmo depois dos retries internos com retryDelay), CAI PRO Anthropic
  // Vision (Claude), que suporta PDF e está disponível via a integração instalada.
  // Antes o fallback só acontecia se GOOGLE_API_KEY estivesse AUSENTE — então a cota
  // esgotada do Gemini derrubava a leitura inteira ("Falha ao ler a fatura").
  let geminiErr: any = null;
  if (process.env.GOOGLE_API_KEY) {
    try {
      const txt = await invokeGeminiVision({
        prompt: PROMPT_FATURA,
        base64: fileBase64,
        mimeType,
        responseSchema: SCHEMA_FATURA as any,
        maxTokens: 16384,
        thinking: "off",
      });
      return salvageJson(txt);
    } catch (e: any) {
      geminiErr = e;
      console.warn(`[cartao] Gemini Vision falhou na leitura da fatura, tentando Anthropic: ${e?.message || e}`);
    }
  }
  // Fallback Anthropic (se a integração/chave estiver configurada). `invokeAnthropicVision`
  // lança "Anthropic não configurado" quando não há cliente — nesse caso propagamos o
  // erro do Gemini (que traz a mensagem de cota, mais útil pro usuário).
  try {
    const txt = await invokeAnthropicVision({
      prompt: PROMPT_FATURA + "\nResponda SOMENTE com JSON válido.",
      files: [{ base64: fileBase64, mimeType }],
      maxTokens: 16384,
    });
    return salvageJson(txt);
  } catch (e: any) {
    if (geminiErr) throw geminiErr;
    throw e;
  }
}

// Normaliza uma fatura crua da IA → forma canônica (datas/valores validados,
// itens com tipo válido). NÃO grava. Usada no preview E no confirmar.
function normalizarFatura(raw: any) {
  const fechamento = normItemDate(raw?.fechamento, null);
  const vencimento = normItemDate(raw?.vencimento, fechamento) ?? normItemDate(raw?.vencimento, null);
  const refISO = vencimento || fechamento;
  const itensRaw: any[] = Array.isArray(raw?.itens) ? raw.itens : [];
  const itens = itensRaw.map((it: any) => {
    let tipo = normTxt(it?.tipo);
    if (!TIPOS_ITEM.includes(tipo as any)) tipo = "compra";
    return {
      data: normItemDate(it?.data, refISO),
      descricao: it?.descricao != null ? String(it.descricao).trim().slice(0, 300) : null,
      cidade: it?.cidade != null ? String(it.cidade).trim().slice(0, 120) : null,
      valor: parseValor(it?.valor),
      moeda: it?.moeda != null ? String(it.moeda).trim().slice(0, 10).toUpperCase() : "BRL",
      valorOrigem: parseValor(it?.valorOrigem),
      cotacao: parseValor(it?.cotacao),
      parcelaAtual: Number.isFinite(it?.parcelaAtual) ? Number(it.parcelaAtual) : null,
      parcelaTotal: Number.isFinite(it?.parcelaTotal) ? Number(it.parcelaTotal) : null,
      tipo,
    };
  });
  return {
    cartaoFinal4: raw?.cartaoFinal4 != null ? soDigitos(raw.cartaoFinal4).slice(-4) : null,
    cartaoTitular: raw?.cartaoTitular != null ? String(raw.cartaoTitular).trim().slice(0, 255) : null,
    banco: raw?.banco != null ? String(raw.banco).trim().slice(0, 120) : null,
    bandeira: raw?.bandeira != null ? String(raw.bandeira).trim().slice(0, 60) : null,
    vencimento,
    fechamento,
    // diaFechamentoIA / diaVencimentoIA: dia do mês (1-31) para pré-preencher o
    // formulário de cadastro de cartão. Estratégia em 3 camadas (da mais direta
    // à menos):
    // 1) Campo inteiro que a IA extrai diretamente (diaFechamento / diaVencimento).
    // 2) Fatia do dia da string ISO que normItemDate já normalizou (slice(8,10)).
    // 3) null → frontend mostra vazio (campo obrigatório que o usuário preenche).
    diaFechamentoIA: (() => {
      const fromIA = (raw?.diaFechamento != null && Number.isFinite(Number(raw.diaFechamento)))
        ? Number(raw.diaFechamento) : null;
      if (fromIA != null) return fromIA;
      if (fechamento) { const d = parseInt(fechamento.slice(8, 10), 10); return d > 0 ? d : null; }
      return null;
    })(),
    diaVencimentoIA: (() => {
      const fromIA = (raw?.diaVencimento != null && Number.isFinite(Number(raw.diaVencimento)))
        ? Number(raw.diaVencimento) : null;
      if (fromIA != null) return fromIA;
      if (vencimento) { const d = parseInt(vencimento.slice(8, 10), 10); return d > 0 ? d : null; }
      return null;
    })(),
    limiteTotalCartao: parseValor(raw?.limiteTotalCartao),
    total: parseValor(raw?.total),
    totalCompras: parseValor(raw?.totalCompras),
    faturaAnterior: parseValor(raw?.faturaAnterior),
    pagamentos: parseValor(raw?.pagamentos),
    mesRef: refISO ? parseInt(refISO.slice(5, 7), 10) : null,
    anoRef: refISO ? parseInt(refISO.slice(0, 4), 10) : null,
    itens,
  };
}

// ─────────────────────────── Router ───────────────────────────
export const cartaoRouter = router({

  // ── Cadastro de cartões ──────────────────────────────────────────────
  listarCartoes: protectedProcedure.input(z.object({
    companyId: z.number(),
    incluirInativos: z.boolean().optional(),
  })).query(async ({ input, ctx }) => {
    await assertCompanyAccess(ctx.user, input.companyId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const res = await dbExecute(db,
      `SELECT id, company_id AS "companyId", banco, bandeira, final4,
              titular, tipo_pessoa AS "tipoPessoa", COALESCE(escopo, 'fc') AS escopo,
              CASE WHEN status IS NOT NULL THEN status WHEN ativo = 0 THEN 'inativo' ELSE 'ativo' END AS status, dia_fechamento AS "diaFechamento",
              dia_vencimento AS "diaVencimento", limite, ativo, observacao,
              created_at AS "createdAt"
         FROM financial_cartoes
        WHERE company_id=$1 AND excluido_em IS NULL ${input.incluirInativos ? "" : "AND ativo=1"}
        ORDER BY banco NULLS LAST, final4 NULLS LAST, id DESC`,
      [input.companyId]);
    // Alerta PESSOAL: cartão PF é um cartão pessoal sendo usado pela empresa →
    // sugerir regularização (não pode ter cartão pessoal pagando despesa da FC).
    return res.rows.map((c: any) => ({
      ...c,
      limite: c.limite != null ? parseFloat(c.limite) : null,
      alertaPessoal: String(c.tipoPessoa || "").toUpperCase() === "PF",
    }));
  }),

  criarCartao: protectedProcedure.input(z.object({
    companyId: z.number(),
    banco: z.string().max(120).optional(),
    bandeira: z.string().max(60).optional(),
    final4: z.string().max(8).optional(),
    titular: z.string().max(255).optional(),
    tipoPessoa: z.enum(["PF", "PJ"]).default("PJ"),
    escopo: z.enum(ESCOPO_CARTAO).default("fc"),
    status: z.enum(STATUS_CARTAO).default("ativo"),
    diaFechamento: z.number().int().min(1).max(31).nullable().optional(),
    diaVencimento: z.number().int().min(1).max(31).nullable().optional(),
    limite: z.number().nullable().optional(),
    observacao: z.string().max(2000).optional(),
  })).mutation(async ({ input, ctx }) => {
    await assertCompanyAccess(ctx.user, input.companyId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const res = await dbExecute(db,
      `INSERT INTO financial_cartoes
         (company_id, banco, bandeira, final4, titular, tipo_pessoa, escopo, status,
          dia_fechamento, dia_vencimento, limite, ativo, observacao, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW(),NOW()) RETURNING id`,
      [
        input.companyId, input.banco ?? null, input.bandeira ?? null,
        input.final4 ? soDigitos(input.final4).slice(-4) : null,
        input.titular ?? null, input.tipoPessoa, input.escopo, input.status,
        input.diaFechamento ?? null, input.diaVencimento ?? null,
        input.limite ?? null, ativoDeStatus(input.status), input.observacao ?? null,
      ]);
    return { id: res.rows[0]?.id };
  }),

  atualizarCartao: protectedProcedure.input(z.object({
    id: z.number(),
    companyId: z.number(),
    banco: z.string().max(120).nullable().optional(),
    bandeira: z.string().max(60).nullable().optional(),
    final4: z.string().max(8).nullable().optional(),
    titular: z.string().max(255).nullable().optional(),
    tipoPessoa: z.enum(["PF", "PJ"]).optional(),
    escopo: z.enum(ESCOPO_CARTAO).optional(),
    status: z.enum(STATUS_CARTAO).optional(),
    diaFechamento: z.number().int().min(1).max(31).nullable().optional(),
    diaVencimento: z.number().int().min(1).max(31).nullable().optional(),
    limite: z.number().nullable().optional(),
    ativo: z.boolean().optional(),
    observacao: z.string().max(2000).nullable().optional(),
  })).mutation(async ({ input, ctx }) => {
    await assertCompanyAccess(ctx.user, input.companyId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const sets: string[] = []; const params: unknown[] = [];
    let p = 1;
    const add = (col: string, val: unknown) => { sets.push(`${col}=$${p++}`); params.push(val); };
    if (input.banco !== undefined) add("banco", input.banco);
    if (input.bandeira !== undefined) add("bandeira", input.bandeira);
    if (input.final4 !== undefined) add("final4", input.final4 ? soDigitos(input.final4).slice(-4) : null);
    if (input.titular !== undefined) add("titular", input.titular);
    if (input.tipoPessoa !== undefined) add("tipo_pessoa", input.tipoPessoa);
    if (input.escopo !== undefined) add("escopo", input.escopo);
    if (input.status !== undefined) { add("status", input.status); add("ativo", ativoDeStatus(input.status)); }
    if (input.diaFechamento !== undefined) add("dia_fechamento", input.diaFechamento);
    if (input.diaVencimento !== undefined) add("dia_vencimento", input.diaVencimento);
    if (input.limite !== undefined) add("limite", input.limite);
    if (input.ativo !== undefined && input.status === undefined) add("ativo", input.ativo ? 1 : 0);
    if (input.observacao !== undefined) add("observacao", input.observacao);
    if (sets.length === 0) return { ok: true, alterado: 0 };
    sets.push(`updated_at=NOW()`);
    const idP = p++, coP = p;
    const res = await dbExecute(db,
      `UPDATE financial_cartoes SET ${sets.join(", ")}
        WHERE id=$${idP} AND company_id=$${coP} AND excluido_em IS NULL RETURNING id`,
      [...params, input.id, input.companyId]);
    return { ok: true, alterado: res.rows.length };
  }),

  excluirCartao: protectedProcedure.input(z.object({
    id: z.number(), companyId: z.number(),
  })).mutation(async ({ input, ctx }) => {
    await assertCompanyAccess(ctx.user, input.companyId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const res = await dbExecute(db,
      `UPDATE financial_cartoes SET excluido_em=NOW()
        WHERE id=$1 AND company_id=$2 AND excluido_em IS NULL RETURNING id`,
      [input.id, input.companyId]);
    return { ok: true, excluido: res.rows.length };
  }),

  // Rev. 4017 — Item 12: resumo enxuto de cartões pra tela de Cotação/OC
  // (mostrar limite disponível + fechamento/vencimento assim que "cartão de
  // crédito" for selecionado como forma de pagamento). "Comprometido" =
  // soma das faturas com saldo em aberto (total > pagamentos) — aproximação
  // transparente, já que não existe status explícito de fatura paga/aberta.
  // Rev. 4019 — Item novo do docx: sugerir automaticamente o MELHOR cartão FC
  // (nunca "local") considerando (1) melhor data de compra em relação ao ciclo
  // de fechamento/vencimento (mais dias de float) e (2) limite disponível ≥
  // valor da compra, quando informado. Usuário sempre pode sobrepor a sugestão.
  resumoParaCompra: protectedProcedure.input(z.object({
    companyId: z.number(),
    valorCompra: z.number().nullable().optional(),
  })).query(async ({ input, ctx }) => {
    await assertCompanyAccess(ctx.user, input.companyId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const res = await dbExecute(db,
      `SELECT c.id, c.banco, c.bandeira, c.final4, c.titular, c.tipo_pessoa AS "tipoPessoa",
              COALESCE(c.escopo, 'fc') AS escopo,
              c.dia_fechamento AS "diaFechamento", c.dia_vencimento AS "diaVencimento",
              c.limite,
              COALESCE((
                SELECT SUM(f.total - COALESCE(f.pagamentos, 0))
                  FROM financial_cartao_faturas f
                 WHERE f.cartao_id = c.id AND f.company_id = c.company_id
                   AND f.excluido_em IS NULL
                   AND f.total > COALESCE(f.pagamentos, 0)
              ), 0) AS comprometido
         FROM financial_cartoes c
        WHERE c.company_id=$1 AND c.excluido_em IS NULL AND c.ativo=1
          AND COALESCE(c.escopo, 'fc') = 'fc'
          AND COALESCE(c.status, 'ativo') = 'ativo'
        ORDER BY c.banco NULLS LAST, c.final4 NULLS LAST, c.id DESC`,
      [input.companyId]);

    const hoje = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
    const valorCompra = input.valorCompra ?? null;

    const cartoes = res.rows.map((c: any) => {
      const limite = c.limite != null ? parseFloat(c.limite) : null;
      const comprometido = parseFloat(c.comprometido ?? "0");
      const limiteDisponivel = limite != null ? Math.max(limite - comprometido, 0) : null;
      const diasFloat = (c.diaFechamento != null && c.diaVencimento != null)
        ? diasFloatSeComprarHoje(Number(c.diaFechamento), Number(c.diaVencimento), hoje)
        : null;
      const cabeNoLimite = valorCompra == null || limiteDisponivel == null ? null : limiteDisponivel >= valorCompra;
      return {
        ...c,
        limite,
        comprometido,
        limiteDisponivel,
        diasFloat,
        cabeNoLimite,
        alertaPessoal: String(c.tipoPessoa || "").toUpperCase() === "PF",
      };
    });

    // Recomendado: entre os que CABEM no limite (ou todos, se valorCompra não veio,
    // ou se nenhum cabe — mostra o melhor mesmo assim, com aviso), o de maior
    // "float" (mais dias até o vencimento comprando hoje).
    const elegiveis = cartoes.filter((c) => c.cabeNoLimite !== false);
    const pool = elegiveis.length > 0 ? elegiveis : cartoes;
    const melhor = pool.reduce((best: any, c: any) => {
      if (!best) return c;
      if (c.diasFloat == null) return best;
      if (best.diasFloat == null || c.diasFloat > best.diasFloat) return c;
      return best;
    }, null as any);

    return cartoes.map((c) => ({ ...c, recomendado: melhor != null && c.id === melhor.id }));
  }),

  // ── Faturas ──────────────────────────────────────────────────────────
  listarFaturas: protectedProcedure.input(z.object({
    companyId: z.number(),
    cartaoId: z.number().optional(),
    ano: z.number().int().optional(),
    mes: z.number().int().min(1).max(12).optional(),
    limit: z.number().int().min(1).max(2000).default(500),
  })).query(async ({ input, ctx }) => {
    await assertCompanyAccess(ctx.user, input.companyId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const where: string[] = [`f.company_id=$1`, `f.excluido_em IS NULL`];
    const params: unknown[] = [input.companyId];
    let p = 2;
    if (input.cartaoId != null) { where.push(`f.cartao_id=$${p++}`); params.push(input.cartaoId); }
    if (input.ano != null) { where.push(`f.ano_ref=$${p++}`); params.push(input.ano); }
    if (input.mes != null) { where.push(`f.mes_ref=$${p++}`); params.push(input.mes); }
    const res = await dbExecute(db,
      `SELECT f.id, f.company_id AS "companyId", f.cartao_id AS "cartaoId",
              c.banco AS "cartaoBanco", c.bandeira AS "cartaoBandeira",
              c.final4 AS "cartaoFinal4", c.titular AS "cartaoTitular",
              c.tipo_pessoa AS "cartaoTipoPessoa",
              f.vencimento, f.fechamento, f.total, f.total_compras AS "totalCompras",
              f.fatura_anterior AS "faturaAnterior", f.pagamentos,
              f.mes_ref AS "mes", f.ano_ref AS "ano",
              f.origem_arquivo AS "origemArquivo", f.lote_id AS "loteId",
              f.conciliado, f.data_conciliacao AS "dataConciliacao", f.observacao,
              f.created_at AS "createdAt",
              (SELECT COUNT(*)::int FROM financial_cartao_itens i
                 WHERE i.fatura_id=f.id AND i.excluido_em IS NULL) AS "qtdItens"
         FROM financial_cartao_faturas f
         LEFT JOIN financial_cartoes c ON c.id=f.cartao_id AND c.company_id=f.company_id AND c.excluido_em IS NULL
        WHERE ${where.join(" AND ")}
        ORDER BY f.ano_ref DESC NULLS LAST, f.mes_ref DESC NULLS LAST, f.vencimento DESC NULLS LAST, f.id DESC
        LIMIT $${p}`,
      [...params, input.limit]);
    return res.rows.map((r: any) => ({
      ...r,
      total: r.total != null ? parseFloat(r.total) : null,
      totalCompras: r.totalCompras != null ? parseFloat(r.totalCompras) : null,
      faturaAnterior: r.faturaAnterior != null ? parseFloat(r.faturaAnterior) : null,
      pagamentos: r.pagamentos != null ? parseFloat(r.pagamentos) : null,
    }));
  }),

  // Vincula (ou desvincula) uma fatura a um cartão cadastrado. Usado pelo botão
  // "Vincular" da aba Faturas quando a fatura entrou como "Não identificado".
  // Propaga o cartão p/ os itens da fatura (mesma cascata do importarConfirmar) e
  // limpa a observação "Cartão não identificado…" quando passa a ter cartão.
  // Tenant guard: o cartão precisa pertencer à MESMA empresa (e não estar excluído).
  vincularFaturaCartao: protectedProcedure.input(z.object({
    id: z.number(),
    companyId: z.number(),
    cartaoId: z.number().nullable(),
  })).mutation(async ({ input, ctx }) => {
    await assertCompanyAccess(ctx.user, input.companyId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    if (input.cartaoId != null) {
      const ck = await dbExecute(db,
        `SELECT id FROM financial_cartoes WHERE id=$1 AND company_id=$2 AND excluido_em IS NULL LIMIT 1`,
        [input.cartaoId, input.companyId]);
      if (ck.rows.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cartão inválido ou de outra empresa." });
      }
    }
    return await db.transaction(async (tx: any) => {
      // OBS: dbExecute liga params por ORDEM DE APARIÇÃO ($N é cosmético). NÃO
      // reutilizar o mesmo $N — cada aparição precisa do seu próprio valor no
      // array (por isso `cartaoId` aparece 2x). Reusar `$1` quebrava a contagem
      // e deixava `company_id` sem valor (Rev. 3307).
      const fat = await dbExecute(tx,
        `UPDATE financial_cartao_faturas
            SET cartao_id=$1,
                observacao = CASE WHEN $2::int IS NULL THEN observacao ELSE NULL END,
                updated_at=NOW()
          WHERE id=$3 AND company_id=$4 AND excluido_em IS NULL
          RETURNING id`,
        [input.cartaoId, input.cartaoId, input.id, input.companyId]);
      if (fat.rows.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Fatura não encontrada." });
      }
      await dbExecute(tx,
        `UPDATE financial_cartao_itens SET cartao_id=$1, updated_at=NOW()
          WHERE fatura_id=$2 AND company_id=$3`,
        [input.cartaoId, input.id, input.companyId]);
      return { ok: true };
    });
  }),

  // Resumo POR MÊS do ano (para a régua de meses em chips, padrão Conciliação/Cheques).
  resumoMensal: protectedProcedure.input(z.object({
    companyId: z.number(),
    ano: z.number().int(),
    cartaoId: z.number().optional(),
  })).query(async ({ input, ctx }) => {
    await assertCompanyAccess(ctx.user, input.companyId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const params: unknown[] = [input.companyId, input.ano];
    let extra = ""; let pi = 3;
    if (input.cartaoId != null) { extra += ` AND cartao_id=$${pi++}`; params.push(input.cartaoId); }
    const res = await dbExecute(db,
      `SELECT mes_ref AS "mes", COUNT(*)::int AS qtd, COALESCE(SUM(total),0) AS total
         FROM financial_cartao_faturas
        WHERE company_id=$1 AND excluido_em IS NULL AND ano_ref=$2 ${extra}
        GROUP BY mes_ref`, params);
    return res.rows.map((r: any) => ({ mes: r.mes, qtd: r.qtd, total: parseFloat(r.total) || 0 }));
  }),

  // Comparativo MÊS A MÊS por cartão (matriz cartão × mês do ano) — leitura pura
  // p/ a tela "Comparativo": ver se a fatura de cada cartão subiu ou abaixou entre
  // os meses. Read-only; sem ALTER/DROP/DELETE.
  comparativoMensal: protectedProcedure.input(z.object({
    companyId: z.number(),
    ano: z.number().int(),
  })).query(async ({ input, ctx }) => {
    await assertCompanyAccess(ctx.user, input.companyId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const res = await dbExecute(db,
      `SELECT cartao_id AS "cartaoId", mes_ref AS "mes",
              COALESCE(SUM(total),0) AS total, COUNT(*)::int AS qtd
         FROM financial_cartao_faturas
        WHERE company_id=$1 AND excluido_em IS NULL AND ano_ref=$2
        GROUP BY cartao_id, mes_ref`,
      [input.companyId, input.ano]);
    return res.rows.map((r: any) => ({
      cartaoId: Number(r.cartaoId),
      mes: Number(r.mes),
      total: parseFloat(r.total) || 0,
      qtd: Number(r.qtd) || 0,
    }));
  }),

  // ── Análise gerencial dos ITENS da fatura (read-only) ────────────────
  // Rev. 3332 — agrega financial_cartao_itens (granularidade de COMPRA) em
  // várias dimensões gerenciais num só round-trip: composição por tipo
  // (compra×encargo/juros×crédito), evolução mês a mês, perfil de
  // parcelamento (à vista vs Nx), estabelecimentos/itens recorrentes (com nº
  // de vezes e meses distintos), encargos/juros detalhados, gasto por obra e
  // por categoria. Escopo por ANO (via ano_ref da fatura) + cartão opcional.
  // ZERO escrita / ALTER / DROP / DELETE — só leitura agregada.
  analiseGerencial: protectedProcedure.input(z.object({
    companyId: z.number(),
    ano: z.number().int(),
    cartaoId: z.number().optional(),
  })).query(async ({ input, ctx }) => {
    await assertCompanyAccess(ctx.user, input.companyId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    // Filtro de cartão opcional. As queries começam SEMPRE com $1=company,
    // $2=ano; o $3 (cartão) só entra no texto quando há filtro — o dbExecute
    // liga params por ordem de aparição, então o array acompanha o texto.
    const cartaoCond = input.cartaoId != null ? ` AND i.cartao_id=$3` : "";
    const P = (): unknown[] => input.cartaoId != null
      ? [input.companyId, input.ano, input.cartaoId]
      : [input.companyId, input.ano];
    const BASE = `FROM financial_cartao_itens i
        JOIN financial_cartao_faturas f ON f.id = i.fatura_id AND f.company_id = i.company_id AND f.excluido_em IS NULL
       WHERE i.company_id=$1 AND i.excluido_em IS NULL AND f.ano_ref=$2${cartaoCond}`;

    const porTipoR = await dbExecute(db,
      `SELECT i.tipo, COUNT(*)::int AS qtd, COALESCE(SUM(i.valor),0) AS total
         ${BASE} GROUP BY i.tipo`, P());
    const porMesR = await dbExecute(db,
      `SELECT f.mes_ref AS "mes", i.tipo, COALESCE(SUM(i.valor),0) AS total
         ${BASE} GROUP BY f.mes_ref, i.tipo`, P());
    const perfilR = await dbExecute(db,
      `SELECT COALESCE(i.parcela_total,1) AS parcelas, COUNT(*)::int AS qtd,
              COALESCE(SUM(i.valor),0) AS total
         ${BASE} AND i.tipo='compra' GROUP BY 1 ORDER BY 1`, P());
    const estabR = await dbExecute(db,
      `SELECT UPPER(TRIM(i.descricao)) AS est, COUNT(*)::int AS vezes,
              COUNT(DISTINCT f.mes_ref)::int AS meses, COALESCE(SUM(i.valor),0) AS total,
              MAX(COALESCE(i.parcela_total,1))::int AS "maxParcelas"
         ${BASE} AND i.tipo='compra' AND i.descricao IS NOT NULL AND TRIM(i.descricao)<>''
        GROUP BY 1 HAVING COUNT(*)>1 ORDER BY vezes DESC, total DESC LIMIT 20`, P());
    const encargosR = await dbExecute(db,
      `SELECT UPPER(TRIM(i.descricao)) AS est, COUNT(*)::int AS qtd,
              COALESCE(SUM(i.valor),0) AS total
         ${BASE} AND i.tipo='encargo' AND i.descricao IS NOT NULL AND TRIM(i.descricao)<>''
        GROUP BY 1 ORDER BY total DESC LIMIT 30`, P());
    const porObraR = await dbExecute(db,
      `SELECT COALESCE(NULLIF(TRIM(i.obra_nome),''),'(sem obra)') AS obra,
              COUNT(*)::int AS qtd, COALESCE(SUM(i.valor),0) AS total
         ${BASE} AND i.tipo='compra' GROUP BY 1 ORDER BY total DESC LIMIT 15`, P());
    const porCatR = await dbExecute(db,
      `SELECT COALESCE(NULLIF(TRIM(i.categoria_nome),''),'(sem categoria)') AS cat,
              COUNT(*)::int AS qtd, COALESCE(SUM(i.valor),0) AS total
         ${BASE} AND i.tipo='compra' GROUP BY 1 ORDER BY total DESC LIMIT 15`, P());

    // Rev. 3340 — "onde mais gastamos": top estabelecimentos por VALOR TOTAL
    // (sem HAVING>1, então inclui compras únicas de alto valor, ao contrário do
    // corte `estabelecimentos` que exige recorrência). READ-ONLY.
    const maioresR = await dbExecute(db,
      `SELECT UPPER(TRIM(i.descricao)) AS est, COUNT(*)::int AS vezes,
              COUNT(DISTINCT f.mes_ref)::int AS meses, COALESCE(SUM(i.valor),0) AS total,
              MAX(COALESCE(i.parcela_total,1))::int AS "maxParcelas"
         ${BASE} AND i.tipo='compra' AND i.descricao IS NOT NULL AND TRIM(i.descricao)<>''
        GROUP BY 1 ORDER BY total DESC, vezes DESC LIMIT 20`, P());
    // Rev. 3340 — gasto por CIDADE/local geográfico (coluna i.cidade). READ-ONLY.
    const porCidadeR = await dbExecute(db,
      `SELECT COALESCE(NULLIF(UPPER(TRIM(i.cidade)),''),'(sem cidade)') AS cidade,
              COUNT(*)::int AS qtd, COALESCE(SUM(i.valor),0) AS total
         ${BASE} AND i.tipo='compra' GROUP BY 1 ORDER BY total DESC LIMIT 15`, P());

    const num = (v: any) => (v != null ? parseFloat(v) : 0) || 0;
    return {
      porTipo: porTipoR.rows.map((r: any) => ({ tipo: String(r.tipo || ""), qtd: Number(r.qtd) || 0, total: num(r.total) })),
      porMes: porMesR.rows.map((r: any) => ({ mes: Number(r.mes) || 0, tipo: String(r.tipo || ""), total: num(r.total) })),
      perfilParcelas: perfilR.rows.map((r: any) => ({ parcelas: Number(r.parcelas) || 1, qtd: Number(r.qtd) || 0, total: num(r.total) })),
      estabelecimentos: estabR.rows.map((r: any) => ({ est: String(r.est || ""), vezes: Number(r.vezes) || 0, meses: Number(r.meses) || 0, total: num(r.total), maxParcelas: Number(r.maxParcelas) || 1 })),
      maioresEstabelecimentos: maioresR.rows.map((r: any) => ({ est: String(r.est || ""), vezes: Number(r.vezes) || 0, meses: Number(r.meses) || 0, total: num(r.total), maxParcelas: Number(r.maxParcelas) || 1 })),
      porCidade: porCidadeR.rows.map((r: any) => ({ cidade: String(r.cidade || ""), qtd: Number(r.qtd) || 0, total: num(r.total) })),
      encargos: encargosR.rows.map((r: any) => ({ est: String(r.est || ""), qtd: Number(r.qtd) || 0, total: num(r.total) })),
      porObra: porObraR.rows.map((r: any) => ({ obra: String(r.obra || ""), qtd: Number(r.qtd) || 0, total: num(r.total) })),
      porCategoria: porCatR.rows.map((r: any) => ({ cat: String(r.cat || ""), qtd: Number(r.qtd) || 0, total: num(r.total) })),
    };
  }),

  // ── Drill-in: lançamentos por trás de um ponto do gráfico (READ-ONLY) ──
  // Recebe os MESMOS recortes da `analiseGerencial` (tipo, mês, parcelas,
  // natureza do encargo, estabelecimento, obra, categoria) e devolve os ITENS
  // individuais que compõem aquele número. Zero gravação.
  itensDrill: protectedProcedure.input(z.object({
    companyId: z.number(),
    ano: z.number().int(),
    cartaoId: z.number().optional(),
    tipo: z.enum(["compra", "encargo", "credito"]).optional(),
    mes: z.number().int().min(1).max(12).optional(),
    // 1 = à vista; >1 = N parcelas exatas; -1 = qualquer parcelado (>1)
    parcelas: z.number().int().optional(),
    natureza: z.string().max(60).optional(),
    estabelecimento: z.string().max(255).optional(),
    obra: z.string().max(255).optional(),
    categoria: z.string().max(255).optional(),
  })).query(async ({ input, ctx }) => {
    await assertCompanyAccess(ctx.user, input.companyId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    // dbExecute liga params por ORDEM DE APARIÇÃO → emitir o placeholder e
    // empilhar o valor juntos garante o casamento texto↔array.
    const params: unknown[] = [];
    let p = 0;
    const ph = (v: unknown) => { params.push(v); return `$${++p}`; };

    // CASE da natureza do encargo: ESPELHA exatamente a precedência do
    // classifEncargo do front (IOF > Anuidade > Juros > Multa/Mora > Seguro > Tarifas > Outros).
    const descUpper = `UPPER(COALESCE(i.descricao,''))`;
    const naturezaCase = `CASE
        WHEN ${descUpper} LIKE '%IOF%' THEN 'IOF'
        WHEN ${descUpper} LIKE '%ANUIDADE%' THEN 'Anuidade'
        WHEN ${descUpper} LIKE '%JURO%' THEN 'Juros'
        WHEN ${descUpper} LIKE '%MULTA%' OR ${descUpper} LIKE '%MORA%' THEN 'Multa/Mora'
        WHEN ${descUpper} LIKE '%SEGURO%' THEN 'Seguro'
        WHEN ${descUpper} LIKE '%TARIFA%' OR ${descUpper} LIKE '%TAXA%' THEN 'Tarifas'
        ELSE 'Outros encargos' END`;

    let where = `i.company_id=${ph(input.companyId)} AND i.excluido_em IS NULL AND f.ano_ref=${ph(input.ano)} AND f.excluido_em IS NULL`;
    if (input.cartaoId != null) where += ` AND i.cartao_id=${ph(input.cartaoId)}`;
    // natureza só faz sentido em encargo → força o tipo.
    const tipoEfetivo = input.natureza ? "encargo" : input.tipo;
    if (tipoEfetivo) where += ` AND i.tipo=${ph(tipoEfetivo)}`;
    if (input.mes != null) where += ` AND f.mes_ref=${ph(input.mes)}`;
    if (input.parcelas != null) {
      if (input.parcelas === 1) where += ` AND COALESCE(i.parcela_total,1)<=1`;
      else if (input.parcelas === -1) where += ` AND COALESCE(i.parcela_total,1)>1`;
      else where += ` AND COALESCE(i.parcela_total,1)=${ph(input.parcelas)}`;
    }
    if (input.estabelecimento) where += ` AND UPPER(TRIM(i.descricao))=${ph(input.estabelecimento.toUpperCase())}`;
    if (input.obra) {
      where += input.obra === "(sem obra)"
        ? ` AND COALESCE(NULLIF(TRIM(i.obra_nome),''),'(sem obra)')='(sem obra)'`
        : ` AND TRIM(i.obra_nome)=${ph(input.obra)}`;
    }
    if (input.categoria) {
      where += input.categoria === "(sem categoria)"
        ? ` AND COALESCE(NULLIF(TRIM(i.categoria_nome),''),'(sem categoria)')='(sem categoria)'`
        : ` AND TRIM(i.categoria_nome)=${ph(input.categoria)}`;
    }
    if (input.natureza) where += ` AND (${naturezaCase})=${ph(input.natureza)}`;

    const BASE = `FROM financial_cartao_itens i
        JOIN financial_cartao_faturas f ON f.id = i.fatura_id AND f.company_id = i.company_id AND f.excluido_em IS NULL
        LEFT JOIN financial_cartoes c ON c.id = i.cartao_id AND c.company_id = i.company_id AND c.excluido_em IS NULL
       WHERE ${where}`;

    const itensR = await dbExecute(db,
      `SELECT i.id, i.data, i.descricao, i.cidade, i.valor, i.tipo,
              i.parcela_atual AS "parcelaAtual", i.parcela_total AS "parcelaTotal",
              i.obra_nome AS "obraNome", i.categoria_nome AS "categoriaNome",
              i.centro_custo_nome AS "centroCustoNome",
              f.mes_ref AS "mesRef", f.ano_ref AS "anoRef",
              c.banco AS "cartaoBanco", c.final4 AS "cartaoFinal4"
         ${BASE}
        ORDER BY i.data NULLS LAST, ABS(i.valor) DESC, i.id
        LIMIT 1000`, [...params]);

    const num = (v: any) => (v != null ? parseFloat(v) : 0) || 0;
    const itens = itensR.rows.map((r: any) => ({
      id: Number(r.id),
      data: r.data ?? null,
      descricao: r.descricao ?? null,
      cidade: r.cidade ?? null,
      valor: num(r.valor),
      tipo: String(r.tipo || ""),
      parcelaAtual: r.parcelaAtual != null ? Number(r.parcelaAtual) : null,
      parcelaTotal: r.parcelaTotal != null ? Number(r.parcelaTotal) : null,
      obraNome: r.obraNome ?? null,
      categoriaNome: r.categoriaNome ?? null,
      centroCustoNome: r.centroCustoNome ?? null,
      mesRef: r.mesRef != null ? Number(r.mesRef) : null,
      anoRef: r.anoRef != null ? Number(r.anoRef) : null,
      cartaoBanco: r.cartaoBanco ?? null,
      cartaoFinal4: r.cartaoFinal4 ?? null,
    }));
    const total = itens.reduce((a, it) => a + it.valor, 0);
    return { itens, qtd: itens.length, total, truncado: itens.length >= 1000 };
  }),

  excluirFatura: protectedProcedure.input(z.object({
    id: z.number(), companyId: z.number(),
  })).mutation(async ({ input, ctx }) => {
    await assertCompanyAccess(ctx.user, input.companyId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.transaction(async (tx: any) => {
      await dbExecute(tx,
        `UPDATE financial_cartao_itens SET excluido_em=NOW()
          WHERE fatura_id=$1 AND company_id=$2 AND excluido_em IS NULL`,
        [input.id, input.companyId]);
      await dbExecute(tx,
        `UPDATE financial_cartao_faturas SET excluido_em=NOW()
          WHERE id=$1 AND company_id=$2 AND excluido_em IS NULL`,
        [input.id, input.companyId]);
    });
    return { ok: true };
  }),

  reverterLote: protectedProcedure.input(z.object({
    companyId: z.number(), loteId: z.string(),
  })).mutation(async ({ input, ctx }) => {
    await assertCompanyAccess(ctx.user, input.companyId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    let revertidas = 0;
    await db.transaction(async (tx: any) => {
      const fats = await dbExecute(tx,
        `SELECT id FROM financial_cartao_faturas
          WHERE company_id=$1 AND lote_id=$2 AND excluido_em IS NULL`,
        [input.companyId, input.loteId]);
      const ids = fats.rows.map((r: any) => r.id);
      revertidas = ids.length;
      for (const fid of ids) {
        await dbExecute(tx,
          `UPDATE financial_cartao_itens SET excluido_em=NOW()
            WHERE fatura_id=$1 AND company_id=$2 AND excluido_em IS NULL`,
          [fid, input.companyId]);
      }
      await dbExecute(tx,
        `UPDATE financial_cartao_faturas SET excluido_em=NOW()
          WHERE company_id=$1 AND lote_id=$2 AND excluido_em IS NULL`,
        [input.companyId, input.loteId]);
    });
    return { ok: true, revertidas };
  }),

  // ── Itens da fatura (classificação) ──────────────────────────────────
  listarItens: protectedProcedure.input(z.object({
    companyId: z.number(),
    faturaId: z.number(),
  })).query(async ({ input, ctx }) => {
    await assertCompanyAccess(ctx.user, input.companyId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const res = await dbExecute(db,
      `SELECT id, company_id AS "companyId", fatura_id AS "faturaId", cartao_id AS "cartaoId",
              data, descricao, cidade, valor, moeda, cotacao, valor_origem AS "valorOrigem",
              parcela_atual AS "parcelaAtual", parcela_total AS "parcelaTotal", tipo,
              obra_id AS "obraId", obra_nome AS "obraNome",
              centro_custo_id AS "centroCustoId", centro_custo_nome AS "centroCustoNome",
              categoria_id AS "categoriaId", categoria_nome AS "categoriaNome",
              categoria_sugerida AS "categoriaSugerida",
              status_classificacao AS "statusClassificacao",
              compra_oc_id AS "compraOcId", compra_oc_numero AS "compraOcNumero"
         FROM financial_cartao_itens
        WHERE company_id=$1 AND fatura_id=$2 AND excluido_em IS NULL
        ORDER BY data NULLS LAST, id`,
      [input.companyId, input.faturaId]);
    return res.rows.map((r: any) => ({
      ...r,
      valor: r.valor != null ? parseFloat(r.valor) : null,
      cotacao: r.cotacao != null ? parseFloat(r.cotacao) : null,
      valorOrigem: r.valorOrigem != null ? parseFloat(r.valorOrigem) : null,
    }));
  }),

  classificarItem: protectedProcedure.input(z.object({
    id: z.number(),
    companyId: z.number(),
    obraId: z.number().nullable().optional(),
    obraNome: z.string().max(255).nullable().optional(),
    centroCustoId: z.number().nullable().optional(),
    centroCustoNome: z.string().max(255).nullable().optional(),
    categoriaId: z.number().nullable().optional(),
    categoriaNome: z.string().max(255).nullable().optional(),
    tipo: z.enum(TIPOS_ITEM).optional(),
    statusClassificacao: z.enum(STATUS_CLASSIF).optional(),
    compraOcId: z.number().nullable().optional(),
    compraOcNumero: z.string().max(20).nullable().optional(),
  })).mutation(async ({ input, ctx }) => {
    await assertCompanyAccess(ctx.user, input.companyId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    // Rev. 4019 — vínculo manual com uma OC de Compras (quando o auxiliar quer
    // corrigir/forçar o match automático). Confirma que a OC pertence à mesma
    // empresa antes de gravar (evita IDOR cross-tenant via id arbitrário).
    if (input.compraOcId !== undefined && input.compraOcId != null) {
      const ocCheck = await dbExecute(db,
        `SELECT id, numero_oc AS "numeroOc" FROM compras_ordens WHERE id=$1 AND company_id=$2 LIMIT 1`,
        [input.compraOcId, input.companyId]);
      if (ocCheck.rows.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "OC não encontrada nesta empresa" });
    }
    const sets: string[] = []; const params: unknown[] = [];
    let p = 1;
    const add = (col: string, val: unknown) => { sets.push(`${col}=$${p++}`); params.push(val); };
    if (input.obraId !== undefined) add("obra_id", input.obraId);
    if (input.obraNome !== undefined) add("obra_nome", input.obraNome);
    if (input.centroCustoId !== undefined) add("centro_custo_id", input.centroCustoId);
    if (input.centroCustoNome !== undefined) add("centro_custo_nome", input.centroCustoNome);
    if (input.categoriaId !== undefined) add("categoria_id", input.categoriaId);
    if (input.categoriaNome !== undefined) add("categoria_nome", input.categoriaNome);
    if (input.tipo !== undefined) add("tipo", input.tipo);
    if (input.statusClassificacao !== undefined) add("status_classificacao", input.statusClassificacao);
    if (input.compraOcId !== undefined) add("compra_oc_id", input.compraOcId);
    if (input.compraOcNumero !== undefined) add("compra_oc_numero", input.compraOcNumero);
    if (sets.length === 0) return { ok: true, alterado: 0 };
    sets.push(`updated_at=NOW()`);
    const idP = p++, coP = p;
    const res = await dbExecute(db,
      `UPDATE financial_cartao_itens SET ${sets.join(", ")}
        WHERE id=$${idP} AND company_id=$${coP} AND excluido_em IS NULL RETURNING id`,
      [...params, input.id, input.companyId]);
    return { ok: true, alterado: res.rows.length };
  }),

  // ── Importação por IA ────────────────────────────────────────────────
  // Dry-run: roda a IA no PDF e devolve o JSON estruturado + sugestões de match.
  // ZERO gravação. O cliente revisa e chama importarConfirmar com este MESMO JSON
  // (não re-roda a IA).
  importarPreview: protectedProcedure.input(z.object({
    companyId: z.number(),
    fileBase64: z.string().min(10),
    mimeType: z.string().default("application/pdf"),
  })).mutation(async ({ input, ctx }) => {
    await assertCompanyAccess(ctx.user, input.companyId);
    await assertAiModuleEnabled(input.companyId, "financeiro");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    let bruto: any;
    try { bruto = await lerFaturaComIA(input.fileBase64, input.mimeType); }
    catch (e: any) { throw new TRPCError({ code: "BAD_REQUEST", message: `Não consegui ler a fatura com a IA: ${e?.message || e}` }); }

    const faturasRaw: any[] = Array.isArray(bruto?.faturas) ? bruto.faturas : (bruto ? [bruto] : []);
    if (faturasRaw.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "A IA não encontrou nenhuma fatura no arquivo." });

    const [cartoes, centrosCusto] = await Promise.all([
      carregarCartoes(db, input.companyId),
      carregarCentrosCusto(db, input.companyId),
    ]);
    const ccAdmin = matchCCAdministrativo(centrosCusto);

    const faturas = faturasRaw.map((fr) => {
      const norm = normalizarFatura(fr);
      const cartaoId = matchCartao(norm.cartaoFinal4, cartoes);
      const itens = norm.itens.map((it) => {
        // Encargo (IOF/anuidade/juros) → sugerir CC "Administrativo/Financeiro" (sem obra).
        const sugestaoCC = it.tipo === "encargo" && ccAdmin ? ccAdmin : null;
        return { ...it, centroCustoSugeridoId: sugestaoCC?.id ?? null, centroCustoSugeridoNome: sugestaoCC?.nome ?? null };
      });
      return {
        ...norm,
        itens,
        cartaoIdSugerido: cartaoId,
        cartaoIdentificado: cartaoId != null,
        qtdItens: itens.length,
        qtdCompras: itens.filter((i) => i.tipo === "compra").length,
        qtdEncargos: itens.filter((i) => i.tipo === "encargo").length,
        qtdCreditos: itens.filter((i) => i.tipo === "credito").length,
        somaCompras: Math.round(itens.filter((i) => i.tipo === "compra").reduce((a, i) => a + (i.valor ?? 0), 0) * 100) / 100,
      };
    });

    return {
      faturas,
      resumo: {
        totalFaturas: faturas.length,
        totalItens: faturas.reduce((a, f) => a + f.qtdItens, 0),
        naoIdentificadas: faturas.filter((f) => !f.cartaoIdentificado).length,
        ccAdministrativo: ccAdmin?.nome ?? null,
      },
    };
  }),

  // Grava as faturas+itens a partir do JSON do preview (a IA NÃO re-roda).
  importarConfirmar: protectedProcedure.input(z.object({
    companyId: z.number(),
    origemArquivo: z.string().max(255).optional(),
    faturas: z.array(z.object({
      cartaoId: z.number().nullable().optional(),
      origemArquivo: z.string().max(255).nullable().optional(),
      cartaoFinal4: z.string().nullable().optional(),
      cartaoTitular: z.string().nullable().optional(),
      banco: z.string().nullable().optional(),
      bandeira: z.string().nullable().optional(),
      vencimento: z.string().nullable().optional(),
      fechamento: z.string().nullable().optional(),
      total: z.number().nullable().optional(),
      totalCompras: z.number().nullable().optional(),
      faturaAnterior: z.number().nullable().optional(),
      pagamentos: z.number().nullable().optional(),
      mesRef: z.number().nullable().optional(),
      anoRef: z.number().nullable().optional(),
      itens: z.array(z.object({
        data: z.string().nullable().optional(),
        descricao: z.string().nullable().optional(),
        cidade: z.string().nullable().optional(),
        valor: z.number().nullable().optional(),
        moeda: z.string().nullable().optional(),
        cotacao: z.number().nullable().optional(),
        valorOrigem: z.number().nullable().optional(),
        parcelaAtual: z.number().nullable().optional(),
        parcelaTotal: z.number().nullable().optional(),
        tipo: z.string().nullable().optional(),
        centroCustoSugeridoId: z.number().nullable().optional(),
        centroCustoSugeridoNome: z.string().nullable().optional(),
      })).default([]),
    })).min(1),
  })).mutation(async ({ input, ctx }) => {
    await assertCompanyAccess(ctx.user, input.companyId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    // Tenant guard: só aceitamos cartaoId que comprovadamente pertence à empresa do
    // chamador (senão um cliente poderia forçar o id de um cartão de OUTRA empresa e
    // depois ler os metadados dele via listarFaturas). cartaoId inválido → null.
    const cartoesDaEmpresa = await carregarCartoes(db, input.companyId);
    const idsValidos = new Set(cartoesDaEmpresa.map((c: any) => c.id));
    // Auto-vínculo: mapa final4(4 díg)→id p/ casar faturas que vieram SEM cartaoId
    // (ex.: o cartão foi cadastrado depois do preview, ou o preview não casou). Quando
    // o final4 reconhece um cartão da empresa, a fatura já entra vinculada.
    const mapaFinal4 = new Map<string, number>();
    for (const c of cartoesDaEmpresa) {
      const d = soDigitos(c.final4).slice(-4);
      if (d.length === 4 && !mapaFinal4.has(d)) mapaFinal4.set(d, c.id);
    }

    const loteId = randomUUID();
    const origem = (input.origemArquivo || "fatura-pdf").slice(0, 255);
    let faturasInseridas = 0, itensInseridos = 0, faturasPuladas = 0, itensPulados = 0;

    await db.transaction(async (tx: any) => {
      for (const f of input.faturas) {
        const mesRef = f.mesRef ?? (f.vencimento ? parseInt(f.vencimento.slice(5, 7), 10) : null) ?? (f.fechamento ? parseInt(f.fechamento.slice(5, 7), 10) : null);
        const anoRef = f.anoRef ?? (f.vencimento ? parseInt(f.vencimento.slice(0, 4), 10) : null) ?? (f.fechamento ? parseInt(f.fechamento.slice(0, 4), 10) : null);
        let cartaoId = f.cartaoId != null && idsValidos.has(f.cartaoId) ? f.cartaoId : null;
        const d4 = f.cartaoFinal4 ? soDigitos(f.cartaoFinal4).slice(-4) : "";
        // Hardening: se o cartaoId do payload NÃO bate com o final4 da fatura (cliente
        // re-casou com valor errado), prefere o vínculo correto pelo final4 cadastrado.
        if (cartaoId != null && d4.length === 4 && mapaFinal4.has(d4) && mapaFinal4.get(d4) !== cartaoId) {
          cartaoId = mapaFinal4.get(d4)!;
        }
        // Reconhecido pelo final4 → vincula automaticamente, mesmo sem cartaoId no payload.
        if (cartaoId == null && d4.length === 4 && mapaFinal4.has(d4)) cartaoId = mapaFinal4.get(d4)!;

        // ── DEDUP FATURA ──────────────────────────────────────────────────────────
        // Se a fatura (empresa + cartão + vencimento) já existe → reaproveita o id
        // existente em vez de inserir um duplicado. Itens novos ainda serão inseridos.
        // Quando cartaoId=null (cartão não identificado) ainda insere normalmente para
        // não perder informação.
        let faturaId: number | null = null;
        let faturaJaExistia = false;

        if (cartaoId != null && f.vencimento) {
          const dup = await dbExecute(tx,
            `SELECT id FROM financial_cartao_faturas
              WHERE company_id=$1 AND cartao_id=$2 AND vencimento=$3 AND excluido_em IS NULL LIMIT 1`,
            [input.companyId, cartaoId, f.vencimento]);
          if (dup.rows.length > 0) {
            faturaId = dup.rows[0].id as number;
            faturaJaExistia = true;
            faturasPuladas++;
          }
        }

        if (!faturaJaExistia) {
          const fatRes = await dbExecute(tx,
            `INSERT INTO financial_cartao_faturas
               (company_id, cartao_id, vencimento, fechamento, total, total_compras,
                fatura_anterior, pagamentos, mes_ref, ano_ref, origem_arquivo, lote_id,
                observacao, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW(),NOW()) RETURNING id`,
            [
              input.companyId, cartaoId, f.vencimento ?? null, f.fechamento ?? null,
              f.total ?? null, f.totalCompras ?? null, f.faturaAnterior ?? null,
              f.pagamentos ?? null, mesRef, anoRef,
              (f.origemArquivo || origem).slice(0, 255), loteId,
              // Guarda final4/titular crus quando o cartão não foi identificado, p/ rastreio.
              cartaoId == null ? `Cartão não identificado: final ${f.cartaoFinal4 ?? "?"} · ${f.cartaoTitular ?? ""}`.slice(0, 2000) : null,
            ]);
          faturaId = fatRes.rows[0]?.id ?? null;
          faturasInseridas++;
        }

        if (faturaId == null) continue; // segurança: INSERT sem RETURNING id

        // ── DEDUP ITENS ───────────────────────────────────────────────────────────
        // Para cada item: verifica se já existe na fatura antes de inserir.
        // Chave de dedup: (fatura_id, data, descricao, valor) — combinação que
        // identifica unicamente uma transação dentro de uma fatura.
        for (const it of f.itens) {
          let tipo = normTxt(it.tipo);
          if (!TIPOS_ITEM.includes(tipo as any)) tipo = "compra";

          const descTrunc = it.descricao != null ? String(it.descricao).slice(0, 300) : null;
          const valorNum = it.valor ?? null;
          const dataStr = it.data ?? null;

          // Checa duplicata pelo trio data+descricao+valor dentro da mesma fatura.
          const dupItem = await dbExecute(tx,
            `SELECT id FROM financial_cartao_itens
              WHERE fatura_id=$1
                AND (data=$2 OR (data IS NULL AND $2::text IS NULL))
                AND descricao=$3
                AND (valor=$4 OR (valor IS NULL AND $4::numeric IS NULL))
                AND excluido_em IS NULL
              LIMIT 1`,
            [faturaId, dataStr, descTrunc, valorNum]);
          if (dupItem.rows.length > 0) { itensPulados++; continue; }

          // Rev. 4019 — tenta casar automaticamente com a OC de Compras que gerou
          // esta compra no cartão (mesma empresa+cartão, valor batendo à vista ou
          // por parcela, data dentro de uma janela de ±20 dias da compra). Quando
          // acha, já chega classificado (obra) e "confirmado" — acelera a conferência
          // do auxiliar financeiro na hora da conciliação do cartão.
          let ocMatch: any = null;
          if (cartaoId != null && tipo === "compra" && valorNum != null && dataStr) {
            const parcelaTotal = it.parcelaTotal && it.parcelaTotal > 1 ? it.parcelaTotal : 1;
            const ocRes = await dbExecute(tx,
              `SELECT o.id, o.numero_oc AS "numeroOc", o.obra_id AS "obraId", ob.nome AS "obraNome"
                 FROM compras_ordens o
                 LEFT JOIN obras ob ON ob.id = o.obra_id
                WHERE o.company_id=$1
                  AND o.forma_pagamento='cartao'
                  AND o.cartao_id=$2
                  AND o.status <> 'cancelado'
                  AND (
                    ABS(o.total - $3) < 0.05
                    OR ($4::int > 1 AND ABS(o.total / NULLIF($4::int, 0) - $3) < 0.05)
                  )
                  AND o.created_at::date BETWEEN ($5::date - INTERVAL '20 days') AND ($5::date + INTERVAL '20 days')
                ORDER BY ABS(EXTRACT(EPOCH FROM (o.created_at::date - $5::date)))
                LIMIT 1`,
              [input.companyId, cartaoId, valorNum, parcelaTotal, dataStr]);
            ocMatch = ocRes.rows[0] ?? null;
          }

          await dbExecute(tx,
            `INSERT INTO financial_cartao_itens
               (company_id, fatura_id, cartao_id, data, descricao, cidade, valor, moeda,
                cotacao, valor_origem, parcela_atual, parcela_total, tipo,
                centro_custo_id, centro_custo_nome, categoria_sugerida, status_classificacao,
                obra_id, obra_nome, compra_oc_id, compra_oc_numero,
                created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,NOW(),NOW())`,
            [
              input.companyId, faturaId, cartaoId,
              dataStr,
              descTrunc,
              it.cidade != null ? String(it.cidade).slice(0, 120) : null,
              valorNum,
              it.moeda != null ? String(it.moeda).slice(0, 10).toUpperCase() : "BRL",
              it.cotacao ?? null, it.valorOrigem ?? null,
              it.parcelaAtual ?? null, it.parcelaTotal ?? null, tipo,
              it.centroCustoSugeridoId ?? null,
              it.centroCustoSugeridoNome != null ? String(it.centroCustoSugeridoNome).slice(0, 255) : null,
              it.centroCustoSugeridoNome != null ? String(it.centroCustoSugeridoNome).slice(0, 255) : null,
              ocMatch ? "confirmado" : "sugerido",
              ocMatch?.obraId ?? null,
              ocMatch?.obraNome != null ? String(ocMatch.obraNome).slice(0, 255) : null,
              ocMatch?.id ?? null,
              ocMatch?.numeroOc != null ? String(ocMatch.numeroOc).slice(0, 20) : null,
            ]);
          itensInseridos++;
        }
      }
    });

    return { ok: true, faturasInseridas, itensInseridos, faturasPuladas, itensPulados, loteId };
  }),
});
