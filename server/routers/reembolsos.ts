// ============================================================================
// MÓDULO REEMBOLSO (Rev. 5052)
// Dois fluxos com a mesma engrenagem:
//  1. Reembolso avulso  — funcionário pagou do bolso, pede reembolso.
//  2. Caixinha (fundo fixo) — colaborador tem crédito (ex.: R$ 500); lança as
//     despesas e a prestação de contas aprovada gera a REPOSIÇÃO do fundo.
// Aprovação (item a item) gera título no Contas a Pagar:
//  - origem_modulo='reembolso'       → reembolso/reposição aprovado
//  - origem_modulo='reembolso_fundo' → crédito inicial do fundo fixo
// Dedup por índice único parcial uq_fin_entries_reembolso.
// Tenancy: resolveCompanyIdsGuard em toda leitura/escrita. Usuário comum
// (role 'user') só enxerga e cria solicitações do PRÓPRIO employee (via
// employees.userId → fallback e-mail).
// ============================================================================
import { z } from "zod";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb, getCompaniesForUser, userIsReembolsoAdmin } from "../db";
import { assertRaioXAccess } from "../raioXGuard";
import {
  employees, obras,
  reembolsoFundos, reembolsoSolicitacoes, reembolsoDespesas,
  financialEntries, financialEntryBaixas,
  vehicles, fleetMaintenances,
} from "../../drizzle/schema";
import { storagePut } from "../storage";
import { invokeAnthropicVision } from "../_core/llm";
import { assertAiModuleEnabled } from "../_core/aiConfig";

// ── Helpers ──────────────────────────────────────────────────────────────────

function resolveCompanyIds(input: { companyId: number; companyIds?: number[] }): number[] {
  return input.companyIds && input.companyIds.length ? input.companyIds : [input.companyId];
}

async function guardCompanyIds(
  ctx: { user: { id: number; role?: string | null } },
  input: { companyId: number; companyIds?: number[] }
): Promise<number[]> {
  const pedidos = resolveCompanyIds(input);
  const permitidas = await getCompaniesForUser(ctx.user.id, (ctx.user.role || "") as string);
  const set = new Set(permitidas.map((c: any) => c.id));
  const ok = pedidos.filter((id) => set.has(id));
  if (ok.length === 0) throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
  return ok;
}

// Rev. 5055 — REGRA DO USER (18/08/2026): no módulo Reembolso, SÓ o Admin
// Master enxerga os lançamentos dos outros, aprova e gerencia caixinhas.
// Qualquer outro papel (inclusive 'admin' comum) vê apenas os PRÓPRIOS.
function isAdminRole(role?: string | null) {
  return role === "admin_master";
}

// Resolve o employee do usuário logado (userId direto > e-mail) dentro das empresas dadas.
async function findEmployeeDoUsuario(db: any, ctx: any, companyIds: number[]): Promise<{ id: number; companyId: number } | null> {
  const porUserId = await db.select({ id: employees.id, companyId: employees.companyId })
    .from(employees)
    .where(and(eq(employees.userId, ctx.user.id), inArray(employees.companyId, companyIds), isNull(employees.deletedAt)))
    .limit(1);
  if (porUserId.length) return porUserId[0];
  const email = (ctx.user.email || "").trim().toLowerCase();
  if (!email) return null;
  const porEmail = await db.select({ id: employees.id, companyId: employees.companyId })
    .from(employees)
    .where(and(sql`LOWER(TRIM(${employees.email})) = ${email}`, inArray(employees.companyId, companyIds), isNull(employees.deletedAt)))
    .limit(1);
  return porEmail.length ? porEmail[0] : null;
}

const num = (v: any) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
// Dinheiro em CENTAVOS inteiros (evita drift de float). money() formata "NNN.NN".
const toCents = (n: number) => Math.round(n * 100);
const money = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
const moneyFromCents = (c: number) => (c / 100).toFixed(2);
// Valor monetário exato: positivo e no máximo 2 casas decimais.
const zMoney = z.number().positive().refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, {
  message: "Valor monetário deve ter no máximo 2 casas decimais.",
});

export const CATEGORIAS_REEMBOLSO = [
  "transporte", "alimentacao", "combustivel", "pedagio", "material", "hospedagem",
  "manutencao_veiculo", "outros",
] as const;

const despesaInput = z.object({
  obraId: z.number().nullable().optional(),
  categoria: z.enum(CATEGORIAS_REEMBOLSO).default("outros"),
  descricao: z.string().min(2),
  dataDespesa: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  valor: zMoney,
  comprovanteUrl: z.string().nullable().optional(),
  comprovanteKey: z.string().min(5),
  // Rev. 5064 — dados do estabelecimento (IA lê da notinha; opcional)
  estabelecimentoNome: z.string().max(200).nullable().optional(),
  estabelecimentoCnpj: z.string().max(20).nullable().optional(),
  estabelecimentoEndereco: z.string().max(400).nullable().optional(),
  // Rev. 5062 — alocação no planejamento orçamentário (EAP) da obra (opcional)
  orcamentoItemId: z.number().nullable().optional(),
  eapCodigo: z.string().max(40).nullable().optional(),
  eapDescricao: z.string().max(500).nullable().optional(),
  // Rev. 5072 — rastreio do documento fiscal (anti-duplicidade)
  docChave: z.string().max(60).nullable().optional(),
  docNumero: z.string().max(30).nullable().optional(),
  // Rev. 5080 — itens discriminados da nota (IA; [{qtd,descricao,valor}])
  itens: z.array(z.object({
    qtd: z.string().max(20).nullable().optional(),
    descricao: z.string().max(300),
    valor: z.number(),
  })).nullable().optional(),
  // Rev. 5081 — vínculo com veículo da Frota (poka-yoke: evita duplo lançamento)
  vehicleId:     z.number().nullable().optional(),
  vehiclePlaca:  z.string().max(10).nullable().optional(),
  vehicleModelo: z.string().max(100).nullable().optional(),
  // Rev. 5082 — quilometragem no serviço + previsão da próxima manutenção
  kmNaManutencao: z.string().max(15).nullable().optional(),
  kmProxima:      z.string().max(15).nullable().optional(),
});

// Rev. 5072 — impressão digital do documento fiscal, na ordem de confiança:
// 1) chave de acesso 44 dígitos; 2) CNPJ + nº do documento; 3) CNPJ + data + valor.
function docFingerprintDe(d: { docChave?: string | null; docNumero?: string | null; estabelecimentoCnpj?: string | null; dataDespesa: string; valor: number }): string | null {
  const chave = String(d.docChave || "").replace(/[^\d]/g, "");
  if (chave.length === 44) return `ch:${chave}`;
  const cnpj = String(d.estabelecimentoCnpj || "").replace(/[^\d]/g, "");
  const numero = String(d.docNumero || "").replace(/[^\dA-Za-z]/g, "").toLowerCase();
  if (cnpj.length === 14 && numero) return `cn:${cnpj}:${numero}`;
  if (cnpj.length === 14) return `cv:${cnpj}:${d.dataDespesa}:${toCents(num(d.valor))}`;
  return null;
}

// Rev. 5072 — prazo de pagamento configurável (dias corridos a partir da criação)
async function lerPrazoDias(db: any, companyId: number): Promise<number> {
  try {
    const rows = ((await db.execute(sql`
      SELECT valor FROM system_criteria WHERE "companyId" = ${companyId} AND chave = 'reembolso_prazo_dias' LIMIT 1
    `)) as any).rows || [];
    const n = parseInt(String(rows[0]?.valor ?? ""), 10);
    if (Number.isFinite(n) && n >= 1 && n <= 60) return n;
  } catch { /* usa default */ }
  return 5;
}

// Bloqueia reutilização da MESMA nota/cupom em outra solicitação viva da empresa.
async function assertSemDuplicidade(tx: any, companyId: number, despesas: any[], ignorarSolicitacaoId?: number) {
  const fps = despesas.map((d) => docFingerprintDe(d)).filter(Boolean) as string[];
  // duplicidade dentro do PRÓPRIO pedido
  const vistos = new Set<string>();
  for (const f of fps) {
    if (vistos.has(f)) throw new TRPCError({ code: "BAD_REQUEST", message: "O mesmo documento fiscal aparece em mais de uma despesa deste pedido." });
    vistos.add(f);
  }
  if (!fps.length) return;
  const rows = ((await tx.execute(sql`
    SELECT d.doc_fingerprint AS fp, d.solicitacao_id AS sid, s.status
    FROM reembolso_despesas d
    JOIN reembolso_solicitacoes s ON s.id = d.solicitacao_id AND s.deleted_at IS NULL AND s.status <> 'cancelada'
    WHERE d.company_id = ${companyId} AND d.deleted_at IS NULL AND d.status <> 'reprovada'
      AND d.doc_fingerprint IN (${sql.join(fps.map((f) => sql`${f}`), sql`, `)})
      ${ignorarSolicitacaoId ? sql`AND d.solicitacao_id <> ${ignorarSolicitacaoId}` : sql``}
    LIMIT 1
  `)) as any).rows || [];
  if (rows.length) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `Este documento fiscal já foi usado na solicitação #${rows[0].sid} — a mesma notinha não pode ser reembolsada duas vezes.` });
  }
}

// Saldo em mãos do fundo = valorFundo
//   − despesas vivas de solicitações NÃO pagas/canceladas (dinheiro já gasto, aguardando reposição)
//   − despesas REPROVADAS de qualquer solicitação (ficam "devendo" — não são repostas)
// Despesas aprovadas de solicitação com título PAGO já foram repostas (voltam ao saldo).
async function calcularSaldosFundos(db: any, companyIds: number[], fundoIds: number[]) {
  if (!fundoIds.length) return new Map<number, { gastoAberto: number; devendo: number }>();
  const rows = ((await db.execute(sql`
    SELECT s.fundo_id AS fundo_id,
      SUM(CASE WHEN d.status <> 'reprovada' AND s.status NOT IN ('cancelada','reprovada')
               AND NOT COALESCE(fe.pago, false)
          THEN d.valor::numeric ELSE 0 END) AS gasto_aberto,
      SUM(CASE WHEN d.status = 'reprovada' THEN d.valor::numeric ELSE 0 END) AS devendo
    FROM reembolso_despesas d
    JOIN reembolso_solicitacoes s ON s.id = d.solicitacao_id AND s.deleted_at IS NULL
    LEFT JOIN LATERAL (
      SELECT (e.status = 'pago') AS pago
      FROM financial_entries e
      WHERE e.origem_modulo = 'reembolso' AND e.origem_id = s.id AND e.status <> 'cancelado'
      LIMIT 1
    ) fe ON true
    WHERE d.deleted_at IS NULL AND s.fundo_id IN (${sql.join(fundoIds.map((i) => sql`${i}`), sql`, `)}) AND s.company_id IN (${sql.join(companyIds.map((i) => sql`${i}`), sql`, `)})
    GROUP BY s.fundo_id
  `)) as any).rows || [];
  const map = new Map<number, { gastoAberto: number; devendo: number }>();
  for (const r of rows) map.set(Number(r.fundo_id), { gastoAberto: num(r.gasto_aberto), devendo: num(r.devendo) });
  return map;
}

// ── Router ───────────────────────────────────────────────────────────────────

export const reembolsosRouter = router({

  // Contexto do usuário na tela: é admin? qual o employee dele? dados bancários salvos?
  contexto: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input, ctx }) => {
      const ids = await guardCompanyIds(ctx, input);
      const db = (await getDb())!;
      // admin_master OU admin do módulo reembolso/financeiro enxerga todos
      const admin = await userIsReembolsoAdmin(ctx.user.id, ctx.user.role);
      const emp = await findEmployeeDoUsuario(db, ctx, ids);
      let dadosBancarios: any = null;
      if (emp) {
        const [e] = await db.select({
          nome: employees.nomeCompleto, tipoChavePix: employees.tipoChavePix, chavePix: employees.chavePix,
          banco: employees.bancoNome, agencia: employees.agencia, conta: employees.conta,
        }).from(employees).where(eq(employees.id, emp.id));
        dadosBancarios = e || null;
      }
      return { isAdmin: admin, employeeId: emp?.id ?? null, employeeCompanyId: emp?.companyId ?? null, dadosBancarios };
    }),

  uploadComprovante: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      base64: z.string().max(30_000_000),
      contentType: z.string().default("image/jpeg"),
    }))
    .mutation(async ({ input, ctx }) => {
      await guardCompanyIds(ctx, { companyId: input.companyId });
      const buf = Buffer.from(input.base64, "base64");
      const ext = input.contentType.includes("pdf") ? "pdf" : input.contentType.includes("png") ? "png" : input.contentType.includes("webp") ? "webp" : "jpg";
      const key = `reembolsos/${input.companyId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { url } = await storagePut(key, buf, input.contentType);
      return { url, key };
    }),

  // Rev. 5053 — IA lê a notinha: anexa → armazena o comprovante E extrai as
  // despesas (descrição, categoria, data, valor) numa tacada só. O retorno é
  // SUGESTÃO pré-preenchida — o usuário revisa antes de enviar (poka-yoke).
  lerComprovante: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      base64: z.string().max(30_000_000),
      contentType: z.string().default("image/jpeg"),
    }))
    .mutation(async ({ input, ctx }) => {
      await guardCompanyIds(ctx, { companyId: input.companyId });
      await assertAiModuleEnabled(input.companyId, "reembolso_leitura_nota");
      // 1) Armazena o comprovante (mesma regra do uploadComprovante)
      const buf = Buffer.from(input.base64, "base64");
      const ext = input.contentType.includes("pdf") ? "pdf" : input.contentType.includes("png") ? "png" : input.contentType.includes("webp") ? "webp" : "jpg";
      const key = `reembolsos/${input.companyId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { url } = await storagePut(key, buf, input.contentType);
      // 2) IA extrai os dados
      let despesas: any[] = [];
      let aviso: string | null = null;
      try {
        const hoje = new Date().toISOString().slice(0, 10);
        const txt = await invokeAnthropicVision({
          base64: input.base64,
          mimeType: input.contentType.includes("pdf") ? "application/pdf" : input.contentType,
          maxTokens: 4000,
          systemPrompt: "Você extrai dados de comprovantes/notinhas fiscais brasileiras para reembolso de despesas. Responda APENAS com JSON válido, sem markdown, sem comentários.",
          prompt: `Leia este comprovante e devolva JSON no formato:
{"despesas":[{"descricao":"...","categoria":"transporte|alimentacao|combustivel|pedagio|material|hospedagem|outros","data":"YYYY-MM-DD","valor":123.45,"estabelecimento":"razão social ou nome fantasia","cnpj":"00.000.000/0000-00","endereco":"endereço completo do estabelecimento","chaveAcesso":"chave de acesso NF-e/NFC-e com 44 dígitos, se houver","numeroDocumento":"nº do cupom/nota (COO, nNF, Extrato Nº), se houver","itens":[{"qtd":"01","descricao":"nome do item","valor":220.00}]}],"observacao":null}
Regras:
- SEMPRE CRIE UMA ÚNICA DESPESA POR COMPROVANTE, usando o VALOR TOTAL pago (campo "TOTAL", "VALOR TOTAL", "GRAND TOTAL" ou equivalente). Mesmo que o comprovante liste vários itens, o array "despesas" deve ter EXATAMENTE UM objeto com o total geral.
- "descricao": nome do estabelecimento + categoria resumida (ex.: "JR Auto Elétrica — peças e serviços mecânicos", "Posto Shell — abastecimento"). NÃO liste itens individuais aqui.
- "itens": liste CADA linha do comprovante como um objeto {qtd, descricao, valor}. "qtd" é a quantidade como string (ex.: "01", "2 x"). "valor" é o total daquele item (qtd × unitário) com PONTO decimal. Se o comprovante não discriminar itens (ex.: recibo de Uber), omita "itens" ou envie array vazio.
- "chaveAcesso": os 44 dígitos da chave de acesso (pode aparecer em grupos de 4 perto do QR Code) — junte só os dígitos. "numeroDocumento": o número do cupom/nota (COO, nNF, "Extrato Nº", "Doc"). REPITA os dois em todas as despesas do mesmo comprovante; null se não houver.
- "estabelecimento", "cnpj", "endereco": copie da notinha (cabeçalho/rodapé) e REPITA em TODAS as despesas do mesmo comprovante. Estes 3 campos são OBRIGATÓRIOS quando visíveis na imagem — procure com atenção o nome da loja, o CNPJ (14 dígitos, pode aparecer como "CNPJ:") e o endereço. Só use null se realmente não constar/estiver ilegível. NUNCA invente CNPJ.
- "valor": número com PONTO decimal, 2 casas, sem símbolo. Use o total efetivamente pago (com desconto/taxa).
- "data": a data do comprovante; se não conseguir ler, use "${hoje}".
- "categoria": escolha a mais próxima; combustível de veículo = "combustivel"; restaurante/lanchonete/mercado de comida = "alimentacao"; Uber/táxi/ônibus = "transporte"; pedágio/estacionamento = "pedagio"; material de construção/ferramenta/papelaria = "material"; hotel/pousada = "hospedagem"; resto = "outros".
- Se a imagem NÃO for um comprovante legível, devolva {"despesas":[],"observacao":"motivo curto"}.`,
        });
        // Salvage de JSON (modelo pode devolver cercas de código)
        const m = txt.match(/\{[\s\S]*\}/);
        const parsed = m ? JSON.parse(m[0]) : { despesas: [] };
        aviso = parsed.observacao || null;
        // Fallback: modelo pode citar o estabelecimento só no 1º item ou no nível raiz — propaga p/ todos
        const listaBruta = Array.isArray(parsed.despesas) ? parsed.despesas : [];
        const ref = listaBruta.find((d: any) => d?.estabelecimento || d?.cnpj) || parsed;
        for (const d of listaBruta) {
          if (!d.estabelecimento && ref?.estabelecimento) d.estabelecimento = ref.estabelecimento;
          if (!d.cnpj && ref?.cnpj) d.cnpj = ref.cnpj;
          if (!d.endereco && ref?.endereco) d.endereco = ref.endereco;
          if (!d.chaveAcesso && ref?.chaveAcesso) d.chaveAcesso = ref.chaveAcesso;
          if (!d.numeroDocumento && ref?.numeroDocumento) d.numeroDocumento = ref.numeroDocumento;
        }
        for (const d of (Array.isArray(parsed.despesas) ? parsed.despesas : [])) {
          // Números podem vir como string BR ("1.234,56") — normaliza
          let v: number;
          if (typeof d.valor === "number") v = d.valor;
          else {
            const s = String(d.valor || "").replace(/[^\d.,-]/g, "");
            v = s.includes(",") ? Number(s.replace(/\./g, "").replace(",", ".")) : Number(s);
          }
          if (!Number.isFinite(v) || v <= 0) continue;
          const cat = CATEGORIAS_REEMBOLSO.includes(d.categoria) ? d.categoria : "outros";
          const data = /^\d{4}-\d{2}-\d{2}$/.test(String(d.data || "")) ? d.data : hoje;
          const cnpjLimpo = String(d.cnpj || "").replace(/[^\d]/g, "");
          // Normaliza os itens discriminados da nota
          const itensRaw = Array.isArray(d.itens) ? d.itens : [];
          const itens = itensRaw.map((it: any) => {
            let iv: number;
            if (typeof it.valor === "number") iv = it.valor;
            else {
              const sv = String(it.valor || "").replace(/[^\d.,-]/g, "");
              iv = sv.includes(",") ? Number(sv.replace(/\./g, "").replace(",", ".")) : Number(sv);
            }
            return {
              qtd: it.qtd ? String(it.qtd).slice(0, 20) : null,
              descricao: String(it.descricao || "").slice(0, 300),
              valor: Number.isFinite(iv) ? Math.round(iv * 100) / 100 : 0,
            };
          }).filter((it: any) => it.descricao && it.valor > 0);
          despesas.push({
            descricao: String(d.descricao || "Despesa do comprovante").slice(0, 300),
            categoria: cat, dataDespesa: data,
            valor: Math.round(v * 100) / 100,
            itens: itens.length > 0 ? itens : null,
            estabelecimentoNome: d.estabelecimento ? String(d.estabelecimento).slice(0, 200) : null,
            estabelecimentoCnpj: cnpjLimpo.length === 14
              ? cnpjLimpo.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")
              : null,
            estabelecimentoEndereco: d.endereco ? String(d.endereco).slice(0, 400) : null,
            docChave: (() => { const c = String(d.chaveAcesso || "").replace(/[^\d]/g, ""); return c.length === 44 ? c : null; })(),
            docNumero: d.numeroDocumento ? String(d.numeroDocumento).replace(/[^\dA-Za-z-]/g, "").slice(0, 30) || null : null,
          });
        }
      } catch (e: any) {
        console.error("[Reembolso] IA falhou ao ler comprovante:", e?.message || e);
        aviso = "A IA não conseguiu ler este comprovante — preencha os dados manualmente.";
      }
      return { url, key, despesas, aviso };
    }),

  // ── Fundos fixos (caixinha) ────────────────────────────────────────────────
  fundos: router({
    list: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
      .query(async ({ input, ctx }) => {
        const ids = await guardCompanyIds(ctx, input);
        const db = (await getDb())!;
        const fundos = await db.select({
          id: reembolsoFundos.id, companyId: reembolsoFundos.companyId, employeeId: reembolsoFundos.employeeId,
          valorFundo: reembolsoFundos.valorFundo, descricao: reembolsoFundos.descricao, status: reembolsoFundos.status,
          criadoEm: reembolsoFundos.criadoEm, employeeNome: employees.nomeCompleto,
        }).from(reembolsoFundos)
          .leftJoin(employees, eq(employees.id, reembolsoFundos.employeeId))
          .where(and(inArray(reembolsoFundos.companyId, ids), isNull(reembolsoFundos.deletedAt)))
          .orderBy(desc(reembolsoFundos.id));
        const saldos = await calcularSaldosFundos(db, ids, fundos.map((f: any) => f.id));
        const admin = await userIsReembolsoAdmin(ctx.user.id, ctx.user.role);
        const emp = admin ? null : await findEmployeeDoUsuario(db, ctx, ids);
        return fundos
          .filter((f: any) => admin || (emp && f.employeeId === emp.id))
          .map((f: any) => {
            const s = saldos.get(f.id) || { gastoAberto: 0, devendo: 0 };
            return { ...f, gastoAberto: money(s.gastoAberto), devendo: money(s.devendo), saldo: money(num(f.valorFundo) - s.gastoAberto - s.devendo) };
          });
      }),

    criar: protectedProcedure
      .input(z.object({
        companyId: z.number(), employeeId: z.number(), valorFundo: zMoney,
        descricao: z.string().nullable().optional(), gerarTitulo: z.boolean().default(true),
        dataVencimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!isAdminRole(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN", message: "Somente administradores criam fundos fixos." });
        await guardCompanyIds(ctx, { companyId: input.companyId });
        const db = (await getDb())!;
        const [emp] = await db.select({ id: employees.id, nome: employees.nomeCompleto })
          .from(employees)
          .where(and(eq(employees.id, input.employeeId), eq(employees.companyId, input.companyId), isNull(employees.deletedAt)));
        if (!emp) throw new TRPCError({ code: "BAD_REQUEST", message: "Colaborador não pertence a esta empresa." });
        // Rev. 5077 — quem tem caixinha OBRIGATORIAMENTE precisa de login no sistema
        // (funcionário ou terceiro: vínculo por employees.user_id ou por e-mail em users)
        const login = ((await db.execute(sql`
          SELECT u.id FROM employees e
          LEFT JOIN users u ON u.id = e.user_id OR LOWER(TRIM(u.email)) = LOWER(TRIM(e.email))
          WHERE e.id = ${input.employeeId} AND u.id IS NOT NULL
          LIMIT 1
        `)) as any).rows || [];
        if (!login.length) throw new TRPCError({ code: "BAD_REQUEST", message: `${emp.nome} ainda não tem acesso (login) ao sistema. Crie o usuário e vincule ao colaborador antes de cadastrar a caixinha.` });
        const [vivo] = await db.select({ id: reembolsoFundos.id }).from(reembolsoFundos)
          .where(and(eq(reembolsoFundos.employeeId, input.employeeId), eq(reembolsoFundos.companyId, input.companyId), eq(reembolsoFundos.status, "ativo"), isNull(reembolsoFundos.deletedAt)));
        if (vivo) throw new TRPCError({ code: "CONFLICT", message: "Este colaborador já tem um fundo fixo ativo." });
        const hoje = new Date().toISOString().slice(0, 10);
        return await db.transaction(async (tx) => {
          const [fundo] = await tx.insert(reembolsoFundos).values({
            companyId: input.companyId, employeeId: input.employeeId,
            valorFundo: money(input.valorFundo), descricao: input.descricao ?? null,
            criadoPor: ctx.user.name || ctx.user.email || String(ctx.user.id),
          }).returning();
          if (input.gerarTitulo) {
            await tx.insert(financialEntries).values({
              companyId: input.companyId, tipo: "despesa", natureza: "variavel",
              contaNome: "Reembolsos a Colaboradores",
              valorPrevisto: money(input.valorFundo),
              dataCompetencia: hoje, dataVencimento: input.dataVencimento || hoje,
              status: "a_pagar",
              origemModulo: "reembolso_fundo", origemId: fundo.id,
              origemDescricao: `Fundo fixo (caixinha) — ${emp.nome}`,
              descricao: `Crédito inicial do fundo fixo de ${emp.nome} (R$ ${money(input.valorFundo)})`,
              fornecedorNome: emp.nome,
              criadoPorNome: ctx.user.name || ctx.user.email || "",
            }).onConflictDoNothing();
          }
          return { success: true, id: fundo.id };
        });
      }),

    encerrar: protectedProcedure
      .input(z.object({ companyId: z.number(), id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (!isAdminRole(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN", message: "Somente administradores." });
        await guardCompanyIds(ctx, { companyId: input.companyId });
        const db = (await getDb())!;
        const [ok] = await db.update(reembolsoFundos)
          .set({ status: "encerrado", encerradoEm: new Date() })
          .where(and(eq(reembolsoFundos.id, input.id), eq(reembolsoFundos.companyId, input.companyId), isNull(reembolsoFundos.deletedAt)))
          .returning({ id: reembolsoFundos.id });
        if (!ok) throw new TRPCError({ code: "NOT_FOUND", message: "Fundo não encontrado." });
        return { success: true };
      }),
  }),

  // ── Critérios do módulo (Rev. 5072) ────────────────────────────────────────
  config: router({
    get: protectedProcedure
      .input(z.object({ companyId: z.number() }))
      .query(async ({ input, ctx }) => {
        await guardCompanyIds(ctx, { companyId: input.companyId });
        const db = (await getDb())!;
        return { prazoDias: await lerPrazoDias(db, input.companyId) };
      }),
    setPrazoDias: protectedProcedure
      .input(z.object({ companyId: z.number(), prazoDias: z.number().int().min(1).max(60) }))
      .mutation(async ({ input, ctx }) => {
        if (!isAdminRole(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN", message: "Somente administradores alteram os critérios." });
        await guardCompanyIds(ctx, { companyId: input.companyId });
        const db = (await getDb())!;
        const upd = ((await db.execute(sql`
          UPDATE system_criteria SET valor = ${String(input.prazoDias)}, "atualizadoPor" = ${ctx.user.name || ctx.user.email || "Sistema"}
          WHERE "companyId" = ${input.companyId} AND chave = 'reembolso_prazo_dias' RETURNING id
        `)) as any).rows || [];
        if (!upd.length) {
          await db.execute(sql`
            INSERT INTO system_criteria ("companyId", categoria, chave, valor, descricao, "atualizadoPor")
            VALUES (${input.companyId}, 'reembolso', 'reembolso_prazo_dias', ${String(input.prazoDias)}, 'Prazo (dias úteis) para pagar reembolso, contado da criação da solicitação', ${ctx.user.name || ctx.user.email || "Sistema"})
          `);
        }
        return { success: true };
      }),
  }),

  // ── Solicitações ───────────────────────────────────────────────────────────
  solicitacoes: router({
    list: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), employeeId: z.number().optional() }))
      .query(async ({ input, ctx }) => {
        const ids = await guardCompanyIds(ctx, input);
        const db = (await getDb())!;
        // admin_master OU admin do módulo reembolso/financeiro vê todos; demais só os próprios
        const admin = await userIsReembolsoAdmin(ctx.user.id, ctx.user.role);
        let employeeFiltro: number | null = input.employeeId ?? null;
        if (!admin) {
          const emp = await findEmployeeDoUsuario(db, ctx, ids);
          if (!emp) return [];
          employeeFiltro = emp.id; // usuário comum SÓ vê as próprias
        }
        const conds = [inArray(reembolsoSolicitacoes.companyId, ids), isNull(reembolsoSolicitacoes.deletedAt)];
        if (employeeFiltro) conds.push(eq(reembolsoSolicitacoes.employeeId, employeeFiltro));
        const sols = await db.select({
          id: reembolsoSolicitacoes.id, companyId: reembolsoSolicitacoes.companyId,
          employeeId: reembolsoSolicitacoes.employeeId, fundoId: reembolsoSolicitacoes.fundoId,
          tipo: reembolsoSolicitacoes.tipo, status: reembolsoSolicitacoes.status,
          motivo: reembolsoSolicitacoes.motivo, motivoDecisao: reembolsoSolicitacoes.motivoDecisao,
          valorTotal: reembolsoSolicitacoes.valorTotal, valorAprovado: reembolsoSolicitacoes.valorAprovado,
          pagamentoTipo: reembolsoSolicitacoes.pagamentoTipo, pagamentoChave: reembolsoSolicitacoes.pagamentoChave,
          aprovadoPorNome: reembolsoSolicitacoes.aprovadoPorNome, aprovadoEm: reembolsoSolicitacoes.aprovadoEm,
          criadoEm: reembolsoSolicitacoes.criadoEm, criadoPorNome: reembolsoSolicitacoes.criadoPorNome,
          employeeNome: employees.nomeCompleto, employeeFotoUrl: employees.fotoUrl,
        }).from(reembolsoSolicitacoes)
          .leftJoin(employees, eq(employees.id, reembolsoSolicitacoes.employeeId))
          .where(and(...conds))
          .orderBy(desc(reembolsoSolicitacoes.id));
        if (!sols.length) return [];
        const solIds = sols.map((s: any) => s.id);
        // Rev. 5083 — data prevista de pagamento vem do título financeiro (dataVencimento)
        const entryDates = ((await db.execute(sql`
          SELECT origem_id, data_vencimento, data_pagamento FROM financial_entries
          WHERE origem_modulo = 'reembolso'
            AND origem_id IN (${sql.join(solIds.map((i: number) => sql`${i}`), sql`, `)})
            AND status <> 'cancelado'
          ORDER BY id
        `)) as any).rows || [];
        // Rev. 5066 — numeração derivada Nº/ano por empresa (como FD: nunca persistida,
        // sempre recalculada por ordem de criação — id asc dentro do ano).
        const numRows = ((await db.execute(sql`
          SELECT id,
                 ROW_NUMBER() OVER (PARTITION BY company_id, EXTRACT(YEAR FROM criado_em) ORDER BY id) AS n,
                 EXTRACT(YEAR FROM criado_em) AS ano
          FROM reembolso_solicitacoes
          WHERE company_id IN (${sql.join(ids.map((i: number) => sql`${i}`), sql`, `)}) AND deleted_at IS NULL
        `)) as any).rows || [];
        const numeroMap = new Map<number, string>(numRows.map((r: any) =>
          [Number(r.id), `${String(Number(r.n)).padStart(3, "0")}/${Number(r.ano)}`]));
        const despesas = await db.select().from(reembolsoDespesas)
          .where(and(inArray(reembolsoDespesas.solicitacaoId, solIds), isNull(reembolsoDespesas.deletedAt)));
        // status financeiro do título (pago?)
        const entries = ((await db.execute(sql`
          SELECT origem_id, status, data_pagamento FROM financial_entries
          WHERE origem_modulo = 'reembolso' AND origem_id IN (${sql.join(solIds.map((i: number) => sql`${i}`), sql`, `)}) AND status <> 'cancelado'
        `)) as any).rows || [];
        const pagoMap = new Map<number, any>(entries.map((e: any) => [Number(e.origem_id), e]));
        const dateMap = new Map<number, any>(entryDates.map((e: any) => [Number(e.origem_id), e]));
        return sols.map((s: any) => {
          const fe = pagoMap.get(s.id);
          const ed = dateMap.get(s.id);
          return {
            ...s,
            numero: numeroMap.get(Number(s.id)) ?? String(s.id),
            despesas: despesas.filter((d: any) => d.solicitacaoId === s.id),
            tituloStatus: fe?.status ?? null,
            paga: fe?.status === "pago",
            dataPagamento: fe?.data_pagamento ?? null,
            dataPrevistaPagamento: ed?.data_vencimento ?? null, // data prevista do título
          };
        });
      }),

    criar: protectedProcedure
      .input(z.object({
        companyId: z.number(),
        employeeId: z.number().optional(),          // admin pode lançar em nome de alguém
        fundoId: z.number().nullable().optional(),  // prestação de contas de caixinha
        motivo: z.string().nullable().optional(),
        pagamentoTipo: z.enum(["pix", "conta"]).nullable().optional(),
        pagamentoChave: z.string().nullable().optional(),
        salvarDadosBancarios: z.boolean().default(false),
        despesas: z.array(despesaInput).min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        await guardCompanyIds(ctx, { companyId: input.companyId });
        const db = (await getDb())!;
        const admin = isAdminRole(ctx.user.role);
        // Usuário comum: SEMPRE o próprio employee (ignora employeeId enviado)
        let employeeId = input.employeeId ?? null;
        if (!admin) {
          const emp = await findEmployeeDoUsuario(db, ctx, [input.companyId]);
          if (!emp) throw new TRPCError({ code: "BAD_REQUEST", message: "Seu usuário não está vinculado a um colaborador desta empresa. Peça ao RH para vincular." });
          employeeId = emp.id;
        }
        if (!employeeId) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe o colaborador." });
        const [emp] = await db.select({ id: employees.id, nome: employees.nomeCompleto })
          .from(employees)
          .where(and(eq(employees.id, employeeId), eq(employees.companyId, input.companyId), isNull(employees.deletedAt)));
        if (!emp) throw new TRPCError({ code: "BAD_REQUEST", message: "Colaborador não pertence a esta empresa." });
        // Fundo (caixinha): precisa ser vivo, da empresa e do MESMO colaborador
        let tipo: "avulso" | "caixinha" = "avulso";
        if (input.fundoId) {
          const [f] = await db.select({ id: reembolsoFundos.id, employeeId: reembolsoFundos.employeeId, status: reembolsoFundos.status })
            .from(reembolsoFundos)
            .where(and(eq(reembolsoFundos.id, input.fundoId), eq(reembolsoFundos.companyId, input.companyId), isNull(reembolsoFundos.deletedAt)));
          if (!f || f.status !== "ativo") throw new TRPCError({ code: "BAD_REQUEST", message: "Fundo fixo não encontrado ou encerrado." });
          if (f.employeeId !== employeeId) throw new TRPCError({ code: "BAD_REQUEST", message: "O fundo fixo pertence a outro colaborador." });
          tipo = "caixinha";
        }
        // Poka-yoke: toda despesa precisa de comprovante REAL (key emitida pelo
        // uploadComprovante, no prefixo da própria empresa — não aceita URL forjada).
        for (const d of input.despesas) {
          if (!d.comprovanteKey || !d.comprovanteKey.startsWith(`reembolsos/${input.companyId}/`)) {
            throw new TRPCError({ code: "BAD_REQUEST", message: `A despesa "${d.descricao}" está sem comprovante válido — anexe pelo botão de upload.` });
          }
          if (d.obraId) {
            const [o] = await db.select({ id: obras.id }).from(obras)
              .where(and(eq(obras.id, d.obraId), eq(obras.companyId, input.companyId)));
            if (!o) throw new TRPCError({ code: "BAD_REQUEST", message: "Obra inválida para esta empresa." });
          }
        }
        const totalCents = input.despesas.reduce((s, d) => s + toCents(d.valor), 0);
        return await db.transaction(async (tx) => {
          await assertSemDuplicidade(tx, input.companyId, input.despesas);
          const [sol] = await tx.insert(reembolsoSolicitacoes).values({
            companyId: input.companyId, employeeId, fundoId: input.fundoId ?? null, tipo,
            motivo: input.motivo ?? null, valorTotal: moneyFromCents(totalCents),
            pagamentoTipo: input.pagamentoTipo ?? null, pagamentoChave: input.pagamentoChave ?? null,
            criadoPorUserId: ctx.user.id, criadoPorNome: ctx.user.name || ctx.user.email || "",
          }).returning();
          await tx.insert(reembolsoDespesas).values(input.despesas.map((d) => ({
            companyId: input.companyId, solicitacaoId: sol.id,
            obraId: d.obraId ?? null, categoria: d.categoria, descricao: d.descricao,
            dataDespesa: d.dataDespesa, valor: money(d.valor),
            comprovanteUrl: d.comprovanteUrl ?? null, comprovanteKey: d.comprovanteKey ?? null,
            orcamentoItemId: d.orcamentoItemId ?? null,
            eapCodigo: d.eapCodigo ?? null, eapDescricao: d.eapDescricao ?? null,
            estabelecimentoNome: d.estabelecimentoNome ?? null,
            estabelecimentoCnpj: d.estabelecimentoCnpj ?? null,
            estabelecimentoEndereco: d.estabelecimentoEndereco ?? null,
            docChave: d.docChave ?? null, docNumero: d.docNumero ?? null,
            docFingerprint: docFingerprintDe(d),
            itensJson: (Array.isArray(d.itens) && d.itens.length > 0) ? d.itens : null,
            vehicleId: d.vehicleId ?? null,
            vehiclePlaca: d.vehiclePlaca ?? null,
            vehicleModelo: d.vehicleModelo ?? null,
            kmNaManutencao: d.kmNaManutencao ?? null,
            kmProxima: d.kmProxima ?? null,
          })));
          if (input.salvarDadosBancarios && input.pagamentoTipo === "pix" && input.pagamentoChave) {
            await tx.update(employees).set({ chavePix: input.pagamentoChave }).where(eq(employees.id, employeeId!));
          }
          return { success: true, id: sol.id, valorTotal: moneyFromCents(totalCents) };
        });

        // Alertas para admins da empresa (não bloqueante)
        try {
          const { criarUserAlert } = await import("../db");
          const adminsR = await db.execute(sql`
            SELECT DISTINCT u.id
            FROM users u
            JOIN user_companies uc ON uc.user_id = u.id
            WHERE uc.company_id = ${input.companyId}
              AND u.role IN ('admin_master', 'admin')
              AND u.id <> ${ctx.user.id}
          `);
          const valorFmt = Number(result.valorTotal).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
          const nDespesas = input.despesas.length;
          for (const a of (adminsR.rows ?? adminsR) as any[]) {
            await criarUserAlert({
              userId: Number(a.id),
              companyId: input.companyId,
              tipo: "reembolso_pendente",
              titulo: "Reembolso aguardando aprovação",
              mensagem: `${emp.nome} solicitou reembolso de ${valorFmt} (${nDespesas} despesa${nDespesas > 1 ? "s" : ""}). Toque para aprovar.`,
              linkUrl: "/reembolso/painel",
            });
          }
        } catch (e) {
          console.error("[reembolsos.criar] alerta ao admin falhou (não bloqueante):", e);
        }

        return { success: result.success, id: result.id };
      }),

    // Decisão do administrador: aprova/reprova item a item, gera o título pelo aprovado.
    decidir: protectedProcedure
      .input(z.object({
        companyId: z.number(), id: z.number(),
        itens: z.array(z.object({ despesaId: z.number(), aprovar: z.boolean(), motivoReprovacao: z.string().nullable().optional() })).min(1),
        motivoDecisao: z.string().nullable().optional(),
        dataVencimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!isAdminRole(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN", message: "Somente administradores aprovam reembolsos." });
        await guardCompanyIds(ctx, { companyId: input.companyId });
        const db = (await getDb())!;
        return await db.transaction(async (tx) => {
          const [sol] = await tx.select().from(reembolsoSolicitacoes)
            .where(and(eq(reembolsoSolicitacoes.id, input.id), eq(reembolsoSolicitacoes.companyId, input.companyId), isNull(reembolsoSolicitacoes.deletedAt)))
            .for("update");
          if (!sol) throw new TRPCError({ code: "NOT_FOUND", message: "Solicitação não encontrada." });
          if (sol.status !== "pendente") throw new TRPCError({ code: "BAD_REQUEST", message: "Esta solicitação já foi decidida." });
          const despesas = await tx.select().from(reembolsoDespesas)
            .where(and(eq(reembolsoDespesas.solicitacaoId, sol.id), isNull(reembolsoDespesas.deletedAt)));
          const mapa = new Map(input.itens.map((i) => [i.despesaId, i]));
          let aprovadoCents = 0; let reprovadas = 0;
          for (const d of despesas) {
            const dec = mapa.get(d.id);
            if (!dec) throw new TRPCError({ code: "BAD_REQUEST", message: `Falta decidir a despesa "${d.descricao}".` });
            if (dec.aprovar) {
              aprovadoCents += toCents(num(d.valor));
              await tx.update(reembolsoDespesas).set({ status: "aprovada", motivoReprovacao: null }).where(eq(reembolsoDespesas.id, d.id));
              // Rev. 5081 — poka-yoke Frota: despesas de veículo aprovadas geram registro
              // automático em fleet_maintenances (evita duplo lançamento manual).
              if ((d as any).vehicleId) {
                const tipo = d.categoria === "combustivel" ? "abastecimento" : "corretiva";
                const kmAtual = (d as any).kmNaManutencao ? String((d as any).kmNaManutencao).replace(/\D/g, "") || null : null;
                const kmProx  = (d as any).kmProxima     ? String((d as any).kmProxima).replace(/\D/g, "") || null : null;
                const [mnt] = await tx.insert(fleetMaintenances).values({
                  companyId: sol.companyId,
                  vehicleId: (d as any).vehicleId,
                  tipo,
                  descricao: d.descricao,
                  custo: String(num(d.valor)),
                  fornecedor: (d as any).estabelecimentoNome ?? null,
                  dataManutencao: d.dataDespesa,
                  kmNaManutencao: kmAtual,
                  kmProxima: kmProx,
                  status: "realizada",
                  criadoPor: ctx.user.name || ctx.user.email || "",
                  observacoes: `Via Reembolso #${sol.id}`,
                }).returning({ id: fleetMaintenances.id });
                if (mnt?.id) {
                  await tx.update(reembolsoDespesas)
                    .set({ frotaManutencaoId: mnt.id } as any)
                    .where(eq(reembolsoDespesas.id, d.id));
                }
                // Atualiza o hodômetro do veículo se km informado
                if (kmAtual) {
                  await tx.update(vehicles)
                    .set({ kmAtual } as any)
                    .where(eq(vehicles.id, (d as any).vehicleId));
                }
              }
            } else {
              reprovadas++;
              await tx.update(reembolsoDespesas).set({ status: "reprovada", motivoReprovacao: dec.motivoReprovacao ?? null }).where(eq(reembolsoDespesas.id, d.id));
            }
          }
          const statusFinal = aprovadoCents <= 0 ? "reprovada" : (reprovadas > 0 ? "aprovada_parcial" : "aprovada");
          await tx.update(reembolsoSolicitacoes).set({
            status: statusFinal, valorAprovado: moneyFromCents(aprovadoCents),
            motivoDecisao: input.motivoDecisao ?? null,
            aprovadoPorNome: ctx.user.name || ctx.user.email || "", aprovadoEm: new Date(),
          }).where(eq(reembolsoSolicitacoes.id, sol.id));

          if (aprovadoCents > 0) {
            const [emp] = await tx.select({ nome: employees.nomeCompleto }).from(employees).where(eq(employees.id, sol.employeeId));
            // Obra do título: se TODAS as despesas aprovadas são da mesma obra, herda
            const obraIds = new Set(despesas.filter((d: any) => mapa.get(d.id)?.aprovar && d.obraId).map((d: any) => d.obraId));
            let obraId: number | null = null; let obraNome: string | null = null;
            if (obraIds.size === 1) {
              obraId = [...obraIds][0] as number;
              const [o] = await tx.select({ nome: obras.nome }).from(obras).where(eq(obras.id, obraId));
              obraNome = o?.nome ?? null;
            }
            const hoje = new Date().toISOString().slice(0, 10);
            // Regra do negócio: reembolso é pago em até N dias ÚTEIS a partir da CRIAÇÃO
            // (N configurável em system_criteria.reembolso_prazo_dias; default 5)
            const prazoDias = await lerPrazoDias(tx, sol.companyId);
            const base = sol.criadoEm ? new Date(sol.criadoEm) : new Date();
            let uteis = 0;
            while (uteis < prazoDias) {
              base.setDate(base.getDate() + 1);
              const dow = base.getDay();
              if (dow !== 0 && dow !== 6) uteis++; // pula sáb/dom
            }
            const prazo5 = base.toISOString().slice(0, 10);
            const vencimento = input.dataVencimento || (prazo5 >= hoje ? prazo5 : hoje);
            const rotulo = sol.tipo === "caixinha" ? "Reposição de fundo fixo" : "Reembolso de despesas";
            const pgto = sol.pagamentoTipo === "pix" ? ` — PIX: ${sol.pagamentoChave || ""}` : sol.pagamentoChave ? ` — ${sol.pagamentoChave}` : "";
            await tx.insert(financialEntries).values({
              companyId: sol.companyId, obraId, obraNome,
              tipo: "despesa", natureza: "variavel",
              contaNome: "Reembolsos a Colaboradores",
              valorPrevisto: moneyFromCents(aprovadoCents),
              dataCompetencia: hoje, dataVencimento: vencimento,
              status: "a_pagar",
              origemModulo: "reembolso", origemId: sol.id,
              origemDescricao: `${rotulo} #${sol.id} — ${emp?.nome || `Colaborador #${sol.employeeId}`}`,
              descricao: `${rotulo} — ${emp?.nome || ""}${pgto}`,
              fornecedorNome: emp?.nome || null,
              criadoPorNome: ctx.user.name || ctx.user.email || "",
            }).onConflictDoNothing();
          }
          return { success: true, status: statusFinal, valorAprovado: moneyFromCents(aprovadoCents) };
        });
      }),

    cancelar: protectedProcedure
      .input(z.object({ companyId: z.number(), id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await guardCompanyIds(ctx, { companyId: input.companyId });
        const db = (await getDb())!;
        const [sol] = await db.select().from(reembolsoSolicitacoes)
          .where(and(eq(reembolsoSolicitacoes.id, input.id), eq(reembolsoSolicitacoes.companyId, input.companyId), isNull(reembolsoSolicitacoes.deletedAt)));
        if (!sol) throw new TRPCError({ code: "NOT_FOUND", message: "Solicitação não encontrada." });
        const admin = isAdminRole(ctx.user.role);
        if (!admin) {
          const emp = await findEmployeeDoUsuario(db, ctx, [input.companyId]);
          if (!emp || emp.id !== sol.employeeId) throw new TRPCError({ code: "FORBIDDEN", message: "Você só pode cancelar as próprias solicitações." });
          if (sol.status !== "pendente") throw new TRPCError({ code: "BAD_REQUEST", message: "Só é possível cancelar antes da aprovação." });
        }
        return await db.transaction(async (tx) => {
          // Título: NUNCA cancela por cima de pagamento — título pago ou com baixa
          // ativa bloqueia o cancelamento (exige estorno explícito no Financeiro).
          const entries = await tx.select({ id: financialEntries.id, status: financialEntries.status }).from(financialEntries)
            .where(and(eq(financialEntries.origemModulo, "reembolso"), eq(financialEntries.origemId, sol.id), eq(financialEntries.companyId, sol.companyId), sql`${financialEntries.status} <> 'cancelado'`));
          for (const e of entries) {
            // Mesmo lock por título do Financeiro (feb:) — evita corrida com baixa simultânea
            await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`feb:${sol.companyId}:${e.id}`}))`);
            const [eNow] = await tx.select({ status: financialEntries.status }).from(financialEntries).where(eq(financialEntries.id, e.id));
            if (eNow?.status === "pago" || e.status === "pago") throw new TRPCError({ code: "BAD_REQUEST", message: "O título deste reembolso já foi PAGO no Financeiro — estorne o pagamento antes de cancelar." });
            const [bx] = await tx.select({ id: financialEntryBaixas.id }).from(financialEntryBaixas)
              .where(and(eq(financialEntryBaixas.entryId, e.id), isNull(financialEntryBaixas.estornadaEm)));
            if (bx) throw new TRPCError({ code: "BAD_REQUEST", message: "O título deste reembolso já tem pagamento registrado no Financeiro — estorne a baixa antes de cancelar." });
            await tx.update(financialEntries).set({ status: "cancelado", motivoCancelamento: "Solicitação de reembolso cancelada" }).where(eq(financialEntries.id, e.id));
          }
          await tx.update(reembolsoSolicitacoes).set({ status: "cancelada" }).where(eq(reembolsoSolicitacoes.id, sol.id));
          return { success: true };
        });
      }),

    // Rev. 5084 — desfazer aprovação: volta a pendente e cancela o título financeiro (admin only)
    desfazerAprovacao: protectedProcedure
      .input(z.object({ companyId: z.number(), ids: z.array(z.number()).min(1) }))
      .mutation(async ({ input, ctx }) => {
        await guardCompanyIds(ctx, { companyId: input.companyId });
        if (!isAdminRole(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem desfazer aprovações." });
        const db = (await getDb())!;
        let revertidas = 0;
        const erros: string[] = [];
        for (const id of input.ids) {
          try {
            await db.transaction(async (tx) => {
              const [sol] = await tx.select().from(reembolsoSolicitacoes)
                .where(and(eq(reembolsoSolicitacoes.id, id), eq(reembolsoSolicitacoes.companyId, input.companyId), isNull(reembolsoSolicitacoes.deletedAt)));
              if (!sol) throw new Error("Solicitação não encontrada.");
              if (!["aprovada", "aprovada_parcial"].includes(sol.status))
                throw new Error(`Status "${sol.status}" não pode ser revertido.`);
              // Travar e verificar: título pago bloqueia a reversão
              const entries = await tx.select({ id: financialEntries.id, status: financialEntries.status })
                .from(financialEntries)
                .where(and(eq(financialEntries.origemModulo, "reembolso"), eq(financialEntries.origemId, id),
                  eq(financialEntries.companyId, input.companyId), sql`${financialEntries.status} <> 'cancelado'`));
              for (const e of entries) {
                await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`feb:${input.companyId}:${e.id}`}))`);
                const [eNow] = await tx.select({ status: financialEntries.status }).from(financialEntries).where(eq(financialEntries.id, e.id));
                if (eNow?.status === "pago") throw new Error("O título já foi PAGO — estorne antes de desfazer a aprovação.");
                const [bx] = await tx.select({ id: financialEntryBaixas.id }).from(financialEntryBaixas)
                  .where(and(eq(financialEntryBaixas.entryId, e.id), isNull(financialEntryBaixas.estornadaEm)));
                if (bx) throw new Error("Há pagamento registrado no Financeiro — estorne a baixa primeiro.");
                await tx.update(financialEntries).set({ status: "cancelado", motivoCancelamento: "Aprovação desfeita pelo administrador" }).where(eq(financialEntries.id, e.id));
              }
              // Reverter despesas aprovadas/reprovadas → pendente
              await tx.update(reembolsoDespesas)
                .set({ status: "pendente", motivoReprovacao: null })
                .where(eq(reembolsoDespesas.solicitacaoId, id));
              // Reverter solicitação
              await tx.update(reembolsoSolicitacoes).set({
                status: "pendente",
                valorAprovado: null,
                aprovadoPorNome: null,
                aprovadoEm: null,
                motivoDecisao: null,
              }).where(eq(reembolsoSolicitacoes.id, id));
              revertidas++;
            });
          } catch (e: any) {
            erros.push(`#${id}: ${e?.message || "erro"}`);
          }
        }
        if (revertidas === 0 && erros.length > 0) throw new TRPCError({ code: "BAD_REQUEST", message: erros.join(" | ") });
        return { revertidas, erros };
      }),

    // Rev. 5067 — editar solicitação PENDENTE (troca despesas/motivo/pagamento)
    atualizar: protectedProcedure
      .input(z.object({
        companyId: z.number(), id: z.number(),
        motivo: z.string().nullable().optional(),
        pagamentoTipo: z.enum(["pix", "conta"]).nullable().optional(),
        pagamentoChave: z.string().nullable().optional(),
        despesas: z.array(despesaInput).min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        await guardCompanyIds(ctx, { companyId: input.companyId });
        const db = (await getDb())!;
        const admin = isAdminRole(ctx.user.role);
        return await db.transaction(async (tx) => {
          const [sol] = await tx.select().from(reembolsoSolicitacoes)
            .where(and(eq(reembolsoSolicitacoes.id, input.id), eq(reembolsoSolicitacoes.companyId, input.companyId), isNull(reembolsoSolicitacoes.deletedAt)))
            .for("update");
          if (!sol) throw new TRPCError({ code: "NOT_FOUND", message: "Solicitação não encontrada." });
          if (sol.status !== "pendente") throw new TRPCError({ code: "BAD_REQUEST", message: "Só é possível editar enquanto está pendente de aprovação." });
          if (!admin) {
            const emp = await findEmployeeDoUsuario(tx, ctx, [input.companyId]);
            if (!emp || emp.id !== sol.employeeId) throw new TRPCError({ code: "FORBIDDEN", message: "Você só pode editar as próprias solicitações." });
          }
          for (const d of input.despesas) {
            if (!d.comprovanteKey || !d.comprovanteKey.startsWith(`reembolsos/${input.companyId}/`)) {
              throw new TRPCError({ code: "BAD_REQUEST", message: `Comprovante inválido na despesa "${d.descricao}".` });
            }
          }
          // Anti-IDOR: toda obra referenciada deve pertencer à MESMA empresa
          const obraIdsEdit = [...new Set(input.despesas.map((d) => d.obraId).filter((o): o is number => !!o))];
          if (obraIdsEdit.length) {
            const okObras = await tx.select({ id: obras.id }).from(obras)
              .where(and(inArray(obras.id, obraIdsEdit), eq(obras.companyId, input.companyId)));
            if (okObras.length !== obraIdsEdit.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Obra inválida em uma das despesas." });
          }
          const totalCents = input.despesas.reduce((a, d) => a + toCents(num(d.valor)), 0);
          await assertSemDuplicidade(tx, input.companyId, input.despesas, sol.id);
          await tx.update(reembolsoDespesas).set({ deletedAt: new Date() })
            .where(and(eq(reembolsoDespesas.solicitacaoId, sol.id), isNull(reembolsoDespesas.deletedAt)));
          await tx.insert(reembolsoDespesas).values(input.despesas.map((d) => ({
            companyId: input.companyId, solicitacaoId: sol.id,
            obraId: d.obraId ?? null, categoria: d.categoria, descricao: d.descricao,
            dataDespesa: d.dataDespesa, valor: money(d.valor),
            comprovanteUrl: d.comprovanteUrl ?? null, comprovanteKey: d.comprovanteKey ?? null,
            orcamentoItemId: d.orcamentoItemId ?? null,
            eapCodigo: d.eapCodigo ?? null, eapDescricao: d.eapDescricao ?? null,
            estabelecimentoNome: d.estabelecimentoNome ?? null,
            estabelecimentoCnpj: d.estabelecimentoCnpj ?? null,
            estabelecimentoEndereco: d.estabelecimentoEndereco ?? null,
            docChave: d.docChave ?? null, docNumero: d.docNumero ?? null,
            docFingerprint: docFingerprintDe(d),
            itensJson: (d.itens && d.itens.length > 0) ? d.itens : null,
            vehicleId: d.vehicleId ?? null,
            vehiclePlaca: d.vehiclePlaca ?? null,
            vehicleModelo: d.vehicleModelo ?? null,
            kmNaManutencao: d.kmNaManutencao ?? null,
            kmProxima: d.kmProxima ?? null,
          })));
          await tx.update(reembolsoSolicitacoes).set({
            motivo: input.motivo ?? null,
            pagamentoTipo: sol.tipo === "caixinha" ? null : (input.pagamentoTipo ?? sol.pagamentoTipo),
            pagamentoChave: sol.tipo === "caixinha" ? null : (input.pagamentoChave ?? sol.pagamentoChave),
            valorTotal: moneyFromCents(totalCents),
          }).where(eq(reembolsoSolicitacoes.id, sol.id));
          return { success: true };
        });
      }),

    // Rev. 5067 — apagar (soft-delete). Segue as MESMAS travas do cancelar:
    // título pago/baixa ativa bloqueia; usuário comum só a própria pendente.
    excluir: protectedProcedure
      .input(z.object({ companyId: z.number(), ids: z.array(z.number()).min(1).max(100) }))
      .mutation(async ({ input, ctx }) => {
        await guardCompanyIds(ctx, { companyId: input.companyId });
        const db = (await getDb())!;
        const admin = isAdminRole(ctx.user.role);
        const empProprio = admin ? null : await findEmployeeDoUsuario(db, ctx, [input.companyId]);
        let apagadas = 0; const bloqueadas: string[] = [];
        for (const id of input.ids) {
          try {
            await db.transaction(async (tx) => {
              const [sol] = await tx.select().from(reembolsoSolicitacoes)
                .where(and(eq(reembolsoSolicitacoes.id, id), eq(reembolsoSolicitacoes.companyId, input.companyId), isNull(reembolsoSolicitacoes.deletedAt)))
                .for("update");
              if (!sol) throw new Error("não encontrada");
              if (!admin) {
                if (!empProprio || empProprio.id !== sol.employeeId) throw new Error("sem permissão");
                if (sol.status !== "pendente") throw new Error("já decidida — peça ao administrador");
              }
              const entries = await tx.select({ id: financialEntries.id, status: financialEntries.status }).from(financialEntries)
                .where(and(eq(financialEntries.origemModulo, "reembolso"), eq(financialEntries.origemId, sol.id), eq(financialEntries.companyId, sol.companyId), sql`${financialEntries.status} <> 'cancelado'`));
              for (const e of entries) {
                // Mesmo lock por título do Financeiro (feb:) — evita corrida com baixa simultânea
                await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`feb:${sol.companyId}:${e.id}`}))`);
                const [eNow] = await tx.select({ status: financialEntries.status }).from(financialEntries).where(eq(financialEntries.id, e.id));
                if (eNow?.status === "pago" || e.status === "pago") throw new Error("título já PAGO — estorne no Financeiro antes");
                const [bx] = await tx.select({ id: financialEntryBaixas.id }).from(financialEntryBaixas)
                  .where(and(eq(financialEntryBaixas.entryId, e.id), isNull(financialEntryBaixas.estornadaEm)));
                if (bx) throw new Error("título com pagamento registrado — estorne a baixa antes");
                await tx.update(financialEntries).set({ status: "cancelado", motivoCancelamento: "Solicitação de reembolso apagada" }).where(eq(financialEntries.id, e.id));
              }
              await tx.update(reembolsoDespesas).set({ deletedAt: new Date() })
                .where(and(eq(reembolsoDespesas.solicitacaoId, sol.id), isNull(reembolsoDespesas.deletedAt)));
              await tx.update(reembolsoSolicitacoes).set({ deletedAt: new Date() }).where(eq(reembolsoSolicitacoes.id, sol.id));
            });
            apagadas++;
          } catch (e: any) {
            bloqueadas.push(`#${id}: ${e?.message || "erro"}`);
          }
        }
        return { apagadas, bloqueadas };
      }),

    // Rev. 5086 — verificação antecipada de duplicidade (aviso suave antes de salvar)
    // Retorna matches por fingerprint exato (exato) ou por valor+data (provavel).
    // Não bloqueia — só avisa. O hard-block fica no assertSemDuplicidade ao salvar.
    verificarDuplicidade: protectedProcedure
      .input(z.object({
        companyId: z.number(),
        companyIds: z.array(z.number()).optional(),
        docChave: z.string().nullable().optional(),
        docNumero: z.string().nullable().optional(),
        estabelecimentoCnpj: z.string().nullable().optional(),
        estabelecimentoNome: z.string().nullable().optional(),
        dataDespesa: z.string().optional(),
        valor: z.number().optional(),
        excludeSolicitacaoId: z.number().nullable().optional(),
      }))
      .query(async ({ input, ctx }) => {
        const ids = await guardCompanyIds(ctx, input);
        const db = (await getDb())!;
        const fp = docFingerprintDe({
          docChave: input.docChave,
          docNumero: input.docNumero,
          estabelecimentoCnpj: input.estabelecimentoCnpj,
          dataDespesa: input.dataDespesa || "",
          valor: input.valor || 0,
        });
        const idsList = sql.join(ids.map((i: number) => sql`${i}`), sql`, `);
        const exclSol = input.excludeSolicitacaoId ? sql`AND d.solicitacao_id <> ${input.excludeSolicitacaoId}` : sql``;
        const resultados: any[] = [];

        // Nível 1: fingerprint exato (mesma nota fiscal — hard match)
        if (fp) {
          const rows = ((await db.execute(sql`
            SELECT d.solicitacao_id AS sid, d.estabelecimento_nome, d.data_despesa, d.valor::numeric AS valor,
                   s.status, e.nome_completo AS employee_nome
            FROM reembolso_despesas d
            JOIN reembolso_solicitacoes s ON s.id = d.solicitacao_id AND s.deleted_at IS NULL AND s.status NOT IN ('cancelada','reprovada')
            LEFT JOIN employees e ON e.id = s.employee_id
            WHERE d.company_id IN (${idsList}) AND d.deleted_at IS NULL AND d.status <> 'reprovada'
              AND d.doc_fingerprint = ${fp}
              ${exclSol}
            LIMIT 3
          `)) as any).rows || [];
          for (const r of rows) {
            resultados.push({ solicitacaoId: Number(r.sid), employeeNome: r.employee_nome || null,
              valor: Number(r.valor), dataDespesa: r.data_despesa, estabelecimentoNome: r.estabelecimento_nome || null, nivel: "exato" });
          }
        }

        // Nível 2: mesmo valor + mesma data (sem fingerprint) — provável duplicata
        if (resultados.length === 0 && input.valor && input.dataDespesa) {
          const valorCents = toCents(num(input.valor));
          const rows = ((await db.execute(sql`
            SELECT d.solicitacao_id AS sid, d.estabelecimento_nome, d.data_despesa, d.valor::numeric AS valor,
                   s.status, e.nome_completo AS employee_nome
            FROM reembolso_despesas d
            JOIN reembolso_solicitacoes s ON s.id = d.solicitacao_id AND s.deleted_at IS NULL AND s.status NOT IN ('cancelada','reprovada')
            LEFT JOIN employees e ON e.id = s.employee_id
            WHERE d.company_id IN (${idsList}) AND d.deleted_at IS NULL AND d.status <> 'reprovada'
              AND round(d.valor::numeric * 100) = ${valorCents}
              AND d.data_despesa = ${input.dataDespesa}
              ${exclSol}
            LIMIT 3
          `)) as any).rows || [];
          for (const r of rows) {
            resultados.push({ solicitacaoId: Number(r.sid), employeeNome: r.employee_nome || null,
              valor: Number(r.valor), dataDespesa: r.data_despesa, estabelecimentoNome: r.estabelecimento_nome || null, nivel: "provavel" });
          }
        }

        // Nível 3: mesmo CNPJ + mesma data + valor próximo (±10%) — parecido
        if (resultados.length === 0 && input.estabelecimentoCnpj && input.dataDespesa && input.valor) {
          const cnpj = String(input.estabelecimentoCnpj || "").replace(/[^\d]/g, "");
          if (cnpj.length === 14) {
            const v = num(input.valor);
            const lo = toCents(v * 0.9);
            const hi = toCents(v * 1.1);
            const rows = ((await db.execute(sql`
              SELECT d.solicitacao_id AS sid, d.estabelecimento_nome, d.data_despesa, d.valor::numeric AS valor,
                     s.status, e.nome_completo AS employee_nome
              FROM reembolso_despesas d
              JOIN reembolso_solicitacoes s ON s.id = d.solicitacao_id AND s.deleted_at IS NULL AND s.status NOT IN ('cancelada','reprovada')
              LEFT JOIN employees e ON e.id = s.employee_id
              WHERE d.company_id IN (${idsList}) AND d.deleted_at IS NULL AND d.status <> 'reprovada'
                AND regexp_replace(d.estabelecimento_cnpj,'[^0-9]','','g') = ${cnpj}
                AND d.data_despesa = ${input.dataDespesa}
                AND round(d.valor::numeric * 100) BETWEEN ${lo} AND ${hi}
                ${exclSol}
              LIMIT 3
            `)) as any).rows || [];
            for (const r of rows) {
              resultados.push({ solicitacaoId: Number(r.sid), employeeNome: r.employee_nome || null,
                valor: Number(r.valor), dataDespesa: r.data_despesa, estabelecimentoNome: r.estabelecimento_nome || null, nivel: "parecido" });
            }
          }
        }
        return resultados;
      }),

    // Rev. 5083 — status mês a mês para o seletor de período
    getMesesStatus: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), ano: z.number() }))
      .query(async ({ input, ctx }) => {
        const ids = await guardCompanyIds(ctx, input);
        const db = (await getDb())!;
        const admin = await userIsReembolsoAdmin(ctx.user.id, ctx.user.role);
        let empWhere = sql``;
        if (!admin) {
          const emp = await findEmployeeDoUsuario(db, ctx, ids);
          if (!emp) return Array.from({ length: 12 }, (_, i) => ({ mes: i + 1, status: "sem_dados" as const, aprovadoPorNome: null }));
          empWhere = sql` AND employee_id = ${emp.id}`;
        }
        const rows = ((await db.execute(sql`
          SELECT
            EXTRACT(MONTH FROM criado_em)::int AS mes,
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status = 'pendente')::int AS pendentes,
            MAX(aprovado_por_nome) FILTER (WHERE aprovado_por_nome IS NOT NULL AND aprovado_por_nome <> '') AS aprovado_por_nome
          FROM reembolso_solicitacoes
          WHERE company_id IN (${sql.join(ids.map((i: number) => sql`${i}`), sql`, `)})
            AND deleted_at IS NULL
            AND status <> 'cancelada'
            AND EXTRACT(YEAR FROM criado_em) = ${input.ano}
            ${empWhere}
          GROUP BY mes
          ORDER BY mes
        `)) as any).rows || [];
        const mesMap = new Map<number, any>(rows.map((r: any) => [Number(r.mes), r]));
        return Array.from({ length: 12 }, (_, i) => {
          const m = i + 1;
          const r = mesMap.get(m);
          if (!r || Number(r.total) === 0) return { mes: m, status: "sem_dados" as const, aprovadoPorNome: null };
          const consolidado = Number(r.pendentes) === 0;
          return {
            mes: m,
            status: consolidado ? ("consolidado" as const) : ("com_lancamento" as const),
            aprovadoPorNome: consolidado ? (r.aprovado_por_nome || null) : null,
          };
        });
      }),
  }),

  // Histórico por colaborador (Raio-X)
  listByEmployee: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), employeeId: z.number() }))
    .query(async ({ input, ctx }) => {
      const ids = await guardCompanyIds(ctx, input);
      // Rev. 5194 — central Raio-X guard replaces the old admin_master-only check.
      // Full access: admin_master OR rh-dp module admin; self: own employee only.
      // Company scope is derived server-side inside the guard.
      await assertRaioXAccess(ctx as any, input.employeeId);
      const db = (await getDb())!;
      return await db.select({
        id: reembolsoSolicitacoes.id, tipo: reembolsoSolicitacoes.tipo, status: reembolsoSolicitacoes.status,
        valorTotal: reembolsoSolicitacoes.valorTotal, valorAprovado: reembolsoSolicitacoes.valorAprovado,
        criadoEm: reembolsoSolicitacoes.criadoEm, aprovadoEm: reembolsoSolicitacoes.aprovadoEm,
        aprovadoPorNome: reembolsoSolicitacoes.aprovadoPorNome, motivo: reembolsoSolicitacoes.motivo,
      }).from(reembolsoSolicitacoes)
        .where(and(eq(reembolsoSolicitacoes.employeeId, input.employeeId), inArray(reembolsoSolicitacoes.companyId, ids), isNull(reembolsoSolicitacoes.deletedAt)))
        .orderBy(desc(reembolsoSolicitacoes.id));
    }),
});
